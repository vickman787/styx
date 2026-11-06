import { verifyVpsStartup } from "../lib/operations/vps.ts";

try {
  verifyVpsStartup(process.env);
  if (!process.argv.includes("--production")) process.argv.push("--production");
  await import("../server/index.ts");
} catch {
  console.error(
    "VPS startup refused. Verify HTTPS origin, password mode, protected listener, persistent database and enabled workspace owners. No configuration values were printed.",
  );
  process.exitCode = 1;
}
