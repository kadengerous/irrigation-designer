import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("layer purpose persists, supports undo, and excludes unwatered areas without changing geometry", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  let store, before;
  try {
    const { emptyDrawing, layerPurpose, FACE_TEXTURES, faceTexture, texturePatternScale } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const { addRect, duplicateFace, toPolygons } = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const { inIrrigable, exclusionLoops } = await server.ssrLoadModule("/src/lib/cad/irrigation-geom.ts");
    const { exclusionPolygons } = await server.ssrLoadModule("/src/lib/coverage.ts");
    const { emptyProject } = await server.ssrLoadModule("/src/lib/project-types.ts");
    const { parseProjectFile } = await server.ssrLoadModule("/src/lib/project-file.ts");
    ({ useProject: store } = await server.ssrLoadModule("/src/lib/project-store.ts"));
    before = store.getState();
    let drawing = addRect(emptyDrawing(), { x: 0, y: 0 }, { x: 20, y: 20 }, "lawn");
    drawing = addRect(drawing, { x: 5, y: 5 }, { x: 9, y: 9 }, "lawn");
    const face = Object.values(drawing.faces).find((face) => face.rect?.w === 4);
    assert.ok(face);
    face.name = "Garden";
    face.fill = "#72a88a";
    face.hydro = { need: "high", method: "mp" };
    const id = face.id;
    const geometry = JSON.stringify({ vertices: drawing.vertices, edges: drawing.edges, rect: face.rect, outer: face.outer });
    const snapshot = JSON.stringify(drawing);
    store.setState({ project: { ...emptyProject(), drawing, polygons: toPolygons(drawing) }, past: [], future: [], selectedPolyId: id, selectedPolyIds: [id], cadEditId: null });
    const latest = () => store.getState().project.drawing;
    assert.equal(layerPurpose(face), "irrigation");
    assert.equal(layerPurpose({ ...face, type: "building", hydro: undefined }), "none");
    assert.equal(inIrrigable({ x: 7, y: 7 }, drawing), true);

    store.getState().setLayerPurpose(id, "none");
    assert.equal(layerPurpose(latest().faces[id]), "none");
    assert.equal(inIrrigable({ x: 7, y: 7 }, latest()), false);
    assert.equal(inIrrigable({ x: 2, y: 2 }, latest()), true);
    assert.equal(exclusionLoops(latest()).length, 1);
    assert.equal(exclusionPolygons(store.getState().project.polygons).length, 1);
    assert.equal(latest().faces[id].type, "lawn", "original landscape type is preserved");
    assert.equal(JSON.stringify({ vertices: latest().vertices, edges: latest().edges, rect: latest().faces[id].rect, outer: latest().faces[id].outer }), geometry);
    assert.equal(JSON.stringify(drawing), snapshot, "the previous drawing is immutable");
    const restored = parseProjectFile(JSON.stringify({ type: "irrigationproject", schemaVersion: 1, project: store.getState().project })).project;
    assert.equal(layerPurpose(restored.drawing.faces[id]), "none");
    store.getState().undo();
    assert.equal(layerPurpose(latest().faces[id]), "irrigation");
    store.getState().redo();
    assert.equal(layerPurpose(latest().faces[id]), "none");

    for (const purpose of ["sun", "shade", "irrigation"]) {
      store.getState().setLayerPurpose(id, purpose);
      const updated = latest().faces[id];
      assert.equal(layerPurpose(updated), purpose);
      assert.equal(inIrrigable({ x: 7, y: 7 }, latest()), true);
      assert.equal(exclusionPolygons(store.getState().project.polygons).length, 0);
      assert.equal(updated.hydro.need, "high", "sun and shade do not invent watering requirements");
      assert.equal(updated.hydro.method, "mp");
      assert.equal(updated.fill, face.fill);
      assert.equal(updated.name, face.name);
      const copy = duplicateFace(latest(), id, 25, 0).drawing;
      const added = Object.values(copy.faces).find((candidate) => !latest().faces[candidate.id]);
      assert.ok(added);
      assert.equal(layerPurpose(added), purpose);
    }
    store.getState().setLayerPurpose(id, "shade");
    store.getState().setHydro("low", "drip");
    assert.equal(layerPurpose(latest().faces[id]), "shade", "changing irrigation hardware preserves exposure");

    assert.equal(FACE_TEXTURES.length, 18, "the palette still fills three six-column rows");
    assert.ok(!FACE_TEXTURES.some((texture) => ["texture:lawn", "texture:vegetable-beds"].includes(texture.id)));
    for (const retired of ["texture:lawn", "texture:vegetable-beds"])
      assert.ok(faceTexture(retired), "retired materials still render in saved projects");
    for (const material of ["texture:mulch", "texture:pebbles"])
      assert.equal(texturePatternScale(material), 0.24 / 4, "material details are four times smaller");

    for (const texture of FACE_TEXTURES) {
      store.getState().setLayerPurpose(id, "shade");
      const previousFace = latest().faces[id];
      const previousHistory = store.getState().past.length;
      store.getState().setFaceFill(texture.id);
      assert.equal(latest().faces[id].fill, texture.id);
      assert.equal(layerPurpose(latest().faces[id]), "none", `${texture.label} switches off irrigation`);
      assert.equal(inIrrigable({ x: 7, y: 7 }, latest()), false);
      assert.equal(inIrrigable({ x: 2, y: 2 }, latest()), true, "surrounding area stays irrigable");
      assert.equal(exclusionPolygons(store.getState().project.polygons).length, 1);
      assert.equal(latest().faces[id].hydro.method, "drip", "hardware preference is retained for manual re-enabling");
      assert.equal(latest().faces[id].hydro.need, "low");
      assert.equal(latest().faces[id].name, face.name);
      assert.equal(JSON.stringify({ vertices: latest().vertices, edges: latest().edges, rect: latest().faces[id].rect, outer: latest().faces[id].outer }), geometry);
      assert.equal(store.getState().past.length, previousHistory + 1, "material and purpose form one undo step");
      store.getState().undo();
      assert.deepEqual(latest().faces[id], previousFace);
      store.getState().redo();
      assert.equal(latest().faces[id].fill, texture.id);
      assert.equal(layerPurpose(latest().faces[id]), "none");
    }
    const materialProject = parseProjectFile(JSON.stringify({ type: "irrigationproject", schemaVersion: 1, project: store.getState().project })).project;
    assert.equal(materialProject.drawing.faces[id].fill, "texture:rubber-surface");
    assert.equal(layerPurpose(materialProject.drawing.faces[id]), "none");
    store.getState().setLayerPurpose(id, "irrigation");
    assert.equal(inIrrigable({ x: 7, y: 7 }, latest()), true, "irrigation can be explicitly re-enabled on a material");
    store.getState().setFaceFill("#ffffff");
    assert.equal(layerPurpose(latest().faces[id]), "irrigation", "ordinary colors do not turn off irrigation");

    const locked = { ...latest(), faces: { ...latest().faces, [id]: { ...latest().faces[id], locked: true } } };
    store.setState({ project: { ...store.getState().project, drawing: locked } });
    const lockedState = store.getState();
    store.getState().setLayerPurpose(id, "sun");
    assert.equal(store.getState(), lockedState);
    store.getState().setFaceFill("texture:mulch");
    assert.equal(store.getState(), lockedState, "a locked face cannot change material or purpose");
  } finally {
    if (store && before) store.setState(before, true);
    await server.close();
  }
});
