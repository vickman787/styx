import { test, expect, type APIRequestContext } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { Store } from "../../lib/storage/db.ts";
import { AccessService } from "../../lib/auth/service.ts";
import { Service } from "../../lib/domain/service.ts";
const origin = "http://127.0.0.1:4175",
  password = randomBytes(24).toString("hex");
test.describe.configure({ timeout: 180000 });
let dir: string,
  db: string,
  server: ChildProcess,
  job: any,
  otherJob: any,
  readerId: string;
const input = {
  name: "Team One private invoice",
  instructions: "Extract invoice data faithfully",
  budget: "5.00",
  deadline: Date.now() + 3600000,
  allowedProviders: ["ledgerworks"],
  requirements: "All independent checks",
  uploads: [
    {
      name: "private.json",
      content: JSON.stringify({
        invoice_id: "PRIVATE-1",
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
async function start() {
  const env = {
    ...process.env,
    PORT: "4175",
    STYX_AUTH_MODE: "password",
    STYX_APP_ORIGIN: origin,
    STYX_DB: db,
  };
  for (const key of Object.keys(env))
    if (key.startsWith("NEAR_")) delete (env as any)[key];
  server = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts", "--production"],
    { cwd: process.cwd(), env, stdio: "ignore", windowsHide: true },
  );
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(origin + "/api/session")).status;
        } catch {
          return 0;
        }
      },
      { timeout: 40000 },
    )
    .toBe(200);
}
async function stop() {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise<void>((resolve) => server.once("exit", () => resolve()));
  }
}
async function login(client: APIRequestContext, username: string) {
  const session = await (await client.get(origin + "/api/session")).json();
  const r = await client.post(origin + "/api/auth/login", {
    headers: { Origin: origin, "X-Styx-CSRF": session.csrf },
    data: { username, password },
  });
  expect(r.status()).toBe(200);
  return r.json();
}
test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "styx-access-browser-"));
  db = join(dir, "test.sqlite");
  const store = new Store(db),
    auth = new AccessService(store, "password");
  const owner = await auth.createUser(
    "owner",
    password,
    "team-one",
    "owner",
    "Team One",
  );
  await auth.createUser("other", password, "team-two", "owner", "Team Two");
  readerId = await auth.createUser("reader", password, "team-one", "viewer");
  auth.grant(owner, "team-two", "viewer");
  const service = new Service(store.forWorkspace("team-one"));
  job = service.create(input);
  job = service.approve(job.id, 1, job.mandate.hash);
  service.reserve(job.id, job.quotes[0].id);
  job = await service.process(job.id);
  otherJob = new Service(store.forWorkspace("team-two")).create({
    ...input,
    name: "Team Two private invoice",
  });
  store.close();
  await start();
});
test.afterAll(async () => {
  await stop();
  if (dir) rmSync(dir, { recursive: true, force: true });
});
test("HTTP auth enforces CSRF, owner/viewer permissions and private workspace boundaries", async ({
  playwright,
}) => {
  const client = await playwright.request.newContext(),
    viewer = await playwright.request.newContext(),
    other = await playwright.request.newContext();
  expect((await client.get(origin + "/api/state")).status()).toBe(401);
  const pre = await (await client.get(origin + "/api/session")).json();
  expect(pre.authenticated).toBe(false);
  expect(
    (
      await client.post(origin + "/api/auth/login", {
        headers: { Origin: origin },
        data: { username: "owner", password },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await client.post(origin + "/api/auth/login", {
        headers: { Origin: "https://evil.test", "X-Styx-CSRF": pre.csrf },
        data: { username: "owner", password },
      })
    ).status(),
  ).toBe(403);
  const oldCookie = (await client.storageState()).cookies.find(
    (c) => c.name === "styx_session",
  )!.value;
  const owner = await login(client, "owner"),
    read = await login(viewer, "reader");
  await login(other, "other");
  expect(
    (
      await client.get(origin + "/api/state", {
        headers: { Cookie: `styx_session=${oldCookie}` },
      })
    ).status(),
  ).toBe(401);
  const state = await (await client.get(origin + "/api/state")).json();
  expect(state.jobs.map((j: any) => j.id)).toEqual([job.id]);
  for (const path of [
    `/api/jobs/${job.id}/artifact`,
    `/api/jobs/${job.id}/review`,
    `/api/jobs/${job.id}/report`,
    `/api/jobs/${job.id}/inputs/${job.uploads[0].id}`,
  ]) {
    expect((await viewer.get(origin + path)).status()).toBe(200);
    expect((await other.get(origin + path)).status()).toBe(400);
  }
  for (const path of [
    "/api/settings",
    `/api/jobs/${job.id}/settle`,
    "/api/near/intents/not-an-intent/submit-role",
  ])
    expect(
      (
        await viewer.post(origin + path, {
          headers: { Origin: origin, "X-Styx-CSRF": read.csrf },
          data: { name: "Unauthorized" },
        })
      ).status(),
    ).toBe(403);
  expect(
    (await client.get(origin + `/api/jobs/${otherJob.id}/review`)).status(),
  ).toBe(400);
  expect(
    (
      await client.post(origin + "/api/auth/workspace", {
        headers: { Origin: origin, "X-Styx-CSRF": owner.csrf },
        data: { workspaceId: "acme-local" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await client.post(origin + "/api/settings", {
        headers: { Origin: origin, "X-Styx-CSRF": owner.csrf },
        data: { name: "Renamed Team One" },
      })
    ).status(),
  ).toBe(200);
  const check = await (await other.get(origin + "/api/state")).json();
  expect(check.workspace.name).toBe("Team Two");
  expect(check.balance.spent).toBe(0);
  const createdResponse = await client.post(origin + "/api/jobs", {
    headers: { Origin: origin, "X-Styx-CSRF": owner.csrf },
    data: { ...input, name: "Authenticated owner approval" },
  });
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json();
  expect(
    (
      await client.post(origin + `/api/jobs/${created.id}/approve`, {
        headers: { Origin: origin, "X-Styx-CSRF": owner.csrf },
        data: { version: 1, hash: created.mandate.hash },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await client.post(origin + `/api/jobs/${job.id}/settle`, {
        headers: { Origin: origin, "X-Styx-CSRF": owner.csrf },
        data: {},
      })
    ).status(),
  ).toBe(200);
  const store = new Store(db);
  for (const jobId of [created.id, job.id]) {
    const approvals = store.db
      .prepare(
        "SELECT payload FROM approval WHERE job_id=? ORDER BY rowid DESC",
      )
      .all(jobId);
    expect(JSON.parse(String(approvals[0].payload)).principal).toBe(
      `user:${owner.userId}`,
    );
  }
  store.db
    .prepare(
      "DELETE FROM membership WHERE user_id=? AND workspace_id='team-one'",
    )
    .run(readerId);
  store.close();
  expect((await viewer.get(origin + "/api/state")).status()).toBe(401);
  await client.dispose();
  await viewer.dispose();
  await other.dispose();
});
test("production sign-in is responsive; sessions survive restart, workspace switching and logout revoke old access", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto(origin + "/app");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/design/screenshots/sign-in-${width}.png`,
      fullPage: true,
    });
    if (width !== 320) {
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations).toEqual([]);
    }
  }
  await page.getByLabel("Username", { exact: true }).fill("owner");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Username or password is incorrect",
  );
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Testnet escrow", exact: true }),
  ).toBeVisible();
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "styx_session",
  )!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Strict");
  expect(
    await page.evaluate(() =>
      Object.values(localStorage).some((v) => /^[a-f0-9]{64}$/.test(v)),
    ),
  ).toBe(false);
  await stop();
  await start();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Testnet escrow", exact: true }),
  ).toBeVisible();
  await page.goto(origin + "/settings");
  await expect(
    page.getByRole("heading", { name: "Your account" }),
  ).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(result.violations).toEqual([]);
    await page.screenshot({
      path: `docs/design/screenshots/account-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByLabel("Workspace access").selectOption("team-two");
  await page
    .getByRole("button", { name: "Switch workspace", exact: true })
    .click();
  await expect(page.getByText(/Viewer access · you can inspect/)).toBeVisible();
  const state = await (await page.request.get(origin + "/api/state")).json();
  expect(state.jobs.map((j: any) => j.id)).toEqual([otherJob.id]);
  await page.goto(origin + "/settings");
  await expect(
    page.getByRole("button", { name: "Save settings" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  expect((await page.request.get(origin + "/api/state")).status()).toBe(401);
});
