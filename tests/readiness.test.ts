import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  utimesSync,
  linkSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KeyPair } from "near-api-js";
import { baseEncode } from "@near-js/utils";
import { createHash } from "node:crypto";
import { Store } from "../lib/storage/db.ts";
import { snapshotDatabase } from "../lib/storage/operations.ts";
import { deploymentCheck } from "../lib/operations/readiness.ts";

const publicEnv = {
  STYX_AUTH_MODE: "password",
  STYX_APP_ORIGIN: "https://styx.example",
  STYX_DB: "live.sqlite",
};
const status = (report: ReturnType<typeof deploymentCheck>, id: string) =>
  report.checks.find((check) => check.id === id)?.status;
async function fixture(fn: (root: string, store: Store) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "styx-readiness-"));
  const store = new Store(join(root, "live.sqlite"));
  try {
    mkdirSync(join(root, "dist"));
    writeFileSync(
      join(root, "dist/index.html"),
      "<!doctype html><title>fixture build</title>",
    );
    store.db
      .prepare("INSERT INTO app_user VALUES(?,?,?,?)")
      .run("test-owner", "owner", "synthetic-fixture-digest", 0);
    store.db
      .prepare("INSERT INTO membership VALUES(?,?,?)")
      .run("test-owner", store.workspace, "owner");
    await snapshotDatabase(
      join(root, "live.sqlite"),
      join(root, "backup.sqlite"),
    );
    await fn(root, store);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
}

test("complete configuration never claims deployment or live integration verification", async () => {
  await fixture(async (root) => {
    const report = deploymentCheck({
      root,
      env: publicEnv,
      backup: "backup.sqlite",
    });
    assert.equal(report.configuration, "checks_passed");
    assert.equal(report.launchStatus, "unverified");
    assert.equal(status(report, "owners"), "pass");
    assert.equal(status(report, "model"), "disabled");
    assert.equal(status(report, "testnet-config"), "disabled");
    assert.ok(report.manualGates.some((gate) => gate.includes("VM")));
    assert.ok(report.manualGates.some((gate) => gate.includes("restore")));
  });
});

test("the known whole-map callback limit blocks public readiness even when the pilot remains local", async () => {
  await fixture(async (root) => {
    const env = {
      ...publicEnv,
      NEAR_CONTRACT_ID: "pilot.testnet",
      NEAR_CONTRACT_CODE_HASH: "CdBNyKSJ5vEj5k85MSLzpfpUhxBx7NZGNzG1yjvSwck1",
    };
    const report = deploymentCheck({ root, env, backup: "backup.sqlite" });
    assert.equal(status(report, "testnet-capacity"), "fail");
    assert.equal(report.configuration, "needs_setup");
    const local = deploymentCheck({
      root,
      env,
      backup: "backup.sqlite",
      local: true,
    });
    assert.equal(status(local, "testnet-capacity"), "pass");
    assert.equal(local.launchStatus, "unverified");
  });
});

