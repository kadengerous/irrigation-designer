/** Native review of actual WateringHead paint, including the installed head above it. */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

export async function createBubblerHarness() {
  const root = process.env.IRRI_ROOT ?? process.cwd(), req = createRequire(resolve(root, 'package.json'));
  const React = req('react'), K = req('konva'), Konva = K.default ?? K;
  const { KonvaRenderer } = req('react-konva/lib/ReactKonvaCore.js'), { createCanvas } = req('@napi-rs/canvas');
  const server = await createServer({ configFile: false, root, resolve: { alias: { '@': resolve(root, 'src') } }, server: { middlewareMode: true, hmr: false }, logLevel: 'silent' });
  const [catalog, flow, water, geometry, coverage, symbols, { WateringHead }] = await Promise.all([
    ...['equipment-catalog', 'flow', 'watering-preview', 'irrigation-geometry', 'coverage', 'head-presentation'].map(n => server.ssrLoadModule('/src/lib/' + n + '.ts')),
    server.ssrLoadModule('/src/components/designer/zone-highlights.tsx'),
  ]);
  const previous = globalThis.IS_REACT_ACT_ENVIRONMENT; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const errors = [], container = new Konva.Group(), elapsed = { current: 1 };
  const renderer = KonvaRenderer.createContainer(container, 1, null, false, null, '', e => errors.push(e), e => errors.push(e), e => errors.push(e), null);
  const bridge = ctx => new Proxy(ctx, { get(target, key) {
    if (key === 'setAttr') return (name, value) => { target[name] = value; };
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  }, set(target, key, value) { target[key] = value; return true; } });
  const head = id => { const item = catalog.itemById(id); return { ...flow.catalogHeadDefaults(item), id: 'bubbler:' + id, catalogId: id, x: 2, y: 3, start: 20, zone: 1, locked: false }; };
  // Read the actual installed-head scale declarations; the tiny physical stream
  // footprint must never be enlarged just to escape an oversized white marker.
  const source = await readFile(resolve(root, 'src/components/designer/design-canvas.tsx'), 'utf8');
  const start = source.indexOf('const baseSymbolScale = headSymbolScale(px);');
  if (start < 0) throw new Error('Installed marker scale declaration not found');
  const end = source.indexOf('const symbolRadius =', start);
  const markerCode = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const markerScale = new Function('h', 'item', 'px', 'headSymbolScale', 'HEAD_SYMBOL_RADIUS', 'simulationActive', markerCode + ';return symbolScale;');
  const symbol = (ctx, h, px) => {
    const scale = markerScale(h, catalog.catalogForHead(h), px, symbols.headSymbolScale, symbols.HEAD_SYMBOL_RADIUS, true), radius = symbols.HEAD_SYMBOL_RADIUS * scale;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#349a59'; ctx.lineWidth = 2.6 * scale;
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#349a59'; ctx.beginPath(); ctx.arc(0, 0, 4 * scale, 0, Math.PI * 2); ctx.fill();
    return radius + 1.3 * scale;
  };
  const painter = async (h, px) => {
    await React.act(async () => KonvaRenderer.updateContainer(React.createElement(WateringHead, { head: h, px, elapsed }), renderer, null, () => {}));
    return container.children[0]?.sceneFunc();
  };
  const render = async (h, px, seconds = 1, withSymbol = true) => {
    const paint = await painter(h, px), canvas = createCanvas(180, 180), ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f5f7f8'; ctx.fillRect(0, 0, 180, 180); ctx.translate(90, 90); elapsed.current = seconds;
    if (paint) paint(bridge(ctx));
    const outside = withSymbol ? symbol(ctx, h, px) : 0;
    const image = ctx.getImageData(0, 0, 180, 180).data;
    let visibleWater = 0, maxWaterDistance = 0;
    for (let y = 0; y < 180; y++) for (let x = 0; x < 180; x++) {
      const i = (y * 180 + x) * 4, distance = Math.hypot(x + .5 - 90, y + .5 - 90);
      if (distance > outside + 1 && image[i + 2] - image[i] > 6 && image[i + 2] > image[i + 1] + 2) {
        visibleWater++; maxWaterDistance = Math.max(maxWaterDistance, distance);
      }
    }
    return { canvas, paint, visibleWater, maxWaterDistance, symbolOutlineRadius: outside };
  };
  return { catalog, flow, water, geometry, coverage, symbols, head, render, painter, bridge, createCanvas, symbol, elapsed, errors,
    async close() { await React.act(async () => KonvaRenderer.updateContainer(null, renderer, null, () => {})); globalThis.IS_REACT_ACT_ENVIRONMENT = previous; await server.close(); } };
}

