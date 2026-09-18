import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("an open segment does not turn an existing face into a newly created face", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { addChain, faceBoundaryKey } = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const addSegment = (drawing, a, b) => addChain(drawing, [a, b], false, "lawn");

    let drawing = emptyDrawing();
    drawing = addSegment(drawing, { x: 0, y: 0 }, { x: 4, y: 0 });
    drawing = addSegment(drawing, { x: 4, y: 0 }, { x: 4, y: 3 });
    drawing = addSegment(drawing, { x: 4, y: 3 }, { x: 0, y: 3 });
    assert.equal(Object.keys(drawing.faces).length, 0);

    drawing = addSegment(drawing, { x: 0, y: 3 }, { x: 0, y: 0 });
    const originalFace = Object.values(drawing.faces)[0];
    assert.ok(originalFace);
    const originalId = originalFace.id;
    const originalBoundary = faceBoundaryKey(originalFace);

    const withNextOpenSegment = addSegment(drawing, { x: 10, y: 10 }, { x: 12, y: 10 });
    const remainingFace = Object.values(withNextOpenSegment.faces)[0];
    assert.equal(Object.keys(withNextOpenSegment.faces).length, 1);
    assert.ok(remainingFace);
    assert.equal(remainingFace.id, originalId, "an unchanged face keeps its stable identity");
    assert.equal(faceBoundaryKey(remainingFace), originalBoundary);
  } finally {
    await server.close();
  }
});

test("point handles commit exactly and deleting another face keeps point editing", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const {
      addChain,
      addRect,
      deleteFace,
      faceVertices,
      markPointShape,
      setPointShapeVertices,
    } = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const points = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 5, y: 2 },
      { x: 4, y: 5 },
      { x: 1, y: 5 },
      { x: 0, y: 3 },
    ];
    let drawing = addChain(emptyDrawing(), points, true, "lawn");
    const pointFaceId = Object.keys(drawing.faces)[0];
    assert.ok(pointFaceId);
    drawing = markPointShape(drawing, pointFaceId);
    drawing = addRect(drawing, { x: 10, y: 0 }, { x: 14, y: 3 }, "lawn");
    const rectangleId = Object.keys(drawing.faces).find((id) => id !== pointFaceId);
    assert.ok(rectangleId);

    const before = faceVertices(drawing, pointFaceId).map(({ x, y }) => ({ x, y }));
    const movedIndex = 3;
    const target = { x: before[movedIndex].x + 2.37, y: before[movedIndex].y - 1.14 };
    const next = before.map((point, index) => (index === movedIndex ? target : point));
    drawing = setPointShapeVertices(drawing, pointFaceId, next);
    const afterMove = faceVertices(drawing, pointFaceId).map(({ x, y }) => ({ x, y }));
    assert.deepEqual(afterMove[movedIndex], target, "the dragged point stays exactly where released");
    afterMove.forEach((point, index) => {
      if (index !== movedIndex) assert.deepEqual(point, before[index], `point ${index + 1} does not jump`);
    });

    drawing = deleteFace(drawing, rectangleId);
    assert.ok(drawing.faces[pointFaceId], "deleting another face keeps the point face identity");
    assert.equal(drawing.faces[pointFaceId].pointShape, true, "numbered-point editing is preserved");
    assert.deepEqual(
      faceVertices(drawing, pointFaceId).map(({ x, y }) => ({ x, y })),
      afterMove,
      "deleting another face does not move the point contour",
    );
  } finally {
    await server.close();
  }
});

