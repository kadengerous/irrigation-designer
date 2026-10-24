import {operatingGeometryAvailable} from "./flow";
import {specialFootprint} from "./equipment-footprint";
import {engineeringMaterials} from './engineering-materials';
import {landscapeFootprint,landscapeLayerVisible,landscapeImageSrc,landscapeArtworkBox,landscapeName} from "./landscape-objects";
import { visibleProjectHeads } from "./head-visibility";
import { localeDirection } from "./locale-config";
import { activeLocale, text, formatDate, formatNumber } from "./i18n";
import { currentUnits, formatLenU, formatAreaU, formatFlowU, fromMeters } from "./units";
import { zoneLabel } from "./project-types";
import { plantName } from "./catalog-localization";
import { referenceCorners } from "./reference-geometry";
import { pdfText } from "./pdf-text";
import { catalogForHead, equipmentAppearance, bodyForHead, bomLineName, defaultNozzle, itemById, stripAtPressure, supportsArc } from "@/lib/equipment-catalog";
import { drawingOrMigrate, facePoints, faceHoles, resolveDim } from "@/lib/cad/engine";
import { REGION_FILL } from "@/lib/cad/types";
import { zoneFlow } from "@/lib/hydro";
import { boundsOf, fmt1, polygonArea, sectorLocal, type Pt } from "@/lib/geometry";
import type { Project } from "@/lib/project-types";
import {plantImageSrc,plantArtworkBox,plantLayerVisible,plantLayerId,plantVisualId} from "./plant-visuals";
import { requestFileDestination } from './file-save';
import { displayedDimensions } from './cad/sprinkler-dimensions';
import {layoutDimensions} from './cad/dimension-layout';
import {dimensionEndMarkers} from './cad/dimension-appearance';
import {plantVectorArtwork,landscapeVectorArtwork,vectorArtworkSvg} from './landscape-vector';

export type SaveTarget = { createWritable: () => Promise<{ write: (blob: Blob) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> }> } | undefined;
export async function chooseSaveTarget(filename: string, mime: string): Promise<SaveTarget | null> {
  const picker = (window as unknown as { showSaveFilePicker?: (options: unknown) => Promise<Exclude<SaveTarget,undefined>> }).showSaveFilePicker;
  if (!picker) return {createWritable:async()=>{
    let pending:Blob|null=null;
    return {write:async(blob:Blob)=>{pending=blob;},close:async()=>{if(pending)await requestFileDestination(pending,filename);},abort:async()=>{pending=null;}};
  }};
  try { return await picker.call(window,{suggestedName:filename,excludeAcceptAllOption:true,types:[{accept:{[mime]:[`.${filename.split(".").pop()}`]}}]}); }
  catch (error) { if (error instanceof DOMException && error.name === "AbortError") return null; throw error; }
}
export async function saveFile(blob: Blob, filename: string, target?: SaveTarget) {
  if (target) {
    const stream = await target.createWritable();
    try { await stream.write(blob); await stream.close(); } catch(error) { await stream.abort().catch(()=>{}); throw error; }
    return;
  }
  await requestFileDestination(blob,filename);
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

export async function exportPng(dataUrl: string, name: string, target?: SaveTarget) {
  await saveFile(dataUrlToBlob(dataUrl), `${name}.png`, target);
}
export async function exportJpegFromProject(project: Project, name: string, target?: SaveTarget) {
  const src = await rasterizeSvg(await projectToEmbeddedSvg(project));
  const image = new Image(); image.src = src; await image.decode();
  const canvas = document.createElement("canvas"); canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext("2d")!;ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);
  await saveFile(dataUrlToBlob(canvas.toDataURL("image/jpeg",.94)),`${name}.jpeg`,target);
}

