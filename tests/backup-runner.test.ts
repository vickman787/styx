import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../lib/storage/db.ts";
import {
  createBackupKey,
  openBackup,
} from "../lib/operations/backup-envelope.ts";
import { BackblazeUploadError } from "../lib/operations/backblaze.ts";
import { runBackup, backupRunStatus } from "../lib/operations/backup-runner.ts";

async function fixture(
  fn: (root: string, env: NodeJS.ProcessEnv) => Promise<void>,
) {
  const root = mkdtempSync(join(tmpdir(), "styx-runner-")),
    store = new Store(join(root, "live.sqlite"));
  createBackupKey(join(root, "private.key"));
  try {
    await fn(root, {
      STYX_DB: "live.sqlite",
      STYX_BACKUP_KEY_FILE: "private.key",
      STYX_B2_ENABLED: "true",
      STYX_B2_KEY_ID: "test-id",
      STYX_B2_APPLICATION_KEY: "synthetic-secret-do-not-log",
      STYX_B2_BUCKET_ID: "test-bucket",
    });
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
}
function confirmed(bytes: Buffer, name?: string) {
  return {
    uploaded: true,
    fileId: "synthetic-file-id",
    objectName: name!,
    bytes: bytes.length,
    clientEncryption: "AES-256-GCM",
    serverEncryption: "SSE-B2/AES256",
  };
}

test("local runner retains an authenticated encrypted backup and cannot report cloud health", async () => {
  await fixture(async (root, env) => {
    const record = await runBackup({ root, env, localOnly: true });
    assert.equal(record.status, "local_verified");
    const folder = join(root, "data/backup-runs", record.id);
    assert.equal(existsSync(join(folder, "snapshot.sqlite")), false);
    const plaintext = openBackup(
      readFileSync(join(folder, "backup.styxbak")),
      readFileSync(join(root, "private.key")),
    );
    assert.ok(
      plaintext.subarray(0, 16).toString().startsWith("SQLite format 3"),
    );
    assert.equal(backupRunStatus(root).healthy, false);
    assert.equal(backupRunStatus(root).status, "no_cloud_backup");
    assert.ok(!JSON.stringify(record).includes(env.STYX_B2_APPLICATION_KEY!));
  });
});

test("cloud runner persists its object identity before submission and records only confirmed uploads", async () => {
  await fixture(async (root, env) => {
    const record = await runBackup({
      root,
      env,
      localOnly: false,
      uploader: {
        upload: async (bytes, name) => {
          const directory = join(root, "data/backup-runs");
          const path = readdirSync(directory).find((file) =>
            file.endsWith(".json"),
          )!;
          const pending = JSON.parse(
            readFileSync(join(directory, path), "utf8"),
          );
          assert.equal(pending.status, "upload_pending");
          assert.equal(pending.objectName, name);
          return confirmed(bytes, name);
        },
      },
    });
    assert.equal(record.status, "uploaded");
    assert.equal(backupRunStatus(root).status, "fresh");
    assert.equal(backupRunStatus(root).scheduleVerified, false);
    assert.equal(existsSync(join(root, "data/backup-runs/runner.lock")), false);
  });
});

test("uncertain uploads block new cloud runs; a subsequent local success cannot hide the problem", async () => {
  await fixture(async (root, env) => {
    let calls = 0;
    const uploader = {
      upload: async (_bytes: Buffer, name?: string) => {
        calls++;
        throw new BackblazeUploadError(true, name!);
      },
    };
    const uncertain = await runBackup({
      root,
      env,
      localOnly: false,
      uploader,
    });
    assert.equal(uncertain.status, "uncertain");
    await assert.rejects(
      () => runBackup({ root, env, localOnly: false, uploader }),
      /reconciliation/,
    );
    await runBackup({ root, env, localOnly: true });
    assert.equal(calls, 1);
    assert.equal(backupRunStatus(root).status, "attention");
    assert.equal(backupRunStatus(root).unresolvedUpload, true);
  });
});

test("a pre-submission failure is redacted, does not falsely confirm backup, and allows a new safe attempt", async () => {
  await fixture(async (root, env) => {
    const failed = await runBackup({
      root,
      env: { ...env, STYX_B2_ENABLED: "false" },
      localOnly: false,
    });
    assert.equal(failed.status, "failed");
    assert.equal(failed.errorCode, "cloud_blocked");
    await runBackup({ root, env, localOnly: true });
    assert.equal(backupRunStatus(root).status, "attention");
    await runBackup({
      root,
      env,
      localOnly: false,
      uploader: { upload: async (bytes, name) => confirmed(bytes, name) },
    });
    assert.equal(backupRunStatus(root).status, "fresh");
  });
});

test("concurrent attempts are locked while the existing run completes", async () => {
  await fixture(async (root, env) => {
    let release!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    const first = runBackup({
      root,
      env,
      localOnly: false,
      uploader: {
        upload: async (bytes, name) => {
          await gate;
          return confirmed(bytes, name);
        },
      },
    });
    await assert.rejects(
      () => runBackup({ root, env, localOnly: true }),
      /locked/,
    );
    release();
    assert.equal((await first).status, "uploaded");
  });
});

test("stale or invalid journals fail health checks and preparation errors leave no active lock", async () => {
  await fixture(async (root, env) => {
    const result = await runBackup({
      root,
      env,
      localOnly: false,
      uploader: { upload: async (bytes, name) => confirmed(bytes, name) },
    });
    assert.equal(
      backupRunStatus(root, Date.now() + 37 * 3600000).status,
      "stale",
    );
    const journal = join(root, "data/backup-runs", `${result.id}.json`);
    writeFileSync(journal, "invalid private journal");
    assert.equal(backupRunStatus(root).status, "attention");
    assert.ok(
      !JSON.stringify(backupRunStatus(root)).includes(
        "invalid private journal",
      ),
    );
    await assert.rejects(
      () =>
        runBackup({
          root,
          env: { ...env, STYX_BACKUP_KEY_FILE: "missing.key" },
          localOnly: true,
        }),
      /run failed/,
    );
    assert.equal(existsSync(join(root, "data/backup-runs/runner.lock")), false);
  });
});