test("a point contour recreated after deletion keeps numbered-point editing", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { useProject } = await server.ssrLoadModule("/src/lib/project-store.ts");
    const { emptyProject } = await server.ssrLoadModule("/src/lib/project-types.ts");
    const { drawingOrMigrate, isTriangleFace } = await server.ssrLoadModule(
      "/src/lib/cad/engine.ts",
    );
    const first = [
      { x: -4, y: 3 },
      { x: 0, y: 0 },
      { x: 4, y: -1 },
      { x: 7, y: 2 },
    ];
    const second = [
      { x: -6, y: 4 },
      { x: 1, y: 0 },
      { x: 5, y: -2 },
      { x: 8, y: 1 },
    ];

    useProject.setState({
      project: emptyProject(),
      tool: "draw",
      drawSub: "polygon",
      selectedPolyId: null,
      selectedPolyIds: [],
      selectedEdgeId: null,
      cadEditId: null,
    });
    useProject.getState().setDraftPoints(first);
    useProject.getState().closePolygon();
    const firstId = useProject.getState().cadEditId;
    assert.ok(firstId);
    assert.equal(useProject.getState().project.drawing.faces[firstId].pointShape, true);

    useProject.getState().deleteSelected();
    assert.equal(Object.keys(useProject.getState().project.drawing.faces).length, 0);

    useProject.setState({ tool: "draw", drawSub: "polygon" });
    useProject.getState().setDraftPoints(second);
    useProject.getState().closePolygon();
    const secondId = useProject.getState().cadEditId;
    assert.ok(secondId);
    assert.equal(
      useProject.getState().project.drawing.faces[secondId].pointShape,
      true,
      "the replacement contour must retain its numbered-point identity",
    );
    assert.equal(
      isTriangleFace(drawingOrMigrate(useProject.getState().project), secondId),
      false,
      "a three-point numbered contour must not switch to the ordinary triangle editor",
    );
  } finally {
    await server.close();
  }
});

test("deleting a rectangle keeps an unrelated exact circle", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { addCircle, addRect, deleteFace, toPolygons } = await server.ssrLoadModule(
      "/src/lib/cad/engine.ts",
    );
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");

    let drawing = addCircle(emptyDrawing(), { x: 2, y: 3 }, 1.75, "lawn");
    const circleId = Object.keys(drawing.faces)[0];
    assert.ok(circleId);
    assert.deepEqual(drawing.faces[circleId].circle, { cx: 2, cy: 3, r: 1.75 });

    drawing = addRect(drawing, { x: 10, y: 0 }, { x: 14, y: 4 }, "lawn");
    const rectangleId = Object.keys(drawing.faces).find((id) => id !== circleId);
    assert.ok(rectangleId);
    assert.ok(drawing.faces[circleId], "adding an edge-based face keeps the circle");

    drawing = deleteFace(drawing, rectangleId);
    assert.deepEqual(Object.keys(drawing.faces), [circleId]);
    assert.deepEqual(
      drawing.faces[circleId].circle,
      { cx: 2, cy: 3, r: 1.75 },
      "deleting another face preserves the exact circle geometry",
    );
    const polygons = toPolygons(drawing);
    assert.equal(polygons.length, 1);
    assert.equal(polygons[0].id, circleId);
    assert.equal(polygons[0].type, "circle");
  } finally {
    await server.close();
  }
});

