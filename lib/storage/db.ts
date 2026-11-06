import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Job } from "../domain/types.ts";
import { id, insist } from "../domain/policy.ts";
export class Store {
  db: DatabaseSync;
  workspace = "acme-local";
  private ownsDb = true;
  constructor(path = process.env.STYX_DB || "data/styx.sqlite") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      readFileSync(new URL("./migrations/001.sql", import.meta.url), "utf8"),
    );
    this.db.exec(
      readFileSync(new URL("./migrations/002.sql", import.meta.url), "utf8"),
    );
    this.db.exec(
      readFileSync(new URL("./migrations/003.sql", import.meta.url), "utf8"),
    );
    this.db
      .prepare(
        "INSERT OR IGNORE INTO workspace VALUES (?, 'STYX Workspace', 'owner')",
      )
      .run(this.workspace);
    this.db
      .prepare(
        "UPDATE workspace SET name='STYX Workspace' WHERE id=? AND name='Acme Studio'",
      )
      .run(this.workspace);
    this.db
      .prepare(
        "INSERT OR IGNORE INTO ledger VALUES ('initial-funding',?,NULL,'funding',10000)",
      )
      .run(this.workspace);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  forWorkspace(workspace: string): Store {
    insist(
      this.db.prepare("SELECT id FROM workspace WHERE id=?").get(workspace),
      "Workspace not found.",
    );
    const scoped = Object.create(Store.prototype) as Store;
    scoped.db = this.db;
    scoped.workspace = workspace;
    scoped.ownsDb = false;
    return scoped;
  }
  get(jobId: string): Job {
    const r = this.db
      .prepare("SELECT payload FROM job WHERE id=? AND workspace_id=?")
      .get(jobId, this.workspace);
    insist(r, "Job not found in this workspace.");
    return JSON.parse(String(r.payload));
  }
  jobs(): Job[] {
    return this.db
      .prepare(
        "SELECT payload FROM job WHERE workspace_id=? ORDER BY rowid DESC",
      )
      .all(this.workspace)
      .map((r) => JSON.parse(String(r.payload)));
  }
  save(j: Job) {
    insist(
      !j.workspaceId || j.workspaceId === this.workspace,
      "Job belongs to a different workspace.",
    );
    this.db
      .prepare(
        "INSERT INTO job VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE job.workspace_id=excluded.workspace_id",
      )
      .run(j.id, this.workspace, JSON.stringify(j));
  }
  record(table: string, jobId: string, payload: any, key: string = id()) {
    insist(
      [
        "mandate_version",
        "upload",
        "quote",
        "artifact",
        "verification_report",
        "approval",
        "settlement_attempt",
        "receipt",
      ].includes(table),
      "Invalid record type.",
    );
    this.db
      .prepare(`INSERT INTO ${table} VALUES(?,?,?,?)`)
      .run(key, this.workspace, jobId, JSON.stringify(payload));
  }
  event(jobId: string | null, kind: string, message: string) {
    this.db
      .prepare(
        "INSERT INTO audit_event(workspace_id,job_id,kind,message,at) VALUES(?,?,?,?,?)",
      )
      .run(this.workspace, jobId, kind, message, Date.now());
  }
  events() {
    return this.db
      .prepare(
        "SELECT * FROM audit_event WHERE workspace_id=? ORDER BY id DESC LIMIT 500",
      )
      .all(this.workspace);
  }
  balance() {
    const rows = this.db
      .prepare(
        "SELECT kind,SUM(amount) AS n FROM ledger WHERE workspace_id=? GROUP BY kind",
      )
      .all(this.workspace);
    const get = (k: string) => Number(rows.find((r) => r.kind === k)?.n || 0);
    const funding = get("funding"),
      spent = get("payment");
    const r = this.db
      .prepare(
        "SELECT COALESCE(SUM(amount),0) AS n FROM reservation WHERE workspace_id=? AND state IN ('reserved','pending')",
      )
      .get(this.workspace);
    const reserved = Number(r!.n);
    return { funding, available: funding - spent - reserved, reserved, spent };
  }
  close() {
    if (this.ownsDb) this.db.close();
  }
}
