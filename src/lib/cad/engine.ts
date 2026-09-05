import { closedPathSideStarts, closestOnSegment, dist, pointInPoly, polygonArea, shoelace, type Pt } from "@/lib/geometry";
import { applyConstraints, autoSegmentConstraints } from "@/lib/cad/constraints";
import { defaultLayerState, emptyDrawing, layerForType, type CadDim, type CadDrawing, type CadEdge, type CadFace, type CadLayerId, type CadVertex, type RegionType } from "@/lib/cad/types";
import type { Geom, Head, PolyKind } from "@/lib/project-types";

const EPS = 1e-9;
const ON_EDGE = 1e-7;

function nid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function cloneDrawing(d: CadDrawing): CadDrawing {
  return JSON.parse(JSON.stringify(d)) as CadDrawing;
}

function v(d: CadDrawing, id: string): CadVertex {
  return d.vertices[id]!;
}

function e(d: CadDrawing, id: string): CadEdge {
  return d.edges[id]!;
}

export function vertPt(vert: CadVertex): Pt {
  return { x: vert.x, y: vert.y };
}

export function faceBoundaryKey(face: Pick<CadFace, "id" | "outer">): string {
  // Exact primitives and open drawn paths have no topological edge loop. Their
  // ids must still remain distinct; treating every empty loop as the same face
  // caused unrelated circles/curves to be replaced or deleted together.
  if (!face.outer.length) return `standalone:${face.id}`;
  return face.outer
    .map((half) => `${half.e}:${half.dir}`)
    .sort()
    .join("|");
}

export function findVertexAt(d: CadDrawing, p: Pt, tol = 1e-6): string | null {
  let best: string | null = null;
  let bestD = tol;
  for (const id of Object.keys(d.vertices)) {
    const q = d.vertices[id]!;
    const dd = dist(p, q);
    if (dd < bestD) {
      bestD = dd;
      best = id;
    }
  }
  return best;
}

export function ensureVertex(d: CadDrawing, p: Pt, tol = 1e-6): string {
  const hit = findVertexAt(d, p, tol);
  if (hit) {
    d.vertices[hit] = { ...d.vertices[hit]!, x: p.x, y: p.y };
    return hit;
  }
  const id = nid("v");
  d.vertices[id] = { id, x: p.x, y: p.y };
  return id;
}

function projectT(p: Pt, a: Pt, b: Pt) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const den = abx * abx + aby * aby;
  if (den < EPS) return { t: 0, pt: { x: a.x, y: a.y }, d: dist(p, a) };
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / den;
  const tc = Math.max(0, Math.min(1, t));
  const pt = { x: a.x + abx * tc, y: a.y + aby * tc };
  return { t, tc, pt, d: dist(p, pt) };
}

function segIntersect(a: Pt, b: Pt, c: Pt, d: Pt): { t: number; u: number; pt: Pt } | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-14) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  if (t < 1e-6 || t > 1 - 1e-6 || u < 1e-6 || u > 1 - 1e-6) return null;
  return { t, u, pt: { x: a.x + t * rx, y: a.y + t * ry } };
}

/** Split edge at point if it lies in the interior. Returns vertex id. */
export function splitEdgeAt(d: CadDrawing, edgeId: string, p: Pt): string {
  const ed = d.edges[edgeId];
  if (!ed) return ensureVertex(d, p);
  const A = v(d, ed.a);
  const B = v(d, ed.b);
  const pr = projectT(p, A, B);
  if (pr.t < 1e-6) return ed.a;
  if (pr.t > 1 - 1e-6) return ed.b;
  const vid = ensureVertex(d, pr.pt, 1e-7);
  if (vid === ed.a || vid === ed.b) return vid;
  const bulge = ed.bulge;
  const e1: CadEdge = { id: nid("e"), a: ed.a, b: vid, bulge, faceL: ed.faceL, faceR: ed.faceR };
  const e2: CadEdge = { id: nid("e"), a: vid, b: ed.b, bulge, faceL: ed.faceL, faceR: ed.faceR };
  d.edges[e1.id] = e1;
  d.edges[e2.id] = e2;
  replaceEdgeInFaces(d, edgeId, e1.id, e2.id);
  delete d.edges[edgeId];
  return vid;
}

function replaceEdgeInFaces(d: CadDrawing, oldId: string, aId: string, bId: string) {
  for (const f of Object.values(d.faces)) {
    f.outer = spliceLoop(f.outer, oldId, aId, bId);
    f.holes = f.holes.map((h) => spliceLoop(h, oldId, aId, bId));
  }
}

function spliceLoop(loop: { e: string; dir: 1 | -1 }[], oldId: string, aId: string, bId: string) {
  const i = loop.findIndex((x) => x.e === oldId);
  if (i < 0) return loop;
  const dir = loop[i]!.dir;
  const pair = dir === 1 ? [{ e: aId, dir: 1 as const }, { e: bId, dir: 1 as const }] : [{ e: bId, dir: -1 as const }, { e: aId, dir: -1 as const }];
  return [...loop.slice(0, i), ...pair, ...loop.slice(i + 1)];
}

function splitEdgesThroughPoint(d: CadDrawing, p: Pt) {
  for (const id of Object.keys(d.edges)) {
    const ed = d.edges[id];
    if (!ed) continue;
    const A = v(d, ed.a);
    const B = v(d, ed.b);
    const pr = projectT(p, A, B);
    if (pr.d < ON_EDGE && pr.t > 1e-6 && pr.t < 1 - 1e-6) splitEdgeAt(d, id, pr.pt);
  }
}

function addRawEdge(d: CadDrawing, a: string, b: string, bulge = 0): string | null {
  if (a === b) return null;
  for (const ed of Object.values(d.edges)) {
    if ((ed.a === a && ed.b === b) || (ed.a === b && ed.b === a)) return ed.id;
  }
  const id = nid("e");
  d.edges[id] = { id, a, b, bulge, faceL: null, faceR: null };
  return id;
}

/** Insert polyline, splitting existing edges and intersections. */
export function addChain(
  d0: CadDrawing,
  pts: Pt[],
  close: boolean,
  type: RegionType,
  autoConstraints = true,
): CadDrawing {
  const d = cloneDrawing(d0);
  if (pts.length < 2) return d;
  const cleaned: Pt[] = [];
  for (const p of pts) {
    const last = cleaned[cleaned.length - 1];
    if (!last || dist(last, p) > 1e-9) cleaned.push({ x: p.x, y: p.y });
  }
  if (close && cleaned.length >= 3) {
    const a = cleaned[0]!;
    const z = cleaned[cleaned.length - 1]!;
    if (dist(a, z) > 1e-9) cleaned.push({ x: a.x, y: a.y });
    else cleaned[cleaned.length - 1] = { x: a.x, y: a.y };
  }
  for (const p of cleaned) splitEdgesThroughPoint(d, p);

  const vids = cleaned.map((p) => ensureVertex(d, p));
  for (let i = 0; i < vids.length - 1; i++) {
    insertSegment(d, vids[i]!, vids[i + 1]!);
  }
  rebuildFaces(d, type);
  if (!autoConstraints) return d;
  let out = d;
  for (let i = 0; i < vids.length - 1; i++) out = autoSegmentConstraints(out, vids[i]!, vids[i + 1]!);
  return out;
}

function insertSegment(d: CadDrawing, aId: string, bId: string) {
  if (aId === bId) return;
  const A = vertPt(v(d, aId));
  const B = vertPt(v(d, bId));
  const hits: { t: number; p: Pt }[] = [{ t: 0, p: A }, { t: 1, p: B }];
  for (const ed of Object.values(d.edges)) {
    const C = vertPt(v(d, ed.a));
    const D = vertPt(v(d, ed.b));
    const hit = segIntersect(A, B, C, D);
    if (hit) hits.push({ t: hit.t, p: hit.pt });
  }
  hits.sort((x, y) => x.t - y.t);
  const uniq: { t: number; p: Pt }[] = [];
  for (const h of hits) {
    const last = uniq[uniq.length - 1];
    if (!last || dist(last.p, h.p) > 1e-8) uniq.push(h);
  }
  const chainIds: string[] = [];
  for (const h of uniq) {
    splitEdgesThroughPoint(d, h.p);
    chainIds.push(ensureVertex(d, h.p));
  }
  for (let i = 0; i < chainIds.length - 1; i++) addRawEdge(d, chainIds[i]!, chainIds[i + 1]!);
}

export function addRect(d: CadDrawing, a: Pt, c: Pt, type: RegionType): CadDrawing {
  const x0 = Math.min(a.x, c.x);
  const y0 = Math.min(a.y, c.y);
  const x1 = Math.max(a.x, c.x);
  const y1 = Math.max(a.y, c.y);
  if (Math.abs(x1 - x0) < EPS || Math.abs(y1 - y0) < EPS) return d;
  const pts: Pt[] = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  return addIsolatedLoop(d, pts, type, { rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0, rot: 0 } });
}

export function addTriangle(d: CadDrawing, pts: Pt[], type: RegionType): CadDrawing {
  if (pts.length < 3) return d;
  const tri = pts.slice(0, 3);
  if (!triangleMetrics(tri)) return d;
  return addIsolatedLoop(d, tri, type);
}

/** A symmetric six-sided polygon fitted into the same two-corner box used by triangles. */
export function hexagonFromBounds(a: Pt, c: Pt): Pt[] {
  const x0 = Math.min(a.x, c.x);
  const y0 = Math.min(a.y, c.y);
  const x1 = Math.max(a.x, c.x);
  const y1 = Math.max(a.y, c.y);
  const w = x1 - x0;
  const cy = (y0 + y1) / 2;
  return [
    { x: x0 + w / 4, y: y0 },
    { x: x0 + (w * 3) / 4, y: y0 },
    { x: x1, y: cy },
    { x: x0 + (w * 3) / 4, y: y1 },
    { x: x0 + w / 4, y: y1 },
    { x: x0, y: cy },
  ];
}

export function addHexagon(d: CadDrawing, pts: Pt[], type: RegionType): CadDrawing {
  if (pts.length < 6) return d;
  const hex = pts.slice(0, 6);
  const xs = hex.map((p) => p.x);
  const ys = hex.map((p) => p.y);
  if (Math.max(...xs) - Math.min(...xs) < EPS || Math.max(...ys) - Math.min(...ys) < EPS) return d;
  return addIsolatedLoop(d, hex, type);
}

