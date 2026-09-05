import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("triangle editing keeps triangle controls despite stale rectangle metadata", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const { addTriangle, isTriangleFace, triangleFromBounds } = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const drawing = addTriangle(emptyDrawing(), triangleFromBounds({ x: 0, y: 0 }, { x: 10, y: 6 }), "lawn");
    const faceId = Object.keys(drawing.faces)[0];
    assert.ok(faceId);
    assert.equal(isTriangleFace(drawing, faceId), true);

    drawing.faces[faceId].rect = { x: 0, y: 0, w: 10, h: 6, rot: 0 };
    assert.equal(isTriangleFace(drawing, faceId), true);
  } finally {
    await server.close();
  }
});
