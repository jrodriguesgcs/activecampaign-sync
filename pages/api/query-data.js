// pages/api/query-data.js
const { neon } = require('@neondatabase/serverless');
const { promisify } = require('util');
const { gunzip } = require('zlib');
const gunzipAsync = promisify(gunzip);

/**
 * Query synced ActiveCampaign data (limited batches)
 * GET /api/query-data?type=contacts&limit=100&offset=0
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, limit = 100, offset = 0 } = req.query;

  if (!type || !['contacts', 'deals'].includes(type)) {
    return res.status(400).json({ 
      error: 'Invalid type parameter. Must be "contacts" or "deals"' 
    });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    
    // Get just the first batch from the latest sync (enough for preview)
    const result = await sql`
      SELECT json_data_compressed, synced_at, record_count
      FROM ac_sync_data
      WHERE data_type = ${type}
      ORDER BY synced_at DESC, id ASC
      LIMIT 1
    `;

    if (result.length === 0) {
      return res.status(404).json({ 
        error: `No ${type} data found`,
        message: 'No sync has been completed yet'
      });
    }

    // Get total count from all recent batches
    const countResult = await sql`
      SELECT SUM(record_count) as total
      FROM ac_sync_data
      WHERE data_type = ${type}
      AND synced_at = ${result[0].synced_at}
    `;

    const totalRecords = parseInt(countResult[0]?.total || 0);

    // Decompress first batch
    const decompressed = await gunzipAsync(Buffer.from(result[0].json_data_compressed));
    const data = JSON.parse(decompressed.toString('utf8'));

    // Apply pagination
    const paginatedData = data.slice(
      parseInt(offset), 
      Math.min(parseInt(offset) + parseInt(limit), data.length)
    );

    return res.status(200).json({
      type,
      syncedAt: result[0].synced_at,
      totalRecords,
      returnedRecords: paginatedData.length,
      offset: parseInt(offset),
      limit: parseInt(limit),
      note: "Showing data from first batch only (up to 10,000 records). Use SQL queries for full dataset.",
      data: paginatedData
    });

  } catch (error) {
    console.error('Failed to query data:', error);
    return res.status(500).json({ 
      error: 'Failed to retrieve data',
      message: error.message 
    });
  }
}