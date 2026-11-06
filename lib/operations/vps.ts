import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { accessConfig } from "../../server/access.ts";
import { inspectDatabase } from "../storage/operations.ts";
import { listenerConfig } from "../../server/listener.ts";

/** Fail before opening a listener if a public installation has no usable owners. */
export function verifyVpsStartup(env: NodeJS.ProcessEnv) {
  listenerConfig(env);
  const access = accessConfig(env, Number(env.PORT || 4173));
  if (env.STYX_AUTH_MODE !== "password" || !access.secure)
    throw Error(
      "VPS startup requires password access and an exact HTTPS origin.",
    );
  const hostname = new URL(access.origin).hostname;
  if (
    ["localhost", "127.0.0.1", "[::1]"].includes(hostname) ||
    hostname.endsWith(".invalid") ||
    hostname.endsWith(".example")
  )
    throw Error("Set the actual public STYX domain before VPS startup.");
  if (!env.STYX_DB || !isAbsolute(env.STYX_DB) || !existsSync(env.STYX_DB))
    throw Error(
      "VPS startup requires an existing database at an absolute persistent path.",
    );
  const db = new DatabaseSync(env.STYX_DB, { readOnly: true });
  try {
    inspectDatabase(db);
    const total = db.prepare("SELECT count(*) n FROM workspace").get()!;
    const missing = db
      .prepare(
        `SELECT count(*) n FROM workspace w WHERE NOT EXISTS (
      SELECT 1 FROM membership m JOIN app_user u ON u.id=m.user_id
      WHERE m.workspace_id=w.id AND m.role='owner' AND u.disabled=0
    )`,
      )
      .get()!;
    if (Number(total.n) === 0 || Number(missing.n) !== 0)
      throw Error(
        "Provision an enabled owner for every workspace before VPS startup.",
      );
  } finally {
    db.close();
  }
  return { origin: access.origin, databaseVerified: true };
}