function collectPts(project: Project): Pt[] {
  const pts: Pt[] = [];
  if (project.underlay?.visible) pts.push(...referenceCorners(project.underlay));
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
  if (d.layers?.plants?.visible !== false) for (const plant of Object.values(d.plants ?? {}).filter(p=>plantLayerVisible(d,p.kind,p))) {
    pts.push({x:plant.x-plant.r,y:plant.y-plant.r},{x:plant.x+plant.r,y:plant.y+plant.r});
  }
  for(const o of Object.values(d.landscapeObjects??{}).filter(o=>landscapeLayerVisible(d,o.category,o)))pts.push(...landscapeFootprint(o));
  for (const h of visibleProjectHeads(project)) {
    pts.push({ x: h.x - h.r, y: h.y - h.r }, { x: h.x + h.r, y: h.y + h.r });
  }
  if(d.layers?.dims?.visible!==false)for(const row of layoutDimensions(d,1,undefined,n=>formatLenU(n,currentUnits().length)).values()){
    pts.push(...row.segments.flatMap(s=>[s.a,s.b]),{x:row.box.x,y:row.box.y},{x:row.box.x+row.box.width,y:row.box.y+row.box.height});
  }
  return pts;
}

export function projectToSvg(project: Project, images: Record<string,string|null> = {}): string {
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

  const artPlants=Object.values(d.plants??{}).filter(p=>plantLayerVisible(d,p.kind,p));
  const artIds=new Set<string>();
  parts.push('<defs>');
  for(const plant of artPlants){
    if(plant.visualMode==='vector'||images[plantImageSrc(plant)]===null)continue;
    const id=plantVisualId(plant);if(artIds.has(id))continue;artIds.add(id);
    const src=plantImageSrc(plant),{crop}=plantArtworkBox(plant,plant.r*2);
    parts.push(`<image id="plant-art-${id}" href="${escapeXml(images[src]??src)}" width="${crop.imageWidth}" height="${crop.imageHeight}"/>`);
  }
  const objectArtIds=new Set<string>();
  for(const o of Object.values(d.landscapeObjects??{}).filter(o=>landscapeLayerVisible(d,o.category,o))){
    if(o.visualMode==='vector'||images[landscapeImageSrc(o)]===null||objectArtIds.has(o.catalogId))continue;objectArtIds.add(o.catalogId);
    const src=landscapeImageSrc(o),{crop}=landscapeArtworkBox(o);
    parts.push(`<image id="landscape-art-${escapeXml(o.catalogId)}" href="${escapeXml(images[src]??src)}" width="${crop.imageWidth}" height="${crop.imageHeight}"/>`);
  }
  parts.push('</defs>');
  const reference = project.underlay;
  if (reference?.visible) parts.push(`<image href="${escapeXml(reference.src)}" x="${reference.x}" y="${reference.y}" width="${reference.width}" height="${reference.height}" opacity="${reference.opacity}" transform="rotate(${reference.rotation} ${reference.x} ${reference.y})" preserveAspectRatio="none"/>`);

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
    const themed = f.fill === "theme";
    const accent = typeof document === "undefined" ? "#0A7C66" : getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() || "#0A7C66";
    const fill = themed ? accent : f.fill ?? REGION_FILL[f.type] ?? "#d0ccc4";
    const op = fill === "transparent" ? 0 : themed ? 0.15 : 0.72;
    if (f.circle) {
      parts.push(
        `<circle cx="${f.circle.cx}" cy="${f.circle.cy}" r="${f.circle.r}" fill="${fill}" fill-opacity="${op}" stroke="#1c1b17" stroke-width="0.05"/>`,
      );
      continue;
    }
    const pts = facePoints(d, f.id);
    if (pts.length < 2) continue;
    const path = [pts,...faceHoles(d,f.id)].map(ring=>ring.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z").join(" ");
    parts.push(`<path d="${path}" fill="${fill}" fill-rule="evenodd" fill-opacity="${op}" stroke="#1c1b17" stroke-width="0.05"/>`);
  }

  for (const head of visibleProjectHeads(project)) {
    const item = catalogForHead(head);
    const nozzle = head.nozzleId ? item?.nozzles.find(n => n.id === head.nozzleId) : item && defaultNozzle(item);
    const color = equipmentAppearance(item,head.nozzleId).color;
    const strip = item && stripAtPressure(item, head.designPressure);
    const angle = head.start * Math.PI / 180;
    const special=specialFootprint(head)?.flatMap(p=>[p.x,p.y]);
    const local = !item||!operatingGeometryAvailable(item,head)||!supportsArc(item,head.arc)||!Number.isFinite(head.r)||head.r<0?[]:special ?? (strip ? [[strip.ox, strip.oy], [strip.ox + strip.l, strip.oy], [strip.ox + strip.l, strip.oy + strip.w], [strip.ox, strip.oy + strip.w]].flatMap(([x,y]) => [x! * Math.cos(angle) - y! * Math.sin(angle), x! * Math.sin(angle) + y! * Math.cos(angle)])
      : item?.strip || item?.coverageKind === "point" || item?.coverageKind === "streams" ? [] : sectorLocal(head.r, head.start, head.arc));
    const path = local
      .reduce((acc, n, i) => {
        if (i % 2 === 0) acc.push(`${i === 0 ? "M" : "L"} ${head.x + n}`);
        else acc[acc.length - 1] += ` ${head.y + n}`;
        return acc;
      }, [] as string[])
      .join(" ");
    if (local.length) parts.push(`<path d="${path} Z" fill="${color}" fill-opacity="0.38" stroke="${color}" stroke-width="0.04"/>`);
    parts.push(`<circle cx="${head.x}" cy="${head.y}" r="0.18" fill="#fffdf8" stroke="#1c1b17" stroke-width="0.04"/>`);
    parts.push(`<circle cx="${head.x}" cy="${head.y}" r="0.1" fill="${color}"/>`);
  }

  if (d.dims && d.layers?.dims?.visible !== false) {
    for (const row of layoutDimensions(d,1,undefined,n=>formatLenU(n,currentUnits().length)).values()) {
      const line=row.segments[1]!,markers=dimensionEndMarkers(line.a,line.b,row.annotationScale/36);
      const path=row.segments.slice(0,3).map(s=>`M${s.a.x} ${s.a.y}L${s.b.x} ${s.b.y}`).join(' ');
      parts.push(`<g data-dimension-id="${escapeXml(row.id)}"><path d="${path}" fill="none" stroke="#2b6f9a" stroke-width="${.04*row.annotationScale}"/>`);
      for(const marker of markers.markers){
        parts.push(`<polyline points="${marker.tick.join(' ')}" fill="none" stroke="#2b6f9a" stroke-width="${.025*row.annotationScale}"/>`);
        if(marker.extension)parts.push(`<polyline points="${marker.extension.join(' ')}" fill="none" stroke="#2b6f9a" stroke-width="${.025*row.annotationScale}"/>`);
        parts.push(`<polygon points="${marker.arrow.join(' ')}" fill="#2b6f9a"/>`);
      }
      parts.push(`<text x="${row.text.x}" y="${row.text.y}" transform="rotate(${row.text.angle} ${row.text.x} ${row.text.y})" font-size="${12*row.textScale/36}" font-family="IBM Plex Sans, sans-serif" dominant-baseline="central" fill="#2b6f9a" text-anchor="middle">${escapeXml(row.label)}</text></g>`);
    }
  }
  for(const o of Object.values(d.landscapeObjects??{}).filter(o=>landscapeLayerVisible(d,o.category,o))){
    if(o.visualMode==='vector'||images[landscapeImageSrc(o)]===null){
      parts.push(`<g data-landscape-id="${escapeXml(o.id)}" data-landscape-visual="vector" transform="translate(${o.x} ${o.y}) rotate(${o.rotation})"><title>${escapeXml(landscapeName(o))}</title>${vectorArtworkSvg(landscapeVectorArtwork(o))}</g>`);
      continue;
    }
    const box=landscapeArtworkBox(o),crop=box.crop;
    parts.push(`<g data-landscape-id="${escapeXml(o.id)}" transform="rotate(${o.rotation} ${o.x} ${o.y})"><title>${escapeXml(landscapeName(o))}</title><svg x="${o.x-box.width/2}" y="${o.y-box.height/2}" width="${box.width}" height="${box.height}" viewBox="${crop.x} ${crop.y} ${crop.width} ${crop.height}" preserveAspectRatio="none"><use href="#landscape-art-${escapeXml(o.catalogId)}"/></svg></g>`);
  }
  if (d.layers?.plants?.visible !== false) for (const plant of Object.values(d.plants ?? {}).filter(p=>plantLayerVisible(d,p.kind,p))) {
    if(plant.visualMode==='vector'||images[plantImageSrc(plant)]===null){
      parts.push(`<g data-plant-id="${escapeXml(plant.id)}" data-landscape-visual="vector" transform="translate(${plant.x} ${plant.y}) rotate(${plant.rotation??0})"><title>${escapeXml(plant.catalog?plantName(plant.catalog):text('plant'))}</title>${vectorArtworkSvg(plantVectorArtwork(plant,plant.r*2))}</g>`);
      continue;
    }
    const box=plantArtworkBox(plant,plant.r*2),crop=box.crop;
    parts.push(`<g data-plant-id="${escapeXml(plant.id)}" transform="rotate(${plant.rotation??0} ${plant.x} ${plant.y})"><title>${escapeXml(plant.catalog ? plantName(plant.catalog) : text("plant"))}</title><svg x="${plant.x-box.width/2}" y="${plant.y-box.height/2}" width="${box.width}" height="${box.height}" viewBox="${crop.x} ${crop.y} ${crop.width} ${crop.height}"><use href="#plant-art-${plantVisualId(plant)}"/></svg></g>`);
  }
  if (d.texts) {
    for (const tx of Object.values(d.texts)) {
      parts.push(`<text x="${tx.x}" y="${tx.y}" font-size="${tx.size}" font-family="${escapeXml(tx.fontFamily ?? "IBM Plex Sans")}" font-weight="${tx.bold ? "bold" : "normal"}" font-style="${tx.italic ? "italic" : "normal"}" text-decoration="${tx.underline ? "underline" : "none"}" fill="${escapeXml(tx.color ?? "#1b1f24")}">${escapeXml(tx.text)}</text>`);
    }
  }

  parts.push(`</svg>`);
  return parts.join("\n");
}

