import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inspectDatabase, snapshotDatabase } from "./operations.ts";

function contents(db: DatabaseSync) {
  const tables = db
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name",
    )
    .all();
  const hash = createHash("sha256");
  let records = 0;
  let compared = 0;
  for (const table of tables) {
    const name = String(table.name);
    if (["auth_session", "auth_attempt"].includes(name)) continue;
    compared++;
    const quoted = '"' + name.replaceAll('"', '""') + '"';
    const statement = db.prepare(`SELECT * FROM ${quoted}`);
    statement.setReadBigInts(true);
    // Sort encoded rows so physical row order/VACUUM cannot change the result.
    const rows = statement
      .all()
      .map((row) =>
        JSON.stringify(row, (_key, value) =>
          typeof value === "bigint" ? { integer: value.toString() } : value,
        ),
      )
      .sort();
    hash.update(JSON.stringify([name, table.sql, rows]));
    records += rows.length;
  }
  return { digest: hash.digest("hex"), tables: compared, records };
}

/** Compare stable snapshots, never the actively changing production database. */
export function verifyRecoveredDatabase(snapshot: string, recovered: string) {
  if (resolve(snapshot) === resolve(recovered))
    throw Error("Recovery verification requires a separate database.");
  const a = statSync(snapshot),
    b = statSync(recovered);
  if (a.dev === b.dev && a.ino === b.ino)
    throw Error("Recovery verification requires a separate database.");
  const original = new DatabaseSync(snapshot, { readOnly: true });
  let restored: DatabaseSync | undefined;
  try {
    restored = new DatabaseSync(recovered, { readOnly: true });
    inspectDatabase(original);
    inspectDatabase(restored);
    const before = contents(original),
      after = contents(restored);
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw Error("Recovered application records do not match the backup.");
    for (const table of ["auth_session", "auth_attempt"])
      if (
        Number(restored.prepare(`SELECT count(*) n FROM ${table}`).get()!.n) !==
        0
      )
        throw Error(
          "Recovered authentication sessions or throttles were not cleared.",
        );
    return {
      verifiedAt: new Date().toISOString(),
      applicationRecordsMatch: true,
      sessionsCleared: true,
      tablesCompared: after.tables,
      recordsCompared: after.records,
    };
  } finally {
    original.close();
    restored?.close();
  }
}

export async function rehearseRecovery(snapshot: string) {
  const directory = mkdtempSync(join(tmpdir(), "styx-recovery-drill-"));
  try {
    const recovered = join(directory, "recovered.sqlite");
    await snapshotDatabase(snapshot, recovered, true);
    return verifyRecoveredDatabase(snapshot, recovered);
  } finally {
    // Only this function's newly created temporary directory is removed.
    rmSync(directory, { recursive: true, force: true });
  }
}
