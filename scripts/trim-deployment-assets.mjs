import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, unlinkSync, rmSync } from "node:fs";
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
// Preserve the live build and four recent asset-bearing commits, including
// every lazy import they reference. Source copies remain in public/ and Git.
const recent = execFileSync("git", ["log", "-4", "--format=", "--name-only", "--", "public/assets/app"], { cwd: root, encoding: "utf8" });
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
  // Any historical hashed entry can import an entire historical release.
  // Retain hashed modules through manifests/recent commits and their dependency
  // closure, not a list of known entry names (new entry names would leak history).
  if (!/-[A-Za-z0-9_-]+\.(?:m?js|css)$/.test(name)) add(name);
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

// Keep generated PNG originals in source. Library and exports share full-size
// WebP delivery images with exact alpha. Omit originals only when delivery exists.
for(const directory of ['plants','landscape']){
const landscape=join(root,'dist/client',directory);
const landscapeNames=new Set(readdirSync(landscape));
for(const name of landscapeNames){
  if(name.endsWith('.png')&&landscapeNames.has(name.replace(/\.png$/,'.webp')))unlinkSync(join(landscape,name));
}
}

// Old workspace-prefix bundles predate the retained app releases; none of their
// dependency graphs or the current build references them. Catalog JPEG drafts
// and _src_ inputs likewise are not used by catalog-photos.
// Preserve them in public/source, but do not deploy unused authoring/history files.
rmSync(join(root,'dist/client/assets/workspace'),{recursive:true,force:true});
const catalog=join(root,'dist/client/catalog');
for(const name of readdirSync(catalog)){
  if(name.startsWith('_src_')||name.endsWith('.jpg'))unlinkSync(join(catalog,name));
}

// Current clients use delivery URLs directly. Middleware provides legacy URL
// redirects only where the host routes missing static assets through it.
// No plant files participate in this delivery-only optimization.
const delivery=JSON.parse(readFileSync(join(root,'data/static-image-delivery.json'),'utf8'));
for(const asset of delivery.assets){
  const original=join(root,'dist/client',asset.source);
  const encoded=join(root,'dist/client',asset.target);
  if(statSync(encoded).size!==asset.bytes)throw new Error(`Invalid image delivery asset: ${asset.target}`);
  try{unlinkSync(original);}catch(error){if(error.code!=='ENOENT')throw error;}
}
