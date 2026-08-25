import { faceHoles, facePoints } from "@/lib/cad/engine";
import { isExclusion, isIrrigationTarget, type CadDrawing, type CadFace } from "@/lib/cad/types";
import { pointInPoly, type Pt } from "@/lib/geometry";

export type IrrigPatch = {
  id: string;
  pts: Pt[];
  holes: Pt[][];
  method: NonNullable<CadFace["hydro"]>["method"] | "mp";
};

const SPRAY_METHODS = new Set(["spray", "mp", "rotor"]);

function wantsSprinklers(f: CadFace): boolean {
  if (f.hidden) return false;
  if (f.hydro?.method === "none" || f.hydro?.method === "drip" || f.hydro?.method === "bubbler") return false;
  if (f.hydro && SPRAY_METHODS.has(f.hydro.method)) return true;
  return isIrrigationTarget(f.type);
}

export function siteLoop(d: CadDrawing): Pt[] | null {
  const sites = Object.values(d.faces).filter((f) => !f.hidden && f.type === "site");
  if (!sites.length) return null;
  sites.sort((a, b) => facePoints(d, b.id).length - facePoints(d, a.id).length);
  const pts = facePoints(d, sites[0]!.id);
  return pts.length >= 3 ? pts : null;
}

export function exclusionLoops(d: CadDrawing): Pt[][] {
  const out: Pt[][] = [];
  for (const f of Object.values(d.faces)) {
    if (f.hidden) continue;
    if (isExclusion(f.type) || f.type === "water") {
      const pts = facePoints(d, f.id);
      if (pts.length >= 3) out.push(pts);
    }
    if (wantsSprinklers(f)) out.push(...faceHoles(d, f.id));
  }
  return out;
}

export function irrigPatches(d: CadDrawing): IrrigPatch[] {
  const patches: IrrigPatch[] = [];
  for (const f of Object.values(d.faces)) {
    if (!wantsSprinklers(f)) continue;
    const pts = facePoints(d, f.id);
    if (pts.length < 3) continue;
    patches.push({
      id: f.id,
      pts,
      holes: faceHoles(d, f.id),
      method: f.hydro?.method && SPRAY_METHODS.has(f.hydro.method) ? f.hydro.method : "mp",
    });
  }
  return patches;
}

export function inIrrigable(p: Pt, d: CadDrawing): boolean {
  const site = siteLoop(d);
  if (site && !pointInPoly(p, site)) return false;
  for (const hole of exclusionLoops(d)) if (pointInPoly(p, hole)) return false;
  const patches = irrigPatches(d);
  if (!patches.length) return false;
  return patches.some((g) => pointInPoly(p, g.pts) && !g.holes.some((h) => pointInPoly(p, h)));
}

export function clipPolysForCoverage(d: CadDrawing): { keep: Pt[][]; cut: Pt[][] } {
  return { keep: irrigPatches(d).map((g) => g.pts), cut: exclusionLoops(d) };
}
