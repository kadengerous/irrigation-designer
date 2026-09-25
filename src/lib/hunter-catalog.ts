import { text } from "./i18n";
import { catalogName, popUpHeight } from "./catalog-localization";
import { bundledPhoto } from "@/lib/catalog-photos";

export type FlowKind = "table" | "pressure-compensated" | "interpolated" | "matched-precip" | "none";
export type Family =
  | "mp"
  | "mp800"
  | "strip"
  | "spray"
  | "prostrip"
  | "he"
  | "fixed"
  | "short"
  | "stream"
  | "rotor"
  | "golf"
  | "st"
  | "bubbler"
  | "body";

export type PerfRow = {
  pressureBar: number;
  pressureKPa: number;
  radiusM: number;
  flowLMin: number;
  flowM3H: number;
  precipSquareMmH: number | null;
  precipTriangleMmH: number | null;
  arcDeg: number;
  radiusMinM?: number;
  flowAtMinRadiusLMin?: number;
};

import { modelCoveragePolicy, type CoverageRule } from './coverage-rules';
export type CatalogNozzle = {
  coverageRule?: CoverageRule;
  id: string;
  name: string;
  color: string;
  colorName: string;
  type: string;
  trajectoryDeg: number | null;
  performance: PerfRow[];
  sourceUrl?: string;
  recommendedBar?: number;
  size?: string;
};

export type CatalogItem = {
  coverageRule?: CoverageRule;
  coverageRuleId?: string;
  coverageRuleSource?: string;
  id: string;
  sku: string;
  name: string;
  family: Family | "all";
  series: string;
  type: "nozzle" | "rotor" | "bubbler" | "body";
  colorName: string;
  color: string;
  arcMin: number;
  arcMax: number;
  rMin: number;
  rMax: number;
  rNom: number;
  precipClass: string;
  precipMmHr: number | null;
  thread: string;
  body: string;
  recommendedPressureBar: number;
  recommendedPressureMin: number;
  recommendedPressureMax: number;
  inlet: string;
  popUpMm: number | null;
  use: string;
  sourceDocument: string;
  sourceUrl: string;
  nozzles: CatalogNozzle[];
  strip?: { w: number; l: number; ox: number; oy: number };
  discontinued?: boolean;
  defaultNozzleId?: string;
  verifiedOn?: string;
  dataNote?: string;
  trajectoryNote?: string;
  coverageKind?: "sector" | "strip" | "point";
  precipBasis?: "square" | "single" | "strip" | "none";
  pressureCompensating?: boolean;
  bodyFamilyId?: string;
  bodyFeatures?: string[];
  regulatedPressureBar?: number | null;
  bodyVerifiedOn?: string;
  mountingSourceUrl?: string;
  popUpOptions?: { mm: number; sku: string }[];
  stripPerformance?: { pressureBar: number; w: number; l: number }[];
};

// Verified Hunter tables, with explicit provenance and nullable missing values.
import catalogData from "@/data/hunter-catalog.json";
import bodyData from "@/data/hunter-body-models.json";
import rotorBodyData from "@/data/hunter-rotor-bodies.json";

