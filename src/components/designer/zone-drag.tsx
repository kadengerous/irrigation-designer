import { createContext, useContext, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GripVertical } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { isHeadLocked } from "@/lib/head-visibility";
import type { Head } from "@/lib/project-types";
import { tr } from "@/lib/i18n";

type Drag = { id: string; pointer: number; startX: number; startY: number; x: number; y: number; active: boolean; target: number | null };
const Context = createContext<{ start: (event: PointerEvent<HTMLButtonElement>, head: Head) => void; target: number | null }>({ start() {}, target: null });

/** Pointer events support mouse, touch and Pencil without changing canvas geometry. */
export function ZoneDragProvider({ children }: { children: ReactNode }) {
  const drag = useRef<Drag | null>(null);
  const beginScroll = useRef(() => {});
  const [preview, setPreview] = useState<Drag | null>(null);
  const locale = useProject(s => s.locale);
  useEffect(() => {
    const cancel = () => { drag.current = null; setPreview(null); };
    const move = (event: globalThis.PointerEvent) => {
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      current.x = event.clientX; current.y = event.clientY;
      current.active ||= Math.hypot(current.x - current.startX, current.y - current.startY) > 6;
      if (!current.active) return;
      event.preventDefault();
      const element = document.elementFromPoint(current.x, current.y);
      const target = element?.closest<HTMLElement>("[data-zone-drop-id]");
      const id = target ? Number(target.dataset.zoneDropId) : null;
      const { project } = useProject.getState();
      const head = project.heads.find(h => h.id === current.id);
      current.target = head && !isHeadLocked(head, project.zones) && project.zones.some(z => z.id === id && z.id !== head.zone && !z.locked) ? id : null;
      setPreview({ ...current });
    };
    const up = (event: globalThis.PointerEvent) => {
      if (drag.current?.pointer !== event.pointerId) return;
      move(event);
      const current = drag.current;
      if (current?.active && current.target != null) useProject.getState().transferHeadToZone(current.id, current.target);
      cancel();
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    const pointerCancel = (event: globalThis.PointerEvent) => { if (event.pointerId === drag.current?.pointer) cancel(); };
    let frame = 0;
    const scroll = () => {
      const current = drag.current;
      if (current?.active) {
        let element = document.elementFromPoint(current.x, current.y) as HTMLElement | null;
        while (element && element !== document.body) {
          if (element.scrollHeight > element.clientHeight && /auto|scroll/.test(getComputedStyle(element).overflowY)) {
            const box = element.getBoundingClientRect();
            const step = current.y < box.top + 40 ? -8 : current.y > box.bottom - 40 ? 8 : 0;
            if (step) element.scrollTop += step;
            break;
          }
          element = element.parentElement;
        }
      }
      if (drag.current) frame = requestAnimationFrame(scroll);
    };
    beginScroll.current = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(scroll); };
    document.addEventListener("pointermove", move, { passive: false, capture: true });
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", pointerCancel, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", move, true); document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", pointerCancel, true); document.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
    };
  }, []);
  return <Context.Provider value={{ target: preview?.target ?? null, start(event, head) {
    if (event.button !== 0 || isHeadLocked(head, useProject.getState().project.zones)) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: head.id, pointer: event.pointerId, startX: event.clientX, startY: event.clientY,
      x: event.clientX, y: event.clientY, active: false, target: null };
    beginScroll.current();
  } }}>
    {children}
    {preview?.active && createPortal(<div className="zone-drag-preview" style={{ left: preview.x + 14, top: preview.y + 14 }}>
      {tr(locale, "transferSprinklers")} · <bdi>{useProject.getState().project.heads.find(h => h.id === preview.id)?.catalogId}</bdi>
    </div>, document.body)}
  </Context.Provider>;
}

export function ZoneDropTarget({ id, children }: { id: number; children: ReactNode }) {
  const { target } = useContext(Context);
  return <div className="zone-drop-target" data-zone-drop-id={id} data-drop-active={target === id}>{children}</div>;
}

export function ZoneHeadGrip({ head, disabled }: { head: Head; disabled: boolean }) {
  const { start } = useContext(Context);
  const locale = useProject(s => s.locale);
  return <button type="button" className="zone-head-grip" disabled={disabled} title={tr(locale, "transferSprinklers")}
    aria-label={tr(locale, "moveItem", { name: head.catalogId })} onPointerDown={event => start(event, head)}
    onClick={event => event.stopPropagation()}><GripVertical size={18}/></button>;
}
