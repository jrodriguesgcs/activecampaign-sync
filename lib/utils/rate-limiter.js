// lib/utils/rate-limiter.js

/**
 * Rate Limiter for ActiveCampaign API
 * Enforces 10 requests per second maximum
 * Implements retry logic with exponential backoff
 */

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000; // Wait 1 second between batches
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

/**
 * Execute API calls in rate-limited batches
 * @param {Function[]} apiCallFactories - Array of functions that return promises
 * @param {Object} options - Configuration options
 * @param {string} options.syncId - Sync identifier for logging
 * @param {string} options.operationType - Description of operation (e.g., "Fetching contacts")
 * @returns {Promise<Array>} Array of results
 */
export async function executeWithRateLimit(apiCallFactories, options = {}) {
  const { syncId = 'unknown', operationType = 'API calls' } = options;
  
  const results = [];
  const totalCalls = apiCallFactories.length;
  const totalBatches = Math.ceil(totalCalls / BATCH_SIZE);

  console.log(`[${syncId}] ${operationType}: ${totalCalls} calls across ${totalBatches} batches`);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, totalCalls);
    const batch = apiCallFactories.slice(batchStart, batchEnd);

    const batchStartTime = Date.now();
    console.log(`[${syncId}] Batch ${batchIndex + 1}/${totalBatches}: Executing ${batch.length} calls`);

    // Execute batch with retries
    const batchResults = await Promise.all(
      batch.map((callFactory, index) => 
        executeWithRetry(callFactory, {
          syncId,
          callIndex: batchStart + index,
          totalCalls
        })
      )
    );

    results.push(...batchResults);

    const batchDuration = Date.now() - batchStartTime;
    console.log(`[${syncId}] Batch ${batchIndex + 1}/${totalBatches}: Completed in ${batchDuration}ms`);

    // Wait between batches (except after the last batch)
    if (batchIndex < totalBatches - 1) {
      const waitTime = Math.max(0, BATCH_DELAY_MS - batchDuration);
      if (waitTime > 0) {
        await sleep(waitTime);
      }
    }
  }

  // Check for failures
  const failures = results.filter(r => r.error);
  if (failures.length > 0) {
    console.warn(`[${syncId}] ${failures.length}/${totalCalls} calls failed after retries`);
  }

  return results;
}

/**
 * Execute a single API call with retry logic
 * @param {Function} callFactory - Function that returns a promise
 * @param {Object} context - Context for logging
 * @returns {Promise<Object>} Result or error object
 */
async function executeWithRetry(callFactory, context) {
  const { syncId, callIndex, totalCalls } = context;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callFactory();
      
      if (attempt > 0) {
        console.log(`[${syncId}] Call ${callIndex + 1}/${totalCalls}: Succeeded on retry ${attempt}`);
      }
      
      return { success: true, data: result };
      
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      
      if (isLastAttempt) {
        console.error(`[${syncId}] Call ${callIndex + 1}/${totalCalls}: Failed after ${MAX_RETRIES} retries - ${error.message}`);
        return { 
          success: false, 
          error: error.message,
          callIndex 
        };
      }
      
      // Calculate exponential backoff delay
      const retryDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
      console.warn(`[${syncId}] Call ${callIndex + 1}/${totalCalls}: Attempt ${attempt + 1} failed, retrying in ${retryDelay}ms - ${error.message}`);
      
      await sleep(retryDelay);
    }
  }
}

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create batched pagination fetcher
 * @param {Function} fetchPage - Function that fetches a single page (pageNumber) => Promise<{data, meta}>
 * @param {number} totalPages - Total number of pages to fetch
 * @param {Object} options - Rate limit options
 * @returns {Promise<Array>} All fetched records
 */
export async function fetchAllPages(fetchPage, totalPages, options = {}) {
  const { syncId = 'unknown', operationType = 'Fetching pages' } = options;
  
  console.log(`[${syncId}] ${operationType}: ${totalPages} pages to fetch`);
  
  // Create array of page fetchers
  const pageFactories = Array.from({ length: totalPages }, (_, i) => {
    const pageNumber = i + 1;
    return () => fetchPage(pageNumber);
  });
  
  // Execute with rate limiting
  const results = await executeWithRateLimit(pageFactories, {
    syncId,
    operationType
  });
  
  // Combine all successful results
  const successfulResults = results.filter(r => r.success);
  const allRecords = successfulResults.flatMap(r => r.data);
  
  const failedCount = results.length - successfulResults.length;
  if (failedCount > 0) {
    console.warn(`[${syncId}] ${operationType}: ${failedCount} pages failed to fetch`);
  }
  
  console.log(`[${syncId}] ${operationType}: Retrieved ${allRecords.length} total records`);
  
  return allRecords;
}