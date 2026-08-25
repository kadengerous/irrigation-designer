import { closestOnSegment, dist, pointInPoly, polygonArea, shoelace, type Pt } from "@/lib/geometry";
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
export function addChain(d0: CadDrawing, pts: Pt[], close: boolean, type: RegionType): CadDrawing {
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
  return addIsolatedLoop(d, pts.slice(0, 3), type);
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
    const id = nid("f");
    const old = Object.values(prev).find((f) => loopsEqual(f.outer, cand.loop));
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
      hydro: old?.hydro,
      name: old?.name,
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
  let a = Math.abs(loopAreaBulge(d, f.outer));
  for (const h of f.holes) a -= Math.abs(loopAreaBulge(d, h));
  return Math.max(0, a);
}

export function facePerimeter(d: CadDrawing, faceId: string): number {
  const f = d.faces[faceId];
  if (!f) return 0;
  if (f.circle) return 2 * Math.PI * f.circle.r;
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
  if (f.rect) f.rect = { ...f.rect, x: f.rect.x + dx, y: f.rect.y + dy };
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
  const next = addChain(d, catmullRom(pts, 8, close), close, type);
  const face = Object.values(next.faces).sort((a, b) => faceArea(next, b.id) - faceArea(next, a.id))[0];
  if (face) face.spline = { pts: pts.map((p) => ({ ...p })), closed: close };
  return next;
}

export function updateSpline(d0: CadDrawing, faceId: string, pts: Pt[]): CadDrawing {
  const f = d0.faces[faceId];
  if (!f?.spline) return d0;
  const closed = f.spline.closed;
  const type = f.type;
  const d = deleteFace(d0, faceId);
  return addSpline(d, pts, closed, type);
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

export function addEllipse(d0: CadDrawing, c: Pt, rx: number, ry: number, type: RegionType): CadDrawing {
  if (Math.abs(rx) < EPS || Math.abs(ry) < EPS) return d0;
  const n = 24;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    pts.push({ x: c.x + Math.abs(rx) * Math.cos(a), y: c.y + Math.abs(ry) * Math.sin(a) });
  }
  return addIsolatedLoop(d0, pts, type, { ellipse: { cx: c.x, cy: c.y, rx: Math.abs(rx), ry: Math.abs(ry) } });
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
  if (!f?.rect || w <= EPS || h <= EPS) return d0;
  const cx = f.rect.x + f.rect.w / 2;
  const cy = f.rect.y + f.rect.h / 2;
  const d = cloneDrawing(d0);
  writeRectMeta(d, faceId, { x: cx - w / 2, y: cy - h / 2, w, h, rot: f.rect.rot || 0 });
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
  const ell = f.ellipse ?? { cx: faceCentroid(d, faceId).x, cy: faceCentroid(d, faceId).y, rx: 1, ry: 1 };
  const sx = rx / (ell.rx || 1);
  const sy = ry / (ell.ry || 1);
  for (const id of faceVertexIds(d, faceId)) {
    const vt = d.vertices[id];
    if (!vt) continue;
    d.vertices[id] = { ...vt, x: ell.cx + (vt.x - ell.cx) * sx, y: ell.cy + (vt.y - ell.cy) * sy };
  }
  f.ellipse = { ...ell, rx: Math.abs(rx), ry: Math.abs(ry) };
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
  if (pts.length < 4) return null;
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
  if (!f || f.rect || f.circle) return d0;
  const pts = faceVertices(d0, faceId);
  if (pts.length !== 4) return d0;
  const r = inferRectFromPoints(pts);
  if (!r) return d0;
  const d = cloneDrawing(d0);
  writeRectMeta(d, faceId, r);
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
