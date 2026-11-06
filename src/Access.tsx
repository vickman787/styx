import { useState } from "react";
import { Link } from "react-router-dom";
import { LockKeyhole, ArrowLeft } from "lucide-react";
import type { Access } from "../lib/auth/service";
import "./access.css";
type Request = (path: string, body?: any) => Promise<any>;
export function accessChanged(destination = "/app") {
  localStorage.removeItem("styx-near-pending-intent");
  localStorage.setItem("styx-access-change", crypto.randomUUID());
  window.location.assign(destination);
}
export function SignIn({
  request,
  onSignedIn,
}: {
  request: Request;
  onSignedIn: (access: Access) => void;
}) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="access-page">
      <section className="access-card">
        <Link to="/" aria-label="STYX homepage">
          <img
            src="/brand/styx-original.png"
            alt="STYX"
            width={80}
            height={80}
          />
        </Link>
        <div className="eyebrow">YOUR WORKSPACE</div>
        <h1>Welcome back</h1>
        <p>Sign in to review jobs and keep work moving.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            void request("/auth/login", { username, password })
              .then(onSignedIn)
              .catch((e) => {
                setError(e.message);
                setPassword("");
              })
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Username
            <input
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={40}
              required
              autoFocus
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={128}
              required
            />
          </label>
          {error && (
            <p className="access-error" role="alert">
              {error}
            </p>
          )}
          <button className="button" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
            <LockKeyhole size={16} />
          </button>
        </form>
        <p className="helper">
          Accounts are provisioned by your workspace operator. Contact them for
          access or a password reset.
        </p>
        <Link className="back-link" to="/">
          <ArrowLeft size={14} />
          Back to homepage
        </Link>
      </section>
    </main>
  );
}
export function AccountPanel({
  access,
  request,
}: {
  access: Access;
  request: Request;
}) {
  const [workspace, setWorkspace] = useState(access.workspaceId),
    [currentPassword, setCurrentPassword] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = async (path: string, body: any, destination: string) => {
    setBusy(true);
    setError("");
    try {
      await request(path, body);
      accessChanged(destination);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <section className="panel access-panel">
      <div className="panel-title">
        <h2>Your account</h2>
      </div>
      <div className="panel-pad">
        <p>
          <strong>{access.username}</strong> ·{" "}
          {access.role === "owner" ? "Workspace owner" : "Read-only viewer"}
        </p>
        <p className="helper">
          Your account is separate from your wallet connection. Session access
          expires after 12 hours.
        </p>
        {error && (
          <p role="alert" className="access-error">
            {error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run("/auth/workspace", { workspaceId: workspace }, "/app");
          }}
        >
          <label>
            Workspace access
            <select
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
            >
              {access.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} · {w.role}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button secondary"
            disabled={busy || workspace === access.workspaceId}
          >
            Switch workspace
          </button>
        </form>
        <details>
          <summary>Change password</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                "/auth/password",
                { currentPassword, newPassword },
                "/settings",
              );
            }}
          >
            <label>
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                maxLength={128}
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={15}
                maxLength={128}
                required
              />
            </label>
            <p className="helper">
              Use a unique passphrase of at least 15 characters. Changing it
              signs out your other sessions.
            </p>
            <button className="button secondary" disabled={busy}>
              Update password
            </button>
          </form>
        </details>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void run("/auth/logout", {}, "/app")}
        >
          Sign out
        </button>
      </div>
    </section>
  );
}
