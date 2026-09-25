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

const PRECISE_DRAW_TOOLS = new Set(["line", "polyline", "polygon", "rect", "rotrect", "triangle", "hexagon", "circle", "ellipse", "arc", "spline", "path"]);

export function canShowMagnifier(state: {
  blocked: boolean; catalogOpen: boolean; editDrag: boolean; tool: string | null;
  drawSub: string | null; cadEditId: string | null; selectedEdgeId: string | null; draftPointCount: number;
  sectorEditId?: string | null;
}) {
  if (state.blocked) return false;
  if (state.sectorEditId && state.editDrag) return true;
  if (state.catalogOpen) return false;
  if (state.editDrag) return true;
  return state.tool === "draw" && !state.cadEditId && !state.selectedEdgeId && state.draftPointCount > 0 &&
    PRECISE_DRAW_TOOLS.has(state.drawSub ?? "");
}
