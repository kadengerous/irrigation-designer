export type ReorderRow = { id: string; top: number; height: number };

/** Preview uses the original slots, never the already-transformed rows. */
export function layerReorderLayout(rows: readonly ReorderRow[], activeId: string, distance: number) {
  const active = rows.find(row => row.id === activeId);
  const offsets: Record<string, number> = Object.fromEntries(rows.map(row => [row.id, 0]));
  if (!active || !rows.length) return { order: rows.map(row => row.id), offsets };
  const first = rows[0]!, last = rows[rows.length - 1]!;
  const top = Math.max(first.top, Math.min(last.top + last.height - active.height, active.top + distance));
  const others = rows.filter(row => row.id !== activeId);
  const center = active.top + distance + active.height / 2;
  const index = others.filter(row => distance > 0 ? center >= row.top + row.height / 2 : center > row.top + row.height / 2).length;
  const arranged = [...others];
  arranged.splice(index, 0, active);
  const gap = rows.length > 1 ? Math.max(0, rows[1]!.top - first.top - first.height) : 0;
  let slot = first.top;
  for (const row of arranged) {
    offsets[row.id] = row.id === activeId ? top - active.top : slot - row.top;
    slot += row.height + gap;
  }
  return { order: arranged.map(row => row.id), offsets };
}

/** Holding still or a list that already fits must never start scrolling. */
export function layerReorderScroll(pointerY: number, top: number, bottom: number, scrollTop: number, maxScroll: number, moved: boolean, elapsed: number) {
  if (!moved || maxScroll <= 0 || bottom <= top) return scrollTop;
  const band = Math.min(28, (bottom - top) / 4);
  const direction = pointerY < top + band ? -Math.min(1, (top + band - pointerY) / band)
    : pointerY > bottom - band ? Math.min(1, (pointerY - bottom + band) / band) : 0;
  return Math.max(0, Math.min(maxScroll, scrollTop + direction * 220 * Math.min(32, elapsed) / 1000));
}
