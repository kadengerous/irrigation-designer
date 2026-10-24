/** Native image review of the actual Konva scene function. No browser/server or network. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';

const root = process.env.IRRI_ROOT ?? process.cwd(), output = process.argv[2] ?? '/private/tmp/irri-water-visual';
const baseline = process.argv.find(arg => arg.startsWith('--baseline='))?.slice('--baseline='.length) ?? process.env.IRRI_WATER_BASELINE;
const virtualPrefix = '/__watering_baseline__/';
const baselineModules = baseline ? new Map([
  [virtualPrefix + 'watering-preview.ts', execFileSync('git', ['show', baseline + ':src/lib/watering-preview.ts'], { cwd: root, encoding: 'utf8' }).replaceAll('from "./', 'from "@/lib/')],
  [virtualPrefix + 'zone-highlights.tsx', execFileSync('git', ['show', baseline + ':src/components/designer/zone-highlights.tsx'], { cwd: root, encoding: 'utf8' }).replaceAll('@/lib/watering-preview', virtualPrefix + 'watering-preview.ts')],
]) : null;
const req = createRequire(resolve(root, 'package.json')), React = req('react'), K = req('konva'), Konva = K.default ?? K;
const { createCanvas } = req('@napi-rs/canvas'), { KonvaRenderer } = req('react-konva/lib/ReactKonvaCore.js');
const server = await createServer({ configFile: false, root, resolve: { alias: { '@': resolve(root, 'src') } },
  plugins: baselineModules ? [{ name: 'read-only-watering-baseline', enforce: 'pre',
    resolveId(id) { if (baselineModules.has(id)) return '\0' + id; },
    load(id) {
      const code = baselineModules.get(id.startsWith('\0') ? id.slice(1) : id);
      if (code == null) return null;
      const ts = req('typescript');
      return ts.transpileModule(code, { fileName: id.replace('\0', ''), compilerOptions: {
        target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
      } }).outputText;
    },
  }] : [],
  server: { middlewareMode: true, hmr: false }, logLevel: 'silent' });
const [catalog, flow, water, { WateringHead }] = await Promise.all([
  ...['equipment-catalog', 'flow'].map(name => server.ssrLoadModule('/src/lib/' + name + '.ts')),
  server.ssrLoadModule(baseline ? virtualPrefix + 'watering-preview.ts' : '/src/lib/watering-preview.ts'),
  server.ssrLoadModule(baseline ? virtualPrefix + 'zone-highlights.tsx' : '/src/components/designer/zone-highlights.tsx'),
]);
const examples = [
  ['MP1000-360', 'Hunter MP1000', 'Rotating streams'],
  ['rain-bird:R-VAN18-360', 'Rain Bird R-VAN18', 'Rotating streams'],
  ['k-rain:RN100-ADJ', 'K-Rain RN100', 'Rotating streams'],
  ['PGP-ULTRA', 'Hunter PGP Ultra', 'Sweeping rotor'],
  ['toro:PSN10-H', 'Toro PSN10-H', 'Stationary fan'],
  ['SS-530', 'Hunter SS-530', 'Stationary strip'],
  ['rain-bird:SQ-QTR', 'Rain Bird SQ-QTR', 'Square quarter fan'],
  ['k-rain:TB-025', 'K-Rain TB-025', 'Local bubbler'],
].map(([id, title, description]) => {
  const item = catalog.itemById(id);
  if (!item) throw new Error('Unknown model: ' + id);
  const head = { ...flow.catalogHeadDefaults(item), id: 'visual:' + id, catalogId: id, x: 0, y: 0,
    start: 210, zone: 1, locked: false };
  if (water.wateringProfile(head).kind === 'unknown') throw new Error('Unknown preview: ' + id);
  return { head, title, description, profile: water.wateringProfile(head) };
});
const previous = globalThis.IS_REACT_ACT_ENVIRONMENT; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const errors = [], container = new Konva.Group();
const r = KonvaRenderer.createContainer(container, 1, null, false, null, '', e => errors.push(e), e => errors.push(e), e => errors.push(e), null);
const elapsed = { current: 6.2 };
function bridge(ctx) {
  return new Proxy(ctx, { get(target, key) {
    if (key === 'setAttr') return (name, value) => { target[name] = value; };
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  }, set(target, key, value) { target[key] = value; return true; } });
}
async function painter(head, px) {
  await React.act(async () => KonvaRenderer.updateContainer(React.createElement(WateringHead, { head, elapsed, px }), r, null, () => {}));
  if (container.children.length !== 1) throw new Error('No shape for ' + head.catalogId);
  return container.children[0].sceneFunc();
}
function grid(ctx, x, y, width, height, step = 24) {
  ctx.fillStyle = '#f5f7f8'; ctx.fillRect(x, y, width, height);
  ctx.lineWidth = .6; ctx.strokeStyle = '#e3e7e9'; ctx.beginPath();
  for (let xx = x; xx <= x + width; xx += step) { ctx.moveTo(xx, y); ctx.lineTo(xx, y + height); }
  for (let yy = y; yy <= y + height; yy += step) { ctx.moveTo(x, yy); ctx.lineTo(x + width, yy); }
  ctx.stroke();
}
function bounds(head, profile) {
  if (profile.kind === 'flood') return [-1, -1, 1, 1];
  let points = profile.footprint;
  if (profile.strip) {
    const s = profile.strip, a = head.start * Math.PI / 180;
    points = [[s.ox, s.oy], [s.ox + s.l, s.oy], [s.ox + s.l, s.oy + s.w], [s.ox, s.oy + s.w]]
      .map(([x, y]) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) }));
  }
  points ??= [{ x: 0, y: 0 }, ...Array.from({ length: 129 }, (_, i) => {
    const a = (head.start + head.arc * i / 128) * Math.PI / 180; return { x: head.r * Math.cos(a), y: head.r * Math.sin(a) };
  })];
  return [Math.min(0, ...points.map(p => p.x)), Math.min(0, ...points.map(p => p.y)), Math.max(0, ...points.map(p => p.x)), Math.max(0, ...points.map(p => p.y))];
}
try {
  await mkdir(output, { recursive: true });
  const cardW = 360, cardH = 320, canvas = createCanvas(cardW * 4, cardH * 4 + 58), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#233b4c'; ctx.font = 'bold 22px sans-serif'; ctx.fillText('Watering preview — actual application renderer', 20, 29);
  ctx.fillStyle = '#607482'; ctx.font = '13px sans-serif'; ctx.fillText('Two moments per model · pale plan grid · illustrative motion and droplet detail', 20, 49);
  const rendered = [];
  for (let n = 0; n < examples.length; n++) {
    const example = examples[n], [minX, minY, maxX, maxY] = bounds(example.head, example.profile);
    const px = example.profile.kind === 'flood' ? 110 : Math.min(140, 292 / Math.max(.1, maxX - minX), 220 / Math.max(.1, maxY - minY));
    const paint = await painter(example.head, px);
    for (let frame = 0; frame < 2; frame++) {
      const i = n * 2 + frame, x = (i % 4) * cardW, y = Math.floor(i / 4) * cardH + 58;
      grid(ctx, x + 8, y + 54, cardW - 16, cardH - 62);
      ctx.fillStyle = '#233b4c'; ctx.font = 'bold 16px sans-serif'; ctx.fillText(example.title, x + 14, y + 21);
      ctx.fillStyle = '#687f8e'; ctx.font = '12px sans-serif'; ctx.fillText(`${example.description} · t=${6.2 + frame * 3.7}s`, x + 14, y + 41);
      const originX = x + cardW / 2 - (minX + maxX) * px / 2;
      const originY = y + 184 - (minY + maxY) * px / 2;
      ctx.save(); ctx.beginPath(); ctx.rect(x + 8, y + 54, cardW - 16, cardH - 62); ctx.clip();
      ctx.translate(originX, originY); elapsed.current = 6.2 + frame * 3.7; paint(bridge(ctx));
      ctx.fillStyle = '#4b5a5e'; ctx.beginPath(); ctx.arc(0, 0, 3.3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    rendered.push({ id: example.head.catalogId, kind: example.profile.kind, pxPerM: px, radiusM: example.head.r,
      arcDeg: example.head.arc, streamCount: water.wateringStreamCount?.(example.head, example.profile) ?? (['rotor', 'opposed'].includes(example.profile.kind) ? example.profile.reaches.length : 0),
      particles: water.wateringParticleBudget?.(example.head, example.profile, px) ?? { main: water.wateringParticleCount(example.profile), micro: 720 } });
  }
  await writeFile(resolve(output, 'contact-sheet.png'), await canvas.encode('png'));
  // An enlarged MP sequence makes distal stream breakup and independent flight visible.
  const mp = examples[0], detail = createCanvas(1680, 560), d = detail.getContext('2d'), px = 220 / mp.head.r;
  const paint = await painter(mp.head, px);
  for (let frame = 0; frame < 3; frame++) {
    grid(d, frame * 560, 0, 560, 560, 28); d.fillStyle = '#233b4c'; d.font = 'bold 18px sans-serif';
    d.fillText(`MP1000 — t=${(6.2 + frame * 1.4).toFixed(1)}s`, frame * 560 + 18, 30);
    d.save(); d.translate(frame * 560 + 280, 290); elapsed.current = 6.2 + frame * 1.4; paint(bridge(d));
    d.fillStyle = '#4b5a5e'; d.beginPath(); d.arc(0, 0, 4, 0, Math.PI * 2); d.fill(); d.restore();
  }
  await writeFile(resolve(output, 'mp-motion-frames.png'), await detail.encode('png'));
  // Keep physical scale identical across models: no auto-fit that could conceal
  // disappearing water when a small real head is seen in a large plan.
  const zoomValues = [6, 12, 18, 36], zoomW = 460, zoomH = 420;
  const zoomCanvas = createCanvas(zoomW * zoomValues.length, zoomH * 3), z = zoomCanvas.getContext('2d');
  const zoomRendered = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < zoomValues.length; col++) {
    const example = examples[row], px = zoomValues[col], x = col * zoomW, y = row * zoomH;
    grid(z, x, y, zoomW, zoomH, 24);
    z.fillStyle = '#233b4c'; z.font = 'bold 17px sans-serif'; z.fillText(example.title, x + 16, y + 26);
    z.fillStyle = '#607482'; z.font = '13px sans-serif'; z.fillText(`${px} px/m · actual radius ${example.head.r.toFixed(2)} m`, x + 16, y + 48);
    const paint = await painter(example.head, px);
    z.save(); z.beginPath(); z.rect(x + 5, y + 58, zoomW - 10, zoomH - 63); z.clip();
    z.translate(x + zoomW / 2, y + 230); elapsed.current = 6.2; paint(bridge(z));
    z.fillStyle = '#4b5a5e'; z.beginPath(); z.arc(0, 0, 2.5, 0, Math.PI * 2); z.fill(); z.restore();
    zoomRendered.push({ id: example.head.catalogId, pxPerM: px, radiusPixels: example.head.r * px,
      particles: water.wateringParticleBudget?.(example.head, example.profile, px) ?? { main: water.wateringParticleCount(example.profile), micro: 720 } });
  }
  await writeFile(resolve(output, 'far-zoom-comparison.png'), await zoomCanvas.encode('png'));
  const timings = [], perfCanvas = createCanvas(2400, 1600), perfContext = perfCanvas.getContext('2d');
  for (const px of [18, 36, 72]) {
    const paints = [];
    for (const example of examples) paints.push(await painter(example.head, px));
    const samples = [];
    for (let sample = 0; sample < 15; sample++) {
      perfContext.clearRect(0, 0, 2400, 1600); elapsed.current = 6.2 + sample / 30;
      const begin = performance.now();
      for (let i = 0; i < paints.length; i++) {
        perfContext.save(); perfContext.translate(300 + (i % 4) * 600, 400 + Math.floor(i / 4) * 800);
        paints[i](bridge(perfContext)); perfContext.restore();
      }
      if (sample >= 3) samples.push(performance.now() - begin);
    }
    samples.sort((a, b) => a - b);
    timings.push({ pxPerM: px, heads: paints.length, measuredFrames: samples.length,
      meanMs: samples.reduce((a, b) => a + b, 0) / samples.length,
      medianMs: samples[Math.floor(samples.length / 2)], p95Ms: samples[Math.floor(samples.length * .95)] });
  }
  if (errors.length) throw new AggregateError(errors, 'React Konva render errors');
  const report = { baseline: baseline ?? null, renderer: 'Actual WateringHead Konva sceneFunc via ReactKonvaCore and @napi-rs/canvas',
    limitation: 'Native paint timing only; excludes browser compositing and does not measure browser FPS.', rendered, zoomRendered, timings };
  await writeFile(resolve(output, 'render-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, renderedModels: rendered.length, timings }, null, 2));
} finally {
  await React.act(async () => KonvaRenderer.updateContainer(null, r, null, () => {}));
  globalThis.IS_REACT_ACT_ENVIRONMENT = previous; await server.close();
}
