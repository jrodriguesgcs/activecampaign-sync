// scripts/test-sync.js
// Test script to manually trigger sync locally
// Run with: node scripts/test-sync.js

require('dotenv').config({ path: '.env.local' });

async function testSync() {
  console.log('Starting manual sync test...');
  console.log('Environment check:');
  console.log('- AC_API_URL:', process.env.AC_API_URL ? 'Set' : 'Missing');
  console.log('- AC_API_KEY:', process.env.AC_API_KEY ? 'Set' : 'Missing');
  console.log('- POSTGRES_URL:', process.env.POSTGRES_URL ? 'Set' : 'Missing');
  console.log('');

  if (!process.env.AC_API_URL || !process.env.AC_API_KEY || !process.env.POSTGRES_URL) {
    console.error('Error: Missing required environment variables');
    console.error('Please create a .env.local file with the required variables');
    process.exit(1);
  }

  try {
    // Import the sync functions
    const { syncContacts } = require('../lib/sync/contacts');
    const { syncDeals } = require('../lib/sync/deals');
    
    const syncId = `test-${Date.now()}`;
    console.log(`Sync ID: ${syncId}\n`);

    // Test contacts sync
    console.log('Testing contacts sync...');
    const contactsStart = Date.now();
    const contactsResult = await syncContacts(syncId);
    console.log(`Contacts sync completed in ${((Date.now() - contactsStart) / 1000).toFixed(2)}s`);
    console.log(`Records: ${contactsResult.recordCount}\n`);

    // Test deals sync
    console.log('Testing deals sync...');
    const dealsStart = Date.now();
    const dealsResult = await syncDeals(syncId);
    console.log(`Deals sync completed in ${((Date.now() - dealsStart) / 1000).toFixed(2)}s`);
    console.log(`Records: ${dealsResult.recordCount}\n`);

    console.log('✓ Manual sync test completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('✗ Sync test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testSync();