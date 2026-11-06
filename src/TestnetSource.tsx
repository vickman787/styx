import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
export default function TestnetSource({
  request,
  onCreated,
  model,
}: {
  request: (path: string, body?: any) => Promise<any>;
  onCreated: () => Promise<unknown>;
  model?: { ready: boolean; enabled: boolean; model: string | null };
}) {
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState<"local" | "near_ai">("local");
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    if (window.location.hash === "#upload")
      document.getElementById("upload")?.scrollIntoView({ block: "start" });
  }, []);
  const [created, setCreated] = useState<{
    id: string;
    state: string;
    error?: string;
    artifact?: { execution?: { engine: string; model?: string } };
  } | null>(null);
  return (
    <section
      id="upload"
      className="panel near-section"
      aria-label="Your invoice evidence"
    >
      <div className="panel-pad">
        <h2>Use your own invoices</h2>
        <p>
          Upload structured JSON or CSV invoices, choose local parsing or NEAR
          AI, and independently verify the delivery. Then select this delivery
          in a NEAR agreement and approve it with your wallet.
        </p>
        <p className="helper">
          Required fields: invoice_id, vendor, date (YYYY-MM-DD), currency,
          subtotal, tax, total. Amounts must be decimal strings. PDF/images are
          not supported.
        </p>
        <form
          className="near-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            setBusy(true);
            setError("");
            setCreated(null);
            void (async () => {
              try {
                if (
                  !files.length ||
                  files.length > 100 ||
                  files.some((f) => f.size > 1048576) ||
                  files.reduce((n, f) => n + f.size, 0) > 5242880
                )
                  throw Error(
                    "Choose 1–100 files, up to 1 MB each and 5 MB total.",
                  );
                const result = await request("/near/sources", {
                  name,
                  processing,
                  externalConsent: processing === "near_ai" && consent,
                  uploads: await Promise.all(
                    files.map(async (file) => ({
                      name: file.name,
                      content: await file.text(),
                    })),
                  ),
                });
                setCreated(result);
                await onCreated();
                setName("");
                setFiles([]);
                setConsent(false);
                form.reset();
              } catch (problem) {
                setError((problem as Error).message);
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          <label>
            Delivery name
            <input
              required
              minLength={3}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Invoice files
            <input
              required
              type="file"
              multiple
              accept=".json,.csv"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
          </label>
          <label>
            Invoice processing
            <select
              disabled={busy}
              value={processing}
              onChange={(event) => {
                setProcessing(event.target.value as "local" | "near_ai");
                setConsent(false);
              }}
            >
              <option value="local">Local structured parsing</option>
              <option value="near_ai" disabled={!model?.ready}>
                NEAR AI
                {model?.ready ? ` · ${model.model}` : " · setup required"}
              </option>
            </select>
          </label>
          {!model?.ready && (
            <p className="helper">
              AI is not configured. Create an account in the{" "}
              <a
                className="text-link"
                href="https://cloud.near.ai/"
                target="_blank"
                rel="noreferrer"
              >
                NEAR AI console
              </a>
              , then securely configure the server key and model. Local parsing
              remains available.
            </p>
          )}
          {processing === "near_ai" && (
            <>
              <p className="helper">
                The AI receives invoice fields, source references and notes. Up
                to 50 invoice rows and 64 KiB of normalized data. Actual API
                charges are separate from testnet escrow. Independent
                source/amount checks must still pass; the model cannot approve
                or release payment.
              </p>
              <label className="near-sample-toggle">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={busy}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                I approve sending these invoice fields to NEAR AI and the
                separate API usage charges.
              </label>
            </>
          )}
          {error && <p role="alert">{error}</p>}
          <button
            className="button"
            disabled={
              busy || (processing === "near_ai" && (!model?.ready || !consent))
            }
          >
            {busy ? "Preparing evidence…" : "Prepare invoice evidence"}
          </button>
        </form>
        {created && (
          <p role="status">
            {created.state === "ready_for_review"
              ? "Invoice evidence verified. "
              : "Invoice evidence needs review. "}
            {created.artifact?.execution?.engine === "near_ai" && (
              <>Processed with NEAR AI · {created.artifact.execution.model}. </>
            )}
            {created.error && <span>{created.error} </span>}
            <Link className="text-link" to={`/jobs/${created.id}/review`}>
              Inspect your invoices and CSV
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
