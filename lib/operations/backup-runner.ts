import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { snapshotDatabase } from "../storage/operations.ts";
import { prepareBackup, verifiedArchive } from "./backup-files.ts";
import {
  BackblazeBackup,
  BackblazeUploadError,
  backupObjectName,
  backblazeStatus,
} from "./backblaze.ts";

const recordSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  mode: z.enum(["local", "cloud"]),
  status: z.enum([
    "preparing",
    "local_verified",
    "upload_pending",
    "uploaded",
    "failed",
    "uncertain",
  ]),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().optional(),
  local: z
    .object({
      bytes: z.number().int().positive(),
      records: z.number().int().nonnegative(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .optional(),
  objectName: z
    .string()
    .regex(/^styx-backups\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}\.styxbak$/)
    .optional(),
  fileId: z.string().min(1).max(8192).optional(),
  errorCode: z
    .enum(["preparation_failed", "cloud_blocked", "upload_unconfirmed"])
    .optional(),
});
type Record = z.infer<typeof recordSchema>;
function records(directory: string) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => /^[a-f0-9-]{36}\.json$/.test(name))
    .map((name) =>
      recordSchema.parse(
        JSON.parse(readFileSync(join(directory, name), "utf8")),
      ),
    );
}
function persist(directory: string, record: Record) {
  const path = join(directory, `${record.id}.json`),
    temporary = join(directory, `${record.id}.${randomUUID()}.tmp`);
  writeFileSync(
    temporary,
    JSON.stringify(recordSchema.parse(record), null, 2),
    { flag: "wx", mode: 0o600 },
  );
  renameSync(temporary, path);
}
export async function runBackup(options: {
  root?: string;
  env?: NodeJS.ProcessEnv;
  localOnly: boolean;
  uploader?: Pick<BackblazeBackup, "upload">;
}) {
  const root = options.root || process.cwd(),
    env = options.env || process.env;
  const directory = resolve(root, "data/backup-runs");
  mkdirSync(directory, { recursive: true });
  if (
    !options.localOnly &&
    records(directory).some((record) =>
      ["uncertain", "upload_pending"].includes(record.status),
    )
  )
    throw Error(
      "A prior upload needs operator reconciliation. No new cloud attempt was started.",
    );
  const lock = join(directory, "runner.lock"),
    id = randomUUID();
  let fd: number;
  try {
    fd = openSync(lock, "wx", 0o600);
  } catch {
    throw Error(
      "Backup runner is locked. Inspect the existing process/lock before retrying.",
    );
  }
  writeFileSync(
    fd,
    JSON.stringify({
      id,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    }),
  );
  const record: Record = {
    version: 1,
    id,
    mode: options.localOnly ? "local" : "cloud",
    status: "preparing",
    startedAt: new Date().toISOString(),
  };
  try {
    persist(directory, record);
    const jobDirectory = join(directory, id);
    mkdirSync(jobDirectory);
    const snapshot = join(jobDirectory, "snapshot.sqlite"),
      archive = join(jobDirectory, "backup.styxbak");
    const config: NodeJS.ProcessEnv & { STYX_DB: string } = {
      ...env,
      STYX_DB: resolve(root, env.STYX_DB || "data/styx.sqlite"),
      STYX_BACKUP_KEY_FILE: env.STYX_BACKUP_KEY_FILE
        ? resolve(root, env.STYX_BACKUP_KEY_FILE)
        : undefined,
    };
    await snapshotDatabase(config.STYX_DB, snapshot);
    const verified = await prepareBackup(snapshot, archive, config);
    const envelope = await verifiedArchive(archive, config);
    record.local = {
      bytes: verified.bytes,
      records: verified.recordsCompared,
      sha256: createHash("sha256").update(envelope).digest("hex"),
    };
    record.status = "local_verified";
    unlinkSync(snapshot); // Only this run's newly created plaintext snapshot.
    persist(directory, record);
    if (!options.localOnly) {
      record.objectName = backupObjectName();
      record.status = "upload_pending";
      persist(directory, record); // Durable object identity precedes the network call.
      try {
        if (
          !backblazeStatus(config).configured ||
          config.STYX_B2_ENABLED !== "true"
        )
          throw new BackblazeUploadError(false, record.objectName);
        const result = await (
          options.uploader || new BackblazeBackup(config)
        ).upload(envelope, record.objectName);
        if (
          !result.uploaded ||
          result.objectName !== record.objectName ||
          result.bytes !== envelope.length
        )
          throw new BackblazeUploadError(true, record.objectName);
        record.fileId = result.fileId;
        record.status = "uploaded";
      } catch (error) {
        record.status =
          error instanceof BackblazeUploadError && !error.submitted
            ? "failed"
            : "uncertain";
        record.errorCode =
          record.status === "uncertain"
            ? "upload_unconfirmed"
            : "cloud_blocked";
      }
    }
    record.finishedAt = new Date().toISOString();
    persist(directory, record);
    return record;
  } catch {
    // Preserve pending upload state if disk failure prevents recording confirmation.
    if (record.status !== "upload_pending" && record.status !== "uploaded") {
      record.status = "failed";
      record.errorCode = "preparation_failed";
      record.finishedAt = new Date().toISOString();
      persist(directory, record);
    }
    throw Error(
      "Backup run failed. Inspect its private journal and local files; no automatic retry occurred.",
    );
  } finally {
    closeSync(fd);
    if (JSON.parse(readFileSync(lock, "utf8")).id === id) unlinkSync(lock);
  }
}
export function backupRunStatus(root = process.cwd(), now = Date.now()) {
  const directory = resolve(root, "data/backup-runs");
  try {
    const all = records(directory).sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt),
    );
    const last = all[0],
      lastCloud = all.find((record) => record.mode === "cloud"),
      cloud = all.find((record) => record.status === "uploaded");
    const unresolved = all.some((record) =>
      ["uncertain", "upload_pending"].includes(record.status),
    );
    const locked = existsSync(join(directory, "runner.lock"));
    const age = cloud?.finishedAt ? now - Date.parse(cloud.finishedAt) : null;
    const status =
      unresolved ||
      locked ||
      last?.status === "failed" ||
      last?.status === "preparing" ||
      lastCloud?.status === "failed"
        ? "attention"
        : age === null
          ? "no_cloud_backup"
          : age < -60000 || age > 36 * 3600000
            ? "stale"
            : "fresh";
    return {
      status,
      healthy: status === "fresh",
      latestRunStatus: last?.status || null,
      lastConfirmedUploadAt: cloud?.finishedAt || null,
      unresolvedUpload: unresolved,
      lockPresent: locked,
      scheduleVerified: false,
      alertDeliveryVerified: false,
    };
  } catch {
    return {
      status: "attention",
      healthy: false,
      error: "Backup journal could not be validated.",
      scheduleVerified: false,
      alertDeliveryVerified: false,
    };
  }
}
