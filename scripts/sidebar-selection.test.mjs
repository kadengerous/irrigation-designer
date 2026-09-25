import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("sprinkler inspection returns to zones or layers and respects explicit tab choices", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { useProject } = await server.ssrLoadModule("/src/lib/project-store.ts");
    const { emptyProject } = await server.ssrLoadModule("/src/lib/project-types.ts");
    const { itemById } = await server.ssrLoadModule("/src/lib/hunter-catalog.ts");
    const { catalogHeadDefaults } = await server.ssrLoadModule("/src/lib/flow.ts");
    const { DesignerApp } = await server.ssrLoadModule("/src/components/designer/designer-app.tsx");
    const project = { ...emptyProject(), heads: ["a", "b"].map(id => ({
      ...catalogHeadDefaults(itemById("I-20")), id, catalogId: "I-20", zone: 1, x: 10, y: 15, start: 20, locked: false,
    })) };
    useProject.setState({ project, workspaceSection: "irrigation", rightOpen: false, rightMode: "drawing",
      selectedId: null, selectedIds: [], selectedPolyId: null, selectedPolyIds: [], past: [], future: [], locale: "ru", showCoverage: true, showLabels: true });

    useProject.getState().selectHead("a");
    assert.equal(useProject.getState().rightOpen, true);
    assert.equal(useProject.getState().rightMode, "object");
    useProject.getState().setRightMode("zone");
    assert.equal(useProject.getState().selectedId, "a", "changing tabs preserves the selected head");
    assert.equal(useProject.getState().rightMode, "zone");

    const render = () => {
      Object.assign(useProject.getInitialState(), useProject.getState());
      return renderToStaticMarkup(createElement(DesignerApp));
    };
    const zonesMarkup = render();
    const tabs = zonesMarkup.match(/<div class="info-panel-tabs[^>]*>([\s\S]*?)<\/div>/)?.[1];
    assert.ok(tabs);
    assert.equal((tabs.match(/<button/g) ?? []).length, 2);
    assert.match(tabs, />Слои<\/button>/);
    assert.match(tabs, />Зоны<\/button>/);
    assert.doesNotMatch(tabs, /Смета|Чертёж|Чертеж/);
    assert.match(zonesMarkup, /aria-label="Смета"[^>]*aria-haspopup="dialog"/);
    assert.doesNotMatch(zonesMarkup, /class="head-card-actions"/);
    assert.match(zonesMarkup, /aria-label="Скрыть сектора"/);
    assert.match(zonesMarkup, /aria-label="Скрыть подписи"/);
    assert.doesNotMatch(zonesMarkup, /onClick=autoPlace|>Расставить автоматически</);
    useProject.getState().setCoverage(false);
    useProject.getState().setLabels(false);
    const hiddenMarkup = render();
    assert.match(hiddenMarkup, /aria-label="Показать сектора" aria-pressed="true"/);
    assert.match(hiddenMarkup, /aria-label="Показать подписи" aria-pressed="true"/);
    useProject.getState().setCoverage(true);
    useProject.getState().setLabels(true);

    useProject.getState().selectHead("a");
    assert.equal(useProject.getState().rightMode, "object", "tapping the same head restores its inspector");
    assert.match(render(), /class="head-card-actions"/);
    useProject.getState().selectHead(null);
    useProject.getState().selectPoly(null); // Canvas background click clears both selections.
    assert.equal(useProject.getState().rightMode, "zone");
    assert.equal(useProject.getState().rightOpen, true);
    assert.doesNotMatch(render(), /class="head-card-actions"/);

    useProject.getState().selectHeads(["a", "b"]);
    assert.equal(useProject.getState().rightMode, "zone");
    useProject.getState().selectHeads(["b"]);
    assert.equal(useProject.getState().rightMode, "object");
    useProject.getState().selectHeads([]);
    assert.equal(useProject.getState().rightMode, "zone");

    useProject.setState({ workspaceSection: "plan" });
    useProject.getState().selectHead("b");
    useProject.getState().selectPoly(null);
    assert.equal(useProject.getState().rightMode, "drawing");
    assert.equal(useProject.getState().project, project, "view changes never alter project data");
    assert.equal(useProject.getState().past.length, 0);

    useProject.setState({ workspaceSection: "irrigation" });
    useProject.getState().selectHead("a");
    useProject.getState().removeHead("a");
    assert.equal(useProject.getState().rightMode, "zone");
    useProject.getState().selectHead("b");
    useProject.getState().deleteSelected();
    assert.equal(useProject.getState().selectedId, null);
    assert.equal(useProject.getState().rightMode, "zone");
  } finally { await server.close(); }
});
