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
let server, load, catalog, flow, displayPrecipitation, store, i18n, units, emptyProject;
let PressureSteps, HeadPlacementSettings, PrecipitationStats, CatalogInfo, rainBird, originalCatalog;
const previousStorage = globalThis.localStorage;

before(async () => {
  const memory = new Map();
  globalThis.localStorage = {getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k)};
  server = await createServer({configFile: false, root, resolve: {alias: {'@': resolve(root, 'src')}}, server: {middlewareMode: true, hmr: false}, logLevel: 'silent'});
  load = p => server.ssrLoadModule('/src/' + p);
  [catalog, flow, {displayPrecipitation}, {useProject: store}, i18n, units, {emptyProject}] = await Promise.all([
    'lib/equipment-catalog.ts', 'lib/flow.ts', 'lib/precipitation-display.ts', 'lib/project-store.ts',
    'lib/i18n.ts', 'lib/units.ts', 'lib/project-types.ts',
  ].map(load));
  [{PressureSteps}, {HeadPlacementSettings}, {PrecipitationStats}, {CatalogInfo}] = await Promise.all([
    'components/designer/pressure-steps.tsx', 'components/designer/head-placement-settings.tsx',
    'components/designer/precipitation-stats.tsx', 'components/designer/designer-app.tsx',
  ].map(load));
  rainBird = catalog.CATALOG.filter(item => item.manufacturerId === 'rain-bird' && item.type !== 'body');
  originalCatalog = JSON.stringify(rainBird);
});

