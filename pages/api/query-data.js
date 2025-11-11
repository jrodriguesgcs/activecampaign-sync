// pages/api/query-data.js
const { neon } = require('@neondatabase/serverless');
const zlib = require('zlib');
const { promisify } = require('util');

const gunzipAsync = promisify(zlib.gunzip);

/**
 * Query synced ActiveCampaign data
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
      SELECT 
        id,
        json_data_compressed, 
        synced_at, 
        record_count,
        sync_id
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
    const latestBatches = result.filter(row => {
      const rowTime = new Date(row.synced_at).getTime();
      const latestTime = new Date(latestSyncTime).getTime();
      return rowTime === latestTime;
    });

    console.log(`Found ${latestBatches.length} batches for latest ${type} sync`);

    // Decompress all batches and combine
    let allData = [];
    let successfulBatches = 0;

    for (const row of latestBatches) {
      try {
        if (!row.json_data_compressed) {
          console.warn(`Batch ${row.id} has no data`);
          continue;
        }

        // Convert to Buffer
        const buffer = Buffer.isBuffer(row.json_data_compressed) 
          ? row.json_data_compressed 
          : Buffer.from(row.json_data_compressed);

        // Check if it's gzip compressed (magic bytes: 1f 8b)
        const isGzipped = buffer[0] === 0x1f && buffer[1] === 0x8b;

        let batch;
        if (isGzipped) {
          // Decompress gzipped data
          const decompressed = await gunzipAsync(buffer);
          batch = JSON.parse(decompressed.toString('utf8'));
        } else {
          // Handle uncompressed JSON (legacy data)
          console.warn(`Batch ${row.id} is not gzipped, parsing as plain JSON`);
          batch = JSON.parse(buffer.toString('utf8'));
        }
        
        if (!Array.isArray(batch)) {
          console.error(`Batch ${row.id} is not an array`);
          continue;
        }

        allData = allData.concat(batch);
        successfulBatches++;
        
      } catch (err) {
        console.error(`Error processing batch ${row.id}:`, err.message);
      }
    }

    console.log(`Successfully processed ${successfulBatches}/${latestBatches.length} batches. Total records: ${allData.length}`);

    if (allData.length === 0) {
      return res.status(500).json({
        error: 'No data could be retrieved',
        message: `Failed to process all ${latestBatches.length} batches.`
      });
    }

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