test("freehand closes independently and never grows a touched figure", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { addCircle, addFreehandStroke, addRect, faceArea, facePoints } = await server.ssrLoadModule(
      "/src/lib/cad/engine.ts",
    );
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");

    const closedStroke = [
      { x: 0, y: 0 },
      { x: 2, y: -0.12 },
      { x: 4, y: 0 },
      { x: 4.12, y: 2 },
      { x: 4, y: 4 },
      { x: 2, y: 4.12 },
      { x: 0, y: 4 },
      { x: -0.12, y: 2 },
      { x: 0.04, y: 0.03 },
    ];
    const closed = addFreehandStroke(emptyDrawing(), closedStroke, "lawn", {
      closeTolerance: 0.2,
      smoothTolerance: 0.03,
    });
    assert.equal(closed.closed, true);
    assert.ok(closed.faceId);
    assert.equal(Object.keys(closed.drawing.faces).length, 1);
    assert.ok(facePoints(closed.drawing, closed.faceId).length > closedStroke.length);

    let drawing = addRect(emptyDrawing(), { x: 0, y: 0 }, { x: 4, y: 4 }, "lawn");
    const originalId = Object.keys(drawing.faces)[0];
    const originalArea = faceArea(drawing, originalId);
    const attachedStroke = [
      { x: 1, y: 0.02 },
      { x: 1, y: -0.7 },
      { x: 1.5, y: -1.2 },
      { x: 2.5, y: -1.25 },
      { x: 3, y: -0.7 },
      { x: 3, y: 0.02 },
    ];
    const attached = addFreehandStroke(drawing, attachedStroke, "lawn", {
      closeTolerance: 0.15,
      attachTolerance: 0.15,
      smoothTolerance: 0.02,
    });
    assert.equal(attached.closed, false);
    assert.equal(attached.attached, false);
    assert.ok(attached.faceId);
    assert.equal(Object.keys(attached.drawing.faces).length, 2);
    assert.equal(faceArea(attached.drawing, originalId), originalArea);
    assert.ok(attached.drawing.faces[attached.faceId].freehand);

    drawing = addCircle(emptyDrawing(), { x: 0, y: 0 }, 2, "lawn");
    const circleId = Object.keys(drawing.faces)[0];
    const circleArea = faceArea(drawing, circleId);
    const circleGrowth = addFreehandStroke(
      drawing,
      [
        { x: -1, y: -1.72 },
        { x: -1.2, y: -2.4 },
        { x: 0, y: -3.1 },
        { x: 1.2, y: -2.4 },
        { x: 1, y: -1.72 },
      ],
      "lawn",
      { closeTolerance: 0.1, attachTolerance: 0.18, smoothTolerance: 0.02 },
    );
    assert.equal(circleGrowth.attached, false);
    assert.ok(circleGrowth.faceId);
    assert.equal(Object.keys(circleGrowth.drawing.faces).length, 2);
    assert.equal(faceArea(circleGrowth.drawing, circleId), circleArea);
  } finally {
    await server.close();
  }
});

test("an open curve stays independent of a touched figure", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { addCircle, addRect, addSplineStroke, updateSpline } = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const controls = [
      { x: 1, y: 0.02 }, { x: 1.25, y: -1.25 }, { x: 3, y: -2 },
      { x: 4.75, y: -1.2 }, { x: 5, y: 0.02 },
    ];
    for (const base of [
      addRect(emptyDrawing(), { x: 0, y: 0 }, { x: 6, y: 4 }, "lawn"),
      addCircle(emptyDrawing(), { x: 3, y: 0 }, 2, "lawn"),
    ]) {
      const baseId = Object.keys(base.faces)[0];
      const result = addSplineStroke(base, controls, "lawn", { attachTolerance: 0.16 });
      assert.equal(result.attached, false);
      assert.ok(result.faceId);
      assert.equal(Object.keys(result.drawing.faces).length, 2);
      assert.deepEqual(result.drawing.faces[baseId], base.faces[baseId]);
      assert.deepEqual(result.drawing.edges, base.edges);
      assert.deepEqual(result.drawing.vertices, base.vertices);
      assert.deepEqual(result.drawing.faces[result.faceId].spline.pts, controls);
      const edited = updateSpline(result.drawing, result.faceId,
        controls.map((p, i) => i === 2 ? { x: 3, y: 1 } : p));
      assert.equal(Object.keys(edited.faces).length, 2);
      assert.deepEqual(edited.faces[baseId], base.faces[baseId]);
      assert.deepEqual(edited.edges, base.edges);
    }
  } finally {
    await server.close();
  }
});

