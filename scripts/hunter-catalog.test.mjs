import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("Hunter: verified catalog, every model placement, flow, pressure and geometry", async () => {
  const memory = new Map();
  const oldStorage = globalThis.localStorage;
  const oldWindow = globalThis.window;
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key,value), removeItem: key => memory.delete(key) };
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { placeableCatalog, itemById, defaultNozzle, stripAtPressure } = await server.ssrLoadModule("/src/lib/hunter-catalog.ts");
    const { catalogHeadDefaults, performanceAt, pressureRange, radiusRange, headFlow, runTimeMin } = await server.ssrLoadModule("/src/lib/flow.ts");
    const { sliderRange } = await server.ssrLoadModule("/src/lib/slider-range.ts");
    globalThis.window = { localStorage: globalThis.localStorage };
    const { useProject, migrateProject } = await server.ssrLoadModule("/src/lib/project-store.ts");
    const { emptyProject } = await server.ssrLoadModule("/src/lib/project-types.ts");
    const { addRect } = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const { headCovers } = await server.ssrLoadModule("/src/lib/coverage.ts");
    const { zoneFlow, recommendPump, headWorkingBar, distributeZones } = await server.ssrLoadModule("/src/lib/hydro.ts");
    const { projectToSvg } = await server.ssrLoadModule("/src/lib/export-plan.ts");
    const catalog = placeableCatalog();
    assert.equal(catalog.length, 104);
    assert.ok(catalog.every((item, i) => !i || catalog[i-1].rMax >= item.rMax), "library order: largest range first");
    const unknown = [];
    for (const item of catalog) {
      assert.match(item.sourceUrl, /^https:\/\/www\.hunterirrigation\.com\//, item.id);
      assert.equal(item.verifiedOn, "2026-09-18", item.id);
      const defaults = catalogHeadDefaults(item);
      const flow = headFlow({ catalogId: item.id, ...defaults });
      if (flow.lpm == null) unknown.push(item.id);
      else {
        assert.ok(flow.lpm > 0 && Number.isFinite(flow.lpm), item.id);
        assert.ok(Math.abs(flow.m3h - flow.lpm * .06) < 1e-9, item.id);
      }
      for (const nozzle of item.nozzles) for (const row of nozzle.performance) {
        for (const field of ["radiusM", "pressureBar", "flowLMin", "flowM3H"]) assert.ok(Number.isFinite(row[field]) && row[field] >= 0, `${item.id}/${nozzle.id}/${field}`);
        assert.ok(Math.abs(row.flowM3H - row.flowLMin * .06) < .005, `${item.id} units`);
      }
      for (const withSite of [false, true]) {
        const project = emptyProject();
        if (withSite) {
          project.drawing = addRect(emptyDrawing(), { x: 0, y: 0 }, { x: 3, y: 3 }, "lawn");
          project.polygons = [{ id: "lawn", kind: "lawn", type: "poly", closed: true, points: [{x:0,y:0},{x:3,y:0},{x:3,y:3},{x:0,y:3}] }];
        }
        useProject.setState({ project, activeZoneId: 1, snapOn: false, snapGridOn: false, tool: "place", history: [], future: [] });
        useProject.getState().setPlaceId(item.id);
        useProject.getState().placeHead({ x: 0, y: 0 }, item.id);
        const placed = useProject.getState().project.heads;
        assert.equal(placed.length, 1, `${item.id} places`);
        const h = placed[0];
        assert.equal(h.catalogId, item.id, `${item.id} must not silently change model`);
        assert.equal(h.nozzleId, defaults.nozzleId);
        assert.ok(h.arc >= item.arcMin && h.arc <= item.arcMax, `${item.id} arc`);
        assert.ok(h.r >= 0 && Number.isFinite(h.r), `${item.id} radius`);
        useProject.getState().finishMoveHead(h.id, {x:20,y:30});
        const moved = useProject.getState().project.heads[0];
        assert.deepEqual(moved, {...h,x:20,y:30}, `${item.id} move preserves specification`);
        if (!withSite) for (const nozzle of item.nozzles) {
          const row = performanceAt(item,nozzle.id,nozzle.recommendedBar,defaults.arc)?.row;
          if (!row) continue;
          useProject.getState().updateHead(h.id,{nozzleId:nozzle.id,designPressure:nozzle.recommendedBar,arc:defaults.arc});
          const updated = useProject.getState().project.heads[0];
          assert.equal(updated.catalogId,item.id, `${item.id} nozzle edit preserves model`);
          assert.equal(updated.r,row.radiusM,`${item.id}/${nozzle.id} nozzle radius`);
          assert.ok(Math.abs(headFlow(updated).lpm-row.flowLMin)<1e-5,`${item.id}/${nozzle.id} nozzle flow`);
          const pressure = pressureRange(item, nozzle.id, defaults.arc);
          assert.ok(pressure && pressure.min <= pressure.max, `${item.id}/${nozzle.id} pressure bounds`);
          for (const [requested, expected] of [[-1, pressure.min], [100, pressure.max]]) {
            useProject.getState().updateHead(h.id, { nozzleId: nozzle.id, designPressure: requested });
            const bounded = useProject.getState().project.heads[0];
            assert.equal(bounded.designPressure, expected, `${item.id}/${nozzle.id} pressure clamped`);
            assert.ok(headFlow(bounded).lpm > 0, `${item.id}/${nozzle.id} supported endpoint flow`);
            const radius = radiusRange(item, nozzle.id, expected, defaults.arc);
            if (!radius) continue;
            const slider = sliderRange(radius.min, radius.max, .05, radius.max);
            if (radius.max > radius.min) assert.equal(slider.tick, slider.ticks, `${item.id}/${nozzle.id} thumb reaches end`);
            assert.equal(slider.fromTick(slider.ticks), radius.max, `${item.id}/${nozzle.id} exact maximum`);
            assert.equal(slider.fromTick(0), radius.min, `${item.id}/${nozzle.id} exact minimum`);
            useProject.getState().beginHeadEdit();
            for (const r of [slider.fromTick(0), slider.fromTick(slider.ticks)]) {
              useProject.getState().patchHeadLive(h.id, { r });
              const adjusted = useProject.getState().project.heads[0];
              assert.ok(Math.abs(adjusted.r - r) < 1e-9, `${item.id}/${nozzle.id} radius preserved at bound`);
              assert.ok(headFlow(adjusted).lpm > 0, `${item.id}/${nozzle.id} valid reduced flow`);
            }
            useProject.getState().endHeadEdit();
          }
        }
      }
    }
    assert.deepEqual(unknown, ["AFB"], "variable AFB flow must stay unknown");
    const pgj = itemById("PGJ"), i20 = itemById("I-20");
    assert.equal(defaultNozzle(pgj).trajectoryDeg, 14);
    assert.equal(i20.nozzles.length, 8);
    assert.ok(i20.nozzles.every(n => n.colorName === "синий"));
    assert.notDeepEqual(itemById("G-75-B").nozzles, itemById("G-70-B").nozzles);
    assert.notDeepEqual(itemById("G-85-B").nozzles, itemById("G-80-B").nozzles);
    assert.equal(itemById("MSBN-25Q").rNom, .3048);
    assert.equal(itemById("4Q").colorName, "светло-зелёный");
    const rotor = {id:"rotor",catalogId:i20.id,...catalogHeadDefaults(i20),x:0,y:0,start:0,zone:1};
    const half = headFlow({...rotor,arc:180}), quarter = headFlow({...rotor,arc:90}), full = headFlow({...rotor,arc:360});
    assert.equal(half.lpm,quarter.lpm);
    assert.equal(half.lpm,full.lpm);
    assert.equal(quarter.precipMmHr,half.precipMmHr*2);
    assert.equal(full.precipMmHr,half.precipMmHr/2);
    assert.equal(runTimeMin(10,half.precipMmHr),runTimeMin(5,half.precipMmHr)*2);
    const lowPressure = performanceAt(i20,rotor.nozzleId,2.4,180).row;
    const low = headFlow({...rotor,designPressure:2.4,r:lowPressure.radiusM});
    assert.notEqual(low.lpm,half.lpm);
    assert.equal(headWorkingBar({...rotor,designPressure:2.1}),2.1);
    assert.equal(headFlow({...rotor,designPressure:100}).lpm,null);
    assert.equal(headFlow({...rotor,nozzleId:"old-invalid"}).lpm,null);
    assert.equal(pressureRange(i20,"old-invalid",180),null);
    assert.equal(radiusRange(i20,"old-invalid",2.8,180),null);
    const legacy = migrateProject({...emptyProject(),heads:[{...rotor,nozzleId:"old-invalid"}]});
    assert.equal(legacy.heads[0].needsReview,true);
    assert.equal(zoneFlow(legacy.heads,1),null);
    assert.equal(recommendPump(legacy),null);
    const distribution = distributeZones([rotor,{...legacy.heads[0],id:"unknown"}],50);
    assert.notEqual(distribution.heads[0].zone,distribution.heads[1].zone);
    const stripItem=itemById("SS-530"), strip={...rotor,catalogId:stripItem.id,...catalogHeadDefaults(stripItem)};
    const shape=stripAtPressure(stripItem,strip.designPressure);
    assert.ok(headCovers(strip,{x:shape.l*.4,y:shape.w*.5}));
    assert.equal(headCovers(strip,{x:0,y:-2}),false,"strip is not a circle");
    assert.ok(stripAtPressure(stripItem,1.4).l < shape.l);
    const svg=projectToSvg({...emptyProject(),heads:[strip]});
    assert.ok(!svg.includes("NaN"));
    const point={...rotor,catalogId:"PCB-25",...catalogHeadDefaults(itemById("PCB-25"))};
    assert.equal(headCovers(point,{x:0,y:0}),false,"unknown flood radius is not a coverage claim");
    assert.equal(headFlow(point).precipMmHr,null);
    const merged=useProject.persist.getOptions().merge({showGrid:false},useProject.getState());
    assert.equal(merged.showGrid,true,"grid is enabled on every app entry");
  } finally { await server.close(); if (oldStorage) globalThis.localStorage = oldStorage; else delete globalThis.localStorage; if (oldWindow) globalThis.window = oldWindow; else delete globalThis.window; }
});
