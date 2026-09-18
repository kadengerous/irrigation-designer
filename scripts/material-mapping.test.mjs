import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { Line } from "konva/lib/shapes/Line.js";
import { Circle } from "konva/lib/shapes/Circle.js";
import { Ellipse } from "konva/lib/shapes/Ellipse.js";

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
function texturePoint(node, u = 27, v = 19) {
  const r = node.fillPatternRotation() * Math.PI / 180;
  const x = u * node.fillPatternScaleX(), y = v * node.fillPatternScaleY();
  return node.getTransform().point({ x: node.fillPatternX() + x * Math.cos(r) - y * Math.sin(r),
    y: node.fillPatternY() + x * Math.sin(r) + y * Math.cos(r) });
}
const nearPoint = (a, b) => { near(a.x, b.x); near(a.y, b.y); };

test("startup restoration retains materials and repairs previously stripped display polygons", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { migrateProject } = await server.ssrLoadModule("/src/lib/project-store.ts");
    const { emptyProject } = await server.ssrLoadModule("/src/lib/project-types.ts");
    const { emptyDrawing, ALL_FACE_TEXTURES } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const { addRect, setFaceFill, toPolygons } = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const base = addRect(emptyDrawing(), { x: 0, y: 0 }, { x: 10, y: 6 }, "building");
    const id = Object.keys(base.faces)[0];
    for (const fill of [...ALL_FACE_TEXTURES.map(t => t.id), "transparent", "#ffffff"]) {
      const drawing = setFaceFill(base, id, fill);
      const original = { ...emptyProject(), drawing, polygons: toPolygons(drawing) };
      const reload = p => migrateProject(JSON.parse(JSON.stringify(p)));
      const restored = reload(reload(original));
      assert.equal(restored.polygons[0].fill, fill);
      assert.equal(restored.drawing.faces[id].fill, fill);
      assert.deepEqual(restored.polygons[0].textureSize, original.polygons[0].textureSize);
      const damaged = JSON.parse(JSON.stringify(original));
      delete damaged.polygons[0].fill;
      delete damaged.polygons[0].textureSize;
      assert.deepEqual(reload(damaged).polygons, original.polygons);
      const legacy = { ...original, drawing: undefined };
      assert.deepEqual(reload(legacy).polygons[0].textureSize, original.polygons[0].textureSize);
      assert.equal(reload(legacy).polygons[0].fill, fill);
    }
    const hidden = setFaceFill(base, id, "texture:roof-tile");
    hidden.faces[id].hidden = true;
    assert.deepEqual(migrateProject({ ...emptyProject(), drawing: hidden, polygons: toPolygons(base) }).polygons, []);
  } finally { await server.close(); }
});

test("material texel size stays fixed during resizing and only follows viewport zoom", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { bindMaterialPattern } = await server.ssrLoadModule("/src/components/designer/material-pattern.ts");
    const reference = { width:10,height:6 };
    const line = new Line({ points:[0,0,360,0,360,216,0,216],closed:true });
    let detach = bindMaterialPattern(line,"texture:decking",reference,36,0);
    near(line.fillPatternScaleX(),0.24);
    line.points([0,0,720,0,720,432,0,432]);
    near(line.fillPatternScaleX(),0.24);near(line.fillPatternScaleY(),0.24);
    line.scale({x:2,y:3});
    near(line.fillPatternScaleX()*line.scaleX(),0.24);
    near(line.fillPatternScaleY()*line.scaleY(),0.24);
    line.scale({x:1,y:1});detach();
    detach=bindMaterialPattern(line,"texture:decking",reference,72,90);
    near(line.fillPatternScaleX(),0.48);near(line.fillPatternRotation(),90);
    detach();line.destroy();
    for(const shape of [new Circle({radius:100}),new Ellipse({radiusX:100,radiusY:60})]) {
      const stop=bindMaterialPattern(shape,"texture:decking",reference,36,90);
      if(shape.getClassName()==="Circle")shape.radius(250);else {shape.radiusX(300);shape.radiusY(30);}
      near(shape.fillPatternScaleX(),0.24);near(shape.fillPatternScaleY(),0.24);
      near(shape.fillPatternRotation(),90);stop();shape.destroy();
    }
  } finally { await server.close(); }
});

test("texture size survives edits, duplication, project files, undo and older saved faces", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  let store, previous;
  try {
    const { addRect, setFaceTextureRotation, setFaceFill, moveFace, scaleFaceAbout, rotateFace, duplicateFace, toPolygons } = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const { emptyProject } = await server.ssrLoadModule("/src/lib/project-types.ts");
    const { parseProjectFile } = await server.ssrLoadModule("/src/lib/project-file.ts");
    ({ useProject: store } = await server.ssrLoadModule("/src/lib/project-store.ts"));
    previous = store.getState();
    let drawing = addRect(emptyDrawing(), { x: 10, y: 5 }, { x: 20, y: 11 }, "building");
    const id = Object.keys(drawing.faces)[0];
    drawing = setFaceFill(drawing, id, "texture:roof-tile");
    drawing = setFaceTextureRotation(drawing,id,90);
    const reference = { width: 10, height: 6 };
    assert.deepEqual(drawing.faces[id].textureSize, reference);
    const scaled = scaleFaceAbout(moveFace(drawing, id, 3, 2), id, 0.5);
    const rotated = rotateFace(scaled, id, 45);
    assert.deepEqual(rotated.faces[id].textureSize, reference);
    const copy = duplicateFace(rotated, id, 4, 3);
    assert.deepEqual(copy.drawing.faces[copy.id].textureSize, reference);
    assert.equal(copy.drawing.faces[copy.id].textureRotation,90);
    assert.equal(toPolygons(copy.drawing).find(p=>p.id===copy.id).textureRotation,90);
    assert.deepEqual(toPolygons(copy.drawing).find(p => p.id === copy.id).textureSize, reference);
    const project = { ...emptyProject(), drawing: copy.drawing, polygons: toPolygons(copy.drawing) };
    assert.deepEqual(parseProjectFile(JSON.stringify({ project })).project.drawing.faces[id].textureSize, reference);
    assert.equal(parseProjectFile(JSON.stringify({ project })).project.drawing.faces[id].textureRotation,90);
    store.setState({ project: { ...project, drawing, polygons: toPolygons(drawing) }, past: [], future: [], cadEditId: id, selectedPolyId: id, selectedPolyIds: [id] });
    store.getState().commitDrawing(scaled, id, true);
    store.getState().undo();
    assert.deepEqual(store.getState().project.drawing.faces[id].textureSize, reference);
    assert.equal(store.getState().project.drawing.faces[id].rect.w, 10);
    const old = JSON.parse(JSON.stringify(drawing));
    delete old.faces[id].textureSize;
    const upgraded = scaleFaceAbout(old, id, 2);
    assert.deepEqual(upgraded.faces[id].textureSize, reference);
    assert.equal(old.faces[id].textureSize, undefined, "reading/upgrading must not mutate the old project");
    assert.equal(setFaceFill(drawing, id, "transparent").faces[id].textureSize, undefined);
  } finally { if (store && previous) store.setState(previous); await server.close(); }
});
