import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import {
  BackblazeBackup,
  backblazeStatus,
} from "../lib/operations/backblaze.ts";
import {
  createBackupKey,
  sealBackup,
  openBackup,
} from "../lib/operations/backup-envelope.ts";
import {
  prepareBackup,
  recoverEncryptedBackup,
  verifiedArchive,
} from "../lib/operations/backup-files.ts";
import { Store } from "../lib/storage/db.ts";
import { snapshotDatabase } from "../lib/storage/operations.ts";

const env = {
  STYX_B2_ENABLED: "true",
  STYX_B2_KEY_ID: "synthetic-id",
  STYX_B2_APPLICATION_KEY: "synthetic-private-credential",
  STYX_B2_BUCKET_ID: "bucket-one",
  STYX_BACKUP_KEY_FILE: "synthetic-key-path",
};
function mocked(
  change: (step: number, body: any) => any = (_step, body) => body,
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const transport = (async (url: any, init: RequestInit) => {
    calls.push({ url: String(url), init });
    let body: any;
    switch (calls.length) {
      case 1:
        body = {
          accountId: "account",
          authorizationToken: "synthetic-account-token",
          apiInfo: {
            storageApi: {
              apiUrl: "https://api001.backblazeb2.com",
              allowed: {
                buckets: [{ id: "bucket-one" }],
                namePrefix: "styx-backups/",
                capabilities: ["listBuckets", "writeFiles"],
              },
            },
          },
        };
        break;
      case 2:
        body = {
          buckets: [{ bucketId: "bucket-one", bucketType: "allPrivate" }],
        };
        break;
      case 3:
        body = {
          bucketId: "bucket-one",
          authorizationToken: "synthetic-upload-token",
          uploadUrl:
            "https://pod-000-1005-03.backblaze.com/b2api/v4/b2_upload_file?bucket=bucket-one",
        };
        break;
      case 4: {
        const bytes = Buffer.from(init.body as Uint8Array),
          headers = new Headers(init.headers);
        body = {
          fileId: "file-one",
          fileName: decodeURIComponent(headers.get("X-Bz-File-Name")!),
          bucketId: "bucket-one",
          contentLength: bytes.length,
          contentSha1: createHash("sha1").update(bytes).digest("hex"),
          serverSideEncryption: { mode: "SSE-B2", algorithm: "AES256" },
        };
        break;
      }
      default:
        throw Error("Unexpected automatic retry");
    }
    return new Response(JSON.stringify(change(calls.length, body)), {
      status: 200,
    });
  }) as typeof fetch;
  return { calls, transport };
}

test("backup encryption uses random nonces and rejects changed headers, tags, content and wrong keys", () => {
  const key = randomBytes(32),
    plaintext = Buffer.from("synthetic private invoice");
  const first = sealBackup(plaintext, key),
    second = sealBackup(plaintext, key);
  assert.notDeepEqual(first, second);
  assert.ok(!first.includes(plaintext));
  assert.deepEqual(openBackup(first, key), plaintext);
  assert.throws(
    () => openBackup(first, randomBytes(32)),
    /authentication failed/,
  );
  for (const index of [0, 16, 30, first.length - 1]) {
    const changed = Buffer.from(first);
    changed[index] ^= 1;
    assert.throws(() => openBackup(changed, key), /authentication failed/);
  }
  assert.throws(
    () => openBackup(first.subarray(0, 12), key),
    /authentication failed/,
  );
});

