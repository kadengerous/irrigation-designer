import {equipmentGroupSelection,equipmentGroupItem} from './equipment-groups';
import {type EquipmentFilters} from "./equipment-library";
import {commitAutoConnections} from './engineering-connections';
import {landscapeRecord,landscapeLayerLocked,landscapeLayerVisible,landscapeFootprint,rotationDegrees,type LandscapeObject,type LandscapeCategory} from "./landscape-objects";
import {plantLayerId,plantLayerLocked,plantLayerVisible,normalizedPlantRotation} from "./plant-visuals";
import {repairLandscapeIdentity,changeLandscapeGroup,type LandscapeGroupAction} from './landscape-groups';
import { cutFigures } from "./cad/cut-figures";
import { catalogHeadDefaults, boundedPressure, computeFlow, geometryAt, headPressureAvailable, headPressureSteps, performanceAt, radiusRange } from "@/lib/flow";
import type {CatalogItem} from './equipment-catalog';
import {automaticHeadCatalog,automaticZonePeers,selectAutomaticHead,type RequestedSector} from './automatic-head';
import { isHeadLocked, isHeadVisible, visibleProjectHeads } from "./head-visibility";
import { fitAutomaticNozzle, usesAutomaticNozzle } from "@/lib/head-adjustment";
import { orderedFaces, layerFaceIds, layerArea, transformLayer } from "./cad/engine";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { projectStorage, retainedTrash, type TrashedProject } from "./workspace-storage";
import {isLandscapeVisualMode, type LandscapeVisualMode, type PlantRecord, type PlantCategory} from "./landscape-types";
import type { CadPlant } from "./cad/types";
import { cadSnap } from "./cad/snap";
import {snapLandscapePoint} from './landscape-snapping';
import {canvasWorkspace} from './workspace-canvas';
import { assignZoneForNewHead, defaultMaxZoneLpm, distributeZones, projectZoneLimit, redistributeZonesAfterRemoval } from "@/lib/hydro";
import { resolveSprinklerDimensions } from "./cad/sprinkler-dimensions";
import { snapSprinklerPoint } from './head-snapping';
import { figureAtPoint, irrigationFigures } from './irrigation-figures';
import { catalogForHead,
  CATALOG,
  equipmentSnapshot,
  clampArc,
  clampRadius,
  defaultBodyFor,
  defaultPopUpMm,
  bodyForHead,
  bodySelectionPatch,
  mountingKind,
  popUpHeights,
  itemById,
  workingPressureBar,
  nozzleTablePressure,
} from "@/lib/equipment-catalog";
import {
  boundsOf,
  closestOnSegment,
  cornerArc,
  dist,
  inwardStart,
  snapGrid,
  snapInProject,
  uid,
  visibleGridStep,
  parseMeasureUnit,
  clampPxPerMeter,
  normDeg,
  type MeasureUnit,
  type Pt,
} from "@/lib/geometry";
import { tr, parseLocale, parseNumberFormat, parseDecimals, setActiveLocale, setNumberPrefs, type Locale, type NumberFormat } from "@/lib/i18n";
import { parseAccent, parseButtonStyle, parseThemeId, parseUiSize, type ButtonStyle, type ThemeId, type UiSize } from "@/lib/theme";
import {
  bootstrapLocaleAndUnits,
  detectPreset,
  deviceBcp47,
  METRIC_UNITS,
  numberFormatForUnits,
  parseUnitPrefs,
  recommendedUnitSystem,
  regionFromBcp47,
  unitsFromPreset,
  setActiveUnits,
  type UnitPrefs,
  type UnitPreset,
} from "@/lib/units";
import { addConstraint, type ConstraintKind } from "@/lib/cad/constraints";
import { fromCadMode, type CadMode } from "@/lib/cad/mode";
import { parseDxf } from "@/lib/cad/dxf";
import {
  compactAfterRemoveZone,
  renumberProjectZones,
  remapEngineeringZones,
  defaultZones,
  emptyProject,
  MAX_ZONES,
  zonesFromHeads,
  type AnalysisMode,
  type DrawSub,
  type Geom,
  type Head,
  type MeasureSub,
  type PolyKind,
  type Project,
  type Tool,
  type Underlay,
  type Zone,
  REGION_TO_POLY,
} from "@/lib/project-types";
import {
  alignEdge,
  alignEdgeHorizontal,
  addArc3,
  addChain,
  addDrawingLines,
  segmentLayers,
  addPointShape,
  markPointShape,
  addCircle,
  addFreehandStroke,
  addText,
  addRect,
  addTriangle,
  addHexagon,
  addDim,
  outsideDimensionOffset,
  addEllipse,
  addPlant,
  addSplineStroke,
  cleanupDrawing,
  setFaceHydro,
  setFaceName as setCadFaceName,
  setFaceFill as setCadFaceFill,
  setLayerFlag,
  updateSpline,
  bulgeFromPoints,
  chamferFace,
  chamferVertex,
  deleteBoundary,
  deleteDim,
  deleteFace,
  divideEdge,
  drawingOrMigrate as rawDrawingOrMigrate,
  duplicateFace,
  extendEdge,
  faceArea,
  faceBoundaryKey,
  faceCentroid,
  facePoints,
  faceVertices,
  filletFace,
  filletVertex,
  flattenEdge as flattenCadEdge,
  insertVertexOnEdge,
  intersectFaces,
  setCircleRadius,
  setEllipseRadii,
  scaleEllipse,
  scaleFaceAbout,
  setRectFromDiag,
  setRectFromEdge,
  setRectSize,
  setTriangleSize,
  setTriangleSides,
  triangleFromBounds,
  hexagonFromBounds,
  mirrorCopyFace,
  mirrorFace,
  lengthenEdge,
  joinCollinear,
  moveFace,
  moveText as moveCadText,
  moveVertex,
  offsetChain,
  pathFromCenterline,
  pickEdgeAt,
  pickVertexAt,
  polarArray,
  rotateFace,
  scaleFace,
  scaleFaceAxis,
  setDimOffset as setCadDimOffset,
  setEdgeBulge,
  setFaceHidden,
  setFaceLocked,
  setFaceType,
  clearInvalidRectMeta,
  snapFaceToGrid,
  smartFill,
  unionFaces,
  trimEdge,
  toPolygons,
} from "@/lib/cad/engine";
import { SHAPE_FILL_CYCLE, type CadDrawing, type LayerPurpose, type RegionType, type SnapKind } from "@/lib/cad/types";
import { prepareFusionControls } from "@/lib/cad/engine";

export type { Head, Geom, PolyKind, Project, Tool, Underlay, Zone };
import { memberDrawing, restoreMember } from "./cad/member-editing";
import { calibratedReference, patchReference, referenceCorners } from "./reference-geometry";
const drawingOrMigrate = rawDrawingOrMigrate;
export function drawingForEditing(project: Project): CadDrawing {
  return memberDrawing(rawDrawingOrMigrate(project), useProject.getState().groupMemberId);
}

export type Draft = {
  lineLength?: number;
  points: Pt[];
  redoPoints?: Pt[];
  redoClosure?: boolean;
  scaleA: Pt | null;
  scaleB: Pt | null;
  measureA: Pt | null;
};

export type RightMode = "project" | "drawing" | "object" | "zone" | "irrigation" | "landscape";

/** A head inspector is temporary; leaving it returns to the active workspace. */
function headPanelMode(section: "plan" | "landscape" | "irrigation" | "engineering" | null, count: number): RightMode {
  return count === 1 ? "object" : count > 1 || section === "irrigation" ? "zone" : "drawing";
}

type State = {
  inspectedLandscapeId: string|null;
  selectedLandscapeId: string|null;
  pendingLandscapeObject: Omit<LandscapeObject,'id'|'x'|'y'>|null;
  landscapeLibrarySection: "plants"|PlantCategory|LandscapeCategory|"favorites"|"recent";
  landscapeVisualMode: LandscapeVisualMode;
  landscapeFavorites: string[];
  landscapeRecent: string[];
  toggleLandscapeFavorite:(id:string)=>void;
  inspectLandscape:(id:string)=>void;
  selectLandscape:(id:string|null)=>void;
  prepareLandscape:(id:string,size:Pick<LandscapeObject,'width'|'length'|'rotation'|'keepRatio'>&{visualMode?:LandscapeVisualMode})=>void;
  placeLandscape:(point:Pt,pointerType?:string)=>void;
  updateLandscape:(id:string,patch:Partial<Pick<LandscapeObject,'x'|'y'|'width'|'length'|'rotation'|'keepRatio'|'noIrrigation'|'hidden'|'locked'|'visualMode'>>)=>void;
  duplicateLandscape:(id:string)=>void;
  removeLandscape:(id:string)=>void;
  changeLandscapeGroup:(kind:'plant'|'object',id:string,action:LandscapeGroupAction)=>void;
  renameLandscapeLayer:(category:LandscapeCategory,name:string)=>void;
  deleteLandscapeLayer:(category:LandscapeCategory)=>void;

  landscapeOpen: boolean;
  inspectedPlant: PlantRecord | null;
  selectedPlantId: string | null;
  pendingCatalogPlant: { record: PlantRecord; kind: PlantCategory; diameterM: number; visualMode?:LandscapeVisualMode } | null;
  setLandscapeOpen: (open: boolean) => void;
  inspectPlant: (plant: PlantRecord) => void;
  selectPlant: (id: string | null) => void;
  preparePlant: (plant: PlantRecord, kind: PlantCategory, diameterM: number, visualMode?:LandscapeVisualMode) => void;
  placeCatalogPlant: (point: Pt) => void;
  updatePlant: (id: string, patch: Partial<Pick<CadPlant, "x" | "y" | "r" | "rotation" | "hidden" | "locked" | "irrigation" | "visualMode">>) => void;
  duplicatePlant: (id: string) => void;
  removePlant: (id: string) => void;
  groupMemberId: string | null;
  groupMemberGroupId: string | null;
  selectGroupMember: (id: string, edit?: boolean) => void;
  finishGroupMember: () => void;
  setGroupMemberFlag: (id: string, patch: { hidden?: boolean; locked?: boolean }) => void;
  renameGroupMember: (id: string, name: string) => void;
  reorderGroupMembers: (ids: string[]) => void;
  reorderLayers: (ids: string[]) => void;
  deleteGroupMember: (id: string) => void;
  project: Project;
  newProjectReturnId: string | null;
  projects: Project[];
  trash: TrashedProject[];
  tool: Tool;
  drawSub: DrawSub;
  measureSub: MeasureSub;
  placeId: string | null;
  selectedId: string | null;
  sectorEditId: string | null;
  setSectorEdit: (id: string | null) => void;
  selectedIds: string[];
  selectedPolyId: string | null;
  selectedPolyIds: string[];
  selectedEdgeId: string | null;
  activeZoneId: number;
  zoneFocus: { projectId: string; zoneId: number; headId: string | null } | null;
  simulationProjectId: string | null;
  toggleSimulation: () => void;
  focusZone: (zoneId: number, headId?: string | null) => void;
  transferHeadToZone: (headId: string, zoneId: number) => void;
  hideLandscapeInIrrigation: boolean;
  showCoverage: boolean;
  showRadii: boolean;
  showLabels: boolean;
  showGrid: boolean;
  textHidden: boolean;
  snapOn: boolean;
  snapGridOn: boolean;
  orthoOn: boolean;
  gridStep: number;
  dimensionOffset: number;
  dimensionOffsetCustomized: boolean;
  catalogOpen: boolean;
  catalogVisible: boolean;
  catalogPlacementArmed: boolean;
  selectCatalogItem: (id: string) => void;
  rightOpen: boolean;
  rightMode: RightMode;
  projectFormOpen: boolean;
  familyFilter: string;
  equipmentFilters: EquipmentFilters;
  setEquipmentFilters: (patch: Partial<EquipmentFilters>) => void;
  polyKind: PolyKind;
  regionType: RegionType;
  measureUnit: MeasureUnit;
  locale: Locale;
  themeId: ThemeId;
  buttonStyle: ButtonStyle;
  accent: string;
  themeAccent: string;
  themeAccent2: string;
  themeGradient: boolean;
  uiSize: UiSize;
  showHints: boolean;
  numberFormat: NumberFormat;
  decimals: number;
  units: UnitPrefs;
  unitPreset: UnitPreset;
  localeBootstrapped: boolean;
  localizationVersion: number;
  workspaceSection: "plan" | "landscape" | "irrigation" | "engineering" | null;
  commitEngineering: (engineering: import('./engineering').EngineeringData) => void;
  pxPerMeter: number;
  panX: number;
  panY: number;
  draft: Draft;
  fitNonce: number;
  analysis: AnalysisMode;
  saveState: "idle" | "saving" | "saved";
  past: Project[];
  future: Project[];
  pastOps: string[];
  futureOps: string[];
  lastOp: string;
  autoHeadsWiped: boolean;
  spaceDown: boolean;
  arrayCount: number;
  inferenceLock: SnapKind | null;
  mergePrompt: { edgeId: string; types: [RegionType, RegionType] } | null;
  pendingConstraint: { kind: ConstraintKind; a: string } | null;
  pendingPlant: "tree" | "shrub" | null;
  cadEditId: string | null;
  splinePreview: { faceId: string; points: Pt[] } | null;
  cadLiveRot: number | null;

  setTool: (t: Tool) => void;
  deactivateDrawing: () => void;
  setCadMode: (m: CadMode) => void;
  setDrawSub: (s: DrawSub) => void;
  setMeasureSub: (s: MeasureSub) => void;
  setPlaceId: (id: string | null) => void;
  selectHead: (id: string | null) => void;
  selectHeads: (ids: string[]) => void;
  selectPoly: (id: string | null, add?: boolean) => void;
  alignFaces: (mode: "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter") => void;
  punchSelected: (innerId: string) => void;
  selectEdge: (id: string | null) => void;
  setCoverage: (v: boolean) => void;
  setRadii: (v: boolean) => void;
  setLabels: (v: boolean) => void;
  setGrid: (v: boolean) => void;
  setSnap: (v: boolean) => void;
  setOrtho: (v: boolean) => void;
  setSnapGrid: (v: boolean) => void;
  setGridStep: (n: number) => void;
  setCatalogOpen: (v: boolean) => void;
  setCatalogVisible: (v: boolean) => void;
  setCadEdit: (id: string | null) => void;
  finishSegmentEdit: () => boolean;
  setCadLiveRot: (deg: number | null) => void;
  setRightOpen: (v: boolean) => void;
  setRightMode: (m: RightMode) => void;
  setProjectFormOpen: (v: boolean) => void;
  referenceOpen: boolean;
  setReferenceOpen: (open: boolean) => void;
  setMeasureUnit: (u: MeasureUnit) => void;
  setLocale: (l: Locale) => void;
  setThemeId: (id: ThemeId) => void;
  setButtonStyle: (s: ButtonStyle) => void;
  setAccent: (hex: string) => void;
  setThemeAccent: (hex: string) => void;
  setThemeAccent2: (hex: string) => void;
  setThemeGradient: (v: boolean) => void;
  setUiSize: (s: UiSize) => void;
  setShowHints: (v: boolean) => void;
  setNumberFormat: (f: NumberFormat) => void;
  setDecimals: (n: number) => void;
  setUnitPreset: (p: UnitPreset) => void;
  patchUnits: (patch: Partial<UnitPrefs>) => void;
  setZoom: (px: number) => void;
  setPan: (x: number, y: number) => void;
  setFamily: (f: string) => void;
  setPolyKind: (k: PolyKind) => void;
  setRegionTypeDraft: (t: RegionType) => void;
  setAnalysis: (m: AnalysisMode) => void;
  setSpaceDown: (v: boolean) => void;
  newProject: () => void;
  cancelProjectForm: () => void;
  patchProject: (patch: Partial<Project>) => void;
  setUnderlay: (u: Underlay | null) => void;
  patchUnderlay: (patch: Partial<Underlay>) => void;
  addDraftPoint: (p: Pt) => void;
  tapPolygonDraftPoint: (index:number) => void;
  setDraftPoints: (pts: Pt[]) => void;
  popDraftPoint: () => void;
  closePolygon: (kind?: PolyKind) => void;
  finishOpenDraw: () => void;
  confirmCut: () => void;
  commitGeom: (g: Geom) => void;
  commitDrawing: (d: CadDrawing, selectedId?: string | null, keepTool?: boolean) => void;
  applyCadLength: (meters: number, hover: Pt | null) => void;
  applyCadSize: (w: number, h: number, hover: Pt | null) => void;
  applyCadArea: (m2: number, hover: Pt | null) => void;
  applyCadRadius: (r: number, hover: Pt | null) => void;
  setRectCorner: (opposite: Pt, p: Pt) => void;
  setRectEdge: (edge: 0 | 1 | 2 | 3, p: Pt) => void;
  setRectWH: (w: number, h: number) => void;
  setTriangleSides: (base: number, left: number, right: number) => void;
  setRectRotation: (deg: number) => void;
  removeBoundary: (edgeId: string) => { warning?: string };
  setRegionType: (faceId: string, type: RegionType) => void;
  setFaceName: (name: string) => void;
  setFaceFill: (color: string) => void;
  convertToPath: (faceId: string) => void;
  fillRegionAt: (p: Pt) => void;
  bulgeEdge: (edgeId: string, p: Pt) => void;
  offsetBy: (meters: number) => void;
  filletAt: (p: Pt, radius: number) => void;
  chamferAt: (p: Pt, distM: number) => void;
  addDimension: (a: Pt, b: Pt, offset?: number) => void;
  mirrorSelected: (axis: "h" | "v") => void;
  hideSelected: (hidden: boolean) => void;
  lockSelected: (locked: boolean) => void;
  scaleSelected: (factor: number) => void;
  scaleSelectedAxis: (sx: number, sy: number) => void;
  filletSelected: (radius: number) => void;
  chamferSelected: (distM: number) => void;
  mirrorCopySelected: (axis: "h" | "v") => void;
  joinSelected: () => void;
  offsetBoth: (meters: number) => void;
  centerSelected: () => void;
  setDimOffset: (id: string, offset: number) => void;
  moveNote: (id: string, p: Pt) => void;
  divideSelectedEdge: (n: number) => void;
  lengthenSelectedEdge: (extra: number) => void;
  unionWith: (faceId: string) => void;
  snapSelectedToGrid: () => void;
  alignSelectedEdge: (deg?: number) => void;
  importDxf: (text: string) => void;
  setInferenceLock: (k: SnapKind | null) => void;
  confirmMerge: (type: RegionType) => void;
  addCadConstraint: (kind: ConstraintKind, a: string, b?: string) => void;
  beginConstraint: (kind: ConstraintKind, a: string) => void;
  intersectSelected: () => void;
  setCircleR: (r: number) => void;
  setEllipseR: (rx: number, ry: number) => void;
  scaleSelectedFace: (k: number) => void;
  setFaceVertex: (vertexId: string, p: Pt) => void;
  setFaceArea: (m2: number) => void;
  setSplinePt: (index: number, p: Pt) => void;
  addAngleGuides: (p: Pt) => void;
  addPlantAt: (p: Pt, kind: "tree" | "shrub") => void;
  setHydro: (need: "low" | "medium" | "high", method: "spray" | "mp" | "rotor" | "drip" | "bubbler" | "none") => void;
  setLayerPurpose: (faceId: string, purpose: LayerPurpose) => void;
  setCadLayer: (id: import("@/lib/cad/types").CadLayerId, patch: { visible?: boolean; locked?: boolean }) => void;
  setPendingPlant: (k: "tree" | "shrub" | null) => void;
  addNote: (p: Pt, text: string) => void;
  trimAt: (p: Pt) => void;
  extendAt: (p: Pt) => void;
  copySelectedBy: (dx: number, dy: number) => void;
  arraySelected: (dx: number, dy: number, count: number) => void;
  polarSelected: (center: Pt, count?: number) => void;
  setArrayCount: (n: number) => void;
  fitSelected: (viewW: number, viewH: number) => void;
  moveSelectedFace: (dx: number, dy: number) => void;
  rotateSelectedFace: (deg: number) => void;
  flattenEdge: (edgeId: string) => void;
  insertVertex: (edgeId: string, p?: Pt) => void;
  cancelDraft: () => void;
  deleteSelected: () => void;
  removeHead: (id: string) => void;
  duplicateSelected: () => void;
  placeHead: (p: Pt, catalogId?: string) => void;
  placeAutomaticHead: (sector: RequestedSector, pressureBar: number) => boolean;
  moveHead: (id: string, p: Pt) => void;
  updateHead: (id: string, patch: Partial<Head>) => void;
  setHeadFlag: (id: string, patch: Partial<Pick<Head, "hidden" | "locked">>) => void;
  patchHeadLive: (id: string, patch: Partial<Head>) => void;
  beginHeadEdit: () => void;
  endHeadEdit: () => void;
  cancelHeadEdit: () => void;
  movePolyPoint: (id: string, index: number, p: Pt) => void;
  applyScale: (a: Pt, b: Pt, meters: number) => void;
  autoZone: (maxLpm: number) => void;
  setHeads: (heads: Head[]) => void;
  requestFit: () => void;
  fitToView: (viewW: number, viewH: number) => void;
  setActiveZone: (id: number) => void;
  addZone: (assignHeadId?: string) => void;
  renameZone: (id: number, name: string) => void;
  removeZone: (id: number, transferTo?: number) => void;
  toggleZoneHidden: (id: number) => void;
  toggleZoneLocked: (id: number) => void;
  assignSelectedToZone: (id: number) => void;
  finishMoveHead: (id: string, p: Pt) => void;
  finishMovePolyPoint: (id: string, index: number, p: Pt) => void;
  setLastSegmentLength: (meters: number) => void;
  openLibrary: (id: string) => void;
  removeLibrary: (id: string) => void;
  restoreLibrary: (id: string) => void;
  purgeLibrary: (id: string) => void;
  duplicateLibrary: (id: string) => void;
  renameLibrary: (id: string, name: string) => void;
  saveCurrentToLibrary: () => void;
  importPacked: (p: Project, extras?: Partial<Pick<State, "showCoverage" | "showLabels" | "showGrid" | "snapOn" | "snapGridOn" | "gridStep" | "measureUnit" | "activeZoneId">>) => void;
  undo: () => void;
  redo: () => void;
  commit: () => void;
};

