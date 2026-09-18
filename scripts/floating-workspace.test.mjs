import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(
  new URL("../src/components/designer/floating-layout.ts", import.meta.url),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { placeFloating, placeTooltip, overlaps, dockAt, workspaceBounds } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
);
const within = (b, r) => {
  assert.ok(r.x >= b.x && r.y >= b.y);
  assert.ok(r.x + r.width <= b.x + b.width + 0.01);
  assert.ok(r.y + r.height <= b.y + b.height + 0.01);
};
test("toolbar moves away from sidebar and returns to preferred position", () => {
  const bounds = { x: 8, y: 90, width: 1200, height: 700 },
    wanted = { x: 1154, y: 120 },
    size = { width: 54, height: 410 };
  const sidebar = { x: 880, y: 90, width: 328, height: 700 };
  const before = placeFloating(bounds, size, wanted, []),
    after = placeFloating(bounds, size, wanted, [sidebar]);
  assert.equal(before.x, 1154);
  assert.ok(after.x + after.width <= 872);
  assert.ok(!overlaps(after, sidebar));
  assert.deepEqual(placeFloating(bounds, size, wanted, []), before);
});
test("palette, tools, and square lens fit tablet and desktop workspaces", () => {
  for (const [width, height] of [
    [768, 1024],
    [1024, 768],
    [1280, 800],
    [1440, 900],
    [1920, 1080],
  ]) {
    const b = { x: 8, y: 100, width: width - 16, height: height - 160 };
    const sidebar = { x: width - 328, y: 100, width: 320, height: b.height };
    const palette = placeFloating(b, { width: 420, height: 490 }, { x: sidebar.x - 430, y: 110 }, [
      sidebar,
    ]);
    const toolbar = placeFloating(b, { width: 478, height: 54 }, { x: b.x, y: b.y }, [
      sidebar,
      palette,
    ]);
    const lens = placeFloating(b, { width: 120, height: 120 }, { x: b.x + b.width - 120, y: b.y }, [
      sidebar,
      palette,
      toolbar,
    ]);
    for (const r of [palette, toolbar, lens]) {
      within(b, r);
      assert.ok(r.width > 0 && r.height > 0);
      assert.ok(!overlaps(r, sidebar));
    }
    assert.ok(!overlaps(palette, toolbar));
    assert.ok(!overlaps(lens, toolbar));
    assert.ok(!overlaps(lens, palette));
  }
});
test("tooltip flips from blocked below and stays visible", () => {
  const b = { x: 0, y: 0, width: 800, height: 600 },
    toolbar = { x: 100, y: 530, width: 400, height: 54 };
  const tip = placeFloating(b, { width: 170, height: 34 }, { x: 110, y: 592 }, [toolbar]);
  within(b, tip);
  assert.ok(!overlaps(tip, toolbar));
});
test("tooltips centre below their button and point to its centre", () => {
  const bounds = { x: 8, y: 8, width: 1008, height: 752 };
  const button = { x: 400, y: 80, width: 40, height: 40 };
  for (const width of [80, 170, 310]) {
    const tip = placeTooltip(bounds, { width, height: 36 }, button, []);
    assert.equal(tip.side, "bottom");
    assert.equal(tip.x + tip.width / 2, button.x + button.width / 2);
    assert.equal(tip.y, button.y + button.height + 10);
    assert.equal(tip.arrow, tip.width / 2);
  }
});
test("footer tooltips flip above, remain centred, and avoid bottom windows", () => {
  const bounds = { x: 8, y: 8, width: 1008, height: 752 };
  const button = { x: 400, y: 720, width: 38, height: 38 };
  const footer = { x: 0, y: 710, width: 1024, height: 58 };
  const tip = placeTooltip(bounds, { width: 180, height: 36 }, button, [footer]);
  assert.equal(tip.side, "top");
  assert.equal(tip.x + tip.width / 2, button.x + button.width / 2);
  within(bounds, tip);
  assert.ok(!overlaps(tip, footer));
  const window = { x: 280, y: 630, width: 400, height: 72 };
  const moved = placeTooltip(bounds, { width: 180, height: 36 }, button, [footer, window]);
  within(bounds, moved);
  assert.ok(!overlaps(moved, window));
  assert.ok(!overlaps(moved, footer));
});
test("tooltip follows panel changes and shifts only as needed at the screen edge", () => {
  const bounds = { x: 8, y: 8, width: 1008, height: 752 };
  const button = { x: 520, y: 210, width: 40, height: 40 }, size = { width: 180, height: 36 };
  const normal = placeTooltip(bounds, size, button, []);
  const panel = { x: 400, y: 260, width: 300, height: 180 };
  const withPanel = placeTooltip(bounds, size, button, [panel]);
  assert.equal(withPanel.side, "top");
  assert.equal(withPanel.x, normal.x);
  assert.ok(!overlaps(withPanel, panel));
  assert.deepEqual(placeTooltip(bounds, size, button, []), normal);
  const edgeButton = { ...button, x: 8 };
  const edge = placeTooltip(bounds, size, edgeButton, []);
  within(bounds, edge);
  assert.equal(edge.x, bounds.x);
  assert.equal(edge.x + edge.arrow, edgeButton.x + edgeButton.width / 2);
});
test("edge orientation has hysteresis and switches on all four edges", () => {
  const b = { x: 0, y: 0, width: 1000, height: 700 };
  assert.equal(dockAt({ x: 5, y: 300 }, b, "top"), "left");
  assert.equal(dockAt({ x: 995, y: 300 }, b, "top"), "right");
  assert.equal(dockAt({ x: 500, y: 5 }, b, "right"), "top");
  assert.equal(dockAt({ x: 500, y: 695 }, b, "left"), "bottom");
  assert.equal(dockAt({ x: 500, y: 300 }, b, "left"), "left");
});
test("bottom-right guidance follows opening panels and returns when they close", () => {
  const bounds = { x: 8, y: 80, width: 1000, height: 650 };
  const wanted = { x: 528, y: 686 }, size = { width: 480, height: 44 };
  const initial = placeFloating(bounds, size, wanted, []);
  assert.equal(initial.x + initial.width, bounds.x + bounds.width);
  assert.equal(initial.y + initial.height, bounds.y + bounds.height);
  for (const height of [60, 140, 220]) {
    const panel = { x: 8, y: 730 - height, width: 1000, height };
    const hint = placeFloating(bounds, size, wanted, [panel]);
    within(bounds, hint);
    assert.ok(hint.y + hint.height <= panel.y - 8);
    assert.ok(!overlaps(hint, panel));
  }
  assert.deepEqual(placeFloating(bounds, size, wanted, []), initial);
});
test("opening a full-height sidebar moves the actual right docking boundary", () => {
  const originals = {
    window: globalThis.window,
    document: globalThis.document,
    getComputedStyle: globalThis.getComputedStyle,
  };
  const panel = {
    getBoundingClientRect: () => ({
      left: 880,
      right: 1200,
      top: 100,
      bottom: 800,
      width: 320,
      height: 700,
    }),
  };
  globalThis.window = { innerWidth: 1200, innerHeight: 900 };
  globalThis.document = {
    querySelector: () => ({
      getBoundingClientRect: () => ({ left: 0, right: 1200, top: 100, bottom: 800 }),
    }),
    querySelectorAll: () => [panel],
  };
  globalThis.getComputedStyle = () => ({ display: "block", visibility: "visible" });
  try {
    const bounds = workspaceBounds();
    assert.equal(bounds.x + bounds.width, 872);
    assert.equal(dockAt({ x: 868, y: 400 }, bounds, "top"), "right");
  } finally {
    Object.assign(globalThis, originals);
  }
});
test("random placements stay in bounds and avoid obstacles, including constrained screens", () => {
  let seed = 213;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  for (let i = 0; i < 500; i++) {
    const b = { x: 8, y: 72, width: 300 + random() * 1200, height: 200 + random() * 800 };
    const obstacles = Array.from({ length: 4 }, () => ({
      x: random() * b.width,
      y: 72 + random() * b.height,
      width: random() * 250,
      height: random() * 300,
    }));
    const r = placeFloating(
      b,
      { width: 54 + random() * 400, height: 54 + random() * 400 },
      { x: random() * 2000, y: random() * 1400 },
      obstacles,
    );
    within(b, r);
    if (r.width && r.height)
      for (const o of obstacles) assert.ok(!overlaps(r, o), JSON.stringify({ r, o }));
  }
});

