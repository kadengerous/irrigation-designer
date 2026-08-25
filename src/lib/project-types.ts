import type { MeasureUnit, Pt } from "@/lib/geometry";
import type { CadDrawing, RegionType } from "@/lib/cad/types";

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
  locked: boolean;
  hidden: boolean;
  /** Circle radius in metres; ignored otherwise. */
  radius?: number;
  cadType?: RegionType;
  fill?: string;
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
  designPressure: number;
  bodyId: string | null;
  locked: boolean;
  needsReview: boolean;
};

export type Zone = {
  id: number;
  name: string;
  hidden: boolean;
  locked: boolean;
};

export type Underlay = {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  rotation: 0 | 90 | 180 | 270;
  visible: boolean;
  locked: boolean;
  name: string;
};

export type WaterSource = {
  staticBar: number | null;
  dynamicBar: number | null;
  availableLpm: number | null;
  elevationM: number | null;
};

export type ProjectMeta = {
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
};

export type Project = {
  id: string;
  name: string;
  meta: ProjectMeta;
  water: WaterSource;
  underlay: Underlay | null;
  polygons: Geom[];
  drawing?: CadDrawing;
  heads: Head[];
  zones: Zone[];
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
  "#c45c26",
  "#2f6f9a",
  "#4d7a3e",
  "#6b4f7a",
  "#a85a2a",
  "#3d7c8c",
  "#7a5a2b",
  "#3d6b5c",
];

export function zoneColor(id: number) {
  const i = Math.max(1, Math.floor(id)) - 1;
  return ZONE_PALETTE[i % ZONE_PALETTE.length]!;
}

export function defaultZones(): Zone[] {
  return [{ id: 1, name: "Зона 1", hidden: false, locked: false }];
}

export function isStockZoneName(name: string, id: number) {
  const n = name.trim();
  if (n === `Зона ${id}` || n === `Zone ${id}`) return true;
  return /^(Зона|Zone|Zona)\s+\d+$/i.test(n);
}

export function compactAfterRemoveZone(zones: Zone[], heads: Head[], removeId: number) {
  const remaining = zones.filter((z) => z.id !== removeId).sort((a, b) => a.id - b.id);
  const idMap = new Map<number, number>();
  const nextZones = remaining.map((z, i) => {
    const nid = i + 1;
    idMap.set(z.id, nid);
    return { ...z, id: nid, name: isStockZoneName(z.name, z.id) ? `Зона ${nid}` : z.name };
  });
  const nextHeads = heads.map((h) => ({ ...h, zone: idMap.get(h.zone) ?? 1 }));
  return { zones: nextZones, heads: nextHeads, idMap };
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

export function emptyProject(name = "Без названия"): Project {
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
  return ids.map((id) => ({ id, name: `Зона ${id}`, hidden: false, locked: false }));
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
