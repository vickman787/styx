import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  statSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  backupKey,
  MAX_BACKUP_BYTES,
  openBackup,
  sealBackup,
} from "./backup-envelope.ts";
import { rehearseRecovery } from "../storage/recovery.ts";
import { snapshotDatabase } from "../storage/operations.ts";

function boundedFile(path: string, overhead = 0) {
  if (statSync(path).size > MAX_BACKUP_BYTES + overhead)
    throw Error("This backup tool supports at most 64 MiB per file.");
  return readFileSync(path);
}
async function withPlaintext<T>(
  value: Buffer,
  run: (path: string) => Promise<T>,
) {
  const directory = mkdtempSync(join(tmpdir(), "styx-encrypted-drill-"));
  try {
    const path = join(directory, "snapshot.sqlite");
    writeFileSync(path, value, { flag: "wx", mode: 0o600 });
    return await run(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
export async function prepareBackup(
  input: string,
  output: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (existsSync(output))
    throw Error("Encrypted backup destination must be a new file.");
  const source = statSync(input),
    live = env.STYX_DB || "data/styx.sqlite";
  if (existsSync(live)) {
    const active = statSync(live);
    if (source.dev === active.dev && source.ino === active.ino)
      throw Error(
        "Create a snapshot first; do not encrypt the live SQLite file directly.",
      );
  }
  const key = backupKey(env),
    plaintext = boundedFile(input);
  const verification = await withPlaintext(plaintext, rehearseRecovery);
  const envelope = sealBackup(plaintext, key);
  // Authenticate the exact output bytes before retaining them.
  if (!openBackup(envelope, key).equals(plaintext))
    throw Error("Encryption round trip failed.");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, envelope, { flag: "wx", mode: 0o600 });
  return { encrypted: true, bytes: envelope.length, ...verification };
}
export async function verifiedArchive(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const envelope = boundedFile(path, 128),
    plaintext = openBackup(envelope, backupKey(env));
  await withPlaintext(plaintext, rehearseRecovery);
  return envelope;
}
export async function recoverEncryptedBackup(
  input: string,
  output: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (resolve(input) === resolve(output) || existsSync(output))
    throw Error("Recovery destination must be a new file.");
  const plaintext = openBackup(boundedFile(input, 128), backupKey(env));
  return await withPlaintext(plaintext, async (snapshot) => {
    const verified = await rehearseRecovery(snapshot);
    await snapshotDatabase(snapshot, output, true);
    return { recovered: true, ...verified };
  });
}
