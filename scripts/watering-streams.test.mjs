import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { createRequire } from 'node:module';

let server, catalog, flow, water, fixtures;
const root = process.env.IRRI_ROOT ?? process.cwd();
const head = (item, patch = {}) => ({ ...flow.catalogHeadDefaults(item), id: 'water:' + item.id,
  catalogId: item.id, x: 14, y: -7, start: 37, zone: 2, locked: false, ...patch });
function validHead(item) {
  const initial = head(item);
  if (water.wateringProfile(initial).kind !== 'unknown') return initial;
  for (const nozzle of item.nozzles) for (const row of nozzle.performance) {
    const body = catalog.bodiesFor(item).find(b => b.regulatedPressureBar == null
      && row.pressureBar >= catalog.nozzleTablePressure(item, b.recommendedPressureMin) - 1e-7
      && row.pressureBar <= catalog.nozzleTablePressure(item, b.recommendedPressureMax) + 1e-7);
    const h = head(item, { nozzleId: nozzle.id, arc: catalog.clampArc(item, row.arcDeg),
      r: row.radiusM, designPressure: row.pressureBar,
      ...(body ? { bodyId: body.id, popUpMm: body.popUpMm } : {}) });
    if (water.wateringProfile(h).kind !== 'unknown') return h;
  }
  return initial;
}
const near = (a, b, label, epsilon = 1e-7) => assert.ok(Math.abs(a - b) < epsilon, `${label}: ${a} != ${b}`);
function distanceToPath(point, path) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]; if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, denominator = dx * dx + dy * dy;
    const along = denominator > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator)) : 0;
    best = Math.min(best, Math.hypot(point.x - a.x - along * dx, point.y - a.y - along * dy));
  }
  return best;
}
function inFootprint(h, profile, point) {
  const a = -h.start * Math.PI / 180;
  const x = point.x * Math.cos(a) - point.y * Math.sin(a), y = point.x * Math.sin(a) + point.y * Math.cos(a), eps = 1e-7;
  if (profile.strip) {
    const s = profile.strip;
    return x >= s.ox - eps && x <= s.ox + s.l + eps && y >= s.oy - eps && y <= s.oy + s.w + eps;
  }
  if (profile.kind === 'flood') return Math.hypot(x, y) < eps;
  const distance = Math.hypot(x, y), angle = ((Math.atan2(y, x) * 180 / Math.PI) % 360 + 360) % 360;
  const withinAngle = distance < eps || h.arc >= 360 || angle <= h.arc + eps || angle >= 360 - eps;
  if (profile.kind === 'square-fan') return Math.abs(x) <= h.r + eps && Math.abs(y) <= h.r + eps && withinAngle;
  return distance <= h.r + eps && withinAngle;
}
before(async () => {
  server = await createServer({ configFile: false, root, resolve: { alias: { '@': resolve(root, 'src') } },
    server: { middlewareMode: true, hmr: false }, logLevel: 'silent' });
  [catalog, flow, water] = await Promise.all(['equipment-catalog', 'flow', 'watering-preview']
    .map(name => server.ssrLoadModule('/src/lib/' + name + '.ts')));
  fixtures = catalog.placeableCatalog().map(item => ({ item, h: validHead(item) }));
});
after(async () => server?.close());

test('every catalog model keeps its supported geometry, water paths and hydraulics independent of animation time', t => {
  const manufacturers = new Set(), kinds = new Set(); let animated = 0, unknown = 0, points = 0;
  for (const { item, h } of fixtures) {
    manufacturers.add(item.manufacturerId);
    const p = water.wateringProfile(h), before = JSON.stringify(h), hydraulics = flow.headFlow(h);
    kinds.add(p.kind);
    if (p.kind === 'unknown') {
      assert.equal(water.wateringStreamCount(h, p), 0, item.id);
      assert.equal(water.wateringParticleCount(p), 0, item.id);
      assert.equal(water.wateringMicroParticleCount(p), 0, item.id);
      unknown++; continue;
    }
    animated++; assert.ok(flow.operatingGeometryAvailable(item, h), item.id);
    for (const t of [0, 1.73, 39.98, 80.03]) {
      for (let lane = 0; lane < water.wateringStreamCount(h, p); lane++) {
        const path = water.wateringStreamPath(h, t, p, lane);
        assert.equal(path.length, 33, item.id + ' sampled path');
        for (const point of path) if (point) {
          assert.ok([point.x, point.y, point.travel].every(Number.isFinite), item.id + ' finite path');
          assert.ok(point.travel >= 0 && point.travel <= 1, item.id + ' flight fraction');
          assert.ok(inFootprint(h, p, point), `${item.id} stream ${lane} at ${t}`); points++;
        }
      }
      for (let i = 0; i < water.wateringParticleCount(p); i += 31) {
        const drop = water.wateringDrop(h, t, i, p);
        if (drop) assert.ok(inFootprint(h, p, drop), item.id + ' main drop');
      }
      for (let i = 0; i < water.wateringMicroParticleCount(p); i += 17) {
        const drop = water.wateringMicroDrop(h, t, i, p);
        if (drop) assert.ok(inFootprint(h, p, drop), item.id + ' microdrop');
      }
    }
    assert.equal(JSON.stringify(h), before, item.id + ' no saved geometry mutation');
    assert.deepEqual(flow.headFlow(h), hydraulics, item.id + ' no hydraulic mutation');
  }
  assert.equal(fixtures.length, 461);
  assert.equal(manufacturers.size, 4); assert.ok(animated >= 450); assert.ok(unknown <= 11);
  for (const kind of ['multi', 'strip-multi', 'fan', 'strip-fan', 'square-fan', 'rotor', 'opposed', 'dual', 'streams', 'flood']) assert.ok(kinds.has(kind), kind);
  assert.ok(points > 100000);
  t.diagnostic(`${fixtures.length} placeable models; ${animated} have a supported animated operating point; ${unknown} keep unknown geometry; ${points} stream samples checked.`);
});

