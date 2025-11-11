# ActiveCampaign to Vercel Postgres Sync

Automated synchronization of ActiveCampaign contacts and deals to Vercel Postgres, running every 15 minutes via Vercel Cron Jobs.

## Overview

This system fetches complete datasets from ActiveCampaign (contacts and deals with custom fields, pipelines, stages, and user data) and stores them in Vercel Postgres for fast querying and analysis.

### Key Features

- ✅ **Complete data sync** - All contacts (~82k) and deals (~75k)
- ✅ **Custom fields included** - Both standard and custom fields mapped
- ✅ **Rate limit compliant** - Respects 10 calls/second limit
- ✅ **Efficient batching** - Parallel requests with intelligent throttling
- ✅ **Comprehensive logging** - Full visibility into sync operations
- ✅ **Error handling** - Retry logic with exponential backoff
- ✅ **Monitoring dashboard** - Track sync status and history

### Performance

- **Sync frequency**: Every 15 minutes
- **Expected duration**: 5-8 minutes for complete sync
- **API optimization**: Metadata fetched once, bulk data paginated
- **Storage strategy**: Complete replacement with JSONB storage

## Prerequisites

1. **ActiveCampaign Account**
   - API access enabled
   - API key with read permissions for contacts and deals

2. **Vercel Account**
   - Project deployed on Vercel
   - Postgres database added to project
   - Pro plan (recommended for longer execution times)

3. **Node.js** (for local development)
   - Version 18.x or higher

## Setup Instructions

### 1. Clone and Install

```bash
git clone <your-repo>
cd activecampaign-vercel-sync
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file for local development:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:

```env
# ActiveCampaign API
AC_API_URL=https://youraccountname.api-us1.com/api/3
AC_API_KEY=your_api_key_here

# Vercel Postgres (automatically set in production)
POSTGRES_URL=your_local_postgres_url

# Cron Security (generate with: openssl rand -hex 32)
CRON_SECRET=your_secure_random_string
```

#### Getting ActiveCampaign Credentials

1. Log into your ActiveCampaign account
2. Go to **Settings** → **Developer**
3. Copy your **API URL** (e.g., `https://youraccountname.api-us1.com/api/3`)
4. Copy or generate an **API Key**

### 3. Database Setup

Run the migration to create required tables:

```bash
# Option 1: Using Vercel CLI
vercel env pull .env.local
psql $POSTGRES_URL -f migrations/001_create_tables.sql

# Option 2: Using Vercel Postgres dashboard
# Copy the SQL from migrations/001_create_tables.sql
# Paste into the Vercel Postgres query editor
```

This creates:
- `ac_sync_data` - Stores contacts and deals as JSONB
- `ac_sync_logs` - Tracks sync operations for monitoring
- Views for easy status checking

### 4. Configure Vercel Environment Variables

Add environment variables to your Vercel project:

```bash
vercel env add AC_API_URL
vercel env add AC_API_KEY
vercel env add CRON_SECRET
```

Or via Vercel Dashboard:
1. Go to your project settings
2. Navigate to **Environment Variables**
3. Add each variable for **Production**, **Preview**, and **Development**

### 5. Deploy to Vercel

```bash
vercel --prod
```

The `vercel.json` configuration will automatically set up the cron job.

### 6. Verify Cron Job Setup

1. Go to Vercel Dashboard → Your Project → Settings → Cron Jobs
2. Verify the cron job is listed: `/api/sync-activecampaign` running every 15 minutes
3. The cron expression should be: `*/15 * * * *`

## Testing

### Local Testing

Test the sync locally before deploying:

```bash
npm run test-sync
```

This runs both contacts and deals sync and reports results.

### Manual Trigger

You can manually trigger a sync via API:

```bash
# Local
curl -X GET http://localhost:3000/api/sync-activecampaign \
  -H "Authorization: Bearer your_cron_secret"

# Production
curl -X GET https://your-app.vercel.app/api/sync-activecampaign \
  -H "Authorization: Bearer your_cron_secret"
```

### Check Sync Status

Monitor sync operations:

```bash
# Local
curl http://localhost:3000/api/sync-status

# Production
curl https://your-app.vercel.app/api/sync-status
```

Response includes:
- Current sync status
- Recent sync history (last 10)
- Statistics (success rate, average duration, counts)
- Latest data information

## Architecture

### File Structure

```
├── pages/api/
│   ├── sync-activecampaign.js    # Main cron endpoint
│   └── sync-status.js             # Status monitoring endpoint
├── lib/
│   ├── activecampaign/
│   │   └── client.js              # AC API client
│   ├── sync/
│   │   ├── contacts.js            # Contacts sync logic
│   │   └── deals.js               # Deals sync logic
│   ├── db/
│   │   ├── storage.js             # Data storage functions
│   │   └── sync-metadata.js       # Sync logging
│   └── utils/
│       └── rate-limiter.js        # Rate limiting utility
├── migrations/
│   └── 001_create_tables.sql     # Database schema
├── scripts/
│   └── test-sync.js               # Test script
├── vercel.json                    # Vercel config with cron
└── package.json
```

### Data Flow

1. **Cron Trigger** (every 15 minutes)
   - Vercel Cron calls `/api/sync-activecampaign`
   - Verifies authorization header

2. **Parallel Sync**
   - Contacts and deals sync run simultaneously
   - Each sync follows the same pattern:

3. **Contacts Sync**
   ```
   Fetch field definitions (once)
   ↓
   Get total count from first page
   ↓
   Fetch remaining pages (rate-limited batches)
   ↓
   Enrich with custom field mappings
   ↓
   Store in Postgres as JSONB
   ```