test("candidate artifact readiness hashes the actual bytes and rejects a changed binary", async () => {
  await fixture(async (root) => {
    const directory = join(
      root,
      "data/contract-candidate/wasm32-unknown-unknown/release",
    );
    mkdirSync(directory, { recursive: true });
    const binary = Buffer.from("synthetic-wasm-fixture");
    const env = {
      ...publicEnv,
      NEAR_CONTRACT_ID: "fresh.testnet",
      NEAR_CONTRACT_CODE_HASH: baseEncode(
        createHash("sha256").update(binary).digest(),
      ),
    };
    assert.equal(
      status(deploymentCheck({ root, env }), "testnet-artifact"),
      "fail",
    );
    writeFileSync(join(directory, "styx_escrow.wasm"), binary);
    assert.equal(
      status(deploymentCheck({ root, env }), "testnet-artifact"),
      "pass",
    );
    writeFileSync(join(directory, "styx_escrow.wasm"), "changed");
    assert.equal(
      status(deploymentCheck({ root, env }), "testnet-artifact"),
      "fail",
    );
  });
});
test("missing or invalid sources are reported without seeding files or echoing secrets", () => {
  const root = mkdtempSync(join(tmpdir(), "styx-readiness-"));
  try {
    const secret = "DO-NOT-PRINT-this-credential";
    const report = deploymentCheck({
      root,
      env: {
        ...publicEnv,
        STYX_APP_ORIGIN: `https://user:${secret}@host.example/private`,
        NEAR_AGENT_PRIVATE_KEY: secret,
        NEAR_AI_ENABLED: "true",
        NEAR_AI_API_KEY: secret,
      },
    });
    assert.equal(report.configuration, "needs_setup");
    assert.equal(status(report, "database"), "fail");
    assert.equal(status(report, "build"), "fail");
    assert.equal(status(report, "access"), "fail");
    assert.equal(status(report, "model"), "fail");
    assert.equal(status(report, "testnet-config"), "fail");
    assert.ok(!JSON.stringify(report).includes(secret));
    assert.ok(!existsSync(join(root, "live.sqlite")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every workspace requires an enabled owner; viewers or disabled owners do not count", async () => {
  await fixture(async (root, store) => {
    const check = () =>
      deploymentCheck({ root, env: publicEnv, backup: "backup.sqlite" });
    store.db
      .prepare("INSERT INTO workspace VALUES(?,?,?)")
      .run("other", "Other workspace", "owner");
    assert.equal(status(check(), "owners"), "fail");
    store.db
      .prepare("INSERT INTO membership VALUES(?,?,?)")
      .run("test-owner", "other", "viewer");
    assert.equal(status(check(), "owners"), "fail");
    store.db.prepare("UPDATE membership SET role='owner'").run();
    assert.equal(status(check(), "owners"), "pass");
    store.db.prepare("UPDATE app_user SET disabled=1").run();
    assert.equal(status(check(), "owners"), "fail");
  });
});

test("live database aliases, stale backups and corrupt backups are rejected without modification", async () => {
  await fixture(async (root) => {
    const check = (backup: string) =>
      status(deploymentCheck({ root, env: publicEnv, backup }), "backup");
    assert.equal(check("live.sqlite"), "fail");
    linkSync(join(root, "live.sqlite"), join(root, "alias.sqlite"));
    assert.equal(check("alias.sqlite"), "fail");
    const old = new Date(Date.now() - 8 * 86400000);
    utimesSync(join(root, "backup.sqlite"), old, old);
    assert.equal(check("backup.sqlite"), "fail");
    writeFileSync(join(root, "corrupt.sqlite"), "corrupt private bytes");
    assert.equal(check("corrupt.sqlite"), "fail");
    assert.equal(
      readFileSync(join(root, "corrupt.sqlite"), "utf8"),
      "corrupt private bytes",
    );
  });
});

test("local mode stays distinct from public checks; partial integrations never pass", async () => {
  await fixture(async (root) => {
    const localEnv = { STYX_DB: "live.sqlite", STYX_AUTH_MODE: "local" };
    assert.equal(
      status(
        deploymentCheck({
          root,
          env: localEnv,
          local: true,
          backup: "backup.sqlite",
        }),
        "access",
      ),
      "pass",
    );
    assert.equal(
      status(
        deploymentCheck({ root, env: localEnv, backup: "backup.sqlite" }),
        "access",
      ),
      "fail",
    );
    const key = KeyPair.fromRandom("ed25519").toString();
    const env = {
      ...publicEnv,
      NEAR_AGENT_ACCOUNT_ID: "agent.testnet",
      NEAR_AGENT_PRIVATE_KEY: key,
      NEAR_CONTRACT_CODE_HASH: "1".repeat(44),
      NEAR_AI_ENABLED: "true",
      NEAR_AI_API_KEY: "synthetic-private-key",
      NEAR_AI_MODEL: "configured-model",
    };
    const report = deploymentCheck({ root, env, backup: "backup.sqlite" });
    assert.equal(status(report, "testnet-config"), "fail");
    assert.equal(status(report, "testnet-artifact"), "fail");
    assert.equal(status(report, "model"), "pass");
    assert.ok(!JSON.stringify(report).includes(key));
    assert.ok(!JSON.stringify(report).includes(env.NEAR_AI_API_KEY));
  });
});
