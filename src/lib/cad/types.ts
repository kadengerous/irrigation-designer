import type { Pt } from "@/lib/geometry";

export const DRAWING_VERSION = 1;

export type RegionType =
  | "lawn"
  | "bed"
  | "shrub"
  | "groundcover"
  | "path"
  | "hardscape"
  | "terrace"
  | "parking"
  | "building"
  | "pool"
  | "water"
  | "gravel"
  | "mulch"
  | "no_irrigation"
  | "site"
  | "other";

export type CadVertex = { id: string; x: number; y: number };

/** Line or circular arc. bulge = tan(sweep/4), signed. 0 = line. */
export type CadEdge = {
  id: string;
  a: string;
  b: string;
  bulge: number;
  faceL: string | null;
  faceR: string | null;
};

export type CadFace = {
  id: string;
  type: RegionType;
  /** CCW outer loop of edge ids with direction +1 a→b, -1 b→a */
  outer: { e: string; dir: 1 | -1 }[];
  holes: { e: string; dir: 1 | -1 }[][];
  locked: boolean;
  hidden: boolean;
  /** Parametric circle kept exact (not tessellated). */
  circle?: { cx: number; cy: number; r: number };
  ellipse?: { cx: number; cy: number; rx: number; ry: number; rot?: number };
  rect?: { x: number; y: number; w: number; h: number; rot: number };
  spline?: { pts: Pt[]; closed: boolean };
  /** Smoothed pencil stroke. Open strokes live as standalone faces without CAD edges. */
  freehand?: { pts: Pt[]; closed: boolean };
  /** Free-form contour created with the numbered point tool. */
  pointShape?: boolean;
  /** Joined pencil/spline contour edited only through boundary nodes. */
  nodeEdit?: { curvedVertexIds: string[] };
  hydro?: { need: "low" | "medium" | "high"; method: "spray" | "mp" | "rotor" | "drip" | "bubbler" | "none" };
  name?: string;
  fill?: string;
};

export type ConstraintKind =
  | "coincident"
  | "horiz"
  | "vert"
  | "parallel"
  | "perp"
  | "midpoint"
  | "tangent"
  | "concentric"
  | "equalLen"
  | "equalR"
  | "lock";

export type CadConstraint = {
  id: string;
  kind: ConstraintKind;
  a: string;
  b?: string;
};

export type CadDim = {
  id: string;
  a: Pt;
  b: Pt;
  offset: number;
  aId?: string;
  bId?: string;
};

export type CadPlant = {
  id: string;
  kind: "tree" | "shrub";
  x: number;
  y: number;
  r: number;
};

export type CadLayerId =
  | "underlay"
  | "boundary"
  | "buildings"
  | "paving"
  | "landscape"
  | "plants"
  | "irrigation"
  | "pipes"
  | "dims"
  | "annotations";

export const CAD_LAYERS: { id: CadLayerId; key: string }[] = [
  { id: "underlay", key: "layerUnderlay" },
  { id: "boundary", key: "layerBoundary" },
  { id: "buildings", key: "layerBuildings" },
  { id: "paving", key: "layerPaving" },
  { id: "landscape", key: "layerLandscape" },
  { id: "plants", key: "layerPlants" },
  { id: "irrigation", key: "layerIrrigation" },
  { id: "pipes", key: "layerPipes" },
  { id: "dims", key: "layerDims" },
  { id: "annotations", key: "layerNotes" },
];

export function layerForType(t: RegionType): CadLayerId {
  if (t === "site") return "boundary";
  if (t === "building") return "buildings";
  if (t === "path" || t === "hardscape" || t === "terrace" || t === "parking" || t === "gravel") return "paving";
  if (t === "shrub" || t === "groundcover") return "plants";
  return "landscape";
}

export function defaultLayerState(): Record<CadLayerId, { visible: boolean; locked: boolean }> {
  return Object.fromEntries(CAD_LAYERS.map((l) => [l.id, { visible: true, locked: false }])) as Record<
    CadLayerId,
    { visible: boolean; locked: boolean }
  >;
}

export type CadText = {
  id: string;
  x: number;
  y: number;
  text: string;
  size: number;
};