test("a finished open curve can be extended repeatedly and closed at its opposite endpoint", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { addSpline, addSplineStroke, faceArea, nearestOpenSplineEndpoint } =
      await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const original = [
      { x: 0, y: 0 },
      { x: 2, y: 0.5 },
      { x: 4, y: 0 },
    ];
    const first = addSpline(emptyDrawing(), original, false, "lawn");
    const faceId = Object.keys(first.faces)[0];

    const endpoint = nearestOpenSplineEndpoint(first, { x: 4.04, y: 0.02 }, 0.1);
    assert.ok(endpoint);
    assert.equal(endpoint.faceId, faceId);
    assert.equal(endpoint.endpoint, "end");
    assert.deepEqual(endpoint.pt, original.at(-1));

    const extended = addSplineStroke(
      first,
      [
        { x: 4.04, y: 0.02 },
        { x: 5.5, y: 1.5 },
        { x: 6, y: 3 },
      ],
      "lawn",
      { attachTolerance: 0.1 },
    );
    assert.equal(extended.attached, true);
    assert.equal(extended.closed, false);
    assert.equal(extended.faceId, faceId, "continuation keeps the original curve identity");
    assert.equal(Object.keys(extended.drawing.faces).length, 1);
    assert.deepEqual(extended.drawing.faces[faceId].spline.pts.slice(0, 3), original);
    assert.deepEqual(extended.drawing.faces[faceId].spline.pts.at(-1), { x: 6, y: 3 });

    const completed = addSplineStroke(
      extended.drawing,
      [
        { x: 6.03, y: 3.02 },
        { x: 3.5, y: 4 },
        { x: 0.03, y: 0.02 },
      ],
      "lawn",
      { attachTolerance: 0.1 },
    );
    assert.equal(completed.attached, true);
    assert.equal(completed.closed, true);
    assert.equal(completed.faceId, faceId, "closing keeps the original curve identity");
    assert.equal(Object.keys(completed.drawing.faces).length, 1);
    assert.equal(completed.drawing.faces[faceId].spline.closed, true);
    assert.ok(faceArea(completed.drawing, faceId) > 1);
  } finally {
    await server.close();
  }
});

test("separate pencil strokes join at their endpoints and close as one figure", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { addFreehandStroke, faceArea } = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const options = { closeTolerance: 0.12, attachTolerance: 0.12, smoothTolerance: 0.01 };

    const first = addFreehandStroke(
      emptyDrawing(),
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 2 },
      ],
      "lawn",
      options,
    );
    assert.equal(first.closed, false);
    assert.ok(first.faceId);
    assert.equal(Object.keys(first.drawing.faces).length, 1);

    const completed = addFreehandStroke(
      first.drawing,
      [
        { x: 3.03, y: 2.02 },
        { x: 1.5, y: 3.2 },
        { x: 0.02, y: 0.03 },
      ],
      "lawn",
      options,
    );
    assert.equal(completed.closed, true);
    assert.ok(completed.faceId);
    assert.equal(Object.keys(completed.drawing.faces).length, 1);
    assert.ok(faceArea(completed.drawing, completed.faceId) > 1);
    assert.equal(
      Object.values(completed.drawing.faces).filter((face) => face.freehand && !face.freehand.closed).length,
      0,
      "the earlier standalone stroke is consumed",
    );
  } finally {
    await server.close();
  }
});

test("pencil started inside a figure stays independent", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { addFreehandStroke, addRect, faceArea } = await server.ssrLoadModule(
      "/src/lib/cad/engine.ts",
    );
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const drawing = addRect(emptyDrawing(), { x: 0, y: 0 }, { x: 4, y: 4 }, "lawn");
    const originalId = Object.keys(drawing.faces)[0];
    const originalArea = faceArea(drawing, originalId);

    const grown = addFreehandStroke(
      drawing,
      [
        { x: 1.5, y: 2 },
        { x: 1.5, y: 0.4 },
        { x: 1.5, y: -0.8 },
        { x: 2.5, y: -1.25 },
        { x: 3.2, y: -0.75 },
        { x: 3.2, y: 0.02 },
      ],
      "lawn",
      { closeTolerance: 0.12, attachTolerance: 0.15, smoothTolerance: 0.01 },
    );

    assert.equal(grown.attached, false);
    assert.ok(grown.faceId);
    assert.equal(Object.keys(grown.drawing.faces).length, 2);
    assert.equal(faceArea(grown.drawing, originalId), originalArea);
  } finally {
    await server.close();
  }
});

