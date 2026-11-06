import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Wallet } from "lucide-react";
import "./wallet-control.css";
import { formatNear } from "../lib/settlement/near-types";

export default function WalletControl({
  request,
}: {
  request: (path: string) => Promise<any>;
}) {
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [chainBalance, setChainBalance] = useState<{
    amount: string;
    blockHeight: number;
  } | null>(null);
  const [balanceError, setBalanceError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    setChainBalance(null);
    setBalanceError("");
    if (account)
      void request("/near/wallet?owner=" + encodeURIComponent(account))
        .then((value) => {
          if (active) setChainBalance(value);
        })
        .catch(() => {
          if (active)
            setBalanceError(
              "Live wallet balance unavailable. Reopen the wallet panel to retry.",
            );
        });
    return () => {
      active = false;
    };
  }, [account, open, request]);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void import("./near-wallet")
      .then(async (wallet) => {
        const selector = await wallet.selector();
        if (!active) return;
        const update = () => {
          if (active)
            setAccount(selector.store.getState().accounts[0]?.accountId || "");
        };
        update();
        const subscription = selector.store.observable.subscribe(update);
        unsubscribe = () => subscription.unsubscribe();
      })
      .catch(() => {
        // A connection attempt reports initialization errors; the app remains usable.
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  async function action(disconnect = false) {
    setBusy(true);
    setError("");
    try {
      const wallet = await import("./near-wallet");
      if (disconnect) {
        await wallet.disconnect();
        setAccount("");
        setOpen(false);
      } else await wallet.connect();
    } catch (problem) {
      setError((problem as Error).message);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="wallet-control"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          root.current?.querySelector("button")?.focus();
        }
      }}
    >
      <button
        className="button header-wallet"
        disabled={busy}
        aria-expanded={account || error ? open : undefined}
        aria-controls={account || error ? "header-wallet-details" : undefined}
        title={
          account
            ? `${account} · NEAR testnet`
            : "Connect a NEAR testnet wallet"
        }
        onClick={() => (account || error ? setOpen(!open) : void action())}
      >
        <Wallet size={16} aria-hidden="true" />
        <span>{busy ? "Connecting…" : account || "Connect wallet"}</span>
        {account && <ChevronDown size={14} aria-hidden="true" />}
      </button>
      {open && (
        <section
          id="header-wallet-details"
          className="wallet-popover"
          aria-label="Wallet details"
        >
          <strong>NEAR testnet wallet</strong>
          {account && <p className="wallet-account">{account}</p>}
          {account && (
            <p>
              {chainBalance ? (
                <>
                  Account balance:{" "}
                  <strong>{formatNear(chainBalance.amount)} NEAR</strong>
                  <br />
                  Finalized block {chainBalance.blockHeight.toLocaleString()}
                </>
              ) : (
                balanceError || "Reading testnet account balance…"
              )}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <p>
            {account
              ? "Wallet connected across the workspace. "
              : "No wallet connected. "}
            Escrow payments use the configured testnet contract and require your
            wallet confirmation.
          </p>
          <Link
            className="text-link"
            to="/testnet"
            onClick={() => setOpen(false)}
          >
            Open testnet escrow
          </Link>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void action(Boolean(account))}
          >
            {account ? "Disconnect wallet" : "Retry connection"}
          </button>
        </section>
      )}
    </div>
  );
}
