import assert from 'node:assert/strict';
import test, {before, after} from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const root = process.env.IRRI_ROOT ?? process.cwd();
const require = createRequire(resolve(root, 'package.json'));
const {createElement} = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const {createServer} = await import(pathToFileURL(resolve(root, 'node_modules/vite/dist/node/index.js')));
let server, catalog, flow, automatic, library, hydro, store, i18n, units, emptyProject, locales;
let HeadCard, HeadPlacementSettings, AutomaticHeadPanel;
const previousStorage = globalThis.localStorage;

before(async () => {
  const memory = new Map();
  globalThis.localStorage = {getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key)};
  // No listening HTTP server or HMR websocket: only Vite's SSR module loader.
  server = await createServer({configFile: false, root, resolve: {alias: {'@': resolve(root, 'src')}}, server: {middlewareMode: true, hmr: false}, logLevel: 'silent'});
  const load = path => server.ssrLoadModule('/src/' + path);
  [catalog, flow, automatic, library, hydro, {useProject: store}, i18n, units, {emptyProject}, {LOCALES: locales}, {HeadCard}, {HeadPlacementSettings}, {AutomaticHeadPanel}] = await Promise.all([
    'lib/equipment-catalog.ts', 'lib/flow.ts', 'lib/automatic-head.ts', 'lib/equipment-library.ts', 'lib/hydro.ts',
    'lib/project-store.ts', 'lib/i18n.ts', 'lib/units.ts', 'lib/project-types.ts', 'lib/locale-config.ts',
    'components/designer/designer-app.tsx', 'components/designer/head-placement-settings.tsx',
    'components/designer/automatic-head-tool.tsx',
  ].map(load));
});

after(async () => {
  await server?.close();
  if (previousStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousStorage;
});

const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));
const escaped = text => render('span', {children: text}).slice(6, -7);
function item(id) {
  const model = catalog.itemById('toro:' + id);
  assert.ok(model, id);
  return model;
}
function localeState(locale, pressure, heads = []) {
  const prefs = {...units.METRIC_UNITS, pressure};
  i18n.setActiveLocale(locale);
  i18n.setNumberPrefs('auto', 2);
  units.setActiveUnits(prefs);
  const project = emptyProject();
  project.heads = heads;
  store.setState({locale, units: prefs, project});
  // Zustand's SSR hooks read the initial snapshot rather than getState().
  Object.assign(store.getInitialState(), store.getState());
  return prefs;
}
function legacyPrsHead() {
  const model = item('PSN5-Q');
  const body = catalog.bodiesFor(model).find(body => body.bodyFamilyId === 'PRS30' && body.popUpMm === 100)
    ?? catalog.bodiesFor(model).find(body => body.bodyFamilyId === 'PRS30');
  assert.ok(body, 'compatible nominal 30 psi Hunter body');
  return {model, body, head: {
    ...flow.catalogHeadDefaults(model), id: 'saved-toro-2.1', catalogId: model.id,
    bodyId: body.id, popUpMm: body.popUpMm, designPressure: 2.1, r: 1.70688,
    equipmentSnapshot: catalog.equipmentSnapshot(model), bodySnapshot: catalog.equipmentSnapshot(body),
    x: 0, y: 0, start: 0, arc: 90, zone: 1, locked: false, needsReview: false,
  }};
}

test('actual HeadCard normalizes saved Toro 2.1 bar to the selected 30 psi checkpoint in every locale', () => {
  const {model, head} = legacyPrsHead();
  const before = JSON.stringify(head);
  assert.equal(hydro.headWorkingBar(head), 2.068427);
  assert.equal(flow.headFlow(head).kind, 'table');
  assert.equal(flow.headFlow(head).lpm, model.nozzles[0].performance[1].flowLMin);
  for (const {id: locale} of locales) for (const pressureUnit of ['bar', 'psi']) {
    localeState(locale, pressureUnit, [head]);
    const html = render(HeadCard, {head});
    const canonical = escaped(units.formatPressureU(2.068427, pressureUnit));
    const raw = escaped(units.formatPressureU(2.1, pressureUnit));
    assert.notEqual(canonical, raw, `${locale}/${pressureUnit}: fixture distinguishes source pressure from nominal body label`);
    assert.ok(html.includes(canonical), `${locale}/${pressureUnit}: card shows canonical working pressure`);
    assert.ok(!html.includes(raw), `${locale}/${pressureUnit}: no contradictory nominal-pressure stat or body hint`);
    const checked = [...html.matchAll(/<input\b[^>]*type="radio"[^>]*checked=""[^>]*>/g)].map(match => match[0]);
    assert.equal(checked.length, 1, `${locale}/${pressureUnit}: one working-pressure radio is selected`);
    assert.match(checked[0], /value="2\.068427"/, 'the selected radio corresponds to the actual hydraulic table row');
    const flowStat = `${escaped(i18n.text('flow') + ', ' + units.flowLabel('lpm'))}</dt>`;
    const flowIndex = html.indexOf(flowStat);
    assert.ok(flowIndex >= 0, `${locale}: localized flow stat exists`);
    const value = html.slice(flowIndex + flowStat.length).match(/^<dd\b[^>]*>(.*?)<\/dd>/)?.[1];
    assert.equal(value, escaped(i18n.formatNumber(flow.headFlow(head).lpm, 2)), 'the rendered flow agrees with the selected source row');
  }
  assert.equal(JSON.stringify(head), before, 'presentation normalization does not mutate saved head or snapshots');
});