test("open curves and pencil strokes stay whole instead of becoming editable CAD segments", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const {
      addFreehandStroke,
      addSpline,
      faceBoundaryKey,
      toPolygons,
      updateSpline,
    } = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const controls = [
      { x: 0, y: 0 },
      { x: 2, y: 1 },
      { x: 4, y: -0.5 },
      { x: 6, y: 2 },
    ];

    let drawing = addSpline(emptyDrawing(), controls, false, "lawn");
    const splineId = Object.keys(drawing.faces)[0];
    assert.ok(splineId);
    assert.equal(Object.keys(drawing.edges).length, 0, "an open curve has no loose CAD sides");
    assert.equal(drawing.faces[splineId].spline.closed, false);
    let polygons = toPolygons(drawing);
    assert.equal(polygons.length, 1);
    assert.equal(polygons[0].id, splineId);
    assert.equal(polygons[0].type, "line");
    assert.ok(polygons[0].points.length > controls.length, "the displayed curve remains smooth");

    const moved = { x: 2.75, y: 3.25 };
    drawing = updateSpline(drawing, splineId, controls.map((point, index) => index === 1 ? moved : point));
    assert.ok(drawing.faces[splineId], "editing keeps the curve identity stable");
    assert.deepEqual(drawing.faces[splineId].spline.pts[1], moved);

    const pencil = addFreehandStroke(
      drawing,
      [
        { x: 10, y: 0 },
        { x: 11, y: 0.4 },
        { x: 12, y: 0.1 },
        { x: 13, y: 1 },
      ],
      "lawn",
      { closeTolerance: 0.1, smoothTolerance: 0.01 },
    );
    assert.ok(pencil.faceId);
    assert.equal(Object.keys(pencil.drawing.edges).length, 0, "a pencil stroke has no loose CAD sides");
    assert.equal(pencil.drawing.faces[pencil.faceId].freehand.closed, false);
    assert.notEqual(
      faceBoundaryKey(pencil.drawing.faces[splineId]),
      faceBoundaryKey(pencil.drawing.faces[pencil.faceId]),
      "multiple standalone drawn objects keep distinct identities",
    );
    polygons = toPolygons(pencil.drawing);
    assert.equal(polygons.length, 2);
    assert.ok(polygons.some((polygon) => polygon.id === pencil.faceId && polygon.type === "line"));
  } finally {
    await server.close();
  }
});

test("closed curve control-point editing preserves its id and does not change another curve", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { addSpline, updateSpline } = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const first = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    const second = [
      { x: 10, y: 0 },
      { x: 13, y: 0 },
      { x: 13, y: 3 },
      { x: 10, y: 3 },
    ];
    let drawing = addSpline(emptyDrawing(), first, true, "lawn");
    const firstId = Object.keys(drawing.faces)[0];
    drawing = addSpline(drawing, second, true, "lawn");
    const secondId = Object.keys(drawing.faces).find((id) => id !== firstId);
    assert.ok(firstId);
    assert.ok(secondId);
    const secondBefore = structuredClone(drawing.faces[secondId].spline.pts);

    const nextFirst = first.map((point, index) => index === 2 ? { x: 6, y: 5 } : point);
    drawing = updateSpline(drawing, firstId, nextFirst);
    assert.ok(drawing.faces[firstId], "the edited closed curve keeps its face id");
    assert.deepEqual(drawing.faces[firstId].spline.pts, nextFirst);
    assert.deepEqual(
      drawing.faces[secondId].spline.pts,
      secondBefore,
      "editing one curve never steals another curve's metadata",
    );
  } finally {
    await server.close();
  }
});

