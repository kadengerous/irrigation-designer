import { cpSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const previous = fileURLToPath(new URL("../dist/client/assets/", import.meta.url));
const retained = fileURLToPath(new URL("../public/assets/", import.meta.url));
// Hash-named assets are immutable. Keep them for tabs opened before a deployment.
// These public files are committed with the next release, so clean builds retain them too.
if (existsSync(previous)) {
  mkdirSync(retained, { recursive: true });
  cpSync(previous, retained, { recursive: true, force: false });
}
