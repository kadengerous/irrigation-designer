import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("zone and equipment layers preserve engineering data, inheritance and all twenty locales", async t => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const load = path => server.ssrLoadModule(path);
    const { useProject: store, migrateProject } = await load("/src/lib/project-store.ts");
    const { emptyProject, zoneColor } = await load("/src/lib/project-types.ts");
    const { itemById } = await load("/src/lib/hunter-catalog.ts");
    const { catalogHeadDefaults } = await load("/src/lib/flow.ts");
    const { zoneFlow, zonePressure, recommendPump } = await load("/src/lib/hydro.ts");
    const { visibleProjectHeads, headPaintOrder } = await load("/src/lib/head-visibility.ts");
    const { headAtPointer } = await load("/src/lib/head-hit-target.ts");
    const { projectToSvg, projectToDxf, estimateLines } = await load("/src/lib/export-plan.ts");
    const { toProjectFile, parseProjectFile } = await load("/src/lib/project-file.ts");
    const makeHead = (id, zone, x) => ({ ...catalogHeadDefaults(itemById("I-20")), id, catalogId: "I-20", zone, x, y: 12, start: 20, locked: false });
    const project = { ...emptyProject(), heads: [makeHead("a", 1, 10), makeHead("b", 1, 30), makeHead("c", 2, 50)], zones: [
      { id: 1, name: "Газон перед домом", nameKind: "custom", hidden: false, locked: false },
      { id: 2, name: "", nameKind: "generated", hidden: false, locked: false },
    ] };
    const reset = () => store.setState({ project, workspaceSection: "irrigation", selectedId: null, selectedIds: [],
      selectedPolyId: null, selectedPolyIds: [], selectedEdgeId: null, sectorEditId: null, activeZoneId: 1,
      past: [], future: [], pastOps: [], futureOps: [], locale: "ru", zoneFocus: null });
    const engineering = p => ({ heads: p.heads.map(({ hidden, locked, ...head }) => head),
      q: zoneFlow(p.heads, 1), pressure: zonePressure(p.heads, 1), pump: recommendPump(p), estimate: estimateLines(p) });

    await t.test("zone head focus temporarily paints the entire head above overlapping sectors", () => {
      const heads = [makeHead("large", 1, 10), makeHead("small", 1, 10), makeHead("medium", 2, 10)];
      heads[0].r = 15; heads[1].r = 3; heads[2].r = 8;
      const before = structuredClone(heads);
      const ids = value => value.map(h => h.id);
      assert.deepEqual(ids(headPaintOrder(heads, [])), ["large", "medium", "small"]);
      assert.deepEqual(ids(headPaintOrder(heads, ["small"], "large")), ["medium", "small", "large"]);
      assert.deepEqual(ids(headPaintOrder(heads, [], "medium")), ["large", "small", "medium"]);
      assert.deepEqual(ids(headPaintOrder(heads, [], null)), ["large", "medium", "small"]);
      assert.deepEqual(heads, before);
    });

    await t.test("remaining zones are numbered from one after deletion and reopening", async () => {
      const { redistributeZonesAfterRemoval } = await load("/src/lib/hydro.ts");
      const p = { ...project, heads: [makeHead("last", 3, 10)], zones: [1, 2, 3].map(id =>
        ({ id, name: "", nameKind: "generated", hidden: false, locked: false })) };
      const compact = redistributeZonesAfterRemoval(p);
      assert.deepEqual(compact.zones.map(z => z.id), [1]);
      assert.equal(compact.heads[0].zone, 1);
      assert.equal(compact.heads[0].r, p.heads[0].r);
      const legacy = migrateProject({ ...p, zones: [p.zones[2]] });
      assert.equal(legacy.zones[0].id, 1);
      assert.equal(legacy.heads[0].zone, 1);
      const custom = redistributeZonesAfterRemoval({ ...p, zones: p.zones.map(z => z.id === 3
        ? { ...z, name: "Газон перед домом", nameKind: "custom" } : z) });
      assert.equal(custom.zones[0].name, "Газон перед домом");
      reset(); store.setState({ project: p, activeZoneId: 3 });
      store.getState().removeZone(1); store.getState().removeZone(1);
      assert.equal(store.getState().project.zones[0].id, 1);
      assert.equal(store.getState().project.heads[0].zone, 1);
      store.getState().undo();
      assert.equal(store.getState().project.zones.length, 2);
      assert.equal(store.getState().project.heads[0].zone, 2);
    });

    await t.test("global simulation is transient and zone focus replaces it without changing coverage preferences", () => {
      reset(); store.setState({ simulationProjectId: null, showCoverage: true });
      const before = store.getState().project;
      store.getState().toggleSimulation();
      assert.equal(store.getState().simulationProjectId, project.id);
      assert.equal(store.getState().zoneFocus, null);
      assert.equal(store.getState().showCoverage, true);
      assert.equal(store.getState().project, before);
      assert.equal(store.getState().past.length, 0);
      store.getState().toggleSimulation();
      assert.equal(store.getState().simulationProjectId, null);
      store.setState({ showCoverage: false });
      store.getState().toggleSimulation();
      store.getState().focusZone(1);
      assert.equal(store.getState().simulationProjectId, null);
      assert.equal(store.getState().zoneFocus.headId, null);
      store.getState().focusZone(1, "b");
      assert.equal(store.getState().zoneFocus.headId, "b");
      assert.equal(store.getState().showCoverage, false);
      store.setState({ workspaceSection: "plan" });
      store.getState().toggleSimulation();
      assert.equal(store.getState().simulationProjectId, null);
    });

    await t.test("individual hiding removes hits and exported geometry while retaining quantities and undo", () => {
      reset();
      const before = engineering(project);
      store.getState().setSectorEdit("a");
      store.getState().setHeadFlag("a", { hidden: true });
      const hidden = store.getState().project;
      assert.deepEqual(visibleProjectHeads(hidden).map(h => h.id), ["b", "c"]);
      assert.equal(headAtPointer(hidden.heads, hidden.zones, { x: 10, y: 12 }, 40), null);
      assert.equal(headAtPointer(hidden.heads, hidden.zones, { x: 30, y: 12 }, 40), "b");
      assert.equal(store.getState().selectedId, null);
      assert.equal(store.getState().sectorEditId, null);
      assert.equal(store.getState().rightMode, "zone");
      assert.deepEqual(engineering(hidden), before);
      assert.doesNotMatch(projectToSvg(hidden), /<circle cx="10" cy="12"/);
      assert.match(projectToSvg(hidden), /<circle cx="30" cy="12"/);
      assert.equal((projectToDxf(hidden).match(/\nHEAD\n/g) ?? []).length, 2);
      assert.equal(store.getState().past.length, 1);
      store.getState().undo();
      assert.deepEqual(store.getState().project.heads, project.heads);
      store.getState().redo();
      const file = toProjectFile({ project: store.getState().project, activeZoneId: 1 });
      const reopened = migrateProject(parseProjectFile(JSON.stringify(file)).project);
      assert.equal(reopened.heads[0].hidden, true);
      assert.equal(reopened.heads[1].hidden, undefined, "older head records remain compatible");
      assert.deepEqual(visibleProjectHeads(reopened).map(h => h.id), ["b", "c"]);
      store.getState().toggleZoneHidden(1);
      assert.deepEqual(visibleProjectHeads(store.getState().project).map(h => h.id), ["c"]);
      store.getState().toggleZoneHidden(1);
      assert.deepEqual(visibleProjectHeads(store.getState().project).map(h => h.id), ["b", "c"], "showing a zone retains each head's own visibility");
      store.getState().setHeadFlag("a", { hidden: false });
      assert.equal(visibleProjectHeads(store.getState().project).length, 3);
      assert.deepEqual(engineering(store.getState().project), before);
    });

    await t.test("head and zone locks prevent edits and deletion without losing independent flags", () => {
      reset();
      store.getState().setSectorEdit("a");
      store.getState().setHeadFlag("a", { locked: true });
      assert.equal(store.getState().sectorEditId, null);
      const locked = store.getState().project;
      store.getState().updateHead("a", { r: 2 });
      store.getState().moveHead("a", { x: 99, y: 99 });
      store.getState().finishMoveHead("a", { x: 99, y: 99 });
      store.getState().patchHeadLive("a", { arc: 90 });
      store.getState().removeHead("a");
      assert.equal(store.getState().project, locked);
      store.getState().toggleZoneLocked(1);
      const lockedZone = store.getState().project;
      store.getState().setHeadFlag("a", { locked: false });
      store.getState().updateHead("b", { r: 2 });
      store.getState().moveHead("b", { x: 99, y: 99 });
      store.getState().patchHeadLive("b", { arc: 90 });
      store.getState().removeHead("b");
      store.getState().removeZone(1, 2);
      assert.equal(store.getState().project, lockedZone, "child actions cannot bypass the zone lock");
      store.getState().toggleZoneHidden(1);
      assert.equal(store.getState().project.zones[0].hidden, true, "visibility remains available while locked");
      store.getState().toggleZoneHidden(1);
      store.getState().toggleZoneLocked(1);
      assert.equal(store.getState().project.heads[0].locked, true);
      assert.equal(store.getState().project.heads[1].locked, false);
      store.getState().setHeadFlag("a", { locked: false });
      store.getState().removeHead("a");
      assert.ok(!store.getState().project.heads.some(h => h.id === "a"));
      store.getState().undo();
      assert.ok(store.getState().project.heads.some(h => h.id === "a"));
    });

    await t.test("focus is transient and transfer changes only membership with undo and lock protection", () => {
      reset();
      store.getState().focusZone(1);
      assert.deepEqual(store.getState().zoneFocus, { projectId: project.id, zoneId: 1, headId: null });
      assert.equal(store.getState().project, project);
      store.getState().focusZone(1, "a");
      assert.equal(store.getState().zoneFocus.headId, "a");
      assert.equal(store.getState().selectedId, null);
      assert.equal(store.getState().rightMode, "zone");
      store.getState().transferHeadToZone("a", 2);
      const moved = store.getState().project;
      assert.deepEqual(moved.heads, project.heads.map(h => h.id === "a" ? { ...h, zone: 2, zoneAssignment:'manual' } : h));
      assert.deepEqual(moved.zones, project.zones);
      assert.equal(store.getState().past.length, 1);
      assert.deepEqual(store.getState().zoneFocus, { projectId: project.id, zoneId: 2, headId: "a" });
      assert.equal(zoneFlow(moved.heads, 1), zoneFlow([project.heads[1]], 1));
      assert.equal(zoneFlow(moved.heads, 2), zoneFlow([project.heads[0], project.heads[2]].map(h => ({ ...h, zone: 2 })), 2));
      store.getState().undo();
      assert.deepEqual(store.getState().project.heads, project.heads);
      store.getState().redo();
      assert.deepEqual(store.getState().project.heads, moved.heads);
      store.getState().selectHead("a");
      assert.equal(store.getState().zoneFocus, null);
      for (const mode of ["head", "source", "destination", "missing"]) {
        reset();
        if (mode === "head") store.getState().setHeadFlag("a", { locked: true });
        if (mode === "source") store.getState().toggleZoneLocked(1);
        if (mode === "destination") store.getState().toggleZoneLocked(2);
        const before = store.getState().project;
        store.getState().transferHeadToZone("a", mode === "missing" ? 99 : 2);
        assert.equal(store.getState().project, before, mode);
      }
    });

    await t.test("micro spray fills stream gaps without exceeding the current radius or sector", async () => {
      const { wateringMicroDrop } = await load("/src/lib/watering-preview.ts");
      const head = {...project.heads[0], start:310, arc:90, r:4};
      const profile = {kind:"multi", reaches:[1]};
      const before = structuredClone(head);
      let count = 0;
      for (const time of [0, 1, 4, 8]) for (let i = 0; i < 720; i++) {
        const drop = wateringMicroDrop(head,time,i,profile);
        if (!drop) continue;
        count++;
        assert.ok(Math.hypot(drop.x,drop.y) <= head.r + 1e-9);
        const offset = ((Math.atan2(drop.y,drop.x)*180/Math.PI-head.start)%360+360)%360;
        assert.ok(offset <= head.arc+1e-7 || offset >= 360-1e-7);
      }
      assert.ok(count > 100);
      assert.deepEqual(head,before);
      assert.equal(wateringMicroDrop(head,1,0,{kind:"flood",reaches:[1]}),null);
    });

    await t.test("watering preview is exclusive, stays inside sector/radius and never edits the project", async () => {
      reset();
      const { wateringHeads, wateringAngle, wateringDrop } = await load("/src/lib/watering-preview.ts");
      const members = project.heads.filter(h => h.zone === 1);
      store.getState().focusZone(1);
      assert.deepEqual(wateringHeads(members, store.getState().zoneFocus.headId).map(h => h.id), ["a", "b"]);
      store.getState().focusZone(1, "a");
      assert.deepEqual(wateringHeads(members, store.getState().zoneFocus.headId).map(h => h.id), ["a"]);
      store.getState().focusZone(1, "b");
      assert.deepEqual(wateringHeads(members, store.getState().zoneFocus.headId).map(h => h.id), ["b"]);
      assert.deepEqual(wateringHeads(members, "missing"), []);
      store.getState().focusZone(1);
      assert.equal(wateringHeads(members, store.getState().zoneFocus.headId).length, 2);
      for (const arc of [45, 90, 180, 270, 360]) {
        const head = { ...project.heads[0], start: 310, arc, r: 7.5 };
        for (let time = 0; time < 16; time += .125) {
          const angle = wateringAngle(head.start, arc, time);
          assert.ok(angle >= head.start && angle <= head.start + arc);
          for (let i = 0; i < 32; i++) {
            const drop = wateringDrop(head, time, i);
            assert.ok(Math.hypot(drop.x, drop.y) <= head.r + 1e-9);
            const degrees = drop.angle * 180 / Math.PI;
            assert.ok(degrees >= head.start - 1e-9 && degrees <= head.start + arc + 1e-9);
          }
        }
      }
      assert.equal(wateringAngle(20, 90, 0), 20);
      assert.equal(wateringAngle(20, 90, 18.75), 110);
      assert.equal(wateringAngle(20, 90, 37.5), 20);
      assert.equal(store.getState().project, project);
      assert.equal(store.getState().past.length, 0);
    });

    await t.test("Hunter profiles distinguish stationary sprays, rotating streams, strips and bubblers", async () => {
      const { wateringProfile, wateringDrop, wateringParticleCount } = await load("/src/lib/watering-preview.ts");
      const expected = { "MP2000-90": "multi", "MP800SR-90": "multi", "MP-LCS-515": "strip-multi",
        "SS-530": "strip-fan", "4A": "fan", "8A-HE": "fan", "5Q": "fan", "2Q": "fan", "I-20": "rotor",
        "I-40-ON": "opposed", "I-80-ON": "opposed", "G-80-B": "opposed", "G-85-B": "rotor",
        "MSBN-25Q": "streams", "MSBN-25V": "dual", "5-CST-B": "dual", "PCB-25": "flood", "AFB": "unknown", "S-8A": "unknown" };
      // AFB has no published fixed flow/throw, so the audited preview remains unknown.
      for (const [id, kind] of Object.entries(expected)) {
        const head = { ...catalogHeadDefaults(itemById(id)), id, catalogId: id, x: 0, y: 0, zone: 1, start: 37, locked: false };
        const profile = wateringProfile(head);
        assert.equal(profile.kind, kind, id);
        for (const seconds of [0, .75, 3, 8, 13]) {
          for (let i = 0; i < wateringParticleCount(profile); i++) {
            const drop = wateringDrop(head, seconds, i, profile);
            if (!drop) continue;
            assert.ok(Number.isFinite(drop.x) && Number.isFinite(drop.y), id);
            if (profile.strip) {
              const a = head.start * Math.PI / 180;
              const x = drop.x * Math.cos(a) + drop.y * Math.sin(a), y = -drop.x * Math.sin(a) + drop.y * Math.cos(a);
              const s = profile.strip;
              assert.ok(x >= s.ox - 1e-8 && x <= s.ox + s.l + 1e-8 && y >= s.oy - 1e-8 && y <= s.oy + s.w + 1e-8, id);
            } else assert.ok(Math.hypot(drop.x, drop.y) <= head.r + 1e-8, id);
          }
        }
        if (["fan", "streams", "dual"].includes(kind)) {
          assert.equal(wateringDrop(head, 1, 3, profile).angle, wateringDrop(head, 5, 3, profile).angle, "fixed nozzles do not rotate");
        }
      }
      const head = { ...project.heads[0], ...catalogHeadDefaults(itemById("MP2000-90")), catalogId: "MP2000-90", arc: 180 };
      const profile = wateringProfile(head);
      const angles = new Set(Array.from({ length: 240 }, (_, i) => wateringDrop(head, 3, i, profile)).filter(Boolean).map(p => Math.round(p.angle * 10)));
      assert.ok(angles.size > 4, "MP streams occupy multiple directions simultaneously");
    });

    await t.test("droplet colors mix within every stream instead of forming colored lanes", async () => {
      const { wateringDropTone } = await load("/src/lib/watering-preview.ts");
      for (const stride of [3, 8, 12, 48]) {
        for (let lane = 0; lane < stride; lane++) {
          const colors = new Set(Array.from({ length: 24 }, (_, radial) => wateringDropTone(lane + radial * stride)));
          assert.equal(colors.size, 3, `lane ${lane}, stride ${stride} contains all three shades`);
        }
      }
    });

    await t.test("spray density is uniform and jets follow the current radius", async () => {
      const { wateringDrop, wateringJets, wateringProfile, wateringParticleCount } = await load("/src/lib/watering-preview.ts");
      const head = { ...project.heads[0], ...catalogHeadDefaults(itemById("4A")), catalogId: "4A", arc: 180, start: 37 };
      const profile = wateringProfile(head);
      for (const time of [0, .3, 1, 7.9]) {
        const cells = new Set();
        for (let i = 0; i < wateringParticleCount(profile); i++) {
          const p = wateringDrop(head, time, i, profile);
          const angular = Math.floor(((p.angle * 180 / Math.PI - head.start) / head.arc) * 48);
          const radial = Math.min(11, Math.floor((Math.hypot(p.x, p.y) / head.r) ** 2 * 12 + 1e-9));
          cells.add(`${angular}:${radial}`);
        }
        assert.equal(cells.size, 576, "every angular/equal-area radial cell receives a droplet");
        const outer = Array.from({ length: wateringParticleCount(profile) }, (_, i) => wateringDrop(head, time, i, profile))
          .filter(p => Math.hypot(p.x, p.y) >= head.r * .99 - 1e-9);
        assert.ok(outer.length >= 48, "the last one percent of throw stays populated throughout animation");
      }
      for (const catalogId of ["I-20", "G-80-B", "G-85-B"]) {
        const validRotor = { ...head, ...catalogHeadDefaults(itemById(catalogId)), catalogId, arc: 360 };
        const rotorProfile = wateringProfile(validRotor);
        assert.ok(["rotor", "opposed"].includes(rotorProfile.kind), catalogId);
        // Isolate low-level drawing scale from the catalog's operating-radius limits.
        for (const r of [.5, 5, 30]) {
          const rotor = { ...validRotor, r };
          const jets = wateringJets(rotor, 3, rotorProfile);
          assert.equal(jets[0].reach, r);
          assert.ok(jets.every(j => j.reach <= r && Number.isFinite(j.angle)));
        }
      }
    });

    await t.test("expanded zones own their heads; collapsed zones and Layers stay compact in every locale", async () => {
      reset();
      const { ZoneLayerRow } = await load("/src/components/designer/zone-list.tsx");
      const { LayerList } = await load("/src/components/designer/mobile-workspace.tsx");
      const { IrrigationLayerActions } = await load("/src/components/designer/irrigation-layer-row.tsx");
      const { LOCALES } = await load("/src/lib/locale-config.ts");
      const { tr, setActiveLocale, formatNumber } = await load("/src/lib/i18n.ts");
      const escape = value => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      const render = (component, props, dir) => renderToStaticMarkup(createElement("div", { className: "app-shell", dir }, createElement(component, props)));
      const selection = { selectedId: null, selectedPolyId: null, selectedEdgeId: null, cadEditId: null };
      for (const { id: locale, dir } of LOCALES) {
        setActiveLocale(locale);
        store.getState().setLocale(locale);
        const units = store.getState().units;
        const props = { project, zone: project.zones[0], open: true, active: true, selectedIds: [], units, locale, onToggle() {}, onDelete() {} };
        const markup = render(ZoneLayerRow, props, dir);
        assert.match(markup, /class="mobile-layer irrigation-layer-row"[^>]*data-layer-key="zone:1"/);
        assert.match(markup, /data-layer-key="head:a"/);
        assert.match(markup, /data-layer-key="head:b"/);
        assert.doesNotMatch(markup, /data-layer-key="head:c"/);
        assert.ok(markup.includes("Газон перед домом"), locale);
        assert.ok(markup.includes(escape(tr(locale, "zoneHeadCount", { n: formatNumber(2, 0) }))), locale);
        assert.match(markup, /<bdi dir="ltr">I-20/);
        const collapsed = render(ZoneLayerRow, { ...props, open: false }, dir);
        assert.match(collapsed, /class="irrigation-layer-name"[^>]*aria-pressed="true"/);
        assert.doesNotMatch(collapsed, /class="irrigation-layer-name"[^>]*aria-expanded/);
        assert.match(collapsed, /class="mobile-icon-button irrigation-layer-toggle"[^>]*aria-expanded="false"/);
        assert.ok(markup.includes(`class="head-nozzle-icon" style="color:${zoneColor(project.heads[0].zone)}"`));
        assert.ok(!markup.includes("--head-card-color"));
        assert.doesNotMatch(collapsed, /data-layer-key="head:|class="zone-demand"|class="irrigation-layer-actions"/);
        assert.match(markup, /class="zone-head-grip"/);
        for (const view of [{ selectedFirst: false }, { selectedFirst: true }, { selectedFirst: false, manager: true }]) {
          const layers = render(LayerList, { project, selection, units, locale, onEdit() {}, ...view }, dir);
          assert.equal((layers.match(/data-layer-key="head:/g) ?? []).length, 0, `${locale}: ${JSON.stringify(view)}`);
        }
        const actions = render(IrrigationLayerActions, { name: "I-20", hidden: true, locked: true, inheritedLocked: true,
          onVisibility() {}, onLock() {}, onDelete() {}, onEdit() {}, locale }, dir);
        assert.ok(actions.includes(escape(tr(locale, "show"))));
        assert.match(actions, /data-hidden="true"/);
        assert.match(actions, /class="mobile-icon-button layer-lock"[^>]*aria-pressed="true"[^>]*disabled/);
        assert.match(actions, /class="mobile-icon-button layer-delete-direct"[^>]*disabled/);
        assert.deepEqual(store.getState().project, project, `${locale}: switching language preserves project data`);
      }
    });
  } finally { await server.close(); }
});
