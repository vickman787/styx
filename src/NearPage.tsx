import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  LockKeyhole,
  RefreshCw,
  Wallet,
} from "lucide-react";
import {
  formatNear,
  parseNear,
  type NearAction,
  type NearExecution,
  type NearIntent,
} from "../lib/settlement/near-types";
import "./near.css";
import ChainStatus from "./ChainStatus";
import TestnetSource from "./TestnetSource";
import NearJobProgress from "./NearJobProgress";
import NearReceipt from "./NearReceipt";
import NearProviderQuotes from "./NearProviderQuotes";
import {
  chooseOwnerKey,
  walletRequestExpiry,
  checkWalletRequest,
} from "./near-wallet-policy";
import { reserveMeteorPopup } from "./wallet-popup";
type Request = (path: string, body?: any) => Promise<any>;
type Status = {
  model: { ready: boolean; enabled: boolean; model: string | null };
  ready: boolean;
  issues: string[];
  contractId: string | null;
  codeHash: string | null;
  providers: { id: string; name: string; price: string; recipient: string }[];
  executions: NearExecution[];
  intents: NearIntent[];
  archivedExecutions?: NearExecution[];
  archivedIntents?: NearIntent[];
  sourceJobs: {
    sourceOnly?: boolean;
    engine?: string;
    model?: string;
    id: string;
    sourceRootId?: string;
    createdAt?: number;
    name: string;
    reportExpires: number;
    artifactHash: string;
  }[];
};
type Balance = {
  available: string;
  reserved: string;
  withdrawal_pending: string;
  storage_credit: string;
};
const time = (n: number) => new Date(n).toLocaleString();
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel near-section">
      <div className="panel-title">
        <h2>{title}</h2>
      </div>
      <div className="panel-pad">{children}</div>
    </section>
  );
}
export default function NearPage({
  request,
  onSourceCreated,
}: {
  request: Request;
  onSourceCreated?: () => Promise<unknown>;
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<
      { accountId: string; publicKey?: string }[]
    >([]),
    [owner, setOwner] = useState(""),
    [walletKind, setWalletKind] = useState(""),
    [keys, setKeys] = useState<string[]>([]),
    [ownerKey, setOwnerKey] = useState("");
  const [balance, setBalance] = useState<Balance | null>(null),
    [balanceError, setBalanceError] = useState(""),
    [keysError, setKeysError] = useState(""),
    [balanceLoading, setBalanceLoading] = useState(false),
    [keysLoading, setKeysLoading] = useState(false),
    [ownerReadVersion, setOwnerReadVersion] = useState(0),
    [amount, setAmount] = useState(""),
    [storageDeposit, setStorageDeposit] = useState(""),
    [cap, setCap] = useState(""),
    [provider, setProvider] = useState(""),
    [jobId, setJobId] = useState(
      () => new URLSearchParams(location.search).get("job") || "",
    ),
    [selectedId, setSelectedId] = useState("");
  const [intent, setIntent] = useState<NearIntent | null>(null),
    [txHash, setTxHash] = useState(""),
    [reconcileId, setReconcileId] = useState("");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const connectedKey =
    walletKind === "meteor-wallet"
      ? ""
      : accounts.find((a) => a.accountId === owner)?.publicKey || "";
  const readOwner = useRef("");
  const reload = useCallback(async () => {
    const next = (await request("/near")) as Status;
    setStatus(next);
    return next;
  }, [request]);
  useEffect(() => {
    void reload().catch((e) => setError(e.message));
  }, [reload]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let mounted = true;
    let unsubscribe: undefined | (() => void);
    void import("./near-wallet")
      .then(async (w) => {
        const s = await w.selector();
        if (!mounted) return;
        const update = () => {
          if (!mounted) return;
          const next = s.store.getState().accounts;
          setWalletKind(s.store.getState().selectedWalletId || "");
          setAccounts(next);
          setOwner((old) =>
            next.some((a) => a.accountId === old)
              ? old
              : next[0]?.accountId || "",
          );
        };
        update();
        const sub = s.store.observable.subscribe(update);
        unsubscribe = () => sub.unsubscribe();
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      });
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);
  useEffect(() => {
    if (!owner || !status?.contractId || !status.codeHash) {
      setBalance(null);
      setKeys([]);
      setOwnerKey("");
      setBalanceError("");
      setKeysError("");
      setBalanceLoading(false);
      setKeysLoading(false);
      readOwner.current = "";
      return;
    }
    let active = true;
    if (readOwner.current !== owner) {
      setBalance(null);
      setKeys([]);
      setOwnerKey("");
      readOwner.current = owner;
    }
    setBalanceError("");
    setKeysError("");
    setBalanceLoading(true);
    setKeysLoading(true);
    void request("/near/balance?owner=" + encodeURIComponent(owner))
      .then((value) => {
        if (active) setBalance(value);
      })
      .catch(() => {
        if (active)
          setBalanceError(
            "Escrow balance could not be refreshed. Your wallet is still connected. Use Refresh escrow balance to retry.",
          );
      })
      .finally(() => {
        if (active) setBalanceLoading(false);
      });
    void request("/near/keys?owner=" + encodeURIComponent(owner))
      .then((value: string[]) => {
        if (!Array.isArray(value) || !value.length)
          throw Error("No full-access key returned");
        if (active) {
          setKeys(value);
          setOwnerKey((old) => chooseOwnerKey(value, connectedKey, old));
        }
      })
      .catch(() => {
        if (active)
          setKeysError(
            "Owner signing keys could not be read. Your wallet is still connected. Click Retry wallet keys.",
          );
      })
      .finally(() => {
        if (active) setKeysLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    owner,
    connectedKey,
    status?.contractId,
    status?.codeHash,
    request,
    ownerReadVersion,
  ]);
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const returned = query.get("transactionHashes"),
      failure = query.get("errorCode");
    if (!returned && !failure) return;
    const pending =
      query.get("intent") || localStorage.getItem("styx-near-pending-intent");
    if (failure) {
      setError(
        "The wallet did not confirm this request. Reconcile any submitted transaction before retrying.",
      );
      window.history.replaceState(null, "", "/testnet");
      return;
    }
    if (!pending || returned?.includes(",")) {
      setError(
        "Wallet callback did not match a single signing intent. Use manual reconciliation below.",
      );
      return;
    }
    setBusy(true);
    request("/near/intents/" + encodeURIComponent(pending) + "/confirm", {
      txHash: returned,
    })
      .then(async (result) => {
        setMessage(
          result.state === "confirmed"
            ? "Transaction finalized and contract state confirmed."
            : "Transaction is pending or failed. Inspect its saved request below.",
        );
        localStorage.removeItem("styx-near-pending-intent");
        await reload();
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        setBusy(false);
        window.history.replaceState(null, "", "/testnet");
      });
  }, [request, reload]);
  const prepare = (action: NearAction, record?: NearExecution) =>
    run(async () => {
      if (!owner) throw Error("Connect the owner's testnet wallet first.");
      const next = await request("/near/intents", {
        owner,
        action,
        ...(record ? { executionId: record.id } : {}),
        ...(["fund", "withdraw"].includes(action)
          ? { amount, ...(action === "fund" ? { storageDeposit } : {}) }
          : {}),
      });
      setIntent(next);
    });
  const submit = () => {
    let popup: ReturnType<typeof reserveMeteorPopup>;
    try {
      if (intent)
        checkWalletRequest(
          intent,
          status?.executions.find((e) => e.id === intent.executionId)?.mandate
            .expires,
        );
      if (
        intent &&
        intent.state === "prepared" &&
        intent.expires > Date.now() &&
        !["reserve", "deliver", "attest"].includes(intent.action)
      )
        popup = reserveMeteorPopup(
          walletKind,
          walletRequestExpiry(
            intent,
            status?.executions.find((e) => e.id === intent.executionId)?.mandate
              .expires,
          ),
        );
    } catch (error) {
      setError((error as Error).message);
      return;
    }
    return run(async () => {
      if (!intent) throw Error("Review a signing request first.");
      let result;
      if (["reserve", "deliver", "attest"].includes(intent.action)) {
        result = await request(
          "/near/intents/" + intent.id + "/submit-role",
          {},
        );
      } else {
        const wallet = await import("./near-wallet");
        const hash = await wallet.sendToWallet(intent, {
          contractId: status!.contractId,
          codeHash: status!.codeHash,
          ownerKeys: keys,
          agreementExpires: status!.executions.find(
            (e) => e.id === intent.executionId,
          )?.mandate.expires,
        });
        if (!hash) {
          setMessage(
            "Continue in your wallet. On return, STYX will reconcile the transaction before recording success.",
          );
          return;
        }
        result = await request("/near/intents/" + intent.id + "/confirm", {
          txHash: hash,
        });
      }
      setMessage(
        result.state === "confirmed"
          ? "Finalized and reconciled against the contract."
          : result.error ||
              "Transaction submitted; final confirmation is still pending.",
      );
      setIntent(null);
      await reload();
      if (owner) setOwnerReadVersion((version) => version + 1);
    }).finally(() => popup?.dispose());
  };
  if (!status)
    return <p role="status">Loading testnet integration readiness…</p>;
  const selected =
    status.executions.find((e) => e.id === selectedId) ||
    status.executions.find((e) => e.jobId === jobId) ||
    status.executions.find((e) => e.owner === owner) ||
    status.executions[0];
  const selectedExpired = Boolean(
    selected &&
    selected.mandate.expires <= now &&
    ["Planned", "Approved"].includes(selected.state),
  );
  const intentDeadline = intent
    ? walletRequestExpiry(
        intent,
        status.executions.find((e) => e.id === intent.executionId)?.mandate
          .expires,
      )
    : 0;
  const sourceJobs = status.sourceJobs.filter((j) => j.sourceOnly);
  const latestSources = sourceJobs.filter(
    (j, index, jobs) =>
      jobs.findIndex(
        (candidate) =>
          (candidate.sourceRootId || candidate.id) === (j.sourceRootId || j.id),
      ) === index,
  );
  const olderSources = sourceJobs.filter((j) => !latestSources.includes(j));
  const source = sourceJobs.find((j) => j.id === jobId);
  const selectedProvider = status.providers.find((p) => p.id === provider);
  let capIssue = "";
  if (cap) {
    try {
      const value = BigInt(parseNear(cap));
      if (value <= 0n) capIssue = "Enter a maximum spend greater than zero.";
      else if (selectedProvider && value < BigInt(selectedProvider.price))
        capIssue = `The selected quote is ${formatNear(selectedProvider.price)} NEAR. Choose another provider or enter a cap that covers it.`;
    } catch {
      capIssue = "Enter a valid NEAR amount with at most 24 decimal places.";
    }
  }
  const agreementBlocker = busy
    ? "Wait for the current request to finish."
    : !status.ready
      ? "Testnet configuration needs attention before preparing an agreement."
      : !owner
        ? "Connect your testnet wallet before preparing an agreement."
        : keysLoading
          ? "Reading your wallet signing keys…"
          : keysError
            ? "Signing keys are unavailable. Refresh escrow balance to retry."
            : !ownerKey
              ? "Choose your wallet’s Owner public key before preparing an agreement."
              : !source
                ? "Select a verified invoice delivery."
                : source.reportExpires <= Date.now()
                  ? "Invoice verification expired. Click Re-check saved invoice above."
                  : !selectedProvider
                    ? "Select a provider quote."
                    : !cap
                      ? "Enter your maximum spend in testnet NEAR."
                      : capIssue;
  return (
    <div className="near-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">INTEGRATIONS / NEAR TESTNET</div>
          <h1>Testnet escrow</h1>
          <p>Wallet-approved agreements and verifiable testnet settlement.</p>
        </div>
        <span className="mode">
          <i />
          NEAR testnet
        </span>
      </div>
      <ChainStatus
        request={request}
        enabled={Boolean(status.contractId && status.codeHash)}
      />
      <TestnetSource
        request={request}
        onCreated={async () => {
          await reload();
          await onSourceCreated?.();
        }}
        model={status.model}
      />
      {error && (
        <div className="error-banner" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {message && (
        <p className="near-message" role="status">
          {message}
        </p>
      )}
      {busy && (
        <p role="status" className="near-progress">
          Waiting for the requested operation…
        </p>
      )}
      {!status.ready && (
        <Section title="Configuration required">
          <p>
            You can connect a testnet wallet now. Funding and payment controls
            activate when the reviewed contract and signing roles are
            configured.
          </p>
          <ul className="near-issues">
            {status.issues.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="helper">
            No testnet deployment or live transfer is claimed. Server role
            secrets belong in environment configuration; STYX never requests
            your owner wallet's private key.
          </p>
        </Section>
      )}
      <div className="two-col near-top">
        <div>
          <Section title="Owner wallet">
            <p>
              Click Connect testnet wallet, choose your wallet, then create or
              sign in to a testnet account in the wallet. Return here to see
              your connected account. Connecting alone does not fund escrow or
              make a payment.
            </p>
            <div className="near-row">
              <span className="status">
                {owner ? "Wallet connected" : "No wallet connected"}
              </span>
              <div className="near-buttons">
                {!owner ? (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await (await import("./near-wallet")).connect();
                      })
                    }
                  >
                    <Wallet size={16} />
                    Connect testnet wallet
                  </button>
                ) : (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await (await import("./near-wallet")).disconnect();
                        setOwner("");
                        setBalance(null);
                        setOwnerKey("");
                      })
                    }
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>
            {accounts.length > 0 && (
              <label>
                Owner account
                <select
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.accountId}>{a.accountId}</option>
                  ))}
                </select>
              </label>
            )}
            {owner && (
              <label className="top-space">
                Owner public key
                <select
                  id="owner-public-key"
                  disabled={keysLoading || Boolean(keysError)}
                  value={ownerKey}
                  onChange={(e) => setOwnerKey(e.target.value)}
                >
                  <option value="">
                    {keysLoading
                      ? "Reading wallet keys…"
                      : keysError
                        ? "Wallet key read failed — use Retry wallet keys"
                        : "Select a full-access public key"}
                  </option>
                  {keys.map((k) => (
                    <option
                      key={k}
                      value={k}
                      disabled={
                        keys.includes(connectedKey) && k !== connectedKey
                      }
                    >
                      {k}
                      {k === connectedKey ? " · connected wallet" : ""}
                    </option>
                  ))}
                </select>
                <span className="helper">
                  The selected public key binds owner approval and acceptance.
                  The private key stays in your wallet.
                  {keys.length > 1 &&
                    " This account has multiple full-access keys. Choose the public key used by your connected wallet; choosing another key will make contract approval fail. Existing agreements keep their original key."}
                </span>
              </label>
            )}
            {keysError && <p role="alert">{keysError}</p>}
            {owner && (keysError || keysLoading) && (
              <button
                className="button secondary"
                disabled={keysLoading}
                onClick={() => setOwnerReadVersion((version) => version + 1)}
              >
                {keysLoading ? "Reading wallet keys…" : "Retry wallet keys"}
              </button>
            )}
            <dl className="definition">
              <div>
                <dt>Contract</dt>
                <dd>
                  <code>{status.contractId || "Not configured"}</code>
                </dd>
              </div>
              <div>
                <dt>Reviewed code hash</dt>
                <dd>
                  <code>{status.codeHash || "Not configured"}</code>
                </dd>
              </div>
              <div>
                <dt>Network / asset</dt>
                <dd>Testnet / native NEAR (24 decimals)</dd>
              </div>
            </dl>
          </Section>
          <Section title="Escrow balance">
            {owner && (
              <p>
                Escrow account: <strong>{owner}</strong>
              </p>
            )}
            {balance ? (
              <div className="near-balances">
                {[
                  ["Available", balance.available],
                  ["Reserved", balance.reserved],
                  ["Withdrawal pending", balance.withdrawal_pending],
                  ["Storage credit", balance.storage_credit],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>
                      {formatNear(value)} <small>NEAR</small>
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted" role={balanceError ? "alert" : "status"}>
                {!owner
                  ? "Connect a wallet to read finalized balances from the configured contract."
                  : balanceError ||
                    (balanceLoading
                      ? "Reading finalized escrow balance…"
                      : "Escrow balance is not available yet.")}
              </p>
            )}
            <p className="helper">
              Your wallet balance and escrow balance are separate. Escrow
              contains only funds deposited into STYX.
            </p>
            {balance && balanceError && (
              <p role="alert">
                {balanceError} Showing the last successful read.
              </p>
            )}
            <div className="form-row top-space">
              <label>
                Amount (testnet NEAR)
                <input
                  inputMode="decimal"
                  placeholder="Enter an amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label>
                Additional storage credit (NEAR)
                <input
                  inputMode="decimal"
                  value={storageDeposit}
                  onChange={(e) => setStorageDeposit(e.target.value)}
                />
              </label>
            </div>
            <p className="helper top-space">
              Funding attaches the escrow amount plus separate storage credit.
              Withdrawals can only use available escrow and return to the same
              owner account. Storage credit covers contract state and is
              retained separately.
            </p>
            <div className="near-buttons">
              <button
                className="button"
                disabled={
                  busy ||
                  !owner ||
                  !status.contractId ||
                  !status.codeHash ||
                  !amount ||
                  !storageDeposit
                }
                onClick={() => void prepare("fund")}
              >
                Review funding
              </button>
              <button
                className="button secondary"
                disabled={busy || !balance || !amount}
                onClick={() => void prepare("withdraw")}
              >
                Review withdrawal
              </button>
              <button
                className="icon-button"
                disabled={
                  busy || balanceLoading || !owner || !status.contractId
                }
                aria-label="Refresh escrow balance"
                onClick={() => {
                  setError("");
                  setOwnerReadVersion((version) => version + 1);
                }}
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </Section>
        </div>
        <aside>
          <Section title="New testnet agreement">
            <p className="helper">
              Choose a verified local delivery and an independent NEAR cap.
              Prices below are explicit NEAR quotes from the STYX testnet
              service account.
            </p>
            <div className="near-form">
              {latestSources
                .filter((j) => j.reportExpires <= Date.now())
                .map((j) => (
                  <div key={j.id}>
                    <p className="helper">
                      {j.name} · {j.id} · Verification expired
                    </p>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const refreshed = await request(
                            `/jobs/${j.id}/reverify`,
                            {},
                          );
                          await reload();
                          await onSourceCreated?.();
                          setJobId(refreshed.id);
                          setMessage(
                            "Saved invoice and CSV re-checked. No AI request or wallet payment was made.",
                          );
                        })
                      }
                    >
                      Re-check saved invoice
                    </button>
                  </div>
                ))}
              <label>
                Verified source job
                <select
                  value={source?.id || ""}
                  onChange={(e) => setJobId(e.target.value)}
                >
                  <option value="">Select a verified delivery</option>
                  {latestSources.map((j) => (
                    <option
                      key={j.id}
                      value={j.id}
                      disabled={j.reportExpires <= Date.now()}
                    >
                      {j.id} · {j.name}
                      {j.engine === "near_ai"
                        ? ` · AI: ${j.model}`
                        : " · local parsing"}
                      {j.reportExpires <= Date.now()
                        ? " · evidence expired"
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              {olderSources.length > 0 && (
                <details>
                  <summary>
                    Earlier verification versions ({olderSources.length})
                  </summary>
                  <p className="helper">
                    Retained for existing agreements. Use the latest version
                    above to prepare a new agreement.
                  </p>
                  <ul>
                    {olderSources.map((j) => (
                      <li key={j.id}>
                        {j.id} · {j.name} ·{" "}
                        {j.reportExpires <= Date.now()
                          ? "Verification expired"
                          : "Earlier version"}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <NearProviderQuotes
                providers={status.providers}
                selected={selectedProvider?.id || ""}
                onSelect={setProvider}
                disabled={busy}
              />
              <label>
                Maximum spend (testnet NEAR)
                <input
                  inputMode="decimal"
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                  placeholder="Enter an explicit NEAR cap"
                />
              </label>
              {selectedProvider && (
                <p className="helper">
                  Recipient: <code>{selectedProvider.recipient}</code>
                </p>
              )}
              <p className="helper">
                Agreement expires within 30 minutes, or earlier when the source
                verification expires. Owner, agent, provider, and verifier are
                separate principals.
              </p>
              {agreementBlocker && (
                <div className="helper" id="agreement-blocker" role="status">
                  <p>{agreementBlocker}</p>
                  {owner && !ownerKey && !keysLoading && !keysError && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        const field =
                          document.getElementById("owner-public-key");
                        field?.scrollIntoView({
                          block: "center",
                          behavior: "smooth",
                        });
                        field?.focus({ preventScroll: true });
                      }}
                    >
                      Choose owner public key
                    </button>
                  )}
                </div>
              )}
              <button
                className="button"
                disabled={Boolean(agreementBlocker)}
                aria-describedby={
                  agreementBlocker ? "agreement-blocker" : undefined
                }
                onClick={() =>
                  void run(async () => {
                    const r = await request("/near/executions", {
                      jobId: source!.id,
                      owner,
                      ownerKey,
                      provider: selectedProvider!.id,
                      cap,
                      expires: Math.min(
                        Date.now() + 1800000,
                        source!.reportExpires,
                      ),
                    });
                    setSelectedId(r.id);
                    setMessage(
                      "Agreement prepared. Review the immutable rules below, then approve in your wallet.",
                    );
                    await reload();
                  })
                }
              >
                Prepare agreement
              </button>
            </div>
          </Section>
        </aside>
      </div>
      <Section title="Testnet agreements">
        {status.executions.length === 0 ? (
          <div className="empty">
            <LockKeyhole size={26} />
            <h3>No testnet agreements yet</h3>
            <p>
              Prepare invoice evidence from your files, then prepare an
              independently priced NEAR agreement.
            </p>
            <Link className="text-link" to="/jobs">
              Review invoice jobs
              <ArrowUpRight size={14} />
            </Link>
          </div>
        ) : (
          <>
            <label>
              Agreement
              <select
                aria-label="Agreement"
                value={selected?.id || ""}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {status.executions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ·{" "}
                    {e.mandate.expires <= now &&
                    ["Planned", "Approved"].includes(e.state)
                      ? "Expired"
                      : e.state}{" "}
                    · {time(e.createdAt)} · {e.id.slice(-8)} · {e.owner}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <>
                <div className="near-row top-space">
                  <strong>{selected.name}</strong>
                  <span
                    className={
                      "status " + (selected.state === "Paid" ? "good" : "")
                    }
                  >
                    {selectedExpired
                      ? `Expired (${selected.state})`
                      : selected.state}
                  </span>
                </div>
                {selected.lastError && (
                  <p role="alert" className="field-error">
                    {selected.lastError}
                  </p>
                )}
                <NearJobProgress
                  job={selected}
                  expired={
                    selected.mandate.expires <= now &&
                    ["Planned", "Approved", "Reserved"].includes(selected.state)
                  }
                />
                <dl className="definition">
                  <div>
                    <dt>Owner</dt>
                    <dd>{selected.owner}</dd>
                  </div>
                  <div>
                    <dt>Cap / agreed quote</dt>
                    <dd>
                      {formatNear(selected.mandate.cap)} /{" "}
                      {formatNear(selected.quote.amount)} NEAR
                    </dd>
                  </div>
                  <div>
                    <dt>Unused allocation</dt>
                    <dd>
                      {formatNear(
                        (
                          BigInt(selected.mandate.cap) -
                          BigInt(selected.quote.amount)
                        ).toString(),
                      )}{" "}
                      NEAR
                    </dd>
                  </div>
                  <div>
                    <dt>Provider recipient</dt>
                    <dd>{selected.quote.recipient}</dd>
                  </div>
                  <div>
                    <dt>Expires</dt>
                    <dd>{time(selected.mandate.expires)}</dd>
                  </div>
                  <div>
                    <dt>Source delivery</dt>
                    <dd>
                      <Link
                        className="text-link"
                        to={"/jobs/" + selected.jobId}
                      >
                        {selected.jobId}
                        <ArrowUpRight size={13} />
                      </Link>
                    </dd>
                  </div>
                  <div>
                    <dt>Artifact hash</dt>
                    <dd>
                      <code>{selected.artifactHash}</code>
                    </dd>
                  </div>
                </dl>
                <details className="near-rule-details">
                  <summary>Inspect the exact onchain mandate</summary>
                  <pre>{JSON.stringify(selected.mandate, null, 2)}</pre>
                </details>
                <div className="near-stage">
                  <CheckCircle2 size={16} />
                  <span>
                    Delivery:{" "}
                    {selected.delivered ? "confirmed" : "not submitted"} ·
                    Attestation:{" "}
                    {selected.attested ? "confirmed" : "not submitted"}
                  </span>
                </div>
                <div className="near-buttons">
                  {selectedExpired && (
                    <div>
                      <p className="helper">
                        This agreement expired. Prepare a fresh proposal from
                        the saved invoice with the same provider, public key and{" "}
                        {formatNear(selected.mandate.cap)} NEAR cap. You will
                        review and approve it in your wallet. Re-checking saved
                        evidence makes no AI request or payment.
                      </p>
                      <button
                        className="button"
                        disabled={busy || owner !== selected.owner}
                        onClick={() =>
                          run(async () => {
                            const refreshed = await request(
                              `/jobs/${selected.jobId}/reverify`,
                              {},
                            );
                            const next = await request("/near/executions", {
                              jobId: refreshed.id,
                              owner: selected.owner,
                              ownerKey: selected.ownerKey,
                              provider: selected.provider,
                              cap: formatNear(selected.mandate.cap),
                              expires: Math.min(
                                Date.now() + 1800000,
                                refreshed.report.expires,
                              ),
                            });
                            setIntent(null);
                            setSelectedId(next.id);
                            setJobId(refreshed.id);
                            await reload();
                            await onSourceCreated?.();
                            setMessage(
                              "Fresh agreement prepared with the same provider, key and cap. Review owner approval next. No transaction was sent.",
                            );
                          })
                        }
                      >
                        Prepare fresh agreement
                      </button>
                    </div>
                  )}
                  {selected.state === "Approved" &&
                    !selectedExpired &&
                    selected.quote.expires <= Date.now() && (
                      <button
                        className="button"
                        disabled={busy || owner !== selected.owner}
                        onClick={() =>
                          run(async () => {
                            await request(
                              `/near/executions/${selected.id}/renew-quote`,
                              {},
                            );
                            await reload();
                            setMessage(
                              "Provider quote renewed at the same price. Review agent reservation next.",
                            );
                          })
                        }
                      >
                        Renew expired provider quote
                      </button>
                    )}
                  <button
                    className="button"
                    disabled={
                      busy ||
                      owner !== selected.owner ||
                      selected.state !== "Planned" ||
                      selectedExpired
                    }
                    onClick={() => void prepare("approve", selected)}
                  >
                    Review owner approval
                  </button>
                  <button
                    className="button secondary"
                    disabled={
                      busy ||
                      owner !== selected.owner ||
                      selected.state !== "Approved" ||
                      selected.quote.expires <= Date.now() ||
                      selected.mandate.expires <= Date.now()
                    }
                    onClick={() => void prepare("reserve", selected)}
                  >
                    Review agent reservation
                  </button>
                  <button
                    className="button secondary"
                    disabled={
                      busy ||
                      owner !== selected.owner ||
                      selected.state !== "Reserved" ||
                      selected.delivered
                    }
                    onClick={() => void prepare("deliver", selected)}
                  >
                    Review provider delivery
                  </button>
                  <button
                    className="button secondary"
                    disabled={
                      busy ||
                      owner !== selected.owner ||
                      selected.state !== "Reserved" ||
                      !selected.delivered ||
                      selected.attested
                    }
                    onClick={() => void prepare("attest", selected)}
                  >
                    Review verifier attestation
                  </button>
                  <button
                    className="button"
                    disabled={
                      busy ||
                      owner !== selected.owner ||
                      selected.state !== "Reserved" ||
                      !selected.attested
                    }
                    onClick={() => void prepare("release", selected)}
                  >
                    Accept & release {formatNear(selected.quote.amount)} NEAR
                  </button>
                  <button
                    className="button secondary"
                    disabled={
                      busy ||
                      owner !== selected.owner ||
                      !["Approved", "Reserved"].includes(selected.state)
                    }
                    onClick={() => void prepare("refund", selected)}
                  >
                    Release reservation
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy || selected.state === "Planned"}
                    onClick={() =>
                      void run(async () => {
                        await request(
                          "/near/executions/" +
                            encodeURIComponent(selected.id) +
                            "/refresh",
                          {},
                        );
                        await reload();
                      })
                    }
                  >
                    <RefreshCw size={14} />
                    Refresh chain state
                  </button>
                </div>
                <p className="helper top-space">
                  Owner actions open your wallet after review. Buyer-agent,
                  provider and verifier actions use their separately configured
                  server keys. A reservation release returns funds to internal
                  available escrow; an owner withdrawal is a separate transfer.
                </p>
                {selected.receipt && (
                  <div className="near-receipt">
                    <CheckCircle2 size={23} />
                    <div>
                      <h3>Confirmed NEAR testnet receipt</h3>
                      <p>
                        {formatNear(selected.receipt.paid)} NEAR paid to{" "}
                        {selected.receipt.recipient}
                      </p>
                      <p className="helper">
                        Finality reconciled at {time(selected.receipt.at)}
                      </p>
                      <a
                        className="text-link"
                        href={
                          "https://testnet.nearblocks.io/txns/" +
                          selected.receipt.txHash
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        View actual transaction
                        <ExternalLink size={13} />
                      </a>
                      <code>{selected.receipt.txHash}</code>
                    </div>
                  </div>
                )}
                <NearReceipt job={selected} intents={status.intents} />
              </>
            )}
          </>
        )}
      </Section>
      {Boolean(status.archivedExecutions?.length) && (
        <Section title="Earlier contract history">
          <p className="helper">
            These saved agreements belong to earlier contracts and are read-only
            here. Their funds remain on the original contract. Funding the
            current contract is a separate wallet action.
          </p>
          {status.archivedExecutions!.map((job) => (
            <details key={job.id} className="near-rule-details">
              <summary>
                {job.name} · {job.state} · {job.id.slice(-8)}
              </summary>
              <p>
                Contract domain: <code>{job.mandate.domain}</code>
              </p>
              <p>Owner: {job.owner}</p>
              <NearReceipt job={job} intents={status.archivedIntents || []} />
            </details>
          ))}
        </Section>
      )}
      {intent && (
        <Section title="Review transaction before signing">
          <div className="notice">
            <LockKeyhole size={17} />
            <span>
              Network: NEAR testnet · Method: <strong>{intent.action}</strong> ·
              Attached deposit:{" "}
              <strong>
                {formatNear(intent.transaction.actions[0].params.deposit)} NEAR
              </strong>
              . Network gas is additional.
            </span>
          </div>
          <p>
            Signer: <code>{intent.transaction.signerId}</code>
          </p>
          <p>
            Receiver: <code>{intent.transaction.receiverId}</code>
          </p>
          <details className="near-rule-details">
            <summary>Exact arguments and gas limit</summary>
            <pre>
              {JSON.stringify(intent.transaction.actions[0].params, null, 2)}
            </pre>
          </details>
          <p className="helper">
            Request expires {time(intentDeadline)}. A wallet redirect or
            submission is not settlement; STYX waits for FINAL receipts and
            verifies contract state.
          </p>
          <div className="near-buttons">
            <button
              className="button"
              disabled={
                busy || intentDeadline <= now || intent.state !== "prepared"
              }
              onClick={() => void submit()}
            >
              {["reserve", "deliver", "attest"].includes(intent.action)
                ? "Submit with configured role"
                : "Confirm in owner wallet"}
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setIntent(null)}
            >
              Close review
            </button>
          </div>
        </Section>
      )}
      <Section title="Requests & reconciliation">
        <p className="helper">
          If the wallet redirected without a result, or RPC timed out, reconcile
          the same transaction. Do not assume a failed screen means no funds
          moved.
        </p>
        <div className="near-request-list">
          {[...status.intents]
            .sort(
              (a, b) =>
                Number(b.state === "submitted") -
                  Number(a.state === "submitted") || b.createdAt - a.createdAt,
            )
            .slice(0, 12)
            .map((i) => (
              <div key={i.id}>
                <span>
                  <strong>{i.action}</strong>
                  <small>
                    {time(i.createdAt)} · {i.transaction.signerId}
                  </small>
                  <small>
                    {i.executionId
                      ? `${status.executions.find((e) => e.id === i.executionId)?.name || "Agreement"} · ${i.executionId.slice(-8)}`
                      : "Escrow balance action"}
                  </small>
                  {i.state === "submitted" && !i.txHash && (
                    <small className="field-error">
                      Submission outcome is unknown. Check transaction history
                      for {i.transaction.signerId}, then reconcile that
                      transaction below before submitting again.
                    </small>
                  )}
                  {i.error && <small className="field-error">{i.error}</small>}
                  {i.txHash && <code>{i.txHash}</code>}
                </span>
                <span className="status">{i.state}</span>
                {i.state === "prepared" && i.expires > Date.now() && (
                  <button
                    className="button secondary compact"
                    disabled={busy}
                    onClick={() => setIntent(i)}
                  >
                    Review
                  </button>
                )}
                {i.state === "submitted" && i.txHash && (
                  <button
                    className="button secondary compact"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const next = await request(
                          "/near/intents/" + i.id + "/confirm",
                          { txHash: i.txHash },
                        );
                        setMessage(
                          next.state === "confirmed"
                            ? "Finalized and reconciled."
                            : next.error || "Still pending.",
                        );
                        await reload();
                      })
                    }
                  >
                    Reconcile
                  </button>
                )}
              </div>
            ))}
          {status.intents.length === 0 && (
            <p className="muted">No testnet signing requests.</p>
          )}
        </div>
        <div className="near-form top-space">
          <label>
            Saved signing request
            <select
              value={reconcileId}
              onChange={(e) => setReconcileId(e.target.value)}
            >
              <option value="">Choose a request to reconcile</option>
              {status.intents
                .filter((i) => i.state !== "confirmed")
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.action} ·{" "}
                    {i.executionId
                      ? `${status.executions.find((e) => e.id === i.executionId)?.name || "Agreement"} · ${i.executionId.slice(-8)}`
                      : "Escrow"}{" "}
                    · {i.state} · {time(i.createdAt)} · {i.id.slice(-8)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Actual transaction hash
            <input
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              placeholder="Paste the hash from your wallet"
              autoComplete="off"
            />
          </label>
          <button
            className="button secondary"
            disabled={busy || !reconcileId || !txHash}
            onClick={() =>
              void run(async () => {
                const next = await request(
                  "/near/intents/" + reconcileId + "/confirm",
                  { txHash },
                );
                setMessage(
                  next.state === "confirmed"
                    ? "Finalized and reconciled."
                    : next.error || "Not yet final.",
                );
                await reload();
              })
            }
          >
            Reconcile transaction
          </button>
        </div>
      </Section>
    </div>
  );
}
