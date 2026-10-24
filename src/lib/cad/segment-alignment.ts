import type { Pt } from "@/lib/geometry";
import type { CadDrawing } from "./types";
import { layerForType } from "./types";
import { faceVertices } from "./engine";

export type SegmentAlignmentGuide = {
  axis: "horizontal" | "vertical";
  anchor: Pt;
  projection: Pt;
  point: Pt;
  aligned: boolean;
};

/** Render-only references. Never add vertices, edges or constraints to the drawing. */
export function segmentAlignmentAnchors(
  drawing: CadDrawing,
  fixed: Pt,
  excludeFaceId?: string,
  excludeEdgeId?: string,
  extraPoints: readonly Pt[] = [],
): Pt[] {
  const anchors = new Map<string, Pt>();
  const add = (point: Pt) => {
    if (Number.isFinite(point.x) && Number.isFinite(point.y)) {
      anchors.set(`${point.x}:${point.y}`, point);
    }
  };
  add(fixed);
  extraPoints.forEach(add);
  const boundaryEdges = new Set<string>();
  for (const face of Object.values(drawing.faces)) {
    for (const half of [...face.outer, ...face.holes.flat()]) boundaryEdges.add(half.e);
    if (face.hidden || face.id === excludeFaceId || drawing.layers?.[layerForType(face.type)]?.visible === false) continue;
    // Use actual control points/corners, never the tessellated perimeter of round shapes.
    if (face.circle || face.ellipse || face.freehand) continue;
    (face.spline?.pts ?? faceVertices(drawing, face.id)).forEach(add);
  }
  // Also support older drawings whose standalone segments still use CAD edges.
  for (const edge of Object.values(drawing.edges)) {
    if (edge.id === excludeEdgeId || boundaryEdges.has(edge.id) || edge.faceL || edge.faceR || Math.abs(edge.bulge) > 1e-6) continue;
    const a = drawing.vertices[edge.a], b = drawing.vertices[edge.b];
    if (a) add(a);
    if (b) add(b);
  }
  return [...anchors.values()];
}

/** At most one reference per axis, with a zoom-independent approach distance. */
export function segmentAlignmentGuides(point: Pt, anchors: readonly Pt[], pxPerMeter: number): SegmentAlignmentGuide[] {
  if (!Number.isFinite(pxPerMeter) || pxPerMeter <= 0 || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return [];
  const guides: SegmentAlignmentGuide[] = [];
  for (const axis of ["horizontal", "vertical"] as const) {
    const coordinate = axis === "horizontal" ? "y" : "x";
    const along = axis === "horizontal" ? "x" : "y";
    let best: { anchor: Pt; error: number; span: number } | null = null;
    for (const anchor of anchors) {
      const error = Math.abs(point[coordinate] - anchor[coordinate]);
      const span = Math.abs(point[along] - anchor[along]);
      const joined = error <= 1e-7 && span <= 1e-7;
      if (!Number.isFinite(error) || !Number.isFinite(span) || error * pxPerMeter > 32 || (span * pxPerMeter < 10 && !joined)) continue;
      if (!best || error < best.error - 1e-9 || Math.abs(error - best.error) <= 1e-9 && span < best.span) {
        best = { anchor, error, span };
      }
    }
    if (!best) continue;
    guides.push({ axis, anchor: best.anchor, point,
      projection: axis === "horizontal" ? { x: point.x, y: best.anchor.y } : { x: best.anchor.x, y: point.y },
      // Colour describes the actual shown geometry, not rounded measurements
      // or a generous screen-pixel snapping threshold.
      aligned: best.error <= 1e-7,
    });
  }
  return guides;
}

/** Capture a nearby reference axis exactly, before grid rounding can pull it away. */
export function snapSegmentAlignment(raw: Pt, fallback: Pt, anchors: readonly Pt[], px: number, tolerancePx=6): Pt {
  const point = { ...fallback };
  for (const guide of segmentAlignmentGuides(raw, anchors, px)) {
    const coordinate = guide.axis === "horizontal" ? "y" : "x";
    if (Math.abs(raw[coordinate] - guide.anchor[coordinate]) * px <= tolerancePx) {
      point[coordinate] = guide.anchor[coordinate];
    }
  }
  return point;
}