test('MP, R-VAN and K-Rain have simultaneous short, medium and long streams with moving emission history', () => {
  for (const id of ['MP1000-360', 'rain-bird:R-VAN18-360', 'k-rain:RN100-FIX360']) {
    const item = catalog.itemById(id); assert.ok(item, id);
    const h = validHead(item), p = { ...water.wateringProfile(h), phaseSeconds: 0 };
    assert.equal(p.kind, 'multi');
    const count = water.wateringStreamCount(h, p); assert.ok(count >= 12 && count <= 48, id);
    const paths = Array.from({ length: count }, (_, lane) => water.wateringStreamPath(h, 7.1, p, lane));
    const reaches = paths.map(path => Math.hypot(path.at(-1).x, path.at(-1).y));
    assert.ok(Math.min(...reaches) < h.r * .7, id + ' close streams');
    assert.ok(reaches.some(r => r > h.r * .7 && r < h.r * .95), id + ' middle streams');
    near(Math.max(...reaches), h.r, id + ' far streams use actual radius');
    const flight = water.wateringFlightSeconds(h);
    const full = water.wateringStreamPath(h, 7.1, p, 0)[32];
    const half = water.wateringStreamPath(h, 7.1 - flight / 2, p, 0)[16];
    near(full.x, half.x * 2, id + ' same emitted water direction x');
    near(full.y, half.y * 2, id + ' same emitted water direction y');
    assert.notDeepEqual(paths[0], water.wateringStreamPath(h, 8.1, p, 0), id + ' streams rotate');
    const reduced = water.wateringStreamPath({ ...h, r: h.r * .8 }, 7.1, p, 0).at(-1);
    near(Math.hypot(reduced.x, reduced.y), reaches[0] * .8, id + ' saved nozzle radius controls reach');
  }
});

test('fixed fans and stream bubblers keep their nozzle directions while rotors sweep and preserve full-circle mechanisms', () => {
  for (const { item, h } of fixtures) {
    const p = water.wateringProfile(h);
    if (['fan', 'strip-fan', 'square-fan', 'streams', 'dual'].includes(p.kind)) {
      const count = water.wateringStreamCount(h, p); assert.ok(count > 0, item.id);
      for (const lane of [...new Set([0, Math.floor(count / 2), count - 1])])
        assert.deepEqual(water.wateringStreamPath(h, 1, p, lane), water.wateringStreamPath(h, 12, p, lane), item.id + ' fixed nozzle directions');
    }
    if (['rotor', 'opposed'].includes(p.kind)) {
      assert.equal(water.wateringStreamCount(h, p), p.reaches.length);
      const path = water.wateringStreamPath(h, 7.3, p, 0), legacy = water.wateringJetPath(h, 7.3, p, 0);
      path.forEach((point, i) => { assert.ok(point); near(point.x, legacy[i].x, item.id + ' rotor flight x'); near(point.y, legacy[i].y, item.id + ' rotor flight y'); });
      assert.notDeepEqual(path, water.wateringStreamPath(h, 12.3, p, 0), item.id + ' sweeping jet');
    }
  }
});

