import { wheelCanvasView, zoomCanvasAt, type CanvasView } from '@/lib/canvas-navigation';

/** Own zoom gestures only over the drawing; preserve browser accessibility zoom elsewhere. */
export function installCanvasZoom(element: HTMLElement, read: () => CanvasView, write: (view: CanvasView) => void, blocked: () => boolean) {
  let gesture: { view: CanvasView; x: number; y: number } | null = null;
  const onCanvas = (event: Event) => {
    const target=event.target as HTMLElement | null;
    return target===element || target?.tagName==='CANVAS' || !!target?.classList?.contains('konvajs-content');
  };
  const consume = (event: Event) => { if (event.cancelable) event.preventDefault(); event.stopImmediatePropagation(); };
  const wheel = (event: WheelEvent) => {
    if (!onCanvas(event)) return;
    consume(event);
    if (blocked() || gesture) return;
    const box = element.getBoundingClientRect();
    write(wheelCanvasView(read(), event.clientX-box.left, event.clientY-box.top, event.deltaY, event.deltaMode, box.height, event.ctrlKey || event.metaKey));
  };
  const safari = (event: Event) => {
    if (!gesture && !onCanvas(event)) return;
    consume(event);
    const e = event as Event & {scale: number; clientX: number; clientY: number};
    if (event.type === 'gestureend') { gesture = null; return; }
    if (blocked()) { gesture = null; return; }
    if (event.type === 'gesturestart') {
      const box = element.getBoundingClientRect();
      gesture = {view: read(), x: Number.isFinite(e.clientX)?e.clientX-box.left:box.width/2, y: Number.isFinite(e.clientY)?e.clientY-box.top:box.height/2};
    } else if (gesture && Number.isFinite(e.scale) && e.scale > 0) {
      write(zoomCanvasAt(gesture.view, gesture.x, gesture.y, gesture.view.pxPerMeter*e.scale));
    }
  };
  element.addEventListener('wheel',wheel,{capture:true,passive:false});
  for (const type of ['gesturestart','gesturechange','gestureend']) element.addEventListener(type,safari,{capture:true,passive:false});
  return () => {
    element.removeEventListener('wheel',wheel,{capture:true});
    for (const type of ['gesturestart','gesturechange','gestureend']) element.removeEventListener(type,safari,{capture:true});
  };
}
