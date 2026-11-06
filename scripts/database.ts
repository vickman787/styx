import { snapshotDatabase } from "../lib/storage/operations.ts";
import { rehearseRecovery } from "../lib/storage/recovery.ts";
import { smokeRecovery } from "../lib/operations/recovery-smoke.ts";

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "backup" && args.length === 1) {
    console.log(
      JSON.stringify(
        await snapshotDatabase(
          process.env.STYX_DB || "data/styx.sqlite",
          args[0],
        ),
      ),
    );
  } else if (command === "restore" && args.length === 2) {
    console.log(JSON.stringify(await snapshotDatabase(args[0], args[1], true)));
  } else if (command === "rehearse" && args.length === 1) {
    console.log(JSON.stringify(await rehearseRecovery(args[0])));
  } else if (command === "smoke" && args.length === 1) {
    console.log(JSON.stringify(await smokeRecovery(args[0])));
  } else {
    throw new Error(
      "Usage: npm run db -- backup <new-file> | restore <backup-file> <new-database-file> | rehearse <backup-file> | smoke <backup-file>",
    );
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Database operation failed.",
  );
  process.exitCode = 1;
}
