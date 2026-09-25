import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let server, checkProject, geometry, catalog, flow, emptyProject, i18n, units, focus, store;
const memory = new Map(), previousStorage = globalThis.localStorage;
before(async () => {
  globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) };
  server = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ checkProject } = await server.ssrLoadModule("/src/lib/check-project.ts"));
  geometry = await server.ssrLoadModule("/src/lib/irrigation-geometry.ts");
  catalog = await server.ssrLoadModule("/src/lib/hunter-catalog.ts");
  flow = await server.ssrLoadModule("/src/lib/flow.ts");
  ({ emptyProject } = await server.ssrLoadModule("/src/lib/project-types.ts"));
  i18n = await server.ssrLoadModule("/src/lib/i18n.ts");
  units = await server.ssrLoadModule("/src/lib/units.ts");
  focus = await server.ssrLoadModule("/src/lib/diagnostic-focus.ts");
  store = await server.ssrLoadModule("/src/lib/project-store.ts");
});
after(async () => { await server?.close(); if (previousStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = previousStorage; });
const zone = id => ({ id, name: `Zone ${id}`, nameKind: "generated", hidden: false, locked: false });
const rectangle = (id, x, y, w, h, cadType = "lawn") => ({ id, type: "poly", kind: "lawn", cadType, closed: true, hidden: false, locked: false,
  points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });
const head = (id, x, y, patch = {}) => {
  const item = catalog.itemById("MP2000-360"); assert.ok(item);
  return { ...flow.catalogHeadDefaults(item), id, catalogId: item.id, x, y, start: 0, arc: 360, zone: 1,
    popUpMm: catalog.defaultPopUpMm(item), locked: false, needsReview: false, ...patch };
};
const project = (heads = [], polygons = []) => ({ ...emptyProject(), heads, polygons, zones: [zone(1), zone(2)] });

test("coverage uses every zone, all target components, holes and hidden equipment", () => {
  const p = project([head("a", 0, 0, { r: 5 }), head("b", 6, 0, { r: 5, zone: 2, hidden: true })], [rectangle("lawn", -1, -1, 8, 2)]);
  assert.ok(!checkProject(p).some(i => i.id.startsWith("dry-")), "the second zone covers the first zone's apparent dry area");
  assert.ok(checkProject({ ...p, heads: [p.heads[0]] }).some(i => i.id.startsWith("dry-")));
  const shapes = [rectangle("lawn", 0, 0, 10, 10), rectangle("house", 4, 4, 2, 2, "building"), { ...rectangle("second", 20, 0, 5, 5), hidden: true }];
  const target = geometry.irrigationSurfaces(project([], shapes)).target;
  assert.equal(geometry.surfaceArea(target), 121);
  assert.equal(geometry.pointInSurface({ x: 5, y: 5 }, target), false);
  const dry = checkProject(project([], shapes)).find(i => i.id.startsWith("dry-"));
  assert.equal(dry.metrics.find(m => m.key === "diagRegions").value, 2);
});

test("overspray highlights the actual union once and attributes culprit sprinklers", () => {
  const h = head("one", 0, 0), p = project([h, { ...h, id: "two" }], [rectangle("lawn", 0, -10, 10, 20)]);
  const issue = checkProject(p).find(i => i.id === "over-1");
  assert.deepEqual(issue.headIds, ["one", "two"]);
  assert.ok(Math.abs(issue.metrics.find(m => m.key === "area").value - Math.PI * h.r ** 2 / 2) < .05);
  assert.ok(geometry.pointInSurface({ x: -1, y: 0 }, issue.area));
  assert.ok(!geometry.pointInSurface({ x: 1, y: 0 }, issue.area));
});

test("hatch categories partition uncovered, single, double and triple coverage independently", async () => {
  const { partitionCoverage, diagnosticCoverage } = await server.ssrLoadModule("/src/lib/diagnostic-coverage.ts");
  const box = (x, y, w, h) => [[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]]];
  const target = box(0, 0, 10, 10), a = box(-2, 0, 8, 10), b = box(4, 0, 4, 10);
  const two = partitionCoverage(target, [a,b]);
  assert.equal(geometry.surfaceArea(two.dry), 20);
  assert.equal(geometry.surfaceArea(two.outside), 20);
  assert.equal(geometry.surfaceArea(two.single), 60);
  assert.equal(geometry.surfaceArea(two.double),20);assert.equal(geometry.surfaceArea(two.triple),0);
  assert.ok(!geometry.pointInSurface({ x: 5, y: 5 }, two.single));
  for (const [one, other] of [[two.dry,two.single],[two.outside,two.single],[two.dry,two.outside]]) {
    assert.equal(geometry.surfaceArea(geometry.intersectSurface(one,other)), 0);
  }
  const three = partitionCoverage(target, [a,b,b]);
  assert.equal(geometry.surfaceArea(three.single), 40, "three sprinklers must not become single coverage again");
  assert.equal(geometry.surfaceArea(three.double),20);assert.equal(geometry.surfaceArea(three.triple),20);
  const holed = geometry.subtractSurface(target, box(2, 2, 2, 2));
  const excluded = partitionCoverage(holed, [a,b]);
  assert.ok(!geometry.pointInSurface({ x: 3, y: 3 }, excluded.single));
  assert.ok(geometry.pointInSurface({ x: 3, y: 3 }, excluded.outside));

  const p = project([head("a", 0, 0, { r: 5 }),head("b", 0, 0, { r: 5, zone: 2, hidden: true })], [rectangle("lawn",-5,-5,10,10)]);
  const bands = diagnosticCoverage(p);
  assert.equal(geometry.surfaceArea(bands.single),0,"other zones and hidden sprinklers participate");
  assert.equal(diagnosticCoverage(p),bands);
  const moved = diagnosticCoverage({ ...p, heads:[p.heads[0],{ ...p.heads[1], x: 4 }] });
  assert.ok(geometry.surfaceArea(moved.single)>0,"hatching follows live geometry");
  const unknown = diagnosticCoverage({ ...p, heads:[{ ...p.heads[0],catalogId:"unknown" }] });
  assert.ok(unknown);
  assert.equal(geometry.surfaceArea(unknown.dry),0);
  assert.equal(geometry.surfaceArea(unknown.single),0,'unknown geometry does not certify coverage counts');
});

