import type { Pt, Underlay } from "./project-types";

export function referenceCorners(u: Underlay): Pt[] {
  const angle = u.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  return [[0, 0], [u.width, 0], [u.width, u.height], [0, u.height]].map(([x, y]) => ({
    x: u.x + x! * c - y! * s, y: u.y + x! * s + y! * c,
  }));
}

/** Calibrate around the first picked point without rescaling the existing plan. */
export function calibratedReference(u: Underlay, a: Pt, b: Pt, meters: number): Underlay | null {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  if (u.locked || !Number.isFinite(meters) || meters <= 0 || !Number.isFinite(distance) || distance < 1e-6) return null;
  const factor = meters / distance;
  return { ...u, x: a.x + (u.x - a.x) * factor, y: a.y + (u.y - a.y) * factor,
    width: u.width * factor, height: u.height * factor, locked: true,
    calibration: { distanceM: meters, metersPerPixel: u.pixelWidth ? u.width * factor / u.pixelWidth : null } };
}

export function patchReference(u: Underlay, patch: Partial<Underlay>): Underlay {
  const allowed = { ...patch };
  // Unlocking is explicit; a combined unlock/transform cannot bypass the lock.
  if (u.locked) for (const key of ["x", "y", "width", "height", "rotation"] as const) delete allowed[key];
  for (const key of ["x", "y", "width", "height", "rotation", "opacity"] as const) {
    const value = allowed[key];
    if (value != null && (!Number.isFinite(value) || ((key === "width" || key === "height") && value <= 0))) delete allowed[key];
  }
  if (allowed.opacity != null) allowed.opacity = Math.max(0, Math.min(1, allowed.opacity));
  if (allowed.rotation != null) allowed.rotation = ((allowed.rotation % 360) + 360) % 360;
  // Rotation handles can return insignificant floating-point changes in scale.
  for (const key of ["width", "height"] as const) {
    if (allowed[key] != null && Math.abs(allowed[key]! - u[key]) <= Math.max(1, u[key]) * 1e-9) allowed[key] = u[key];
  }
  if (allowed.width != null && allowed.width !== u.width || allowed.height != null && allowed.height !== u.height) allowed.calibration = undefined;
  return { ...u, ...allowed };
}
