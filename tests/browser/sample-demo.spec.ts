import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public sample completes simulated payment without owner, AI or NEAR requests", async ({
  page,
  browser,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/"))
      requests.push(new URL(request.url()).pathname);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("link", { name: "Try sample demo" }).click();
  await expect(page).toHaveURL(/\/try-demo$/);
  await expect(page.getByRole("note")).toContainText(
    "simulated payments · no blockchain transactions",
  );
  await expect(
    page.getByRole("button", { name: "Load 30 sample invoices" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Load 30 sample invoices" }).click();
  await page.getByRole("button", { name: "Approve sample rules" }).click();
  await page
    .getByRole("button", { name: "Reserve demo units & process" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "4. Inspect delivery and verification" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review all 30 rows" }).click();
  await expect(
    page
      .getByRole("region", { name: "Sample invoice source comparisons" })
      .getByRole("row"),
  ).toHaveCount(31);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download sample CSV" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "sample-invoices.csv",
  );
  await page
    .getByRole("button", { name: "Accept delivery · simulate payment" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Simulated payment complete",
  );
  await expect(page.getByRole("status")).toContainText("3.20 demo units");
  await page.reload();
  await expect(page.getByRole("status")).toContainText(
    "Simulated payment complete",
  );
  expect(
    requests.every((path) => path.startsWith("/api/sample-demo/")),
    requests.join(", "),
  ).toBe(true);
  expect(requests.some((path) => /near|auth|ai/.test(path))).toBe(false);
  expect(errors).toEqual([]);
  const second = await browser.newContext();
  try {
    const guest = await second.newPage();
    await guest.goto("/try-demo");
    await expect(
      guest.getByRole("button", { name: "Load 30 sample invoices" }),
    ).toBeEnabled();
    await expect(guest.getByLabel("Sample job", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      guest.getByText("100.00 demo units", { exact: true }),
    ).toBeVisible();
  } finally {
    await second.close();
  }
});

test("sample failure blocks acceptance, rejection releases units, and mobile labels remain clear", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/try-demo");
  await expect(
    page.getByRole("button", { name: "Load 30 sample invoices" }),
  ).toBeEnabled();
  await page
    .getByRole("combobox", { name: "Sample case", exact: true })
    .selectOption("arithmetic");
  await page.getByRole("button", { name: "Load 30 sample invoices" }).click();
  await page.getByRole("button", { name: "Approve sample rules" }).click();
  await page
    .getByRole("button", { name: "Reserve demo units & process" })
    .first()
    .click();
  await expect(
    page.getByText("Failed: Arithmetic & source match", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept delivery · simulate payment" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Reject delivery & release demo reservation" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "without a provider payment",
  );
  await expect(
    page.getByText("100.00 demo units", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "View real testnet proof" }),
  ).toBeVisible();
  await expect(page.getByRole("note")).toContainText(
    "no blockchain transactions",
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  expect(overflow).toBe(false);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter((issue) =>
      ["serious", "critical"].includes(issue.impact || ""),
    ),
  ).toEqual([]);
});