test('a distant bubbler or a zero sector cannot switch off the sprinkler map', async () => {
  const { diagnosticCoverage } = await server.ssrLoadModule('/src/lib/diagnostic-coverage.ts');
  const h = head('sprinkler',0,0,{r:5});
  const p = project([h],[rectangle('lawn',0,0,12,12),rectangle('bed',30,30,3,3)]);
  const bubbleItem = catalog.itemById('PCB-25');
  const bubble = {...head('bubbler',31,31),...flow.catalogHeadDefaults(bubbleItem),catalogId:bubbleItem.id};
  const before = JSON.stringify(p);
  for (let step = 0; step < 10; step++) {
    const moving = {...h,x:step*.25};
    const normal = diagnosticCoverage({...p,heads:[moving]});
    const mixed = diagnosticCoverage({...p,heads:[moving,bubble]});
    assert.ok(mixed,'map stays available during movement');
    const lawn = geometry.irrigationSurfaces({...p,polygons:[p.polygons[0]]}).target;
    for (const band of ['dry','single','outside']) {
      assert.ok(Math.abs(geometry.surfaceArea(geometry.intersectSurface(mixed[band],lawn))-geometry.surfaceArea(geometry.intersectSurface(normal[band],lawn)))<1e-6);
    }
    assert.ok(!geometry.pointInSurface({x:31,y:31},mixed.dry),'point-irrigated bed is not falsely declared dry');
    assert.ok(!geometry.pointInSurface({x:31,y:31},mixed.single));
    const zero = diagnosticCoverage({...p,heads:[moving,{...h,id:'zero',arc:0}]});
    assert.deepEqual(zero,normal,'zero-area head contributes zero without disabling other heads');
  }
  assert.equal(JSON.stringify(p),before);
});

