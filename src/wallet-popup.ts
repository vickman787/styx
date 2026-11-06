// Meteor's SDK opens its approval popup after RPC reads. Reserve the window
// synchronously in the owner's click handler, before transient activation ends.
export function reserveMeteorPopup(walletId: string, expires = Infinity) {
  if (
    walletId !== "meteor-wallet" ||
    (window as Window & { meteorCom?: unknown }).meteorCom
  )
    return undefined;
  const originalOpen = window.open;
  const popup = originalOpen.call(
    window,
    "about:blank",
    "_blank",
    "popup=1,width=480,height=720",
  );
  if (!popup)
    throw Error(
      "Your browser blocked the wallet window. Allow popups for this STYX address, then click Confirm in owner wallet again. No transaction was sent.",
    );
  popup.document.title = "Opening Meteor Wallet";
  popup.document.body.textContent =
    "Preparing your Meteor approval screen. Keep this window open. Review and approve the request in Meteor when it loads.";
  let claimed = false;
  const restore = () => {
    if (window.open === handoff) window.open = originalOpen;
  };
  const handoff: typeof window.open = (url, target, features) => {
    let destination: URL | undefined;
    try {
      destination = new URL(String(url), location.href);
    } catch {
      /* Other window opens pass through. */
    }
    if (
      destination?.origin === "https://wallet.meteorwallet.app" &&
      destination.pathname === "/connect/testnet/sign"
    ) {
      restore();
      if (expires <= Date.now())
        throw Error(
          "The agreement or signing request expired while preparing Meteor. Close review and prepare a fresh review or agreement. No transaction was sent.",
        );
      if (popup.closed)
        throw Error(
          "The Meteor window was closed. Click Confirm in owner wallet to open it again.",
        );
      claimed = true;
      popup.location.replace(destination.href);
      popup.focus();
      return popup;
    }
    return originalOpen.call(window, url, target, features);
  };
  window.open = handoff;
  const timer = window.setTimeout(() => {
    restore();
    if (!claimed && !popup.closed) popup.close();
  }, 120000);
  return {
    dispose() {
      window.clearTimeout(timer);
      restore();
      if (!claimed && !popup.closed) popup.close();
    },
  };
}
