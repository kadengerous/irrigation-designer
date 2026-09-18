import type { Pt } from "@/lib/geometry";
import { faceTexture, texturePatternScale } from "./types";

export type TextureSize = { width: number; height: number };
export type TextureFrame = TextureSize & { x: number; y: number; rotation: number };
type Geometry = { points: Pt[]; type?: string; radius?: number; ellipse?: { rx: number; ry: number } };
const MIN_SIZE = 1e-8;

export function validTextureSize(size: TextureSize | undefined): size is TextureSize {
  return Boolean(size && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > MIN_SIZE && size.height > MIN_SIZE);
}

/** Coordinates local to the shape. Polygon axes follow its first nonzero edge. */
export function textureFrame(geometry: Geometry): TextureFrame {
  if (geometry.ellipse || (geometry.type === "circle" && geometry.radius)) {
    const rx = Math.abs(geometry.ellipse?.rx ?? geometry.radius!);
    const ry = Math.abs(geometry.ellipse?.ry ?? geometry.radius!);
    return { x: -rx, y: -ry, width: Math.max(MIN_SIZE, 2 * rx), height: Math.max(MIN_SIZE, 2 * ry), rotation: 0 };
  }
  const points = geometry.points;
  const origin = points[0] ?? { x: 0, y: 0 };
  const next = points.find((p) => Math.hypot(p.x - origin.x, p.y - origin.y) > MIN_SIZE);
  const angle = next ? Math.atan2(next.y - origin.y, next.x - origin.x) : 0;
  const c = Math.cos(angle), s = Math.sin(angle);
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const p of points) {
    const x = (p.x - origin.x) * c + (p.y - origin.y) * s;
    const y = -(p.x - origin.x) * s + (p.y - origin.y) * c;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { x: origin.x + minX * c - minY * s, y: origin.y + minX * s + minY * c,
    width: Math.max(MIN_SIZE, maxX - minX), height: Math.max(MIN_SIZE, maxY - minY), rotation: angle * 180 / Math.PI };
}

/** Keep the previous density at the app's original 36 px/m, then use world units. */
export function texturePatternAttrs(fill: string, frame: TextureFrame, reference: TextureSize, px = 36, rotation = 0) {
  const metersPerTexel = texturePatternScale(fill) / 36;
  return {
    fillPatternX: frame.x,
    fillPatternY: frame.y,
    fillPatternRotation: frame.rotation + rotation + (faceTexture(fill)?.baseRotation ?? 0),
    fillPatternScaleX: metersPerTexel * px,
    fillPatternScaleY: metersPerTexel * px,
  };
}
