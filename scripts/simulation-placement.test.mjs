import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import ts from 'typescript';

const root = process.env.IRRI_ROOT ?? process.cwd(), req = createRequire(resolve(root, 'package.json'));
let server, store, types, catalog, flow, water, visibility, presentation, auto, snapping, cad, canvasSource, autoSource, ast;
const compile = (text, env) => new Function(...Object.keys(env), ts.transpileModule(text, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: 'React.createElement' },
}).outputText)(...Object.values(env));
function findNode(predicate) { let found; const walk = node => { if (found) return; if (predicate(node)) { found = node; return; } ts.forEachChild(node, walk); }; walk(ast); assert.ok(found); return found; }
const initializer = name => findNode(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === name).initializer.getText(ast);
const attr = (tag, name) => findNode(n => ts.isJsxAttribute(n) && n.name.getText(ast) === name
  && n.parent.parent.tagName?.getText(ast) === tag).initializer.expression.getText(ast);
const noop = () => {};
before(async () => {
  server = await createServer({ configFile: false, root, resolve: { alias: { '@': resolve(root, 'src') } }, server: { middlewareMode: true, hmr: false }, logLevel: 'silent' });
  [store, types, catalog, flow, water, visibility, presentation, auto, snapping, cad] = await Promise.all([
    'project-store', 'project-types', 'equipment-catalog', 'flow', 'watering-preview', 'head-visibility', 'simulation-presentation', 'automatic-head', 'head-snapping', 'cad/engine',
  ].map(name => server.ssrLoadModule('/src/lib/' + name + '.ts')));
  canvasSource = await readFile(resolve(root, 'src/components/designer/design-canvas.tsx'), 'utf8');
  autoSource = await readFile(resolve(root, 'src/components/designer/automatic-head-tool.tsx'), 'utf8');
  ast = ts.createSourceFile('design-canvas.tsx', canvasSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
});
after(async () => server?.close());
function reset(brand = 'hunter', group = 'mp') {
  const project = types.emptyProject();
  store.useProject.setState({ project, projects: [], workspaceSection: 'irrigation', simulationProjectId: null,
    equipmentFilters: { manufacturerId: brand }, familyFilter: group, tool: null, catalogPlacementArmed: false,
    activeZoneId: 1, past: [], future: [], pastOps: [], futureOps: [], spaceDown: false, snapOn: false, snapGridOn: false,
    pxPerMeter: 40, panX: 10, panY: 20, selectedId: null, selectedIds: [], zoneFocus: null,
    pendingCatalogPlant: null, pendingLandscapeObject: null });
  store.useProject.getState().toggleSimulation();
  assert.equal(presentation.isIrrigationSimulation(store.useProject.getState()), true);
  return project.id;
}
function manualHarness(raw = { x: 3.2, y: 4.8 }) {
  const start = canvasSource.indexOf('  const clearEmptyCanvasSelection ='), end = canvasSource.indexOf('    if (st.tool === "scale") {', start);
  const env = { useProject: store.useProject, textEditor: null, segmentEditTapConsumed: { current: false },
    pinchGestureActive: { current: false }, pinching: false, pinchSuppressClickUntil: { current: 0 }, lineTapGuardUntil: { current: 0 },
    skipClick: { current: false }, editDrag: { current: false }, toWorld: () => raw, finishSegmentEditOnTap: () => false,
    applySnap: p => ({ pt: p }), readOnly: false, simulationActive: true, onSelectionClear: noop,
    setSelectedNote: noop, setSelectedDimension: noop, setDimensionEditor: noop, setPickList: noop, dimensionInteraction: { current: false } };
  const stage = {}, target = { name: () => 'bg', getStage: () => stage };
  const send = (kind = 'onClick', evt = { button: 0 }) => {
    const handleClick = compile(canvasSource.slice(start, end) + '\n}; return handleClick;', env);
    compile('return (' + attr('Stage', kind) + ');', { ...env, handleClick })({ target, evt });
  };
  return { env, send };
}
function manualArmed() {
  const s = store.useProject.getState();
  return compile('return (' + initializer('manualPlacement') + ');', { ...s, readOnly: false, simulationActive: true });
}

test('actual mouse and touch canvas handlers place each brand while simulation stays active, with undo and redo', () => {
  for (const [brand, group, id] of [['hunter', 'mp', 'MP1000-360'], ['rain-bird', 'rvan', 'rain-bird:R-VAN18'], ['toro', 'precision', 'toro:PSN10-H'], ['k-rain', 'rotary', 'k-rain:RN100-ADJ']]) {
    for (const input of ['onClick', 'onTap']) {
      const projectId = reset(brand, group), h = manualHarness();
      store.useProject.getState().selectCatalogItem(id);
      assert.equal(manualArmed(), true, id + ' placement target is armed during simulation');
      h.send(input, input === 'onTap' ? { touches: [] } : { button: 0 });
      const placed = store.useProject.getState().project.heads[0]; assert.ok(placed, id);
      assert.equal(placed.catalogId, id); assert.deepEqual([placed.x, placed.y], [3.2, 4.8]);
      assert.notEqual(water.wateringProfile(placed).kind, 'unknown');
      assert.equal(store.useProject.getState().simulationProjectId, projectId);
      assert.equal(presentation.isIrrigationSimulation(store.useProject.getState()), true);
      assert.equal(store.useProject.getState().past.length, 1);
      assert.equal(manualArmed(), false, 'one selected card produces one installation');
      h.send(input, input === 'onTap' ? { touches: [] } : { button: 0 });
      assert.equal(store.useProject.getState().project.heads.length, 1, 'unarmed clicks do not duplicate');
      store.useProject.getState().undo(); assert.equal(store.useProject.getState().project.heads.length, 0);
      assert.equal(presentation.isIrrigationSimulation(store.useProject.getState()), true);
      store.useProject.getState().redo(); assert.deepEqual(store.useProject.getState().project.heads[0], JSON.parse(JSON.stringify(placed)));
      assert.equal(presentation.isIrrigationSimulation(store.useProject.getState()), true);
    }
  }
});

test('manual right/middle pan, Space, cancelled editing and pinch never install a head or stop simulation', () => {
  reset(); store.useProject.getState().selectCatalogItem('MP1000-360');
  const h = manualHarness();
  for (const button of [1, 2]) {
    const mousePan = { current: null }, event = { pointerType: 'mouse', pointerId: 4, button, clientX: 100, clientY: 120,
      target: { tagName: 'CANVAS' }, currentTarget: { setPointerCapture: noop, hasPointerCapture: () => true, releasePointerCapture: noop },
      preventDefault: noop, stopPropagation: noop };
    const env = { tool: 'place', readOnly: false, useProject: store.useProject, mousePan, endCadHold: noop,
      setMousePanning: noop, setHoveredHead: noop, setPressedHead: noop, marqueePointer: { current: null } };
    compile('return (' + attr('div', 'onPointerDownCapture') + ');', env)(event);
    assert.ok(mousePan.current);
    compile('return (' + attr('div', 'onPointerMoveCapture') + ');', env)({ ...event, clientX: 157, clientY: 97 });
    assert.equal(store.useProject.getState().panX, mousePan.current.panX + 57);
    assert.equal(store.useProject.getState().panY, mousePan.current.panY - 23);
    compile('return (' + attr('div', 'onPointerUpCapture') + ');', env)(event);
    assert.equal(mousePan.current, null); h.send('onClick', { button });
    assert.equal(store.useProject.getState().project.heads.length, 0);
  }
  store.useProject.setState({ spaceDown: true }); h.send(); store.useProject.setState({ spaceDown: false });
  for (const key of ['pinchGestureActive', 'editDrag', 'skipClick']) { h.env[key].current = true; h.send(); h.env[key].current = false; }
  h.env.pinching = true; h.send(); h.env.pinching = false;
  store.useProject.getState().setTool(null); h.send();
  assert.equal(store.useProject.getState().project.heads.length, 0); assert.equal(store.useProject.getState().past.length, 0);
  assert.equal(presentation.isIrrigationSimulation(store.useProject.getState()), true);
});

function automaticHarness(pointerType = 'mouse') {
  let center = null, sector = null, hover = null, failed = false;
  const draft = { current: null }, pointers = { current: new Map() }, blocked = { current: false }, pinch = { current: null }, pan = { current: null }, resumePointer = { current: null }, gestureStart = { current: null };
  const surface = { setPointerCapture: noop, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const declarations = autoSource.slice(autoSource.indexOf(' const point='), autoSource.indexOf(' return <div className="automatic-head-tool"'));
  const finishText = autoSource.slice(autoSource.indexOf(' const finish=()=>'), autoSource.indexOf(' useEffect(()=>{', autoSource.indexOf(' const finish=()=>')));
  const cancelText = autoSource.slice(autoSource.indexOf(' const cancel=()=>'), autoSource.indexOf(' const finish=()=>'));
  const env = () => ({ ...auto, ...snapping, ...cad, ...visibility, useProject: store.useProject, center, sector, hover, pressure: 3.1,
    px: store.useProject.getState().pxPerMeter, closeDistance: Math.min(14 / store.useProject.getState().pxPerMeter, (sector?.radius ?? 1) * .25),
    draft, pointers, blocked, pinch, pan, resumePointer, gestureStart, svg: { current: surface }, setPanning: noop,
    setCenter: v => center = v, setSector: v => sector = v, setHover: v => hover = v, setFailed: v => failed = v });
  const event = (x, y, button = 0) => { const s = store.useProject.getState(); return { clientX: x * s.pxPerMeter + s.panX,
    clientY: y * s.pxPerMeter + s.panY, pointerId: 1, pointerType, button, buttons: button === 2 ? 2 : 0,
    currentTarget: surface, preventDefault: noop, stopPropagation: noop }; };
  let automaticHeadTarget;
  const init = async () => { ({ automaticHeadTarget } = await server.ssrLoadModule('/src/components/designer/automatic-head-tool.tsx')); };
  const send = (kind, e) => compile(cancelText + finishText + declarations + ';return {down,move,up,cancelPointer,cancel,finish};', { ...env(), automaticHeadTarget })[kind](e);
  return { init, event, send, tap(x, y) { send('down', event(x, y)); send('up', event(x, y)); }, read: () => ({ center, sector, hover, failed }) };
}

test('actual automatic pointer construction commits during simulation; pan/cancel preserve the running session', async () => {
  for (const pointerType of ['mouse', 'touch', 'pen']) {
    const projectId = reset(); store.useProject.setState({ tool: 'auto-head' });
    const h = automaticHarness(pointerType); await h.init();
    h.tap(1, 2); h.tap(5, 2); h.send('move', h.event(1, 6)); assert.equal(h.read().sector.arc, 90);
    const before = structuredClone(h.read().sector), start = h.event(7, 8, 2), moved = { ...start, clientX: start.clientX + 40, clientY: start.clientY - 20 };
    h.send('down', start); h.send('move', moved); h.send('up', moved);
    assert.deepEqual(h.read().sector, before); assert.equal(store.useProject.getState().project.heads.length, 0);
    assert.equal(store.useProject.getState().simulationProjectId, projectId);
    // Enter/confirm commits the unchanged draft after panning without sweeping it
    // towards a different physical pointer position in the moved viewport.
    h.send('finish'); const placed = store.useProject.getState().project.heads[0]; assert.ok(placed, pointerType);
    assert.equal(placed.r, 4); assert.equal(placed.arc, 90); assert.notEqual(water.wateringProfile(placed).kind, 'unknown');
    assert.equal(presentation.isIrrigationSimulation(store.useProject.getState()), true);
    store.useProject.getState().undo(); assert.equal(store.useProject.getState().project.heads.length, 0);
    assert.equal(presentation.isIrrigationSimulation(store.useProject.getState()), true);
    store.useProject.getState().redo(); assert.deepEqual(store.useProject.getState().project.heads[0], JSON.parse(JSON.stringify(placed)));
    reset(); store.useProject.setState({ tool: 'auto-head' }); const cancelled = automaticHarness(pointerType); await cancelled.init();
    cancelled.tap(1, 2); cancelled.tap(5, 2); cancelled.send('move', cancelled.event(1, 6));
    cancelled.send('down', cancelled.event(1, 6)); cancelled.send('cancelPointer', cancelled.event(1, 6)); cancelled.send('up', cancelled.event(1, 6));
    assert.equal(store.useProject.getState().project.heads.length, 0); cancelled.send('cancel');
    assert.equal(store.useProject.getState().tool, 'place'); assert.equal(presentation.isIrrigationSimulation(store.useProject.getState()), true);
  }
});

test('actual canvas head subtree does not intercept armed placement and immediately paints each added head', async () => {
  const React = req('react'), K = req('konva'), Konva = K.default ?? K, { Group, Circle, Line, KonvaRenderer } = req('react-konva/lib/ReactKonvaCore.js');
  const { WateringHead, FocusedHead } = await server.ssrLoadModule('/src/components/designer/zone-highlights.tsx');
  const [headPresentation, hit] = await Promise.all(['head-presentation', 'head-hit-target'].map(n => server.ssrLoadModule('/src/lib/' + n + '.ts')));
  const { specialFootprint } = await server.ssrLoadModule('/src/lib/equipment-footprint.ts');
  const map = findNode(n => ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'map' && n.getText(ast).includes('placementId={h.id}'));
  const previous = globalThis.IS_REACT_ACT_ENVIRONMENT; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = new Konva.Group(), errors = [], r = KonvaRenderer.createContainer(container, 1, null, false, null, '', e => errors.push(e), e => errors.push(e), e => errors.push(e), null);
  const elapsed = { current: 1 };
  const render = async () => {
    const s = store.useProject.getState();
    const env = { ...catalog, ...flow, ...visibility, ...headPresentation, ...hit, specialFootprint,
      React, Group, Circle, Line, WateringHead, FocusedHead, project: s.project, visibleHeads: visibility.visibleProjectHeads(s.project),
      selectedIds: [], selectedId: null, diagnosticIssue: null, diagnosticHeads: [], readOnly: false, spaceDown: false, multiSelect: false,
      pendingPlacement: manualArmed(), tool: s.tool, drawSub: 'none', sectorEditId: null, lockedZones: new Set(), px: 40,
      sx: x => x * 40, sy: y => y * 40, pointerType: { current: 'mouse' }, showCoverage: false, simulationActive: true,
      wateringTime: elapsed, zoneColor: () => '#349a59', zoneFocus: null };
    const tree = compile('return (' + map.getText(ast) + ');', env);
    await React.act(async () => KonvaRenderer.updateContainer(tree, r, null, noop));
    return container.children;
  };
  try {
    reset(); store.useProject.getState().selectCatalogItem('MP1000-360'); manualHarness().send();
    const first = store.useProject.getState().project.heads[0];
    store.useProject.getState().selectCatalogItem('rain-bird:R-VAN18');
    let nodes = await render(); assert.equal(nodes.length, 1); assert.equal(nodes[0].getAttr('placementId'), first.id);
    assert.equal(nodes[0].listening(), false, 'installed head cannot consume the armed click'); assert.equal(nodes[0].draggable(), false);
    manualHarness({ x: 9, y: 4 }).send(); nodes = await render(); assert.equal(nodes.length, 2);
    const newest = store.useProject.getState().project.heads.at(-1), group = nodes.find(n => n.getAttr('placementId') === newest.id);
    assert.ok(group); const shape = group.children.find(n => typeof n.getAttr('sceneFunc') === 'function'); assert.ok(shape, 'new head has actual WateringHead paint');
    const commands = () => { const out = []; const ctx = new Proxy({}, { get: (_, name) => (...values) => { if (['lineTo', 'fillRect'].includes(name)) out.push([name, ...values]); }, set: () => true }); shape.sceneFunc()(ctx); return out; };
    const frame1 = commands(); elapsed.current = 2; const frame2 = commands();
    assert.ok(frame1.length > 100); assert.notDeepEqual(frame1, frame2, 'new water moves on the shared clock');
    store.useProject.getState().undo(); assert.equal((await render()).length, 1);
    assert.equal(presentation.isIrrigationSimulation(store.useProject.getState()), true); assert.deepEqual(errors, []);
  } finally { await React.act(async () => KonvaRenderer.updateContainer(null, r, null, noop)); globalThis.IS_REACT_ACT_ENVIRONMENT = previous; }
});
