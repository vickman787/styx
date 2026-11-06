import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { snapshotDatabase } from "../storage/operations.ts";
import { verifyRecoveredDatabase } from "../storage/recovery.ts";

async function unusedPort() {
  const listener = createServer();
  await new Promise<void>((done, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", done);
  });
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((done, reject) =>
    listener.close((error) => (error ? reject(error) : done())),
  );
  return port;
}
async function stop(child: ChildProcess) {
  if (!child.pid) return;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<boolean>((done) =>
    child.once("exit", () => done(true)),
  );
  child.kill();
  const stopped = await Promise.race([
    exited,
    new Promise<boolean>((done) => {
      const timer = setTimeout(() => done(false), 5000);
      timer.unref();
    }),
  ]);
  if (!stopped)
    throw Error(
      "Rehearsal process did not stop; temporary recovery files were retained.",
    );
}

export async function smokeRecovery(snapshot: string, root = process.cwd()) {
  if (!existsSync(resolve(root, "dist/index.html")))
    throw Error("Build the production frontend before rehearsal.");
  const directory = mkdtempSync(join(tmpdir(), "styx-recovery-server-"));
  let child: ChildProcess | undefined,
    clean = true;
  try {
    const recovered = join(directory, "recovered.sqlite");
    await snapshotDatabase(snapshot, recovered, true);
    verifyRecoveredDatabase(snapshot, recovered);
    const port = await unusedPort(),
      origin = `http://127.0.0.1:${port}`;
    // Deliberately do not inherit model/role secrets or enabled external services.
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      STYX_DB: recovered,
      PORT: String(port),
      HOST: "127.0.0.1",
      STYX_AUTH_MODE: "password",
      STYX_APP_ORIGIN: origin,
      STYX_MODE: "local",
      NEAR_AI_ENABLED: "false",
    };
    child = spawn(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        resolve(root, "server/index.ts"),
        "--production",
      ],
      { cwd: root, env, windowsHide: true, stdio: "ignore" },
    );
    let failed = false;
    child.once("error", () => {
      failed = true;
    });
    const deadline = Date.now() + 45000;
    let ready = false;
    while (Date.now() < deadline) {
      if (failed || child.exitCode !== null || child.signalCode !== null)
        throw Error("Rehearsal server could not start.");
      try {
        const response = await fetch(origin + "/health/ready", {
          signal: AbortSignal.timeout(1500),
        });
        ready =
          response.status === 200 && (await response.json()).status === "ready";
      } catch {
        /* Wait for this isolated process, never use the live app's port. */
      }
      if (ready) break;
      await new Promise((done) => setTimeout(done, 250));
    }
    if (!ready) throw Error("Rehearsal readiness timed out.");
    const home = await fetch(origin + "/", {
      signal: AbortSignal.timeout(5000),
    });
    if (home.status !== 200 || !(await home.text()).includes('<div id="root">'))
      throw Error("Rehearsal production homepage failed.");
    const privateApi = await fetch(origin + "/api/state", {
      signal: AbortSignal.timeout(5000),
    });
    if (privateApi.status !== 401)
      throw Error("Rehearsal private API was not protected.");
    await stop(child);
    const verified = verifyRecoveredDatabase(snapshot, recovered);
    return {
      ...verified,
      productionStartup: true,
      homepageStatus: 200,
      unauthenticatedPrivateApiStatus: 401,
      externalIntegrations: "disabled",
      liveDatabaseChanged: false,
    };
  } finally {
    if (child) {
      try {
        await stop(child);
      } catch (error) {
        clean = false;
        throw error;
      }
    }
    if (clean) rmSync(directory, { recursive: true, force: true });
  }
}
