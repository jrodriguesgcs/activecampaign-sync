// pages/api/query-data.js
const { neon } = require('@neondatabase/serverless');

/**
 * Query synced ActiveCampaign data
 * GET /api/query-data?type=contacts&filter=...
 * GET /api/query-data?type=deals&filter=...
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
    
    // Get the latest data
    const result = await sql`
      SELECT json_data, synced_at, record_count
      FROM ac_sync_data
      WHERE data_type = ${type}
      ORDER BY synced_at DESC
      LIMIT 1
    `;

    if (result.length === 0) {
      return res.status(404).json({ 
        error: `No ${type} data found`,
        message: 'No sync has been completed yet'
      });
    }

    let data = result[0].json_data;
    const syncedAt = result[0].synced_at;
    const totalRecords = result[0].record_count;

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      data = data.filter(item => {
        const itemStr = JSON.stringify(item).toLowerCase();
        return itemStr.includes(searchLower);
      });
    }

    // Apply pagination
    const paginatedData = data.slice(
      parseInt(offset), 
      parseInt(offset) + parseInt(limit)
    );

    return res.status(200).json({
      type,
      syncedAt,
      totalRecords,
      filteredRecords: data.length,
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