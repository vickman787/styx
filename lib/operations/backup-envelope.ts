import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const MAGIC = Buffer.from("STYX-BACKUP-v1\0");
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
export function backupKey(env: NodeJS.ProcessEnv = process.env) {
  try {
    if (!env.STYX_BACKUP_KEY_FILE) throw Error();
    const key = readFileSync(env.STYX_BACKUP_KEY_FILE);
    if (key.length !== 32) throw Error();
    return key;
  } catch {
    throw Error(
      "Configure STYX_BACKUP_KEY_FILE with a private 32-byte backup key file.",
    );
  }
}
export function createBackupKey(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, randomBytes(32), { flag: "wx", mode: 0o600 });
}
export function encryptedEnvelope(value: Uint8Array) {
  return (
    value.length >= MAGIC.length + 28 &&
    Buffer.from(value).subarray(0, MAGIC.length).equals(MAGIC)
  );
}
export function sealBackup(plaintext: Buffer, key: Buffer) {
  if (key.length !== 32) throw Error("Backup key must be 32 bytes.");
  if (!plaintext.length || plaintext.length > MAX_BACKUP_BYTES)
    throw Error("Backup must be between 1 byte and 64 MiB.");
  const nonce = randomBytes(12),
    header = Buffer.concat([MAGIC, nonce]);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(header);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([header, cipher.getAuthTag(), ciphertext]);
}
export function openBackup(envelope: Buffer, key: Buffer) {
  try {
    if (
      key.length !== 32 ||
      !encryptedEnvelope(envelope) ||
      envelope.length > MAX_BACKUP_BYTES + MAGIC.length + 28
    )
      throw Error();
    const header = envelope.subarray(0, MAGIC.length + 12);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      header.subarray(MAGIC.length),
    );
    decipher.setAAD(header);
    decipher.setAuthTag(envelope.subarray(header.length, header.length + 16));
    return Buffer.concat([
      decipher.update(envelope.subarray(header.length + 16)),
      decipher.final(),
    ]);
  } catch {
    throw Error(
      "Backup authentication failed: wrong key, unsupported format or changed bytes.",
    );
  }
}
