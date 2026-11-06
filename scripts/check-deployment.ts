import { deploymentCheck } from "../lib/operations/readiness.ts";

const args = process.argv.slice(2);
let backup: string | undefined,
  local = false,
  json = false;
try {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--local") local = true;
    else if (args[i] === "--json") json = true;
    else if (
      args[i] === "--backup" &&
      args[i + 1] &&
      !args[i + 1].startsWith("--")
    )
      backup = args[++i];
    else throw Error();
  }
  const report = deploymentCheck({ backup, local });
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(
      `STYX ${report.profile} configuration: ${report.configuration}. Launch remains unverified.`,
    );
    for (const check of report.checks)
      console.log(`[${check.status}] ${check.id}: ${check.message}`);
    console.log("Manual validation remains:");
    for (const gate of report.manualGates) console.log(`- ${gate}`);
  }
  process.exitCode = report.configuration === "checks_passed" ? 0 : 2;
} catch {
  console.error(
    "Usage: npm run check:deployment -- [--local] [--json] [--backup <snapshot-file>]",
  );
  process.exitCode = 1;
}
