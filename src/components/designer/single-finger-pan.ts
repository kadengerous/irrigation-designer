type Options = {
  canPan: () => boolean;
  readPan: () => { x: number; y: number };
  setPan: (x: number, y: number) => void;
  begin: () => void;
  suppressTap: () => void;
  cancelHold: () => void;
};

/** Reserve touch drags for navigation, but leave taps and existing pinch/edit handlers intact. */
export function installSingleFingerPan(canvas: HTMLElement, options: Options) {
  let start: { id: number; x: number; y: number; panX: number; panY: number; dragged: boolean } | null = null;
  let suppressUntil = 0;
  const inside = (e: Event) => e.target instanceof HTMLCanvasElement && canvas.contains(e.target);
  const stop = (e: Event) => { if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation(); };
  const down = (e: PointerEvent) => {
    if (e.pointerType !== "touch" || !inside(e)) return;
    if (start && start.id !== e.pointerId) {
      // Existing two-finger pan/zoom takes over, including when the first finger was dragging.
      start = null; suppressUntil = 0; options.cancelHold();
      return;
    }
    suppressUntil = 0; // A new contact is not the previous drag's compatibility click.
    if (!options.canPan()) return;
    const pan = options.readPan();
    start = { id: e.pointerId, x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y, dragged: false };
    suppressUntil = 0;
    options.begin();
    // Do not consume down: the normal tap selection and long-press editing remain available.
  };
  const move = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return;
    if (!options.canPan()) { start = null; return; }
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!start.dragged && Math.hypot(dx, dy) >= 8) {
      start.dragged = true;
      options.cancelHold();
    }
    if (start.dragged) {
      options.suppressTap();
      options.setPan(start.panX + dx, start.panY + dy);
    }
    // Prevent Konva object dragging even before the navigation threshold is crossed.
    stop(e);
  };
  const up = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return;
    const suppress = start.dragged || e.type === "pointercancel";
    start = null;
    if (suppress) {
      options.cancelHold(); options.suppressTap();
      suppressUntil = Date.now() + 650;
      stop(e);
    }
  };
  const legacy = (e: Event) => {
    if (!inside(e)) return;
    // Never intercept the multi-touch path or UI events outside the canvas.
    if ("touches" in e && (e as TouchEvent).touches.length >= 2) return;
    if (start && (e.type === "touchmove" || e.type === "mousemove")) stop(e);
    else if (Date.now() < suppressUntil && e.type !== "touchstart") stop(e);
  };
  const reset = () => {
    if (start) { options.cancelHold(); options.suppressTap(); }
    start = null;
  };
  window.addEventListener("pointerdown", down, true);
  window.addEventListener("pointermove", move, { capture: true, passive: false });
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
  window.addEventListener("blur", reset);
  const legacyEvents = ["touchmove", "touchend", "touchcancel", "mousedown", "mousemove", "mouseup", "click"];
  legacyEvents.forEach(name => window.addEventListener(name, legacy, { capture: true, passive: false }));
  return () => {
    reset();
    window.removeEventListener("pointerdown", down, true);
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", up, true);
    window.removeEventListener("blur", reset);
    legacyEvents.forEach(name => window.removeEventListener(name, legacy, true));
  };
}
