# Frequently Asked Questions (FAQ)

## General Questions

### Q: How long does each sync take?
**A:** Typically 5-8 minutes for ~82,000 contacts and ~75,000 deals. The exact time depends on:
- ActiveCampaign API response times
- Number of custom fields
- Network latency

### Q: Will this work with my data volume?
**A:** Yes! The system is designed for:
- Up to 100,000+ contacts
- Up to 100,000+ deals
- Any number of custom fields
- Rate limiting handles API constraints automatically

### Q: Can I sync more frequently than every 15 minutes?
**A:** Yes! Edit `vercel.json`:
```json
"schedule": "*/5 * * * *"  // Every 5 minutes
```
However, consider:
- Sync must complete before next run starts
- More frequent syncs = more Vercel function usage
- ActiveCampaign data typically doesn't change that rapidly

### Q: What happens if a sync fails?
**A:** The system handles failures gracefully:
- Failed requests retry up to 3 times with exponential backoff
- Sync metadata logs all errors
- Next scheduled sync will run normally
- Previous data remains in database until successful sync
- You can monitor failures via `/api/sync-status`

## Setup & Deployment

### Q: Do I need a Vercel Pro account?
**A:** Recommended but not required:
- **Free tier**: 10-second timeout (may not be enough)
- **Pro tier**: 300-second timeout (5 minutes, sufficient)
- **Enterprise**: 900-second timeout

For large datasets, Pro is recommended.

### Q: Can I use a different database?
**A:** The code uses `@vercel/postgres`, but you can adapt it:
1. Replace database imports
2. Adjust connection logic in `lib/db/`
3. Ensure JSONB support (PostgreSQL 9.4+)

Other PostgreSQL hosts (Supabase, Railway, etc.) should work with minor modifications.

### Q: Can I deploy this without Vercel?
**A:** Yes, but you'll need to:
1. Replace Vercel Cron with your cron solution (GitHub Actions, AWS EventBridge, etc.)
2. Update database connection
3. Handle long-running processes (10-minute timeouts)
4. Adjust deployment configuration

### Q: How do I get my ActiveCampaign API credentials?
**A:** 
1. Log into ActiveCampaign
2. Go to **Settings** (gear icon)
3. Click **Developer**
4. Copy your API URL and generate/copy an API key

## Data & Sync Questions

### Q: What data is synced?
**A:** Complete datasets including:

**Contacts:**
- All standard fields (email, name, phone, etc.)
- All custom fields with definitions
- Tags
- Field values
- Timestamps

**Deals:**
- All standard fields (title, value, status, etc.)
- All custom fields with definitions
- Pipeline information
- Stage information
- Owner/user information
- Timestamps

### Q: Are custom fields included?
**A:** Yes! Both contacts and deals include:
- Custom field values
- Field definitions (labels, types)
- Proper mapping to field metadata

### Q: How is the data stored?
**A:** Data is stored as JSONB in PostgreSQL:
- Each sync completely replaces previous data
- Contacts in one JSONB column
- Deals in another JSONB column
- Fast querying with JSONB operators
- Flexible schema (handles API changes)

### Q: Can I keep historical data?
**A:** By default, only the latest sync is kept. To retain history:

1. Modify `lib/db/storage.js`:
```javascript
// Instead of:
await sql`DELETE FROM ac_sync_data WHERE data_type = 'contacts' AND sync_id != ${syncId}`;

// Keep last 5 syncs:
await sql`
  DELETE FROM ac_sync_data 
  WHERE data_type = 'contacts' 
  AND sync_id NOT IN (
    SELECT sync_id FROM ac_sync_data 
    WHERE data_type = 'contacts'
    ORDER BY synced_at DESC 
    LIMIT 5
  )
`;
```

### Q: How do I query the synced data?
**A:** See [SQL_QUERY_EXAMPLES.md](./SQL_QUERY_EXAMPLES.md) for 30+ examples. Basic pattern:

```sql
-- Get all contacts
SELECT json_data FROM ac_sync_data WHERE data_type = 'contacts';

-- Find contact by email
SELECT contact FROM ac_sync_data,
  jsonb_array_elements(json_data) AS contact
WHERE data_type = 'contacts'
AND contact->>'email' = 'user@example.com';
```

### Q: Can I use this data in my application?
**A:** Absolutely! Access via:
1. **Direct SQL queries** in your Vercel functions
2. **Query API endpoint**: `/api/query-data?type=contacts`
3. **Database client** from any external application

## Performance Questions

### Q: Why does the sync take 5-8 minutes?
**A:** The time is mostly due to rate limiting:
- ActiveCampaign allows max 10 calls/second
- ~820 API calls for contacts (82k / 100 per page)
- ~750 API calls for deals (75k / 100 per page)
- Batches of 10 with 1-second delays = ~75-82 seconds minimum
- Plus API response time and processing

### Q: Can I make it faster?
**A:** A few options:
1. **Test higher page sizes**: Some endpoints support 250+ records/page
2. **Optimize rate limit**: Test 12-15 calls/sec (carefully!)
3. **Reduce data**: Filter by date ranges if you don't need everything
4. **Parallel processing**: Split contacts/deals into more parallel streams

**Warning**: Violating rate limits may get your API access throttled!

### Q: Will this affect my Vercel bill?
**A:** Depends on your plan:
- **Function executions**: 96 per day (every 15 min)
- **Duration**: ~6 minutes each = ~576 minutes/day
- **Bandwidth**: Minimal (API calls, not serving users)

Check Vercel pricing for your tier's included quota.

## Monitoring & Troubleshooting

