export type Box = { x: number; y: number; width: number; height: number };
export const overlaps = (a: Box, b: Box, gap = 0) =>
  a.x < b.x + b.width + gap &&
  a.x + a.width + gap > b.x &&
  a.y < b.y + b.height + gap &&
  a.y + a.height + gap > b.y;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(n, Math.max(a, b)));

export type TooltipBox = Box & { side: "bottom" | "top" | "right" | "left"; arrow: number };

/** Prefer an exact centre below the button; flip before moving away from its centre. */
export function placeTooltip(bounds: Box, size: { width: number; height: number }, anchor: Box, obstacles: Box[]): TooltipBox {
  const width = Math.min(size.width, bounds.width), height = Math.min(size.height, bounds.height), gap = 10;
  const cx = anchor.x + anchor.width / 2, cy = anchor.y + anchor.height / 2;
  const x = clamp(cx - width / 2, bounds.x, bounds.x + bounds.width - width);
  const y = clamp(cy - height / 2, bounds.y, bounds.y + bounds.height - height);
  const candidates: (Box & { side: TooltipBox["side"] })[] = [
    { x, y: anchor.y + anchor.height + gap, width, height, side: "bottom" },
    { x, y: anchor.y - height - gap, width, height, side: "top" },
    { x: anchor.x + anchor.width + gap, y, width, height, side: "right" },
    { x: anchor.x - width - gap, y, width, height, side: "left" },
  ];
  const blocked = [...obstacles, anchor];
  let result = candidates.find(b => b.x >= bounds.x && b.y >= bounds.y &&
    b.x + width <= bounds.x + bounds.width && b.y + height <= bounds.y + bounds.height &&
    !blocked.some(o => overlaps(b, o, 6)));
  if (!result) {
    const box = placeFloating(bounds, size, candidates[0]!, blocked);
    const side = box.y >= anchor.y + anchor.height ? "bottom" : box.y + box.height <= anchor.y ? "top" : box.x >= cx ? "right" : "left";
    result = { ...box, side };
  }
  const horizontal = result.side === "bottom" || result.side === "top";
  return { ...result, arrow: clamp(horizontal ? cx - result.x : cy - result.y, 12, (horizontal ? result.width : result.height) - 12) };
}

/** Viewport coordinates only. Never reads or writes drawing pan/scale. */
export function placeFloating(
  bounds: Box,
  size: { width: number; height: number },
  wanted: { x: number; y: number },
  obstacles: Box[],
  gap = 8,
): Box {
  const w = Math.min(size.width, bounds.width),
    h = Math.min(size.height, bounds.height);
  const xs = [
    wanted.x,
    bounds.x,
    bounds.x + bounds.width - w,
    ...obstacles.flatMap((o) => [o.x - w - gap, o.x + o.width + gap]),
  ];
  const ys = [
    wanted.y,
    bounds.y,
    bounds.y + bounds.height - h,
    ...obstacles.flatMap((o) => [o.y - h - gap, o.y + o.height + gap]),
  ];
  const candidates = xs.flatMap((x) =>
    ys.map((y) => ({
      x: clamp(x, bounds.x, bounds.x + bounds.width - w),
      y: clamp(y, bounds.y, bounds.y + bounds.height - h),
      width: w,
      height: h,
    })),
  );
  const distance = (b: Box) => (b.x - wanted.x) ** 2 + (b.y - wanted.y) ** 2;
  const fit = candidates
    .filter((b) => !obstacles.some((o) => overlaps(b, o, gap)))
    .sort((a, b) => distance(a) - distance(b))[0];
  if (fit) return fit;
  // Constrained screens: use an unobstructed smaller viewport with internal scrolling.
  let slots = [bounds];
  for (const obstacle of obstacles) {
    const o = {
      x: obstacle.x - gap,
      y: obstacle.y - gap,
      width: obstacle.width + 2 * gap,
      height: obstacle.height + 2 * gap,
    };
    slots = slots.flatMap((b) => {
      if (!overlaps(b, o)) return [b];
      const l = Math.max(b.x, o.x),
        r = Math.min(b.x + b.width, o.x + o.width),
        t = Math.max(b.y, o.y),
        bottom = Math.min(b.y + b.height, o.y + o.height);
      return [
        { x: b.x, y: b.y, width: l - b.x, height: b.height },
        { x: r, y: b.y, width: b.x + b.width - r, height: b.height },
        { x: l, y: b.y, width: r - l, height: t - b.y },
        { x: l, y: bottom, width: r - l, height: b.y + b.height - bottom },
      ].filter((p) => p.width > 0 && p.height > 0);
    });
  }
  const slot = slots.sort(
    (a, b) =>
      Math.min(b.width, w) * Math.min(b.height, h) - Math.min(a.width, w) * Math.min(a.height, h) ||
      distance(a) - distance(b),
  )[0];
  if (!slot) return { x: bounds.x, y: bounds.y, width: 0, height: 0 };
  return {
    x: clamp(wanted.x, slot.x, slot.x + slot.width - Math.min(w, slot.width)),
    y: clamp(wanted.y, slot.y, slot.y + slot.height - Math.min(h, slot.height)),
    width: Math.min(w, slot.width),
    height: Math.min(h, slot.height),
  };
}