const plantData = new Map<string,Promise<string>>();
/** An exported document must never depend on a running site or an external image URL. */
export async function projectToEmbeddedSvg(project: Project): Promise<string> {
  const d=drawingOrMigrate(project);
  const sources=[...new Set([...Object.values(d.plants??{}).filter(p=>p.visualMode!=='vector'&&plantLayerVisible(d,p.kind,p)).map(plantImageSrc),...Object.values(d.landscapeObjects??{}).filter(o=>o.visualMode!=='vector'&&landscapeLayerVisible(d,o.category,o)).map(landscapeImageSrc)])];
  const images=Object.fromEntries(await Promise.all(sources.map(async src=>{
    let pending=plantData.get(src);
    if(!pending){
      pending=(async()=>{
        const response=await fetch(src);
        if(!response.ok)throw new Error('plant-export-image');
        const bytes=new Uint8Array(await response.arrayBuffer());
        let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
        const mime=src.endsWith('.webp')?'image/webp':'image/png';
        const data=`data:${mime};base64,${btoa(binary)}`;
        if(mime==='image/png')return data;
        // Deliver compact images, but embed standard PNG in documents:
        // SVG/PDF rasterizers do not all support a nested WebP image.
        const image=new Image();image.src=data;await image.decode();
        const canvas=document.createElement('canvas');
        canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
        const context=canvas.getContext('2d');if(!context)throw new Error('canvas');
        context.drawImage(image,0,0);
        return canvas.toDataURL('image/png');
      })();
      plantData.set(src,pending);
      pending.catch(()=>plantData.delete(src));
    }
    // A missing illustration uses the same deterministic vector fallback as the canvas.
    return [src,await pending.catch(()=>null)];
  })));
  return projectToSvg(project,images);
}