const emptyDraft = (): Draft => ({ points: [], scaleA: null, scaleB: null, measureA: null });

function slimUnderlay(u: Underlay | null): Underlay | null {
  return u;
}

function cloneProject(p: Project): Project {
  return JSON.parse(JSON.stringify(p)) as Project;
}

function migrateHead(h: Partial<Head> & { catalogId?: string; x: number; y: number }): Head {
  const item = h.catalogId ? catalogForHead(h) : undefined;
  const body = item ? bodyForHead(item, h.bodyId, h.popUpMm, h.bodySnapshot) : undefined;
  const mount = item ? mountingKind(item) : undefined;
  const height = body?.popUpMm ?? h.popUpMm ?? (item ? defaultPopUpMm(item) : 100);
  const badBody = item && mount === "spray" && !body;
  const badHeight = item?.type === "rotor" && !!item.popUpOptions?.length && height != null && !popUpHeights(item).includes(height);
  return {
    id: h.id ?? uid("h"),
    catalogId: h.catalogId ?? "MP2000-90",
    nozzleId: h.nozzleId ?? null,
    ...(h.equipmentSnapshot ? {equipmentSnapshot:h.equipmentSnapshot} : item ? {equipmentSnapshot:equipmentSnapshot(itemById(item.id)??item)} : {}),
    ...(h.bodySnapshot ? {bodySnapshot:h.bodySnapshot} : body ? {bodySnapshot:equipmentSnapshot(body)} : {}),
    ...(h.equipmentAdjusted ? {equipmentAdjusted:true} : {}),
    x: h.x,
    y: h.y,
    start: h.start ?? 0,
    arc: h.arc ?? 180,
    r: h.r ?? item?.rNom ?? 5,
    zone: h.zone ?? 1,
    ...(h.figureId ? {figureId:h.figureId} : {}),
    ...(h.zoneAssignment === 'manual' ? {zoneAssignment:'manual' as const} : {}),
    designPressure: h.designPressure ?? item?.recommendedPressureBar ?? 2.8,
    bodyId: mount === "riser" || mount === "integrated" ? item!.id : body?.id ?? h.bodyId ?? (item ? defaultBodyFor(item) : "PRS40"),
    popUpMm: mount === "riser" ? 0 : height,
    locked: h.locked ?? false,
    ...(typeof h.hidden === "boolean" ? { hidden: h.hidden } : {}),
    needsReview: !!h.needsReview || !!badBody || !!badHeight || !item || !!h.nozzleId && !item?.nozzles.some(n => n.id === h.nozzleId) ||
      !!item && h.designPressure != null && item.nozzles.some(n => n.performance.length) &&
      (!performanceAt(item,h.nozzleId,h.designPressure,h.arc ?? 180)||!headPressureAvailable(item,h)),
  };
}

function migrateGeom(g: Record<string, unknown>): Geom {
  const pts = (g.points as Pt[]) ?? [];
  return {
    id: String(g.id ?? uid("g")),
    type: (g.type as Geom["type"]) ?? "poly",
    kind: (g.kind as PolyKind) ?? "lawn",
    points: pts,
    closed: g.closed !== false,
    locked: Boolean(g.locked),
    hidden: Boolean(g.hidden),
    radius: typeof g.radius === "number" ? g.radius : undefined,
    cadType: (g.cadType as Geom["cadType"]) ?? undefined,
    fill: typeof g.fill === "string" ? g.fill : undefined,
    name: typeof g.name === "string" ? g.name : undefined,
    ellipse: g.ellipse as Geom["ellipse"],
    textureRotation: g.textureRotation as Geom["textureRotation"],
    textureSize: g.textureSize as Geom["textureSize"],
  };
}

export function migrateProject(raw: Record<string, unknown>): Project {
  const base = emptyProject(typeof raw.name === "string" ? raw.name : "");
  const heads = Array.isArray(raw.heads) ? (raw.heads as Parameters<typeof migrateHead>[0][]).map(migrateHead) : [];
  const legacyPolygons = Array.isArray(raw.polygons)
    ? (raw.polygons as Record<string, unknown>[]).map(migrateGeom)
    : [];
  let drawing = (raw.drawing as Project["drawing"]) ?? undefined;
  if (drawing?.faces && drawing.edges && drawing.vertices) drawing = repairLandscapeIdentity(segmentLayers(drawing));
  // CAD faces are authoritative. Older loads could have stripped appearance
  // from the derived polygons while leaving the original faces intact.
  const hasDrawing = drawing?.version && drawing.faces && drawing.vertices && drawing.edges &&
    Object.keys(drawing.faces).length + Object.keys(drawing.vertices).length > 0;
  const polygons = hasDrawing ? toPolygons(drawing!) : legacyPolygons;
  const zones = (
    Array.isArray(raw.zones) && (raw.zones as Zone[]).length
      ? (raw.zones as Zone[])
      : zonesFromHeads(heads)
  ).map((z) => ({
    id: z.id,
    ...(typeof z.figureId === 'string' ? {figureId:z.figureId} : {}),
    name: z.name ?? "",
    ...(z.nameKind === "custom" || z.nameKind === "generated" ? { nameKind: z.nameKind } : {}),
    hidden: Boolean(z.hidden),
    locked: Boolean(z.locked),
  }));
  const underlay = (raw.underlay as Underlay | null) ?? null;
  return renumberProjectZones({
    ...base,
    ...raw,
    id: typeof raw.id === "string" ? raw.id : base.id,
    name: typeof raw.name === "string" ? raw.name : base.name,
    meta: { ...base.meta, ...((raw.meta as object) ?? {}) },
    water: { ...base.water, ...((raw.water as object) ?? {}) },
    underlay: underlay
      ? {
          ...underlay,
          rotation: underlay.rotation ?? 0,
          visible: underlay.visible ?? true,
          locked: underlay.locked ?? false,
          name: underlay.name ?? "Reference",
        }
      : null,
    polygons,
    drawing,
    heads,
    zones,
    scaleCalibrated: raw.scaleCalibrated !== false && !underlay ? true : Boolean(raw.scaleCalibrated),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  });
}

function fitHeadToRadius(next: Head, patch: Partial<Head>, reference: Head): Head {
  let item=catalogForHead(next);
  if (!item) return {...next,needsReview:true};
  if(next.nozzleId&&!item.nozzles.some(n=>n.id===next.nozzleId))next.nozzleId=item.nozzles[0]?.id??null;
  if (patch.bodyId != null) {
    const choice = bodySelectionPatch(item, patch.bodyId, reference);
    next.bodyId = choice?.bodyId ?? reference.bodyId;
    next.popUpMm = choice?.popUpMm ?? reference.popUpMm;
    if (choice && patch.designPressure == null) next.designPressure = choice.designPressure;
    item=catalogForHead(next)??item;
  }
  if (patch.popUpMm != null && item.type === "rotor" && !popUpHeights(item).includes(patch.popUpMm)) next.popUpMm = reference.popUpMm;
  next.arc=clampArc(item,next.arc);
  const steps = headPressureSteps(item,next);
  if (steps.length && (patch.designPressure != null || patch.nozzleId != null || patch.arc != null || patch.bodyId != null || patch.r != null)) {
    const requested = Number.isFinite(next.designPressure) ? next.designPressure : item.recommendedPressureBar;
    next.designPressure = boundedPressure(steps,nozzleTablePressure(item,requested))!;
  }
  if (usesAutomaticNozzle(item) && patch.nozzleId === undefined &&
      (patch.r != null || patch.arc != null)) {
    return fitAutomaticNozzle(item, next, reference);
  }
  const row=geometryAt(item,next.nozzleId,next.designPressure,next.arc);
  if (row) {
    const min=radiusRange(item,next.nozzleId,next.designPressure,next.arc)?.min ?? row.radiusM;
    if (patch.r == null) {
      if (patch.nozzleId != null && patch.nozzleId !== reference.nozzleId) next.r = row.radiusM;
      else if (patch.designPressure != null || patch.bodyId != null && next.designPressure !== reference.designPressure)
        next.r = row.radiusM;
      else if(patch.bodyId!=null&&item.radiusByPopUpMm&&next.popUpMm!==reference.popUpMm)next.r=row.radiusM;
    }
    next.r = Math.max(min, Math.min(next.r, row.radiusM));
    next.needsReview=computeFlow(item,{nozzleId:next.nozzleId,pressureBar:next.designPressure,arc:next.arc,radius:next.r}).lpm==null;
  } else if(item.nozzles.length)next.needsReview=true;
  return next;
}

/** Audited adjustment bounds depend on the selected nozzle and pressure. */
function clampHeadRadius(item:CatalogItem,head:Head){
  if(['rain-bird','toro','k-rain'].includes(item.manufacturerId??'')&&item.strip)return geometryAt(item,head.nozzleId,head.designPressure,head.arc)?.radiusM??head.r;
  const pressureRelative=['hunter','k-rain','rain-bird','toro'].includes(item.manufacturerId??'hunter');
  const range=pressureRelative?radiusRange(item,head.nozzleId,head.designPressure,head.arc):null;
  return range?Math.max(range.min,Math.min(range.max,head.r)):clampRadius(item,head.r);
}

/** Shared by inspector and estimate; body-height changes retain the designed radius. */
export function updateHeadSettings(head: Head, patch: Partial<Head>): Head {
  const replacement = patch.catalogId && patch.catalogId !== head.catalogId ? itemById(patch.catalogId) : undefined;
  if(patch.catalogId && patch.catalogId !== head.catalogId && (!replacement||replacement.placementSupported===false))return head;
  const defaults = replacement ? catalogHeadDefaults(replacement) : {};
  const changed = replacement ? {...head,...defaults,...patch,equipmentSnapshot:equipmentSnapshot(replacement),equipmentAdjusted:true,popUpMm:defaultPopUpMm(replacement),needsReview:replacement.verificationStatus==='Needs Review'} : {...head,...patch};
  if(replacement){changed.arc=clampArc(replacement,head.arc);changed.r=head.r;changed.designPressure=Math.min(head.designPressure,itemById(changed.bodyId??'')?.regulatedPressureBar??Infinity);}
  const next = fitHeadToRadius(changed, replacement ? {...patch,r:head.r,arc:head.arc,designPressure:head.designPressure} : patch, head);
  const item = catalogForHead(next);
  if (item) {
    next.r = clampHeadRadius(item, next); next.arc = clampArc(item, next.arc);
    const badBody = mountingKind(item) === "spray" && !bodyForHead(item, next.bodyId, next.popUpMm, next.bodySnapshot);
    const badHeight = item.type === "rotor" && !!item.popUpOptions?.length && next.popUpMm != null && !popUpHeights(item).includes(next.popUpMm);
    next.needsReview = !!next.needsReview || badBody || badHeight || !headPressureAvailable(item,next);
  }
  if(patch.bodyId!=null||replacement){const body=itemById(next.bodyId??'');next.bodySnapshot=body?.type==='body'?equipmentSnapshot(body):undefined;}
  if (next.start != null) next.start = ((next.start % 360) + 360) % 360;
  return next;
}

let headEditBase: Project | null = null;
const viewSnapshots = new WeakMap<Project,{key:string;project:Project}>();
export function projectWithView(s: State): Project {
  const view:NonNullable<Project["view"]>={showCoverage:s.showCoverage,showLabels:s.showLabels,showGrid:s.showGrid,snapOn:s.snapOn,snapGridOn:s.snapGridOn,gridStep:s.gridStep,measureUnit:s.measureUnit,activeZoneId:s.activeZoneId,pxPerMeter:s.pxPerMeter,panX:s.panX,panY:s.panY};
  const key=JSON.stringify(view), cached=viewSnapshots.get(s.project);
  if(cached?.key===key) return cached.project;
  const project={...s.project,view};viewSnapshots.set(s.project,{key,project});return project;
}