### Q: How do I know if syncs are working?
**A:** Multiple ways:
1. **Status API**: `curl https://your-app.vercel.app/api/sync-status`
2. **Database view**: `SELECT * FROM ac_latest_sync;`
3. **Vercel logs**: Dashboard → Functions → sync-activecampaign
4. **Email alerts**: Set up via Vercel integrations

### Q: What does a 401 error mean?
**A:** Invalid API credentials. Check:
1. `AC_API_KEY` is correct
2. `AC_API_URL` matches your account
3. API key has read permissions
4. API access is enabled in ActiveCampaign

### Q: What if I see "Rate limit exceeded"?
**A:** Shouldn't happen with proper rate limiting, but if it does:
1. Verify `BATCH_SIZE` is 10 or less in `rate-limiter.js`
2. Check `BATCH_DELAY_MS` is 1000 (1 second)
3. Review Vercel logs for concurrent requests
4. Contact ActiveCampaign if limits have changed

### Q: Sync times out / doesn't complete?
**A:** Likely timeout issue:
1. **Check plan**: Free tier has 10-second timeout (too short)
2. **Upgrade**: Pro plan has 300-second timeout
3. **Verify**: `maxDuration: 300` in API route config
4. **Reduce data**: Filter by date if needed

### Q: Data is missing or incorrect?
**A:** Debug steps:
1. Check sync logs in Vercel
2. Verify `/api/sync-status` shows success
3. Query database: `SELECT * FROM ac_latest_sync;`
4. Test API manually with curl/Postman
5. Review field mapping in sync modules

## Customization Questions

### Q: Can I sync only contacts OR only deals?
**A:** Yes! Modify `pages/api/sync-activecampaign.js`:

```javascript
// Remove one of these:
const [contactsResult, dealsResult] = await Promise.allSettled([
  syncContacts(syncId),  // Remove this line to skip contacts
  syncDeals(syncId)      // Remove this line to skip deals
]);
```

### Q: Can I add more ActiveCampaign resources?
**A:** Yes! Follow the same pattern:
1. Create new sync module in `lib/sync/` (e.g., `campaigns.js`)
2. Follow existing structure (fetch metadata, paginate, enrich, store)
3. Add to parallel sync in main API route
4. Create storage function in `lib/db/storage.js`

### Q: Can I filter data during sync?
**A:** Yes! Add filters to API calls:

```javascript
// In lib/sync/contacts.js
const firstPageResult = await fetchFirstPage(CONTACTS_ENDPOINT, {
  limit: LIMIT_PER_PAGE,
  additionalParams: {
    'filters[created_after]': '2024-01-01'  // Only new contacts
  }
});
```

Check ActiveCampaign API docs for available filters.

### Q: Can I transform data before storing?
**A:** Yes! Add transformation logic in sync modules:

```javascript
// In lib/sync/contacts.js, before storing:
const transformedContacts = enrichedContacts.map(contact => ({
  ...contact,
  fullName: `${contact.firstName} ${contact.lastName}`,
  // Add custom transformations
}));

await storeContactsData(transformedContacts, syncId);
```

## Security Questions

### Q: Is my API key secure?
**A:** Yes, if properly configured:
- Stored in Vercel environment variables (encrypted)
- Never exposed in code or logs
- Only accessible to your Vercel functions
- Not included in public builds

**Never commit** `.env` files to Git!

### Q: Can anyone trigger the sync?
**A:** No, it's protected:
- Requires `Authorization: Bearer CRON_SECRET` header
- In production, Vercel Cron automatically provides this
- Manual triggers need the secret
- Invalid requests return 401 Unauthorized

### Q: Can anyone access the synced data?
**A:** Security layers:
1. **Database**: Only accessible via Vercel credentials
2. **API endpoints**: Add authentication if needed
3. **Query API**: Currently public (add auth in production)

Recommended: Add authentication to query endpoints for production.

## Advanced Questions

### Q: Can I use webhooks instead of polling?
**A:** Yes! ActiveCampaign supports webhooks:
1. Set up webhook endpoints in your app
2. Subscribe to contact/deal events
3. Update database on webhook receipt
4. Keep periodic sync as backup

This is more complex but more real-time.

### Q: How do I add indexes for faster queries?
**A:** See [SQL_QUERY_EXAMPLES.md](./SQL_QUERY_EXAMPLES.md#performance-optimization):

```sql
-- Index for email lookups
CREATE INDEX idx_contacts_email 
ON ac_sync_data 
USING gin ((json_data -> 'email'))
WHERE data_type = 'contacts';
```

Add indexes for your most common queries.

### Q: Can I export data to CSV?
**A:** Yes! Via psql:

```bash
psql $POSTGRES_URL -c "\COPY (
  SELECT 
    contact->>'email',
    contact->>'firstName',
    contact->>'lastName'
  FROM ac_sync_data,
    jsonb_array_elements(json_data) AS contact
  WHERE data_type = 'contacts'
) TO 'export.csv' WITH CSV HEADER"
```

### Q: Can I use TypeScript?
**A:** Yes! The project includes `tsconfig.json`:
1. Rename `.js` files to `.ts`
2. Add type definitions
3. TypeScript will work automatically

Example:
```typescript
// lib/sync/contacts.ts
interface Contact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  // ... more fields
}

export async function syncContacts(syncId: string): Promise<SyncResult> {
  // Implementation
}
```

## Still Have Questions?

1. **Check the docs**: [README.md](./README.md) has extensive documentation
2. **Review examples**: [SQL_QUERY_EXAMPLES.md](./SQL_QUERY_EXAMPLES.md)
3. **Check Vercel logs**: Often reveal the issue
4. **ActiveCampaign API docs**: https://developers.activecampaign.com/
5. **Vercel docs**: https://vercel.com/docs

---

**Can't find your answer?** Open an issue on the GitHub repository!