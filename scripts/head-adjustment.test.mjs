import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("rotor rack selection, live controls and canvas tools in the irrigation workspace", async () => {
  const memory = new Map(), oldStorage = globalThis.localStorage, oldWindow = globalThis.window;
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key,value) => memory.set(key,value), removeItem: key => memory.delete(key) };
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { placeableCatalog, itemById } = await server.ssrLoadModule("/src/lib/hunter-catalog.ts");
    const { catalogHeadDefaults, headFlow, performanceAt, pressureRange, radiusRange } = await server.ssrLoadModule("/src/lib/flow.ts");
    const { headParameterRanges, usesAutomaticNozzle } = await server.ssrLoadModule("/src/lib/head-adjustment.ts");
    globalThis.window = { localStorage: globalThis.localStorage };
    const { useProject } = await server.ssrLoadModule("/src/lib/project-store.ts");
    const { emptyProject } = await server.ssrLoadModule("/src/lib/project-types.ts");
    const { addRect, toPolygons } = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const current = () => useProject.getState().project.heads[0];
    const reset = item => {
      const h = { ...catalogHeadDefaults(item), id:"test-head", catalogId:item.id, x:4,y:5,start:30,zone:1,bodyId:item.id,popUpMm:100,locked:false,needsReview:false };
      useProject.setState({ project:{...emptyProject(),heads:[h]}, past:[],future:[],selectedId:h.id,selectedIds:[h.id] });
      return h;
    };
    const valid = (item, h) => {
      assert.equal(h.catalogId, item.id, "never substitute a different rotor model");
      assert.ok(item.nozzles.some(n => n.id === h.nozzleId));
      const p = pressureRange(item,h.nozzleId,h.arc), r = radiusRange(item,h.nozzleId,h.designPressure,h.arc);
      assert.ok(p && h.designPressure >= p.min && h.designPressure <= p.max, `${item.id} pressure supported by chosen nozzle`);
      assert.ok(r && h.r >= r.min-1e-8 && h.r <= r.max+1e-8, `${item.id} radius supported by chosen nozzle`);
      assert.ok(headFlow(h).lpm > 0, `${item.id} actual flow remains available`);
      assert.deepEqual([h.x,h.y,h.start,h.zone],[4,5,30,1], "control changes preserve position/orientation/zone");
    };
    // Reproduce the user's MP3500-90 radius jump with the real pressure table.
    const mp = itemById("MP3500-90");
    reset(mp);
    useProject.getState().updateHead("test-head", {r:10});
    const reduced = current();
    assert.equal(reduced.designPressure, 2.8);
    assert.equal(reduced.r, 10);
    useProject.setState({past:[],future:[]});
    useProject.getState().beginHeadEdit();
    useProject.getState().patchHeadLive(reduced.id, {designPressure:2.6});
    assert.ok(Math.abs(current().r - 9.857142857142858) < 1e-8, "pressure follows the curve without resetting to 10.5156 m");
    assert.ok(current().r < radiusRange(mp,current().nozzleId,2.6,current().arc).max);
    for (const pressure of [2.1,2.4,3.8,2.8,3.1]) {
      useProject.getState().patchHeadLive(reduced.id, {designPressure:pressure});
      const nominal = performanceAt(mp,current().nozzleId,pressure,current().arc).row.radiusM;
      assert.ok(Math.abs(current().r/nominal - 10/10.668) < 1e-8, "one slider gesture keeps the original reduction setting");
    }
    assert.equal(current().r,10,"flat sections of the manufacturer curve do not invent a radius change");
    useProject.getState().endHeadEdit();
    assert.equal(useProject.getState().past.length,1);
    useProject.getState().undo();
    assert.deepEqual(current(),reduced);

    // All fixed-nozzle circular models preserve a reduced radius within their own limits.
    const fixed = placeableCatalog().filter(item => !usesAutomaticNozzle(item) && !item.strip && item.coverageKind !== "point");
    for (const item of fixed) {
      reset(item);
      const range = radiusRange(item,current().nozzleId,current().designPressure,current().arc);
      if (!range) continue;
      useProject.getState().updateHead("test-head", {r:(range.min+range.max)/2});
      const before = current(), p = pressureRange(item,before.nozzleId,before.arc);
      const nominal = performanceAt(item,before.nozzleId,before.designPressure,before.arc).row.radiusM;
      useProject.getState().beginHeadEdit();
      for (const bar of [p.min,(p.min+p.max)/2,p.max,before.designPressure]) {
        useProject.getState().patchHeadLive(before.id,{designPressure:bar});
        valid(item,current());
        const after = radiusRange(item,current().nozzleId,bar,current().arc);
        const expected = Math.max(after.min,Math.min(after.max,after.max*before.r/nominal));
        assert.ok(Math.abs(current().r-expected)<1e-8, `${item.id} retains radius reduction`);
      }
      assert.ok(Math.abs(current().r-before.r)<1e-8, `${item.id} returns without accumulated drift`);
      useProject.getState().endHeadEdit();
    }
    reset(mp);
    useProject.getState().updateHead("test-head",{r:9.5,designPressure:2.6});
    assert.equal(current().r,9.5,"an explicitly supplied radius wins over the pressure-derived radius");

    const rotors = placeableCatalog().filter(usesAutomaticNozzle);
    assert.ok(rotors.some(item => item.family === "golf"));
    for (const item of rotors) {
      reset(item);
      const chosenNozzles = new Set();
      const pressure = headParameterRanges(item,current()).pressure;
      for (const bar of [pressure.min,(pressure.min+pressure.max)/2,pressure.max]) {
        useProject.getState().updateHead("test-head",{designPressure:bar});
        assert.ok(Math.abs(current().designPressure-bar)<1e-8);
        valid(item,current());
        const radius = headParameterRanges(item,current()).radius;
        for (const r of [radius.min,radius.max]) {
          useProject.getState().updateHead("test-head",{r});
          valid(item,current());
          assert.ok(Math.abs(current().r-r)<1e-8, `${item.id} reaches the full rack radius range`);
          chosenNozzles.add(current().nozzleId);
        }
        for (const arc of [item.arcMin,item.arcMax]) {
          useProject.getState().updateHead("test-head",{arc});
          assert.equal(current().arc,arc);
          valid(item,current());
        }
      }
      if (item.family === "golf") assert.ok(chosenNozzles.size > 1,`${item.id} switches across its supported pressure/radius ranges`);
    }
    // At a shared feasible radius, a different sector calls for a different flow/nozzle.
    const i20 = itemById("I-20");
    reset(i20);
    useProject.getState().updateHead("test-head",{r:10,arc:180});
    const half = current();
    useProject.getState().updateHead("test-head",{arc:360});
    const full = current();
    assert.equal(full.r,half.r);
    assert.notEqual(full.nozzleId,half.nozzleId,"sector participates in automatic selection");
    assert.ok(Math.abs(headFlow(full).lpm-headFlow(half).lpm*2) < headFlow(half).lpm);

    // Continuous drag uses one reference and one undo entry, even across nozzle boundaries.
    const before = reset(itemById("G-75-B"));
    const bounds = headParameterRanges(itemById(before.catalogId),before).radius;
    useProject.getState().beginHeadEdit();
    for (const r of [bounds.min,(bounds.min+bounds.max)/2,bounds.max]) useProject.getState().patchHeadLive(before.id,{r});
    useProject.getState().endHeadEdit();
    assert.equal(useProject.getState().past.length,1);
    useProject.getState().undo();
    assert.deepEqual(current(),before);

    const { headAtPointer, HEAD_MOUSE_HIT_RADIUS } = await server.ssrLoadModule("/src/lib/head-hit-target.ts");
    const heads = [
      {...catalogHeadDefaults(mp),id:"visible",x:4,y:5,zone:1,locked:false},
      {...catalogHeadDefaults(mp),id:"locked",x:10,y:5,zone:1,locked:true},
      {...catalogHeadDefaults(mp),id:"hidden-zone",x:20,y:5,zone:2,locked:false},
      {...catalogHeadDefaults(mp),id:"locked-zone",x:30,y:5,zone:3,locked:false},
    ];
    const zones = [{id:1,hidden:false,locked:false},{id:2,hidden:true,locked:false},{id:3,hidden:false,locked:true}];
    for (const scale of [5,50,300]) {
      assert.equal(headAtPointer(heads,zones,{x:4+(HEAD_MOUSE_HIT_RADIUS-1)/scale,y:5},scale),"visible");
      assert.equal(headAtPointer(heads,zones,{x:4-(HEAD_MOUSE_HIT_RADIUS+1)/scale,y:5},scale),null);
      for (const head of heads.slice(1)) assert.equal(headAtPointer(heads,zones,head,scale),null);
    }
    assert.equal(headAtPointer([...heads,{...heads[0],id:"nearest",x:4.1}],zones,{x:4.1,y:5},50),"nearest");

    // Footer actions retain the visible library and don't create sprinklers.
    const drawing = addRect(emptyDrawing(),{x:0,y:0},{x:8,y:5},"lawn");
    const faceId = Object.keys(drawing.faces)[0];
    const project = {...emptyProject(),drawing,polygons:toPolygons(drawing)};
    useProject.setState({project,catalogOpen:false,catalogVisible:false,selectedId:null,selectedIds:[]});
    useProject.getState().setCatalogOpen(true);
    useProject.getState().setCatalogVisible(true);
    const actions = [
      () => useProject.getState().setCadMode("select"),
      () => useProject.getState().selectPoly(faceId),
      () => useProject.getState().setCadEdit(faceId),
      () => useProject.getState().setCadEdit(null),
      () => useProject.getState().setDrawSub("text"),
      () => useProject.getState().setDrawSub("dim"),
      () => useProject.getState().setMeasureSub("measure"),
      () => useProject.getState().setGrid(false),
      () => useProject.getState().setCadLayer("dims",{visible:false}),
    ];
    for (const action of actions) {
      action();
      assert.equal(useProject.getState().catalogOpen,true);
      assert.equal(useProject.getState().catalogVisible,true);
      assert.equal(useProject.getState().project.heads.length,0);
    }
    useProject.getState().setTool("draw");
    assert.equal(useProject.getState().catalogOpen,false,"explicit workspace switch still closes irrigation");
  } finally {
    await server.close();
    if (oldStorage) globalThis.localStorage=oldStorage; else delete globalThis.localStorage;
    if (oldWindow) globalThis.window=oldWindow; else delete globalThis.window;
  }
});
