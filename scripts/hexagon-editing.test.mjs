import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("hexagon is created from a two-corner box with six editable sides", async () => {
  const server = await createServer({ server: { middlewareMode: true } });
  try {
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const { addHexagon, faceArea, faceVertices, hexagonFromBounds } = await server.ssrLoadModule(
      "/src/lib/cad/engine.ts",
    );
    const points = hexagonFromBounds({ x: 0, y: 0 }, { x: 10, y: 6 });
    assert.equal(points.length, 6);

    const drawing = addHexagon(emptyDrawing(), points, "lawn");
    const faceId = Object.keys(drawing.faces)[0];
    assert.ok(faceId);
    assert.equal(faceVertices(drawing, faceId).length, 6);
    assert.ok(Math.abs(faceArea(drawing, faceId) - 45) < 1e-9);
  } finally {
    await server.close();
  }
});
