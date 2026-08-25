import { activeNumberLocale, formatNumber } from "@/lib/i18n";

export type Pt = { x: number; y: number };
export type MeasureUnit = "m" | "cm" | "mm" | "in" | "ft" | "yd";
export type UnitSystem = "metric" | "imperial";

export const PX_PER_M_MIN = 3;
export const PX_PER_M_MAX = 220;

export function clampPxPerMeter(n: number) {
  if (!Number.isFinite(n)) return 36;
  return Math.min(PX_PER_M_MAX, Math.max(PX_PER_M_MIN, n));
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function headingDeg(from: Pt, to: Pt): number {
  const d = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  return (d + 360) % 360;
}

export function normDeg(d: number): number {
  return ((d % 360) + 360) % 360;
}

/** If `fromRot + dang` is within `windowDeg` of a multiple of `step`, return the delta to that multiple. */
export function snapDeltaToAngle(fromRot: number, dangDeg: number, step = 45, windowDeg = 10): number {
  const abs = normDeg(fromRot + dangDeg);
  const q = Math.round(abs / step) * step;
  let ad = Math.abs(abs - q);
  if (ad > 180) ad = 360 - ad;
  if (ad > windowDeg) return dangDeg;
  let delta = normDeg(q) - normDeg(fromRot);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

export function shoelace(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function polygonArea(pts: Pt[]): number {
  return Math.abs(shoelace(pts));
}

export function isClockwise(pts: Pt[]): boolean {
  return shoelace(pts) > 0;
}

export function centroid(pts: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  const n = pts.length || 1;
  return { x: x / n, y: y / n };
}

export function pointInPoly(p: Pt, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    const inter = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (inter) inside = !inside;
  }
  return inside;
}

/** Clockwise sweep from outgoing edge (to next) to incoming (to prev). Matches y-down canvas. */
export function cornerArc(prev: Pt, curr: Pt, next: Pt): { start: number; arc: number } {
  const start = headingDeg(curr, next);
  const end = headingDeg(curr, prev);
  let arc = end - start;
  if (arc <= 0) arc += 360;
  return { start, arc };
}

export function raySegmentT(o: Pt, dir: Pt, a: Pt, b: Pt): number | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const det = dir.x * dy - dir.y * dx;
  if (Math.abs(det) < 1e-12) return null;
  const t = ((a.x - o.x) * dy - (a.y - o.y) * dx) / det;
  const u = ((a.x - o.x) * dir.y - (a.y - o.y) * dir.x) / det;
  if (t > 1e-4 && u >= -1e-6 && u <= 1 + 1e-6) return t;
  return null;
}

/** First hit distance (m) along a unit ray. */
export function rayPolyHit(o: Pt, angDeg: number, poly: Pt[], minT = 0.06): number {
  const rad = (angDeg * Math.PI) / 180;
  const dir = { x: Math.cos(rad), y: Math.sin(rad) };
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const t = raySegmentT(o, dir, poly[i]!, poly[(i + 1) % poly.length]!);
    if (t != null && t >= minT && t < best) best = t;
  }
  return best;
}

export function closestOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1)));
  return { x: a.x + abx * t, y: a.y + aby * t };
}

