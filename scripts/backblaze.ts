import {
  createBackupKey,
  backupKey,
} from "../lib/operations/backup-envelope.ts";
import {
  BackblazeBackup,
  backblazeStatus,
} from "../lib/operations/backblaze.ts";
import {
  prepareBackup,
  recoverEncryptedBackup,
  verifiedArchive,
} from "../lib/operations/backup-files.ts";

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "status" && !args.length)
    console.log(JSON.stringify(backblazeStatus()));
  else if (command === "keygen" && args.length === 1) {
    createBackupKey(args[0]);
    console.log(
      "Backup encryption key created in the requested new file. Store a separate private recovery copy; the key was not printed.",
    );
  } else if (command === "prepare" && args.length === 2)
    console.log(JSON.stringify(await prepareBackup(args[0], args[1])));
  else if (command === "recover" && args.length === 2)
    console.log(JSON.stringify(await recoverEncryptedBackup(args[0], args[1])));
  else if (command === "check" && !args.length) {
    backupKey();
    console.log(JSON.stringify(await new BackblazeBackup().check()));
  } else if (command === "upload" && args.length === 1) {
    const envelope = await verifiedArchive(args[0]);
    console.log(JSON.stringify(await new BackblazeBackup().upload(envelope)));
  } else
    throw Error(
      "Usage: npm run backup:b2 -- status | keygen <new-key-file> | prepare <snapshot> <new-archive> | check | upload <archive> | recover <archive> <new-database>",
    );
} catch (error) {
  // Do not print filesystem error paths, request/response objects or provider messages.
  const message = error instanceof Error ? error.message : "";
  const safe = [
    "Configure STYX_BACKUP_KEY_FILE",
    "Backup authentication failed",
    "Backblaze ",
    "Encrypted backup destination",
    "Recovery destination",
    "Create a snapshot first",
    "This backup tool supports",
    "Usage:",
  ].some((prefix) => message.startsWith(prefix));
  console.error(
    safe
      ? message
      : "Backup operation failed. Check input format, private key/configuration and file permissions; details were redacted.",
  );
  process.exitCode = 1;
}