export async function rasterizeSvg(svg: string, width = 3200): Promise<string> {
  // Give SVG decoders the final pixel dimensions before decoding embedded art.
  // This also avoids enlarging an already-rasterized small SVG in Safari.
  svg=svg.replace(/<svg\b([^>]*)>/,(_,attributes:string)=>{
    const view=attributes.match(/viewBox="([^"]+)"/)?.[1]?.trim().split(/\s+/).map(Number);
    if(!view||!Number.isFinite(view[2])||!Number.isFinite(view[3])||view[2]!<=0||view[3]!<=0)return `<svg${attributes}>`;
    const scale=Math.min(width/view[2]!,4096/view[3]!);
    return `<svg${attributes.replace(/\swidth="[^"]*"/, '').replace(/\sheight="[^"]*"/, '')} width="${Math.max(1,Math.round(view[2]!*scale))}" height="${Math.max(1,Math.round(view[3]!*scale))}">`;
  });
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
    const scale = Math.min(width / Math.max(1,img.width), 4096 / Math.max(1,img.height));
    c.width = Math.max(1,Math.round(img.width*scale));
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

export async function exportSvg(project: Project, name: string, target?: SaveTarget) {
  const svg = await projectToEmbeddedSvg(project);
  await saveFile(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${name}.svg`, target);
}

export async function exportDxf(project: Project, name: string, target?: SaveTarget) {
  await saveFile(new Blob([projectToDxf(project)], { type: "application/dxf" }), `${name}.dxf`, target);
}

export async function exportProjectJson(project: Project, name: string) {
  const stem = name.replace(/[^\p{L}\p{N} _-]+/gu, " ").trim() || "project";
  await saveFile(
    new Blob([JSON.stringify({ schemaVersion: 1, type: "irrigationproject", project }, null, 2)], { type: "application/json" }),
    `${stem}.json`,
  );
}

export async function exportPngFromProject(project: Project, name: string, target?: SaveTarget) {
  const png = await rasterizeSvg(await projectToEmbeddedSvg(project));
  await exportPng(png, name, target);
}

export async function exportPdfFromProject(project: Project, name: string, pngDataUrl?: string, target?: SaveTarget) {
  const png = pngDataUrl ?? (await rasterizeSvg(await projectToEmbeddedSvg(project)));
  await exportPdf(png, project, name, target);
}

function dxfPair(code: number, value: string | number) {
  return `${code}\n${value}\n`;
}

export function projectToDxf(project: Project): string {
  const d = drawingOrMigrate(project);
  const length = currentUnits().length;
  const pair = (code: number, value: string | number) => dxfPair(code, typeof value === "number" && [10, 20, 11, 21, 40].includes(code) ? fromMeters(value, length) : value);
  let s = dxfPair(0, "SECTION") + dxfPair(2, "HEADER") + dxfPair(9, "$INSUNITS") + dxfPair(70, { in: 1, ft: 2, mm: 4, cm: 5, m: 6 }[length]) + dxfPair(0, "ENDSEC") + dxfPair(0, "SECTION") + dxfPair(2, "ENTITIES");
  const flip = (y: number) => -y;
  for (const f of Object.values(d.faces)) {
    if (f.hidden) continue;
    if (f.circle) {
      s += pair(0, "CIRCLE") + pair(8, f.type);
      s += pair(10, f.circle.cx) + pair(20, flip(f.circle.cy)) + pair(40, f.circle.r);
      continue;
    }
    const pts = facePoints(d, f.id);
    if (pts.length < 2) continue;
    s += pair(0, "LWPOLYLINE") + pair(8, f.type) + pair(90, pts.length) + pair(70, 1);
    for (const p of pts) s += pair(10, p.x) + pair(20, flip(p.y));
  }
  for (const dim of d.layers?.dims?.visible === false ? [] : displayedDimensions(d)) {
    const { a, b } = resolveDim(d, dim);
    s += pair(0, "LINE") + pair(8, "DIM");
    s += pair(10, a.x) + pair(20, flip(a.y)) + pair(11, b.x) + pair(21, flip(b.y));
    if (dim.label) s += pair(0,"TEXT") + pair(8,"DIM") + pair(10,(a.x+b.x)/2) + pair(20,flip((a.y+b.y)/2-0.15)) + pair(40,0.35) + pair(1,dim.label.replace(/[\r\n]/g," "));
  }
  for (const tx of Object.values(d.texts ?? {})) {
    s += pair(0, "TEXT") + pair(8, "TEXT") + pair(10, tx.x) + pair(20, flip(tx.y));
    s += pair(40, tx.size) + pair(1, tx.text);
  }
  if (d.layers?.plants?.visible !== false) for (const plant of Object.values(d.plants ?? {}).filter(p=>plantLayerVisible(d,p.kind,p))) {
    s += pair(0, "CIRCLE") + pair(8, plantLayerId(plant.kind).toUpperCase()) + pair(10, plant.x) + pair(20, flip(plant.y)) + pair(40, plant.r);
    const label = plant.catalog ? [plantName(plant.catalog),plant.catalog.cultivar].filter(Boolean).join(" ") : text("plant");
    s += pair(0, "TEXT") + pair(8, "PLANT_LABELS") + pair(10, plant.x) + pair(20, flip(plant.y + plant.r + 0.2)) + pair(40, 0.2) + pair(1, label);
  }
  for (const h of visibleProjectHeads(project)) {
    s += pair(0, "CIRCLE") + pair(8, "HEAD") + pair(10, h.x) + pair(20, flip(h.y)) + pair(40, 0.15);
  }
  s += pair(0, "ENDSEC") + pair(0, "EOF");
  return s;
}

export async function exportPdf(pngDataUrl: string, project: Project, name: string, target?: SaveTarget) {
  const { jsPDF } = await import("jspdf");
  await document.fonts.ready;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const units = currentUnits();
  const rtl = localeDirection(activeLocale()) === "rtl";
  doc.setFillColor(247, 243, 234); doc.rect(0, 0, 297, 210, "F");
  pdfText(doc, project.name || text("untitled"), rtl ? 285 : 12, 8, { size: 16, width: 270, bold: true, align: rtl ? "right" : "left" });
  pdfText(doc, text("hunterTagline"), rtl ? 285 : 12, 18, { size: 10, align: rtl ? "right" : "left" });
  const image = doc.getImageProperties(pngDataUrl);
  const factor = Math.min(180 / image.width, 164 / image.height);
  doc.addImage(pngDataUrl, "PNG", rtl ? 105 : 12, 29, image.width * factor, image.height * factor, undefined, "FAST");
  let y = 29;
  const row = (label: string, bold = false) => {
    if (y > 192) { doc.addPage(); y = 14; }
    y += pdfText(doc, label, rtl ? 96 : 200, y, { width: 84, size: bold ? 11 : 9, bold, align: rtl ? "right" : "left" }) + 2;
  };
  row(text("zones"), true);
  for (const z of project.zones) {
    const heads = project.heads.filter(h => h.zone === z.id), q = zoneFlow(heads, z.id);
    row(`${zoneLabel(z)} · ${formatNumber(heads.length, 0)} ${text("pcs")} · ${q == null ? text("noFlowData") : formatFlowU(q, units.flow)}`);
  }
  y += 4; row(text("estimate"), true);
  for (const line of estimateLines(project)) row(`${line.name} · ${formatNumber(line.qty, line.digits)} ${line.unit}`);
  doc.setPage(1);
  const lawn = project.polygons.filter(p => p.kind === "lawn").reduce((area, p) => area + polygonArea(p.points), 0);
  pdfText(doc, `${text("lawn")} ${formatAreaU(lawn, units.area)} · ${text("heads")} ${formatNumber(project.heads.length, 0)} · ${formatDate(new Date())}`, rtl ? 285 : 12, 199, { size: 8, width: 272, color: "#6d685f", align: rtl ? "right" : "left" });
  await saveFile(doc.output("blob"), `${name}.pdf`, target);
}

export type EstimateLine = { no: number; name: string; qty: number; unit: string; digits: number };

export function estimateLines(project: Project): EstimateLine[] {
  const spr = new Map<string, { name: string; qty: number }>();
  const bod = new Map<string, { name: string; qty: number }>();
  const override = project.bomBodyQty ?? {};
  for (const h of project.heads) {
    const item = catalogForHead(h);
    if (!item) continue;
    const key = item.type === "rotor" ? `${item.id}:${h.popUpMm ?? item.popUpMm}` : item.id;
    const s = spr.get(key) ?? { name: bomLineName(item, h.popUpMm), qty: 0 };
    s.qty += 1;
    spr.set(key, s);
    if (item.type === "rotor") continue;
    const body = bodyForHead(item, h.bodyId, h.popUpMm, h.bodySnapshot);
    if (!body) continue;
    const b = bod.get(body.id) ?? { name: bomLineName(body), qty: 0 };
    b.qty += 1;
    bod.set(body.id, b);
  }
  for (const [id, b] of bod) {
    if (override[id] != null) b.qty = override[id]!;
  }
  const materials=engineeringMaterials(project);
  return [...spr.values(), ...bod.values()].map((r,i)=>({no:i+1,name:r.name,qty:r.qty,unit:text("pcs"),digits:0})).concat(materials.rows.map((r,i)=>({no:spr.size+bod.size+i+1,name:r.name+(r.note?` · ${r.note}`:''),qty:r.qty,unit:r.unit,digits:r.digits})));
}

export async function exportEstimatePdf(project: Project, name: string, target?: SaveTarget) {
  const { jsPDF } = await import("jspdf");
  await document.fonts.ready;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const rtl = localeDirection(activeLocale()) === "rtl";
  const start = rtl ? 196 : 14, align = rtl ? "right" : "left";
  const header = () => {
    doc.setFillColor(247, 243, 234); doc.rect(0, 0, 210, 297, "F");
    pdfText(doc, text("estimate"), start, 9, { size: 16, bold: true, align });
    pdfText(doc, project.name || text("untitled"), start, 21, { size: 11, width: 182, align });
    pdfText(doc, formatDate(new Date()), start, 31, { size: 9, color: "#505a64", align });
    doc.setFillColor(11, 110, 98); doc.rect(12, 41, 186, 9, "F");
    pdfText(doc, text("colNo"), rtl ? 195 : 15, 42, { size: 9, color: "#fff", width: 11, align });
    pdfText(doc, text("colName"), rtl ? 182 : 28, 42, { size: 9, color: "#fff", width: 123, align });
    pdfText(doc, text("colQty"), rtl ? 16 : 194, 42, { size: 9, color: "#fff", align: rtl ? "left" : "right", width: 36 });
  };
  header(); let y = 55;
  for (const row of estimateLines(project)) {
    if (y > 270) { doc.addPage(); header(); y = 55; }
    pdfText(doc, formatNumber(row.no, 0), rtl ? 195 : 15, y, { size: 9, width: 11, align });
    const height = pdfText(doc, row.name, rtl ? 182 : 28, y, { size: 10, width: 123, align });
    pdfText(doc, `${formatNumber(row.qty, row.digits)} ${row.unit}`, rtl ? 16 : 194, y, { size: 10, align: rtl ? "left" : "right", width: 37 });
    y += Math.max(8, height + 3); doc.setDrawColor(210, 200, 188); doc.line(12, y - 1, 198, y - 1);
  }
  if(engineeringMaterials(project).incomplete){if(y>255){doc.addPage();header();y=55;}pdfText(doc,text("engineering.materialReview"),start,y+3,{size:9,width:182,align});}
  await saveFile(doc.output("blob"), `${name}.pdf`, target);
}

function xmlEsc(s: string) {
  return escapeXml(s);
}

export async function exportEstimateExcel(project: Project, name: string, target?: SaveTarget) {
  const { estimateWorkbook } = await import("./estimate-xlsx");
  const rows = [[text("colNo"),text("colName"),text("colQty"),text("unit")],...estimateLines(project).map(r=>[r.no,r.name,r.qty,r.unit])];
  if(engineeringMaterials(project).incomplete)rows.push(["",text("engineering.materialReview"),"",""]);
  await saveFile(estimateWorkbook(rows,text("estimate"),localeDirection(activeLocale())==="rtl"),`${name}.xlsx`,target);
}

export async function exportEstimateWord(project: Project, name: string, target?: SaveTarget) {
  const rows = estimateLines(project);
  const tr = rows
    .map(
      (r) =>
        `<tr><td style="border:1px solid #ccc;padding:6px;text-align:center">${formatNumber(r.no,0)}</td><td style="border:1px solid #ccc;padding:6px">${xmlEsc(r.name)}</td><td style="border:1px solid #ccc;padding:6px;text-align:end">${formatNumber(r.qty,r.digits)} ${xmlEsc(r.unit)}</td></tr>`,
    )
    .join("");
  const html = `<html lang="${activeLocale()}" dir="${localeDirection(activeLocale())}" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${xmlEsc(text("estimate"))}</title></head>
<body>
<h1>${xmlEsc(text("estimate"))}</h1>
<p>${xmlEsc(project.name || "")}<br/>${formatDate(new Date())}</p>
<table style="border-collapse:collapse;width:100%">
<tr>
  <th style="border:1px solid #0b6e62;background:#0b6e62;color:#fff;padding:6px;width:40px">${xmlEsc(text("colNo"))}</th>
  <th style="border:1px solid #0b6e62;background:#0b6e62;color:#fff;padding:6px">${xmlEsc(text("colName"))}</th>
  <th style="border:1px solid #0b6e62;background:#0b6e62;color:#fff;padding:6px;width:90px">${xmlEsc(text("colQty"))}</th>
</tr>
${tr}
</table>
${engineeringMaterials(project).incomplete?`<p>${xmlEsc(text("engineering.materialReview"))}</p>`:""}
</body></html>`;
  await saveFile(new Blob(["\uFEFF", html], { type: "application/msword" }), `${name}.doc`,target);
}