export function workspaceBounds(): Box {
  const viewport = window.visualViewport;
  const v = {
    x: viewport?.offsetLeft ?? 0,
    y: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
  const rect = document.querySelector(".designer-workspace")?.getBoundingClientRect();
  const x = Math.max(v.x, rect?.left ?? v.x) + 8,
    y = Math.max(v.y, rect?.top ?? v.y) + 8;
  const bounds = {
    x,
    y,
    width: Math.max(0, Math.min(v.x + v.width, rect?.right ?? v.x + v.width) - x - 8),
    height: Math.max(0, Math.min(v.y + v.height, rect?.bottom ?? v.y + v.height) - y - 8),
  };
  // Full-height sidebars define the *free* docking edge, not the browser edge.
  for (const panel of document.querySelectorAll<HTMLElement>(".info-panel,[data-catalog]")) {
    const s = getComputedStyle(panel),
      r = panel.getBoundingClientRect();
    if (s.display === "none" || s.visibility === "hidden" || r.height < bounds.height * 0.75)
      continue;
    if (
      r.left < bounds.x + bounds.width &&
      r.right >= bounds.x + bounds.width - 8 &&
      r.left > bounds.x
    )
      bounds.width = Math.max(0, r.left - bounds.x - 8);
    else if (r.right > bounds.x && r.left <= bounds.x + 8 && r.right < bounds.x + bounds.width) {
      const edge = r.right + 8;
      bounds.width = Math.max(0, bounds.x + bounds.width - edge);
      bounds.x = edge;
    }
  }
  return bounds;
}

const FIXED_OBSTACLES =
  '.info-panel,[data-catalog],.project-menu,.grid-step-pop,.note-editor,.cad-edit-drawer,.dimension-pad,.mobile-parameter-bar,.mobile-placement-hint,[data-magnifier-top-panel],.figure-actions-surface,.figure-fusion-actions,.bulk-selection-actions,.drawing-guidance,[role="dialog"],.mobile-sheet';
export function floatingObstacles(self: HTMLElement | null, minimumPriority = 0): Box[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(`${FIXED_OBSTACLES},[data-floating-priority]`),
  )
    .filter((el) => {
      if (el === self || el.contains(self) || self?.contains(el) || el.closest("[inert]"))
        return false;
      if (Number(el.dataset.floatingPriority ?? 100) < minimumPriority) return false;
      const style = getComputedStyle(el);
      return (
        style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0
      );
    })
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    })
    .filter((r) => r.width > 0 && r.height > 0);
}

export function dockAt(point: { x: number; y: number }, b: Box, previous = "top") {
  const distances = [
    ["left", Math.abs(point.x - b.x)],
    ["right", Math.abs(point.x - b.x - b.width)],
    ["top", Math.abs(point.y - b.y)],
    ["bottom", Math.abs(point.y - b.y - b.height)],
  ] as const;
  const closest = [...distances].sort((a, b) => a[1] - b[1])[0]!;
  const old = distances.find((d) => d[0] === previous);
  if (old && old[1] < closest[1] + 16) return previous;
  return closest[1] < 88 ? closest[0] : previous;
}
