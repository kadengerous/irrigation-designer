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
let server, catalog, flow, automatic, store, i18n, units, emptyProject, locales;
let AutomaticHeadPanel, PressureSteps;
const previousStorage = globalThis.localStorage;

before(async () => {
  const memory = new Map();
  globalThis.localStorage = {getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key)};
  // SSR only: middleware mode does not start an HTTP listener, and HMR is disabled.
  server = await createServer({configFile: false, root, resolve: {alias: {'@': resolve(root, 'src')}}, server: {middlewareMode: true, hmr: false}, logLevel: 'silent'});
  const load = path => server.ssrLoadModule('/src/' + path);
  [catalog, flow, automatic, {useProject: store}, i18n, units, {emptyProject}, {LOCALES: locales}, {AutomaticHeadPanel}, {PressureSteps}] = await Promise.all([
    'lib/equipment-catalog.ts', 'lib/flow.ts', 'lib/automatic-head.ts', 'lib/project-store.ts',
    'lib/i18n.ts', 'lib/units.ts', 'lib/project-types.ts', 'lib/locale-config.ts',
    'components/designer/automatic-head-tool.tsx', 'components/designer/pressure-steps.tsx',
  ].map(load));
});

after(async () => {
  await server?.close();
  if (previousStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousStorage;
});

const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));
const escaped = text => render('span', {children: text}).slice(6, -7);
const item = id => {
  const result = catalog.itemById('rain-bird:' + id);
  assert.ok(result, id);
  return result;
};
function localeState(locale, pressure = 'bar') {
  const prefs = {...units.METRIC_UNITS, pressure};
  i18n.setActiveLocale(locale);
  units.setActiveUnits(prefs);
  store.setState({locale, units: prefs, project: emptyProject()});
  // Zustand uses its initial snapshot when rendering a component on the server.
  Object.assign(store.getInitialState(), store.getState());
  return prefs;
}
function panel(fit, availablePressure, prefs) {
  return render(AutomaticHeadPanel, {
    groupLabel: 'Rain Bird', center: {x: 0, y: 0},
    sector: {center: {x: 0, y: 0}, radius: fit.r, arc: fit.arc, start: fit.start},
    radius: fit.r, fit, pressure: availablePressure, failed: false, units: prefs,
    cancel() {}, finish() {}, restart() {}, setPressure() {}, editSector() {},
  });
}
const resultPressure = (key, fit, pressureUnit) => `<div>${escaped(i18n.text(key))}: <bdi>${escaped(units.formatPressureU(fit.designPressure, pressureUnit))}</bdi></div>`;

test('5004+PCR automatic result labels its published inlet pressure in all locales and pressure units', () => {
  const model = item('5004+PCR');
  const fit = automatic.selectAutomaticHead(10.6, 180, 4.5, [model]);
  assert.ok(fit, 'a published PRS plateau configuration can be selected');
  assert.equal(fit.bodyId, model.id, 'the pressure regulator belongs to the integrated rotor');
  assert.equal(fit.designPressure, 4.5, 'the PRS chart is indexed by inlet pressure');
  assert.equal(fit.needsReview, false);
  assert.equal(catalog.catalogPressureLabel(model), 'equipment.pressureAtInlet');
  for (const {id: locale} of locales) for (const pressureUnit of ['bar', 'psi']) {
    const html = panel(fit, 4.5, localeState(locale, pressureUnit));
    assert.ok(html.includes(resultPressure('equipment.pressureAtInlet', fit, pressureUnit)), `${locale}/${pressureUnit}: localized inlet label and actual selected pressure`);
    assert.ok(!html.includes(resultPressure('workingPressure', fit, pressureUnit)), `${locale}: inlet pressure must not be described as downstream working pressure`);
    assert.doesNotMatch(html, /equipment\.pressureAtInlet|data-auto-head-regulated/);
    assert.ok(html.includes(escaped(i18n.text('autoHead.pressure'))), 'available-pressure input remains separately labelled');
  }
});

test('ordinary R-VAN automatic result retains the localized working-pressure label', () => {
  const model = item('R-VAN14');
  const fit = automatic.selectAutomaticHead(4.3, 137, 3.1, [model]);
  assert.ok(fit);
  assert.equal(fit.needsReview, false);
  assert.equal(catalog.catalogPressureLabel(model), 'workingPressure');
  for (const {id: locale} of locales) for (const pressureUnit of ['bar', 'psi']) {
    const html = panel(fit, 3.1, localeState(locale, pressureUnit));
    assert.ok(html.includes(resultPressure('workingPressure', fit, pressureUnit)), `${locale}/${pressureUnit}`);
    assert.ok(!html.includes(resultPressure('equipment.pressureAtInlet', fit, pressureUnit)), `${locale}: ordinary nozzle pressure is not inlet-chart pressure`);
  }
});

test('PressureSteps renders the requested inlet label and defaults to working pressure', () => {
  const model = item('5004+PCR');
  for (const {id: locale} of locales) for (const pressureUnit of ['bar', 'psi']) {
    localeState(locale, pressureUnit);
    const props = {values: [2.5, 3, 3.5, 4.5], value: 4.5, recommended: 2.5, onChange() {}};
    for (const labelKey of [catalog.catalogPressureLabel(model), undefined]) {
      const html = render(PressureSteps, {...props, labelKey});
      const legend = html.match(/<legend>([\s\S]*?)<\/legend>/)?.[1];
      assert.ok(legend, `${locale}: accessible fieldset legend`);
      assert.ok(legend.includes(escaped(i18n.text(labelKey ?? 'workingPressure'))), `${locale}/${pressureUnit}: legend uses labelKey`);
      assert.ok(legend.includes(escaped(units.pressureLabel(pressureUnit))));
      assert.doesNotMatch(legend, /equipment\.pressureAtInlet|workingPressure/);
      assert.match(html, /type="radio"[^>]*checked=""[^>]*value="4\.5"/, 'selected pressure remains unchanged by its presentation label');
    }
  }
});

test('geometry-only VAN selection explains unpublished settings without claiming radius reduction', () => {
  const model = item('4-VAN');
  const fit = automatic.selectAutomaticHead(1.2, 60, 2.1, [model]);
  assert.ok(fit, 'the documented mechanical sector can still be placed');
  assert.equal(fit.needsReview, true);
  const published = flow.performanceAt(model, fit.nozzleId, fit.designPressure, 90);
  assert.ok(published);
  assert.equal(fit.r, published.row.radiusM, 'this fixture is at the full published radius, not a reduced throw');
  assert.equal(flow.computeFlow(model, {arc: fit.arc, radius: fit.r, pressureBar: fit.designPressure, nozzleId: fit.nozzleId}).lpm, null);
  for (const {id: locale} of locales) {
    const html = panel(fit, 2.1, localeState(locale));
    const explanation = i18n.text('autoHead.flowUnknown');
    assert.ok(html.includes(`<p role="note">${escaped(explanation)}</p>`), `${locale}: unknown hydraulics are explained`);
    assert.doesNotMatch(html, /autoHead\.flowUnknown/);
    if (locale === 'en') assert.doesNotMatch(explanation, /reduced\s+radius|radius\s+reduction/i);
    if (locale === 'ru') assert.doesNotMatch(explanation, /уменьшен\S*\s+радиус|сокращен\S*\s+радиус|уменьшени\S*\s+радиус/i);
    assert.match(html, /data-match="true"/, 'unknown discharge does not masquerade as unsupported geometry');
  }
});
