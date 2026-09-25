import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const assets = join(root, "dist/client/assets/app");
const names = new Set(readdirSync(assets));
const keep = new Set();
const pending = [];
const add = name => { if (names.has(name) && !keep.has(name)) { keep.add(name); pending.push(name); } };
const references = text => {
  for (const name of text.match(/[A-Za-z0-9_.-]+\.(?:m?js|css|woff2?|png|svg)/g) ?? []) add(name);
};
// Preserve the live build and six recent asset-bearing commits, including
// every lazy import they reference. Source copies remain in public/ and Git.
const recent = execFileSync("git", ["log", "-6", "--format=", "--name-only", "--", "public/assets/app"], { cwd: root, encoding: "utf8" });
for (const path of recent.split("\n")) if (path.startsWith("public/assets/app/")) add(basename(path));
const scan = directory => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (/\.(?:m?js|json|html)$/.test(entry.name)) references(readFileSync(path, "utf8"));
  }
};
// Nitro's entrypoint inventories every public file, including obsolete releases;
// that inventory is not a dependency root. Use the actual client manifest/SSR imports.
scan(join(root, "dist/server/_ssr"));
for (const name of readdirSync(join(root, "dist/server"))) {
  if (name.startsWith("_tanstack-start-manifest")) references(readFileSync(join(root, "dist/server", name), "utf8"));
}
for (const name of names) {
  if (!/^(?:index|routes|project-store|downloads|pdf-underlay|jspdf\.es\.min|index\.es|styles)-.+\.(?:js|css)$/.test(name)) add(name);
}
while (pending.length) {
  const name = pending.pop();
  if (/\.(?:m?js|css)$/.test(name)) references(readFileSync(join(assets, name), "utf8"));
}
let removed = 0, bytes = 0;
for (const name of names) {
  if (keep.has(name)) continue;
  const path = join(assets, name);
  bytes += statSync(path).size;
  unlinkSync(path); removed++;
}
console.log(`Deployment-only cleanup: ${removed} obsolete chunks, ${(bytes / 1048576).toFixed(1)} MiB; source copies preserved.`);
