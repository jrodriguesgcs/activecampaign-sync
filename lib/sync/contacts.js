// lib/sync/contacts.js
import { fetchFirstPage, fetchPage, fetchMetadata } from '../activecampaign/client';
import { fetchAllPages } from '../utils/rate-limiter';
import { storeContactsData } from '../db/storage';

const CONTACTS_ENDPOINT = '/contacts';
const FIELDS_ENDPOINT = '/fields';
const LIMIT_PER_PAGE = 100; // ActiveCampaign typically supports 100

/**
 * Sync all contacts from ActiveCampaign
 * @param {string} syncId - Sync identifier for logging
 * @returns {Promise<{recordCount: number, durationMs: number}>}
 */
export async function syncContacts(syncId) {
  const startTime = Date.now();
  console.log(`[${syncId}] Starting contacts sync`);

  try {
    // Step 1: Fetch custom field definitions (only once)
    console.log(`[${syncId}] Fetching custom field definitions`);
    const customFields = await fetchMetadata(FIELDS_ENDPOINT);
    console.log(`[${syncId}] Retrieved ${customFields.length} custom field definitions`);

    // Create field lookup map for efficient mapping
    const fieldMap = new Map();
    customFields.forEach(field => {
      fieldMap.set(field.id, {
        title: field.title,
        type: field.type,
        perstag: field.perstag
      });
    });

    // Step 2: Get first page to determine total count
    console.log(`[${syncId}] Fetching first page to determine total contacts`);
    const firstPageResult = await fetchFirstPage(CONTACTS_ENDPOINT, {
      limit: LIMIT_PER_PAGE,
      additionalParams: {
        // Include field values in response if API supports it
        'include': 'fieldValues'
      }
    });

    const totalContacts = firstPageResult.total;
    const totalPages = Math.ceil(totalContacts / LIMIT_PER_PAGE);
    
    console.log(`[${syncId}] Total contacts: ${totalContacts}, Pages: ${totalPages}`);

    // Step 3: Fetch all contacts using rate-limited pagination
    let allContacts = [...firstPageResult.records];

    if (totalPages > 1) {
      // Fetch remaining pages (pages 2 through totalPages)
      const remainingContacts = await fetchAllPages(
        (pageNumber) => fetchPage(CONTACTS_ENDPOINT, pageNumber, {
          limit: LIMIT_PER_PAGE,
          additionalParams: {
            'include': 'fieldValues'
          }
        }),
        totalPages - 1, // We already have page 1
        {
          syncId,
          operationType: `Fetching contacts pages 2-${totalPages}`
        }
      );

      allContacts = [...allContacts, ...remainingContacts];
    }

    console.log(`[${syncId}] Retrieved ${allContacts.length} total contacts`);

    // Step 4: Enrich contacts with custom field data
    console.log(`[${syncId}] Enriching contacts with custom field mappings`);
    const enrichedContacts = allContacts.map(contact => {
      const enriched = { ...contact };

      // Map fieldValues if present
      if (contact.fieldValues && Array.isArray(contact.fieldValues)) {
        enriched.customFields = {};
        
        contact.fieldValues.forEach(fv => {
          const fieldDef = fieldMap.get(fv.field);
          if (fieldDef) {
            const fieldKey = fieldDef.perstag || `field_${fv.field}`;
            enriched.customFields[fieldKey] = {
              value: fv.value,
              fieldId: fv.field,
              fieldTitle: fieldDef.title,
              fieldType: fieldDef.type
            };
          }
        });
      }

      return enriched;
    });

    // Step 5: Store in Postgres
    console.log(`[${syncId}] Storing contacts in Postgres`);
    await storeContactsData(enrichedContacts, syncId);

    const durationMs = Date.now() - startTime;
    console.log(`[${syncId}] Contacts sync completed: ${enrichedContacts.length} records in ${(durationMs / 1000).toFixed(2)}s`);

    return {
      recordCount: enrichedContacts.length,
      durationMs
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error(`[${syncId}] Contacts sync failed after ${(durationMs / 1000).toFixed(2)}s:`, error);
    throw new Error(`Contacts sync failed: ${error.message}`);
  }
}