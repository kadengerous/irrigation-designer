import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createIconHarness } from './render-catalog-coverage-icons.mjs';

let h;
before(async () => { h = await createIconHarness(); });
after(async () => { await h.close(); });
const color = '#1b82cc';
const numberPattern = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const close = (actual, expected, label, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
function tags(svg) {
  return [...svg.matchAll(/<(svg|g|circle|rect|path|polygon|polyline|line)\b([^>]*)>/g)].map(([, tag, source]) => ({
    tag, ...Object.fromEntries([...source.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value])),
  }));
}
const footprint = svg => tags(svg).filter(node => node['data-footprint'] !== undefined);
const head = svg => tags(svg).find(node => node['data-head'] !== undefined);
const points = node => (node.points.match(numberPattern) ?? []).reduce((all, value, index, values) => index % 2 ? all : [...all, [+value, +values[index + 1]]], []);
const area = polygon => Math.abs(polygon.reduce((sum, [x, y], index) => { const [nextX, nextY] = polygon[(index + 1) % polygon.length]; return sum + x * nextY - nextX * y; }, 0) / 2);
const textContent = markup => markup.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();

test('every manufacturer and retained catalog record renders finite geometry without changing catalog data', () => {
  const before = JSON.stringify(h.catalog.CATALOG), count = {};
  assert.equal(h.catalog.CATALOG.filter(item => item.type !== 'body').length, 477);
  assert.equal(h.catalog.placeableCatalog().length, 461);
  for (const item of h.catalog.CATALOG) {
    const svg = h.svg(item, color), nodes = tags(svg), root = nodes[0];
    assert.equal(root.tag, 'svg', item.id);
    assert.ok(['point', 'streams', 'square', 'strip', 'sector', 'unknown'].includes(root['data-coverage']), item.id);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined|null/, item.id);
    assert.equal(root['aria-hidden'], 'true', item.id);
    const view = root.viewBox.match(numberPattern).map(Number);
    assert.equal(view.length, 4); assert.ok(view[2] > 0 && view[3] > 0, item.id);
    if (root['data-coverage'] !== 'sector') assert.ok(head(svg), `${item.id}: nonradial nozzle position is represented`);
    if (item.type !== 'body') count[item.manufacturerId] = (count[item.manufacturerId] ?? 0) + 1;
    const expected = item.type === 'body' || item.family === 'stream' || item.geometryVerificationStatus === 'Needs Review'
      ? 'unknown' : item.type === 'bubbler' && item.coverageKind === 'point' ? 'point' : item.placementSupported === false ? 'unknown' : item.strip ? 'strip' : item.coverageKind ?? 'sector';
    assert.equal(root['data-coverage'], expected, `${item.id}: known form must not be hidden or changed`);
    assert.ok(svg.includes(color), `${item.id}: selected equipment color is used`);
    if (expected === 'sector') {
      const ranges = item.allowedArcRanges ?? [[item.arcMin, item.arcMax]];
      const maximum = Math.max(...ranges.map(([, max]) => Math.min(item.arcMax, max)));
      close(+root['data-arc'], maximum, `${item.id}: largest supported angle`);
    }
  }
  assert.deepEqual(count, { hunter: 113, 'rain-bird': 75, toro: 217, 'k-rain': 72 });
  assert.equal(JSON.stringify(h.catalog.CATALOG), before);
});

test('all real strip symbols preserve length, width and exact nozzle offsets including left/right/end/center', () => {
  const items = h.catalog.CATALOG.filter(item => item.strip);
  assert.equal(items.length, 51);
  for (const item of items) {
    const svg = h.svg(item, color), rect = footprint(svg).find(node => node.tag === 'rect'), marker = head(svg), root = tags(svg)[0];
    assert.equal(root['data-coverage'], 'strip', item.id); assert.ok(rect, item.id);
    const scale = +rect.width / item.strip.l;
    close(+rect.height / item.strip.w, scale, `${item.id}: isotropic scale`);
    close((+rect.x - +(marker.cx ?? 0)) / scale, item.strip.ox, `${item.id}: nozzle x offset`);
    close((+rect.y - +(marker.cy ?? 0)) / scale, item.strip.oy, `${item.id}: nozzle y offset`);
    const [vx, vy, vw, vh] = root.viewBox.match(numberPattern).map(Number), radius = +marker.r;
    assert.ok(+(marker.cx ?? 0) - radius >= vx && +(marker.cx ?? 0) + radius <= vx + vw, `${item.id}: nozzle fits horizontally`);
    assert.ok(+(marker.cy ?? 0) - radius >= vy && +(marker.cy ?? 0) + radius <= vy + vh, `${item.id}: nozzle fits vertically`);
  }
});