export const useProject = create<State>()(
  persist(
    (set, get) => {
      const drawingOrMigrate = (project: Project) => memberDrawing(rawDrawingOrMigrate(project), get().groupMemberId);
      const touch = (project: Project): Project => preserveConstruction(project, { ...project, updatedAt: new Date().toISOString() });

      // Construction history belongs to in-memory undo snapshots, never project exports.
      const closedConstructions = new WeakMap<Project, { points: Pt[]; faceId: string }>();
      // Saving/renaming is not an undoable geometry operation. Preserve the
      // construction transition when these operations replace the project shell.
      const preserveConstruction = (source: Project, replacement: Project): Project => {
        const construction = closedConstructions.get(source);
        if (construction) closedConstructions.set(replacement, construction);
        return replacement;
      };
      const historySnapshot = (project: Project) => {
        const snapshot = cloneProject(project);
        const construction = closedConstructions.get(project);
        if (construction) closedConstructions.set(snapshot, construction);
        return snapshot;
      };

      const withCommit = (next: Project, op = "edit") => {
        next = {...next,heads:next.heads.map(h=> {
          if(h.equipmentSnapshot?.id===h.catalogId||get().project.heads.some(old=>old.id===h.id&&old.catalogId===h.catalogId))return h;
          const item=itemById(h.catalogId);
          const body=itemById(h.bodyId??'');
          return item?{...h,equipmentSnapshot:equipmentSnapshot(item),...(body?.type==='body'?{bodySnapshot:equipmentSnapshot(body)}:{})}:h;
        })};
        if (next.drawing && op !== 'engineering') {
          const drawing = segmentLayers(restoreMember(next.drawing, rawDrawingOrMigrate(get().project), get().groupMemberId), get().cadEditId ?? get().selectedPolyId ?? undefined);
          next = { ...next, drawing, polygons: toPolygons(drawing) };
        }
        const { project, past, pastOps, projects } = get();
        const remainingHeadIds = new Set(next.heads.map(h => h.id));
        if (project.heads.some(h => !remainingHeadIds.has(h.id))) {
          next = redistributeZonesAfterRemoval(next);
          // Commit the repaired chain along with the deletion, including manual
          // head anchors, so save/reopen and undo see the same dimensions.
          if(next.drawing) {
            const removedIds=project.heads.filter(h=>!remainingHeadIds.has(h.id)).map(h=>h.id);
            const repaired={...next.drawing,dims:resolveSprinklerDimensions(next.drawing,next.heads,false,removedIds)};
            const resolved=rawDrawingOrMigrate({...next,drawing:repaired});
            const drawing={...resolved,...(resolved.irrigationDimensions?{irrigationDimensions:{
              ...resolved.irrigationDimensions,headIds:resolved.irrigationDimensions.headIds?.filter(id=>remainingHeadIds.has(id)),
            }}:{})};
            next={...next,drawing,polygons:toPolygons(drawing)};
          }
          set({ zoneFocus: null });
        }
        const past2 = [...past, historySnapshot(project)].slice(-200);
        const ops2 = [...pastOps, get().lastOp].slice(-200);
        const item = touch(next);
        const listed = projects.some((x) => x.id === item.id);
        set({
          project: item,
          activeZoneId: item.zones.some(z => z.id === get().activeZoneId) ? get().activeZoneId : item.zones[0]?.id ?? 1,
          past: past2,
          pastOps: ops2,
          future: [],
          futureOps: [],
          lastOp: op,
          saveState: listed || isNamed(item) || projectHasContent(item) ? "saved" : "idle",
          projects: listed || isNamed(item) || projectHasContent(item) ? upsertList(projects, item) : projects,
        });
      };

      return {
        commitEngineering: engineering => withCommit({...get().project,engineering:commitAutoConnections(get().project,engineering)},'engineering'),
        groupMemberId: null,
        groupMemberGroupId: null,
        selectGroupMember: (id, edit = false) => {
          const face = rawDrawingOrMigrate(get().project).faces[id];
          if (!face?.layerId) return;
          set({ groupMemberId: id, groupMemberGroupId: face.layerId, selectedPolyId: id,
            selectedPolyIds: [id], selectedEdgeId: null, selectedId: null, selectedIds: [],
            cadEditId: null, tool: "draw", drawSub: "none", draft: emptyDraft(),
            rightMode: "drawing", rightOpen: true, catalogOpen: false, splinePreview: null, pendingConstraint: null, mergePrompt: null });
          if (edit) get().setCadEdit(id);
        },
        finishGroupMember: () => {
          const d = rawDrawingOrMigrate(get().project);
          const members = Object.values(d.faces).filter(f => f.layerId === get().groupMemberGroupId);
          set({ groupMemberId: null, groupMemberGroupId: null, cadEditId: null, cadLiveRot: null,
            selectedPolyId: members[0]?.id ?? null, selectedPolyIds: members.map(f => f.id),
            selectedEdgeId: null, splinePreview: null, tool: "draw", drawSub: "none", draft: emptyDraft() });
        },
        setGroupMemberFlag: (id, patch) => {
          const d = rawDrawingOrMigrate(get().project), face = d.faces[id];
          if (!face?.layerId) return;
          const next = { ...d, faces: { ...d.faces, [id]: { ...face, ...patch } } };
          withCommit({ ...get().project, drawing: next }, "member-property");
          if (get().groupMemberId === id && (patch.hidden || patch.locked)) set({ cadEditId: null, splinePreview: null });
        },
        reorderGroupMembers: (ids) => {
          const d = rawDrawingOrMigrate(get().project), group = d.faces[ids[0] ?? ""]?.layerId;
          if (!group) return;
          const members = Object.values(d.faces).filter(f => f.layerId === group);
          if (ids.length !== members.length || new Set(ids).size !== ids.length || ids.some(id => d.faces[id]?.layerId !== group)) return;
          // UI lists foreground first; the renderer paints foreground last.
          const paintOrder = [...ids].reverse();
          if (orderedFaces(d).filter(f=>f.layerId===group).every((f,i) => f.id === paintOrder[i])) return;
          let index = 0;
          const faceOrder = orderedFaces(d).map(f => f.layerId === group ? paintOrder[index++]! : f.id);
          withCommit({ ...get().project, drawing: { ...d, faceOrder } }, "member-order");
        },
        reorderLayers: (ids) => {
          const d = rawDrawingOrMigrate(get().project), faces = orderedFaces(d);
          const key = (f: typeof faces[number]) => f.layerId ?? f.id;
          const keys = [...new Set(faces.map(key))];
          if (ids.length !== keys.length || new Set(ids).size !== ids.length || ids.some(id=>!keys.includes(id))) return;
          const faceOrder = [...ids].reverse().flatMap(id=>faces.filter(f=>key(f)===id).map(f=>f.id));
          if(faceOrder.every((id,i)=>faces[i]?.id===id)) return;
          withCommit({ ...get().project, drawing: { ...d, faceOrder } }, "layer-order");
        },
        renameGroupMember: (id, name) => {
          const raw = rawDrawingOrMigrate(get().project);
          if (!raw.faces[id]?.layerId || raw.faces[id]?.locked) return;
          const view = memberDrawing(raw, id);
          const next = restoreMember(setCadFaceName(view, id, name), raw, id);
          withCommit({ ...get().project, drawing: next }, "member-name");
        },
        deleteGroupMember: (id) => {
          const raw = rawDrawingOrMigrate(get().project), face = raw.faces[id];
          if (!face?.layerId || face.locked) return;
          const next = deleteFace(memberDrawing(raw, id), id);
          withCommit({ ...get().project, drawing: next }, "member-delete");
          if (get().groupMemberId === id) get().finishGroupMember();
        },
        project: emptyProject(),
        newProjectReturnId: null,
        landscapeOpen: false,
        inspectedLandscapeId:null,
        selectedLandscapeId:null,
        pendingLandscapeObject:null,
        landscapeLibrarySection:"tree",
        landscapeVisualMode:"image",
        landscapeFavorites:[],
        landscapeRecent:[],
        toggleLandscapeFavorite:(id)=>set(s=>({landscapeFavorites:s.landscapeFavorites.includes(id)?s.landscapeFavorites.filter(x=>x!==id):[...s.landscapeFavorites,id]})),
        inspectLandscape:(id)=>{
          if(!landscapeRecord(id))return;
          set({inspectedLandscapeId:id,selectedLandscapeId:null,selectedPlantId:null,inspectedPlant:null,pendingCatalogPlant:null,pendingLandscapeObject:null,rightOpen:true,rightMode:'landscape'});
        },
        selectLandscape:(id)=>{
          if(id&&!get().project.drawing?.landscapeObjects?.[id])return;
          if(get().groupMemberId)get().finishGroupMember();
          set({workspaceSection:"landscape",selectedLandscapeId:id,inspectedLandscapeId:null,selectedPlantId:null,inspectedPlant:null,
            selectedId:null,selectedIds:[],selectedPolyId:null,selectedPolyIds:[],selectedEdgeId:null,cadEditId:null,
            tool:null,drawSub:'none',draft:emptyDraft(),pendingCatalogPlant:null,pendingLandscapeObject:null,
            ...(id?{rightOpen:true,rightMode:'landscape' as const}: {})});
        },
        prepareLandscape:(id,size)=>{
          const record=landscapeRecord(id);if(!record)return;
          if(size.visualMode!==undefined&&!isLandscapeVisualMode(size.visualMode))return;
          const pending={catalogId:id,category:record.category,...size,visualMode:size.visualMode??get().landscapeVisualMode,noIrrigation:record.category!=='lighting'};
          if(record.shape==='circle'||record.shape==='square'){pending.width=pending.length;pending.keepRatio=true;}
          if(![pending.width,pending.length,pending.rotation].every(Number.isFinite)||Math.min(pending.width,pending.length)<.03||Math.max(pending.width,pending.length)>100)return;
          if(landscapeLayerLocked(drawingOrMigrate(get().project),record.category))return;
          set({pendingLandscapeObject:pending,selectedLandscapeId:null,selectedPlantId:null,pendingCatalogPlant:null,inspectedPlant:null,
            tool:null,drawSub:'none',catalogOpen:false,cadEditId:null,selectedPolyId:null,selectedPolyIds:[],selectedId:null,selectedIds:[],selectedEdgeId:null,draft:emptyDraft()});
        },
        placeLandscape:(point,pointerType)=>{
          const st=get(),pending=st.pendingLandscapeObject;if(!pending)return;
          const d=drawingOrMigrate(st.project);if(landscapeLayerLocked(d,pending.category))return;
          const pt=snapLandscapePoint(point,{...pending,...point,id:'pending-landscape'},d,{pxPerMeter:st.pxPerMeter,snapOn:st.snapOn,snapGridOn:st.snapOn&&st.snapGridOn,gridStep:st.gridStep,heads:visibleProjectHeads(st.project),pointerType}).pt;
          const id=uid('landscape'),object:LandscapeObject={...pending,x:pt.x,y:pt.y,id,rotation:rotationDegrees(pending.rotation)};
          withCommit({...st.project,drawing:{...d,landscapeObjects:{...d.landscapeObjects,[id]:object},layers:{...d.layers,[pending.category]:{...d.layers?.[pending.category],visible:true,locked:false}} as CadDrawing['layers']}},'landscape-add');
          set({landscapeRecent:[pending.catalogId,...get().landscapeRecent.filter(id=>id!==pending.catalogId)].slice(0,24)});
          get().selectLandscape(id);
        },
        updateLandscape:(id,patch)=>{
          const st=get(),d=drawingOrMigrate(st.project),o=d.landscapeObjects?.[id];
          if(!o||((landscapeLayerLocked(d,o.category)||(o.locked&&patch.locked!==false))&&!Object.keys(patch).every(k=>k==='hidden')))return;
          if(patch.visualMode!==undefined&&!isLandscapeVisualMode(patch.visualMode))return;
          const safe=Object.fromEntries(Object.entries(patch).filter(([key])=>['x','y','width','length','rotation','keepRatio','noIrrigation','hidden','locked','visualMode'].includes(key)));
          const next={...o,...safe,id};
          const shape=landscapeRecord(o.catalogId)?.shape;
          if((shape==='circle'||shape==='square')&&(patch.width!==undefined||patch.length!==undefined||patch.keepRatio!==undefined)){
            if(patch.length!==undefined)next.width=next.length;
            else if(patch.width!==undefined)next.length=next.width;
            next.keepRatio=true;
          }
          if(![next.x,next.y,next.width,next.length,next.rotation].every(Number.isFinite)||Math.min(next.width,next.length)<.03||Math.max(next.width,next.length)>100)return;
          next.rotation=rotationDegrees(next.rotation);
          if(Object.keys(patch).every(k=>next[k as keyof LandscapeObject]===o[k as keyof LandscapeObject]))return;
          withCommit({...st.project,drawing:{...d,landscapeObjects:{...d.landscapeObjects,[id]:next}}},'landscape-edit');
        },
        duplicateLandscape:(id)=>{
          const st=get(),d=drawingOrMigrate(st.project),o=d.landscapeObjects?.[id];
          if(!o||landscapeLayerLocked(d,o.category))return;
          const copyId=uid('landscape'),copy={...o,id:copyId,x:o.x+o.length+.3,locked:false};
          withCommit({...st.project,drawing:{...d,landscapeObjects:{...d.landscapeObjects,[copyId]:copy}}},'landscape-copy');set({landscapeRecent:[o.catalogId,...get().landscapeRecent.filter(id=>id!==o.catalogId)].slice(0,24)});get().selectLandscape(copyId);
        },
        removeLandscape:(id)=>{
          const st=get(),d=drawingOrMigrate(st.project),o=d.landscapeObjects?.[id];
          if(!o||o.locked||landscapeLayerLocked(d,o.category))return;
          const objects={...d.landscapeObjects};delete objects[id];
          withCommit({...st.project,drawing:{...d,landscapeObjects:objects}},'landscape-delete');set({selectedLandscapeId:null});
        },
        changeLandscapeGroup:(kind,id,action)=>{
          const st=get(),d=drawingOrMigrate(st.project),next=changeLandscapeGroup(d,kind,id,action);
          if(next===d)return;
          withCommit({...st.project,drawing:next},'landscape-group-'+action);
          if(action==='delete')set({selectedPlantId:st.selectedPlantId&&next.plants?.[st.selectedPlantId]?st.selectedPlantId:null,selectedLandscapeId:st.selectedLandscapeId&&next.landscapeObjects?.[st.selectedLandscapeId]?st.selectedLandscapeId:null});
        },
        renameLandscapeLayer:(category,name)=>{
          const st=get(),d=drawingOrMigrate(st.project);
          withCommit({...st.project,drawing:{...d,layers:{...d.layers,[category]:{visible:true,locked:false,...d.layers?.[category],name:name.trim().slice(0,120)}} as CadDrawing['layers']}},'landscape-layer-name');
        },
        deleteLandscapeLayer:(category)=>{
          const st=get(),d=drawingOrMigrate(st.project);
          if(landscapeLayerLocked(d,category)||Object.values(d.landscapeObjects??{}).some(o=>o.category===category&&o.locked))return;
          const objects=Object.fromEntries(Object.entries(d.landscapeObjects??{}).filter(([,o])=>o.category!==category));
          const layers={...d.layers} as NonNullable<CadDrawing['layers']>;delete layers[category];
          withCommit({...st.project,drawing:{...d,landscapeObjects:objects,layers}},'landscape-layer-delete');
          if(st.selectedLandscapeId&&!objects[st.selectedLandscapeId])set({selectedLandscapeId:null});
        },

        inspectedPlant: null,
        selectedPlantId:null,
        pendingCatalogPlant: null,
        setLandscapeOpen: (open) => {
          if (get().groupMemberId) get().finishGroupMember();
          set({ workspaceSection: open ? "landscape" : get().workspaceSection, landscapeOpen: open, catalogOpen: false, tool: null, drawSub: "none",
            draft: emptyDraft(), cadEditId: null, selectedPolyId: null, selectedPolyIds: [],
            selectedEdgeId: null, selectedId: null, selectedIds: [], pendingCatalogPlant: null,
            rightOpen: false, rightMode: "landscape", inspectedPlant: null, selectedPlantId:null,selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null });
        },
        inspectPlant: (inspectedPlant) => set({ inspectedPlant, selectedPlantId:null,selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null, rightOpen: true, rightMode: "landscape" }),
        selectPlant: (id) => {
          if (id && !get().project.drawing?.plants?.[id]) return;
          if (get().groupMemberId) get().finishGroupMember();
          set({ selectedPlantId:id, selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null, inspectedPlant:null, selectedId: null, selectedIds: [],
            selectedPolyId: null, selectedPolyIds: [], selectedEdgeId: null, cadEditId: null,
            tool: null, drawSub: "none", draft: emptyDraft(), pendingCatalogPlant: null,
            ...(id ? { rightOpen: true, rightMode: "landscape" as const } : {}) });
        },
        preparePlant: (record, kind, diameterM, visualMode=get().landscapeVisualMode) => {
          if (!Number.isFinite(diameterM) || diameterM < 0.05 || diameterM > 100) return;
          if(!isLandscapeVisualMode(visualMode))return;
          set({ pendingCatalogPlant: { record, kind, diameterM, visualMode }, selectedPlantId:null,selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null,
            tool: null, drawSub: "none", catalogOpen: false, cadEditId: null,
            selectedPolyId: null, selectedPolyIds: [], selectedEdgeId: null, selectedId: null, selectedIds: [], draft: emptyDraft() });
        },
        placeCatalogPlant: (point) => {
          const st = get(), pending = st.pendingCatalogPlant;
          if (!pending) return;
          const drawing = drawingOrMigrate(st.project);
          if (plantLayerLocked(drawing,pending.kind)) return;
          const pt = cadSnap(point, drawing, { pxPerMeter: st.pxPerMeter, snapOn: st.snapOn,
            snapGridOn: st.snapOn && st.snapGridOn, gridStep: st.gridStep, heads: visibleProjectHeads(st.project) }).pt;
          const id = uid("plant");
          const plant: CadPlant = { id, kind: pending.kind, x:pt.x,y:pt.y, r: pending.diameterM / 2, rotation: 0,
            visualMode:pending.visualMode??'image',
            catalogId: pending.record.id, catalog: pending.record,
            irrigation: { plantId: pending.record.id, category: pending.kind, diameterM: pending.diameterM, climateZone: null,
              season: null, exposure: null, soil: st.project.meta.soil || null, method: null, zoneId: null } };
          withCommit({ ...st.project, drawing: { ...drawing, plants: { ...drawing.plants, [id]: plant },
            ...(drawing.layers ? { layers: { ...drawing.layers, plants: { ...drawing.layers.plants, visible: true }, [plantLayerId(pending.kind)]: {...drawing.layers[plantLayerId(pending.kind)], visible:true} } } : {}) } }, "plant-add");
          get().selectPlant(id);
        },
        updatePlant: (id, patch) => {
          const project = get().project, drawing = drawingOrMigrate(project), plant = drawing.plants?.[id];
          if (!plant || ((plantLayerLocked(drawing,plant.kind) || (plant.locked && patch.locked !== false)) && !Object.keys(patch).every(k=>k==='hidden'))) return;
          if ([patch.x, patch.y, patch.r, patch.rotation].some(v => v !== undefined && !Number.isFinite(v))) return;
          if(patch.visualMode!==undefined&&!isLandscapeVisualMode(patch.visualMode))return;
          if (patch.r !== undefined && (patch.r < 0.025 || patch.r > 50)) return;
          const next = { ...plant, ...patch };
          if (patch.rotation !== undefined) next.rotation = normalizedPlantRotation(patch.rotation);
          if (Object.keys(patch).every(key=>next[key as keyof CadPlant]===plant[key as keyof CadPlant])) return;
          if (patch.r !== undefined) next.irrigation = { ...next.irrigation, diameterM: patch.r * 2 };
          withCommit({ ...project, drawing: { ...drawing, plants: { ...drawing.plants, [id]: next } } }, "plant-edit");
        },
        duplicatePlant: (id) => {
          const project = get().project, drawing = drawingOrMigrate(project), plant = drawing.plants?.[id];
          if (!plant || plantLayerLocked(drawing,plant.kind)) return;
          const copyId = uid("plant"), copy = { ...plant, id: copyId, x: plant.x + plant.r * 2 + 0.5, locked: false };
          withCommit({ ...project, drawing: { ...drawing, plants: { ...drawing.plants, [copyId]: copy } } }, "plant-copy");
          get().selectPlant(copyId);
        },
        removePlant: (id) => {
          const project = get().project, drawing = drawingOrMigrate(project), plant = drawing.plants?.[id];
          if (!plant || plant.locked || plantLayerLocked(drawing,plant.kind)) return;
          const plants = { ...drawing.plants }; delete plants[id];
          withCommit({ ...project, drawing: { ...drawing, plants } }, "plant-delete");
          set({ selectedPlantId:null,selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null });
        },
        projects: [],
        trash: [],
        tool: null,
        drawSub: "none",
        measureSub: "measure",
        placeId: "MP2000-90",
        selectedId: null,
        sectorEditId: null,
        selectedIds: [],
        selectedPolyId: null,
        selectedPolyIds: [],
        selectedEdgeId: null,
        activeZoneId: 1,
        zoneFocus: null,
        simulationProjectId: null,
        toggleSimulation: () => {
          if (get().workspaceSection !== "irrigation") return;
          get().endHeadEdit();
          set({ simulationProjectId: get().simulationProjectId === get().project.id ? null : get().project.id,
            zoneFocus: null, sectorEditId: null, catalogOpen: true });
        },
        focusZone: (zoneId, headId = null) => {
          const { project } = get();
          if (!project.zones.some(z => z.id === zoneId) || headId && !project.heads.some(h => h.id === headId && h.zone === zoneId)) return;
          get().endHeadEdit();
          set({ simulationProjectId: null, activeZoneId: zoneId, zoneFocus: { projectId: project.id, zoneId, headId },
            selectedId: null, selectedIds: [], selectedPolyId: null, selectedPolyIds: [], selectedEdgeId: null,
            sectorEditId: null, cadEditId: null, selectedPlantId:null,selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null, inspectedPlant: null, rightMode: "zone", rightOpen: true });
        },
        transferHeadToZone: (headId, zoneId) => {
          get().endHeadEdit();
          const { project } = get();
          const head = project.heads.find(h => h.id === headId);
          const destination = project.zones.find(z => z.id === zoneId);
          if (!head || !destination || destination.locked || head.zone === zoneId || isHeadLocked(head, project.zones)) return;
          withCommit({ ...project, heads: project.heads.map(h => h.id === headId ? { ...h, zone: zoneId, zoneAssignment:'manual' as const } : h) });
          get().focusZone(zoneId, headId);
        },
        hideLandscapeInIrrigation: false,
        showCoverage: true,
        showRadii: true,
        showLabels: true,
        showGrid: true,
        textHidden: false,
        snapOn: true,
        orthoOn: false,
        snapGridOn: true,
        gridStep: 0.5,
        dimensionOffset: 1,
        dimensionOffsetCustomized: false,
        catalogOpen: false,
        catalogVisible: true,
        rightOpen: false,
        rightMode: "drawing",
        projectFormOpen: false,
        familyFilter: "mp",
        equipmentFilters: {manufacturerId:'hunter'},
        catalogPlacementArmed: false,
        selectCatalogItem: id => {
          const item=itemById(id);if(!item||item.type==='body'||item.placementSupported===false)return;
          get().setTool('place');get().selectHead(null);get().setPlaceId(id);
          set({catalogPlacementArmed:true,rightMode:'irrigation',rightOpen:true});
        },
        setEquipmentFilters: patch => set(state=>{
          const equipmentFilters={...state.equipmentFilters,...patch};
          const changed=equipmentFilters.manufacturerId!==state.equipmentFilters.manufacturerId;
          return {equipmentFilters,catalogPlacementArmed:changed?false:state.catalogPlacementArmed,familyFilter:equipmentGroupSelection(equipmentFilters.manufacturerId,changed?undefined:state.familyFilter)};
        }),
        polyKind: "lawn",
        regionType: "lawn",
        measureUnit: "m",
        locale: "ru",
        themeId: "mint",
        buttonStyle: "theme",
        accent: "#0b6e62",
        themeAccent: "#0b6e62",
        themeAccent2: "#0b6e62",
        themeGradient: false,
        uiSize: "m",
        showHints: true,
        numberFormat: "auto",
        decimals: 1,
        units: { ...METRIC_UNITS },
        unitPreset: "metric",
        localeBootstrapped: false,
        localizationVersion: 1,
        workspaceSection: null,
        pxPerMeter: 36,
        panX: 48,
        panY: 36,
        draft: emptyDraft(),
        fitNonce: 0,
        analysis: "normal",
        saveState: "idle",
        past: [],
        future: [],
        pastOps: [],
        futureOps: [],
        lastOp: "",
        autoHeadsWiped: false,
        spaceDown: false,
        arrayCount: 3,
        inferenceLock: null,
        mergePrompt: null,
        pendingConstraint: null,
        pendingPlant: null,
        cadEditId: null,
        splinePreview: null,
        cadLiveRot: null,

        deactivateDrawing: () => {
          if (get().groupMemberId) get().finishGroupMember();
          set({workspaceSection:get().workspaceSection === "plan" ? null : get().workspaceSection,tool:null,drawSub:"none",draft:emptyDraft(),cadEditId:null,
            selectedPolyId:null,selectedPolyIds:[],selectedEdgeId:null,
            splinePreview:null,cadLiveRot:null,inferenceLock:null,pendingConstraint:null,
            mergePrompt:null,rightOpen:false});
        },
        setTool: (tool) => {
          set({catalogPlacementArmed:false});
          if (tool === "draw" || tool === "measure") set({ workspaceSection: "plan", referenceOpen: false, selectedId: null, selectedIds: [] });
          if (tool === "place") set({ workspaceSection: "irrigation", referenceOpen: false, selectedPolyId: null, selectedPolyIds: [], selectedEdgeId: null });
          set({ sectorEditId: null });
          set({ landscapeOpen: false, pendingCatalogPlant: null, inspectedPlant: null, selectedPlantId:null,selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null });
          if (get().groupMemberId) get().finishGroupMember();
          set({
            tool,
            draft: emptyDraft(),
            catalogOpen: tool === "place",
            catalogVisible: tool === "place" ? false : get().catalogVisible,
            drawSub: tool === "draw" || tool === "measure" || tool === "place" ? "none" : get().drawSub,
            cadEditId: tool === "draw" || tool === "measure" || tool === "place" ? null : get().cadEditId,
            rightMode: tool === "draw" ? "drawing" : tool === "place" ? "zone" : get().rightMode,
            rightOpen: tool === "draw" || tool === "place" ? false : get().rightOpen,
          });
        },
        setCadMode: (mode) => {
          set({ sectorEditId: null });
          set({ landscapeOpen: false, pendingCatalogPlant: null, inspectedPlant: null, selectedPlantId:null,selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null });
          if (get().groupMemberId) get().finishGroupMember();
          const mapped = fromCadMode(mode, get().tool);
          set({
            tool: mapped.tool,
            draft: emptyDraft(),
            cadEditId: mode === "select" || mapped.tool === "measure" ? null : get().cadEditId,
            ...(mapped.drawSub ? { drawSub: mapped.drawSub } : {}),
            ...(mapped.measureSub ? { measureSub: mapped.measureSub } : {}),
            catalogOpen: mapped.tool === "place" || get().catalogOpen,
            rightMode: mapped.tool === "scale" || mapped.tool === "draw" ? "drawing" : get().rightMode,
          });
        },
        setDrawSub: (drawSub) => {
          set({ sectorEditId: null });
          set({ landscapeOpen: false, pendingCatalogPlant: null, inspectedPlant: null, selectedPlantId:null,selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null });
          if (get().groupMemberId) get().finishGroupMember();
          if (get().drawSub === drawSub && get().tool === "draw") {
            set({
              drawSub: "none",
              draft: emptyDraft(),
              cadEditId: null,
              selectedPolyId: null,
              selectedPolyIds: [],
              selectedEdgeId: null,
              rightOpen: false,
            });
            return;
          }
          if (drawSub === "dim" && drawingOrMigrate(get().project).layers?.dims?.visible === false)
            get().setCadLayer("dims", { visible: true });
          set({
            drawSub,
            tool: "draw",
            workspaceSection: drawSub === "text" || drawSub === "dim" || drawSub === "none" ? get().workspaceSection ?? "plan" : "plan",
            draft: emptyDraft(),
            catalogOpen: get().catalogOpen && (drawSub === "text" || drawSub === "dim" || drawSub === "none"),
            cadEditId: null,
            selectedPolyId: null,
            selectedPolyIds: [],
            selectedEdgeId: null,
            selectedId: null,
            selectedIds: [],
            rightMode: "drawing",
            rightOpen: false,
          });
        },
        setMeasureSub: (measureSub) => {
          if (get().tool === "measure" && get().measureSub === measureSub) {
            set({tool:null,drawSub:"none",draft:emptyDraft(),cadEditId:null});
            return;
          }
          if (get().groupMemberId) get().finishGroupMember();
          set({ measureSub, tool: "measure", workspaceSection: get().workspaceSection ?? "plan", drawSub: "none", cadEditId: null, draft: emptyDraft(),
            landscapeOpen: false, pendingCatalogPlant: null, inspectedPlant: null, selectedPlantId:null,selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null });
        },
        setPlaceId: (placeId) => set({ placeId, catalogOpen: true, catalogVisible: true }),
        selectHead: (selectedId) =>
          set({
            catalogPlacementArmed: selectedId ? false : get().catalogPlacementArmed,
            zoneFocus: null,
            sectorEditId: selectedId === get().sectorEditId ? selectedId : null,
            selectedPlantId:null,selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null, inspectedPlant: null,
            selectedId,
            selectedIds: selectedId ? [selectedId] : [],
            selectedPolyId: null,
            selectedPolyIds: [],
            cadEditId: null,
            selectedEdgeId: null,
            rightMode: selectedId || get().selectedId || get().rightMode === "object"
              ? headPanelMode(get().workspaceSection, selectedId ? 1 : 0) : get().rightMode,
            rightOpen: selectedId ? true : get().rightOpen,
          }),
        selectHeads: (selectedIds) =>
          set({
            catalogPlacementArmed: selectedIds.length ? false : get().catalogPlacementArmed,
            zoneFocus: null,
            sectorEditId: selectedIds.length === 1 && selectedIds[0] === get().sectorEditId ? selectedIds[0] : null,
            selectedPlantId:null,selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null, inspectedPlant: null,
            selectedIds,
            selectedId: selectedIds[0] ?? null,
            selectedPolyId: null,
            selectedPolyIds: [],
            cadEditId: null,
            selectedEdgeId: null,
            rightMode: selectedIds.length || get().selectedIds.length || get().rightMode === "object"
              ? headPanelMode(get().workspaceSection, selectedIds.length) : get().rightMode,
            rightOpen: selectedIds.length ? true : get().rightOpen,
          }),
        selectPoly: (selectedPolyId, add) => {
          if(selectedPolyId&&!canvasWorkspace(get().workspaceSection).editPlan)return;
          set({ sectorEditId: null, zoneFocus: null });
          set({ selectedPlantId:null,selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null, inspectedPlant: null });
          if (get().groupMemberId && selectedPolyId !== get().groupMemberId) return;
          if (get().groupMemberId) add = false;
          if (!selectedPolyId) {
            set({ selectedPolyId: null, selectedPolyIds: [], selectedEdgeId: null, selectedId: null, selectedIds: [],
              ...(get().selectedId || get().rightMode === "object" ? { rightMode: headPanelMode(get().workspaceSection, 0) } : {}) });
            return;
          }
          const pending = get().pendingConstraint;
          if (pending && (pending.kind === "equalR" || pending.kind === "concentric") && pending.a !== selectedPolyId) {
            get().addCadConstraint(pending.kind, pending.a, selectedPolyId);
            return;
          }
          const cur = get().selectedPolyIds;
          const one = get().selectedPolyId;
          const base = cur.length ? cur : one ? [one] : [];
          const members = layerFaceIds(drawingOrMigrate(get().project), selectedPolyId);
          const targets = members.length ? members : [selectedPolyId];
          const selectedPolyIds = add
            ? targets.every(id => base.includes(id)) ? base.filter(id => !targets.includes(id)) : [...new Set([...base, ...targets])]
            : targets;
          selectedPolyId = selectedPolyIds.includes(selectedPolyId) ? targets[0]! : selectedPolyIds[selectedPolyIds.length - 1] ?? null;
          set({
            selectedPolyId,
            selectedPolyIds,
            selectedEdgeId: null,
            selectedId: null,
            selectedIds: [],
            rightMode: "drawing",
            cadEditId: add ? null : selectedPolyId === get().cadEditId ? get().cadEditId : null,
            tool: "draw",
            drawSub: "none",
            draft: emptyDraft(),
            rightOpen: true,
          });
        },
        selectEdge: (selectedEdgeId) => {
          if(selectedEdgeId&&!canvasWorkspace(get().workspaceSection).editPlan)return;
          set({selectedPlantId:null,selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null,inspectedPlant:null});
          if (get().groupMemberId) return;
          if (selectedEdgeId) {
            const d = segmentLayers(drawingOrMigrate(get().project));
            if (d.faces[selectedEdgeId]?.segment) {
              set({project:{...get().project,drawing:d,polygons:toPolygons(d)}});
              get().selectPoly(selectedEdgeId, get().tool === "move");
              return;
            }
          }
          const pending = get().pendingConstraint;
          if (pending && selectedEdgeId && pending.a !== selectedEdgeId) {
            get().addCadConstraint(pending.kind, pending.a, selectedEdgeId);
            return;
          }
          set({
            selectedEdgeId,
            selectedPolyId: null,
            selectedPolyIds: [],
            selectedId: null,
            selectedIds: [],
            cadEditId: null,
            rightOpen: selectedEdgeId ? false : get().rightOpen,
          });
        },
        setCoverage: (showCoverage) => set({ showCoverage }),
        setRadii: (showRadii) => set({ showRadii }),
        setLabels: (showLabels) => set({ showLabels }),
        setGrid: (showGrid) => set({ showGrid }),
        setSnap: (snapOn) => set({ snapOn }),
        setOrtho: (orthoOn) => set({ orthoOn }),
        setSnapGrid: (snapGridOn) => set({ snapGridOn }),
        setGridStep: (gridStep) => set({ gridStep }),
        setCatalogOpen: (catalogOpen) =>
          set({
            catalogPlacementArmed:false,
            landscapeOpen: false, pendingCatalogPlant: null, selectedPlantId:null,selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null, inspectedPlant: null,
            catalogOpen,
            ...(catalogOpen ? { workspaceSection: "irrigation" as const, referenceOpen: false, selectedPolyId: null, selectedPolyIds: [], selectedEdgeId: null } : {}),
            catalogVisible: catalogOpen ? false : get().catalogVisible,
            tool: catalogOpen ? "place" : get().tool === "place" ? null : get().tool,
            draft: catalogOpen ? emptyDraft() : get().draft,
            cadEditId: catalogOpen ? null : get().cadEditId,
            rightOpen: false,
            ...(catalogOpen ? { rightMode: "zone" as const } : {}),
          }),
        setCatalogVisible: (catalogVisible) => set({ catalogVisible }),
        setCadEdit: (cadEditId) => {
          if(cadEditId&&!canvasWorkspace(get().workspaceSection).editPlan)return;
          if (get().groupMemberId && !cadEditId) { get().finishGroupMember(); return; }
          if (get().groupMemberId && cadEditId !== get().groupMemberId) return;
          if (cadEditId) {
            const face = drawingOrMigrate(get().project).faces[cadEditId];
            if (!face) return;
            const members = layerFaceIds(drawingOrMigrate(get().project), cadEditId).map(id => drawingOrMigrate(get().project).faces[id]!);
            if (members.some(f => f.locked) || members.every(f => f.hidden)) return;
            // Parametric shape metadata is assigned when that shape is created.
            // Never infer it while selecting a segment-built contour: doing so can
            // replace its real vertices with calculated rectangle/ellipse handles.
            const pr = get().project;
            const d0 = drawingOrMigrate(pr);
            const sanitized = prepareFusionControls(clearInvalidRectMeta(d0, cadEditId),cadEditId);
            if (sanitized !== d0) {
              const drawing = restoreMember(sanitized, rawDrawingOrMigrate(pr), get().groupMemberId);
              set({ project: preserveConstruction(pr, { ...pr, drawing, polygons: toPolygons(drawing) }) });
            }
          }
          set({
            cadEditId,
            splinePreview: null,
            selectedPolyId: cadEditId ?? get().selectedPolyId,
            selectedPolyIds: cadEditId ? layerFaceIds(drawingOrMigrate(get().project), cadEditId) : get().selectedPolyIds,
            tool: cadEditId ? "draw" : get().tool,
            drawSub: cadEditId ? "none" : get().drawSub,
            draft: cadEditId ? emptyDraft() : get().draft,
            rightMode: cadEditId ? "drawing" : get().rightMode,
            rightOpen: cadEditId ? true : get().rightOpen,
            cadLiveRot: cadEditId ? get().cadLiveRot : null,
          });
        },
        finishSegmentEdit: () => {
          const st = get();
          const face = st.cadEditId ? drawingOrMigrate(st.project).faces[st.cadEditId] : null;
          // A group represented by a segment still uses whole-group editing.
          if (!face?.segment || face.layerId) return false;
          // Consume this action without starting another segment or changing
          // geometry/history. An active line tool stays active for the NEXT tap.
          st.setCadEdit(null);
          set({ draft: emptyDraft(), selectedEdgeId: null, pendingConstraint: null });
          return true;
        },
        setCadLiveRot: (cadLiveRot) => set({ cadLiveRot }),
        setRightOpen: (rightOpen) => set({ rightOpen }),
        setRightMode: (rightMode) => set({ rightMode, rightOpen: true }),
        setProjectFormOpen: (projectFormOpen) => set({ projectFormOpen }),
        referenceOpen: false,
        setReferenceOpen: (referenceOpen) => {
          if (referenceOpen && get().groupMemberId) get().finishGroupMember();
          set({ referenceOpen,
            ...(referenceOpen ? { catalogOpen: false, landscapeOpen: false, tool: null, cadEditId: null,
              pendingCatalogPlant: null, inspectedPlant: null, selectedPlantId:null,selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null, sectorEditId: null, rightOpen: false,
              selectedId: null, selectedIds: [], selectedPolyId: null, selectedPolyIds: [], selectedEdgeId: null, draft: emptyDraft() } : {}) });
        },
        setMeasureUnit: (measureUnit) =>
          set((s) => {
            const length = measureUnit === "yd" ? "ft" : measureUnit;
            const units = { ...s.units, length };
            return { measureUnit, units, unitPreset: detectPreset(units) };
          }),
        setLocale: (locale) => {
          const loc = parseLocale(locale);
          if (loc === get().locale) return;
          set({
            locale: loc,
            localeBootstrapped: true,
          });
        },
        setThemeId: (themeId) => set({ themeId: parseThemeId(themeId), buttonStyle: "theme", themeGradient: false }),
        setButtonStyle: (buttonStyle) => set({ buttonStyle: parseButtonStyle(buttonStyle) }),
        setAccent: (hex) => set({ buttonStyle: "custom", accent: parseAccent(hex) }),
        setThemeAccent: (hex) => set({ themeAccent: parseAccent(hex) }),
        setThemeAccent2: (hex) => set({ themeAccent2: parseAccent(hex) }),
        setThemeGradient: (themeGradient) => set({ themeGradient }),
        setUiSize: (uiSize) => set({ uiSize: parseUiSize(uiSize) }),
        setShowHints: (showHints) => set({ showHints }),
        setNumberFormat: (numberFormat) => set({ numberFormat: parseNumberFormat(numberFormat) }),
        setDecimals: (decimals) => set({ decimals: parseDecimals(decimals) }),
        setUnitPreset: (preset) => {
          if (preset === "custom") {
            set({ unitPreset: "custom" });
            return;
          }
          const units = unitsFromPreset(preset);
          set({
            unitPreset: preset,
            units,
            measureUnit: units.length,
          });
        },
        patchUnits: (patch) =>
          set((s) => {
            const units = { ...s.units, ...patch };
            const unitPreset = detectPreset(units);
            return {
              units,
              unitPreset,
              measureUnit: units.length,
            };
          }),
        setZoom: (pxPerMeter) => set({ pxPerMeter: clampPxPerMeter(pxPerMeter) }),
        setPan: (panX, panY) => set({ panX, panY }),
        setFamily: (familyFilter) => set({ catalogPlacementArmed:false, familyFilter:equipmentGroupSelection(get().equipmentFilters.manufacturerId,familyFilter), catalogVisible: get().catalogOpen ? true : get().catalogVisible }),
        setPolyKind: (polyKind) => set({ polyKind, regionType: polyKind, tool: "draw" }),
        setRegionTypeDraft: (regionType) =>
          set({ regionType, polyKind: REGION_TO_POLY[regionType] ?? "lawn", tool: "draw" }),
        setAnalysis: (analysis) => set({ analysis, showCoverage: analysis !== "normal" ? true : get().showCoverage }),
        setSpaceDown: (spaceDown) => set({ spaceDown }),
        newProject: () => {
          set({referenceOpen:false,landscapeOpen:false,inspectedPlant:null,selectedPlantId:null,selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null,pendingCatalogPlant:null});
          if (get().groupMemberId) get().finishGroupMember();
          const { project, projects } = get();
          if (projectHasContent(project) || isNamed(project) || projects.some((x) => x.id === project.id)) {
            get().saveCurrentToLibrary();
          }
          const p = emptyProject();
          set({
            project: p,
            newProjectReturnId: isNamed(project) || projectHasContent(project) || projects.some(p=>p.id===project.id) ? project.id : get().newProjectReturnId,
            selectedId: null,
            selectedIds: [],
            selectedPolyId: null,
            selectedEdgeId: null,
            activeZoneId: 1,
            draft: emptyDraft(),
            tool: null,
            catalogOpen: false,
            rightMode: "project",
            rightOpen: false,
            projectFormOpen: true,
            workspaceSection: null,
            past: [],
            future: [],
            fitNonce: get().fitNonce + 1,
          });
        },
        cancelProjectForm: () => {
          const {project,projects,newProjectReturnId}=get();
          if(isNamed(project)||projectHasContent(project)||get().past.length>0) {
            set({projectFormOpen:false});
            return;
          }
          const rest=projects.filter(p=>p.id!==project.id);
          const previous=rest.find(p=>p.id===newProjectReturnId)??rest[0];
          set({projects:rest,projectFormOpen:false,newProjectReturnId:null});
          if(previous) get().openLibrary(previous.id);
        },
        patchProject: (patch) => withCommit({ ...get().project, ...patch }),
        setUnderlay: (underlay) =>
          withCommit({
            ...get().project,
            underlay,
            scaleCalibrated: underlay ? false : true,
          }),
        patchUnderlay: (patch) => {
          const u = get().project.underlay;
          if (!u) return;
          const next = patchReference(u, patch);
          const resized = next.width !== u.width || next.height !== u.height;
          withCommit({ ...get().project, underlay: next,
            scaleCalibrated: resized ? false : get().project.scaleCalibrated });
        },
        addDraftPoint: (p) => {
          const state=get();
          if(state.tool==="draw" && state.drawSub==="cut" && cutFigures(drawingOrMigrate(state.project),state.draft.points))return;
          set({ draft: { ...state.draft, redoPoints: [], redoClosure: false, points: [...state.draft.points, p] } });
        },
        tapPolygonDraftPoint:(index)=>{
          const st=get(),point=st.draft.points[index];
          if(st.tool!=='draw'||st.drawSub!=='polygon'||!point)return;
          if(index===0&&st.draft.points.length>=3){st.closePolygon();return;}
          st.addDraftPoint({...point});
        },
        setDraftPoints: (points) => set({ draft: { ...get().draft, redoClosure:false, points } }),
        popDraftPoint: () => {
          const { draft, tool, drawSub } = get();
          const pts = draft.points;
          if (!pts.length) return;
          const pointHistory = tool === "draw" && (drawSub === "polygon" || drawSub === "spline" || drawSub === "cut");
          set({ draft: { ...draft, points: pts.slice(0, -1),
            redoPoints: pointHistory ? [pts[pts.length - 1]!, ...(draft.redoPoints ?? [])] : [] } });
        },
        commitDrawing: (d, selectedId, keepTool) => {
          if (get().groupMemberId && selectedId && selectedId !== get().groupMemberId) return;
          d = restoreMember(d, rawDrawingOrMigrate(get().project), get().groupMemberId);
          d = segmentLayers(d, selectedId ?? undefined);
          const pr = get().project;
          const previousFaces = Object.values(drawingOrMigrate(pr).faces);
          const previousFaceKeys = new Set(previousFaces.map(faceBoundaryKey));
          const addedIds = Object.values(d.faces)
            .filter((face) => !previousFaceKeys.has(faceBoundaryKey(face)))
            .map((face) => face.id);
          if (addedIds.length) {
            d = { ...d, faces: { ...d.faces } };
            addedIds.forEach((id) => {
              const face = d.faces[id];
              if (face && !face.fill) d.faces[id] = { ...face, fill: "theme" };
            });
          }
          const added = addedIds[0] ?? null;
          const pick = selectedId && d.faces[selectedId] ? selectedId : added;
          withCommit({ ...pr, drawing: d, polygons: toPolygons(d) }, get().drawSub || "draw");
          set({
            draft: emptyDraft(),
            tool: keepTool ? get().tool : "draw",
            drawSub: keepTool ? get().drawSub : "none",
            selectedPolyId: pick ?? get().selectedPolyId,
            selectedPolyIds: get().groupMemberId ? [get().groupMemberId!] : pick ? layerFaceIds(d, pick) : get().selectedPolyIds,
            selectedEdgeId: null,
            cadEditId: keepTool ? get().cadEditId : null,
            rightMode: "drawing",
          });
        },
        closePolygon: () => {
          const pts = get().draft.points;
          if (pts.length < 3) return;
          const boundaryPoints = pts;
          const d0 = drawingOrMigrate(get().project);
          const previousFaces = Object.values(d0.faces);
          const previousFaceKeys = new Set(previousFaces.map(faceBoundaryKey));
          const independent = get().drawSub === "polygon";
          let d = independent
            ? addPointShape(d0, boundaryPoints, get().regionType)
            : addChain(d0, boundaryPoints, true, get().regionType);
          const nextFaces = Object.values(d.faces);
          const faceId = nextFaces.length > previousFaces.length
            ? nextFaces.find((face) => !previousFaceKeys.has(faceBoundaryKey(face)))?.id ?? null
            : null;
          if (faceId && !independent) d = markPointShape(d, faceId);
          get().commitDrawing(d, faceId);
          if (faceId) {
            if (independent) closedConstructions.set(get().project, { points:pts.map(p=>({...p})), faceId });
            set({
              cadEditId: faceId,
              selectedPolyId: faceId,
              selectedPolyIds: [faceId],
              tool: "draw",
              drawSub: "none",
              rightMode: "drawing",
              rightOpen: true,
            });
          }
        },
        confirmCut: () => {
          const st=get();
          if(st.tool!=="draw" || st.drawSub!=="cut") return;
          const result=cutFigures(drawingOrMigrate(st.project),st.draft.points);
          if(!result) return;
          get().commitDrawing(result.drawing,result.faceIds.at(-1));
          set({selectedPolyId:null,selectedPolyIds:[],cadEditId:null});
        },
        finishOpenDraw: () => {
          const pts = get().draft.points;
          if (pts.length < 2) return;
          const sub = get().drawSub;
          const d0 = drawingOrMigrate(get().project);
          if (sub === "cut") return; // Scissors commit only through their confirmation button.
          if (sub === "freehand") {
            const px = Math.max(1, get().pxPerMeter);
            const result = addFreehandStroke(d0, pts, get().regionType, {
              closeTolerance: Math.max(0.12, 28 / px),
              attachTolerance: Math.max(0.12, 24 / px),
              smoothTolerance: Math.max(0.015, 1.8 / px),
            });
            get().commitDrawing(result.drawing, result.faceId, result.attached);
            set({ selectedPolyId: null, selectedPolyIds: [], cadEditId: null });
            if (result.attached) {
              set({
                tool: "draw",
                drawSub: "none",
                cadEditId: null,
                selectedPolyId: result.faceId,
                selectedPolyIds: result.faceId ? [result.faceId] : [],
              });
            }
            return;
          }
          if (sub === "spline") {
            const result = addSplineStroke(d0, pts, get().regionType, {
              attachTolerance: Math.max(0.12, 24 / Math.max(1, get().pxPerMeter)),
            });
            get().commitDrawing(result.drawing, result.faceId, result.attached);
            if (result.attached) {
              set({
                tool: "draw",
                drawSub: "none",
                cadEditId: null,
                selectedPolyId: result.faceId,
                selectedPolyIds: result.faceId ? [result.faceId] : [],
              });
            }
            return;
          }
          const d =
            sub === "path"
              ? pathFromCenterline(d0, pts, 1.2, "path")
              : addDrawingLines(d0, pts, get().regionType);
          get().commitDrawing(d);
        },
        commitGeom: (g) => {
          const d0 = drawingOrMigrate(get().project);
          const type = (g.cadType ?? get().regionType) as RegionType;
          const before = new Set(Object.keys(d0.faces));
          let d = d0;
          if (g.type === "circle" && g.points[0] && g.radius) d = addCircle(d0, g.points[0], g.radius, type);
          else if (g.type === "rect" && g.points.length >= 2) d = addRect(d0, g.points[0]!, g.points[2] ?? g.points[1]!, type);
          else if (g.type === "arc" && g.points.length >= 3) d = addArc3(d0, g.points[0]!, g.points[2]!, g.points[1]!, type);
          else d = addChain(d0, g.points, g.closed, type);
          const added = Object.keys(d.faces).find((id) => !before.has(id)) ?? null;
          get().commitDrawing(d, added);
        },
        applyCadLength: (meters, hover) => {
          if (!Number.isFinite(meters) || meters <= 0) return;
          const sub = get().drawSub;
          if (!get().draft.points.length && get().selectedEdgeId) {
            const edgeId = get().selectedEdgeId!;
            const d0 = drawingOrMigrate(get().project);
            const edge = d0.edges[edgeId];
            const a = edge ? d0.vertices[edge.a] : null;
            const b = edge ? d0.vertices[edge.b] : null;
            if (!edge || !a || !b) return;
            const currentLength = dist(a, b) || 1;
            const end = {
              x: a.x + ((b.x - a.x) / currentLength) * meters,
              y: a.y + ((b.y - a.y) / currentLength) * meters,
            };
            get().commitDrawing(moveVertex(d0, edge.b, end), undefined, true);
            set({ selectedEdgeId: edgeId, selectedPolyId: null, selectedPolyIds: [] });
            return;
          }
          if (sub === "array" || sub === "polar") {
            get().setArrayCount(meters);
            return;
          }
          if (sub === "offset") {
            get().offsetBy(meters);
            return;
          }
          if (sub === "fillet" && hover) {
            get().filletAt(hover, meters);
            return;
          }
          if (sub === "chamfer" && hover) {
            get().chamferAt(hover, meters);
            return;
          }
          const pts = get().draft.points;
          if (!pts.length && sub === "line") {
            set({draft:{...get().draft,lineLength:meters}});
            return;
          }
          if (!pts.length) return;
          if (sub === "polygon" || sub === "spline") {
            const last = pts[pts.length - 1]!;
            const previous = pts.length >= 2 ? pts[pts.length - 2]! : null;
            const guide =
              previous && dist(previous, last) > 1e-6
                ? { x: last.x + (last.x - previous.x), y: last.y + (last.y - previous.y) }
                : hover && dist(last, hover) > 1e-6
                  ? hover
                  : { x: last.x + 1, y: last.y };
            const guideLength = dist(last, guide) || 1;
            const end = {
              x: last.x + ((guide.x - last.x) / guideLength) * meters,
              y: last.y + ((guide.y - last.y) / guideLength) * meters,
            };
            set({ draft: { ...get().draft, redoPoints: [], redoClosure:false, points: [...pts, end] }, tool: "draw" });
            return;
          }
          const a = pts[pts.length - 1]!;
          const b = hover && dist(a, hover) > 1e-6 ? hover : pts.length >= 2 ? pts[pts.length - 2]! : { x: a.x + 1, y: a.y };
          const d0 = dist(a, b) || 1;
          const end = { x: a.x + ((b.x - a.x) / d0) * meters, y: a.y + ((b.y - a.y) / d0) * meters };
          if (sub === "path") {
            if (pts.length >= 2) get().commitDrawing(pathFromCenterline(drawingOrMigrate(get().project), pts, meters, "path"));
            return;
          }
          if (sub === "circle") {
            get().commitDrawing(addCircle(drawingOrMigrate(get().project), a, meters, get().regionType));
            return;
          }
          if (sub === "line") {
            const pr = get().project;
            const d = addDrawingLines(drawingOrMigrate(pr), [a, end], get().regionType);
            withCommit({ ...pr, drawing: d, polygons: toPolygons(d) }, "line");
            set({ draft: { ...emptyDraft(), points: [end] }, tool: "draw" });
            return;
          }
          if (sub === "polyline") {
            const d = addDrawingLines(drawingOrMigrate(get().project), [a, end], get().regionType);
            withCommit({ ...get().project, drawing: d, polygons: toPolygons(d) });
            set({ draft: { ...get().draft, redoPoints: [], redoClosure:false, points: [...pts, end] }, tool: "draw" });
            return;
          }
          set({ draft: { ...get().draft, redoPoints: [], redoClosure:false, points: [...pts, end] } });
        },
        applyCadSize: (w, h, hover) => {
          const pts = get().draft.points;
          if (!pts.length || w <= 0 || h <= 0) return;
          const a = pts[0]!;
          const sx = hover && hover.x < a.x ? -1 : 1;
          const sy = hover && hover.y < a.y ? -1 : 1;
          const b = { x: a.x + sx * w, y: a.y + sy * h };
          const d0 = drawingOrMigrate(get().project);
          if (get().drawSub === "triangle") {
            get().commitDrawing(addTriangle(d0, triangleFromBounds(a, b), get().regionType));
          } else if (get().drawSub === "hexagon") {
            get().commitDrawing(addHexagon(d0, hexagonFromBounds(a, b), get().regionType));
          } else if (get().drawSub === "ellipse") {
            get().commitDrawing(addEllipse(d0, a, w / 2, h / 2, get().regionType));
          } else {
            get().commitDrawing(addRect(d0, a, b, get().regionType));
          }
        },
        applyCadArea: (m2, hover) => {
          if (m2 <= 0) return;
          const side = get().drawSub === "triangle" ? Math.sqrt(m2 * 2) : get().drawSub === "hexagon" ? Math.sqrt(m2 / 0.75) : get().drawSub === "ellipse" ? 2 * Math.sqrt(m2 / Math.PI) : Math.sqrt(m2);
          get().applyCadSize(side, side, hover);
        },
        setRectCorner: (opposite, p) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(setRectFromDiag(drawingOrMigrate(get().project), id, opposite, p), id, true);
        },
        setRectEdge: (edge, p) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(setRectFromEdge(drawingOrMigrate(get().project), id, edge, p), id, true);
        },
        setRectWH: (w, h) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id || w <= 0 || h <= 0) return;
          const d0 = drawingOrMigrate(get().project);
          const f = d0.faces[id];
          const isTriangle = Boolean(f && !f.circle && !f.ellipse && !f.rect && faceVertices(d0, id).length === 3);
          get().commitDrawing(isTriangle ? setTriangleSize(d0, id, w, h) : setRectSize(d0, id, w, h), id, true);
        },
        setTriangleSides: (base, left, right) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(setTriangleSides(drawingOrMigrate(get().project), id, base, left, right), id, true);
        },
        setRectRotation: (deg) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id || !Number.isFinite(deg)) return;
          const d0 = drawingOrMigrate(get().project);
          const f = d0.faces[id];
          if (f?.locked) return;
          const cur = f?.rect ? normDeg(f.rect.rot) : f?.ellipse ? normDeg(f.ellipse.rot ?? 0) : null;
          if (cur == null) return;
          const target = normDeg(deg);
          let delta = target - cur;
          if (delta > 180) delta -= 360;
          if (delta < -180) delta += 360;
          if (Math.abs(delta) < 1e-6) return;
          get().commitDrawing(rotateFace(d0, id, delta), id, true);
          set({ cadLiveRot: null });
        },
        applyCadRadius: (r, hover) => {
          const pts = get().draft.points;
          const c = pts[0] ?? hover;
          if (!c || r <= 0) return;
          get().commitDrawing(addCircle(drawingOrMigrate(get().project), c, r, get().regionType));
        },
        removeBoundary: (edgeId) => {
          const res = deleteBoundary(drawingOrMigrate(get().project), edgeId);
          if (res.warning) return { warning: res.warning };
          if (res.types) {
            set({ mergePrompt: { edgeId, types: res.types } });
            return {};
          }
          get().commitDrawing(res.drawing);
          set({ selectedEdgeId: null });
          return {};
        },
        setRegionType: (faceId, type) => {
          const d = setFaceType(drawingOrMigrate(get().project), faceId, type);
          get().commitDrawing(d, faceId, true);
        },
        convertToPath: (faceId) => {
          const d = drawingOrMigrate(get().project);
          const f = d.faces[faceId];
          if (!f) return;
          f.rect = undefined;
          f.circle = undefined;
          get().commitDrawing(d, faceId, true);
        },
        fillRegionAt: (p) => {
          const d = smartFill(drawingOrMigrate(get().project), p, get().regionType);
          get().commitDrawing(d, get().selectedPolyId, true);
        },
        bulgeEdge: (edgeId, p) => {
          const d0 = drawingOrMigrate(get().project);
          const ed = d0.edges[edgeId];
          if (!ed) return;
          const A = d0.vertices[ed.a];
          const B = d0.vertices[ed.b];
          if (!A || !B) return;
          const bulge = bulgeFromPoints(A, B, p);
          get().commitDrawing(setEdgeBulge(d0, edgeId, bulge), get().selectedPolyId, true);
        },
        offsetBy: (meters) => {
          const id = get().selectedPolyId;
          if (!id || Math.abs(meters) < 1e-9) return;
          const d0 = drawingOrMigrate(get().project);
          const pts = facePoints(d0, id);
          if (pts.length < 3) return;
          const closed = [...pts, pts[0]!];
          get().commitDrawing(offsetChain(d0, closed, meters, get().regionType), id, true);
        },
        filletAt: (p, radius) => {
          const d0 = drawingOrMigrate(get().project);
          const vid = pickVertexAt(d0, p, Math.max(0.2, 24 / get().pxPerMeter));
          if (!vid) return;
          get().commitDrawing(filletVertex(d0, vid, radius), get().selectedPolyId, true);
        },
        chamferAt: (p, distM) => {
          const d0 = drawingOrMigrate(get().project);
          const vid = pickVertexAt(d0, p, Math.max(0.2, 24 / get().pxPerMeter));
          if (!vid) return;
          get().commitDrawing(chamferVertex(d0, vid, distM), get().selectedPolyId, true);
        },
        addDimension: (a, b, offset) => {
          if (![a.x, a.y, b.x, b.y].every(Number.isFinite) || dist(a, b) < 1e-9) return;
          const d = drawingOrMigrate(get().project);
          const distance=get().dimensionOffsetCustomized ? get().dimensionOffset : get().gridStep*2;
          const heads=get().workspaceSection==='irrigation'?get().project.heads:[];
          const anchors={aHeadId:heads.find(h=>dist(h,a)<1e-6)?.id,bHeadId:heads.find(h=>dist(h,b)<1e-6)?.id};
          get().commitDrawing(addDim(d, a, b, offset ?? outsideDimensionOffset(d,a,b,distance),anchors), get().selectedPolyId, true);
        },
        mirrorSelected: (axis) => {
          const id = get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(mirrorFace(drawingOrMigrate(get().project), id, axis), id, true);
        },
        hideSelected: (hidden) => {
          const id = get().selectedPolyId;
          if (!id) return;
          const d = drawingOrMigrate(get().project);
          const editing = get().cadEditId;
          const endsEditing = hidden && (editing === null || layerFaceIds(d, id).includes(editing));
          get().commitDrawing(setFaceHidden(d, id, hidden), id, true);
          if (endsEditing) get().setCadEdit(null);
        },
        lockSelected: (locked) => {
          const id = get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(setFaceLocked(drawingOrMigrate(get().project), id, locked), id, true);
        },
        scaleSelected: (factor) => {
          const id = get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(scaleFace(drawingOrMigrate(get().project), id, factor), id, true);
        },
        scaleSelectedAxis: (sx, sy) => {
          const id = get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(scaleFaceAxis(drawingOrMigrate(get().project), id, sx, sy), id, true);
        },
        filletSelected: (radius) => {
          const id = get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(filletFace(drawingOrMigrate(get().project), id, radius), id, true);
        },
        chamferSelected: (distM) => {
          const id = get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(chamferFace(drawingOrMigrate(get().project), id, distM), id, true);
        },
        mirrorCopySelected: (axis) => {
          const id = get().selectedPolyId;
          if (!id) return;
          const { drawing, id: nid } = mirrorCopyFace(drawingOrMigrate(get().project), id, axis);
          get().commitDrawing(drawing, nid, true);
        },
        joinSelected: () => {
          const id = get().selectedPolyId;
          get().commitDrawing(joinCollinear(drawingOrMigrate(get().project), id ?? undefined), id, true);
        },
        offsetBoth: (meters) => {
          const id = get().selectedPolyId;
          if (!id || Math.abs(meters) < 1e-9) return;
          const d0 = drawingOrMigrate(get().project);
          const pts = facePoints(d0, id);
          if (pts.length < 3) return;
          const closed = [...pts, pts[0]!];
          let d = offsetChain(d0, closed, meters, get().regionType);
          d = offsetChain(d, closed, -meters, get().regionType);
          get().commitDrawing(d, id, true);
        },
        centerSelected: () => {
          const id = get().selectedPolyId;
          if (!id) return;
          const d0 = drawingOrMigrate(get().project);
          const c = faceCentroid(d0, id);
          get().commitDrawing(moveFace(d0, id, -c.x, -c.y), id, true);
        },
        setDimOffset: (id, offset) => {
          if (Number.isFinite(offset)) set({dimensionOffset:Math.abs(offset),dimensionOffsetCustomized:true});
          get().commitDrawing(setCadDimOffset(drawingOrMigrate(get().project), id, offset), get().selectedPolyId, true);
        },
        moveNote: (id, p) => {
          get().commitDrawing(moveCadText(drawingOrMigrate(get().project), id, p), get().selectedPolyId, true);
        },
        divideSelectedEdge: (n) => {
          const id = get().selectedEdgeId;
          if (!id) return;
          get().commitDrawing(divideEdge(drawingOrMigrate(get().project), id, n), get().selectedPolyId, true);
        },
        lengthenSelectedEdge: (extra) => {
          const id = get().selectedEdgeId;
          if (!id) return;
          get().commitDrawing(lengthenEdge(drawingOrMigrate(get().project), id, extra), get().selectedPolyId, true);
        },
        unionWith: (faceId) => {
          const id = get().selectedPolyId;
          if (!id || id === faceId) return;
          get().commitDrawing(unionFaces(drawingOrMigrate(get().project), id, faceId), id, true);
        },
        snapSelectedToGrid: () => {
          const id = get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(snapFaceToGrid(drawingOrMigrate(get().project), id, get().gridStep), id, true);
        },
        alignSelectedEdge: (deg = 0) => {
          const eid = get().selectedEdgeId;
          if (!eid) return;
          get().commitDrawing(alignEdge(drawingOrMigrate(get().project), eid, deg, get().selectedPolyId), get().selectedPolyId, true);
        },
        alignFaces: (mode) => {
          const ids = get().selectedPolyIds;
          if (ids.length < 2) return;
          const d0 = drawingOrMigrate(get().project);
          const refPts = facePoints(d0, ids[0]!);
          const ref = boundsOf(refPts, 0);
          if (!ref) return;
          let d = d0;
          for (const id of ids.slice(1)) {
            const box = boundsOf(facePoints(d, id), 0);
            if (!box) continue;
            let dx = 0;
            let dy = 0;
            if (mode === "left") dx = ref.minX - box.minX;
            if (mode === "right") dx = ref.maxX - box.maxX;
            if (mode === "top") dy = ref.minY - box.minY;
            if (mode === "bottom") dy = ref.maxY - box.maxY;
            if (mode === "hcenter") dx = (ref.minX + ref.maxX) / 2 - (box.minX + box.maxX) / 2;
            if (mode === "vcenter") dy = (ref.minY + ref.maxY) / 2 - (box.minY + box.maxY) / 2;
            if (dx || dy) d = moveFace(d, id, dx, dy);
          }
          get().commitDrawing(d, ids[0], true);
        },
        punchSelected: (innerId) => {
          const id = get().selectedPolyId;
          if (!id || id === innerId) return;
          get().setRegionType(innerId, "no_irrigation");
        },
        setInferenceLock: (inferenceLock) => set({ inferenceLock }),
        confirmMerge: (type: RegionType) => {
          const prompt = get().mergePrompt;
          if (!prompt) return;
          const res = deleteBoundary(drawingOrMigrate(get().project), prompt.edgeId, type);
          if (res.warning) {
            set({ mergePrompt: null });
            return;
          }
          get().commitDrawing(res.drawing);
          set({ mergePrompt: null, selectedEdgeId: null });
        },
        addCadConstraint: (kind, a, b) => {
          get().commitDrawing(addConstraint(drawingOrMigrate(get().project), kind, a, b), get().selectedPolyId, true);
          set({ pendingConstraint: null });
        },
        beginConstraint: (kind, a) => set({ pendingConstraint: { kind, a } }),
        intersectSelected: () => {
          const ids = get().selectedPolyIds;
          if (ids.length < 2) return;
          get().commitDrawing(intersectFaces(drawingOrMigrate(get().project), ids[0]!, ids[1]!), ids[0], true);
        },
        setCircleR: (r) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(setCircleRadius(drawingOrMigrate(get().project), id, r), id, true);
        },
        setEllipseR: (rx, ry) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(setEllipseRadii(drawingOrMigrate(get().project), id, rx, ry), id, true);
        },
        scaleSelectedFace: (k) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id || !(k > 0) || !Number.isFinite(k)) return;
          const d0 = drawingOrMigrate(get().project);
          const f = d0.faces[id];
          const next = layerFaceIds(d0, id).length > 1 ? transformLayer(d0, id, { scale: k }) : f?.ellipse ? scaleEllipse(d0, id, k) : scaleFaceAbout(d0, id, k);
          get().commitDrawing(next, id, true);
        },
        setFaceVertex: (vertexId, p) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(moveVertex(drawingOrMigrate(get().project), vertexId, p), id, true);
        },
        setFaceArea: (m2) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id || m2 <= 0) return;
          const d0 = drawingOrMigrate(get().project);
          const cur = layerArea(d0, id);
          if (cur <= 1e-9) return;
          get().commitDrawing(scaleFaceAbout(d0, id, Math.sqrt(m2 / cur)), id, true);
        },
        setSplinePt: (index, p) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id) return;
          const d0 = drawingOrMigrate(get().project);
          const f = d0.faces[id];
          if (!f?.spline) return;
          const pts = f.spline.pts.map((q, i) => (i === index ? p : q));
          set({ splinePreview: null });
          get().commitDrawing(updateSpline(d0, id, pts), id, true);
        },
        addAngleGuides: (p) => {
          const st = get();
          const reach = 80;
          const rad = (45 * Math.PI) / 180;
          const a = { x: p.x + Math.cos(rad) * reach, y: p.y + Math.sin(rad) * reach };
          const b = { x: p.x - Math.cos(rad) * reach, y: p.y - Math.sin(rad) * reach };
          const c = { x: p.x + Math.cos(rad + Math.PI / 2) * reach, y: p.y + Math.sin(rad + Math.PI / 2) * reach };
          const e = { x: p.x - Math.cos(rad + Math.PI / 2) * reach, y: p.y - Math.sin(rad + Math.PI / 2) * reach };
          st.commitGeom({ id: uid("guide"), type: "guide", kind: "path", points: [a, b], closed: false, locked: false, hidden: false });
          st.commitGeom({ id: uid("guide"), type: "guide", kind: "path", points: [c, e], closed: false, locked: false, hidden: false });
        },
        addPlantAt: (p, kind) => {
          const st=get(),before=drawingOrMigrate(st.project),drawing=addPlant(before,kind,p);
          for(const [id,plant] of Object.entries(drawing.plants??{}))if(!before.plants?.[id])plant.visualMode=st.landscapeVisualMode;
          st.commitDrawing(drawing,st.selectedPolyId,true);
        },
        setHydro: (need, method) => {
          const id = get().selectedPolyId;
          if (!id) return;
          const drawing = drawingOrMigrate(get().project);
          const hydro = drawing.faces[id]?.hydro;
          const purpose = method === "none" ? "none" : hydro?.purpose === "none" ? "irrigation" : hydro?.purpose;
          get().commitDrawing(setFaceHydro(drawing, id, { ...hydro, need, method, purpose }), id, true);
        },
        setLayerPurpose: (faceId, purpose) => {
          const drawing = drawingOrMigrate(get().project);
          const face = drawing.faces[faceId];
          if (!face || face.locked || face.hydro?.purpose === purpose) return;
          const method = face.hydro?.method ?? "mp";
          get().commitDrawing(setFaceHydro(drawing, faceId, {
            need: face.hydro?.need ?? "medium",
            method: purpose !== "none" && method === "none" ? "mp" : method,
            purpose,
          }), faceId, true);
        },
        setFaceName: (name) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(setCadFaceName(drawingOrMigrate(get().project), id, name), id, true);
        },
        setFaceFill: (color) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id) return;
          const drawing = drawingOrMigrate(get().project);
          const face = drawing.faces[id];
          if (!face || face.locked) return;
          let updated = setCadFaceFill(drawing, id, color);
          if (color.startsWith("texture:")) {
            updated = setFaceHydro(updated, id, {
              need: face.hydro?.need ?? "medium",
              method: face.hydro?.method ?? "mp",
              purpose: "none",
            });
          }
          get().commitDrawing(updated, id, true);
        },
        setCadLayer: (id, patch) => {
          if (['plants','trees','shrubs','flowers','grasses','furniture','lighting','decor','equipment'].includes(id)) {
            const project=get().project;
            withCommit({...project,drawing:setLayerFlag(drawingOrMigrate(project),id,patch)},'plant-layer');
            return;
          }
          get().commitDrawing(setLayerFlag(drawingOrMigrate(get().project), id, patch), get().selectedPolyId, true);
        },
        setPendingPlant: (pendingPlant) => set({ pendingPlant, tool: null }),
        importDxf: (text: string) => {
          const parsed = parseDxf(text);
          let d = drawingOrMigrate(get().project);
          for (const pl of parsed.polylines) d = addChain(d, pl.pts, pl.closed, pl.type);
          for (const ln of parsed.lines) d = addChain(d, [ln.a, ln.b], false, get().regionType);
          for (const c of parsed.circles) d = addCircle(d, { x: c.cx, y: c.cy }, c.r, c.type);
          for (const tx of parsed.texts) d = addText(d, { x: tx.x, y: tx.y }, tx.text, tx.size);
          get().commitDrawing(d);
        },
        addNote: (p, text) => {
          if (!text.trim()) return;
          get().commitDrawing(addText(drawingOrMigrate(get().project), p, text.trim()), get().selectedPolyId, true);
        },
        trimAt: (p) => {
          const d0 = drawingOrMigrate(get().project);
          const edge = pickEdgeAt(d0, p, Math.max(0.15, 16 / get().pxPerMeter));
          if (!edge) return;
          get().commitDrawing(trimEdge(d0, edge, p), get().selectedPolyId, true);
        },
        extendAt: (p) => {
          const d0 = drawingOrMigrate(get().project);
          const edge = pickEdgeAt(d0, p, Math.max(0.15, 16 / get().pxPerMeter));
          if (!edge) return;
          get().commitDrawing(extendEdge(d0, edge, p), get().selectedPolyId, true);
        },
        copySelectedBy: (dx, dy) => {
          const id = get().selectedPolyId;
          if (!id) return;
          const { drawing, id: nid } = duplicateFace(drawingOrMigrate(get().project), id, dx, dy);
          get().commitDrawing(drawing, nid, true);
        },
        arraySelected: (dx, dy, count) => {
          const id = get().selectedPolyId;
          const n = count || get().arrayCount;
          if (!id || n < 1) return;
          let d = drawingOrMigrate(get().project);
          let last = id;
          for (let i = 1; i <= n; i++) {
            const r = duplicateFace(d, id, dx * i, dy * i);
            d = r.drawing;
            last = r.id;
          }
          get().commitDrawing(d, last, true);
        },
        polarSelected: (center, count) => {
          const id = get().selectedPolyId;
          if (!id) return;
          const n = count ?? get().arrayCount;
          const { drawing, id: nid } = polarArray(drawingOrMigrate(get().project), id, center, n);
          get().commitDrawing(drawing, nid, true);
        },
        setArrayCount: (n) => set({ arrayCount: Math.max(2, Math.min(36, Math.round(n))) }),
        fitSelected: (viewW, viewH) => {
          const id = get().selectedPolyId;
          const d = drawingOrMigrate(get().project);
          const pts = id ? facePoints(d, id) : [];
          const box = boundsOf(pts.length ? pts : Object.values(d.vertices), 0.8);
          if (!box) {
            get().fitToView(viewW, viewH);
            return;
          }
          const worldW = Math.max(1, box.maxX - box.minX);
          const worldH = Math.max(1, box.maxY - box.minY);
          const px = Math.min(120, Math.max(10, Math.min((viewW - 48) / worldW, (viewH - 48) / worldH)));
          set({
            pxPerMeter: px,
            panX: (viewW - worldW * px) / 2 - box.minX * px,
            panY: (viewH - worldH * px) / 2 - box.minY * px,
          });
        },
        moveSelectedFace: (dx, dy) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id || (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12)) return;
          const d0 = drawingOrMigrate(get().project);
          if (d0.faces[id]?.locked) return;
          get().commitDrawing(moveFace(d0, id, dx, dy), id, true);
        },
        rotateSelectedFace: (deg) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id || !Number.isFinite(deg) || Math.abs(deg) < 1e-9) return;
          const d0 = drawingOrMigrate(get().project);
          if (d0.faces[id]?.locked) return;
          if (layerFaceIds(d0, id).length > 1) { get().commitDrawing(transformLayer(d0, id, { angle: deg }), id, true); return; }
          let next = rotateFace(d0, id, deg);
          const face = next.faces[id];
          if (face?.rect) {
            const rot = normDeg(face.rect.rot);
            const q = Math.round(rot / 45) * 45;
            let ad = Math.abs(rot - q);
            if (ad > 180) ad = 360 - ad;
            if (ad <= 10) {
              const extra = q - rot;
              if (Math.abs(extra) > 1e-6) next = rotateFace(next, id, extra);
            }
          } else if (face?.ellipse) {
            const rot = normDeg(face.ellipse.rot ?? 0);
            const q = Math.round(rot / 45) * 45;
            let ad = Math.abs(rot - q);
            if (ad > 180) ad = 360 - ad;
            if (ad <= 10) {
              const extra = q - rot;
              if (Math.abs(extra) > 1e-6) next = rotateFace(next, id, extra);
            }
          }
          get().commitDrawing(next, id, true);
          set({ cadLiveRot: null });
        },
        flattenEdge: (edgeId) => {
          get().commitDrawing(flattenCadEdge(drawingOrMigrate(get().project), edgeId), get().selectedPolyId, true);
        },
        insertVertex: (edgeId, p) => {
          get().commitDrawing(insertVertexOnEdge(drawingOrMigrate(get().project), edgeId, p), get().selectedPolyId, true);
        },
        cancelDraft: () => set({ draft: emptyDraft() }),
        deleteSelected: () => {
          if (get().selectedLandscapeId) { get().removeLandscape(get().selectedLandscapeId!); return; }
          if (get().selectedPlantId) { get().removePlant(get().selectedPlantId!); return; }
          if (get().groupMemberId) { get().deleteGroupMember(get().groupMemberId!); return; }
          const { selectedIds, selectedPolyId, selectedEdgeId, selectedPolyIds, project } = get();
          if (selectedIds.length) {
            const heads = project.heads.filter(h => !selectedIds.includes(h.id) || h.locked || project.zones.some(z => z.id === h.zone && z.locked));
            if (heads.length === project.heads.length) return;
            withCommit({ ...project, heads });
            set({ selectedId: null, selectedIds: [], rightMode: headPanelMode(get().workspaceSection, 0) });
            return;
          }
          if (selectedEdgeId) {
            const res = get().removeBoundary(selectedEdgeId);
            if (res.warning) {
              if (selectedPolyId) {
                const d0 = drawingOrMigrate(project);
                const d = deleteFace(d0, selectedPolyId);
                withCommit({
                  ...project,
                  drawing: d,
                  polygons: toPolygons(d),
                });
                set({ selectedPolyId: null, selectedEdgeId: null, selectedPolyIds: [], cadEditId: null });
              }
            }
            return;
          }
          if (selectedPolyId) {
            let d = drawingOrMigrate(project);
            const ids = selectedPolyIds.length ? selectedPolyIds : [selectedPolyId];
            const inCad = ids.filter((id) => d.faces[id]);
            if (inCad.length) {
              for (const id of inCad) d = deleteFace(d, id);
            }
            const leftover = ids.filter((id) => !inCad.includes(id));
            // Plan layers and installed irrigation have independent lifecycles.
            // A shared boundary or overlapping contour must never delete equipment.
            withCommit({
              ...project,
              drawing: d,
              polygons: leftover.length ? toPolygons(d).filter((g) => !leftover.includes(g.id)) : toPolygons(d),
            });
            set({ selectedPolyId: null, selectedPolyIds: [], selectedEdgeId: null, cadEditId: null });
          }
        },
        removeHead: (id) => {
          const { project, selectedIds, selectedId } = get();
          const head = project.heads.find(h => h.id === id);
          if (!head || head.locked || project.zones.some(z => z.id === head.zone && z.locked)) return;
          withCommit({ ...project, heads: project.heads.filter((h) => h.id !== id) });
          const next = selectedIds.filter((x) => x !== id);
          set({
            selectedIds: next,
            selectedId: selectedId === id ? (next[0] ?? null) : selectedId,
            ...(selectedIds.includes(id) ? { rightMode: headPanelMode(get().workspaceSection, next.length) } : {}),
          });
        },
        duplicateSelected: () => {
          if (get().selectedLandscapeId) { get().duplicateLandscape(get().selectedLandscapeId!); return; }
          if (get().selectedPlantId) { get().duplicatePlant(get().selectedPlantId!); return; }
          const { selectedIds, selectedPolyId, cadEditId, project } = get();
          const faceId = cadEditId ?? selectedPolyId;
          if (faceId) {
            const src = drawingOrMigrate(project).faces[faceId];
            const gap = Math.max(0.5, get().gridStep * 2);
            const dx = src?.rect ? src.rect.w + gap : src?.circle ? src.circle.r * 2 + gap : gap;
            const { drawing, id } = duplicateFace(drawingOrMigrate(project), faceId, dx, 0);
            get().commitDrawing(drawing, id, true);
            get().setCadEdit(null);
            get().selectPoly(id);
            return;
          }
          if (!selectedIds.length) return;
          const copies: Head[] = [];
          for (const id of selectedIds) {
            const h = project.heads.find((x) => x.id === id);
            if (!h) continue;
            copies.push({ ...h, id: uid("h"), x: h.x + 0.6, y: h.y + 0.6 });
          }
          withCommit({ ...project, heads: [...project.heads, ...copies] });
          set({ selectedIds: copies.map((c) => c.id), selectedId: copies[0]?.id ?? null });
        },
        placeAutomaticHead: (sector,pressureBar) => {
          if(![sector.center.x,sector.center.y,sector.start].every(Number.isFinite))return false;
          const catalog=automaticHeadCatalog(get().equipmentFilters.manufacturerId,get().familyFilter);
          const fit=selectAutomaticHead(sector.radius,sector.arc,pressureBar,catalog,automaticZonePeers(get().project.heads,get().activeZoneId,catalog));
          if(!fit)return false;
          const pr=get().project;
          const head:Head={...fit,id:uid('h'),x:sector.center.x,y:sector.center.y,start:sector.start,
            figureId:figureAtPoint(sector.center,irrigationFigures(drawingOrMigrate(pr)))?.id,
            zone:get().activeZoneId,locked:false};
          const picked=assignZoneForNewHead(pr,head,get().activeZoneId,projectZoneLimit(pr));
          head.zone=picked.zoneId;
          withCommit({...pr,heads:[...pr.heads,head],zones:picked.zones});
          set({tool:'place',placeId:head.catalogId,selectedId:head.id,selectedIds:[head.id],rightMode:'object',rightOpen:true,activeZoneId:picked.zoneId});
          return true;
        },
        placeHead: (p, catalogId) => {
          const id = catalogId ?? get().placeId;
          const item = id ? equipmentGroupItem(id,get().equipmentFilters.manufacturerId??'hunter',get().familyFilter)??itemById(id) : CATALOG[0];
          if(item?.placementSupported===false)return;
          if (!item || item.family === "body") return;
          const pr = get().project;
          const polys = pr.polygons.filter((g) => g.closed);
          const snapped = snapSprinklerPoint(p, drawingOrMigrate(pr), {
            snapOn: get().snapOn,
            snapGridOn: get().snapGridOn,
            gridStep: get().gridStep,
            pxPerMeter: get().pxPerMeter,
            heads: visibleProjectHeads(pr),
          }).pt;
          let start = 0;
          let arc = item.arcMin === 360 ? 360 : clampArc(item, 180);
          for (const poly of polys) {
            if (poly.kind !== "lawn") continue;
            const pts = poly.points;
            let done = false;
            for (let i = 0; i < pts.length; i++) {
              if (dist(pts[i]!, snapped) > 0.08) continue;
              const prev = pts[(i - 1 + pts.length) % pts.length]!;
              const next = pts[(i + 1) % pts.length]!;
              const ca = cornerArc(prev, pts[i]!, next);
              start = ca.start;
              arc = clampArc(item, ca.arc);
              done = true;
              break;
            }
            if (done) break;
            for (let i = 0; i < pts.length; i++) {
              const a = pts[i]!;
              const b = pts[(i + 1) % pts.length]!;
              const q = closestOnSegment(snapped, a, b);
              if (dist(snapped, q) > 0.08) continue;
              start = inwardStart(a, b, pts);
              arc = clampArc(item, 180);
              break;
            }
          }
          // MPR rotor cards select the matching sector nozzle, never an ordinary
          // standard nozzle hidden in the other compatibility group.
          if('automaticDesignArcOnly' in item&&item.automaticDesignArcOnly){
            const nozzle=item.nozzles.find(n=>n.designArcDeg===arc)??item.nozzles.find(n=>n.id===item.defaultNozzleId);
            if(nozzle?.designArcDeg)arc=nozzle.designArcDeg;
          }
          const defaults = catalogHeadDefaults(item);
          if('automaticDesignArcOnly' in item&&item.automaticDesignArcOnly){
            defaults.nozzleId=item.nozzles.find(n=>n.designArcDeg===arc)?.id??defaults.nozzleId;
          }
          const nominal = performanceAt(item,defaults.nozzleId,defaults.designPressure,arc)?.row.radiusM ?? defaults.r;
          const draftHead: Head = {
            id: uid("h"),
            figureId: figureAtPoint(snapped, irrigationFigures(drawingOrMigrate(pr)))?.id,
            catalogId: item.id,
            nozzleId: defaults.nozzleId,
            x: snapped.x,
            y: snapped.y,
            arc,
            start,
            r: nominal,
            zone: get().activeZoneId,
            designPressure: defaults.designPressure,
            bodyId: defaultBodyFor(item),
            popUpMm: defaultPopUpMm(item),
            locked: false,
            needsReview: item.verificationStatus==='Needs Review'&&(item.performanceReview!=='per-row'||!performanceAt(item,defaults.nozzleId,defaults.designPressure,arc)),
          };
          const maxLpm = projectZoneLimit(pr);
          // Manual placement preserves the explicitly selected model and its throw.
          const fitted = draftHead;
          const picked = assignZoneForNewHead(pr, fitted, get().activeZoneId, maxLpm);
          const head = { ...fitted, zone: picked.zoneId };
          withCommit({ ...pr, heads: [...pr.heads, head], zones: picked.zones });
          set({ catalogPlacementArmed:false, selectedId: head.id, selectedIds: [head.id], rightMode: "object", rightOpen: true, activeZoneId: picked.zoneId });
        },
        moveHead: (id, p) => {
          const pr = get().project;
          const head = pr.heads.find(h => h.id === id);
          if (!head || isHeadLocked(head, pr.zones) || !isHeadVisible(head, pr.zones)) return;
          set({
            project: {
              ...get().project,
              heads: get().project.heads.map((h) => (h.id === id && !h.locked ? { ...h, x: p.x, y: p.y } : h)),
            },
          });
        },
        updateHead: (id, patch) => {
          const pr = get().project;
          const head = pr.heads.find(h => h.id === id);
          if (!head || pr.zones.some(z => z.id === head.zone && z.locked) ||
            head.locked && Object.keys(patch).some(key => key !== "locked" && key !== "hidden")) return;
          const heads = pr.heads.map((h) => {
            if (h.id !== id) return h;
            return updateHeadSettings(h, patch);
          });
          withCommit({ ...pr, heads });
        },
        setHeadFlag: (id, patch) => {
          // End an interrupted sector gesture before recording a separate layer action.
          get().endHeadEdit();
          const pr = get().project;
          const head = pr.heads.find(h => h.id === id);
          if (!head) return;
          const flags: Partial<Pick<Head, "hidden" | "locked">> = {};
          if (typeof patch.hidden === "boolean" && patch.hidden !== Boolean(head.hidden)) flags.hidden = patch.hidden;
          if (typeof patch.locked === "boolean" && patch.locked !== head.locked &&
            !pr.zones.some(z => z.id === head.zone && z.locked)) flags.locked = patch.locked;
          if (!Object.keys(flags).length) return;
          withCommit({ ...pr, heads: pr.heads.map(h => h.id === id ? { ...h, ...flags } : h) });
          if (flags.hidden && get().selectedIds.includes(id)) get().selectHeads(get().selectedIds.filter(value => value !== id));
          if ((flags.hidden || flags.locked) && get().sectorEditId === id) set({ sectorEditId: null });
        },
        setSectorEdit: (id) => {
          if (!id) { set({ sectorEditId: null }); return; }
          const head = get().project.heads.find(h => h.id === id);
          const zone = head && get().project.zones.find(z => z.id === head.zone);
          const item = head && catalogForHead(head);
          if (!head || head.hidden || head.locked || zone?.locked || zone?.hidden || !item || item.coverageKind === "point") return;
          get().selectHead(id);
          set({ sectorEditId: id, tool: "place", drawSub: "none", draft: emptyDraft(),
            pendingCatalogPlant: null, landscapeOpen: false, catalogOpen: true, showCoverage: true });
        },
        beginHeadEdit: () => {
          if (!headEditBase) headEditBase = cloneProject(get().project);
        },
        patchHeadLive: (id, patch) => {
          const current = get().project;
          const head = current.heads.find(h => h.id === id);
          if (!head || isHeadLocked(head, current.zones) || !isHeadVisible(head, current.zones)) return;
          if (!headEditBase) headEditBase = cloneProject(get().project);
          const pr = get().project;
          const heads = pr.heads.map((h) => {
            if (h.id !== id) return h;
            let next = { ...h, ...patch };
            if(patch.bodyId!=null){const body=itemById(next.bodyId??'');next.bodySnapshot=body?.type==='body'?equipmentSnapshot(body):undefined;}
  if (next.start != null) next.start = ((next.start % 360) + 360) % 360;
            next = fitHeadToRadius(next, patch, headEditBase?.heads.find(base => base.id === h.id) ?? h);
            const item = catalogForHead(next);
            if (item) {
              next.r = clampHeadRadius(item, next);
              next.arc = clampArc(item, next.arc);
              next.needsReview=!!next.needsReview||!headPressureAvailable(item,next);
            }
            return next;
          });
          set({ project: { ...pr, heads } });
        },
        endHeadEdit: () => {
          if (!headEditBase) return;
          const { past, project, projects, pastOps, lastOp } = get();
          if (JSON.stringify(project.heads) === JSON.stringify(headEditBase.heads)) { headEditBase = null; return; }
          const item = touch(project);
          const listed = projects.some((x) => x.id === item.id);
          set({
            project: item,
            past: [...past, headEditBase].slice(-200),
            pastOps: [...pastOps, lastOp].slice(-200),
            lastOp: "head-edit",
            future: [],
            futureOps: [],
            saveState: listed || isNamed(item) || projectHasContent(item) ? "saved" : "idle",
            projects: listed || isNamed(item) || projectHasContent(item) ? upsertList(projects, item) : projects,
          });
          headEditBase = null;
        },
        cancelHeadEdit: () => {
          if (!headEditBase) return;
          // Do not resurrect a head deleted while a pointer gesture was interrupted.
          const originals = new Map(headEditBase.heads.map(h => [h.id, h]));
          set({ project: { ...get().project, heads: get().project.heads.map(h => {
            const original = originals.get(h.id);
            return original ? { ...original, zone: h.zone, locked: h.locked, ...(h.hidden !== undefined ? { hidden: h.hidden } : {}) } : h;
          }) } });
          headEditBase = null;
        },
        movePolyPoint: (id, index, p) => {
          set({
            project: {
              ...get().project,
              polygons: get().project.polygons.map((poly) =>
                poly.id !== id || poly.locked
                  ? poly
                  : { ...poly, points: poly.points.map((pt, i) => (i === index ? p : pt)) },
              ),
            },
          });
        },
        applyScale: (a, b, meters) => {
          const pr = get().project;
          if (!pr.underlay) return;
          const underlay = calibratedReference(pr.underlay, a, b, meters);
          if (!underlay) return;
          withCommit({ ...pr, underlay, scaleCalibrated: true });
          set({ draft: emptyDraft(), tool: null, referenceOpen: true, fitNonce: get().fitNonce + 1 });
        },
        autoZone: (maxLpm) => {
          const pr = get().project;
          const limit = maxLpm > 0 ? maxLpm : defaultMaxZoneLpm(pr.water.availableLpm);
          const { heads, zones } = distributeZones(pr.heads, limit);
          withCommit({ ...pr, heads, zones, zoneFlowLimitLpm: limit });
          set({ activeZoneId: zones[0]?.id ?? 1 });
        },
        setHeads: (heads) => {
          withCommit({ ...get().project, heads });
          set({ selectedId: null, selectedIds: [] });
        },
        requestFit: () => set({ fitNonce: get().fitNonce + 1 }),
        fitToView: (viewW, viewH) => {
          const pr = get().project;
          const pts: Pt[] = [];
          for (const poly of pr.polygons) pts.push(...poly.points);
          for (const h of pr.heads) pts.push({ x: h.x, y: h.y });
          if(pr.drawing)for(const o of Object.values(pr.drawing.landscapeObjects??{}).filter(o=>landscapeLayerVisible(pr.drawing!,o.category,o)))pts.push(...landscapeFootprint(o));
          if (pr.drawing?.layers?.plants?.visible !== false) for (const plant of Object.values(pr.drawing?.plants ?? {}).filter(p=>plantLayerVisible(pr.drawing!,p.kind,p)))
            pts.push({x:plant.x-plant.r,y:plant.y-plant.r},{x:plant.x+plant.r,y:plant.y+plant.r});
          if (pr.underlay) {
            pts.push(...referenceCorners(pr.underlay));
          }
          const box = boundsOf(pts, 1.5);
          if (!box) {
            set({ pxPerMeter: 36, panX: viewW * 0.12, panY: viewH * 0.1 });
            return;
          }
          const worldW = Math.max(2, box.maxX - box.minX);
          const worldH = Math.max(2, box.maxY - box.minY);
          const px = Math.min(90, Math.max(8, Math.min((viewW - 32) / worldW, (viewH - 32) / worldH)));
          set({
            pxPerMeter: px,
            panX: (viewW - worldW * px) / 2 - box.minX * px,
            panY: (viewH - worldH * px) / 2 - box.minY * px,
          });
        },
        setActiveZone: (id) => set({ activeZoneId: id }),
        addZone: (assignHeadId) => {
          const pr = get().project;
          if (pr.zones.length >= MAX_ZONES) return;
          if (assignHeadId) {
            const head = pr.heads.find(h => h.id === assignHeadId);
            if (!head || head.locked || pr.zones.some(z => z.id === head.zone && z.locked)) return;
          }
          const id = Math.max(0, ...pr.zones.map((z) => z.id)) + 1;
          const zone: Zone = { id, name: "", nameKind: "generated", hidden: false, locked: false };
          const heads = assignHeadId
            ? pr.heads.map((h) => (h.id === assignHeadId ? { ...h, zone: id, zoneAssignment:'manual' as const } : h))
            : pr.heads;
          withCommit({ ...pr, zones: [...pr.zones, zone], heads });
          set({ activeZoneId: id });
        },
        renameZone: (id, name) => {
          const pr = get().project;
          withCommit({
            ...pr,
            zones: pr.zones.map((z) => (z.id === id ? { ...z, name: name.trim(), nameKind: name.trim() ? "custom" : "generated" } : z)),
          });
        },
        removeZone: (id, transferTo) => {
          const pr = get().project;
          if (pr.zones.length <= 1) return;
          const source = pr.zones.find(z => z.id === id);
          const hasHeads = pr.heads.some(h => h.zone === id);
          const target = transferTo == null ? pr.zones.find(z => z.id !== id && (!hasHeads || !z.locked))
            : pr.zones.find(z => z.id === transferTo && z.id !== id && !z.locked);
          if (!source || source.locked || !target || pr.heads.some(h => h.zone === id && h.locked)) return;
          const active = get().activeZoneId;
          const { zones, heads, idMap } = compactAfterRemoveZone(pr.zones, pr.heads, id, target.id);
          const drawing = pr.drawing ? { ...pr.drawing, plants: Object.fromEntries(Object.entries(pr.drawing.plants ?? {}).map(([key, plant]) => [key,
            plant.irrigation?.zoneId ? {...plant,irrigation:{...plant.irrigation,zoneId:idMap.get(plant.irrigation.zoneId === id ? target.id : plant.irrigation.zoneId) ?? null}} : plant])) } : undefined;
          const engineering = remapEngineeringZones(pr.engineering, idMap, idMap.get(target.id));
          withCommit({ ...pr, zones, heads, ...(drawing ? {drawing} : {}), ...(engineering ? {engineering} : {}) });
          set({ activeZoneId: idMap.get(active === id ? target.id : active) ?? zones[0]?.id ?? 1, zoneFocus: null });
        },
        toggleZoneHidden: (id) => {
          get().endHeadEdit();
          const pr = get().project;
          const zone = pr.zones.find(z => z.id === id);
          if (!zone) return;
          withCommit({
            ...pr,
            zones: pr.zones.map((z) => (z.id === id ? { ...z, hidden: !z.hidden } : z)),
          });
          if (!zone.hidden) {
            const selected = get().selectedIds.filter(headId => pr.heads.some(h => h.id === headId && h.zone !== id));
            if (selected.length !== get().selectedIds.length) get().selectHeads(selected);
          }
        },
        toggleZoneLocked: (id) => {
          get().endHeadEdit();
          const pr = get().project;
          const zone = pr.zones.find(z => z.id === id);
          if (!zone) return;
          withCommit({
            ...pr,
            zones: pr.zones.map((z) => (z.id === id ? { ...z, locked: !z.locked } : z)),
          });
          if (!zone.locked && pr.heads.some(h => h.id === get().sectorEditId && h.zone === id)) set({ sectorEditId: null });
        },
        assignSelectedToZone: (id) => {
          const { selectedIds: ids, project } = get();
          const destination = project.zones.find(z => z.id === id);
          if (!ids.length || !destination || destination.locked) return;
          const selected = project.heads.filter(h => ids.includes(h.id));
          if (selected.some(h => h.locked || project.zones.some(z => z.id === h.zone && z.locked))) return;
          if (selected.every(h => h.zone === id)) { set({ activeZoneId: id }); return; }
          withCommit({
            ...project,
            heads: project.heads.map((h) => (ids.includes(h.id) ? { ...h, zone: id, zoneAssignment: 'manual' as const } : h)),
          });
          set({ activeZoneId: id });
        },
        finishMoveHead: (id, p) => {
          const st = get();
          const pr = st.project;
          const head = pr.heads.find(h => h.id === id);
          if (!head || isHeadLocked(head, pr.zones) || !isHeadVisible(head, pr.zones)) return;
          withCommit({
            ...pr,
            heads: pr.heads.map((h) => {
              if (h.id !== id || h.locked) return h;
              return { ...h, x: p.x, y: p.y };
            }),
          });
        },
        finishMovePolyPoint: (id, index, p) => {
          const pr = get().project;
          const d0 = drawingOrMigrate(pr);
          const face = d0.faces[id];
          let d = d0;
          if (face) {
            const pts = face.outer.map((h) => {
              const ed = d0.edges[h.e]!;
              return h.dir === 1 ? ed.a : ed.b;
            });
            const vid = pts[index];
            if (vid) d = moveVertex(d0, vid, p);
          }
          withCommit({
            ...pr,
            drawing: d,
            polygons: toPolygons(d).length ? toPolygons(d) : pr.polygons.map((poly) =>
              poly.id !== id || poly.locked ? poly : { ...poly, points: poly.points.map((pt, i) => (i === index ? p : pt)) },
            ),
          });
        },
        setLastSegmentLength: (meters) => {
          const pts = get().draft.points;
          if (pts.length < 2 || meters <= 0) return;
          const a = pts[pts.length - 2]!;
          const b = pts[pts.length - 1]!;
          const d = dist(a, b);
          if (d < 1e-6) return;
          const k = meters / d;
          const next = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
          set({ draft: { ...get().draft, redoPoints: [], redoClosure:false, points: [...pts.slice(0, -1), next] } });
        },
        openLibrary: (id) => {
          set({referenceOpen:false,landscapeOpen:false,inspectedPlant:null,selectedPlantId:null,selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null,pendingCatalogPlant:null});
          if (get().groupMemberId) get().finishGroupMember();
          const found = get().projects.find((x) => x.id === id);
          if (!found) return;
          const full = "heads" in found && Array.isArray((found as Project).heads) ? migrateProject(found as unknown as Record<string, unknown>) : null;
          if (!full) return;
          set({
            ...full.view,
            measureUnit: parseMeasureUnit(full.view?.measureUnit ?? get().measureUnit),
            project: cloneProject(full),
            newProjectReturnId: null,
            selectedId: null,
            selectedIds: [],
            selectedPolyId: null,
            selectedEdgeId: null,
            activeZoneId: full.view?.activeZoneId ?? full.zones[0]?.id ?? 1,
            draft: emptyDraft(),
            tool: null,
            catalogOpen: false,
            rightMode: "project",
            rightOpen: false,
            workspaceSection: null,
            projectFormOpen: false,
            past: [],
            future: [],
            fitNonce: get().fitNonce + 1,
          });
        },
        removeLibrary: (id) => {
          if (get().groupMemberId && get().project.id === id) get().finishGroupMember();
          const { project, projects } = get();
          const removed = project.id === id ? projectWithView(get()) : projects.find(p => p.id === id);
          if (!removed) return;
          set({ trash: [...retainedTrash(get().trash).filter(t => t.project.id !== id), {project:removed,deletedAt:new Date().toISOString()}] });
          const rest = projects.filter((x) => x.id !== id);
          if (project.id !== id) {
            set({ projects: rest });
            return;
          }
          const next = rest[0];
          if (next) {
            const full = migrateProject(next as unknown as Record<string, unknown>);
            set({
              project: cloneProject(full),
              projects: rest,
              selectedId: null,
              selectedIds: [],
              selectedPolyId: null,
            selectedEdgeId: null,
              activeZoneId: full.zones[0]?.id ?? 1,
              draft: emptyDraft(),
              tool: null,
              catalogOpen: false,
              rightMode: "project",
              rightOpen: false,
              projectFormOpen: false,
              past: [],
              future: [],
              fitNonce: get().fitNonce + 1,
            });
            return;
          }
          const p = emptyProject();
          set({
            project: p,
            projects: rest,
            selectedId: null,
            selectedIds: [],
            selectedPolyId: null,
            selectedEdgeId: null,
            activeZoneId: 1,
            draft: emptyDraft(),
            tool: null,
            catalogOpen: false,
            rightMode: "project",
            rightOpen: false,
            projectFormOpen: true,
            workspaceSection: null,
            past: [],
            future: [],
            fitNonce: get().fitNonce + 1,
            saveState: "idle",
          });
        },
        restoreLibrary: (id) => {
          const found = retainedTrash(get().trash).find(t => t.project.id === id);
          if (!found) return;
          set({projects:upsertList(get().projects,found.project),trash:get().trash.filter(t=>t.project.id!==id)});
        },
        purgeLibrary: (id) => set({trash:get().trash.filter(t=>t.project.id!==id)}),
        duplicateLibrary: (id) => {
          const found = get().projects.find((x) => x.id === id);
          if (!found) return;
          const copy = cloneProject(found);
          copy.id = uid("p");
          copy.name = tr(get().locale, "copyProjectName", { name: copy.name || tr(get().locale, "untitled") });
          copy.updatedAt = new Date().toISOString();
          set({ projects: upsertList(get().projects, copy) });
        },
        renameLibrary: (id, name) => {
          const n = name.trim();
          if (!n) return;
          const next = get().projects.map((p) => (p.id === id ? { ...p, name: n, updatedAt: new Date().toISOString() } : p));
          const cur = get().project.id === id ? preserveConstruction(get().project, { ...get().project, name: n }) : get().project;
          set({ projects: next, project: cur });
        },
        saveCurrentToLibrary: () => {
          const { projects } = get(), project=projectWithView(get());
          if(!isNamed(project)&&!projectHasContent(project)&&!projects.some(p=>p.id===project.id))return;
          if (!get().trash.some(t=>t.project.id===project.id)) set({projects:upsertList(projects,project)});
        },
        importPacked: (raw, extras) => {
          set({referenceOpen:false,landscapeOpen:false,inspectedPlant:null,selectedPlantId:null,selectedLandscapeId:null,inspectedLandscapeId:null,pendingLandscapeObject:null,pendingCatalogPlant:null});
          if (get().groupMemberId) get().finishGroupMember();
          const project = migrateProject(raw as unknown as Record<string, unknown>);
          project.id = uid("p");
          extras = { ...project.view, ...extras, measureUnit:parseMeasureUnit(extras?.measureUnit ?? project.view?.measureUnit ?? get().measureUnit) };
          set({
            project,
            selectedId: null,
            selectedIds: [],
            selectedPolyId: null,
            selectedEdgeId: null,
            activeZoneId: extras?.activeZoneId ?? project.zones[0]?.id ?? 1,
            draft: emptyDraft(),
            tool: null,
            catalogOpen: false,
            rightMode: "project",
            rightOpen: true,
            projectFormOpen: false,
            past: [],
            future: [],
            fitNonce: get().fitNonce + 1,
            showCoverage: extras?.showCoverage ?? get().showCoverage,
            showLabels: extras?.showLabels ?? get().showLabels,
            showGrid: extras?.showGrid ?? get().showGrid,
            snapOn: extras?.snapOn ?? get().snapOn,
            snapGridOn: extras?.snapGridOn ?? get().snapGridOn,
            gridStep: extras?.gridStep ?? get().gridStep,
            measureUnit: parseMeasureUnit(extras?.measureUnit ?? get().measureUnit),
            projects: upsertList(get().projects, project),
          });
        },
        undo: () => {
          const state = get();
          if (state.tool === "draw" && (state.drawSub === "polygon" || state.drawSub === "spline" || (state.drawSub === "cut" && state.draft.points.length>0))) {
            state.popDraftPoint();
            return;
          }
          const { past, project, future, pastOps, futureOps, lastOp, tool, drawSub } = get();
          const prev = past[past.length - 1];
          if (!prev) return;
          const construction = closedConstructions.get(project);
          set({
            project: prev,
            ...(get().groupMemberId && prev.drawing?.faces[get().groupMemberId!]?.layerId !== get().groupMemberGroupId
              ? { groupMemberId: null, groupMemberGroupId: null, cadEditId: null, selectedPolyId: null, selectedPolyIds: [] }
              : get().groupMemberId && (prev.drawing?.faces[get().groupMemberId!]?.locked || prev.drawing?.faces[get().groupMemberId!]?.hidden) ? { cadEditId: null } : {}),
            past: past.slice(0, -1),
            pastOps: pastOps.slice(0, -1),
            future: [historySnapshot(project), ...future].slice(0, 200),
            futureOps: [lastOp, ...futureOps].slice(0, 200),
            lastOp: pastOps[pastOps.length - 1] ?? "",
            selectedId: null,
            selectedIds: [],
            draft: tool === "draw" && (drawSub === "line" || drawSub === "cut") ? emptyDraft() : get().draft,
            ...(construction ? {tool:"draw" as const,drawSub:"polygon" as const,
              draft:{...emptyDraft(),points:construction.points.map(p=>({...p})),redoClosure:true},
              cadEditId:null,selectedPolyId:null,selectedPolyIds:[],selectedEdgeId:null,
              splinePreview:null,rightMode:"drawing" as const,rightOpen:false} : {}),
          });
        },
        redo: () => {
          const state = get();
          if (state.tool === "draw" && (state.drawSub === "polygon" || state.drawSub === "spline" || (state.drawSub === "cut" && (state.draft.points.length>0 || !!state.draft.redoPoints?.length)))) {
            const [point, ...rest] = state.draft.redoPoints ?? [];
            if (point) { set({ draft: { ...state.draft, points: [...state.draft.points, point], redoPoints: rest } }); return; }
            const closure = state.future[0] && closedConstructions.get(state.future[0]);
            if (!state.draft.redoClosure || !closure || JSON.stringify(state.draft.points)!==JSON.stringify(closure.points)) return;
          }
          const { past, project, future, pastOps, futureOps, lastOp, tool, drawSub } = get();
          const next = future[0];
          if (!next) return;
          const construction = closedConstructions.get(next);
          set({
            project: next,
            ...(get().groupMemberId && next.drawing?.faces[get().groupMemberId!]?.layerId !== get().groupMemberGroupId
              ? { groupMemberId: null, groupMemberGroupId: null, cadEditId: null, selectedPolyId: null, selectedPolyIds: [] }
              : get().groupMemberId && (next.drawing?.faces[get().groupMemberId!]?.locked || next.drawing?.faces[get().groupMemberId!]?.hidden) ? { cadEditId: null } : {}),
            past: [...past, historySnapshot(project)].slice(-200),
            pastOps: [...pastOps, lastOp].slice(-200),
            future: future.slice(1),
            futureOps: futureOps.slice(1),
            lastOp: futureOps[0] ?? "",
            selectedId: null,
            draft: tool === "draw" && (drawSub === "line" || drawSub === "cut") ? emptyDraft() : get().draft,
            selectedIds: [],
            ...(construction ? {tool:"draw" as const,drawSub:"none" as const,draft:emptyDraft(),
              cadEditId:construction.faceId,selectedPolyId:construction.faceId,selectedPolyIds:[construction.faceId],
              selectedEdgeId:null,rightMode:"drawing" as const,rightOpen:true} : {}),
          });
        },
        commit: () => withCommit(get().project),
      };
    },
    {
      name: "irrigation-designer-v3",
      storage: projectStorage,
      partialize: (s) => ({
        project: projectWithView(s),
        projects: s.projects,
        trash: s.trash,
        equipmentFilters:s.equipmentFilters, familyFilter:s.familyFilter,
        landscapeLibrarySection:s.landscapeLibrarySection,
        landscapeVisualMode:s.landscapeVisualMode,
        landscapeFavorites:s.landscapeFavorites,
        landscapeRecent:s.landscapeRecent,
        hideLandscapeInIrrigation: s.hideLandscapeInIrrigation,
        showCoverage: s.showCoverage,
        showGrid: s.showGrid,
        showRadii: s.showRadii,
        showLabels: s.showLabels,
        snapOn: s.snapOn,
        orthoOn: s.orthoOn,
        snapGridOn: s.snapGridOn,
        gridStep: s.gridStep,
        dimensionOffset: s.dimensionOffset,
        dimensionOffsetCustomized: s.dimensionOffsetCustomized,
        measureUnit: s.measureUnit,
        locale: s.locale,
        themeId: s.themeId,
        buttonStyle: s.buttonStyle,
        accent: s.accent,
        themeAccent: s.themeAccent,
        themeAccent2: s.themeAccent2,
        themeGradient: s.themeGradient,
        uiSize: s.uiSize,
        showHints: s.showHints,
        numberFormat: s.numberFormat,
        localizationVersion: 1,
        decimals: s.decimals,
        units: s.units,
        unitPreset: s.unitPreset,
        localeBootstrapped: true,
        activeZoneId: s.activeZoneId,
        pxPerMeter: s.pxPerMeter,
        panX: s.panX,
        panY: s.panY,
        autoHeadsWiped: s.autoHeadsWiped,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<State> | undefined;
        if (!p) {
          const boot = bootstrapLocaleAndUnits();
          return { ...current, ...boot, localeBootstrapped: true };
        }
        const project0 = p.project ? migrateProject(p.project as unknown as Record<string, unknown>) : current.project;
        const projects = Array.isArray(p.projects)
          ? p.projects.map((item) => migrateProject(item as unknown as Record<string, unknown>))
          : current.projects;
        const project = project0;
        const resumeIrrigation = project.heads.length > 0;
        const resumePlan = !resumeIrrigation && Boolean(project.polygons.length ||
          Object.keys(project.drawing?.faces ?? {}).length || Object.keys(project.drawing?.edges ?? {}).length ||
          Object.keys(project.drawing?.dims ?? {}).length || Object.keys(project.drawing?.texts ?? {}).length);
        const units = parseUnitPrefs(p.units, parseMeasureUnit(p.measureUnit ?? current.measureUnit));
        const unitPreset = p.unitPreset === "us" || p.unitPreset === "metric" || p.unitPreset === "custom" ? p.unitPreset : detectPreset(units);
        const old = persisted as Partial<State> & { paletteId?: string };
        return {
          ...current,
          ...p,
          landscapeLibrarySection: (["tree", "shrub", "flower", "grass", "furniture", "lighting", "decor", "equipment"] as string[]).includes(p.landscapeLibrarySection ?? "") ? p.landscapeLibrarySection! : "tree",
          landscapeVisualMode:isLandscapeVisualMode(p.landscapeVisualMode)?p.landscapeVisualMode:'image',
          landscapeFavorites:Array.isArray(p.landscapeFavorites)?p.landscapeFavorites.filter(id=>!!landscapeRecord(id)):[],
          landscapeRecent:Array.isArray(p.landscapeRecent)?p.landscapeRecent.filter(id=>!!landscapeRecord(id)).slice(0,24):[],
          showGrid: p.showGrid ?? true,
          dimensionOffsetCustomized:p.dimensionOffsetCustomized ?? (typeof p.dimensionOffset==="number" && Math.abs(p.dimensionOffset-0.8)>1e-6),
          project,
          projects,
          trash: retainedTrash(Array.isArray(p.trash) ? p.trash.filter(t=>t?.project && typeof t.deletedAt==="string").map(t=>({...t,project:migrateProject(t.project as unknown as Record<string,unknown>)})) : []),
          autoHeadsWiped: true,
          selectedId: current.selectedId,
          selectedIds: current.selectedIds,
          themeId: parseThemeId(p.themeId ?? old.paletteId),
          buttonStyle: parseButtonStyle(p.buttonStyle),
          accent: parseAccent(p.accent),
          themeAccent: parseAccent(p.themeAccent ?? p.accent),
          themeAccent2: parseAccent(p.themeAccent2 ?? "#6eb4d6"),
          themeGradient: false,
          uiSize: parseUiSize(p.uiSize),
          showHints: p.showHints !== false,
          numberFormat: p.localizationVersion === 1 ? parseNumberFormat(p.numberFormat) : "auto",
          localizationVersion: 1,
          decimals: parseDecimals(p.decimals),
          units,
          unitPreset,
          measureUnit: units.length,
          locale: parseLocale(p.locale ?? current.locale),
          localeBootstrapped: true,
          familyFilter: equipmentGroupSelection(p.equipmentFilters?.manufacturerId==='all'?'hunter':p.equipmentFilters?.manufacturerId??'hunter',p.familyFilter),
          equipmentFilters: {manufacturerId:p.equipmentFilters?.manufacturerId==='all'?'hunter':p.equipmentFilters?.manufacturerId??'hunter'},
          catalogPlacementArmed:false,
          activeZoneId: p.activeZoneId ?? project.zones[0]?.id ?? 1,
          past: [],
          future: [],
          tool: resumePlan ? "draw" : null,
          selectedPolyId: null,
          selectedPolyIds: [],
          selectedEdgeId: null,
          cadEditId: null,
          groupMemberId: null,
          draft: {points:[],scaleA:null,scaleB:null,measureA:null},
          workspaceSection: resumeIrrigation ? "irrigation" : resumePlan ? "plan" : null,
          referenceOpen: false,
          landscapeOpen: false,
          catalogOpen: resumeIrrigation,
          catalogVisible: true,
          rightOpen: false,
          rightMode: resumeIrrigation ? "zone" : "drawing",
          projectFormOpen: false,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state || state.localeBootstrapped) return;
        queueMicrotask(() => {
          const s = useProject.getState();
          if (s.localeBootstrapped) return;
          useProject.setState({ ...bootstrapLocaleAndUnits(), localeBootstrapped: true });
        });
      },
    },
  ),
);

