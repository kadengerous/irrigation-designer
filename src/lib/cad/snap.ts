import { dist, headingDeg, mid, type Pt } from "@/lib/geometry";
import type { CadDrawing, SnapHit, SnapKind } from "@/lib/cad/types";
import { vertPt } from "@/lib/cad/engine";

const PRIORITY: SnapKind[] = ["close", "end", "intersect", "center", "mid", "tangent", "edge", "head", "grid", "perp", "parallel", "horiz", "vert", "extend", "none"];

function better(a: SnapKind, b: SnapKind) {
  return PRIORITY.indexOf(a) < PRIORITY.indexOf(b);
}

export function cadSnap(
  p: Pt,
  d: CadDrawing,
  opts: {
    pxPerMeter: number;
    pointerType?: string;
    snapOn: boolean;
    snapGridOn: boolean;
    orthoOn?: boolean;
    lock?: SnapKind | null;
    gridStep: number;
    angleFrom?: Pt | null;
    closeTo?: Pt | null;
    heads?: Pt[];
  },
): SnapHit {
  const pxTol =
    opts.pointerType === "touch" ? 22 : opts.pointerType === "pen" ? 14 : 12;
  const tol = pxTol / Math.max(opts.pxPerMeter, 1e-6);
  const gridPxTol =
    opts.pointerType === "touch" ? 34 : opts.pointerType === "pen" ? 24 : 18;
  const gridTol = Math.min(
    gridPxTol / Math.max(opts.pxPerMeter, 1e-6),
    opts.gridStep * 0.45,
  );
  let best: SnapHit = { pt: p, kind: "none" };
  let bestD = tol;
  const cell = Math.max(tol * 2.5, 0.25);

  const consider = (q: Pt, kind: SnapKind, extra?: Partial<SnapHit>, maxDistance = tol) => {
    const dd = dist(p, q);
    if (dd > maxDistance * 1.15) return;
    const firstHit = best.kind === "none" && dd <= maxDistance;
    const higherPriority = best.kind !== "none" && better(kind, best.kind);
    const samePriorityAndCloser = kind === best.kind && dd < bestD;
    if (!firstHit && !higherPriority && !samePriorityAndCloser) return;
    bestD = dd;
    best = { pt: q, kind, ...extra };
  };

  if (opts.closeTo && dist(p, opts.closeTo) < Math.max(tol, 28 / opts.pxPerMeter)) {
    consider(opts.closeTo, "close");
  }

  if (opts.snapOn) {
    for (const v of nearbyVerts(d, p, cell)) consider(vertPt(v), "end", { vertexId: v.id });
    for (const f of Object.values(d.faces)) {
      if (f.circle) {
        consider({ x: f.circle.cx, y: f.circle.cy }, "center", { faceId: f.id });
        const r = f.circle.r;
        const vx = p.x - f.circle.cx;
        const vy = p.y - f.circle.cy;
        const vl = Math.hypot(vx, vy) || 1;
        consider({ x: f.circle.cx + (vx / vl) * r, y: f.circle.cy + (vy / vl) * r }, "tangent", { faceId: f.id });
        consider({ x: f.circle.cx + r, y: f.circle.cy }, "end", { faceId: f.id });
        consider({ x: f.circle.cx - r, y: f.circle.cy }, "end", { faceId: f.id });
        consider({ x: f.circle.cx, y: f.circle.cy + r }, "end", { faceId: f.id });
        consider({ x: f.circle.cx, y: f.circle.cy - r }, "end", { faceId: f.id });
      }
      if (f.rect) consider({ x: f.rect.x + f.rect.w / 2, y: f.rect.y + f.rect.h / 2 }, "center", { faceId: f.id });
    }
    const nearby = nearbyEdges(d, p, cell);
    for (const ed of nearby) {
      const a = d.vertices[ed.a];
      const b = d.vertices[ed.b];
      if (!a || !b) continue;
      consider(mid(a, b), "mid", { edgeId: ed.id });
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1);
      const tc = Math.max(0, Math.min(1, t));
      consider({ x: a.x + abx * tc, y: a.y + aby * tc }, t > 0.02 && t < 0.98 ? "edge" : "end", { edgeId: ed.id });
    }
    const max = Math.min(nearby.length, 40);
    for (let i = 0; i < max; i++) {
      const e1 = nearby[i]!;
      const a = d.vertices[e1.a];
      const b = d.vertices[e1.b];
      if (!a || !b) continue;
      for (let j = i + 1; j < max; j++) {
        const e2 = nearby[j]!;
        const c = d.vertices[e2.a];
        const q = d.vertices[e2.b];
        if (!c || !q) continue;
        const hit = intersect(a, b, c, q);
        if (hit) consider(hit, "intersect");
      }
    }
    for (const h of opts.heads ?? []) consider(h, "head");
  }

  if (opts.angleFrom) {
    const from = opts.angleFrom;
    const ang = headingDeg(from, best.kind === "none" ? p : best.pt);
    const horiz = Math.min(Math.abs(ang), Math.abs(ang - 180), Math.abs(ang - 360));
    const vert = Math.min(Math.abs(ang - 90), Math.abs(ang - 270));
    const dlen = dist(from, p);
    const ortho = Boolean(opts.orthoOn);
    const hTol = ortho ? 90 : 8;
    if (horiz <= hTol && (!ortho || horiz <= vert)) consider({ x: from.x + Math.cos((ang < 90 || ang > 270 ? 0 : Math.PI)) * dlen, y: from.y }, "horiz");
    if (vert <= hTol && (!ortho || vert < horiz)) consider({ x: from.x, y: from.y + Math.sin((ang > 0 && ang < 180 ? Math.PI / 2 : -Math.PI / 2)) * dlen }, "vert");
    const snapped = Math.round(ang / (ortho ? 90 : 15)) * (ortho ? 90 : 15);
    let diff = Math.abs(ang - snapped);
    if (diff > 180) diff = 360 - diff;
    if (diff <= (ortho ? 90 : 8)) {
      const rad = (snapped * Math.PI) / 180;
      const kind: SnapKind = snapped % 180 === 0 ? "horiz" : snapped % 90 === 0 ? "vert" : "none";
      consider({ x: from.x + Math.cos(rad) * dlen, y: from.y + Math.sin(rad) * dlen }, kind === "none" ? "parallel" : kind);
    }

    if (opts.snapOn) {
      for (const ed of Object.values(d.edges)) {
        const a = d.vertices[ed.a];
        const b = d.vertices[ed.b];
        if (!a || !b) continue;
        const eang = headingDeg(a, b);
        const pang = headingDeg(from, p);
        let pd = Math.abs(pang - eang);
        if (pd > 180) pd = 360 - pd;
        if (pd <= 8 || Math.abs(pd - 180) <= 8) {
          const rad = (eang * Math.PI) / 180;
          consider({ x: from.x + Math.cos(rad) * dlen, y: from.y + Math.sin(rad) * dlen }, "parallel", { edgeId: ed.id });
        }
        const perp = (eang + 90) % 360;
        let qd = Math.abs(pang - perp);
        if (qd > 180) qd = 360 - qd;
        if (qd <= 8) {
          const rad = (perp * Math.PI) / 180;
          consider({ x: from.x + Math.cos(rad) * dlen, y: from.y + Math.sin(rad) * dlen }, "perp", { edgeId: ed.id });
        }
        const ext = projectOnRay(p, a, b);
        if (ext) consider(ext, "extend", { edgeId: ed.id });
      }
    }
  }

  if (opts.snapGridOn && opts.gridStep > 0) {
    const g = opts.gridStep;
    const gridX = Math.round(p.x / g) * g;
    const gridY = Math.round(p.y / g) * g;
    const nearX = Math.abs(p.x - gridX) <= gridTol;
    const nearY = Math.abs(p.y - gridY) <= gridTol;
    if (nearX || nearY) {
      const q = { x: nearX ? gridX : p.x, y: nearY ? gridY : p.y };
      const maxDistance = nearX && nearY ? gridTol * Math.SQRT2 : gridTol;
      consider(q, "grid", undefined, maxDistance);
    }
  }

  if (opts.lock && opts.angleFrom && (opts.lock === "horiz" || opts.lock === "vert" || opts.lock === "parallel" || opts.lock === "perp")) {
    const from = opts.angleFrom;
    const dlen = dist(from, p) || 1e-6;
    if (opts.lock === "horiz") best = { pt: { x: p.x, y: from.y }, kind: "horiz" };
    else if (opts.lock === "vert") best = { pt: { x: from.x, y: p.y }, kind: "vert" };
    else if (opts.lock === "perp") best = { pt: { x: from.x, y: p.y }, kind: "perp" };
    else {
      const ang = headingDeg(from, p);
      const rad = (Math.round(ang / 15) * 15 * Math.PI) / 180;
      best = { pt: { x: from.x + Math.cos(rad) * dlen, y: from.y + Math.sin(rad) * dlen }, kind: "parallel" };
    }
    return best;
  }

  if (!opts.snapOn && !opts.snapGridOn && best.kind !== "close") return { pt: p, kind: "none" };
  return best;
}

