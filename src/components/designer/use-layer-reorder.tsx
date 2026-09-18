import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type MouseEvent, type TouchEvent, type KeyboardEvent } from "react";
import { GripVertical } from "lucide-react";
import { layerReorderLayout, layerReorderScroll, type ReorderRow } from "./layer-reorder-layout";

type Gesture = {
  id: string; pointer: number; startY: number; x: number; y: number; ready: boolean; moved: boolean;
  rows: ReorderRow[]; ids: string[]; timer: ReturnType<typeof setTimeout>;
  scroll: HTMLElement | null; startScroll: number; maxScroll: number; lastFrame: number;
};
type Preview = { id: string; ids: string[]; offsets: Record<string, number> };

/** DOM order stays fixed until drop; only transforms move during the gesture. */
export function useLayerReorder(ids: string[], commit: (ids: string[]) => void) {
  const node = useRef<HTMLElement | null>(null);
  const setNode = useCallback((el: HTMLElement | null) => { node.current = el; }, []);
  const [preview, setPreview] = useState<Preview | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef(0);
  const suppressClick = useRef(0);
  const commitRef = useRef(commit); commitRef.current = commit;
  const stop = () => {
    const g = gesture.current; gesture.current = null;
    if (g) clearTimeout(g.timer);
    cancelAnimationFrame(frame.current);
    if (g && node.current?.hasPointerCapture(g.pointer)) node.current.releasePointerCapture(g.pointer);
  };
  useEffect(() => () => stop(), []);
  useEffect(() => {
    const el=node.current;
    const preventBrowserPan=(event:globalThis.TouchEvent)=>{
      if(gesture.current && event.cancelable) event.preventDefault();
    };
    el?.addEventListener("touchmove",preventBrowserPan,{passive:false});
    return ()=>el?.removeEventListener("touchmove",preventBrowserPan);
  },[]);
  const layout = (g: Gesture) => layerReorderLayout(g.rows, g.id, g.y - g.startY + (g.scroll?.scrollTop ?? 0) - g.startScroll);
  const track = (time: number) => {
    const g = gesture.current, el = node.current;
    if (!g?.ready || !el) return;
    if (g.scroll) {
      const box = g.scroll.getBoundingClientRect(), listBox = el.getBoundingClientRect();
      if (g.x >= listBox.left - 24 && g.x <= listBox.right + 24) {
        // A group's first row is not the edge of the scrollable manager.
        g.scroll.scrollTop = layerReorderScroll(g.y, box.top, box.bottom,
          g.scroll.scrollTop, g.maxScroll, g.moved, time - g.lastFrame);
      }
    }
    g.lastFrame = time;
    const { offsets } = layout(g);
    setPreview(previous => previous?.id === g.id && g.ids.every(id => previous.offsets[id] === offsets[id])
      ? previous : { id: g.id, ids: g.ids, offsets });
    frame.current = requestAnimationFrame(track);
  };
  const finish = (save: boolean) => {
    const g = gesture.current; if (!g) return;
    const next = layout(g).order;
    suppressClick.current = Date.now() + 400; stop();
    if (!save && g.scroll) g.scroll.scrollTop = g.startScroll;
    if (save && g.ready && next.some((id, i) => id !== g.ids[i])) commitRef.current(next);
    setPreview(null);
  };
  const start = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    const el = node.current;
    if (e.button !== 0 || gesture.current || !el) return;
    const rows = Array.from(el.querySelectorAll<HTMLElement>("[data-reorder-id]"))
      .filter(row => row.closest("[data-reorder-list]") === el && ids.includes(row.dataset.reorderId!))
      .map(row => { const rect = row.getBoundingClientRect(); return { id: row.dataset.reorderId!, top: rect.top, height: rect.height }; });
    if (rows.length !== ids.length || !rows.some(row => row.id === id)) return;
    e.preventDefault(); e.stopPropagation(); suppressClick.current = Date.now() + 60000;
    // Stay inside the list/panel; never auto-scroll the page or a non-scrollable ancestor.
    let scroll: HTMLElement | null = el;
    while (scroll && scroll !== document.body && scroll !== document.documentElement) {
      if (scroll.scrollHeight > scroll.clientHeight + 1 && /^(auto|scroll)$/.test(getComputedStyle(scroll).overflowY)) break;
      if (scroll.matches(".layer-dialog-body") && !scroll.closest(".mobile-layer-manager")) { scroll = null; break; }
      scroll = scroll.parentElement;
    }
    if (scroll === document.body || scroll === document.documentElement) scroll = null;
    const g: Gesture = { id, pointer: e.pointerId, startY: e.clientY, x: e.clientX, y: e.clientY, ready: false, moved: false,
      rows, ids: rows.map(row => row.id), scroll, startScroll: scroll?.scrollTop ?? 0,
      maxScroll: scroll ? scroll.scrollHeight - scroll.clientHeight : 0, lastFrame: performance.now(),
      timer: setTimeout(() => {
        if (gesture.current !== g) return;
        g.ready = true; g.lastFrame = performance.now(); track(g.lastFrame);
      }, 180) };
    gesture.current = g; el.setPointerCapture(e.pointerId);
  };
  return {
    renderIds: preview?.ids ?? ids,
    active: preview?.id ?? null,
    rowStyle: (id: string): CSSProperties | undefined => preview ? {
      transform: `translate3d(0, ${preview.offsets[id] ?? 0}px, 0)`,
      transition: id === preview.id ? "none" : undefined,
      zIndex: id === preview.id ? 2 : 1,
    } : undefined,
    listProps: {
      ref: setNode, "data-reorder-list": true, "data-reordering": Boolean(preview),
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const g = gesture.current; if (!g || g.pointer !== e.pointerId) return;
        e.preventDefault(); e.stopPropagation(); g.x = e.clientX; g.y = e.clientY;
        if (Math.abs(g.y - g.startY) > 4) g.moved = true;
      },
      onClickCapture: (e: MouseEvent<HTMLElement>) => { if (suppressClick.current > Date.now()) { suppressClick.current = 0; e.preventDefault(); e.stopPropagation(); } },
      onTouchMove: (e: TouchEvent<HTMLElement>) => { if (gesture.current) e.stopPropagation(); },
      onTouchEnd: (e: TouchEvent<HTMLElement>) => { if (suppressClick.current > Date.now()) e.stopPropagation(); },
      onPointerUp: (e: PointerEvent<HTMLElement>) => {
        if (gesture.current?.pointer !== e.pointerId) return;
        e.preventDefault(); e.stopPropagation(); gesture.current.y = e.clientY; finish(true);
      },
      onPointerCancel: (e: PointerEvent<HTMLElement>) => { if (gesture.current?.pointer === e.pointerId) { e.stopPropagation(); finish(false); } },
      onLostPointerCapture: (e: PointerEvent<HTMLElement>) => { if (gesture.current?.pointer === e.pointerId) finish(false); },
      onKeyDownCapture: (e: KeyboardEvent<HTMLElement>) => { if (gesture.current && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); } },
    },
    handle: (id: string, label: string) => <button type="button" className="group-member-grip layer-reorder-grip" aria-label={label} aria-pressed={preview?.id === id}
      onClick={e => { e.preventDefault(); e.stopPropagation(); }} onContextMenu={e => e.preventDefault()}
      onPointerDown={e => start(e, id)}
      onKeyDown={e => {
        if (!['ArrowUp', 'ArrowDown'].includes(e.key) || gesture.current) return;
        e.preventDefault(); e.stopPropagation();
        const next = [...ids], i = next.indexOf(id), j = i + (e.key === 'ArrowUp' ? -1 : 1);
        if (i < 0 || j < 0 || j >= next.length) return;
        [next[i], next[j]] = [next[j]!, next[i]!]; commitRef.current(next);
      }}><GripVertical size={20}/></button>,
  };
}
