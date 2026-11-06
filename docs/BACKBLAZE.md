# Private Backblaze B2 backups

The optional integration is implemented for the current SQLite app. It does not replace the live database or improve request latency. Vercel/Neon migration and a Postgres dump adapter remain separate work; this command currently accepts SQLite snapshots only. No provider account, bucket, paid plan, upload, retention rule or recurring task is created automatically.

## Account and private bucket

1. Create your own account through [Backblaze B2 signup](https://www.backblaze.com/sign-up/cloud-storage). Keep login/recovery details private. EU Central (Amsterdam) is the recommended starting region for this project; the account region cannot later be changed in place. See [official regions](https://www.backblaze.com/docs/cloud-storage-data-regions).
2. Create a bucket with **Private** access (`allPrivate`). Use a generic bucket name, without names, emails, customer identifiers or invoice details. Enable/verify server-side encryption. The uploader also explicitly requests SSE-B2/AES256 for every object.
3. Create a **standard application key** restricted to that one bucket and the exact filename prefix `styx-backups/`. It needs `listBuckets` and `writeFiles`. A normal bucket-restricted key can contain additional file-read/list permissions; the integration never uses file deletion or changes bucket settings. Unrestricted/master keys and keys containing `writeBuckets`, `deleteBuckets`, `writeKeys`, `deleteKeys` or `all` are rejected. Backblaze's web-console Write Only preset can still include file-deletion and granular bucket-setting capabilities; this client does not remove those permissions and never invokes them. A custom API-created key limited to `listBuckets`/`writeFiles` is preferable where the operator can provision one. Do not grant account-administration access. Keep the application key out of chat, browser JavaScript, screenshots and source control.
4. Record the bucket ID, application key ID and application key through local process environment variables or your host's secret manager. A bucket name alone is insufficient.

Official references: [application keys](https://www.backblaze.com/docs/cloud-storage-application-keys), [private bucket types](https://www.backblaze.com/docs/cloud-storage-buckets), [v4 authorization](https://www.backblaze.com/apidocs/b2-authorize-account).

## Local encryption key

```powershell
npm run backup:b2 -- keygen data/secrets/styx-backup.key
$env:STYX_BACKUP_KEY_FILE='data/secrets/styx-backup.key'
```

The command creates a new random 32-byte key and refuses to replace an existing file. It never prints the key. The current build session has already created this file locally; do not overwrite it. Keep a separate private recovery copy in an appropriate password manager or offline secure location, apart from the B2 bucket and this machine. Losing that key makes these archives unrecoverable. Keep older keys when rotating them, because existing archives still need their original key. Configure Windows directory/file ACLs for the operator account; Node's Unix file mode does not establish Windows ACL protection.

Encryption uses authenticated AES-256-GCM with a fresh random 12-byte nonce per archive. The version header and nonce are authenticated; changed data or a wrong key fails before recovery publishes plaintext. The envelope is a STYX format (`.styxbak`), not an interoperable backup standard or independently audited cryptographic product. Tools currently read a bounded file into memory and support snapshots up to **64 MiB**. Temporary decrypted SQLite copies are private local files removed after validation; deletion is not secure disk erasure. Keep the backup key separate from archive storage.

## Configure credentials without pasting a key into chat

The plain npm scripts read process environment and do not load `.env` automatically. A private `.env` file is ignored by Git; use server-side variables only, never `VITE_` names. `.env.example` lists the names. For an interactive PowerShell session:

```powershell
$env:STYX_B2_KEY_ID = Read-Host 'B2 application key ID'
$env:STYX_B2_BUCKET_ID = Read-Host 'B2 bucket ID'
$b2SecretInput = Read-Host 'B2 application key (hidden)' -AsSecureString
try {
  $env:STYX_B2_APPLICATION_KEY = [System.Net.NetworkCredential]::new('', $b2SecretInput).Password
  $env:STYX_BACKUP_KEY_FILE='data/secrets/styx-backup.key'
  npm run backup:b2 -- check
} finally {
  Remove-Item Env:STYX_B2_APPLICATION_KEY -ErrorAction SilentlyContinue
  $b2SecretInput.Dispose()
}
```

The `check` command authenticates and reads bucket metadata; it uploads nothing. Local `status` prints missing variable names and whether uploads are enabled, without validating credentials or contacting B2. The application key must remain in the process environment when running an actual upload; use a secure environment/secret manager for that operation as well. The example deliberately removes it afterward. Do not type a literal application key into a shell command or put it in command-line arguments.

## Prepare, verify and upload

First make an online SQLite snapshot with the existing tool, then encrypt its stable bytes:

```powershell
npm run db -- backup data/backups/new-snapshot.sqlite
npm run backup:b2 -- prepare data/backups/new-snapshot.sqlite data/backups/new-snapshot.styxbak
```

`prepare` rejects the configured live database and existing output files. It rehearses recovery of the exact snapshot bytes, checks encryption/decryption and retains the encrypted archive. Plaintext snapshots remain local and must be protected separately.

With secure B2 credentials present and a successful connection check:

```powershell
$env:STYX_B2_ENABLED='true'
npm run backup:b2 -- upload data/backups/new-snapshot.styxbak
```

Upload authenticates/decrypts the local archive and rehearses its recovery before sending **only the encrypted archive**. It verifies private bucket access, single-bucket/prefix key scope, trusted HTTPS provider hosts, file identity, byte length, provider checksum and server-side encryption metadata. Redirects are rejected. Objects have random filenames under `styx-backups/YYYY-MM-DD/`, without private invoice or workspace metadata. The SHA-1 field is B2's transport checksum; archive authenticity uses AES-GCM. Authorization tokens and provider error bodies are never printed.

No automatic upload retry occurs. If a timeout/mismatched response occurs after submission, the object may already exist; the error gives the generated object name for reconciliation before retrying. A reported upload means provider metadata matched the sent encrypted bytes. It does not prove a later download/restore, deletion protection or disaster recovery. Verify a real download and restore after connecting the account.

## Recover

Download the encrypted object using an authorized B2 client, then use the original local recovery key:

```powershell
npm run backup:b2 -- recover data/backups/downloaded.styxbak data/restored-from-b2.sqlite
```

Recovery authenticates before publishing a new SQLite file, validates application records through a temporary restore, clears login sessions/throttles, and refuses an existing destination. Follow [operations](OPERATIONS.md) for production smoke/cutover and reconciliation of external actions after snapshot time.

## Scheduling, retention and cost

The one-shot [backup runner](BACKUP_RUNNER.md) now creates verified encrypted snapshots, journals cloud attempts before submission, locks concurrent runs and reports stale/failed/uncertain backups. It is ready for operator testing; it does not activate a scheduler or alert service.

Proposed policy is daily backups with 30-day retention. No schedule, notification destination, lifecycle deletion or Object Lock setting has been activated. Retention changes/deletion controls need a separate operator setup; the backup uploader does not administer them. A private bucket alone does not protect against deletion by an authorized account. [Lifecycle and Object Lock](https://www.backblaze.com/docs/cloud-storage-rules) are provider features to evaluate with the intended recovery policy.

Usage can incur charges; check [current pricing](https://www.backblaze.com/cloud-storage/pricing) and account limits. This integration does not enforce a cloud spending cap. Local/mock tests are not evidence of a real account connection or upload.
