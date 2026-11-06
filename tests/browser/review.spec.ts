import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
test("complete delivery review searches, filters, paginates, compares sources and exports real evidence", async ({
  page,
  playwright,
}) => {
  test.setTimeout(120000);
  await page.goto("/app");
  await expect(page.locator("main h1")).toBeVisible();
  const { csrf } = await (await page.request.get("/api/session")).json();
  const uploads = await (await page.request.get("/api/fixtures")).json();
  const post = async (path: string, data: any) => {
    const r = await page.request.post("/api" + path, {
      headers: { "X-Styx-CSRF": csrf, Origin: "http://127.0.0.1:4173" },
      data,
    });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  let job = await post("/jobs", {
    name: "Source evidence browser test",
    instructions: "Extract all invoice fields and flag uncertainty",
    budget: "5.00",
    deadline: Date.now() + 3600000,
    allowedProviders: ["ledgerworks"],
    requirements: "All source fields, arithmetic and coverage",
    uploads,
  });
  job = await post(`/jobs/${job.id}/approve`, {
    version: 1,
    hash: job.mandate.hash,
  });
  await post(`/jobs/${job.id}/reserve`, { quoteId: job.quotes[0].id });
  await page.goto(`/jobs/${job.id}`);
  await page
    .getByRole("link", { name: /Review all invoices & sources/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review every invoice" }),
  ).toBeVisible();
  await expect(
    page.getByText("Page 1 of 2 · 30 matching rows", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByText("Page 2 of 2 · 30 matching rows", { exact: true }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Search invoices" }).fill("INV-1001");
  await expect(
    page.getByText("Page 1 of 1 · 1 matching rows", { exact: true }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Search invoices" }).fill("");
  await page.getByLabel("Review filter").selectOption("duplicate");
  await expect(
    page.getByText("Page 1 of 1 · 4 matching rows", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Review filter").selectOption("uncertain");
  await expect(
    page.getByText("Page 1 of 1 · 3 matching rows", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Inspect row/ })
    .first()
    .click();
  await expect(
    page.getByRole("region", { name: "Original and delivered fields" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View original document" }).click();
  await expect(page.getByLabel("Original document content")).toContainText(
    "invoice_id",
  );
  const originalPromise = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download original", exact: true })
    .click();
  const original = await originalPromise;
  expect(original.suggestedFilename()).toBe("original-invoice.json");
  expect(readFileSync((await original.path())!, "utf8")).toContain(
    "invoice_id",
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Verification report", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("verification-report.json");
  const report = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(report.jobId).toBe(job.id);
  expect(report.artifactIntact).toBe(true);
  expect(report.reportCurrent).toBe(true);
  expect(report.flagCounts.duplicate).toBe(4);
  expect(report.rows).toBeUndefined();
  const anonymous = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:4173",
  });
  for (const path of [
    `/api/jobs/${job.id}/review`,
    `/api/jobs/${job.id}/report`,
    `/api/jobs/${job.id}/inputs/${job.uploads[0].id}`,
  ])
    expect((await anonymous.get(path)).status()).toBe(401);
  await anonymous.dispose();
  expect(
    (
      await page.request.get(`/api/jobs/${job.id}/inputs/not-a-source`)
    ).status(),
  ).toBe(400);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/design/screenshots/review-${width}.png`,
      fullPage: true,
    });
    if (width !== 320) {
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(scan.violations).toEqual([]);
    }
  }
  await page.getByRole("link", { name: "Back to delivery" }).click();
  await expect(
    page.getByRole("button", { name: "Accept & release 3.20" }),
  ).toBeVisible();
});
