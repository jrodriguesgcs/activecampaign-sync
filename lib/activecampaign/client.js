// lib/activecampaign/client.js

const AC_API_URL = process.env.AC_API_URL;
const AC_API_KEY = process.env.AC_API_KEY;

if (!AC_API_URL || !AC_API_KEY) {
  throw new Error('Missing ActiveCampaign credentials: AC_API_URL and AC_API_KEY must be set');
}

/**
 * Make a request to ActiveCampaign API
 * @param {string} endpoint - API endpoint (e.g., '/contacts')
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} API response
 */
async function acRequest(endpoint, params = {}) {
  // Ensure AC_API_URL doesn't end with /api/3 and endpoint starts with /
  const baseUrl = AC_API_URL.replace(/\/api\/3\/?$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const fullUrl = `${baseUrl}/api/3${cleanEndpoint}`;
  
  const url = new URL(fullUrl);
  
  // Add query parameters
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });

  console.log(`[DEBUG] Requesting: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    headers: {
      'Api-Token': AC_API_KEY,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ActiveCampaign API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Fetch all records using pagination
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Options
 * @param {number} options.limit - Records per page (default 100)
 * @param {Object} options.additionalParams - Additional query parameters
 * @returns {Promise<{records: Array, totalRecords: number}>}
 */
async function fetchFirstPage(endpoint, options = {}) {
  const { limit = 100, additionalParams = {} } = options;
  
  const response = await acRequest(endpoint, {
    limit,
    offset: 0,
    ...additionalParams
  });

  // Extract records - ActiveCampaign uses different keys for different endpoints
  const records = extractRecords(response, endpoint);
  const total = response.meta?.total || records.length;

  return {
    records,
    total,
    meta: response.meta
  };
}

/**
 * Fetch a specific page of records
 * @param {string} endpoint - API endpoint
 * @param {number} page - Page number (1-indexed)
 * @param {Object} options - Options
 * @returns {Promise<Array>} Records for this page
 */
async function fetchPage(endpoint, page, options = {}) {
  const { limit = 100, additionalParams = {} } = options;
  
  const offset = (page - 1) * limit;
  
  const response = await acRequest(endpoint, {
    limit,
    offset,
    ...additionalParams
  });

  return extractRecords(response, endpoint);
}

/**
 * Extract records from API response
 * Different endpoints use different keys
 */
function extractRecords(response, endpoint) {
  // Map endpoints to their response keys
  if (endpoint.includes('/contacts')) {
    return response.contacts || [];
  } else if (endpoint.includes('/deals')) {
    return response.deals || [];
  } else if (endpoint.includes('/dealGroups')) {
    return response.dealGroups || [];
  } else if (endpoint.includes('/dealStages')) {
    return response.dealStages || [];
  } else if (endpoint.includes('/users')) {
    return response.users || [];
  } else if (endpoint.includes('/fields')) {
    return response.fields || response.fieldOptions || [];
  } else if (endpoint.includes('/dealCustomFieldMeta')) {
    return response.dealCustomFieldMeta || [];
  }
  
  // Fallback: try to find an array in the response
  for (const key of Object.keys(response)) {
    if (Array.isArray(response[key])) {
      return response[key];
    }
  }
  
  return [];
}

/**
 * Fetch metadata that doesn't require pagination
 * @param {string} endpoint - API endpoint
 * @returns {Promise<Array>} All records
 */
async function fetchMetadata(endpoint) {
  const response = await acRequest(endpoint, { limit: 1000 });
  return extractRecords(response, endpoint);
}

module.exports = {
  acRequest,
  fetchFirstPage,
  fetchPage,
  fetchMetadata
};