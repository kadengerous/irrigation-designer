import { text } from "./i18n";
import type { MeasureUnit, Pt } from "@/lib/geometry";
import type { CadDrawing, RegionType } from "@/lib/cad/types";
import type { TextureSize } from "@/lib/cad/texture-mapping";

export type { MeasureUnit, Pt };
export type { CadDrawing, RegionType };

export type Tool =
  | "draw"
  | "place"
  | "move"
  | "measure"
  | "scale"
  | null;

export type DrawSub =
  | "none"
  | "line"
  | "polyline"
  | "rect"
  | "rotrect"
  | "arc"
  | "circle"
  | "ellipse"
  | "polygon"
  | "triangle"
  | "hexagon"
  | "spline"
  | "freehand"
  | "offset"
  | "fillet"
  | "chamfer"
  | "fill"
  | "dim"
  | "text"
  | "trim"
  | "extend"
  | "copy"
  | "array"
  | "polar"
  | "hole"
  | "match"
  | "path";

export type MeasureSub = "measure" | "guide" | "guide-point";

export type PolyKind = "lawn" | "bed" | "path" | "hardscape";

export const REGION_TO_POLY: Record<string, PolyKind> = {
  lawn: "lawn",
  bed: "bed",
  shrub: "bed",
  groundcover: "bed",
  path: "path",
  hardscape: "hardscape",
  terrace: "hardscape",
  parking: "hardscape",
  building: "hardscape",
  pool: "path",
  water: "path",
  gravel: "hardscape",
  mulch: "bed",
  no_irrigation: "hardscape",
  site: "lawn",
  other: "bed",
};

export type GeomType = "poly" | "rect" | "circle" | "arc" | "line" | "guide";

export type Geom = {
  id: string;
  type: GeomType;
  kind: PolyKind;
  points: Pt[];
  closed: boolean;
  holes?: Pt[][];
  locked: boolean;
  hidden: boolean;
  /** Circle radius in metres; ignored otherwise. */
  radius?: number;
  ellipse?: { cx: number; cy: number; rx: number; ry: number; rot?: number };
  cadType?: RegionType;
  fill?: string;
  textureRotation?: 0 | 90;
  textureSize?: TextureSize;
  name?: string;
};

export type Head = {
  id: string;
  catalogId: string;
  nozzleId: string | null;
  x: number;
  y: number;
  /** Start of sector, degrees, 0 = east, clockwise (y-down). */
  start: number;
  arc: number;
  r: number;
  zone: number;
  figureId?: string;
  zoneAssignment?: 'manual';
  designPressure: number;
  bodyId: string | null;
  popUpMm: number | null;
  locked: boolean;
  /** Optional for projects saved before individual equipment visibility was introduced. */
  hidden?: boolean;
  needsReview: boolean;
};

export type Zone = {
  id: number;
  figureId?: string;
  name: string;
  nameKind?: "generated" | "custom";
  hidden: boolean;
  locked: boolean;
};

export type Underlay = {
  source?: { name: string; mime: string; data: string };
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  rotation: number;
  visible: boolean;
  locked: boolean;
  name: string;
  pixelWidth?: number;
  pixelHeight?: number;
  pageNumber?: number;
  pageCount?: number;
  calibration?: { distanceM: number; metersPerPixel: number | null };
};

export type WaterSource = {
  staticBar: number | null;
  dynamicBar: number | null;
  availableLpm: number | null;
  elevationM: number | null;
};

export type ProjectMeta = {
  climateZone?: string | null;
  season?: string | null;
  address: string;
  client: string;
  person: string;
  phone: string;
  email: string;
  designer: string;
  createdAt: string;
  notes: string;
  targetMm: number;
  soil: string;
  slopePct: number | null;
  /** Measured/design soil intake at this site's slope, in canonical mm/h. No assumed soil defaults. */
  infiltrationMmHr?: number | null;
};

export type Project = {
  view?: { showCoverage:boolean;showLabels:boolean;showGrid:boolean;snapOn:boolean;snapGridOn:boolean;gridStep:number;measureUnit:string;activeZoneId:number;pxPerMeter?:number;panX?:number;panY?:number };
  id: string;
  name: string;
  meta: ProjectMeta;
  water: WaterSource;
  underlay: Underlay | null;
  polygons: Geom[];
  drawing?: CadDrawing;
  heads: Head[];
  zones: Zone[];
  /** Last explicit automatic-zoning flow limit, in L/min. */
  zoneFlowLimitLpm?: number;
  /** Takeoff body counts; if omitted, follow the number of heads on that body. */
  bomBodyQty?: Record<string, number>;
  scaleCalibrated: boolean;
  updatedAt: string;
};

