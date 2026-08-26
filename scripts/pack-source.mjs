#!/usr/bin/env node
/** Pack current source + all catalog photos into one zip for in-app download. */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/workspace";
const STAGING = "/tmp/irrigation-pack";
const OUT = join(ROOT, "public/downloads");
const ZIP_NAME = "irrigation-designer-source.zip";

function fmtMb(bytes) {
  const n = bytes / (1024 * 1024);
  return n < 10 ? n.toFixed(1).replace(".", ",") : String(Math.round(n));
}

rmSync(STAGING, { recursive: true, force: true });
mkdirSync(STAGING, { recursive: true });
mkdirSync(OUT, { recursive: true });

const copies = [
  "README.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "eslint.config.mjs",
  "startup.sh",
  "src",
  "scripts",
  "server",
  "migrations",
  "public/favicon.svg",
  "public/og.jpg",
  "public/original-plan.jpg",
  "public/x-banner.jpg",
  "public/fonts",
  "public/__grok",
  "public/catalog",
];

for (const rel of copies) {
  const from = join(ROOT, rel);
  if (!existsSync(from)) continue;
  cpSync(from, join(STAGING, rel), { recursive: true });
}

writeFileSync(
  join(STAGING, "README.txt"),
  `Irrigation Designer — исходный код и фото каталога Hunter

Как запустить:
1. Распакуй этот архив в папку
2. npm install
3. npm run dev

Внутри: код приложения, скрипты, фото дождевателей (public/catalog и src/assets/catalog).
node_modules в архив не входит — ставится командой npm install.
`,
);

for (const n of readdirSync(OUT).filter((x) => x.endsWith(".zip"))) {
  rmSync(join(OUT, n), { force: true });
}
for (const n of readdirSync(ROOT).filter((x) => x.endsWith(".zip"))) {
  rmSync(join(ROOT, n), { force: true });
}

const zipPath = join(OUT, ZIP_NAME);
const py = `
import zipfile, os, sys
cwd, zip_path = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for root, dirs, files in os.walk(cwd):
        dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", "downloads")]
        for f in files:
            if f.endswith(".zip"):
                continue
            fp = os.path.join(root, f)
            z.write(fp, os.path.relpath(fp, cwd))
`;
execFileSync("python3", ["-c", py, STAGING, zipPath], { stdio: "inherit" });

const bytes = statSync(zipPath).size;
const label = `Irrigation Designer (${fmtMb(bytes)} МБ)`;
const names = [{ file: ZIP_NAME, label, bytes }];
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(names, null, 2));
writeFileSync(
  join(OUT, "index.html"),
  `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Irrigation Designer — исходный код</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
    a { display: block; padding: .75rem 1rem; margin: .4rem 0; background: #0b6e62; color: #fff; border-radius: 8px; text-decoration: none; }
    a:hover { background: #0e8576; }
    p { color: #444; }
  </style>
</head>
<body>
  <h1>Irrigation Designer</h1>
  <p>Один архив: код и все фото. Распакуй, затем <code>npm install</code> и <code>npm run dev</code>.</p>
  <a href="${ZIP_NAME}" download>${label}</a>
</body>
</html>
`,
);

rmSync(STAGING, { recursive: true, force: true });
console.log(JSON.stringify(names, null, 2));
