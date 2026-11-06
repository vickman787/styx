import { test, expect } from "@playwright/test";
import { Store } from "../../lib/storage/db.ts";
import { Service } from "../../lib/domain/service.ts";

for (const historical of [true, false]) {
  test(`saved invoice detail renders with ${historical ? "missing" : "complete"} timing`, async ({ page }) => {
    const store = new Store(":memory:");
    try {
      const job = await new Service(store).prepareTestnetSource({
        name: "Saved delivery timing regression",
        processing: "local",
        uploads: [{ name: "sample.json", content: JSON.stringify({
          invoice_id: "TIMING-1", vendor: "Example Studio", date: "2026-11-01",
          currency: "USD", subtotal: "100.00", tax: "10.00", total: "110.00",
        }) }],
      });
      expect(job.state).toBe("ready_for_review");
      if (historical) job.transitions = [{ state: "ready_for_review", at: job.updatedAt }];
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/state", async (route) => {
        const response = await route.fetch();
        await route.fulfill({ json: { ...(await response.json()), jobs: [job], events: [] } });
      });
      await page.goto(`/jobs/${job.id}`);
      await expect(page.getByRole("heading", { name: job.name, exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Delivered output" })).toBeVisible();
      await expect(page.getByText("TIMING-1", { exact: true })).toBeVisible();
      await expect(page.getByText(historical
        ? "Processing duration: Not recorded for this saved delivery"
        : /Processing duration: \d+\.\d{2}s measured/)).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { name: "Delivered output" })).toBeVisible();
      expect(errors).toEqual([]);
    } finally { store.db.close(); }
  });
}
