import { formatNear } from "../lib/settlement/near-types";

type Provider = { id: string; name: string; price: string; recipient: string };
export default function NearProviderQuotes({
  providers,
  selected,
  onSelect,
  disabled,
}: {
  providers: Provider[];
  selected: string;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="near-provider-quotes" disabled={disabled}>
      <legend>Compare testnet service quotes</legend>
      <p className="helper">
        STYX-operated services for the selected verified invoice delivery.
        Prices are testnet NEAR. Selecting a service does not reserve funds or
        make a payment. The prepared agreement records the quote and its expiry.
      </p>
      <div>
        {providers.map((p) => (
          <label key={p.id} className={selected === p.id ? "selected" : ""}>
            <span>
              <input
                type="radio"
                name="testnet-provider"
                value={p.id}
                checked={selected === p.id}
                onChange={() => onSelect(p.id)}
              />
              {p.name}
            </span>
            <strong>{formatNear(p.price)} NEAR</strong>
            <small>
              Recipient: <code>{p.recipient}</code>
            </small>
          </label>
        ))}
      </div>
      {providers.length === 0 && <p>No testnet services are configured.</p>}
    </fieldset>
  );
}
