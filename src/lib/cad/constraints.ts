import { dist, type Pt } from "@/lib/geometry";
import type { CadDrawing, ConstraintKind } from "@/lib/cad/types";
export type { ConstraintKind };

function nid() {
  return `c-${Math.random().toString(36).slice(2, 9)}`;
}

export function addConstraint(d0: CadDrawing, kind: ConstraintKind, a: string, b?: string): CadDrawing {
  const d = structuredClone(d0) as CadDrawing;
  d.constraints = { ...(d.constraints ?? {}) };
  const id = nid();
  d.constraints[id] = { id, kind, a, b };
  return applyConstraints(d);
}

export function removeConstraint(d0: CadDrawing, id: string): CadDrawing {
  const d = structuredClone(d0) as CadDrawing;
  if (d.constraints) delete d.constraints[id];
  return d;
}

export function autoSegmentConstraints(d0: CadDrawing, va: string, vb: string): CadDrawing {
  const a = d0.vertices[va];
  const b = d0.vertices[vb];
  if (!a || !b) return d0;
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dx < 0.02 && dy < 0.02) return d0;
  if (dy <= 0.03 * Math.max(dx, 0.01) || dy < 0.02) return addConstraint(d0, "horiz", va, vb);
  if (dx <= 0.03 * Math.max(dy, 0.01) || dx < 0.02) return addConstraint(d0, "vert", va, vb);
  return d0;
}

export function applyConstraints(d0: CadDrawing, passes = 10): CadDrawing {
  const d = structuredClone(d0) as CadDrawing;
  const list = Object.values(d.constraints ?? {});
  if (!list.length) return d;
  for (let i = 0; i < passes; i++) {
    for (const c of list) {
      if (c.kind === "lock") {
        /* vertices of locked faces already skipped in move */
        continue;
      }
      if (c.kind === "coincident" && c.b) {
        const a = d.vertices[c.a];
        const b = d.vertices[c.b];
        if (a && b) d.vertices[c.b] = { ...b, x: a.x, y: a.y };
      }
      if ((c.kind === "horiz" || c.kind === "vert") && c.b) {
        const a = d.vertices[c.a];
        const b = d.vertices[c.b];
        if (!a || !b) continue;
        if (c.kind === "horiz") d.vertices[c.b] = { ...b, y: a.y };
        else d.vertices[c.b] = { ...b, x: a.x };
      }
      if (c.kind === "midpoint" && c.b) {
        const ed = d.edges[c.b];
        const v = d.vertices[c.a];
        if (!ed || !v) continue;
        const A = d.vertices[ed.a];
        const B = d.vertices[ed.b];
        if (!A || !B) continue;
        d.vertices[c.a] = { ...v, x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
      }
      if (c.kind === "equalLen" && c.b) {
        const e1 = d.edges[c.a];
        const e2 = d.edges[c.b];
        if (!e1 || !e2) continue;
        const A = d.vertices[e1.a];
        const B = d.vertices[e1.b];
        const C = d.vertices[e2.a];
        const D = d.vertices[e2.b];
        if (!A || !B || !C || !D) continue;
        const L = dist(A, B);
        const l2 = dist(C, D) || 1e-9;
        const mx = (C.x + D.x) / 2;
        const my = (C.y + D.y) / 2;
        const ux = (D.x - C.x) / l2;
        const uy = (D.y - C.y) / l2;
        d.vertices[e2.a] = { ...C, x: mx - (ux * L) / 2, y: my - (uy * L) / 2 };
        d.vertices[e2.b] = { ...D, x: mx + (ux * L) / 2, y: my + (uy * L) / 2 };
      }
      if (c.kind === "parallel" && c.b) rotateEdgeTo(d, c.b, edgeAngle(d, c.a));
      if (c.kind === "perp" && c.b) rotateEdgeTo(d, c.b, edgeAngle(d, c.a) + Math.PI / 2);
      if (c.kind === "equalR" && c.b) {
        const fa = d.faces[c.a];
        const fb = d.faces[c.b];
        if (fa?.circle && fb?.circle) fb.circle = { ...fb.circle, r: fa.circle.r };
      }
      if (c.kind === "concentric" && c.b) {
        const fa = d.faces[c.a];
        const fb = d.faces[c.b];
        if (fa?.circle && fb?.circle) fb.circle = { ...fb.circle, cx: fa.circle.cx, cy: fa.circle.cy };
      }
      if (c.kind === "tangent" && c.b) {
        const v = d.vertices[c.a];
        const f = d.faces[c.b];
        if (!v || !f?.circle) continue;
        const dx = v.x - f.circle.cx;
        const dy = v.y - f.circle.cy;
        const l = Math.hypot(dx, dy) || 1;
        d.vertices[c.a] = { ...v, x: f.circle.cx + (dx / l) * f.circle.r, y: f.circle.cy + (dy / l) * f.circle.r };
      }
    }
  }
  return d;
}

function edgeAngle(d: CadDrawing, edgeId: string): number {
  const ed = d.edges[edgeId];
  if (!ed) return 0;
  const a = d.vertices[ed.a];
  const b = d.vertices[ed.b];
  if (!a || !b) return 0;
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function rotateEdgeTo(d: CadDrawing, edgeId: string, ang: number) {
  const ed = d.edges[edgeId];
  if (!ed) return;
  const C = d.vertices[ed.a];
  const D = d.vertices[ed.b];
  if (!C || !D) return;
  const len = dist(C, D) || 1e-9;
  const mx = (C.x + D.x) / 2;
  const my = (C.y + D.y) / 2;
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  d.vertices[ed.a] = { ...C, x: mx - (ux * len) / 2, y: my - (uy * len) / 2 };
  d.vertices[ed.b] = { ...D, x: mx + (ux * len) / 2, y: my + (uy * len) / 2 };
}

export function pendingFits(kind: ConstraintKind): "edge" | "face" | "vertex" {
  if (kind === "equalR" || kind === "concentric") return "face";
  if (kind === "lock" || kind === "coincident" || kind === "horiz" || kind === "vert" || kind === "tangent") return "vertex";
  return "edge";
}