test("encrypted SQLite preparation and recovery preserve records, clear sessions and never overwrite", async () => {
  const root = mkdtempSync(join(tmpdir(), "styx-b2-")),
    live = join(root, "live.sqlite");
  const store = new Store(live),
    keyfile = join(root, "private.key"),
    archive = join(root, "backup.styxbak"),
    recovered = join(root, "recovered.sqlite");
  try {
    createBackupKey(keyfile);
    const key = readFileSync(keyfile);
    assert.throws(() => createBackupKey(keyfile));
    assert.deepEqual(readFileSync(keyfile), key);
    store.db
      .prepare("INSERT INTO auth_session VALUES(?,?,?,?,?)")
      .run("synthetic", "local", null, store.workspace, Date.now() + 10000);
    await snapshotDatabase(live, join(root, "snapshot.sqlite"));
    const config = { STYX_BACKUP_KEY_FILE: keyfile, STYX_DB: live };
    assert.equal(
      (await prepareBackup(join(root, "snapshot.sqlite"), archive, config))
        .applicationRecordsMatch,
      true,
    );
    assert.deepEqual(
      await verifiedArchive(archive, config),
      readFileSync(archive),
    );
    await assert.rejects(
      () => prepareBackup(live, join(root, "invalid.styxbak"), config),
      /snapshot first/,
    );
    await assert.rejects(
      () => prepareBackup(join(root, "snapshot.sqlite"), archive, config),
      /new file/,
    );
    assert.equal(
      (await recoverEncryptedBackup(archive, recovered, config)).recovered,
      true,
    );
    const db = new DatabaseSync(recovered, { readOnly: true });
    try {
      assert.equal(
        db.prepare("SELECT count(*) n FROM auth_session").get()!.n,
        0,
      );
      assert.equal(
        db.prepare("SELECT sum(amount) n FROM ledger").get()!.n,
        10000,
      );
    } finally {
      db.close();
    }
    await assert.rejects(
      () => recoverEncryptedBackup(archive, recovered, config),
      /new file/,
    );
    const wrong = join(root, "wrong.key");
    createBackupKey(wrong);
    await assert.rejects(
      () =>
        recoverEncryptedBackup(archive, join(root, "wrong.sqlite"), {
          STYX_BACKUP_KEY_FILE: wrong,
        }),
      /authentication failed/,
    );
    assert.equal(existsSync(join(root, "wrong.sqlite")), false);
    assert.equal(
      store.db.prepare("SELECT count(*) n FROM auth_session").get()!.n,
      1,
    );
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("disabled or missing Backblaze configuration never sends a request or reveals credentials", async () => {
  const fixture = mocked(),
    envelope = sealBackup(Buffer.from("fixture"), randomBytes(32));
  await assert.rejects(
    () => new BackblazeBackup({}, fixture.transport).check(),
    /connection failed/,
  );
  await assert.rejects(
    () =>
      new BackblazeBackup(
        { ...env, STYX_B2_ENABLED: "false" },
        fixture.transport,
      ).upload(envelope),
    /disabled/,
  );
  assert.equal(fixture.calls.length, 0);
  assert.ok(
    !JSON.stringify(backblazeStatus(env)).includes(env.STYX_B2_APPLICATION_KEY),
  );
});

test("mocked B2 upload sends only encrypted bytes with provider checksum and encryption headers", async () => {
  const fixture = mocked(),
    envelope = sealBackup(
      Buffer.from("private fixture document"),
      randomBytes(32),
    );
  const result = await new BackblazeBackup(env, fixture.transport).upload(
    envelope,
  );
  assert.equal(result.uploaded, true);
  assert.equal(fixture.calls.length, 4);
  assert.deepEqual(
    Buffer.from(fixture.calls[3].init.body as Uint8Array),
    envelope,
  );
  const headers = new Headers(fixture.calls[3].init.headers);
  assert.equal(headers.get("Content-Length"), String(envelope.length));
  assert.equal(headers.get("X-Bz-Server-Side-Encryption"), "AES256");
  assert.match(
    result.objectName,
    /^styx-backups\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]+\.styxbak$/,
  );
  assert.ok(fixture.calls.every((call) => call.init.redirect === "error"));
  assert.ok(!JSON.stringify(result).includes(env.STYX_B2_APPLICATION_KEY));
});

test("unrestricted/wrong-bucket keys, broad prefixes, missing capabilities and public buckets block backup bytes", async () => {
  for (let variant = 0; variant < 6; variant++) {
    const fixture = mocked((step, body) => {
      if (step === 1) {
        const allowed = body.apiInfo.storageApi.allowed;
        if (variant === 0) allowed.buckets = null;
        if (variant === 1) allowed.buckets[0].id = "wrong-bucket";
        if (variant === 2) allowed.namePrefix = null;
        if (variant === 3) allowed.capabilities = ["writeFiles"];
        if (variant === 4) allowed.capabilities.push("deleteBuckets");
      }
      if (step === 2 && variant === 5) body.buckets[0].bucketType = "allPublic";
      return body;
    });
    await assert.rejects(
      () =>
        new BackblazeBackup(env, fixture.transport).upload(
          sealBackup(Buffer.from("fixture"), randomBytes(32)),
        ),
      /blocked before sending/,
    );
    assert.ok(fixture.calls.length <= 2);
  }
});

test("untrusted API/upload hosts cannot receive authentication or backup content", async () => {
  for (const url of [
    "https://attacker.example/",
    "http://api001.backblazeb2.com/",
    "https://api001.backblazeb2.com.attacker.example/",
  ]) {
    const fixture = mocked((step, body) => {
      if (step === 1) body.apiInfo.storageApi.apiUrl = url;
      return body;
    });
    await assert.rejects(
      () => new BackblazeBackup(env, fixture.transport).check(),
      /connection failed/,
    );
    assert.equal(fixture.calls.length, 1);
  }
  const fixture = mocked((step, body) => {
    if (step === 3) body.uploadUrl = "https://attacker.example/upload";
    return body;
  });
  await assert.rejects(
    () =>
      new BackblazeBackup(env, fixture.transport).upload(
        sealBackup(Buffer.from("fixture"), randomBytes(32)),
      ),
    /blocked before sending/,
  );
  assert.equal(fixture.calls.length, 3);
});

test("unconfirmed provider metadata never becomes upload success and never automatically retries", async () => {
  for (let variant = 0; variant < 4; variant++) {
    const fixture = mocked((step, body) => {
      if (step === 4) {
        if (variant === 0) body.contentSha1 = "incorrect";
        if (variant === 1) body.bucketId = "wrong";
        if (variant === 2) body.contentLength++;
        if (variant === 3) throw Error(env.STYX_B2_APPLICATION_KEY);
      }
      return body;
    });
    try {
      await new BackblazeBackup(env, fixture.transport).upload(
        sealBackup(Buffer.from("fixture"), randomBytes(32)),
      );
      assert.fail("unconfirmed upload succeeded");
    } catch (error) {
      assert.match((error as Error).message, /not confirmed/);
      assert.ok(
        !(error as Error).message.includes(env.STYX_B2_APPLICATION_KEY),
      );
    }
    assert.equal(fixture.calls.length, 4);
  }
});
