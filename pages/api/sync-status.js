// pages/api/sync-status.js
const { getSyncHistory, getSyncStats } = require('../../lib/db/sync-metadata');
const { neon } = require('@neondatabase/serverless');

/**
 * API endpoint to check sync status and history
 * GET /api/sync-status
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get latest sync info and statistics
    const [history, stats, latestData] = await Promise.all([
      getSyncHistory(10),
      getSyncStats(),
      getLatestDataInfo()
    ]);

    return res.status(200).json({
      currentStatus: history[0] || null,
      recentHistory: history,
      statistics: {
        totalSyncs: parseInt(stats.total_syncs) || 0,
        successfulSyncs: parseInt(stats.successful_syncs) || 0,
        successRate: stats.total_syncs > 0 
          ? ((stats.successful_syncs / stats.total_syncs) * 100).toFixed(2) + '%'
          : 'N/A',
        avgDurationSeconds: stats.avg_duration_ms 
          ? (stats.avg_duration_ms / 1000).toFixed(2)
          : 'N/A',
        lastSyncTime: stats.last_sync_time,
        avgContactsCount: Math.round(stats.avg_contacts_count) || 0,
        avgDealsCount: Math.round(stats.avg_deals_count) || 0
      },
      latestData: {
        contacts: latestData.contacts,
        deals: latestData.deals
      }
    });

  } catch (error) {
    console.error('Failed to get sync status:', error);
    return res.status(500).json({ 
      error: 'Failed to retrieve sync status',
      message: error.message 
    });
  }
}

async function getLatestDataInfo() {
  try {
    const sql = neon(process.env.DATABASE_URL);
    const result = await sql`
      SELECT 
        data_type,
        synced_at,
        record_count,
        sync_duration_ms
      FROM ac_sync_data
      WHERE data_type IN ('contacts', 'deals')
      AND synced_at = (
        SELECT MAX(synced_at) 
        FROM ac_sync_data as s2 
        WHERE s2.data_type = ac_sync_data.data_type
      )
      ORDER BY data_type
    `;

    const info = {
      contacts: null,
      deals: null
    };

    result.forEach(row => {
      info[row.data_type] = {
        lastSynced: row.synced_at,
        recordCount: row.record_count,
        syncDurationMs: row.sync_duration_ms
      };
    });

    return info;
  } catch (error) {
    console.error('Failed to get latest data info:', error);
    return { contacts: null, deals: null };
  }
}