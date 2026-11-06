import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../lib/storage/db.ts";
import { Service } from "../lib/domain/service.ts";
import {
  AccessService,
  passwordDigest,
  passwordMatches,
} from "../lib/auth/service.ts";
import { accessConfig } from "../server/access.ts";
const password = "test-only-long-passphrase-abc";
test("passwords have salted adaptive hashes, no cleartext, and strict size limits", async () => {
  const a = await passwordDigest(password),
    b = await passwordDigest(password);
  assert.notEqual(a, b);
  assert.ok(!a.includes(password));
  assert.equal(await passwordMatches(password, a), true);
  assert.equal(await passwordMatches("wrong", a), false);
  await assert.rejects(() => passwordDigest("short"));
  assert.equal(await passwordMatches("x".repeat(129), a), false);
});
test("login rotates preauthentication tokens; logout invalidates copies and modes never cross", async () => {
  const store = new Store(":memory:"),
    auth = new AccessService(store, "password");
  await auth.createUser("owner", password, "team-one");
  const before = auth.issue();
  assert.equal(auth.session(before)!.authenticated, false);
  const token = await auth.login("OWNER", password, "test-ip", before);
  assert.equal(auth.session(before), null);
  assert.equal(auth.session(token)!.role, "owner");
  assert.equal(new AccessService(store, "local").session(token), null);
  const persisted = store.db
    .prepare("SELECT token_hash FROM auth_session")
    .get()!;
  assert.notEqual(persisted.token_hash, token);
  auth.revoke(token);
  assert.equal(auth.session(token), null);
  store.close();
});
test("session storage survives reopen and expiration is enforced server side", async () => {
  const dir = mkdtempSync(join(tmpdir(), "styx-auth-")),
    path = join(dir, "auth.sqlite");
  let now = Date.now();
  let store = new Store(path);
  let auth = new AccessService(store, "password", () => now);
  await auth.createUser("owner", password, "team-one");
  const token = await auth.login("owner", password, "test-ip", auth.issue());
  store.close();
  store = new Store(path);
  auth = new AccessService(store, "password", () => now);
  assert.equal(auth.session(token)!.username, "owner");
  now += 12 * 3600000 + 1;
  assert.equal(auth.session(token), null);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});
test("workspace membership and roles are re-read, revoked accounts cannot retain access", async () => {
  const store = new Store(":memory:"),
    auth = new AccessService(store, "password");
  const uid = await auth.createUser("owner", password, "team-one");
  await auth.createUser("other", password, "team-two");
  const token = await auth.login("owner", password, "test-ip", auth.issue());
  assert.throws(() => auth.switchWorkspace(token, "team-two"), /denied/);
  auth.grant(uid, "team-two", "viewer");
  const next = auth.switchWorkspace(token, "team-two");
  assert.equal(auth.session(token), null);
  assert.equal(auth.session(next)!.role, "viewer");
  store.db
    .prepare(
      "DELETE FROM membership WHERE user_id=? AND workspace_id='team-two'",
    )
    .run(uid);
  assert.equal(auth.session(next), null);
  const again = await auth.login("owner", password, "test-ip", auth.issue());
  store.db.prepare("UPDATE app_user SET disabled=1 WHERE id=?").run(uid);
  assert.equal(auth.session(again), null);
  await assert.rejects(
    () => auth.login("owner", password, "test-ip", auth.issue()),
    /incorrect/,
  );
  store.close();
});
test("changing a password revokes every session, rejects stale password and keeps only a fresh token", async () => {
  const store = new Store(":memory:"),
    auth = new AccessService(store, "password");
  await auth.createUser("owner", password, "team-one");
  const a = await auth.login("owner", password, "a", auth.issue()),
    b = await auth.login("owner", password, "b", auth.issue());
  await assert.rejects(
    () => auth.changePassword(a, "wrong", "new-test-only-password-abc", "a"),
    /incorrect/,
  );
  const current = await auth.changePassword(
    a,
    password,
    "new-test-only-password-abc",
    "a",
  );
  assert.equal(auth.session(a), null);
  assert.equal(auth.session(b), null);
  assert.ok(auth.session(current));
  await assert.rejects(
    () => auth.login("owner", password, "a", auth.issue()),
    /incorrect/,
  );
  store.close();
});
test("failed login throttling persists and does not reveal whether an account exists", async () => {
  const store = new Store(":memory:"),
    auth = new AccessService(store, "password");
  for (let n = 0; n < 8; n++)
    await assert.rejects(
      () => auth.login("unknown", password, "ip", auth.issue()),
      /Username or password is incorrect/,
    );
  await assert.rejects(
    () =>
      new AccessService(store, "password").login(
        "unknown",
        password,
        "ip",
        auth.issue(),
      ),
    /Too many/,
  );
  store.close();
});
test("scoped stores isolate jobs and demo balances; job identifiers cannot collide across workspaces", async () => {
  const store = new Store(":memory:"),
    auth = new AccessService(store, "password");
  await auth.createUser("owner", password, "team-one");
  await auth.createUser("other", password, "team-two");
  const a = store.forWorkspace("team-one"),
    b = store.forWorkspace("team-two");
  const input = {
    name: "Workspace isolation",
    instructions: "Extract invoice data faithfully",
    budget: "5.00",
    deadline: Date.now() + 3600000,
    allowedProviders: ["ledgerworks"],
    requirements: "All checks",
    uploads: [
      {
        name: "one.json",
        content: JSON.stringify({
          invoice_id: "1",
          vendor: "Vendor",
          date: "2026-10-01",
          currency: "USD",
          subtotal: "1.00",
          tax: "0.00",
          total: "1.00",
        }),
      },
    ],
  };
  const first = new Service(a).create(input),
    second = new Service(b).create(input);
  assert.notEqual(first.id, second.id);
  assert.throws(() => b.get(first.id), /not found/);
  assert.equal(a.jobs().length, 1);
  assert.equal(b.jobs().length, 1);
  assert.equal(b.balance().available, 10000);
  a.close();
  assert.equal(store.jobs().length, 0);
  store.close();
});
test("public origins cannot enable local owner access or insecure HTTP authentication", () => {
  assert.throws(
    () => accessConfig({ STYX_APP_ORIGIN: "https://example.test" }),
    /Local owner/,
  );
  assert.throws(
    () =>
      accessConfig({
        STYX_AUTH_MODE: "password",
        STYX_APP_ORIGIN: "http://example.test",
      }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      accessConfig({
        STYX_AUTH_MODE: "password",
        STYX_APP_ORIGIN: "https://u:p@example.test/path",
      }),
    /without a path/,
  );
  assert.equal(
    accessConfig({
      STYX_AUTH_MODE: "password",
      STYX_APP_ORIGIN: "https://example.test",
    }).cookie,
    "__Host-styx_session",
  );
});

test("anonymous password-mode session issuance is throttled and preauthentication expires promptly", () => {
  const store = new Store(":memory:");
  let now = Date.now();
  const auth = new AccessService(store, "password", () => now);
  const token = auth.issue();
  for (let n = 0; n < 60; n++) auth.checkSessionIssue("ip");
  assert.throws(() => auth.checkSessionIssue("ip"), /Too many session/);
  now += 10 * 60000 + 1;
  assert.equal(auth.session(token), null);
  now += 5 * 60000;
  assert.doesNotThrow(() => auth.checkSessionIssue("ip"));
  store.close();
});