/** An upright isosceles triangle fitted into the same two-corner box used by rectangles. */
export function triangleFromBounds(a: Pt, c: Pt): Pt[] {
  const x0 = Math.min(a.x, c.x);
  const y0 = Math.min(a.y, c.y);
  const x1 = Math.max(a.x, c.x);
  const y1 = Math.max(a.y, c.y);
  return [
    { x: (x0 + x1) / 2, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

export function triangleMetrics(pts: Pt[]): {
  apex: Pt;
  baseA: Pt;
  baseB: Pt;
  baseMid: Pt;
  foot: Pt;
  center: Pt;
  ux: number;
  uy: number;
  nx: number;
  ny: number;
  width: number;
  height: number;
  leftSide: number;
  rightSide: number;
  area: number;
  rotation: number;
} | null {
  if (pts.length < 3) return null;
  const apex = pts[0]!;
  const baseB = pts[1]!;
  const baseA = pts[2]!;
  const width = dist(baseA, baseB);
  if (width < EPS) return null;
  const ux = (baseB.x - baseA.x) / width;
  const uy = (baseB.y - baseA.y) / width;
  let nx = -uy;
  let ny = ux;
  const baseMid = { x: (baseA.x + baseB.x) / 2, y: (baseA.y + baseB.y) / 2 };
  const signedHeight = (apex.x - baseMid.x) * nx + (apex.y - baseMid.y) * ny;
  if (signedHeight < 0) {
    nx = -nx;
    ny = -ny;
  }
  const height = Math.abs(signedHeight);
  if (height < EPS) return null;
  const along = (apex.x - baseMid.x) * ux + (apex.y - baseMid.y) * uy;
  const foot = { x: baseMid.x + ux * along, y: baseMid.y + uy * along };
  const center = {
    x: (apex.x + baseA.x + baseB.x) / 3,
    y: (apex.y + baseA.y + baseB.y) / 3,
  };
  return {
    apex,
    baseA,
    baseB,
    baseMid,
    foot,
    center,
    ux,
    uy,
    nx,
    ny,
    width,
    height,
    leftSide: dist(apex, baseA),
    rightSide: dist(apex, baseB),
    area: (width * height) / 2,
    rotation: (Math.atan2(baseB.y - baseA.y, baseB.x - baseA.x) * 180) / Math.PI,
  };
}

/** Identify an ordinary three-edge face as a triangle, excluding numbered-point contours. */
export function isTriangleFace(d: CadDrawing, faceId: string): boolean {
  const face = d.faces[faceId];
  if (!face || face.circle || face.ellipse || face.spline || face.freehand || face.pointShape || face.nodeEdit) return false;
  return faceVertices(d, faceId).length === 3;
}

/** Curves and pencil contours never expose their sampled CAD segments as sides. */
export function isDrawnCurveFace(d: CadDrawing, faceId: string): boolean {
  const face = d.faces[faceId];
  if (!face) return false;
  if (face.spline || face.freehand) return true;
  // Compatibility with contours saved by older builds, where a smooth stroke
  // was expanded into dozens of tiny straight sides without source metadata.
  return Boolean(
    !face.circle &&
      !face.ellipse &&
      !face.rect &&
      !face.pointShape &&
      !face.nodeEdit &&
      face.outer.length >= 16,
  );
}

export function addRotatedRect(d: CadDrawing, a: Pt, b: Pt, width: number, type: RegionType): CadDrawing {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS || Math.abs(width) < EPS) return d;
  const nx = -dy / len;
  const ny = dx / len;
  const w = width;
  const pts: Pt[] = [a, b, { x: b.x + nx * w, y: b.y + ny * w }, { x: a.x + nx * w, y: a.y + ny * w }];
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const rot = (Math.atan2(dy, dx) * 180) / Math.PI;
  return addIsolatedLoop(d, pts, type, { rect: { x: cx - len / 2, y: cy - Math.abs(w) / 2, w: len, h: Math.abs(w), rot } });
}

export function addCircle(d0: CadDrawing, c: Pt, r: number, type: RegionType): CadDrawing {
  if (r <= EPS) return d0;
  const d = cloneDrawing(d0);
  const fid = nid("f");
  d.faces[fid] = {
    id: fid,
    type,
    outer: [],
    holes: [],
    locked: false,
    hidden: false,
    circle: { cx: c.x, cy: c.y, r },
  };
  return d;
}

function addIsolatedLoop(d0: CadDrawing, pts: Pt[], type: RegionType, meta: Partial<CadFace> = {}): CadDrawing {
  const d = cloneDrawing(d0);
  const ring: Pt[] = [];
  for (const p of pts) {
    const last = ring[ring.length - 1];
    if (!last || dist(last, p) > EPS) ring.push({ x: p.x, y: p.y });
  }
  if (ring.length >= 3 && dist(ring[0]!, ring[ring.length - 1]!) < EPS) ring.pop();
  if (ring.length < 3) return d;
  const vids = ring.map((p) => {
    const id = nid("v");
    d.vertices[id] = { id, x: p.x, y: p.y };
    return id;
  });
  const halves: Half[] = [];
  for (let i = 0; i < vids.length; i++) {
    const a = vids[i]!;
    const b = vids[(i + 1) % vids.length]!;
    const eid = nid("e");
    d.edges[eid] = { id: eid, a, b, bulge: 0, faceL: null, faceR: null };
    halves.push({ e: eid, dir: 1 });
  }
  const outer = shoelace(ring) < 0 ? halves.map((h) => ({ e: h.e, dir: -1 as const })).reverse() : halves;
  const fid = nid("f");
  d.faces[fid] = {
    id: fid,
    type,
    outer,
    holes: [],
    locked: false,
    hidden: false,
    ...meta,
  };
  assignLoopFaces(d, outer, fid);
  return d;
}

export function addArc3(d: CadDrawing, a: Pt, b: Pt, bulgePt: Pt, type: RegionType, close = false): CadDrawing {
  const bulge = bulgeFromPoints(a, b, bulgePt);
  const chain = close ? addChain(d, [a, b], false, type) : addChain(d, [a, b], false, type);
  const ea = findVertexAt(chain, a);
  const eb = findVertexAt(chain, b);
  if (!ea || !eb) return chain;
  for (const ed of Object.values(chain.edges)) {
    if ((ed.a === ea && ed.b === eb) || (ed.a === eb && ed.b === ea)) {
      ed.bulge = ed.a === ea ? bulge : -bulge;
    }
  }
  rebuildFaces(chain, type);
  return chain;
}

export function bulgeFromPoints(a: Pt, b: Pt, p: Pt): number {
  const chord = dist(a, b);
  if (chord < EPS) return 0;
  const circ = circleFrom3(a, b, p);
  if (!circ) {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const sagitta = dist(mid, p);
    const sign = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    return ((sign >= 0 ? 1 : -1) * sagitta * 2) / chord;
  }
  const angA = Math.atan2(a.y - circ.y, a.x - circ.x);
  const angB = Math.atan2(b.y - circ.y, b.x - circ.x);
  const angP = Math.atan2(p.y - circ.y, p.x - circ.x);
  let sweep = angB - angA;
  while (sweep <= -Math.PI) sweep += Math.PI * 2;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  const s1 = ((angP - angA + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const s2 = ((angB - angA + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (s1 * s2 < 0) sweep = sweep > 0 ? sweep - Math.PI * 2 : sweep + Math.PI * 2;
  return Math.tan(sweep / 4);
}

function circleFrom3(a: Pt, b: Pt, c: Pt): { x: number; y: number; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { x, y, r: Math.hypot(a.x - x, a.y - y) };
}

export function setEdgeBulge(d0: CadDrawing, edgeId: string, bulge: number): CadDrawing {
  const d = cloneDrawing(d0);
  const ed = d.edges[edgeId];
  if (ed) ed.bulge = bulge;
  return d;
}

export function bulgeForRadius(a: Pt, b: Pt, radius: number, sign = 1): number {
  const chord = dist(a, b);
  if (chord < EPS || radius <= chord / 2) return sign * 1;
  const sweep = 2 * Math.asin(Math.min(1, chord / (2 * radius)));
  return sign * Math.tan(sweep / 4);
}

export function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length <= 2) return pts.slice();
  let maxD = 0;
  let idx = 0;
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = projectT(pts[i]!, a, b).d;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) {
    const left = rdp(pts.slice(0, idx + 1), eps);
    const right = rdp(pts.slice(idx), eps);
    return [...left.slice(0, -1), ...right];
  }
  return [a, b];
}

/* ---------- faces ---------- */

type Half = { e: string; dir: 1 | -1 };

function halfKey(h: Half) {
  return `${h.e}:${h.dir}`;
}

function startOf(d: CadDrawing, h: Half) {
  const ed = e(d, h.e);
  return h.dir === 1 ? ed.a : ed.b;
}

function endOf(d: CadDrawing, h: Half) {
  const ed = e(d, h.e);
  return h.dir === 1 ? ed.b : ed.a;
}

function outgoing(d: CadDrawing, vid: string): Half[] {
  const out: Half[] = [];
  for (const ed of Object.values(d.edges)) {
    if (ed.a === vid) out.push({ e: ed.id, dir: 1 });
    if (ed.b === vid) out.push({ e: ed.id, dir: -1 });
  }
  return out;
}

function angOf(d: CadDrawing, h: Half) {
  const s = v(d, startOf(d, h));
  const t = v(d, endOf(d, h));
  return Math.atan2(t.y - s.y, t.x - s.x);
}

function nextHalf(d: CadDrawing, incoming: Half): Half | null {
  const vid = endOf(d, incoming);
  const cands = outgoing(d, vid).filter((h) => !(h.e === incoming.e && h.dir === -incoming.dir));
  if (!cands.length) return { e: incoming.e, dir: (-incoming.dir as 1 | -1) };
  const inAng = Math.atan2(v(d, startOf(d, incoming)).y - v(d, vid).y, v(d, startOf(d, incoming)).x - v(d, vid).x);
  let best: Half | null = null;
  let bestDelta = Infinity;
  for (const h of cands) {
    let delta = inAng - angOf(d, h);
    while (delta <= 1e-12) delta += Math.PI * 2;
    while (delta > Math.PI * 2) delta -= Math.PI * 2;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = h;
    }
  }
  return best;
}

function loopPoints(d: CadDrawing, loop: Half[]): Pt[] {
  return loop.map((h) => vertPt(v(d, startOf(d, h))));
}

function loopArea(d: CadDrawing, loop: Half[]): number {
  return shoelace(loopPoints(d, loop));
}

function pointInLoop(d: CadDrawing, p: Pt, loop: Half[]): boolean {
  return pointInPoly(p, loopPoints(d, loop));
}

export function rebuildFaces(d: CadDrawing, defaultType: RegionType) {
  const prev = { ...d.faces };
  // Exact primitives such as circles do not have an edge loop. Keep them
  // intact while rebuilding the topology of edge-based faces. A face that is
  // intentionally deleted is already absent from `prev`, so it is not
  // restored here.
  const standaloneFaces = Object.values(prev)
    .filter((face) => face.outer.length === 0)
    .map((face) => structuredClone(face));
  const used = new Set<string>();
  const allHalves: Half[] = [];
  for (const ed of Object.values(d.edges)) {
    allHalves.push({ e: ed.id, dir: 1 }, { e: ed.id, dir: -1 });
  }
  const pos: { loop: Half[]; area: number }[] = [];
  for (const start of allHalves) {
    const k0 = halfKey(start);
    if (used.has(k0)) continue;
    const loop: Half[] = [];
    let cur: Half | null = start;
    const seen = new Set<string>();
    while (cur && !seen.has(halfKey(cur))) {
      seen.add(halfKey(cur));
      loop.push(cur);
      used.add(halfKey(cur));
      cur = nextHalf(d, cur);
      if (cur && halfKey(cur) === k0) break;
      if (loop.length > 4000) break;
    }
    if (loop.length < 3) continue;
    const area = loopArea(d, loop);
    if (area > 1e-10) pos.push({ loop, area });
  }
  pos.sort((a, b) => b.area - a.area);

  const faces: CadFace[] = [];
  for (const cand of pos) {
    const old = Object.values(prev).find((f) => loopsEqual(f.outer, cand.loop));
    const id = old?.id ?? nid("f");
    faces.push({
      id,
      type: old?.type ?? defaultType,
      outer: cand.loop,
      holes: [],
      locked: old?.locked ?? false,
      hidden: old?.hidden ?? false,
      circle: old?.circle,
      ellipse: old?.ellipse,
      rect: old?.rect,
      spline: old?.spline,
      freehand: old?.freehand,
      pointShape: old?.pointShape,
      nodeEdit: old?.nodeEdit,
      hydro: old?.hydro,
      name: old?.name,
      fill: old?.fill,
    });
    d.faces[id] = faces[faces.length - 1]!;
  }

  d.faces = {};
  for (const f of faces) d.faces[f.id] = f;

  for (const f of faces) {
    const sample = centroidOf(d, f.outer);
    let parent: CadFace | null = null;
    for (const o of faces) {
      if (o.id === f.id) continue;
      if (pointInLoop(d, sample, o.outer) && faceAreaRaw(d, o) > faceAreaRaw(d, f)) {
        if (!parent || faceAreaRaw(d, o) < faceAreaRaw(d, parent)) parent = o;
      }
    }
    if (parent) {
      parent.holes.push(f.outer.map((h) => ({ e: h.e, dir: (-h.dir as 1 | -1) })));
    }
  }

  for (const ed of Object.values(d.edges)) {
    ed.faceL = null;
    ed.faceR = null;
  }
  for (const f of Object.values(d.faces)) {
    assignLoopFaces(d, f.outer, f.id);
  }
  for (const face of standaloneFaces) {
    d.faces[face.id] = face;
  }
}

function centroidOf(d: CadDrawing, loop: Half[]): Pt {
  const pts = loopPoints(d, loop);
  return { x: pts.reduce((s, p) => s + p.x, 0) / (pts.length || 1), y: pts.reduce((s, p) => s + p.y, 0) / (pts.length || 1) };
}

function faceAreaRaw(d: CadDrawing, f: CadFace) {
  return Math.abs(shoelace(loopPoints(d, f.outer)));
}

function loopsEqual(a: Half[], b: Half[]) {
  if (a.length !== b.length) return false;
  const set = new Set(b.map(halfKey));
  return a.every((h) => set.has(halfKey(h)));
}

function assignLoopFaces(d: CadDrawing, loop: Half[], faceId: string) {
  for (const h of loop) {
    const ed = d.edges[h.e];
    if (!ed) continue;
    if (h.dir === 1) ed.faceL = faceId;
    else ed.faceR = faceId;
  }
}

export function facePoints(d: CadDrawing, faceId: string): Pt[] {
  const f = d.faces[faceId];
  if (!f) return [];
  if (f.spline) return catmullRom(f.spline.pts, 8, f.spline.closed);
  if (f.freehand) return f.freehand.pts.map((point) => ({ ...point }));
  if (f.circle) {
    const { cx, cy, r } = f.circle;
    const n = 48;
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return pts;
  }
  return tessellateLoop(d, f.outer);
}

export function faceHoles(d: CadDrawing, faceId: string): Pt[][] {
  const f = d.faces[faceId];
  if (!f) return [];
  return f.holes.map((loop) => tessellateLoop(d, loop)).filter((pts) => pts.length >= 3);
}

export function faceVertices(d: CadDrawing, faceId: string): { id: string; x: number; y: number }[] {
  const f = d.faces[faceId];
  if (!f) return [];
  return f.outer.map((h) => {
    const id = startOf(d, h);
    const p = v(d, id);
    return { id, x: p.x, y: p.y };
  });
}

export function faceEdges(d: CadDrawing, faceId: string): { id: string; a: Pt; b: Pt; bulge: number; mid: Pt }[] {
  const f = d.faces[faceId];
  if (!f) return [];
  return f.outer.map((h) => {
    const ed = e(d, h.e);
    const A = vertPt(v(d, startOf(d, h)));
    const B = vertPt(v(d, endOf(d, h)));
    const bulge = h.dir === 1 ? ed.bulge : -ed.bulge;
    return { id: ed.id, a: A, b: B, bulge, mid: bulgeMidpoint(A, B, bulge) };
  });
}

export function faceArea(d: CadDrawing, faceId: string): number {
  const f = d.faces[faceId];
  if (!f) return 0;
  if (f.circle) return Math.PI * f.circle.r * f.circle.r;
  if (!f.outer.length && (f.spline?.closed || f.freehand?.closed)) {
    return polygonArea(facePoints(d, faceId));
  }
  let a = Math.abs(loopAreaBulge(d, f.outer));
  for (const h of f.holes) a -= Math.abs(loopAreaBulge(d, h));
  return Math.max(0, a);
}

export function facePerimeter(d: CadDrawing, faceId: string): number {
  const f = d.faces[faceId];
  if (!f) return 0;
  if (f.circle) return 2 * Math.PI * f.circle.r;
  if (!f.outer.length && (f.spline || f.freehand)) {
    const points = facePoints(d, faceId);
    let total = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      total += dist(points[index]!, points[index + 1]!);
    }
    if ((f.spline?.closed || f.freehand?.closed) && points.length > 2) {
      total += dist(points[points.length - 1]!, points[0]!);
    }
    return total;
  }
  const len = (loop: Half[]) => {
    let s = 0;
    for (const h of loop) {
      const ed = d.edges[h.e];
      if (!ed) continue;
      const A = v(d, ed.a);
      const B = v(d, ed.b);
      s += arcLength(A, B, ed.bulge);
    }
    return s;
  };
  return len(f.outer) + f.holes.reduce((s, h) => s + len(h), 0);
}

export function arcLength(a: Pt, b: Pt, bulge: number): number {
  const chord = dist(a, b);
  if (Math.abs(bulge) < 1e-9) return chord;
  const sweep = 4 * Math.atan(bulge);
  const r = chord / (2 * Math.sin(sweep / 2));
  return Math.abs(r * sweep);
}

export function arcCenter(a: Pt, b: Pt, bulge: number): { c: Pt; r: number; sweep: number } | null {
  if (Math.abs(bulge) < 1e-9) return null;
  const chord = dist(a, b);
  const sweep = 4 * Math.atan(bulge);
  const r = chord / (2 * Math.sin(sweep / 2));
  if (!Number.isFinite(r) || Math.abs(r) < EPS) return null;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const h = (r * r - (chord * chord) / 4);
  const off = Math.sign(bulge) * Math.sqrt(Math.max(0, h));
  const len = chord || 1;
  const c = { x: mx - (dy / len) * off, y: my + (dx / len) * off };
  return { c, r: Math.abs(r), sweep };
}

export function bulgeMidpoint(a: Pt, b: Pt, bulge: number): Pt {
  if (Math.abs(bulge) < 1e-9) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const ac = arcCenter(a, b, bulge);
  if (!ac) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const a0 = Math.atan2(a.y - ac.c.y, a.x - ac.c.x);
  const mid = a0 + ac.sweep / 2;
  return { x: ac.c.x + ac.r * Math.cos(mid), y: ac.c.y + ac.r * Math.sin(mid) };
}

export function tessellateEdge(a: Pt, b: Pt, bulge: number, minSeg = 8): Pt[] {
  if (Math.abs(bulge) < 1e-6) return [a, b];
  const ac = arcCenter(a, b, bulge);
  if (!ac) return [a, b];
  const n = Math.max(minSeg, Math.ceil(Math.abs(ac.sweep) / (Math.PI / 18)));
  const a0 = Math.atan2(a.y - ac.c.y, a.x - ac.c.x);
  const pts: Pt[] = [a];
  for (let i = 1; i < n; i++) {
    const ang = a0 + (ac.sweep * i) / n;
    pts.push({ x: ac.c.x + ac.r * Math.cos(ang), y: ac.c.y + ac.r * Math.sin(ang) });
  }
  pts.push(b);
  return pts;
}

function tessellateLoop(d: CadDrawing, loop: Half[]): Pt[] {
  const pts: Pt[] = [];
  for (const h of loop) {
    const ed = d.edges[h.e];
    if (!ed) continue;
    const A = vertPt(v(d, startOf(d, h)));
    const B = vertPt(v(d, endOf(d, h)));
    const bulge = h.dir === 1 ? ed.bulge : -ed.bulge;
    const seg = tessellateEdge(A, B, bulge);
    if (pts.length) seg.shift();
    pts.push(...seg);
  }
  return pts;
}

function loopAreaBulge(d: CadDrawing, loop: Half[]): number {
  const verts = loopPoints(d, loop);
  let a = shoelace(verts);
  for (const h of loop) {
    const ed = d.edges[h.e];
    if (!ed || Math.abs(ed.bulge) < 1e-9) continue;
    const A = vertPt(v(d, startOf(d, h)));
    const B = vertPt(v(d, endOf(d, h)));
    const bulge = h.dir === 1 ? ed.bulge : -ed.bulge;
    const sweep = 4 * Math.atan(bulge);
    const chord = dist(A, B);
    const r = chord / (2 * Math.sin(sweep / 2));
    if (!Number.isFinite(r)) continue;
    a += 0.5 * r * r * (sweep - Math.sin(sweep));
  }
  return a;
}

export function isInternalEdge(d: CadDrawing, edgeId: string): boolean {
  const ed = d.edges[edgeId];
  if (!ed) return false;
  return Boolean(ed.faceL && ed.faceR && ed.faceL !== ed.faceR);
}

export function deleteBoundary(d0: CadDrawing, edgeId: string, keep?: RegionType): { drawing: CadDrawing; warning?: string; types?: [RegionType, RegionType] } {
  const d = cloneDrawing(d0);
  const ed = d.edges[edgeId];
  if (!ed) return { drawing: d };
  if (!isInternalEdge(d, edgeId)) {
    return { drawing: d, warning: "outer" };
  }
  const tL = d.faces[ed.faceL!]?.type;
  const tR = d.faces[ed.faceR!]?.type;
  if (!keep && tL && tR && tL !== tR) {
    return { drawing: d, types: [tL, tR] };
  }
  const keepType = keep ?? tL ?? tR ?? "lawn";
  delete d.edges[edgeId];
  rebuildFaces(d, keepType);
  return { drawing: cleanupDrawing(d) };
}

/** Delete a standalone or dangling in-face construction segment without affecting a closed boundary. */
export function deleteLooseEdge(d0: CadDrawing, edgeId: string): CadDrawing {
  const d = cloneDrawing(d0);
  const edge = d.edges[edgeId];
  if (!edge) return d;
  const inFaceId = edge.faceL && edge.faceL === edge.faceR ? edge.faceL : null;
  if ((edge.faceL || edge.faceR) && !inFaceId) return d;
  const oldFace = inFaceId ? d.faces[inFaceId] : null;
  const oldCenter = inFaceId ? faceCentroid(d, inFaceId) : null;
  const endpointIds = new Set([edge.a, edge.b]);
  delete d.edges[edgeId];
  const usedVertices = new Set<string>();
  for (const other of Object.values(d.edges)) {
    usedVertices.add(other.a);
    usedVertices.add(other.b);
  }
  if (d.constraints) {
    for (const constraint of Object.values(d.constraints)) {
      if (
        constraint.a === edgeId ||
        constraint.b === edgeId ||
        (endpointIds.has(constraint.a) && !usedVertices.has(constraint.a)) ||
        (constraint.b && endpointIds.has(constraint.b) && !usedVertices.has(constraint.b))
      ) {
        delete d.constraints[constraint.id];
      }
    }
  }
  if (oldFace && oldCenter) {
    rebuildFaces(d, oldFace.type);
    const replacement = Object.values(d.faces).sort(
      (a, b) => dist(faceCentroid(d, a.id), oldCenter) - dist(faceCentroid(d, b.id), oldCenter),
    )[0];
    if (replacement) {
      replacement.type = oldFace.type;
      replacement.locked = oldFace.locked;
      replacement.hidden = oldFace.hidden;
      replacement.hydro = oldFace.hydro;
      replacement.name = oldFace.name;
      replacement.fill = oldFace.fill;
      replacement.pointShape = oldFace.pointShape;
      replacement.nodeEdit = oldFace.nodeEdit;
    }
  }
  return cleanupDrawing(d);
}

export function deleteFace(d0: CadDrawing, faceId: string): CadDrawing {
  const d = cloneDrawing(d0);
  const f = d.faces[faceId];
  if (!f) return d;
  const ids = new Set(f.outer.map((h) => h.e));
  for (const h of f.holes) for (const x of h) ids.add(x.e);
  for (const id of ids) {
    const ed = d.edges[id];
    if (!ed) continue;
    const other = ed.faceL === faceId ? ed.faceR : ed.faceL === ed.faceR ? null : ed.faceL;
    if (ed.faceL === faceId) ed.faceL = null;
    if (ed.faceR === faceId) ed.faceR = null;
    if (!ed.faceL && !ed.faceR && !other) delete d.edges[id];
  }
  delete d.faces[faceId];
  rebuildFaces(d, "lawn");
  return d;
}

export function setFaceType(d0: CadDrawing, faceId: string, type: RegionType): CadDrawing {
  const d = cloneDrawing(d0);
  if (d.faces[faceId]) d.faces[faceId] = { ...d.faces[faceId]!, type };
  return d;
}

export function moveVertex(d0: CadDrawing, vertexId: string, p: Pt): CadDrawing {
  const d = cloneDrawing(d0);
  if (!d.vertices[vertexId]) return d;
  d.vertices[vertexId] = { ...d.vertices[vertexId]!, x: p.x, y: p.y };
  for (const f of Object.values(d.faces)) f.rect = undefined;
  return applyConstraints(d);
}

/** Move one merged-contour node without reapplying primitive CAD constraints. */
export function moveNodeEditVertex(d0: CadDrawing, faceId: string, vertexId: string, p: Pt): CadDrawing {
  const d = cloneDrawing(d0);
  const face = d.faces[faceId];
  const vertex = d.vertices[vertexId];
  if (!face?.nodeEdit || !vertex) return d;
  const vertexIds = face.outer.map((half) => startOf(d, half));
  const index = vertexIds.indexOf(vertexId);
  if (index < 0) return d;
  const dx = p.x - vertex.x;
  const dy = p.y - vertex.y;
  const curved = new Set(face.nodeEdit.curvedVertexIds);
  const moveBy = (id: string, weight: number) => {
    const current = d.vertices[id];
    if (current) d.vertices[id] = { ...current, x: current.x + dx * weight, y: current.y + dy * weight };
  };
  moveBy(vertexId, 1);
  if (curved.has(vertexId) && vertexIds.length > 3) {
    const weights = [0.62, 0.32, 0.14];
    for (let distance = 1; distance <= weights.length; distance += 1) {
      for (const direction of [-1, 1]) {
        const neighborId = vertexIds[(index + direction * distance + vertexIds.length) % vertexIds.length]!;
        if (curved.has(neighborId)) moveBy(neighborId, weights[distance - 1]!);
      }
    }
  }
  face.rect = undefined;
  clearFaceGeometryConstraints(d, face);
  return d;
}

function clearFaceGeometryConstraints(d: CadDrawing, face: CadFace) {
  if (!d.constraints) return;
  const geometryIds = new Set<string>();
  for (const half of face.outer) {
    geometryIds.add(half.e);
    geometryIds.add(startOf(d, half));
    geometryIds.add(endOf(d, half));
  }
  for (const constraint of Object.values(d.constraints)) {
    if (
      geometryIds.has(constraint.a) ||
      (constraint.b != null && geometryIds.has(constraint.b))
    ) {
      delete d.constraints[constraint.id];
    }
  }
}

/** Mark a numbered-point contour as freely editable, without CAD auto-locks. */
export function markPointShape(d0: CadDrawing, faceId: string): CadDrawing {
  const d = cloneDrawing(d0);
  const face = d.faces[faceId];
  if (!face) return d;
  face.pointShape = true;
  face.rect = undefined;
  clearFaceGeometryConstraints(d, face);
  return d;
}

/** Commit the exact displayed vertices of a numbered-point contour. */
export function setPointShapeVertices(
  d0: CadDrawing,
  faceId: string,
  points: Pt[],
): CadDrawing {
  const d = cloneDrawing(d0);
  const face = d.faces[faceId];
  if (!face?.pointShape || points.length !== face.outer.length) return d;
  face.outer.forEach((half, index) => {
    const vertexId = startOf(d, half);
    const vertex = d.vertices[vertexId];
    const point = points[index];
    if (vertex && point) d.vertices[vertexId] = { ...vertex, x: point.x, y: point.y };
  });
  for (const item of Object.values(d.faces)) item.rect = undefined;
  clearFaceGeometryConstraints(d, face);
  return d;
}

/**
 * Set one boundary side to an exact length without turning its neighbouring
 * orthogonal side into a diagonal. The side end stays fixed; its start and the
 * preceding cap move together along the side direction.
 */
export function setFaceEdgeLength(
  d0: CadDrawing,
  faceId: string,
  edgeId: string,
  targetLength: number,
): CadDrawing {
  const d = cloneDrawing(d0);
  const face = d.faces[faceId];
  const halfIndex = face?.outer.findIndex((item) => item.e === edgeId) ?? -1;
  const half = halfIndex >= 0 ? face?.outer[halfIndex] : undefined;
  const previousHalf =
    face && halfIndex >= 0
      ? face.outer[(halfIndex - 1 + face.outer.length) % face.outer.length]
      : undefined;
  if (
    !face ||
    !half ||
    !previousHalf ||
    !Number.isFinite(targetLength) ||
    targetLength <= 0
  )
    return d;
  const startId = startOf(d, half);
  const endId = endOf(d, half);
  const previousStartId = startOf(d, previousHalf);
  const start = d.vertices[startId];
  const end = d.vertices[endId];
  const previousStart = d.vertices[previousStartId];
  if (!start || !end || !previousStart) return d;
  const currentLength = dist(start, end);
  if (currentLength < 1e-9) return d;
  const scale = targetLength / currentLength;
  const nextStart = {
    x: end.x + (start.x - end.x) * scale,
    y: end.y + (start.y - end.y) * scale,
  };
  const dx = nextStart.x - start.x;
  const dy = nextStart.y - start.y;
  d.vertices[startId] = { ...start, ...nextStart };
  d.vertices[previousStartId] = {
    ...previousStart,
    x: previousStart.x + dx,
    y: previousStart.y + dy,
  };
  for (const item of Object.values(d.faces)) item.rect = undefined;
  // Numeric editing is authoritative; stale automatic constraints attached to
  // the moved cap must not undo it on a later handle edit.
  if (d.constraints) {
    for (const constraint of Object.values(d.constraints)) {
      if (
        constraint.a === startId ||
        constraint.b === startId ||
        constraint.a === previousStartId ||
        constraint.b === previousStartId ||
        constraint.a === edgeId ||
        constraint.b === edgeId
      ) {
        delete d.constraints[constraint.id];
      }
    }
  }
  return d;
}

/** Set a complete visible side (possibly split into collinear CAD edges). */
export function setFaceSideLength(
  d0: CadDrawing,
  faceId: string,
  startEdgeId: string,
  targetLength: number,
): CadDrawing {
  const d = cloneDrawing(d0);
  const face = d.faces[faceId];
  if (!face || !Number.isFinite(targetLength) || targetLength <= 0) return d;
  const points = face.outer.map((half) => vertPt(v(d, startOf(d, half))));
  const starts = closedPathSideStarts(points);
  const rawIndex = face.outer.findIndex((half) => half.e === startEdgeId);
  const sidePosition = starts.findIndex((start, index) => {
    const end = starts[(index + 1) % starts.length]!;
    return start <= end
      ? rawIndex >= start && rawIndex < end
      : rawIndex >= start || rawIndex < end;
  });
  if (rawIndex < 0 || sidePosition < 0) return d;

  const sideStart = starts[sidePosition]!;
  const sideEnd = starts[(sidePosition + 1) % starts.length]!;
  const previousSideStart = starts[(sidePosition - 1 + starts.length) % starts.length]!;
  const startId = startOf(d, face.outer[sideStart]!);
  const endId = startOf(d, face.outer[sideEnd]!);
  const start = d.vertices[startId];
  const end = d.vertices[endId];
  if (!start || !end) return d;
  const currentLength = dist(start, end);
  if (currentLength < 1e-9) return d;
  const scale = targetLength / currentLength;
  const movedIds = new Set<string>();

  const forCyclicRange = (from: number, to: number, visit: (index: number) => void) => {
    let index = from;
    while (index !== to) {
      visit(index);
      index = (index + 1) % face.outer.length;
    }
  };

  // Scale every stored vertex on the selected straight side while its far end
  // stays fixed, so an internally split side remains one straight line.
  forCyclicRange(sideStart, sideEnd, (index) => {
    const vertexId = startOf(d, face.outer[index]!);
    const vertex = d.vertices[vertexId];
    if (!vertex) return;
    d.vertices[vertexId] = {
      ...vertex,
      x: end.x + (vertex.x - end.x) * scale,
      y: end.y + (vertex.y - end.y) * scale,
    };
    movedIds.add(vertexId);
  });
  const movedStart = d.vertices[startId]!;
  const dx = movedStart.x - start.x;
  const dy = movedStart.y - start.y;

  if (!face.pointShape) {
    // Orthogonal freeforms resize like rectangles: translate the preceding
    // cap as one unit so it does not turn into a diagonal.
    forCyclicRange(previousSideStart, sideStart, (index) => {
      const vertexId = startOf(d, face.outer[index]!);
      const vertex = d.vertices[vertexId];
      if (!vertex) return;
      d.vertices[vertexId] = { ...vertex, x: vertex.x + dx, y: vertex.y + dy };
      movedIds.add(vertexId);
    });
  }

  for (const item of Object.values(d.faces)) item.rect = undefined;
  if (d.constraints) {
    for (const constraint of Object.values(d.constraints)) {
      if (
        (constraint.a && movedIds.has(constraint.a)) ||
        (constraint.b && movedIds.has(constraint.b))
      ) {
        delete d.constraints[constraint.id];
      }
    }
  }
  return d;
}

export function faceVertexIds(d: CadDrawing, faceId: string): string[] {
  const f = d.faces[faceId];
  if (!f) return [];
  const ids = new Set<string>();
  for (const h of f.outer) ids.add(startOf(d, h));
  for (const hole of f.holes) for (const h of hole) ids.add(startOf(d, h));
  return [...ids];
}

export function faceCentroid(d: CadDrawing, faceId: string): Pt {
  const f = d.faces[faceId];
  if (!f) return { x: 0, y: 0 };
  if (f.circle) return { x: f.circle.cx, y: f.circle.cy };
  if (!f.outer.length && (f.spline || f.freehand)) {
    const points = facePoints(d, faceId);
    if (!points.length) return { x: 0, y: 0 };
    if ((f.spline?.closed || f.freehand?.closed) && points.length >= 3) {
      const area = shoelace(points);
      if (Math.abs(area) > 1e-12) {
        let cx = 0;
        let cy = 0;
        for (let index = 0; index < points.length; index += 1) {
          const point = points[index]!;
          const next = points[(index + 1) % points.length]!;
          const cross = point.x * next.y - next.x * point.y;
          cx += (point.x + next.x) * cross;
          cy += (point.y + next.y) * cross;
        }
        return { x: cx / (6 * area), y: cy / (6 * area) };
      }
    }
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
  }
  const pts = loopPoints(d, f.outer);
  const a = shoelace(pts);
  if (Math.abs(a) < 1e-12) {
    return { x: pts.reduce((s, p) => s + p.x, 0) / (pts.length || 1), y: pts.reduce((s, p) => s + p.y, 0) / (pts.length || 1) };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const cr = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * cr;
    cy += (p.y + q.y) * cr;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function moveFace(d0: CadDrawing, faceId: string, dx: number, dy: number): CadDrawing {
  const d = cloneDrawing(d0);
  const f = d.faces[faceId];
  if (!f) return d;
  for (const id of faceVertexIds(d, faceId)) {
    const vt = d.vertices[id];
    if (vt) d.vertices[id] = { ...vt, x: vt.x + dx, y: vt.y + dy };
  }
  if (f.circle) f.circle = { ...f.circle, cx: f.circle.cx + dx, cy: f.circle.cy + dy };
  if (f.ellipse) f.ellipse = { ...f.ellipse, cx: f.ellipse.cx + dx, cy: f.ellipse.cy + dy };
  if (f.rect) f.rect = { ...f.rect, x: f.rect.x + dx, y: f.rect.y + dy };
  if (f.spline) f.spline = { ...f.spline, pts: f.spline.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  if (f.freehand) f.freehand = { ...f.freehand, pts: f.freehand.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  return d;
}

export function rotateFace(d0: CadDrawing, faceId: string, deg: number, origin?: Pt): CadDrawing {
  const d = cloneDrawing(d0);
  const f = d.faces[faceId];
  if (!f) return d;
  const o = origin ?? faceCentroid(d, faceId);
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const rot = (p: Pt): Pt => ({
    x: o.x + (p.x - o.x) * c - (p.y - o.y) * s,
    y: o.y + (p.x - o.x) * s + (p.y - o.y) * c,
  });
  for (const id of faceVertexIds(d, faceId)) {
    const vt = d.vertices[id];
    if (vt) {
      const q = rot(vt);
      d.vertices[id] = { ...vt, x: q.x, y: q.y };
    }
  }
  if (f.circle) {
    const q = rot({ x: f.circle.cx, y: f.circle.cy });
    f.circle = { ...f.circle, cx: q.x, cy: q.y };
  }
  if (f.rect) f.rect = { ...f.rect, rot: (f.rect.rot + deg) % 360 };
  if (f.ellipse) f.ellipse = { ...f.ellipse, rot: ((f.ellipse.rot ?? 0) + deg) % 360 };
  if (f.spline) f.spline = { ...f.spline, pts: f.spline.pts.map(rot) };
  if (f.freehand) f.freehand = { ...f.freehand, pts: f.freehand.pts.map(rot) };
  return d;
}

export function polarArray(d0: CadDrawing, faceId: string, center: Pt, count: number): { drawing: CadDrawing; id: string } {
  const n = Math.max(2, Math.min(36, Math.round(count)));
  let d = d0;
  let last = faceId;
  const step = 360 / n;
  for (let i = 1; i < n; i++) {
    const r = duplicateFace(d, faceId, 0, 0);
    d = rotateFace(r.drawing, r.id, step * i, center);
    last = r.id;
  }
  return { drawing: d, id: last };
}

export function flattenEdge(d0: CadDrawing, edgeId: string): CadDrawing {
  const d = cloneDrawing(d0);
  if (d.edges[edgeId]) d.edges[edgeId] = { ...d.edges[edgeId]!, bulge: 0 };
  return d;
}

export function duplicateFace(d0: CadDrawing, faceId: string, dx = 0.8, dy = 0.8): { drawing: CadDrawing; id: string } {
  const d = cloneDrawing(d0);
  const f = d.faces[faceId];
  if (!f) return { drawing: d, id: faceId };
  const vmap = new Map<string, string>();
  for (const id of faceVertexIds(d, faceId)) {
    const src = d.vertices[id];
    if (!src) continue;
    const nidv = nid("v");
    vmap.set(id, nidv);
    d.vertices[nidv] = { id: nidv, x: src.x + dx, y: src.y + dy };
  }
  const emap = new Map<string, string>();
  const copyLoop = (loop: { e: string; dir: 1 | -1 }[]) =>
    loop.map((h) => {
      let ne = emap.get(h.e);
      if (!ne) {
        const ed = d.edges[h.e];
        ne = nid("e");
        emap.set(h.e, ne);
        if (ed) {
          d.edges[ne] = {
            id: ne,
            a: vmap.get(ed.a) ?? ed.a,
            b: vmap.get(ed.b) ?? ed.b,
            bulge: ed.bulge,
            faceL: null,
            faceR: null,
          };
        }
      }
      return { e: ne, dir: h.dir };
    });
  const id = nid("f");
  d.faces[id] = {
    id,
    type: f.type,
    outer: copyLoop(f.outer),
    holes: f.holes.map(copyLoop),
    locked: false,
    hidden: false,
    circle: f.circle ? { cx: f.circle.cx + dx, cy: f.circle.cy + dy, r: f.circle.r } : undefined,
    ellipse: f.ellipse ? { ...f.ellipse, cx: f.ellipse.cx + dx, cy: f.ellipse.cy + dy } : undefined,
    rect: f.rect ? { ...f.rect, x: f.rect.x + dx, y: f.rect.y + dy } : undefined,
    spline: f.spline
      ? { ...f.spline, pts: f.spline.pts.map((point) => ({ x: point.x + dx, y: point.y + dy })) }
      : undefined,
    freehand: f.freehand
      ? { ...f.freehand, pts: f.freehand.pts.map((point) => ({ x: point.x + dx, y: point.y + dy })) }
      : undefined,
    pointShape: f.pointShape,
    nodeEdit: f.nodeEdit
      ? { curvedVertexIds: f.nodeEdit.curvedVertexIds.map((id) => vmap.get(id)).filter((id): id is string => Boolean(id)) }
      : undefined,
    hydro: f.hydro,
    name: f.name,
    fill: f.fill,
  };
  return { drawing: d, id };
}

export function insertVertexOnEdge(d0: CadDrawing, edgeId: string, p?: Pt): CadDrawing {
  const d = cloneDrawing(d0);
  const ed = d.edges[edgeId];
  if (!ed) return d;
  const A = v(d, ed.a);
  const B = v(d, ed.b);
  const at = p ?? { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  splitEdgeAt(d, edgeId, at);
  return d;
}

export function catmullRom(pts: Pt[], samples = 8, closed = false): Pt[] {
  if (pts.length < 2) return pts.slice();
  const src = closed ? [...pts, pts[0]!] : pts;
  const out: Pt[] = [];
  const n = src.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = src[i === 0 ? (closed ? n - 2 : 0) : i - 1]!;
    const p1 = src[i]!;
    const p2 = src[i + 1]!;
    const p3 = src[Math.min(n - 1, i + 2)]!;
    const segs = i === n - 2 ? samples : samples;
    for (let s = 0; s < segs; s++) {
      const t = s / segs;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(src[n - 1]!);
  return out;
}

export function addSpline(d: CadDrawing, pts: Pt[], close: boolean, type: RegionType): CadDrawing {
  if (pts.length < 2) return d;
  if (!close) {
    const next = cloneDrawing(d);
    const id = nid("f");
    next.faces[id] = {
      id,
      type,
      outer: [],
      holes: [],
      locked: false,
      hidden: false,
      spline: { pts: pts.map((point) => ({ ...point })), closed: false },
    };
    return next;
  }
  const before = new Set(Object.values(d.faces).map(faceBoundaryKey));
  const next = addChain(d, catmullRom(pts, 8, true), true, type, false);
  const face = Object.values(next.faces)
    .filter((candidate) => !before.has(faceBoundaryKey(candidate)))
    .sort((a, b) => faceArea(next, b.id) - faceArea(next, a.id))[0];
  if (face) face.spline = { pts: pts.map((point) => ({ ...point })), closed: true };
  return next;
}

export function updateSpline(
  d0: CadDrawing,
  faceId: string,
  pts: Pt[],
  closedOverride?: boolean,
): CadDrawing {
  const f = d0.faces[faceId];
  if (!f?.spline) return d0;
  const closed = closedOverride ?? f.spline.closed;
  if (!closed) {
    const d = cloneDrawing(d0);
    d.faces[faceId] = {
      ...d.faces[faceId]!,
      spline: { pts: pts.map((point) => ({ ...point })), closed: false },
    };
    return d;
  }
  const type = f.type;
  const d = deleteFace(d0, faceId);
  const remainingIds = new Set(Object.keys(d.faces));
  const next = addSpline(d, pts, true, type);
  const created = Object.values(next.faces).find(
    (candidate) => candidate.spline && !remainingIds.has(candidate.id),
  );
  if (!created) return d0;
  const createdId = created.id;
  delete next.faces[createdId];
  next.faces[faceId] = {
    ...created,
    id: faceId,
    locked: f.locked,
    hidden: f.hidden,
    hydro: f.hydro,
    name: f.name,
    fill: f.fill,
  };
  for (const edge of Object.values(next.edges)) {
    if (edge.faceL === createdId) edge.faceL = faceId;
    if (edge.faceR === createdId) edge.faceR = faceId;
  }
  return next;
}

export function cleanupDrawing(d0: CadDrawing): CadDrawing {
  const d = cloneDrawing(d0);
  const ids = Object.keys(d.vertices);
  const remap: Record<string, string> = {};
  for (let i = 0; i < ids.length; i++) {
    const a = d.vertices[ids[i]!]!;
    if (remap[a.id]) continue;
    remap[a.id] = a.id;
    for (let j = i + 1; j < ids.length; j++) {
      const b = d.vertices[ids[j]!]!;
      if (remap[b.id]) continue;
      if (dist(a, b) < 1e-6) remap[b.id] = a.id;
    }
  }
  for (const ed of Object.values(d.edges)) {
    ed.a = remap[ed.a] ?? ed.a;
    ed.b = remap[ed.b] ?? ed.b;
    if (ed.a === ed.b) delete d.edges[ed.id];
  }
  const used = new Set<string>();
  for (const ed of Object.values(d.edges)) {
    used.add(ed.a);
    used.add(ed.b);
  }
  for (const id of Object.keys(d.vertices)) if (!used.has(id)) delete d.vertices[id];
  return d;
}

export function ellipseWorldPts(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 96): Pt[] {
  const rad = ((rot || 0) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const ax = Math.abs(rx);
  const ay = Math.abs(ry);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    const lx = ax * Math.cos(a);
    const ly = ay * Math.sin(a);
    pts.push({ x: cx + lx * c - ly * s, y: cy + lx * s + ly * c });
  }
  return pts;
}

export function addEllipse(d0: CadDrawing, c: Pt, rx: number, ry: number, type: RegionType): CadDrawing {
  if (Math.abs(rx) < EPS || Math.abs(ry) < EPS) return d0;
  const pts = ellipseWorldPts(c.x, c.y, rx, ry, 0, 96);
  return addIsolatedLoop(d0, pts, type, { ellipse: { cx: c.x, cy: c.y, rx: Math.abs(rx), ry: Math.abs(ry), rot: 0 } });
}

export function rectWorldCorners(r: { x: number; y: number; w: number; h: number; rot: number }): Pt[] {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rad = ((r.rot || 0) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [
    { x: -r.w / 2, y: -r.h / 2 },
    { x: r.w / 2, y: -r.h / 2 },
    { x: r.w / 2, y: r.h / 2 },
    { x: -r.w / 2, y: r.h / 2 },
  ].map((p) => ({ x: cx + p.x * c - p.y * s, y: cy + p.x * s + p.y * c }));
}

function writeRectMeta(d: CadDrawing, faceId: string, r: { x: number; y: number; w: number; h: number; rot: number }) {
  const f = d.faces[faceId];
  if (!f) return;
  f.rect = { ...r, w: Math.max(EPS, r.w), h: Math.max(EPS, r.h) };
  const corners = rectWorldCorners(f.rect);
  const verts = faceVertices(d, faceId).slice(0, 4);
  if (verts.length < 4) return;
  let start = 0;
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const dd = dist(verts[0]!, corners[i]!);
    if (dd < best) {
      best = dd;
      start = i;
    }
  }
  const fwd = dist(verts[1]!, corners[(start + 1) % 4]!);
  const bwd = dist(verts[1]!, corners[(start + 3) % 4]!);
  const dir = bwd < fwd ? -1 : 1;
  for (let i = 0; i < 4; i++) {
    const p = corners[(((start + i * dir) % 4) + 4) % 4]!;
    const cur = d.vertices[verts[i]!.id];
    if (cur) d.vertices[verts[i]!.id] = { ...cur, x: p.x, y: p.y };
  }
}

export function setRectSize(d0: CadDrawing, faceId: string, w: number, h: number): CadDrawing {
  const f = d0.faces[faceId];
  if (!f || w <= EPS || h <= EPS) return d0;
  if (f.rect) {
    const cx = f.rect.x + f.rect.w / 2;
    const cy = f.rect.y + f.rect.h / 2;
    const d = cloneDrawing(d0);
    writeRectMeta(d, faceId, { x: cx - w / 2, y: cy - h / 2, w, h, rot: f.rect.rot || 0 });
    return d;
  }
  if (f.ellipse) return setEllipseRadii(d0, faceId, w / 2, h / 2);
  const d = cloneDrawing(d0);
  const pts = facePoints(d, faceId);
  if (pts.length < 2) return d0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const ow = maxX - minX;
  const oh = maxY - minY;
  if (ow < EPS || oh < EPS) return d0;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const sx = w / ow;
  const sy = h / oh;
  for (const id of faceVertexIds(d, faceId)) {
    const vt = d.vertices[id];
    if (!vt) continue;
    d.vertices[id] = { ...vt, x: cx + (vt.x - cx) * sx, y: cy + (vt.y - cy) * sy };
  }
  return d;
}

/** Resize a triangle in its own base/altitude frame while keeping its centroid and orientation. */
export function setTriangleSize(d0: CadDrawing, faceId: string, w: number, h: number): CadDrawing {
  if (w <= EPS || h <= EPS) return d0;
  const verts = faceVertices(d0, faceId).slice(0, 3);
  const metrics = triangleMetrics(verts);
  if (verts.length !== 3 || !metrics) return d0;
  const d = cloneDrawing(d0);
  const sx = w / metrics.width;
  const sy = h / metrics.height;
  verts.forEach((v) => {
    const dx = v.x - metrics.center.x;
    const dy = v.y - metrics.center.y;
    const lx = dx * metrics.ux + dy * metrics.uy;
    const ly = dx * metrics.nx + dy * metrics.ny;
    const cur = d.vertices[v.id];
    if (!cur) return;
    d.vertices[v.id] = {
      ...cur,
      x: metrics.center.x + metrics.ux * lx * sx + metrics.nx * ly * sy,
      y: metrics.center.y + metrics.uy * lx * sx + metrics.ny * ly * sy,
    };
  });
  return d;
}

/** Set all three triangle sides while preserving its centroid and base orientation. */
export function setTriangleSides(d0: CadDrawing, faceId: string, base: number, left: number, right: number): CadDrawing {
  if (base <= EPS || left <= EPS || right <= EPS || left + right <= base + EPS || base + left <= right + EPS || base + right <= left + EPS) return d0;
  const verts = faceVertices(d0, faceId).slice(0, 3);
  const metrics = triangleMetrics(verts);
  if (verts.length !== 3 || !metrics) return d0;
  const apexX = (left * left - right * right) / (2 * base);
  const height2 = left * left - (apexX + base / 2) ** 2;
  if (height2 <= EPS * EPS) return d0;
  const height = Math.sqrt(height2);
  const local = [
    { x: apexX, y: height },
    { x: base / 2, y: 0 },
    { x: -base / 2, y: 0 },
  ];
  const centroid = { x: apexX / 3, y: height / 3 };
  const d = cloneDrawing(d0);
  verts.forEach((v, i) => {
    const p = local[i]!;
    const lx = p.x - centroid.x;
    const ly = p.y - centroid.y;
    const cur = d.vertices[v.id];
    if (!cur) return;
    d.vertices[v.id] = {
      ...cur,
      x: metrics.center.x + metrics.ux * lx + metrics.nx * ly,
      y: metrics.center.y + metrics.uy * lx + metrics.ny * ly,
    };
  });
  return d;
}

/** edge 0 top, 1 right, 2 bottom, 3 left in local unrotated frame. Opposite side stays put. */
export function rectFromEdge(
  r: { x: number; y: number; w: number; h: number; rot: number },
  edge: 0 | 1 | 2 | 3,
  p: Pt,
  min = EPS,
): { x: number; y: number; w: number; h: number; rot: number } {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rad = ((r.rot || 0) * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const vx = -uy;
  const vy = ux;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const lx = dx * ux + dy * uy;
  const ly = dx * vx + dy * vy;
  let w = r.w;
  let h = r.h;
  let ncx = cx;
  let ncy = cy;
  if (edge === 1 || edge === 3) {
    const opp = edge === 1 ? -r.w / 2 : r.w / 2;
    w = Math.max(min, Math.abs(lx - opp));
    const nlx = (lx + opp) / 2;
    ncx = cx + ux * nlx;
    ncy = cy + uy * nlx;
  } else {
    const opp = edge === 0 ? r.h / 2 : -r.h / 2;
    h = Math.max(min, Math.abs(ly - opp));
    const nly = (ly + opp) / 2;
    ncx = cx + vx * nly;
    ncy = cy + vy * nly;
  }
  return { x: ncx - w / 2, y: ncy - h / 2, w, h, rot: r.rot || 0 };
}

export function setRectFromEdge(
  d0: CadDrawing,
  faceId: string,
  edge: 0 | 1 | 2 | 3,
  p: Pt,
): CadDrawing {
  const d = cloneDrawing(d0);
  const f = d.faces[faceId];
  if (!f?.rect) return d;
  writeRectMeta(d, faceId, rectFromEdge(f.rect, edge, p));
  return d;
}

export function setRectFromDiag(d0: CadDrawing, faceId: string, a: Pt, c: Pt): CadDrawing {
  const d = cloneDrawing(d0);
  const f = d.faces[faceId];
  if (!f) return d;
  if (f.rect) {
    const rot = f.rect.rot || 0;
    const rad = (rot * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const vx = -uy;
    const vy = ux;
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const w = Math.max(EPS, Math.abs(dx * ux + dy * uy));
    const h = Math.max(EPS, Math.abs(dx * vx + dy * vy));
    const mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
    writeRectMeta(d, faceId, { x: mid.x - w / 2, y: mid.y - h / 2, w, h, rot });
    return d;
  }
  const pts = facePoints(d, faceId);
  if (pts.length < 3) return d;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const ow = maxX - minX;
  const oh = maxY - minY;
  if (ow < EPS || oh < EPS) return d;
  const x0 = Math.min(a.x, c.x);
  const y0 = Math.min(a.y, c.y);
  const x1 = Math.max(a.x, c.x);
  const y1 = Math.max(a.y, c.y);
  const nw = Math.max(EPS, x1 - x0);
  const nh = Math.max(EPS, y1 - y0);
  for (const id of faceVertexIds(d, faceId)) {
    const vt = d.vertices[id];
    if (!vt) continue;
    d.vertices[id] = {
      ...vt,
      x: x0 + ((vt.x - minX) / ow) * nw,
      y: y0 + ((vt.y - minY) / oh) * nh,
    };
  }
  f.rect = { x: x0, y: y0, w: nw, h: nh, rot: 0 };
  return d;
}

export function setCircleRadius(d0: CadDrawing, faceId: string, r: number): CadDrawing {
  const d = cloneDrawing(d0);
  const f = d.faces[faceId];
  if (!f?.circle || r <= EPS) return d;
  const { cx, cy, r: r0 } = f.circle;
  const s = r / (r0 || 1);
  for (const id of faceVertexIds(d, faceId)) {
    const vt = d.vertices[id];
    if (!vt) continue;
    d.vertices[id] = { ...vt, x: cx + (vt.x - cx) * s, y: cy + (vt.y - cy) * s };
  }
  f.circle = { cx, cy, r };
  return d;
}

export function setEllipseRadii(d0: CadDrawing, faceId: string, rx: number, ry: number): CadDrawing {
  const d = cloneDrawing(d0);
  const f = d.faces[faceId];
  if (!f) return d;
  const c = faceCentroid(d, faceId);
  const ell = f.ellipse ?? { cx: c.x, cy: c.y, rx: 1, ry: 1, rot: 0 };
  const nrx = Math.max(0.05, Math.abs(rx));
  const nry = Math.max(0.05, Math.abs(ry));
  const ids = faceVertexIds(d, faceId);
  const pts = ellipseWorldPts(ell.cx, ell.cy, nrx, nry, ell.rot ?? 0, Math.max(8, ids.length));
  ids.forEach((id, i) => {
    const vt = d.vertices[id];
    const p = pts[i];
    if (vt && p) d.vertices[id] = { ...vt, x: p.x, y: p.y };
  });
  f.ellipse = { ...ell, rx: nrx, ry: nry };
  return d;
}

/** Uniform scale of an ellipse about its center. Aspect ratio, center and rotation stay the same. */
export function scaleEllipse(d0: CadDrawing, faceId: string, k: number): CadDrawing {
  const f = d0.faces[faceId];
  if (!f?.ellipse || !(k > 0) || !Number.isFinite(k)) return d0;
  const { cx, cy } = f.ellipse;
  const next = setEllipseRadii(d0, faceId, f.ellipse.rx * k, f.ellipse.ry * k);
  const e = next.faces[faceId]?.ellipse;
  if (e) next.faces[faceId] = { ...next.faces[faceId]!, ellipse: { ...e, cx, cy } };
  return next;
}

export function scaleFaceAbout(d0: CadDrawing, faceId: string, k: number, origin?: Pt): CadDrawing {
  const d = cloneDrawing(d0);
  const f = d.faces[faceId];
  if (!f || !(k > 0) || !Number.isFinite(k)) return d;
  const c = origin ?? (f.circle ? { x: f.circle.cx, y: f.circle.cy } : f.ellipse ? { x: f.ellipse.cx, y: f.ellipse.cy } : faceCentroid(d, faceId));
  for (const id of faceVertexIds(d, faceId)) {
    const vt = d.vertices[id];
    if (!vt) continue;
    d.vertices[id] = { ...vt, x: c.x + (vt.x - c.x) * k, y: c.y + (vt.y - c.y) * k };
  }
  if (f.circle) f.circle = { ...f.circle, r: Math.abs(f.circle.r * k) };
  if (f.ellipse) f.ellipse = { ...f.ellipse, rx: Math.abs(f.ellipse.rx * k), ry: Math.abs(f.ellipse.ry * k) };
  if (f.rect) {
    f.rect = {
      ...f.rect,
      x: c.x + (f.rect.x - c.x) * k,
      y: c.y + (f.rect.y - c.y) * k,
      w: Math.abs(f.rect.w * k),
      h: Math.abs(f.rect.h * k),
    };
  }
  if (f.spline) {
    f.spline = {
      ...f.spline,
      pts: f.spline.pts.map((point) => ({
        x: c.x + (point.x - c.x) * k,
        y: c.y + (point.y - c.y) * k,
      })),
    };
  }
  if (f.freehand) {
    f.freehand = {
      ...f.freehand,
      pts: f.freehand.pts.map((point) => ({
        x: c.x + (point.x - c.x) * k,
        y: c.y + (point.y - c.y) * k,
      })),
    };
  }
  return d;
}

export function intersectFaces(d0: CadDrawing, aId: string, bId: string): CadDrawing {
  const d = cloneDrawing(d0);
  const A = facePoints(d, aId);
  const B = facePoints(d, bId);
  if (A.length < 3 || B.length < 3) return d;
  const clip = sutherlandHodgman(A, B);
  if (clip.length < 3) return d;
  const type = d.faces[aId]?.type ?? "lawn";
  return cleanupDrawing(addChain(d, clip, true, type));
}

function sutherlandHodgman(subject: Pt[], clip: Pt[]): Pt[] {
  const closed = clip[0] && clip[clip.length - 1] && dist(clip[0], clip[clip.length - 1]) < 1e-9 ? clip.slice(0, -1) : clip;
  let out = subject.slice();
  const n = closed.length;
  for (let i = 0; i < n; i++) {
    const a = closed[i]!;
    const b = closed[(i + 1) % n]!;
    const inp = out;
    out = [];
    if (!inp.length) break;
    let prev = inp[inp.length - 1]!;
    for (const cur of inp) {
      const cin = insideLeft(cur, a, b);
      const pin = insideLeft(prev, a, b);
      if (cin) {
        if (!pin) {
          const x = edgeHit(prev, cur, a, b);
          if (x) out.push(x);
        }
        out.push(cur);
      } else if (pin) {
        const x = edgeHit(prev, cur, a, b);
        if (x) out.push(x);
      }
      prev = cur;
    }
  }
  return out;
}

function insideLeft(p: Pt, a: Pt, b: Pt) {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) <= 0;
}

function edgeHit(p: Pt, q: Pt, a: Pt, b: Pt): Pt | null {
  const rx = q.x - p.x;
  const ry = q.y - p.y;
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den;
  return { x: p.x + t * rx, y: p.y + t * ry };
}

export function selfIntersects(pts: Pt[]): boolean {
  const n = pts.length;
  if (n < 4) return false;
  const segs = n;
  for (let i = 0; i < segs; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    for (let j = i + 2; j < segs; j++) {
      if (i === 0 && j === segs - 1) continue;
      const c = pts[j]!;
      const d = pts[(j + 1) % n]!;
      if (segIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

export function offsetPoints(pts: Pt[], distM: number): Pt[] {
  if (pts.length < 2) return pts.slice();
  const closed = dist(pts[0]!, pts[pts.length - 1]!) < 1e-8;
  const n = closed ? pts.length - 1 : pts.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]!;
    const cur = pts[i]!;
    const next = pts[(i + 1) % n]!;
    const a = closed || i > 0 ? { x: cur.x - prev.x, y: cur.y - prev.y } : { x: next.x - cur.x, y: next.y - cur.y };
    const b = closed || i < n - 1 ? { x: next.x - cur.x, y: next.y - cur.y } : { x: cur.x - prev.x, y: cur.y - prev.y };
    const na = norm({ x: -a.y, y: a.x });
    const nb = norm({ x: -b.y, y: b.x });
    const nx = na.x + nb.x;
    const ny = na.y + nb.y;
    const l = Math.hypot(nx, ny) || 1;
    out.push({ x: cur.x + (nx / l) * distM, y: cur.y + (ny / l) * distM });
  }
  if (closed) out.push(out[0]!);
  return out;
}

export function pathFromCenterline(d0: CadDrawing, pts: Pt[], width: number, type: RegionType): CadDrawing {
  if (pts.length < 2 || width <= 0) return d0;
  const left = offsetPoints(pts, width / 2);
  const right = offsetPoints(pts, -width / 2);
  if (left.length < 2 || right.length < 2) return d0;
  const contour = [...left, ...right.slice().reverse()];
  return addChain(d0, contour, true, type);
}

export function offsetChain(d: CadDrawing, pts: Pt[], distM: number, type: RegionType): CadDrawing {
  if (pts.length < 2) return d;
  return addChain(d, offsetPoints(pts, distM), dist(pts[0]!, pts[pts.length - 1]!) < 1e-8, type);
}

function norm(p: Pt): Pt {
  const l = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / l, y: p.y / l };
}

export function filletVertex(d0: CadDrawing, vertexId: string, radius: number): CadDrawing {
  const d = cloneDrawing(d0);
  const halves = outgoing(d, vertexId);
  if (halves.length < 2 || radius <= 0) return d;
  const h1 = halves[0]!;
  const h2 = halves[1]!;
  const p0 = vertPt(v(d, vertexId));
  const p1 = vertPt(v(d, endOf(d, h1)));
  const p2 = vertPt(v(d, endOf(d, h2)));
  const d1 = dist(p0, p1);
  const d2 = dist(p0, p2);
  const t = Math.min(radius, d1 * 0.45, d2 * 0.45);
  if (t < 1e-6) return d;
  const a = { x: p0.x + ((p1.x - p0.x) / d1) * t, y: p0.y + ((p1.y - p0.y) / d1) * t };
  const b = { x: p0.x + ((p2.x - p0.x) / d2) * t, y: p0.y + ((p2.y - p0.y) / d2) * t };
  splitEdgeAt(d, h1.e, a);
  splitEdgeAt(d, h2.e, b);
  const va = ensureVertex(d, a);
  const vb = ensureVertex(d, b);
  const bulge = bulgeFromPoints(a, b, p0);
  addRawEdge(d, va, vb, bulge);
  const cornerEdges = Object.values(d.edges).filter((ed) => ed.a === vertexId || ed.b === vertexId);
  for (const ed of cornerEdges) {
    if (dist(vertPt(v(d, ed.a)), p0) < 1e-8 && dist(vertPt(v(d, ed.b)), p0) < t * 1.05) {
      /* keep split remnants */
    }
  }
  rebuildFaces(d, "lawn");
  return d;
}

export function filletFace(d0: CadDrawing, faceId: string, radius: number): CadDrawing {
  let d = d0;
  const ids = faceVertexIds(d, faceId);
  for (const id of ids) {
    if (d.vertices[id]) d = filletVertex(d, id, radius);
  }
  return d;
}

export function chamferFace(d0: CadDrawing, faceId: string, distM: number): CadDrawing {
  let d = d0;
  const ids = faceVertexIds(d, faceId);
  for (const id of ids) {
    if (d.vertices[id]) d = chamferVertex(d, id, distM);
  }
  return d;
}

export function mirrorCopyFace(d0: CadDrawing, faceId: string, axis: "h" | "v"): { drawing: CadDrawing; id: string } {
  const copied = duplicateFace(d0, faceId, 0, 0);
  return { drawing: mirrorFace(copied.drawing, copied.id, axis), id: copied.id };
}

export function chamferVertex(d0: CadDrawing, vertexId: string, distM: number): CadDrawing {
  const d = cloneDrawing(d0);
  const halves = outgoing(d, vertexId);
  if (halves.length < 2 || distM <= 0) return d;
  const h1 = halves[0]!;
  const h2 = halves[1]!;
  const p0 = vertPt(v(d, vertexId));
  const p1 = vertPt(v(d, endOf(d, h1)));
  const p2 = vertPt(v(d, endOf(d, h2)));
  const d1 = dist(p0, p1);
  const d2 = dist(p0, p2);
  const t = Math.min(distM, d1 * 0.45, d2 * 0.45);
  if (t < 1e-6) return d;
  const a = { x: p0.x + ((p1.x - p0.x) / d1) * t, y: p0.y + ((p1.y - p0.y) / d1) * t };
  const b = { x: p0.x + ((p2.x - p0.x) / d2) * t, y: p0.y + ((p2.y - p0.y) / d2) * t };
  splitEdgeAt(d, h1.e, a);
  splitEdgeAt(d, h2.e, b);
  addRawEdge(d, ensureVertex(d, a), ensureVertex(d, b), 0);
  rebuildFaces(d, "lawn");
  return d;
}

export function mirrorFace(d0: CadDrawing, faceId: string, axis: "h" | "v"): CadDrawing {
  const d = cloneDrawing(d0);
  const f = d.faces[faceId];
  if (!f) return d;
  const c = faceCentroid(d, faceId);
  for (const id of faceVertexIds(d, faceId)) {
    const vt = d.vertices[id];
    if (!vt) continue;
    d.vertices[id] =
      axis === "v"
        ? { ...vt, x: 2 * c.x - vt.x }
        : { ...vt, y: 2 * c.y - vt.y };
  }
  if (f.circle) {
    f.circle = axis === "v" ? { ...f.circle, cx: 2 * c.x - f.circle.cx } : { ...f.circle, cy: 2 * c.y - f.circle.cy };
  }
  const ids = new Set(faceVertexIds(d, faceId));
  for (const ed of Object.values(d.edges)) {
    if (ids.has(ed.a) && ids.has(ed.b)) ed.bulge = -ed.bulge;
  }
  return d;
}

export function addDim(d0: CadDrawing, a: Pt, b: Pt, offset = 0.45): CadDrawing {
  const d = cloneDrawing(d0);
  d.dims = { ...(d.dims ?? {}) };
  const id = nid("dim");
  const aId = findVertexAt(d, a, 0.18);
  const bId = findVertexAt(d, b, 0.18);
  d.dims[id] = { id, a: { ...a }, b: { ...b }, offset, aId: aId ?? undefined, bId: bId ?? undefined };
  return d;
}

export function resolveDim(d: CadDrawing, dim: CadDim): { a: Pt; b: Pt } {
  const a = dim.aId && d.vertices[dim.aId] ? { x: d.vertices[dim.aId]!.x, y: d.vertices[dim.aId]!.y } : dim.a;
  const b = dim.bId && d.vertices[dim.bId] ? { x: d.vertices[dim.bId]!.x, y: d.vertices[dim.bId]!.y } : dim.b;
  return { a, b };
}

export function alignEdge(d0: CadDrawing, edgeId: string, targetDeg: number, faceId?: string | null): CadDrawing {
  const ed = d0.edges[edgeId];
  if (!ed) return d0;
  const A = d0.vertices[ed.a];
  const B = d0.vertices[ed.b];
  if (!A || !B) return d0;
  const ang = (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI;
  const fid = faceId && d0.faces[faceId] ? faceId : ed.faceL ?? ed.faceR;
  if (!fid) return d0;
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  return rotateFace(d0, fid, targetDeg - ang, mid);
}

export function alignEdgeHorizontal(d0: CadDrawing, edgeId: string, faceId?: string | null): CadDrawing {
  return alignEdge(d0, edgeId, 0, faceId);
}

export function deleteDim(d0: CadDrawing, id: string): CadDrawing {
  const d = cloneDrawing(d0);
  if (d.dims) delete d.dims[id];
  return d;
}

export function setFaceHidden(d0: CadDrawing, faceId: string, hidden: boolean): CadDrawing {
  const d = cloneDrawing(d0);
  if (d.faces[faceId]) d.faces[faceId] = { ...d.faces[faceId]!, hidden };
  return d;
}

const CONTOUR_SLACK = 0.12;

export function distToLoop(p: Pt, pts: Pt[]): number {
  if (pts.length < 2) return Infinity;
  let m = Infinity;
  const n = pts.length;
  const closed = n >= 3;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    m = Math.min(m, dist(p, closestOnSegment(p, a, b)));
  }
  return m;
}

export function headInsideFace(d: CadDrawing, faceId: string, p: Pt): boolean {
  const f = d.faces[faceId];
  if (!f) return false;
  if (f.circle) return dist(p, { x: f.circle.cx, y: f.circle.cy }) <= f.circle.r + CONTOUR_SLACK;
  const pts = f.rect ? rectWorldCorners(f.rect) : facePoints(d, faceId);
  if (pts.length < 3) return false;
  return pointInPoly(p, pts) || distToLoop(p, pts) <= CONTOUR_SLACK;
}

export function headsOnFaces(heads: Head[], d: CadDrawing, faceIds: string[]): Set<string> {
  const hit = new Set<string>();
  for (const h of heads) {
    for (const id of faceIds) {
      if (headInsideFace(d, id, h)) {
        hit.add(h.id);
        break;
      }
    }
  }
  return hit;
}

export function setFaceLocked(d0: CadDrawing, faceId: string, locked: boolean): CadDrawing {
  const d = cloneDrawing(d0);
  if (d.faces[faceId]) d.faces[faceId] = { ...d.faces[faceId]!, locked };
  return d;
}

export function scaleFace(d0: CadDrawing, faceId: string, factor: number, origin?: Pt): CadDrawing {
  return scaleFaceAxis(d0, faceId, factor, factor, origin);
}

export function scaleFaceAxis(d0: CadDrawing, faceId: string, sx: number, sy: number, origin?: Pt): CadDrawing {
  const d = cloneDrawing(d0);
  const f = d.faces[faceId];
  if (!f || !Number.isFinite(sx) || !Number.isFinite(sy)) return d;
  const o = origin ?? faceCentroid(d, faceId);
  for (const id of faceVertexIds(d, faceId)) {
    const vt = d.vertices[id];
    if (!vt) continue;
    d.vertices[id] = { ...vt, x: o.x + (vt.x - o.x) * sx, y: o.y + (vt.y - o.y) * sy };
  }
  if (f.circle) {
    f.circle = {
      ...f.circle,
      r: f.circle.r * ((Math.abs(sx) + Math.abs(sy)) / 2),
      cx: o.x + (f.circle.cx - o.x) * sx,
      cy: o.y + (f.circle.cy - o.y) * sy,
    };
  }
  if (f.rect) f.rect = { ...f.rect, w: f.rect.w * sx, h: f.rect.h * sy };
  return d;
}

export function addText(d0: CadDrawing, p: Pt, text: string, size = 0.35): CadDrawing {
  const d = cloneDrawing(d0);
  d.texts = { ...(d.texts ?? {}) };
  const id = nid("t");
  d.texts[id] = { id, x: p.x, y: p.y, text, size };
  return d;
}

export function deleteText(d0: CadDrawing, id: string): CadDrawing {
  const d = cloneDrawing(d0);
  if (d.texts) delete d.texts[id];
  return d;
}

export function trimEdge(d0: CadDrawing, edgeId: string, p: Pt): CadDrawing {
  const d = cloneDrawing(d0);
  const ed = d.edges[edgeId];
  if (!ed) return d;
  const A = vertPt(v(d, ed.a));
  const B = vertPt(v(d, ed.b));
  const hits: { t: number; pt: Pt }[] = [{ t: 0, pt: A }, { t: 1, pt: B }];
  for (const other of Object.values(d.edges)) {
    if (other.id === edgeId) continue;
    const C = d.vertices[other.a];
    const D = d.vertices[other.b];
    if (!C || !D) continue;
    const hit = segIntersect(A, B, C, D);
    if (!hit) continue;
    if (hit.t > 0.02 && hit.t < 0.98) hits.push({ t: hit.t, pt: hit.pt });
  }
  hits.sort((a, b) => a.t - b.t);
  const pt = projectT(p, A, B);
  let i = 0;
  while (i < hits.length - 1 && !(pt.t >= hits[i]!.t && pt.t <= hits[i + 1]!.t)) i += 1;
  const a = hits[i];
  const b = hits[i + 1];
  if (!a || !b) return d;
  if (a.t <= 1e-6 && b.t >= 1 - 1e-6) return d;
  if (a.t > 1e-6) splitEdgeAt(d, edgeId, a.pt);
  const remaining = Object.values(d.edges).find((e) => {
    const pA = d.vertices[e.a];
    const pB = d.vertices[e.b];
    if (!pA || !pB) return false;
    const tA = projectT(pA, A, B).t;
    const tB = projectT(pB, A, B).t;
    return Math.min(tA, tB) >= a.t - 1e-4 && Math.max(tA, tB) <= b.t + 1e-4;
  });
  if (remaining && isInternalEdge(d, remaining.id) === false) {
    delete d.edges[remaining.id];
    rebuildFaces(d, "lawn");
  } else if (remaining) {
    delete d.edges[remaining.id];
    rebuildFaces(d, "lawn");
  }
  return d;
}

export function extendEdge(d0: CadDrawing, edgeId: string, p: Pt): CadDrawing {
  const d = cloneDrawing(d0);
  const ed = d.edges[edgeId];
  if (!ed) return d;
  const A = vertPt(v(d, ed.a));
  const B = vertPt(v(d, ed.b));
  const useB = dist(p, B) <= dist(p, A);
  const o = useB ? A : B;
  const end = useB ? B : A;
  const dir = { x: end.x - o.x, y: end.y - o.y };
  const len = Math.hypot(dir.x, dir.y) || 1;
  dir.x /= len;
  dir.y /= len;
  let bestT = Infinity;
  let best: Pt | null = null;
  for (const other of Object.values(d.edges)) {
    if (other.id === edgeId) continue;
    const C = d.vertices[other.a];
    const Dpt = d.vertices[other.b];
    if (!C || !Dpt) continue;
    const hit = raySeg(end, dir, C, Dpt);
    if (hit && hit.t > 0.02 && hit.t < bestT) {
      bestT = hit.t;
      best = hit.pt;
    }
  }
  if (!best) return d;
  const vid = useB ? ed.b : ed.a;
  d.vertices[vid] = { ...d.vertices[vid]!, x: best.x, y: best.y };
  return d;
}

function raySeg(o: Pt, dir: Pt, c: Pt, d: Pt): { t: number; pt: Pt } | null {
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = dir.x * sy - dir.y * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - o.x) * sy - (c.y - o.y) * sx) / den;
  const u = ((c.x - o.x) * dir.y - (c.y - o.y) * dir.x) / den;
  if (t <= 1e-6 || u < -0.02 || u > 1.02) return null;
  return { t, pt: { x: o.x + dir.x * t, y: o.y + dir.y * t } };
}

export function pickDimAt(d: CadDrawing, p: Pt, tol: number): string | null {
  let best: string | null = null;
  let bestD = tol;
  for (const dim of Object.values(d.dims ?? {})) {
    const dd = projectT(p, dim.a, dim.b).d;
    if (dd < bestD) {
      bestD = dd;
      best = dim.id;
    }
  }
  return best;
}

export function joinCollinear(d0: CadDrawing, faceId?: string): CadDrawing {
  const d = cloneDrawing(d0);
  const verts = faceId ? faceVertexIds(d, faceId) : Object.keys(d.vertices);
  for (const vid of verts) {
    const halves = outgoing(d, vid);
    if (halves.length !== 2) continue;
    const h1 = halves[0]!;
    const h2 = halves[1]!;
    const e1 = d.edges[h1.e];
    const e2 = d.edges[h2.e];
    if (!e1 || !e2 || Math.abs(e1.bulge) > 1e-8 || Math.abs(e2.bulge) > 1e-8) continue;
    const p0 = vertPt(v(d, vid));
    const p1 = vertPt(v(d, endOf(d, h1)));
    const p2 = vertPt(v(d, endOf(d, h2)));
    const a1 = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const a2 = Math.atan2(p2.y - p0.y, p2.x - p0.x);
    let diff = Math.abs(Math.abs(a1 - a2) - Math.PI);
    if (diff > 0.03) continue;
    const a = e1.a === vid ? e1.b : e1.a;
    const b = e2.a === vid ? e2.b : e2.a;
    delete d.edges[e1.id];
    delete d.edges[e2.id];
    addRawEdge(d, a, b, 0);
    delete d.vertices[vid];
  }
  rebuildFaces(d, "lawn");
  return d;
}

export function setDimOffset(d0: CadDrawing, id: string, offset: number): CadDrawing {
  const d = cloneDrawing(d0);
  if (d.dims?.[id]) d.dims[id] = { ...d.dims[id]!, offset };
  return d;
}

export function moveText(d0: CadDrawing, id: string, p: Pt): CadDrawing {
  const d = cloneDrawing(d0);
  if (d.texts?.[id]) d.texts[id] = { ...d.texts[id]!, x: p.x, y: p.y };
  return d;
}

export function pickTextAt(d: CadDrawing, p: Pt, tol: number): string | null {
  let best: string | null = null;
  let bestD = tol;
  for (const t of Object.values(d.texts ?? {})) {
    const dd = dist(p, t);
    if (dd < bestD) {
      bestD = dd;
      best = t.id;
    }
  }
  return best;
}

export function smartFill(d0: CadDrawing, p: Pt, type: RegionType): CadDrawing {
  const d = cloneDrawing(d0);
  rebuildFaces(d, type);
  for (const f of Object.values(d.faces)) {
    if (pointInPoly(p, facePoints(d, f.id))) {
      f.type = type;
      return d;
    }
  }
  return d;
}

export function divideEdge(d0: CadDrawing, edgeId: string, n: number): CadDrawing {
  const d = cloneDrawing(d0);
  const ed = d.edges[edgeId];
  if (!ed) return d;
  const count = Math.max(2, Math.min(32, Math.round(n)));
  const A = vertPt(v(d, ed.a));
  const B = vertPt(v(d, ed.b));
  const pts: Pt[] = [];
  for (let i = 1; i < count; i++) {
    const t = i / count;
    pts.push({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t });
  }
  for (const p of pts) {
    const hit = pickEdgeAt(d, p, 1e-4) ?? edgeId;
    splitEdgeAt(d, hit, p);
  }
  return d;
}

export function lengthenEdge(d0: CadDrawing, edgeId: string, extra: number): CadDrawing {
  const d = cloneDrawing(d0);
  const ed = d.edges[edgeId];
  if (!ed || !Number.isFinite(extra) || extra === 0) return d;
  const A = d.vertices[ed.a]!;
  const B = d.vertices[ed.b]!;
  const len = dist(A, B) || 1;
  const ux = (B.x - A.x) / len;
  const uy = (B.y - A.y) / len;
  if (extra > 0) d.vertices[ed.b] = { ...B, x: B.x + ux * extra, y: B.y + uy * extra };
  else d.vertices[ed.a] = { ...A, x: A.x + ux * extra, y: A.y + uy * extra };
  return d;
}

export function unionFaces(d0: CadDrawing, aId: string, bId: string): CadDrawing {
  const d = cloneDrawing(d0);
  if (!d.faces[aId] || !d.faces[bId] || aId === bId) return d;
  const shared = Object.values(d.edges).filter(
    (ed) => (ed.faceL === aId && ed.faceR === bId) || (ed.faceL === bId && ed.faceR === aId),
  );
  if (!shared.length) return d;
  const keep = d.faces[aId]!.type;
  for (const ed of shared) delete d.edges[ed.id];
  rebuildFaces(d, keep);
  return cleanupDrawing(d);
}

export type FaceBoundaryHit = {
  faceId: string;
  pt: Pt;
  distance: number;
};

export type OpenSplineEndpointHit = FaceBoundaryHit & {
  endpoint: "start" | "end";
  opposite: Pt;
};

/** Closest editable endpoint of a visible open spline. */
export function nearestOpenSplineEndpoint(
  drawing: CadDrawing,
  point: Pt,
  tolerance: number,
): OpenSplineEndpointHit | null {
  let best: OpenSplineEndpointHit | null = null;
  for (const face of Object.values(drawing.faces)) {
    if (face.hidden || face.locked || !face.spline || face.spline.closed) continue;
    const layer = drawing.layers?.[layerForType(face.type)];
    if (layer?.visible === false || layer?.locked) continue;
    const points = face.spline.pts;
    if (points.length < 2) continue;
    const start = points[0]!;
    const end = points[points.length - 1]!;
    const candidates = [
      { endpoint: "end" as const, pt: end, opposite: start },
      { endpoint: "start" as const, pt: start, opposite: end },
    ];
    for (const candidate of candidates) {
      const distance = dist(point, candidate.pt);
      if (distance > tolerance || (best && distance >= best.distance)) continue;
      best = {
        faceId: face.id,
        endpoint: candidate.endpoint,
        pt: { ...candidate.pt },
        opposite: { ...candidate.opposite },
        distance,
      };
    }
  }
  return best;
}

/** Closest visible figure boundary, including exact circles. */
export function nearestFaceBoundary(
  drawing: CadDrawing,
  point: Pt,
  tolerance: number,
): FaceBoundaryHit | null {
  let best: FaceBoundaryHit | null = null;
  for (const face of Object.values(drawing.faces)) {
    if (face.hidden) continue;
    const layer = drawing.layers?.[layerForType(face.type)];
    if (layer?.visible === false) continue;
    const points = facePoints(drawing, face.id);
    if (points.length < 2) continue;
    const closed = !(
      (face.spline && !face.spline.closed) ||
      (face.freehand && !face.freehand.closed)
    );
    const segmentCount = closed ? points.length : points.length - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const a = points[index]!;
      const b = points[(index + 1) % points.length]!;
      const projected = projectT(point, a, b);
      if (projected.d > tolerance || (best && projected.d >= best.distance)) continue;
      best = { faceId: face.id, pt: projected.pt, distance: projected.d };
    }
  }
  return best;
}

/**
 * Simplify and softly round a finger/mouse stroke. Open strokes retain their
 * exact endpoints so they can still land on an existing figure boundary.
 */
export function smoothFreehandPoints(
  raw: Pt[],
  tolerance = 0.03,
  closed = false,
): Pt[] {
  const cleaned: Pt[] = [];
  for (const point of raw) {
    const previous = cleaned[cleaned.length - 1];
    if (!previous || dist(previous, point) > Math.max(1e-6, tolerance * 0.15)) {
      cleaned.push({ x: point.x, y: point.y });
    }
  }
  if (
    closed &&
    cleaned.length > 2 &&
    dist(cleaned[0]!, cleaned[cleaned.length - 1]!) <= Math.max(tolerance * 3, 1e-5)
  ) {
    cleaned.pop();
  }
  if (cleaned.length < 2) return cleaned;
  let points = rdp(cleaned, Math.max(1e-5, tolerance));
  if (closed && points.length < 3) points = cleaned.slice(0, 3);
  for (let iteration = 0; iteration < 2; iteration += 1) {
    if (points.length < (closed ? 3 : 2)) break;
    const rounded: Pt[] = [];
    if (!closed) rounded.push({ ...points[0]! });
    const segmentCount = closed ? points.length : points.length - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const a = points[index]!;
      const b = points[(index + 1) % points.length]!;
      rounded.push(
        { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 },
        { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 },
      );
    }
    if (!closed) rounded.push({ ...points[points.length - 1]! });
    points = rounded;
  }
  return points;
}

export type FreehandStrokeResult = {
  drawing: CadDrawing;
  faceId: string | null;
  closed: boolean;
  attached: boolean;
};

function materializeFreehandTarget(d0: CadDrawing, faceId: string): CadDrawing {
  const current = d0.faces[faceId];
  if (!current || current.outer.length) return cloneDrawing(d0);
  const points = facePoints(d0, faceId);
  if (points.length < 3) return cloneDrawing(d0);
  const drawing = cloneDrawing(d0);
  const face = drawing.faces[faceId]!;
  const vertexIds = points.map((point) => {
    const id = nid("v");
    drawing.vertices[id] = { id, x: point.x, y: point.y };
    return id;
  });
  const halves: Half[] = [];
  for (let index = 0; index < vertexIds.length; index += 1) {
    const id = nid("e");
    drawing.edges[id] = {
      id,
      a: vertexIds[index]!,
      b: vertexIds[(index + 1) % vertexIds.length]!,
      bulge: 0,
      faceL: null,
      faceR: null,
    };
    halves.push({ e: id, dir: 1 });
  }
  face.outer = shoelace(points) < 0
    ? halves.map((half) => ({ e: half.e, dir: -1 as const })).reverse()
    : halves;
  face.holes = [];
  face.circle = undefined;
  face.ellipse = undefined;
  face.rect = undefined;
  face.spline = undefined;
  face.freehand = undefined;
  face.pointShape = undefined;
  assignLoopFaces(drawing, face.outer, faceId);
  return drawing;
}

function faceInteriorSample(drawing: CadDrawing, faceId: string): Pt {
  const points = facePoints(drawing, faceId);
  const center = faceCentroid(drawing, faceId);
  if (points.length < 3 || pointInPoly(center, points)) return center;
  const average = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
  if (pointInPoly(average, points)) return average;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    const sample = {
      x: (a.x + b.x) * 0.49 + average.x * 0.02,
      y: (a.y + b.y) * 0.49 + average.y * 0.02,
    };
    if (pointInPoly(sample, points)) return sample;
  }
  return points[0]!;
}

function pointNearPolyline(point: Pt, points: Pt[], tolerance: number): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (projectT(point, points[index]!, points[index + 1]!).d <= tolerance) return true;
  }
  return false;
}

function isClosedBoundaryFace(face: CadFace): boolean {
  return Boolean(
    face.outer.length ||
      face.circle ||
      face.ellipse ||
      face.spline?.closed ||
      face.freehand?.closed,
  );
}

function pointInFaceBoundary(drawing: CadDrawing, faceId: string, point: Pt): boolean {
  const face = drawing.faces[faceId];
  if (!face || !isClosedBoundaryFace(face)) return false;
  const outer = facePoints(drawing, faceId);
  if (outer.length < 3 || !pointInPoly(point, outer)) return false;
  return !faceHoles(drawing, faceId).some((hole) => pointInPoly(point, hole));
}

function nearestClosedFaceBoundary(
  drawing: CadDrawing,
  point: Pt,
  tolerance: number,
): FaceBoundaryHit | null {
  let best: FaceBoundaryHit | null = null;
  for (const face of Object.values(drawing.faces)) {
    if (face.hidden || !isClosedBoundaryFace(face)) continue;
    const layer = drawing.layers?.[layerForType(face.type)];
    if (layer?.visible === false) continue;
    const boundary = facePoints(drawing, face.id);
    for (let index = 0; index < boundary.length; index += 1) {
      const projected = projectT(point, boundary[index]!, boundary[(index + 1) % boundary.length]!);
      if (projected.d > tolerance || (best && projected.d >= best.distance)) continue;
      best = { faceId: face.id, pt: projected.pt, distance: projected.d };
    }
  }
  return best;
}

type StrokeBoundaryContact = { position: number; pt: Pt };

function faceStrokeContacts(
  drawing: CadDrawing,
  faceId: string,
  points: Pt[],
  tolerance: number,
): StrokeBoundaryContact[] {
  const boundary = facePoints(drawing, faceId);
  if (points.length < 2 || boundary.length < 3) return [];
  const contacts: StrokeBoundaryContact[] = [];
  const add = (contact: StrokeBoundaryContact) => {
    if (
      contacts.some(
        (current) =>
          Math.abs(current.position - contact.position) < 1e-5 &&
          dist(current.pt, contact.pt) < Math.max(1e-5, tolerance * 0.1),
      )
    ) return;
    contacts.push(contact);
  };

  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
    let best: { pt: Pt; distance: number } | null = null;
    for (let edgeIndex = 0; edgeIndex < boundary.length; edgeIndex += 1) {
      const projected = projectT(
        points[pointIndex]!,
        boundary[edgeIndex]!,
        boundary[(edgeIndex + 1) % boundary.length]!,
      );
      if (projected.d <= tolerance && (!best || projected.d < best.distance)) {
        best = { pt: projected.pt, distance: projected.d };
      }
    }
    if (best) add({ position: pointIndex, pt: best.pt });
  }

  for (let strokeIndex = 0; strokeIndex < points.length - 1; strokeIndex += 1) {
    for (let edgeIndex = 0; edgeIndex < boundary.length; edgeIndex += 1) {
      const crossing = segIntersect(
        points[strokeIndex]!,
        points[strokeIndex + 1]!,
        boundary[edgeIndex]!,
        boundary[(edgeIndex + 1) % boundary.length]!,
      );
      if (crossing) add({ position: strokeIndex + crossing.t, pt: crossing.pt });
    }
  }

  return contacts.sort((a, b) => a.position - b.position);
}

function pathBetweenContacts(
  points: Pt[],
  start: StrokeBoundaryContact,
  end: StrokeBoundaryContact,
): Pt[] {
  if (end.position <= start.position + 1e-6) return [];
  const result: Pt[] = [{ ...start.pt }];
  for (let index = 0; index < points.length; index += 1) {
    if (index > start.position + 1e-6 && index < end.position - 1e-6) {
      result.push({ ...points[index]! });
    }
  }
  if (dist(result[result.length - 1]!, end.pt) > 1e-7) result.push({ ...end.pt });
  return result;
}

function removeStandaloneFaces(drawing: CadDrawing, faceIds: Set<string>): CadDrawing {
  if (!faceIds.size) return cloneDrawing(drawing);
  const next = cloneDrawing(drawing);
  for (const faceId of faceIds) delete next.faces[faceId];
  return next;
}

/** Join newly drawn pencil input to the endpoints of earlier open pencil strokes. */
function collectConnectedFreehandStroke(
  drawing: CadDrawing,
  raw: Pt[],
  tolerance: number,
): { drawing: CadDrawing; points: Pt[] } {
  let points = raw.map((point) => ({ ...point }));
  const consumed = new Set<string>();

  while (points.length >= 2) {
    let best:
      | {
          faceId: string;
          distance: number;
          side: "prepend" | "append";
          reverse: boolean;
        }
      | null = null;
    const chainStart = points[0]!;
    const chainEnd = points[points.length - 1]!;

    for (const face of Object.values(drawing.faces)) {
      if (
        consumed.has(face.id) ||
        face.hidden ||
        face.locked ||
        !face.freehand ||
        face.freehand.closed ||
        face.freehand.pts.length < 2
      ) continue;
      const faceStart = face.freehand.pts[0]!;
      const faceEnd = face.freehand.pts[face.freehand.pts.length - 1]!;
      const candidates = [
        { distance: dist(faceEnd, chainStart), side: "prepend" as const, reverse: false },
        { distance: dist(faceStart, chainStart), side: "prepend" as const, reverse: true },
        { distance: dist(chainEnd, faceStart), side: "append" as const, reverse: false },
        { distance: dist(chainEnd, faceEnd), side: "append" as const, reverse: true },
      ];
      for (const candidate of candidates) {
        if (candidate.distance > tolerance || (best && candidate.distance >= best.distance)) continue;
        best = { faceId: face.id, ...candidate };
      }
    }

    if (!best) break;
    const stored = drawing.faces[best.faceId]!.freehand!.pts.map((point) => ({ ...point }));
    const oriented = best.reverse ? stored.reverse() : stored;
    if (best.side === "prepend") {
      const join = {
        x: (oriented[oriented.length - 1]!.x + points[0]!.x) / 2,
        y: (oriented[oriented.length - 1]!.y + points[0]!.y) / 2,
      };
      oriented[oriented.length - 1] = join;
      points[0] = join;
      points = [...oriented, ...points.slice(1)];
    } else {
      const join = {
        x: (points[points.length - 1]!.x + oriented[0]!.x) / 2,
        y: (points[points.length - 1]!.y + oriented[0]!.y) / 2,
      };
      points[points.length - 1] = join;
      oriented[0] = join;
      points = [...points, ...oriented.slice(1)];
    }
    consumed.add(best.faceId);
  }

  return { drawing: removeStandaloneFaces(drawing, consumed), points };
}

function findFreehandAttachment(
  drawing: CadDrawing,
  points: Pt[],
  tolerance: number,
): { faceId: string; points: Pt[] } | null {
  if (points.length < 2) return null;
  const start = points[0]!;
  const startHit = nearestClosedFaceBoundary(drawing, start, tolerance);
  const endHit = nearestClosedFaceBoundary(drawing, points[points.length - 1]!, tolerance);
  const orderedFaces = Object.values(drawing.faces)
    .filter((face) => !face.hidden && isClosedBoundaryFace(face))
    .sort((a, b) => {
      const priority = (face: CadFace) => {
        if (startHit?.faceId === face.id && endHit?.faceId === face.id) return 0;
        if (startHit?.faceId === face.id) return 1;
        if (pointInFaceBoundary(drawing, face.id, start)) return 2;
        return 3;
      };
      return priority(a) - priority(b) || faceArea(drawing, a.id) - faceArea(drawing, b.id);
    });

  for (const face of orderedFaces) {
    const startsOnOrInside =
      startHit?.faceId === face.id || pointInFaceBoundary(drawing, face.id, start);
    if (!startsOnOrInside) continue;
    const contacts = faceStrokeContacts(drawing, face.id, points, tolerance);
    if (contacts.length < 2) continue;
    const section = pathBetweenContacts(points, contacts[0]!, contacts[contacts.length - 1]!);
    if (section.length < 2) continue;
    const leavesFigure = section.some((point, index) => {
      if (index === 0 || index === section.length - 1) return false;
      return !pointInFaceBoundary(drawing, face.id, point);
    });
    if (!leavesFigure) continue;
    return { faceId: face.id, points: section };
  }
  return null;
}

function nearestFreehandContact(
  drawing: CadDrawing,
  points: Pt[],
  tolerance: number,
): FaceBoundaryHit | null {
  let best: FaceBoundaryHit | null = null;
  for (const point of points) {
    const hit = nearestFaceBoundary(drawing, point, tolerance);
    if (hit && (!best || hit.distance < best.distance)) best = hit;
  }
  if (best?.distance === 0 || points.length < 2) return best;

  for (const face of Object.values(drawing.faces)) {
    if (face.hidden || !isClosedBoundaryFace(face)) continue;
    const layer = drawing.layers?.[layerForType(face.type)];
    if (layer?.visible === false) continue;
    const boundary = facePoints(drawing, face.id);
    if (boundary.length < 2) continue;
    for (let strokeIndex = 0; strokeIndex < points.length - 1; strokeIndex += 1) {
      const strokeA = points[strokeIndex]!;
      const strokeB = points[strokeIndex + 1]!;
      for (let edgeIndex = 0; edgeIndex < boundary.length; edgeIndex += 1) {
        const edgeA = boundary[edgeIndex]!;
        const edgeB = boundary[(edgeIndex + 1) % boundary.length]!;
        const crossing = segIntersect(strokeA, strokeB, edgeA, edgeB);
        if (crossing) return { faceId: face.id, pt: crossing.pt, distance: 0 };
        for (const edgePoint of [edgeA, edgeB]) {
          const projected = projectT(edgePoint, strokeA, strokeB);
          if (projected.d <= tolerance && (!best || projected.d < best.distance)) {
            best = { faceId: face.id, pt: { ...edgePoint }, distance: projected.d };
          }
        }
      }
    }
  }
  return best;
}

function insertClosedContact(points: Pt[], contact: Pt, tolerance: number): Pt[] {
  let edgeIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const projected = projectT(contact, points[index]!, points[(index + 1) % points.length]!);
    if (projected.d < bestDistance) {
      bestDistance = projected.d;
      edgeIndex = index;
    }
  }
  const nextIndex = (edgeIndex + 1) % points.length;
  if (dist(points[edgeIndex]!, contact) <= tolerance) {
    return points.map((point, index) => (index === edgeIndex ? { ...contact } : point));
  }
  if (dist(points[nextIndex]!, contact) <= tolerance) {
    return points.map((point, index) => (index === nextIndex ? { ...contact } : point));
  }
  return [...points.slice(0, edgeIndex + 1), { ...contact }, ...points.slice(edgeIndex + 1)];
}

