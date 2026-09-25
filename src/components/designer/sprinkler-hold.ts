/** Long press is cancelled by movement, release, another contact or losing focus. */
export function startSprinklerHold(event: PointerEvent, activate: () => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer != null) clearTimeout(timer);
    timer = null;
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", up, true);
    window.removeEventListener("pointerdown", extra, true);
    window.removeEventListener("blur", cancel);
  };
  const move = (next: PointerEvent) => {
    if (next.pointerId === event.pointerId && Math.hypot(next.clientX - event.clientX, next.clientY - event.clientY) > 8) cancel();
  };
  const up = (next: PointerEvent) => { if (next.pointerId === event.pointerId) cancel(); };
  const extra = (next: PointerEvent) => { if (next.pointerId !== event.pointerId) cancel(); };
  timer = setTimeout(() => { cancel(); activate(); }, 500);
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
  window.addEventListener("pointerdown", extra, true);
  window.addEventListener("blur", cancel);
  return cancel;
}
