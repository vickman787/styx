# Backup runner and local status

This is a one-shot operator command suitable for invoking from a future service scheduler. It does not install a recurring task, connect an alert destination, bypass private file permissions or enable cloud access automatically.

```powershell
# Local-only: snapshot, encrypted archive, verified recovery, journal.
node --env-file=data/secrets/backblaze.env --import tsx scripts/backup-runner.ts local

# Cloud: same steps, then upload using explicitly enabled B2 settings.
node --env-file=data/secrets/backblaze.env --import tsx scripts/backup-runner.ts cloud

# Status uses local journals; no key or network request is needed.
npm run backup:run -- status
```

The private environment file is created only with the user's approval and is ignored by Git. Do not display it, paste its contents into chat, or add it to source control. Windows account permissions can prevent one execution identity from reading files written by another; do not weaken permissions or copy secrets into command arguments to work around a blocked account. Resolve the specific operator access with approval first.

Each run creates a UUID directory under ignored `data/backup-runs/` and a validated JSON journal beside it. The archive remains in that directory. The new plaintext SQLite snapshot is removed only after encryption and recovery validation succeed; a failed preparation can leave that run's own plaintext snapshot for investigation. Existing backups and user files are not deleted. This runner currently supports the SQLite application and the archive size limits documented in [B2 setup](BACKBLAZE.md); it is not a Neon/Postgres export pipeline.

A lock prevents concurrent runs in the same run directory. An interrupted process can leave `runner.lock`. There is no automatic lock stealing or age-based deletion: an operator must verify that the original process has stopped before clearing that lock. A PID in a journal/lock can be reused by the OS and is not proof that it is safe to clear.

The upload object name and `upload_pending` state are persisted before the network operation. Only matching B2 confirmation metadata produces `uploaded`. A request that might have reached B2 without a confirmed result becomes `uncertain`. A crash or disk error can leave `upload_pending` even if B2 accepted the file. Any unresolved `uncertain`/`upload_pending` journal blocks a subsequent cloud attempt. Local-only backups remain available and cannot hide the outstanding cloud problem. There is no automatic replay or remote deletion.

Reconciliation is intentionally an operator step: inspect the recorded object name in the private bucket and verify its bytes/recovery before deciding how to reconcile the journal. Do not delete or mark an unresolved journal successful just to get a green status. No automated reconciliation command or remote download verifier is provided yet.

Status is `fresh` only when a confirmed upload was finished within the past 36 hours (one-minute future clock tolerance), with no unresolved upload, lock or latest failed cloud attempt. Other results are `no_cloud_backup`, `stale` or `attention`. A malformed journal fails closed with a generic message. Local-only success does not count as off-device success. Journal freshness does not prove that the remote object still exists or that it can be downloaded/restored; a separate real recovery check is required. These journals are operator evidence, not tamper-proof attestations.

CLI exit codes: `0` for successful local/cloud runs or fresh status; `2` for a recorded failed/uncertain run or non-healthy status; `1` for usage errors, locks, unresolved prior uploads or unexpected operational failures. Errors use generic codes and do not copy raw provider responses or secret values into journals.

`scheduleVerified` and `alertDeliveryVerified` remain false because this tool does not inspect external schedulers or test alert delivery. A service manager should run one explicit cloud attempt per scheduled execution and treat nonzero exit codes as actionable. Before installing any schedule, finish the live B2 connection/upload/download verification, select retention and an alert destination, and verify that the service account can read only the needed local secrets. No schedule is currently activated by STYX.
