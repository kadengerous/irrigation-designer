import {CATALOG,type CatalogItem} from "./equipment-catalog";
import {equipmentCategory} from "./equipment-library";
import {selectAutomaticHead} from "./automatic-head";
import {catalogHeadDefaults,performanceAt} from "./flow";
import {
  clampArc,
  clampRadius,
  defaultBodyFor,
  defaultPopUpMm,
  itemById,
  pickNozzleForRadius,
  pickSeriesForRadius,
  pickSkuForArc,
  type Family,
} from "@/lib/equipment-catalog";
import { closestOnSegment, cornerArc, dist, headingDeg, pointInPoly, uid, type Pt } from "@/lib/geometry";
import { irrigPatches, exclusionLoops, siteLoop } from "@/lib/cad/irrigation-geom";
import { chooseLayoutFamily, maxThrow, patchMetrics } from "@/lib/hunter-rules";
import { inIrrigationTarget } from "@/lib/coverage";
import type { CadDrawing } from "@/lib/cad/types";
import type { Head } from "@/lib/project-types";

const MAX_PER_PATCH = 24;
const MAX_TOTAL = 40;
const MAX_INTERIOR = 8;

function makeHead(partial: Pick<Head, "catalogId" | "x" | "y" | "arc" | "start" | "r">): Head {
  const item = itemById(partial.catalogId);
  const nz = item ? pickNozzleForRadius(item, partial.r) : null;
  return {
    id: uid("h"),
    catalogId: partial.catalogId,
    nozzleId: nz?.id ?? item?.nozzles[0]?.id ?? null,
    x: partial.x,
    y: partial.y,
    arc: partial.arc,
    start: partial.start,
    r: partial.r,
    zone: 1,
    designPressure: item?.recommendedPressureBar ?? 2.8,
    bodyId: item ? defaultBodyFor(item) : "PRS40",
    popUpMm: item ? defaultPopUpMm(item) : 100,
    locked: false,
    needsReview: false,
  };
}

function skuFor(family: Family, rNeed: number, arc: number, catalog:CatalogItem[]) {
  const series = pickSeriesForRadius(rNeed, family, catalog);
  return pickSkuForArc(series, arc);
}

function fitHead(h: Head, family: Family, keep: Pt[] | null, cuts: Pt[][], catalog:CatalogItem[]): Head {
  const cap = maxThrow(h, h.start, h.arc, keep, cuts);
  const sku = skuFor(family, Math.min(h.r, cap), h.arc,catalog);
  const r = clampRadius(sku, Math.min(h.r, cap));
  const nz = pickNozzleForRadius(sku, r);
  return {
    ...h,
    catalogId: sku.id,
    nozzleId: nz?.id ?? h.nozzleId,
    r,
    arc: clampArc(sku, h.arc),
    bodyId: defaultBodyFor(sku),
    popUpMm: defaultPopUpMm(sku),
    designPressure: sku.recommendedPressureBar,
    needsReview: cap + 0.02 < sku.rMin,
  };
}

function isCorner(prev: Pt, curr: Pt, next: Pt): boolean {
  const { arc } = cornerArc(prev, curr, next);
  return Math.abs(arc - 180) > 28 && arc > 20 && arc < 340;
}

/** Walk the outline by length. Real corners + head-to-head spacing — not every tessellated vertex. */
function perimeterStations(pts: Pt[], spacing: number): { p: Pt; start: number; arc: number }[] {
  if (pts.length < 3) return [];
  const n = pts.length;
  const corners = new Set<number>();
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]!;
    const curr = pts[i]!;
    const next = pts[(i + 1) % n]!;
    if (isCorner(prev, curr, next)) corners.add(i);
  }

  const out: { p: Pt; start: number; arc: number }[] = [];
  const push = (p: Pt, start: number, arc: number) => {
    const last = out[out.length - 1];
    if (last && dist(last.p, p) < spacing * 0.55) return;
    if (out[0] && dist(out[0].p, p) < spacing * 0.55) return;
    out.push({ p, start, arc });
  };

  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const len = dist(a, b);
    if (corners.has(i)) {
      const prev = pts[(i - 1 + n) % n]!;
      const next = pts[(i + 1) % n]!;
      const ca = cornerArc(prev, a, next);
      push(a, ca.start, ca.arc);
    }
    const edgeStart = headingAlongInward(a, b, pts);
    if (len < spacing * 1.15) continue;
    const count = Math.min(6, Math.max(1, Math.round(len / spacing) - 1));
    for (let k = 1; k <= count; k++) {
      const t = k / (count + 1);
      push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, edgeStart, 180);
    }
  }
  if (out.length < 3 && n >= 3) {
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n]!;
      const curr = pts[i]!;
      const next = pts[(i + 1) % n]!;
      const ca = cornerArc(prev, curr, next);
      push(curr, ca.start, ca.arc);
      if (out.length >= 8) break;
    }
  }
  return out.slice(0, MAX_PER_PATCH);
}

