import { text as uiText } from "@/lib/i18n";
import {staticImageSrc} from '../static-image-src';
import type { Pt } from "@/lib/geometry";
import type { LandscapeObject } from "../landscape-objects";
import type { TextureSize } from "./texture-mapping";
import type { PlantCategory, PlantRecord, PlantIrrigationContext } from "../landscape-types";

export const DRAWING_VERSION = 1;

export type LayerPurpose = "irrigation" | "none" | "sun" | "shade";

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

export type LayerGrouping = {
  number?: number;
  layerId?: string;
  layerPivot?: Pt;
  layerAngle?: number;
  name?: string;
  parent?: LayerGrouping;
};

export type CadFace = {
  segment?: boolean;
  layerParent?: LayerGrouping;
  /** Components with the same id are one selectable/editable layer. */
  layerId?: string;
  layerPivot?: Pt;
  layerAngle?: number;
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
  /** Original editable corners; outer contains the actual tangent lines and circular arcs. */
  rounding?: { corners: CadVertex[]; radii: number[] };
  spline?: { pts: Pt[]; closed: boolean };
  /** Smoothed pencil stroke. Open strokes live as standalone faces without CAD edges. */
  freehand?: { pts: Pt[]; closed: boolean };
  /** Free-form contour created with the numbered point tool. */
  pointShape?: boolean;
  /** Joined pencil/spline contour edited only through boundary nodes. */
  nodeEdit?: { curvedVertexIds: string[]; curveRuns?: string[][] };
  hydro?: { need: "low" | "medium" | "high"; method: "spray" | "mp" | "rotor" | "drip" | "bubbler" | "none"; purpose?: LayerPurpose };
  name?: string;
  fill?: string;
  /** Local dimensions in metres when the material was applied. */
  textureRotation?: 0 | 90;
  textureSize?: TextureSize;
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
  autoKey?: string;
  aHeadId?: string;
  bHeadId?: string;
  faceAxis?: { id: string; axis: "x" | "y" };
  label?: string;
  a: Pt;
  b: Pt;
  offset: number;
  aId?: string;
  bId?: string;
};

export type CadPlant = {
  id: string;
  /** Omitted in older projects: preserve the original illustrated view. */
  visualMode?: import('../landscape-types').LandscapeVisualMode;
  kind: PlantCategory;
  x: number;
  y: number;
  r: number;
  /** Degrees about the crown centre, independent of its diameter. */
  rotation?: number;
  /** Snapshot keeps identification and source references available in saved projects. */
  catalogId?: string;
  catalog?: PlantRecord;
  hidden?: boolean;
  locked?: boolean;
  irrigation?: Partial<PlantIrrigationContext> & { zoneId?: number | null };
};

