import { spawn, type ChildProcess } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { basename, join, resolve, sep } from "node:path";

// A clean, offline, production-only install. No live database or keys are copied.
const root = process.cwd();
const parent = resolve(root, "data");
mkdirSync(parent, { recursive: true });
if (!realpathSync(parent).startsWith(realpathSync(root) + sep))
  throw Error("Production staging must remain inside the workspace.");
const directory = mkdtempSync(join(parent, "production-check-"));
let server: ChildProcess | undefined;
let safeToClean = true;
let stage = "staging";
const env: NodeJS.ProcessEnv = {};
for (const name of [
  "PATH",
  "Path",
  "SystemRoot",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "HOME",
  "LOCALAPPDATA",
  "APPDATA",
  "COMSPEC",
  "ComSpec",
])
  if (process.env[name]) env[name] = process.env[name];

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid)
    return;
  const exited = new Promise<void>((done) => child.once("exit", () => done()));
  child.kill();
  await Promise.race([
    exited,
    new Promise<void>((_, reject) => {
      const timer = setTimeout(
        () => reject(Error("Temporary process did not stop; files retained.")),
        5000,
      );
      timer.unref();
    }),
  ]);
}
async function port() {
  const listener = createServer();
  await new Promise<void>((done, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", done);
  });
  const result = (listener.address() as { port: number }).port;
  await new Promise<void>((done, reject) =>
    listener.close((e) => (e ? reject(e) : done())),
  );
  return result;
}
async function install(npm: string) {
  const child = spawn(
    process.execPath,
    [
      npm,
      "ci",
      "--omit=dev",
      "--ignore-scripts",
      "--offline",
      "--no-audit",
      "--no-fund",
      "--userconfig",
      join(directory, "empty.npmrc"),
    ],
    { cwd: directory, env, stdio: "ignore", windowsHide: true },
  );
  try {
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(
        () => reject(Error("Offline production installation timed out.")),
        300000,
      );
      child.once("error", () => {
        clearTimeout(timer);
        reject(Error("Could not start offline production installation."));
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) done();
        else
          reject(
            Error(
              "Offline production install failed. Required locked packages must already be in the npm cache.",
            ),
          );
      });
    });
  } finally {
    try {
      await stop(child);
    } catch (error) {
      safeToClean = false;
      throw error;
    }
  }
}
async function main() {
  const npm = process.env.npm_execpath;
  if (!npm || !existsSync(npm))
    throw Error("Run this check through npm run check:production.");
  if (!existsSync(join(root, "dist/index.html")))
    throw Error("Build the production frontend first.");
  for (const path of [
    "package.json",
    "package-lock.json",
    "server",
    "lib",
    "fixtures",
    "dist",
  ])
    cpSync(join(root, path), join(directory, path), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  writeFileSync(join(directory, "empty.npmrc"), "");
  if (
    existsSync(join(directory, "data")) ||
    existsSync(join(directory, ".env"))
  )
    throw Error("Private configuration entered staging; refusing startup.");
  console.log(
    "Staged application code, fixtures and production assets; private data/configuration excluded.",
  );
  stage = "offline_install";
  await install(npm);
  if (!existsSync(join(directory, "node_modules/tsx/package.json")))
    throw Error("Production runtime dependency tsx is missing.");
  if (
    existsSync(join(directory, "node_modules/vite/package.json")) ||
    existsSync(join(directory, "node_modules/@playwright/test/package.json"))
  )
    throw Error("Development dependencies entered the production install.");
  console.log(
    "Clean offline production dependency installation passed; development tooling omitted.",
  );
  const listen = await port();
  stage = "startup";
  const origin = `http://127.0.0.1:${listen}`;
  server = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts", "--production"],
    {
      cwd: directory,
      env: {
        ...env,
        HOST: "127.0.0.1",
        PORT: String(listen),
        STYX_MODE: "local",
        STYX_AUTH_MODE: "password",
        STYX_APP_ORIGIN: origin,
        STYX_DB: join(directory, "data/check.sqlite"),
        NEAR_AI_ENABLED: "false",
        STYX_B2_ENABLED: "false",
      },
      windowsHide: true,
      stdio: "ignore",
    },
  );
  let startupError = false;
  server.once("error", () => {
    startupError = true;
  });
  let ready = false;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (startupError || server.exitCode !== null || server.signalCode !== null)
      throw Error("Production-only runtime failed to start.");
    try {
      const r = await fetch(origin + "/health/ready", {
        signal: AbortSignal.timeout(1000),
      });
      ready = r.status === 200 && (await r.json()).status === "ready";
    } catch {
      /* Wait only for this isolated process. */
    }
    if (ready) break;
    await new Promise((done) => setTimeout(done, 250));
  }
  if (!ready) throw Error("Isolated production readiness timed out.");
  stage = "app_and_assets";
  const homepage = await fetch(origin + "/app", {
    signal: AbortSignal.timeout(5000),
  });
  const html = await homepage.text();
  if (homepage.status !== 200 || !html.includes('<div id="root">'))
    throw Error("Production app route failed.");
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(
    (m) => m[1],
  );
  if (!assets.length)
    throw Error("Production index does not reference compiled assets.");
  for (const asset of assets) {
    const r = await fetch(origin + asset, {
      signal: AbortSignal.timeout(5000),
    });
    if (
      r.status !== 200 ||
      (r.headers.get("content-type") || "").includes("text/html")
    )
      throw Error("Production asset failed.");
    await r.arrayBuffer();
  }
  const denied = await fetch(origin + "/api/state", {
    signal: AbortSignal.timeout(5000),
  });
  if (denied.status !== 401)
    throw Error("Anonymous private API was not denied.");
  await stop(server);
  const report = {
    passed: true,
    checkedAt: new Date().toISOString(),
    install: "clean offline npm ci --omit=dev --ignore-scripts",
    productionRuntime: true,
    developmentDependenciesOmitted: true,
    privateConfigurationCopied: false,
    liveDatabaseUsed: false,
    externalIntegrations: "disabled",
    appStatus: 200,
    compiledAssetsChecked: assets.length,
    anonymousPrivateApiStatus: 401,
    publicHosting: "not tested",
  };
  writeFileSync(
    join(root, "docs/verification/production-install.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
}
try {
  await main();
} catch (error) {
  writeFileSync(
    join(root, "docs/verification/production-install.json"),
    JSON.stringify(
      {
        passed: false,
        checkedAt: new Date().toISOString(),
        stage,
        reason:
          error instanceof Error
            ? error.message
            : "Production installation check failed.",
        liveDatabaseUsed: false,
        externalIntegrations: "disabled",
        publicHosting: "not tested",
      },
      null,
      2,
    ),
  );
  console.error(
    error instanceof Error
      ? error.message
      : "Production installation check failed.",
  );
  process.exitCode = 1;
} finally {
  if (server) {
    try {
      await stop(server);
    } catch {
      safeToClean = false;
      console.error("Temporary server could not stop; staged files retained.");
      process.exitCode = 1;
    }
  }
  // Resolve and verify the exact generated workspace target before recursive cleanup.
  const target = realpathSync(directory);
  if (
    safeToClean &&
    target.startsWith(realpathSync(parent) + sep) &&
    basename(target).startsWith("production-check-")
  )
    rmSync(target, { recursive: true, force: true });
}
