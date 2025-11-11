// pages/api/query-data.js
const { neon } = require('@neondatabase/serverless');
const zlib = require('zlib');
const { promisify } = require('util');

const gunzipAsync = promisify(zlib.gunzip);

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
    
    // Get all batches from the latest sync
    const result = await sql`
      SELECT json_data_compressed, synced_at, record_count, id
      FROM ac_sync_data
      WHERE data_type = ${type}
      ORDER BY synced_at DESC, id ASC
    `;

    if (result.length === 0) {
      return res.status(404).json({ 
        error: `No ${type} data found`,
        message: 'No sync has been completed yet'
      });
    }

    // Get the latest sync timestamp
    const latestSyncTime = result[0].synced_at;
    
    // Filter to only get batches from the latest sync
    const latestBatches = result.filter(row => 
      row.synced_at.getTime() === latestSyncTime.getTime()
    );

    console.log(`Found ${latestBatches.length} batches for latest ${type} sync`);

    // Decompress all batches and combine
    let allData = [];
    for (const row of latestBatches) {
      try {
        // The data is stored as a Buffer in Postgres
        const buffer = Buffer.isBuffer(row.json_data_compressed) 
          ? row.json_data_compressed 
          : Buffer.from(row.json_data_compressed);
        
        const decompressed = await gunzipAsync(buffer);
        const batch = JSON.parse(decompressed.toString('utf8'));
        allData = allData.concat(batch);
      } catch (err) {
        console.error(`Error decompressing batch:`, err);
        // Continue with other batches
      }
    }

    console.log(`Total records decompressed: ${allData.length}`);

    // Apply pagination
    const paginatedData = allData.slice(
      parseInt(offset), 
      parseInt(offset) + parseInt(limit)
    );

    return res.status(200).json({
      type,
      syncedAt: latestSyncTime,
      totalRecords: allData.length,
      returnedRecords: paginatedData.length,
      offset: parseInt(offset),
      limit: parseInt(limit),
      batches: latestBatches.length,
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