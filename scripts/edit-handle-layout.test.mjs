import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false } });
const { rotationHandleLayout } = await server.ssrLoadModule('/src/lib/cad/edit-handle-layout.ts');
const { rectWorldCorners } = await server.ssrLoadModule('/src/lib/cad/engine.ts');
await server.close();

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('rotation stem meets the top midpoint after rotating and resizing a rectangle at any zoom', () => {
  for (const rot of [-130, 0, 27, 90, 240, 360]) {
    for (const px of [3, 36, 100, 220]) {
      for (const [w, h] of [[4, 3], [13, 1.5]]) {
        const rect = { x: 8, y: -7, w, h, rot };
        const corners = rectWorldCorners(rect);
        const anchor = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 };
        const center = { x: rect.x + w / 2, y: rect.y + h / 2 };
        const before = structuredClone({ anchor, center });
        const result = rotationHandleLayout(anchor, center, px);
        near(Math.hypot(result.point.x - anchor.x, result.point.y - anchor.y) * px, 34);
        const angle = result.rotation * Math.PI / 180;
        near(result.point.x - Math.sin(angle) * 34 / px, anchor.x);
        near(result.point.y + Math.cos(angle) * 34 / px, anchor.y);
        assert.deepEqual({ anchor, center }, before);
      }
    }
  }
});

test('asymmetric and degenerate shapes keep a finite outward rotation handle', () => {
  for (const [anchor, center] of [
    [{ x: 5, y: 1 }, { x: 3, y: 8 }],
    [{ x: 2, y: 2 }, { x: 2, y: 2 }],
  ]) {
    const { point, rotation } = rotationHandleLayout(anchor, center, 36);
    assert.ok([point.x, point.y, rotation].every(Number.isFinite));
    near(Math.hypot(point.x - anchor.x, point.y - anchor.y) * 36, 34);
  }
});
