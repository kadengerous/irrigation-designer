import { ellipseBoundaryGridAnchors, snapDeltaToAngle, snapShapeTranslationToGrid, type Pt } from "@/lib/geometry";
import { facePoints, layerFaceIds } from "./engine";
import type { CadDrawing } from "./types";

/** Use each member's real boundary, including the exact extents of round shapes. */
export function layerGridAnchors(d: CadDrawing, faceId: string): Pt[] {
  return layerFaceIds(d, faceId).flatMap(id => {
    const face = d.faces[id]!;
    if (face.circle) {
      const { cx, cy, r } = face.circle;
      return ellipseBoundaryGridAnchors(cx, cy, r, r);
    }
    if (face.ellipse) {
      const { cx, cy, rx, ry, rot } = face.ellipse;
      return ellipseBoundaryGridAnchors(cx, cy, rx, ry, rot ?? 0);
    }
    const points = facePoints(d, id);
    return points.flatMap((point, index) => {
      const next = points[(index + 1) % points.length]!;
      return [point, { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }];
    });
  });
}

export function snapLayerTransform(
  d: CadDrawing,
  faceId: string,
  mode: "move" | "rotate",
  change: { dx: number; dy: number; angle: number },
  options: { snapOn: boolean; snapGridOn: boolean; gridStep: number; pxPerMeter: number },
) {
  if (!options.snapOn || !options.snapGridOn) return change;
  if (Math.abs(change.dx) + Math.abs(change.dy) + Math.abs(change.angle) < 1e-9) return change;
  if (mode === "rotate") {
    return { ...change, angle: snapDeltaToAngle(d.faces[faceId]?.layerAngle ?? 0, change.angle, 45, 10) };
  }
  return { ...change, ...snapShapeTranslationToGrid(
    layerGridAnchors(d, faceId), change.dx, change.dy, options.gridStep, options.pxPerMeter,
  ) };
}
