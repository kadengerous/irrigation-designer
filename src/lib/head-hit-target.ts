import type { Pt } from "@/lib/geometry";
import type { Head, Zone } from "@/lib/project-types";

export const HEAD_MOUSE_HIT_RADIUS = 18;

/** Use the raw pointer, never a snapped drawing point, for the center's mouse target. */
export function headAtPointer(heads: readonly Head[], zones: readonly Zone[], point: Pt, pxPerMeter: number): string | null {
  if (!(pxPerMeter > 0)) return null;
  const unavailable = new Set(zones.filter(zone => zone.hidden || zone.locked).map(zone => zone.id));
  let nearest: string | null = null;
  let distance = HEAD_MOUSE_HIT_RADIUS;
  for (const head of heads) {
    if (head.locked || unavailable.has(head.zone)) continue;
    const next = Math.hypot(head.x - point.x, head.y - point.y) * pxPerMeter;
    if (next <= distance) { nearest = head.id; distance = next; }
  }
  return nearest;
}