const originalCatalog = catalogData as CatalogItem[];
const legacyBodySkus: Record<string, string> = {
  "PSU-04": "PS-ULTRA", "PROS-04": "PRO-SPRAY",
  "PROS-04-PRS30": "PRS30", "PROS-04-PRS40": "PRS40",
};
const bodyModels: CatalogItem[] = bodyData.series.flatMap(series => {
  const base = originalCatalog.find(item => item.id === series.id)!;
  return series.models.map(model => {
    const features = [
      "checkValve" in model && model.checkValve ? "CV" : "",
      "sideInlet" in model && model.sideInlet ? "SI" : "",
      "floGuard" in model && model.floGuard ? "FloGuard" : "",
      "reclaimed" in model && model.reclaimed ? "R" : "",
    ].filter(Boolean);
    return {
      ...base,
      id: legacyBodySkus[model.sku] ?? model.sku,
      sku: model.sku,
      name: model.sku,
      series: series.name,
      body: series.name,
      bodyFamilyId: series.id,
      bodyFeatures: features,
      regulatedPressureBar: series.regulatedPressureBar,
      recommendedPressureMin: series.operatingPressureMin,
      recommendedPressureMax: series.operatingPressureMax,
      popUpMm: model.popUpMm,
      sourceUrl: ("sourceUrl" in model ? model.sourceUrl : undefined) ?? series.sourceUrl,
      sourceDocument: "Hunter spray body model specifications",
      verifiedOn: bodyData.verifiedOn,
      bodyVerifiedOn: bodyData.verifiedOn,
    };
  });
});
export const CATALOG: CatalogItem[] = [
  ...originalCatalog.filter(item => item.type !== "body").map(item => {
    const body = rotorBodyData.models.find(model => model.ids.includes(item.id));
    return body ? { ...item, popUpMm: body.defaultMm, popUpOptions: body.options,
      mountingSourceUrl: body.sourceUrl, bodyVerifiedOn: rotorBodyData.verifiedOn } : item;
  }),
  ...bodyModels,
].map(item=>({...item,...modelCoveragePolicy(item)}));

export const CATEGORIES: { id: Family | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mp", label: "MP Standard" },
  { id: "mp800", label: "MP800" },
  { id: "strip", label: "MP Strip" },
  { id: "he", label: "Pro High-Efficiency" },
  { id: "spray", label: "Pro Adjustable" },
  { id: "fixed", label: "Pro Fixed" },
  { id: "prostrip", label: "Strip Nozzles" },
  { id: "short", label: "Short Radius" },
  { id: "bubbler", label: "Bubblers" },
  { id: "rotor", label: "Rotors" },
  { id: "golf", label: "Golf Rotors" },
  { id: "st", label: "ST System" },
];
export const FAMILIES = CATEGORIES;

export function itemById(id: string): CatalogItem | undefined {
  return CATALOG.find((c) => c.id === id || c.type === "body" && c.sku === id);
}
export function placeableCatalog(): CatalogItem[] {
  return CATALOG.filter((c) => c.family !== "body" && !c.discontinued)
    .sort((a, b) => b.rMax - a.rMax || a.id.localeCompare(b.id, "ru", { numeric: true }));
}
export function pickSkuForArc(seriesItems: CatalogItem[], arc: number): CatalogItem {
  const exact = seriesItems.find((c) => arc >= c.arcMin && arc <= c.arcMax);
  if (exact) return exact;
  return seriesItems.reduce((a, b) => (Math.abs(a.arcMin - arc) < Math.abs(b.arcMin - arc) ? a : b));
}
export function clampRadius(item: CatalogItem, r: number) {
  return Math.min(item.rMax, Math.max(item.rMin, r));
}
export function clampArc(item: CatalogItem, a: number) {
  return Math.min(item.arcMax, Math.max(item.arcMin, Math.round(a)));
}
export function defaultBodyFor(item: CatalogItem) {
  if (mountingKind(item) !== "spray") return item.id;
  if (item.family === "mp" || item.family === "mp800" || item.family === "strip") return "PRS40";
  if (item.type === "bubbler" && item.pressureCompensating) return "PRO-SPRAY";
  return "PRS30";
}

/** Nozzle threads are different from the body's 1/2-inch pipe inlet. */
export function mountingKind(item: CatalogItem): "spray" | "integrated" | "riser" {
  if (item.type === "rotor") return "integrated";
  if (/^PCB-/.test(item.id) || item.id === "AFB") return "riser";
  return "spray";
}

export function isMp(item: CatalogItem): boolean {
  return ["mp", "mp800", "strip"].includes(item.family);
}