export function snapPoint(p: Pt, verts: Pt[], threshold: number): Pt {
  let best = p;
  let bestD = threshold;
  for (const v of verts) {
    const d = dist(p, v);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

export function snapToGeometry(p: Pt, polygons: Pt[][], threshold: number): Pt {
  const verts = polygons.flat();
  const atVert = snapPoint(p, verts, threshold);
  if (atVert !== p) return atVert;
  let best = p;
  let bestD = threshold;
  for (const poly of polygons) {
    for (let i = 0; i < poly.length; i++) {
      const q = closestOnSegment(p, poly[i]!, poly[(i + 1) % poly.length]!);
      const d = dist(p, q);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
  }
  return best;
}

/** Start angle of a 180° edge head, aimed into the polygon. */
export function inwardStart(a: Pt, b: Pt, poly: Pt[]): number {
  const h = headingDeg(a, b);
  const n1 = h + 90;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const rad = (n1 * Math.PI) / 180;
  const test = { x: mx + Math.cos(rad) * 0.35, y: my + Math.sin(rad) * 0.35 };
  return pointInPoly(test, poly) ? n1 : n1 + 180;
}

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function boundsOf(pts: Pt[], pad = 0): Bounds | null {
  if (!pts.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/** Sector in local units, origin at the head. Clockwise from `start` (0 = east). */
export function sectorLocal(r: number, start: number, arc: number): number[] {
  if (arc >= 359) {
    const n = 48;
    const pts: number[] = [];
    for (let i = 0; i <= n; i++) {
      const a = (Math.PI * 2 * i) / n;
      pts.push(r * Math.cos(a), r * Math.sin(a));
    }
    return pts;
  }
  const n = Math.max(18, Math.ceil(arc / 4));
  const pts: number[] = [0, 0];
  for (let i = 0; i <= n; i++) {
    const a = ((start + (arc * i) / n) * Math.PI) / 180;
    pts.push(r * Math.cos(a), r * Math.sin(a));
  }
  return pts;
}

export function fmtM(n: number): string {
  return formatNumber(n, 2);
}

export function fmt1(n: number): string {
  return formatNumber(n, 1);
}

export function unitSystem(unit: MeasureUnit): UnitSystem {
  return unit === "in" || unit === "ft" || unit === "yd" ? "imperial" : "metric";
}

export function parseMeasureUnit(v: unknown): MeasureUnit {
  if (v === "cm" || v === "mm" || v === "in" || v === "ft" || v === "yd" || v === "m") return v;
  return "m";
}

const IN_M = 0.0254;
const FT_M = 0.3048;
const YD_M = 0.9144;

export function formatLen(meters: number, unit: MeasureUnit): string {
  const loc = activeNumberLocale();
  const n = (v: number, d: number) =>
    v.toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d });
  if (unit === "cm") return `${n(meters * 100, 1)} cm`;
  if (unit === "mm") return `${Math.round(meters * 1000).toLocaleString(loc)} mm`;
  if (unit === "in") return `${n(meters / IN_M, 2)} in`;
  if (unit === "ft") return `${n(meters / FT_M, 2)} ft`;
  if (unit === "yd") return `${n(meters / YD_M, 2)} yd`;
  return `${n(meters, 2)} m`;
}

export function toMeters(value: number, unit: MeasureUnit): number {
  if (unit === "cm") return value / 100;
  if (unit === "mm") return value / 1000;
  if (unit === "in") return value * IN_M;
  if (unit === "ft") return value * FT_M;
  if (unit === "yd") return value * YD_M;
  return value;
}

export function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function projectOnSegment(p: Pt, a: Pt, b: Pt): { pt: Pt; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1);
  const tc = Math.max(0, Math.min(1, t));
  return { pt: { x: a.x + abx * tc, y: a.y + aby * tc }, t: tc };
}

export type SnapKind = "end" | "mid" | "edge" | "grid" | "head" | "intersect" | "ortho" | "none";

export function snapGrid(p: Pt, step: number): Pt {
  if (step <= 0) return p;
  return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
}

export function visibleGridStep(step: number, _px: number, spanM = 40): number {
  const s = step > 0 ? step : 0.1;
  const span = Math.max(spanM, 1);
  const maxLines = 220;
  if (span / s <= maxLines) return s;
  return s * Math.ceil(span / s / maxLines);
}

export function angleSnapDeg(from: Pt, to: Pt, enable = true, toleranceDeg = 8): Pt {
  if (!enable) return to;
  const a = headingDeg(from, to);
  const snapped = Math.round(a / 45) * 45;
  let diff = Math.abs(a - snapped);
  if (diff > 180) diff = 360 - diff;
  if (diff > toleranceDeg) return to;
  const d = dist(from, to);
  const rad = (snapped * Math.PI) / 180;
  return { x: from.x + Math.cos(rad) * d, y: from.y + Math.sin(rad) * d };
}

export function segmentIntersection(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  if (t <= 0.002 || t >= 0.998 || u <= 0.002 || u >= 0.998) return null;
  return { x: a.x + t * rx, y: a.y + t * ry };
}

export function smartSnap(
  p: Pt,
  opts: {
    verts: Pt[];
    segments: [Pt, Pt][];
    heads: Pt[];
    threshold: number;
    grid: number | null;
    angleFrom?: Pt | null;
  },
): { pt: Pt; kind: SnapKind } {
  let best = p;
  let bestD = opts.threshold;
  let kind: SnapKind = "none";
  const consider = (q: Pt, k: SnapKind) => {
    const d = dist(p, q);
    if (d < bestD) {
      bestD = d;
      best = q;
      kind = k;
    }
  };
  for (const v of opts.verts) consider(v, "end");
  for (const h of opts.heads) consider(h, "head");
  for (const [a, b] of opts.segments) {
    consider(mid(a, b), "mid");
    consider(projectOnSegment(p, a, b).pt, "edge");
  }
  const segs = opts.segments;
  const maxI = Math.min(segs.length, 64);
  for (let i = 0; i < maxI; i++) {
    for (let j = i + 1; j < maxI; j++) {
      const hit = segmentIntersection(segs[i]![0], segs[i]![1], segs[j]![0], segs[j]![1]);
      if (hit) consider(hit, "intersect");
    }
  }
  if (opts.grid && opts.grid > 0) {
    consider(snapGrid(p, opts.grid), "grid");
  }
  if (opts.angleFrom) {
    const ortho = angleSnapDeg(opts.angleFrom, kind === "none" ? p : best, true);
    if (dist(ortho, p) < bestD || kind === "none") {
      const same = dist(ortho, p) < 1e-9;
      if (!same && dist(ortho, p) <= opts.threshold * 1.8) {
        best = ortho;
        kind = kind === "none" ? "ortho" : kind;
      } else if (kind === "none" && dist(ortho, p) > 1e-9) {
        best = ortho;
        kind = "ortho";
      }
    }
  }
  return { pt: best, kind };
}

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function snapInProject(
  p: Pt,
  project: {
    polygons: { points: Pt[]; closed: boolean; hidden?: boolean }[];
    heads: { id: string; x: number; y: number }[];
  },
  opts: {
    snapOn: boolean;
    snapGridOn: boolean;
    gridStep: number;
    pxPerMeter: number;
    angleFrom?: Pt | null;
    excludeHead?: string;
  },
): { pt: Pt; kind: SnapKind } {
  if (!opts.snapOn && !opts.snapGridOn) return { pt: p, kind: "none" };
  const verts: Pt[] = [];
  const segments: [Pt, Pt][] = [];
  if (opts.snapOn) {
    for (const g of project.polygons) {
      if (g.hidden) continue;
      const pts = g.points;
      verts.push(...pts);
      const n = pts.length;
      const last = g.closed ? n : Math.max(0, n - 1);
      for (let i = 0; i < last; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        if (a && b) segments.push([a, b]);
      }
    }
  }
  const heads = opts.snapOn
    ? project.heads.filter((h) => h.id !== opts.excludeHead).map((h) => ({ x: h.x, y: h.y }))
    : [];
  const threshold = Math.max(0.08, 16 / Math.max(8, opts.pxPerMeter));
  return smartSnap(p, {
    verts,
    segments,
    heads,
    threshold,
    grid: opts.snapOn ? opts.gridStep : null,
    angleFrom: opts.snapOn ? (opts.angleFrom ?? null) : null,
  });
}

