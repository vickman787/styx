import { mkdirSync, writeFileSync } from "node:fs";
import { Store } from "../lib/storage/db.ts";
import { Service } from "../lib/domain/service.ts";
import { NearAIClient } from "../lib/providers/model.ts";
import { validReport } from "../lib/verification/index.ts";

async function main() {
  const model = new NearAIClient();
  const status = model.status();
  if (process.argv[2] !== "--smoke") {
    console.log(
      JSON.stringify({
        ...status,
        liveInferenceVerified: false,
        next: "ai:smoke makes one real request with a synthetic invoice and can incur API usage charges.",
      }),
    );
    return;
  }
  if (!status.ready)
    throw Error(
      "AI is not configured. Run npm run ai:setup privately, then retry.",
    );
  const store = new Store(":memory:");
  try {
    const service = new Service(store, model);
    const job = await service.prepareTestnetSource(
      {
        name: "AI integration check",
        processing: "near_ai",
        externalConsent: true,
        uploads: [
          {
            name: "integration-check.json",
            content: JSON.stringify({
              invoice_id: "AI-INTEGRATION-CHECK",
              vendor: "Synthetic integration check",
              date: "2026-10-27",
              currency: "USD",
              subtotal: "10.00",
              tax: "1.00",
              total: "11.00",
            }),
          },
        ],
      },
      "operator-live-ai-check",
    );
    const passed =
      job.state === "ready_for_review" &&
      validReport(job) &&
      job.artifact?.execution?.engine === "near_ai";
    const report = {
      passed,
      endpoint: status.endpoint,
      model: status.model,
      checkedAt: new Date().toISOString(),
      input: "One synthetic invoice; no customer files",
      engine: job.artifact?.execution?.engine || null,
      independentChecks:
        job.report?.checks.map((check) => ({
          name: check.name,
          pass: check.pass,
        })) || [],
      paymentMade: false,
      failure: passed
        ? null
        : job.error || "Independent verification did not pass.",
      limitation:
        "One actual extraction check; no model attestation proof or quality certification.",
    };
    mkdirSync("docs/verification", { recursive: true });
    writeFileSync(
      "docs/verification/ai-live-check.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
    if (!passed)
      throw Error(
        "Live AI check failed. The model response did not pass independent verification. No fallback or payment occurred; investigate before retrying.",
      );
  } finally {
    store.close();
  }
}
main().catch((error) => {
  console.error(
    String(error?.message || "AI check failed").replace(
      /Bearer\s+\S+/gi,
      "[credential redacted]",
    ),
  );
  process.exitCode = 1;
});