/** Official takeoff name: nozzle / rotator / rotor / body. */
export function bomLineName(item: CatalogItem, popUpMm?: number | null): string {
  if (item.type === "body") return catalogName(item);
  if (item.type === "rotor" || item.family === "golf" || item.family === "st") {
    const variant = item.popUpOptions?.find(option => option.mm === (popUpMm ?? item.popUpMm));
    return variant?.sku ?? catalogName(item);
  }
  return catalogName(item);
}
export function bodiesFor(item: CatalogItem): CatalogItem[] {
  if (mountingKind(item) !== "spray" || item.type === "body" || /-HT(?:-|$)/.test(item.id)) return [];
  const preferred = defaultBodyFor(item);
  return bodyModels.slice().sort((a, b) =>
    Number(b.bodyFamilyId === preferred) - Number(a.bodyFamilyId === preferred) ||
    (a.bodyFamilyId ?? "").localeCompare(b.bodyFamilyId ?? "") ||
    (a.popUpMm ?? 0) - (b.popUpMm ?? 0) ||
    (a.bodyFeatures?.length ?? 0) - (b.bodyFeatures?.length ?? 0) || a.sku.localeCompare(b.sku));
}

export function recommendedBodyFor(item: CatalogItem, popUpMm?: number | null): CatalogItem | undefined {
  const family = defaultBodyFor(item);
  return bodiesFor(item).find(body => body.bodyFamilyId === family && body.popUpMm === popUpMm) ?? itemById(family);
}

export function popUpHeights(item: CatalogItem): number[] {
  if (item.type === "body") return item.popUpMm == null ? [] : [item.popUpMm];
  if (mountingKind(item) === "riser") return [0];
  if (item.type === "rotor") return item.popUpOptions?.map(option => option.mm) ?? [];
  return [...new Set(bodiesFor(item).map(body => body.popUpMm!).filter(mm => mm != null))].sort((a, b) => a - b);
}

/** Resolve older family IDs + separately saved riser heights without losing the chosen height. */
export function bodyForHead(item: CatalogItem, bodyId?: string | null, popUpMm?: number | null): CatalogItem | undefined {
  if (mountingKind(item) !== "spray") return undefined;
  const body = itemById(bodyId ?? defaultBodyFor(item));
  if (body?.type !== "body") return undefined;
  if (body.id === body.bodyFamilyId && popUpMm != null && popUpMm !== body.popUpMm) {
    return bodyModels.find(option => option.bodyFamilyId === body.bodyFamilyId && option.popUpMm === popUpMm &&
      !option.sku.endsWith("-R") && !option.sku.includes("-CV") && !option.sku.includes("-SI"));
  }
  return body;
}

export function defaultPopUpMm(item: CatalogItem, bodyId = defaultBodyFor(item)): number | null {
  if (mountingKind(item) === "riser") return 0;
  return item.type === "rotor" ? item.popUpMm : itemById(bodyId)?.popUpMm ?? null;
}
export function bodySelectionPatch(item: CatalogItem, bodyId: string, current: {
  bodyId?: string | null; designPressure?: number;
}): { bodyId: string; popUpMm: number | null; designPressure: number } | null {
  const body = bodiesFor(item).find(option => option.id === bodyId || option.sku === bodyId);
  if (!body) return null;
  const sameFamily = current.bodyId && itemById(current.bodyId)?.bodyFamilyId === body.bodyFamilyId;
  return { bodyId: body.id, popUpMm: body.popUpMm,
    designPressure: sameFamily && current.designPressure != null ? current.designPressure : workingPressureBar(item, body.id) };
}
export function workingPressureBar(item: CatalogItem, bodyId?: string | null, _nozzleId?: string | null) {
  const body = bodyId ? itemById(bodyId) : undefined;
  if (mountingKind(item) === "spray" && body?.regulatedPressureBar != null) return body.regulatedPressureBar;
  return item.nozzles.find(n => n.id === _nozzleId)?.recommendedBar ?? item.recommendedPressureBar;
}

