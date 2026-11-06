import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { accessConfig } from "../../server/access.ts";
import { nearConfig } from "../settlement/near-config.ts";
import { inspectDatabase } from "../storage/operations.ts";
import { backblazeStatus } from "./backblaze.ts";
import { backupKey } from "./backup-envelope.ts";
import { listenerConfig } from "../../server/listener.ts";

type Check = {
  id: string;
  status: "pass" | "fail" | "disabled";
  message: string;
};
export function deploymentCheck(options: {
  env?: NodeJS.ProcessEnv;
  root?: string;
  backup?: string;
  local?: boolean;
  now?: number;
}) {
  const env = options.env || process.env,
    root = options.root || process.cwd();
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, message: string) =>
    checks.push({ id, status: ok ? "pass" : "fail", message });
  add(
    "node",
    Number(process.versions.node.split(".")[0]) >= 24,
    "Node 24 or later is required.",
  );
  add(
    "build",
    existsSync(resolve(root, "dist/index.html")),
    "Production frontend build must exist.",
  );
  let accessValid = false;
  try {
    const port = Number(env.PORT || 4173);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error();
    const access = accessConfig(env, port);
    accessValid = Boolean(
      options.local ||
      (access.mode === "password" &&
        access.secure &&
        !["localhost", "127.0.0.1"].includes(new URL(access.origin).hostname)),
    );
  } catch {
    /* Never echo environment values or parser errors. */
  }
  add(
    "access",
    accessValid,
    options.local
      ? "Access configuration must be valid for a private local run."
      : "Public operation requires password mode and an exact public HTTPS origin.",
  );
  let listenerValid = false;
  try {
    listenerConfig(env);
    listenerValid = true;
  } catch {
    /* Generic diagnostics only. */
  }
  add(
    "listener",
    listenerValid,
    "Use loopback, or explicit password/HTTPS container mode behind the private reverse-proxy network.",
  );
  add(
    "execution-mode",
    !env.STYX_MODE || env.STYX_MODE === "local",
    "Financial execution mode must remain local; live testnet uses its separate console.",
  );
  let db: DatabaseSync | undefined;
  let databaseValid = false,
    ownersValid = false;
  try {
    const path = resolve(root, env.STYX_DB || "data/styx.sqlite");
    if (!existsSync(path)) throw Error();
    db = new DatabaseSync(path, { readOnly: true });
    inspectDatabase(db);
    databaseValid = true;
    const missing = db
      .prepare(
        `SELECT count(*) n FROM workspace w WHERE NOT EXISTS (
      SELECT 1 FROM membership m JOIN app_user u ON u.id=m.user_id
      WHERE m.workspace_id=w.id AND m.role='owner' AND u.disabled=0
    )`,
      )
      .get()!;
    const total = db.prepare("SELECT count(*) n FROM workspace").get()!;
    ownersValid = Number(total.n) > 0 && Number(missing.n) === 0;
  } catch {
    /* No private database paths, SQL data or raw errors in diagnostics. */
  } finally {
    db?.close();
  }
  add(
    "database",
    databaseValid,
    "An existing schema-v3 database must pass integrity and foreign-key checks; this command never seeds or migrates it.",
  );
  if (!options.local || env.STYX_AUTH_MODE === "password")
    add(
      "owners",
      ownersValid,
      "Every workspace needs at least one enabled owner account.",
    );
  let backupValid = false;
  if (options.backup) {
    let snapshot: DatabaseSync | undefined;
    try {
      const path = resolve(root, options.backup),
        live = resolve(root, env.STYX_DB || "data/styx.sqlite");
      if (path === live) throw Error();
      const info = statSync(path),
        liveInfo = statSync(live);
      if (info.dev === liveInfo.dev && info.ino === liveInfo.ino) throw Error();
      const age = (options.now ?? Date.now()) - info.mtimeMs;
      if (age < -60000 || age > 7 * 86400000) throw Error();
      snapshot = new DatabaseSync(path, { readOnly: true });
      inspectDatabase(snapshot);
      backupValid = true;
    } catch {
      /* Generic output, including corrupt snapshots. */
    } finally {
      snapshot?.close();
    }
  }
  add(
    "backup",
    backupValid,
    "Supply --backup with a separate valid snapshot modified within the last 7 days. This does not prove off-device storage or recovery.",
  );
  if (env.STYX_B2_ENABLED === "true") {
    let ready = backblazeStatus(env).configured;
    try {
      backupKey({
        ...env,
        STYX_BACKUP_KEY_FILE: env.STYX_BACKUP_KEY_FILE
          ? resolve(root, env.STYX_BACKUP_KEY_FILE)
          : undefined,
      });
    } catch {
      ready = false;
    }
    add(
      "cloud-backup",
      ready,
      "Enabled Backblaze backups require restricted bucket credentials and a valid private encryption key file. Account/bucket access and uploads are not verified here.",
    );
  } else
    checks.push({
      id: "cloud-backup",
      status: "disabled",
      message:
        "Backblaze backups are disabled; local snapshots remain available.",
    });
  const aiEnabled = env.NEAR_AI_ENABLED === "true";
  if (!env.NEAR_AI_ENABLED || env.NEAR_AI_ENABLED === "false")
    checks.push({
      id: "model",
      status: "disabled",
      message: "Live AI is disabled. Local processing remains available.",
    });
  else
    add(
      "model",
      aiEnabled &&
        Boolean(env.NEAR_AI_API_KEY?.trim() && env.NEAR_AI_MODEL?.trim()),
      "Enabled live AI requires a nonempty key and model. Credentials and live inference are not verified.",
    );
  const nearRequested = Object.keys(env).some(
    (key) =>
      key.startsWith("NEAR_") &&
      key !== "NEAR_AI_ENABLED" &&
      !key.startsWith("NEAR_AI_") &&
      Boolean(env[key]),
  );
  if (nearRequested) {
    const config = nearConfig(env);
    add(
      "testnet-config",
      config.issues.length === 0,
      "Configured testnet requires a contract/hash, distinct role keys and explicit provider prices. No RPC or signing request is made. " +
        config.issues.join(" "),
    );
    let matches = false;
    for (const artifact of [
      "contracts/styx/target/wasm32-unknown-unknown/release/styx_escrow.wasm",
      "data/contract-candidate/wasm32-unknown-unknown/release/styx_escrow.wasm",
    ]) {
      try {
        const digest = createHash("sha256")
          .update(readFileSync(resolve(root, artifact)))
          .digest();
        const alphabet =
          "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
        let n = BigInt("0x" + digest.toString("hex")),
          encoded = "";
        while (n > 0n) {
          encoded = alphabet[Number(n % 58n)] + encoded;
          n /= 58n;
        }
        for (const byte of digest) {
          if (byte !== 0) break;
          encoded = "1" + encoded;
        }
        matches = encoded === config.codeHash;
        if (matches) break;
      } catch {
        /* Artifact missing: fail without exposing filesystem details. */
      }
    }
    add(
      "testnet-artifact",
      matches,
      "Configured code hash must match the local WASM. Matching bytes do not prove review, deployment or chain state.",
    );
    if (config.codeHash === "CdBNyKSJ5vEj5k85MSLzpfpUhxBx7NZGNzG1yjvSwck1")
      add(
        "testnet-capacity",
        Boolean(options.local),
        "The deployed whole-map testnet artifact has a reproduced callback gas failure at 100 stored jobs. Keep it limited to local pilot testing; public rollout requires the separately verified keyed-storage candidate on a fresh contract. See docs/verification/near-vm-scale-report.json.",
      );
  } else
    checks.push({
      id: "testnet-config",
      status: "disabled",
      message: "Testnet is unconfigured. Local demo payments remain available.",
    });
  return {
    profile: options.local ? "local" : "public",
    configuration: checks.some((check) => check.status === "fail")
      ? "needs_setup"
      : "checks_passed",
    launchStatus: "unverified",
    checks,
    manualGates: [
      "Verify public TLS/proxy, login/logout and desktop/mobile routes at the actual origin.",
      "Verify off-device backup storage, restore rehearsal, service restart and monitoring alerts.",
      "Before funded NEAR use: SDK/WASM VM tests, gas/storage measurements, contract review and live wallet/testnet validation.",
      "Before live AI use: verify model extraction, external sharing consent, costs and failure handling.",
    ],
  };
}
