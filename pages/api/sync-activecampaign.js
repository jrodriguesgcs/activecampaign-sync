export default async function handler(req, res) {
  // Add these debug logs at the very start
  console.log('[DEBUG] ===== Function Started =====');
  console.log('[DEBUG] Timestamp:', new Date().toISOString());
  console.log('[DEBUG] Method:', req.method);
  console.log('[DEBUG] Auth header present:', !!req.headers.authorization);
  console.log('[DEBUG] CRON_SECRET configured:', !!process.env.CRON_SECRET);
  console.log('[DEBUG] AC_API_URL configured:', !!process.env.AC_API_URL);
  console.log('[DEBUG] DATABASE_URL configured:', !!process.env.DATABASE_URL);
  
  // Verify this is a legitimate cron request from Vercel
  const authHeader = req.headers.authorization;
  
  if (process.env.NODE_ENV === 'production') {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.log('[DEBUG] Auth FAILED - unauthorized');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  
  console.log('[DEBUG] Auth PASSED - starting sync');

  const syncStartTime = Date.now();
  const syncId = `sync-${syncStartTime}`;

  console.log(`[${syncId}] Starting ActiveCampaign sync at ${new Date().toISOString()}`);

  try {
    const [contactsResult, dealsResult] = await Promise.allSettled([
      syncContacts(syncId),
      syncDeals(syncId)
    ]);

    const syncEndTime = Date.now();
    const totalDuration = syncEndTime - syncStartTime;

    // Process results
    const contactsSuccess = contactsResult.status === 'fulfilled';
    const dealsSuccess = dealsResult.status === 'fulfilled';

    const response = {
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

    // Store sync metadata for monitoring
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
    console.log(`[${syncId}] Sync completed - Overall: ${overallSuccess ? 'SUCCESS' : 'PARTIAL/FAILED'}`);
    console.log(`[${syncId}] Total duration: ${(totalDuration / 1000).toFixed(2)}s`);

    return res.status(overallSuccess ? 200 : 207).json(response);

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

    return res.status(500).json({
      syncId,
      error: 'Critical sync failure',
      message: error.message,
      durationMs: totalDuration
    });
  }
}

// Increase timeout for this API route (Vercel Pro allows up to 300s)
export const config = {
  maxDuration: 300, // 5 minutes max execution time
};