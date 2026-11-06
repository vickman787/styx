# Password access and workspace permissions

STYX has two **access** modes, separate from invoice processing or financial assets:

- `STYX_AUTH_MODE=local` (default): the loopback demo automatically opens the local owner workspace. This is not authentication for shared hosting.
- `STYX_AUTH_MODE=password`: private app routes require an operator-provisioned username/password and workspace membership. The landing page remains public. Workspace owners can perform actions; viewers can inspect/download their workspace's data but all workspace mutation endpoints reject them server-side.

The ordinary port-4173 demo has not been switched to password mode. No default/real account or password has been created. Browser tests create random, temporary test accounts in an isolated database, then stop that server and remove the test directory.

## Provision your account

Windows shortcut: from the project directory run `npm run access:setup`. This prompts for a username and a twice-entered hidden passphrase, backs up the current database, and creates an owner for the existing workspace without enabling password mode on the current local server. Existing users are never overwritten. Use the private passphrase on the public sign-in screen after deployment; never send it in chat. The manual commands below remain available for custom roles/workspaces.

Back up your SQLite database before changing access configuration. Choose the same `STYX_DB` for the CLI and server. No document/ledger reset is required. `acme-local` refers to the existing demo workspace; granting membership there deliberately gives that user access to its existing jobs. A new workspace ID creates an empty workspace with **100 demo units**, not a real wallet balance or funding transaction.

In PowerShell, read a unique passphrase without putting it in command history:

```powershell
$styxPassword = Read-Host 'Choose a unique passphrase (15–128 characters)' -AsSecureString
$env:STYX_SETUP_PASSWORD = [System.Net.NetworkCredential]::new('', $styxPassword).Password
try {
  npm run access -- create-user --username yourname --workspace acme-local --role owner
} finally {
  Remove-Item Env:STYX_SETUP_PASSWORD -ErrorAction SilentlyContinue
  $styxPassword.Dispose()
}
```

Replace `yourname`; the CLI accepts 3–40 ASCII letters/numbers/dots/underscores/hyphens, normalized to lowercase. Passwords are not trimmed or silently truncated. There is no built-in admin password, public registration or email recovery. The temporary environment value is read by the CLI, never printed, and cleared from the parent shell by the `finally` block. Keep the operator terminal/process environment private.

For a separate workspace use `--workspace team-one --name 'Team One'`. To create a viewer use a different username/password and `--role viewer`. Account/membership provisioning is an operator CLI action, not a permission granted to every workspace owner through the web UI.

For a custom database first set `$env:STYX_DB='data/your-workspace.sqlite'`, or run the CLI with the same environment file as the server: `node --env-file=.env --import tsx scripts/access.ts create-user --username yourname --workspace acme-local --role owner`. The secure password environment setup is still required. Never pass passwords as command-line arguments or commit them to `.env.example`.

## Enable and run

In your private `.env`:

```dotenv
STYX_AUTH_MODE=password
STYX_APP_ORIGIN=http://127.0.0.1:4173
```

Restart with `node --env-file=.env --import tsx server/index.ts`. Ordinary `npm run dev` reads shell environment variables, not `.env` automatically. **Open workspace** or any private workflow URL now presents the sign-in screen. Settings contains **Your account**, workspace selection, password change and sign-out. Local financial execution still uses demo units; enabling authentication does not deploy a contract, enable a model, fund a wallet or publish the server.

For public hosting, explicitly configure the exact HTTPS origin (for example `https://your-domain.example`) and password mode. The ordinary Node listener defaults to `127.0.0.1`. The prepared Docker profile permits `0.0.0.0` only inside explicit password/HTTPS container mode, with its host port published only on loopback. Configure a reviewed TLS proxy that preserves the expected Host; see VPS_DEPLOYMENT.md. Public HTTP origins and public local-owner mode are rejected. Nonlocal HTTPS uses a `__Host-styx_session` cookie with Secure, HttpOnly, SameSite=Strict and Path=/, plus HSTS. Live TLS/proxy/domain deployment has **not** been performed or verified here. Proxy/IP handling, edge rate limits, backups, monitoring and security review are still operator work.

## Manage access

```powershell
npm run access -- grant --username yourname --workspace team-one --role viewer
npm run access -- revoke --username yourname --workspace team-one
npm run access -- disable --username yourname
```

Grant requires an existing user and workspace. Revocation removes that membership and its sessions. Disable prevents all account access and revokes sessions. For operator password recovery use the secure password environment block above with `npm run access -- reset-password --username yourname`; it revokes all user sessions. No email is sent. The CLI intentionally has no automatic enable/undelete operation.

## Enforced behavior and limits

- Passwords use versioned, salted scrypt hashes (`N=32768,r=8,p=3`, 64-byte output), with constant-time comparison and a dummy derivation for unknown usernames. Cleartext passwords are not stored. This follows an [OWASP scrypt parameter option](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html); it is not an independent security audit.
- Random 256-bit session tokens stay in HttpOnly cookies. Only their SHA-256 hashes are stored in SQLite; CSRF values are separately derived from the secret token. Sessions survive restarts, expire after 12 hours, rotate on login/workspace switch/password change, and are revoked server-side on logout. Password changes invalidate all prior user sessions. No authentication tokens/passwords are placed in localStorage.
- Preauthentication tokens expire after 10 minutes; new anonymous session issuance in password mode is limited to 60 per socket IP per 15 minutes. New authenticated mandate/delivery approvals record the server-established user ID; historical local-owner approvals are not rewritten.
- Mutations validate CSRF and Origin; password mode requires the configured exact Origin. Host validation is explicit. Missing/expired/revoked sessions receive 401; viewer writes and unauthorized workspace switches receive 403. Session-mode separation prevents a local-demo token from authenticating password mode.
- Membership, role and disabled state are read from the database on every request. The workspace router receives a store scoped to that membership, never a workspace supplied by a job payload or query parameter. Job IDs include a workspace-specific prefix; the database's global constraints prevent cross-workspace overwrite. Verification domains now identify the workspace, while existing `acme-local` records remain compatible.
- Login/password-change throttles persist in SQLite: 8 attempts per normalized username and 50 per socket IP per 15-minute window, including successful attempts. The server does not trust arbitrary forwarded-IP headers. These are basic application limits, not distributed abuse protection. They can aggregate users behind one proxy; production rate-limit policy needs review.
- Browser autosaved drafts are namespaced by account/workspace. Cross-tab account-boundary notifications reload private UI and stale CSRF fails closed. Browser drafts still contain private input content in localStorage; account namespaces prevent accidental restoration, not access by someone sharing the same browser profile or operating system. Use appropriate browser profiles/device controls. Saved server drafts remain workspace-scoped.
- This is a single-process SQLite application. No SSO, MFA, public signup, email verification/reset, web membership administration, encryption at rest, distributed session/rate-limit service, idle timeout, formal audit or public deployment is claimed. Absolute session expiry is implemented. In-flight work authorized before revocation is not automatically canceled; review/cancel jobs separately. Server-side role keys/API credentials remain operator-managed, and model charges are outside demo caps.

Session handling was checked against the [OWASP Session Management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). Review the complete deployment before sharing private data or using funded integrations.
