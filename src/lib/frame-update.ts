/** Coalesce pointer samples, but never lose the final value of a committed edit. */
export function frameUpdate<T>(apply: (value: T) => void,
  request: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancel: (id: number) => void = cancelAnimationFrame) {
  let frame: number | null = null;
  let pending: { value: T } | undefined;
  const flush = () => {
    if (frame !== null) cancel(frame);
    frame = null;
    const next = pending;
    pending = undefined;
    if (next) apply(next.value);
  };
  return {
    push(value: T) {
      pending = { value };
      if (frame === null) frame = request(flush);
    },
    flush,
    cancel() {
      if (frame !== null) cancel(frame);
      frame = null;
      pending = undefined;
    },
  };
}
