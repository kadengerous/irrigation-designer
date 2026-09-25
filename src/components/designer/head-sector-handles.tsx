import { useEffect, useRef, useState, type RefObject } from "react";
import type Konva from "konva";
import { Circle, Group, Line, Text } from "react-konva";
import { useProject, drawingForEditing } from "@/lib/project-store";
import { itemById } from "@/lib/hunter-catalog";
import { snapSprinklerPoint } from "@/lib/head-snapping";
import { HEAD_CONTROL_COLORS, sectorDrag, sectorHandlePoints, type SectorHandle } from "@/lib/head-sector-edit";
import type { Head } from "@/lib/project-types";
import type { Pt } from "@/lib/geometry";
import { RotationHandleGlyph } from "./edit-handle-glyphs";
import { frameUpdate } from "@/lib/frame-update";
import { SprinklerGuides } from './sprinkler-placement-guides';
import { visibleProjectHeads } from '@/lib/head-visibility';

export function HeadSectorHandles({ head, px, panX, panY, editDrag, gestureBlocked, skipClick, onCenterDragChange, diagnostic = false }: {
  head: Head; px: number; panX: number; panY: number;
  editDrag: RefObject<boolean>; gestureBlocked: RefObject<boolean>; skipClick: RefObject<boolean>;
  onCenterDragChange: (active: boolean) => void;
  diagnostic?: boolean;
}) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const [active, setActive] = useState<SectorHandle | "center" | null>(null);
  const [snapPoint, setSnapPoint] = useState<Pt | null>(null);
  useEffect(()=>{
    if(active!=='center')return;
    document.documentElement.dataset.sprinklerPlacement='true';
    return()=>{delete document.documentElement.dataset.sprinklerPlacement;};
  },[active]);
  useEffect(() => () => { cleanupRef.current?.(); }, []);
  const item = itemById(head.catalogId);
  if (!item) return null;
  const handles = sectorHandlePoints(head, item, px);

  const begin = (kind: SectorHandle | "center", point: Pt, e: Konva.KonvaEventObject<PointerEvent>) => {
    const event = e.evt;
    if (event.button !== 0 || editDrag.current || gestureBlocked.current || useProject.getState().spaceDown) return;
    e.cancelBubble = true;
    event.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    if (diagnostic) useProject.getState().setSectorEdit(head.id);
    const rect = stage.container().getBoundingClientRect();
    const world = (ev: PointerEvent) => ({ x: ((ev.clientX - rect.left) * stage.width() / rect.width - panX) / px,
      y: ((ev.clientY - rect.top) * stage.height() / rect.height - panY) / px });
    const initial = world(event), offset = { x: initial.x - point.x, y: initial.y - point.y };
    const update = sectorDrag(head, kind, point, item);
    let moved = false, finished = false;
    editDrag.current = true;
    setActive(kind);
    if (kind === "center") onCenterDragChange(true);
    useProject.getState().beginHeadEdit();
    const finish = (cancel = false) => {
      if (finished) return;
      if (cancel) updates.cancel();
      else updates.flush();
      finished = true;
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancelEvent, true);
      window.removeEventListener("pointerdown", anotherPointer, true);
      window.removeEventListener("blur", cancelEvent);
      window.removeEventListener("keydown", key, true);
      editDrag.current = false;
      cleanupRef.current = null;
      setActive(null); setSnapPoint(null);
      if (kind === "center") onCenterDragChange(false);
      if (cancel || !moved) useProject.getState().cancelHeadEdit();
      else useProject.getState().endHeadEdit();
      skipClick.current = true;
      window.setTimeout(() => { skipClick.current = false; }, 500);
    };
    const updates = frameUpdate<PointerEvent>(ev => {
      const st = useProject.getState(), raw = world(ev);
      if (st.sectorEditId !== head.id) { finish(true); return; }
      const hit = kind==='center' ? snapSprinklerPoint({ x: raw.x - offset.x, y: raw.y - offset.y }, drawingForEditing(st.project), {
        pxPerMeter: px, pointerType: event.pointerType, snapOn: st.snapOn,
        snapGridOn:st.snapGridOn,gridStep:st.gridStep,heads:visibleProjectHeads(st.project),excludeHead:head.id,
      }) : {pt:raw,kind:'none'};
      st.patchHeadLive(head.id, update(hit.pt));
      setSnapPoint(kind==='center' ? hit.pt : null);
    });
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== event.pointerId) return;
      if (gestureBlocked.current) { finish(true); return; }
      ev.preventDefault();
      moved ||= Math.hypot(ev.clientX - event.clientX, ev.clientY - event.clientY) > 2;
      if (moved) updates.push(ev);
    };
    const up = (ev: PointerEvent) => { if (ev.pointerId === event.pointerId) { move(ev); finish(gestureBlocked.current); } };
    const cancelEvent = () => finish(true);
    const anotherPointer = (ev: PointerEvent) => { if (ev.pointerId !== event.pointerId) finish(true); };
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopImmediatePropagation(); finish(true); } };
    cleanupRef.current = cancelEvent;
    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancelEvent, true);
    window.addEventListener("pointerdown", anotherPointer, true);
    window.addEventListener("blur", cancelEvent);
    window.addEventListener("keydown", key, true);
  };
  return <Group name="head-sector-controls">
    <Group name="magnifier-symbol sector-edit-handle sector-edit-center" x={head.x * px + panX} y={head.y * px + panY}
      onPointerDown={e => begin("center", { x: head.x, y: head.y }, e)}
      onClick={e => { e.cancelBubble = true; }} onTap={e => { e.cancelBubble = true; }}>
      <Circle radius={22} fill="rgba(255,255,255,.001)"/>
      {active === "center" && <Circle radius={16} stroke="#3185c8" strokeWidth={1.3} listening={false}/>}
    </Group>
    {handles.map(({ kind, point }) => {
      const color = HEAD_CONTROL_COLORS[kind === "start" || kind === "end" ? "sector" : kind];
      return <Group key={kind}>
      <Line points={[head.x * px + panX, head.y * px + panY, point.x * px + panX, point.y * px + panY]}
        stroke={color} strokeWidth={.8} dash={kind === "rotation" ? [3, 4] : undefined} listening={false}/>
      <Group name="magnifier-symbol sector-edit-handle" x={point.x * px + panX} y={point.y * px + panY}
        onPointerDown={e => begin(kind, point, e)} onClick={e => { e.cancelBubble = true; }} onTap={e => { e.cancelBubble = true; }}>
        <Circle radius={20} fill="rgba(255,255,255,.001)"/>
        {active === kind && <Circle radius={kind === "rotation" ? 13 : 10} stroke={color} strokeWidth={1} opacity={.5} listening={false}/>}
        {kind === "rotation" ? <RotationHandleGlyph stem={false} color={color}/> : <>
          <Circle radius={active === kind ? 7 : 6} fill={color} stroke="#fff" strokeWidth={1.3} listening={false}/>
          <Text x={-15} y={-23} width={30} align="center" text={kind === "radius" ? "R" : "∠"} fontSize={12}
            fill={color} stroke="#fff" strokeWidth={2} fillAfterStrokeEnabled listening={false}/>
        </>}
      </Group>
    </Group>;
    })}
    {snapPoint && <SprinklerGuides point={snapPoint} px={px} panX={panX} panY={panY} excludeHead={head.id}/>}
  </Group>;
}