after(async () => {
  await server?.close();
  if (previousStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousStorage;
});

const item = model => {
  const value = catalog.itemById('rain-bird:' + model);
  assert.ok(value, model);
  return value;
};
const point = (nozzle, row, patch = {}) => ({nozzleId: nozzle.id, pressureBar: row.pressureBar, arc: row.arcDeg, radius: row.radiusM, ...patch});
const near = (actual, expected, message) => {
  assert.equal(typeof actual, 'number', message);
  assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`);
};
const head = model => ({...flow.catalogHeadDefaults(model), id: 'precip-test', catalogId: model.id, x: 0, y: 0, start: 0, zone: 1, locked: false});
function localeState(locale = 'en', prefs = units.METRIC_UNITS) {
  i18n.setActiveLocale(locale);
  units.setActiveUnits(prefs);
  store.setState({locale, units: {...prefs}, project: emptyProject()});
  // Zustand's SSR hook reads its initial snapshot, not getState().
  Object.assign(store.getInitialState(), store.getState());
}
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));
const plain = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

test('all 18 R-VAN strip rates retain their published row-overlap basis', () => {
  // Rain Bird D42102 07/24: one straight row, 50% overlap; not square/triangle spacing.
  const pressures = [2.1, 2.4, 2.8, 3.1, 3.4, 3.8], rates = [16, 14, 15, 16, 16, 14];
  let checked = 0;
  for (const id of ['R-VAN-LCS', 'R-VAN-RCS', 'R-VAN-SST']) {
    const model = item(id), nozzle = model.nozzles[0];
    assert.equal(nozzle.performance.length, 6);
    for (const [index, pressureBar] of pressures.entries()) {
      const row = nozzle.performance.find(r => r.pressureBar === pressureBar);
      assert.ok(row, `${id}/${pressureBar}`);
      const hydraulic = flow.computeFlow(model, point(nozzle, row));
      assert.equal(hydraulic.precipMmHr, null, 'zone square precipitation stays inapplicable');
      assert.equal(hydraulic.precipTriangleMmHr, null);
      assert.deepEqual(displayPrecipitation(model, point(nozzle, row), hydraulic), {
        basis: 'strip', rate: rates[index], triangle: null, calculated: false, interpolated: false, noteKey: 'precipStripOverlap',
      });
      near(flow.runTimeMin(10, rates[index]), 600 / rates[index], id);
      checked++;
    }
  }
  assert.equal(checked, 18);
});

test('all 24 verified SQ rates expose the official no-overlap values without circular metrics', () => {
  // D42033 10/21 p2. 3QTR retains its already-audited US grid and exact SI conversion.
  const published = {
    'SQ-QTR': [[41.66, 48.26, 33.53, 33.53], [16.26, 18.8, 14.99, 14.99]],
    'SQ-FUL': [[32.51, 39.37, 30.99, 30.99], [12.7, 15.49, 13.72, 13.72]],
    'SQ-3QTR': [[1.37, 1.54, 1.25, 1.25].map(x => x * 25.4), [.53, .60, .55, .55].map(x => x * 25.4)],
  };
  let checked = 0;
  for (const [id, settings] of Object.entries(published)) {
    const model = item(id);
    for (const [setting, throwM] of [.8, 1.2].entries()) {
      const nozzle = model.nozzles.find(n => n.id.endsWith(`throw-${throwM}`));
      assert.ok(nozzle); assert.equal(nozzle.performance.length, 4);
      for (const [index, row] of nozzle.performance.entries()) {
        const before = JSON.stringify(row), hydraulic = flow.computeFlow(model, point(nozzle, row));
        const result = displayPrecipitation(model, point(nozzle, row), hydraulic);
        assert.equal(result.basis, 'single'); assert.equal(result.calculated, false);
        assert.equal(result.noteKey, 'precipNoOverlap'); assert.equal(result.triangle, null);
        near(result.rate, settings[setting][index], `${id}/${throwM}/${row.pressureBar}`);
        assert.equal(hydraulic.precipMmHr, null); assert.equal(hydraulic.precipTriangleMmHr, null);
        near(flow.runTimeMin(10, result.rate), 600 / settings[setting][index], 'runtime uses published application rate');
        assert.equal(JSON.stringify(row), before);
        checked++;
      }
    }
  }
  assert.equal(checked, 24);
});

test('pressure interpolation preserves SQ no-overlap rates within each selected throw', () => {
  let checked = 0;
  for (const id of ['SQ-QTR', 'SQ-FUL', 'SQ-3QTR']) {
    const model = item(id);
    for (const nozzle of model.nozzles) for (let i = 1; i < nozzle.performance.length; i++) {
      const lo = nozzle.performance[i - 1], hi = nozzle.performance[i], pressureBar = (lo.pressureBar + hi.pressureBar) / 2;
      const expected = (lo.precipNoOverlapMmH + hi.precipNoOverlapMmH) / 2;
      const found = flow.performanceAt(model, nozzle.id, pressureBar, lo.arcDeg);
      assert.equal(found.kind, 'interpolated');
      near(found.row.precipNoOverlapMmH, expected, `${id}/${nozzle.id} interpolated source field`);
      const result = displayPrecipitation(model, point(nozzle, found.row));
      near(result.rate, expected, 'display does not revert to the other throw setting');
      assert.equal(result.triangle, null); assert.equal(result.calculated, false);
      assert.equal(result.interpolated, true);
      checked++;
    }
  }
  assert.equal(checked, 18);
  const original = item('SQ-QTR'), modified = structuredClone(original), nozzle = modified.nozzles[0];
  nozzle.performance[1].precipNoOverlapMmH = null;
  const low = nozzle.performance[0], high = nozzle.performance[1];
  const found = flow.performanceAt(modified, nozzle.id, (low.pressureBar + high.pressureBar) / 2, low.arcDeg);
  assert.equal(found.row.precipNoOverlapMmH, null, 'a missing interpolation endpoint must not become zero');
  assert.equal(displayPrecipitation(modified, point(nozzle, found.row)).rate, null);
});

test('published circular rates pass through unchanged instead of being replaced by estimates', () => {
  let checked = 0;
  for (const model of rainBird.filter(m => !m.strip && m.coverageKind === 'sector' && m.precipBasis === 'square')) {
    for (const nozzle of model.nozzles) for (const row of nozzle.performance) {
      if (row.precipSquareMmH == null || row.precipTriangleMmH == null || !catalog.supportsArc(model, row.arcDeg)) continue;
      if (row.pressureBar < model.recommendedPressureMin || row.pressureBar > model.recommendedPressureMax) continue;
      const result = displayPrecipitation(model, point(nozzle, row));
      assert.equal(result.rate, row.precipSquareMmH, `${model.id}/${nozzle.id}/${row.pressureBar}`);
      assert.equal(result.triangle, row.precipTriangleMmH);
      assert.equal(result.calculated, false);
      checked++;
    }
  }
  assert.ok(checked > 900, `full published Rain Bird circular grids checked: ${checked}`);
});

test('all 18 partially missing rotor rows use selected flow, radius and sweep without modifying raw data', () => {
  // Independently tabulated head-to-head application rates at a half-circle sweep.
  const standard = [[2, 11.8, 24, 20.683711577133007], [2.5, 13.3, 27, 18.31646786138278],
    [3, 13.4, 30, 20.049008687903765], [3.5, 14.9, 32.4, 17.5127246520427], [4, 15.2, 34.2, 17.763157894736842]];
  const regulated = [standard[0], standard[1], [3, 14.1, 30, 18.107741059302853]];
  let checked = 0;
  for (const [id, nozzleId, rows] of [
    ['5004-PC', 'rain-bird:5000:8', standard], ['5004+PC', 'rain-bird:5000:8', standard],
    ['5004+PCR', 'rain-bird:5000-PRS:8', regulated],
    ['5004-PC', 'rain-bird:5000:6', [[2,12.4,17.4,13.579604578563995],[3,13.4,22.2,14.836266429048786]]],
    ['5004+PC', 'rain-bird:5000:6', [[2,12.4,17.4,13.579604578563995],[3,13.4,22.2,14.836266429048786]]],
    ['5004+PCR', 'rain-bird:5000-PRS:6', [[2,12.4,17.4,13.579604578563995]]],
  ]) {
    const model = item(id), nozzle = model.nozzles.find(n => n.id === nozzleId);
    for (const [pressureBar, radius, lpm, halfRate] of rows) {
      const raw = nozzle.performance.find(r => r.pressureBar === pressureBar);
      assert.ok(raw); assert.equal(raw.radiusM, radius); assert.equal(raw.flowLMin, lpm);
      assert.equal(raw.precipSquareMmH, null); const publishedTriangle=raw.precipTriangleMmH;
      for (const [arc, multiplier] of [[90, 2], [180, 1], [360, .5]]) {
        const operating = point(nozzle, raw, {arc}), hydraulic = flow.computeFlow(model, operating);
        assert.equal(hydraulic.lpm, lpm, 'nozzle discharge is independent of the rotor sweep');
        const result = displayPrecipitation(model, operating, hydraulic);
        assert.equal(result.basis, 'square'); assert.equal(result.calculated, true);
        assert.equal(result.noteKey, 'precipCalculated');
        near(result.rate, halfRate * multiplier, `${id}/${pressureBar}/${arc}`);
        near(result.triangle, (publishedTriangle??halfRate / Math.sin(Math.PI / 3))*multiplier, 'preserve known triangular rate; calculate only missing cells');
        near(flow.runTimeMin(10, result.rate), 600 / (halfRate * multiplier), 'calculated runtime');
      }
      assert.equal(raw.precipSquareMmH, null); assert.equal(raw.precipTriangleMmH, publishedTriangle);
      checked++;
    }
  }
  assert.equal(checked, 18);
  const missing = rainBird.filter(m => m.type === 'rotor').flatMap(m => m.nozzles.flatMap(n => n.performance.filter(r => r.precipSquareMmH == null || r.precipTriangleMmH == null)));
  assert.equal(missing.length, checked, 'every missing rotor row is covered by an explicit fixture');
});

test('invalid pressure, unsupported arc and unverified radius changes never acquire a display rate', () => {
  for (const id of ['HE-VAN-8', 'R-VAN14', 'R-VAN-LCS', 'SQ-QTR', '5004-PC']) {
    const model = item(id), nozzle = id === '5004-PC' ? model.nozzles.find(n => n.id === 'rain-bird:5000:8') : catalog.defaultNozzle(model);
    const row = nozzle.performance.find(r => catalog.supportsArc(model, r.arcDeg));
    for (const pressureBar of [NaN, Infinity, -1, model.recommendedPressureMin - .1, model.recommendedPressureMax + .1]) {
      const result = displayPrecipitation(model, point(nozzle, row, {pressureBar}));
      assert.equal(result.rate, null, `${id}/${pressureBar}`); assert.equal(result.triangle, null);
      assert.equal(result.calculated, false);
    }
    if (!model.strip) for (const radius of [NaN, -1, 0, row.radiusM * .9, row.radiusM + 1]) {
      const result = displayPrecipitation(model, point(nozzle, row, {radius}));
      assert.equal(result.rate, null, `${id}/radius=${radius}`); assert.equal(result.triangle, null);
      assert.equal(result.calculated, false);
    }
  }
  const rotor = item('8005'), nozzle = catalog.defaultNozzle(rotor), row = nozzle.performance[0];
  assert.equal(displayPrecipitation(rotor, point(nozzle, row, {arc: 350})).rate, null);
  const model = item('5004-PC'), n = model.nozzles.find(x => x.id === 'rain-bird:5000:8'), r = n.performance[0];
  assert.equal(displayPrecipitation({...model, manufacturerId: 'krain'}, point(n, r)).rate, null, 'Rain Bird estimate must not silently become a cross-brand policy');
});

test('SQ-HLF stays withheld for both settings even when large-setting flow is verified', () => {
  const model = item('SQ-HLF'); let checked = 0;
  for (const nozzle of model.nozzles) for (const row of nozzle.performance) {
    const operating = point(nozzle, row), hydraulic = flow.computeFlow(model, operating);
    if (nozzle.hydraulicVerificationStatus === 'Needs Review') assert.equal(hydraulic.lpm, null);
    else assert.ok(hydraulic.lpm > 0, 'large setting retains usable flow');
    const result = displayPrecipitation(model, operating, hydraulic);
    assert.equal(result.basis, 'single'); assert.equal(result.rate, null); assert.equal(result.triangle, null);
    assert.equal(result.calculated, false); checked++;
  }
  assert.equal(checked, 8);
});

test('MPR strips and localized or discrete-stream bubblers do not invent area precipitation', () => {
  let stripRows = 0, bubblerModels = 0;
  for (const model of rainBird) {
    if (model.strip && !model.modelId.startsWith('R-VAN')) {
      for (const nozzle of model.nozzles) for (const row of nozzle.performance) {
        assert.deepEqual(displayPrecipitation(model, point(nozzle, row)), {
          basis: 'strip', rate: null, triangle: null, calculated: false, interpolated: false, noteKey: 'precipLayoutRequired',
        }); stripRows++;
      }
    }
    if (model.type === 'bubbler') {
      const defaults = flow.catalogHeadDefaults(model);
      const result = displayPrecipitation(model, {nozzleId: defaults.nozzleId, pressureBar: defaults.designPressure, radius: defaults.r, arc: defaults.arc});
      assert.deepEqual(result, {basis: 'flow-only', rate: null, triangle: null, calculated: false, noteKey: 'precipFlowOnly'});
      bubblerModels++;
    }
  }
  assert.equal(stripRows, 24); assert.equal(bubblerModels, 9);
});

test('PressureSteps renders manufacturer checkpoint radios without editable text or number pressure inputs', () => {
  for (const [locale, prefs] of [['en', units.METRIC_UNITS], ['ru', units.US_UNITS]]) {
    localeState(locale, prefs);
    const html = render(PressureSteps, {values: [2.1, 2.8, 3.1], value: 2.8, recommended: 3.1, onChange() {}});
    const inputs = html.match(/<input\b[^>]*>/g) ?? [];
    assert.equal(inputs.length, 3); assert.ok(inputs.every(input => /type="radio"/.test(input)));
    assert.equal(inputs.filter(input => /checked/.test(input)).length, 1);
    assert.match(inputs.find(input => /checked/.test(input)), /value="2.8"/);
    assert.doesNotMatch(html, /type="(?:text|number|range)"|<textarea/);
    assert.ok(html.includes(i18n.tr(locale, 'workingPressure')));
    assert.ok(html.includes(units.pressureLabel(prefs.pressure)));
  }
  assert.doesNotMatch(render(PressureSteps, {values: [], value: 2.8, recommended: 2.8, onChange() {}}), /<input/);
});

test('Rain Bird rotor mounting and source links never recommend a spray body or claim Hunter provenance', () => {
  localeState();
  for (const model of rainBird.filter(m => m.type === 'rotor')) {
    const html = render(HeadPlacementSettings, {head: head(model), item: model});
    assert.doesNotMatch(html, /Hunter|hunterirrigation|hunterindustries/i, model.id);
    assert.ok(!html.includes(i18n.tr('en', 'recommendedBody')), model.id);
    assert.ok(html.includes('Rain Bird')); assert.ok(html.includes(model.modelId.replaceAll('&', '&amp;')));
    assert.match(html, /href="https:\/\/[^\"]*rainbird\.com\//);
  }
  for (const id of ['HE-VAN-10', 'R-VAN14']) {
    const model = item(id), html = render(HeadPlacementSettings, {head: head(model), item: model});
    assert.ok(html.includes(i18n.tr('en', 'recommendedBody')), 'spray-mounted nozzles keep the useful body recommendation');
    assert.doesNotMatch(html, /Hunter|hunterirrigation|hunterindustries/i);
    assert.match(html, /<select/);
  }
  const info = render(CatalogInfo, {catalogId: 'rain-bird:5004-PC'});
  assert.match(info, /rainbird\.com/); assert.doesNotMatch(info, /Hunter|hunterirrigation|hunterindustries/i);
});

test('shared precipitation statistics label the actual basis, runtime, units and calculated values', () => {
  const fixtures = [
    {basis: 'single', rate: 13.72, triangle: null, calculated: false, noteKey: 'precipNoOverlap'},
    {basis: 'strip', rate: 16, triangle: null, calculated: false, noteKey: 'precipStripOverlap'},
    {basis: 'square', rate: 20, triangle: 23.094010767585033, calculated: true, noteKey: 'precipCalculated'},
  ];
  for (const [locale, prefs] of [['en', units.METRIC_UNITS], ['ru', units.US_UNITS]]) {
    localeState(locale, prefs);
    for (const value of fixtures) {
      const html = render(PrecipitationStats, {value, targetMm: 10});
      const label = i18n.tr(locale, value.basis === 'single' ? 'precipSingle' : value.basis === 'strip' ? 'precipStrip' : 'precipSquare');
      assert.ok(plain(html).includes(label));
      assert.ok(html.includes(units.formatPrecipitation(value.rate, prefs)));
      assert.ok(html.includes(i18n.formatNumber(600 / value.rate, 1)), 'runtime uses canonical millimeters regardless of display units');
      assert.equal(html.includes(i18n.tr(locale, 'precipTriangle')), value.basis === 'square');
      assert.equal(html.includes('≈'), value.calculated);
      assert.match(html, new RegExp(`data-precipitation-note="${value.noteKey}"`));
      assert.notEqual(i18n.tr(locale, value.noteKey), value.noteKey, 'note must be localized');
    }
    const localized = render(PrecipitationStats, {value: {basis: 'flow-only', rate: null, triangle: null, calculated: false, noteKey: 'precipFlowOnly'}, targetMm: 10});
    assert.doesNotMatch(localized, /class="info-stat/); assert.ok(localized.includes(i18n.tr(locale, 'precipFlowOnly')));
    const strip = render(PrecipitationStats, {value: {basis: 'strip', rate: null, triangle: null, calculated: false, noteKey: 'precipLayoutRequired'}, targetMm: 10});
    assert.ok(strip.includes(i18n.tr(locale, 'noData'))); assert.doesNotMatch(strip, /NaN|Infinity/);
    const betweenRows = render(PrecipitationStats, {value: {...fixtures[0], interpolated: true}, targetMm: 10});
    assert.ok(betweenRows.includes(i18n.tr(locale, 'flowInterpolated')), 'interpolation remains visible alongside the no-overlap basis');
  }
});

test('presentation calculations never write derived precipitation into source catalog data', () => {
  assert.equal(JSON.stringify(rainBird), originalCatalog);
});

test('reference tables retain other manufacturers published strip rates without a Rain Bird spacing claim', async () => {
  localeState();
  const {CatalogReference}=await load('components/designer/catalog-details.tsx');
  let checked=0;
  for(const model of catalog.CATALOG.filter(m=>m.manufacturerId!=='rain-bird'&&m.strip)){
    for(const nozzle of model.nozzles){
      const row=nozzle.performance.find(r=>r.precipSquareMmH!=null);
      if(!row)continue;
      const html=render(CatalogReference,{item:model,nozzle});
      assert.ok(html.includes(i18n.tr('en',model.manufacturerId==='toro'?'precipStripSquare':'precipStrip')),model.id);
      assert.ok(html.includes(i18n.formatNumber(row.precipSquareMmH,2)),model.id);
      assert.ok(!html.includes(i18n.tr('en','precipStripOverlap')),model.id);
      checked++;
    }
  }
  assert.ok(checked>=27);
});