function mergeFreehandCells(
  d0: CadDrawing,
  included: Set<string>,
  type: RegionType,
  seed: Pt,
  source: CadFace,
  curvedPath: Pt[],
  curvedTolerance: number,
): { drawing: CadDrawing; faceId: string | null; merged: boolean } {
  const drawing = cloneDrawing(d0);
  let removed = 0;
  for (const edge of Object.values(drawing.edges)) {
    if (
      edge.faceL &&
      edge.faceR &&
      edge.faceL !== edge.faceR &&
      included.has(edge.faceL) &&
      included.has(edge.faceR)
    ) {
      delete drawing.edges[edge.id];
      removed += 1;
    }
  }
  if (!removed) return { drawing: d0, faceId: null, merged: false };
  rebuildFaces(drawing, type);
  const faceId =
    pickFaceAt(drawing, seed) ??
    Object.values(drawing.faces).sort(
      (a, b) => faceArea(drawing, b.id) - faceArea(drawing, a.id),
    )[0]?.id ??
    null;
  if (faceId && drawing.faces[faceId]) {
    drawing.faces[faceId] = {
      ...drawing.faces[faceId]!,
      type: source.type,
      locked: source.locked,
      hidden: source.hidden,
      hydro: source.hydro,
      name: source.name,
      fill: source.fill,
      circle: undefined,
      ellipse: undefined,
      rect: undefined,
      spline: undefined,
      freehand: undefined,
      pointShape: undefined,
      nodeEdit: undefined,
    };
  }
  const cleaned = cleanupDrawing(drawing);
  const mergedFace = faceId ? cleaned.faces[faceId] : null;
  if (mergedFace) {
    const previousCurved = new Set(source.nodeEdit?.curvedVertexIds ?? []);
    const sourceWasCurved = Boolean(source.circle || source.ellipse || source.spline || source.freehand);
    const curvedVertexIds = faceVertices(cleaned, mergedFace.id)
      .filter((vertex) =>
        sourceWasCurved ||
        previousCurved.has(vertex.id) ||
        pointNearPolyline(vertex, curvedPath, Math.max(1e-5, curvedTolerance)))
      .map((vertex) => vertex.id);
    mergedFace.nodeEdit = { curvedVertexIds };
    clearFaceGeometryConstraints(cleaned, mergedFace);
  }
  return { drawing: cleaned, faceId, merged: true };
}

