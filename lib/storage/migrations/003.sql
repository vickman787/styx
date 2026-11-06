CREATE TABLE IF NOT EXISTS app_user (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_digest TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS membership (user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','viewer')), PRIMARY KEY(user_id,workspace_id));
CREATE TABLE IF NOT EXISTS auth_session (token_hash TEXT PRIMARY KEY, mode TEXT NOT NULL, user_id TEXT, workspace_id TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_by_user ON auth_session(user_id);
CREATE TABLE IF NOT EXISTS auth_attempt (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
PRAGMA user_version=3;
