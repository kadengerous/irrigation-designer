import type { Head, Project, Zone } from "./project-types";

/** Presentation flags never remove installed equipment from hydraulic or cost calculations. */
export function isHeadVisible(head: Head, zones: readonly Zone[]): boolean {
  return !head.hidden && !zones.some(zone => zone.id === head.zone && zone.hidden);
}

export function visibleProjectHeads(project: Pick<Project, "heads" | "zones">): Head[] {
  const hiddenZones = new Set(project.zones.filter(zone => zone.hidden).map(zone => zone.id));
  return project.heads.filter(head => !head.hidden && !hiddenZones.has(head.zone));
}

export function isHeadLocked(head: Head, zones: readonly Zone[]): boolean {
  return head.locked || zones.some(zone => zone.id === head.zone && zone.locked);
}

/** Canvas-only order: focused equipment is painted last; project order stays intact. */
export function headPaintOrder(heads: readonly Head[], selectedIds: readonly string[], focusedId?: string | null): Head[] {
  const selected = new Set(selectedIds);
  const priority = (head: Head) => head.id === focusedId ? 2 : selected.has(head.id) ? 1 : 0;
  return [...heads].sort((a, b) => priority(a) - priority(b) || b.r - a.r);
}
