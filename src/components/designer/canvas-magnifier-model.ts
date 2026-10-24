import type { Pt } from "@/lib/geometry";
import { hexagonFromBounds } from "@/lib/cad/engine";

export const MAGNIFIER_ZOOM = 5;

/** Actual lens strokes stay between 0.5 and 1.3 CSS pixels, independently of scene zoom. */
export function magnifierStrokeWidth(width: number, scale: number) {
  return Math.max(0.5, Math.min(1.3, width * 0.75)) / Math.max(1e-6, scale);
}

/** Keep the compact lens at the right edge, just below any overlaid tool/layer panels. */
export function magnifierLayout(width: number, height: number, topInset = 0) {
  const edge = 2;
  const top = Math.max(0, topInset) + 4;
  const size = Math.max(0, Math.min(100, width - edge * 2, height - top - edge));
  if (size < 64) return null;
  return { left: width - size - edge, top, size };
}

const PRECISE_DRAW_TOOLS = new Set(["line", "polyline", "polygon", "rect", "rotrect", "triangle", "hexagon", "circle", "ellipse", "arc", "spline", "path", "freehand", "dim", "cut"]);

export function canShowMagnifier(state: {
  blocked: boolean; catalogOpen: boolean; editDrag: boolean; tool: string | null;
  drawSub: string | null; cadEditId: string | null; selectedEdgeId: string | null; draftPointCount: number;
  sectorEditId?: string | null; measureSub?: string | null;
  placementActive?: boolean; landscapeTransform?: boolean;
}) {
  if (state.blocked || state.landscapeTransform) return false;
  if (state.placementActive) return true;
  if (state.sectorEditId && state.editDrag) return true;
  if (state.catalogOpen) return false;
  if (state.editDrag) return true;
  if (state.tool === "measure") return state.measureSub === "measure";
  return state.tool === "draw" && !state.cadEditId && !state.selectedEdgeId && (state.draftPointCount > 0 || state.drawSub === "dim") &&
    PRECISE_DRAW_TOOLS.has(state.drawSub ?? "");
}

/** Focus on the actual outline, rather than an empty corner of its construction box. */
export function constructionMagnifierFocus(tool: string | null, origin: Pt | null, pointer: Pt): Pt {
  if (!origin) return pointer;
  const distance = (p: Pt) => (p.x-pointer.x)**2 + (p.y-pointer.y)**2;
  if (tool === "hexagon") return hexagonFromBounds(origin, pointer).reduce((a,b) => distance(a) <= distance(b) ? a : b);
  if (tool === "ellipse") {
    const rx = Math.max(0.02, Math.abs(pointer.x-origin.x)), ry = Math.max(0.02, Math.abs(pointer.y-origin.y));
    const sx = pointer.x < origin.x ? -1 : 1, sy = pointer.y < origin.y ? -1 : 1;
    const point = (angle: number) => ({x:origin.x+sx*rx*Math.cos(angle), y:origin.y+sy*ry*Math.sin(angle)});
    let lo=0, hi=Math.PI/2;
    for(let i=0;i<48;i++) {
      const a=lo+(hi-lo)/3, b=hi-(hi-lo)/3;
      if(distance(point(a)) < distance(point(b))) hi=b; else lo=a;
    }
    return point((lo+hi)/2);
  }
  return pointer;
}