export type CadDrawing = {
  version: number;
  vertices: Record<string, CadVertex>;
  edges: Record<string, CadEdge>;
  faces: Record<string, CadFace>;
  dims?: Record<string, CadDim>;
  texts?: Record<string, CadText>;
  constraints?: Record<string, CadConstraint>;
  plants?: Record<string, CadPlant>;
  layers?: Record<CadLayerId, { visible: boolean; locked: boolean }>;
};

export type SnapKind =
  | "end"
  | "mid"
  | "intersect"
  | "center"
  | "edge"
  | "grid"
  | "head"
  | "horiz"
  | "vert"
  | "parallel"
  | "perp"
  | "extend"
  | "tangent"
  | "close"
  | "none";

export type SnapHit = { pt: Pt; kind: SnapKind; vertexId?: string; edgeId?: string; faceId?: string };

export type CadTool =
  | "line"
  | "polyline"
  | "polygon"
  | "rect"
  | "rotrect"
  | "circle"
  | "ellipse"
  | "arc"
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
  | "path"
  | "select";

export function emptyDrawing(): CadDrawing {
  return {
    version: DRAWING_VERSION,
    vertices: {},
    edges: {},
    faces: {},
    dims: {},
    texts: {},
    constraints: {},
    plants: {},
    layers: defaultLayerState(),
  };
}

export function isIrrigationTarget(t: RegionType) {
  return t === "lawn";
}

export function isExclusion(t: RegionType) {
  return t === "building" || t === "pool" || t === "path" || t === "hardscape" || t === "parking" || t === "terrace" || t === "no_irrigation";
}

export const REGION_FILL: Record<RegionType, string> = {
  lawn: "#c5d4b0",
  bed: "#c4b7a8",
  shrub: "#9caf88",
  groundcover: "#b7c99a",
  path: "#d9cbb4",
  hardscape: "#c8c4bc",
  terrace: "#c9c0b4",
  parking: "#b8b8b4",
  building: "#c4b8ae",
  pool: "#8eb8c8",
  water: "#7aa8bc",
  gravel: "#c2bbae",
  mulch: "#b39a7a",
  no_irrigation: "#d4d4d0",
  site: "transparent",
  other: "#d0ccc4",
};

export const FACE_FILLS = [
  "transparent",
  "#c8e6b0",
  "#b8e0d2",
  "#efe3c0",
  "#f3d4b8",
  "#f0c9c9",
  "#dcccec",
  "#c5ddf2",
  "#f3ecd4",
  "#c9d9b8",
  "#d8d4cc",
  "#fde8c8",
  "#e4f0c8",
  "#d6e8f5",
  "#ead9e8",
  "#ef4444",
  "#7f1d1d",
  "#facc15",
  "#8b5cf6",
  "#8b5a3c",
  "#6b5344",
  "#8a8a86",
  "#5c5c5a",
  "#3a3a38",
  "#1a1a18",
] as const;

export const FACE_TEXTURES = [
  { id: "texture:pavers-gray", label: "Серая плитка", src: "/materials/pavers-gray.png" },
  { id: "texture:pavers-beige", label: "Бежевая плитка", src: "/materials/pavers-beige.png" },
  { id: "texture:pavers-brick", label: "Клинкерная плитка", src: "/materials/pavers-brick.png" },
  { id: "texture:asphalt", label: "Асфальт", src: "/materials/asphalt.png" },
  { id: "texture:decking", label: "Террасная доска", src: "/materials/decking.png" },
  { id: "texture:concrete", label: "Бетон", src: "/materials/concrete.png" },
  { id: "texture:roof-shingle", label: "Мягкая кровля", src: "/materials/roof-shingle.png" },
  { id: "texture:roof-tile", label: "Черепица", src: "/materials/roof-tile.png" },
  { id: "texture:roof-metal", label: "Фальцевая кровля", src: "/materials/roof-metal.png" },
  { id: "texture:pool-water", label: "Вода в бассейне", src: "/materials/pool-water.png" },
  { id: "texture:lawn", label: "Газон", src: "/materials/lawn.png" },
  { id: "texture:gravel", label: "Гравий", src: "/materials/gravel.png" },
] as const;

/** Automatic fill order for newly drawn shapes (transparent is a manual choice). */
export const SHAPE_FILL_CYCLE = ["#c8e6b0", "#c5ddf2", "#f3d4b8", "#dcccec", "#facc15", "#b8e0d2", "#f0c9c9", "#8b5cf6"] as const;
