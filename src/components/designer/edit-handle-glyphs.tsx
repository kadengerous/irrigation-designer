import { useEffect, useRef, useSyncExternalStore } from "react";
import type Konva from "konva";
import { Circle, Group, Line } from "react-konva";

export const EDIT_HANDLE_COLOR = "#e8892f";
export const SELECTION_OUTLINE_COLOR = "#62a5e8";
export const EDIT_OUTLINE_COLOR = "#3f83c6";
export const ROTATION_STEM_PX = 34;

let activeHandle: Konva.Node | null = null;
const listeners = new Set<() => void>();
const subscribe = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };
const activate = (node: Konva.Node | null) => { activeHandle=node; listeners.forEach(fn=>fn()); };
function useActiveHandle(fallback=false) {
  const ref=useRef<Konva.Group>(null);
  const selected=useSyncExternalStore(subscribe,()=>activeHandle,()=>null);
  useEffect(()=>{
    const parent=ref.current?.getParent();
    if(!parent) return;
    const select=(event: Konva.KonvaEventObject<Event>)=>{
      if ('touches' in event.evt && (event.evt as TouchEvent).touches.length>1) return;
      activate(parent);
    };
    parent.on('pointerdown.activeHandle mousedown.activeHandle touchstart.activeHandle dragstart.activeHandle',select);
    return ()=>{ parent.off('.activeHandle'); if(activeHandle===parent) activate(null); };
  },[]);
  return {ref,active:selected ? selected===ref.current?.getParent() : fallback};
}

const cornerMarks = [
  [-9, -4, -9, -9, -4, -9], [4, -9, 9, -9, 9, -4],
  [9, 4, 9, 9, 4, 9], [-4, 9, -9, 9, -9, 4],
];

/** Decorative only: the parent retains its larger touch target and drag handler. */
export function EditPointGlyph({ corner = false, active = false, radius = 4.5 }: {
  corner?: boolean; active?: boolean; radius?: number;
}) {
  const handle=useActiveHandle(active);
  const color = handle.active ? "#cf2f2f" : EDIT_HANDLE_COLOR;
  return <Group ref={handle.ref} name="edit-point-glyph" listening={false}>
    {corner && cornerMarks.map((points, i) => <Line key={i} points={points} stroke={color} strokeWidth={0.9} lineCap="round" listening={false} />)}
    <Circle radius={radius} fill={color} stroke="#fff" strokeWidth={1.3} listening={false} />
  </Group>;
}

const arc = Array.from({ length: 37 }, (_, i) => {
  const a = (35 + i * 280 / 36) * Math.PI / 180;
  return [8 * Math.cos(a), 8 * Math.sin(a)];
}).flat();

export function RotationHandleGlyph({ stem = true }: { stem?: boolean }) {
  const handle=useActiveHandle();
  const color=handle.active ? "#cf2f2f" : EDIT_HANDLE_COLOR;
  return <Group ref={handle.ref} listening={false}>
    {stem && <Line points={[0, 12, 0, ROTATION_STEM_PX]} stroke={color} strokeWidth={1.1} lineCap="round" listening={false} />}
    <Line points={arc} stroke={color} strokeWidth={1.3} lineCap="round" listening={false} />
    <Line points={[5.66, -10, 5.66, -5.66, 1.3, -5.66]} stroke={color} strokeWidth={1.3} lineCap="round" lineJoin="round" listening={false} />
  </Group>;
}
