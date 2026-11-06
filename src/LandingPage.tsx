import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  Fingerprint,
  LockKeyhole,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";
import "./landing.css";

const steps = [
  {
    label: "Set the mandate",
    title: "A clear job. A firm limit.",
    description:
      "Define the work, approve the providers, and set a spending cap. Those rules stay attached to the job.",
  },
  {
    label: "Review the evidence",
    title: "Delivery comes with evidence.",
    description:
      "Inspect the actual output, source coverage, reconciled totals, and flagged fields before deciding what happens next.",
  },
  {
    label: "Make the final call",
    title: "Your acceptance releases payment.",
    description:
      "A passing check isn't your signature. Review the delivery, accept it, and get a receipt for the agreed amount.",
  },
];

export default function LandingPage() {
  useEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0);
  }, []);
  const [step, setStep] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="lp">
      <div className="lp-dark">
        <header className="lp-header">
          <a href="#top" aria-label="STYX home" className="lp-brand">
            <img src="/brand/styx-original.png" alt="STYX" />
          </a>
          <nav
            id="lp-navigation"
            className={menuOpen ? "lp-navigation-open" : ""}
            aria-label="Landing page navigation"
          >
            <a href="#workflow" onClick={() => setMenuOpen(false)}>
              How it works
            </a>
            <a href="#controls" onClick={() => setMenuOpen(false)}>
              The controls
            </a>
            <a href="#questions" onClick={() => setMenuOpen(false)}>
              Questions
            </a>
          </nav>
          <button
            className="lp-menu-toggle"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-controls="lp-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
            <span>Menu</span>
          </button>
          <Link to="/app" className="lp-nav-cta">
            <span className="lp-nav-cta-full">Open workspace</span>
            <span className="lp-nav-cta-short">Open app</span>{" "}
            <ArrowUpRight size={15} />
          </Link>
        </header>
        <main id="top" className="lp-main">
          <section className="lp-hero" aria-labelledby="lp-title">
            <div className="lp-hero-copy">
              <div className="lp-eyebrow">
                <span />
                SCOPED WORK. ACCOUNTABLE PAYMENTS.
              </div>
              <h1 id="lp-title">
                Give agents a job.
                <br />
                Keep the
                <br />
                <em>final say.</em>
              </h1>
              <p>
                A clear mandate. A limited budget. Evidence you can inspect.
                STYX brings the work and the payment into one accountable flow.
              </p>
              <div className="lp-hero-actions">
                <Link className="lp-button" to="/testnet#upload">
                  Upload invoices <ArrowRight size={18} />
                </Link>
                <a className="lp-secondary-link" href="#controls">
                  Built around your rules <ArrowUpRight size={15} />
                </a>
              </div>
              <div className="lp-hero-note">
                <span className="lp-tiny-dot" />
                Local demo available<span className="lp-note-separator">/</span>
                No wallet needed
              </div>
            </div>
            <div
              className="lp-diagram"
              aria-label="Illustrative job agreement and payment control"
            >
              <div className="lp-diagram-label">
                <span>THE AGREEMENT IS THE CONNECTION</span>
                <span>01 — 03</span>
              </div>
              <div className="lp-agreement">
                <div className="lp-paper-top">
                  <span>
                    <FileText size={15} />
                    JOB MANDATE
                  </span>
                  <span>STX–1042</span>
                </div>
                <h2>October invoices</h2>
                <p>30 documents → one accounting CSV</p>
                <div className="lp-cap">
                  <span>Approved budget cap</span>
                  <strong>
                    5.00 <small>demo units</small>
                  </strong>
                </div>
                <div className="lp-paper-rule">
                  <span>Approved provider</span>
                  <strong>LedgerWorks</strong>
                </div>
                <div className="lp-paper-rule">
                  <span>Payment policy</span>
                  <strong>Owner-confirmed</strong>
                </div>
                <div className="lp-paper-seal">
                  <Fingerprint size={21} />
                  <span>
                    Versioned rules.
                    <br />
                    <strong>Bound to the delivery.</strong>
                  </span>
                  <Check size={17} />
                </div>
              </div>
              <div className="lp-connection">
                <span />
                <LockKeyhole size={16} />
                <span />
              </div>
              <div className="lp-gate">
                <span className="lp-gate-icon">
                  <ShieldCheck size={22} />
                </span>
                <div>
                  <span>PAYMENT GATE</span>
                  <strong>Verified. Then approved by you.</strong>
                </div>
                <span className="lp-gate-dot" />
              </div>
              <div className="lp-diagram-foot">
                <span>Illustrative local workflow</span>
                <span>Rules → evidence → acceptance</span>
              </div>
            </div>
          </section>
          <div className="lp-principles">
            <span>
              <LockKeyhole size={16} />A cap that means something
            </span>
            <span>
              <FileText size={16} />A delivery you can inspect
            </span>
            <span>
              <CheckCircle2 size={16} />A payment you approve
            </span>
            <a href="#workflow" aria-label="Scroll to the workflow">
              <ArrowDown size={19} />
            </a>
          </div>
        </main>
      </div>

      <section
        className="lp-workflow lp-section"
        id="workflow"
        aria-labelledby="lp-workflow-title"
      >
        <div className="lp-section-heading">
          <div>
            <div className="lp-eyebrow">FROM BRIEF TO RECEIPT</div>
            <h2 id="lp-workflow-title">
              Trust the process.
              <br />
              <span>Inspect the proof.</span>
            </h2>
          </div>
          <p>
            See what buying an invoice-processing service looks like when every
            step has a clear boundary.
          </p>
        </div>
        <div className="lp-workflow-grid">
          <div className="lp-step-list" aria-label="Example workflow steps">
            {steps.map((s, i) => (
              <button
                key={s.label}
                className={step === i ? "lp-step active" : "lp-step"}
                aria-pressed={step === i}
                onClick={() => {
                  setStep(i);
                  setAccepted(false);
                }}
              >
                <span className="lp-step-number">0{i + 1}</span>
                <span>
                  <strong>{s.label}</strong>
                  <span>{s.description}</span>
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))}
            <p className="lp-example-note">
              An interactive example using STYX’s synthetic invoice fixture.
              Nothing is submitted or paid.
            </p>
          </div>
          <div className="lp-demo" aria-live="polite">
            <div className="lp-demo-toolbar">
              <span>
                <span className="lp-demo-initials">AS</span>Acme Studio
                <ChevronRight size={13} />
                October invoices
              </span>
              <span className="lp-demo-mode">
                <i />
                Local example
              </span>
            </div>
            <div className="lp-demo-body">
              <div className="lp-demo-heading">
                <span className="lp-eyebrow">
                  STX–1042 /{" "}
                  {step === 0
                    ? "MANDATE V1"
                    : step === 1
                      ? "DELIVERY REVIEW"
                      : "OWNER ACCEPTANCE"}
                </span>
                <h3>
                  {accepted ? "Every unit accounted for." : steps[step].title}
                </h3>
              </div>
              {step === 0 ? (
                <>
                  <div className="lp-demo-money">
                    <div>
                      <span>Maximum spend</span>
                      <strong>
                        5.00<small>demo units</small>
                      </strong>
                    </div>
                    <div>
                      <span>LedgerWorks quote</span>
                      <strong>
                        3.20<small>demo units</small>
                      </strong>
                    </div>
                  </div>
                  <div className="lp-demo-row">
                    <span>Permitted recipients</span>
                    <strong>Approved providers only</strong>
                  </div>
                  <div className="lp-demo-row">
                    <span>Expiry & acceptance</span>
                    <strong>Defined in your mandate</strong>
                  </div>
                  <div className="lp-demo-check">
                    <LockKeyhole size={16} />
                    Selecting a quote doesn’t spend funds.
                  </div>
                  <button className="lp-demo-action" onClick={() => setStep(1)}>
                    Next: inspect delivery
                    <ArrowRight size={16} />
                  </button>
                </>
              ) : step === 1 ? (
                <>
                  <div className="lp-output-file">
                    <FileText size={23} />
                    <div>
                      <strong>october-invoices.csv</strong>
                      <span>30 source documents · 30 output records</span>
                    </div>
                    <span>CSV</span>
                  </div>
                  <div className="lp-verification-list">
                    {[
                      "Schema and source coverage checked",
                      "Arithmetic reconciled by currency",
                      "2 duplicates and 3 uncertain fields flagged",
                    ].map((t) => (
                      <div key={t}>
                        <CheckCircle2 size={16} />
                        <span>{t}</span>
                      </div>
                    ))}
                  </div>
                  <p className="lp-verification-note">
                    Structural checks don’t establish invoice authenticity. Your
                    review still matters.
                  </p>
                  <button className="lp-demo-action" onClick={() => setStep(2)}>
                    Next: owner acceptance
                    <ArrowRight size={16} />
                  </button>
                </>
              ) : (
                <>
                  <div
                    className={
                      accepted ? "lp-accept-state accepted" : "lp-accept-state"
                    }
                  >
                    {accepted ? (
                      <CheckCircle2 size={30} />
                    ) : (
                      <LockKeyhole size={30} />
                    )}
                    <div>
                      <strong>
                        {accepted
                          ? "Example receipt recorded"
                          : "Waiting for your decision"}
                      </strong>
                      <span>
                        {accepted
                          ? "This was a visual example. No funds moved."
                          : "The provider cannot approve its own payment."}
                      </span>
                    </div>
                  </div>
                  <div className="lp-demo-row">
                    <span>
                      {accepted ? "Example paid amount" : "Reserved amount"}
                    </span>
                    <strong>3.20 demo units</strong>
                  </div>
                  <div className="lp-demo-row">
                    <span>Unused allocation</span>
                    <strong>1.80 demo units</strong>
                  </div>
                  <button
                    className="lp-demo-action"
                    onClick={() =>
                      accepted
                        ? (setStep(0), setAccepted(false))
                        : setAccepted(true)
                    }
                  >
                    {accepted ? "Replay the example" : "Preview acceptance"}
                    {accepted ? <ArrowRight size={16} /> : <Check size={16} />}
                  </button>
                </>
              )}
            </div>
            <div className="lp-demo-bottom">
              <ShieldCheck size={14} />
              <span>One job. One approved agreement. A traceable outcome.</span>
            </div>
          </div>
        </div>
      </section>

      <section
        className="lp-controls"
        id="controls"
        aria-labelledby="lp-controls-title"
      >
        <div className="lp-section">
          <div className="lp-section-heading">
            <div>
              <div className="lp-eyebrow">
                DELEGATE THE TASK. KEEP THE AUTHORITY.
              </div>
              <h2 id="lp-controls-title">
                Useful autonomy.
                <br />
                <span>Clear boundaries.</span>
              </h2>
            </div>
            <p>
              The job brief tells the service what to do. The approved mandate
              defines what it’s allowed to spend.
            </p>
          </div>
          <div className="lp-control-grid">
            {[
              {
                n: "01",
                icon: LockKeyhole,
                title: "Agree before allocating.",
                text: "Approve the budget, providers, recipients, and expiry. A changed rule requires your approval again.",
              },
              {
                n: "02",
                icon: Fingerprint,
                title: "Keep evidence with the work.",
                text: "Tie the source manifest and delivered output to the job. Inspect the checks and flagged fields in context.",
              },
              {
                n: "03",
                icon: ShieldCheck,
                title: "Stop the wrong payment.",
                text: "An attempted recipient change pauses the job. Repeated acceptance cannot produce a second local payment.",
              },
            ].map((c) => (
              <article key={c.n}>
                <div className="lp-control-top">
                  <c.icon size={24} />
                  <span>{c.n}</span>
                </div>
                <h3>{c.title}</h3>
                <p>{c.text}</p>
              </article>
            ))}
          </div>
          <div className="lp-mode-note">
            <span className="lp-mode-label">
              <i />
              BUILT TO BE INSPECTED
            </span>
            <p>
              The current release runs locally with demo units. NEAR testnet
              settlement and live inference are still in development.
            </p>
          </div>
        </div>
      </section>

      <section
        className="lp-questions lp-section"
        id="questions"
        aria-labelledby="lp-questions-title"
      >
        <div>
          <div className="lp-eyebrow">A FEW USEFUL DETAILS</div>
          <h2 id="lp-questions-title">
            Before you
            <br />
            <span>hand it over.</span>
          </h2>
        </div>
        <div className="lp-faqs">
          {[
            {
              q: "What can I use STYX for today?",
              a: "Prepare invoice-to-CSV deliveries from structured JSON and CSV inputs, inspect independent checks, and approve payments through the NEAR testnet escrow workflow. Choose local parsing or configured NEAR AI with explicit data-sharing and API-cost consent. Local demo scenarios are also available for practice.",
            },
            {
              q: "Does an agent get access to my whole budget?",
              a: "The mandate sets the maximum job allocation and permitted recipients. A quote reserves only its agreed price. In the testnet workflow, the owner confirms funding, agreement approval and payment release in their wallet; the model cannot sign these actions.",
            },
            {
              q: "Does a passing verification prove an invoice is correct?",
              a: "No. Checks cover schema, source coverage, arithmetic, duplicates, uncertainty and output integrity. They don’t establish invoice authenticity or every field’s business meaning. The owner reviews the evidence before acceptance.",
            },
            {
              q: "Do I need a wallet to try it?",
              a: "You can try local demo scenarios without a wallet. The NEAR testnet workflow needs a testnet wallet and test NEAR for funding, storage and gas. AI processing uses separate API credits and requires your approval. Mainnet payments are not enabled.",
            },
          ].map((f) => (
            <details key={f.q}>
              <summary>
                {f.q}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="lp-closing">
        <div>
          <span className="lp-eyebrow">FROM INTENT TO ACCOUNTABILITY</span>
          <h2>
            Let the work move.
            <br />
            <em>Keep the decision.</em>
          </h2>
        </div>
        <Link className="lp-button" to="/jobs">
          View your jobs <ArrowUpRight size={18} />
        </Link>
      </section>
      <footer className="lp-footer">
        <img src="/brand/styx-original.png" alt="STYX" />
        <span>A clear mandate for every job.</span>
        <a href="#top">
          Back to top <ArrowUpRight size={14} />
        </a>
        <small>NEAR testnet payments · owner-approved in your wallet</small>
      </footer>
    </div>
  );
}
