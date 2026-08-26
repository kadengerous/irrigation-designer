import { bomLineName, defaultBodyFor, itemById } from "@/lib/hunter-catalog";
import { drawingOrMigrate, facePoints, resolveDim } from "@/lib/cad/engine";
import { REGION_FILL } from "@/lib/cad/types";
import { flowLpm } from "@/lib/flow";
import { boundsOf, fmt1, polygonArea, sectorLocal, type Pt } from "@/lib/geometry";
import type { Project } from "@/lib/project-types";

export async function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 8000);
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&#38;").replace(/</g, "&#60;").replace(/>/g, "&#62;").replace(/"/g, "&#34;");
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head ?? "")?.[1] ?? "image/png";
  const bin = atob(body ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function exportPng(dataUrl: string, name: string) {
  await saveFile(dataUrlToBlob(dataUrl), `${name}.png`);
}

function collectPts(project: Project): Pt[] {
  const pts: Pt[] = [];
  const d = drawingOrMigrate(project);
  for (const f of Object.values(d.faces)) {
    if (f.hidden) continue;
    if (f.circle) {
      const { cx, cy, r } = f.circle;
      pts.push({ x: cx - r, y: cy - r }, { x: cx + r, y: cy + r });
    } else {
      pts.push(...facePoints(d, f.id));
    }
  }
  for (const poly of project.polygons) pts.push(...poly.points);
  for (const h of project.heads) {
    pts.push({ x: h.x - h.r, y: h.y - h.r }, { x: h.x + h.r, y: h.y + h.r });
  }
  return pts;
}

export function projectToSvg(project: Project): string {
  const d = drawingOrMigrate(project);
  const box = boundsOf(collectPts(project), 1.2) ?? { minX: 0, minY: 0, maxX: 20, maxY: 16 };
  const w = Math.max(1, box.maxX - box.minX);
  const h = Math.max(1, box.maxY - box.minY);
  const kindFill: Record<string, string> = {
    lawn: "#c5d4b0",
    bed: "#c4b7a8",
    path: "#d9cbb4",
    hardscape: "#d4cdc0",
  };

  const parts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.minX} ${box.minY} ${w} ${h}" width="${Math.round(w * 48)}" height="${Math.round(h * 48)}">`,
    `<rect x="${box.minX}" y="${box.minY}" width="${w}" height="${h}" fill="#fffdf8"/>`,
  ];

  for (const poly of project.polygons) {
    if (poly.ellipse) {
      const e = poly.ellipse;
      const rot = e.rot ?? 0;
      parts.push(
        `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" transform="rotate(${rot} ${e.cx} ${e.cy})" fill="${kindFill[poly.kind] ?? "#ddd"}" fill-opacity="${poly.kind === "lawn" ? 0.78 : 0.5}" stroke="#1c1b17" stroke-width="0.06"/>`,
      );
      continue;
    }
    if (poly.points.length < 3) continue;
    const path = poly.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
    parts.push(
      `<path d="${path}" fill="${kindFill[poly.kind] ?? "#ddd"}" fill-opacity="${poly.kind === "lawn" ? 0.78 : 0.5}" stroke="#1c1b17" stroke-width="0.06"/>`,
    );
  }

  for (const f of Object.values(d.faces)) {
    if (f.hidden) continue;
    const fill = f.fill ?? REGION_FILL[f.type] ?? "#d0ccc4";
    const op = fill === "transparent" ? 0 : 0.72;
    if (f.circle) {
      parts.push(
        `<circle cx="${f.circle.cx}" cy="${f.circle.cy}" r="${f.circle.r}" fill="${fill}" fill-opacity="${op}" stroke="#1c1b17" stroke-width="0.05"/>`,
      );
      continue;
    }
    const pts = facePoints(d, f.id);
    if (pts.length < 2) continue;
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
    parts.push(`<path d="${path}" fill="${fill}" fill-opacity="${op}" stroke="#1c1b17" stroke-width="0.05"/>`);
  }

  const hidden = new Set(project.zones.filter((z) => z.hidden).map((z) => z.id));
  for (const head of project.heads) {
    if (hidden.has(head.zone)) continue;
    const item = itemById(head.catalogId);
    const color = item?.color ?? "#e25b1a";
    const local = sectorLocal(head.r, head.start, head.arc);
    const path = local
      .reduce((acc, n, i) => {
        if (i % 2 === 0) acc.push(`${i === 0 ? "M" : "L"} ${head.x + n}`);
        else acc[acc.length - 1] += ` ${head.y + n}`;
        return acc;
      }, [] as string[])
      .join(" ");
    parts.push(`<path d="${path} Z" fill="${color}" fill-opacity="0.38" stroke="${color}" stroke-width="0.04"/>`);
    parts.push(`<circle cx="${head.x}" cy="${head.y}" r="0.18" fill="#fffdf8" stroke="#1c1b17" stroke-width="0.04"/>`);
    parts.push(`<circle cx="${head.x}" cy="${head.y}" r="0.1" fill="${color}"/>`);
  }

  if (d.dims) {
    for (const dim of Object.values(d.dims)) {
      const { a, b } = resolveDim(d, dim);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#2b6f9a" stroke-width="0.04"/>`);
      parts.push(`<text x="${mx}" y="${my - 0.15}" font-size="0.35" fill="#2b6f9a" text-anchor="middle">${len.toFixed(2)} m</text>`);
    }
  }
  if (d.texts) {
    for (const tx of Object.values(d.texts)) {
      parts.push(`<text x="${tx.x}" y="${tx.y}" font-size="${tx.size}" fill="#1b1f24">${escapeXml(tx.text)}</text>`);
    }
  }

  parts.push(`</svg>`);
  return parts.join("\n");
}

