import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const expected = [
  ["crystal", "#F8FBFC", "#FFFFFF", "#0A7C66"],
  ["pearl", "#F7F9FB", "#FFFFFF", "#0A84FF"],
  ["sage", "#F5F8F5", "#F3F7F4", "#52796F"],
  ["ice", "#F4F9FC", "#F2F8FC", "#3A7CA5"],
  ["sand", "#FBF8F2", "#FAF6EE", "#756B55"],
  ["matte", "#F5FAF8", "#F0F8F5", "#167564"],
  ["graphite", "#172126", "#202B2F", "#62D6B1"],
];
function luminance(hex) {
  const c = hex.slice(1).match(/../g).map((v) => parseInt(v, 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test("seven themes: exact palettes, contrast, legacy migration and isolated persistence", async () => {
  const previousStorage = globalThis.localStorage;
  const data = new Map();
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {} };
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { THEME_IDS, themePreview, themeVars, canvasTheme, parseThemeId } =
      await server.ssrLoadModule("/src/lib/theme.ts");
    const { useProject } = await server.ssrLoadModule("/src/lib/project-store.ts");
    assert.deepEqual([...THEME_IDS], expected.map((p) => p[0]));
    assert.equal(parseThemeId("irrigation"), "crystal");
    assert.equal(parseThemeId("night"), "graphite");
    assert.equal(parseThemeId("lawn"), "sage");
    assert.equal(parseThemeId("unknown"), "crystal");
    let stored;
    useProject.persist.setOptions({ storage: {
      getItem: () => stored, setItem: (_name, value) => { stored = value; }, removeItem: () => {},
    } });
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const { addRect } = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const drawing = addRect(emptyDrawing(), { x: 1, y: 2 }, { x: 11, y: 8 }, "lawn");
    const faceId = Object.keys(drawing.faces)[0];
    drawing.faces[faceId].fill = "#E6A147";
    useProject.setState({
      autoHeadsWiped: true,
      project: { ...useProject.getState().project, drawing },
      selectedId: faceId,
    });
    const before = useProject.getState();
    const snapshot = JSON.stringify(before.project);
    for (const [id, bg, surface, accent] of expected) {
      const palette = themePreview(id), vars = themeVars(id);
      assert.deepEqual([palette.bg, palette.surface, palette.btn], [bg, surface, accent]);
      assert.match(vars["--mobile-panel-glass"], /\/(?: 58| 66)%\)$/);
      assert.equal(canvasTheme(id).bg, bg);
      assert.equal(canvasTheme(id).accent, vars["--color-btn"]);
      assert.equal(canvasTheme(id).guideAligned, vars["--color-btn"], id + " construction follows theme");
      for (const [fg, background] of [
        ["--color-ink", "--color-surface"], ["--color-muted", "--color-surface"],
        ["--color-tool-fg", "--color-tool"], ["--color-btn-fg", "--color-btn"],
      ]) assert.ok(contrast(vars[fg], vars[background]) >= 4.5, id + " " + fg);
      useProject.getState().setThemeId(id);
      const after = useProject.getState();
      assert.equal(after.project, before.project);
      assert.equal(JSON.stringify(after.project), snapshot);
      for (const key of ["projects", "past", "future", "pxPerMeter", "panX", "panY", "gridStep", "units", "selectedId"])
        assert.equal(after[key], before[key], id + " preserves " + key);
      assert.equal(stored.state.themeId, id);
      assert.equal(stored.state.project.name, before.project.name);
    }
    await useProject.persist.rehydrate();
    assert.equal(useProject.getState().themeId, "graphite");
  } finally {
    await server.close();
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