test("editing a segment-built quadrilateral keeps its real vertices and freeform metadata", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { addChain, toPolygons } = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const { useProject } = await server.ssrLoadModule("/src/lib/project-store.ts");

    const points = [
      { x: 0, y: 0 },
      { x: 5, y: 0.2 },
      { x: 4.8, y: 3.1 },
      { x: 0.3, y: 3 },
    ];
    const drawing = addChain(emptyDrawing(), points, true, "lawn");
    const faceId = Object.keys(drawing.faces)[0];
    assert.ok(faceId);
    assert.equal(drawing.faces[faceId].rect, undefined);

    const before = Object.fromEntries(
      Object.entries(drawing.vertices).map(([id, vertex]) => [id, { x: vertex.x, y: vertex.y }]),
    );
    const previousProject = useProject.getState().project;
    useProject.setState({
      project: { ...previousProject, drawing, polygons: toPolygons(drawing) },
      cadEditId: null,
      selectedPolyId: null,
      selectedPolyIds: [],
    });

    useProject.getState().setCadEdit(faceId);
    const edited = useProject.getState().project.drawing;
    assert.ok(edited);
    assert.equal(edited.faces[faceId].rect, undefined);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(edited.vertices).map(([id, vertex]) => [id, { x: vertex.x, y: vertex.y }]),
      ),
      before,
    );

    const stale = structuredClone(drawing);
    stale.faces[faceId].rect = { x: 0, y: 0, w: 5, h: 3, rot: 0 };
    useProject.setState({
      project: { ...previousProject, drawing: stale, polygons: toPolygons(stale) },
      cadEditId: null,
      selectedPolyId: null,
      selectedPolyIds: [],
    });
    useProject.getState().setCadEdit(faceId);
    const repaired = useProject.getState().project.drawing;
    assert.ok(repaired);
    assert.equal(repaired.faces[faceId].rect, undefined);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(repaired.vertices).map(([id, vertex]) => [id, { x: vertex.x, y: vertex.y }]),
      ),
      before,
    );
  } finally {
    await server.close();
  }
});

test("numeric side editing stretches an orthogonal freeform without diagonal breaks", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { addChain, faceEdges, setFaceEdgeLength } = await server.ssrLoadModule(
      "/src/lib/cad/engine.ts",
    );
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    // Same orthogonal outline as the reported A/B/C... editing case.
    const points = [
      { x: 5, y: 0 },
      { x: 5, y: 3 },
      { x: 8, y: 3 },
      { x: 8, y: 8 },
      { x: 0, y: 8 },
      { x: 0, y: 6 },
      { x: 5, y: 6 },
      { x: 5, y: 4 },
      { x: 0, y: 4 },
      { x: 0, y: 0 },
    ];
    const drawing = addChain(emptyDrawing(), points, true, "lawn");
    const faceId = Object.keys(drawing.faces)[0];
    assert.ok(faceId);
    const before = faceEdges(drawing, faceId);
    const sideA = before[0];
    const sideB = before[1];
    const sideJ = before[9];
    assert.ok(sideA);
    assert.ok(sideB);
    assert.ok(sideJ);

    const edited = setFaceEdgeLength(drawing, faceId, sideA.id, 10);
    const after = faceEdges(edited, faceId);
    const editedA = after.find((edge) => edge.id === sideA.id);
    const editedB = after.find((edge) => edge.id === sideB.id);
    const editedJ = after.find((edge) => edge.id === sideJ.id);
    assert.ok(editedA);
    assert.ok(editedB);
    assert.ok(editedJ);
    assert.ok(Math.abs(Math.hypot(editedA.b.x - editedA.a.x, editedA.b.y - editedA.a.y) - 10) < 1e-9);
    assert.ok(Math.abs(editedA.a.x - editedA.b.x) < 1e-9, "A stays vertical");
    assert.ok(Math.abs(editedB.a.y - editedB.b.y) < 1e-9, "B stays horizontal");
    assert.ok(Math.abs(editedJ.a.y - editedJ.b.y) < 1e-9, "J stays horizontal");
    assert.ok(Math.abs(Math.hypot(editedB.b.x - editedB.a.x, editedB.b.y - editedB.a.y) - 3) < 1e-9);
    assert.ok(Math.abs(Math.hypot(editedJ.b.x - editedJ.a.x, editedJ.b.y - editedJ.a.y) - 5) < 1e-9);
    assert.equal(Math.min(editedA.a.y, editedA.b.y), -7, "A grows upward");
  } finally {
    await server.close();
  }
});