export async function rasterizeSvg(svg: string, width = 1800): Promise<string> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.decoding = "sync";
    const ready = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg"));
    });
    img.src = url;
    await ready;
    const c = document.createElement("canvas");
    const scale = width / Math.max(1, img.width);
    c.width = width;
    c.height = Math.max(1, Math.round(img.height * scale));
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportSvg(project: Project, name: string) {
  const svg = projectToSvg(project);
  await saveFile(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${name}.svg`);
}

export async function exportDxf(project: Project, name: string) {
  await saveFile(new Blob([projectToDxf(project)], { type: "application/dxf" }), `${name}.dxf`);
}

export async function exportProjectJson(project: Project, name: string) {
  const stem = name.replace(/[^\wа-яё -]+/gi, " ").trim() || "project";
  await saveFile(
    new Blob([JSON.stringify({ schemaVersion: 1, type: "irrigationproject", project }, null, 2)], { type: "application/json" }),
    `${stem}.json`,
  );
}

export async function exportPngFromProject(project: Project, name: string) {
  const png = await rasterizeSvg(projectToSvg(project));
  await exportPng(png, name);
}

export async function exportPdfFromProject(project: Project, name: string, pngDataUrl?: string) {
  const png = pngDataUrl ?? (await rasterizeSvg(projectToSvg(project)));
  await exportPdf(png, project, name);
}

function dxfPair(code: number, value: string | number) {
  return `${code}\n${value}\n`;
}

export function projectToDxf(project: Project): string {
  const d = drawingOrMigrate(project);
  let s = dxfPair(0, "SECTION") + dxfPair(2, "ENTITIES");
  const flip = (y: number) => -y;
  for (const f of Object.values(d.faces)) {
    if (f.hidden) continue;
    if (f.circle) {
      s += dxfPair(0, "CIRCLE") + dxfPair(8, f.type);
      s += dxfPair(10, f.circle.cx) + dxfPair(20, flip(f.circle.cy)) + dxfPair(40, f.circle.r);
      continue;
    }
    const pts = facePoints(d, f.id);
    if (pts.length < 2) continue;
    s += dxfPair(0, "LWPOLYLINE") + dxfPair(8, f.type) + dxfPair(90, pts.length) + dxfPair(70, 1);
    for (const p of pts) s += dxfPair(10, p.x) + dxfPair(20, flip(p.y));
  }
  for (const dim of Object.values(d.dims ?? {})) {
    const { a, b } = resolveDim(d, dim);
    s += dxfPair(0, "LINE") + dxfPair(8, "DIM");
    s += dxfPair(10, a.x) + dxfPair(20, flip(a.y)) + dxfPair(11, b.x) + dxfPair(21, flip(b.y));
  }
  for (const tx of Object.values(d.texts ?? {})) {
    s += dxfPair(0, "TEXT") + dxfPair(8, "TEXT") + dxfPair(10, tx.x) + dxfPair(20, flip(tx.y));
    s += dxfPair(40, tx.size) + dxfPair(1, tx.text);
  }
  for (const h of project.heads) {
    s += dxfPair(0, "CIRCLE") + dxfPair(8, "HEAD") + dxfPair(10, h.x) + dxfPair(20, flip(h.y)) + dxfPair(40, 0.15);
  }
  s += dxfPair(0, "ENDSEC") + dxfPair(0, "EOF");
  return s;
}

export async function exportPdf(pngDataUrl: string, project: Project, name: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFillColor(247, 243, 234);
  doc.rect(0, 0, 297, 210, "F");
  doc.setTextColor(28, 27, 23);
  doc.setFontSize(18);
  doc.text(project.name || "IRRIGATION DESIGNER", 12, 14);
  doc.setFontSize(10);
  doc.setTextColor(80, 90, 100);
  doc.text("Проектирование систем Hunter", 12, 20);

  try {
    doc.addImage(pngDataUrl, "PNG", 12, 26, 180, 170, undefined, "FAST");
  } catch {
    doc.text("План не удалось встроить.", 12, 40);
  }

  let y = 28;
  doc.setTextColor(28, 27, 23);
  doc.setFontSize(11);
  doc.text("Зоны", 200, y);
  y += 6;
  doc.setFontSize(9);
  for (const z of project.zones) {
    const heads = project.heads.filter((h) => h.zone === z.id);
    let q = 0;
    for (const h of heads) {
      const it = itemById(h.catalogId);
      q += it ? (flowLpm(it, h.arc) ?? 0) : 0;
    }
    doc.text(`${z.name}  ·  ${heads.length} шт  ·  ${fmt1(q)} л/мин`, 200, y);
    y += 5;
    if (y > 195) break;
  }

  y += 4;
  doc.setFontSize(11);
  doc.text("Смета", 200, y);
  y += 6;
  doc.setFontSize(9);
  const counts = new Map<string, number>();
  for (const h of project.heads) {
    const it = itemById(h.catalogId);
    if (!it) continue;
    counts.set(it.name, (counts.get(it.name) ?? 0) + 1);
  }
  doc.text(`Pro-Spray PRS40  ·  ${project.heads.length} шт`, 200, y);
  y += 5;
  for (const [label, n] of counts) {
    doc.text(`${label}  ·  ${n} шт`, 200, y);
    y += 5;
    if (y > 200) break;
  }

  const lawn = project.polygons.find((p) => p.kind === "lawn");
  const area = lawn ? polygonArea(lawn.points) : 0;
  doc.setFontSize(8);
  doc.setTextColor(109, 104, 95);
  doc.text(
    `Газон ${area.toFixed(1)} м² · ${project.heads.length} дождевателей · ${new Date().toLocaleDateString("ru-RU")}`,
    12,
    204,
  );

  const blob = doc.output("blob");
  await saveFile(blob, `${name}.pdf`);
}

function bufToB64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

async function withCyrFont(doc: InstanceType<typeof import("jspdf").jsPDF>) {
  try {
    const buf = await fetch("/fonts/LiberationSans-Regular.ttf").then((r) => r.arrayBuffer());
    doc.addFileToVFS("LiberationSans-Regular.ttf", bufToB64(buf));
    doc.addFont("LiberationSans-Regular.ttf", "LiberationSans", "normal");
    doc.setFont("LiberationSans");
  } catch {
    /* fallback Helvetica */
  }
}

export type EstimateLine = { no: number; name: string; qty: number };

export function estimateLines(project: Project): EstimateLine[] {
  const spr = new Map<string, { name: string; qty: number }>();
  const bod = new Map<string, { name: string; qty: number }>();
  const override = project.bomBodyQty ?? {};
  for (const h of project.heads) {
    const item = itemById(h.catalogId);
    if (!item) continue;
    const s = spr.get(item.id) ?? { name: bomLineName(item), qty: 0 };
    s.qty += 1;
    spr.set(item.id, s);
    if (item.type === "rotor") continue;
    const bodyId = h.bodyId ?? defaultBodyFor(item);
    const body = itemById(bodyId);
    if (!body) continue;
    const b = bod.get(body.id) ?? { name: bomLineName(body), qty: 0 };
    b.qty += 1;
    bod.set(body.id, b);
  }
  for (const [id, b] of bod) {
    if (override[id] != null) b.qty = override[id]!;
  }
  return [...spr.values(), ...bod.values()].map((r, i) => ({ no: i + 1, name: r.name, qty: r.qty }));
}

export async function exportEstimatePdf(project: Project, name: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await withCyrFont(doc);
  const rows = estimateLines(project);
  doc.setFillColor(247, 243, 234);
  doc.rect(0, 0, 210, 297, "F");
  doc.setTextColor(28, 27, 23);
  doc.setFontSize(16);
  doc.text("Смета", 14, 16);
  doc.setFontSize(11);
  doc.text(project.name || "IRRIGATION DESIGNER", 14, 24);
  doc.setFontSize(9);
  doc.setTextColor(80, 90, 100);
  doc.text(new Date().toLocaleDateString("ru-RU"), 14, 30);

  const col = { no: 16, name: 28, qty: 186 };
  const headY = 40;
  doc.setFillColor(11, 110, 98);
  doc.rect(12, headY - 6, 186, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text("№", col.no, headY);
  doc.text("Наименование", col.name, headY);
  doc.text("Кол-во", col.qty, headY, { align: "right" });

  let y = headY + 10;
  doc.setTextColor(28, 27, 23);
  doc.setFontSize(10);
  for (const r of rows) {
    if (y > 280) {
      doc.addPage();
      doc.setFillColor(247, 243, 234);
      doc.rect(0, 0, 210, 297, "F");
      try {
        doc.setFont("LiberationSans");
      } catch {
        /* ignore */
      }
      y = 18;
    }
    doc.setDrawColor(210, 200, 188);
    doc.line(12, y + 4, 198, y + 4);
    doc.text(String(r.no), col.no, y);
    const label = doc.splitTextToSize(r.name, 140);
    doc.text(label, col.name, y);
    doc.text(`${r.qty} шт`, col.qty, y, { align: "right" });
    y += Math.max(8, label.length * 5 + 4);
  }
  await saveFile(doc.output("blob"), `${name}.pdf`);
}

function xmlEsc(s: string) {
  return escapeXml(s);
}

export async function exportEstimateExcel(project: Project, name: string) {
  const rows = estimateLines(project);
  const body = rows
    .map(
      (r) => `<Row>
        <Cell><Data ss:Type="Number">${r.no}</Data></Cell>
        <Cell><Data ss:Type="String">${xmlEsc(r.name)}</Data></Cell>
        <Cell><Data ss:Type="Number">${r.qty}</Data></Cell>
        <Cell><Data ss:Type="String">шт</Data></Cell>
      </Row>`,
    )
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#0B6E62" ss:Pattern="Solid"/><Font ss:Color="#FFFFFF" ss:Bold="1"/></Style>
  </Styles>
  <Worksheet ss:Name="Смета">
    <Table>
      <Column ss:Width="40"/>
      <Column ss:Width="280"/>
      <Column ss:Width="70"/>
      <Column ss:Width="40"/>
      <Row>
        <Cell ss:StyleID="hdr"><Data ss:Type="String">№</Data></Cell>
        <Cell ss:StyleID="hdr"><Data ss:Type="String">Наименование</Data></Cell>
        <Cell ss:StyleID="hdr"><Data ss:Type="String">Количество</Data></Cell>
        <Cell ss:StyleID="hdr"><Data ss:Type="String">Ед.</Data></Cell>
      </Row>
      ${body}
    </Table>
  </Worksheet>
</Workbook>`;
  await saveFile(new Blob(["\uFEFF", xml], { type: "application/vnd.ms-excel" }), `${name}.xls`);
}

export async function exportEstimateWord(project: Project, name: string) {
  const rows = estimateLines(project);
  const tr = rows
    .map(
      (r) =>
        `<tr><td style="border:1px solid #ccc;padding:6px;text-align:center">${r.no}</td><td style="border:1px solid #ccc;padding:6px">${xmlEsc(r.name)}</td><td style="border:1px solid #ccc;padding:6px;text-align:right">${r.qty} шт</td></tr>`,
    )
    .join("");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>Смета</title></head>
<body>
<h1>Смета</h1>
<p>${xmlEsc(project.name || "")}<br/>${new Date().toLocaleDateString("ru-RU")}</p>
<table style="border-collapse:collapse;width:100%">
<tr>
  <th style="border:1px solid #0b6e62;background:#0b6e62;color:#fff;padding:6px;width:40px">№</th>
  <th style="border:1px solid #0b6e62;background:#0b6e62;color:#fff;padding:6px">Наименование</th>
  <th style="border:1px solid #0b6e62;background:#0b6e62;color:#fff;padding:6px;width:90px">Количество</th>
</tr>
${tr}
</table>
</body></html>`;
  await saveFile(new Blob(["\uFEFF", html], { type: "application/msword" }), `${name}.doc`);
}
