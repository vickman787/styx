import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { encryptedEnvelope, MAX_BACKUP_BYTES } from "./backup-envelope.ts";

const PREFIX = "styx-backups/";
export function backupObjectName() {
  return `${PREFIX}${new Date().toISOString().slice(0, 10)}/${randomUUID()}.styxbak`;
}
export class BackblazeUploadError extends Error {
  constructor(
    public submitted: boolean,
    public objectName: string,
  ) {
    super(
      submitted
        ? `Backblaze upload was not confirmed. Inspect ${objectName} before retrying; no automatic retry occurred.`
        : "Backblaze upload blocked before sending backup bytes. Check private bucket, restricted key and configuration; details were redacted.",
    );
  }
}
const text = z.string().min(1).max(8192);
const authorization = z.object({
  accountId: text,
  authorizationToken: text,
  apiInfo: z.object({
    storageApi: z.object({
      apiUrl: text,
      allowed: z.object({
        buckets: z.array(z.object({ id: text })).nullable(),
        capabilities: z.array(text),
        namePrefix: z.string().nullable(),
      }),
    }),
  }),
});
export function backblazeStatus(env: NodeJS.ProcessEnv = process.env) {
  const missing = [
    "STYX_B2_KEY_ID",
    "STYX_B2_APPLICATION_KEY",
    "STYX_B2_BUCKET_ID",
    "STYX_BACKUP_KEY_FILE",
  ].filter((key) => !env[key]?.trim());
  return {
    enabled: env.STYX_B2_ENABLED === "true",
    configured: missing.length === 0,
    missing,
    connected: false,
    prefix: PREFIX,
  };
}
function trustedUrl(raw: string, kind: "api" | "upload") {
  const url = new URL(raw);
  const host =
    kind === "api"
      ? /^api[a-z0-9-]*\.backblazeb2\.com$/
      : /^pod-[a-z0-9-]+\.(?:backblaze\.com|backblazeb2\.com)$/;
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !host.test(url.hostname)
  )
    throw Error();
  if (kind === "api" && (url.pathname !== "/" || url.search)) throw Error();
  if (
    kind === "upload" &&
    !/^\/b2api\/v[234]\/b2_upload_file(?:\/|$)/.test(url.pathname)
  )
    throw Error();
  return url;
}
export class BackblazeBackup {
  constructor(
    private env: NodeJS.ProcessEnv = process.env,
    private transport: typeof fetch = fetch,
  ) {}
  private async request(url: string | URL, init: RequestInit = {}) {
    const response = await this.transport(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Error();
    }
    const reader = response.body?.getReader();
    if (!reader) throw Error();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 131072) throw Error();
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  private async connect() {
    if (!backblazeStatus(this.env).configured) throw Error();
    const auth = authorization.parse(
      await this.request(
        "https://api.backblazeb2.com/b2api/v4/b2_authorize_account",
        {
          headers: {
            Authorization:
              "Basic " +
              Buffer.from(
                `${this.env.STYX_B2_KEY_ID}:${this.env.STYX_B2_APPLICATION_KEY}`,
              ).toString("base64"),
          },
        },
      ),
    );
    const storage = auth.apiInfo.storageApi,
      allowed = storage.allowed;
    if (
      allowed.buckets?.length !== 1 ||
      allowed.buckets[0].id !== this.env.STYX_B2_BUCKET_ID ||
      allowed.namePrefix !== PREFIX
    )
      throw Error();
    if (
      !["listBuckets", "writeFiles"].every((capability) =>
        allowed.capabilities.includes(capability),
      )
    )
      throw Error();
    if (
      ["writeBuckets", "deleteBuckets", "writeKeys", "deleteKeys", "all"].some(
        (capability) => allowed.capabilities.includes(capability),
      )
    )
      throw Error();
    const api = trustedUrl(storage.apiUrl, "api"),
      headers = {
        Authorization: auth.authorizationToken,
        "content-type": "application/json",
      };
    const buckets = z
      .object({
        buckets: z.array(z.object({ bucketId: text, bucketType: text })),
      })
      .parse(
        await this.request(new URL("/b2api/v4/b2_list_buckets", api), {
          method: "POST",
          headers,
          body: JSON.stringify({
            accountId: auth.accountId,
            bucketId: this.env.STYX_B2_BUCKET_ID,
          }),
        }),
      );
    if (
      buckets.buckets.length !== 1 ||
      buckets.buckets[0].bucketId !== this.env.STYX_B2_BUCKET_ID ||
      buckets.buckets[0].bucketType !== "allPrivate"
    )
      throw Error();
    return { api, headers };
  }
  async check() {
    try {
      await this.connect();
      return {
        connected: true,
        privateBucket: true,
        restrictedKey: true,
        uploaded: false,
      };
    } catch {
      throw Error(
        "Backblaze connection failed. Check the restricted bucket/prefix key, private bucket and configuration; provider details were redacted.",
      );
    }
  }
  async upload(envelope: Buffer, objectName = backupObjectName()) {
    if (
      !/^styx-backups\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}\.styxbak$/.test(
        objectName,
      )
    )
      throw Error("Invalid backup object name.");
    if (this.env.STYX_B2_ENABLED !== "true")
      throw Error(
        "Backblaze uploads are disabled. Set STYX_B2_ENABLED=true explicitly.",
      );
    if (
      !encryptedEnvelope(envelope) ||
      envelope.length > MAX_BACKUP_BYTES + 128
    )
      throw Error("Only a bounded encrypted STYX backup can be uploaded.");
    let submitted = false;
    try {
      const { api, headers } = await this.connect();
      const destination = z
        .object({ bucketId: text, uploadUrl: text, authorizationToken: text })
        .parse(
          await this.request(new URL("/b2api/v4/b2_get_upload_url", api), {
            method: "POST",
            headers,
            body: JSON.stringify({ bucketId: this.env.STYX_B2_BUCKET_ID }),
          }),
        );
      if (destination.bucketId !== this.env.STYX_B2_BUCKET_ID) throw Error();
      const url = trustedUrl(destination.uploadUrl, "upload");
      const sha1 = createHash("sha1").update(envelope).digest("hex");
      submitted = true;
      const result = z
        .object({
          fileId: text,
          fileName: text,
          bucketId: text,
          contentLength: z.number(),
          contentSha1: text,
          serverSideEncryption: z.object({
            mode: z.literal("SSE-B2"),
            algorithm: z.literal("AES256"),
          }),
        })
        .parse(
          await this.request(url, {
            method: "POST",
            headers: {
              Authorization: destination.authorizationToken,
              "Content-Type": "application/octet-stream",
              "Content-Length": String(envelope.length),
              "X-Bz-File-Name": encodeURIComponent(objectName),
              "X-Bz-Content-Sha1": sha1,
              "X-Bz-Server-Side-Encryption": "AES256",
            },
            body: new Uint8Array(envelope),
          }),
        );
      if (
        result.bucketId !== this.env.STYX_B2_BUCKET_ID ||
        result.fileName !== objectName ||
        result.contentLength !== envelope.length ||
        result.contentSha1 !== sha1
      )
        throw Error();
      return {
        uploaded: true,
        fileId: result.fileId,
        objectName,
        bytes: envelope.length,
        clientEncryption: "AES-256-GCM",
        serverEncryption: "SSE-B2/AES256",
      };
    } catch {
      throw new BackblazeUploadError(submitted, objectName);
    }
  }
}
