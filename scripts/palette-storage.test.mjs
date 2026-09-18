import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const moduleUrl = (source) =>
  "data:text/javascript;base64," +
  Buffer.from(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  ).toString("base64");
const storage = moduleUrl(
  await readFile(new URL("../server/palette-store.ts", import.meta.url), "utf8"),
);
const middleware = (
  await import(
    moduleUrl(
      (await readFile(new URL("../server/middleware/palette.ts", import.meta.url), "utf8")).replace(
        /["']\.\.\/palette-store["']/,
        JSON.stringify(storage),
      ),
    )
  )
).default;
const rows = new Map();
const db = {
  prepare(sql) {
    assert.equal(sql.includes(";"), false);
    let values = [];
    return {
      bind(...v) {
        values = v;
        return this;
      },
      async first() {
        return rows.get(values[0]) ?? null;
      },
      async run() {
        rows.set(values[0], { saved: values[1], recent: values[2] });
      },
    };
  },
};
async function call(
  method = "GET",
  cookie = "",
  data,
  env = { DB: db },
  origin = "https://example.test",
) {
  const url = new URL("https://example.test/api/workspace-palette");
  const req = new Request(url, {
    method,
    headers: { cookie, origin, "content-type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  req.runtime = { cloudflare: { env } };
  return middleware({ url, req }, () => {
    throw new Error("unexpected fallthrough");
  });
}
test("saved colors persist on server and are isolated by secure owner cookie", async () => {
  const first = await call();
  assert.equal(first.status, 200);
  const header = first.headers.get("set-cookie");
  assert.match(header, /Secure; HttpOnly; SameSite=Strict/);
  const cookie = header.split(";")[0];
  assert.equal(
    (await call("PUT", cookie, { saved: ["#abcdef"], recent: ["#112233"] })).status,
    200,
  );
  assert.deepEqual(await (await call("GET", cookie)).json(), {
    saved: ["#abcdef"],
    recent: ["#112233"],
  });
  assert.deepEqual(await (await call()).json(), { saved: [], recent: [] });
  assert.equal(first.headers.get("cache-control"), "private, no-store");
});
test("palette rejects cross-origin writes, invalid payloads, and missing owner", async () => {
  const cookie = (await call()).headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await call("PUT", cookie, { saved: [], recent: [] }, undefined, "https://evil.test")).status,
    403,
  );
  assert.equal((await call("PUT", "", { saved: [], recent: [] })).status, 401);
  assert.equal((await call("PUT", cookie, { saved: ["red"], recent: [] })).status, 400);
  assert.equal((await call("DELETE")).status, 405);
});
test("missing database returns a recoverable unavailable state", async () => {
  const log = console.error;
  console.error = () => {};
  try {
    assert.equal((await call("GET", "", undefined, {})).status, 503);
  } finally {
    console.error = log;
  }
});