test("diagnostic area and measurements follow live edits before pointer release", () => {
  const p = project([head("moving", 0, 0, { r: 5 })], [rectangle("lawn", 0, -10, 20, 20)]);
  const issue = checkProject(p).find(i => i.id === "over-1");
  const selected = { project: p, issue };
  store.useProject.setState({ project: p, past: [], pastOps: [], future: [], futureOps: [] });
  store.useProject.getState().beginHeadEdit();
  store.useProject.getState().patchHeadLive("moving", { x: 2, y: 4 });
  const current = store.useProject.getState().project;
  const live = focus.liveDiagnosticIssue(selected, current);
  assert.ok(geometry.pointInSurface({ x: -1, y: 4 }, live.area));
  assert.ok(!geometry.pointInSurface({ x: -4, y: 0 }, live.area), "old orange fill must not stay behind");
  assert.ok(geometry.surfaceArea(live.area) < geometry.surfaceArea(issue.area));
  assert.equal(live.metrics.find(m => m.key === "area").value, geometry.surfaceArea(live.area));
  assert.equal(focus.liveDiagnosticIssue(selected, current), live, "panel and canvas share one geometry result");
  assert.equal(store.useProject.getState().past.length, 0, "live updates do not create undo entries");
  store.useProject.getState().cancelHeadEdit();
  assert.equal(focus.liveDiagnosticIssue(selected, store.useProject.getState().project).metrics.find(m => m.key === "area").value, issue.metrics.find(m => m.key === "area").value);

  const pair = project([head("a", 0, 0, { r: 5.8 }), head("b", 6.2, 0, { r: 6.2, zone: 2 })], [rectangle("lawn", -1, -1, 9, 3)]);
  const pairIssue = checkProject(pair).find(i => i.id === "h2h-a-b");
  const moved = { ...pair, heads: [{ ...pair.heads[0], x: 2 }, pair.heads[1]] };
  const line = focus.liveDiagnosticIssue({ project: pair, issue: pairIssue }, moved);
  assert.deepEqual(line.line.a, { x: 2, y: 0 });
  assert.equal(line.metrics.find(m => m.key === "diagDistance").value, 4.2);
  assert.equal(line.metrics.find(m => m.key === "diagShortage").value, 0);

  const dryIssue = checkProject(p).find(i => i.id.startsWith("dry-"));
  const watered = { ...p, heads: [{ ...p.heads[0], x: 10, r: 20 }] };
  const dry = focus.liveDiagnosticIssue({ project: p, issue: dryIssue }, watered);
  assert.equal(geometry.surfaceArea(dry.area), 0, "resolved gaps leave no stale area on the drawing");
});

test("rotated strips and curved targets preserve their real footprint and holes", () => {
  const item = catalog.itemById("MP-LCS-515"), strip = { ...head("strip", 10, 20), ...flow.catalogHeadDefaults(item), catalogId: item.id, start: 90 };
  const dims = catalog.stripAtPressure(item, strip.designPressure), footprint = geometry.headSurface(strip);
  assert.ok(Math.abs(geometry.surfaceArea(footprint) - dims.w * dims.l) < 1e-8);
  assert.ok(geometry.pointInSurface({ x: strip.x - (dims.oy + dims.w / 2), y: strip.y + dims.ox + dims.l / 2 }, footprint));
  const circle = { ...rectangle("round", 0, 0, 1, 1), type: "circle", points: [{ x: 0, y: 0 }], radius: 6 };
  const target = geometry.irrigationSurfaces(project([], [circle])).target;
  assert.ok(Math.abs(geometry.surfaceArea(target) - Math.PI * 36) < .04);
  assert.ok(!checkProject(project([head("round-head", 0, 0, { r: 6 })], [circle])).some(i => i.id.startsWith("dry-") || i.id.startsWith("over-")));
});

test("adjacent short radius exposes both objects, line and exact shortage; overlap itself is valid", () => {
  const p = project([head("a", 0, 0, { r: 5.8 }), head("b", 6.2, 0, { r: 6.2, zone: 2 })], [rectangle("lawn", -1, -1, 9, 3)]);
  const issue = checkProject(p).find(i => i.id === "h2h-a-b");
  assert.deepEqual(issue.headIds, ["a", "b"]); assert.deepEqual(issue.zoneIds, [1, 2]);
  assert.equal(issue.metrics.find(m => m.key === "diagDistance").value, 6.2);
  assert.ok(Math.abs(issue.metrics.find(m => m.key === "diagShortage").value - .4) < 1e-10);
  assert.deepEqual(issue.line, { a: { x: 0, y: 0 }, b: { x: 6.2, y: 0 } });
  const close = checkProject({ ...p, heads: [head("a", 1, 0), head("b", 1.1, 0)] });
  assert.ok(!close.some(i => i.id.startsWith("h2h-") || i.id === "h2h-dual"));
});

