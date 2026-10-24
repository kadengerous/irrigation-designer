import {operatingGeometryAvailable} from "./flow";
import {specialFootprint} from "./equipment-footprint";
import {landscapeExclusions} from "./landscape-objects";
import clipping, { type MultiPolygon, type Polygon, type Ring } from "polygon-clipping";
import { ellipseWorldPts, faceHoles, facePoints } from "./cad/engine";
import { isExclusion, layerPurpose } from "./cad/types";
import { catalogForHead,  itemById, stripAtPressure, supportsArc } from "./equipment-catalog";
import { polyPoints } from "./project-types";
import type { Head, Project, Pt } from "./project-types";

// Numerical geometry tolerances, never agronomic acceptance thresholds.
export const GEOMETRY_EPS = 1e-7;
export const CURVE_TOLERANCE_M = .002;
export const COVERAGE_ARTIFACT_AREA_M2 = CURVE_TOLERANCE_M ** 2;
export type Surface = MultiPolygon;
export const unionSurfaces = (surfaces: Surface[]): Surface => {
  const nonempty = surfaces.filter(s => s.length);
  return nonempty.length ? clipping.union(nonempty[0]!, ...nonempty.slice(1)) : [];
};
export const subtractSurface = (a: Surface, b: Surface): Surface => a.length && b.length ? clipping.difference(a, b) : a;
export const intersectSurface = (a: Surface, b: Surface): Surface => a.length && b.length ? clipping.intersection(a, b) : [];
const ringArea = (r: Ring) => Math.abs(r.reduce((a, p, i) => {
  const q = r[(i + 1) % r.length]!;
  return a + p[0] * q[1] - q[0] * p[1];
}, 0)) / 2;
export const surfaceArea = (s: Surface) => s.reduce((a, p) => a + (ringArea(p[0]!) - p.slice(1).reduce((b, r) => b + ringArea(r), 0)), 0);
export const cleanSurface = (s: Surface) => s.filter(p => surfaceArea([p]) > GEOMETRY_EPS);
export const cleanCoverageSurface = (s: Surface) => s.filter(p => surfaceArea([p]) > COVERAGE_ARTIFACT_AREA_M2);
const ring = (points: Pt[]): Ring => points.map(p => [p.x, p.y]);

/** Uses canonical CAD faces, including holes and hidden layers. Visibility is a view setting. */
export function irrigationSurfaces(project: Project, {includeImplicitSiteIrrigation = false} = {}): { target: Surface; unmodeled: Surface; excluded: Surface } {
  const targets: Surface[] = [], excluded: Surface[] = [], unmodeled: Surface[] = [];
  const d = project.drawing;
  // Legacy polygon migration is intended for editing and can discard hidden shapes and CAD types.
  // Read legacy geometry directly for diagnosis so visibility never changes the result.
  if (!d || !Object.keys(d.faces ?? {}).length && project.polygons.length) {
    for (const g of project.polygons) {
      if (!g.closed) continue;
      const radius = g.radius ?? Math.max(g.ellipse?.rx ?? 0, g.ellipse?.ry ?? 0);
      const n = arcSegments(radius || 1, Math.PI * 2);
      const points = g.ellipse ? ellipseWorldPts(g.ellipse.cx, g.ellipse.cy, g.ellipse.rx, g.ellipse.ry, g.ellipse.rot ?? 0, n)
        : g.type === "circle" && g.points[0] && g.radius ? ellipseWorldPts(g.points[0].x, g.points[0].y, g.radius, g.radius, 0, n) : polyPoints(g);
      if (points.length < 3) continue;
      const polygon: Polygon = [ring(points), ...(g.holes ?? []).filter(h => h.length >= 3).map(ring)];
      if (polygon.some(r => r.some(p => !p.every(Number.isFinite)))) throw new Error("invalid-geometry");
      const type = g.cadType ?? g.kind;
      if (type === "site" && !includeImplicitSiteIrrigation) continue;
      (isExclusion(type) || type === "water" ? excluded : targets).push([polygon]);
    }
  } else for (const f of Object.values(d.faces)) {
    if (f.segment || f.spline && !f.spline.closed || f.freehand && !f.freehand.closed) continue;
    let points = facePoints(d, f.id);
    if (f.circle) {
      const c = f.circle, n = arcSegments(c.r, Math.PI * 2);
      points = Array.from({ length: n }, (_, i) => ({ x: c.cx + c.r * Math.cos(i * 2 * Math.PI / n), y: c.cy + c.r * Math.sin(i * 2 * Math.PI / n) }));
    } else if (f.ellipse) {
      const e = f.ellipse;
      points = ellipseWorldPts(e.cx, e.cy, e.rx, e.ry, e.rot ?? 0, arcSegments(Math.max(e.rx, e.ry), Math.PI * 2));
    }
    if (points.length < 3) continue;
    const polygon: Polygon = [ring(points), ...faceHoles(d, f.id).filter(h => h.length >= 3).map(ring)];
    if (polygon.some(r => r.some(p => !p.every(Number.isFinite)))) throw new Error("invalid-geometry");
    // A site outline is a boundary, not automatically a watered lawn.
    if (f.type === "site" && !f.hydro?.purpose && !includeImplicitSiteIrrigation) continue;
    if (layerPurpose(f) === "none") excluded.push([polygon]);
    else if (f.hydro?.method === "drip" || f.hydro?.method === "bubbler") unmodeled.push([polygon]);
    else targets.push([polygon]);
  }
  if(d)for(const points of landscapeExclusions(d))excluded.push([[ring(points)]]);
  const exclusions = unionSurfaces(excluded);
  return { target: cleanSurface(subtractSurface(unionSurfaces(targets), unionSurfaces([exclusions, ...unmodeled]))),
    unmodeled: subtractSurface(unionSurfaces(unmodeled), exclusions), excluded:exclusions };
}