export type CadLayerId =
  | "underlay"
  | "boundary"
  | "buildings"
  | "paving"
  | "landscape"
  | "plants"
  | "trees" | "shrubs" | "flowers" | "grasses"
  | "furniture" | "lighting" | "decor" | "equipment"
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
  { id: "trees", key: "plantCategory_tree" },
  { id: "shrubs", key: "plantCategory_shrub" },
  { id: "flowers", key: "plantCategory_flower" },
  { id: "grasses", key: "plantCategory_grass" },
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
  fontFamily?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export type CadDrawing = {
  suppressedAutoDimensions?: string[];
  irrigationDimensions?: {headsOnly?:boolean;offset:number;suppressed?:string[];headIds?:string[]};
  automaticDimensionMode?: 'plan' | 'irrigation';
  faceOrder?: string[];
  version: number;
  vertices: Record<string, CadVertex>;
  edges: Record<string, CadEdge>;
  faces: Record<string, CadFace>;
  dims?: Record<string, CadDim>;
  texts?: Record<string, CadText>;
  constraints?: Record<string, CadConstraint>;
  plants?: Record<string, CadPlant>;
  landscapeObjects?: Record<string, LandscapeObject>;
  layers?: Record<CadLayerId, { visible: boolean; locked: boolean; name?: string }>;
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
  | "cut"
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

export function layerPurpose(face: CadFace): LayerPurpose {
  return face.hydro?.purpose ?? (face.hydro?.method === "none" || isExclusion(face.type) || face.type === "water" ? "none" : "irrigation");
}

/** The layer's watering assignment is independent of its landscape material. */
export function irrigationRegionType(face: CadFace): RegionType {
  if (face.hydro?.purpose) return face.hydro.purpose === "none" ? "no_irrigation" : "lawn";
  return face.type;
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
  "#ffffff",
  "#f97316",
  "#14b8a6",
  "#2563eb",
] as const;

export type FaceTexture = { id: `texture:${string}`; label: string; src: string; patternScale?: number; baseRotation?: 0 | 90; roof?: "hip" | "gable" };

/** Available materials; IDs also identify textures in saved projects. */
export const FACE_TEXTURES: readonly FaceTexture[] = [
  { id: "texture:pavers-gray", get label() { return uiText("material_tile_gray"); }, src: "/materials/pavers-gray.png" },
  { id: "texture:pavers-brick", get label() { return uiText("material_clinker"); }, src: "/materials/pavers-brick.png" },
  { id: "texture:decking", get label() { return uiText("material_deck"); }, src: "/materials/decking.png" },
  { id: "texture:roof-shingle", get label() { return uiText("material_shingle"); }, src: "/materials/roof-shingle.png", roof: "hip" },
  { id: "texture:roof-metal", get label() { return uiText("material_metal_roof"); }, src: "/materials/roof-metal.png", roof: "hip" },
  { id: "texture:flagstone", get label() { return uiText("material_flagstone"); }, src: "/materials/flagstone.png", patternScale: 0.06 },
  { id: "texture:pavers-beige", get label() { return uiText("material_tile_beige"); }, src: "/materials/pavers-beige.png" },
  { id: "texture:asphalt", get label() { return uiText("material_asphalt"); }, src: "/materials/asphalt.png" },
  { id: "texture:concrete", get label() { return uiText("material_concrete"); }, src: "/materials/concrete.png" },
  { id: "texture:roof-tile", get label() { return uiText("material_roof_tile"); }, src: "/materials/roof-tile.png", roof: "hip" },
  { id: "texture:pool-water", get label() { return uiText("material_pool"); }, src: "/materials/pool-water.png" },
  { id: "texture:gravel", get label() { return uiText("material_gravel"); }, src: "/materials/gravel.png" },
  { id: "texture:greenhouse", get label() { return uiText("material_greenhouse"); }, src: "/materials/greenhouse.png", roof: "gable" },
  { id: "texture:mulch", get label() { return uiText("material_mulch"); }, src: "/materials/mulch.png", patternScale: 0.06 },
  { id: "texture:soil", get label() { return uiText("material_soil"); }, src: "/materials/soil.png" },
  { id: "texture:sand", get label() { return uiText("material_sand"); }, src: "/materials/sand.png" },
  { id: "texture:pebbles", get label() { return uiText("material_pebble"); }, src: "/materials/pebbles.png", patternScale: 0.06 },
  { id: "texture:rubber-surface", get label() { return uiText("material_rubber"); }, src: "/materials/rubber-surface.png", patternScale: 0.06 },
  { id: "texture:roof-metal-tile", get label() { return uiText("texture:roof-metal-tile"); }, src: "/materials/roof-metal-tile.png", roof: "hip" },
  { id: "texture:roof-slate", get label() { return uiText("texture:roof-slate"); }, src: "/materials/roof-slate.png", roof: "hip" },
  { id: "texture:roof-natural-slate", get label() { return uiText("texture:roof-natural-slate"); }, src: "/materials/roof-natural-slate.png", roof: "hip" },
  { id: "texture:pond-water", get label() { return uiText("texture:pond-water"); }, src: "/materials/pond-water.png" },
  { id: "texture:river-water", get label() { return uiText("texture:river-water"); }, src: "/materials/river-water.png" },
  { id: "texture:gravel-white", get label() { return uiText("texture:gravel-white"); }, src: "/materials/gravel-white.png", patternScale: 0.06 },
  { id: "texture:gravel-black", get label() { return uiText("texture:gravel-black"); }, src: "/materials/gravel-black.png", patternScale: 0.06 },
  { id: "texture:greenhouse-polycarbonate", get label() { return uiText("texture:greenhouse-polycarbonate"); }, src: "/materials/greenhouse-polycarbonate.png", roof: "gable" },
  { id: "texture:greenhouse-bronze", get label() { return uiText("texture:greenhouse-bronze"); }, src: "/materials/greenhouse-bronze.png", roof: "gable" },
  { id: "texture:roof-thatch", get label() { return uiText("texture:roof-thatch"); }, src: "/materials/roof-thatch.png", roof: "hip" },
  { id: "texture:roof-cedar", get label() { return uiText("texture:roof-cedar"); }, src: "/materials/roof-cedar.png", roof: "hip" },
  { id: "texture:lake-water", get label() { return uiText("texture:lake-water"); }, src: "/materials/lake-water.png" },
  { id: "texture:sea-water", get label() { return uiText("texture:sea-water"); }, src: "/materials/sea-water.png" },
  { id: "texture:stream-water", get label() { return uiText("texture:stream-water"); }, src: "/materials/stream-water.png" },
  { id: "texture:fountain-water", get label() { return uiText("texture:fountain-water"); }, src: "/materials/fountain-water.png" },
  { id: "texture:reflecting-water", get label() { return uiText("texture:reflecting-water"); }, src: "/materials/reflecting-water.png" },
  { id: "texture:crushed-brick", get label() { return uiText("texture:crushed-brick"); }, src: "/materials/crushed-brick.png", patternScale: 0.06 },
  { id: "texture:greenhouse-timber", get label() { return uiText("texture:greenhouse-timber"); }, src: "/materials/greenhouse-timber.png", roof: "gable" },
  { id: "texture:greenhouse-film", get label() { return uiText("texture:greenhouse-film"); }, src: "/materials/greenhouse-film.png", roof: "gable" },
  { id: "texture:gazebo-wood", get label() { return uiText("texture:gazebo-wood"); }, src: "/materials/gazebo-wood.png", roof: "hip" },
  { id: "texture:pavilion-metal", get label() { return uiText("texture:pavilion-metal"); }, src: "/materials/pavilion-metal.png", roof: "hip" },
  { id: "texture:pergola", get label() { return uiText("texture:pergola"); }, src: "/materials/pergola.png" },
  { id: "texture:lawn-parterre", get label() { return uiText("texture:lawn-parterre"); }, src: "/materials/lawn-parterre.png", patternScale: 0.06 },
  { id: "texture:lawn-sport", get label() { return uiText("texture:lawn-sport"); }, src: "/materials/lawn-sport.png", patternScale: 0.06 },
  { id: "texture:lawn-meadow", get label() { return uiText("texture:lawn-meadow"); }, src: "/materials/lawn-meadow.png", patternScale: 0.06 },
  { id: "texture:lawn-striped", get label() { return uiText("texture:lawn-striped"); }, src: "/materials/lawn-striped.png", patternScale: 0.24 },
] as const;

export const FACE_TEXTURE_GROUPS = [
  { key: "material_lawn", ids: ["texture:lawn-parterre", "texture:lawn-sport", "texture:lawn-meadow", "texture:lawn-striped"] },
  { key: "materialGroupRoof", ids: ["texture:roof-shingle", "texture:roof-metal", "texture:roof-tile", "texture:roof-metal-tile", "texture:roof-slate", "texture:roof-natural-slate", "texture:roof-thatch", "texture:roof-cedar"] },
  { key: "materialGroupSurfaces", ids: ["texture:pavers-gray", "texture:pavers-brick", "texture:pavers-beige", "texture:decking", "texture:flagstone", "texture:asphalt", "texture:concrete", "texture:rubber-surface"] },
  { key: "materialGroupWater", ids: ["texture:pool-water", "texture:pond-water", "texture:river-water", "texture:lake-water", "texture:sea-water", "texture:stream-water", "texture:fountain-water", "texture:reflecting-water"] },
  { key: "materialGroupGround", ids: ["texture:soil", "texture:mulch", "texture:sand", "texture:gravel", "texture:pebbles", "texture:gravel-white", "texture:gravel-black", "texture:crushed-brick"] },
  { key: "materialGroupStructures", ids: ["texture:greenhouse", "texture:greenhouse-polycarbonate", "texture:greenhouse-bronze", "texture:greenhouse-timber", "texture:greenhouse-film", "texture:gazebo-wood", "texture:pavilion-metal", "texture:pergola"] },
].map(group => ({ key: group.key, textures: group.ids.map(id => FACE_TEXTURES.find(texture => texture.id === id)!) }));

/** Retired choices remain renderable in saved projects. */
export const ALL_FACE_TEXTURES: readonly FaceTexture[] = [
  ...FACE_TEXTURES,
  { id: "texture:lawn", get label() { return uiText("material_lawn"); }, src: "/materials/lawn.png" },
  { id: "texture:vegetable-beds", get label() { return uiText("material_beds"); }, src: "/materials/vegetable-beds.png", patternScale: 0.06 },
];

for(const texture of ALL_FACE_TEXTURES)texture.src=staticImageSrc(texture.src);

export function faceTexture(fill: string | undefined): FaceTexture | undefined {
  return ALL_FACE_TEXTURES.find((texture) => texture.id === fill);
}

export function texturePatternScale(fill: string): number {
  return faceTexture(fill)?.patternScale ?? 0.24;
}

/** Automatic fill order for newly drawn shapes (transparent is a manual choice). */
export const SHAPE_FILL_CYCLE = ["#c8e6b0", "#c5ddf2", "#f3d4b8", "#dcccec", "#facc15", "#b8e0d2", "#f0c9c9", "#8b5cf6"] as const;
