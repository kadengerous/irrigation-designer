import { bundledPhoto } from "@/lib/catalog-photos";

export type FlowKind = "table" | "interpolated" | "matched-precip" | "none";
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

export type CatalogNozzle = {
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
  stripPerformance?: { pressureBar: number; w: number; l: number }[];
};

// Verified Hunter tables, with explicit provenance and nullable missing values.
import catalogData from "@/data/hunter-catalog.json";
export const CATALOG = catalogData as CatalogItem[];

export const CATEGORIES: { id: Family | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mp", label: "MP Standard" },
  { id: "mp800", label: "MP800" },
  { id: "strip", label: "MP Strip" },
  { id: "he", label: "Pro High-Efficiency" },
  { id: "spray", label: "Pro Adjustable" },
  { id: "fixed", label: "Pro Fixed" },
  { id: "prostrip", label: "Strip Pattern" },
  { id: "short", label: "Short-Radius" },
  { id: "bubbler", label: "Bubblers" },
  { id: "rotor", label: "Rotors" },
  { id: "golf", label: "Golf Rotors" },
  { id: "st", label: "ST System" },
];
export const FAMILIES = CATEGORIES;

export function itemById(id: string): CatalogItem | undefined {
  return CATALOG.find((c) => c.id === id);
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
  if (item.family === "mp" || item.family === "mp800" || item.family === "strip") return "PRS40";
  if (item.type === "rotor") return item.id;
  return "PRS30";
}

/** Official takeoff name: nozzle / rotator / rotor / body. */
export function bomLineName(item: CatalogItem): string {
  if (item.type === "body") return `Корпус Hunter ${item.name}`;
  if (item.type === "rotor" || item.family === "golf" || item.family === "st") return `Ротор Hunter ${item.id}`;
  if (item.family === "mp" || item.family === "mp800" || item.family === "strip") {
    return `Ротор Hunter MP Rotator ${item.id}`;
  }
  if (item.type === "bubbler") return `Баблер Hunter ${item.id}`;
  return `Сопло Hunter ${item.id}`;
}
export function bodiesFor(item: CatalogItem): CatalogItem[] {
  if (item.type === "rotor") return [];
  const bodies = CATALOG.filter((c) => c.type === "body");
  if (item.family === "mp" || item.family === "mp800" || item.family === "strip") {
    return bodies.filter((b) => b.id === "PRS40" || b.id === "PRO-SPRAY" || b.id === "PS-ULTRA");
  }
  return bodies.filter((b) => b.id === "PRS30" || b.id === "PRO-SPRAY" || b.id === "PS-ULTRA");
}

export const POP_UP_MM = [100, 150, 200, 300, 400] as const;

export function popUpHeights(item: CatalogItem): number[] {
  if (item.family === "st" || item.family === "golf") {
    const mm = item.popUpMm ?? 100;
    return POP_UP_MM.includes(mm as (typeof POP_UP_MM)[number]) ? [...POP_UP_MM] : [mm, ...POP_UP_MM];
  }
  return [...POP_UP_MM];
}
export function workingPressureBar(item: CatalogItem, bodyId?: string | null, _nozzleId?: string | null) {
  if (bodyId === "PRS40") return 2.8;
  if (bodyId === "PRS30") return 2.1;
  return item.nozzles.find(n => n.id === _nozzleId)?.recommendedBar ?? item.recommendedPressureBar;
}

/** Strip dimensions at the head's pressure; preserve the manufacturer's nozzle origin. */
export function stripAtPressure(item: CatalogItem, pressureBar = item.recommendedPressureBar) {
  const base = item.strip;
  if (!base) return undefined;
  const rows = [...(item.stripPerformance ?? [])].sort((a, b) => a.pressureBar - b.pressureBar);
  if (!rows.length) return base;
  if (pressureBar < rows[0]!.pressureBar - .001 || pressureBar > rows.at(-1)!.pressureBar + .001) return undefined;
  const lo = [...rows].reverse().find(r => r.pressureBar <= pressureBar + .001) ?? rows[0]!;
  const hi = rows.find(r => r.pressureBar >= pressureBar - .001) ?? rows.at(-1)!;
  const t = hi.pressureBar === lo.pressureBar ? 0 : (pressureBar - lo.pressureBar) / (hi.pressureBar - lo.pressureBar);
  const w = lo.w + (hi.w - lo.w) * t, l = lo.l + (hi.l - lo.l) * t;
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
    bundledPhoto(item.id, item.sku, item.series.replace(/\s+/g, ""), item.series.replace(/\s+/g, "-")) ??
    `/catalog/${item.id}.png?v=9`
  );
}
