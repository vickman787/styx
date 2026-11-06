import { useCallback, useEffect, useState } from "react";
export default function ChainStatus({
  request,
  enabled,
}: {
  request: (path: string) => Promise<any>;
  enabled: boolean;
}) {
  const [state, setState] = useState<{
    contractId: string;
    blockHeight: number;
    checkedAt: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    setState(null);
    try {
      setState(await request("/near/network"));
    } catch {
      setError(
        "Live contract verification failed. No chain connection is confirmed; refresh to retry.",
      );
    } finally {
      setBusy(false);
    }
  }, [request]);
  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);
  if (!enabled) return null;
  return (
    <section
      className="panel near-section"
      aria-label="Live testnet connection"
    >
      <div className="panel-pad">
        <h2>Live NEAR testnet</h2>
        {busy && (
          <p role="status">Checking the deployed code and finalized block…</p>
        )}
        {error && <p role="alert">{error}</p>}
        {state && (
          <>
            <p>
              Deployed code verified · finalized block{" "}
              {state.blockHeight.toLocaleString()} · checked{" "}
              {new Date(state.checkedAt).toLocaleTimeString()}
            </p>
            <p>
              <a
                className="text-link"
                href={`https://testnet.nearblocks.io/address/${state.contractId}`}
                target="_blank"
                rel="noreferrer"
              >
                {state.contractId}
              </a>
            </p>
          </>
        )}
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          Refresh chain data
        </button>
      </div>
    </section>
  );
}
