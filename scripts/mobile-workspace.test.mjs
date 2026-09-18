import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("layer manager keeps a vertical reorder list and exposes front/back actions", async () => {
  const app=await readFile(new URL("../src/components/designer/designer-app.tsx",import.meta.url),"utf8");
  const layers=await readFile(new URL("../src/components/designer/mobile-workspace.tsx",import.meta.url),"utf8");
  const css=await readFile(new URL("../src/styles.css",import.meta.url),"utf8");
  assert.match(app,/layerManagerOpen && <section className="mobile-layer-manager"/);
  assert.match(app,/<MobileLayers manager selectedFirst=\{false\} onEdit=\{id=>/);
  assert.match(app,/aria-pressed=\{layerManagerOpen\}/);
  assert.match(layers,/const next=front \? \[key,\.\.\.rest\] : \[\.\.\.rest,key\]/);
  assert.match(layers,/if\(member\) st.reorderGroupMembers\(next\); else st.reorderLayers\(next\)/);
  assert.match(css,/mobile-layer-manager > \.mobile-layers-list \{ overflow-y:auto/);
  assert.match(css,/layer-purpose-options \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("phone grid taps, hold suppression, preview gestures and desktop guards", async () => {
  const app = await readFile(new URL("../src/components/designer/designer-app.tsx", import.meta.url), "utf8");
  const button = await readFile(new URL("../src/components/designer/mobile-grid-button.tsx", import.meta.url), "utf8");
  const canvas = await readFile(new URL("../src/components/designer/design-canvas.tsx", import.meta.url), "utf8");
  const toggle = app.match(/onToggle=\{\(\) => \{([^\n]+)\}\}/)[1];
  const hold = app.match(/onHold=\{\(\) => \{([^\n]+)\}\}/)[1];
  for (const enabled of [false, true]) {
    let grid = enabled, open = false;
    const run = body => new Function("useProject", "showGrid", "setGridOpen", "setCustomGridOpen", "setMobilePanel", "setFileMenuOpen", body)({ getState: () => ({ setGrid: v => { grid = v; } }) }, enabled, v => { open = v; }, () => {}, () => {}, () => {});
    run(hold); assert.equal(grid, enabled); assert.equal(open, true);
    run(toggle); assert.equal(grid, !enabled); assert.equal(open, !enabled);
  }
  const click = button.match(/onClick=\{\(\) => \{([^\n]+)\}\}/)[1];
  const suppress = { current: true }; let toggles = 0;
  const release = () => new Function("clear", "suppress", "onToggle", click)(() => {}, suppress, () => toggles++);
  release(); assert.equal(toggles, 0); release(); assert.equal(toggles, 1);
  assert.match(button, /450/);
  assert.match(app, /\{!isPhone && <Popover.Trigger/);
  const header = app.slice(app.indexOf("<header"), app.indexOf("</header>"));
  const footer = app.slice(app.indexOf("<footer"), app.indexOf("</footer>"));
  assert.match(header, /aria-label="Инструменты"/);
  assert.match(header, /aria-label=\{t\("library"\)\}/);
  assert.doesNotMatch(header, /<Layers \/>|<Crosshair size=\{22\} \/>|aria-label="Предпросмотр"/);
  assert.match(footer, /<Layers \/>/);
  assert.match(footer, /\{viewControls\}/);
  assert.match(app, /<Crosshair size=\{22\} \/>/);
  assert.match(app, /aria-label=\{t\("preview"\)\}/);
  assert.match(app, /\{projectPreview && <MobilePreview/);
  assert.match(canvas, /listening=\{!readOnly\}/);
  assert.match(canvas, /if \(readOnly\) return \(\) => ro.disconnect\(\)/);
  assert.match(canvas, /if \(readOnly\) return;\s*if \(size.w/);
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { previewGesture } = await server.ssrLoadModule("/src/components/designer/mobile-preview.tsx");
    const { useProject } = await server.ssrLoadModule("/src/lib/project-store.ts");
    const before = useProject.getState();
    const view = { px: 40, panX: 10, panY: 20 };
    assert.deepEqual(previewGesture(view, [{ x: 50, y: 60 }], [{ x: 70, y: 90 }]), { px: 40, panX: 30, panY: 50 });
    const zoom = previewGesture(view, [{ x: 0, y: 100 }, { x: 100, y: 100 }], [{ x: -50, y: 100 }, { x: 150, y: 100 }]);
    assert.deepEqual(zoom, { px: 80, panX: -30, panY: -60 });
    assert.equal(useProject.getState(), before, "preview gestures never mutate editor state or project");
  } finally { await server.close(); }
});

test("layer strip follows explicit selection, not viewport updates", async () => {
  const app = await readFile(new URL("../src/components/designer/designer-app.tsx", import.meta.url), "utf8");
  const body = app.match(/useProject\.subscribe\(\(state, previous\) => \{([\s\S]*?)\n  \}\), \[\]\)/)[1];
  let visible = false;
  const notify = new Function("state", "previous", "setMobileLayersVisible", body);
  const empty = { selectedPolyIds: [], selectedPolyId: null, selectedEdgeId: null, cadEditId: null };
  const selected = { ...empty, selectedPolyId: "face-1", selectedPolyIds: ["face-1"] };
  const update = (next, before) => notify(next, before, (value) => { visible = value; });
  update(selected, empty); assert.equal(visible, true);
  visible = false; // manual toggle off
  update({ ...selected, panX: 10 }, selected); assert.equal(visible, false);
  update({ ...selected, selectedPolyIds: ["face-1"] }, selected); assert.equal(visible, true);
  update({ ...empty, selectedPolyIds: [] }, selected); assert.equal(visible, false);
  visible = true; // manual toggle on, then tap empty canvas again
  update({ ...empty, selectedPolyIds: [] }, empty); assert.equal(visible, false);
  update({ ...empty, cadEditId: "face-1" }, empty); assert.equal(visible, true);
  assert.match(app, /setMobileLayersVisible\(mobileWorkspaceMode !== "drawing" \|\| !mobileLayersVisible\)/);
});

test("sheet gestures only expand, compact or close the interface", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { sheetGesture, MobileSheet, PHONE_QUERY, MobileLayers } = await server.ssrLoadModule("/src/components/designer/mobile-workspace.tsx");
    assert.equal(sheetGesture(false, -45), "expand");
    assert.equal(sheetGesture(true, 60), "compact");
    assert.equal(sheetGesture(false, 60), "close");
    assert.equal(sheetGesture(false, 10), null);
    assert.equal(sheetGesture(true, -10), null);
    assert.match(PHONE_QUERY, /max-width: 767px/);
    assert.match(PHONE_QUERY, /max-height: 600px/);
    const { useProject } = await server.ssrLoadModule("/src/lib/project-store.ts");
    const before = useProject.getState();
    const snapshot = JSON.stringify(before.project);
    const compact = renderToStaticMarkup(createElement(MobileSheet, { title: "Параметры", panelKey: "properties", compact: true, onClose() {}, children: createElement("input", { "aria-label": "Ширина" }), footer: createElement("button", null, "Готово") }));
    assert.match(compact, /class="mobile-parameter-bar"/);
    assert.match(compact, /class="mobile-parameter-scroll"/);
    assert.match(compact, /class="mobile-parameter-actions"/);
    assert.doesNotMatch(compact, /mobile-sheet-header|mobile-sheet-handle|<h2/);
    assert.equal(JSON.stringify(useProject.getState().project), snapshot);
    for (const panel of ["tools", "layers", "library", "properties", "irrigation", "estimate"]) {
      const markup = renderToStaticMarkup(createElement(MobileSheet, { title: panel, panelKey: panel, onClose() {}, children: createElement(MobileLayers, { onEdit() {} }) }));
      assert.equal((markup.match(/data-mobile-sheet=/g) ?? []).length, 1);
      assert.match(markup, /role="region"/);
      assert.match(markup, /aria-label="Свернуть панель"/);
      assert.match(markup, /aria-label="Развернуть панель"/);
      assert.equal(JSON.stringify(useProject.getState().project), snapshot);
      for (const key of ["pxPerMeter", "panX", "panY", "selectedId", "selectedPolyId", "cadEditId", "draft", "past", "future", "themeId"])
        assert.equal(useProject.getState()[key], before[key], panel + " preserves " + key);
    }
  } finally { await server.close(); }
});

test("mobile tool inventory retains every draw mode and reuses existing size editors", async () => {
  const app = await readFile(new URL("../src/components/designer/designer-app.tsx", import.meta.url), "utf8");
  const types = await readFile(new URL("../src/lib/project-types.ts", import.meta.url), "utf8");
  const drawType = types.match(/export type DrawSub =([\s\S]*?);/)[1];
  const expected = [...drawType.matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((id) => id !== "none").sort();
  const inventory = app.slice(app.indexOf("const DRAW_SUBS"), app.indexOf("const DRAW_KINDS"));
  const actual = [...inventory.matchAll(/id: "([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(actual, expected);
  for (const editor of ["DrawMeasurePad", "SplineLengthsPad", "FreeformSidesPad", "CadEditBar"])
    assert.match(app, new RegExp(`<${editor}\\b`));
  assert.match(app, /mobilePanel === "properties"/);
  const properties = app.slice(app.indexOf('{mobilePanel === "properties" && <>'), app.indexOf('{mobilePanel === "estimate" && <EstimateCard'));
  assert.doesNotMatch(properties, /mobile-object-metrics|mobile-region-select|DrawingCard|CadEditBar/);
  assert.match(app, /!isPhone && cadEditId && !catalogOpen && !draft.points.length && <CadEditBar/);
  assert.match(app, /footer=\{mobilePanel === "properties" && selected/);
  assert.match(app, /<DrawMeasurePad\s+compact=\{isPhone\}/);
  assert.match(app, /selected \? <HeadCard head=\{selected\} \/> : \(!mobileFace \|\| cadEditId\) \? contextControls/);
  assert.match(app, /mobilePanel === "estimate" && <EstimateCard/);
  assert.match(app, /setMobileWorkspaceMode\("irrigation"\)/);
  assert.match(app, /<ZoneList \/><PumpBox \/>/);
});

test("mobile navigation and catalog scroll do not call drawing mutations", async () => {
  const app = await readFile(new URL("../src/components/designer/designer-app.tsx", import.meta.url), "utf8");
  const helper = await readFile(new URL("../src/components/designer/mobile-workspace.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const navigation = app.slice(app.indexOf('{isPhone && <>\n          <button type="button" className="mobile-dock-button"'), app.indexOf('{!isPhone && <BarTool'));
  assert.match(navigation, /setMobilePanel/);
  assert.doesNotMatch(navigation, /setTool|setCatalogOpen|setCadEdit|selectPoly|setPan|setZoom/);
  assert.match(css, /\.mobile-drag-handle \{ touch-action: none/);
  assert.match(css, /\.mobile-catalog-select[^}]*touch-action: pan-y/);
  assert.match(css, /\.mobile-catalog-select img[^}]*object-fit: contain/);
  assert.match(css, /min-height: 44px; min-width: 44px/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(helper, /visualViewport/);
  assert.match(helper, /onPointerCancel/);
  assert.match(helper, /mobile-layer-confirm/);
});

test("selected layers, sprinklers and standalone edges move first without changing project order or names", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { layerRows, selectedObjectKey } = await server.ssrLoadModule("/src/components/designer/mobile-workspace.tsx");
    const { emptyProject } = await server.ssrLoadModule("/src/lib/project-types.ts");
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const { addRect, addChain } = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    let drawing = addRect(emptyDrawing(), { x: 0, y: 0 }, { x: 4, y: 3 }, "lawn");
    drawing = addRect(drawing, { x: 6, y: 0 }, { x: 9, y: 3 }, "lawn");
    drawing = addChain(drawing, [{ x: 20, y: 0 }, { x: 23, y: 4 }], false, "lawn");
    const faces = Object.values(drawing.faces);
    faces[0].name = "Длинное название газона у главного входа";
    const edge = Object.values(drawing.edges).find((e) => !e.faceL && !e.faceR);
    const project = { ...emptyProject(), drawing, heads: [{ id: "sprinkler-1", catalogId: "MP1000-90", x: 1, y: 1, r: 3, arc: 90, start: 0, zone: 1, locked: false, nozzleId: null, bodyId: null, popUpMm: null, designPressure: 2.8, needsReview: false }] };
    const none = { selectedId: null, selectedPolyId: null, selectedEdgeId: null, cadEditId: null };
    const baseline = layerRows(project, none, "ru");
    const snapshot = JSON.stringify(project);
    for (const [selection, key] of [
      [{ ...none, selectedPolyId: faces[1].id }, `face:${faces[1].id}`],
      [{ ...none, selectedId: "sprinkler-1", cadEditId: faces[0].id }, "head:sprinkler-1"],
      [{ ...none, selectedEdgeId: edge.id }, `edge:${edge.id}`],
      [{ ...none, selectedEdgeId: faces[1].outer[0].e }, `face:${faces[1].id}`],
      [{ ...none, cadEditId: faces[0].id }, `face:${faces[0].id}`],
    ]) {
      const rows = layerRows(project, selection, "ru");
      assert.equal(rows[0].key, key);
      assert.equal(rows[0].selected, true);
      assert.equal(rows.filter((row) => row.selected).length, 1);
      assert.deepEqual(rows.slice(1).map((r) => r.key), baseline.filter((r) => r.key !== key).map((r) => r.key), "unselected rows keep their existing relative order");
      assert.deepEqual(Object.fromEntries(rows.map((r) => [r.key, r.title])), Object.fromEntries(baseline.map((r) => [r.key, r.title])), "implicit layer numbering is independent of selection");
      assert.equal(JSON.stringify(project), snapshot, "display order must not rewrite project data");
    }
    assert.equal(baseline.length, 4, "boundary edges are not duplicated as individual layers");
    assert.equal(selectedObjectKey({ ...none, selectedId: "sprinkler-1", cadEditId: faces[0].id }), "head:sprinkler-1");
    assert.deepEqual(layerRows(project, none, "ru"), baseline, "clearing selection restores base order");
  } finally { await server.close(); }
});

test("compact layer markup has one row and opens details without rendering permanent metric panels", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { LayerList } = await server.ssrLoadModule("/src/components/designer/mobile-workspace.tsx");
    const { useProject } = await server.ssrLoadModule("/src/lib/project-store.ts");
    const { emptyProject } = await server.ssrLoadModule("/src/lib/project-types.ts");
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const { addRect } = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const drawing = addRect(emptyDrawing(), { x: 0, y: 0 }, { x: 4, y: 3 }, "lawn");
    const id = Object.keys(drawing.faces)[0];
    const before = useProject.getState();
    const snapshot = JSON.stringify(before.project);
    const markup = renderToStaticMarkup(createElement(LayerList, {
      project: { ...emptyProject(), drawing },
      selection: { selectedPolyId: id, selectedId: null, selectedEdgeId: null, cadEditId: null },
      units: before.units, locale: "ru", onEdit() {},
    }));
    assert.equal((markup.match(/<article /g) ?? []).length, 1);
    assert.match(markup, /data-selected="true"/);
    assert.match(markup, /Подробности:/);
    assert.match(markup, /aria-haspopup="dialog"/);
    assert.equal((markup.match(/<button /g) ?? []).length, 7, "color, visibility, lock, duplicate, edit, delete and details fit beside the editable name");
    assert.match(markup, /layer-lock/);
    assert.match(markup, /class="mobile-icon-button layer-visibility"[^>]*aria-pressed="false"/);
    assert.match(markup, /class="mobile-layer-name"/);
    assert.match(markup, /Изменить цвет или материал:/);
    assert.ok(markup.indexOf('layer-color-button') < markup.indexOf('layer-eye'));
    assert.ok(markup.indexOf('layer-eye') < markup.indexOf('layer-lock'));
    assert.doesNotMatch(markup, /<dl|mobile-layer-menu|mobile-layer-metrics|mobile-layer-details/);
    assert.equal(JSON.stringify(useProject.getState().project), snapshot);
    for (const key of ["pxPerMeter", "panX", "panY", "selectedPolyId", "past", "future", "themeId"])
      assert.equal(useProject.getState()[key], before[key]);
  } finally { await server.close(); }
});

test("layer details and grid-step controls are portalled outside clipped panels with safe touch sizes", async () => {
  const app = await readFile(new URL("../src/components/designer/designer-app.tsx", import.meta.url), "utf8");
  const canvas = await readFile(new URL("../src/components/designer/design-canvas.tsx", import.meta.url), "utf8");
  const helper = await readFile(new URL("../src/components/designer/mobile-workspace.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(app, /<Popover\.Root modal=\{!isPhone\} open=\{gridOpen\}/);
  assert.match(app, /<Popover\.Trigger asChild><Button[\s\S]*?aria-label=\{`\$\{t\("gridStep"\)/);
  assert.match(app, /<Popover\.Portal>\s*<Popover\.Content side=\{isPhone \? "bottom" : "top"\}/);
  const topControls = app.slice(app.indexOf('<nav className="mobile-canvas-controls"'), app.indexOf("</nav>", app.indexOf('<nav className="mobile-canvas-controls"')))
    .replace("{selectionControls}", app.slice(app.indexOf("const selectionControls ="), app.indexOf("const viewControls =")))
    .replace("{viewControls}", app.slice(app.indexOf("const viewControls ="), app.indexOf("const contextControls =")));
  assert.ok(app.indexOf('<nav className="mobile-canvas-controls"') > app.indexOf("<footer"), "canvas controls belong in the phone footer");
  assert.ok(topControls.indexOf('aria-label={t("selectMultiple")}') < topControls.indexOf('aria-label={t("mergeSelectedLayers")}'));
  assert.ok(topControls.indexOf('aria-label={t("mergeSelectedLayers")}') < topControls.indexOf('aria-label={t("drawDim")}'));
  assert.ok(topControls.indexOf('aria-label={t("drawDim")}') < topControls.indexOf('aria-label={t("ruler")}'));
  assert.ok(topControls.indexOf('aria-label={t("preview")}') < topControls.indexOf('aria-label={t("layers")}'));
  assert.ok(topControls.indexOf('aria-label={t("layers")}') < topControls.indexOf('{gridControls}'));
  assert.match(css, /\.app-header \.scroll-touch \{ overflow-x: auto/);
  assert.match(topControls, /\{gridControls\}/);
  assert.match(topControls, /setPan\(bounds.width \/ 2, bounds.height \/ 2\)/);
  assert.doesNotMatch(topControls, /setZoom|commitDrawing|selectPoly/);
  assert.match(app, /Применить шаг сетки/);
  const gridControls = app.slice(app.indexOf("const gridControls ="), app.indexOf('<div className="app-shell'));
  assert.ok(gridControls.indexOf('aria-label={t("magnet")}') < gridControls.indexOf('aria-label={t("grid")}'));
  assert.ok(gridControls.indexOf('aria-label={t("grid")}') < gridControls.indexOf("data-grid-step-trigger"));
  const gridOptions = gridControls.slice(gridControls.indexOf("{GRID_STEPS.map"));
  assert.doesNotMatch(gridOptions, /setGridOpen\(false\)/, "choosing preset or custom step leaves popover open");
  assert.match(gridOptions, /aria-pressed=\{gridStep === g.id\}/);
  assert.match(css, /\.grid-step-pop\[data-mobile="true"\] \{ width: max-content/);
  assert.match(app, /if \(editing \|\| constructing \|\| selectedId\) return "properties"/);
  assert.doesNotMatch(app, /if \(editing \|\| constructing \|\| selectionKey\) return "properties"/);
  assert.match(helper, /<Popover.Anchor asChild><article/);
  assert.match(css, /\.layer-details-compact \{ width: var\(--radix-popover-trigger-width\)/);
  assert.match(css, /\.layer-details-compact \.layer-dialog-body \{ display: flex/);
  assert.doesNotMatch(helper, /layer-delete-button/);
  assert.match(helper, /!confirming && face && <dl className="layer-detail-stats">/);
  assert.doesNotMatch(app, /mobile-context-chip/);
  assert.match(app, /compact=\{mobilePanel === "properties" && !selected\}/);
  assert.match(css, /\.mobile-layer \{ --layer-radius: 10px/);
  assert.match(css, /\.mobile-top-layers \.mobile-layer \{[^}]*border-radius: var\(--layer-radius\)/);
  assert.match(css, /\.mobile-top-layers \.mobile-layer :is\(button, input\) \{ border-radius: var\(--layer-radius\)/);
  assert.match(css, /\.mobile-layer-color \{[^}]*border-radius: inherit/);
  assert.match(css, /\.mobile-parameter-scroll \{[^}]*overflow-x: auto/);
  assert.match(css, /\.mobile-parameter-bar \{[^}]*height: 36px/);
  assert.match(css, /\.mobile-top-layers \{[^}]*height: 36px/);
  assert.match(css, /\.mobile-parameter-bar \.dimension-pad label,[^}]*border: 1px solid var\(--color-line\)/);
  assert.match(css, /\.mobile-parameter-bar \{[^}]*bottom: calc\(var\(--mobile-dock-height\)/);
  assert.match(helper, /filter\(\(row\) => row\.kind !== "head"\)/);
  assert.match(css, /\.mobile-top-layers \.mobile-layers-list, \.mobile-zone-strip \{[^}]*flex-wrap: nowrap[^}]*overflow-x: auto/);
  assert.match(css, /height: 32px; min-height: 32px !important/);
  assert.match(app, /className="mobile-top-layers"/);
  assert.doesNotMatch(app, /className="mobile-mode-switch"/);
  assert.match(helper, /<LayerColorPicker title=\{title\}/);
  assert.match(css, /\.mobile-layer \.layer-lock\[aria-pressed="true"\] \{ color: #ff172c/);
  assert.match(css, /\.layer-eye\[data-hidden="true"\]::after/);
  assert.match(app, /mobilePanel !== "layers" && mobilePanel !== "tools" && !catalogGhost && <MobileSheet/);
  assert.match(app, /isPhone && !catalogGhost && \(mobilePanel === "tools" \|\| mobileWorkspaceMode === "irrigation" \|\| mobileLayersVisible\) && <div className="mobile-top-overlays">/);
  assert.match(app, /mobilePanel === "tools" && <div className="mobile-tool-stack"/);
  const toolStrip = app.slice(app.indexOf('<div className="mobile-tool-strip-panel" role="toolbar"'), app.indexOf('className="mobile-top-layers"'));
  assert.match(toolStrip, /DRAW_SUBS\.filter\(\(item\) => item\.id !== "arc" && item\.id !== "dim"\)/);
  assert.doesNotMatch(toolStrip, /Выбрать несколько фигур|Объединить выбранные фигуры|aria-label=\{t\("ruler"\)\}|setDrawSub\("dim"\)/);
  assert.doesNotMatch(toolStrip, /Назначение|Дополнительные инструменты|MOBILE_EXTRA_DRAW|setMeasureSub\("guide"\)|setTool\("scale"\)|setCadMode\("move_object"\)|Замкнуть|finishOpenDraw|setMobileWorkspaceMode\("irrigation"\)|setMobilePanel\("estimate"\)|setIssuesOpen\(true\)|setLabels/);
  assert.doesNotMatch(toolStrip, /<span>/);
  assert.match(app, /if \(current === "tools"\) return current/);
  assert.match(app, /const chooseMobileTool = \(choose: \(\) => void\) => \{ choose\(\); \}/);
  assert.doesNotMatch(toolStrip, /aria-label=\{t\("edit"\)\}|aria-label="Дублировать"/);
  assert.match(helper, /className="mobile-icon-button layer-duplicate"[^>]*aria-label=\{`Дублировать:/);
  assert.match(helper, /className="mobile-icon-button layer-edit"[^>]*aria-label=\{`Редактировать:/);
  assert.match(helper, /className="mobile-icon-button layer-delete-direct text-danger"[^>]*aria-label=\{`Удалить:/);
  assert.match(app, /aria-label=\{t\("selectMultiple"\)\}[^>]*aria-pressed=\{workspaceMultiSelect[^}]*\}/);
  assert.match(app, /aria-label=\{t\("mergeSelectedLayers"\)\}/);
  assert.match(app, /multiSelect=\{workspaceMultiSelect[^}]*\}/);
  assert.match(app, /mobile=\{isPhone\}/);
  assert.match(canvas, /if \(!st\.tool \|\| st\.tool === "move" \|\| multiSelect\)/);
  assert.match(canvas, /if \(!mobile && cands\.length > 1\)/);
  assert.match(canvas, /if \(\(ctrl \|\| multiSelect\) && face\)/);
  assert.match(app, /className="mobile-tool-stack"/);
  assert.match(css, /\.mobile-top-overlays \{ position: absolute; top: 4px;[^}]*display: grid/);
  assert.match(css, /\.mobile-tool-stack \{ position: relative;[^}]*display: grid/);
  assert.doesNotMatch(css, /\.mobile-tool-stack \.mobile-parameter-bar \{ position: relative/);
  assert.ok(app.indexOf('className="mobile-parameter-bar mobile-tool-parameter-bar"') > app.indexOf('<footer className="app-footer'), "dimensions render below the drawing and above the dock");
  assert.match(css, /\.mobile-tool-strip \{[^}]*display: grid; grid-auto-flow: column[^}]*overflow: hidden/);
  assert.match(css, /\.mobile-tool-strip button \{[^}]*max-width: 44px[^}]*aspect-ratio: 1/);
  assert.match(app, /aria-label="Инструменты" aria-pressed=\{mobilePanel === "tools"\}/);
  assert.match(css, /--mobile-dock-height: calc\(46px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(css, /\.app-footer button \{ width: 38px; min-width: 38px; height: 38px/);
  assert.match(css, /\.app-footer \.mobile-canvas-controls button \{ width: 38px; min-width: 38px; height: 38px/);
  assert.match(css, /@media \(max-width: 400px\) \{\s*\.app-shell\[data-mobile="true"\] \.app-footer \.mobile-canvas-controls button \{ width: 34px/);
  assert.match(topControls, /aria-label=\{t\("selectMultiple"\)\}/);
  assert.match(topControls, /aria-label=\{t\("mergeSelectedLayers"\)\}/);
  assert.match(topControls, /aria-label=\{t\("drawDim"\)\}/);
  assert.match(topControls, /aria-label=\{t\("ruler"\)\}/);
  assert.match(css, /\.layer-delete-direct \{ color: #ff172c !important; \}/);
  assert.match(css, /\.layer-delete-direct svg \{ width: 20px; height: 20px; stroke-width: 1\.8; \}/);
  assert.match(helper, /align=\{confirming \? "end" : "start"\} sideOffset=\{2\}/);
  assert.match(helper, /if \(!open\) \{ setDeleting\(false\); setSplitting\(false\); \}/);
  assert.match(helper, /onInteractOutside=\{\(e\) => \{ if \(confirming\) e\.preventDefault\(\); \}\}/);
  assert.match(css, /\.layer-details-compact\[data-confirming="true"\] \{ width: var\(--radix-popover-trigger-width\)/);
  assert.match(css, /\.layer-details-compact\[data-confirming="true"\] \.mobile-layer-confirm button \{ width: 100%;[^}]*min-height: 28px/);
  assert.match(css, /\.mobile-layer-confirm button\.text-danger \{ color: #ff172c/);
  assert.match(css, /\.mobile-top-layers \.mobile-layer \{ flex: 0 0 100%/);
  assert.match(css, /\.mobile-top-layers \{ position: relative/);
  assert.ok(app.indexOf('mobilePanel === "tools" && <div className="mobile-tool-stack"') < app.indexOf('className="mobile-top-layers"'), "tools render above layers");
  assert.match(helper, /closest<HTMLElement>\("\.mobile-layers-list"\)\?\.scrollTo\(\{ left: 0/);
  assert.doesNotMatch(helper, /selectedRow\.current\?\.scrollIntoView/);
  assert.match(app, /className="designer-workspace relative flex min-h-0 flex-1"/);
  assert.match(css, /\.designer-workspace \{ isolation: isolate; z-index: 0/);
  assert.match(css, /\.mobile-layer-heading \{[^}]*gap: 4px; padding: 0 4px/);
  const palette = helper.slice(helper.indexOf("export function LayerColorPicker"), helper.indexOf("export function MobileLayers"));
  assert.doesNotMatch(palette, /<Popover.Root modal/);
  assert.match(helper, /menu === row\.key && <Popover\.Portal>/);
  assert.match(helper, /<Popover\.Content side="bottom"/);
  const details = helper.slice(helper.indexOf('{menu === row.key && <Popover.Portal>'));
  assert.doesNotMatch(details, /<h2|<header|Переименовать|setPalette|onEdit\(id\)|lockSelected/);
  assert.doesNotMatch(details, /layer-delete-button/);
  assert.match(details, /\{deleting && <div className="mobile-layer-menu">/);
  assert.match(details, /layerArea\(d, id\)/);
  assert.match(details, /layerPerimeter\(d, id\)/);
  assert.match(app, /mobileFaceDimensions\.push\(\{ label: t\("area"\), value: faceArea\(mobileDrawing, mobileFace\.id\), kind: "area" \}\)/);
  assert.match(app, /mobileFace\.rect && rectMetaMatchesFace[\s\S]*mobileFaceDimensions\.push\(\{ label: t\("drawWidth"\)[\s\S]*\{ label: t\("drawHeight"\)/);
  assert.match(app, /dimension\.kind === "area" \? formatAreaU\(dimension\.value, units\.area\) : formatLenU/);
  assert.match(css, /\.mobile-layer-heading \{[^}]*height: 44px/);
  assert.match(css, /\.mobile-layer-select > span:last-child \{[^}]*text-overflow: ellipsis; white-space: nowrap/);
  assert.match(css, /\.grid-step-pop \{[^}]*--radix-popover-content-available-height/);
  assert.match(css, /\.app-shell\[data-mobile="true"\] :is\([\s\S]*\.app-header,[\s\S]*\.app-footer,[\s\S]*\.mobile-top-layers \.mobile-layer,[\s\S]*\.mobile-parameter-bar,[\s\S]*\[role="dialog"\][\s\S]*\)/);
  assert.match(css, /\.grid-step-pop,[\s\S]*\.layer-color-popover,[\s\S]*\.layer-details-dialog/);
  assert.match(css, /\.layer-color-popover \.mobile-palette \{[^}]*grid-template-rows: repeat\(3, auto\)[^}]*align-items: start/);
  assert.match(css, /\.layer-color-popover \.mobile-palette > :is\(button, \.custom-color-swatch\) \{[^}]*min-width: 0; min-height: 0;[^}]*aspect-ratio: 1 \/ 1/);
  assert.match(css, /background: var\(--mobile-panel-glass\)/);
  assert.match(css, /backdrop-filter: blur\(10px\) saturate\(112%\)/);
  assert.match(css, /button:not\(\[aria-pressed="true"\]\):not\(\.bg-btn\):not\(\.bg-danger\) \{\s*background-color: transparent/);
  assert.doesNotMatch(css, /\.app-shell\[data-mobile="true"\] \.grid-step-pop/);
});

test("grid presets and custom values preserve geometry, viewport, selection and undo history", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { useProject } = await server.ssrLoadModule("/src/lib/project-store.ts");
    const { toMetersLen } = await server.ssrLoadModule("/src/lib/units.ts");
    const before = useProject.getState();
    const snapshot = JSON.stringify(before.project);
    for (const value of [0.1, 0.25, 0.5, 1, 2, 5, toMetersLen(Number("0,75".replace(",", ".")), "m")]) {
      useProject.getState().setGridStep(value);
      useProject.getState().setGrid(true);
      assert.equal(useProject.getState().gridStep, value);
      assert.equal(useProject.getState().showGrid, true);
      assert.equal(JSON.stringify(useProject.getState().project), snapshot);
      for (const key of ["pxPerMeter", "panX", "panY", "selectedId", "selectedPolyId", "cadEditId", "past", "future", "themeId"])
        assert.equal(useProject.getState()[key], before[key], `grid change preserves ${key}`);
    }
  } finally { await server.close(); }
});

test("compact layer palette offers persistent material textures", async () => {
  const helper = await readFile(new URL("../src/components/designer/mobile-workspace.tsx", import.meta.url), "utf8");
  const canvas = await readFile(new URL("../src/components/designer/design-canvas.tsx", import.meta.url), "utf8");
  const types = await readFile(new URL("../src/lib/cad/types.ts", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const assets = (await readdir(new URL("../public/materials/", import.meta.url))).filter((name) => name.endsWith(".png"));
  assert.equal(assets.length, 20);
  const texturePaths = [...types.matchAll(/src: "\/materials\/([^\"]+)"/g)].map((match) => match[1]);
  assert.equal(texturePaths.length, 20);
  assert.deepEqual(new Set(texturePaths), new Set(assets), "every material references a shipped texture");
  for (const name of texturePaths) {
    const image = await readFile(new URL(`../public/materials/${name}`, import.meta.url));
    assert.equal(image.subarray(1, 4).toString(), "PNG", `${name} is a PNG image`);
  }
  const fills = types.match(/export const FACE_FILLS = \[([\s\S]*?)\] as const/)[1].match(/"(?:transparent|#[a-f0-9]+)"/g);
  assert.equal(fills.length + 1, 27, "preset colors and custom picker fill all three nine-column rows");
  assert.match(helper, /<h3>\{t\("paletteColors"\)\}<\/h3>/);
  assert.match(helper, /<h3>\{t\("paletteMaterials"\)\}<\/h3>/);
  assert.match(helper, /FACE_TEXTURES\.map/);
  assert.match(css, /\.layer-color-popover \{[^}]*box-sizing: border-box[^}]*width: min\(560px, calc\(100vw - 8px\)\)/);
  assert.match(helper, /align="center" sideOffset=\{4\} collisionPadding=\{4\}/);
  assert.match(css, /\.layer-color-popover \.mobile-palette \{ grid-template-columns: repeat\(9, minmax\(0, 1fr\)\); grid-template-rows: repeat\(3, auto\)/);
  assert.match(css, /\.material-palette \{[^}]*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\); grid-template-rows: repeat\(3, auto\)/);
  assert.match(css, /\.layer-color-popover \.material-palette > button\[type="button"\] \{[^}]*min-width: 0;[^}]*min-height: 0; aspect-ratio: 1 \/ 1/);
  assert.match(helper, /type="color" aria-label=\{t\("paletteCustomColor"\)\}/);
  assert.match(helper, /data-transparent=\{swatch === "transparent"\}/);
  assert.match(css, /button\[data-transparent="true"\]::after/);
  assert.match(canvas, /fillPatternImage: texture/);
  assert.match(canvas, /textureImages\[fill\]/);
});
