import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { build } from "esbuild";
import ts from "typescript";

const { outputFiles } = await build({ entryPoints: ["src/lib/locale-config.ts"], bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent" });
const { LOCALES } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
const read = async id => JSON.parse(await readFile(`src/lib/locales/${id}.json`, "utf8"));
const source = await read("en"), keys = Object.keys(source).sort();
const parameters = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
assert.equal(new Set(LOCALES.map(locale => locale.id)).size, LOCALES.length, "Duplicate locale identifiers");
for (const { id, dir } of LOCALES) {
  assert.equal(dir, ["ar", "he"].includes(id) ? "rtl" : "ltr", `${id}: direction`);
  const messages = await read(id);
  assert.deepEqual(Object.keys(messages).sort(), keys, `${id}: missing or unknown messages`);
  for (const key of keys) {
    const value = messages[key];
    assert.ok(typeof value === "string" && (value.trim() || key === "hint_none"), `${id}.${key}: empty message`);
    assert.deepEqual(parameters(value), parameters(source[key]), `${id}.${key}: interpolation mismatch`);
  }
}
// A new literal translation call must also be declared in the complete dictionaries.
async function checkCalls(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) { await checkCalls(path); continue; }
    if (!/\.tsx?$/.test(entry.name)) continue;
    const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["t", "tr", "uiText", "text"].includes(node.expression.text)) {
        const key = node.arguments[node.expression.text === "tr" ? 1 : 0];
        if (key && ts.isStringLiteral(key)) assert.ok(keys.includes(key.text), `${path}: undeclared message ${key.text}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
await checkCalls("src");
console.log(`Validated ${keys.length} messages and their parameters in all ${LOCALES.length} languages.`);
