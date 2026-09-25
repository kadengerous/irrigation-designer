import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const directory = resolve("node_modules/.cache/locale-units-tests");
await mkdir(directory, { recursive: true });
const bundle = resolve(directory, `${process.pid}.mjs`);
await build({ stdin: { contents: `export * from './src/lib/units'; export {setActiveLocale,setNumberPrefs} from './src/lib/i18n';`, resolveDir: process.cwd() }, outfile: bundle, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent" });
const units = await import(pathToFileURL(bundle).href);
await rm(bundle);

test("first-launch regional defaults use production settings without tying number formats to units", () => {
  for (const [tag, locale, preset] of [["ru-RU","ru","metric"],["en-US","en","us"],["en-GB","en","metric"],["en-AU","en","metric"],["ja-JP","ja","metric"],["zh-CN","zh-CN","metric"],["es-ES","es","metric"],["de-DE","de","metric"],["fr-FR","fr","metric"],["pt-BR","pt-BR","metric"],["it-IT","it","metric"],["pl-PL","pl","metric"],["tr-TR","tr","metric"],["ar-SA","ar","metric"],["nl-NL","nl","metric"],["cs-CZ","cs","metric"],["el-GR","el","metric"],["hu-HU","hu","metric"],["ro-RO","ro","metric"],["sk-SK","sk","metric"],["he-IL","he","metric"],["uk-UA","uk","metric"],["pt","pt-BR","metric"],["zh","zh-CN","metric"],["iw-IL","he","metric"]]) {
    const actual = units.bootstrapLocaleAndUnits(tag);
    assert.equal(actual.locale, locale);
    assert.equal(actual.unitPreset, preset);
    assert.equal(actual.numberFormat, "auto");
    assert.deepEqual(actual.units, preset === "us" ? units.US_UNITS : units.METRIC_UNITS);
  }
});
test("engineering display converts canonical quantities with the selected language's number format", () => {
  units.setNumberPrefs("auto", 2);
  units.setActiveLocale("ru");
  assert.equal(units.formatLenU(3.048, "ft"), "10,00 фут");
  units.setActiveLocale("en");
  assert.equal(units.formatLenU(3.048, "ft"), "10.00 ft");
  assert.equal(units.formatLenU(3.048, "m"), "3.05 m");
  for (const unit of units.LENGTH_OPTS) assert.ok(Math.abs(units.toMetersLen(units.fromMeters(12.5, unit), unit) - 12.5) < 1e-9);
  for (const unit of units.AREA_OPTS) assert.ok(Math.abs(units.toM2(units.fromM2(350, unit), unit) - 350) < 1e-9);
});
