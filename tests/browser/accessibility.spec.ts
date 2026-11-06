import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
test("WCAG checks and keyboard entry on desktop/mobile screens", async ({
  page,
}) => {
  test.setTimeout(180000);
  const findings: any[] = [];
  const checked: any[] = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app");
    await expect(page.locator("h1")).toBeVisible();
    const state = await (await page.request.get("/api/state")).json();
    const delivery = state.jobs.find(
      (j: any) => j.state === "ready_for_review",
    );
    const blocked = state.jobs.find((j: any) => j.state === "blocked");
    const settled = state.jobs.find((j: any) => j.state === "settled");
    const draft = state.jobs.find((j: any) => j.state === "awaiting_approval");
    const routes = [
      "/",
      "/app",
      "/jobs/new",
      "/providers",
      "/activity",
      "/settings",
      "/testnet",
      ...(delivery ? [`/jobs/${delivery.id}`] : []),
      ...(blocked ? [`/jobs/${blocked.id}/security`] : []),
      ...(settled
        ? [`/jobs/${settled.id}/receipt`, `/jobs/${settled.id}/quotes`]
        : []),
      ...(draft ? [`/jobs/${draft.id}/mandate`] : []),
    ];
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("main h1")).toBeVisible();
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      checked.push({ width, route, violations: result.violations.length });
      writeFileSync(
        "docs/design/accessibility-results.json",
        JSON.stringify({ checked, findings }, null, 2),
      );
      for (const v of result.violations)
        findings.push({
          width,
          route,
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            message: n.failureSummary,
          })),
        });
    }
    await page.goto("/app");
    await expect(page.locator("main h1")).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).toBeFocused();
  }
  writeFileSync(
    "docs/design/accessibility-results.json",
    JSON.stringify({ checked, findings }, null, 2),
  );
  expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
});
