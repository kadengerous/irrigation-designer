import { copyFileSync, cpSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const serverMjs = join(dist, "server", "index.mjs");
const serverJs = join(dist, "server", "index.js");

if (existsSync(serverMjs)) {
  renameSync(serverMjs, serverJs);
}

mkdirSync(join(dist, ".openai"), { recursive: true });
if (existsSync(join(root,"drizzle"))) cpSync(join(root,"drizzle"),join(dist,".openai","drizzle"),{recursive:true});
copyFileSync(
  join(root, ".openai", "hosting.json"),
  join(dist, ".openai", "hosting.json"),
);

if (!existsSync(serverJs)) {
  throw new Error("Sites worker entry was not generated at dist/server/index.js");
}

// Keep this release's hashed assets in source too. A fresh checkout must retain
// the live version's modules for tabs that remain open across the next publish.
cpSync(join(dist, "client", "assets"), join(root, "public", "assets"), { recursive: true, force: false });

// Bound the upload size without removing immutable source assets or recent tabs' imports.
await import("./trim-deployment-assets.mjs");