export type LayerId = "underlay" | "geometry" | "heads" | "dims" | "labels";

export type AnalysisMode = "normal" | "cover" | "overlap" | "flow" | "pressure" | "zones" | "errors";

export type ProjectListItem = {
  id: string;
  name: string;
  address: string;
  updatedAt: string;
};

export const MAX_ZONES = 100;

export const ZONE_PALETTE = [
  "#86c99a",
  "#68b884",
  "#9ed1a3",
  "#73bda5",
  "#a4ce8c",
  "#67b68d",
  "#96c6ac",
  "#7fc6b2",
];

export function zoneColor(id: number) {
  const i = Math.max(1, Math.floor(id)) - 1;
  return ZONE_PALETTE[i % ZONE_PALETTE.length]!;
}

export function defaultZones(): Zone[] {
  return [{ id: 1, name: "", nameKind: "generated", hidden: false, locked: false }];
}

export function isStockZoneName(name: string, id: number) {
  const n = name.trim();
  if (n === `Зона ${id}` || n === `Zone ${id}`) return true;
  return /^(Зона|Zone|Zona)\s+\d+$/i.test(n);
}

export function zoneLabel(zone: Pick<Zone, "id" | "name" | "nameKind">): string {
  if (zone.nameKind === "custom") return zone.name;
  return zone.nameKind === "generated" || !zone.name.trim() || isStockZoneName(zone.name, zone.id) ? text("zoneN", { n: zone.id }) : zone.name;
}

export function compactAfterRemoveZone(zones: Zone[], heads: Head[], removeId?: number, transferTo?: number) {
  const remaining = zones.filter((z) => z.id !== removeId).sort((a, b) => a.id - b.id);
  const idMap = new Map<number, number>();
  const nextZones = remaining.map((z, i) => {
    const nid = i + 1;
    idMap.set(z.id, nid);
    return { ...z, id: nid, name: z.nameKind !== "custom" && isStockZoneName(z.name, z.id) ? "" : z.name };
  });
  const replacement = idMap.get(transferTo ?? remaining[0]?.id ?? 1) ?? 1;
  const nextHeads = heads.map((h) => ({ ...h, zone: h.zone===0 ? 0 : idMap.get(h.zone) ?? replacement }));
  return { zones: nextZones, heads: nextHeads, idMap };
}

/** Compact display numbers together with every engineering reference. */
export function renumberProjectZones(project: Project): Project {
  const { zones, heads, idMap } = compactAfterRemoveZone(project.zones, project.heads);
  if (project.zones.every(z => idMap.get(z.id) === z.id)) return project;
  const drawing = project.drawing ? { ...project.drawing, plants: Object.fromEntries(
    Object.entries(project.drawing.plants ?? {}).map(([id, plant]) => [id, plant.irrigation?.zoneId
      ? { ...plant, irrigation: { ...plant.irrigation, zoneId: idMap.get(plant.irrigation.zoneId) ?? null } } : plant])
  ) } : undefined;
  return { ...project, zones, heads, ...(drawing ? { drawing } : {}) };
}

export function emptyMeta(): ProjectMeta {
  return {
    address: "",
    client: "",
    person: "",
    phone: "",
    email: "",
    designer: "",
    createdAt: new Date().toISOString().slice(0, 10),
    notes: "",
    targetMm: 10,
    soil: "",
    slopePct: null,
  };
}

export function emptyWater(): WaterSource {
  return { staticBar: null, dynamicBar: 2.8, availableLpm: null, elevationM: null };
}

export function emptyProject(name = ""): Project {
  return {
    id: `p-${Date.now().toString(36)}`,
    name,
    meta: emptyMeta(),
    water: emptyWater(),
    underlay: null,
    polygons: [],
    heads: [],
    zones: defaultZones(),
    scaleCalibrated: true,
    updatedAt: new Date().toISOString(),
  };
}

export function zonesFromHeads(heads: Head[]): Zone[] {
  const ids = [...new Set(heads.map((h) => h.zone))].sort((a, b) => a - b);
  if (!ids.length) return defaultZones();
  return ids.map((id) => ({ id, name: "", nameKind: "generated" as const, hidden: false, locked: false }));
}

export function polyPoints(g: Geom): Pt[] {
  if (g.type === "circle" && g.points[0] && g.radius) {
    const c = g.points[0];
    const n = 48;
    const r = g.radius;
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
    }
    return pts;
  }
  return g.points;
}
