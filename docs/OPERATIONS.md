# Operations and recovery

These tools are implemented and tested locally. Public hosting, TLS, an external backup destination, monitoring alerts and live integration recovery have not been provisioned or verified.

Before configuring a public service, run `npm run check:deployment -- --backup <snapshot-file>`. The [deployment configuration check](DEPLOYMENT_CHECK.md) reports automated blockers without contacting services or changing data; manual launch validation remains required.

## Health checks

`GET /health/live` returns 200 with `{"status":"ok"}` when Express can respond. `GET /health/ready` reads the workspace table and, in production mode, checks that `dist/index.html` exists. It returns 200 with `{"status":"ready"}` or 503 with `{"status":"unavailable"}`. Both endpoints are unauthenticated, uncached and disclose no account, document, key, path or database error details.

Readiness does not test a database write, every frontend asset, SQLite integrity, NEAR RPC, role keys, wallet availability or model connectivity. Alert on sustained readiness failure and on disk space; use a separate synthetic login/workflow check for broader coverage. Do not send invoices or keys to monitoring services.

## Create a backup

Run from the project directory with Node 24 or later:

```powershell
npm run db -- backup data/backups/styx-2026-10-27.sqlite
```

The source is `STYX_DB`, defaulting to `data/styx.sqlite`. The destination must be a new file. SQLite's online backup API captures committed data, including WAL contents, while the server is running. Do not copy just the main database file while it is in use. The tool checks integrity, foreign-key consistency, schema version 3 and core tables, validates the completed snapshot, then publishes it with an exclusive same-volume hard link. Unsupported filesystems fail rather than falling back to overwriting a file. Temporary files are removed on completion or handled failure; a killed process can leave a `.styx-snapshot-*` directory for operator inspection.

The backup contains all workspaces, private inputs and CSVs, password hashes, membership records, receipts, session hashes and integration intents. It does not contain environment variables, role keys, the deployment configuration, application source or browser drafts. Store backups outside the public web root. The default `data/` and `backups/` directories are ignored by Git. Unix permissions are restricted where supported; on Windows configure directory ACLs explicitly. Snapshots are not encrypted by this tool: use encrypted, access-controlled storage and keep secrets separately.

A local backup on the same disk does not protect against disk loss. Copy verified snapshots to a separately secured destination, define a retention period appropriate to the private documents, and regularly rehearse restoration. No recurring backup or external upload is installed by these commands.

## Rehearse recovery without replacing live data

```powershell
npm run db -- restore data/backups/styx-2026-10-27.sqlite data/recovery-rehearsal.sqlite
```

Restore always creates a new file and refuses an existing destination, including the live database. It clears every persisted session and login throttle in the new file; users must sign in again. User password hashes, roles, workspace data and financial records are retained. The backup and live source stay unchanged.

For a repeatable automated rehearsal that cleans up its temporary restored copy:

```powershell
npm run db -- rehearse data/backups/styx-2026-10-27.sqlite
npm run db -- smoke data/backups/styx-2026-10-27.sqlite
```

`rehearse` restores into a newly created temporary directory and compares every application table's schema and row bytes, including SQLite's sequence counter, against the backup. Authentication session/throttle contents are excluded from equality and separately required to be empty. It returns only counts and pass flags, without printing private row values or document fingerprints. Comparison currently sorts encoded rows in memory; run on a machine with sufficient memory for the largest table. It proves restoration of that snapshot, not that its contents are correct or up to date.

`smoke` additionally requires a production build, starts the restored copy on an available loopback port in password mode, checks readiness/homepage and unauthenticated private API denial, stops the isolated server and compares records again. It deliberately does not inherit model credentials, role keys or enabled external integrations. It does not test a real user's password, a public TLS proxy or external transaction recovery. Only the temporary directory created by the command is removed; a failure to stop its child server retains that directory for investigation. Existing backup and live database remain intact. No scheduled job, off-device copy, retention policy or cloud upload is created.

For a local rehearsal use a separate terminal, port and the original access mode. Keep model/NEAR credentials out of the rehearsal environment to prevent external actions:

```powershell
$env:STYX_DB='data/recovery-rehearsal.sqlite'
$env:PORT='4176'
$env:STYX_APP_ORIGIN='http://127.0.0.1:4176'
$env:STYX_AUTH_MODE='password'
$env:NEAR_AI_ENABLED='false'
npm start
```

Build first with `npm run build`. Existing restored password accounts can sign in; a local-only demo backup has no password accounts until provisioned through [workspace access setup](ACCESS.md). Local-owner mode remains possible for a private loopback demo. Verify health, sign-in, workspace balances, representative inputs/downloads and receipts. Running jobs can become actionable failures on recovery as documented in README.

To cut over, stop the original service and configure `STYX_DB` to the verified restored file before restarting it. Retain the old database for investigation; never run two STYX processes against the same database. A restore rolls back local knowledge, not external transactions or inference charges. Before reenabling NEAR/model credentials, independently reconcile actions after the snapshot time with authoritative chain/provider records. Do not blindly resubmit an older pending intent or repeat paid processing. Automated external-state disaster recovery is not implemented.

## Production startup checklist

Use one Node process on a persistent local disk; shared/network SQLite storage and multi-instance operation are unsupported. Install locked dependencies with `npm ci`, build with `npm run build`, then run `npm start` from the project root under a service manager. `tsx` is now a production dependency, so an already-built deployment can install runtime dependencies with `npm ci --omit=dev`. Building still needs development tools. Keep the database directory writable and `dist/` available. Capture process exit/errors without logging request bodies, authorization cookies, invoices or environment secrets.

`npm run check:production` stages only application code, fixtures, package files and compiled assets in a temporary workspace folder. It performs a clean offline install with development dependencies omitted, starts an isolated password-mode production server with a fresh database and no integration secrets, checks readiness/app/assets and anonymous private-API denial, then stops it and verifies the cleanup target stays inside the workspace before removing the temporary folder. It never copies live data, `.env` or signing keys. The locked packages must already exist in npm's cache; a cache miss or timeout is a failed check, not production evidence. Success/failure is written to `docs/verification/production-install.json`. This verifies runtime packaging, not a public TLS deployment, real user provisioning or off-device recovery.

Keep the Node listener on `127.0.0.1`. Provision password accounts before enabling `STYX_AUTH_MODE=password`. Set the exact public HTTPS `STYX_APP_ORIGIN`, terminate TLS at a reverse proxy and preserve the original Host and Origin headers. Follow [ACCESS.md](ACCESS.md) for cookies, roles and access limitations. Test login/logout, uploads, desktop/mobile routing and health through the real public origin before launch. Configure service restart behavior, private backups, disk alerts and a documented recovery owner. Local tests do not establish public deployment or contract security readiness.
