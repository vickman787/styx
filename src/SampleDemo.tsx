import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Download, FlaskConical } from "lucide-react";
import type { Job } from "../lib/domain/types";
import { labels, money } from "../lib/domain/types";
import type { DeliveryReview } from "../lib/domain/review-types";
import "./sample-demo.css";

type Snapshot = {
  jobs: Job[];
  balance: { available: number; reserved: number; paid: number };
  expires: number;
  providers: { id: string; name: string; price: number }[];
};
const root = "/api/sample-demo";
export default function SampleDemo() {
  const csrf = useRef("");
  const [data, setData] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState("");
  const [review, setReview] = useState<DeliveryReview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [budget, setBudget] = useState("5.00");
  const [caseId, setCaseId] = useState("normal");
  const [showAll, setShowAll] = useState(false);
  const request = useCallback(async (path: string, body?: unknown) => {
    const response = await fetch(root + path, {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined
          ? {}
          : { "Content-Type": "application/json", "X-Styx-CSRF": csrf.current },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "Sample request failed.");
    return result;
  }, []);
  const open = useCallback(async () => {
    setError("");
    try {
      const session = await request("/session");
      csrf.current = session.csrf;
      setData(await request("/state"));
    } catch (problem) {
      setError((problem as Error).message);
    }
  }, [request]);
  // A single initialization survives StrictMode's effect replay without issuing two guests.
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      void open();
    }
  }, [open]);
  const job = data?.jobs.find((item) => item.id === selected) || data?.jobs[0];
  useEffect(() => {
    let active = true;
    setReview(null);
    setShowAll(false);
    if (job?.artifact)
      void request(`/jobs/${job.id}/review`)
        .then((result) => {
          if (active) setReview(result);
        })
        .catch((problem) => {
          if (active) setError(problem.message);
        });
    return () => {
      active = false;
    };
  }, [job?.id, job?.artifact?.hash, request]);
  async function perform(path: string, body: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result: Job = await request(path, body);
      setSelected(result.id);
      setData(await request("/state"));
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const provider = (id: string) =>
    data?.providers.find((item) => item.id === id)?.name || id;
  return (
    <div className="sample-demo">
      <header className="sample-header">
        <Link to="/" aria-label="STYX homepage">
          <img
            src="/brand/styx-original.png"
            alt="STYX"
            width={62}
            height={62}
          />
        </Link>
        <div>
          <strong>Sample workspace</strong>
          <small>Fictional invoices · local processing</small>
        </div>
        <Link className="button secondary" to="/app">
          Owner sign-in <ArrowUpRight size={15} />
        </Link>
      </header>
      <div className="sample-banner" role="note">
        <FlaskConical size={21} />
        <strong>
          Sample workspace · simulated payments · no blockchain transactions
        </strong>
      </div>
      <main id="main" className="sample-main">
        <Link className="back-link" to="/">
          <ArrowLeft size={15} />
          Back to website
        </Link>
        <h1>Try STYX with sample invoices</h1>
        <p className="sample-intro">
          Set a spending cap, compare service quotes, inspect a real CSV and
          decide whether to accept delivery. No wallet, sign-in, uploads or paid
          AI requests.
        </p>
        <p className="helper">
          Your isolated session lasts 30 minutes and supports five sample jobs.
          It is cleared on expiry or server restart. Do not enter private
          information.
        </p>
        {error && (
          <div className="notice warning" role="alert">
            {error}{" "}
            <button
              className="button secondary compact"
              disabled={busy}
              onClick={() => void open()}
            >
              Reconnect sample session
            </button>
          </div>
        )}
        {!data ? (
          <p role="status">
            {error
              ? "The demo could not open yet."
              : "Opening your sample workspace…"}
          </p>
        ) : (
          <>
            <section
              className="panel sample-section"
              aria-labelledby="sample-rules"
            >
              <h2 id="sample-rules">
                1. Load fictional invoices and set rules
              </h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void perform("/jobs", { caseId, budget });
                }}
              >
                <label>
                  Sample case
                  <select
                    value={caseId}
                    onChange={(event) => setCaseId(event.target.value)}
                  >
                    <option value="normal">Successful delivery</option>
                    <option value="arithmetic">Arithmetic mismatch</option>
                    <option value="missing_coverage">Missing invoice</option>
                    <option value="timeout">Provider timeout</option>
                  </select>
                </label>
                <label>
                  Maximum spend (demo units)
                  <input
                    type="number"
                    min="0.01"
                    max="10"
                    step="0.01"
                    required
                    value={budget}
                    onChange={(event) => setBudget(event.target.value)}
                  />
                </label>
                <button
                  className="button"
                  disabled={busy || data.jobs.length >= 5}
                >
                  {busy ? "Working…" : "Load 30 sample invoices"}
                </button>
              </form>
              <p className="helper">
                Both STYX-operated services are allowed. Caps below their quote
                prices prevent reservation. Only the selected quote is reserved.
              </p>
              <p className="sample-balance">
                Available:{" "}
                <strong>{money(data.balance.available)} demo units</strong> ·
                Reserved:{" "}
                <strong>{money(data.balance.reserved)} demo units</strong>
              </p>
            </section>
            {job && (
              <>
                <label className="sample-picker">
                  Sample job
                  <select
                    value={job.id}
                    onChange={(event) => setSelected(event.target.value)}
                  >
                    {data.jobs.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id} · {labels[item.state]}
                      </option>
                    ))}
                  </select>
                </label>
                <section
                  className="panel sample-section"
                  aria-labelledby="sample-agreement"
                >
                  <span className="eyebrow">
                    {job.id} · {labels[job.state]}
                  </span>
                  <h2 id="sample-agreement">2. Approve the sample rules</h2>
                  <p>{job.name}</p>
                  <dl className="sample-definition">
                    <div>
                      <dt>Spending cap</dt>
                      <dd>{money(job.cap)} demo units</dd>
                    </div>
                    <div>
                      <dt>Files</dt>
                      <dd>{job.uploads.length} fictional invoices</dd>
                    </div>
                    <div>
                      <dt>Allowed services</dt>
                      <dd>LedgerWorks and ParseLab</dd>
                    </div>
                    <div>
                      <dt>Payment policy</dt>
                      <dd>
                        Your acceptance after verification · local simulation
                      </dd>
                    </div>
                  </dl>
                  {job.state === "awaiting_approval" && (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        void perform(`/jobs/${job.id}/approve`, {
                          version: job.mandate.version,
                          hash: job.mandate.hash,
                        })
                      }
                    >
                      Approve sample rules
                    </button>
                  )}
                  {job.mandate.approvedAt && (
                    <p>
                      Sample rules approved. No wallet transaction was sent.
                    </p>
                  )}
                  <details>
                    <summary>Inspect sample input names</summary>
                    <ul>
                      {job.uploads.map((upload) => (
                        <li key={upload.id}>{upload.name}</li>
                      ))}
                    </ul>
                  </details>
                </section>
                {!!job.quotes.length && (
                  <section
                    className="panel sample-section"
                    aria-labelledby="sample-quotes"
                  >
                    <h2 id="sample-quotes">3. Compare service quotes</h2>
                    <p>
                      These quotes are in demo units. They are not NEAR prices.
                    </p>
                    <div className="sample-quotes">
                      {job.quotes.map((quote) => (
                        <article key={quote.id}>
                          <h3>{provider(quote.provider)}</h3>
                          <p>
                            <strong>{money(quote.price)} demo units</strong>
                          </p>
                          <p className="helper">STYX-operated sample service</p>
                          <button
                            className="button secondary"
                            disabled={
                              busy ||
                              job.state !== "quoted" ||
                              quote.price > job.cap
                            }
                            onClick={() =>
                              void perform(`/jobs/${job.id}/reserve`, {
                                quoteId: quote.id,
                              })
                            }
                          >
                            {quote.price > job.cap
                              ? "Above your cap"
                              : "Reserve demo units & process"}
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
                {job.error && (
                  <div role="alert" className="notice warning">
                    {job.error} No provider payment has been made for this
                    sample.
                  </div>
                )}
                {job.artifact && (
                  <section
                    className="panel sample-section"
                    aria-labelledby="sample-review"
                  >
                    <h2 id="sample-review">
                      4. Inspect delivery and verification
                    </h2>
                    <p>
                      {job.artifact.rows.length} rows delivered. Passing checks
                      do not establish invoice authenticity.
                    </p>
                    <a
                      className="button secondary"
                      href={`${root}/jobs/${job.id}/artifact`}
                    >
                      <Download size={15} />
                      Download sample CSV
                    </a>
                    <ul className="sample-checks">
                      {job.report?.checks.map((check) => (
                        <li key={check.name}>
                          <strong>
                            {check.pass ? "Passed" : "Failed"}: {check.name}
                          </strong>
                          <span>{check.detail}</span>
                        </li>
                      ))}
                    </ul>
                    {!!job.report?.uncertain.length && (
                      <p>
                        Missing/uncertain fields flagged:{" "}
                        {job.report.uncertain.length}
                      </p>
                    )}
                    {!!job.report?.duplicates.length && (
                      <p>
                        Duplicate indicators: {job.report.duplicates.length}
                      </p>
                    )}
                    <div
                      className="table-wrap"
                      tabIndex={0}
                      role="region"
                      aria-label="Sample invoice source comparisons"
                    >
                      <table>
                        <thead>
                          <tr>
                            <th>Invoice</th>
                            <th>Vendor</th>
                            <th>Delivered total</th>
                            <th>Source total</th>
                            <th>Review flags</th>
                          </tr>
                        </thead>
                        <tbody>
                          {review?.rows
                            .slice(0, showAll ? undefined : 8)
                            .map((row) => (
                              <tr key={row.number}>
                                <td>{row.values.invoice_id || "Missing ID"}</td>
                                <td>{row.values.vendor || "Not provided"}</td>
                                <td>
                                  {row.values.total} {row.values.currency}
                                </td>
                                <td>
                                  {row.original?.total ?? "Unknown source"}
                                </td>
                                <td>{row.flags.join(", ") || "—"}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    {review && (
                      <button
                        className="button secondary compact"
                        onClick={() => setShowAll(!showAll)}
                      >
                        {showAll
                          ? "Show first 8 rows"
                          : `Review all ${review.rows.length} rows`}
                      </button>
                    )}
                  </section>
                )}
                <section
                  className="panel sample-section"
                  aria-labelledby="sample-decision"
                >
                  <h2 id="sample-decision">5. Decide what happens next</h2>
                  {job.state === "ready_for_review" && (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => void perform(`/jobs/${job.id}/settle`, {})}
                    >
                      Accept delivery · simulate payment
                    </button>
                  )}
                  {!["settled", "cancelled", "refunded"].includes(
                    job.state,
                  ) && (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => void perform(`/jobs/${job.id}/cancel`, {})}
                    >
                      {job.selected
                        ? "Reject delivery & release demo reservation"
                        : "Cancel sample job"}
                    </button>
                  )}
                  {job.state === "settled" && (
                    <div className="notice" role="status">
                      <strong>Simulated payment complete</strong>
                      <p>
                        {money(job.receipt?.paid || 0)} demo units recorded for{" "}
                        {provider(job.selected!.provider)}. No NEAR was sent.
                        This is a local sample receipt, not blockchain proof.
                      </p>
                    </div>
                  )}
                  {["cancelled", "refunded"].includes(job.state) && (
                    <div className="notice" role="status">
                      Sample closed without a provider payment. Any reserved
                      demo units are available again.
                    </div>
                  )}
                  {!job.artifact &&
                    !["cancelled", "refunded"].includes(job.state) && (
                      <p>
                        Inspect a delivered CSV and passing checks before
                        simulated acceptance becomes available.
                      </p>
                    )}
                </section>
              </>
            )}
          </>
        )}
        <section
          className="panel sample-section sample-proof"
          aria-labelledby="sample-proof"
        >
          <h2 id="sample-proof">View real testnet proof</h2>
          <p>
            These are separate, earlier owner-completed agreements on NEAR
            testnet. Actions in this sample workspace do not create or change
            these transactions.
          </p>
          <a
            target="_blank"
            rel="noreferrer"
            href="https://testnet.nearblocks.io/txns/C6YDJehSFfu1P1nFpL8EL1H3LX9hbS3mkGteXA57G2uG"
          >
            Earlier payment · 0.012 testnet NEAR <ArrowUpRight size={14} />
          </a>
          <a
            target="_blank"
            rel="noreferrer"
            href="https://testnet.nearblocks.io/txns/ARcXLW2RA5NDnQVKidWjP3WEdo5VgUjKsEzthcUpqNoE"
          >
            Separate reservation release · no provider payment{" "}
            <ArrowUpRight size={14} />
          </a>
        </section>
      </main>
      <footer className="sample-footer">
        STYX sample demo · fictional data · simulated payments
      </footer>
    </div>
  );
}
