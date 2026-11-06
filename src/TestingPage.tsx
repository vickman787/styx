import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, FlaskConical, RefreshCw } from "lucide-react";
import { localCases } from "../lib/domain/local-cases";
import { labels, type Job } from "../lib/domain/types";
import "./testing.css";

function destination(job: Job) {
  if (job.state === "awaiting_approval") return `/jobs/${job.id}/mandate`;
  if (job.state === "quoted") return `/jobs/${job.id}/quotes`;
  if (job.state === "blocked") return `/jobs/${job.id}/security`;
  if (job.state === "settled") return `/jobs/${job.id}/receipt`;
  return `/jobs/${job.id}`;
}
export default function TestingPage({
  jobs,
  viewer,
  request,
  refresh,
}: {
  jobs: Job[];
  viewer: boolean;
  request: (path: string, body?: any) => Promise<any>;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState("");
  const navigate = useNavigate();
  const started = new Set(jobs.map((job) => job.localTestCase).filter(Boolean))
    .size;
  async function start(caseId: string) {
    if (busy || viewer) return;
    setBusy(caseId);
    setError("");
    try {
      const job = (await request("/testing/jobs", { caseId })) as Job;
      await refresh();
      navigate(destination(job));
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORKSPACE / LOCAL TESTING</div>
          <h1>Local testing</h1>
          <p>
            Try the full workflow with synthetic invoices and real local job
            states.
          </p>
        </div>
        <Link className="button secondary" to="/jobs">
          View jobs <ArrowRight size={16} />
        </Link>
      </div>
      <section
        className="panel testing-guide"
        aria-labelledby="testing-guide-title"
      >
        <FlaskConical size={24} aria-hidden="true" />
        <div>
          <h2 id="testing-guide-title">
            Choose a case, then make the owner decisions
          </h2>
          <p>
            Each new test loads 30 sample files with a 5.00 demo-unit cap.
            Starting a case creates a job awaiting approval. You approve its
            mandate, select a quote and inspect delivery.
          </p>
          <p>
            These cases always use local processing. No wallet, AI key or cloud
            storage is needed. Reserving and accepting still affect your
            workspace’s demo balance; cancel unfinished tests to release held
            funds.
          </p>
          <strong>
            {started} of {localCases.length} cases started
          </strong>
          <span className="helper">
            This is progress through sample cases, not a claim that tests
            passed.
          </span>
          <p>
            Want to try your wallet?{" "}
            <Link className="text-link" to="/testnet">
              Connect a NEAR testnet wallet
            </Link>
            . Wallet connection works separately; escrow payments need a
            configured testnet contract.
          </p>
        </div>
      </section>
      {error && (
        <div className="notice warning" role="alert">
          {error}
        </div>
      )}
      {viewer && (
        <div className="notice">
          Viewer access can inspect existing runs. An owner must start a new
          test job.
        </div>
      )}
      <div className="testing-grid">
        {localCases.map((item) => {
          const runs = jobs
            .filter((job) => job.localTestCase === item.id)
            .sort((a, b) => b.createdAt - a.createdAt);
          const latest = runs[0];
          return (
            <section
              className="panel testing-case"
              key={item.id}
              aria-labelledby={`case-${item.id}`}
            >
              <div className="testing-case-top">
                <span className="eyebrow">SAMPLE CASE</span>
                <span className="helper">
                  {runs.length
                    ? `${runs.length} run${runs.length === 1 ? "" : "s"}`
                    : "Not started"}
                </span>
              </div>
              <h2 id={`case-${item.id}`}>{item.title}</h2>
              <p>{item.description}</p>
              <div className="testing-expectation">
                <h3>What to check</h3>
                <p>{item.expected}</p>
                <p>{item.next}</p>
              </div>
              {latest && (
                <div className="testing-latest">
                  <span>
                    Latest run <strong>{latest.id}</strong>
                  </span>
                  <span className="status">{labels[latest.state]}</span>
                  <Link className="text-link" to={destination(latest)}>
                    Continue latest run <ArrowRight size={14} />
                  </Link>
                </div>
              )}
              <button
                className="button"
                disabled={viewer || busy !== null}
                onClick={() => void start(item.id)}
              >
                {busy === item.id ? (
                  <>
                    <RefreshCw size={16} />
                    Creating job…
                  </>
                ) : (
                  <>
                    {latest ? "Start another run" : "Start this case"}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </section>
          );
        })}
      </div>
    </>
  );
}
