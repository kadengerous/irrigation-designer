/** Catalog facts are sourced values; null always means unknown, never zero. */
export type PlantCategory = "tree" | "shrub" | "flower";
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
  symbol: "deciduous" | "conifer" | "shrub" | "flower" | null;
  sources: PlantSource[];
  externalId?: number;
};

/** Inputs for a future, source-backed irrigation model. No generic demand constant. */
export type PlantIrrigationContext = {
  plantId: string;
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

export const PLANT_CATEGORIES = { tree: "Деревья", shrub: "Кустарники", flower: "Цветы" } as const;
export const PLANT_TYPES = { tree: "Дерево", shrub: "Кустарник", flower: "Цветок" } as const;
export const WATER_NEEDS = { low: "Низкая", moderate: "Умеренная", high: "Высокая" } as const;
export const normalizePlantSearch = (text: string) => text.trim().toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[‘’]/g, "'");
export const plantSearchText = (p: PlantRecord) => normalizePlantSearch([p.russianName, p.latinName, p.cultivar, ...p.aliases].filter(Boolean).join(" "));

/** Shared input boundary for the future irrigation module; deliberately performs no estimation. */
export function plantIrrigationInput(plant: import("./cad/types").CadPlant, project: import("./project-types").Project): PlantIrrigationContext {
  return { ...plant.irrigation, plantId: plant.catalogId ?? plant.id, diameterM: plant.r * 2,
    climateZone: project.meta.climateZone ?? null, season: project.meta.season ?? null,
    exposure: plant.irrigation?.exposure ?? null, soil: plant.irrigation?.soil ?? project.meta.soil ?? null,
    method: plant.irrigation?.method ?? null };
}
