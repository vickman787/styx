import { backup, DatabaseSync } from "node:sqlite";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

export function inspectDatabase(db: DatabaseSync) {
  const integrity = db.prepare("PRAGMA integrity_check").all();
  if (integrity.length !== 1 || Object.values(integrity[0])[0] !== "ok")
    throw new Error("Database integrity check failed.");
  if (db.prepare("PRAGMA foreign_key_check").all().length)
    throw new Error("Database foreign-key check failed.");
  const version = Number(db.prepare("PRAGMA user_version").get()!.user_version);
  if (version !== 3)
    throw new Error("Expected STYX database schema version 3.");
  // Check core tables without migrating, seeding or modifying the source.
  for (const table of [
    "workspace",
    "job",
    "ledger",
    "auth_session",
    "auth_attempt",
    "near_intent",
  ])
    db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get();
  return { schemaVersion: version };
}

/** SQLite's online backup API includes committed WAL contents. Never overwrite a target. */
export async function snapshotDatabase(
  source: string,
  destination: string,
  restore = false,
) {
  const input = resolve(source),
    output = resolve(destination);
  if (!existsSync(input)) throw new Error("Source database does not exist.");
  if (input === output || existsSync(output))
    throw new Error("Destination must be a new file.");
  mkdirSync(dirname(output), { recursive: true });
  const staging = mkdtempSync(join(dirname(output), ".styx-snapshot-"));
  const staged = join(staging, "snapshot.sqlite");
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(input, { readOnly: true });
    inspectDatabase(db);
    await backup(db, staged);
    db.close();
    db = undefined;
    const copy = new DatabaseSync(staged);
    try {
      if (restore) {
        // A recovery must not resurrect old login cookies or stale login throttles.
        copy.exec(
          "BEGIN IMMEDIATE; DELETE FROM auth_session; DELETE FROM auth_attempt; COMMIT;",
        );
      }
      inspectDatabase(copy);
      copy.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {
      copy.close();
    }
    chmodSync(staged, 0o600);
    // Same-volume hard link publishes a completed snapshot atomically; EEXIST never replaces.
    linkSync(staged, output);
    return { path: output, schemaVersion: 3, sessionsCleared: restore };
  } finally {
    db?.close();
    rmSync(staging, { recursive: true, force: true });
  }
}
