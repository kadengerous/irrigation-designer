import {clampArc,supportsArc,type CatalogItem} from "./equipment-catalog";
import type { Head } from "./project-types";
import type { Pt } from "./geometry";
import { headParameterRanges } from "./head-adjustment";

export type SectorHandle = "radius" | "start" | "end" | "rotation";
export const HEAD_CONTROL_COLORS = { radius: "#e67a2e", sector: "#2a9d5c", rotation: "#7b3fd0" } as const;
const normalize = (angle: number) => ((angle % 360) + 360) % 360;
const bearing = (head: Pt, point: Pt) => Math.atan2(point.y - head.y, point.x - head.x) * 180 / Math.PI;
export function sectorPoint(head: Pt, radius: number, angle: number): Pt {
  return { x: head.x + radius * Math.cos(angle * Math.PI / 180), y: head.y + radius * Math.sin(angle * Math.PI / 180) };
}

/** Unwrap successive pointer angles so crossing north/zero never flips the sector. */
export function sectorDrag(head: Head, kind: SectorHandle | "center", start: Pt, item: Pick<CatalogItem, "arcMin" | "arcMax" | "allowedArcRanges">) {
  let previous = bearing(head, start), delta = 0;
  const initialDistance = Math.hypot(start.x - head.x, start.y - head.y);
  return (point: Pt): Partial<Head> => {
    if (kind === "center") return { x: head.x + point.x - start.x, y: head.y + point.y - start.y };
    if (kind === "radius") return { r: Math.max(0, head.r + Math.hypot(point.x - head.x, point.y - head.y) - initialDistance) };
    if (Math.hypot(point.x - head.x, point.y - head.y) < 1e-6) return {};
    const angle = bearing(head, point);
    delta += normalize(angle - previous + 180) - 180;
    previous = angle;
    if (kind === "rotation") return { start: normalize(head.start + delta) };
    const arc = clampArc(item as CatalogItem,head.arc + (kind === "start" ? -delta : delta));
    return kind === "start" ? { arc, start: normalize(head.start + head.arc - arc) } : { arc };
  };
}

export function sectorHandlePoints(head: Head, item: CatalogItem, px: number) {
  if (item.coverageKind === "point") return [];
  const handles: { kind: SectorHandle; point: Pt }[] = [];
  const middle = item.strip ? head.start : head.start + head.arc / 2;
  if (!item.strip) handles.push({ kind: "radius", point: sectorPoint(head, head.r, middle) });
  if (!item.strip && item.arcMin < item.arcMax) {
    handles.push({ kind: "start", point: sectorPoint(head, head.r, head.start) });
    handles.push({ kind: "end", point: sectorPoint(head, head.r + (head.arc > 345 ? 28 / px : 0), head.start + head.arc) });
  }
  if (item.strip || item.coverageKind==='square' || item.arcMin < 360) handles.push({ kind: "rotation", point: sectorPoint(head, head.r + 42 / px, middle) });
  return handles;
}

/** Snap the rendered handle, preserving the opposite sector boundary. */
export function sectorSnapPatch(head:Head, kind:SectorHandle, patch:Partial<Head>, target:Pt,
  item:Pick<CatalogItem,"arcMin"|"arcMax"|"rMin"|"rMax"|"allowedArcRanges">&Partial<CatalogItem>):Partial<Head>|null {
  if(kind==='rotation')return null;
  const r=Math.hypot(target.x-head.x,target.y-head.y);
  let candidate:Partial<Head>={...patch,r};
  if(kind!=='radius'){
    const angle=normalize(bearing(head,target));
    const opposite=kind==='start'?head.start+head.arc:head.start;
    let arc=normalize(kind==='start'?opposite-angle:angle-opposite);
    if(arc<1e-8 && (patch.arc ?? head.arc)>180)arc=360;
    if(!supportsArc(item as CatalogItem,arc))return null;
    candidate={...candidate,arc,...(kind==='start'?{start:angle}:{})};
  }
  const range=item.nozzles?headParameterRanges(item as CatalogItem,{...head,...candidate}).radius:null;
  if(r<(range?.min??item.rMin)-1e-8 || r>(range?.max??item.rMax)+1e-8)return null;
  return candidate;
}