async function main() {
  const output = process.argv[2] ?? '/private/tmp/irri-bubbler-visual', h = await createBubblerHarness();
  try {
    await mkdir(output, { recursive: true });
    const ids = ['PCN-25', 'PCN-10', 'PCB-50-R', 'rain-bird:1401', 'rain-bird:1300A-F', 'k-rain:TB-025', 'MSBN-10F', 'MSBN-50V', '5-CST-B'];
    const scales = [6, 18, 36, 72], w = 320, height = 220, canvas = h.createCanvas(w * 4, height * ids.length), ctx = canvas.getContext('2d');
    const rows = [];
    for (let row = 0; row < ids.length; row++) for (let col = 0; col < scales.length; col++) {
      const id = ids[row], px = scales[col], head = h.head(id), rendered = await h.render(head, px, 1.7), x = col * w, y = row * height;
      ctx.fillStyle = '#f5f7f8'; ctx.fillRect(x, y, w, height); ctx.fillStyle = '#233b4c'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(id, x + 14, y + 21);
      ctx.fillStyle = '#607482'; ctx.font = '12px sans-serif'; ctx.fillText(`${px} px/m · installed symbol above water`, x + 14, y + 40);
      ctx.drawImage(rendered.canvas, x + 70, y + 40);
      rows.push({ id, pxPerM: px, kind: h.water.wateringProfile(head).kind, visibleWaterPixels: rendered.visibleWater,
        maxWaterDistancePixels: rendered.maxWaterDistance, symbolOutlineRadius: rendered.symbolOutlineRadius });
    }
    await writeFile(resolve(output, 'bubbler-scale-sheet.png'), await canvas.encode('png'));
    const frames = h.createCanvas(1280, 320), fc = frames.getContext('2d');
    for (let i = 0; i < 4; i++) {
      const id = i < 2 ? 'PCN-25' : 'k-rain:TB-025', time = i % 2 ? 2.4 : 1.7, result = await h.render(h.head(id), 72, time);
      fc.fillStyle = '#f5f7f8'; fc.fillRect(i * 320, 0, 320, 320); fc.fillStyle = '#233b4c'; fc.font = '16px sans-serif'; fc.fillText(`${id} · ${time}s`, i * 320 + 14, 25);
      fc.drawImage(result.canvas, i * 320 + 70, 60);
    }
    await writeFile(resolve(output, 'bubbler-motion-frames.png'), await frames.encode('png'));
    const timings = [], native = h.createCanvas(1600, 1000), nativeContext = native.getContext('2d');
    for (const px of [18, 36, 72]) {
      const paints = []; for (const id of ids) paints.push(await h.painter(h.head(id), px));
      const times = [];
      for (let frame = 0; frame < 15; frame++) {
        h.elapsed.current = 1.7 + frame / 30; nativeContext.clearRect(0, 0, 1600, 1000); const begin = performance.now();
        for (let i = 0; i < paints.length; i++) { nativeContext.save(); nativeContext.translate(200 + i % 4 * 400, 200 + Math.floor(i / 4) * 350); paints[i]?.(h.bridge(nativeContext)); nativeContext.restore(); }
        if (frame >= 3) times.push(performance.now() - begin);
      }
      times.sort((a, b) => a - b); timings.push({ pxPerM: px, heads: ids.length, medianMs: times[6], p95Ms: times[11] });
    }
    const report = { renderer: 'Actual WateringHead scene function with installed white head and zone outline painted above water',
      limitation: 'Native canvas timing; not browser FPS. Flood radius is a screen-local symbol, not a wetted engineering radius.', rows, timings };
    await writeFile(resolve(output, 'bubbler-render-report.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ output, timings, errors: h.errors }, null, 2));
  } finally { await h.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
