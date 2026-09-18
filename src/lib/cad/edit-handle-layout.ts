import type { Pt } from "@/lib/geometry";

/** A screen-sized stem continuing from a boundary anchor away from the pivot. */
export function rotationHandleLayout(anchor: Pt, center: Pt, pxPerMeter: number, gapPx = 34) {
  const dx = anchor.x - center.x, dy = anchor.y - center.y;
  const length = Math.hypot(dx, dy);
  const ux = length > 1e-9 ? dx / length : 0;
  const uy = length > 1e-9 ? dy / length : -1;
  const gap = gapPx / Math.max(pxPerMeter, 1e-6);
  return {
    point: { x: anchor.x + ux * gap, y: anchor.y + uy * gap },
    rotation: Math.atan2(uy, ux) * 180 / Math.PI + 90,
  };
}