test("significant neighbours detect a wrong sector, but disconnected land and obstacles do not invent links", () => {
  const p = project([head("a", 0, 0, { arc: 90, r: 2 }), head("b", 6, 0, { arc: 90, r: 2 })], [rectangle("lawn", -1, -1, 8, 2)]);
  assert.equal(checkProject(p).find(i=>i.id==='h2h-b-a').direction.inSector,false);
  const blocked = project([head("a", 0, 0, { r: 2 }), head("b", 6, 0, { r: 2 })], [rectangle("lawn", -1, -1, 8, 2), rectangle("wall", 3.0001, -1, .0002, 2, "building")]);
  assert.ok(!checkProject(blocked).some(i => i.id.startsWith("h2h-")));
});

test("manufacturer pressure and MP compatibility checks use nozzle data, not supply defaults", () => {
  const a = head("a", 0, 0), item = catalog.itemById(a.catalogId), rows = item.nozzles.find(n => n.id === a.nozzleId).performance;
  assert.ok(!checkProject({ ...project([a]), water: { ...emptyProject().water, dynamicBar: .1 } }).some(i => i.id === "p-a"));
  const bad = { ...a, designPressure: Math.max(...rows.map(r => r.pressureBar)) + .1 };
  assert.equal(checkProject(project([bad])).find(i => i.id === "p-a").level, "error");
  const mp800 = catalog.CATALOG.find(i => i.precipClass === "mp20"); assert.ok(mp800);
  const b = { ...head("b", 4, 0), ...flow.catalogHeadDefaults(mp800), catalogId: mp800.id };
  const mix = checkProject(project([a, b])).find(i => i.id === "mix-1");
  assert.equal(mix.level, "error"); assert.deepEqual(mix.metrics.map(m => m.value), [10, 20]);
});

test("flow and runoff require actual inputs; unknown models never yield a complete flow check", () => {
  const a = head("a", 0, 0), p = project([a]);
  let report = checkProject(p);
  assert.ok(report.some(i => i.id === "source-flow" && i.level === "info"));
  assert.ok(!report.some(i => i.id.startsWith("runoff-") && i.level === "warn"));
  const q = flow.headFlow(a).lpm;
  report = checkProject({ ...p, water: { ...p.water, availableLpm: q / 2 } });
  assert.equal(report.find(i => i.id === "zone-q-1").metrics.find(m => m.key === "diagExcess").value, q / 2);
  assert.ok(checkProject({ ...p, water: { ...p.water, availableLpm: 0 } }).some(i => i.id === "zone-q-1"), "zero supply is a known inadequate supply, not missing data");
  report = checkProject({ ...p, heads: [a, { ...a, id: "missing", catalogId: "unverified" }], water: { ...p.water, availableLpm: q / 2 } });
  assert.ok(!report.some(i => i.id === "zone-q-1"));
  assert.ok(report.some(i => i.id === "flow-data-1"));
  report = checkProject({ ...p, meta: { ...p.meta, soil: "Measured loam", slopePct: 3, infiltrationMmHr: 8 } });
  assert.ok(report.some(i => i.id === "runoff-1" && i.level === "warn"));
  const point = catalog.CATALOG.find(item => item.coverageKind === "point");
  const unknownCoverage = checkProject(project([{ ...a, ...flow.catalogHeadDefaults(point), catalogId: point.id }], [rectangle("lawn", -1, -1, 2, 2)]));
  assert.ok(unknownCoverage.some(i => i.id.startsWith("dry-") && i.level === "info"));
});

test("diagnosis and highlights preserve project data, names, history and canonical units", () => {
  const p = project([head("a", 0, 0)], [rectangle("lawn", 0, 0, 10, 10)]);
  p.zones[0].name = "Газон перед домом"; p.zones[0].nameKind = "custom";
  p.meta.infiltrationMmHr = 7.25;
  const before = JSON.stringify(p), ruReport = checkProject(p);
  i18n.setActiveLocale("ja"); units.setActiveUnits(units.US_UNITS);
  assert.deepEqual(checkProject(p), ruReport); assert.equal(JSON.stringify(p), before);
  const active = ruReport.find(i => i.area?.length);
  focus.useDiagnosticFocus.getState().show(p, active);
  assert.equal(focus.useDiagnosticFocus.getState().focus.project, p);
  assert.equal(focus.focusedIssue(focus.useDiagnosticFocus.getState().focus, { ...p }), active, "immutable updates keep the highlight");
  store.useProject.setState({ selectedId: "a", selectedIds: ["a"] });
  assert.equal(focus.focusedIssue(focus.useDiagnosticFocus.getState().focus, { ...p }), active, "selection does not dismiss the highlight");
  assert.equal(focus.focusedIssue(focus.useDiagnosticFocus.getState().focus, { ...p, id: "another-project" }), null);
  const bounds = focus.diagnosticBounds(p, active), view = focus.diagnosticView(bounds, { x: 20, y: 30, w: 600, h: 300 });
  assert.ok(bounds.minX * view.px + view.panX >= 20);
  assert.ok(bounds.maxX * view.px + view.panX <= 620);
  focus.useDiagnosticFocus.getState().clear(); assert.equal(focus.useDiagnosticFocus.getState().focus, null);
  assert.equal(JSON.stringify(p), before);
  assert.equal(store.migrateProject(JSON.parse(before)).meta.infiltrationMmHr, 7.25);
});

