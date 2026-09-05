import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("catalog photo URLs are cache-busted consistently", () => {
  const photos = readFileSync(new URL("../src/lib/catalog-photos.ts", import.meta.url), "utf8");
  const catalog = readFileSync(new URL("../src/lib/hunter-catalog.ts", import.meta.url), "utf8");
  const designer = readFileSync(new URL("../src/components/designer/designer-app.tsx", import.meta.url), "utf8");

  assert.match(photos, /const PHOTO_VERSION = "9"/);
  assert.match(photos, /\?v=\$\{PHOTO_VERSION\}/);
  assert.doesNotMatch(catalog, /\/catalog\/.*\?v=[78]/);
  assert.doesNotMatch(designer, /\/catalog\/.*\?v=[78]/);
});
