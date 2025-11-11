-- Database Migration for ActiveCampaign Sync
-- Run this SQL in your Vercel Postgres database

-- Table for storing synced data (contacts and deals)
CREATE TABLE IF NOT EXISTS ac_sync_data (
  id SERIAL PRIMARY KEY,
  data_type VARCHAR(50) NOT NULL, -- 'contacts' or 'deals'
  json_data JSONB NOT NULL,
  synced_at TIMESTAMP DEFAULT NOW(),
  record_count INTEGER,
  sync_duration_ms INTEGER,
  sync_id VARCHAR(100),
  CONSTRAINT unique_data_type_sync UNIQUE (data_type, sync_id)
);

-- Index for fast queries by data type
CREATE INDEX IF NOT EXISTS idx_ac_sync_data_type ON ac_sync_data(data_type);

-- Index for querying by sync time
CREATE INDEX IF NOT EXISTS idx_ac_sync_synced_at ON ac_sync_data(synced_at DESC);

-- Index for JSONB queries (optional - add specific paths as needed)
-- Example: CREATE INDEX idx_contacts_email ON ac_sync_data USING gin ((json_data -> 'email'));

-- Table for sync logs and monitoring
CREATE TABLE IF NOT EXISTS ac_sync_logs (
  id SERIAL PRIMARY KEY,
  sync_id VARCHAR(100) NOT NULL UNIQUE,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  total_duration_ms INTEGER,
  contacts_success BOOLEAN,
  contacts_count INTEGER,
  contacts_error TEXT,
  deals_success BOOLEAN,
  deals_count INTEGER,
  deals_error TEXT,
  overall_success BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for querying sync logs by time
CREATE INDEX IF NOT EXISTS idx_ac_sync_logs_timestamp ON ac_sync_logs(timestamp DESC);

-- Index for filtering by success status
CREATE INDEX IF NOT EXISTS idx_ac_sync_logs_success ON ac_sync_logs(overall_success);

-- View for latest sync status (convenience)
CREATE OR REPLACE VIEW ac_latest_sync AS
SELECT 
  sync_id,
  timestamp,
  total_duration_ms,
  ROUND(total_duration_ms::numeric / 1000, 2) as duration_seconds,
  ROUND(total_duration_ms::numeric / 60000, 2) as duration_minutes,
  contacts_success,
  contacts_count,
  contacts_error,
  deals_success,
  deals_count,
  deals_error,
  overall_success
FROM ac_sync_logs
ORDER BY timestamp DESC
LIMIT 1;

-- View for sync statistics
CREATE OR REPLACE VIEW ac_sync_statistics AS
SELECT 
  COUNT(*) as total_syncs,
  SUM(CASE WHEN overall_success THEN 1 ELSE 0 END) as successful_syncs,
  ROUND(AVG(total_duration_ms)::numeric / 1000, 2) as avg_duration_seconds,
  MAX(timestamp) as last_sync_time,
  ROUND(AVG(contacts_count)::numeric, 0) as avg_contacts_count,
  ROUND(AVG(deals_count)::numeric, 0) as avg_deals_count
FROM ac_sync_logs
WHERE timestamp > NOW() - INTERVAL '7 days';

COMMENT ON TABLE ac_sync_data IS 'Stores complete ActiveCampaign contacts and deals datasets as JSONB';
COMMENT ON TABLE ac_sync_logs IS 'Logs sync operations for monitoring and troubleshooting';
COMMENT ON VIEW ac_latest_sync IS 'Shows the most recent sync operation status';
COMMENT ON VIEW ac_sync_statistics IS 'Shows sync statistics for the last 7 days';