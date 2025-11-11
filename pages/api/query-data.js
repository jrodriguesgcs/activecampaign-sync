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
    
    // First, get batch IDs only (not the actual data) to avoid memory issues
    const batchInfo = await sql`
      SELECT 
        id,
        synced_at, 
        record_count,
        sync_id
      FROM ac_sync_data
      WHERE data_type = ${type}
      ORDER BY synced_at DESC, id ASC
    `;

    if (batchInfo.length === 0) {
      return res.status(404).json({ 
        error: `No ${type} data found`,
        message: 'No sync has been completed yet'
      });
    }

    // Get the latest sync timestamp
    const latestSyncTime = batchInfo[0].synced_at;
    
    // Filter to only get batch IDs from the latest sync
    const latestBatchIds = batchInfo
      .filter(row => {
        const rowTime = new Date(row.synced_at).getTime();
        const latestTime = new Date(latestSyncTime).getTime();
        return rowTime === latestTime;
      })
      .map(row => row.id);

    console.log(`Found ${latestBatchIds.length} batches for latest ${type} sync`);

    // Now fetch and process batches ONE AT A TIME
    let allData = [];
    let successfulBatches = 0;

    for (const batchId of latestBatchIds) {
      try {
        // Fetch ONE batch at a time
        const batchRows = await sql`
          SELECT json_data_compressed
          FROM ac_sync_data
          WHERE id = ${batchId}
        `;

        if (batchRows.length === 0 || !batchRows[0].json_data_compressed) {
          console.warn(`Batch ${batchId} has no data`);
          continue;
        }

        const row = batchRows[0];

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
          batch = JSON.parse(buffer.toString('utf8'));
        }
        
        if (!Array.isArray(batch)) {
          console.error(`Batch ${batchId} is not an array`);
          continue;
        }

        allData = allData.concat(batch);
        successfulBatches++;

        // Log progress every 10 batches
        if (successfulBatches % 10 === 0) {
          console.log(`Processed ${successfulBatches}/${latestBatchIds.length} batches...`);
        }
        
      } catch (err) {
        console.error(`Error processing batch ${batchId}:`, err.message);
      }
    }

    console.log(`Successfully processed ${successfulBatches}/${latestBatchIds.length} batches. Total records: ${allData.length}`);

    if (allData.length === 0) {
      return res.status(500).json({
        error: 'No data could be retrieved',
        message: `Failed to process all ${latestBatchIds.length} batches.`
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
      batches: latestBatchIds.length,
      successfulBatches,
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

// Increase timeout for this API route since we're processing many batches
export const config = {
  maxDuration: 60, // 60 seconds max
};