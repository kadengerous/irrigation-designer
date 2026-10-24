import type { Pt } from "@/lib/geometry";
import { SkeletonBuilder } from "straight-skeleton";

// The pinned solver groups simultaneous wavefront events through this tolerance.
// Use a separate constructor: 1e-7 on our 100-unit footprint absorbs roundoff from
// rotated/panned canvas points without changing the package's default builder.
class RoofSkeleton extends SkeletonBuilder {}
Object.defineProperty(RoofSkeleton, "SplitEpsilon", { value: 1e-7 });

export type RoofLayout = { planes: Pt[][]; ribs: [Pt, Pt][]; angles: number[]; eaves: [Pt, Pt][] };

/** Four equal-pitch slopes in the material's local rectangular frame. */
export function hipRoof(width: number, height: number): RoofLayout | null {
  if (!Number.isFinite(width + height) || width <= 1e-8 || height <= 1e-8) return null;
  const a = { x: 0, y: 0 }, b = { x: width, y: 0 };
  const c = { x: width, y: height }, d = { x: 0, y: height };
  const horizontal = width >= height;
  const inset = Math.min(width, height) / 2;
  const p = { x: inset, y: inset };
  const q = horizontal ? { x: width - inset, y: inset } : { x: inset, y: height - inset };
  const planes: Pt[][] = horizontal
    ? [[a, b, q, p], [b, c, q], [c, d, p, q], [d, a, p]]
    : [[a, b, p], [b, c, q, p], [c, d, q], [d, a, p, q]];
  return {
    planes: planes.map(points => points.filter((point, i) =>
      i === 0 || point.x !== points[i - 1]!.x || point.y !== points[i - 1]!.y)),
    ribs: [[a, p], [b, horizontal ? q : p], [c, q], [d, horizontal ? p : q], [p, q]] as [Pt, Pt][],
    angles: [0, 90, 180, -90],
    eaves: [[a, b], [b, c], [c, d], [d, a]],
  };
}

/** A greenhouse has two slopes and a full-length ridge, without end hips. */
export function gableRoof(width: number, height: number): RoofLayout | null {
  if (!Number.isFinite(width + height) || width <= 1e-8 || height <= 1e-8) return null;
  const a = { x: 0, y: 0 }, b = { x: width, y: 0 }, c = { x: width, y: height }, d = { x: 0, y: height };
  const horizontal = width >= height;
  const p = horizontal ? { x: 0, y: height / 2 } : { x: width / 2, y: 0 };
  const q = horizontal ? { x: width, y: height / 2 } : { x: width / 2, y: height };
  return { planes: horizontal ? [[a, b, q, p], [p, q, c, d]] : [[a, p, q, d], [p, b, c, q]],
    ribs: [[p, q]], angles: horizontal ? [0, 180] : [-90, 90],
    eaves: horizontal ? [[a, b], [c, d]] : [[d, a], [b, c]] };
}

const area = (ring: Pt[]) => ring.reduce((sum, a, i) => {
  const b = ring[(i + 1) % ring.length]!; return sum + a.x * b.y - b.x * a.y;
}, 0) / 2;
const cross = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const near = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-7;

function cleanRing(input: Pt[]): Pt[] {
  const ring = input.filter((p, i) => !i || !near(p, input[i - 1]!)).map(p => ({ ...p }));
  if (ring.length > 1 && near(ring[0]!, ring[ring.length - 1]!)) ring.pop();
  for (let i = 0; ring.length > 3 && i < ring.length; i++) {
    const a = ring[(i + ring.length - 1) % ring.length]!, b = ring[i]!, c = ring[(i + 1) % ring.length]!;
    if (Math.abs(cross(a, b, c)) < 1e-7 && (b.x - a.x) * (b.x - c.x) + (b.y - a.y) * (b.y - c.y) <= 1e-7) {
      ring.splice(i, 1); i = -1;
    }
  }
  return ring;
}

// Cache normalized footprints, so panning, zooming and uniform resizing do not rerun the solver.
const layouts = new Map<string, RoofLayout | null>();

/** Equal-pitch hip roof over the actual walls, including reflex corners and courtyards. */
export function polygonHipRoof(outer: Pt[], holes: Pt[][] = []): RoofLayout | null {
  if (outer.length < 3 || [outer, ...holes].some(ring => ring.some(p => !Number.isFinite(p.x + p.y)))) return null;
  const minX = Math.min(...outer.map(p => p.x)), minY = Math.min(...outer.map(p => p.y));
  const extent = Math.max(...outer.map(p => p.x - minX), ...outer.map(p => p.y - minY));
  if (extent <= 1e-8) return null;
  const scale = 100 / extent;
  const rings = [outer, ...holes].map(ring => cleanRing(ring.map(p => ({ x: (p.x - minX) * scale, y: (p.y - minY) * scale }))));
  if (rings.some(ring => ring.length < 3 || Math.abs(area(ring)) < 1e-7)) return null;
  const key = rings.map(ring => ring.map(p => `${p.x.toFixed(7)},${p.y.toFixed(7)}`).join(";")).join("|");
  if (!layouts.has(key)) {
    let layout: RoofLayout | null = null;
    try {
      const result = RoofSkeleton.BuildFromGeoJSON([rings.map(ring => ring.map(p => [p.x, p.y] as [number, number]))]);
      const planes: Pt[][] = [], angles: number[] = [], eaves: [Pt, Pt][] = [], ribs = new Map<string, [Pt, Pt]>();
      for (const face of result.Edges) {
        const points = Array.from(face.Polygon, p => ({ x: p.X, y: p.Y }));
        const a = { x: face.Edge.Begin.X, y: face.Edge.Begin.Y }, b = { x: face.Edge.End.X, y: face.Edge.End.Y };
        if (points.length < 3 || Math.abs(area(points)) < 1e-8) continue;
        planes.push(points); angles.push(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI); eaves.push([a, b]);
        const onEave = (p: Pt) => Math.abs(cross(a, b, p)) < 1e-6;
        for (let i = 0; i < points.length; i++) {
          const p = points[i]!, q = points[(i + 1) % points.length]!;
          if (near(p, q) || (onEave(p) && onEave(q))) continue;
          const edgeKey = [p, q].map(v => `${v.x.toFixed(6)},${v.y.toFixed(6)}`).sort().join("|");
          ribs.set(edgeKey, [p, q]);
        }
      }
      const expected = Math.abs(area(rings[0]!)) - rings.slice(1).reduce((sum, ring) => sum + Math.abs(area(ring)), 0);
      const actual = planes.reduce((sum, ring) => sum + Math.abs(area(ring)), 0);
      if (expected > 0 && Number.isFinite(actual) && Math.abs(actual - expected) < Math.max(1e-5, expected * 1e-6)
        && planes.every(ring => ring.every(p => Number.isFinite(p.x + p.y)))) {
        layout = { planes, angles, eaves, ribs: [...ribs.values()] };
      }
    } catch {
      // Incomplete or degenerate contours retain their material, without taking down the plan.
    }
    if (layouts.size >= 128) layouts.delete(layouts.keys().next().value!);
    layouts.set(key, layout);
  }
  const layout = layouts.get(key);
  if (!layout) return null;
  const restore = (p: Pt) => ({ x: p.x / scale + minX, y: p.y / scale + minY });
  return { planes: layout.planes.map(ring => ring.map(restore)), angles: layout.angles,
    eaves: layout.eaves.map(([a, b]) => [restore(a), restore(b)]),
    ribs: layout.ribs.map(([a, b]) => [restore(a), restore(b)]) };
}
