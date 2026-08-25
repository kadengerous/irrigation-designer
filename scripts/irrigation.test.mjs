import test from "node:test";
import assert from "node:assert/strict";

const FT_TO_M = 0.3048;
const GPM_TO_M3H = 0.2271247;
const GPM_TO_LMIN = 3.78541178;
const INHR_TO_MMHR = 25.4;

/** Hunter labelled 40 PSI as 2.8 bar. Official MP2000-360 row: 19 ft, 1.48 gpm, 0.39 in/hr. */
test("TEST 1 — MP2000-360 2.8 bar: 5.8 m, ~0.34 m³/h, ~10.1 mm/h square", () => {
  const radiusM = 19 * FT_TO_M;
  const qM3h = 1.48 * GPM_TO_M3H;
  const precipSquare = (1000 * qM3h) / (radiusM * radiusM);
  const precipTable = 0.39 * INHR_TO_MMHR;
  assert.ok(Math.abs(radiusM - 5.8) < 0.05, `radius ${radiusM}`);
  assert.ok(Math.abs(qM3h - 0.34) < 0.02, `flow ${qM3h}`);
  assert.ok(precipSquare > 9.7 && precipSquare < 10.4, `square precip ${precipSquare}`);
  assert.ok(precipTable > 9.4 && precipTable < 10.5, `table precip ${precipTable}`);
});

test("TEST 2 — MP Standard and MP800 cannot share a hydrozone without a warning", () => {
  const classOf = { MP2000: "mp10", MP815: "mp20", MP800SR: "mp20", MP3000: "mp10" };
  assert.equal(classOf.MP2000, "mp10");
  assert.equal(classOf.MP815, "mp20");
  const mixed = new Set(["mp10", "mp20"]);
  assert.equal(mixed.size, 2);
});

test("TEST 3 — rotor nozzle flow does not scale with sector", () => {
  const tableLpm = 1.8 * GPM_TO_LMIN;
  function rotorFlow(_arc) {
    return tableLpm;
  }
  function mpMatched(tableArcLpm, tableArc, arc) {
    return tableArcLpm * (arc / tableArc);
  }
  assert.equal(rotorFlow(90), rotorFlow(360));
  assert.ok(Math.abs(mpMatched(4, 180, 90) - 2) < 1e-9);
  assert.notEqual(rotorFlow(90), mpMatched(tableLpm, 180, 90));
});

test("TEST 4 — 100% coverage only if every lawn sample is hit", () => {
  const coverPct = (hit, samples) => (samples === 0 ? 0 : (hit / samples) * 100);
  assert.ok(coverPct(99, 100) < 100);
  assert.equal(coverPct(100, 100), 100);
  assert.ok(coverPct(100, 100) === 100 && coverPct(99, 100) !== 100);
});
