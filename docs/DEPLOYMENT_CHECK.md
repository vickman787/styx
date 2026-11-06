# Deployment configuration check

Update 3 November: a `testnet-capacity` check rejects public rollout using the known whole-map artifact whose callback fails at 100 stored jobs. Local pilot checks retain an explicit capacity notice. The separate keyed-storage candidate passed bounded VM testing but needs a fresh deployment and owner acceptance; see [candidate boundary](CONTRACT_KEYED_CANDIDATE.md). `npm run check:production` separately tests a clean offline production-only dependency install, server startup, compiled assets and anonymous private-API denial in a temporary copy; it does not make public hosting ready.

Run from the project root:

```powershell
npm run check:deployment
npm run check:deployment -- --backup data/backups/snapshot.sqlite
```

The default profile checks public deployment configuration. It does not publish anything, contact NEAR/AI services, sign transactions, provision users, create a database, change existing data or collect configuration values into the report. It reads the existing database and optional backup using SQLite read-only connections. Run it only as an operator with access to those files; it is not a public HTTP endpoint.

Checks include Node 24+, the presence of the production index file, an exact public HTTPS origin with password mode, loopback listener configuration, supported execution mode, schema-v3 database integrity, and enabled owner membership for every workspace. Owner membership does not prove that the operator knows the password or that an actual public login succeeds. Build-file presence does not establish freshness or validate every frontend asset. Readiness does not measure disk space, filesystem ACLs or write permissions.

Pass a backup created by `npm run db -- backup <new-file>`. The check requires a distinct file, rejects a hard link to the live database, verifies schema/integrity, and requires its modification time to be no more than seven days old (or one minute in the future for clock tolerance). This is a local freshness policy, not evidence of backup contents being current or matching a particular live database. A changed timestamp cannot prove backup age. The check cannot establish encryption, off-device storage, a retention schedule or a successful recovery rehearsal.

If NEAR configuration is present, the check validates distinct role accounts/keys, explicit prices and whether the configured code hash matches the local WASM bytes. Missing/invalid configuration reports field names and generic messages, never supplied key values. A matching hash is not evidence of a deployed or reviewed contract. Disabled or unconfigured optional integrations are explicitly marked `disabled`; they do not prevent a local-processing deployment from passing configuration checks. Enabled NEAR AI must have a nonempty model and key; no credential validation or paid inference occurs.

For the private demo profile:

```powershell
npm run check:deployment -- --local --backup data/backups/snapshot.sqlite
```

This permits valid loopback local-owner access and omits password owner checks unless password mode is configured. It is not authorization to expose local-owner mode publicly.

For machine-readable JSON without npm's banner:

```powershell
npm --silent run check:deployment -- --json --backup data/backups/snapshot.sqlite
```

Exit code `0` means the automated configuration checks passed; `2` means configuration needs setup; `1` means invalid command usage or an unexpected check failure. Every report retains `launchStatus: "unverified"` and manual validation gates. No successful result changes access mode, enables integrations or authorizes funding/publishing.

The ordinary npm scripts use the process environment and do not load `.env` automatically. To inspect an operator-provided environment file without printing it:

```powershell
node --env-file=.env --import tsx scripts/check-deployment.ts --json --backup data/backups/snapshot.sqlite
```

Before a public launch follow [access setup](ACCESS.md), [operations and recovery](OPERATIONS.md), [contract testing](CONTRACT_TESTING.md), [NEAR testnet setup](NEAR_TESTNET.md) and [NEAR AI setup](NEAR_AI.md). Real TLS/proxy tests, account provisioning, backup recovery, monitoring, contract review and live integration validation remain separate work.