function arcSegments(radius: number, angle: number) {
  const step = 2 * Math.acos(Math.max(-1, 1 - CURVE_TOLERANCE_M / Math.max(radius, CURVE_TOLERANCE_M)));
  return Math.min(8192, Math.max(12, Math.ceil(angle / Math.min(Math.PI / 90, step))));
}

/** The footprint used on the plan: sector or pressure-specific rotated strip. */
export function headSurface(h: Head, radialAllowance = 0): Surface {
  const item = catalogForHead(h);
  if (!item || !operatingGeometryAvailable(item,h) || !supportsArc(item,h.arc) || h.r<0 || (item.coverageKind === "point"||item.coverageKind === "streams") || ![h.x, h.y, h.start, h.arc, h.r].every(Number.isFinite)) return [];
  const special=specialFootprint(h);
  if(special)return h.r>0 ? [[special.map(p=>[h.x+p.x,h.y+p.y])]] : [];
  const a = h.start * Math.PI / 180;
  const transform = (x: number, y: number): [number, number] => [h.x + x * Math.cos(a) - y * Math.sin(a), h.y + x * Math.sin(a) + y * Math.cos(a)];
  if (item.strip) {
    const s = stripAtPressure(item, h.designPressure);
    if (!s) return [];
    return [[[transform(s.ox, s.oy), transform(s.ox + s.l, s.oy), transform(s.ox + s.l, s.oy + s.w), transform(s.ox, s.oy + s.w)]]];
  }
  if (h.r <= 0 || h.arc <= 0 || h.arc > 360) return [];
  const radius = h.r + radialAllowance, angle = h.arc * Math.PI / 180, n = arcSegments(radius, angle);
  const points: Ring = Array.from({ length: n + 1 }, (_, i) => transform(radius * Math.cos(i * angle / n), radius * Math.sin(i * angle / n)));
  if (h.arc < 360) points.unshift([h.x, h.y]);
  return [[points]];
}

function onSegment(p: Pt, a: number[], b: number[]) {
  const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!, length = Math.hypot(dx, dy);
  if (!length) return Math.hypot(p.x - a[0]!, p.y - a[1]!) <= GEOMETRY_EPS;
  return Math.abs(dx * (p.y - a[1]!) - dy * (p.x - a[0]!)) / length <= GEOMETRY_EPS &&
    p.x >= Math.min(a[0]!, b[0]!) - GEOMETRY_EPS && p.x <= Math.max(a[0]!, b[0]!) + GEOMETRY_EPS &&
    p.y >= Math.min(a[1]!, b[1]!) - GEOMETRY_EPS && p.y <= Math.max(a[1]!, b[1]!) + GEOMETRY_EPS;
}
function inRing(p: Pt, r: Ring) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i]!, b = r[j]!;
    if (onSegment(p, a, b)) return 2;
    if ((a[1] > p.y) !== (b[1] > p.y) && p.x < (b[0] - a[0]) * (p.y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside ? 1 : 0;
}
export function pointInSurface(p: Pt, s: Surface): boolean {
  return s.some(poly => inRing(p, poly[0]!) > 0 && poly.slice(1).every(hole => inRing(p, hole) !== 1));
}

/** Split at every boundary crossing; fixed sampling misses narrow obstacles. */
export function lineInSurface(a: Pt, b: Pt, surface: Surface): boolean {
  if (!pointInSurface(a, surface) || !pointInSurface(b, surface)) return false;
  const cuts = [0, 1], dx = b.x - a.x, dy = b.y - a.y;
  for (const polygon of surface) for (const r of polygon) for (let i = 0; i < r.length; i++) {
    const c = r[i]!, d = r[(i + 1) % r.length]!;
    const ex = d[0] - c[0], ey = d[1] - c[1], denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) < GEOMETRY_EPS) continue;
    const t = ((c[0] - a.x) * ey - (c[1] - a.y) * ex) / denominator;
    const u = ((c[0] - a.x) * dy - (c[1] - a.y) * dx) / denominator;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
  }
  cuts.sort((x, y) => x - y);
  return cuts.slice(1).every((t, i) => {
    const mid = (t + cuts[i]!) / 2;
    return pointInSurface({ x: a.x + dx * mid, y: a.y + dy * mid }, surface);
  });
}

export function sectorFaces(h: Head, p: Pt, linearTolerance=0): boolean {
  if (h.arc >= 360) return true;
  const angle = ((Math.atan2(p.y - h.y, p.x - h.x) * 180 / Math.PI - h.start) % 360 + 360) % 360;
  const angularTolerance=Math.asin(Math.min(1,linearTolerance/Math.max(GEOMETRY_EPS,Math.hypot(p.x-h.x,p.y-h.y))))*180/Math.PI+GEOMETRY_EPS;
  return angle <= h.arc + angularTolerance || 360 - angle <= angularTolerance;
}

export function surfaceBounds(surface: Surface, points: Pt[] = []) {
  const coordinates = [...points.map(p => [p.x, p.y]), ...surface.flatMap(p => p.flat())].filter(p => p.every(Number.isFinite));
  if (!coordinates.length) return null;
  return coordinates.reduce((b, p) => ({ minX: Math.min(b.minX, p[0]!), minY: Math.min(b.minY, p[1]!), maxX: Math.max(b.maxX, p[0]!), maxY: Math.max(b.maxY, p[1]!) }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}
