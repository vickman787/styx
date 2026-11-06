import { test, expect } from "@playwright/test";
test("owner journey creates, approves, reserves, verifies, accepts and persists receipt", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Open workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/design/screenshots/desktop-overview.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Create job", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Task name" })
    .fill("Browser journey invoices");
  await page.getByRole("button", { name: "Load 30 sample invoices" }).click();
  await expect(
    page.getByRole("button", { name: "Remove invoice-30.json" }),
  ).toBeAttached();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Review mandate", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review mandate", exact: true }),
  ).toBeVisible();
  const jobId = page.url().match(/jobs\/(STX-\d+)/)![1];
  await page.screenshot({
    path: "docs/design/screenshots/desktop-mandate.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Approve mandate v1" }).click();
  await expect(
    page.getByRole("heading", { name: "Provider quotes", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/design/screenshots/desktop-quotes.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Reserve & start", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Accept & release 3.20" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("2 duplicate invoices flagged")).toBeVisible();
  await expect(page.getByText("3 uncertain fields flagged")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("october-invoices.csv");
  await page.screenshot({
    path: "docs/design/screenshots/desktop-delivery.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Accept & release 3.20" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/design/screenshots/mobile-delivery.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Accept & release 3.20" }).click();
  await expect(
    page.getByRole("heading", { name: `RCP-${jobId}`, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: `RCP-${jobId}`, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/design/screenshots/mobile-receipt.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "docs/design/screenshots/desktop-receipt.png",
    fullPage: true,
  });
  await page.goto(`/jobs/${jobId}`);
  await expect(
    page.getByRole("link", { name: "View receipt", exact: true }),
  ).toBeVisible();
});
test("mobile supporting routes have no page overflow, errors, or missing controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/",
    "/app",
    "/jobs",
    "/jobs/new",
    "/providers",
    "/activity",
    "/settings",
  ]) {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      route,
    ).toBe(true);
    await page.screenshot({
      path: `docs/design/screenshots/mobile-${route === "/" ? "landing" : route === "/app" ? "overview" : route.slice(1).replace("/", "-")}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("textbox", { name: "Workspace name" })
    .fill("Acme Studio");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Workspace saved.")).toBeVisible();
});
test("policy attack shows real blocked evidence and cannot release payment", async ({
  page,
}) => {
  await page.goto("/app");
  const session = await page.request.get("/api/session");
  const { csrf } = await session.json();
  const fixtures = await (await page.request.get("/api/fixtures")).json();
  let j = await (
    await page.request.post("/api/jobs", {
      headers: { "X-Styx-CSRF": csrf },
      data: {
        name: "Blocked recipient demo",
        instructions: "Convert invoices and preserve payment recipient.",
        budget: "5.00",
        deadline: Date.now() + 7200000,
        allowedProviders: ["ledgerworks", "parselab"],
        requirements: "All acceptance checks",
        uploads: fixtures,
        scenario: "normal",
      },
    })
  ).json();
  j = await (
    await page.request.post(`/api/jobs/${j.id}/approve`, {
      headers: { "X-Styx-CSRF": csrf },
      data: { version: 1, hash: j.mandate.hash },
    })
  ).json();
  await page.goto(`/jobs/${j.id}/quotes`);
  await page.getByText("Inspect the recipient policy").click();
  await page
    .getByRole("button", { name: "Demonstrate blocked recipient change" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Payment blocked", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No funds moved", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "docs/design/screenshots/desktop-security.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/design/screenshots/mobile-security.png",
    fullPage: true,
  });
  const release = await page.request.post(`/api/jobs/${j.id}/settle`, {
    headers: { "X-Styx-CSRF": csrf },
    data: {},
  });
  expect(release.status()).toBe(400);
});
test("private downloads and mutations require session and CSRF", async ({
  playwright,
}) => {
  const anonymous = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:4173",
  });
  expect((await anonymous.get("/api/state")).status()).toBe(401);
  expect((await anonymous.get("/api/jobs/STX-1042/artifact")).status()).toBe(
    401,
  );
  await anonymous.get("/api/session");
  expect(
    (
      await anonymous.post("/api/settings", { data: { name: "Unauthorized" } })
    ).status(),
  ).toBe(403);
  await anonymous.dispose();
});
test("server drafts reopen for editing before mandate submission", async ({
  page,
}) => {
  await page.goto("/jobs/new");
  await page
    .getByRole("textbox", { name: "Task name" })
    .fill("Saved browser draft");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Edit draft & review" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: "Edit draft & review" }).click();
  await expect(page.getByRole("textbox", { name: "Task name" })).toHaveValue(
    "Saved browser draft",
  );
  await page.getByRole("button", { name: "Load 30 sample invoices" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Review mandate", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review mandate", exact: true }),
  ).toBeVisible();
});
