/** Actual CatalogThumb SSR SVG, rasterized locally without a browser or server. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createCanvas, loadImage } from '@napi-rs/canvas';

export async function createIconHarness() {
  const server = await createServer({ configFile: false, root: process.cwd(), resolve: { alias: { '@': resolve('src') } }, server: { middlewareMode: true, hmr: false }, logLevel: 'silent' });
  const [catalog, details, app, i18n, store] = await Promise.all([
    server.ssrLoadModule('/src/lib/equipment-catalog.ts'),
    server.ssrLoadModule('/src/components/designer/catalog-details.tsx'),
    server.ssrLoadModule('/src/components/designer/designer-app.tsx'),
    server.ssrLoadModule('/src/lib/i18n.ts'),
    server.ssrLoadModule('/src/lib/project-store.ts'),
  ]);
  const svg = (item, color = catalog.equipmentAppearance(item).color) => renderToStaticMarkup(createElement(details.CatalogThumb, { item, color }));
  const image = async (item, color, size = 160) => {
    const markup = svg(item, color).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/width="[^"]+"/, `width="${size}"`).replace(/height="[^"]+"/, `height="${size}"`);
    return loadImage(Buffer.from(markup));
  };
  return { catalog, details, app, i18n, store: store.useProject, svg, image, createCanvas, close: () => server.close() };
}

async function main() {
  const output = process.argv[2] ?? '/private/tmp/irri-coverage-icons', h = await createIconHarness();
  try {
    await mkdir(output, { recursive: true });
    const ids = ['MP1000-90', 'MP-CORNER', 'PGP-ADJ', 'I-25', 'rain-bird:R-VAN14', 'rain-bird:5004-PC', 'toro:PSN4X15-RCS', 'k-rain:RN100-ADJ-90-210',
      'MP-LCS-515', 'MP-RCS-515', 'CS-530', 'ES-515', 'toro:PSN4X30-SST', 'rain-bird:15EST', 'rain-bird:15CST', 'k-rain:P15SS',
      'rain-bird:SQ-QTR', 'rain-bird:SQ-HLF', 'rain-bird:SQ-3QTR', 'rain-bird:SQ-FUL',
      'PCN-25', 'rain-bird:1401', 'k-rain:TB-025', 'AFB', 'MSBN-25Q', 'MSBN-50H', 'MSBN-10F', 'MSBN-25V', '5-CST-B',
      'rain-bird:5CST-B', 'k-rain:P15HL', 'k-rain:FN-15HL'];
    const items = ids.map(id => h.catalog.itemById(id)).filter(Boolean);
    const base = h.catalog.itemById('MP-CORNER');
    items.push(...[5, 15, 39, 359.5].map(arc => ({ ...base, id: `Geometry fixture ${arc}°`, arcMin: arc, arcMax: arc, allowedArcRanges: undefined })));
    const columns = 4, cellWidth = 280, cellHeight = 215, rows = Math.ceil(items.length / columns);
    const canvas = createCanvas(columns * cellWidth, rows * cellHeight), ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f5f7f8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const report = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index], x = index % columns * cellWidth, y = Math.floor(index / columns) * cellHeight;
      ctx.fillStyle = '#203b49'; ctx.font = 'bold 14px sans-serif'; ctx.fillText(item.id, x + 14, y + 23);
      ctx.font = '12px sans-serif'; ctx.fillStyle = '#637583'; ctx.fillText(`${item.manufacturerId} · ${item.coverageKind ?? 'sector'}`, x + 14, y + 43);
      ctx.drawImage(await h.image(item, undefined, 140), x + 100, y + 60);
      ctx.drawImage(await h.image(item, undefined, 40), x + 24, y + 100);
      ctx.strokeStyle = '#d6dfe3'; ctx.strokeRect(x + .5, y + .5, cellWidth, cellHeight);
      report.push({ id: item.id, kind: item.coverageKind ?? 'sector', svg: h.svg(item) });
    }
    await writeFile(resolve(output, 'coverage-icon-contact-sheet.png'), await canvas.encode('png'));
    await writeFile(resolve(output, 'coverage-icon-render-report.json'), JSON.stringify({ totalCatalog: h.catalog.CATALOG.length, totalNonBody: h.catalog.CATALOG.filter(item => item.type !== 'body').length, placeable: h.catalog.placeableCatalog().length, samples: report }, null, 2) + '\n');
    console.log(JSON.stringify({ output, samples: report.length }));
  } finally { await h.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
