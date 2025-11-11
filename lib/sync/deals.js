// lib/sync/deals.js
import { fetchFirstPage, fetchPage, fetchMetadata } from '../activecampaign/client';
import { fetchAllPages } from '../utils/rate-limiter';
import { storeDealsData } from '../db/storage';

const DEALS_ENDPOINT = '/deals';
const DEAL_GROUPS_ENDPOINT = '/dealGroups';
const DEAL_STAGES_ENDPOINT = '/dealStages';
const USERS_ENDPOINT = '/users';
const DEAL_CUSTOM_FIELD_META_ENDPOINT = '/dealCustomFieldMeta';
const LIMIT_PER_PAGE = 100;

/**
 * Sync all deals from ActiveCampaign
 * @param {string} syncId - Sync identifier for logging
 * @returns {Promise<{recordCount: number, durationMs: number}>}
 */
export async function syncDeals(syncId) {
  const startTime = Date.now();
  console.log(`[${syncId}] Starting deals sync`);

  try {
    // Step 1: Fetch all metadata in parallel (only once)
    console.log(`[${syncId}] Fetching metadata (pipelines, stages, users, custom fields)`);
    
    const [pipelines, stages, users, customFieldMeta] = await Promise.all([
      fetchMetadata(DEAL_GROUPS_ENDPOINT),
      fetchMetadata(DEAL_STAGES_ENDPOINT),
      fetchMetadata(USERS_ENDPOINT),
      fetchMetadata(DEAL_CUSTOM_FIELD_META_ENDPOINT)
    ]);

    console.log(`[${syncId}] Metadata retrieved:`);
    console.log(`  - Pipelines: ${pipelines.length}`);
    console.log(`  - Stages: ${stages.length}`);
    console.log(`  - Users: ${users.length}`);
    console.log(`  - Custom fields: ${customFieldMeta.length}`);

    // Create lookup maps for efficient enrichment
    const pipelineMap = new Map(pipelines.map(p => [p.id, p]));
    const stageMap = new Map(stages.map(s => [s.id, s]));
    const userMap = new Map(users.map(u => [u.id, u]));
    const customFieldMap = new Map(customFieldMeta.map(cf => [cf.id, cf]));

    // Step 2: Get first page to determine total count
    console.log(`[${syncId}] Fetching first page to determine total deals`);
    const firstPageResult = await fetchFirstPage(DEALS_ENDPOINT, {
      limit: LIMIT_PER_PAGE,
      additionalParams: {
        // Include custom field values if API supports it
        'include': 'dealCustomFieldData'
      }
    });

    const totalDeals = firstPageResult.total;
    const totalPages = Math.ceil(totalDeals / LIMIT_PER_PAGE);
    
    console.log(`[${syncId}] Total deals: ${totalDeals}, Pages: ${totalPages}`);

    // Step 3: Fetch all deals using rate-limited pagination
    let allDeals = [...firstPageResult.records];

    if (totalPages > 1) {
      const remainingDeals = await fetchAllPages(
        (pageNumber) => fetchPage(DEALS_ENDPOINT, pageNumber, {
          limit: LIMIT_PER_PAGE,
          additionalParams: {
            'include': 'dealCustomFieldData'
          }
        }),
        totalPages - 1,
        {
          syncId,
          operationType: `Fetching deals pages 2-${totalPages}`
        }
      );

      allDeals = [...allDeals, ...remainingDeals];
    }

    console.log(`[${syncId}] Retrieved ${allDeals.length} total deals`);

    // Step 4: Enrich deals with metadata
    console.log(`[${syncId}] Enriching deals with pipeline, stage, user, and custom field data`);
    const enrichedDeals = allDeals.map(deal => {
      const enriched = { ...deal };

      // Add pipeline information
      if (deal.group) {
        const pipeline = pipelineMap.get(deal.group);
        if (pipeline) {
          enriched.pipelineData = {
            id: pipeline.id,
            title: pipeline.title,
            currency: pipeline.currency
          };
        }
      }

      // Add stage information
      if (deal.stage) {
        const stage = stageMap.get(deal.stage);
        if (stage) {
          enriched.stageData = {
            id: stage.id,
            title: stage.title,
            order: stage.order,
            dealOrder: stage.dealOrder,
            group: stage.group
          };
        }
      }

      // Add owner/user information
      if (deal.owner) {
        const user = userMap.get(deal.owner);
        if (user) {
          enriched.ownerData = {
            id: user.id,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email
          };
        }
      }

      // Map custom field values
      if (deal.dealCustomFieldData && Array.isArray(deal.dealCustomFieldData)) {
        enriched.customFields = {};
        
        deal.dealCustomFieldData.forEach(fieldData => {
          const fieldMeta = customFieldMap.get(fieldData.customFieldId);
          if (fieldMeta) {
            const fieldKey = fieldMeta.fieldLabel || `field_${fieldData.customFieldId}`;
            enriched.customFields[fieldKey] = {
              value: fieldData.fieldValue,
              fieldId: fieldData.customFieldId,
              fieldLabel: fieldMeta.fieldLabel,
              fieldType: fieldMeta.fieldType
            };
          }
        });
      }

      return enriched;
    });

    // Step 5: Store in Postgres
    console.log(`[${syncId}] Storing deals in Postgres`);
    await storeDealsData(enrichedDeals, syncId);

    const durationMs = Date.now() - startTime;
    console.log(`[${syncId}] Deals sync completed: ${enrichedDeals.length} records in ${(durationMs / 1000).toFixed(2)}s`);

    return {
      recordCount: enrichedDeals.length,
      durationMs
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error(`[${syncId}] Deals sync failed after ${(durationMs / 1000).toFixed(2)}s:`, error);
    throw new Error(`Deals sync failed: ${error.message}`);
  }
}