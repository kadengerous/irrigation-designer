import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

test("numbered-point contour and curve ignore double click and double tap", async () => {
  const source = await readFile(
    new URL("../src/components/designer/design-canvas.tsx", import.meta.url),
    "utf8",
  );
  const handler = source.match(
    /const finishOpenDrawFromDoubleTap = \(\) => \{([\s\S]*?)\n  \};/,
  )?.[1];

  assert.ok(handler, "double-activation handler must exist");
  assert.match(handler, /st\.drawSub === "polygon"/);
  assert.match(handler, /st\.drawSub === "spline"/);
  assert.equal(handler.includes("st.closePolygon()"), false);
  assert.equal(handler.includes("st.popDraftPoint()"), false);
  assert.match(source, /onDblClick=\{finishOpenDrawFromDoubleTap\}/);
  assert.match(source, /onDblTap=\{finishOpenDrawFromDoubleTap\}/);
});

test("freehand preview is smooth and never renders draft point handles", async () => {
  const source = await readFile(
    new URL("../src/components/designer/design-canvas.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /tension=\{drawSub === "freehand" \? 0\.35 : drawSub === "spline" \? 0\.45 : 0\}/,
  );
  assert.match(
    source,
    /drawSub !== "hexagon" &&\s+drawSub !== "freehand" &&\s+draft\.points\.map/,
  );
});

test("curve points are draggable while drawing and after completion", async () => {
  const source = await readFile(
    new URL("../src/components/designer/design-canvas.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /const beginSplineDraftPointDrag = \(/);
  assert.match(source, /drawSub === "spline" \?/);
  assert.match(source, /beginSplineDraftPointDrag\(i, e\)/);
  assert.match(source, /if \(face\.spline\) \{/);
  assert.match(source, /setSplinePt\(index, snapped\)/);
  assert.match(source, /key=\{`spline-control-\$\{index\}`\}/);
});

test("curve construction shows distances, closes at its first point, and finishes open by holding its last point", async () => {
  const source = await readFile(
    new URL("../src/components/designer/design-canvas.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /const closeSplineDraft = \(\) => \{/);
  assert.match(
    source,
    /st\.drawSub !== "spline" \|\| st\.draft\.points\.length < 3/,
  );
  assert.match(source, /if \(pointIndex === 0\) closeSplineDraft\(\)/);
  assert.match(source, /const finishOpenSplineDraft = \(\) => \{/);
  assert.match(source, /const canFinishOnHold =/);
  assert.match(source, /canFinishOnHold \? finishOpenSplineDraft : undefined/);
  assert.match(source, /pointIndex === lastIndex &&/);
  assert.match(
    source,
    /drawSub === "spline" && draft\.points\.length >= 2 && \(\s+<PathTotalMeasure/,
  );
  assert.match(source, /points=\{catmullRom\(draft\.points, 8, false\)\}/);
  assert.match(
    source,
    /st\.draft\.points\.length >= \(st\.drawSub === "spline" \? 3 : 2\)/,
  );
});

test("point and curve construction use themed starts, red active points, orange inactive points, and transparent dimensions", async () => {
  const source = await readFile(
    new URL("../src/components/designer/design-canvas.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /i === 0\s+\? appearance\.accent/);
  assert.match(source, /activeConstructionPoint === i\s+\? "#f5222d"/);
  assert.match(source, /setActiveDraftPolygonPoint\(pointIndex\)/);
  assert.match(source, /setActiveDraftSplinePoint\(pointIndex\)/);
  assert.match(source, /function PathTotalMeasure\(/);
  assert.match(source, /activeCurvePoint === index \? "#cf2f2f" : "#d56a2b"/);
  const lengthLabel = source.match(/function SegmentLengthText\([\s\S]*?\n\}/)?.[0];
  assert.ok(lengthLabel);
  assert.equal(lengthLabel.includes("rgba(247,249,251,0.88)"), false);
});

test("finished open and closed curves use the ordinary long-press editor", async () => {
  const source = await readFile(
    new URL("../src/components/designer/design-canvas.tsx", import.meta.url),
    "utf8",
  );
  const holdBody = source.match(/const startCadHold = \(id: string\) => \{([\s\S]*?)\n  \};/)?.[1];
  assert.ok(holdBody);
  assert.equal(holdBody.includes("face?.spline"), false);
  assert.match(holdBody, /window\.setTimeout\(\(\) => \{/);
  assert.match(source, /hitStrokeWidth=\{poly\.type === "line" \? 24 : "auto"\}/);
});

test("curves use their dedicated total-and-segment length pad while drawing and editing", async () => {
  const source = await readFile(
    new URL("../src/components/designer/designer-app.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /const editingDrawnCurve = Boolean\(/);
  assert.match(source, /function SplineLengthsPad\(/);
  assert.match(source, /<SplineLengthsPad/);
  assert.match(source, /tool === "draw" && drawSub === "spline"/);
  assert.match(source, /cadEditId && editingDrawnCurve && !draft\.points\.length/);
  assert.match(source, /const totalLength = lengths\.reduce/);
  assert.match(source, /sideLetter\(index\)/);
  assert.match(source, /const applySegmentLength = \(index: number\) =>/);
  assert.match(source, /const addNextSegment = \(\) =>/);
  assert.match(source, /splinePreview\?\.faceId === faceId/);
  assert.match(source, /!editingDrawnCurve &&/);
  assert.match(
    source,
    /!\(tool === "draw" && drawSub === "spline"\) &&\s+!editingFreeformFace &&\s+!editingDrawnCurve &&/,
  );
});

test("curve edit previews publish live control points for immediate panel recalculation", async () => {
  const source = await readFile(
    new URL("../src/components/designer/design-canvas.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /useProject\.setState\(\{ splinePreview: \{ faceId: face\.id, points: next \} \}\)/,
  );
  assert.match(source, /useProject\.setState\(\{ splinePreview: null \}\)/);
});

test("curve and freehand omit helper dashes and snap their final endpoints", async () => {
  const source = await readFile(
    new URL("../src/components/designer/design-canvas.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /dash=\{drawSub === "freehand" \|\| drawSub === "spline" \? undefined : \[6, 4\]\}/,
  );
  assert.match(
    source,
    /drawSub !== "polygon" &&\s+drawSub !== "spline" &&\s+drawSub !== "freehand" &&/,
  );
  assert.match(source, /st\.drawSub === "line" \|\|\s+st\.drawSub === "spline"/);
  assert.match(
    source,
    /st\.drawSub === "spline" && st\.snapOn && snapped\.kind !== "close"/,
  );
  assert.match(source, /if \(points\.length >= 3 && dist\(first, last\) <= closeTolerance\)/);
  assert.match(source, /points\[lastIndex\] = \{ \.\.\.boundary\.pt \}/);
});

test("a new curve snaps to an open curve endpoint and closes at its opposite endpoint", async () => {
  const source = await readFile(
    new URL("../src/components/designer/design-canvas.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /const endpoint = nearestOpenSplineEndpoint\(/);
  assert.match(source, /return \{ pt: endpoint\.pt, kind: "end" as const, faceId: endpoint\.faceId \}/);
  assert.match(source, /const continuation =\s+current\.length && st\.snapOn/);
  assert.match(source, /dist\(continuation\.opposite, p\) < closeM/);
  assert.match(source, /st\.setDraftPoints\(\[\.\.\.current, \{ \.\.\.continuation\.opposite \}]/);
  assert.match(source, /useProject\.getState\(\)\.finishOpenDraw\(\)/);
});

test("primary modes keep panels closed until an object is chosen", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { useProject } = await server.ssrLoadModule("/src/lib/project-store.ts");
    const store = useProject;

    store.setState({ rightOpen: true, catalogOpen: false, catalogVisible: true, tool: null });
    store.getState().setTool("draw");
    assert.equal(store.getState().rightOpen, false);
    assert.equal(store.getState().catalogOpen, false);

    store.getState().selectPoly("face-test");
    assert.equal(store.getState().rightOpen, true);
    assert.equal(store.getState().rightMode, "drawing");

    store.setState({ cadEditId: "face-test", selectedPolyId: "face-test", selectedPolyIds: ["face-test"] });
    store.getState().setDrawSub("line");
    assert.equal(store.getState().rightOpen, false);
    assert.equal(store.getState().cadEditId, null);
    assert.equal(store.getState().selectedPolyId, null);
    assert.deepEqual(store.getState().selectedPolyIds, []);
    assert.equal(store.getState().drawSub, "line");

    store.setState({ rightOpen: true, catalogVisible: true });
    store.getState().setCatalogOpen(true);
    assert.equal(store.getState().rightOpen, false);
    assert.equal(store.getState().catalogOpen, true);
    assert.equal(store.getState().catalogVisible, false);

    store.getState().setFamily("mp");
    assert.equal(store.getState().catalogVisible, true);

    store.setState({ rightOpen: false });
    store.getState().placeHead({ x: 1, y: 1 });
    assert.equal(store.getState().rightOpen, true);
    assert.equal(store.getState().rightMode, "object");
  } finally {
    await server.close();
  }
});
