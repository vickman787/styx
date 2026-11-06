import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../lib/storage/db.ts";
import { verifyVpsStartup } from "../lib/operations/vps.ts";
import { listenerConfig } from "../server/listener.ts";

test("wide container binding cannot bypass password and HTTPS requirements", () => {
  assert.equal(listenerConfig({}).HOST, "127.0.0.1");
  for (const env of [
    { HOST: "0.0.0.0" },
    { HOST: "0.0.0.0", STYX_CONTAINER: "true" },
    {
      HOST: "0.0.0.0",
      STYX_CONTAINER: "true",
      STYX_AUTH_MODE: "password",
      STYX_APP_ORIGIN: "http://127.0.0.1:4173",
    },
    {
      HOST: "0.0.0.0",
      STYX_AUTH_MODE: "password",
      STYX_APP_ORIGIN: "https://styx.test",
    },
  ])
    assert.throws(() => listenerConfig(env));
  assert.equal(
    listenerConfig({
      HOST: "0.0.0.0",
      STYX_CONTAINER: "true",
      STYX_AUTH_MODE: "password",
      STYX_APP_ORIGIN: "https://styx.test",
    }).HOST,
    "0.0.0.0",
  );
});

test("public launcher refuses missing databases and missing or disabled owners without modifying records", () => {
  const directory = mkdtempSync(join(tmpdir(), "styx-vps-check-"));
  const path = join(directory, "app.sqlite");
  const env = {
    HOST: "127.0.0.1",
    STYX_AUTH_MODE: "password",
    STYX_APP_ORIGIN: "https://styx.test",
    STYX_DB: path,
  };
  try {
    assert.throws(() => verifyVpsStartup(env), /existing database/);
    assert.equal(existsSync(path), false);
    const store = new Store(path);
    try {
      assert.throws(() => verifyVpsStartup(env), /enabled owner/);
      store.db
        .prepare("INSERT INTO app_user VALUES(?,?,?,?)")
        .run("owner-id", "operator", "synthetic-test-digest", 0);
      store.db
        .prepare("INSERT INTO membership VALUES(?,?,?)")
        .run("owner-id", store.workspace, "viewer");
      assert.throws(() => verifyVpsStartup(env), /enabled owner/);
      store.db.prepare("UPDATE membership SET role='owner'").run();
      assert.equal(verifyVpsStartup(env).databaseVerified, true);
      store.db.prepare("UPDATE app_user SET disabled=1").run();
      assert.throws(() => verifyVpsStartup(env), /enabled owner/);
      assert.throws(
        () =>
          verifyVpsStartup({
            ...env,
            STYX_APP_ORIGIN: "https://styx.example.invalid",
          }),
        /actual public/,
      );
      assert.throws(() =>
        verifyVpsStartup({ ...env, STYX_AUTH_MODE: "local" }),
      );
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
