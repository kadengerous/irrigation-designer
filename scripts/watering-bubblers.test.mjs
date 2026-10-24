import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createBubblerHarness } from './render-watering-bubblers.mjs';
let h, models;
before(async () => { h = await createBubblerHarness(); models = h.catalog.CATALOG.filter(i => i.type === 'bubbler'); });
after(async () => h?.close());
const difference = (a, b) => Math.abs(((a - b + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);

test('all bubbler families keep their verified point or stream geometry and preserve unknown distributions', () => {
  const counts = {};
  for (const item of models) {
    const head = h.head(item.id), before = JSON.stringify(head), hydraulics = h.flow.headFlow(head), profile = h.water.wateringProfile(head);
    counts[profile.kind] = (counts[profile.kind] ?? 0) + 1;
    if (profile.kind === 'unknown') {
      assert.ok(item.id === 'AFB' || item.manufacturerId === 'rain-bird' && item.family === 'stream');
      assert.deepEqual(h.water.wateringBubblerPaths(head, profile), []); assert.equal(h.water.wateringBubblerDroplet(head, 1, 0, profile), null); continue;
    }
    if (profile.kind === 'flood') {
      assert.equal(head.r, 0); assert.deepEqual(h.geometry.headSurface(head), []);
      assert.equal(h.coverage.headCovers(head, { x: head.x, y: head.y }), false);
      for (const time of [0, 1.7, 2.4, 100]) {
        for (let i = 0; i < h.water.wateringParticleCount(profile); i++) {
          const point = h.water.wateringBubblerDroplet(head, time, i, profile);
          assert.ok(point && [point.x, point.y, point.travel, point.angle].every(Number.isFinite));
          assert.ok(Math.hypot(point.x, point.y) < 1, item.id + ' bounded local glyph');
          assert.ok(point.travel >= 0 && point.travel <= 1);
          const world = h.water.wateringDrop(head, time, i, profile);
          assert.equal(Math.hypot(world.x, world.y), 0, 'screen glyph never becomes a hydraulic footprint');
        }
      }
    } else {
      assert.ok(['streams', 'dual'].includes(profile.kind)); assert.equal(item.manufacturerId, 'hunter');
      assert.deepEqual(h.water.wateringBubblerPaths(head, profile), []);
      const count = h.water.wateringStreamCount(head, profile); assert.ok(count >= 2 && count <= 12);
      for (let lane = 0; lane < count; lane++) {
        const first = h.water.wateringStreamPath(head, 1.7, profile, lane), last = h.water.wateringStreamPath(head, 60, profile, lane);
        assert.deepEqual(first, last, item.id + ' fixed stream outlets');
        assert.ok(first.every(p => p && Math.hypot(p.x, p.y) <= head.r + 1e-8));
      }
      assert.ok(h.water.wateringMicroParticleCount(profile) <= 1200, 'trickles are not broad rotary mist');
    }
    assert.equal(JSON.stringify(head), before); assert.deepEqual(h.flow.headFlow(head), hydraulics);
    for (const designPressure of [item.recommendedPressureMin - .1, item.recommendedPressureMax + .1]) assert.equal(h.water.wateringProfile({ ...head, designPressure }).kind, 'unknown');
  }
  assert.equal(models.length, 36); assert.deepEqual(counts, { streams: 6, dual: 3, flood: 22, unknown: 5 });
});

test('trickle and umbrella discharge follows fixed small connected outlets, never rotating rings', () => {
  for (const item of models) {
    const head = h.head(item.id), profile = h.water.wateringProfile(head); if (profile.kind !== 'flood') continue;
    const paths = h.water.wateringBubblerPaths(head, profile), expected = profile.bubblePattern === 'trickle' ? 7 : 14;
    assert.equal(paths.length, expected);
    for (const path of paths) {
      assert.equal(path.length, 17); assert.equal(Math.hypot(path[0].x, path[0].y), 0);
      assert.ok(path.every(p => Math.hypot(p.x, p.y) < 1));
      for (let i = 1; i < path.length; i++) assert.ok(Math.hypot(path[i].x, path[i].y) > Math.hypot(path[i - 1].x, path[i - 1].y));
    }
    let moving = 0;
    for (let index = 0; index < 96; index++) {
      const lane = paths[index % expected], anchor = Math.atan2(lane.at(-1).y, lane.at(-1).x);
      const early = h.water.wateringBubblerDroplet(head, 1.7, index, profile), later = h.water.wateringBubblerDroplet(head, 2.4, index, profile);
      assert.ok(difference(Math.atan2(early.y, early.x), anchor) < .09);
      assert.ok(difference(Math.atan2(later.y, later.x), anchor) < .09, item.id + ' outlet cannot orbit');
      if (Math.abs(early.travel - later.travel) > .03) moving++;
    }
    assert.ok(moving > 80, item.id + ' water moves along stationary outlets');
  }
});

test('actual flood paint has no circles and remains visible outside the installed white head at every zoom', async () => {
  for (const item of models) {
    const head = h.head(item.id), profile = h.water.wateringProfile(head); if (profile.kind !== 'flood') continue;
    for (const px of [6, 12, 18, 36, 72, 144]) {
      const image = await h.render(head, px, 1.7);
      assert.ok(image.visibleWater >= 2, `${item.id}/${px}: water must extend beyond the actual white head`);
      assert.ok(image.maxWaterDistance < 64, item.id + ' screen-local glyph stays compact');
      let circles = 0, strokes = 0, lines = 0, fills = 0, saves = 0;
      const ctx = new Proxy({}, { get(_, name) {
        if (name === 'arc') return () => circles++;
        if (name === 'stroke') return () => strokes++;
        if (name === 'lineTo') return (...values) => { assert.ok(values.every(Number.isFinite)); lines++; };
        if (name === 'fill') return () => fills++;
        if (name === 'save') return () => saves++;
        if (name === 'restore') return () => saves--;
        return () => {};
      }, set() { return true; } });
      image.paint(ctx); assert.equal(circles, 0); assert.equal(strokes, 0); assert.equal(saves, 0);
      assert.ok(lines > 150 && fills >= 6, item.id + ' connected small jets and fine breakup');
    }
  }
  assert.deepEqual(h.errors, []);
});

test('physical stream bubblers remain visible beyond their smaller simulation marker without extending their throw', async () => {
  for (const item of models) {
    const head = h.head(item.id), profile = h.water.wateringProfile(head);
    if (!['streams', 'dual'].includes(profile.kind)) continue;
    // At 6 px/m the smallest physical throw is only 1.8 pixels; preserve that
    // true extent rather than inventing a larger footprint to draw detail.
    for (const px of [18, 36, 72]) {
      const image = await h.render(head, px, 1.7);
      assert.ok(image.visibleWater > 0, `${item.id}/${px}: actual installed microstreams remain visible`);
      assert.ok(image.symbolOutlineRadius < head.r * px * .3, item.id + ' marker cannot hide the physical stream');
      assert.ok(image.maxWaterDistance <= head.r * px + 1.5, item.id + ' water and antialiasing stay within real reach');
    }
  }
});