test('SQ quarter, half, three-quarter and full preserve true square fractions and the three-quarter notch', () => {
  const expected = {
    .25: [[0, 0], [1, 0], [1, 1], [0, 1]],
    .5: [[-1, 0], [1, 0], [1, 1], [-1, 1]],
    .75: [[0, 0], [1, 0], [1, 1], [-1, 1], [-1, -1], [0, -1]],
    1: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
  };
  const items = h.catalog.CATALOG.filter(item => item.coverageKind === 'square'); assert.equal(items.length, 4);
  for (const item of items) {
    const svg = h.svg(item, color), polygon = footprint(svg).find(node => node.tag === 'polygon'), marker = head(svg);
    assert.equal(tags(svg)[0]['data-coverage'], 'square', item.id); assert.ok(polygon, item.id);
    const p = points(polygon).map(([x, y]) => [x - +(marker.cx ?? 0), y - +(marker.cy ?? 0)]), throwRadius = Math.max(...p.flat().map(Math.abs));
    const normalized = p.map(point => point.map(value => value / throwRadius));
    assert.deepEqual(normalized, expected[item.squarePatternFraction], item.id);
    close(area(p) / (4 * throwRadius ** 2), item.squarePatternFraction, `${item.id}: wetted area fraction`);
    assert.equal(footprint(svg).some(node => node.tag === 'path' && /[Aa]/.test(node.d)), false, item.id);
  }
});

test('circular arcs below forty degrees and almost-full circles retain the exact advertised angle', () => {
  const base = h.catalog.itemById('MP-CORNER');
  const samples = [1, 5, 15, 39, 40, 45, 90, 180, 270, 359, 359.5];
  for (const arc of samples) {
    const item = { ...base, arcMin: arc, arcMax: arc, allowedArcRanges: undefined }, svg = h.svg(item, color);
    assert.equal(tags(svg)[0]['data-coverage'], 'sector', String(arc));
    const path = footprint(svg).find(node => node.tag === 'path'); assert.ok(path, String(arc));
    // This reads the SVG arc itself, rather than trusting a declarative angle attribute.
    const line = /[Ll]([^Aa]+)/.exec(path.d), command = /[Aa]([^ZzAa]+)/.exec(path.d);
    assert.ok(line && command, `arc ${arc} has a real wedge`);
    const [sx, sy] = line[1].match(numberPattern).map(Number), [rx, ry, rotation, large, sweep, ex, ey] = command[1].match(numberPattern).map(Number);
    const [cx, cy] = /^[Mm]([^Ll]+)/.exec(path.d)[1].match(numberPattern).map(Number);
    close(rx, ry, `${arc}: circular radius`); close(rotation, 0, `${arc}: axis rotation`);
    close(Math.hypot(sx - cx, sy - cy), rx, `${arc}: start radius`); close(Math.hypot(ex - cx, ey - cy), rx, `${arc}: end radius`);
    let measured = (Math.atan2(ey - cy, ex - cx) - Math.atan2(sy - cy, sx - cx)) * 180 / Math.PI;
    measured = (sweep ? measured : -measured) % 360; if (measured < 0) measured += 360;
    close(measured, arc, `${arc}: exact rendered sweep`); assert.equal(large, arc > 180 ? 1 : 0);
  }
  for (const id of ['I-25', 'I-40', 'I-80', 'ST-90']) {
    const item = h.catalog.itemById(id); if (!item) continue;
    assert.equal(tags(h.svg(item, color))[0]['data-coverage'], 'sector', `${id}: CUSTOM layout does not imply unknown geometry`);
  }
  for (const arcMax of [330, 360]) {
    const item = { ...base, arcMin: 0, arcMax, allowedArcRanges: undefined };
    assert.equal(tags(h.svg(item, color))[0]['data-coverage'], 'sector', `0–${arcMax} is a valid adjustable catalog range`);
    assert.equal(h.app.formatCatalogArc(item), `0–${arcMax}°`);
  }
});

