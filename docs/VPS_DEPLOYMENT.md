# STYX on the existing Ubuntu VPS

## Cutover — 6 November 2026

The purchased domain is `usestyx.xyz`. Its apex A record is configured through the owner's authenticated Vercel CLI to the verified VPS address; Vercel's authoritative DNS answers correctly. At cutover, the XYZ parent zone still answered NXDOMAIN, so public DNS/HTTPS are **not yet verified**. Caddy is configured to obtain and renew TLS when delegation becomes visible.

The owner provisioned their login through the hidden-passphrase helper. Local STYX was paused. A consistent transfer snapshot cleared old sessions/throttles while preserving the password hash, invoices, agreements and receipts. All 20 application-table counts matched exactly on the VPS, including the new Paid and Refunded records. Only restricted role keys and the existing server-side model configuration were transferred; owner-wallet and deployment full-access keys were excluded. Files are mode 600 inside mode 700 private/data directories. Redundant temporary transfer copies were removed.

STYX runs as `styx-app-1`, image `styx:89e27a14`, on loopback port 4173. Backend readiness and anonymous private-API denial (401) passed; a container restart preserved readiness. The existing proxy joined `styx_private`; its Compose configuration retains that external network for future recreation. Janus's original route and data remain intact, and its public HTTPS still returns 200. Original proxy files were backed up with stamp `20261106-065541`, validated, then reloaded. [Cutover evidence](verification/vps-cutover.json).

Do not restart the old local database as an independent writer. Once public DNS resolves, verify valid HTTPS, owner login/logout and wallet-popup origin on `https://usestyx.xyz`. The narrated demo is pending public-link verification; the first ElevenLabs generation did not start because the free-generation queue was busy, and nothing was charged.

Prepared 5 November 2026. Target inspected through the owner's existing SSH connection: Ubuntu 24.04 ARM64, Docker available, approximately 40 GB free disk and 11 GB available RAM. Janus currently occupies public ports 80/443 through its Caddy container and loopback 4311. STYX must use separate paths, container, private network and loopback 4173. No public STYX domain has been selected yet; public hosting remains pending.

Actual preparation: package SHA-256 `89e27a14d34fae333801e633749431d9dc50d16f927124b8119ee67d3a98b778` was verified on the VPS and built into `styx:89e27a14` (`styx:prepared` alias), under `/opt/styx/releases/89e27a14`. Compose validates. An ephemeral ARM container with no host mounts, external network or public ports passed production-page, anonymous denial, owner login, secure cookie, authenticated data and session-after-restart checks using generated synthetic credentials. That container was removed. No persistent STYX service was started, no real private data or credentials were transferred, and Janus still responds HTTP 200. [Preparation report](verification/vps-preparation.json).

## Prepared local files

- `npm run access:setup` prompts for the operator username and a twice-entered hidden passphrase, makes a consistent pre-change database backup, and creates an owner for the existing `acme-local` workspace. It preserves invoice/receipt records, does not reset existing users, and does not change the running local access mode. Passwords never enter command arguments or files; only salted hashes enter SQLite. The helper uses `STYX_DB` if set, otherwise `data/styx.sqlite`.
- `npm run package:vps` makes an allowlisted, checksummed application archive under ignored `data/releases`. It includes compiled frontend, runtime source, package lock, selected operator scripts, candidate WASM and deployment templates. It excludes the live database, login sessions, actual environment files, role credentials, owner keys and deployment administrator plans. This is the Docker build context; never build from the unrestricted workspace.
- `deploy/vps/Dockerfile` installs Linux/ARM-compatible production dependencies on Node 24. It runs as the unprivileged `node` account. No Windows `node_modules` are shipped.
- `deploy/vps/compose.yaml` runs one STYX app with persistent `/opt/styx/data`, private `styx_private` network, host port bound only on `127.0.0.1:4173`, read-only image filesystem and limited temporary storage.
- `scripts/start-vps.ts` refuses startup without password mode, real HTTPS origin, existing absolute database path and enabled owner membership for every workspace. Container-wide listening is allowed only with explicit `STYX_CONTAINER=true`, password mode and HTTPS. Local development remains loopback by default.

## Final provisioning order

1. Choose the STYX domain and point its DNS to the existing VPS. Keep Janus DNS/configuration intact.
2. Run the hidden-password owner setup on this PC. Do not send the passphrase in chat. Validate password login in an isolated server before cutover.
3. Build and inspect the application archive, then transfer only that public-code archive through authenticated SSH. Build its Docker image on ARM. A build is not a running or publicly accessible app.
4. At cutover, stop the local STYX server to avoid independent authoritative databases. Create a final consistent SQLite snapshot using `scripts/database.ts restore <source> <new-file>` so login sessions and stale login throttles are cleared in the transfer copy. Preserve original database and pre-cutover backup. Check all invoice/receipt table counts and the known Paid/Refunded records after migration. Do not copy only an active WAL database's main file.
5. Transfer the reviewed snapshot and restricted server-role environment separately via encrypted SSH into `/opt/styx/data` and `/opt/styx/private`. Those are private transfers and never part of the application image. Do not transfer any deployment/full-access/owner private key. Preserve server-only AI credentials only if the operator chooses that paid integration. Require owner UID/GID 1000 for the data bind mount; runtime configuration is root-owned mode 600 and supplied by Docker.
6. Set the exact public HTTPS origin, password mode, `STYX_CONTAINER=true`, `HOST=0.0.0.0`, `PORT=4173`, and `STYX_DB=/var/lib/styx/styx.sqlite` in private runtime configuration. Validate Compose before starting. No public registration/default login is created.
7. Add the STYX hostname block to the existing Caddy configuration after making a backup. Its upstream is `styx-app:4173`. Connect the existing proxy to `styx_private`; also declare this external network on that proxy in its Compose file so recreation preserves connectivity. Validate before a Caddy reload; preserve its existing Janus hostname block and certificate volumes. Do not install a competing proxy on ports 80/443.
8. Verify public HTTPS, private API denial, actual owner login/logout, viewer restrictions, restored Paid/Refunded history, wallet-popup origin, RPC and optional model readiness. Perform no automatic paid AI or wallet operation. Restart only STYX and verify persistence. Check Janus still responds before and after the change.

Until these steps are verified, this is a prepared deployment, not a public launch. Only separate STYX code/image files were staged remotely. No Janus runtime changes, private-data transfers, DNS changes or proxy changes were made.

## Rollback and operational limits

Keep the previous application image, configuration and a consistent database backup. Stop STYX before database rollback and use a new restore destination; never merge two independently written copies. Do not resume the old local server as a parallel writer after cutover. This remains a single-process testnet pilot, with no independent contract audit or storage-credit withdrawal. Off-device backup/alerts remain outstanding.

The app deliberately does not trust arbitrary forwarded client-IP headers. Login limits aggregate connections coming through the proxy; review that policy before inviting broad traffic. HTTPS and private proxy networking do not replace application authorization.

References: [Caddy automatic HTTPS requirements](https://caddyserver.com/docs/automatic-https), [reverse proxy configuration](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [Node SQLite backup API](https://nodejs.org/api/sqlite.html#sqlitebackupsourceDb-path-options).