// Update shared formatting before React paints any dependent labels or canvas text.
useProject.subscribe(state => {
  setActiveLocale(state.locale);
  setNumberPrefs(state.numberFormat, state.decimals);
  setActiveUnits(state.units);
});

export function projectHasContent(p: Project): boolean {
  if(Object.keys(p.engineering?.elements ?? {}).length)return true;
  return Boolean(p.underlay || p.heads.length || p.polygons.length || Object.keys(p.drawing?.faces ?? {}).length || Object.keys(p.drawing?.edges ?? {}).length || Object.keys(p.drawing?.plants ?? {}).length || Object.keys(p.drawing?.landscapeObjects ?? {}).length || Object.keys(p.drawing?.texts ?? {}).length);
}

export function isNamed(p: Project): boolean {
  const n = p.name.trim();
  return n.length > 0 && n !== "Без названия";
}

export function projectRequiresName(project:Project,projects:Project[]):boolean {
  return !isNamed(project) && (projects.length===0 || !projects.some(p=>p.id===project.id));
}

function upsertList(list: Project[], p: Project): Project[] {
  if (list.find(x=>x.id===p.id) === p) return list;
  const item = p;
  const rest = list.filter((x) => x.id !== p.id);
  return [item, ...rest];
}

// Every project mutation (including live edits, undo/redo and future modules) reaches
// the same autosave boundary. Selection/hover do not clone or serialize the project.
useProject.subscribe((state,previous) => {
  if (!useProject.persist.hasHydrated()) return;
  if(state.project !== previous.project && !state.trash.some(t=>t.project.id===state.project.id)
    && (state.project.id===previous.project.id||isNamed(state.project)||projectHasContent(state.project)||state.projects.some(p=>p.id===state.project.id))) {
    const projects=upsertList(state.projects,state.project);
    if(projects!==state.projects) useProject.setState({projects});
  }
});
