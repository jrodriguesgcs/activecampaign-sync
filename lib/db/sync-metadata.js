// lib/db/sync-metadata.js
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

/**
 * Store sync metadata for monitoring
 * @param {Object} metadata - Sync metadata
 */
export async function storeSyncMetadata(metadata) {
  const {
    syncId,
    timestamp,
    totalDuration,
    contactsSuccess,
    contactsCount,
    contactsError,
    dealsSuccess,
    dealsCount,
    dealsError
  } = metadata;

  try {
    await sql`
      INSERT INTO ac_sync_logs (
        sync_id,
        timestamp,
        total_duration_ms,
        contacts_success,
        contacts_count,
        contacts_error,
        deals_success,
        deals_count,
        deals_error,
        overall_success
      ) VALUES (
        ${syncId},
        ${timestamp},
        ${totalDuration},
        ${contactsSuccess},
        ${contactsCount},
        ${contactsError},
        ${dealsSuccess},
        ${dealsCount},
        ${dealsError},
        ${contactsSuccess && dealsSuccess}
      )
    `;
  } catch (error) {
    console.error('Failed to store sync metadata:', error);
    // Don't throw - metadata storage failure shouldn't break the sync
  }
}

/**
 * Get recent sync history
 * @param {number} limit - Number of records to retrieve
 * @returns {Promise<Array>} Sync history
 */
export async function getSyncHistory(limit = 10) {
  try {
    const result = await sql`
      SELECT 
        sync_id,
        timestamp,
        total_duration_ms,
        contacts_success,
        contacts_count,
        contacts_error,
        deals_success,
        deals_count,
        deals_error,
        overall_success
      FROM ac_sync_logs
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    return result.rows;
  } catch (error) {
    console.error('Failed to retrieve sync history:', error);
    throw error;
  }
}

/**
 * Get sync statistics
 * @returns {Promise<Object>} Sync statistics
 */
export async function getSyncStats() {
  try {
    const result = await sql`
      SELECT 
        COUNT(*) as total_syncs,
        SUM(CASE WHEN overall_success THEN 1 ELSE 0 END) as successful_syncs,
        AVG(total_duration_ms) as avg_duration_ms,
        MAX(timestamp) as last_sync_time,
        AVG(contacts_count) as avg_contacts_count,
        AVG(deals_count) as avg_deals_count
      FROM ac_sync_logs
      WHERE timestamp > NOW() - INTERVAL '7 days'
    `;

    return result.rows[0];
  } catch (error) {
    console.error('Failed to retrieve sync stats:', error);
    throw error;
  }
}