test('actual body hint and working-pressure recommendation use the same Toro table pressure', () => {
  const {model, body, head} = legacyPrsHead();
  assert.equal(body.regulatedPressureBar, 2.1, 'physical body retains its manufacturer nominal label');
  assert.equal(catalog.workingPressureBar(model, body.id), 2.068427);
  for (const {id: locale} of locales) for (const pressureUnit of ['bar', 'psi']) {
    localeState(locale, pressureUnit, [head]);
    const html = render(HeadPlacementSettings, {head, item: model});
    assert.ok(html.includes(escaped(units.formatPressureU(2.068427, pressureUnit))), `${locale}/${pressureUnit}`);
    assert.ok(!html.includes(escaped(units.formatPressureU(2.1, pressureUnit))), 'body hint does not contradict nozzle hydraulics');
  }
});

test('Toro automatic panel shows canonical working pressure and an unknown-flow note for a valid reduced PSN radius', () => {
  const model = item('PSN5-Q');
  const fit = automatic.selectAutomaticHead(1.3, 90, 2.1, [model]);
  assert.ok(fit);
  assert.equal(fit.designPressure, 2.068427);
  assert.equal(fit.needsReview, true);
  assert.equal(flow.headFlow({...fit, id: 'reduced-psn', x: 0, y: 0, zone: 1, locked: false}).lpm, null);
  for (const {id: locale} of locales) for (const pressureUnit of ['bar', 'psi']) {
    const prefs = localeState(locale, pressureUnit);
    const html = render(AutomaticHeadPanel, {
      groupLabel: 'Precision Spray / PSN+', center: {x: 0, y: 0},
      sector: {center: {x: 0, y: 0}, radius: fit.r, arc: fit.arc, start: 0},
      radius: fit.r, fit, pressure: 2.1, failed: false, units: prefs,
      cancel() {}, finish() {}, restart() {}, setPressure() {}, editSector() {},
    });
    assert.ok(html.includes(`<div>${escaped(i18n.text('workingPressure'))}: <bdi>${escaped(units.formatPressureU(fit.designPressure, pressureUnit))}</bdi></div>`), `${locale}/${pressureUnit}: actual result pressure`);
    assert.ok(html.includes(`<p role="note">${escaped(i18n.text('autoHead.flowUnknown'))}</p>`), 'geometry match does not imply verified reduced-radius discharge');
    assert.match(html, /data-match="true"/);
    assert.doesNotMatch(html, /data-auto-head-regulated/, 'equivalent 2.1 bar / 30 psi labels alone do not imply physical pressure reduction');
  }
});

test('library filtering retains pressure-supported PSN5-Q at 1.30 m below its native catalog minimum', () => {
  const model = item('PSN5-Q');
  const range = flow.radiusRange(model, model.nozzles[0].id, 2.1, 90);
  assert.equal(range.min, 1.28016);
  assert.ok(1.3 < model.rMin, 'regression requires a radius below the coarse nominal filter');
  const options = {manufacturerId: 'toro', radius: 1.3, arc: 90, pressure: 2.1};
  assert.deepEqual(library.filterEquipment([model], options).map(item => item.id), [model.id]);
  assert.deepEqual(library.filterEquipment([model], {...options, radius: range.min - .001}), []);
  assert.deepEqual(library.filterEquipment([model], {...options, arc: 60}), [], 'a fixed quarter-circle nozzle never accepts a different sector');
});

test('library and automatic selection retain T5 low-angle 5.715 m reduction without inventing flow', () => {
  const model = item('T5P-RS-LN');
  const nozzle = model.nozzles.find(nozzle => nozzle.id === '1.0LA');
  assert.ok(nozzle);
  const row = nozzle.performance[0], radius = 5.715;
  assert.equal(row.radiusM, 7.62);
  assert.ok(Math.abs(flow.radiusRange(model, nozzle.id, row.pressureBar, 180).min - radius) < 1e-9);
  assert.ok(radius < model.rMin);
  assert.deepEqual(library.filterEquipment([model], {manufacturerId: 'toro', radius, arc: 180, pressure: row.pressureBar}).map(item => item.id), [model.id]);
  const fit = automatic.selectAutomaticHead(radius, 180, row.pressureBar, [model]);
  assert.ok(fit);
  assert.equal(fit.nozzleId, nozzle.id);
  assert.equal(fit.needsReview, true);
  assert.equal(flow.computeFlow(model, {nozzleId: nozzle.id, pressureBar: row.pressureBar, arc: 180, radius}).lpm, null);
});
