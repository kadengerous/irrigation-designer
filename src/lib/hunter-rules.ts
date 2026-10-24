import { CATALOG, clampArc, clampRadius, defaultBodyFor, pickNozzleForRadius, pickSeriesForRadius, pickSkuForArc, type Family } from "@/lib/equipment-catalog";
import { rayPolyHit, type Pt } from "@/lib/geometry";
import type { Head } from "@/lib/project-types";

/**
 * Hunter official design rules used by auto-layout:
 * - MP Rotator: head-to-head spacing, matched precipitation within a series family
 * - Do not mix spray nozzles with MP Rotator in the same zone
 * - Do not mix MP800 (~20 mm/h) with MP Standard (~10 mm/h)
 * - MP Strip in a single row can match Standard MP; square layout matches MP800
 * - Rotors vs sprays vs MP: separate hydrozones
 * - Radius may be reduced up to ~25% (already in catalog rMin/rMax)
 * Sources: hunterirrigation.com MP Rotator installation + LIT-461 design guide
 */
export function chooseLayoutFamily(
  method: "spray" | "mp" | "rotor" | "drip" | "bubbler" | "none",
  widthM: number,
  avgEdgeM: number,
): Family {
  if (method === "spray") return "spray";
  if (method === "rotor") return "rotor";
  const span = Math.min(widthM, avgEdgeM);
  if (span <= 4.6) return "mp800";
  return "mp";
}

export function maxThrow(
  from: Pt,
  start: number,
  arc: number,
  keep: Pt[] | null,
  cuts: Pt[][],
): number {
  const sweep = Math.max(1, arc);
  const steps = Math.max(8, Math.round(sweep / 7));
  let cap = Infinity;
  for (let i = 0; i <= steps; i++) {
    const ang = start + (sweep * i) / steps;
    if (keep && keep.length >= 3) cap = Math.min(cap, rayPolyHit(from, ang, keep));
    for (const cut of cuts) {
      if (cut.length >= 3) cap = Math.min(cap, rayPolyHit(from, ang, cut));
    }
  }
  if (!Number.isFinite(cap)) return 9.1;
  return Math.max(0.4, cap - 0.05);
}

export function patchMetrics(pts: Pt[]): { width: number; avgEdge: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let peri = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    minX = Math.min(minX, a.x);
    minY = Math.min(minY, a.y);
    maxX = Math.max(maxX, a.x);
    maxY = Math.max(maxY, a.y);
    peri += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return { width: Math.min(maxX - minX, maxY - minY), avgEdge: peri / Math.max(1, pts.length) };
}

export function clampHeadThrow(h: Head, keep: Pt[] | null, cuts: Pt[][]): Head {
  const item = CATALOG.find((c) => c.id === h.catalogId);
  const family = ((item?.family === "body" ? "mp" : item?.family) ?? "mp") as Family;
  const cap = maxThrow(h, h.start, h.arc, keep, cuts);
  const series = pickSeriesForRadius(Math.min(h.r, cap), family);
  const sku = pickSkuForArc(series, h.arc);
  const r = clampRadius(sku, Math.min(h.r, cap));
  const nz = pickNozzleForRadius(sku, r);
  return {
    ...h,
    catalogId: sku.id,
    nozzleId: nz?.id ?? h.nozzleId,
    r,
    arc: clampArc(sku, h.arc),
    bodyId: defaultBodyFor(sku),
    designPressure: sku.recommendedPressureBar,
    needsReview: cap + 0.02 < sku.rMin,
  };
}
