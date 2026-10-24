import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let server, catalog, flow, store, emptyProject, HeadCard, PressureSteps, precipitation, i18n, units, originalCatalog;
const oldStorage = globalThis.localStorage;
before(async () => {
  const memory = new Map();
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
  server = await createServer({ configFile: false, root: process.cwd(), resolve: { alias: { '@': resolve('src') } }, server: { middlewareMode: true, hmr: false }, logLevel: 'silent' });
  [catalog, flow, { useProject: store }, { emptyProject }, { HeadCard }, { PressureSteps }, precipitation, i18n, units] = await Promise.all([
    'lib/equipment-catalog.ts', 'lib/flow.ts', 'lib/project-store.ts', 'lib/project-types.ts', 'components/designer/designer-app.tsx',
    'components/designer/pressure-steps.tsx', 'lib/precipitation-display.ts', 'lib/i18n.ts', 'lib/units.ts',
  ].map(path => server.ssrLoadModule('/src/' + path)));
  originalCatalog = JSON.stringify(catalog.CATALOG);
  i18n.setActiveLocale('en'); units.setActiveUnits(units.METRIC_UNITS);
});
after(async () => {
  assert.equal(JSON.stringify(catalog.CATALOG), originalCatalog, 'inspector interactions do not change manufacturer tables');
  await server.close();
  if (oldStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = oldStorage;
});
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`);
const current = () => store.getState().project.heads[0];
const sqItems = () => catalog.CATALOG.filter(item => item.manufacturerId === 'rain-bird' && item.coverageKind === 'square');
const plain = text => text.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
function walk(node, result = []) {
  if (!node || typeof node !== 'object') return result;
  if (Array.isArray(node)) { node.forEach(child => walk(child, result)); return result; }
  result.push(node); walk(node.props?.children, result); return result;
}
function capture() {
  // SSR subscriptions read the initial snapshot. Synchronize it with the actual
  // store so the real hook-bearing component sees each committed interaction.
  Object.assign(store.getInitialState(), store.getState());
  let tree;
  function Capture() { tree = HeadCard({ head: current() }); return tree; }
  const html = renderToStaticMarkup(React.createElement(Capture));
  return { nodes: walk(tree), html };
}
function pickThrow(index) {
  const buttons = capture().nodes.filter(node => node.type === 'button' && node.props.className?.startsWith('sq-nozzle-option'));
  assert.equal(buttons.length, 2); buttons[index].props.onClick();
}
function pressureRadios() {
  const props = capture().nodes.find(node => node.type === PressureSteps).props;
  let tree;
  function CapturePressure() { tree = PressureSteps(props); return tree; }
  renderToStaticMarkup(React.createElement(CapturePressure));
  return walk(tree).filter(node => node.type === 'input' && node.props.type === 'radio');
}
function pickPressure(bar) {
  const radio = pressureRadios().find(node => Math.abs(node.props.value - bar) < 1e-8);
  assert.ok(radio, `pressure ${bar} is an actual selectable control`);
  radio.props.onChange();
}
function seed(item, nozzleIndex, pressure, bodyId = 'rain-bird:1804') {
  const nozzle = item.nozzles[nozzleIndex], row = referenceAt(nozzle, pressure);
  const unrelated = { ...flow.catalogHeadDefaults(catalog.itemById('MP1000-90')), catalogId: 'MP1000-90', id: 'unrelated', x: 8, y: 4, start: 0, zone: 1, locked: false };
  const head = { ...flow.catalogHeadDefaults(item), id: 'sq-interaction', catalogId: item.id, equipmentSnapshot: catalog.equipmentSnapshot(item),
    bodyId, nozzleId: nozzle.id, designPressure: pressure, r: row.radiusM, arc: item.arcMax, x: 2, y: 3, start: 37, zone: 1, locked: false };
  const project = emptyProject(); project.meta.targetMm = 10; project.heads = [head, unrelated];
  store.setState({ project, projects: [], past: [], future: [], pastOps: [], futureOps: [], locale: 'en', units: { ...units.METRIC_UNITS }, simulationActive: true });
  return { snapshot: JSON.stringify(head.equipmentSnapshot), unrelated: JSON.stringify(unrelated) };
}
function referenceAt(nozzle, pressure) {
  const rows = [...nozzle.performance].sort((a, b) => a.pressureBar - b.pressureBar);
  const exact = rows.find(row => Math.abs(row.pressureBar - pressure) < 1e-8); if (exact) return exact;
  const a = rows.filter(row => row.pressureBar < pressure).at(-1), b = rows.find(row => row.pressureBar > pressure);
  assert.ok(a && b, `${nozzle.id}: bounded test pressure`);
  const t = (pressure - a.pressureBar) / (b.pressureBar - a.pressureBar), lerp = key => a[key] == null || b[key] == null ? null : a[key] + (b[key] - a[key]) * t;
  return { pressureBar: pressure, radiusM: lerp('radiusM'), flowLMin: lerp('flowLMin'), precipNoOverlapMmH: lerp('precipNoOverlapMmH') };
}
function stateValues() {
  const head = current(), item = catalog.catalogForHead(head), hydraulic = flow.headFlow(head);
  const rain = precipitation.displayPrecipitation(item, { nozzleId: head.nozzleId, arc: head.arc, radius: head.r, pressureBar: head.designPressure }, hydraulic);
  return { pressure: head.designPressure, radius: head.r, lpm: hydraulic.lpm, rate: rain.rate, minutes: rain.rate == null ? null : flow.runTimeMin(10, rain.rate) };
}
function assertCurrentValues(item, expectedPressure) {
  const head = current(), nozzle = item.nozzles.find(n => n.id === head.nozzleId), row = referenceAt(nozzle, expectedPressure), values = stateValues();
  close(values.pressure, expectedPressure, `${item.id}: stored pressure`);
  close(values.radius, row.radiusM, `${item.id}: pressure-specific geometry`);
  const uncertain = nozzle.hydraulicVerificationStatus === 'Needs Review';
  if (uncertain) assert.equal(values.lpm, null, 'disputed discharge stays unknown'); else close(values.lpm, row.flowLMin, `${item.id}: table discharge`);
  const expectedRate = uncertain || item.id === 'rain-bird:SQ-HLF' ? null : row.precipNoOverlapMmH;
  if (expectedRate == null) { assert.equal(values.rate, null); assert.equal(values.minutes, null); }
  else { close(values.rate, expectedRate, `${item.id}: published precipitation`); close(values.minutes, 600 / expectedRate, `${item.id}: time for 10mm`); }
  const rendered = capture(), controls = pressureRadios(), exactControl = controls.find(node => Math.abs(node.props.value - expectedPressure) < 1e-8);
  if (exactControl) assert.equal(exactControl.props.checked, true, 'current pressure radio is selected');
  const stats = [...rendered.html.matchAll(/<dt\b[^>]*>(.*?)<\/dt>\s*<dd\b[^>]*>(.*?)<\/dd>/gs)].map(([, label, value]) => [plain(label), plain(value)]);
  const stat = label => stats.find(([key]) => key === label)?.[1];
  const fraction = item.squarePatternFraction, width = row.radiusM * (fraction === .25 ? 1 : 2), height = row.radiusM * (fraction === .25 || fraction === .5 ? 1 : 2);
  assert.equal(stat(i18n.tr('en', 'sqPatternSize')), `${units.formatLenU(width, 'm')} × ${units.formatLenU(height, 'm')}`);
  assert.equal(stat(i18n.tr('en', 'workingPressure')), units.formatPressureU(expectedPressure, 'bar'));
  assert.equal(stat(`${i18n.tr('en', 'flow')}, ${units.flowLabel('lpm')}`), uncertain ? i18n.tr('en', 'noData') : i18n.formatNumber(row.flowLMin, 2));
  assert.equal(stat(i18n.tr('en', 'precipSingle')), expectedRate == null ? i18n.tr('en', 'noData') : units.formatPrecipitation(expectedRate, units.METRIC_UNITS));
  const timeLabel = `${i18n.tr('en', 'runTimeDepth', { depth: units.formatDepth(10, units.METRIC_UNITS) })} · ${i18n.tr('en', 'precipSingle')}`;
  assert.equal(stat(timeLabel), expectedRate == null ? i18n.tr('en', 'noData') : `${i18n.formatNumber(600 / expectedRate, 1)} ${i18n.tr('en', 'min')}`);
  assert.equal(store.getState().simulationActive, true, 'inspector editing preserves simulation');
  return values;
}

test('actual SQ throw buttons preserve selected admissible pressure and update geometry, rate and time with undo/redo', () => {
  for (const item of sqItems()) for (let from = 0; from < 2; from++) {
    const pressure = 1.4, to = 1 - from, seeded = seed(item, from, pressure), before = JSON.stringify(current());
    const previous = assertCurrentValues(item, pressure);
    pickThrow(to);
    assert.equal(current().nozzleId, item.nozzles[to].id);
    const next = assertCurrentValues(item, pressure);
    assert.notEqual(next.radius, previous.radius, `${item.id}: throw changes coverage dimensions`);
    if (item.id !== 'rain-bird:SQ-HLF') { close(next.lpm, previous.lpm, 'SQ throw mechanism does not change flow at fixed pressure'); assert.notEqual(next.rate, previous.rate); assert.notEqual(next.minutes, previous.minutes); }
    assert.equal(JSON.stringify(current().equipmentSnapshot), seeded.snapshot);
    assert.equal(JSON.stringify(store.getState().project.heads[1]), seeded.unrelated);
    const after = JSON.stringify(current());
    store.getState().undo(); assert.equal(JSON.stringify(current()), before); assertCurrentValues(item, pressure);
    store.getState().redo(); assert.equal(JSON.stringify(current()), after); assertCurrentValues(item, pressure);
    const projectBefore = store.getState().project, undoCount = store.getState().past.length;
    pickThrow(to);
    assert.equal(store.getState().project, projectBefore, 'clicking the selected throw is a no-op');
    assert.equal(store.getState().past.length, undoCount, 'a repeated selection creates no empty undo step');
  }
});

test('actual SQ pressure radio callbacks update every published operating point and preserve uncertain data', () => {
  for (const item of sqItems()) for (let index = 0; index < 2; index++) {
    const nozzle = item.nozzles[index]; seed(item, index, nozzle.performance[0].pressureBar);
    let low, high;
    for (const row of nozzle.performance) {
      pickPressure(row.pressureBar); const values = assertCurrentValues(item, row.pressureBar);
      if (!low) low = values; high = values;
    }
    if (nozzle.hydraulicVerificationStatus === 'Needs Review') assert.equal(high.lpm, null);
    else assert.ok(high.lpm > low.lpm, `${item.id}: low-to-high table discharge changes`);
  }
});

test('SQ pressure plateaus stay equal while changed footprints and precipitation remain synchronized', () => {
  for (const [id, expectedFlow, lowFlow] of [['rain-bird:SQ-QTR', .45, .38], ['rain-bird:SQ-FUL', 1.74, 1.25]]) {
    const item = catalog.itemById(id); seed(item, 0, 1.4); close(assertCurrentValues(item, 1.4).lpm, lowFlow, 'verified low pressure');
    const plateau = id.endsWith('QTR') ? [2.1, 2.8, 3.4] : [2.8, 3.4];
    for (const pressure of plateau) { pickPressure(pressure); close(assertCurrentValues(item, pressure).lpm, expectedFlow, 'manufacturer pressure-compensation plateau'); }
    const before = stateValues(); pickThrow(1); const after = assertCurrentValues(item, 3.4);
    close(before.lpm, after.lpm, 'switching throw does not invent new flow'); assert.notEqual(before.rate, after.rate); assert.notEqual(before.minutes, after.minutes);
  }
});

test('SQ throw selection respects PRS body limits and only clamps pressure when the new table requires it', () => {
  const item = catalog.itemById('rain-bird:SQ-QTR');
  for (const regulated of [2.1, 3.1]) {
    const body = catalog.bodiesFor(item).find(body => body.regulatedPressureBar === regulated); assert.ok(body);
    seed(item, 0, regulated, body.id);
    assert.ok(pressureRadios().every(node => node.props.value <= regulated));
    pickThrow(1); assertCurrentValues(item, regulated);
    assert.equal(current().bodyId, body.id);
  }
  // The retained HLF tables use different metric labels at their lower bound.
  // Moving to short throw may clamp 20psi (1.37895bar) to its actual 1.4bar minimum.
  const half = catalog.itemById('rain-bird:SQ-HLF'), low = half.nozzles[1].performance[0].pressureBar;
  seed(half, 1, low); pickThrow(0); assertCurrentValues(half, 1.4);
});
