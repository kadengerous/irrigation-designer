import { create } from "zustand";
import { persist } from "zustand/middleware";
import { assignZoneForNewHead, defaultMaxZoneLpm, distributeZones } from "@/lib/hydro";
import { clampHeadThrow } from "@/lib/hunter-rules";
import { exclusionLoops, siteLoop } from "@/lib/cad/irrigation-geom";
import {
  CATALOG,
  clampArc,
  clampRadius,
  defaultBodyFor,
  defaultNozzle,
  itemById,
  nozzleRange,
  pickNozzleForRadius,
  pickSeriesForRadius,
  pickSkuForArc,
  workingPressureBar,
} from "@/lib/hunter-catalog";
import {
  boundsOf,
  closestOnSegment,
  cornerArc,
  dist,
  inwardStart,
  pointInPoly,
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
import { parseLocale, parseNumberFormat, parseDecimals, type Locale, type NumberFormat } from "@/lib/i18n";
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
  type UnitPrefs,
  type UnitPreset,
} from "@/lib/units";
import { addConstraint, type ConstraintKind } from "@/lib/cad/constraints";
import { fromCadMode, type CadMode } from "@/lib/cad/mode";
import { parseDxf } from "@/lib/cad/dxf";
import {
  compactAfterRemoveZone,
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
  addCircle,
  addText,
  addRect,
  addDim,
  addEllipse,
  addPlant,
  addSpline,
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
  drawingOrMigrate,
  duplicateFace,
  extendEdge,
  faceCentroid,
  facePoints,
  filletFace,
  filletVertex,
  flattenEdge as flattenCadEdge,
  distToLoop,
  headsOnFaces,
  insertVertexOnEdge,
  intersectFaces,
  setCircleRadius,
  setRectFromDiag,
  setRectSize,
  setEllipseRadii,
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
  rdp,
  rotateFace,
  scaleFace,
  scaleFaceAxis,
  setDimOffset as setCadDimOffset,
  setEdgeBulge,
  setFaceHidden,
  setFaceLocked,
  setFaceType,
  ensureRectMeta,
  snapFaceToGrid,
  smartFill,
  unionFaces,
  trimEdge,
  toPolygons,
} from "@/lib/cad/engine";
import type { CadDrawing, RegionType, SnapKind } from "@/lib/cad/types";

export type { Head, Geom, PolyKind, Project, Tool, Underlay, Zone };

export type Draft = {
  points: Pt[];
  scaleA: Pt | null;
  scaleB: Pt | null;
  measureA: Pt | null;
};

export type RightMode = "project" | "drawing" | "object" | "zone" | "irrigation" | "estimate";

type State = {
  project: Project;
  projects: Project[];
  tool: Tool;
  drawSub: DrawSub;
  measureSub: MeasureSub;
  placeId: string | null;
  selectedId: string | null;
  selectedIds: string[];
  selectedPolyId: string | null;
  selectedPolyIds: string[];
  selectedEdgeId: string | null;
  activeZoneId: number;
  showCoverage: boolean;
  showRadii: boolean;
  showLabels: boolean;
  showGrid: boolean;
  snapOn: boolean;
  snapGridOn: boolean;
  orthoOn: boolean;
  gridStep: number;
  catalogOpen: boolean;
  catalogVisible: boolean;
  rightOpen: boolean;
  rightMode: RightMode;
  projectFormOpen: boolean;
  familyFilter: string;
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
  cadLiveRot: number | null;

  setTool: (t: Tool) => void;
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
  setCadLiveRot: (deg: number | null) => void;
  setRightOpen: (v: boolean) => void;
  setRightMode: (m: RightMode) => void;
  setProjectFormOpen: (v: boolean) => void;
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
  patchProject: (patch: Partial<Project>) => void;
  setUnderlay: (u: Underlay | null) => void;
  patchUnderlay: (patch: Partial<Underlay>) => void;
  addDraftPoint: (p: Pt) => void;
  setDraftPoints: (pts: Pt[]) => void;
  popDraftPoint: () => void;
  closePolygon: (kind?: PolyKind) => void;
  finishOpenDraw: () => void;
  commitGeom: (g: Geom) => void;
  commitDrawing: (d: CadDrawing, selectedId?: string | null, keepTool?: boolean) => void;
  applyCadLength: (meters: number, hover: Pt | null) => void;
  applyCadSize: (w: number, h: number, hover: Pt | null) => void;
  applyCadArea: (m2: number, hover: Pt | null) => void;
  applyCadRadius: (r: number, hover: Pt | null) => void;
  setRectCorner: (opposite: Pt, p: Pt) => void;
  setRectWH: (w: number, h: number) => void;
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
  setSplinePt: (index: number, p: Pt) => void;
  addAngleGuides: (p: Pt) => void;
  addPlantAt: (p: Pt, kind: "tree" | "shrub") => void;
  setHydro: (need: "low" | "medium" | "high", method: "spray" | "mp" | "rotor" | "drip" | "bubbler" | "none") => void;
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
  moveHead: (id: string, p: Pt) => void;
  updateHead: (id: string, patch: Partial<Head>) => void;
  patchHeadLive: (id: string, patch: Partial<Head>) => void;
  beginHeadEdit: () => void;
  endHeadEdit: () => void;
  movePolyPoint: (id: string, index: number, p: Pt) => void;
  applyScale: (a: Pt, b: Pt, meters: number) => void;
  autoZone: (maxLpm: number) => void;
  setHeads: (heads: Head[]) => void;
  requestFit: () => void;
  fitToView: (viewW: number, viewH: number) => void;
  setActiveZone: (id: number) => void;
  addZone: (assignHeadId?: string) => void;
  renameZone: (id: number, name: string) => void;
  removeZone: (id: number) => void;
  toggleZoneHidden: (id: number) => void;
  toggleZoneLocked: (id: number) => void;
  assignSelectedToZone: (id: number) => void;
  finishMoveHead: (id: string, p: Pt) => void;
  finishMovePolyPoint: (id: string, index: number, p: Pt) => void;
  setLastSegmentLength: (meters: number) => void;
  openLibrary: (id: string) => void;
  removeLibrary: (id: string) => void;
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
  if (!u) return null;
  if (u.src.startsWith("data:") && u.src.length > 1_400_000) return { ...u, src: "" };
  return u;
}