test("diagnostics render every message in all 20 locales including RTL, with local numbers and units", async () => {
  const { IrrigationReport, IrrigationCheckButton, DiagnosticLegend } = await server.ssrLoadModule("/src/components/designer/irrigation-check.tsx");
  const { CoverageLegend } = await server.ssrLoadModule('/src/components/designer/automatic-plan-controls.tsx');
  const { LOCALES } = await server.ssrLoadModule("/src/lib/locale-config.ts");
  const en = JSON.parse(await readFile("src/lib/locales/en.json", "utf8"));
  const keys = Object.keys(en).filter(k => k.startsWith("diag"));
  const p = project([head("a", 0, 0)], [rectangle("lawn", 0, 0, 10, 10)]);
  p.zones[0] = { ...p.zones[0], name: "Газон перед домом", nameKind: "custom" };
  for (const { id, dir } of LOCALES) {
    const messages = JSON.parse(await readFile(`src/lib/locales/${id}.json`, "utf8"));
    keys.forEach(key => assert.ok(messages[key]?.trim(), `${id}.${key}`));
    const legend = renderToStaticMarkup(React.createElement(DiagnosticLegend, { locale:id }));
    for (const key of ["diagMapLegend","diagMapDry","diagMapOutside","diagMapSingle"]) assert.ok(legend.includes(messages[key]), `${id}.${key}`);
    const floatingLegend = renderToStaticMarkup(React.createElement(CoverageLegend,{locale:id}));
    assert.ok(!floatingLegend.includes(messages.diagDataMissing),'coverage legend has no missing-data notice');
    for (const key of ['diagMapDouble','diagMapTriple']) assert.ok(!legend.includes(messages[key]));
    assert.ok(!legend.includes(messages.diagMapSingleDetail),'retired long explanation is absent');
    assert.equal((legend.match(/diagnostic-hatch-swatch/g) ?? []).length, 3);
    const trigger = props => renderToStaticMarkup(React.createElement(IrrigationCheckButton, { project: p, section: "irrigation", locale: id, onClick() {}, ...props }));
    assert.ok(trigger({}).includes(messages.checkIrrigation));
    assert.equal(trigger({ section: "plan" }), "");
    assert.equal(trigger({ section: "landscape" }), "");
    assert.equal(trigger({ project: { ...p, zones: [] } }), "");
    i18n.setActiveLocale(id); units.setActiveUnits(units.METRIC_UNITS);
    const issues = checkProject(p);
    issues.forEach(issue => [issue.titleKey, issue.detailKey, ...issue.metrics.map(m => m.key)].forEach(key => assert.ok(messages[key], `${id}.${key}`)));
    const html = renderToStaticMarkup(React.createElement(IrrigationReport, { project: p, issues, units: units.METRIC_UNITS, locale: id, filter: "all", onFilter() {}, onSelect() {} }));
    assert.ok(html.includes(`dir="${dir}"`)); assert.ok(html.includes("Газон перед домом"));
    assert.equal((html.match(/class="diagnostic-group diagnostic-severity-card"/g) ?? []).length, 3);
    assert.ok(!html.includes("diagDry")); assert.ok(html.includes(messages.diagMapDry));
    const filtered = renderToStaticMarkup(React.createElement(IrrigationReport, { project: p, issues, units: units.METRIC_UNITS, locale: id, filter: "error", onFilter() {}, onSelect() {} }));
    assert.ok(!filtered.includes('class="diagnostic-issue" data-level="warn"'));
  }
});
