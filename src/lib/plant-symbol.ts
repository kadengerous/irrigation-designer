import type { CadPlant } from "./cad/types";

/** Drafting glyphs: plan-view canopy envelope, radial structure and trunk center. */
export function plantSymbol(plant: Pick<CadPlant, "kind" | "catalog">) {
  return plant.catalog?.symbol ?? (plant.kind === "tree" ? "deciduous" : plant.kind);
}
export function plantOutline(symbol: ReturnType<typeof plantSymbol>, radius: number): number[] {
  const lobes = symbol === "flower" ? 6 : symbol === "shrub" ? 9 : symbol === "conifer" ? 12 : 14;
  const points: number[] = [];
  for (let i = 0; i < 144; i++) {
    const a = i / 144 * Math.PI * 2;
    const k = symbol === "conifer" ? 0.73 + 0.27 * Math.pow((1 + Math.cos(a * lobes)) / 2, 3)
      : 0.89 + 0.11 * Math.cos(a * lobes);
    points.push(Math.cos(a) * radius * k, Math.sin(a) * radius * k);
  }
  return points;
}
export const plantInk = (kind: CadPlant["kind"]) => kind === "flower" ? "#9b547f" : kind === "shrub" ? "#57894e" : "#356854";
