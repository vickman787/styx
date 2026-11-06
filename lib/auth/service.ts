import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Store } from "../storage/db.ts";
import { hash, id, insist } from "../domain/policy.ts";
export type AuthMode = "local" | "password";
export type Role = "owner" | "viewer";
export interface Access {
  authMode: AuthMode;
  authenticated: boolean;
  userId: string | null;
  username: string;
  workspaceId: string;
  role: Role;
  workspaces: { id: string; name: string; role: Role }[];
  csrf: string;
}
export class AccessError extends Error {
  constructor(
    message: string,
    public status = 401,
  ) {
    super(message);
  }
}
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9_.-]{2,39}$/,
    "Username must be 3–40 letters, numbers, dots, underscores or hyphens.",
  );
const workspaceSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{2,63}$/, "Invalid workspace ID.");
function passwordCheck(password: string) {
  insist(
    password.length >= 15 &&
      password.length <= 128 &&
      Buffer.byteLength(password) <= 512,
    "Use a password/passphrase of 15–128 characters.",
  );
}
const params = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, params, (e, key) =>
      e ? reject(e) : resolve(key),
    ),
  );
}
export async function passwordDigest(password: string) {
  passwordCheck(password);
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
const dummy = `scrypt-v1$${"0".repeat(32)}$${"0".repeat(128)}`;
export async function passwordMatches(password: string, digest: string) {
  if (password.length > 128 || Buffer.byteLength(password) > 512) return false;
  const parts = digest.split("$");
  if (
    parts.length !== 3 ||
    parts[0] !== "scrypt-v1" ||
    !/^[a-f0-9]{32}$/.test(parts[1]) ||
    !/^[a-f0-9]{128}$/.test(parts[2])
  )
    return false;
  return timingSafeEqual(
    await derive(password, parts[1]),
    Buffer.from(parts[2], "hex"),
  );
}
export class AccessService {
  constructor(
    public store: Store,
    public mode: AuthMode = "local",
    private now = () => Date.now(),
  ) {}
  async createUser(
    username: string,
    password: string,
    workspaceId: string,
    role: Role = "owner",
    workspaceName = workspaceId,
  ) {
    username = usernameSchema.parse(username);
    workspaceSchema.parse(workspaceId);
    z.enum(["owner", "viewer"]).parse(role);
    insist(
      !this.store.db
        .prepare("SELECT id FROM app_user WHERE username=?")
        .get(username),
      "Username already exists.",
    );
    const digest = await passwordDigest(password),
      userId = id();
    this.store.transaction(() => {
      this.store.db
        .prepare("INSERT OR IGNORE INTO workspace VALUES(?,?,'owner')")
        .run(workspaceId, workspaceName.slice(0, 80));
      // This is explicitly demo credit; no wallet or external funding occurs.
      if (workspaceId !== "acme-local")
        this.store.db
          .prepare(
            "INSERT OR IGNORE INTO ledger VALUES(?,?,NULL,'funding',10000)",
          )
          .run(`initial-funding:${workspaceId}`, workspaceId);
      this.store.db
        .prepare(
          "INSERT INTO app_user(id,username,password_digest) VALUES(?,?,?)",
        )
        .run(userId, username, digest);
      this.grant(userId, workspaceId, role);
    });
    return userId;
  }
  grant(userId: string, workspaceId: string, role: Role) {
    z.enum(["owner", "viewer"]).parse(role);
    insist(
      this.store.db.prepare("SELECT id FROM app_user WHERE id=?").get(userId),
      "User not found.",
    );
    insist(
      this.store.db
        .prepare("SELECT id FROM workspace WHERE id=?")
        .get(workspaceId),
      "Workspace not found.",
    );
    this.store.db
      .prepare(
        "INSERT INTO membership VALUES(?,?,?) ON CONFLICT(user_id,workspace_id) DO UPDATE SET role=excluded.role",
      )
      .run(userId, workspaceId, role);
  }
  memberships(userId: string): Access["workspaces"] {
    return this.store.db
      .prepare(
        "SELECT w.id,w.name,m.role FROM membership m JOIN workspace w ON w.id=m.workspace_id WHERE user_id=? ORDER BY w.id",
      )
      .all(userId) as any;
  }
  private csrf(token: string) {
    return hash(`styx-csrf:v1:${token}`);
  }
  private row(token?: string): any {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
    return this.store.db
      .prepare(
        "SELECT * FROM auth_session WHERE token_hash=? AND mode=? AND expires>?",
      )
      .get(hash(token), this.mode, this.now());
  }
  issue(
    userId: string | null = null,
    workspaceId = "acme-local",
    oldToken?: string,
  ) {
    const token = randomBytes(32).toString("hex");
    this.store.transaction(() => {
      if (oldToken) this.revoke(oldToken);
      this.store.db
        .prepare("DELETE FROM auth_session WHERE expires<=?")
        .run(this.now());
      this.store.db
        .prepare("INSERT INTO auth_session VALUES(?,?,?,?,?)")
        .run(
          hash(token),
          this.mode,
          userId,
          workspaceId,
          this.now() +
            (this.mode === "password" && !userId ? 10 * 60000 : 12 * 3600000),
        );
    });
    return token;
  }
  session(token?: string): Access | null {
    const row = this.row(token);
    if (!row) return null;
    if (this.mode === "local")
      return {
        authMode: this.mode,
        authenticated: true,
        userId: null,
        username: "Development-only local owner",
        workspaceId: "acme-local",
        role: "owner",
        workspaces: [{ id: "acme-local", name: "Acme Studio", role: "owner" }],
        csrf: this.csrf(token!),
      };
    if (!row.user_id)
      return {
        authMode: this.mode,
        authenticated: false,
        userId: null,
        username: "",
        workspaceId: "",
        role: "viewer",
        workspaces: [],
        csrf: this.csrf(token!),
      };
    const user = this.store.db
      .prepare("SELECT username,disabled FROM app_user WHERE id=?")
      .get(row.user_id);
    if (!user || user.disabled) {
      this.revoke(token!);
      return null;
    }
    const workspaces = this.memberships(row.user_id),
      membership = workspaces.find((w) => w.id === row.workspace_id);
    if (!membership) {
      this.revoke(token!);
      return null;
    }
    return {
      authMode: this.mode,
      authenticated: true,
      userId: row.user_id,
      username: String(user.username),
      workspaceId: row.workspace_id,
      role: membership.role,
      workspaces,
      csrf: this.csrf(token!),
    };
  }
  revoke(token: string) {
    this.store.db
      .prepare("DELETE FROM auth_session WHERE token_hash=?")
      .run(hash(token));
  }
  checkSessionIssue(ip: string) {
    const now = this.now(),
      key = hash(`anonymous-session:${ip}`);
    this.store.db.prepare("DELETE FROM auth_attempt WHERE expires<=?").run(now);
    this.store.db
      .prepare(
        "INSERT INTO auth_attempt VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
      )
      .run(key, now + 15 * 60000);
    if (
      Number(
        this.store.db
          .prepare("SELECT count FROM auth_attempt WHERE key=?")
          .get(key)!.count,
      ) > 60
    )
      throw new AccessError(
        "Too many session requests. Try again in 15 minutes.",
        429,
      );
  }
  private attempt(username: string, ip: string) {
    for (const [scope, limit] of [
      [`account:${username}`, 8],
      [`ip:${ip}`, 50],
    ] as const) {
      const key = hash(scope),
        now = this.now();
      this.store.db
        .prepare(
          "INSERT INTO auth_attempt VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END",
        )
        .run(key, now + 15 * 60000, now, now);
      const row = this.store.db
        .prepare("SELECT count FROM auth_attempt WHERE key=?")
        .get(key)!;
      if (Number(row.count) > limit)
        throw new AccessError(
          "Too many sign-in attempts. Try again in 15 minutes.",
          429,
        );
    }
  }
  async login(
    username: string,
    password: string,
    ip: string,
    oldToken: string,
  ) {
    if (this.mode !== "password")
      throw new AccessError("Password sign-in is not enabled.", 400);
    const normalized = username.toLowerCase().trim();
    this.attempt(normalized, ip);
    const user = this.store.db
      .prepare("SELECT * FROM app_user WHERE username=?")
      .get(normalized);
    const matched = await passwordMatches(
      password,
      user ? String(user.password_digest) : dummy,
    );
    if (!user || !matched || user.disabled)
      throw new AccessError("Username or password is incorrect.");
    // Re-read after asynchronous hashing: account revocation/password changes must win.
    const current = this.store.db
      .prepare("SELECT * FROM app_user WHERE id=?")
      .get(user.id!);
    const memberships = this.memberships(String(user.id));
    if (
      !current ||
      current.disabled ||
      current.password_digest !== user.password_digest ||
      !memberships.length
    )
      throw new AccessError("Username or password is incorrect.");
    return this.issue(String(user.id), memberships[0].id, oldToken);
  }
  switchWorkspace(token: string, workspaceId: string) {
    const access = this.session(token);
    if (!access?.authenticated || !access.userId)
      throw new AccessError("Sign in first.");
    if (!access.workspaces.some((w) => w.id === workspaceId))
      throw new AccessError("Workspace access denied.", 403);
    return this.issue(access.userId, workspaceId, token);
  }
  async changePassword(
    token: string,
    currentPassword: string,
    newPassword: string,
    ip: string,
  ) {
    const access = this.session(token);
    if (!access?.userId) throw new AccessError("Sign in first.");
    this.attempt(access.username, ip);
    const user = this.store.db
      .prepare("SELECT password_digest FROM app_user WHERE id=?")
      .get(access.userId)!;
    if (!(await passwordMatches(currentPassword, String(user.password_digest))))
      throw new AccessError("Current password is incorrect.");
    const digest = await passwordDigest(newPassword);
    // Prevent a stale password-change request from overwriting a newer one.
    this.store.transaction(() => {
      const changed = this.store.db
        .prepare(
          "UPDATE app_user SET password_digest=? WHERE id=? AND password_digest=? AND disabled=0",
        )
        .run(digest, access.userId, user.password_digest!);
      if (!changed.changes)
        throw new AccessError("Account changed. Sign in again.");
      this.store.db
        .prepare("DELETE FROM auth_session WHERE user_id=?")
        .run(access.userId);
    });
    return this.issue(access.userId, access.workspaceId);
  }
}