test('partial rotary nozzles mask inactive outlets and concentrate fine breakup towards each stream end', () => {
  for (const id of ['MP1000-90', 'rain-bird:R-VAN18', 'k-rain:RN100-ADJ']) {
    const item = catalog.itemById(id), h = { ...validHead(item), arc: 90 };
    const p = { ...water.wateringProfile(h), phaseSeconds: 0 }; assert.equal(p.kind, 'multi', id);
    let empty = 0, present = 0, transitions = 0;
    for (const time of [0, .23, 1.7, 9.9, 10.1, 39.9]) for (let lane = 0; lane < water.wateringStreamCount(h, p); lane++) {
      const path = water.wateringStreamPath(h, time, p, lane), actual = path.filter(Boolean);
      empty += path.length - actual.length; present += actual.length;
      if (actual.length > 0 && actual.length < path.length) transitions++;
      assert.ok(actual.every(point => inFootprint(h, p, point)), id + ' no wraparound or boundary spike');
    }
    assert.ok(empty > present, id + ' only quarter-circle outlets are active');
    assert.ok(transitions > 0, id + ' emitted water retains its direction at the sector edge');
    const samples = Array.from({ length: water.wateringMicroParticleCount(p) }, (_, i) => water.wateringMicroDrop(h, 5.3, i, p)).filter(Boolean);
    assert.ok(samples.length > 300, id + ' dense active microdroplets');
    assert.ok(samples.filter(drop => drop.travel >= .6).length / samples.length > .7, id + ' distal breakup is denser');
    assert.ok(samples.every(drop => inFootprint(h, p, drop)), id + ' fine breakup remains inside sector');
  }
  const u = catalog.placeableCatalog().find(item => item.manufacturerId === 'rain-bird' && item.series === 'U-Series');
  assert.ok(u, 'U-Series catalog');
  const h = validHead(u), p = water.wateringProfile(h);
  assert.equal(water.wateringStreamCount(h, p), 96, 'U-Series has near and far stationary spray layers');
});

test('microdroplets stay dense but draw budgets remain finite at distant, ordinary and close zoom', () => {
  for (const { item, h } of fixtures) {
    const p = water.wateringProfile(h), before = JSON.stringify(p);
    const caps = { main: water.wateringParticleCount(p), micro: water.wateringMicroParticleCount(p) };
    const budgets = [2, 18, 36, 72, 360].map(px => water.wateringParticleBudget(h, p, px));
    for (const budget of budgets) for (const key of ['main', 'micro']) {
      assert.ok(Number.isInteger(budget[key]) && budget[key] >= 0, item.id + ' finite ' + key);
      assert.ok(budget[key] <= caps[key] && budget[key] <= (key === 'micro' ? 8192 : 4096), item.id + ' bounded ' + key);
    }
    for (let n = 1; n < budgets.length; n++) for (const key of ['main', 'micro'])
      assert.ok(budgets[n][key] >= budgets[n - 1][key], item.id + ' visible density follows zoom');
    if (p.kind === 'multi') assert.ok(caps.micro >= 6000, item.id + ' dense inter-stream mist');
    if (p.kind === 'flood' || p.kind === 'unknown') assert.equal(caps.micro, 0, item.id + ' no distant cloud');
    assert.equal(JSON.stringify(p), before);
  }
});

test('fine droplets fill gaps between MP streams and disperse both sideways and along water travel', t => {
  const measurements = [];
  for (const id of ['MP1000-360', 'rain-bird:R-VAN18-360', 'k-rain:RN100-FIX360']) {
    const h = validHead(catalog.itemById(id)), p = { ...water.wateringProfile(h), phaseSeconds: 0 }, time = 7.13;
    const count = water.wateringStreamCount(h, p);
    const paths = Array.from({ length: count }, (_, lane) => water.wateringStreamPath(h, time, p, lane));
    let sampled = 0, between = 0, farBetween = 0;
    const directions = { forward: 0, backward: 0, left: 0, right: 0 };
    // Seven is coprime with the 24 rotating outlets, so every stream is sampled.
    for (let index = 0; index < water.wateringMicroParticleCount(p); index += 7) {
      const drop = water.wateringMicroDrop(h, time, index, p); if (!drop) continue;
      sampled++; assert.ok(inFootprint(h, p, drop), id + ' dispersed water remains within actual throw');
      const distance = Math.min(...paths.map(path => distanceToPath(drop, path)));
      if (distance > h.r * .02) between++;
      if (distance > h.r * .05) farBetween++;
      const lanePath = paths[index % count], position = drop.travel * 32;
      const a = lanePath[Math.floor(position)], b = lanePath[Math.min(32, Math.ceil(position))], fraction = position % 1;
      assert.ok(a && b, id + ' full-circle emitted stream');
      const cx = a.x + (b.x - a.x) * fraction, cy = a.y + (b.y - a.y) * fraction;
      const radius = Math.hypot(cx, cy), dx = drop.x - cx, dy = drop.y - cy;
      const radial = (dx * cx + dy * cy) / radius, lateral = (-dx * cy + dy * cx) / radius;
      const epsilon = h.r * .002;
      if (radial > epsilon) directions.forward++;
      if (radial < -epsilon) directions.backward++;
      if (lateral > epsilon) directions.left++;
      if (lateral < -epsilon) directions.right++;
    }
    assert.ok(sampled > 700, id + ' abundant visible microdroplets');
    assert.ok(between / sampled > .2, id + ' visible water between distinct stream cores');
    assert.ok(farBetween / sampled > .04, id + ' broad inter-stream spray rather than only line jitter');
    for (const [direction, n] of Object.entries(directions)) assert.ok(n / sampled > .2, `${id}: independent ${direction} dispersion`);
    const budget = water.wateringParticleBudget(h, p, 18);
    assert.ok(budget.micro >= 1000, id + ' microdroplets remain abundant in a distant plan view');
    measurements.push({ id, samples: sampled, betweenPercent: Math.round(100 * between / sampled),
      wideGapPercent: Math.round(100 * farBetween / sampled), visibleMicroBudgetAt18: budget.micro });
  }
  t.diagnostic(JSON.stringify(measurements));
});

