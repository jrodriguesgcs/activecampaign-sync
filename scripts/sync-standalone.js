// scripts/sync-standalone.js
const { syncContacts } = require('../lib/sync/contacts');
const { syncDeals } = require('../lib/sync/deals');
const { storeSyncMetadata } = require('../lib/db/sync-metadata');

async function runSync() {
  const syncStartTime = Date.now();
  const syncId = `sync-${syncStartTime}`;

  console.log(`[${syncId}] Starting ActiveCampaign sync at ${new Date().toISOString()}`);
  console.log(`Environment check:`);
  console.log(`- AC_API_URL: ${process.env.AC_API_URL ? 'Set' : 'Missing'}`);
  console.log(`- AC_API_KEY: ${process.env.AC_API_KEY ? 'Set' : 'Missing'}`);
  console.log(`- DATABASE_URL: ${process.env.DATABASE_URL ? 'Set' : 'Missing'}`);

  try {
    // Run both syncs in parallel
    const [contactsResult, dealsResult] = await Promise.allSettled([
      syncContacts(syncId),
      syncDeals(syncId)
    ]);

    const syncEndTime = Date.now();
    const totalDuration = syncEndTime - syncStartTime;

    // Process results
    const contactsSuccess = contactsResult.status === 'fulfilled';
    const dealsSuccess = dealsResult.status === 'fulfilled';

    const summary = {
      syncId,
      timestamp: new Date().toISOString(),
      durationMs: totalDuration,
      durationMinutes: (totalDuration / 60000).toFixed(2),
      contacts: contactsSuccess ? {
        success: true,
        recordCount: contactsResult.value.recordCount,
        durationMs: contactsResult.value.durationMs
      } : {
        success: false,
        error: contactsResult.reason.message
      },
      deals: dealsSuccess ? {
        success: true,
        recordCount: dealsResult.value.recordCount,
        durationMs: dealsResult.value.durationMs
      } : {
        success: false,
        error: dealsResult.reason.message
      }
    };

    // Store sync metadata
    try {
      await storeSyncMetadata({
        syncId,
        timestamp: new Date(),
        totalDuration,
        contactsSuccess,
        contactsCount: contactsSuccess ? contactsResult.value.recordCount : 0,
        contactsError: contactsSuccess ? null : contactsResult.reason.message,
        dealsSuccess,
        dealsCount: dealsSuccess ? dealsResult.value.recordCount : 0,
        dealsError: dealsSuccess ? null : dealsResult.reason.message
      });
    } catch (metadataError) {
      console.error(`[${syncId}] Failed to store sync metadata:`, metadataError);
    }

    const overallSuccess = contactsSuccess && dealsSuccess;
    console.log(`\n[${syncId}] ========================================`);
    console.log(`[${syncId}] Sync completed - Overall: ${overallSuccess ? 'SUCCESS' : 'PARTIAL/FAILED'}`);
    console.log(`[${syncId}] Total duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log(`[${syncId}] Contacts: ${contactsSuccess ? contactsResult.value.recordCount : 'FAILED'}`);
    console.log(`[${syncId}] Deals: ${dealsSuccess ? dealsResult.value.recordCount : 'FAILED'}`);
    console.log(`[${syncId}] ========================================\n`);

    console.log(JSON.stringify(summary, null, 2));

    process.exit(overallSuccess ? 0 : 1);

  } catch (error) {
    const syncEndTime = Date.now();
    const totalDuration = syncEndTime - syncStartTime;

    console.error(`[${syncId}] Critical sync error:`, error);

    // Store failure metadata
    try {
      await storeSyncMetadata({
        syncId,
        timestamp: new Date(),
        totalDuration,
        contactsSuccess: false,
        contactsCount: 0,
        contactsError: error.message,
        dealsSuccess: false,
        dealsCount: 0,
        dealsError: error.message
      });
    } catch (metadataError) {
      console.error(`[${syncId}] Failed to store error metadata:`, metadataError);
    }

    process.exit(1);
  }
}

runSync();