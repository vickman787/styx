import { backupRunStatus, runBackup } from "../lib/operations/backup-runner.ts";
const [command, ...extra] = process.argv.slice(2);
try {
  if (extra.length || !["local", "cloud", "status"].includes(command))
    throw Error("Usage: npm run backup:run -- local | cloud | status");
  if (command === "status") {
    const result = backupRunStatus();
    console.log(JSON.stringify(result));
    process.exitCode = result.healthy ? 0 : 2;
  } else {
    const result = await runBackup({ localOnly: command === "local" });
    console.log(JSON.stringify(result));
    process.exitCode = ["local_verified", "uploaded"].includes(result.status)
      ? 0
      : 2;
  }
} catch (error) {
  console.error(
    error instanceof Error &&
      /^(Usage:|Backup runner is locked|A prior upload|Backup run failed)/.test(
        error.message,
      )
      ? error.message
      : "Backup operation failed; details were redacted.",
  );
  process.exitCode = 1;
}
