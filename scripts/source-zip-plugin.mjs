/** Serve the source zip / download page before TanStack so they never become a SPA 404. */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ZIP = join(ROOT, "public/downloads/irrigation-designer-source.zip");
const PAGE = join(ROOT, "public/downloads/index.html");
const ZIP_PATHS = new Set([
  "/downloads/irrigation-designer-source.zip",
  "/source.zip",
  "/catalog/_irrigation-designer-source.zip",
]);
const PAGE_PATHS = new Set([
  "/downloads/index.html",
  "/get-source.html",
]);

function sendZip(req, res) {
  if (!existsSync(ZIP)) {
    res.statusCode = 404;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("source zip missing");
    return;
  }
  const { size } = statSync(ZIP);
  res.statusCode = 200;
  res.setHeader("content-type", "application/zip");
  res.setHeader("content-length", String(size));
  res.setHeader("content-disposition", 'attachment; filename="irrigation-designer-source.zip"');
  res.setHeader("cache-control", "no-store");
  res.setHeader("access-control-allow-origin", "*");
  const stream = createReadStream(ZIP);
  stream.on("error", () => {
    if (!res.headersSent) res.statusCode = 500;
    res.end();
  });
  req.on("close", () => stream.destroy());
  stream.pipe(res);
}

function sendPage(res) {
  const html = existsSync(PAGE)
    ? readFileSync(PAGE)
    : Buffer.from("<a href='/source.zip' download>Download</a>");
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("content-length", String(html.byteLength));
  res.setHeader("cache-control", "no-store");
  res.end(html);
}

export function sourceZipPlugin() {
  return {
    name: "source-zip",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathOnly = decodeURIComponent((req.url ?? "").split("?", 1)[0] ?? "");
        if ((req.method ?? "GET").toUpperCase() !== "GET") {
          next();
          return;
        }
        if (ZIP_PATHS.has(pathOnly)) {
          sendZip(req, res);
          return;
        }
        if (PAGE_PATHS.has(pathOnly)) {
          sendPage(res);
          return;
        }
        next();
      });
    },
  };
}