test("side letters and inputs share the same corner-to-corner ordering", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { addChain, faceEdges, setFaceSideLength } = await server.ssrLoadModule(
      "/src/lib/cad/engine.ts",
    );
    const { closedPathSideStarts } = await server.ssrLoadModule("/src/lib/geometry.ts");
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    // The stored contour begins in the middle of its top side. The first
    // visible letter must still begin at the next real corner, just like the
    // labels drawn on the canvas.
    const points = [
      { x: 4, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 5 },
      { x: 2, y: 5 },
      { x: 2, y: 10 },
      { x: 8, y: 10 },
      { x: 8, y: 14 },
      { x: 0, y: 14 },
      { x: 0, y: 0 },
    ];
    const drawing = addChain(emptyDrawing(), points, true, "lawn");
    const faceId = Object.keys(drawing.faces)[0];
    assert.ok(faceId);
    const edges = faceEdges(drawing, faceId);
    const starts = closedPathSideStarts(edges.map((edge) => edge.a));
    assert.equal(starts.length, 8, "the split top edge is exposed as one side");
    const sideA = edges[starts[0]];
    assert.ok(sideA);
    assert.equal(Math.hypot(sideA.b.x - sideA.a.x, sideA.b.y - sideA.a.y), 5);

    const edited = setFaceSideLength(drawing, faceId, sideA.id, 7);
    const editedEdges = faceEdges(edited, faceId);
    const editedStarts = closedPathSideStarts(editedEdges.map((edge) => edge.a));
    const editedAStart = editedEdges[editedStarts[0]].a;
    const editedAEnd = editedEdges[editedStarts[1]].a;
    assert.equal(Math.hypot(editedAEnd.x - editedAStart.x, editedAEnd.y - editedAStart.y), 7);
  } finally {
    await server.close();
  }
});

test("editing one point-built side changes only that side and its preceding neighbour", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { addChain, faceEdges, setFaceSideLength } = await server.ssrLoadModule(
      "/src/lib/cad/engine.ts",
    );
    const { closedPathSideStarts } = await server.ssrLoadModule("/src/lib/geometry.ts");
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const points = [
      { x: 8, y: 0 },
      { x: 10, y: 4 },
      { x: 6, y: 8 },
      { x: 3, y: 9 },
      { x: 0, y: 6 },
      { x: 1, y: 2 },
    ];
    const drawing = addChain(emptyDrawing(), points, true, "lawn");
    const faceId = Object.keys(drawing.faces)[0];
    assert.ok(faceId);
    drawing.faces[faceId].pointShape = true;
    const before = faceEdges(drawing, faceId);
    const starts = closedPathSideStarts(before.map((edge) => edge.a));
    const sides = starts.map((start, index) => ({
      id: before[start].id,
      a: before[start].a,
      b: before[starts[(index + 1) % starts.length]].a,
    }));
    const beforeLengths = sides.map((side) => Math.hypot(side.b.x - side.a.x, side.b.y - side.a.y));
    const target = beforeLengths[1] + 5;

    const edited = setFaceSideLength(drawing, faceId, sides[1].id, target);
    const after = faceEdges(edited, faceId);
    const afterStarts = closedPathSideStarts(after.map((edge) => edge.a));
    const afterLengths = afterStarts.map((start, index) => {
      const a = after[start].a;
      const b = after[afterStarts[(index + 1) % afterStarts.length]].a;
      return Math.hypot(b.x - a.x, b.y - a.y);
    });

    assert.ok(Math.abs(afterLengths[1] - target) < 1e-9, "B receives the entered length");
    assert.notEqual(afterLengths[0], beforeLengths[0], "A compensates at the shared vertex");
    for (let index = 2; index < beforeLengths.length; index += 1) {
      assert.ok(
        Math.abs(afterLengths[index] - beforeLengths[index]) < 1e-9,
        `side ${index} remains unchanged`,
      );
    }
  } finally {
    await server.close();
  }
});