4. **Deals Sync**
   ```
   Fetch metadata (pipelines, stages, users, fields) in parallel
   ↓
   Get total count from first page
   ↓
   Fetch remaining pages (rate-limited batches)
   ↓
   Enrich with pipeline, stage, user, custom field data
   ↓
   Store in Postgres as JSONB
   ```

5. **Storage Strategy**
   - Complete replacement: new sync replaces old data
   - Single JSONB column for flexibility
   - Keeps only latest successful sync

### Rate Limiting Strategy

The system enforces ActiveCampaign's 10 calls/second limit:

- Requests grouped in batches of 10
- Each batch executes in parallel
- 1 second wait between batches
- Failed requests retry with exponential backoff (max 3 retries)

**Example**: 750 pages = 75 batches = ~75 seconds minimum

## Monitoring

### View Latest Sync

```sql
SELECT * FROM ac_latest_sync;
```

Returns: sync ID, timestamp, duration, success status, record counts

### View Sync History

```sql
SELECT * FROM ac_sync_logs 
ORDER BY timestamp DESC 
LIMIT 10;
```

### View Statistics

```sql
SELECT * FROM ac_sync_statistics;
```

Returns: total syncs, success rate, average duration, latest counts

### Query Synced Data

```sql
-- Get all contacts
SELECT json_data 
FROM ac_sync_data 
WHERE data_type = 'contacts';

-- Get all deals
SELECT json_data 
FROM ac_sync_data 
WHERE data_type = 'deals';

-- Query specific contacts (example: by email)
SELECT jsonb_array_elements(json_data) as contact
FROM ac_sync_data
WHERE data_type = 'contacts'
AND json_data::text LIKE '%example@email.com%';

-- Count deals by pipeline
SELECT 
  contact->>'pipelineData'->>'title' as pipeline,
  COUNT(*) as deal_count
FROM ac_sync_data,
  jsonb_array_elements(json_data) as contact
WHERE data_type = 'deals'
GROUP BY pipeline;
```

## Troubleshooting

### Sync Failures

1. **Check logs in Vercel**
   - Go to Deployment → Functions → `/api/sync-activecampaign`
   - Review error logs

2. **Check sync status API**
   ```bash
   curl https://your-app.vercel.app/api/sync-status
   ```

3. **Common issues**:
   - **401 Unauthorized**: Invalid AC API key
   - **Rate limit errors**: Adjust BATCH_SIZE in rate-limiter.js
   - **Timeout**: Increase maxDuration in API route config
   - **Database errors**: Check Postgres connection and schema

### Performance Issues

If sync takes longer than 10 minutes:

1. **Reduce page size**: Adjust `LIMIT_PER_PAGE` in sync modules
2. **Increase batch size**: Carefully increase `BATCH_SIZE` (max 10 for AC)
3. **Optimize queries**: Add indexes for frequent JSONB queries
4. **Upgrade Vercel plan**: Pro plan allows longer execution times

### Data Quality Issues

1. **Missing custom fields**:
   - Verify fields exist in ActiveCampaign
   - Check field mapping in sync modules
   - Review API response format

2. **Incomplete data**:
   - Check pagination logic
   - Verify API rate limits not causing drops
   - Review retry logic in rate-limiter

## Advanced Configuration

### Custom Field Indexing

For faster queries on specific fields, add GIN indexes:

```sql
-- Index contacts by email
CREATE INDEX idx_contacts_email ON ac_sync_data 
USING gin ((json_data -> 'email'));

-- Index deals by status
CREATE INDEX idx_deals_status ON ac_sync_data 
USING gin ((json_data -> 'status'));
```

### Alerting

Set up alerts for failed syncs:

1. **Vercel Integrations**: Connect Slack, Discord, or email
2. **Custom webhook**: Modify `sync-activecampaign.js` to POST to your alerting service
3. **Query-based**: Set up scheduled queries on `ac_sync_logs`

### Data Retention

Keep historical sync data:

```javascript
// In lib/db/storage.js, modify deletion logic:

// Instead of deleting old data:
// await sql`DELETE FROM ac_sync_data WHERE data_type = 'contacts' AND sync_id != ${syncId}`;

// Keep last N syncs:
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

## API Reference

### POST /api/sync-activecampaign

Trigger a complete sync of contacts and deals.

**Headers**:
- `Authorization: Bearer <CRON_SECRET>`

**Response**:
```json
{
  "syncId": "sync-1234567890",
  "timestamp": "2024-01-15T10:30:00Z",
  "durationMs": 420000,
  "durationMinutes": "7.00",
  "contacts": {
    "success": true,
    "recordCount": 82000,
    "durationMs": 210000
  },
  "deals": {
    "success": true,
    "recordCount": 75000,
    "durationMs": 210000
  }
}
```

### GET /api/sync-status

Get current sync status and statistics.

**Response**:
```json
{
  "currentStatus": {
    "sync_id": "sync-1234567890",
    "timestamp": "2024-01-15T10:30:00Z",
    "overall_success": true,
    "contacts_count": 82000,
    "deals_count": 75000
  },
  "statistics": {
    "totalSyncs": 96,
    "successfulSyncs": 94,
    "successRate": "97.92%",
    "avgDurationSeconds": "385.50",
    "lastSyncTime": "2024-01-15T10:30:00Z"
  }
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with `npm run test-sync`
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
1. Check this README's troubleshooting section
2. Review Vercel logs for error details
3. Check ActiveCampaign API documentation
4. Open an issue on GitHub

---

**Note**: This system handles large datasets efficiently but requires adequate Vercel plan limits. Monitor your function execution times and upgrade if needed.