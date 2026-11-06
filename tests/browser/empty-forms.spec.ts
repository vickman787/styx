import { test, expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 20000 });
test.setTimeout(120000);

test("new forms contain no preset owner text, amounts, deadlines or provider selections", async ({
  page,
}) => {
  await page.goto("/jobs/new?local=1");
  await expect(page.getByLabel("Task name", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Instructions", { exact: true })).toHaveValue(
    "",
  );
  await page.getByRole("button", { name: /Rules/ }).click();
  await expect(page.getByLabel("Budget cap (demo units)")).toHaveValue("");
  await expect(page.getByLabel("Deadline (your local time)")).toHaveValue("");
  await expect(page.getByLabel("Acceptance requirements")).toHaveValue("");
  for (const box of await page
    .getByRole("group", { name: "Permitted providers" })
    .getByRole("checkbox")
    .all())
    await expect(box).not.toBeChecked();
  await page.goto("/app");
  await expect(page.getByLabel("Additional storage credit (NEAR)")).toHaveValue(
    "",
  );
  await expect(page.getByLabel("Verified source job")).toHaveValue("");
  await expect(page.getByLabel("Provider quote")).toHaveValue("");
});

test("old autosaved templates are removed while owner-authored drafts survive reload", async ({
  page,
}) => {
  await page.goto("/jobs/new?local=1");
  await expect(page.getByLabel("Instructions", { exact: true })).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem(
      "styx-draft",
      JSON.stringify({
        name: "My retained draft",
        instructions:
          "Convert these invoices into an accounting CSV. Account for every invoice, reconcile totals, and flag duplicates and uncertain fields.",
        requirements:
          "CSV schema; complete invoice coverage; arithmetic reconciliation; duplicate and uncertainty flags.",
        budget: "5.00",
        deadline: "2026-12-01T10:00",
        allowedProviders: ["ledgerworks", "parselab"],
      }),
    ),
  );
  await page.reload();
  await expect(page.getByLabel("Task name", { exact: true })).toHaveValue(
    "My retained draft",
  );
  await expect(page.getByLabel("Instructions", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Only my own instructions should appear here.");
  await page.getByRole("button", { name: /Rules/ }).click();
  await page
    .getByLabel("Acceptance requirements")
    .fill("Keep my custom acceptance requirements.");
  await page.getByLabel("Budget cap (demo units)").fill("7.25");
  await page.reload();
  await expect(page.getByLabel("Instructions", { exact: true })).toHaveValue(
    "Only my own instructions should appear here.",
  );
  await page.getByRole("button", { name: /Rules/ }).click();
  await expect(page.getByLabel("Acceptance requirements")).toHaveValue(
    "Keep my custom acceptance requirements.",
  );
  await expect(page.getByLabel("Budget cap (demo units)")).toHaveValue("7.25");
});