/** Strip dimensions at the head's pressure; preserve the manufacturer's nozzle origin. */
export function stripAtPressure(item: CatalogItem, pressureBar = item.recommendedPressureBar) {
  const base = item.strip;
  if (!base) return undefined;
  const rows = [...(item.stripPerformance ?? [])].sort((a, b) => a.pressureBar - b.pressureBar);
  if (!rows.length) return base;
  if (pressureBar < rows[0]!.pressureBar - .001 || pressureBar > rows.at(-1)!.pressureBar + .001) return undefined;
  const row = rows.find(r => Math.abs(r.pressureBar - pressureBar) < 1e-7);
  if (!row) return undefined;
  const { w, l } = row;
  return { w, l, ox: base.ox * l / base.l, oy: base.oy * w / base.w };
}
export function nozzleRange(n: CatalogNozzle) {
  const rows = n.performance;
  if (!rows.length) return { rMin: 0, rMax: 0, recR: 0, recBar: 2.8, recLpm: 0 };
  const rs = rows.map((r) => r.radiusM);
  const mid = rows.reduce((a,b) => Math.abs(a.pressureBar-(n.recommendedBar ?? 2.8)) <= Math.abs(b.pressureBar-(n.recommendedBar ?? 2.8)) ? a : b);
  return { rMin: Math.min(...rs), rMax: Math.max(...rs), recR: mid.radiusM, recBar: mid.pressureBar, recLpm: mid.flowLMin };
}
export function defaultNozzle(item: CatalogItem) {
  if (!item.nozzles.length) return null;
  const preferred = item.nozzles.find(n => n.id === item.defaultNozzleId);
  if (preferred) return preferred;
  if (item.nozzles.length === 1) return item.nozzles[0]!;
  return pickNozzleForRadius(item, item.rNom);
}
export function pickNozzleForRadius(item: CatalogItem, r: number) {
  if (item.nozzles.length < 2) return item.nozzles[0] ?? null;
  let best = item.nozzles[0]!;
  let score = Infinity;
  for (const n of item.nozzles) {
    const st = nozzleRange(n);
    const rec = st.recR || (st.rMin + st.rMax) / 2;
    const s = Math.abs(rec - r);
    if (s < score) {
      score = s;
      best = n;
    }
  }
  return best;
}
export function pickSeriesForRadius(r: number, family: Family = "mp"): CatalogItem[] {
  const list = CATALOG.filter((c) => c.family === family && !c.strip && !c.discontinued && c.series !== "MP Corner");
  const groups = new Map<string, CatalogItem[]>();
  for (const c of list) {
    const arr = groups.get(c.series) ?? [];
    arr.push(c);
    groups.set(c.series, arr);
  }
  let best: CatalogItem[] = list.filter((c) => c.series === "MP2000");
  let bestScore = Infinity;
  for (const [, items] of groups) {
    const first = items[0]!;
    const score = r > first.rMax ? r - first.rMax + 20 : r < first.rMin ? first.rMin - r + 20 : Math.abs(first.rNom - r);
    if (score < bestScore) {
      bestScore = score;
      best = items;
    }
  }
  return best.length ? best : list;
}

export function categoryPhoto(id: Family | "all"): string | null {
  if (id === "all") return null;
  const map: Record<string, string> = {
    mp: "group-mp",
    mp800: "group-mp800",
    strip: "group-strip",
    rotor: "rotors",
    golf: "group-golf",
    st: "group-st",
    bubbler: "group-bubbler",
    he: "group-he",
    fixed: "group-fixed",
    short: "group-short",
    stream: "8A",
    spray: "group-spray",
    prostrip: "group-prostrip",
  };
  return bundledPhoto(map[id]) ?? `/catalog/${map[id] ?? "MP2000"}.png?v=9`;
}

export function catalogPhoto(item: CatalogItem): string {
  return (
    bundledPhoto(item.id, item.sku, item.bodyFamilyId ?? "", item.series.replace(/\s+/g, ""), item.series.replace(/\s+/g, "-")) ??
    `/catalog/${item.id}.png?v=9`
  );
}
