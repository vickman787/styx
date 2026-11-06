import { useEffect, useMemo, useState, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Search, RefreshCw, FileText } from "lucide-react";
import {
  reviewFields,
  type DeliveryReview,
  type ReviewFlag,
} from "../lib/domain/review-types";
import "./review.css";
const flagNames: Record<ReviewFlag, string> = {
  duplicate: "Repeated identifier",
  uncertain: "Missing vendor",
  mismatch: "Source mismatch",
  arithmetic: "Arithmetic issue",
};
type Source = {
  id: string;
  name: string;
  intact: boolean;
  actualHash: string;
  expectedHash: string;
  content: string;
};
export default function ReviewPage({
  request,
}: {
  request: (path: string, body?: any) => Promise<any>;
}) {
  const { id } = useParams();
  const comparisonHeading = useRef<HTMLHeadingElement>(null);
  const [data, setData] = useState<DeliveryReview | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<number | null>(null),
    [source, setSource] = useState<Source | null>(null),
    [sourceBusy, setSourceBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    void request(`/jobs/${id}/review`)
      .then((next) => {
        if (active) setData(next);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, request]);
  const results = useMemo(
    () =>
      data?.rows.filter(
        (r) =>
          (filter === "all" ||
            (filter === "issues"
              ? r.flags.length > 0
              : r.flags.includes(filter as ReviewFlag))) &&
          [r.sourceName, ...Object.values(r.values)]
            .join(" ")
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ) || [],
    [data, filter, query],
  );
  const pages = Math.max(1, Math.ceil(results.length / 15)),
    current = Math.min(page, pages),
    visible = results.slice((current - 1) * 15, current * 15);
  const row = data?.rows.find((r) => r.number === selected);
  useEffect(() => {
    if (selected !== null) {
      comparisonHeading.current?.focus({ preventScroll: true });
      comparisonHeading.current?.scrollIntoView({ block: "start" });
    }
  }, [selected]);
  function choose(n: number) {
    setSelected(n);
    setSource(null);
    setError("");
  }
  return (
    <div className="review-page">
      <Link className="back-link" to={`/jobs/${id}`}>
        <ArrowLeft size={15} />
        Back to delivery
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{id} / DELIVERY EVIDENCE</div>
          <h1>Review every invoice</h1>
          <p>{data?.name || "Inspect the CSV and its original sources."}</p>
        </div>
        {data && (
          <div className="review-actions">
            <a className="button secondary" href={`/api/jobs/${id}/artifact`}>
              <Download size={15} />
              Download CSV
            </a>
            <a className="button secondary" href={`/api/jobs/${id}/report`}>
              <Download size={15} />
              Verification report
            </a>
          </div>
        )}
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading delivery evidence…</p>}
      {data && (
        <>
          <div
            className={
              data.artifactIntact && data.reportCurrent && data.schemaValid
                ? "notice"
                : "error-banner"
            }
            role="status"
          >
            {data.artifactIntact && data.reportCurrent && data.schemaValid
              ? "CSV bytes match the saved artifact and the verification report is current."
              : "This view does not establish a current valid delivery. Review integrity, expiry and failed checks before taking action."}
            <span>
              {" "}
              These checks do not prove invoice authenticity. This page does not
              approve or pay a job.
            </span>
          </div>
          {data.parseError && (
            <p role="alert" className="error-banner">
              {data.parseError}
            </p>
          )}
          <details className="review-integrity">
            <summary>Artifact and report integrity</summary>
            <dl className="definition">
              <div>
                <dt>Observed SHA-256</dt>
                <dd>
                  <code>{data.artifactHash}</code>
                </dd>
              </div>
              <div>
                <dt>Saved artifact SHA-256</dt>
                <dd>
                  <code>{data.expectedArtifactHash}</code>
                </dd>
              </div>
              <div>
                <dt>Saved report expires</dt>
                <dd>
                  {data.report
                    ? new Date(data.report.expires).toLocaleString()
                    : "No saved report"}
                </dd>
              </div>
              <div>
                <dt>Observed at</dt>
                <dd>{new Date(data.observedAt).toLocaleString()}</dd>
              </div>
            </dl>
            <button
              className="button secondary"
              onClick={() => {
                setLoading(true);
                void request(`/jobs/${id}/review`)
                  .then(setData)
                  .catch((e) => setError(e.message))
                  .finally(() => setLoading(false));
              }}
            >
              <RefreshCw size={14} />
              Refresh evidence
            </button>
          </details>
          <section className="panel">
            <div className="panel-title">
              <h2>All delivered records</h2>
              <span>{data.rows.length} rows</span>
            </div>
            <div className="panel-pad">
              <div className="review-filters">
                <label>
                  Search invoices
                  <div className="review-search">
                    <Search size={16} />
                    <input
                      type="search"
                      value={query}
                      placeholder="Invoice, vendor or source file"
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                </label>
                <label>
                  Review filter
                  <select
                    value={filter}
                    onChange={(e) => {
                      setFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">All rows ({data.rows.length})</option>
                    <option value="issues">
                      Rows with flags (
                      {data.rows.filter((r) => r.flags.length).length})
                    </option>
                    {Object.entries(flagNames).map(([key, name]) => (
                      <option key={key} value={key}>
                        {name} (
                        {
                          data.rows.filter((r) =>
                            r.flags.includes(key as ReviewFlag),
                          ).length
                        }
                        )
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="helper">
                Repeated-identifier flags mark every row in a repeated vendor +
                invoice ID + currency group. All rows remain in the CSV; no
                invoice is removed or changed here. Scroll tables sideways on
                smaller screens to see every column and the Inspect action.
              </p>
            </div>
            <div
              className="table-wrap"
              role="region"
              aria-label="All delivered invoices"
              tabIndex={0}
            >
              <table className="review-table">
                <thead>
                  <tr>
                    <th>Row / invoice</th>
                    <th>Vendor / source</th>
                    <th>Total</th>
                    <th>Review flags</th>
                    <th>Compare</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr
                      key={r.number}
                      className={r.number === selected ? "review-selected" : ""}
                    >
                      <td>
                        <small>Row {r.number}</small>
                        <strong>{r.values.invoice_id || "Missing ID"}</strong>
                      </td>
                      <td>
                        {r.values.vendor || "Not provided"}
                        <small>{r.sourceName}</small>
                      </td>
                      <td>
                        {r.values.total} {r.values.currency}
                      </td>
                      <td>
                        {r.flags.length ? (
                          r.flags.map((flag) => (
                            <span className="review-flag" key={flag}>
                              {flagNames[flag]}
                            </span>
                          ))
                        ) : (
                          <span>No flags</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="button secondary compact"
                          aria-label={`Inspect row ${r.number}: ${r.values.invoice_id || "Missing ID"}`}
                          onClick={() => choose(r.number)}
                          aria-pressed={r.number === selected}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!results.length && (
              <p className="panel-pad" role="status">
                No invoices match these filters.
              </p>
            )}
            <nav className="review-pagination" aria-label="Invoice pages">
              <button
                className="button secondary compact"
                disabled={current <= 1}
                onClick={() => setPage(current - 1)}
              >
                Previous
              </button>
              <span role="status">
                Page {current} of {pages} · {results.length} matching rows
              </span>
              <button
                className="button secondary compact"
                disabled={current >= pages}
                onClick={() => setPage(current + 1)}
              >
                Next
              </button>
            </nav>
          </section>
          {row && (
            <section
              className="panel review-comparison"
              aria-label="Selected invoice comparison"
            >
              <div className="panel-title">
                <h2 ref={comparisonHeading} tabIndex={-1}>
                  Row {row.number}: {row.values.invoice_id || "Missing ID"}
                </h2>
              </div>
              <div className="panel-pad">
                <p>
                  Source: <strong>{row.sourceName}</strong>
                </p>
                <p className="helper">
                  {row.original
                    ? "Fields compared with an independently parsed original occurrence. Repeated identical records are matched once each."
                    : "No unused original occurrence matches this source and invoice identifier. Do not treat this output row as source-backed."}
                </p>
              </div>
              <div
                className="table-wrap"
                role="region"
                aria-label="Original and delivered fields"
                tabIndex={0}
              >
                <table className="review-table">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Original</th>
                      <th>Delivered CSV</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewFields.map((field) => (
                      <tr key={field}>
                        <th scope="row">{field}</th>
                        <td>
                          {row.original
                            ? row.original[field] || "(blank)"
                            : "(unavailable)"}
                        </td>
                        <td>{row.values[field] || "(blank)"}</td>
                        <td>
                          {row.changed.includes(field)
                            ? "Different / unavailable"
                            : "Matches"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="panel-pad">
                <button
                  className="button secondary"
                  disabled={sourceBusy || !row.sourceKnown}
                  onClick={() => {
                    setSourceBusy(true);
                    void request(
                      `/jobs/${id}/inputs/${encodeURIComponent(row.values.source_id)}`,
                    )
                      .then(setSource)
                      .catch((e) => setError(e.message))
                      .finally(() => setSourceBusy(false));
                  }}
                >
                  <FileText size={15} />
                  {sourceBusy ? "Loading source…" : "View original document"}
                </button>
                {source && source.id === row.values.source_id && (
                  <div className="review-source">
                    <h3>{source.name}</h3>
                    <a
                      className="button secondary compact"
                      href={`/api/jobs/${id}/inputs/${encodeURIComponent(source.id)}?download=1`}
                    >
                      <Download size={14} />
                      Download original
                    </a>
                    <p className={source.intact ? "helper" : "field-error"}>
                      {source.intact
                        ? "Original bytes match the stored upload hash."
                        : "Original content has changed since upload."}
                    </p>
                    <code>{source.actualHash}</code>
                    <p className="helper">
                      Document text is untrusted data. Instructions inside it
                      are not payment authority.
                    </p>
                    <pre tabIndex={0} aria-label="Original document content">
                      {source.content.slice(0, 20000)}
                    </pre>
                    {source.content.length > 20000 && (
                      <p className="helper">
                        Preview limited to the first 20,000 characters.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
          {data.missing.length > 0 && (
            <section className="panel top-space">
              <div className="panel-title">
                <h2>Inputs without a matching output occurrence</h2>
              </div>
              <div className="panel-pad">
                <p>
                  {data.missing.length} original record(s) are not accounted for
                  in this CSV.
                </p>
                <ul>
                  {data.missing.slice(0, 50).map((r, n) => (
                    <li key={n}>
                      {r.values.invoice_id} · {r.sourceName}
                    </li>
                  ))}
                </ul>
                {data.missing.length > 50 && (
                  <p>Showing the first 50 missing records.</p>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