function cellKey(x: number, y: number, cell: number) {
  return `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
}

function nearbyVerts(d: CadDrawing, p: Pt, cell: number) {
  const ix = Math.floor(p.x / cell);
  const iy = Math.floor(p.y / cell);
  const out: CadDrawing["vertices"][string][] = [];
  for (const v of Object.values(d.vertices)) {
    const vx = Math.floor(v.x / cell);
    const vy = Math.floor(v.y / cell);
    if (Math.abs(vx - ix) <= 1 && Math.abs(vy - iy) <= 1) out.push(v);
  }
  return out;
}

function nearbyEdges(d: CadDrawing, p: Pt, cell: number) {
  const ix = Math.floor(p.x / cell);
  const iy = Math.floor(p.y / cell);
  const out: CadDrawing["edges"][string][] = [];
  for (const ed of Object.values(d.edges)) {
    const a = d.vertices[ed.a];
    const b = d.vertices[ed.b];
    if (!a || !b) continue;
    const minx = Math.floor(Math.min(a.x, b.x) / cell) - 1;
    const maxx = Math.floor(Math.max(a.x, b.x) / cell) + 1;
    const miny = Math.floor(Math.min(a.y, b.y) / cell) - 1;
    const maxy = Math.floor(Math.max(a.y, b.y) / cell) + 1;
    if (ix >= minx && ix <= maxx && iy >= miny && iy <= maxy) out.push(ed);
  }
  return out;
}

function intersect(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
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

function projectOnRay(p: Pt, a: Pt, b: Pt): Pt | null {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len = Math.hypot(abx, aby);
  if (len < 1e-9) return null;
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / (len * len);
  if (t < -0.02 || (t > 0.02 && t < 0.98) || t > 1.02) {
    if (t < -0.02 || t > 1.02) return { x: a.x + t * abx, y: a.y + t * aby };
  }
  return t < -0.02 || t > 1.02 ? { x: a.x + t * abx, y: a.y + t * aby } : null;
}

export const SNAP_LABEL: Record<SnapKind, string> = {
  end: "snapEnd",
  mid: "snapMid",
  intersect: "snapIntersect",
  center: "snapCenter",
  edge: "snapEdge",
  grid: "snapGrid",
  head: "snapHead",
  horiz: "snapHoriz",
  vert: "snapVert",
  parallel: "snapParallel",
  perp: "snapPerp",
  extend: "snapExtend",
  tangent: "snapTangent",
  close: "snapClose",
  none: "",
};
