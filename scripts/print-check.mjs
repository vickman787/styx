import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
await page.goto("http://127.0.0.1:4173/app");
await page.waitForSelector("h1");
const state = await (
  await page.request.get("http://127.0.0.1:4173/api/state")
).json();
const job = state.jobs.find((j) => j.state === "settled");
await page.goto("http://127.0.0.1:4173/jobs/" + job.id + "/receipt");
await page.waitForSelector(".receipt");
await page.emulateMedia({ media: "print" });
await page.screenshot({
  path: "docs/design/screenshots/receipt-print.png",
  fullPage: true,
});
console.log("Print layout:", await page.locator(".receipt").boundingBox());
await browser.close();
