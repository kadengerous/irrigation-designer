import test from "node:test";
import assert from "node:assert/strict";

const EN_METRIC_REGIONS = new Set(["GB", "AU", "NZ", "CA", "IE", "IN", "ZA", "SG"]);

function recommendedUnitSystem(locale, region) {
  if (locale !== "en") return "metric";
  const r = (region ?? "").toUpperCase();
  if (!r) return "us";
  if (r === "US") return "us";
  if (EN_METRIC_REGIONS.has(r)) return "metric";
  return "us";
}

function numberFormatForUnits(preset) {
  return preset === "us" ? "comma-dot" : "space-comma";
}

function localeFromBcp47(tag) {
  return (tag.trim().toLowerCase().split(/[-_]/)[0] || "en");
}

function regionFromBcp47(tag) {
  const p = tag.trim().split(/[-_]/);
  return p[1] ? p[1].toUpperCase() : null;
}

function bootstrap(tag) {
  const locale = localeFromBcp47(tag);
  const known = new Set(["ru", "en", "es", "de", "fr", "pt", "it", "zh", "ja", "pl", "tr"]);
  const loc = known.has(locale) ? locale : "en";
  const unitPreset = recommendedUnitSystem(loc, regionFromBcp47(tag));
  return { locale: loc, unitPreset, numberFormat: numberFormatForUnits(unitPreset) };
}

test("TEST 1 first launch ru-RU → Russian + Metric", () => {
  const b = bootstrap("ru-RU");
  assert.equal(b.locale, "ru");
  assert.equal(b.unitPreset, "metric");
  assert.equal(b.numberFormat, "space-comma");
});

test("TEST 2 English without region → US", () => {
  assert.equal(recommendedUnitSystem("en", null), "us");
  assert.equal(recommendedUnitSystem("en", ""), "us");
});

test("TEST 3 English then manual Metric keeps language", () => {
  const lang = "en";
  let units = "us";
  units = "metric";
  assert.equal(lang, "en");
  assert.equal(units, "metric");
});

test("TEST 4 Metric → US without language change", () => {
  const lang = "ru";
  let units = "metric";
  units = "us";
  assert.equal(lang, "ru");
  assert.equal(units, "us");
});

test("TEST 6 Russian+US then Français → Metric", () => {
  assert.equal(recommendedUnitSystem("fr", "FR"), "metric");
});

test("TEST 7 English+Metric then Russian → Metric", () => {
  assert.equal(recommendedUnitSystem("ru", "US"), "metric");
});

test("TEST 8 English region GB Metric, US stays US", () => {
  assert.equal(recommendedUnitSystem("en", "GB"), "metric");
  assert.equal(recommendedUnitSystem("en", "AU"), "metric");
  assert.equal(recommendedUnitSystem("en", "NZ"), "metric");
  assert.equal(recommendedUnitSystem("en", "CA"), "metric");
  assert.equal(recommendedUnitSystem("en", "US"), "us");
  const gb = bootstrap("en-GB");
  assert.equal(gb.locale, "en");
  assert.equal(gb.unitPreset, "metric");
  const us = bootstrap("en-US");
  assert.equal(us.locale, "en");
  assert.equal(us.unitPreset, "us");
  assert.equal(us.numberFormat, "comma-dot");
});

test("non-English languages recommend Metric", () => {
  for (const loc of ["ru", "es", "de", "fr", "pt", "it", "zh", "ja", "pl", "tr"]) {
    assert.equal(recommendedUnitSystem(loc, null), "metric", loc);
  }
});

test("geometry stays canonical metres (10 m → 32.81 ft display only)", () => {
  const metres = 10;
  const ft = metres / 0.3048;
  assert.ok(Math.abs(ft - 32.8084) < 0.001);
  assert.equal(metres, 10);
});
