import { copyFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const serverMjs = join(dist, "server", "index.mjs");
const serverJs = join(dist, "server", "index.js");

if (!existsSync(serverJs) && existsSync(serverMjs)) {
  renameSync(serverMjs, serverJs);
}

mkdirSync(join(dist, ".openai"), { recursive: true });
copyFileSync(
  join(root, ".openai", "hosting.json"),
  join(dist, ".openai", "hosting.json"),
);

if (!existsSync(serverJs)) {
  throw new Error("Sites worker entry was not generated at dist/server/index.js");
}
