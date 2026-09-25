import { dist, headingDeg, pointInPoly, polygonArea, type Pt } from "@/lib/geometry";
import { itemById, stripAtPressure } from "@/lib/hunter-catalog";
import type { Geom, Head } from "@/lib/project-types";
import { polyPoints } from "@/lib/project-types";

export function headCovers(h: Head, p: Pt, toleranceM = 0): boolean {
  const item = itemById(h.catalogId);
  if (!item || item.coverageKind === "point" || ![h.x,h.y,h.r,h.arc,h.start,p.x,p.y].every(Number.isFinite) || h.r<=0 || h.arc<=0 || h.arc>360) return false;
  if (item?.strip) {
    const strip = stripAtPressure(item, h.designPressure);
    return !!strip && pointInStrip(h, p, strip);
  }
  if (dist(h, p) > h.r + toleranceM) return false;
  if (h.arc >= 360) return true;
  const ang = headingDeg(h, p);
  let d = ang - h.start;
  while (d < 0) d += 360;
  return d % 360 <= h.arc + 1e-9 || 360-d%360 <= 1e-9;
}

function pointInStrip(h: Head, p: Pt, s: { w: number; l: number; ox: number; oy: number }): boolean {
  const rad = (h.start * Math.PI) / 180;
  const dx = p.x - h.x;
  const dy = p.y - h.y;
  const lx = dx * Math.cos(-rad) - dy * Math.sin(-rad);
  const ly = dx * Math.sin(-rad) + dy * Math.cos(-rad);
  return lx >= s.ox && lx <= s.ox + s.l && ly >= s.oy && ly <= s.oy + s.w;
}

export type CoverageStats = {
  cover1: number;
  cover2: number;
  dry: number;
  oversprayM2: number;
  lawnM2: number;
  samples: number;
};

export function lawnPolygon(geoms: Geom[]): Pt[] | null {
  const lawns = geoms.filter((g) => (g.cadType ?? g.kind) === "lawn" && !g.hidden);
  const list = lawns.length ? lawns : geoms.filter((g) => g.kind === "lawn" && !g.hidden);
  if (!list.length) return null;
  list.sort((a, b) => polygonArea(polyPoints(b)) - polygonArea(polyPoints(a)));
  const pts = polyPoints(list[0]!);
  return pts.length >= 3 ? pts : null;
}

export function exclusionPolygons(geoms: Geom[]): Pt[][] {
  const kinds = new Set(["building", "pool", "path", "hardscape", "parking", "terrace", "no_irrigation"]);
  return geoms
    .filter((g) => !g.hidden && g.closed && kinds.has(g.cadType ?? g.kind))
    .map((g) => polyPoints(g))
    .filter((pts) => pts.length >= 3);
}

export function inIrrigationTarget(p: Pt, lawn: Pt[], holes: Pt[][]): boolean {
  if (!pointInPoly(p, lawn)) return false;
  for (const h of holes) if (pointInPoly(p, h)) return false;
  return true;
}

export function coverageStats(lawn: Pt[], heads: Head[], step = 0.45, holes: Pt[][] = []): CoverageStats {
  if (lawn.length < 3) {
    return { cover1: 0, cover2: 0, dry: 100, oversprayM2: 0, lawnM2: 0, samples: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of lawn) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  for (const h of heads) {
    minX = Math.min(minX, h.x - h.r);
    minY = Math.min(minY, h.y - h.r);
    maxX = Math.max(maxX, h.x + h.r);
    maxY = Math.max(maxY, h.y + h.r);
  }
  let lawnN = 0;
  let hit1 = 0;
  let hit2 = 0;
  let overN = 0;
  for (let y = minY + step / 2; y < maxY; y += step) {
    for (let x = minX + step / 2; x < maxX; x += step) {
      const p = { x, y };
      const inside = inIrrigationTarget(p, lawn, holes);
      let n = 0;
      for (const h of heads) if (headCovers(h, p)) n += 1;
      if (inside) {
        lawnN += 1;
        if (n >= 1) hit1 += 1;
        if (n >= 2) hit2 += 1;
      } else if (n >= 1) {
        overN += 1;
      }
    }
  }
  const cell = step * step;
  const holeArea = holes.reduce((s, h) => s + polygonArea(h), 0);
  return {
    cover1: lawnN === 0 ? 0 : (hit1 / lawnN) * 100,
    cover2: lawnN === 0 ? 0 : (hit2 / lawnN) * 100,
    dry: lawnN === 0 ? 100 : ((lawnN - hit1) / lawnN) * 100,
    oversprayM2: overN * cell,
    lawnM2: Math.max(0, polygonArea(lawn) - holeArea),
    samples: lawnN,
  };
}

export function coveragePercent(lawn: Pt[], heads: Head[], step = 0.55): number {
  return Math.round(coverageStats(lawn, heads, step).cover1);
}

export function sampleGrid(
  lawn: Pt[],
  heads: Head[],
  step: number,
  holes: Pt[][] = [],
): { x: number; y: number; n: number; inside: boolean }[] {
  const out: { x: number; y: number; n: number; inside: boolean }[] = [];
  if (lawn.length < 3) return out;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of lawn) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  for (let y = minY + step / 2; y < maxY; y += step) {
    for (let x = minX + step / 2; x < maxX; x += step) {
      const p = { x, y };
      if (!inIrrigationTarget(p, lawn, holes)) continue;
      let n = 0;
      for (const h of heads) if (headCovers(h, p)) n += 1;
      out.push({ x, y, n, inside: true });
    }
  }
  return out;
}
