import type { Locale } from "./locale-config";
import { text as uiText } from "@/lib/i18n";
export type LandscapeVisualMode = "image" | "vector";
export const isLandscapeVisualMode = (value: unknown): value is LandscapeVisualMode => value === "image" || value === "vector";
/** Catalog facts are sourced values; null always means unknown, never zero. */
export type PlantCategory = "tree" | "shrub" | "flower" | "grass";
export type PlantSource = { title: string; url: string; accessedAt: string };
export type PlantPhoto = { url: string; pageUrl: string; author: string; license: string; licenseUrl?: string };
export type PlantRange = { min: number; max: number; sourceUrl: string };
export type PlantWaterRange = PlantRange & {
  unit: "L/plant/day" | "L/plant/week" | "mm/day" | "mm/week";
  conditions: string;
};
export type PlantRecord = {
  id: string;
  russianName: string | null;
  names?: Partial<Record<Locale, string>>;
  latinName: string;
  cultivar: string | null;
  aliases: string[];
  category: PlantCategory | null;
  photos: PlantPhoto[];
  matureHeightM: PlantRange | null;
  matureWidthM: PlantRange | null;
  light: string | null;
  soil: string | null;
  moisture: string | null;
  hardiness: string | null;
  description: string | null;
  water: {
    need: "low" | "moderate" | "high" | null;
    sourceUrl: string | null;
    context: string | null;
    quantity: PlantWaterRange | null;
    method: string | null;
    wettingZone: string | null;
    recommendations: string | null;
  };
  symbol: "deciduous" | "conifer" | "shrub" | "flower" | "grass" | null;
  sources: PlantSource[];
  externalId?: number;
  /** Decorative artwork is a design choice, not a botanical identification. */
  visualId?: string;
  decorative?: boolean;
  defaultDiameterM?: number;
};

/** Inputs for a future, source-backed irrigation model. No generic demand constant. */
export type PlantIrrigationContext = {
  plantId: string;
  category?: PlantCategory;
  diameterM: number;
  climateZone: string | null;
  season: string | null;
  exposure: "sun" | "partial-shade" | "shade" | null;
  soil: string | null;
  method: "drip" | "bubbler" | "sprinkler" | null;
  referenceEvapotranspirationMmDay?: number;
  effectiveRainfallMmDay?: number;
  factors?: { value: number; meaning: string; sourceUrl: string }[];
};

export const PLANT_CATEGORIES = { get tree() { return uiText("plantCategory_tree"); }, get shrub() { return uiText("plantCategory_shrub"); }, get flower() { return uiText("plantCategory_flower"); }, get grass() { return uiText("plantCategory_grass"); } } as const;
export const PLANT_TYPES = { get tree() { return uiText("plantType_tree"); }, get shrub() { return uiText("plantType_shrub"); }, get flower() { return uiText("plantType_flower"); }, get grass() { return uiText("plantType_grass"); } } as const;
export const WATER_NEEDS = { get low() { return uiText("waterNeed_low"); }, get moderate() { return uiText("waterNeed_moderate"); }, get high() { return uiText("waterNeed_high"); } } as const;
// Fold Latin accents for search without stripping Japanese voicing marks or changing stored names.
export const normalizePlantSearch = (text: string) => text.normalize("NFKC").trim().toLowerCase()
  .replace(/[À-ž]/g, char => char.normalize("NFD").replace(/\p{M}/gu, ""))
  .replace(/[\u0591-\u05bd\u05bf-\u05c7\u064b-\u065f\u0670ـ]/g, "")
  .replace(/[άέήίόύώϊϋΐΰ]/g, char => char.normalize("NFD").replace(/\p{M}/gu, ""))
  .replace(/i\u0307|ı/g, "i").replace(/ł/g, "l").replace(/ß/g, "ss").replace(/ё/g, "е").replace(/[‘’]/g, "'");
export const plantSearchText = (p: PlantRecord) => normalizePlantSearch([p.russianName, p.latinName, p.cultivar, ...Object.values(p.names ?? {}), ...p.aliases].filter(Boolean).join(" "));

/** Shared input boundary for the future irrigation module; deliberately performs no estimation. */
export function plantIrrigationInput(plant: import("./cad/types").CadPlant, project: import("./project-types").Project): PlantIrrigationContext {
  return { ...plant.irrigation, plantId: plant.catalogId ?? plant.id, category: plant.kind, diameterM: plant.r * 2,
    climateZone: project.meta.climateZone ?? null, season: project.meta.season ?? null,
    exposure: plant.irrigation?.exposure ?? null, soil: plant.irrigation?.soil ?? project.meta.soil ?? null,
    method: plant.irrigation?.method ?? null };
}
