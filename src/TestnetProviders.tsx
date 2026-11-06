import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatNear } from "../lib/settlement/near-types";
export default function TestnetProviders({
  request,
}: {
  request: (path: string) => Promise<any>;
}) {
  const [providers, setProviders] = useState<
    { id: string; name: string; price: string; recipient: string }[] | null
  >(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void request("/near")
      .then((status) => {
        if (active) setProviders(status.providers);
      })
      .catch(() => {
        if (active)
          setError(
            "Testnet service configuration unavailable. Reload to retry.",
          );
      });
    return () => {
      active = false;
    };
  }, [request]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">NEAR TESTNET / SERVICES</div>
          <h1>Testnet providers</h1>
          <p>Configured STYX service accounts and explicit NEAR quotes.</p>
        </div>
      </div>
      <p>
        These services are operated by STYX. Invoice evidence is prepared
        locally; delivery hashes and settlement use the deployed testnet
        contract.
      </p>
      {error && <p role="alert">{error}</p>}
      {!providers && !error && (
        <p role="status">Loading testnet service configuration…</p>
      )}
      <div className="provider-grid">
        {providers?.map((provider) => (
          <section className="panel panel-pad" key={provider.id}>
            <h2>{provider.name}</h2>
            <p>
              <strong>{formatNear(provider.price)} NEAR</strong> per agreement
            </p>
            <p className="hash-small">
              <a
                href={`https://testnet.nearblocks.io/address/${provider.recipient}`}
                target="_blank"
                rel="noreferrer"
              >
                {provider.recipient}
              </a>
            </p>
            <Link className="button" to="/testnet">
              Prepare an agreement
            </Link>
          </section>
        ))}
      </div>
    </>
  );
}
