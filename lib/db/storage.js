// lib/db/storage.js
const { neon } = require('@neondatabase/serverless');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const BATCH_SIZE = 10000; // 10k records per batch
const MAX_COMPRESSED_SIZE_MB = 50; // Max 50MB per insert

/**
 * Store contacts data in Postgres (batched + compressed)
 * @param {Array} contacts - Array of enriched contact objects
 * @param {string} syncId - Sync identifier
 */
async function storeContactsData(contacts, syncId) {
  const startTime = Date.now();
  
  try {
    const sql = neon(process.env.DATABASE_URL);
    
    console.log(`[${syncId}] Storing ${contacts.length} contacts in compressed batches...`);
    
    // Delete old contact data first
    await sql`
      DELETE FROM ac_sync_data 
      WHERE data_type = 'contacts'
    `;
    
    // Split into batches
    const totalBatches = Math.ceil(contacts.length / BATCH_SIZE);
    
    for (let i = 0; i < totalBatches; i++) {
      const batchStart = i * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, contacts.length);
      const batch = contacts.slice(batchStart, batchEnd);
      
      // Compress this batch
      const jsonString = JSON.stringify(batch);
      const originalSize = Buffer.byteLength(jsonString, 'utf8');
      const compressed = await gzip(jsonString);
      const compressedSize = compressed.length;
      
      console.log(`[${syncId}] Batch ${i + 1}/${totalBatches}: ${batch.length} contacts, ${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressedSize / 1024 / 1024).toFixed(2)}MB`);
      
      // Insert batch
      await sql`
        INSERT INTO ac_sync_data (data_type, json_data_compressed, record_count, sync_duration_ms, sync_id)
        VALUES (
          'contacts',
          ${compressed},
          ${batch.length},
          ${Date.now() - startTime},
          ${syncId + '_batch_' + i}
        )
      `;
    }

    console.log(`[${syncId}] Stored ${contacts.length} contacts in ${totalBatches} compressed batches`);
    
  } catch (error) {
    console.error(`[${syncId}] Failed to store contacts:`, error);
    throw new Error(`Database storage failed: ${error.message}`);
  }
}

/**
 * Store deals data in Postgres (batched + compressed)
 * @param {Array} deals - Array of enriched deal objects
 * @param {string} syncId - Sync identifier
 */
async function storeDealsData(deals, syncId) {
  const startTime = Date.now();
  
  try {
    const sql = neon(process.env.DATABASE_URL);
    
    console.log(`[${syncId}] Storing ${deals.length} deals in compressed batches...`);
    
    // Delete old deals data first
    await sql`
      DELETE FROM ac_sync_data 
      WHERE data_type = 'deals'
    `;
    
    // Split into batches
    const totalBatches = Math.ceil(deals.length / BATCH_SIZE);
    
    for (let i = 0; i < totalBatches; i++) {
      const batchStart = i * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, deals.length);
      const batch = deals.slice(batchStart, batchEnd);
      
      // Compress this batch
      const jsonString = JSON.stringify(batch);
      const originalSize = Buffer.byteLength(jsonString, 'utf8');
      const compressed = await gzip(jsonString);
      const compressedSize = compressed.length;
      
      console.log(`[${syncId}] Batch ${i + 1}/${totalBatches}: ${batch.length} deals, ${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressedSize / 1024 / 1024).toFixed(2)}MB`);
      
      // Insert batch
      await sql`
        INSERT INTO ac_sync_data (data_type, json_data_compressed, record_count, sync_duration_ms, sync_id)
        VALUES (
          'deals',
          ${compressed},
          ${batch.length},
          ${Date.now() - startTime},
          ${syncId + '_batch_' + i}
        )
      `;
    }

    console.log(`[${syncId}] Stored ${deals.length} deals in ${totalBatches} compressed batches`);
    
  } catch (error) {
    console.error(`[${syncId}] Failed to store deals:`, error);
    throw new Error(`Database storage failed: ${error.message}`);
  }
}

/**
 * Retrieve the latest contacts data (from all batches, decompressed)
 * @returns {Promise<Array>} Array of contacts
 */
async function getLatestContacts() {
  try {
    const sql = neon(process.env.DATABASE_URL);
    
    const result = await sql`
      SELECT json_data_compressed
      FROM ac_sync_data
      WHERE data_type = 'contacts'
      ORDER BY synced_at DESC
    `;

    if (result.length === 0) {
      return [];
    }

    // Decompress and combine all batches
    const allContacts = [];
    for (const row of result) {
      const compressed = row.json_data_compressed;
      const decompressed = await gunzip(Buffer.from(compressed));
      const batch = JSON.parse(decompressed.toString('utf8'));
      allContacts.push(...batch);
    }
    
    return allContacts;
    
  } catch (error) {
    console.error('Failed to retrieve contacts:', error);
    throw error;
  }
}

/**
 * Retrieve the latest deals data (from all batches, decompressed)
 * @returns {Promise<Array>} Array of deals
 */
async function getLatestDeals() {
  try {
    const sql = neon(process.env.DATABASE_URL);
    
    const result = await sql`
      SELECT json_data_compressed
      FROM ac_sync_data
      WHERE data_type = 'deals'
      ORDER BY synced_at DESC
    `;

    if (result.length === 0) {
      return [];
    }

    // Decompress and combine all batches
    const allDeals = [];
    for (const row of result) {
      const compressed = row.json_data_compressed;
      const decompressed = await gunzip(Buffer.from(compressed));
      const batch = JSON.parse(decompressed.toString('utf8'));
      allDeals.push(...batch);
    }
    
    return allDeals;
    
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