export function layoutOnPolygon(
  pts: Pt[],
  family: Family = "mp",
  keep: Pt[] | null = null,
  cuts: Pt[][] = [],
  catalog:CatalogItem[]=CATALOG, availableBar?:number,
): Head[] {
  catalog=catalog.filter(c=>c.verificationStatus==='Verified'&&!c.strip&&c.coverageKind==='sector'&&c.type!=='body'&&c.type!=='bubbler');
  const group=family==='rotor'?'rotor':family==='spray'?'spray':'rotary';
  catalog=catalog.filter(c=>equipmentCategory(c)===group||group==='spray'&&equipmentCategory(c)==='fixed');
  if(!catalog.length)return [];
  if (pts.length < 3) return [];
  const bound = keep ?? pts;
  const { width } = patchMetrics(pts);
  const spacing =
    family === "mp800" ? Math.min(3.5, Math.max(2.4, width * 0.45)) :
    family === "spray" ? Math.min(4.2, Math.max(2.5, width * 0.45)) :
    Math.min(6.7, Math.max(4.0, width * 0.5));

  const stations = perimeterStations(pts, spacing);
  const heads: Head[] = stations.map((node, i) => {
    const prev = stations[(i - 1 + stations.length) % stations.length]!;
    const nxt = stations[(i + 1) % stations.length]!;
    const reach = Math.max(dist(node.p, prev.p), dist(node.p, nxt.p), spacing * 0.9);
    const sku = skuFor(family, reach, node.arc,catalog);
    return makeHead({
      catalogId: sku.id,
      x: node.p.x,
      y: node.p.y,
      arc: clampArc(sku, node.arc),
      start: node.start,
      r: clampRadius(sku, reach),
    });
  });

  heads.push(...interiorGrid(pts, heads, family, spacing, bound, cuts,catalog));
  return heads.slice(0, MAX_PER_PATCH).map(h=>fitHead(h,family,bound,cuts,catalog)).flatMap(h=>{
    const cap=maxThrow(h,h.start,h.arc,bound,cuts), fits:{head:Head;score:number}[]=[];
    for(const item of catalog){
      const pressure=availableBar??catalogHeadDefaults(item).designPressure;
      for(const nozzle of item.nozzles){
        const defaults=catalogHeadDefaults(item),bar=Math.min(pressure,defaults.designPressure);
        const row=performanceAt(item,nozzle.id,bar,h.arc)?.row;
        if(!row)continue;
        const radius=Math.min(h.r,cap,row.radiusM);
        const fit=selectAutomaticHead(radius,h.arc,pressure,[item]);
        // Batch layouts have no per-head reduced-flow warning/acceptance step.
        // Keep their hydraulic completeness while manual drawn sectors can be flagged.
        if(fit&&!fit.needsReview)fits.push({head:{...h,...fit,start:h.start},score:Math.abs(h.r-radius)});
      }
    }
    fits.sort((a,b)=>a.score-b.score);
    return fits[0]?[fits[0].head]:[];
  });
}

function interiorGrid(pts: Pt[], existing: Head[], family: Family, spacing: number, bound: Pt[], cuts: Pt[][],catalog:CatalogItem[]): Head[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (Math.min(maxX - minX, maxY - minY) < spacing * 1.7) return [];
  const out: Head[] = [];
  const rowH = spacing * 0.866;
  let row = 0;
  for (let y = minY + spacing * 0.7; y <= maxY - spacing * 0.55 && out.length < MAX_INTERIOR; y += rowH) {
    const ox = row % 2 === 1 ? spacing * 0.5 : 0;
    row += 1;
    for (let x = minX + spacing * 0.7 + ox; x <= maxX - spacing * 0.55 && out.length < MAX_INTERIOR; x += spacing) {
      const p = { x, y };
      if (!inIrrigationTarget(p, pts, cuts)) continue;
      if (existing.some((h) => dist(h, p) < spacing * 0.7)) continue;
      if (out.some((h) => dist(h, p) < spacing * 0.7)) continue;
      const sku = skuFor(family, spacing, 360,catalog);
      const full = pickSeriesForRadius(spacing, family,catalog).find((s) => s.arcMin === 360) ?? sku;
      out.push(
        makeHead({
          catalogId: full.id,
          x: p.x,
          y: p.y,
          arc: 360,
          start: 0,
          r: clampRadius(full, spacing),
        }),
      );
    }
  }
  return out;
}

function onBoundary(p: Pt, poly: Pt[], tol = 0.05): boolean {
  for (let i = 0; i < poly.length; i++) {
    if (dist(p, closestOnSegment(p, poly[i]!, poly[(i + 1) % poly.length]!)) <= tol) return true;
  }
  return false;
}

function strictlyInside(p: Pt, poly: Pt[]): boolean {
  return pointInPoly(p, poly) && !onBoundary(p, poly);
}

function allowed(p: Pt, d: CadDrawing): boolean {
  const site = siteLoop(d);
  if (site && !pointInPoly(p, site) && !onBoundary(p, site)) return false;
  for (const hole of exclusionLoops(d)) if (strictlyInside(p, hole)) return false;
  return true;
}

export function layoutOnDrawing(d: CadDrawing,catalog:CatalogItem[]=CATALOG,availableBar?:number): Head[] {
  const site = siteLoop(d);
  const cuts = exclusionLoops(d);
  const out: Head[] = [];
  for (const patch of irrigPatches(d)) {
    if (out.length >= MAX_TOTAL) break;
    const { width, avgEdge } = patchMetrics(patch.pts);
    const family = chooseLayoutFamily(patch.method, width, avgEdge);
    const keep = site ?? patch.pts;
    const holes = [...cuts, ...patch.holes];
    const heads = layoutOnPolygon(patch.pts, family, keep, holes,catalog,availableBar).filter((h) => {
      if (!allowed({ x: h.x, y: h.y }, d)) return false;
      if (patch.holes.some((hole) => strictlyInside(h, hole))) return false;
      return true;
    });
    out.push(...heads);
  }
  return out.slice(0, MAX_TOTAL);
}

function headingAlongInward(from: Pt, to: Pt, poly: Pt[]): number {
  const edge = headingDeg(from, to);
  const n1 = edge + 90;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const rad = (n1 * Math.PI) / 180;
  const test = { x: mx + Math.cos(rad) * 0.4, y: my + Math.sin(rad) * 0.4 };
  return pointInPoly(test, poly) ? n1 : n1 + 180;
}

export { clampHeadThrow } from "@/lib/hunter-rules";