test("dimension forms keep an eight-pixel gap from inset sidebars, including after resize", () => {
  const originals = { window: globalThis.window, document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
  let width = 1024, panels = [];
  const panel = (left, right) => ({ getBoundingClientRect: () => ({ left, right, top: 108, bottom: 792, width: right-left, height: 684 }) });
  globalThis.window = { innerWidth: width, innerHeight: 900 };
  globalThis.document = {
    querySelector: () => ({ getBoundingClientRect: () => ({ left: 0, right: width, top: 100, bottom: 800 }) }),
    querySelectorAll: () => panels,
  };
  globalThis.getComputedStyle = () => ({ display: "block", visibility: "visible" });
  try {
    panels = [panel(8, 232), panel(width-328, width-8)];
    let bounds = workspaceBounds();
    assert.equal(bounds.x, 240);
    assert.equal(bounds.x + bounds.width, width-336);
    width = 768;
    globalThis.window.innerWidth = width;
    panels = [panel(8, 232), panel(width-360, width-8)];
    bounds = workspaceBounds();
    assert.equal(bounds.x, 240);
    assert.equal(bounds.x + bounds.width, width-368);
    assert.ok(bounds.width > 0);
    panels = [];
    bounds = workspaceBounds();
    assert.equal(bounds.x, 8);
    assert.equal(bounds.width, width-16);
  } finally { Object.assign(globalThis, originals); }
});
