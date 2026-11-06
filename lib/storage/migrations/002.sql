CREATE TABLE IF NOT EXISTS near_execution (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, job_id TEXT NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS near_intent (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, payload TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS near_transaction_once ON near_intent(json_extract(payload, '$.txHash')) WHERE json_extract(payload, '$.txHash') IS NOT NULL;
PRAGMA user_version=2;
