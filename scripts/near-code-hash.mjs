import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const path =
  process.argv[2] ||
  fileURLToPath(
    new URL(
      "../contracts/styx/target/wasm32-unknown-unknown/release/styx_escrow.wasm",
      import.meta.url,
    ),
  );
const digest = createHash("sha256").update(readFileSync(path)).digest();
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
let n = BigInt("0x" + digest.toString("hex")),
  encoded = "";
while (n > 0n) {
  encoded = alphabet[Number(n % 58n)] + encoded;
  n /= 58n;
}
for (const byte of digest) {
  if (byte !== 0) break;
  encoded = "1" + encoded;
}
console.log(encoded);