test('point bubblers and discrete stream bubblers cannot masquerade as a filled irrigation sector', () => {
  const pointItems = h.catalog.CATALOG.filter(item => item.coverageKind === 'point' && item.type === 'bubbler');
  assert.equal(pointItems.length, 23);
  for (const item of pointItems) {
    const svg = h.svg(item, color), root = tags(svg)[0]; assert.equal(root['data-coverage'], 'point', item.id);
    assert.equal(footprint(svg).length, 0, `${item.id}: localized glyph must not advertise wetted area`);
    assert.equal(tags(svg).some(node => node.tag === 'polygon' || node.tag === 'path' && /[Aa]/.test(node.d) && /[Zz]/.test(node.d)), false, `${item.id}: no pie wedge`);
  }
  const retainedPoint = { ...h.catalog.itemById('AFB'), placementSupported: false };
  assert.equal(tags(h.svg(retainedPoint, color))[0]['data-coverage'], 'point', 'known local pattern is independent of hydraulic placement support');
  const streamItems = h.catalog.CATALOG.filter(item => item.coverageKind === 'streams' && item.placementSupported !== false);
  assert.equal(streamItems.length, 9);
  for (const item of streamItems) {
    const svg = h.svg(item, color), root = tags(svg)[0]; assert.equal(root['data-coverage'], 'streams', item.id);
    const strokes = footprint(svg); assert.ok(strokes.length, `${item.id}: actual rays`);
    for (const node of strokes) { assert.notEqual(node.tag, 'polygon', item.id); assert.ok(node.fill === 'none' || node.tag === 'line', `${item.id}: ray has no filled footprint`); }
  }
});

test('malformed external geometry is neutral and finite instead of inventing a minimum arc or fallback footprint', () => {
  const base = h.catalog.itemById('MP-CORNER'), strip = h.catalog.itemById('MP-LCS-515'), square = h.catalog.itemById('rain-bird:SQ-QTR');
  const invalid = [
    ...[NaN, Infinity, -1, 0].map(arc => ({ ...base, arcMin: arc, arcMax: arc })),
    ...[NaN, Infinity, -1, 0].map(radius => ({ ...base, rMax: radius })),
    ...[NaN, Infinity, -1, 0].map(w => ({ ...strip, stripPerformance: undefined, strip: { ...strip.strip, w } })),
    { ...strip, stripPerformance: undefined, strip: { ...strip.strip, ox: NaN } }, { ...strip, stripPerformance: undefined, strip: { ...strip.strip, oy: Infinity } },
    ...[NaN, Infinity, -1, 0, .3, 2].map(squarePatternFraction => ({ ...square, squarePatternFraction })),
  ];
  for (const item of invalid) {
    const svg = h.svg(item, color); assert.doesNotMatch(svg, /NaN|Infinity|undefined|null/);
    assert.equal(tags(svg)[0]['data-coverage'], 'unknown', JSON.stringify(item));
    assert.equal(footprint(svg).length, 0);
  }
});

test('actual point cards and reference tables omit zero/full-circle captions in all twenty locales', () => {
  const locales = h.i18n.LOCALES.map(locale => typeof locale === 'string' ? locale : locale.code); assert.equal(locales.length, 20);
  const items = h.catalog.CATALOG.filter(item => item.type === 'bubbler' && item.coverageKind === 'point');
  for (const locale of locales) {
    h.i18n.setActiveLocale(locale); h.store.setState({ locale });
    const zero = h.i18n.formatNumber(0, 0), full = h.i18n.formatNumber(360, 0);
    for (const item of items) {
      const card = textContent(renderToStaticMarkup(createElement(h.app.EquipmentLibraryCard, { item, selected: false, onSelect() {} })));
      assert.ok(card.includes(item.modelId ?? item.id), `${locale}/${item.id}`);
      assert.ok(card.includes(h.i18n.tr(locale, 'localizedWatering')), `${locale}/${item.id}: localized point name`);
      assert.ok(!card.includes(`${zero}°`) && !card.includes(`${full}°`), `${locale}/${item.id}: no area sector`);
      const table = renderToStaticMarkup(createElement(h.details.CatalogReference, { item, nozzle: item.nozzles[0] }));
      const cells = [...table.matchAll(/<td\b[^>]*>(.*?)<\/td>/g)].map(([, value]) => textContent(value));
      assert.ok(!cells.some(value => value === `${zero}°` || value === `${full}°`), `${locale}/${item.id}: no sector in performance rows`);
    }
  }
  h.i18n.setActiveLocale('ru'); h.store.setState({ locale: 'ru' });
});
