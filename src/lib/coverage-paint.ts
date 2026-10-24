import type { Surface } from './irrigation-geometry';
import { COVERAGE_HATCHES, type CoverageBands } from './diagnostic-coverage';

type HeadPosition = { id: string; x: number; y: number };

/** Native dragging moves the head before its saved project coordinates change. */
export function sprinklerPaintClip(surface: Surface, px: number, head: HeadPosition, preview: HeadPosition | null) {
  const origin = preview?.id === head.id ? preview : head;
  return outsideHatchesClip(surface, px, -origin.x * px, -origin.y * px);
}

/** Rendering uses the existing rings without another numerical polygon union. */
export function hatchedPaintMask(coverage: CoverageBands | null, issueArea: Surface = []): Surface {
  return [...(coverage ? COVERAGE_HATCHES.flatMap(h => coverage[h.id]) : []), ...issueArea];
}

/** Clip decorative paint only, preserving polygon holes and world alignment. */
export function outsideHatchesClip(surface: Surface, px: number, offsetX: number, offsetY: number) {
  if (!surface.length) return undefined;
  // One immutable mask is shared by every figure. Build its paths once per
  // geometry/view snapshot, not again for every figure and animation frame.
  let paths: Path2D[] | undefined;
  return (ctx: Pick<CanvasRenderingContext2D, 'clip'>) => {
    // Intersection of polygon complements equals the complement of their union.
    // Separate canvas clips preserve holes and overlapping bands without asking
    // polygon-clipping to reconstruct nearly coincident output rings.
    paths ??= surface.map(polygon => {
      const path = new Path2D();
      path.rect(-1e8, -1e8, 2e8, 2e8);
      for (const ring of polygon) {
        ring.forEach(([x,y],j) => j ? path.lineTo(x*px+offsetX,y*px+offsetY) : path.moveTo(x*px+offsetX,y*px+offsetY));
        path.closePath();
      }
      return path;
    });
    for (let i = 0; i < paths.length - 1; i++) ctx.clip(paths[i], 'evenodd');
    return [paths[paths.length - 1], 'evenodd'] as [Path2D, CanvasFillRule];
  };
}
