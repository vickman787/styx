import React, {
  useEffect,
  useState,
  useCallback,
  createContext,
  useContext,
} from "react";
import {
  Routes,
  Route,
  Navigate,
  NavLink,
  Link,
  useNavigate,
  useParams,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import {
  LayoutDashboard,
  BriefcaseBusiness,
  Users,
  Activity,
  Settings,
  Plus,
  ArrowUpRight,
  ArrowLeft,
  ChevronRight,
  Search,
  Download,
  FileText,
  Check,
  CheckCircle2,
  AlertTriangle,
  Clock3,
  LockKeyhole,
  ArrowRight,
  ShieldCheck,
  Wallet,
  X,
  Menu,
  Printer,
  RefreshCw,
  Pause,
  CircleDot,
  ExternalLink,
  FlaskConical,
} from "lucide-react";
import type { Job, Quote } from "../lib/domain/types";
import { labels, money } from "../lib/domain/types";
import "./styles.css";
import NearPage from "./NearPage";
import ReviewPage from "./ReviewPage";
import TestingPage from "./TestingPage";
import WalletControl from "./WalletControl";
import TestnetProviders from "./TestnetProviders";
import { SignIn, AccountPanel, accessChanged } from "./Access";
import type { Access } from "../lib/auth/service";
type Snapshot = {
  auth?: Access;
  jobs: Job[];
  balance: {
    available: number;
    reserved: number;
    spent: number;
    funding: number;
  };
  events: any[];
  workspace: { name: string };
  providers: {
    id: string;
    name: string;
    recipient: string;
    price: number;
    seconds: number;
  }[];
  testnet?: { ready: boolean; contractId: string | null };
  model?: {
    ready: boolean;
    enabled: boolean;
    model: string | null;
    endpoint: string;
  };
};
const Context = createContext<{
  data: Snapshot;
  refresh: () => Promise<void>;
  act: (id: string, action: string, body?: any) => Promise<Job>;
  busy: boolean;
  error: string;
  setError: (v: string) => void;
}>(null!);
let csrf = "";
async function api(path: string, body?: any) {
  const r = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-Styx-CSRF": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (
    (r.status === 401 && path !== "/auth/login") ||
    (r.status === 403 && data.error === "CSRF validation failed.")
  )
    window.dispatchEvent(new Event("styx-access-expired"));
  if (!r.ok) throw Error(data.error || "Request failed.");
  return data;
}
const date = (n: number) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(n);
function Status({ state }: { state: Job["state"] }) {
  return (
    <span
      className={`status ${["settled", "ready_for_review"].includes(state) ? "good" : ["blocked", "failed", "expired"].includes(state) ? "warn" : ["running", "verifying"].includes(state) ? "info" : ""}`}
    >
      <i />
      {labels[state]}
    </span>
  );
}
function Logo() {
  return (
    <img
      className="logo"
      src="/brand/styx-original.png"
      alt="STYX — interlocking ivory and mint S"
    />
  );
}
function Button({
  children,
  onClick,
  secondary = false,
  danger = false,
  disabled = false,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  secondary?: boolean;
  danger?: boolean;
}) {
  const ctx = useContext(Context);
  return (
    <button
      type={type}
      className={`button ${secondary ? "secondary" : ""} ${danger ? "danger" : ""}`}
      disabled={disabled || ctx?.busy}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}
function Panel({
  title,
  extra,
  children,
  className = "",
}: {
  title?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      {title && (
        <div className="panel-title">
          <h2>{title}</h2>
          {extra}
        </div>
      )}
      {children}
    </section>
  );
}
function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
function Notice({
  children,
  danger = false,
}: {
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className={"notice " + (danger ? "warning" : "")}>
      <AlertTriangle size={17} />
      <div>{children}</div>
    </div>
  );
}
export default function App() {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [session, setSession] = useState<Access | null>(null);
  const location = useLocation();
  const refresh = useCallback(async () => {
    const next = await api("/state");
    setData(next);
  }, []);
  useEffect(() => {
    const open = () => {
      setData(null);
      api("/session")
        .then((s) => {
          csrf = s.csrf;
          setSession(s);
          if (s.authenticated) return refresh();
        })
        .catch((e) => setError(e.message));
    };
    open();
    window.addEventListener("styx-access-expired", open);
    const changed = (e: StorageEvent) => {
      if (e.key === "styx-access-change") window.location.reload();
    };
    window.addEventListener("storage", changed);
    return () => {
      window.removeEventListener("styx-access-expired", open);
      window.removeEventListener("storage", changed);
    };
  }, [refresh]);
  useEffect(() => {
    setMenu(false);
    setError("");
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    if (
      !data?.jobs.some((j) =>
        ["running", "verifying", "settlement_pending"].includes(j.state),
      )
    )
      return;
    const timer = setInterval(
      () => void refresh().catch((e) => setError(e.message)),
      700,
    );
    return () => clearInterval(timer);
  }, [data, refresh]);
  async function act(id: string, action: string, body: any = {}) {
    if (data?.auth?.role === "viewer")
      throw Error(
        "Viewer access is read-only. An owner must perform this action.",
      );
    setBusy(true);
    setError("");
    try {
      const j = await api(`/jobs/${id}/${action}`, body);
      await refresh();
      return j;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  if (session?.authMode === "password" && !session.authenticated)
    return (
      <SignIn
        request={api}
        onSignedIn={() => accessChanged(location.pathname + location.search)}
      />
    );
  if (!data)
    return (
      <main className="boot" role="status">
        <Logo />
        <p>{error || "Opening your workspace…"}</p>
        {error && (
          <button onClick={() => window.location.reload()}>Reload</button>
        )}
      </main>
    );
  const nav = [
    { to: "/app", label: "Overview", icon: LayoutDashboard },
    {
      to: "/jobs",
      label: "Invoice deliveries",
      icon: BriefcaseBusiness,
    },
    { to: "/providers", label: "Providers", icon: Users },
    { to: "/activity", label: "Activity", icon: Activity },
    { to: "/testing", label: "Local testing", icon: FlaskConical },
    { to: "/testnet", label: "Testnet escrow", icon: Wallet },
    { to: "/settings", label: "Settings", icon: Settings },
  ];
  return (
    <Context value={{ data, refresh, act, busy, error, setError }}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside
        aria-label="Workspace navigation"
        className={"sidebar " + (menu ? "open" : "")}
      >
        <Link
          to="/"
          aria-label="STYX homepage"
          title="Back to homepage"
          className="brand"
        >
          <Logo />
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <NavLink end={n.to === "/app"} key={n.to} to={n.to}>
              <n.icon size={18} />
              {n.label}
              {n.to === "/jobs" && (
                <span className="nav-count">
                  {
                    data.jobs.filter(
                      (job) => job.sourceOnly && job.state !== "cancelled",
                    ).length
                  }
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-proof">
            <ShieldCheck size={17} />
            <div>
              Owner stays in control<small>Every payment needs approval</small>
            </div>
          </div>
          <div
            className="workspace-identity"
            role="group"
            aria-label="Current workspace"
          >
            <span className="avatar">
              <BriefcaseBusiness size={19} aria-hidden="true" />
            </span>
            <span>
              {data.workspace.name}
              <small>Local workspace</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="app-shell">
        <header className="toolbar">
          <div className="mobile-brand">
            <Link
              to="/"
              aria-label="STYX homepage"
              title="Back to homepage"
              className="mobile-wordmark"
            >
              STYX
            </Link>
            <button
              className="icon-button"
              onClick={() => setMenu(!menu)}
              aria-label="Toggle navigation"
              aria-expanded={menu}
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
          <div className="breadcrumb">
            {data.workspace.name}
            <ChevronRight size={13} />
            <span>
              {location.pathname === "/app"
                ? "Overview"
                : location.pathname
                    .split("/")[1]
                    ?.replace(/^./, (x) => x.toUpperCase())}
            </span>
          </div>
          <div className="toolbar-right">
            <span className="mode">
              <i />
              NEAR testnet
            </span>
            <WalletControl request={api} />
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {data.auth?.role === "viewer" && (
            <Notice>
              Viewer access · you can inspect this workspace and download its
              files. An owner must create jobs, change settings or approve
              payments.
            </Notice>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {busy && (
            <div className="working" role="status">
              Saving changes…
            </div>
          )}
          <Routes>
            <Route
              path="/testing"
              element={
                <TestingPage
                  jobs={data.jobs}
                  viewer={data.auth?.role === "viewer"}
                  request={api}
                  refresh={refresh}
                />
              }
            />
            <Route
              path="/app"
              element={<NearPage request={api} onSourceCreated={refresh} />}
            />
            <Route path="/demo" element={<Overview />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/jobs/new" element={<JobEntry />} />
            <Route path="/jobs/:id/mandate" element={<Mandate />} />
            <Route path="/jobs/:id/quotes" element={<Quotes />} />
            <Route path="/jobs/:id/security" element={<Security />} />
            <Route path="/jobs/:id/receipt" element={<Receipt />} />
            <Route
              path="/jobs/:id/review"
              element={<ReviewPage request={api} />}
            />
            <Route path="/jobs/:id" element={<Detail />} />
            <Route path="/providers" element={<Providers />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route
              path="/testnet"
              element={<NearPage request={api} onSourceCreated={refresh} />}
            />
            <Route
              path="*"
              element={
                <Heading title="Page not found">
                  <Link className="button" to="/app">
                    Back to overview
                  </Link>
                </Heading>
              }
            />
          </Routes>
          <footer className="footer">
            <Link to="/">STYX / Back to website</Link>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <NavLink to="/jobs">
          <BriefcaseBusiness size={20} />
          Jobs
        </NavLink>
        <NavLink to="/activity">
          <Clock3 size={20} />
          Activity
        </NavLink>
        <NavLink to="/settings">
          <Settings size={20} />
          Settings
        </NavLink>
      </nav>
    </Context>
  );
}
function Stats() {
  const { data } = useContext(Context);
  return (
    <div className="stats">
      {[
        {
          label: "Available funds",
          n: data.balance.available,
          icon: Wallet,
          sub: "Ready to allocate",
        },
        {
          label: "Reserved funds",
          n: data.balance.reserved,
          icon: LockKeyhole,
          sub: "Held for active jobs",
        },
        {
          label: "Total spending",
          n: data.balance.spent,
          icon: ArrowUpRight,
          sub: "Accepted deliveries",
        },
      ].map((s) => (
        <div className="stat" key={s.label}>
          <div className="stat-label">
            <s.icon size={17} />
            {s.label}
          </div>
          <div className="stat-value">
            {money(s.n)}
            <span>demo units</span>
          </div>
          <small>{s.sub}</small>
        </div>
      ))}
    </div>
  );
}
function JobTable({ all = false }: { all?: boolean }) {
  const { data } = useContext(Context);
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all");
  const jobs = data.jobs.filter(
    (j) =>
      (!all ||
        (j.sourceOnly &&
          (j.state !== "cancelled" || status === "cancelled"))) &&
      (j.name + " " + j.id + " " + (j.selected?.provider || ""))
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === "all" || j.state === status),
  );
  return (
    <Panel
      title={all ? "Invoice deliveries" : "Jobs"}
      extra={
        !all && (
          <Link className="text-link" to="/jobs">
            View all <ArrowUpRight size={14} />
          </Link>
        )
      }
    >
      <div className="table-tools">
        <div className="search">
          <Search size={16} />
          <input
            aria-label="Search jobs"
            placeholder="Search jobs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          {[...new Set(data.jobs.map((j) => j.state))].map((s) => (
            <option value={s} key={s}>
              {labels[s]}
            </option>
          ))}
        </select>
      </div>
      <div
        className="table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Scrollable table"
      >
        <table className="jobs-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Provider</th>
              <th>Budget cap</th>
              <th>Status</th>
              <th>Updated</th>
              <th>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td>
                  <Link className="job-name" to={routeFor(j)}>
                    {j.name}
                  </Link>
                  <small>
                    {j.id} · {j.uploads.length} file
                    {j.uploads.length !== 1 ? "s" : ""}
                  </small>
                </td>
                <td>
                  {j.selected ? (
                    <span className="provider-inline">
                      <span
                        className={"provider-avatar " + j.selected.provider}
                      >
                        {j.selected.provider === "ledgerworks" ? "LW" : "PL"}
                      </span>
                      {providerName(j.selected.provider)}
                    </span>
                  ) : (
                    <span className="muted">Not selected</span>
                  )}
                </td>
                <td>
                  <strong>
                    {j.sourceOnly ? "NEAR agreement" : money(j.cap)}
                  </strong>
                  <small>
                    {j.sourceOnly ? "priced separately" : "demo units"}
                  </small>
                </td>
                <td>
                  <Status state={j.state} />
                </td>
                <td className="muted">{date(j.updatedAt)}</td>
                <td>
                  <Link
                    className="icon-button"
                    to={routeFor(j)}
                    aria-label={"Open " + j.name}
                  >
                    <ChevronRight size={18} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!jobs.length && (
        <div className="empty">
          <BriefcaseBusiness size={28} />
          <h3>
            {query || status !== "all"
              ? "No matching jobs"
              : all
                ? "No invoice deliveries yet"
                : "Your first job starts here"}
          </h3>
          <p>
            {all
              ? "Upload an invoice to prepare and check its CSV. Your processed invoices will appear here."
              : "Create a practice job, set its spending rules, and inspect delivery before paying."}
          </p>
          <Link
            to={all ? "/testnet#upload" : "/jobs/new?local=1"}
            className="button"
          >
            <Plus size={16} />
            {all ? "Upload invoices" : "Create practice job"}
          </Link>
        </div>
      )}
      <div className="table-foot">
        <span>
          {jobs.length} job{jobs.length !== 1 ? "s" : ""}
        </span>
        <span>
          {all
            ? "NEAR payment is approved in the testnet agreement"
            : "Amounts in demo units"}
        </span>
      </div>
    </Panel>
  );
}
function providerName(id: string) {
  return id === "ledgerworks" ? "LedgerWorks" : "ParseLab";
}
function routeFor(j: Job) {
  return j.state === "awaiting_approval"
    ? `/jobs/${j.id}/mandate`
    : j.state === "quoted"
      ? `/jobs/${j.id}/quotes`
      : j.state === "blocked"
        ? `/jobs/${j.id}/security`
        : j.state === "settled"
          ? `/jobs/${j.id}/receipt`
          : `/jobs/${j.id}`;
}
function EventList({ events }: { events: any[] }) {
  return (
    <div className="event-list">
      {events.map((e) => (
        <div className="event" key={e.id}>
          <span
            className={
              "event-icon " +
              (["blocked", "rejected", "provider_failed"].includes(e.kind)
                ? "amber"
                : "")
            }
          >
            {e.kind === "settled" ? (
              <Check size={15} />
            ) : e.kind === "blocked" ? (
              <LockKeyhole size={15} />
            ) : (
              <CircleDot size={15} />
            )}
          </span>
          <div>
            <p>{e.message}</p>
            {e.job_id && <Link to={`/jobs/${e.job_id}`}>{e.job_id}</Link>}
            <small>{date(e.at)}</small>
          </div>
        </div>
      ))}
      {!events.length && (
        <p className="empty">
          No activity yet. Events appear as jobs progress.
        </p>
      )}
    </div>
  );
}
function Overview() {
  const { data } = useContext(Context);
  const pending = data.jobs.filter((j) =>
    ["awaiting_approval", "ready_for_review"].includes(j.state),
  ).length;
  return (
    <>
      <Heading
        eyebrow="YOUR WORKSPACE"
        title="Overview"
        description="Every job, every allocation, every decision."
      >
        <Link to="/jobs/new?local=1" className="button">
          <Plus size={17} />
          Create job
        </Link>
      </Heading>
      <Stats />
      <div className="notice">
        <FlaskConical size={18} />
        <div>
          Testing locally?{" "}
          <Link className="text-link" to="/testing">
            Open sample workflow cases
          </Link>{" "}
          to try successful delivery and payment protections.
        </div>
      </div>
      <div className="overview-grid">
        <div>
          <JobTable />
          <div className="workflow-note">
            <ShieldCheck size={24} />
            <div>
              <h3>
                {pending
                  ? `${pending} job${pending > 1 ? "s" : ""} waiting for your review`
                  : "Your rules govern every payment"}
              </h3>
              <p>
                Approve a mandate, reserve an agreed price, and accept a
                verified delivery.
              </p>
            </div>
            <Link to="/jobs" aria-label="Review jobs">
              <ArrowRight size={19} />
            </Link>
          </div>
        </div>
        <Panel
          title="Recent activity"
          extra={<span className="count">{data.events.length}</span>}
        >
          <EventList events={data.events.slice(0, 5)} />
          <Link className="panel-link" to="/activity">
            View all activity
            <ArrowRight size={15} />
          </Link>
        </Panel>
      </div>
      <div className="section-caption">HOW STYX WORKS</div>
      <div className="process-strip">
        {[
          "Set the rules",
          "Reserve a quote",
          "Verify delivery",
          "Approve payment",
        ].map((s, i) => (
          <div key={s}>
            <span>0{i + 1}</span>
            <strong>{s}</strong>
            {i < 3 && <ChevronRight size={16} />}
          </div>
        ))}
      </div>
    </>
  );
}
function Jobs() {
  return (
    <>
      <Heading
        eyebrow="WORKSPACE / JOBS"
        title="Jobs"
        description="Track work from the first brief to the final receipt."
      >
        <Link to="/testnet#upload" className="button">
          <Plus size={17} />
          Upload invoices
        </Link>
      </Heading>
      <JobTable all />
    </>
  );
}
const defaultForm = {
  name: "",
  instructions: "",
  budget: "",
  deadline: "",
  allowedProviders: [] as string[],
  requirements: "",
  uploads: [] as { name: string; content: string }[],
  scenario: "normal",
  processing: "local",
  externalConsent: false,
};
function JobEntry() {
  const [params] = useSearchParams();
  const { data } = useContext(Context);
  const draft = data.jobs.find((job) => job.id === params.get("draft"));
  return params.get("local") === "1" || (draft && !draft.sourceOnly) ? (
    <CreateJob />
  ) : (
    <Navigate to="/testnet#upload" replace />
  );
}
function CreateJob() {
  const { data, refresh, setError } = useContext(Context);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get("draft");
  const draftKey =
    data.auth?.authMode === "password"
      ? `styx-draft:${data.auth.userId}:${data.auth.workspaceId}`
      : "styx-draft";
  const [editedFields, setEditedFields] = useState<string[]>(() => {
    try {
      return (
        JSON.parse(localStorage.getItem(draftKey) || "{}").editedFields || []
      );
    } catch {
      return [];
    }
  });
  const [form, setForm] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(draftKey) || "{}");
      // Old autosaves included template values even when nobody typed them.
      // Remove that known template while retaining custom text and uploads.
      const legacy = { ...(stored.version === 2 ? stored.form : stored) };
      const ownerEdited = (field: string) =>
        stored.editedFields?.includes(field);
      const presetInstructions =
        legacy.instructions ===
        "Convert these invoices into an accounting CSV. Account for every invoice, reconcile totals, and flag duplicates and uncertain fields.";
      const presetRequirements =
        legacy.requirements ===
        "CSV schema; complete invoice coverage; arithmetic reconciliation; duplicate and uncertainty flags.";
      if (presetInstructions && !ownerEdited("instructions"))
        legacy.instructions = "";
      if (presetRequirements && !ownerEdited("requirements"))
        legacy.requirements = "";
      if (presetInstructions && presetRequirements) {
        if (legacy.budget === "5.00" && !ownerEdited("budget"))
          legacy.budget = "";
        if (
          !ownerEdited("deadline") &&
          (!legacy.deadline ||
            new Date(legacy.deadline).getTime() <= Date.now())
        )
          legacy.deadline = "";
        if (
          JSON.stringify(legacy.allowedProviders) ===
            '["ledgerworks","parselab"]' &&
          !ownerEdited("allowedProviders")
        )
          legacy.allowedProviders = [];
      }
      return {
        ...defaultForm,
        ...legacy,
      };
    } catch {
      return defaultForm;
    }
  });
  useEffect(() => {
    if (draftId) {
      setEditedFields(Object.keys(defaultForm));
      api("/jobs/" + draftId + "/draft")
        .then((j) =>
          setForm({
            name: j.name,
            instructions: j.instructions,
            budget: money(j.cap),
            deadline: new Date(
              j.deadline - new Date().getTimezoneOffset() * 60000,
            )
              .toISOString()
              .slice(0, 16),
            allowedProviders: j.allowedProviders,
            requirements: j.requirements,
            scenario: j.scenario,
            processing: j.mandate.processing?.engine || "local",
            externalConsent: j.mandate.processing?.engine === "near_ai",
            uploads: j.uploads.map((u: any) => ({
              name: u.name,
              content: u.content,
            })),
          }),
        )
        .catch((e) => setError(e.message));
    }
  }, [draftId, setError]);
  const [step, setStep] = useState(0),
    [saving, setSaving] = useState(false),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    localStorage.setItem(
      draftKey,
      JSON.stringify({ version: 2, form, editedFields }),
    );
  }, [form, draftKey, editedFields]);
  const update = (key: string, value: any) => {
    setEditedFields((fields) =>
      fields.includes(key) ? fields : [...fields, key],
    );
    setForm((f: any) => ({ ...f, [key]: value }));
    setFieldErrors((old) => {
      const next = { ...old };
      delete next[key];
      if (key === "externalConsent" || key === "processing")
        delete next.processing;
      return next;
    });
  };
  async function add(files: FileList | null) {
    if (!files) return;
    const list = [];
    for (const file of Array.from(files)) {
      if (!/\.(json|csv)$/i.test(file.name)) {
        setError(
          `${file.name}: only structured JSON and CSV are supported. PDFs, images and encrypted documents cannot be processed.`,
        );
        continue;
      }
      if (file.size > 1024 * 1024) {
        setError(`${file.name} exceeds 1 MB.`);
        continue;
      }
      list.push({ name: file.name, content: await file.text() });
    }
    update("uploads", [...form.uploads, ...list]);
  }
  async function submit(draft = false) {
    if (data.auth?.role === "viewer") {
      setError(
        "Viewer access is read-only. An owner must create or edit jobs.",
      );
      return;
    }
    const errors: Record<string, string> = {};
    if (form.name.trim().length < 3)
      errors.name = "Enter a task name of at least 3 characters.";
    if (form.instructions.trim().length < 10)
      errors.instructions = "Enter instructions of at least 10 characters.";
    if (!form.requirements.trim())
      errors.requirements = "Enter your acceptance requirements.";
    if (!draft && !form.uploads.length)
      errors.uploads = "Add invoices or load the synthetic sample.";
    if (!/^\d+(\.\d{1,2})?$/.test(form.budget) || Number(form.budget) <= 0)
      errors.budget = "Enter a positive amount with at most two decimals.";
    if (!form.deadline || new Date(form.deadline).getTime() <= Date.now())
      errors.deadline = "Choose a future deadline.";
    if (!form.allowedProviders.length)
      errors.allowedProviders = "Choose at least one provider.";
    if (
      form.processing === "near_ai" &&
      (!data.model?.ready || !form.externalConsent)
    )
      errors.processing =
        "NEAR AI must be configured and external processing consent must be checked.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setStep(errors.name || errors.instructions || errors.uploads ? 0 : 1);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, deadline: new Date(form.deadline).getTime() };
      let j;
      if (draftId) {
        j = await api("/jobs/" + draftId + "/save", payload);
        if (!draft) j = await api("/jobs/" + draftId + "/submit", {});
      } else j = await api("/jobs", { ...payload, draft });
      await refresh();
      localStorage.removeItem(draftKey);
      navigate(draft ? `/jobs/${j.id}` : `/jobs/${j.id}/mandate`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Link className="back-link" to="/jobs">
        <ArrowLeft size={15} />
        Back to jobs
      </Link>
      <Heading
        title="Create a job"
        description="Define the work. Put clear limits around the spending."
      />
      <div className="steps" aria-label="Job creation steps">
        {["Brief", "Rules", "Review"].map((s, i) => (
          <button
            className={step === i ? "current" : step > i ? "done" : ""}
            key={s}
            onClick={() => setStep(i)}
          >
            <span>{step > i ? <Check size={14} /> : i + 1}</span>
            {s}
          </button>
        ))}
      </div>
      <div className="two-col">
        <div>
          <Panel
            title={
              ["Job brief", "Spending & acceptance rules", "Review your job"][
                step
              ]
            }
          >
            <div className="form-body">
              {step === 0 ? (
                <>
                  <label>
                    Task name
                    <input
                      value={form.name}
                      maxLength={120}
                      placeholder="Enter a task name"
                      onChange={(e) => update("name", e.target.value)}
                      aria-invalid={!!fieldErrors.name}
                    />
                    {fieldErrors.name && (
                      <small className="field-error">{fieldErrors.name}</small>
                    )}
                  </label>
                  <label>
                    Instructions
                    <textarea
                      rows={4}
                      aria-label="Instructions"
                      value={form.instructions}
                      aria-invalid={!!fieldErrors.instructions}
                      onChange={(e) => update("instructions", e.target.value)}
                    />
                    {fieldErrors.instructions && (
                      <small className="field-error">
                        {fieldErrors.instructions}
                      </small>
                    )}
                  </label>
                  <div className="field-label">
                    Invoice attachments{" "}
                    <span>JSON or CSV · 1 MB each · 5 MB total</span>
                  </div>
                  <label className="upload-zone">
                    <FileText size={26} />
                    <strong>Choose invoice files</strong>
                    <span>
                      Structured invoices only. PDF and scanned images are not
                      supported.
                    </span>
                    <input
                      type="file"
                      aria-label="Upload invoices"
                      multiple
                      accept=".json,.csv"
                      onChange={(e) => void add(e.target.files)}
                    />
                  </label>
                  {fieldErrors.uploads && (
                    <small className="field-error">{fieldErrors.uploads}</small>
                  )}
                  <div className="fixture-bar">
                    <span>Try the complete local journey</span>
                    <Button
                      secondary
                      onClick={async () => {
                        try {
                          update("uploads", await api("/fixtures"));
                          if (!form.name) update("name", "October invoices");
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Load 30 sample invoices
                    </Button>
                  </div>
                  <div className="file-list">
                    {form.uploads.map(
                      (u: { name: string; content: string }, i: number) => (
                        <div key={i}>
                          <FileText size={15} />
                          <span>
                            {u.name}
                            <small>{new Blob([u.content]).size} bytes</small>
                          </span>
                          <button
                            aria-label={"Remove " + u.name}
                            className="icon-button"
                            onClick={() =>
                              update(
                                "uploads",
                                form.uploads.filter(
                                  (_: any, k: number) => i !== k,
                                ),
                              )
                            }
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ),
                    )}
                  </div>
                  <p className="helper">
                    Synthetic samples include 2 duplicates, 3 blank vendor
                    fields, and one malicious instruction that is treated as
                    data.{" "}
                    <a href="/fixtures-schema.json" download>
                      Download input schema
                    </a>
                  </p>
                </>
              ) : step === 1 ? (
                <>
                  <div className="form-row">
                    <label>
                      Budget cap (demo units)
                      <input
                        inputMode="decimal"
                        value={form.budget}
                        onChange={(e) => update("budget", e.target.value)}
                      />
                      {fieldErrors.budget && (
                        <small className="field-error">
                          {fieldErrors.budget}
                        </small>
                      )}
                    </label>
                    <label>
                      Deadline (your local time)
                      <input
                        type="datetime-local"
                        value={form.deadline}
                        onChange={(e) => update("deadline", e.target.value)}
                      />
                      {fieldErrors.deadline && (
                        <small className="field-error">
                          {fieldErrors.deadline}
                        </small>
                      )}
                    </label>
                  </div>
                  <label>
                    Output format
                    <select value="csv" onChange={() => {}}>
                      <option value="csv">Accounting CSV · schema v1</option>
                    </select>
                  </label>
                  <fieldset>
                    <legend>Permitted providers</legend>
                    {["ledgerworks", "parselab"].map((p) => (
                      <label className="checkbox-row" key={p}>
                        <input
                          type="checkbox"
                          checked={form.allowedProviders.includes(p)}
                          onChange={(e) =>
                            update(
                              "allowedProviders",
                              e.target.checked
                                ? [...form.allowedProviders, p]
                                : form.allowedProviders.filter(
                                    (x: string) => x !== p,
                                  ),
                            )
                          }
                        />
                        <strong>{providerName(p)}</strong>
                        <span>Demo-owned adapter</span>
                      </label>
                    ))}
                    {fieldErrors.allowedProviders && (
                      <small className="field-error">
                        {fieldErrors.allowedProviders}
                      </small>
                    )}
                  </fieldset>
                  <label>
                    Acceptance requirements
                    <textarea
                      value={form.requirements}
                      aria-label="Acceptance requirements"
                      aria-invalid={!!fieldErrors.requirements}
                      onChange={(e) => update("requirements", e.target.value)}
                      rows={3}
                    />
                    {fieldErrors.requirements && (
                      <small className="field-error">
                        {fieldErrors.requirements}
                      </small>
                    )}
                  </label>
                  <div className="check-list">
                    {[
                      "CSV schema validated",
                      "Every invoice accounted for",
                      "Totals reconciled by currency",
                      "Duplicates and uncertainty flagged",
                      "Owner confirms before payout",
                    ].map((s) => (
                      <div key={s}>
                        <CheckCircle2 size={16} />
                        {s}
                      </div>
                    ))}
                  </div>
                  <fieldset className="model-choice">
                    <legend>Invoice processing</legend>
                    <label>
                      <input
                        type="radio"
                        name="processing"
                        value="local"
                        checked={form.processing === "local"}
                        onChange={() =>
                          setForm((f: typeof form) => ({
                            ...f,
                            processing: "local",
                            externalConsent: false,
                          }))
                        }
                      />
                      Local parser · documents stay on this computer
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="processing"
                        value="near_ai"
                        checked={form.processing === "near_ai"}
                        disabled={!data.model?.ready}
                        onChange={() =>
                          setForm((f: typeof form) => ({
                            ...f,
                            processing: "near_ai",
                            externalConsent: false,
                            scenario: "normal",
                          }))
                        }
                      />
                      NEAR AI Cloud ·{" "}
                      {data.model?.ready ? data.model.model : "Not configured"}
                    </label>
                    <p className="helper">
                      Local parsing is the default. Live processing requires a
                      server-enabled API key and model. Both paths produce
                      independently checked CSV; provider prices remain demo
                      units.
                    </p>
                    {form.processing === "near_ai" && (
                      <>
                        <p className="helper">
                          The structured fields, source references and notes
                          from every invoice go to NEAR AI Cloud (
                          {data.model?.model}) at cloud-api.near.ai. Maximum 50
                          rows / 64 KiB. API usage can cost real money outside
                          this job's demo budget. Correction sends another
                          request. STYX does not verify TEE attestations.
                        </p>
                        <label>
                          <input
                            type="checkbox"
                            checked={form.externalConsent}
                            onChange={(e) =>
                              update("externalConsent", e.target.checked)
                            }
                          />
                          I approve sending these invoices to NEAR AI Cloud and
                          the separate API usage costs.
                        </label>
                      </>
                    )}
                    {fieldErrors.processing && (
                      <p className="field-error" role="alert">
                        {fieldErrors.processing}
                      </p>
                    )}
                  </fieldset>
                  {form.processing === "local" && (
                    <details>
                      <summary>Deterministic failure scenarios</summary>
                      <p className="helper">
                        Use these to inspect local error handling. No external
                        service is called.
                      </p>
                      <label>
                        Provider scenario
                        <select
                          value={form.scenario}
                          onChange={(e) => update("scenario", e.target.value)}
                        >
                          {[
                            "normal",
                            "slow",
                            "timeout",
                            "malformed",
                            "missing_coverage",
                            "arithmetic",
                            "changed_recipient",
                            "payout_failure",
                          ].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                    </details>
                  )}
                </>
              ) : (
                <>
                  <dl className="definition">
                    <div>
                      <dt>Task</dt>
                      <dd>{form.name || "Not entered"}</dd>
                    </div>
                    <div>
                      <dt>Documents</dt>
                      <dd>{form.uploads.length} files</dd>
                    </div>
                    <div>
                      <dt>Maximum spend</dt>
                      <dd>{form.budget} demo units</dd>
                    </div>
                    <div>
                      <dt>Providers</dt>
                      <dd>
                        {form.allowedProviders.map(providerName).join(", ")}
                      </dd>
                    </div>
                    <div>
                      <dt>Output</dt>
                      <dd>Accounting CSV</dd>
                    </div>
                    <div>
                      <dt>Processing</dt>
                      <dd>
                        {form.processing === "near_ai"
                          ? `NEAR AI Cloud · ${data.model?.model} · ${form.externalConsent ? "external sharing approved" : "consent required"}`
                          : "Local parser · no external sharing"}
                      </dd>
                    </div>
                    <div>
                      <dt>Approval</dt>
                      <dd>Owner confirmation</dd>
                    </div>
                  </dl>
                  <p>{form.instructions}</p>
                  <Notice>
                    This creates an immutable mandate for your review. It does
                    not reserve or spend funds.
                  </Notice>
                </>
              )}
              <div className="form-actions">
                <Button
                  secondary
                  onClick={() => void submit(true)}
                  disabled={saving}
                >
                  Save draft
                </Button>
                {step > 0 && (
                  <Button secondary onClick={() => setStep(step - 1)}>
                    Back
                  </Button>
                )}
                {step < 2 ? (
                  <Button onClick={() => setStep(step + 1)}>
                    Continue
                    <ArrowRight size={16} />
                  </Button>
                ) : (
                  <Button disabled={saving} onClick={() => void submit()}>
                    {saving ? "Creating…" : "Review mandate"}
                    <ArrowRight size={16} />
                  </Button>
                )}
              </div>
            </div>
          </Panel>
        </div>
        <aside>
          <Panel title="Job summary">
            <dl className="definition summary-definition">
              <div>
                <dt>Budget cap</dt>
                <dd>
                  {form.budget} <small>demo units</small>
                </dd>
              </div>
              <div>
                <dt>Attachments</dt>
                <dd>{form.uploads.length} files</dd>
              </div>
              <div>
                <dt>Payment mode</dt>
                <dd>Owner-confirmed</dd>
              </div>
              <div>
                <dt>Asset / network</dt>
                <dd>Demo units / local</dd>
              </div>
              <div>
                <dt>Verifier</dt>
                <dd>STYX server v1</dd>
              </div>
            </dl>
            <div className="panel-pad helper">
              <LockKeyhole size={16} />
              Your approved rules govern every reservation and payment.
            </div>
          </Panel>
          <div className="side-note">
            <ShieldCheck size={19} />
            <p>
              {form.processing === "near_ai"
                ? "NEAR AI sends invoice fields and notes to cloud-api.near.ai after mandate approval. API charges are separate from the demo budget."
                : "With the local parser, documents stay in this workspace and no external model is called."}
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
function useJob() {
  const { id } = useParams();
  const ctx = useContext(Context);
  return { ...ctx, job: ctx.data.jobs.find((j) => j.id === id) };
}
function Missing() {
  return (
    <Heading
      title="Job not found"
      description="This job does not exist in your local workspace."
    >
      <Link to="/jobs" className="button">
        Back to jobs
      </Link>
    </Heading>
  );
}
function JobHead({ job, title }: { job: Job; title: string }) {
  return (
    <>
      <Link className="back-link" to="/jobs">
        <ArrowLeft size={15} />
        Back to jobs
      </Link>
      <Heading
        eyebrow={`${job.id} / ${job.uploads.length} FILES`}
        title={title}
        description={job.name}
      >
        <Status state={job.state} />
      </Heading>
      {job.localTestCase && (
        <Notice>
          Local test with synthetic invoices.{" "}
          <Link to="/testing">Back to local testing</Link> to continue another
          case.
        </Notice>
      )}
      {job.mandate.processing?.engine === "near_ai" && (
        <Notice>
          {job.artifact?.execution?.engine === "near_ai"
            ? "Processed with"
            : "Selected processing:"}{" "}
          NEAR AI Cloud · {job.mandate.processing.model}. Invoice fields, source
          references and notes are sent to cloud-api.near.ai after approval. API
          charges are separate from{" "}
          {job.sourceOnly ? "NEAR escrow" : "the demo cap"}. Correction sends
          another request; payment still requires independent checks and owner
          acceptance.
        </Notice>
      )}
    </>
  );
}
function Summary({ j }: { j: Job }) {
  if (j.sourceOnly)
    return (
      <Panel title="Invoice evidence">
        <p className="panel-pad">
          Prepared from your uploaded files. Your NEAR agreement controls
          testnet payment.
        </p>
      </Panel>
    );
  return (
    <Panel title="Payment summary">
      <dl className="definition summary-definition">
        <div>
          <dt>Budget cap</dt>
          <dd>
            {money(j.cap)} <small>demo units</small>
          </dd>
        </div>
        <div>
          <dt>Reserved</dt>
          <dd>
            {money(j.selected?.price || 0)} <small>demo units</small>
          </dd>
        </div>
        <div>
          <dt>Unused allocation</dt>
          <dd>
            {money(j.cap - (j.selected?.price || 0))} <small>demo units</small>
          </dd>
        </div>
        <div>
          <dt>Provider</dt>
          <dd>
            {j.selected ? providerName(j.selected.provider) : "Not selected"}
          </dd>
        </div>
        <div>
          <dt>Verifier</dt>
          <dd>STYX server v1</dd>
        </div>
        <div>
          <dt>Approval mode</dt>
          <dd>Owner-confirmed</dd>
        </div>
      </dl>
      {j.artifact && (
        <div className="hash-box">
          <span>OUTPUT SHA-256</span>
          <code title={j.artifact.hash}>{j.artifact.hash.slice(0, 20)}…</code>
        </div>
      )}
      <div className="panel-pad helper">
        <LockKeyhole size={15} />
        Local ledger · no blockchain funds move
      </div>
    </Panel>
  );
}
function Mandate() {
  const { job: j, act } = useJob();
  const nav = useNavigate();
  const [revision, setRevision] = useState(false),
    [budget, setBudget] = useState("");
  if (!j) return <Missing />;
  const m = j.mandate;
  return (
    <>
      <JobHead job={j} title="Review mandate" />
      <div className="steps read-only">
        {["Define job", "Approve rules", "Compare quotes"].map((s, i) => (
          <div className={i === 1 ? "current" : ""} key={s}>
            <span>{i + 1}</span>
            {s}
          </div>
        ))}
      </div>
      <div className="two-col">
        <div>
          <Panel
            title={`Spending rules · version ${m.version}`}
            extra={
              <span className="subtle-tag">
                {m.approvedAt ? "Approved" : "Awaiting owner"}
              </span>
            }
          >
            <dl className="definition mandate-definition">
              <div>
                <dt>Task</dt>
                <dd>{j.name}</dd>
              </div>
              <div>
                <dt>Maximum spend</dt>
                <dd>
                  <strong>{money(m.cap)} demo units</strong>
                </dd>
              </div>
              <div>
                <dt>Asset / network</dt>
                <dd>Demo units (2 decimals) / local</dd>
              </div>
              <div>
                <dt>Permitted providers</dt>
                <dd>{m.providers.map(providerName).join(", ")}</dd>
              </div>
              {Object.entries(m.recipients).map(([p, r]) => (
                <div key={p}>
                  <dt>{providerName(p)} recipient</dt>
                  <dd>
                    <code>{r}</code>
                  </dd>
                </div>
              ))}
              <div>
                <dt>Expires</dt>
                <dd>{date(m.expires)}</dd>
              </div>
              <div>
                <dt>Verifier identity</dt>
                <dd>{m.verifier}</dd>
              </div>
              <div>
                <dt>Acceptance checks</dt>
                <dd>{m.checks}</dd>
              </div>
              <div>
                <dt>Approval mode</dt>
                <dd>Owner confirms each payment</dd>
              </div>
            </dl>
            <div className="hash-box">
              <span>IMMUTABLE MANDATE SHA-256</span>
              <code>{m.hash}</code>
            </div>
          </Panel>
          <Panel title="Acceptance requirements" className="top-space">
            <div className="panel-pad">
              <p>{j.requirements}</p>
              <div className="check-list">
                {[
                  "Invoice schema and required fields",
                  "Every input mapped to output",
                  "Amounts reconciled and grouped by currency",
                  "Duplicate identifiers and missing fields flagged",
                  "Output bytes bound to this mandate",
                ].map((s) => (
                  <div key={s}>
                    <CheckCircle2 size={16} />
                    {s}
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>
        <aside>
          <Summary j={j} />
          <Notice>
            Checks establish structure, coverage, and arithmetic. They do not
            prove invoice authenticity or every field’s business meaning.
          </Notice>
          <div className="side-note">
            <ShieldCheck size={18} />
            <p>
              Invoice text and agent suggestions cannot rewrite these rules.
              Changes create a new version and invalidate quotes.
            </p>
          </div>
        </aside>
      </div>
      <div className="bottom-actions">
        <Button secondary onClick={() => setRevision(!revision)}>
          Change rules
        </Button>
        {j.state === "awaiting_approval" ? (
          <Button
            onClick={() =>
              void act(j.id, "approve", { version: m.version, hash: m.hash })
                .then(() => nav(`/jobs/${j.id}/quotes`))
                .catch(() => {})
            }
          >
            <ShieldCheck size={17} />
            Approve mandate v{m.version}
          </Button>
        ) : (
          <Link className="button" to={routeFor(j)}>
            Continue to job
            <ArrowRight size={16} />
          </Link>
        )}
      </div>
      {revision && (
        <Panel title="Create a new mandate version">
          <div className="panel-pad">
            <label>
              New cap (demo units)
              <input
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </label>
            <p className="helper">
              Expiry will be extended by two hours. All previous quotes become
              invalid. Reserved rules cannot be changed.
            </p>
            <Button
              onClick={() =>
                void act(j.id, "revise", {
                  budget,
                  deadline: Date.now() + 7200000,
                })
                  .then(() => setRevision(false))
                  .catch(() => {})
              }
            >
              Create version for reapproval
            </Button>
          </div>
        </Panel>
      )}
    </>
  );
}
function Quotes() {
  const { job: j, act, data } = useJob();
  const [selected, setSelected] = useState("");
  const nav = useNavigate();
  if (!j) return <Missing />;
  const q = j.quotes.find((q) => q.id === selected) || j.quotes[0];
  function reason(q: Quote) {
    if (!j) return "Job not found";
    if (q.expires <= Date.now()) return "Quote expired";
    if (j.deadline <= Date.now()) return "Mandate expired";
    if (q.price > j.cap) return "Exceeds approved cap";
    if (q.price > data.balance.available) return "Insufficient available funds";
    return "";
  }
  return (
    <>
      <JobHead job={j} title="Provider quotes" />
      <div className="two-col">
        <div>
          <Panel
            title="Compare providers"
            extra={
              <Button
                secondary
                onClick={() => void act(j.id, "refresh").catch(() => {})}
              >
                <RefreshCw size={14} />
                Refresh
              </Button>
            }
          >
            <div className="quote-list">
              {j.quotes.map((quote) => (
                <label
                  className={
                    "quote-card " + (q?.id === quote.id ? "selected" : "")
                  }
                  key={quote.id}
                >
                  <div className="quote-top">
                    <input
                      type="radio"
                      name="provider"
                      checked={q?.id === quote.id}
                      disabled={!!reason(quote) || j.state !== "quoted"}
                      onChange={() => setSelected(quote.id)}
                    />
                    <span className={"provider-avatar " + quote.provider}>
                      {quote.provider === "ledgerworks" ? "LW" : "PL"}
                    </span>
                    <div>
                      <h3>{providerName(quote.provider)}</h3>
                      <small>Demo-owned deterministic provider</small>
                    </div>
                    <strong className="quote-price">
                      {money(quote.price)}
                      <small>demo units</small>
                    </strong>
                  </div>
                  <div className="quote-features">
                    <span>
                      <Clock3 size={14} />
                      {quote.seconds}s local estimate
                    </span>
                    <span>
                      <CheckCircle2 size={14} />
                      CSV / JSON
                    </span>
                    <span>
                      <CheckCircle2 size={14} />
                      Full coverage
                    </span>
                  </div>
                  <div className="quote-meta">
                    <span>
                      Recipient <code>{quote.recipient}</code>
                    </span>
                    <span>Expires {date(quote.expires)}</span>
                  </div>
                  {reason(quote) && (
                    <p className="field-error">{reason(quote)}</p>
                  )}
                </label>
              ))}
            </div>
            {!j.quotes.length && (
              <div className="empty">
                Approve the mandate to obtain quotes.
                <Link to={`/jobs/${j.id}/mandate`}>Review mandate</Link>
              </div>
            )}
          </Panel>
          <div className="side-note">
            <FileText size={19} />
            <p>
              Both providers parse your actual structured inputs. Prices are
              fixed local-demo quotes; these are not independent commercial
              services.
            </p>
          </div>
          <details className="test-details">
            <summary>Inspect the recipient policy</summary>
            <p>
              Simulate an attempted change to an unapproved recipient. The job
              is paused before payment; this does not modify its mandate.
            </p>
            <Button
              secondary
              onClick={() =>
                void act(j.id, "attack")
                  .then(() => nav(`/jobs/${j.id}/security`))
                  .catch(() => {})
              }
            >
              Demonstrate blocked recipient change
            </Button>
          </details>
        </div>
        <aside>
          <Panel title="Reservation preview">
            <dl className="definition summary-definition">
              <div>
                <dt>Budget cap</dt>
                <dd>
                  {money(j.cap)} <small>demo units</small>
                </dd>
              </div>
              <div>
                <dt>Selected quote</dt>
                <dd>
                  {money(q?.price || 0)} <small>demo units</small>
                </dd>
              </div>
              <div>
                <dt>Unused allocation</dt>
                <dd>
                  {money(j.cap - (q?.price || 0))} <small>demo units</small>
                </dd>
              </div>
              <div>
                <dt>Available funds</dt>
                <dd>
                  {money(data.balance.available)} <small>demo units</small>
                </dd>
              </div>
            </dl>
            <div className="panel-pad">
              <span className="eyebrow">APPROVED RECIPIENT</span>
              <p>
                <code>{q?.recipient || "None selected"}</code>
              </p>
              <p className="helper">
                Selecting a quote does not move funds. Starting reserves its
                price until acceptance or cancellation.
              </p>
              <Button
                disabled={!q || !!reason(q) || j.state !== "quoted"}
                onClick={() =>
                  void act(j.id, "reserve", { quoteId: q.id })
                    .then(() => nav(`/jobs/${j.id}`))
                    .catch(() => {})
                }
              >
                <LockKeyhole size={16} />
                Reserve & start
              </Button>
            </div>
          </Panel>
          <div className="side-note">
            <ShieldCheck size={20} />
            <p>
              Payment remains locked until checks pass and you accept delivery.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
function Checks({ j }: { j: Job }) {
  return (
    <Panel
      title="Verification checks"
      extra={
        <span className="subtle-tag">
          {j.report?.checksVersion || "Pending"}
        </span>
      }
    >
      <div className="checks">
        {j.report?.checks.map((c) => (
          <div className={c.pass ? "" : "failed-check"} key={c.name}>
            {c.pass ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <div>
              <strong>{c.name}</strong>
              <p>{c.detail}</p>
            </div>
            <span>{c.pass ? "Passed" : "Failed"}</span>
          </div>
        )) || (
          <p className="panel-pad muted">
            Checks will run against the delivered CSV and your input manifest.
          </p>
        )}
      </div>
      {j.report && (
        <div className="panel-pad flags">
          {j.report.duplicates.length > 0 && (
            <details>
              <summary>
                {j.report.duplicates.length} duplicate invoices flagged
              </summary>
              {j.report.duplicates.map((s, i) => (
                <p key={i}>{s}</p>
              ))}
            </details>
          )}
          {j.report.uncertain.length > 0 && (
            <details>
              <summary>
                {j.report.uncertain.length} uncertain fields flagged
              </summary>
              {j.report.uncertain.map((s, i) => (
                <p key={i}>{s}</p>
              ))}
            </details>
          )}
          <p className="helper">
            Trusted server verifier. Passing checks do not establish document
            authenticity; inspect flagged fields before acceptance.
          </p>
        </div>
      )}
    </Panel>
  );
}
function Detail() {
  const { job: j, act, data } = useJob();
  const nav = useNavigate();
  if (!j) return <Missing />;
  const deliveredAt = j.transitions.findLast((t) => t.state === "delivered")?.at;
  const startedAt = j.transitions.findLast(
    (t) => t.state === "running" && deliveredAt !== undefined && t.at <= deliveredAt,
  )?.at;
  const processingSeconds =
    deliveredAt !== undefined && startedAt !== undefined &&
    Number.isFinite(deliveredAt) && Number.isFinite(startedAt)
      ? ((deliveredAt - startedAt) / 1000).toFixed(2)
      : null;
  return (
    <>
      <JobHead job={j} title={j.name} />
      {j.error && <Notice danger>{j.error}</Notice>}
      {j.state === "blocked" && (
        <Notice danger>
          Payment paused after a policy violation.{" "}
          <Link to={`/jobs/${j.id}/security`}>Inspect blocked payment</Link>
        </Notice>
      )}
      {j.state === "awaiting_approval" && (
        <Notice>
          Review the spending rules before obtaining quotes.{" "}
          <Link to={`/jobs/${j.id}/mandate`}>Review mandate</Link>
        </Notice>
      )}
      {j.state === "quoted" && (
        <Notice>
          Provider quotes are ready.{" "}
          <Link to={`/jobs/${j.id}/quotes`}>Compare providers</Link>
        </Notice>
      )}
      <div className="two-col">
        <div>
          {j.artifact ? (
            <Panel
              title="Delivered output"
              extra={
                <a
                  className="button secondary compact"
                  href={`/api/jobs/${j.id}/artifact`}
                >
                  <Download size={15} />
                  Download CSV
                </a>
              }
            >
              <div className="file-banner">
                <FileText size={23} />
                <div>
                  <strong>october-invoices.csv</strong>
                  <small>{j.artifact.rows.length} records · CSV delivery</small>
                  <small>
                    Processing duration: {processingSeconds === null
                      ? "Not recorded for this saved delivery"
                      : `${processingSeconds}s measured`}
                  </small>
                </div>
                <span className="subtle-tag">CSV</span>
              </div>
              <div
                className="table-wrap"
                tabIndex={0}
                role="region"
                aria-label="Scrollable table"
              >
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Vendor</th>
                      <th>Total</th>
                      <th>Review flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {j.artifact.rows.slice(0, 8).map((r, i) => (
                      <tr key={i}>
                        <td>{r.invoice_id || "Missing ID"}</td>
                        <td>
                          {r.vendor || (
                            <span className="flag">Not provided</span>
                          )}
                        </td>
                        <td>
                          {r.total} {r.currency}
                        </td>
                        <td>
                          {!r.vendor ? (
                            <span className="flag">Uncertain vendor</span>
                          ) : j.report?.duplicates.some((d) =>
                              d.startsWith(r.invoice_id + ":"),
                            ) ? (
                            <span className="flag">Duplicate</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-foot">
                Showing up to 8 records.{" "}
                <Link className="text-link" to={`/jobs/${j.id}/review`}>
                  Review all invoices & sources <ArrowUpRight size={14} />
                </Link>
              </div>
              {j.report && (
                <div className="totals-row">
                  {Object.entries(j.report.totals).map(([currency, total]) => (
                    <span key={currency}>
                      Invoice total{" "}
                      <strong>
                        {money(total)} {currency}
                      </strong>
                    </span>
                  ))}
                </div>
              )}
            </Panel>
          ) : (
            <Panel
              title={
                j.state === "running" ? "Processing invoices" : "Job brief"
              }
            >
              <div className="panel-pad">
                {j.state === "running" ? (
                  <div className="processing" role="status">
                    <RefreshCw size={25} />
                    <h3>
                      Your provider is processing {j.uploads.length} files
                    </h3>
                    <p>
                      Delivery and independent verification will appear here.
                      You can safely leave and return.
                    </p>
                  </div>
                ) : (
                  <>
                    <p>{j.instructions}</p>
                    <p className="helper">
                      {j.uploads.length} attached files · Structured JSON / CSV
                      {!j.sourceOnly && <> · {j.scenario} scenario</>}
                    </p>
                    {j.state === "draft" && (
                      <Link className="button" to={"/jobs/new?draft=" + j.id}>
                        Edit draft & review
                        <ArrowRight size={15} />
                      </Link>
                    )}
                  </>
                )}
              </div>
            </Panel>
          )}
          <div className="top-space">
            <Checks j={j} />
          </div>
          <Panel title="Execution timeline" className="top-space">
            <ol className="timeline">
              {j.transitions.map((t, i) => (
                <li key={i}>
                  <span className="timeline-dot" />
                  <strong>{labels[t.state]}</strong>
                  <time>{date(t.at)}</time>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
        <aside>
          <Summary j={j} />
          <div className="action-panel">
            {j.sourceOnly && j.state === "ready_for_review" && (
              <Link
                className="button"
                to={`/testnet?job=${encodeURIComponent(j.id)}`}
              >
                Continue with NEAR testnet
              </Link>
            )}
            {j.state === "ready_for_review" && !j.sourceOnly && (
              <>
                <Button
                  onClick={() =>
                    void act(j.id, "settle")
                      .then((next) => {
                        if (next.state === "settled")
                          nav(`/jobs/${j.id}/receipt`);
                      })
                      .catch(() => {})
                  }
                >
                  <CheckCircle2 size={17} />
                  Accept & release {money(j.selected!.price)}
                </Button>
                <Button
                  secondary
                  onClick={() => void act(j.id, "correct").catch(() => {})}
                >
                  Request correction
                </Button>
                <p className="helper">
                  <LockKeyhole size={14} />
                  You confirm acceptance before this local payment.
                </p>
              </>
            )}
            {j.state === "failed" && (j.selected || j.sourceOnly) && (
              <Button onClick={() => void act(j.id, "correct").catch(() => {})}>
                <RefreshCw size={16} />
                Request correction & retry
              </Button>
            )}
            {j.state === "settled" && (
              <Link className="button" to={`/jobs/${j.id}/receipt`}>
                View receipt
                <ArrowRight size={16} />
              </Link>
            )}
            {j.state === "blocked" && (
              <Link className="button secondary" to={`/jobs/${j.id}/security`}>
                Inspect policy violation
              </Link>
            )}
            {![
              "running",
              "settlement_pending",
              "settled",
              "cancelled",
              "refunded",
            ].includes(j.state) && (
              <Button
                secondary
                onClick={() => void act(j.id, "cancel").catch(() => {})}
              >
                {j.selected ? "Cancel & release reservation" : "Cancel job"}
              </Button>
            )}
            <Link className="text-link" to={`/jobs/${j.id}/mandate`}>
              View approved mandate
              <ArrowUpRight size={14} />
            </Link>
          </div>
          <details className="test-details">
            <summary>Input manifest</summary>
            {j.uploads.map((u) => (
              <p key={u.id}>
                {u.name}
                <small className="hash-small">Source ID: {u.id}</small>
                <small className="hash-small">{u.hash.slice(0, 20)}…</small>
              </p>
            ))}
          </details>
        </aside>
      </div>
      <details className="test-details">
        <summary>Job audit trail</summary>
        <EventList events={data.events.filter((e) => e.job_id === j.id)} />
      </details>
    </>
  );
}
function Security() {
  const { job: j, act, data } = useJob();
  if (!j) return <Missing />;
  const b = j.blocked;
  return (
    <>
      <JobHead job={j} title="Payment blocked" />
      {!b ? (
        <Notice>
          No blocked attempt recorded for this job.{" "}
          <Link to={`/jobs/${j.id}`}>Return to job</Link>
        </Notice>
      ) : (
        <>
          <div className="two-col">
            <Panel title="Blocked attempt" className="blocked-panel">
              <div className="blocked-heading">
                <span>
                  <LockKeyhole size={25} />
                </span>
                <div>
                  <h2>Recipient does not match approved rules</h2>
                  <p>STYX rejected this request before settlement.</p>
                </div>
              </div>
              <dl className="definition mandate-definition">
                <div>
                  <dt>Approved recipient</dt>
                  <dd>
                    <code>{b.approved}</code>
                  </dd>
                </div>
                <div>
                  <dt>Attempted recipient</dt>
                  <dd className="danger-text">
                    <code>{b.attempted}</code>
                  </dd>
                </div>
                <div>
                  <dt>Attempted amount</dt>
                  <dd>{money(b.amount)} demo units</dd>
                </div>
                <div>
                  <dt>Violated rule</dt>
                  <dd>{b.reason}</dd>
                </div>
                <div>
                  <dt>Detected at</dt>
                  <dd>{date(b.at)}</dd>
                </div>
                <div>
                  <dt>Result</dt>
                  <dd>
                    <strong>No funds moved</strong>
                    <small>
                      Rejected before a payment ledger entry. Any reservation
                      remains held.
                    </small>
                  </dd>
                </div>
              </dl>
              <div className="panel-pad">
                <Link className="button" to={`/jobs/${j.id}`}>
                  <Pause size={15} />
                  Keep job paused
                </Link>{" "}
                <Link className="button secondary" to={`/jobs/${j.id}/mandate`}>
                  Review mandate
                </Link>
              </div>
            </Panel>
            <aside>
              <Summary j={j} />
              <Notice>
                There is no policy bypass. Cancel this job to release any
                reservation, then create a new job with explicitly approved
                rules.
              </Notice>
              {!["refunded", "cancelled", "settled"].includes(j.state) && (
                <Button
                  secondary
                  onClick={() => void act(j.id, "cancel").catch(() => {})}
                >
                  Cancel paused job
                </Button>
              )}
            </aside>
          </div>
          <Panel title="Security audit" className="top-space">
            <EventList events={data.events.filter((e) => e.job_id === j.id)} />
          </Panel>
        </>
      )}
    </>
  );
}
function Receipt() {
  const { job: j } = useJob();
  if (!j) return <Missing />;
  if (!j.receipt)
    return (
      <>
        <JobHead job={j} title="Receipt not available" />
        <Notice>
          A receipt is created only after successful settlement.{" "}
          <Link to={`/jobs/${j.id}`}>Review job</Link>
        </Notice>
      </>
    );
  return (
    <>
      <div className="receipt-toolbar">
        <Link className="back-link" to={`/jobs/${j.id}`}>
          <ArrowLeft size={15} />
          Back to job
        </Link>
        <Button secondary onClick={() => window.print()}>
          <Printer size={16} />
          Print / save receipt
        </Button>
      </div>
      <article className="receipt">
        <div className="receipt-brand">
          <Logo />
        </div>
        <div className="receipt-title">
          <span className="eyebrow">LOCAL DEMO RECEIPT</span>
          <h1>{j.receipt.id}</h1>
          <Status state="settled" />
          <p>
            {j.name} · {j.id}
          </p>
          <div className="paid-amount">
            {money(j.receipt.paid)}
            <span>demo units paid</span>
          </div>
          <strong>{providerName(j.selected!.provider)}</strong>
        </div>
        <dl className="definition">
          <div>
            <dt>Original budget cap</dt>
            <dd>{money(j.cap)} demo units</dd>
          </div>
          <div>
            <dt>Reserved amount</dt>
            <dd>{money(j.selected!.price)} demo units</dd>
          </div>
          <div>
            <dt>Paid amount</dt>
            <dd>{money(j.receipt.paid)} demo units</dd>
          </div>
          <div>
            <dt>Unused allocation</dt>
            <dd>
              {money(j.cap - j.receipt.paid)} demo units
              <small>Unspent cap; not a refund transfer</small>
            </dd>
          </div>
          <div>
            <dt>Asset / network</dt>
            <dd>Demo units / local ledger</dd>
          </div>
          <div>
            <dt>Recipient</dt>
            <dd>
              <code>{j.selected!.recipient}</code>
            </dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>
              <a href={`/api/jobs/${j.id}/artifact`} className="text-link">
                <Download size={14} />
                october-invoices.csv
              </a>
            </dd>
          </div>
          <div>
            <dt>Mandate</dt>
            <dd>
              Version {j.mandate.version}
              <small className="hash-small">{j.mandate.hash}</small>
            </dd>
          </div>
          <div>
            <dt>Output SHA-256</dt>
            <dd>
              <code className="hash-small">{j.artifact?.hash}</code>
            </dd>
          </div>
          <div>
            <dt>Verifier</dt>
            <dd>{j.report?.verifier}</dd>
          </div>
        </dl>
        <div className="receipt-checks">
          <h3>Accepted checks</h3>
          {j.report?.checks.map((c) => (
            <span key={c.name}>
              <CheckCircle2 size={15} />
              {c.name}
            </span>
          ))}
        </div>
        <dl className="definition">
          <div>
            <dt>Mandate approved</dt>
            <dd>{date(j.mandate.approvedAt!)}</dd>
          </div>
          <div>
            <dt>Delivery accepted</dt>
            <dd>{date(j.receipt.approvedAt)}</dd>
          </div>
          <div>
            <dt>Settlement recorded</dt>
            <dd>{date(j.receipt.settledAt)}</dd>
          </div>
        </dl>
        <div className="receipt-note">
          <ShieldCheck size={18} />
          <p>
            Local ledger evidence. No onchain transaction occurred and no
            explorer link is available.
          </p>
        </div>
        <div className="receipt-actions">
          <Link className="button secondary" to="/activity">
            View activity
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </article>
    </>
  );
}
function Providers() {
  return <TestnetProviders request={api} />;
}
function ActivityPage() {
  const { data } = useContext(Context);
  const [filter, setFilter] = useState("all"),
    [q, setQ] = useState("");
  const sourceIds = new Set(
    data.jobs.filter((j) => j.sourceOnly).map((j) => j.id),
  );
  const liveEvents = data.events.filter(
    (e) => !e.job_id || sourceIds.has(e.job_id),
  );
  const events = liveEvents.filter(
    (e) =>
      (filter === "all" || e.kind === filter) &&
      (e.message + " " + e.job_id).toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <Heading
        eyebrow="WORKSPACE / ACTIVITY"
        title="Activity"
        description="A persisted record of decisions, evidence, and payments."
      />
      <Panel>
        <div className="table-tools">
          <div className="search">
            <Search size={16} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search events…"
              aria-label="Search activity"
            />
          </div>
          <select
            aria-label="Filter event type"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All event types</option>
            {[...new Set(liveEvents.map((e) => e.kind))].map((k) => (
              <option key={k} value={k}>
                {k.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <EventList events={events} />
      </Panel>
    </>
  );
}
function SettingsPage() {
  const { data, refresh, setError } = useContext(Context);
  const [name, setName] = useState(data.workspace.name),
    [saved, setSaved] = useState(false);
  return (
    <>
      <Heading
        eyebrow="WORKSPACE / SETTINGS"
        title="Settings"
        description="Workspace preferences and honest integration readiness."
      />
      {data.auth?.authMode === "password" && (
        <AccountPanel access={data.auth} request={api} />
      )}
      {data.auth?.authMode === "local" && (
        <Panel title="Workspace access">
          <div className="panel-pad">
            <strong>Local owner mode</strong>
            <p className="helper">
              Password sign-in and owner/viewer permissions are available but
              are not enabled in local owner mode. Your operator must provision
              an account and enable password mode before shared use.
            </p>
          </div>
        </Panel>
      )}
      <div className="two-col">
        <div>
          <Panel title="Workspace">
            <form
              className="form-body"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api("/settings", { name });
                  await refresh();
                  setSaved(true);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <label>
                Workspace name
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSaved(false);
                  }}
                  minLength={1}
                  maxLength={80}
                  required
                />
              </label>
              <Button type="submit" disabled={data.auth?.role === "viewer"}>
                Save settings
              </Button>
              {saved && (
                <p role="status" className="success-text">
                  Workspace saved.
                </p>
              )}
            </form>
          </Panel>
          <Panel title="Payment policy" className="top-space">
            <div className="panel-pad">
              <div className="policy-choice">
                <LockKeyhole size={20} />
                <div>
                  <strong>Owner confirms every payment</strong>
                  <p>
                    Required in this release. Providers and agents cannot accept
                    their own delivery.
                  </p>
                </div>
                <CheckCircle2 size={19} />
              </div>
              <p className="helper">
                Changing spending rules requires a new mandate version and
                explicit owner approval.
              </p>
            </div>
          </Panel>
          <Panel title="Data & privacy" className="top-space">
            <div className="panel-pad">
              <p>
                Inputs, artifacts, and audit events are stored in the local
                SQLite database. Files are served through session-authorized
                routes.
              </p>
              <p className="helper">
                {data.auth?.authMode === "password"
                  ? "Password sign-in with workspace membership checks is enabled. TLS deployment and security review are still required for public hosting."
                  : "Development-only local owner mode. Enable password mode before shared deployment."}{" "}
                No encryption-at-rest or document authenticity guarantee is
                claimed.
              </p>
            </div>
          </Panel>
        </div>
        <aside>
          <Panel title="Execution mode">
            <div className="panel-pad">
              <span className="mode">
                <i />
                NEAR testnet
              </span>
              <p>
                Local parsing is the default. NEAR AI Cloud is optional per job
                with explicit consent. Escrow balances and transactions come
                from NEAR testnet. Funding and payment release require your
                wallet.
              </p>
              <dl className="definition">
                <div>
                  <dt>NEAR testnet</dt>
                  <dd>
                    <span className="status warn">
                      {data.testnet?.ready ? "Configured" : "Not configured"}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Wallet</dt>
                  <dd>
                    <Link className="text-link" to="/testnet">
                      Manage testnet wallet
                      <ArrowUpRight size={13} />
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt>Live NEAR AI</dt>
                  <dd>
                    <span
                      className={
                        data.model?.ready ? "status good" : "status warn"
                      }
                    >
                      {data.model?.ready
                        ? `Configured · ${data.model.model}`
                        : "Not configured"}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Mainnet</dt>
                  <dd>Disabled</dd>
                </div>
              </dl>
              <p className="helper">
                The testnet console needs a reviewed, deployed v2 contract and
                distinct configured signing roles. Live inference needs an API
                key, model, and explicit data-path consent.
              </p>
              <a
                className="text-link"
                href="https://docs.near.org/"
                target="_blank"
                rel="noreferrer"
              >
                NEAR documentation
                <ExternalLink size={13} />
              </a>
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}
