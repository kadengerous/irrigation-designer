import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("Hunter bodies: mounting, actual heights, regulator pressure, persistence and takeoff", async () => {
  const memory = new Map(), oldStorage = globalThis.localStorage, oldWindow = globalThis.window;
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const cat = await server.ssrLoadModule("/src/lib/hunter-catalog.ts");
    const { catalogHeadDefaults, headFlow } = await server.ssrLoadModule("/src/lib/flow.ts");
    const { emptyProject } = await server.ssrLoadModule("/src/lib/project-types.ts");
    const { estimateLines } = await server.ssrLoadModule("/src/lib/export-plan.ts");
    const { checkProject } = await server.ssrLoadModule("/src/lib/check-project.ts");
    globalThis.window = { localStorage: globalThis.localStorage };
    const { updateHeadSettings, migrateProject, useProject } = await server.ssrLoadModule("/src/lib/project-store.ts");
    if (!useProject.persist.hasHydrated()) await new Promise(resolve => { const off = useProject.persist.onFinishHydration(() => { off(); resolve(); }); });
    useProject.getState().setLocale("ru");
    useProject.getState().setUnitPreset("metric");
    const item = id => { const value = cat.itemById(id); assert.ok(value, id); return value; };
    const make = (id, suffix = "") => ({ ...catalogHeadDefaults(item(id)), id: id + suffix, catalogId: id,
      x: 0, y: 0, start: 0, zone: 1, popUpMm: cat.defaultPopUpMm(item(id)), locked: false, needsReview: false });
    const bodies = cat.CATALOG.filter(row => row.type === "body");
    assert.equal(bodies.length, 58);
    assert.equal(new Set(bodies.map(row => row.sku)).size, bodies.length);
    const heights = family => [...new Set(bodies.filter(body => body.bodyFamilyId === family).map(body => body.popUpMm))].sort((a, b) => a - b);
    assert.deepEqual(heights("PS-ULTRA"), [50, 100, 150]);
    assert.deepEqual(heights("PRO-SPRAY"), [0, 50, 75, 100, 150, 300]);
    assert.deepEqual(heights("PRS40"), [0, 75, 100, 150, 300]);
    assert.deepEqual(heights("PRS30"), [0, 75, 100, 150, 300]);

    for (const model of cat.placeableCatalog()) {
      const h = make(model.id), options = cat.bodiesFor(model);
      if (model.type === "rotor" || model.id.startsWith("PCB-") || model.id === "AFB") {
        assert.deepEqual(options, [], `${model.id}: no separate spray body`);
        assert.equal(estimateLines({ ...emptyProject(), heads: [h] }).length, 1, "never charge twice for an integrated body or riser bubbler");
        if (model.type === "rotor") assert.ok(cat.popUpHeights(model).length, `${model.id}: verified pop-up height`);
      } else {
        assert.equal(options.length, 58, `${model.id}: female-thread nozzle compatibility`);
        for (const body of options) {
          const changed = updateHeadSettings(h, { bodyId: body.id });
          assert.equal(changed.bodyId, body.id, `${model.id}/${body.id}`);
          assert.equal(changed.popUpMm, body.popUpMm);
          if (body.regulatedPressureBar != null) assert.equal(changed.designPressure, body.regulatedPressureBar, "exact regulator pressure must not be rounded to a different table row");
          assert.ok(headFlow(changed).lpm > 0, `${model.id}/${body.id}: valid flow after selection`);
        }
      }
    }
    const mp = make("MP1000-90");
    mp.r *= .9;
    const tall = updateHeadSettings(mp, { bodyId: "PROS-06-PRS40" });
    assert.equal(tall.popUpMm, 150);
    assert.equal(tall.r, mp.r, "changing only height keeps the drawn radius");
    assert.equal(cat.recommendedBodyFor(item(mp.catalogId), tall.popUpMm).sku, "PROS-06-PRS40");
    const shortRadius = updateHeadSettings(tall, { bodyId: "PROS-06-PRS30" });
    assert.equal(shortRadius.designPressure, 2.1);
    assert.ok(!checkProject({ ...emptyProject(), heads: [shortRadius] }).some(issue => issue.id === `body-${shortRadius.id}`), "PRS30 on MP is an official option, not an incompatibility");
    const bubbler = updateHeadSettings(make("PCN-25"), { bodyId: "PROS-12-PRS40" });
    assert.equal(bubbler.designPressure, 2.8);
    assert.equal(headFlow(bubbler).lpm, headFlow(make("PCN-25")).lpm, "compensated flow stays constant over Hunter's operating range");
    assert.equal(cat.defaultBodyFor(item("PCN-25")), "PRO-SPRAY");
    assert.deepEqual(cat.popUpHeights(item("I-20-SS")), [100, 150]);
    assert.deepEqual(cat.popUpHeights(item("I-20")), [0, 100, 150, 300]);
    assert.deepEqual(cat.popUpHeights(item("I-90")), [80]);
    const rotor = make("I-20");
    assert.equal(updateHeadSettings(rotor, { bodyId: "PRS40" }).bodyId, "I-20");
    assert.equal(updateHeadSettings(rotor, { popUpMm: 200 }).popUpMm, 100);

    const saved = { ...emptyProject(), heads: [{ ...mp, bodyId: "PRS40", popUpMm: 150 }] };
    const restored = migrateProject(JSON.parse(JSON.stringify(saved)));
    assert.equal(restored.heads[0].bodyId, "PROS-06-PRS40");
    assert.equal(restored.heads[0].popUpMm, 150);
    assert.equal(restored.heads[0].r, mp.r);
    const unsupported = migrateProject({ ...saved, heads: [{ ...mp, bodyId: "PRS40", popUpMm: 200 }] });
    assert.equal(unsupported.heads[0].popUpMm, 200, "keep unverified legacy height for review");
    assert.equal(unsupported.heads[0].needsReview, true);
    assert.equal(updateHeadSettings(unsupported.heads[0], { start: 90 }).needsReview, true, "unrelated edits keep the legacy body warning");
    assert.equal(updateHeadSettings(unsupported.heads[0], { bodyId: "PRS40" }).needsReview, false, "choosing a valid body clears the warning");
    const pcb = migrateProject({ ...emptyProject(), heads: [{ ...make("PCB-25"), bodyId: "PRS30", popUpMm: 100 }] });
    assert.equal(pcb.heads[0].bodyId, "PCB-25");
    assert.equal(pcb.heads[0].popUpMm, 0);

    const lines = estimateLines({ ...emptyProject(), heads: [mp, { ...tall, id: "tall" }, rotor, { ...rotor, id: "rotor-tall", popUpMm: 300 }] });
    assert.equal(lines.filter(line => line.name.startsWith("Корпус")).length, 2, "body heights have separate quantities");
    assert.ok(lines.some(line => line.name.includes("I-20-12") && line.name.includes("30 см")));
    useProject.setState({ project: { ...emptyProject(), heads: [mp] }, past: [], future: [] });
    useProject.getState().updateHead(mp.id, { bodyId: "PROS-12-PRS30" });
    const current = useProject.getState().project.heads[0];
    assert.equal(current.popUpMm, 300);
    assert.equal(current.designPressure, 2.1);
    useProject.getState().undo();
    assert.equal(useProject.getState().project.heads[0].bodyId, mp.bodyId);
  } finally {
    await server.close();
    if (oldStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = oldStorage;
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});
