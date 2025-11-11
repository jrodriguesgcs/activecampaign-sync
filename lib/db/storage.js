// lib/db/storage.js
const { neon } = require('@neondatabase/serverless');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Store contacts data in Postgres (compressed)
 * @param {Array} contacts - Array of enriched contact objects
 * @param {string} syncId - Sync identifier
 */
async function storeContactsData(contacts, syncId) {
  const startTime = Date.now();
  
  try {
    const sql = neon(process.env.DATABASE_URL);
    
    console.log(`[${syncId}] Compressing ${contacts.length} contacts...`);
    const jsonString = JSON.stringify(contacts);
    const originalSize = Buffer.byteLength(jsonString, 'utf8');
    
    // Compress the data
    const compressed = await gzip(jsonString);
    const compressedSize = compressed.length;
    const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
    
    console.log(`[${syncId}] Compressed from ${(originalSize / 1024 / 1024).toFixed(2)}MB to ${(compressedSize / 1024 / 1024).toFixed(2)}MB (${compressionRatio}% reduction)`);
    
    // Store compressed data as bytea
    await sql`
      INSERT INTO ac_sync_data (data_type, json_data_compressed, record_count, sync_duration_ms, sync_id)
      VALUES (
        'contacts',
        ${compressed},
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

    console.log(`[${syncId}] Stored ${contacts.length} contacts in Postgres (compressed)`);
    
  } catch (error) {
    console.error(`[${syncId}] Failed to store contacts:`, error);
    throw new Error(`Database storage failed: ${error.message}`);
  }
}

/**
 * Store deals data in Postgres (compressed)
 * @param {Array} deals - Array of enriched deal objects
 * @param {string} syncId - Sync identifier
 */
async function storeDealsData(deals, syncId) {
  const startTime = Date.now();
  
  try {
    const sql = neon(process.env.DATABASE_URL);
    
    console.log(`[${syncId}] Compressing ${deals.length} deals...`);
    const jsonString = JSON.stringify(deals);
    const originalSize = Buffer.byteLength(jsonString, 'utf8');
    
    // Compress the data
    const compressed = await gzip(jsonString);
    const compressedSize = compressed.length;
    const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
    
    console.log(`[${syncId}] Compressed from ${(originalSize / 1024 / 1024).toFixed(2)}MB to ${(compressedSize / 1024 / 1024).toFixed(2)}MB (${compressionRatio}% reduction)`);
    
    // Store compressed data as bytea
    await sql`
      INSERT INTO ac_sync_data (data_type, json_data_compressed, record_count, sync_duration_ms, sync_id)
      VALUES (
        'deals',
        ${compressed},
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

    console.log(`[${syncId}] Stored ${deals.length} deals in Postgres (compressed)`);
    
  } catch (error) {
    console.error(`[${syncId}] Failed to store deals:`, error);
    throw new Error(`Database storage failed: ${error.message}`);
  }
}

/**
 * Retrieve the latest contacts data (decompressed)
 * @returns {Promise<Array>} Array of contacts
 */
async function getLatestContacts() {
  try {
    const sql = neon(process.env.DATABASE_URL);
    
    const result = await sql`
      SELECT json_data_compressed, synced_at, record_count
      FROM ac_sync_data
      WHERE data_type = 'contacts'
      ORDER BY synced_at DESC
      LIMIT 1
    `;

    if (result.length === 0) {
      return [];
    }

    // Decompress the data
    const compressed = result[0].json_data_compressed;
    const decompressed = await gunzip(Buffer.from(compressed));
    return JSON.parse(decompressed.toString('utf8'));
    
  } catch (error) {
    console.error('Failed to retrieve contacts:', error);
    throw error;
  }
}

/**
 * Retrieve the latest deals data (decompressed)
 * @returns {Promise<Array>} Array of deals
 */
async function getLatestDeals() {
  try {
    const sql = neon(process.env.DATABASE_URL);
    
    const result = await sql`
      SELECT json_data_compressed, synced_at, record_count
      FROM ac_sync_data
      WHERE data_type = 'deals'
      ORDER BY synced_at DESC
      LIMIT 1
    `;

    if (result.length === 0) {
      return [];
    }

    // Decompress the data
    const compressed = result[0].json_data_compressed;
    const decompressed = await gunzip(Buffer.from(compressed));
    return JSON.parse(decompressed.toString('utf8'));
    
  } catch (error) {
    console.error('Failed to retrieve deals:', error);
    throw error;
  }
}

module.exports = {
  storeContactsData,
  storeDealsData,
  getLatestContacts,
  getLatestDeals
};