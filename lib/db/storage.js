// lib/db/storage.js
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

/**
 * Store contacts data in Postgres
 * @param {Array} contacts - Array of enriched contact objects
 * @param {string} syncId - Sync identifier
 */
export async function storeContactsData(contacts, syncId) {
  const startTime = Date.now();
  
  try {
    // Store as JSONB in a single row (complete replacement strategy)
    await sql`
      INSERT INTO ac_sync_data (data_type, json_data, record_count, sync_duration_ms, sync_id)
      VALUES (
        'contacts',
        ${JSON.stringify(contacts)}::jsonb,
        ${contacts.length},
        ${Date.now() - startTime},
        ${syncId}
      )
    `;

    // Delete old contact data (keep only the most recent sync)
    await sql`
      DELETE FROM ac_sync_data 
      WHERE data_type = 'contacts' 
      AND sync_id != ${syncId}
    `;

    console.log(`[${syncId}] Stored ${contacts.length} contacts in Postgres`);
    
  } catch (error) {
    console.error(`[${syncId}] Failed to store contacts:`, error);
    throw new Error(`Database storage failed: ${error.message}`);
  }
}

/**
 * Store deals data in Postgres
 * @param {Array} deals - Array of enriched deal objects
 * @param {string} syncId - Sync identifier
 */
export async function storeDealsData(deals, syncId) {
  const startTime = Date.now();
  
  try {
    // Store as JSONB in a single row (complete replacement strategy)
    await sql`
      INSERT INTO ac_sync_data (data_type, json_data, record_count, sync_duration_ms, sync_id)
      VALUES (
        'deals',
        ${JSON.stringify(deals)}::jsonb,
        ${deals.length},
        ${Date.now() - startTime},
        ${syncId}
      )
    `;

    // Delete old deals data (keep only the most recent sync)
    await sql`
      DELETE FROM ac_sync_data 
      WHERE data_type = 'deals' 
      AND sync_id != ${syncId}
    `;

    console.log(`[${syncId}] Stored ${deals.length} deals in Postgres`);
    
  } catch (error) {
    console.error(`[${syncId}] Failed to store deals:`, error);
    throw new Error(`Database storage failed: ${error.message}`);
  }
}

/**
 * Retrieve the latest contacts data
 * @returns {Promise<Array>} Array of contacts
 */
export async function getLatestContacts() {
  try {
    const result = await sql`
      SELECT json_data, synced_at, record_count
      FROM ac_sync_data
      WHERE data_type = 'contacts'
      ORDER BY synced_at DESC
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      return [];
    }

    return result.rows[0].json_data;
  } catch (error) {
    console.error('Failed to retrieve contacts:', error);
    throw error;
  }
}

/**
 * Retrieve the latest deals data
 * @returns {Promise<Array>} Array of deals
 */
export async function getLatestDeals() {
  try {
    const result = await sql`
      SELECT json_data, synced_at, record_count
      FROM ac_sync_data
      WHERE data_type = 'deals'
      ORDER BY synced_at DESC
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      return [];
    }

    return result.rows[0].json_data;
  } catch (error) {
    console.error('Failed to retrieve deals:', error);
    throw error;
  }
}