function newPathEdgeIds(drawing: CadDrawing, beforeEdges: Set<string>, points: Pt[], tolerance: number): Set<string> {
  return new Set(
    Object.values(drawing.edges)
      .filter((edge) => {
        if (beforeEdges.has(edge.id)) return false;
        const a = drawing.vertices[edge.a];
        const b = drawing.vertices[edge.b];
        return Boolean(a && b && pointNearPolyline(a, points, tolerance) && pointNearPolyline(b, points, tolerance));
      })
      .map((edge) => edge.id),
  );
}

function attachOpenDrawnPath(
  baseDrawing: CadDrawing,
  sourcePoints: Pt[],
  type: RegionType,
  attachTolerance: number,
  pathTolerance: number,
): FreehandStrokeResult | null {
  if (sourcePoints.length < 2) return null;
  const startHit = nearestClosedFaceBoundary(baseDrawing, sourcePoints[0]!, attachTolerance);
  const endHit = nearestClosedFaceBoundary(baseDrawing, sourcePoints[sourcePoints.length - 1]!, attachTolerance);
  const directlyAttached =
    startHit && endHit && startHit.faceId === endHit.faceId && isClosedBoundaryFace(baseDrawing.faces[startHit.faceId]!)
      ? startHit.faceId
      : null;
  const attachment = findFreehandAttachment(baseDrawing, sourcePoints, attachTolerance);
  const openTarget = attachment?.faceId ?? directlyAttached;
  if (!openTarget) return null;
  const points = (attachment?.points ?? sourcePoints).map((point) => ({ ...point }));
  if (points.length < 2) return null;
  points[0] = { ...(attachment ? attachment.points[0]! : startHit!.pt) };
  points[points.length - 1] = { ...(attachment ? attachment.points[attachment.points.length - 1]! : endHit!.pt) };

  const source = structuredClone(baseDrawing.faces[openTarget]!) as CadFace;
  const targetPolygon = facePoints(baseDrawing, openTarget);
  const seed = faceInteriorSample(baseDrawing, openTarget);
  const base = materializeFreehandTarget(baseDrawing, openTarget);
  const beforeEdges = new Set(Object.keys(base.edges));
  const divided = addChain(base, points, false, type, false);
  const insideTarget = new Set(
    Object.values(divided.faces)
      .filter((face) => pointInPoly(faceInteriorSample(divided, face.id), targetPolygon))
      .map((face) => face.id),
  );
  const strokeEdgeIds = newPathEdgeIds(divided, beforeEdges, points, Math.max(1e-5, pathTolerance));
  const candidate = Object.values(divided.faces)
    .filter((face) => !insideTarget.has(face.id))
    .map((face) => ({ face, score: face.outer.reduce((sum, half) => sum + (strokeEdgeIds.has(half.e) ? 1 : 0), 0) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || faceArea(divided, b.face.id) - faceArea(divided, a.face.id))[0]?.face;
  if (!candidate) return null;
  const merged = mergeFreehandCells(
    divided,
    new Set([...insideTarget, candidate.id]),
    type,
    seed,
    source,
    points,
    Math.max(1e-5, pathTolerance * 2),
  );
  return merged.merged
    ? { drawing: merged.drawing, faceId: merged.faceId, closed: false, attached: true }
    : null;
}

/**
 * Finish a freehand gesture. A near-start endpoint creates a filled figure.
 * A stroke whose two ends land on the same figure grows that figure and
 * removes the shared internal boundary.
 */
export function addFreehandStroke(
  d0: CadDrawing,
  raw: Pt[],
  type: RegionType,
  options: {
    closeTolerance?: number;
    attachTolerance?: number;
    smoothTolerance?: number;
  } = {},
): FreehandStrokeResult {
  if (raw.length < 2) {
    return { drawing: cloneDrawing(d0), faceId: null, closed: false, attached: false };
  }
  const closeTolerance = Math.max(1e-4, options.closeTolerance ?? 0.2);
  const attachTolerance = Math.max(1e-4, options.attachTolerance ?? closeTolerance);
  const smoothTolerance = Math.max(1e-4, options.smoothTolerance ?? closeTolerance * 0.12);
  const connected = collectConnectedFreehandStroke(d0, raw, attachTolerance);
  const baseDrawing = connected.drawing;
  let sourcePoints = connected.points;
  const closed =
    sourcePoints.length >= 3 &&
    dist(sourcePoints[0]!, sourcePoints[sourcePoints.length - 1]!) <= closeTolerance;
  const startHit = nearestClosedFaceBoundary(baseDrawing, sourcePoints[0]!, attachTolerance);
  const endHit = nearestClosedFaceBoundary(
    baseDrawing,
    sourcePoints[sourcePoints.length - 1]!,
    attachTolerance,
  );
  const hitFace = startHit ? baseDrawing.faces[startHit.faceId] : null;
  const hitFaceClosed = Boolean(hitFace && isClosedBoundaryFace(hitFace));
  const attachedTarget =
    startHit && endHit && startHit.faceId === endHit.faceId && hitFaceClosed ? startHit.faceId : null;
  const attachment = closed ? null : findFreehandAttachment(baseDrawing, sourcePoints, attachTolerance);
  if (attachment) sourcePoints = attachment.points;
  let points = smoothFreehandPoints(sourcePoints, smoothTolerance, closed);
  if (points.length < 2 || (closed && points.length < 3)) {
    return { drawing: cloneDrawing(d0), faceId: null, closed, attached: false };
  }

  if (closed) {
    const contactHit = nearestFreehandContact(baseDrawing, sourcePoints, attachTolerance);
    if (contactHit) {
      points = insertClosedContact(points, contactHit.pt, Math.max(1e-5, smoothTolerance));
    }
    const targetId = attachedTarget ?? contactHit?.faceId ?? null;
    if (!targetId) {
      const before = new Set(Object.values(baseDrawing.faces).map(faceBoundaryKey));
      const drawing = addChain(baseDrawing, points, true, type, false);
      const faceId =
        Object.values(drawing.faces)
          .filter((face) => !before.has(faceBoundaryKey(face)))
          .filter((face) => pointInPoly(faceInteriorSample(drawing, face.id), points))
          .sort((a, b) => faceArea(drawing, b.id) - faceArea(drawing, a.id))[0]?.id ?? null;
      if (faceId && drawing.faces[faceId]) {
        drawing.faces[faceId]!.freehand = {
          pts: points.map((point) => ({ ...point })),
          closed: true,
        };
      }
      return { drawing, faceId, closed: true, attached: false };
    }
    const source = structuredClone(baseDrawing.faces[targetId]!) as CadFace;
    const targetPolygon = facePoints(baseDrawing, targetId);
    const seed = faceInteriorSample(baseDrawing, targetId);
    const base = materializeFreehandTarget(baseDrawing, targetId);
    const divided = addChain(base, points, true, type, false);
    const included = new Set(
      Object.values(divided.faces)
        .filter((face) => {
          const sample = faceInteriorSample(divided, face.id);
          return pointInPoly(sample, targetPolygon) || pointInPoly(sample, points);
        })
        .map((face) => face.id),
    );
    const merged = mergeFreehandCells(
      divided,
      included,
      type,
      seed,
      source,
      [...points, points[0]!],
      Math.max(1e-5, smoothTolerance * 0.5),
    );
    if (merged.merged) {
      return { drawing: merged.drawing, faceId: merged.faceId, closed: true, attached: true };
    }
    const fallbackId = pickFaceAt(divided, seed) ?? null;
    return { drawing: divided, faceId: fallbackId, closed: true, attached: false };
  }

  const mergedOpen = attachOpenDrawnPath(
    baseDrawing,
    points,
    type,
    attachTolerance,
    Math.max(1e-5, smoothTolerance * 0.15),
  );
  if (mergedOpen) return mergedOpen;

  const drawing = cloneDrawing(baseDrawing);
  const faceId = nid("f");
  drawing.faces[faceId] = {
    id: faceId,
    type,
    outer: [],
    holes: [],
    locked: false,
    hidden: false,
    freehand: { pts: points.map((point) => ({ ...point })), closed: false },
  };
  return { drawing, faceId, closed: false, attached: false };
}

/** Finish an open spline and union its outside excursion with a touched figure. */
export function addSplineStroke(
  d0: CadDrawing,
  controls: Pt[],
  type: RegionType,
  options: { attachTolerance?: number; samples?: number } = {},
): FreehandStrokeResult {
  if (controls.length < 2) return { drawing: cloneDrawing(d0), faceId: null, closed: false, attached: false };
  const attachTolerance = Math.max(1e-4, options.attachTolerance ?? 0.2);
  const continuation = nearestOpenSplineEndpoint(d0, controls[0]!, attachTolerance);
  if (continuation) {
    const source = d0.faces[continuation.faceId];
    const stored = source?.spline?.pts;
    if (source?.spline && stored?.length) {
      const existing = continuation.endpoint === "end"
        ? stored.map((point) => ({ ...point }))
        : stored.map((point) => ({ ...point })).reverse();
      const extension = controls.map((point) => ({ ...point }));
      extension[0] = { ...existing[existing.length - 1]! };
      let joined = [...existing, ...extension.slice(1)];
      const closes =
        joined.length >= 3 &&
        dist(joined[0]!, joined[joined.length - 1]!) <= attachTolerance;
      if (closes) joined = joined.slice(0, -1);
      const drawing = updateSpline(d0, continuation.faceId, joined, closes);
      const closed = Boolean(drawing.faces[continuation.faceId]?.spline?.closed);
      return {
        drawing,
        faceId: continuation.faceId,
        closed,
        attached: drawing !== d0,
      };
    }
  }
  const curve = catmullRom(controls, Math.max(4, options.samples ?? 8), false);
  const merged = attachOpenDrawnPath(d0, curve, type, attachTolerance, Math.max(1e-5, attachTolerance * 0.01));
  if (merged) return merged;
  const before = new Set(Object.keys(d0.faces));
  const drawing = addSpline(d0, controls, false, type);
  const faceId = Object.keys(drawing.faces).find((id) => !before.has(id)) ?? null;
  return { drawing, faceId, closed: false, attached: false };
}

export function addPlant(d0: CadDrawing, kind: "tree" | "shrub", p: Pt, r = kind === "tree" ? 2 : 0.8): CadDrawing {
  const d = cloneDrawing(d0);
  d.plants = { ...(d.plants ?? {}) };
  const id = nid("p");
  d.plants[id] = { id, kind, x: p.x, y: p.y, r };
  return d;
}

export function setFaceHydro(d0: CadDrawing, faceId: string, hydro: CadFace["hydro"]): CadDrawing {
  const d = cloneDrawing(d0);
  if (d.faces[faceId]) d.faces[faceId] = { ...d.faces[faceId]!, hydro };
  return d;
}

export function faceLayerNumber(d: CadDrawing, faceId: string): number {
  const ids = Object.keys(d.faces);
  const i = ids.indexOf(faceId);
  return (i >= 0 ? i : ids.length) + 1;
}

export function setFaceName(d0: CadDrawing, faceId: string, name: string): CadDrawing {
  const d = cloneDrawing(d0);
  if (d.faces[faceId]) d.faces[faceId] = { ...d.faces[faceId]!, name: name.trim() || undefined };
  return d;
}

export function setFaceFill(d0: CadDrawing, faceId: string, fill: string): CadDrawing {
  const d = cloneDrawing(d0);
  if (d.faces[faceId]) d.faces[faceId] = { ...d.faces[faceId]!, fill };
  return d;
}

export function setLayerFlag(d0: CadDrawing, id: CadLayerId, patch: { visible?: boolean; locked?: boolean }): CadDrawing {
  const d = cloneDrawing(d0);
  d.layers = { ...(d.layers ?? defaultLayerState()) };
  d.layers[id] = { ...d.layers[id]!, ...patch };
  return d;
}

export function pickEdgeAt(d: CadDrawing, p: Pt, tol: number): string | null {
  let best: string | null = null;
  let bestD = tol;
  for (const ed of Object.values(d.edges)) {
    const A = v(d, ed.a);
    const B = v(d, ed.b);
    const pr = projectT(p, A, B);
    if (pr.d < bestD) {
      bestD = pr.d;
      best = ed.id;
    }
  }
  return best;
}

export function pickFaceAt(d: CadDrawing, p: Pt): string | null {
  let best: string | null = null;
  let bestA = Infinity;
  for (const f of Object.values(d.faces)) {
    if (f.hidden) continue;
    if ((f.spline && !f.spline.closed) || (f.freehand && !f.freehand.closed)) continue;
    const ls = d.layers?.[layerForType(f.type)];
    if (ls && ls.visible === false) continue;
    if (pointInPoly(p, facePoints(d, f.id))) {
      const a = faceArea(d, f.id);
      if (a < bestA) {
        bestA = a;
        best = f.id;
      }
    }
  }
  return best;
}

export function pickCandidates(
  d: CadDrawing,
  p: Pt,
  tol: number,
  heads: { id: string; x: number; y: number }[] = [],
): { kind: "face" | "edge" | "head"; id: string; d: number }[] {
  const faces: { kind: "face"; id: string; d: number }[] = [];
  for (const f of Object.values(d.faces)) {
    if (f.hidden) continue;
    if ((f.spline && !f.spline.closed) || (f.freehand && !f.freehand.closed)) continue;
    const ls = d.layers?.[layerForType(f.type)];
    if (ls && ls.visible === false) continue;
    if (pointInPoly(p, facePoints(d, f.id))) faces.push({ kind: "face", id: f.id, d: Math.sqrt(Math.max(0, faceArea(d, f.id))) });
  }
  faces.sort((a, b) => a.d - b.d);
  const rest: { kind: "face" | "edge" | "head"; id: string; d: number }[] = faces.slice(0, 4);
  const edge = pickEdgeAt(d, p, tol);
  if (edge) rest.push({ kind: "edge", id: edge, d: 0 });
  for (const h of heads) {
    const dd = dist(p, h);
    if (dd <= Math.max(tol, 0.25)) rest.push({ kind: "head", id: h.id, d: dd });
  }
  return rest;
}

export function inferRectFromPoints(pts: Pt[]): { x: number; y: number; w: number; h: number; rot: number } | null {
  if (pts.length !== 4) return null;
  const a = pts[0]!;
  const b = pts[1]!;
  const c = pts[2]!;
  const w = dist(a, b);
  const h = dist(b, c);
  if (w < EPS || h < EPS) return null;
  const rot = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const cx = (a.x + c.x) / 2;
  const cy = (a.y + c.y) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h, rot };
}

export function ensureRectMeta(d0: CadDrawing, faceId: string): CadDrawing {
  const f = d0.faces[faceId];
  if (!f || f.rect || f.circle || f.ellipse) return d0;
  const pts = faceVertices(d0, faceId);
  if (pts.length !== 4) return d0;
  const r = inferRectFromPoints(pts);
  if (!r) return d0;
  const d = cloneDrawing(d0);
  writeRectMeta(d, faceId, r);
  return d;
}

/** True when stored rectangle metadata still describes the face's real vertices. */
export function rectMetaMatchesFace(d: CadDrawing, faceId: string): boolean {
  const f = d.faces[faceId];
  if (!f?.rect) return false;
  const verts = faceVertices(d, faceId);
  if (verts.length !== 4) return false;
  const corners = rectWorldCorners(f.rect);
  let best = Infinity;
  for (let start = 0; start < 4; start++) {
    for (const dir of [1, -1]) {
      let worst = 0;
      for (let i = 0; i < 4; i++) {
        const corner = corners[(((start + i * dir) % 4) + 4) % 4]!;
        worst = Math.max(worst, dist(verts[i]!, corner));
      }
      best = Math.min(best, worst);
    }
  }
  const scale = Math.max(1, Math.abs(f.rect.w), Math.abs(f.rect.h));
  return best <= Math.max(1e-6, scale * 1e-5);
}

/** Remove stale rectangle metadata without changing any contour vertex. */
export function clearInvalidRectMeta(d0: CadDrawing, faceId: string): CadDrawing {
  const f = d0.faces[faceId];
  if (!f?.rect || rectMetaMatchesFace(d0, faceId)) return d0;
  const d = cloneDrawing(d0);
  delete d.faces[faceId]?.rect;
  return d;
}

export function inferEllipseFromPoints(pts: Pt[]): { cx: number; cy: number; rx: number; ry: number; rot: number } | null {
  if (pts.length < 8) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = (maxX - minX) / 2;
  const ry = (maxY - minY) / 2;
  if (rx < EPS || ry < EPS) return null;
  let err = 0;
  for (const p of pts) {
    const nx = (p.x - cx) / rx;
    const ny = (p.y - cy) / ry;
    err += Math.abs(nx * nx + ny * ny - 1);
  }
  if (err / pts.length > 0.18) return null;
  return { cx, cy, rx, ry, rot: 0 };
}

export function ensureEllipseMeta(d0: CadDrawing, faceId: string): CadDrawing {
  const f = d0.faces[faceId];
  if (!f || f.ellipse || f.circle || f.rect) return d0;
  const ell = inferEllipseFromPoints(faceVertices(d0, faceId));
  if (!ell) return d0;
  const d = cloneDrawing(d0);
  d.faces[faceId] = { ...d.faces[faceId]!, ellipse: ell };
  return d;
}

export function snapFaceToGrid(d0: CadDrawing, faceId: string, step: number): CadDrawing {
  const d = cloneDrawing(d0);
  if (step <= 0) return d;
  const f = d.faces[faceId];
  if (f?.rect) {
    const r = f.rect;
    let rot = ((r.rot % 360) + 360) % 360;
    const q = Math.round(rot / 90) * 90;
    let ad = Math.abs(rot - q);
    if (ad > 180) ad = 360 - ad;
    const g = step;
    if (ad < 6) {
      const x0 = Math.round(r.x / g) * g;
      const y0 = Math.round(r.y / g) * g;
      const x1 = Math.round((r.x + r.w) / g) * g;
      const y1 = Math.round((r.y + r.h) / g) * g;
      writeRectMeta(d, faceId, {
        x: Math.min(x0, x1),
        y: Math.min(y0, y1),
        w: Math.max(g, Math.abs(x1 - x0)),
        h: Math.max(g, Math.abs(y1 - y0)),
        rot: ((q % 360) + 360) % 360,
      });
      return d;
    }
    const cx = Math.round((r.x + r.w / 2) / g) * g;
    const cy = Math.round((r.y + r.h / 2) / g) * g;
    writeRectMeta(d, faceId, { ...r, x: cx - r.w / 2, y: cy - r.h / 2 });
    return d;
  }
  for (const id of faceVertexIds(d, faceId)) {
    const vt = d.vertices[id];
    if (!vt) continue;
    d.vertices[id] = { ...vt, x: Math.round(vt.x / step) * step, y: Math.round(vt.y / step) * step };
  }
  if (f?.circle) {
    f.circle = {
      ...f.circle,
      cx: Math.round(f.circle.cx / step) * step,
      cy: Math.round(f.circle.cy / step) * step,
    };
  }
  return d;
}

export function filletPreview(d: CadDrawing, vertexId: string, radius: number): Pt[] {
  const halves = outgoing(d, vertexId);
  if (halves.length < 2 || radius <= 0) return [];
  const p0 = vertPt(v(d, vertexId));
  const p1 = vertPt(v(d, endOf(d, halves[0]!)));
  const p2 = vertPt(v(d, endOf(d, halves[1]!)));
  const d1 = dist(p0, p1);
  const d2 = dist(p0, p2);
  const t = Math.min(radius, d1 * 0.45, d2 * 0.45);
  if (t < 1e-6) return [];
  const a = { x: p0.x + ((p1.x - p0.x) / d1) * t, y: p0.y + ((p1.y - p0.y) / d1) * t };
  const b = { x: p0.x + ((p2.x - p0.x) / d2) * t, y: p0.y + ((p2.y - p0.y) / d2) * t };
  return tessellateEdge(a, b, bulgeFromPoints(a, b, p0), 10);
}

export function pickVertexAt(d: CadDrawing, p: Pt, tol: number): string | null {
  return findVertexAt(d, p, tol);
}

/* ---------- sync with Geom ---------- */

const KIND_MAP: Record<string, RegionType> = {
  lawn: "lawn",
  bed: "bed",
  path: "path",
  hardscape: "hardscape",
};

export function fromPolygons(geoms: Geom[]): CadDrawing {
  let d = emptyDrawing();
  for (const g of geoms) {
    if (g.type === "guide" || g.hidden) continue;
    const type = KIND_MAP[g.kind] ?? (g.kind as RegionType) ?? "other";
    if (g.ellipse) {
      d = addIsolatedLoop(
        d,
        ellipseWorldPts(g.ellipse.cx, g.ellipse.cy, g.ellipse.rx, g.ellipse.ry, g.ellipse.rot ?? 0, 96),
        type,
        { ellipse: { ...g.ellipse } },
      );
      continue;
    }
    if (g.type === "circle" && g.points[0] && g.radius) {
      d = addCircle(d, g.points[0], g.radius, type);
      continue;
    }
    if (g.type === "rect" && g.points.length >= 4) {
      const r = inferRectFromPoints(g.points);
      d = addIsolatedLoop(d, g.points.slice(0, 4), type, r ? { rect: r } : {});
      continue;
    }
    if (g.points.length < 2) continue;
    d = addChain(d, g.points, g.closed || g.type === "poly" || g.type === "rect", type);
  }
  return d;
}

export function toPolygons(d: CadDrawing): Geom[] {
  const geoms: Geom[] = [];
  const usedEdges = new Set<string>();
  for (const f of Object.values(d.faces)) {
    for (const h of f.outer) usedEdges.add(h.e);
    for (const hole of f.holes) for (const h of hole) usedEdges.add(h.e);
    if (f.hidden) continue;
    const ls = d.layers?.[layerForType(f.type)];
    if (ls && ls.visible === false) continue;
    const kind = (["lawn", "bed", "path", "hardscape"].includes(f.type) ? f.type : f.type === "building" || f.type === "no_irrigation" ? "hardscape" : f.type === "pool" || f.type === "water" ? "path" : "bed") as PolyKind;
    if (f.spline || f.freehand) {
      const points = facePoints(d, f.id);
      const closed = f.spline?.closed ?? f.freehand?.closed ?? false;
      if (points.length >= 2) {
        geoms.push({
          id: f.id,
          type: closed ? "poly" : "line",
          kind,
          cadType: f.type,
          points,
          closed,
          locked: f.locked,
          hidden: f.hidden,
          fill: f.fill,
          name: f.name,
        });
      }
      continue;
    }
    if (f.circle) {
      geoms.push({
        id: f.id,
        type: "circle",
        kind,
        cadType: f.type,
        points: [{ x: f.circle.cx, y: f.circle.cy }],
        radius: f.circle.r,
        closed: true,
        locked: f.locked,
        hidden: f.hidden,
        fill: f.fill,
        name: f.name,
      });
      continue;
    }
    if (f.ellipse) {
      geoms.push({
        id: f.id,
        type: "poly",
        kind,
        cadType: f.type,
        points: ellipseWorldPts(f.ellipse.cx, f.ellipse.cy, f.ellipse.rx, f.ellipse.ry, f.ellipse.rot ?? 0, 96),
        ellipse: { ...f.ellipse },
        closed: true,
        locked: f.locked,
        hidden: f.hidden,
        fill: f.fill,
        name: f.name,
      });
      continue;
    }
    if (f.rect) {
      geoms.push({
        id: f.id,
        type: "rect",
        kind,
        cadType: f.type,
        points: rectWorldCorners(f.rect),
        closed: true,
        locked: f.locked,
        hidden: f.hidden,
        fill: f.fill,
        name: f.name,
      });
      continue;
    }
    const pts = facePoints(d, f.id);
    if (pts.length < 3) continue;
    geoms.push({
      id: f.id,
      type: f.rect ? "rect" : "poly",
      kind,
      cadType: f.type,
      points: pts,
      closed: true,
      locked: f.locked,
      hidden: f.hidden,
      fill: f.fill,
      name: f.name,
    });
  }
  for (const ed of Object.values(d.edges)) {
    if (usedEdges.has(ed.id)) continue;
    const A = d.vertices[ed.a];
    const B = d.vertices[ed.b];
    if (!A || !B) continue;
    geoms.push({
      id: ed.id,
      type: "line",
      kind: "path",
      points: [
        { x: A.x, y: A.y },
        { x: B.x, y: B.y },
      ],
      closed: false,
      locked: false,
      hidden: false,
    });
  }
  return geoms;
}

export function drawingOrMigrate(project: { polygons: Geom[]; drawing?: CadDrawing | null }): CadDrawing {
  if (project.drawing && project.drawing.version && Object.keys(project.drawing.vertices ?? {}).length + Object.keys(project.drawing.faces ?? {}).length) {
    const d = project.drawing.dims ? project.drawing : { ...project.drawing, dims: {} };
    return d.texts ? d : { ...d, texts: {} };
  }
  return fromPolygons(project.polygons);
}

export function ensureDrawing(project: { polygons: Geom[]; drawing?: CadDrawing | null }): CadDrawing {
  return drawingOrMigrate(project);
}