test('unsupported geometry, nozzle and pressure still produce no water for all manufacturers', () => {
  for (const { item, h } of fixtures) {
    for (const patch of [{ r: -1 }, { r: NaN }, { arc: NaN }, { start: Infinity },
      { designPressure: item.recommendedPressureMin - 1 }, { designPressure: item.recommendedPressureMax + 1 }, { nozzleId: 'not-a-nozzle' }]) {
      const invalid = { ...h, ...patch }, p = water.wateringProfile(invalid);
      assert.equal(p.kind, 'unknown', item.id + ' ' + JSON.stringify(patch));
      assert.equal(water.wateringStreamCount(invalid, p), 0);
      assert.deepEqual(water.wateringParticleBudget(invalid, p, 36), { main: 0, micro: 0 });
    }
  }
});

test('actual WateringHead paints continuous filled ribbons, obeys clipping and rejects invalid saved heads', async () => {
  const req = createRequire(resolve(root, 'package.json')), React = req('react'), K = req('konva'), Konva = K.default ?? K;
  const { KonvaRenderer } = req('react-konva/lib/ReactKonvaCore.js');
  const { WateringHead } = await server.ssrLoadModule('/src/components/designer/zone-highlights.tsx');
  const previous = globalThis.IS_REACT_ACT_ENVIRONMENT; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const errors = [], container = new Konva.Group();
  const r = KonvaRenderer.createContainer(container, 1, null, false, null, '', e => errors.push(e), e => errors.push(e), e => errors.push(e), null);
  try {
    for (const id of ['MP1000-360', 'rain-bird:R-VAN18-360', 'k-rain:RN100-ADJ', 'PGP-ULTRA', 'toro:PSN10-H', 'SS-530', 'rain-bird:SQ-QTR', 'k-rain:TB-025']) {
      const item = catalog.itemById(id); assert.ok(item, id); const h = validHead(item), p = water.wateringProfile(h);
      await React.act(async () => KonvaRenderer.updateContainer(React.createElement(WateringHead, { head: h, elapsed: { current: 5.8 }, px: 36 }), r, null, () => {}));
      assert.equal(container.children.length, 1, id);
      let clips = 0, fills = 0, arcs = 0, dots = 0, segments = 0, lastBeginSegments = 0, ribbonFills = 0, saves = 0;
      const ctx = new Proxy({}, { get(_, key) {
        if (key === 'save') return () => { saves++; };
        if (key === 'restore') return () => { saves--; };
        if (key === 'clip') return () => { clips++; };
        if (key === 'arc') return () => { arcs++; };
        if (key === 'fillRect') return (...values) => { assert.ok(values.every(Number.isFinite), id + ' finite microdrop'); dots++; };
        if (key === 'lineTo') return (...values) => { assert.ok(values.every(Number.isFinite), id + ' finite draw'); segments++; lastBeginSegments++; };
        if (key === 'beginPath') return () => { lastBeginSegments = 0; };
        if (key === 'fill') return () => { fills++; if (lastBeginSegments >= 20) ribbonFills++; };
        return () => {};
      }, set() { return true; } });
      container.children[0].sceneFunc()(ctx);
      assert.equal(saves, 0, id + ' canvas state restored'); assert.ok(fills >= 3 && arcs + dots + segments > 0, id + ' water painted');
      assert.equal(clips, p.kind === 'flood' ? 0 : 1, id + ' exact footprint clipping');
      if (p.kind !== 'flood') assert.ok(segments >= 40 && ribbonFills >= 2, id + ' continuous filled water ribbons');
      await React.act(async () => KonvaRenderer.updateContainer(React.createElement(WateringHead, { head: { ...h, r: NaN }, elapsed: { current: 5.8 }, px: 36 }), r, null, () => {}));
      assert.equal(container.children.length, 0, id + ' invalid head hides paint');
    }
    assert.deepEqual(errors, []);
  } finally {
    await React.act(async () => KonvaRenderer.updateContainer(null, r, null, () => {}));
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