test("moving a shape snaps its boundary to grid lines instead of its center", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { ellipseBoundaryGridAnchors, snapShapeTranslationToGrid } =
      await server.ssrLoadModule("/src/lib/geometry.ts");
    const boundary = [
      { x: 0.18, y: 0.17 },
      { x: 0.78, y: 0.17 },
      { x: 0.78, y: 0.77 },
      { x: 0.18, y: 0.77 },
    ];
    const snapped = snapShapeTranslationToGrid(boundary, 0, 0, 1, 100);
    assert.ok(Math.abs(snapped.dx + 0.18) < 1e-9, "left edge snaps to the vertical line");
    assert.ok(Math.abs(snapped.dy + 0.17) < 1e-9, "top edge snaps to the horizontal line");
    assert.ok(Math.abs(0.18 + snapped.dx) < 1e-9);
    assert.ok(Math.abs(0.17 + snapped.dy) < 1e-9);

    const fineGrid = snapShapeTranslationToGrid(
      [{ x: 0.093, y: 0.207 }],
      0,
      0,
      0.1,
      240,
    );
    assert.ok(Math.abs(fineGrid.dx - 0.007) < 1e-9, "works on a 10 cm grid");
    assert.ok(Math.abs(fineGrid.dy + 0.007) < 1e-9, "snaps both axes at an intersection");

    const ellipse = ellipseBoundaryGridAnchors(10.18, 20.17, 4, 2, 45);
    const extent = Math.sqrt(10);
    assert.ok(Math.abs(ellipse[0].x - (10.18 - extent)) < 1e-9, "rotated left edge is exact");
    assert.ok(Math.abs(ellipse[2].y - (20.17 - extent)) < 1e-9, "rotated top edge is exact");
    const snappedEllipse = snapShapeTranslationToGrid(ellipse, 0, 0, 1, 100);
    assert.ok(
      Math.abs(ellipse[0].x + snappedEllipse.dx - 7) < 1e-9,
      "ellipse edge snaps to the vertical grid line",
    );
    assert.ok(
      Math.abs(ellipse[2].y + snappedEllipse.dy - 17) < 1e-9,
      "ellipse edge snaps to the horizontal grid line",
    );
  } finally {
    await server.close();
  }
});

test("numeric point construction continues the last segment direction", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { useProject } = await server.ssrLoadModule("/src/lib/project-store.ts");
    const { emptyProject } = await server.ssrLoadModule("/src/lib/project-types.ts");
    const points = [
      { x: -3, y: -3 },
      { x: 1, y: 2 },
      { x: 4, y: 6 },
    ];

    for (const drawSub of ["polygon", "spline"]) {
      useProject.setState({
        project: emptyProject(),
        tool: "draw",
        drawSub,
        draft: { points },
      });
      useProject.getState().applyCadLength(10, { x: -100, y: 100 });

      const result = useProject.getState().draft.points;
      assert.deepEqual(result.slice(0, -1), points, `${drawSub}: existing points remain fixed`);
      assert.ok(Math.abs(result.at(-1).x - 10) < 1e-9, `${drawSub}: x continues the segment`);
      assert.ok(Math.abs(result.at(-1).y - 14) < 1e-9, `${drawSub}: y continues the segment`);
    }
  } finally {
    await server.close();
  }
});
