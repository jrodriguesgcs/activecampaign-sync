// pages/api/query-data.js
const { neon } = require('@neondatabase/serverless');
const { promisify } = require('util');
const { gunzip } = require('zlib');
const gunzipAsync = promisify(gunzip);

/**
 * Query synced ActiveCampaign data
 * GET /api/query-data?type=contacts&limit=100&offset=0&search=...
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, limit = 100, offset = 0, search } = req.query;

  // Validate type
  if (!type || !['contacts', 'deals'].includes(type)) {
    return res.status(400).json({ 
      error: 'Invalid type parameter. Must be "contacts" or "deals"' 
    });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    
    // Get all batches for this data type
    const result = await sql`
      SELECT json_data_compressed, synced_at, record_count
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

    // Decompress and combine all batches
    let allData = [];
    const syncedAt = result[0].synced_at;
    let totalRecords = 0;

    for (const row of result) {
      if (row.json_data_compressed) {
        const decompressed = await gunzipAsync(Buffer.from(row.json_data_compressed));
        const batch = JSON.parse(decompressed.toString('utf8'));
        allData.push(...batch);
        totalRecords += row.record_count;
      }
    }

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      allData = allData.filter(item => {
        const itemStr = JSON.stringify(item).toLowerCase();
        return itemStr.includes(searchLower);
      });
    }

    // Apply pagination
    const paginatedData = allData.slice(
      parseInt(offset), 
      parseInt(offset) + parseInt(limit)
    );

    return res.status(200).json({
      type,
      syncedAt,
      totalRecords,
      filteredRecords: allData.length,
      returnedRecords: paginatedData.length,
      offset: parseInt(offset),
      limit: parseInt(limit),
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