function cloneProject(p: Project): Project {
  return JSON.parse(JSON.stringify(p)) as Project;
}

function migrateHead(h: Partial<Head> & { catalogId?: string; x: number; y: number }): Head {
  const item = h.catalogId ? itemById(h.catalogId) : undefined;
  return {
    id: h.id ?? uid("h"),
    catalogId: h.catalogId ?? "MP2000-90",
    nozzleId: h.nozzleId ?? null,
    x: h.x,
    y: h.y,
    start: h.start ?? 0,
    arc: h.arc ?? 180,
    r: h.r ?? item?.rNom ?? 5,
    zone: h.zone ?? 1,
    designPressure: h.designPressure ?? item?.recommendedPressureBar ?? 2.8,
    bodyId: h.bodyId ?? (item ? defaultBodyFor(item) : "PRS40"),
    locked: h.locked ?? false,
    needsReview: h.needsReview ?? !item,
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
  };
}

function migrateProject(raw: Record<string, unknown>): Project {
  const base = emptyProject(typeof raw.name === "string" ? raw.name : "Без названия");
  const heads = Array.isArray(raw.heads) ? (raw.heads as Parameters<typeof migrateHead>[0][]).map(migrateHead) : [];
  const polygons = Array.isArray(raw.polygons)
    ? (raw.polygons as Record<string, unknown>[]).map(migrateGeom)
    : [];
  const zones = (
    Array.isArray(raw.zones) && (raw.zones as Zone[]).length
      ? (raw.zones as Zone[])
      : zonesFromHeads(heads)
  ).map((z) => ({
    id: z.id,
    name: z.name || `Зона ${z.id}`,
    hidden: Boolean(z.hidden),
    locked: Boolean(z.locked),
  }));
  const underlay = (raw.underlay as Underlay | null) ?? null;
  return {
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
          name: underlay.name ?? "Чертёж",
        }
      : null,
    polygons,
    drawing: (raw.drawing as Project["drawing"]) ?? undefined,
    heads,
    zones,
    scaleCalibrated: raw.scaleCalibrated !== false && !underlay ? true : Boolean(raw.scaleCalibrated),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

function fitHeadToRadius(next: Head, patch: Partial<Head>): Head {
  if (patch.r == null || patch.nozzleId != null || patch.catalogId != null) return next;
  const item = itemById(next.catalogId);
  if (!item) return next;
  if (item.nozzles.some((n) => n.performance.length > 1)) {
    const n = pickNozzleForRadius(item, next.r);
    if (n) {
      next.nozzleId = n.id;
      if (n.recommendedBar) next.designPressure = n.recommendedBar;
    }
    return next;
  }
  if (item.family === "mp" || item.family === "mp800") {
    const series = pickSeriesForRadius(next.r, item.family);
    const sku = pickSkuForArc(series, next.arc);
    if (sku.id !== item.id) {
      next.catalogId = sku.id;
      next.nozzleId = sku.nozzles[0]?.id ?? null;
      next.arc = clampArc(sku, next.arc);
      next.r = clampRadius(sku, next.r);
    }
  }
  return next;
}

let headEditBase: Project | null = null;

export const useProject = create<State>()(
  persist(
    (set, get) => {
      const touch = (project: Project): Project => ({ ...project, updatedAt: new Date().toISOString() });

      const withCommit = (next: Project, op = "edit") => {
        const { project, past, pastOps, projects } = get();
        const past2 = [...past, cloneProject(project)].slice(-200);
        const ops2 = [...pastOps, get().lastOp].slice(-200);
        const item = touch(next);
        const listed = projects.some((x) => x.id === item.id);
        set({
          project: item,
          past: past2,
          pastOps: ops2,
          future: [],
          futureOps: [],
          lastOp: op,
          saveState: listed || isNamed(item) ? "saved" : "idle",
          projects: listed || isNamed(item) ? upsertList(projects, item) : projects,
        });
      };

      return {
        project: emptyProject(),
        projects: [],
        tool: null,
        drawSub: "none",
        measureSub: "measure",
        placeId: "MP2000-90",
        selectedId: null,
        selectedIds: [],
        selectedPolyId: null,
        selectedPolyIds: [],
        selectedEdgeId: null,
        activeZoneId: 1,
        showCoverage: true,
        showRadii: true,
        showLabels: true,
        showGrid: false,
        snapOn: true,
        orthoOn: false,
        snapGridOn: true,
        gridStep: 0.1,
        catalogOpen: false,
        catalogVisible: true,
        rightOpen: false,
        rightMode: "drawing",
        projectFormOpen: false,
        familyFilter: "mp",
        polyKind: "lawn",
        regionType: "lawn",
        measureUnit: "m",
        locale: "ru",
        themeId: "irrigation",
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
        cadLiveRot: null,

        setTool: (tool) =>
          set({
            tool,
            draft: emptyDraft(),
            catalogOpen: tool === "place",
            drawSub: tool === "draw" ? "none" : get().drawSub,
            cadEditId: tool === "draw" ? null : get().cadEditId,
            rightMode: tool === "draw" ? "drawing" : tool === "place" ? "zone" : get().rightMode,
            rightOpen: tool === "draw" || tool === "place" ? true : get().rightOpen,
          }),
        setCadMode: (mode) => {
          const mapped = fromCadMode(mode);
          set({
            tool: mapped.tool,
            draft: emptyDraft(),
            ...(mapped.drawSub ? { drawSub: mapped.drawSub } : {}),
            ...(mapped.measureSub ? { measureSub: mapped.measureSub } : {}),
            catalogOpen: mapped.tool === "place",
            rightMode: mapped.tool === "scale" || mapped.tool === "draw" ? "drawing" : get().rightMode,
          });
        },
        setDrawSub: (drawSub) => {
          if (get().drawSub === drawSub && get().tool === "draw") {
            set({ drawSub: "none", draft: emptyDraft(), cadEditId: null });
            return;
          }
          set({ drawSub, tool: "draw", draft: emptyDraft(), catalogOpen: false, cadEditId: null });
        },
        setMeasureSub: (measureSub) => set({ measureSub, tool: "measure", draft: emptyDraft() }),
        setPlaceId: (placeId) => set({ placeId, catalogOpen: true, catalogVisible: true }),
        selectHead: (selectedId) =>
          set({
            selectedId,
            selectedIds: selectedId ? [selectedId] : [],
            selectedPolyId: null,
            selectedEdgeId: null,
            rightMode: selectedId ? (get().catalogOpen ? "zone" : get().rightMode) : get().rightMode === "object" ? "zone" : get().rightMode,
            rightOpen: selectedId ? true : get().rightOpen,
          }),
        selectHeads: (selectedIds) =>
          set({
            selectedIds,
            selectedId: selectedIds[0] ?? null,
            selectedPolyId: null,
            selectedEdgeId: null,
            rightMode: selectedIds.length && get().catalogOpen ? "zone" : get().rightMode,
            rightOpen: selectedIds.length ? true : get().rightOpen,
          }),
        selectPoly: (selectedPolyId, add) => {
          if (!selectedPolyId) {
            set({ selectedPolyId: null, selectedPolyIds: [], selectedEdgeId: null, selectedId: null, selectedIds: [] });
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
          const selectedPolyIds = add
            ? base.includes(selectedPolyId)
              ? base.filter((x) => x !== selectedPolyId)
              : [...base, selectedPolyId]
            : [selectedPolyId];
          set({
            selectedPolyId,
            selectedPolyIds,
            selectedEdgeId: null,
            selectedId: null,
            selectedIds: [],
            rightMode: "drawing",
            cadEditId: null,
            tool: "draw",
            catalogOpen: false,
            drawSub: "none",
            draft: emptyDraft(),
          });
        },
        selectEdge: (selectedEdgeId) => {
          const pending = get().pendingConstraint;
          if (pending && selectedEdgeId && pending.a !== selectedEdgeId) {
            get().addCadConstraint(pending.kind, pending.a, selectedEdgeId);
            return;
          }
          set({
            selectedEdgeId,
            selectedPolyId: null,
            selectedId: null,
            selectedIds: [],
            rightMode: selectedEdgeId ? "drawing" : get().rightMode,
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
            catalogOpen,
            catalogVisible: catalogOpen ? true : get().catalogVisible,
            tool: catalogOpen ? "place" : get().tool === "place" ? null : get().tool,
            draft: catalogOpen ? emptyDraft() : get().draft,
            cadEditId: catalogOpen ? null : get().cadEditId,
            ...(catalogOpen ? { rightMode: "zone" as const, rightOpen: true } : {}),
          }),
        setCatalogVisible: (catalogVisible) => set({ catalogVisible }),
        setCadEdit: (cadEditId) => {
          if (cadEditId) {
            const locked = drawingOrMigrate(get().project).faces[cadEditId]?.locked;
            if (locked) return;
            const pr = get().project;
            const d0 = drawingOrMigrate(pr);
            const stamped = ensureRectMeta(d0, cadEditId);
            if (stamped !== d0) {
              set({
                project: { ...pr, drawing: stamped, polygons: toPolygons(stamped) },
                cadEditId,
                selectedPolyId: cadEditId,
                selectedPolyIds: [cadEditId],
                tool: "draw",
                catalogOpen: false,
                drawSub: "none",
                draft: emptyDraft(),
                rightMode: "drawing",
              });
              return;
            }
          }
          set({
            cadEditId,
            selectedPolyId: cadEditId ?? get().selectedPolyId,
            selectedPolyIds: cadEditId ? [cadEditId] : get().selectedPolyIds,
            tool: cadEditId ? "draw" : get().tool,
            catalogOpen: cadEditId ? false : get().catalogOpen,
            drawSub: cadEditId ? "none" : get().drawSub,
            draft: cadEditId ? emptyDraft() : get().draft,
            rightMode: cadEditId ? "drawing" : get().rightMode,
            cadLiveRot: cadEditId ? get().cadLiveRot : null,
          });
        },
        setCadLiveRot: (cadLiveRot) => set({ cadLiveRot }),
        setRightOpen: (rightOpen) => set({ rightOpen }),
        setRightMode: (rightMode) => set({ rightMode, rightOpen: true }),
        setProjectFormOpen: (projectFormOpen) => set({ projectFormOpen }),
        setMeasureUnit: (measureUnit) =>
          set((s) => {
            const length = measureUnit === "yd" ? "ft" : measureUnit;
            const units = { ...s.units, length };
            return { measureUnit, units, unitPreset: detectPreset(units) };
          }),
        setLocale: (locale) => {
          const loc = parseLocale(locale);
          if (loc === get().locale) return;
          const region = loc === "en" ? regionFromBcp47(deviceBcp47()) : null;
          const preset = recommendedUnitSystem(loc, region);
          const units = unitsFromPreset(preset);
          set({
            locale: loc,
            unitPreset: preset,
            units,
            measureUnit: units.length,
            numberFormat: numberFormatForUnits(preset),
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
            numberFormat: numberFormatForUnits(preset),
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
              numberFormat: unitPreset === "custom" ? s.numberFormat : numberFormatForUnits(unitPreset),
            };
          }),
        setZoom: (pxPerMeter) => set({ pxPerMeter: clampPxPerMeter(pxPerMeter) }),
        setPan: (panX, panY) => set({ panX, panY }),
        setFamily: (familyFilter) => set({ familyFilter, catalogVisible: get().catalogOpen ? true : get().catalogVisible }),
        setPolyKind: (polyKind) => set({ polyKind, regionType: polyKind, tool: "draw" }),
        setRegionTypeDraft: (regionType) =>
          set({ regionType, polyKind: REGION_TO_POLY[regionType] ?? "lawn", tool: "draw" }),
        setAnalysis: (analysis) => set({ analysis, showCoverage: analysis !== "normal" ? true : get().showCoverage }),
        setSpaceDown: (spaceDown) => set({ spaceDown }),
        newProject: () => {
          const { project, projects } = get();
          if (isNamed(project) || projects.some((x) => x.id === project.id)) {
            get().saveCurrentToLibrary();
          }
          const p = emptyProject();
          set({
            project: p,
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
            past: [],
            future: [],
            fitNonce: get().fitNonce + 1,
          });
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
          withCommit({ ...get().project, underlay: { ...u, ...patch } });
        },
        addDraftPoint: (p) => set({ draft: { ...get().draft, points: [...get().draft.points, p] } }),
        setDraftPoints: (points) => set({ draft: { ...get().draft, points } }),
        popDraftPoint: () => {
          const pts = get().draft.points;
          if (!pts.length) return;
          set({ draft: { ...get().draft, points: pts.slice(0, -1) } });
        },
        commitDrawing: (d, selectedId, keepTool) => {
          const pr = get().project;
          const prevIds = new Set(Object.keys(drawingOrMigrate(pr).faces));
          const added = Object.keys(d.faces).find((id) => !prevIds.has(id)) ?? null;
          const pick = selectedId && d.faces[selectedId] ? selectedId : added;
          withCommit({ ...pr, drawing: d, polygons: toPolygons(d) }, get().drawSub || "draw");
          set({
            draft: emptyDraft(),
            tool: keepTool ? get().tool : "draw",
            drawSub: keepTool ? get().drawSub : "none",
            selectedPolyId: pick ?? get().selectedPolyId,
            selectedPolyIds: pick ? [pick] : get().selectedPolyIds,
            selectedEdgeId: null,
            cadEditId: keepTool ? get().cadEditId : null,
            rightMode: "drawing",
          });
        },
        closePolygon: () => {
          const pts = get().draft.points;
          if (pts.length < 3) return;
          const d = addChain(drawingOrMigrate(get().project), pts, true, get().regionType);
          const faces = Object.keys(d.faces);
          get().commitDrawing(d, faces[faces.length - 1] ?? null);
        },
        finishOpenDraw: () => {
          const pts = get().draft.points;
          if (pts.length < 2) return;
          const sub = get().drawSub;
          const d0 = drawingOrMigrate(get().project);
          const d =
            sub === "freehand"
              ? addChain(d0, rdp(pts, 0.04), false, get().regionType)
              : sub === "spline"
                ? addSpline(d0, pts, false, get().regionType)
                : sub === "path"
                  ? pathFromCenterline(d0, pts, 1.2, "path")
                  : addChain(d0, pts, false, get().regionType);
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
          if (meters <= 0) return;
          const sub = get().drawSub;
          if (!get().draft.points.length && get().selectedEdgeId && get().tool !== "draw") {
            get().lengthenSelectedEdge(meters);
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
          if (!pts.length) return;
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
          if (sub === "line" || sub === "polyline" || sub === "polygon") {
            const d = addChain(drawingOrMigrate(get().project), [a, end], false, get().regionType);
            withCommit({ ...get().project, drawing: d, polygons: toPolygons(d) });
            set({ draft: { ...get().draft, points: [...pts, end] }, tool: "draw" });
            return;
          }
          set({ draft: { ...get().draft, points: [...pts, end] } });
        },
        applyCadSize: (w, h, hover) => {
          const pts = get().draft.points;
          if (!pts.length || w <= 0 || h <= 0) return;
          const a = pts[0]!;
          const sx = hover && hover.x < a.x ? -1 : 1;
          const sy = hover && hover.y < a.y ? -1 : 1;
          get().commitDrawing(addRect(drawingOrMigrate(get().project), a, { x: a.x + sx * w, y: a.y + sy * h }, get().regionType));
        },
        applyCadArea: (m2, hover) => {
          if (m2 <= 0) return;
          const side = Math.sqrt(m2);
          get().applyCadSize(side, side, hover);
        },
        setRectCorner: (opposite, p) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(setRectFromDiag(drawingOrMigrate(get().project), id, opposite, p), id, true);
        },
        setRectWH: (w, h) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id || w <= 0 || h <= 0) return;
          get().commitDrawing(setRectSize(drawingOrMigrate(get().project), id, w, h), id, true);
        },
        setRectRotation: (deg) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id || !Number.isFinite(deg)) return;
          const d0 = drawingOrMigrate(get().project);
          const f = d0.faces[id];
          if (!f?.rect || f.locked) return;
          const cur = normDeg(f.rect.rot);
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
          get().commitDrawing(addDim(drawingOrMigrate(get().project), a, b, offset ?? 0.45), get().selectedPolyId, true);
        },
        mirrorSelected: (axis) => {
          const id = get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(mirrorFace(drawingOrMigrate(get().project), id, axis), id, true);
        },
        hideSelected: (hidden) => {
          const id = get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(setFaceHidden(drawingOrMigrate(get().project), id, hidden), id, true);
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
          const id = get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(setEllipseRadii(drawingOrMigrate(get().project), id, rx, ry), id, true);
        },
        setSplinePt: (index, p) => {
          const id = get().selectedPolyId;
          if (!id) return;
          const d0 = drawingOrMigrate(get().project);
          const f = d0.faces[id];
          if (!f?.spline) return;
          const pts = f.spline.pts.map((q, i) => (i === index ? p : q));
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
          get().commitDrawing(addPlant(drawingOrMigrate(get().project), kind, p), get().selectedPolyId, true);
        },
        setHydro: (need, method) => {
          const id = get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(setFaceHydro(drawingOrMigrate(get().project), id, { need, method }), id, true);
        },
        setFaceName: (name) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(setCadFaceName(drawingOrMigrate(get().project), id, name), id, true);
        },
        setFaceFill: (color) => {
          const id = get().cadEditId ?? get().selectedPolyId;
          if (!id) return;
          get().commitDrawing(setCadFaceFill(drawingOrMigrate(get().project), id, color), id, true);
        },
        setCadLayer: (id, patch) => {
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
          const { selectedIds, selectedPolyId, selectedEdgeId, selectedPolyIds, project } = get();
          if (selectedIds.length) {
            withCommit({ ...project, heads: project.heads.filter((h) => !selectedIds.includes(h.id)) });
            set({ selectedId: null, selectedIds: [] });
            return;
          }
          if (selectedEdgeId) {
            const res = get().removeBoundary(selectedEdgeId);
            if (res.warning) {
              if (selectedPolyId) {
                const d0 = drawingOrMigrate(project);
                const gone = headsOnFaces(project.heads, d0, [selectedPolyId]);
                const d = deleteFace(d0, selectedPolyId);
                withCommit({
                  ...project,
                  drawing: d,
                  polygons: toPolygons(d),
                  heads: project.heads.filter((h) => !gone.has(h.id)),
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
            const goneHeads = headsOnFaces(project.heads, d, inCad);
            if (inCad.length) {
              for (const id of inCad) d = deleteFace(d, id);
            }
            const leftover = ids.filter((id) => !inCad.includes(id));
            const leftoverPolys = leftover.length
              ? project.polygons.filter((g) => leftover.includes(g.id))
              : [];
            for (const g of leftoverPolys) {
              const pts = g.type === "circle" && g.points[0] && g.radius
                ? []
                : g.points;
              for (const h of project.heads) {
                if (g.type === "circle" && g.points[0] && g.radius) {
                  if (dist(h, g.points[0]) <= g.radius + 0.12) goneHeads.add(h.id);
                } else if (pts.length >= 3 && (pointInPoly(h, pts) || distToLoop(h, pts) <= 0.12)) {
                  goneHeads.add(h.id);
                }
              }
            }
            const heads = project.heads.filter((h) => !goneHeads.has(h.id));
            withCommit({
              ...project,
              drawing: d,
              polygons: leftover.length ? toPolygons(d).filter((g) => !leftover.includes(g.id)) : toPolygons(d),
              heads,
            });
            set({ selectedPolyId: null, selectedPolyIds: [], selectedEdgeId: null, cadEditId: null });
          }
        },
        removeHead: (id) => {
          const { project, selectedIds, selectedId } = get();
          withCommit({ ...project, heads: project.heads.filter((h) => h.id !== id) });
          const next = selectedIds.filter((x) => x !== id);
          set({
            selectedIds: next,
            selectedId: selectedId === id ? (next[0] ?? null) : selectedId,
          });
        },
        duplicateSelected: () => {
          const { selectedIds, selectedPolyId, cadEditId, project } = get();
          const faceId = cadEditId ?? selectedPolyId;
          if (faceId) {
            const src = drawingOrMigrate(project).faces[faceId];
            const gap = Math.max(0.5, get().gridStep * 2);
            const dx = src?.rect ? src.rect.w + gap : src?.circle ? src.circle.r * 2 + gap : gap;
            const { drawing } = duplicateFace(drawingOrMigrate(project), faceId, dx, 0);
            get().commitDrawing(drawing, faceId, true);
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
        placeHead: (p, catalogId) => {
          const id = catalogId ?? get().placeId;
          let item = id ? itemById(id) : CATALOG[0];
          if (!item || item.family === "body") return;
          const pr = get().project;
          if (pr.underlay && !pr.scaleCalibrated) return;
          const polys = pr.polygons.filter((g) => g.closed);
          const snapped = snapInProject(p, pr, {
            snapOn: get().snapOn,
            snapGridOn: get().snapGridOn,
            gridStep: get().gridStep,
            pxPerMeter: get().pxPerMeter,
          }).pt;
          let start = 0;
          let arc = item.arcMin === 360 ? 360 : Math.min(180, item.arcMax);
          for (const poly of polys) {
            if (poly.kind !== "lawn") continue;
            const pts = poly.points;
            let done = false;
            for (let i = 0; i < pts.length; i++) {
              if (dist(pts[i]!, snapped) > 0.08) continue;
              const prev = pts[(i - 1 + pts.length) % pts.length]!;
              const next = pts[(i + 1) % pts.length]!;
              const ca = cornerArc(prev, pts[i]!, next);
              const series = CATALOG.filter((c) => c.series === item!.series);
              if (series.length) item = pickSkuForArc(series, ca.arc);
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
              const series = CATALOG.filter((c) => c.series === item!.series);
              if (series.length) item = pickSkuForArc(series, 180);
              arc = clampArc(item, 180);
              break;
            }
          }
          const nz = defaultNozzle(item);
          const nzR = nz ? nozzleRange(nz).recR : item.rNom;
          const draftHead: Head = {
            id: uid("h"),
            catalogId: item.id,
            nozzleId: nz?.id ?? null,
            x: snapped.x,
            y: snapped.y,
            arc,
            start,
            r: nzR || item.rNom,
            zone: get().activeZoneId,
            designPressure: workingPressureBar(item, defaultBodyFor(item), nz?.id),
            bodyId: defaultBodyFor(item),
            locked: false,
            needsReview: false,
          };
          const maxLpm = defaultMaxZoneLpm(pr.water.availableLpm);
          const d = drawingOrMigrate(pr);
          const fitted = clampHeadThrow(draftHead, siteLoop(d), exclusionLoops(d));
          const picked = assignZoneForNewHead(pr, fitted, get().activeZoneId, maxLpm);
          const head = { ...fitted, zone: picked.zoneId };
          withCommit({ ...pr, heads: [...pr.heads, head], zones: picked.zones });
          set({ selectedId: head.id, selectedIds: [head.id], rightMode: "object", activeZoneId: picked.zoneId });
        },
        moveHead: (id, p) => {
          set({
            project: {
              ...get().project,
              heads: get().project.heads.map((h) => (h.id === id && !h.locked ? { ...h, x: p.x, y: p.y } : h)),
            },
          });
        },
        updateHead: (id, patch) => {
          const pr = get().project;
          const heads = pr.heads.map((h) => {
            if (h.id !== id) return h;
            let next = { ...h, ...patch };
            if (next.start != null) next.start = ((next.start % 360) + 360) % 360;
            next = fitHeadToRadius(next, patch);
            const item = itemById(next.catalogId);
            if (item) {
              next.r = clampRadius(item, next.r);
              next.arc = clampArc(item, next.arc);
            }
            return next;
          });
          withCommit({ ...pr, heads });
        },
        beginHeadEdit: () => {
          if (!headEditBase) headEditBase = cloneProject(get().project);
        },
        patchHeadLive: (id, patch) => {
          if (!headEditBase) headEditBase = cloneProject(get().project);
          const pr = get().project;
          const heads = pr.heads.map((h) => {
            if (h.id !== id) return h;
            let next = { ...h, ...patch };
            if (next.start != null) next.start = ((next.start % 360) + 360) % 360;
            next = fitHeadToRadius(next, patch);
            const item = itemById(next.catalogId);
            if (item) {
              next.r = clampRadius(item, next.r);
              next.arc = clampArc(item, next.arc);
            }
            return next;
          });
          set({ project: { ...pr, heads } });
        },
        endHeadEdit: () => {
          if (!headEditBase) return;
          const { past, project, projects } = get();
          const item = touch(project);
          const listed = projects.some((x) => x.id === item.id);
          set({
            project: item,
            past: [...past, headEditBase].slice(-200),
            future: [],
            saveState: listed || isNamed(item) ? "saved" : "idle",
            projects: listed || isNamed(item) ? upsertList(projects, item) : projects,
          });
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
          const d = dist(a, b);
          if (d < 0.01 || meters <= 0) return;
          const k = meters / d;
          const scalePt = (p: Pt): Pt => ({ x: p.x * k, y: p.y * k });
          const pr = get().project;
          const underlay = pr.underlay
            ? {
                ...pr.underlay,
                x: pr.underlay.x * k,
                y: pr.underlay.y * k,
                width: pr.underlay.width * k,
                height: pr.underlay.height * k,
                locked: true,
              }
            : null;
          withCommit({
            ...pr,
            underlay,
            polygons: pr.polygons.map((poly) => ({
              ...poly,
              points: poly.points.map(scalePt),
              radius: poly.radius ? poly.radius * k : undefined,
            })),
            heads: pr.heads.map((h) => ({ ...h, x: h.x * k, y: h.y * k })),
            scaleCalibrated: true,
          });
          set({ draft: emptyDraft(), tool: null, fitNonce: get().fitNonce + 1 });
        },
        autoZone: (maxLpm) => {
          const pr = get().project;
          const limit = maxLpm > 0 ? maxLpm : defaultMaxZoneLpm(pr.water.availableLpm);
          const { heads, zones } = distributeZones(pr.heads, limit);
          withCommit({ ...pr, heads, zones });
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
          if (pr.underlay) {
            pts.push({ x: pr.underlay.x, y: pr.underlay.y });
            pts.push({ x: pr.underlay.x + pr.underlay.width, y: pr.underlay.y + pr.underlay.height });
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
          const id = Math.max(0, ...pr.zones.map((z) => z.id)) + 1;
          const zone: Zone = { id, name: `Зона ${id}`, hidden: false, locked: false };
          const heads = assignHeadId
            ? pr.heads.map((h) => (h.id === assignHeadId ? { ...h, zone: id } : h))
            : pr.heads;
          withCommit({ ...pr, zones: [...pr.zones, zone], heads });
          set({ activeZoneId: id });
        },
        renameZone: (id, name) => {
          const pr = get().project;
          withCommit({
            ...pr,
            zones: pr.zones.map((z) => (z.id === id ? { ...z, name: name.trim() || z.name } : z)),
          });
        },
        removeZone: (id) => {
          const pr = get().project;
          if (pr.zones.length <= 1) return;
          const firstId = [...pr.zones].sort((a, b) => a.id - b.id)[0]?.id;
          if (id === 1 || id === firstId) return;
          const { zones, heads, idMap } = compactAfterRemoveZone(pr.zones, pr.heads, id);
          withCommit({ ...pr, zones, heads });
          const active = get().activeZoneId;
          const keep = active === id ? 1 : active;
          set({ activeZoneId: idMap.get(keep) ?? 1 });
        },
        toggleZoneHidden: (id) => {
          const pr = get().project;
          withCommit({
            ...pr,
            zones: pr.zones.map((z) => (z.id === id ? { ...z, hidden: !z.hidden } : z)),
          });
        },
        toggleZoneLocked: (id) => {
          const pr = get().project;
          withCommit({
            ...pr,
            zones: pr.zones.map((z) => (z.id === id ? { ...z, locked: !z.locked } : z)),
          });
        },
        assignSelectedToZone: (id) => {
          const ids = get().selectedIds;
          if (!ids.length) return;
          withCommit({
            ...get().project,
            heads: get().project.heads.map((h) => (ids.includes(h.id) ? { ...h, zone: id } : h)),
          });
          set({ activeZoneId: id });
        },
        finishMoveHead: (id, p) => {
          const st = get();
          const pr = st.project;
          const d = drawingOrMigrate(pr);
          const keep = siteLoop(d);
          const cuts = exclusionLoops(d);
          withCommit({
            ...pr,
            heads: pr.heads.map((h) => {
              if (h.id !== id || h.locked) return h;
              return clampHeadThrow({ ...h, x: p.x, y: p.y }, keep, cuts);
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
          set({ draft: { ...get().draft, points: [...pts.slice(0, -1), next] } });
        },
        openLibrary: (id) => {
          const found = get().projects.find((x) => x.id === id);
          if (!found) return;
          const full = "heads" in found && Array.isArray((found as Project).heads) ? migrateProject(found as unknown as Record<string, unknown>) : null;
          if (!full) return;
          set({
            project: cloneProject(full),
            selectedId: null,
            selectedIds: [],
            selectedPolyId: null,
            selectedEdgeId: null,
            activeZoneId: full.zones[0]?.id ?? 1,
            draft: emptyDraft(),
            tool: null,
            catalogOpen: false,
            rightMode: "project",
            rightOpen: true,
            projectFormOpen: false,
            past: [],
            future: [],
            fitNonce: get().fitNonce + 1,
          });
        },
        removeLibrary: (id) => {
          const { project, projects } = get();
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
            projectFormOpen: false,
            past: [],
            future: [],
            fitNonce: get().fitNonce + 1,
            saveState: "idle",
          });
        },
        duplicateLibrary: (id) => {
          const found = get().projects.find((x) => x.id === id);
          if (!found) return;
          const copy = cloneProject(found);
          copy.id = uid("p");
          copy.name = `${copy.name} копия`;
          copy.updatedAt = new Date().toISOString();
          set({ projects: upsertList(get().projects, copy) });
        },
        renameLibrary: (id, name) => {
          const n = name.trim();
          if (!n) return;
          const next = get().projects.map((p) => (p.id === id ? { ...p, name: n, updatedAt: new Date().toISOString() } : p));
          const cur = get().project.id === id ? { ...get().project, name: n } : get().project;
          set({ projects: next, project: cur });
        },
        saveCurrentToLibrary: () => {
          const { project, projects } = get();
          const listed = projects.some((x) => x.id === project.id);
          if (!listed && !isNamed(project)) return;
          const next = touch(project);
          set({ project: next, projects: upsertList(projects, next), saveState: "saved" });
        },
        importPacked: (raw, extras) => {
          const project = migrateProject(raw as unknown as Record<string, unknown>);
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
          const { past, project, future, pastOps, futureOps, lastOp } = get();
          const prev = past[past.length - 1];
          if (!prev) return;
          set({
            project: prev,
            past: past.slice(0, -1),
            pastOps: pastOps.slice(0, -1),
            future: [cloneProject(project), ...future].slice(0, 200),
            futureOps: [lastOp, ...futureOps].slice(0, 200),
            lastOp: pastOps[pastOps.length - 1] ?? "",
            selectedId: null,
            selectedIds: [],
          });
        },
        redo: () => {
          const { past, project, future, pastOps, futureOps, lastOp } = get();
          const next = future[0];
          if (!next) return;
          set({
            project: next,
            past: [...past, cloneProject(project)].slice(-200),
            pastOps: [...pastOps, lastOp].slice(-200),
            future: future.slice(1),
            futureOps: futureOps.slice(1),
            lastOp: futureOps[0] ?? "",
            selectedId: null,
            selectedIds: [],
          });
        },
        commit: () => withCommit(get().project),
      };
    },
    {
      name: "irrigation-designer-v3",
      partialize: (s) => ({
        project: { ...s.project, underlay: slimUnderlay(s.project.underlay) },
        projects: s.projects,
        showCoverage: s.showCoverage,
        showGrid: s.showGrid,
        showRadii: s.showRadii,
        showLabels: s.showLabels,
        snapOn: s.snapOn,
        orthoOn: s.orthoOn,
        snapGridOn: s.snapGridOn,
        gridStep: s.gridStep,
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
        let projects = Array.isArray(p.projects)
          ? p.projects.map((item) => migrateProject(item as unknown as Record<string, unknown>))
          : current.projects;
        const wipeHeads = p.autoHeadsWiped !== true;
        const project = wipeHeads
          ? { ...project0, heads: [], zones: defaultZones(), updatedAt: new Date().toISOString() }
          : project0;
        if (wipeHeads) {
          projects = projects.map((item) => ({ ...item, heads: [], zones: defaultZones() }));
        }
        const units = parseUnitPrefs(p.units, parseMeasureUnit(p.measureUnit ?? current.measureUnit));
        const unitPreset = p.unitPreset === "us" || p.unitPreset === "metric" || p.unitPreset === "custom" ? p.unitPreset : detectPreset(units);
        const old = persisted as Partial<State> & { paletteId?: string };
        return {
          ...current,
          ...p,
          project,
          projects,
          autoHeadsWiped: true,
          selectedId: wipeHeads ? null : current.selectedId,
          selectedIds: wipeHeads ? [] : current.selectedIds,
          themeId: parseThemeId(p.themeId ?? old.paletteId),
          buttonStyle: parseButtonStyle(p.buttonStyle),
          accent: parseAccent(p.accent),
          themeAccent: parseAccent(p.themeAccent ?? p.accent),
          themeAccent2: parseAccent(p.themeAccent2 ?? "#6eb4d6"),
          themeGradient: false,
          uiSize: parseUiSize(p.uiSize),
          showHints: p.showHints !== false,
          numberFormat:
            p.numberFormat && p.numberFormat !== "auto"
              ? parseNumberFormat(p.numberFormat)
              : numberFormatForUnits(unitPreset),
          decimals: parseDecimals(p.decimals),
          units,
          unitPreset,
          measureUnit: units.length,
          locale: parseLocale(p.locale ?? current.locale),
          localeBootstrapped: true,
          familyFilter: p.familyFilter === "corner" || p.familyFilter === "stream" ? "mp" : (p.familyFilter ?? current.familyFilter),
          activeZoneId: wipeHeads ? 1 : (p.activeZoneId ?? project.zones[0]?.id ?? 1),
          past: [],
          future: [],
          tool: null,
          catalogOpen: false,
          rightOpen: false,
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

function isNamed(p: Project): boolean {
  const n = p.name.trim();
  return n.length > 0 && n !== "Без названия";
}

function upsertList(list: Project[], p: Project): Project[] {
  const item = { ...cloneProject(p), underlay: slimUnderlay(p.underlay) };
  const rest = list.filter((x) => x.id !== p.id);
  return [item, ...rest];
}

