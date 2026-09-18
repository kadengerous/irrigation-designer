import { dist, type Pt } from "@/lib/geometry";
import { nearestFaceBoundary } from "./engine";
import { cadSnap } from "./snap";
import type { CadDrawing, SnapHit } from "./types";

/** A grid/alignment inference must not claim contact with actual drawing geometry. */
export function isDimensionGeometrySnap(kind?: string): boolean {
  return kind != null && ["end", "mid", "intersect", "center", "tangent", "edge"].includes(kind);
}

export function snapDimension(p: Pt, drawing: CadDrawing, options: {
  pxPerMeter: number; pointerType?: string; snapOn: boolean; snapGridOn: boolean; gridStep: number;
}): SnapHit {
  if (!options.snapOn) return {pt:p,kind:"none"};
  const hit = cadSnap(p,drawing,{...options,snapGridOn:false});
  if (["end","mid","intersect","center","tangent"].includes(hit.kind)) return hit;
  const tolerance = (options.pointerType === "touch" ? 22 : options.pointerType === "pen" ? 14 : 12) / Math.max(options.pxPerMeter,1);
  const edge = nearestFaceBoundary(drawing,p,tolerance);
  if (edge) return {pt:edge.pt,kind:"edge",faceId:edge.faceId};
  if (hit.kind !== "none") return hit;
  if (!options.snapGridOn || options.gridStep <= 0) return hit;
  const step = options.gridStep;
  const candidates = [
    {x:Math.round(p.x/step)*step || 0,y:Math.round(p.y/step)*step || 0},
    {x:(Math.floor(p.x/step)+0.5)*step,y:(Math.floor(p.y/step)+0.5)*step},
  ];
  candidates.sort((a,b) => dist(a,p)-dist(b,p));
  const nearest = candidates[0]!;
  return dist(nearest,p) <= Math.min(tolerance,step*0.4) ? {pt:nearest,kind:"grid"} : hit;
}
