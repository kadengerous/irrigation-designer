import { clampPxPerMeter } from "@/lib/geometry";

export type CanvasView = { pxPerMeter: number; panX: number; panY: number };

/** Keep the world point under the mouse stationary, including at zoom limits. */
export function zoomCanvasAt(view: CanvasView, x: number, y: number, nextScale: number): CanvasView {
  const pxPerMeter = clampPxPerMeter(nextScale);
  const worldX = (x - view.panX) / view.pxPerMeter;
  const worldY = (y - view.panY) / view.pxPerMeter;
  return { pxPerMeter, panX: x - worldX * pxPerMeter, panY: y - worldY * pxPerMeter };
}

export function wheelCanvasView(view: CanvasView, x: number, y: number, deltaY: number, deltaMode: number, viewportHeight: number, pinch = false) {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? viewportHeight : 1;
  const exponent = Math.max(-1, Math.min(1, -deltaY * unit * (pinch ? 0.01 : 0.002)));
  return zoomCanvasAt(view, x, y, view.pxPerMeter * Math.exp(exponent));
}
