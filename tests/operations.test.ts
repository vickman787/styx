import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { Store } from "../lib/storage/db.ts";
import { snapshotDatabase } from "../lib/storage/operations.ts";
import { healthRouter } from "../server/health.ts";

test("online backup captures committed WAL data and restore preserves records but revokes sessions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "styx-recovery-"));
  const store = new Store(join(dir, "live.sqlite"));
  try {
    store.db.exec("PRAGMA journal_mode=WAL");
    store.db
      .prepare("UPDATE workspace SET name=? WHERE id=?")
      .run("Recovery evidence", store.workspace);
    store.db
      .prepare("INSERT INTO auth_session VALUES(?,?,?,?,?)")
      .run(
        "old-cookie-hash",
        "local",
        null,
        store.workspace,
        Date.now() + 10000,
      );
    store.db
      .prepare("INSERT INTO auth_attempt VALUES(?,?,?)")
      .run("ip", 2, Date.now() + 10000);
    const balance = store.balance();
    await snapshotDatabase(
      join(dir, "live.sqlite"),
      join(dir, "backup.sqlite"),
    );
    store.db.prepare("UPDATE workspace SET name='After backup'").run();
    await snapshotDatabase(
      join(dir, "backup.sqlite"),
      join(dir, "recovered.sqlite"),
      true,
    );
    const recovered = new Store(join(dir, "recovered.sqlite"));
    try {
      assert.equal(
        recovered.db.prepare("SELECT name FROM workspace").get()!.name,
        "Recovery evidence",
      );
      assert.deepEqual(recovered.balance(), balance);
      assert.equal(
        recovered.db.prepare("SELECT count(*) n FROM auth_session").get()!.n,
        0,
      );
      assert.equal(
        recovered.db.prepare("SELECT count(*) n FROM auth_attempt").get()!.n,
        0,
      );
    } finally {
      recovered.close();
    }
    assert.equal(
      store.db.prepare("SELECT count(*) n FROM auth_session").get()!.n,
      1,
    );
    assert.ok(
      !readdirSync(dir).some((name) => name.startsWith(".styx-snapshot-")),
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("backup refuses missing sources and existing targets without changing their bytes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "styx-recovery-"));
  const store = new Store(join(dir, "live.sqlite"));
  try {
    const target = join(dir, "keep.sqlite");
    writeFileSync(target, "keep me");
    await assert.rejects(
      () => snapshotDatabase(join(dir, "live.sqlite"), target),
      /new file/,
    );
    assert.equal(readFileSync(target, "utf8"), "keep me");
    await assert.rejects(
      () =>
        snapshotDatabase(join(dir, "missing.sqlite"), join(dir, "new.sqlite")),
      /does not exist/,
    );
    await assert.rejects(
      () =>
        snapshotDatabase(join(dir, "live.sqlite"), join(dir, "live.sqlite")),
      /new file/,
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invalid and unsupported databases never publish a recovery file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "styx-recovery-"));
  try {
    writeFileSync(join(dir, "corrupt.sqlite"), "not SQLite");
    await assert.rejects(() =>
      snapshotDatabase(
        join(dir, "corrupt.sqlite"),
        join(dir, "out.sqlite"),
        true,
      ),
    );
    const unsupported = new DatabaseSync(join(dir, "other.sqlite"));
    unsupported.exec("PRAGMA user_version=99");
    unsupported.close();
    await assert.rejects(
      () =>
        snapshotDatabase(
          join(dir, "other.sqlite"),
          join(dir, "out.sqlite"),
          true,
        ),
      /schema version/,
    );
    assert.deepEqual(readdirSync(dir).sort(), [
      "corrupt.sqlite",
      "other.sqlite",
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("health endpoints need no login, redact failures, disable caching and distinguish readiness", async () => {
  const db = new Store(":memory:");
  const app = express();
  app.use("/health", healthRouter(db.db));
  app.use(
    "/missing-build",
    healthRouter(db.db, join(tmpdir(), "styx-no-build", "index.html")),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const ready = await fetch(base + "/health/ready");
    assert.equal(ready.status, 200);
    assert.equal(ready.headers.get("cache-control"), "no-store");
    assert.deepEqual(await ready.json(), { status: "ready" });
    assert.equal((await fetch(base + "/missing-build/ready")).status, 503);
    db.close();
    const failed = await fetch(base + "/health/ready");
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { status: "unavailable" });
    assert.equal((await fetch(base + "/health/live")).status, 200);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
