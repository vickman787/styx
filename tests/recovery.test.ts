import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, linkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../lib/storage/db.ts";
import { Service } from "../lib/domain/service.ts";
import { snapshotDatabase } from "../lib/storage/operations.ts";
import {
  rehearseRecovery,
  verifyRecoveredDatabase,
} from "../lib/storage/recovery.ts";

async function fixture(fn: (root: string, store: Store) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "styx-drill-test-"));
  const store = new Store(join(root, "live.sqlite"));
  try {
    new Service(store).seed();
    store.db
      .prepare("INSERT INTO auth_session VALUES(?,?,?,?,?)")
      .run(
        "synthetic-token-hash",
        "local",
        null,
        store.workspace,
        Date.now() + 10000,
      );
    store.db
      .prepare("INSERT INTO auth_attempt VALUES(?,?,?)")
      .run("fixture", 2, Date.now() + 10000);
    await snapshotDatabase(
      join(root, "live.sqlite"),
      join(root, "backup.sqlite"),
    );
    await snapshotDatabase(
      join(root, "backup.sqlite"),
      join(root, "restored.sqlite"),
      true,
    );
    await fn(root, store);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
}

test("real seeded private job records survive a full recovery drill while live sessions stay valid", async () => {
  await fixture(async (root, store) => {
    const result = await rehearseRecovery(join(root, "backup.sqlite"));
    assert.equal(result.applicationRecordsMatch, true);
    assert.equal(result.sessionsCleared, true);
    assert.ok(result.recordsCompared > 30);
    assert.ok(result.tablesCompared >= 18);
    assert.equal(
      store.db.prepare("SELECT count(*) n FROM auth_session").get()!.n,
      1,
    );
    assert.equal(
      store.db.prepare("SELECT count(*) n FROM auth_attempt").get()!.n,
      1,
    );
    assert.ok(!JSON.stringify(result).includes("invoice_id"));
  });
});

test("a same-row-count change in restored private job bytes or ledger balances fails verification", async () => {
  await fixture(async (root) => {
    const path = join(root, "restored.sqlite");
    let db = new DatabaseSync(path);
    db.exec("UPDATE ledger SET amount=amount+1");
    db.close();
    assert.throws(
      () => verifyRecoveredDatabase(join(root, "backup.sqlite"), path),
      /do not match/,
    );
    await snapshotDatabase(
      join(root, "backup.sqlite"),
      join(root, "another.sqlite"),
      true,
    );
    db = new DatabaseSync(join(root, "another.sqlite"));
    db.exec("UPDATE job SET payload='{}'");
    db.close();
    assert.throws(
      () =>
        verifyRecoveredDatabase(
          join(root, "backup.sqlite"),
          join(root, "another.sqlite"),
        ),
      /do not match/,
    );
  });
});

test("matching application records cannot hide resurrected sessions or throttles", async () => {
  await fixture(async (root) => {
    for (const table of ["auth_session", "auth_attempt"]) {
      const db = new DatabaseSync(join(root, "restored.sqlite"));
      db.exec(
        table === "auth_session"
          ? "INSERT INTO auth_session VALUES('old','local',NULL,'acme-local',9999999999999)"
          : "INSERT INTO auth_attempt VALUES('old',1,9999999999999)",
      );
      db.close();
      assert.throws(
        () =>
          verifyRecoveredDatabase(
            join(root, "backup.sqlite"),
            join(root, "restored.sqlite"),
          ),
        /not cleared/,
      );
      const clear = new DatabaseSync(join(root, "restored.sqlite"));
      clear.exec(`DELETE FROM ${table}`);
      clear.close();
    }
  });
});

test("recovery drill refuses live-file aliases and does not create a missing source", async () => {
  await fixture(async (root) => {
    const path = join(root, "backup.sqlite");
    assert.throws(() => verifyRecoveredDatabase(path, path), /separate/);
    linkSync(path, join(root, "alias.sqlite"));
    assert.throws(
      () => verifyRecoveredDatabase(path, join(root, "alias.sqlite")),
      /separate/,
    );
    await assert.rejects(
      () => rehearseRecovery(join(root, "missing.sqlite")),
      /does not exist/,
    );
    assert.equal(existsSync(join(root, "missing.sqlite")), false);
  });
});
