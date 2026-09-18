/** Integer ticks include both physical endpoints, even when the span is not a multiple of the step. */
export function sliderRange(min: number, max: number, step: number, value: number) {
  const ticks = Math.max(1, Math.ceil((max - min) / step - 1e-9));
  const fromTick = (tick: number) => tick <= 0 ? min : tick >= ticks ? max
    : Math.min(max, Number((min + tick * step).toFixed(9)));
  const tick = value <= min ? 0 : value >= max ? ticks
    : Math.max(0, Math.min(ticks, Math.round((value - min) / step)));
  return { ticks, tick, fromTick };
}
