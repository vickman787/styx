import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
if (!existsSync(join(root, "dist/index.html")))
  throw Error("Build the frontend first.");
const parent = resolve(root, "data/releases");
mkdirSync(parent, { recursive: true });
const directory = mkdtempSync(join(parent, "styx-vps-"));
const allowed = [
  "package.json",
  "package-lock.json",
  "server",
  "lib",
  "fixtures",
  "dist",
  "scripts/start-vps.ts",
  "scripts/access.ts",
  "scripts/database.ts",
  "scripts/check-deployment.ts",
  "data/contract-candidate/wasm32-unknown-unknown/release/styx_escrow.wasm",
];
function verifyTree(path: string) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink())
    throw Error("Symlinks are not allowed in release inputs.");
  if (stat.isDirectory()) {
    for (const name of readdirSync(path)) {
      if (
        name.startsWith(".env") ||
        /\.(?:sqlite|key|pem)(?:$|[.-])|private\.json$/i.test(name)
      )
        throw Error("Private file found in release inputs; packaging stopped.");
      verifyTree(join(path, name));
    }
  }
}
for (const path of allowed) {
  verifyTree(join(root, path));
  mkdirSync(resolve(directory, path, ".."), { recursive: true });
  cpSync(join(root, path), join(directory, path), {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
}
for (const name of [
  "Dockerfile",
  "compose.yaml",
  "Caddyfile.example",
  "styx.env.example",
])
  cpSync(join(root, "deploy/vps", name), join(directory, name));
writeFileSync(
  join(directory, ".dockerignore"),
  "**/.env*\n**/*.sqlite*\n**/*.key\n**/*.pem\n**/deployment.private.json\nnode_modules\nruntime.env\n",
);
const files: { path: string; sha256: string; bytes: number }[] = [];
function manifest(path = "") {
  for (const name of readdirSync(join(directory, path))) {
    const relative = path ? `${path}/${name}` : name;
    const target = join(directory, relative);
    if (lstatSync(target).isDirectory()) manifest(relative);
    else {
      const content = readFileSync(target);
      files.push({
        path: relative,
        sha256: createHash("sha256").update(content).digest("hex"),
        bytes: content.length,
      });
    }
  }
}
manifest();
writeFileSync(
  join(directory, "release-manifest.json"),
  JSON.stringify(
    { createdAt: new Date().toISOString(), privateDataIncluded: false, files },
    null,
    2,
  ),
);
const archive = directory + ".tar.gz";
const packed = spawnSync("tar", ["-czf", archive, "-C", directory, "."], {
  stdio: "pipe",
  windowsHide: true,
});
if (packed.status !== 0)
  throw Error("Archive creation failed. Staged files retained for inspection.");
const digest = createHash("sha256").update(readFileSync(archive)).digest("hex");
writeFileSync(archive + ".sha256", digest + "\n");
console.log(
  JSON.stringify({
    archive,
    sha256: digest,
    files: files.length,
    privateDataIncluded: false,
  }),
);
