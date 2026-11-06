import { test, expect } from "@playwright/test";

test("uncertain submissions are visible and reconciliation uses the saved request without a new signing request", async ({
  page,
}) => {
  let confirmed = false;
  let reconciliations = 0;
  const hash = "A".repeat(44);
  await page.route("**/api/near", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const job = [...body.executions, ...(body.archivedExecutions || [])].find(
      (e: any) => e.state === "Paid",
    );
    const base = [...body.intents, ...(body.archivedIntents || [])].find(
      (i: any) => i.executionId === job.id && i.action === "release",
    );
    const unresolved = {
      ...base,
      id: "UNCERTAIN-SUBMISSION",
      state: "submitted",
      txHash: undefined,
      createdAt: 1,
    };
    const known = {
      ...base,
      id: "KNOWN-SUBMISSION",
      state: confirmed ? "confirmed" : "submitted",
      txHash: hash,
      createdAt: 2,
    };
    const history = Array.from({ length: 14 }, (_, i) => ({
      ...base,
      id: `HISTORY-${i}`,
      state: "confirmed",
      createdAt: Date.now() - i,
    }));
    await route.fulfill({
      json: {
        ...body,
        archivedExecutions: [],
        executions: [job],
        intents: [...history, unresolved, known],
      },
    });
  });
  await page.route("**/api/near/intents/KNOWN-SUBMISSION/confirm", (route) => {
    expect(route.request().postDataJSON()).toEqual({ txHash: hash });
    reconciliations++;
    confirmed = true;
    return route.fulfill({ json: { state: "confirmed" } });
  });
  let newSigningRequests = 0;
  await page.route("**/api/near/intents", (route) => {
    newSigningRequests++;
    return route.abort();
  });
  await page.goto("/testnet");
  await expect(
    page.getByText("Submission outcome is unknown.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Saved signing request").locator("option"),
  ).toContainText(["Choose a request", "release", "release"]);
  const known = page
    .locator(".near-request-list > div")
    .filter({ has: page.locator("code", { hasText: hash }) });
  await known.getByRole("button", { name: "Reconcile", exact: true }).click();
  await expect(
    page.getByText("Finalized and reconciled.", { exact: true }),
  ).toBeVisible();
  expect(reconciliations).toBe(1);
  expect(newSigningRequests).toBe(0);
});
