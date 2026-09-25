import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("live edits coalesce samples, flush the release position, and discard cancelled work", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { frameUpdate } = await server.ssrLoadModule("/src/lib/frame-update.ts");
    let nextId = 0;
    const frames = new Map(), applied = [];
    const update = frameUpdate(value => applied.push(value), callback => {
      frames.set(++nextId, callback); return nextId;
    }, id => frames.delete(id));
    for (let i = 0; i < 100; i++) update.push(i / 10);
    assert.equal(frames.size, 1);
    assert.deepEqual(applied, []);
    [...frames.values()][0](0);
    assert.deepEqual(applied, [9.9]);
    update.push(10.125);
    update.flush();
    update.flush();
    assert.deepEqual(applied, [9.9, 10.125]);
    assert.equal(frames.size, 0);
    update.push(99);
    update.cancel();
    update.flush();
    assert.deepEqual(applied, [9.9, 10.125]);
    assert.equal(frames.size, 0);
  } finally { await server.close(); }
});
