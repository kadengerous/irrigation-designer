"use client";

import { FloatingToolbar, AdaptiveTooltip, WorkspacePanelBounds, WorkspaceTooltips } from "./floating-workspace";
import { TapeMeasureIcon } from "./tape-measure-icon";
import { SprinklerIcon } from "./sprinkler-icon";
import { MeasurementResult } from "./measurement-result";
import { CatalogSeriesInfo, CatalogThumb, CatalogReference } from "./catalog-details";
import { sliderRange } from "@/lib/slider-range";
import { headParameterRanges } from "@/lib/head-adjustment";
import { LandscapeLibrary, PlantInspector, PlantPlacementHint } from "./landscape-library";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import * as Popover from "@radix-ui/react-popover";
import {
  Trees,
  ChevronLeft,
  ChevronRight,
  Circle,
  Check,
  Copy,
  Crosshair,
  Droplets,
  FileDown,
  FileText,
  FolderOpen,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Grid3x3,
  Hexagon,
  ImageDown,
  LayoutGrid,
  Layers,
  Layers2,
  Magnet,
  Maximize2,
  MonitorPlay,
  Menu,
  Minus,
  MoreHorizontal,
  MousePointer2,
  MoveHorizontal,
  Pencil,
  Plus,
  Redo2,
  Save,
  Scissors,
  Settings,
  Spline,
  Square,
  Tag,
  Trash2,
  Triangle,
  Type,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { formatNumber, setActiveLocale, setNumberPrefs, tr } from "@/lib/i18n";
import { applyTheme } from "@/lib/theme";
import { flowLabel, fromLpm, formatAreaU, formatFlowU, formatGridStep, formatLenU, formatPressureU, fromM2, fromMeters, lenLabel, areaLabel, LENGTH_OPTS, toM2, toMetersLen } from "@/lib/units";
import { SettingsPanel } from "@/components/designer/settings-panel";
import { layoutOnDrawing, layoutOnPolygon } from "@/lib/auto-layout";
import { checkProject } from "@/lib/check-project";
import { coverageStats, exclusionPolygons, lawnPolygon } from "@/lib/coverage";
import { CATEGORIES, bodiesFor, bomLineName, catalogPhoto, defaultBodyFor, defaultNozzle, itemById, nozzleRange, placeableCatalog, stripAtPressure, workingPressureBar, type CatalogItem } from "@/lib/hunter-catalog";
import { exportDxf, exportEstimateExcel, exportEstimatePdf, exportEstimateWord, exportPdf, exportPdfFromProject, exportPng, exportPngFromProject, exportProjectJson, exportSvg } from "@/lib/export-plan";
import { downloadProjectFile, fileStem, parseProjectFile, toProjectFile } from "@/lib/project-file";
import { catalogHeadDefaults, computeFlow, pressureRange, headFlow, runTimeMin, totalAreaPrecip } from "@/lib/flow";
import { closedPathSideStarts, dist, fmt1, fmtM, headingDeg, parseMeasureUnit, pointInPoly, polygonArea, toMeters, uid, type Pt } from "@/lib/geometry";
import { parseCadInput } from "@/lib/cad/parse";
import { arcLength, catmullRom, faceArea, faceCentroid, faceEdges, faceLayerNumber, facePerimeter, facePoints, headInsideFace, isDrawnCurveFace, isInternalEdge, isTriangleFace, rectMetaMatchesFace, rectWorldCorners, setFaceSideLength, triangleMetrics, mergeLayers, layerFaceIds, layerRepresentatives, layerArea, layerBounds } from "@/lib/cad/engine";
import { segmentFigures, createSegmentFigure } from "@/lib/cad/segment-figures";
import { fusionCandidates, fuseFigures } from "@/lib/cad/fuse-figures";
import { CAD_LAYERS, REGION_FILL, layerForType } from "@/lib/cad/types";
import { DEFAULT_ZONE_LPM, defaultMaxZoneLpm, recommendPump, zoneFlow, zonePressure } from "@/lib/hydro";
import { HeadSelectionActions } from "./head-selection-actions";
import { type Head, type Project, zoneColor } from "@/lib/project-types";
import { isNamed, useProject, drawingForEditing as drawingOrMigrate } from "@/lib/project-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CanvasHost } from "@/components/designer/canvas-host";
import { MobilePreview } from "@/components/designer/mobile-preview";
import { MobileGridButton } from "@/components/designer/mobile-grid-button";
import { changeMaterialOrientation, layerTitle, LayerColorPicker, MobileLayers, MobileSheet, selectedObjectKey, usePhoneWorkspace, useWorkspaceViewport, type MobilePanel } from "@/components/designer/mobile-workspace";

const MEASURE_SUBS: { id: "measure" | "guide"; key: string }[] = [
  { id: "measure", key: "measure" },
  { id: "guide", key: "guide" },
];

function IconDim() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 dimension-tool-icon" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v11M21 3v11M4 8h16M7 5 4 8l3 3M17 5l3 3-3 3" />
      <rect x="2" y="17" width="20" height="4" rx=".6" />
      <path d="M6 17v1.5M9 17v1.5M12 17v2.5M15 17v1.5M18 17v1.5" />
    </svg>
  );
}
function VisibilitySlash() {
  return <svg className="visibility-slash" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none" aria-hidden="true"><path d="M13 87 87 13" stroke="currentColor" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinecap="round" /></svg>;
}
function IconArc() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M4 18a10 10 0 0 1 16-9" />
    </svg>
  );
}
function IconCurve() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M3 18C5 18 6 5 12 6S17 18 21 10" />
      <circle cx="3" cy="18" r="2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="6" r="2" fill="currentColor" stroke="none" />
      <circle cx="21" cy="10" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconPointShape() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 17 8 7l7-2 5 8" />
      <path d="M20 13 4 17" strokeDasharray="2.5 2.5" />
      <circle cx="4" cy="17" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="8" cy="7" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="20" cy="13" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

const DRAW_SUBS: { id: import("@/lib/project-types").DrawSub; key: string; icon: ReactNode }[] = [
  { id: "line", key: "drawLine", icon: <Minus className="size-5" strokeWidth={1.4} /> },
  { id: "polygon", key: "drawPointShape", icon: <IconPointShape /> },
  { id: "spline", key: "drawSpline", icon: <IconCurve /> },
  { id: "rect", key: "drawRect", icon: <Square className="size-5" strokeWidth={1.4} /> },
  { id: "circle", key: "drawCircle", icon: <Circle className="size-5" strokeWidth={1.4} /> },
  { id: "triangle", key: "drawTriangle", icon: <Triangle className="size-5" strokeWidth={1.4} /> },
  { id: "hexagon", key: "drawHexagon", icon: <Hexagon className="size-5" strokeWidth={1.4} /> },
  { id: "ellipse", key: "drawEllipse", icon: <Circle className="size-5 scale-x-125" strokeWidth={1.4} /> },
  { id: "arc", key: "drawArc", icon: <IconArc /> },
  { id: "freehand", key: "drawFreehand", icon: <Pencil className="size-5" strokeWidth={1.4} /> },
  { id: "dim", key: "drawDim", icon: <IconDim /> },
  { id: "text", key: "drawText", icon: <Type className="size-5" strokeWidth={1.4} /> },
];

const DRAW_PRIMARY = DRAW_SUBS.filter(item => !["text", "arc", "dim"].includes(item.id));
const MOBILE_EXTRA_DRAW: { id: import("@/lib/project-types").DrawSub; key: string }[] = [
  { id: "polyline", key: "drawPolyline" }, { id: "rotrect", key: "drawRotRect" },
  { id: "offset", key: "drawOffset" }, { id: "fillet", key: "drawFillet" },
  { id: "chamfer", key: "drawChamfer" }, { id: "fill", key: "drawFill" },
  { id: "trim", key: "drawTrim" }, { id: "extend", key: "drawExtend" },
  { id: "copy", key: "drawCopy" }, { id: "array", key: "drawArray" },
  { id: "polar", key: "drawPolar" }, { id: "hole", key: "drawHole" },
  { id: "match", key: "drawMatch" }, { id: "path", key: "drawPath" },
];

const DRAW_KINDS: { id: import("@/lib/cad/types").RegionType; key: string }[] = [
  { id: "lawn", key: "lawn" },
  { id: "bed", key: "bed" },
  { id: "path", key: "pathKind" },
  { id: "hardscape", key: "hardscape" },
  { id: "building", key: "kindBuilding" },
  { id: "pool", key: "kindPool" },
  { id: "water", key: "kindWater" },
  { id: "no_irrigation", key: "kindNoIrr" },
  { id: "site", key: "kindSite" },
  { id: "shrub", key: "kindShrub" },
  { id: "groundcover", key: "kindGround" },
  { id: "terrace", key: "kindTerrace" },
  { id: "parking", key: "kindParking" },
  { id: "gravel", key: "kindGravel" },
  { id: "mulch", key: "kindMulch" },
  { id: "other", key: "kindOther" },
];

const GRID_STEPS = [
  { id: 0.1, label: "0,10 м" },
  { id: 0.25, label: "0,25 м" },
  { id: 0.5, label: "0,50 м" },
  { id: 1, label: "1,00 м" },
  { id: 2, label: "2,00 м" },
  { id: 5, label: "5,00 м" },
] as const;

function useT() {
  const locale = useProject((s) => s.locale);
  return (key: string, vars?: Record<string, string | number>) => tr(locale, key, vars);
}

export function DesignerApp() {
  const isPhone = usePhoneWorkspace();
  useWorkspaceViewport();
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [workspaceMultiSelect, setWorkspaceMultiSelect] = useState(false);
  const [projectPreview, setProjectPreview] = useState(false);
  const [mobileLayersVisible, setMobileLayersVisible] = useState(false);
  const [layerManagerOpen, setLayerManagerOpen] = useState(false);
  useEffect(() => useProject.subscribe((state, previous) => {
    // Selection actions create a new selection array even when the same face is tapped.
    // Geometry/viewport updates must not undo a manual visibility toggle.
    if (state.selectedPolyIds !== previous.selectedPolyIds || state.selectedEdgeId !== previous.selectedEdgeId || state.cadEditId !== previous.cadEditId) {
      setMobileLayersVisible(Boolean(state.selectedPolyId || state.selectedEdgeId || state.cadEditId));
    }
  }), []);
  const [mobileWorkspaceMode, setMobileWorkspaceMode] = useState<"drawing" | "irrigation">("drawing");
  const mobileInspectTarget = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const exportFn = useRef<(() => string | null) | null>(null);
  const [scalePair, setScalePair] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const [scaleValue, setScaleValue] = useState("5.00");
  const [measurementResult, setMeasurementResult] = useState<number | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [cadTick, setCadTick] = useState(0);
  useEffect(() => {
    hoverRef.current = hover;
  }, [hover]);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [exportDrawOpen, setExportDrawOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const projectMenuAnchor = useRef<HTMLButtonElement>(null);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [customGridOpen, setCustomGridOpen] = useState(false);
  const [customGridDraft, setCustomGridDraft] = useState("");
  const [nameAsk, setNameAsk] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [dismissedFusion, setDismissedFusion] = useState("");
  const [deleteAsk, setDeleteAsk] = useState<{ id: string; name: string } | null>(null);
  const [catalogGhost, setCatalogGhost] = useState<{ id: string; x: number; y: number } | null>(null);
  const [libInfo, setLibInfo] = useState<string | null>(null);
  const catalogClickSuppressedUntil = useRef(0);
  const [catInfo, setCatInfo] = useState<(typeof CATEGORIES)[number]["id"] | null>(null);
  const catalogDrag = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    dragging: boolean;
    hold: boolean;
  } | null>(null);
  const catalogListRef = useRef<HTMLUListElement>(null);

  const project = useProject((s) => s.project);
  const tool = useProject((s) => s.tool);
  const drawSub = useProject((s) => s.drawSub);
  const polyKind = useProject((s) => s.regionType);
  const selectedEdgeId = useProject((s) => s.selectedEdgeId);
  const cadBuf = useRef("");
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const measureSub = useProject((s) => s.measureSub);
  const placeId = useProject((s) => s.placeId);
  const selectedId = useProject((s) => s.selectedId);
  const selectedPolyId = useProject((s) => s.selectedPolyId);
  const selectedPolyIds = useProject((s) => s.selectedPolyIds);
  useEffect(() => { setBulkDeleteConfirm(false); }, [selectedPolyIds]);
  const cadEditId = useProject((s) => s.cadEditId);
  const cadLiveRot = useProject((s) => s.cadLiveRot);
  const selectedIds = useProject((s) => s.selectedIds);
  const familyFilter = useProject((s) => s.familyFilter);
  const showGrid = useProject((s) => s.showGrid);
  const textHidden = useProject((s) => s.textHidden);
  const dimensionsHidden = useProject(s=>s.project.drawing?.layers?.dims?.visible===false);
  const showCoverage = useProject((s) => s.showCoverage);
  const showLabels = useProject((s) => s.showLabels);
  const catalogOpen = useProject((s) => s.catalogOpen);
  const landscapeOpen = useProject(s => s.landscapeOpen);
  const catalogVisible = useProject((s) => s.catalogVisible);
  const rightOpen = useProject((s) => s.rightOpen);
  const rightMode = useProject((s) => s.rightMode);
  const projectFormOpen = useProject((s) => s.projectFormOpen);
  const measureUnit = useProject((s) => s.measureUnit);
  const locale = useProject((s) => s.locale);
  const themeId = useProject((s) => s.themeId);
  const buttonStyle = useProject((s) => s.buttonStyle);
  const accent = useProject((s) => s.accent);
  const themeAccent = useProject((s) => s.themeAccent);
  const themeAccent2 = useProject((s) => s.themeAccent2);
  const themeGradient = useProject((s) => s.themeGradient);
  const uiSize = useProject((s) => s.uiSize);
  const showHints = useProject((s) => s.showHints);
  const numberFormat = useProject((s) => s.numberFormat);
  const decimals = useProject((s) => s.decimals);
  const units = useProject((s) => s.units);
  const t = useT();
  useEffect(() => {
    setActiveLocale(locale);
    setNumberPrefs(numberFormat, decimals);
    document.documentElement.lang = locale;
  }, [locale, numberFormat, decimals]);
  useEffect(() => {
    applyTheme(themeId, buttonStyle, accent, themeAccent, themeGradient, themeAccent2);
    document.documentElement.dataset.uiSize = uiSize;
  }, [themeId, buttonStyle, accent, themeAccent, themeAccent2, themeGradient, uiSize]);
  useEffect(() => { setLibInfo(null); setCatInfo(null); }, [selectedId, selectedIds]);
  const activeZoneId = useProject((s) => s.activeZoneId);
  const past = useProject((s) => s.past);
  const [drawMoreOpen, setDrawMoreOpen] = useState(false);
  const [kindsOpen, setKindsOpen] = useState(false);
  const future = useProject((s) => s.future);
  const snapOn = useProject((s) => s.snapOn);
  const arrayCount = useProject((s) => s.arrayCount);
  const mergePrompt = useProject((s) => s.mergePrompt);
  const snapGridOn = useProject((s) => s.snapGridOn);
  const gridStep = useProject((s) => s.gridStep);
  const cleanKey = `${project.id}:${project.updatedAt}:${project.name}`;
  const [cleanSig, setCleanSig] = useState(cleanKey);
  const dirty = project.name === "Без названия" || cleanKey !== cleanSig;
  useEffect(() => {
    setCleanSig(`${project.id}:${project.updatedAt}:${project.name}`);
  }, [project.id]);
  const draft = useProject((s) => s.draft);
  useEffect(() => { setMeasurementResult(null); }, [tool, measureSub, project.id]);
  useEffect(() => { if (draft.measureA) setMeasurementResult(null); }, [draft.measureA]);
  const pointHistoryActive = tool === "draw" && (drawSub === "polygon" || drawSub === "spline");
  useEffect(() => {
    if (!isPhone) return;
    const selectionKey = selectedObjectKey({ selectedPolyId, selectedId, selectedEdgeId, cadEditId });
    if (mobileInspectTarget.current !== selectionKey) mobileInspectTarget.current = null;
    const editing = (cadEditId && !selectedId) || (selectionKey && mobileInspectTarget.current === selectionKey);
    const constructing = (tool === "draw" && drawSub !== "none") || tool === "measure" || tool === "scale";
    if (selectedId || tool === "place") setMobileWorkspaceMode("irrigation");
    else if (selectedPolyId || selectedEdgeId || constructing) setMobileWorkspaceMode("drawing");
    setMobilePanel((current) => {
      // The drawing palette is persistent and is closed only by its dock button.
      if (current === "tools") return current;
      // Only interface state changes here; selecting never enters geometry editing.
      if (editing || constructing || selectedId || (selectedPolyId && drawingOrMigrate(useProject.getState().project).faces[selectedPolyId]?.segment)) return "properties";
      return current === "properties" ? null : current;
    });
  }, [isPhone, cadEditId, selectedPolyId, selectedId, selectedEdgeId, tool, drawSub]);
  const library = useProject((s) => s.projects);
  const lastSeg =
    draft.points.length >= 2
      ? Math.hypot(
          draft.points[draft.points.length - 1]!.x - draft.points[draft.points.length - 2]!.x,
          draft.points[draft.points.length - 1]!.y - draft.points[draft.points.length - 2]!.y,
        )
      : 0;

  const selected = project.heads.find((h) => h.id === selectedId) ?? null;
  const selectedItem = selected ? itemById(selected.catalogId) : null;
  const activeZone = project.zones.find((z) => z.id === activeZoneId) ?? project.zones[0] ?? null;
  const lawnPts = lawnPolygon(project.polygons);
  const holes = exclusionPolygons(project.polygons);
  const area = lawnPts ? Math.max(0, polygonArea(lawnPts) - holes.reduce((s, h) => s + polygonArea(h), 0)) : 0;
  const cover = useMemo(() => {
    const lawn = lawnPolygon(project.polygons);
    if (!lawn) return null;
    return coverageStats(lawn, project.heads, project.heads.length > 36 ? 1.2 : 0.55, exclusionPolygons(project.polygons));
  }, [project.polygons, project.heads]);

  const zoneFlows = useMemo(() => new Map(project.zones.map(z => [z.id, zoneFlow(project.heads, z.id)])), [project.heads, project.zones]);

  const issues = useMemo(() => checkProject(project), [project]);

  const bom = useMemo(() => {
    const map = new Map<string, { name: string; n: number }>();
    for (const h of project.heads) {
      const item = itemById(h.catalogId);
      if (!item) continue;
      const cur = map.get(item.id) ?? { name: item.name, n: 0 };
      cur.n += 1;
      map.set(item.id, cur);
      const bodyId = h.bodyId ?? item.body;
      const body = itemById(bodyId);
      const key = `body:${bodyId}`;
      const b = map.get(key) ?? { name: body?.name ?? bodyId, n: 0 };
      b.n += 1;
      map.set(key, b);
    }
    return [...map.values()];
  }, [project.heads]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useProject.getState().redo();
        else useProject.getState().undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        useProject.getState().redo();
        return;
      }
      if (e.code === "Space" && !typing) {
        e.preventDefault();
        useProject.getState().setSpaceDown(true);
      }
      const st0 = useProject.getState();
      if (e.key === "Escape" && st0.pendingCatalogPlant) { useProject.setState({pendingCatalogPlant:null}); return; }
      if (!typing && st0.tool === "draw") {
        if (/^[0-9.,x×;mсм]$/i.test(e.key) || e.key === "Backspace" && cadBuf.current) {
          if (e.key === "Backspace") cadBuf.current = cadBuf.current.slice(0, -1);
          else cadBuf.current += e.key;
          setCadTick((n) => n + 1);
          e.preventDefault();
          return;
        }
      }
      if ((e.key === "d" || e.key === "D") && (e.metaKey || e.ctrlKey) && !typing) {
        e.preventDefault();
        useProject.getState().duplicateSelected();
        return;
      }
      if (!typing && !e.metaKey && !e.ctrlKey) {
        if (e.key === "l" || e.key === "L") {
          e.preventDefault();
          useProject.getState().setDrawSub("line");
          return;
        }
        if (e.key === "r" || e.key === "R") {
          e.preventDefault();
          useProject.getState().setDrawSub("rect");
          return;
        }
        if (e.key === "c" || e.key === "C") {
          e.preventDefault();
          useProject.getState().setDrawSub("circle");
          return;
        }
        if (e.key === "a" || e.key === "A") {
          e.preventDefault();
          useProject.getState().setDrawSub("arc");
          return;
        }
        if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          useProject.getState().setCadMode("move_object");
          return;
        }
        if (e.key === "Shift") {
          if (e.repeat) return;
          useProject.getState().setInferenceLock("horiz");
          return;
        }
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          useProject.getState().setInferenceLock("horiz");
          return;
        }
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          useProject.getState().setInferenceLock("vert");
          return;
        }
        if (e.key === "o" || e.key === "O") {
          e.preventDefault();
          useProject.getState().setDrawSub("offset");
          return;
        }
        if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          useProject.getState().setDrawSub("offset");
          return;
        }
        if (e.key === "e" || e.key === "E") {
          e.preventDefault();
          const st = useProject.getState();
          if (st.selectedEdgeId) st.removeBoundary(st.selectedEdgeId);
          else st.deleteSelected();
          return;
        }
        if (e.key === "h" || e.key === "H") {
          e.preventDefault();
          useProject.getState().setDrawSub("hole");
          return;
        }
        if (e.key === "x" || e.key === "X") {
          e.preventDefault();
          useProject.getState().setDrawSub("extend");
          return;
        }
        if (e.key === "t" || e.key === "T") {
          e.preventDefault();
          useProject.getState().setTool("measure");
          return;
        }
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !typing) {
        e.preventDefault();
        const st = useProject.getState();
        if (st.tool === "draw" && st.draft.points.length) {
          st.popDraftPoint();
          return;
        }
        st.deleteSelected();
      }
      if (e.key === "Escape") {
        if (cadBuf.current) {
          cadBuf.current = "";
          setCadTick((n) => n + 1);
          return;
        }
        const st = useProject.getState();
        if (st.draft.points.length || st.draft.scaleA || st.draft.measureA) {
          st.cancelDraft();
          return;
        }
        st.selectHead(null);
        st.setTool(null);
        setFileMenuOpen(false);
        setExportDrawOpen(false);
        setGridOpen(false);
        useProject.getState().setInferenceLock(null);
        useProject.getState().setProjectFormOpen(false);
      }
      if (e.key === "Enter" && useProject.getState().tool === "draw") {
        const st = useProject.getState();
        if (cadBuf.current) {
          const parsed = parseCadInput(cadBuf.current, st.locale === "ru");
          cadBuf.current = "";
          setCadTick((n) => n + 1);
          const h = hoverRef.current;
          if (parsed.ok && parsed.kind === "length") st.applyCadLength(parsed.meters, h);
          else if (parsed.ok && parsed.kind === "size") st.applyCadSize(parsed.width, parsed.height, h);
          else if (parsed.ok && parsed.kind === "area") st.applyCadArea(parsed.meters2, h);
          else if (parsed.ok && parsed.kind === "angle") st.rotateSelectedFace(parsed.deg);
          return;
        }
        if (st.drawSub === "line") return;
        if (st.drawSub === "polygon") st.closePolygon();
        else st.finishOpenDraw();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        useProject.getState().setSpaceDown(false);
        const st = useProject.getState();
        if (!st.draft.points.length) st.setCadMode("select");
      }
      if (e.key === "Shift") useProject.getState().setInferenceLock(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const save = () => useProject.getState().saveCurrentToLibrary();
    const tick = window.setInterval(save, 12000);
    const onHide = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", save);
    window.addEventListener("beforeunload", save);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", save);
      window.removeEventListener("beforeunload", save);
    };
  }, []);

  useEffect(() => {
    const fit = () => useProject.getState().requestFit();
    if (useProject.persist.hasHydrated()) {
      fit();
      return;
    }
    return useProject.persist.onFinishHydration(fit);
  }, []);

  const catalog = placeableCatalog().filter((c) => familyFilter === "all" || c.family === familyFilter);

  const onUploadFile = (file: File) => {
    const lower = file.name.toLowerCase();
    const mime = file.type;
    const isPdf = mime === "application/pdf" || lower.endsWith(".pdf");
    const isImage =
      mime.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|heic|heif|bmp)$/i.test(lower);
    if (lower.endsWith(".dxf")) {
      void file.text().then((txt) => {
        useProject.getState().importDxf(txt);
        toast(t("toastDxfIn"));
        useProject.getState().requestFit();
      });
      return;
    }
    if (isPdf) {
      toast(t("toastPdf"));
      void (async () => {
        try {
          const { renderPdfFirstPage } = await import("@/lib/pdf-underlay");
          const page = await renderPdfFirstPage(file);
          applyRaster(page.src, file.name, page.width, page.height);
        } catch {
          toast(t("toastPdfFail"));
        }
      })();
      return;
    }
    if (isImage) {
      const reader = new FileReader();
      reader.onload = () => {
        const src = String(reader.result);
        const im = new window.Image();
        im.onload = () => applyRaster(src, file.name, im.width, im.height);
        im.onerror = () => toast(t("toastImgFail"));
        im.src = src;
      };
      reader.readAsDataURL(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      try {
        const packed = parseProjectFile(text);
        useProject.getState().importPacked(packed.project, {
          showCoverage: packed.showCoverage,
          showLabels: packed.showLabels,
          showGrid: packed.showGrid,
          snapOn: packed.snapOn,
          snapGridOn: packed.snapGridOn,
          gridStep: packed.gridStep,
          measureUnit: parseMeasureUnit(packed.measureUnit),
          activeZoneId: packed.activeZoneId,
        });
        const p = useProject.getState().project;
        setCleanSig(`${p.id}:${p.updatedAt}:${p.name}`);
        toast(t("toastOpen"));
      } catch (err) {
        toast(err instanceof Error ? err.message : t("toastOpenFail"));
      }
    };
    reader.readAsText(file);
  };

  const applyRaster = (src: string, name: string, w: number, h: number) => {
    const width = 20;
    const height = (h / Math.max(1, w)) * width;
    useProject.getState().setUnderlay({
      src,
      x: 0,
      y: 0,
      width,
      height,
      opacity: 0.45,
      rotation: 0,
      visible: true,
      locked: true,
      name,
    });
    toast(t("toastOnCanvas"));
    useProject.getState().setTool("scale");
    useProject.getState().setRightMode("drawing");
  };

  const packedNow = (name = project.name) =>
    toProjectFile({
      project: { ...project, name },
      showCoverage,
      showLabels,
      showGrid,
      snapOn,
      snapGridOn,
      gridStep,
      measureUnit,
      activeZoneId,
    });

  const saveProjectAsFile = async (name = project.name) => {
    const n = name.trim();
    if (!n || n === "Без названия") {
      setNameDraft(n);
      setNameAsk(true);
      return;
    }
    if (n !== project.name) useProject.getState().patchProject({ name: n });
    await downloadProjectFile(packedNow(n));
    setCleanSig(`${useProject.getState().project.id}:${useProject.getState().project.updatedAt}:${n}`);
    toast(t("toastSaved"));
  };

  const runExport = async (kind: "pdf" | "png" | "project") => {
    const name = fileStem(project.name);
    try {
      if (kind === "project") {
        await saveProjectAsFile(project.name);
        return;
      }
      const uri = exportFn.current?.();
      if (!uri) {
        toast(t("toastCanvas"));
        return;
      }
      if (kind === "png") {
        await exportPng(uri, name);
        toast(t("toastPng"));
        return;
      }
      await exportPdf(uri, project, name);
      toast(t("toastPdfOut"));
    } catch {
      toast(t("toastExportFail"));
    }
  };

  const exportLibrary = async (p: Project, kind: "pdf" | "dxf" | "png" | "svg" | "json") => {
    const name = fileStem(p.name);
    try {
      if (kind === "pdf") {
        const snap = p.id === project.id ? exportFn.current?.() ?? undefined : undefined;
        await exportPdfFromProject(p, name, snap);
        toast(t("toastPdfOut"));
        return;
      }
      if (kind === "dxf") {
        await exportDxf(p, name);
        toast(t("toastDxf"));
        return;
      }
      if (kind === "png") {
        const snap = p.id === project.id ? exportFn.current?.() : undefined;
        if (snap) await exportPng(snap, name);
        else await exportPngFromProject(p, name);
        toast(t("toastPng"));
        return;
      }
      if (kind === "svg") {
        await exportSvg(p, name);
        toast("SVG");
        return;
      }
      await exportProjectJson(p, name);
      toast(t("toastSaved"));
    } catch {
      toast(t("toastExportFail"));
    }
  };

  const autoPlace = () => {
    const d = drawingOrMigrate(project);
    const fromCad = layoutOnDrawing(d);
    if (fromCad.length) {
      useProject.getState().setHeads(fromCad);
      useProject.getState().autoZone(defaultMaxZoneLpm(project.water.availableLpm));
      toast(t("toastAuto"));
      return;
    }
    if (!lawnPts) {
      toast(t("toastNeedLawn"));
      return;
    }
    const placed = layoutOnPolygon(lawnPts).filter((h) => !holes.some((poly) => pointInPoly(h, poly)));
    useProject.getState().setHeads(placed);
    useProject.getState().autoZone(defaultMaxZoneLpm(project.water.availableLpm));
    toast(t("toastAuto"));
  };

  const dropCatalogAt = (clientX: number, clientY: number, catalogId: string) => {
    const el = document.querySelector("[data-design-canvas]");
    if (!(el instanceof HTMLElement)) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
    const target = document.elementFromPoint(clientX, clientY);
    if (!target || !el.contains(target) || target.closest("button,input,aside,[role=dialog],[data-mobile-sheet],.info-panel,.library-panel,.floating-toolbar,.workspace-tool-strip")) return;
    const x = clientX, y = clientY;
    const st = useProject.getState();
    st.setPlaceId(catalogId);
    st.placeHead(
      {
        x: (x - rect.left - st.panX) / st.pxPerMeter,
        y: (y - rect.top - st.panY) / st.pxPerMeter,
      },
      catalogId,
    );
  };

  const startCatalogDrag = (e: ReactPointerEvent<HTMLButtonElement>, catalogId: string) => {
    if (e.button !== 0) return;
    const pointerId = e.pointerId;
    useProject.getState().setTool("place");
    useProject.getState().setPlaceId(catalogId);
    useProject.getState().setRightMode("irrigation");
    useProject.getState().setRightOpen(true);
    setLibInfo(catalogId);
    setCatInfo(null);
    catalogDrag.current = {
      id: catalogId,
      pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      dragging: false,
      hold: false,
    };

    const trackFrom = (clientX: number, clientY: number) => {
      const d = catalogDrag.current;
      if (!d) return;
      if (clientX !== 0 || clientY !== 0) {
        d.lastX = clientX;
        d.lastY = clientY;
      }
      if (d.hold) setCatalogGhost({ id: d.id, x: d.lastX, y: d.lastY });
    };

    const holdTimer = window.setTimeout(() => {
      const d = catalogDrag.current;
      if (!d || d.pointerId !== pointerId) return;
      d.hold = true;
      d.dragging = true;
      try {
        navigator.vibrate?.(15);
      } catch {
        /* ignore */
      }
      setLibInfo(null);
      if (isPhone) setMobilePanel(null);
      setCatalogGhost({ id: d.id, x: d.lastX, y: d.lastY });
    }, 380);

    const onMove = (ev: PointerEvent) => {
      const d = catalogDrag.current;
      if (!d || d.pointerId !== ev.pointerId) return;
      trackFrom(ev.clientX, ev.clientY);
      if (!d.hold) {
        if (Math.hypot(d.lastX - d.startX, d.lastY - d.startY) <= 8) return;
        window.clearTimeout(holdTimer);
        if (e.pointerType === "touch") {
          // A finger may scroll the library; a deliberate hold starts the drag.
          catalogDrag.current = null;
          return;
        }
        d.hold = true;
        d.dragging = true;
        setLibInfo(null);
        setCatalogGhost({ id: d.id, x: d.lastX, y: d.lastY });
      }
      ev.preventDefault();
    };

    const onTouchMove = (ev: TouchEvent) => {
      const d = catalogDrag.current;
      if (!d?.hold) return;
      const t = ev.touches[0] ?? ev.changedTouches[0];
      if (!t) return;
      ev.preventDefault();
      trackFrom(t.clientX, t.clientY);
    };

    let finished = false;
    const finish = (clientX?: number, clientY?: number, cancelled = false) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(holdTimer);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onCancel, true);
      window.removeEventListener("touchmove", onTouchMove, true);
      window.removeEventListener("touchend", onTouchEnd, true);
      window.removeEventListener("touchcancel", onTouchCancel, true);
      const d = catalogDrag.current;
      catalogDrag.current = null;
      setCatalogGhost(null);
      if (!d?.hold || cancelled) return;
      catalogClickSuppressedUntil.current = Date.now() + 500;
      const x = clientX ?? d.lastX;
      const y = clientY ?? d.lastY;
      if (Math.hypot(x - d.startX, y - d.startY) < 8) return;
      setLibInfo(null);
      const canvas = document.querySelector("[data-design-canvas]")?.getBoundingClientRect();
      if (canvas && x >= canvas.left && x <= canvas.right && y >= canvas.top && y <= canvas.bottom) {
        dropCatalogAt(x, y, d.id);
        if (isPhone) useProject.getState().setCatalogVisible(false);
      }
    };

    const onUp = (ev: PointerEvent) => {
      if (catalogDrag.current && catalogDrag.current.pointerId !== ev.pointerId) return;
      finish(ev.clientX, ev.clientY);
    };
    const onCancel = (ev: PointerEvent) => {
      if (catalogDrag.current?.pointerId !== ev.pointerId) return;
      finish(undefined, undefined, true);
    };
    const onTouchCancel = () => finish(undefined, undefined, true);
    const onTouchEnd = (ev: TouchEvent) => {
      const d = catalogDrag.current;
      if (!d?.hold) {
        finish();
        return;
      }
      const t = ev.changedTouches[0];
      finish(t?.clientX, t?.clientY);
    };

    window.addEventListener("pointermove", onMove, { capture: true, passive: false });
    window.addEventListener("pointerup", onUp, { capture: true });
    window.addEventListener("pointercancel", onCancel, { capture: true });
    window.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    window.addEventListener("touchend", onTouchEnd, { capture: true });
    window.addEventListener("touchcancel", onTouchCancel, { capture: true });
  };

  const editDrawing = drawingOrMigrate(project);
  const selectedEdge = selectedEdgeId ? editDrawing.edges[selectedEdgeId] : null;
  const selectedEdgeA = selectedEdge ? editDrawing.vertices[selectedEdge.a] : null;
  const selectedEdgeB = selectedEdge ? editDrawing.vertices[selectedEdge.b] : null;
  const selectedEdgeLen =
    selectedEdgeA && selectedEdgeB
      ? Math.hypot(selectedEdgeB.x - selectedEdgeA.x, selectedEdgeB.y - selectedEdgeA.y)
      : null;
  const liveLen =
    selectedEdgeLen != null
      ? selectedEdgeLen
      : tool === "draw" && drawSub === "line" && draft.points.length >= 2
      ? lastSeg
      : tool === "draw" && draft.points.length >= 1 && hover
      ? Math.hypot(hover.x - draft.points[draft.points.length - 1]!.x, hover.y - draft.points[draft.points.length - 1]!.y)
      : lastSeg;
  const a0 = draft.points[0];
  const editFace = cadEditId ? editDrawing.faces[cadEditId] : null;
  const editPts = cadEditId ? facePoints(editDrawing, cadEditId) : [];
  const editingTriangle = cadEditId ? isTriangleFace(editDrawing, cadEditId) : false;
  const editRect = cadEditId && editFace?.rect && rectMetaMatchesFace(editDrawing, cadEditId) ? editFace.rect : null;
  const editingDrawnCurve = Boolean(
    cadEditId && isDrawnCurveFace(editDrawing, cadEditId),
  );
  const editingNodeContour = Boolean(editFace?.nodeEdit);
  const editingFreeformFace = Boolean(
    editFace &&
      !editingDrawnCurve &&
      !editingNodeContour &&
      !editFace.circle &&
      !editFace.ellipse &&
      !editRect &&
      !editingTriangle,
  );
  const editTriangle = editingTriangle ? triangleMetrics(editPts) : null;
  const liveWH =
    editTriangle
      ? { w: editTriangle.width, h: editTriangle.height }
      : editRect
      ? { w: editRect.w, h: editRect.h }
      : editFace?.ellipse
        ? { w: editFace.ellipse.rx * 2, h: editFace.ellipse.ry * 2 }
        : tool === "draw" && (drawSub === "rect" || drawSub === "ellipse" || drawSub === "triangle" || drawSub === "hexagon") && a0 && hover
            ? { w: Math.abs(hover.x - a0.x), h: Math.abs(hover.y - a0.y) }
            : null;
  const liveR = tool === "draw" && drawSub === "circle" && a0 && hover ? Math.hypot(hover.x - a0.x, hover.y - a0.y) : null;
  const liveTriangleSides = editTriangle
    ? { base: editTriangle.width, height: editTriangle.height, left: editTriangle.leftSide, right: editTriangle.rightSide }
    : drawSub === "triangle" && liveWH
      ? { base: liveWH.w, height: liveWH.h, left: Math.hypot(liveWH.w / 2, liveWH.h), right: Math.hypot(liveWH.w / 2, liveWH.h) }
      : null;
  const liveArc =
    tool === "draw" && drawSub === "arc" && draft.points.length >= 2 && hover
      ? (() => {
          const a = draft.points[0]!;
          const b = draft.points[1]!;
          const chord = Math.hypot(b.x - a.x, b.y - a.y);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const sag = Math.hypot(hover.x - mx, hover.y - my);
          const r = sag < 1e-6 ? 0 : sag / 2 + (chord * chord) / (8 * sag);
          return { r, sag };
        })()
      : null;
  const measureText = cadBuf.current
    ? cadBuf.current
    : liveWH
      ? `${formatLenU(liveWH.w, units.length)} × ${formatLenU(liveWH.h, units.length)}`
      : liveR != null
        ? `R ${formatLenU(liveR, units.length)}`
        : liveArc
          ? `R ${formatLenU(liveArc.r, units.length)}`
          : formatLenU(liveLen, units.length);

  useEffect(() => {
    if (cadEditId || (tool && !(tool === "draw" && drawSub === "none"))) setWorkspaceMultiSelect(false);
  }, [cadEditId, tool, drawSub]);

  const context = catalogOpen || tool === "measure" || tool === "scale" || tool === "draw";
  const activeQ = zoneFlows.get(activeZoneId);
  const mobileFaceId = selected ? null : cadEditId ?? selectedPolyId;
  const mobileDrawing = drawingOrMigrate(project);
  const groupedLayer = mobileFaceId && mobileDrawing.faces[mobileFaceId]?.layerId ? mobileFaceId : null;
  const mobileFace = mobileFaceId ? mobileDrawing.faces[mobileFaceId] : null;
  const contextTitle = mobileFace ? layerTitle(mobileDrawing, mobileFace.id, locale)
    : selected ? selected.catalogId : tool === "draw" ? t([...DRAW_SUBS, ...MOBILE_EXTRA_DRAW].find((s) => s.id === drawSub)?.key ?? "draw") : tool === "scale" ? t("calibrateScale") : t("measure");
  const selectedSegment = !cadEditId && selectedPolyIds.length === 1 && mobileFace?.segment && !groupedLayer ? mobileFace : null;
  const drawingDimensionsVisible = !(tool === "draw" && drawSub === "text") && Boolean(selectedSegment || cadEditId || selectedEdgeId || (tool === "draw" && drawSub !== "none"));
  const mobileFaceDimensions: { label: string; value: number; kind?: "area" }[] = [];
  if (mobileFace && !groupedLayer) {
    const curveGeometry = mobileFace.spline ?? mobileFace.freehand;
    if (!curveGeometry || curveGeometry.closed) mobileFaceDimensions.push({ label: t("area"), value: faceArea(mobileDrawing, mobileFace.id), kind: "area" });
    if (mobileFace.circle) mobileFaceDimensions.push({ label: "R", value: mobileFace.circle.r }, { label: "Ø", value: mobileFace.circle.r * 2 });
    else if (mobileFace.ellipse) mobileFaceDimensions.push({ label: t("axisA"), value: mobileFace.ellipse.rx * 2 }, { label: t("axisB"), value: mobileFace.ellipse.ry * 2 });
    else if (mobileFace.rect && rectMetaMatchesFace(mobileDrawing, mobileFace.id)) mobileFaceDimensions.push({ label: t("drawWidth"), value: mobileFace.rect.w }, { label: t("drawHeight"), value: mobileFace.rect.h });
    else {
      const curve = mobileFace.spline ?? mobileFace.freehand;
      if (curve) {
        const count = curve.closed ? curve.pts.length : Math.max(0, curve.pts.length - 1);
        for (let i = 0; i < count; i++) mobileFaceDimensions.push({ label: sideLetter(i), value: dist(curve.pts[i]!, curve.pts[(i + 1) % curve.pts.length]!) });
      } else faceEdges(mobileDrawing, mobileFace.id).forEach((edge, i) => mobileFaceDimensions.push({ label: sideLetter(i), value: arcLength(edge.a, edge.b, edge.bulge) }));
    }
  }
  const chooseMobileTool = (choose: () => void) => { choose(); };
  const mergeSelectedLayers = () => {
    const st = useProject.getState();
    const ids = st.selectedPolyIds;
    const drawing = drawingOrMigrate(st.project);
    const next = mergeLayers(drawing, ids);
    if (next === drawing) return;
    st.commitDrawing(next, ids[0], true);
    st.selectPoly(ids[0]!);
  };
  const selectedLayersCount = new Set(selectedPolyIds.filter(id => mobileDrawing.faces[id]).map(id => mobileDrawing.faces[id]!.layerId ?? id)).size;
  const bulkSelection = selectedLayersCount > 1 && !cadEditId;
  const headSelectionActions = (selectedIds.length > 1 || (workspaceMultiSelect && selectedIds.length > 0)) && <HeadSelectionActions />;
  const fusionIds = useMemo(() => draft.points.length ? [] : fusionCandidates(mobileDrawing, selectedPolyIds), [project.drawing, selectedPolyIds, draft.points.length]);
  const fusionKey = fusionIds.length ? JSON.stringify(fusionIds.map(id => [id, facePoints(mobileDrawing,id)])) : "";
  const fusionActions = fusionKey && fusionKey !== dismissedFusion && <section className="figure-fusion-actions" role="region" aria-label={t("fuseFigures")}
    onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onTouchMove={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
    <button type="button" onClick={()=>{
      const st=useProject.getState(), drawing=drawingOrMigrate(st.project);
      const next=fuseFigures(drawing,fusionIds);
      if(next===drawing) return;
      st.setCadEdit(null);
      st.commitDrawing(next,fusionIds[0],true);
      st.setCadMode("select");
      setWorkspaceMultiSelect(false);
      st.selectPoly(fusionIds[0]!);
      setDismissedFusion(fusionKey);
    }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M3 3h12v6h6v12H9v-6H3Z"/><path d="M9 9h6v6H9Z" strokeDasharray="2 2" opacity=".45"/></svg>{t("fuseFigures")}</button>
    <button type="button" className="action-cancel" aria-label={t("cancel")} title={t("cancel")} onClick={()=>setDismissedFusion(fusionKey)}><X size={18}/></button>
  </section>;
  const bulkLocked = selectedPolyIds.some(id => mobileDrawing.faces[id]?.locked);
  const bulkActions = bulkSelection && <section className="bulk-selection-actions" data-confirming={bulkDeleteConfirm} role="region" aria-label={t("selectedLayersActions")}
    onPointerDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    {bulkDeleteConfirm ? <>
      <p role="alert">{t("deleteSelectedLayersConfirm", { n: selectedLayersCount })}</p>
      <button type="button" onClick={() => setBulkDeleteConfirm(false)}>{t("cancel")}</button>
      <button type="button" className="bulk-delete" onClick={() => { useProject.getState().deleteSelected(); setBulkDeleteConfirm(false); }}><Trash2 size={18}/>{t("delete")}</button>
    </> : <>
      <button type="button" className="bulk-merge" disabled={bulkLocked} aria-label={t("mergeSelectedLayers")} onClick={mergeSelectedLayers}><Layers2 size={20}/>{t("mergeSelectedLayers")}</button>
      <button type="button" className="bulk-delete" disabled={bulkLocked} aria-label={t("deleteSelectedLayers")} title={t("deleteSelectedLayers")} onClick={() => setBulkDeleteConfirm(true)}><Trash2 size={20}/></button>
    </>}
  </section>;
  const selectionModeAvailable = !cadEditId && !selectedEdgeId && (!tool || (tool === "draw" && drawSub === "none"));
  const activateSelection = (multiple: boolean) => {
    const st = useProject.getState();
    st.setCadEdit(null);
    st.setCadMode("select");
    if (st.selectedEdgeId) st.selectEdge(null);
    else if (!multiple && st.selectedPolyId) useProject.getState().selectPoly(st.selectedPolyId);
    setWorkspaceMultiSelect(multiple);
  };
  const previousConstruction = useRef({ tool, drawSub, project });
  useEffect(() => {
    const previous = previousConstruction.current;
    previousConstruction.current = { tool, drawSub, project };
    if (!isPhone && previous.tool === "draw" && previous.drawSub !== "none" &&
        tool === "draw" && drawSub === "none" && previous.project !== project && cadEditId) {
      useProject.getState().setCadEdit(null);
    }
  }, [isPhone, tool, drawSub, project, cadEditId]);
  const cursorControl = <button type="button" className="mobile-icon-button" aria-label={t("selectionCursor")} title={t("selectionCursor")}
    aria-pressed={!cadEditId && !workspaceMultiSelect && (!tool || (tool === "draw" && drawSub === "none"))}
    onClick={() => activateSelection(false)}><MousePointer2 /></button>;
  const selectionControls = <>
          <button type="button" className="mobile-icon-button select-multiple-control" aria-label={t("selectMultiple")} title={t("selectMultiple")} aria-pressed={selectionModeAvailable && workspaceMultiSelect} onClick={() => activateSelection(!(selectionModeAvailable && workspaceMultiSelect))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3H4a1 1 0 0 0-1 1v4m9-5h4m4 0a1 1 0 0 1 1 1v4M3 12v4m0 4a1 1 0 0 0 1 1h4" strokeWidth="1"/><path d="m10 9 3 12 3-4 5-1Z" fill="var(--color-surface)"/></svg>
          </button>
  </>;
  const viewControls = <>
          <button type="button" className="mobile-icon-button" aria-label={t("centerView")} title={t("centerView")} onClick={() => {
            const bounds = document.querySelector("[data-design-canvas]")?.getBoundingClientRect();
            if (bounds) useProject.getState().setPan(bounds.width / 2, bounds.height / 2);
          }}><Crosshair size={22} /></button>
  </>;
  const previewControl = <button type="button" className="mobile-icon-button workspace-header-action" aria-label={t("preview")} title={t("preview")} onClick={() => { setGridOpen(false); setFileMenuOpen(false); setProjectPreview(true); }}><MonitorPlay />{!isPhone && <span>{t("preview")}</span>}</button>;
  const textVisibilityControl = <button type="button" className="mobile-icon-button visibility-toggle text-visibility-toggle" aria-label={t(textHidden ? "showTextNotes" : "hideTextNotes")} title={t(textHidden ? "showTextNotes" : "hideTextNotes")} aria-pressed={textHidden} onClick={() => useProject.setState({textHidden: !textHidden})}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 7V4h14v3M12 4v16M8 20h8" /></svg>
    <VisibilitySlash />
  </button>;
  const textControl = <button type="button" className="mobile-icon-button" aria-label={t("drawText")} title={t("drawText")} aria-pressed={tool === "draw" && drawSub === "text"} onClick={()=>useProject.getState().setDrawSub("text")}><Type /></button>;
  const dimensionVisibilityControl = <AdaptiveTooltip label={t(dimensionsHidden ? "showDimensions":"hideDimensions")}>
    <button type="button" className="mobile-icon-button visibility-toggle dimension-visibility-toggle" aria-label={t(dimensionsHidden ? "showDimensions":"hideDimensions")}
      aria-pressed={dimensionsHidden} onClick={()=>useProject.getState().setCadLayer("dims",{visible:dimensionsHidden})}><IconDim/><VisibilitySlash/></button>
  </AdaptiveTooltip>;
  const contextControls = tool === "draw" && drawSub === "text" ? null : <div className={isPhone ? "mobile-context-content" : "contents"}>
          {tool === "draw" && drawSub === "polygon" && <PolygonDraftDimensions hover={hover}/>}
          {selectedSegment?.spline && <div className="selected-segment-length" style={!isPhone ? { position:"absolute", bottom:12, left:12 } : undefined} aria-label={t("segmentLength")}><strong>L</strong><output>{formatLenU(dist(selectedSegment.spline.pts[0]!, selectedSegment.spline.pts[1]!), units.length)}</output></div>}
          {!groupedLayer && cadEditId && editingFreeformFace && !draft.points.length && (
            <FreeformSidesPad faceId={cadEditId} />
          )}
          {!groupedLayer &&
            ((tool === "draw" && drawSub === "spline") ||
              (cadEditId && editingDrawnCurve && !draft.points.length)) && (
              <SplineLengthsPad
                compact={isPhone}
                faceId={cadEditId && editingDrawnCurve && !draft.points.length ? cadEditId : null}
              />
            )}
          {!selectedSegment && !groupedLayer && ((tool === "draw" && drawSub !== "none") || cadEditId || selectedEdgeId) &&
            !(tool === "draw" && drawSub === "spline") &&
            !(tool === "draw" && drawSub === "polygon") &&
            !editingFreeformFace &&
            !editingDrawnCurve &&
            !editingNodeContour && (
            <DrawMeasurePad
              compact={isPhone}
              drawSub={
                selectedEdgeId
                  ? "line"
                  : cadEditId && drawingOrMigrate(project).faces[cadEditId]?.circle
                  ? "circle"
                  : cadEditId && drawingOrMigrate(project).faces[cadEditId]?.ellipse
                    ? "ellipse"
                    : cadEditId && editingTriangle
                      ? "triangle"
                    : cadEditId && editRect
                      ? "rect"
                      : drawSub
              }
              liveLen={liveLen}
              liveWH={liveWH}
              liveTriangle={liveTriangleSides}
              liveRot={
                cadEditId && drawingOrMigrate(project).faces[cadEditId]?.ellipse
                  ? (drawingOrMigrate(project).faces[cadEditId]!.ellipse!.rot ?? 0)
                  : cadLiveRot
              }
              liveR={
                cadEditId && drawingOrMigrate(project).faces[cadEditId]?.circle
                  ? drawingOrMigrate(project).faces[cadEditId]!.circle!.r
                  : liveR
              }
              liveArc={liveArc}
              measureText={measureText}
              cadBuf={cadBuf.current}
              hasPoint={draft.points.length >= 1 || Boolean(cadEditId) || Boolean(selectedEdgeId)}
              hover={hover}
              last={draft.points[draft.points.length - 1] ?? null}
              editFaceId={cadEditId}
            />
          )}
  </div>;

  const gridControls = <>
        {isPhone ? <button
          type="button"
          className="mobile-icon-button"
          aria-label={t("magnet")}
          aria-pressed={snapOn}
          onClick={() => useProject.getState().setSnap(!useProject.getState().snapOn)}
        >
          <Magnet />
        </button> : <Button
          size="xs"
          variant={snapOn ? "pressed" : "ghost"}
          aria-label={t("magnet")}
          aria-pressed={snapOn}
          className="size-8 shrink-0 rounded-sm border border-tool p-0 sm:w-auto sm:border-transparent sm:px-2"
          onClick={() => useProject.getState().setSnap(!useProject.getState().snapOn)}
        >
          <Magnet className="size-3.5" />
          <span className="hidden sm:inline">{t("magnet")}</span>
        </Button>}
        <Popover.Root modal={!isPhone} open={gridOpen} onOpenChange={setGridOpen}>
        <div className="relative shrink-0">
          <div className="flex items-stretch gap-1 sm:gap-0 sm:overflow-hidden sm:rounded-md sm:border sm:border-tool">
            {isPhone ? <Popover.Anchor><MobileGridButton enabled={showGrid} open={gridOpen} label={t("grid")}
              onToggle={() => { useProject.getState().setGrid(!showGrid); setGridOpen(!showGrid); setCustomGridOpen(false); setMobilePanel(null); setFileMenuOpen(false); }}
              onHold={() => { setGridOpen(true); setCustomGridOpen(false); setMobilePanel(null); setFileMenuOpen(false); }} /></Popover.Anchor> : <Button
              size="xs"
              aria-label={t("grid")}
              aria-pressed={showGrid}
              variant={showGrid ? "pressed" : "ghost"}
              className="size-8 rounded-sm border border-tool p-0 sm:w-auto sm:rounded-none sm:border-0 sm:px-2"
              onClick={() => {
                useProject.getState().setGrid(!showGrid);
                setGridOpen(false);
                setFileMenuOpen(false);
              }}
            >
              <Grid3x3 />
              <span className="hidden sm:inline">{t("grid")}</span>
            </Button>}
            {!isPhone && <span className="hidden w-px self-stretch bg-tool/35 sm:block" aria-hidden />}
            {!isPhone && <Popover.Trigger asChild><Button
              size="xs"
              aria-label={`${t("gridStep")}: ${formatGridStep(gridStep, units.length)}`}
              data-grid-step-trigger
              variant={gridOpen ? "pressed" : "ghost"}
              className="shrink-0 rounded-sm border border-tool px-2 sm:rounded-none sm:border-0"
              onClick={() => {
                if (isPhone) setMobilePanel(null);
                setCustomGridOpen(false);
                setFileMenuOpen(false);
              }}
            >
              {formatGridStep(gridStep, units.length)}
              <ChevronRight className={cn("size-3 -rotate-90 transition-transform sm:hidden", gridOpen && "rotate-90")} />
            </Button></Popover.Trigger>}
          </div>
        </div>
          <Popover.Portal>
            <Popover.Content side={isPhone ? "bottom" : "top"} align="end" sideOffset={8} collisionPadding={8} sticky="always"
              data-mobile={isPhone} data-custom-open={customGridOpen} aria-label={t("gridStep")}
              className="grid-step-pop z-50 rounded-md border border-line bg-surface p-2 text-ink shadow-border"
              onOpenAutoFocus={(e) => { if (isPhone) e.preventDefault(); }}
              onCloseAutoFocus={(e) => { if (isPhone) e.preventDefault(); }}
              onInteractOutside={(e) => { if (isPhone) e.preventDefault(); }}
              onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <div className="grid-step-heading flex items-center justify-between gap-2">
                <p className="px-1 text-sm font-semibold">{t("gridStep")}</p>
                <Popover.Close asChild><button type="button" className="mobile-icon-button" aria-label="Закрыть шаг сетки"><X size={20} /></button></Popover.Close>
              </div>
              <div className="flex flex-col gap-0.5">
                {GRID_STEPS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={gridStep === g.id}
                    className={cn(
                      "grid-step-option h-8 rounded-sm px-2 text-left text-xs font-medium text-ink",
                    )}
                    onClick={() => {
                      useProject.getState().setGridStep(g.id);
                      if (!isPhone) useProject.getState().setGrid(true);
                      setCustomGridOpen(false);
                    }}
                  >
                    <span className="inline-block w-4" aria-hidden>{gridStep === g.id ? "●" : ""}</span>
                    {g.label}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={customGridOpen}
                  className={cn(
                    "grid-step-option h-8 rounded-sm px-2 text-left text-xs font-medium",
                    customGridOpen ? "bg-btn-soft text-ink" : "text-ink hover:bg-btn-soft",
                  )}
                  onClick={() => {
                    setCustomGridDraft(String(Number(fromMeters(gridStep, units.length).toFixed(3))).replace(".", ","));
                    setCustomGridOpen((open) => !open);
                  }}
                >
                  <span className="inline-block w-4" aria-hidden />
                  {t("pal_custom")}…
                </button>
                {customGridOpen && (
                  <form
                    className="mt-1 flex items-center gap-1 border-t border-line pt-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const value = Number(customGridDraft.trim().replace(",", "."));
                      const meters = toMetersLen(value, units.length);
                      if (!Number.isFinite(meters) || meters <= 0) return;
                      useProject.getState().setGridStep(meters);
                      if (!isPhone) useProject.getState().setGrid(true);
                      setCustomGridOpen(false);
                    }}
                  >
                    <label className="sr-only" htmlFor="custom-grid-step">{t("gridStep")}</label>
                    <input
                      id="custom-grid-step"
                      type="text"
                      inputMode="decimal"
                      value={customGridDraft}
                      onChange={(event) => setCustomGridDraft(event.target.value)}
                      className="h-8 min-w-0 flex-1 rounded-sm border border-line bg-bg px-2 text-xs outline-none focus:border-btn"
                      autoFocus
                    />
                    <span className="shrink-0 text-[10px] text-muted">{lenLabel(units.length)}</span>
                    <button type="submit" aria-label="Применить шаг сетки" className="h-8 rounded-sm bg-btn px-2 text-[10px] font-semibold text-btn-fg">
                      ✓
                    </button>
                  </form>
                )}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
  </>;

  const openCatalogFamily = (family: (typeof CATEGORIES)[number]["id"]) => {
    const st = useProject.getState();
    st.setFamily(family);
    st.setCatalogVisible(true);
    setLibInfo(null);
    setCatInfo(family === "all" ? null : family);
    if (family !== "all") {
      st.setRightMode("irrigation");
      st.setRightOpen(true);
      if (isPhone) setMobilePanel(null);
    }
  };

  const WorkspaceStrip = catalogOpen ? "div" : FloatingToolbar;
  const workspaceToolStrip = !isPhone && context && (
        <div className={catalogOpen ? "library-category-bar relative z-30 shrink-0" : "tablet-tool-overlay"} data-right-open={rightOpen} data-cat-bar>
        <WorkspaceStrip className="workspace-tool-strip" role="toolbar" aria-label={t(catalogOpen ? "irrigation" : "draw")}>
          {catalogOpen &&
            CATEGORIES.map((f) => (
              <Button
                key={f.id}
                size="xs"
                variant={familyFilter === f.id ? "pale-on" : "pale"}
                aria-pressed={familyFilter === f.id}
                onClick={() => openCatalogFamily(f.id)}
              >
                {t(`cat_${f.id}`)}
              </Button>
            ))}
          {showHints && tool === "scale" && <p className="px-2 text-xs text-ink-soft">{t("scaleHint")}</p>}
          {!catalogOpen && (tool === "draw" || tool === "measure") && (
            <>
              {DRAW_PRIMARY.map((s) => (
                <AdaptiveTooltip key={s.id} label={t(s.key)}><Button
                  size="icon"
                  variant={tool === "draw" && drawSub === s.id ? "pale-on" : "pale"}
                  className="size-9 text-ink [&_svg]:size-5"
                  aria-label={t(s.key)}
                  aria-pressed={tool === "draw" && drawSub === s.id}
                  onClick={() => useProject.getState().setDrawSub(s.id)}
                >
                  {s.icon}
                </Button></AdaptiveTooltip>
              ))}
            </>
          )}
        </WorkspaceStrip>
        </div>
      );

  return (
    <div className="app-shell bg-bg text-ink" data-mobile={isPhone} data-preview={projectPreview}>
      <WorkspaceTooltips />
      {!isPhone && <WorkspacePanelBounds />}
      {projectPreview && <MobilePreview onBack={() => setProjectPreview(false)} />}
      <Toaster position="bottom-center" />
      {fileMenuOpen && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => {
            setFileMenuOpen(false);
            setExportDrawOpen(false);
            setGridOpen(false);
          }}
        />
      )}
      <header className="app-header relative z-30 flex shrink-0 items-center gap-1 overflow-visible bg-tool px-1 text-tool-fg sm:px-2">
        <button id="app-focus-guard" type="button" tabIndex={-1} aria-hidden className="sr-only" />
        <div className="relative shrink-0">
          <Button
            size="icon"
            variant={fileMenuOpen ? "bar-on" : "bar"}
            ref={projectMenuAnchor}
            className="project-menu-trigger max-sm:size-10"
            aria-pressed={fileMenuOpen}
            aria-label={t("file")}
            onClick={() => {
              if (isPhone) setMobilePanel(null);
              setFileMenuOpen((v) => !v);
              setExportDrawOpen(false);
              setGridOpen(false);
            }}
          >
            <Menu />
          </Button>
          {fileMenuOpen && createPortal(
            <div className="project-menu fixed z-[150] w-64 rounded-md text-ink shadow-border" style={{
              left: Math.max(8,Math.min(projectMenuAnchor.current?.getBoundingClientRect().left ?? 8,window.innerWidth-272)),
              top:(projectMenuAnchor.current?.getBoundingClientRect().bottom ?? 56)+8,
              maxHeight:`calc(100dvh - ${(projectMenuAnchor.current?.getBoundingClientRect().bottom ?? 56)+16}px)`,overflowY:"auto",
            }}>
              <div className="px-2 py-2">
                <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">{t("currentProject")}</p>
                <p className="mt-0.5 truncate text-sm font-medium">{project.name === "Без названия" ? t("untitled") : project.name}</p>
                {dirty ? (
                  <p className="mt-0.5 text-[11px] text-warn">{t("unsaved")}</p>
                ) : (
                  <p className="mt-0.5 text-[11px] text-ok">{t("saved")}</p>
                )}
              </div>
              <div className="mx-1 my-1 h-px bg-line" />
              <MenuBtn
                onClick={() => {
                  setFileMenuOpen(false);
                  void saveProjectAsFile(project.name);
                }}
                icon={<Save className="size-3.5" />}
                label={t("saveProject")}
              />
              <MenuBtn icon={<Plus className="size-4" />} label={t("newProject")} onClick={() => { useProject.getState().saveCurrentToLibrary(); useProject.getState().newProject(); setFileMenuOpen(false); setMobilePanel(null); }} />
              <MenuBtn icon={<Pencil className="size-4" />} label={t("projectName")} onClick={() => { useProject.getState().setProjectFormOpen(true); setFileMenuOpen(false); }} />
              <MenuBtn icon={<Upload className="size-4" />} label="Загрузить проект или чертёж" onClick={() => { fileRef.current?.click(); setFileMenuOpen(false); }} />
              <MenuBtn icon={<FileDown className="size-4" />} label="PDF / PNG / SVG / JSON" onClick={() => setExportDrawOpen((v) => !v)} />
              {exportDrawOpen && <div className="grid grid-cols-2 gap-1 p-1">{(["pdf", "png", "svg", "json"] as const).map((kind) => <Button key={kind} onClick={() => { void exportLibrary(project, kind); setFileMenuOpen(false); }}>{kind.toUpperCase()}</Button>)}</div>}
              <MenuBtn
                onClick={() => {
                  setFileMenuOpen(false);
                  void exportDxf(useProject.getState().project, fileStem(useProject.getState().project.name)).then(
                    () => toast(t("toastDxf")),
                    () => toast(t("toastExportFail")),
                  );
                }}
                icon={<FileDown className="size-3.5" />}
                label={t("exportDxf")}
              />
              <MenuBtn
                onClick={() => {
                  setFileMenuOpen(false);
                  setSettingsOpen(true);
                }}
                icon={<Settings className="size-3.5" />}
                label={t("appSettings")}
              />

            </div>, document.querySelector(".app-shell") ?? document.body
          )}
        </div>
        <button type="button" className="app-brand-refresh mr-2 hidden shrink-0 pr-3 text-left md:block"
          aria-label={t("refreshApplication")} title={t("refreshApplication")} onClick={()=>{
            const url=new URL(window.location.href);
            url.searchParams.set("__refresh",String(Date.now()));
            window.location.replace(url.toString());
          }}>
          <span className="block font-display text-sm font-semibold tracking-[0.12em] leading-none">IRRIGATION DESIGNER</span>
          <span className="mt-0.5 block text-[10px] text-tool-fg/75">{t("hunterTagline")}</span>
        </button>
        <div className="scroll-touch flex min-w-0 flex-1 items-center gap-1">
        <Button size="icon" variant="bar" className="max-sm:size-10" disabled={pointHistoryActive ? !draft.points.length : !past.length} onClick={() => useProject.getState().undo()} aria-label={t("undo")}>
          <Undo2 />
        </Button>
        <Button size="icon" variant="bar" className="max-sm:size-10" disabled={pointHistoryActive ? !(draft.redoPoints?.length || draft.redoClosure) : !future.length} onClick={() => useProject.getState().redo()} aria-label={t("redo")}>
          <Redo2 />
        </Button>
        {isPhone && <>
          <button type="button" className="mobile-dock-button" data-no-tooltip aria-label="Инструменты" aria-pressed={mobilePanel === "tools"} onClick={() => { const closing = mobilePanel === "tools"; setMobilePanel(closing ? null : "tools"); if (closing) { useProject.getState().deactivateDrawing(); setWorkspaceMultiSelect(false); } setGridOpen(false); setFileMenuOpen(false); }}><Pencil size={22} /></button>
          <button type="button" className="mobile-dock-button" data-no-tooltip aria-label="Ландшафт" aria-pressed={landscapeOpen} onClick={() => { useProject.getState().setLandscapeOpen(!landscapeOpen); setMobilePanel(null); setLayerManagerOpen(false); }}><Trees size={22} /></button>
          <button type="button" className="mobile-dock-button" data-no-tooltip aria-label={t("library")} aria-pressed={mobilePanel === "library" || catalogOpen} onClick={() => { const closing = mobilePanel === "library"; if (!closing && !catalogOpen) useProject.getState().setCatalogOpen(true); setMobilePanel(closing ? null : "library"); setGridOpen(false); setFileMenuOpen(false); }}><SprinklerIcon width={22} height={22} /></button>
        </>}
        {!isPhone && <BarTool
          id="draw"
          label={t("draw")}
          active={!catalogOpen && tool === "draw"}
          onClick={() => {
            const st = useProject.getState();
            if (st.tool === "draw" && !st.catalogOpen) { st.deactivateDrawing(); setWorkspaceMultiSelect(false); } else st.setTool("draw");
          }}
        />}
        {!isPhone && <Button size="sm" data-no-tooltip variant={landscapeOpen || rightMode === "landscape" && rightOpen ? "bar-on" : "bar"} aria-pressed={landscapeOpen} onClick={() => { useProject.getState().setLandscapeOpen(!landscapeOpen); setWorkspaceMultiSelect(false); }}><Trees /><span>Ландшафт</span></Button>}
        {!isPhone && <BarTool
          id="place"
          label={t("sprinklers")}
          active={catalogOpen}
          onClick={() => {
            const st = useProject.getState();
            if (catalogOpen) {
              st.setCatalogOpen(false);
            } else {
              st.setCatalogOpen(true);
            }
          }}
        />}
        {!isPhone && catalogOpen && (
          <Button size="xs" variant="bar" className="shrink-0" onClick={autoPlace} aria-label={t("autoPlace")}>
            <LayoutGrid />
            <span className="hidden sm:inline">{t("autoPlace")}</span>
          </Button>
        )}
        </div>
        <div className="flex shrink-0 items-center gap-1 pl-1">
          {previewControl}
          <button type="button" className="mobile-icon-button workspace-header-action" aria-label={t("estimate")} aria-pressed={isPhone ? mobilePanel === "estimate" : rightOpen && rightMode === "estimate"} onClick={() => {
            if (isPhone) setMobilePanel(mobilePanel === "estimate" ? null : "estimate");
            else if (rightOpen && rightMode === "estimate") useProject.getState().setRightOpen(false);
            else useProject.getState().setRightMode("estimate");
            setGridOpen(false); setFileMenuOpen(false);
          }}><FileText />{!isPhone && <span>{t("estimate")}</span>}</button>
          <Button size="xs" variant="bar" className="max-sm:size-10 max-sm:px-0" aria-label={t("projects")} onClick={() => {
            setMobilePanel(null);
            setFileMenuOpen(false);
            useProject.getState().saveCurrentToLibrary();
            setProjectsOpen(true);
          }}>
            <FolderOpen />
            <span className="hidden sm:inline">{t("projects")}</span>
          </Button>
        </div>
      </header>

      {projectFormOpen || (!isNamed(project) && library.length === 0 && Object.keys(drawingOrMigrate(project).faces).length === 0 && project.heads.length === 0) ? (
        <ProjectFormBar />
      ) : null}
      {mergePrompt && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-ink/30 p-4">
          <div className="w-full max-w-sm rounded-lg bg-surface p-4 shadow-border">
            <p className="font-display text-lg">{t("mergeType")}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {mergePrompt.types.map((tp) => (
                <Button key={tp} size="sm" variant="pale-on" onClick={() => useProject.getState().confirmMerge(tp)}>
                  {t(DRAW_KINDS.find((k) => k.id === tp)?.key ?? "lawn")}
                </Button>
              ))}
            </div>
            <Button className="mt-3 w-full" size="sm" variant="pale" onClick={() => useProject.setState({ mergePrompt: null })}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}

      {catalogOpen && workspaceToolStrip}
      <div className="designer-workspace relative flex min-h-0 flex-1">
        {!catalogOpen && workspaceToolStrip}
        {landscapeOpen && <LandscapeLibrary mobile={isPhone} />}
        <PlantPlacementHint />

        {!isPhone && catalogOpen && catalogVisible && (
          <aside
            className={cn(
              "library-panel absolute inset-y-0 left-0 z-20 flex w-56 flex-col border-r border-line",
              catalogGhost && "opacity-50",
            )}
            data-catalog
          >
            <div className="workspace-panel-heading flex shrink-0 items-center gap-2 border-b border-line px-2 py-2">
              <Button
                size="xs"
                variant="solid"
                className="workspace-panel-hide shrink-0 border-line bg-surface text-ink hover:bg-btn-soft"
                onClick={() => useProject.getState().setCatalogVisible(false)}
              >
                <ChevronLeft className="size-3.5" />
                {t("hide")}
              </Button>
              <p className="ml-auto text-xs font-semibold text-muted">{t("library")}</p>
            </div>
            {showHints && <p className="px-1.5 pt-0.5 text-[10px] leading-snug text-muted">{t("dragHint")}</p>}
            <div className="mt-1.5 flex min-h-0 flex-1">
            <ul
              ref={catalogListRef}
              className="catalog-list min-h-0 flex-1 overflow-y-auto px-1 pb-3"
            >
              {catalog.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-pressed={placeId === c.id}
                    onPointerDown={(e) => startCatalogDrag(e, c.id)}
                    onClick={(e) => { if (e.detail === 0) { useProject.getState().setTool("place"); useProject.getState().setPlaceId(c.id); useProject.getState().setRightMode("irrigation"); useProject.getState().setRightOpen(true); setLibInfo(c.id); setCatInfo(null); } }}
                    className={cn(
                      "irrigation-catalog-card mb-1 flex w-full touch-pan-y select-none items-center gap-1 rounded-md border px-1 text-left text-xs",
                      familyFilter === "all" ? "py-1.5" : "py-1",
                      placeId === c.id ? "border-catalog bg-catalog text-catalog-fg" : "border-line bg-surface hover:bg-catalog-soft",
                    )}
                  >
                    <CatalogPic item={c} className="h-12 w-12" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium leading-tight">{c.id}</span>
                      <span className={cn("block text-[10px] leading-tight", placeId === c.id ? "text-catalog-fg/80" : "text-muted")}>
                        {c.coverageKind==="point"?"Баблер · без радиуса":c.strip?`${formatLenU(c.strip.w,units.length)} × ${formatLenU(c.strip.l,units.length)}`:`${formatLenU(c.rMin, units.length)}–${formatLenU(c.rMax, units.length)}`}
                      </span>
                      <span className={cn("block text-[10px] leading-tight", placeId === c.id ? "text-catalog-fg/80" : "text-muted")}>
                        {c.arcMin === c.arcMax ? `${c.arcMax}°` : `${c.arcMin}–${c.arcMax}°`}
                      </span>
                    </span>
                    <CatalogThumb color={c.color} arc={c.arcMax} strip={c.strip} />
                  </button>
                </li>
              ))}
            </ul>
            {catalog.length > 0 && <CatalogScroller listRef={catalogListRef} dep={`${familyFilter}:${catalog.length}`} />}
            </div>
          </aside>
        )}
        {!isPhone && catalogOpen && !catalogVisible && (
          <button
            type="button"
            className="tablet-panel-handle"
            data-side="left"
            onClick={() => useProject.getState().setCatalogVisible(true)}
            aria-label={t("library")}
          >
            <ChevronRight className="size-5" />
          </button>
        )}

        <section className="mobile-canvas-stage relative min-w-0 flex-1 overflow-visible">
          {isPhone && !catalogGhost && (fusionActions || layerManagerOpen || mobilePanel === "tools" || mobileWorkspaceMode === "irrigation" || mobileLayersVisible) && <div className="mobile-top-overlays" data-magnifier-top-panel>
            {mobilePanel === "tools" && <div className="mobile-tool-stack">
              <div className="mobile-tool-strip-panel" role="toolbar" aria-label="Инструменты">
                <div className="mobile-tool-strip scroll-touch">
                  {DRAW_SUBS.filter((item) => item.id !== "arc" && item.id !== "dim" && item.id !== "text").map((item) => <button key={item.id} type="button" aria-label={t(item.key)} title={t(item.key)} aria-pressed={tool === "draw" && drawSub === item.id} onClick={() => chooseMobileTool(() => useProject.getState().setDrawSub(item.id))}>{item.icon}</button>)}
                  {project.heads.length > 0 && <button type="button" aria-label={t("sectors")} title={t("sectors")} aria-pressed={showCoverage} onClick={() => useProject.getState().setCoverage(!showCoverage)}><Droplets size={20} /></button>}
                </div>
              </div>
            </div>}
            {layerManagerOpen && <section className="mobile-layer-manager" role="region" aria-label={t("layerManager")}
              onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onTouchMove={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==="Escape")setLayerManagerOpen(false);}}>
              <header><strong>{t("layerManager")}</strong><button type="button" aria-label={t("close")} onClick={()=>setLayerManagerOpen(false)}><X size={18}/></button></header>
              <MobileLayers manager selectedFirst={false} onEdit={id=>{useProject.getState().setCadEdit(id);setLayerManagerOpen(false);setMobilePanel("properties");}} />
            </section>}
            {!layerManagerOpen && !bulkSelection && (mobileWorkspaceMode === "irrigation" || mobileLayersVisible) && <section className="mobile-top-layers" data-workspace-mode={mobileWorkspaceMode} aria-label={mobileWorkspaceMode === "drawing" ? t("layers") : t("irrigation")}
              onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              {mobileWorkspaceMode === "drawing" ? <MobileLayers onEdit={(id) => { useProject.getState().setCadEdit(id); setMobilePanel("properties"); }} onInspect={() => { mobileInspectTarget.current = selectedObjectKey(useProject.getState()); setMobilePanel("properties"); }} /> : <div className="mobile-zone-strip">
                {project.zones.map((zone) => <button type="button" key={zone.id} aria-pressed={zone.id === activeZoneId} onClick={() => useProject.getState().setActiveZone(zone.id)}><span style={{ background: zoneColor(zone.id) }} />{zone.name}</button>)}
                <Popover.Root modal><Popover.Trigger asChild><button type="button" aria-label="Подробнее о зонах полива">Подробнее <ChevronRight size={16} /></button></Popover.Trigger><Popover.Portal><Popover.Content side="bottom" align="end" sideOffset={4} collisionPadding={8} aria-label="Зоны полива" className="layer-details-dialog" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}><div className="layer-dialog-body"><ZoneList /><PumpBox /><Popover.Close asChild><Button className="w-full">Закрыть</Button></Popover.Close></div></Popover.Content></Popover.Portal></Popover.Root>
              </div>}
            </section>}
            {!layerManagerOpen && fusionActions}
          </div>}
          <CanvasHost
            mobile={isPhone}
            multiSelect={workspaceMultiSelect && selectionModeAvailable}
            onScalePair={(a, b) => setScalePair({ a, b })}
            onMeasure={setMeasurementResult}
            onHover={setHover}
            onExportReady={(fn) => {
              exportFn.current = fn;
            }}
          />
          {tool === "measure" && measurementResult != null && <MeasurementResult meters={measurementResult} onClose={() => setMeasurementResult(null)} />}
          {isPhone && gridOpen && <div className="mobile-grid-dismiss" aria-hidden
            onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setGridOpen(false); }} />}
          {isPhone && bulkActions}
          {!isPhone && !bulkSelection && !fusionActions && contextControls}
        </section>

        {isPhone && rightOpen && rightMode === "landscape" && <aside className="info-panel landscape-phone-inspector" aria-label="Карточка растения">
          <div className="workspace-panel-heading"><strong>Растение</strong><Button onClick={() => useProject.getState().setRightOpen(false)} aria-label="Скрыть карточку растения"><X />Скрыть</Button></div>
          <PlantInspector mobile />
        </aside>}
        {isPhone && rightOpen && (catInfo || libInfo) && rightMode === "irrigation" && <aside className="info-panel landscape-phone-inspector" aria-label="Информация о поливе">
          <div className="workspace-panel-heading"><strong>{catInfo ? t(`cat_${catInfo}`) : "Дождеватель"}</strong><Button onClick={() => { setLibInfo(null); setCatInfo(null); useProject.getState().setRightOpen(false); }} aria-label="Скрыть карточку дождевателя"><X />Скрыть</Button></div>
          {catInfo ? <CatalogSeriesInfo key={catInfo} family={catInfo} /> : libInfo && <CatalogInfo catalogId={libInfo} />}
        </aside>}
        {!isPhone && (rightOpen ? (
          <aside className="info-panel absolute inset-x-0 top-0 z-40 flex max-h-[45vh] flex-col overflow-y-auto border-b border-line bg-surface shadow-border sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-none sm:w-[min(100%,22rem)] lg:w-[320px]">
            <div className="workspace-panel-heading hidden shrink-0 items-center gap-2 border-b border-line px-2 py-2 sm:flex">
              <Button
                type="button"
                size="xs"
                variant="solid"
                className="workspace-panel-hide shrink-0 border-line bg-surface text-ink hover:bg-btn-soft"
                onPointerUp={(e) => {
                  e.preventDefault();
                  useProject.getState().setRightOpen(false);
                }}
              >
                {t("hide")}
                <ChevronRight className="size-3.5 -rotate-90 sm:rotate-0" />
              </Button>
              <div className="info-panel-tabs ml-auto flex min-w-0 flex-row overflow-x-auto">
                {(
                  [
                    ["drawing", t("drawing")],
                    ["irrigation", t("irrigation")],
                    ["estimate", t("estimate")],
                  ] as const
                ).map(([id, label]) => {
                  const on =
                    id === "drawing"
                      ? rightMode === "drawing" || rightMode === "project"
                      : id === "estimate"
                        ? rightMode === "estimate"
                        : rightMode === "zone" || rightMode === "object" || rightMode === "irrigation";
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      className={cn("h-7 shrink-0 rounded-sm px-2 text-[11px] font-semibold sm:h-8", on ? "bg-btn text-btn-fg" : "text-muted hover:bg-bg-2")}
                      onClick={() => {
                        setLibInfo(null);
                        setCatInfo(null);
                        useProject.getState().setRightMode(id === "drawing" ? "drawing" : id === "estimate" ? "estimate" : "zone");
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {rightMode === "landscape" ? <PlantInspector /> : rightMode === "estimate" ? (
              <EstimateCard onCheck={() => setIssuesOpen(true)} />
            ) : rightMode === "zone" || rightMode === "object" || rightMode === "irrigation" ? (
              <>{catInfo ? <CatalogSeriesInfo key={catInfo} family={catInfo} /> : libInfo ? <CatalogInfo catalogId={libInfo} /> : selected && selectedItem && selectedIds.length <= 1 ? (
                <HeadCard head={selected} />
              ) : (
                <div className="p-1.5 sm:p-3">
                  <ZoneList />
                </div>
              )}<div className="px-1.5 pb-3 sm:px-3"><PumpBox /></div></>
            ) : (
              <DrawingCard />
            )}
          </aside>
        ) : (
          <button
            type="button"
            className="tablet-panel-handle"
            onClick={() => useProject.getState().setRightOpen(true)}
            aria-label={t("showPanel")}
          >
            <ChevronLeft className="size-5" />
          </button>
        ))}
      </div>

      <footer className="app-footer relative z-30 flex min-h-11 shrink-0 items-center gap-2 scroll-touch border-t border-line bg-surface px-2 py-1 text-xs">
        {isPhone && <nav className="mobile-canvas-controls" aria-label="Сетка и навигация чертежа">
          {cursorControl}
          {selectionControls}
          {textControl}
          <button type="button" className="mobile-icon-button" aria-label={t("drawDim")} title={t("drawDim")} aria-pressed={tool === "draw" && drawSub === "dim"} onClick={() => chooseMobileTool(() => useProject.getState().setDrawSub("dim"))}><IconDim /></button>
          <button type="button" className="mobile-icon-button" aria-label={t("ruler")} title={t("ruler")} aria-pressed={tool === "measure" && measureSub === "measure"} onClick={() => chooseMobileTool(() => useProject.getState().setMeasureSub("measure"))}><TapeMeasureIcon /></button>
          {viewControls}
          <button type="button" className="mobile-icon-button" aria-label={t("layerManager")} aria-pressed={layerManagerOpen} onClick={() => { setLayerManagerOpen(open=>!open); setMobileWorkspaceMode("drawing"); setMobilePanel(null); setGridOpen(false); }}><Layers /></button>
          {gridControls}
          {textVisibilityControl}
          {dimensionVisibilityControl}
        </nav>}
        {!isPhone && <nav className="workspace-canvas-controls tablet-canvas-controls" aria-label={t("canvasControls")}>
          {cursorControl}
          {selectionControls}
          {textControl}
          <button type="button" className="mobile-icon-button" aria-label={t("drawDim")} title={t("drawDim")} aria-pressed={tool === "draw" && drawSub === "dim"} onClick={() => useProject.getState().setDrawSub("dim")}><IconDim /></button>
          <button type="button" className="mobile-icon-button" aria-label={t("ruler")} title={t("ruler")} aria-pressed={tool === "measure"} onClick={() => useProject.getState().setMeasureSub("measure")}><TapeMeasureIcon /></button>
          {viewControls}
          <button type="button" className="mobile-icon-button" aria-label={t("layerManager")} title={t("layerManager")} aria-pressed={rightOpen && (rightMode === "drawing" || rightMode === "project")} onClick={() => {
            if (rightOpen && (rightMode === "drawing" || rightMode === "project")) useProject.getState().setRightOpen(false);
            else useProject.getState().setRightMode("drawing");
          }}><Layers /></button>
          <div className="tablet-grid-controls">{gridControls}</div>
          {textVisibilityControl}
          {dimensionVisibilityControl}
        </nav>}
        {!isPhone && project.heads.length > 0 && (
          <div className="flex items-stretch overflow-hidden rounded-md border border-tool">
            <Button
              size="xs"
              variant={showCoverage ? "pressed" : "ghost"}
              className="rounded-none border-0"
              onClick={() => useProject.getState().setCoverage(!showCoverage)}
            >
              <Droplets />
              {t("sectors")}
            </Button>
            <span className="w-px self-stretch bg-tool/35" aria-hidden />
            <Button
              size="xs"
              variant={showLabels ? "pressed" : "ghost"}
              className="rounded-none border-0"
              onClick={() => useProject.getState().setLabels(!showLabels)}
            >
              <Tag />
              {t("labels")}
            </Button>
          </div>
        )}
        <span className="hidden shrink-0 text-ink-soft sm:inline">
          {catalogOpen ? (
            <>
              ● {activeZone?.name ?? t("zoneN", { n: 1 })}
              {activeQ != null ? ` · ${formatFlowU(activeQ, units.flow)}` : " · Нет данных о расходе"}
            </>
          ) : null}
        </span>
      </footer>
      {isPhone ? <><SegmentFigureConfirmation deletingSelection={bulkDeleteConfirm}
        onDeleteSelected={bulkSelection ? () => setBulkDeleteConfirm(true) : undefined} />
        {headSelectionActions && <div className="desktop-bottom-actions"><div className="figure-actions-surface">{headSelectionActions}</div></div>}
        </> : (
        <div className="desktop-bottom-actions">
          <div className="figure-actions-surface">
            {headSelectionActions}
            {bulkActions}
            {fusionActions}
            <SegmentFigureConfirmation deletingSelection={bulkDeleteConfirm}
              onDeleteSelected={bulkSelection ? () => setBulkDeleteConfirm(true) : undefined} />
          </div>
        </div>
      )}

      {isPhone && !bulkSelection && mobilePanel === "tools" && !catalogGhost && drawingDimensionsVisible && !groupedLayer && <section data-mobile-sheet="tool-properties" className="mobile-parameter-bar mobile-tool-parameter-bar" role="region" aria-label={contextTitle}
        onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
        <div className="mobile-parameter-scroll">
          {cadEditId && editingNodeContour && <div className="mobile-face-dimensions">{mobileFaceDimensions.map((dimension, index) => <span key={index}>{dimension.label}<output>{dimension.kind === "area" ? formatAreaU(dimension.value, units.area) : formatLenU(dimension.value, units.length)}</output></span>)}</div>}
          {contextControls}
        </div>
      </section>}

      {isPhone && !mobilePanel && tool === "place" && !catalogGhost && <div className="mobile-placement-hint"><span>{placeId} · перетащите из библиотеки</span><button type="button" aria-label="Закончить размещение" onClick={() => useProject.getState().setTool(null)}><X size={20} /></button></div>}
      {isPhone && !((bulkSelection || headSelectionActions || groupedLayer || (!selected && !drawingDimensionsVisible && tool !== "measure" && tool !== "scale")) && mobilePanel === "properties") && mobilePanel && mobilePanel !== "layers" && mobilePanel !== "tools" && !catalogGhost && <MobileSheet panelKey={mobilePanel} compact={mobilePanel === "properties" && !selected} title={mobilePanel === "library" ? t("library") : mobilePanel === "irrigation" ? t("irrigation") : mobilePanel === "estimate" ? t("estimate") : contextTitle} onClose={() => setMobilePanel(null)}
        footer={mobilePanel === "properties" && selected ? <div className="mobile-context-footer">
          <Button className="ml-auto" aria-label="Готово" title="Готово" onPointerDown={(e) => e.preventDefault()} onClick={() => { (document.activeElement as HTMLElement)?.blur?.(); if (selected) setMobilePanel(null); }}><Check /></Button>
        </div> : undefined}>
        {mobilePanel === "library" && <div className="mobile-catalog" data-catalog>
          <div className="mobile-categories" data-cat-bar>{CATEGORIES.map((category) => <button type="button" key={category.id} aria-pressed={familyFilter === category.id} onClick={() => openCatalogFamily(category.id)}>{t(`cat_${category.id}`)}</button>)}</div>
          <div className="mobile-library-actions"><Button aria-label={t("autoPlace")} onClick={() => { autoPlace(); setMobilePanel(null); }}><LayoutGrid />Авторасстановка</Button><span>Справка — касание. Добавить — удерживать и перетащить.</span></div>
          <ul className="mobile-catalog-list">{catalog.map((item) => <li key={item.id} className="mobile-catalog-card" data-selected={placeId === item.id}>
            <button type="button" className="mobile-catalog-select" aria-label={`Характеристики ${item.id}`} onPointerDown={e => startCatalogDrag(e, item.id)} onClick={() => { if (Date.now() < catalogClickSuppressedUntil.current) return; const st = useProject.getState(); st.setTool("place"); st.setPlaceId(item.id); st.setCatalogVisible(false); st.setRightMode("irrigation"); st.setRightOpen(true); setLibInfo(item.id); setCatInfo(null); setMobilePanel(null); }}>
              <CatalogPic item={item} className="h-16 w-16 shrink-0" />
              <span><strong>{item.id}</strong><span>{item.coverageKind === "point" ? "Баблер · без радиуса" : item.strip ? `${formatLenU(item.strip.w, units.length)} × ${formatLenU(item.strip.l, units.length)}` : `${formatLenU(item.rMin, units.length)}–${formatLenU(item.rMax, units.length)}`}</span><span>{item.arcMin === item.arcMax ? `${item.arcMax}°` : `${item.arcMin}–${item.arcMax}°`}</span></span>
              <CatalogThumb color={item.color} arc={item.arcMax} strip={item.strip} />
            </button>
            <div className="mobile-catalog-card-actions"><button type="button" className="mobile-icon-button mobile-drag-handle" aria-label={`Перенести ${item.id}`} onPointerDown={(e) => { e.preventDefault(); useProject.getState().setTool("place"); startCatalogDrag(e, item.id); }}><Crosshair size={22} /></button><button type="button" className="mobile-icon-button" aria-label={`Подробнее о ${item.id}`} aria-expanded={libInfo === item.id} onClick={() => { setLibInfo(item.id); setCatInfo(null); useProject.getState().setRightMode("irrigation"); useProject.getState().setRightOpen(true); setMobilePanel(null); }}><MoreHorizontal size={22} /></button></div>

          </li>)}</ul>
        </div>}
        {mobilePanel === "properties" && <>
          {!groupedLayer && mobileFace && cadEditId && editingNodeContour && <div className="mobile-face-dimensions">{mobileFaceDimensions.map((dimension, index) => <span key={index}>{dimension.label}<output>{dimension.kind === "area" ? formatAreaU(dimension.value, units.area) : formatLenU(dimension.value, units.length)}</output></span>)}</div>}
          {selected ? <>{selectedIds.length > 1 ? <ZoneList /> : <HeadCard head={selected} />}<PumpBox /></> : drawingDimensionsVisible ? contextControls : null}
          {showHints && tool === "scale" && <p className="mobile-context-hint">{t("scaleHint")}</p>}
          {showHints && tool === "measure" && <p className="mobile-context-hint">Коснитесь двух точек на чертеже.</p>}
        </>}
        {mobilePanel === "estimate" && <EstimateCard onCheck={() => setIssuesOpen(true)} />}
      </MobileSheet>}

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        suppressHydrationWarning
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUploadFile(f);
          e.target.value = "";
        }}
      />

      {scalePair && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-ink/30 p-4">
          <div className="w-full max-w-sm rounded-lg bg-surface p-5 shadow-border">
            <p className="font-display text-lg">{t("actualDistance")}</p>
            <p className="mt-1 text-sm text-muted">
              {t("onDrawing", { len: formatLenU(Math.hypot(scalePair.b.x - scalePair.a.x, scalePair.b.y - scalePair.a.y), units.length) })}
            </p>
            <div className="mt-3 flex flex-wrap gap-1">
              {LENGTH_OPTS.map((u) => (
                <Button key={u} size="xs" variant={u === units.length ? "pressed" : "outline"} onClick={() => useProject.getState().patchUnits({ length: u })}>
                  {t(`unit_${u}`)}
                </Button>
              ))}
            </div>
            <input
              value={scaleValue}
              onChange={(e) => setScaleValue(e.target.value)}
              className="mt-3 h-10 w-full rounded-md bg-bg-2 px-3 text-sm shadow-border"
              inputMode="decimal"
              autoFocus
            />
            <div className="mt-3 flex gap-2">
              <Button
                variant="solid"
                className="flex-1"
                size="sm"
                onClick={() => {
                  const n = Number(scaleValue.replace(",", "."));
                  if (!n) return;
                  useProject.getState().applyScale(scalePair.a, scalePair.b, toMeters(n, units.length));
                  setScalePair(null);
                  toast(t("scaleCalibrated"));
                }}
              >
                {t("save")}
              </Button>
              <Button
                className="flex-1"
                size="sm"
                onClick={() => {
                  setScalePair(null);
                  useProject.getState().cancelDraft();
                }}
              >
                {t("cancel")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {nameAsk && (
        <KeyboardSheet onBackdrop={() => setNameAsk(false)}>
          <div className="p-5">
            <p className="font-display text-lg">{t("projectName")}</p>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onFocus={(e) => e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" })}
              className="mt-3 h-11 w-full rounded-md bg-bg-2 px-3 text-sm shadow-border"
              autoFocus
            />
          </div>
          <div className="flex shrink-0 gap-2 border-t border-line p-3">
            <Button
              variant="solid"
              className="flex-1"
              size="sm"
              onClick={() => {
                const n = nameDraft.trim();
                if (!n) return;
                setNameAsk(false);
                void saveProjectAsFile(n);
              }}
            >
              {t("save")}
            </Button>
            <Button className="flex-1" size="sm" onClick={() => setNameAsk(false)}>
              {t("cancel")}
            </Button>
          </div>
        </KeyboardSheet>
      )}

      {projectsOpen && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-ink/30 p-4" onClick={() => setProjectsOpen(false)}>
          <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-lg bg-surface p-4 shadow-border" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-lg">{t("projects")}</p>
            <p className="mt-1 text-xs text-muted">{t("projectsHint")}</p>
            <ul className="mt-3 flex-1 overflow-y-auto text-sm">
              {library.length === 0 && <li className="text-muted">{t("noProjects")}</li>}
              {[...library]
                .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
                .map((p) => (
                  <LibraryRow
                    key={p.id}
                    name={p.name}
                    updatedAt={p.updatedAt}
                    active={p.id === project.id}
                    onOpen={() => {
                      useProject.getState().saveCurrentToLibrary();
                      useProject.getState().openLibrary(p.id);
                      setProjectsOpen(false);
                    }}
                    onDelete={() => setDeleteAsk({ id: p.id, name: p.name })}
                    onExport={(kind) => void exportLibrary(p, kind)}
                  />
                ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="solid"
                className="flex-1"
                onClick={() => {
                  setProjectsOpen(false);
                  useProject.getState().newProject();
                }}
              >
                <Plus />
                {t("newProject")}
              </Button>
              <Button className="flex-1" size="sm" onClick={() => setProjectsOpen(false)}>
                {t("close")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {deleteAsk && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={() => setDeleteAsk(null)}>
          <div className="w-full max-w-sm rounded-lg bg-surface p-5 shadow-border" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-lg">{t("deleteProject")}</p>
            <p className="mt-2 text-sm text-ink-soft">
              {t("deleteConfirm", { name: deleteAsk.name })}
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="solid"
                className="flex-1"
                size="sm"
                onClick={() => {
                  useProject.getState().removeLibrary(deleteAsk.id);
                  setDeleteAsk(null);
                  setProjectsOpen(false);
                }}
              >
                {t("delete")}
              </Button>
              <Button className="flex-1" size="sm" onClick={() => setDeleteAsk(null)}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {issuesOpen && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-ink/30 p-4" onClick={() => setIssuesOpen(false)}>
          <div className="w-full max-w-lg rounded-lg bg-surface p-5 shadow-border" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-lg">{t("issuesTitle")}</p>
            <ul className="mt-3 max-h-80 overflow-y-auto text-sm">
              {issues.length === 0 && <li className="text-ok">{t("noIssues")}</li>}
              {issues.map((i) => (
                <li key={i.id} className="border-b border-line py-2">
                  <button
                    type="button"
                    className="text-left"
                    onClick={() => {
                      if (i.headId) useProject.getState().selectHead(i.headId);
                      setIssuesOpen(false);
                    }}
                  >
                    <span className={i.level === "error" ? "text-danger" : "text-warn"}>{i.level === "error" ? t("error") : t("warning")}</span>
                    {" — "}
                    {i.message}
                  </button>
                </li>
              ))}
            </ul>
            <Button className="mt-3" size="sm" onClick={() => setIssuesOpen(false)}>
              {t("close")}
            </Button>
          </div>
        </div>
      )}
      {catalogGhost && (
        <div
          className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-md border border-catalog bg-catalog px-2 py-1.5 text-catalog-fg shadow-border"
          style={{ left: catalogGhost.x, top: catalogGhost.y, transform: "translate(-50%, -120%)" }}
        >
            {itemById(catalogGhost.id) ? (
              <CatalogPic item={itemById(catalogGhost.id)!} className="h-8 w-8" />
            ) : (
              <CatalogThumb color="#3d7fa3" arc={180} />
            )}
          <span className="text-xs font-medium">{catalogGhost.id}</span>
        </div>
      )}

    </div>
  );
}

function BarTool({
  id,
  label,
  active,
  onClick,
}: {
  id: "draw" | "place" | "measure";
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      size="xs"
      variant={active ? "bar-on" : "bar"}
      className="shrink-0 max-sm:size-10 max-sm:px-0"
      aria-label={label}
      data-no-tooltip={id === "draw" || id === "place" ? true : undefined}
      onClick={
        onClick ??
        (() => {
          const cur = useProject.getState().tool;
          useProject.getState().setTool(cur === id ? null : id);
        })
      }
    >
      {id === "draw" && <Pencil />}
      {id === "place" && <SprinklerIcon />}
      {id === "measure" && <MoveHorizontal />}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

function CatalogScroller({ listRef, dep }: { listRef: RefObject<HTMLUListElement | null>; dep?: string }) {
  const t = useT();
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ top: 0, h: 56, needed: false });

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const sync = () => {
      const trackH = trackRef.current?.clientHeight ?? el.clientHeight;
      const { scrollTop, scrollHeight, clientHeight } = el;
      const needed = scrollHeight > clientHeight + 4;
      const h = Math.max(56, (clientHeight / Math.max(scrollHeight, 1)) * trackH);
      const maxTop = Math.max(0, trackH - h);
      const range = Math.max(1, scrollHeight - clientHeight);
      setThumb({ top: (scrollTop / range) * maxTop, h, needed });
    };
    sync();
    el.addEventListener("scroll", sync);
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [listRef, dep]);

  const onThumbDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = listRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const startY = e.clientY;
    const startScroll = el.scrollTop;
    const trackH = track.clientHeight;
    const maxTop = Math.max(1, trackH - thumb.h);
    const range = Math.max(1, el.scrollHeight - el.clientHeight);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const move = (ev: PointerEvent) => {
      el.scrollTop = startScroll + ((ev.clientY - startY) / maxTop) * range;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div ref={trackRef} className={cn("catalog-scroll-track", !thumb.needed && "hidden")} aria-hidden={!thumb.needed}>
      <button
        type="button"
        aria-label={t("scrollLibrary")}
        className="catalog-scroll-thumb"
        style={{ transform: `translateY(${thumb.top}px)`, height: thumb.h }}
        onPointerDown={onThumbDown}
      />
    </div>
  );
}

function CatalogPic({ item, className }: { item: CatalogItem; className?: string }) {
  const fallback =
    item.type === "rotor" || item.family === "rotor"
      ? "/catalog/PGP-ADJ.png?v=9"
      : item.type === "bubbler" || item.family === "bubbler"
        ? "/catalog/MSBN-50Q.png?v=9"
        : item.family === "mp" || item.family === "mp800" || item.family === "strip"
        ? "/catalog/MP2000.png?v=9"
        : item.type === "body"
          ? "/catalog/body.png?v=9"
          : "/catalog/8A.png?v=9";
  return (
    <img
      src={catalogPhoto(item)}
      alt={item.name}
      className={cn("shrink-0 object-contain", className)}
      onError={(e) => {
        const el = e.currentTarget;
        if (!el.src.endsWith(fallback)) el.src = fallback;
      }}
    />
  );
}

function MenuBtn({ onClick, icon, label }: { onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button type="button" className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-btn hover:bg-btn-soft" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function LibraryRow({
  name,
  updatedAt,
  active,
  onOpen,
  onDelete,
  onExport,
}: {
  name: string;
  updatedAt?: string;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onExport: (kind: "pdf" | "dxf" | "png" | "svg" | "json") => void;
}) {
  const t = useT();
  const [dl, setDl] = useState(false);
  const hold = useRef<number | null>(null);
  const skip = useRef(false);
  const when = updatedAt
    ? new Date(updatedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";
  const clear = () => {
    if (hold.current) {
      window.clearTimeout(hold.current);
      hold.current = null;
    }
  };
  return (
    <li className={cn("border-b border-line py-2", active && "bg-btn-soft/60")}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onPointerDown={() => {
            skip.current = false;
            clear();
            hold.current = window.setTimeout(() => {
              skip.current = true;
              onDelete();
            }, 500);
          }}
          onPointerUp={clear}
          onPointerCancel={clear}
          onPointerLeave={clear}
          onClick={() => {
            if (skip.current) return;
            onOpen();
          }}
        >
          <p className="truncate font-medium">{name}</p>
          <p className="text-xs text-muted">{when}</p>
        </button>
        <Button
          size="xs"
          variant="solid"
          className="shrink-0 bg-btn-soft px-1.5 text-ink"
          onClick={() => setDl((v) => !v)}
        >
          <FileDown className="size-3.5" />
          {t("download")}
        </Button>
        <Button size="xs" variant="ghost" className="shrink-0 text-danger" aria-label={t("deleteProject")} onClick={onDelete}>
          <Trash2 />
        </Button>
      </div>
      {dl && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Button size="xs" variant="outline" onClick={() => onExport("pdf")}>
            PDF
          </Button>
          <Button size="xs" variant="outline" onClick={() => onExport("dxf")}>
            {t("exportDxfCad")}
          </Button>
          <Button size="xs" variant="outline" onClick={() => onExport("png")}>
            {t("exportPngFile")}
          </Button>
          <Button size="xs" variant="outline" onClick={() => onExport("svg")}>
            {t("exportSvg")}
          </Button>
          <Button size="xs" variant="outline" onClick={() => onExport("json")}>
            {t("exportJson")}
          </Button>
        </div>
      )}
    </li>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="info-stat rounded-sm bg-bg-2 px-1.5 py-1 sm:rounded-md sm:px-2.5 sm:py-2">
      <dt className="text-[8px] font-semibold text-faint uppercase sm:text-[10px]">{k}</dt>
      <dd className="mt-0.5 text-[11px] font-medium leading-tight tabular sm:text-sm">{v}</dd>
    </div>
  );
}

function Spec({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="shrink-0 text-faint">{k}</dt>
      <dd className="min-w-0 text-right font-medium">{v}</dd>
    </div>
  );
}

function ColorSlider({
  label,
  value,
  min,
  max,
  step,
  color,
  display,
  endLabels,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  color: string;
  display: string;
  endLabels?: [string, string];
  onChange: (n: number) => void;
}) {
  const range = sliderRange(min, max, step, value);
  const span = Math.max(0.0001, max - min);
  const pct = Math.max(0, Math.min(100, ((value - min) / span) * 100));
  return (
    <label className="mt-1.5 block">
      <span className="flex items-center justify-between gap-1 text-[10px] font-semibold" style={{ color }}>
        <span>{label}</span>
        <span className="tabular">{display}</span>
      </span>
      <input
        type="range"
        min={0}
        max={range.ticks}
        step={1}
        value={range.tick}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={display}
        disabled={min === max}
        className="head-slider mt-0.5 w-full"
        style={{
          color,
          background: `linear-gradient(90deg, ${color} ${pct}%, color-mix(in srgb, ${color} 22%, transparent) ${pct}%)`,
        }}
        onPointerDown={() => useProject.getState().beginHeadEdit()}
        onChange={(e) => onChange(range.fromTick(Number(e.target.value)))}
        onKeyDown={(e) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) useProject.getState().beginHeadEdit(); }}
        onKeyUp={() => useProject.getState().endHeadEdit()}
        onBlur={() => useProject.getState().endHeadEdit()}
        onPointerUp={() => useProject.getState().endHeadEdit()}
        onPointerCancel={() => useProject.getState().endHeadEdit()}
        onLostPointerCapture={() => useProject.getState().endHeadEdit()}
      />
      {endLabels && <span className="mt-0.5 flex justify-between gap-2 text-[10px] text-muted tabular"><span>{endLabels[0]}</span><span>{endLabels[1]}</span></span>}
    </label>
  );
}

function CadEditBar({ faceId }: { faceId: string }) {
  const t = useT();
  const memberScope = useProject(s => s.groupMemberId);
  const project = useProject((s) => s.project);
  const themeId = useProject((s) => s.themeId);
  const dark = themeId === "graphite";
  const [askDel, setAskDel] = useState(false);
  const [fillOpen, setFillOpen] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const hideTip = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const d = drawingOrMigrate(project);
  const face = d.faces[faceId];
  useEffect(() => {
    setAskDel(false);
    setFillOpen(false);
    setTip(null);
    return () => window.clearTimeout(hideTip.current);
  }, [faceId]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const node = e.target as Node | null;
      if (wrapRef.current?.contains(node)) return;
      setAskDel(false);
      setTip(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [faceId]);
  if (!face || face.locked) return null;
  const showTip = (msg: string) => {
    window.clearTimeout(hideTip.current);
    setTip(msg);
    hideTip.current = window.setTimeout(() => setTip(null), 1400);
  };
  const Btn = ({
    label,
    danger,
    onPress,
    children,
  }: {
    label: string;
    danger?: boolean;
    onPress: () => void;
    children: ReactNode;
  }) => (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center rounded-sm",
        danger ? "text-danger hover:bg-danger/10" : dark ? "text-ink hover:bg-white/35" : "text-ink hover:bg-btn-soft",
      )}
      onPointerEnter={() => showTip(label)}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onClick={() => {
        showTip(label);
        onPress();
      }}
    >
      {children}
    </button>
  );
  return (
    <div ref={wrapRef} data-cad-actions className="pointer-events-none absolute inset-0 z-40">
      <div
        className={cn(
          "cad-edit-drawer pointer-events-auto absolute left-0 top-1/2 flex h-auto w-[2.875rem] -translate-y-1/2 flex-col items-center gap-0.5 rounded-r-md border-[1.5px] border-l-0 border-line p-0.5 shadow-border",
          dark
            ? "bg-surface text-ink backdrop-blur-md"
            : "bg-surface",
        )}
      >
        <div className="flex flex-col items-center">
          {!face.layerId && <LayerColorPicker
            key={faceId}
            orientation={face.textureRotation ?? 0}
            onOrientationChange={rotation => changeMaterialOrientation(faceId, rotation)}
            title={face.name || t("layerN", { n: faceLayerNumber(d, faceId) })}
            color={face.fill ?? REGION_FILL[face.type] ?? "#c8e6b0"}
            side="right"
            className="cad-fill-trigger"
            open={fillOpen}
            onOpenChange={(open) => { setAskDel(false); setTip(null); setFillOpen(open); }}
            onChange={(color) => useProject.getState().setFaceFill(color)}
          />}
          {!face.layerId && !memberScope && <Btn
            label={t("duplicateHint")}
            onPress={() => {
              setAskDel(false);
              setFillOpen(false);
              useProject.getState().duplicateSelected();
            }}
          >
            <Copy className="size-4" />
          </Btn>}
          <Btn
            label={t("deleteShapeHint")}
            danger
            onPress={() => {
              setFillOpen(false);
              setAskDel(true);
            }}
          >
            <Trash2 className="size-4" />
          </Btn>
        </div>
        {tip && !askDel && !fillOpen && (
          <span className="pointer-events-none absolute left-full top-1/2 z-10 ml-1 w-max max-w-[12rem] -translate-y-1/2 rounded-sm bg-ink px-2 py-1 text-[10px] leading-snug text-white shadow-border">
            {tip}
          </span>
        )}
      </div>
      {askDel && (
        <div
          data-cad-delete
          className={cn(
            "pointer-events-auto absolute left-[3.25rem] top-1/2 z-50 w-[18rem] max-w-[calc(100%-3.75rem)] -translate-y-1/2 rounded-md p-1 shadow-border",
            dark ? "border border-line bg-surface text-ink backdrop-blur-md" : "border border-line bg-surface",
          )}
        >
          <p className={cn("text-xs font-medium", dark ? "text-ink" : "text-ink")}>{t("deleteShapeAsk")}</p>
          <div className="mt-2 flex gap-1">
            <Button size="xs" variant="ghost" className="flex-1" onClick={() => setAskDel(false)}>
              {t("cancel")}
            </Button>
            <Button
              size="xs"
              variant="solid"
              className="flex-1 bg-danger text-white"
              onPointerDown={(e) => {
                e.preventDefault();
                setAskDel(false);
                useProject.getState().deleteSelected();
              }}
            >
              {t("delete")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}


function useKbLift() {
  const [lift, setLift] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const read = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setLift(covered > 48 ? covered : 0);
    };
    vv.addEventListener("resize", read);
    vv.addEventListener("scroll", read);
    read();
    return () => {
      vv.removeEventListener("resize", read);
      vv.removeEventListener("scroll", read);
    };
  }, []);
  return lift;
}

function sideLetter(index: number) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function PolygonDraftDimensions({hover}: {hover: Pt | null}) {
  const points=useProject(s=>s.draft.points);
  const units=useProject(s=>s.units);
  const kbLift=useKbLift();
  const boundary=points;
  const live=hover && boundary.length && dist(hover,boundary[boundary.length-1]!)>1e-7 ? [...boundary,hover] : boundary;
  return <div className="dimension-pad pointer-events-auto fixed inset-x-2 z-[90] overflow-x-auto overscroll-x-contain rounded-md border-2 border-tool bg-surface px-1.5 py-1 shadow-border" style={{bottom:`calc(3.55rem + env(safe-area-inset-bottom, 0px) + ${kbLift}px)`}} onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
    <div className="flex h-10 w-max min-w-full items-center gap-1.5">
      {live.length>=3 && polygonArea(live)>1e-8 && <DimensionArea area={polygonArea(live)}/>}
      {boundary.slice(1).map((p,i)=><label key={i} className="flex h-9 shrink-0 items-center gap-1 rounded-sm bg-bg-2 px-1.5"><strong>{sideLetter(i)}</strong><input key={`${p.x}:${p.y}:${boundary[i]!.x}:${boundary[i]!.y}`} className="w-20" inputMode="decimal" aria-label={sideLetter(i)} defaultValue={String(Number(fromMeters(dist(boundary[i]!,p),units.length).toFixed(2)))} onBlur={e=>{
        const value=Number(e.currentTarget.value.replace(',','.'));
        const st=useProject.getState(),next=st.draft.points.map(p=>({...p})),a=next[i],b=next[i+1];
        if(!a||!b||!Number.isFinite(value)||value<=0)return;
        const length=dist(a,b);if(length<1e-7)return;
        const scale=toMetersLen(value,units.length)/length;
        next[i+1]={x:a.x+(b.x-a.x)*scale,y:a.y+(b.y-a.y)*scale};st.setDraftPoints(next);
      }} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')e.currentTarget.blur();}}/><span>{lenLabel(units.length)}</span></label>)}
      <label className="flex h-9 shrink-0 items-center gap-1 rounded-sm bg-bg-2 px-1.5"><strong>L</strong><input className="w-20" inputMode="decimal" placeholder={hover && points.length ? fromMeters(dist(points[points.length-1]!,hover),units.length).toFixed(2) : "0"} aria-label="L" onKeyDown={e=>{
        e.stopPropagation();if(e.key!=='Enter')return;const value=Number(e.currentTarget.value.replace(',','.'));if(value>0){useProject.getState().applyCadLength(toMetersLen(value,units.length),hover);e.currentTarget.value='';}
      }}/><span>{lenLabel(units.length)}</span></label>
    </div>
  </div>;
}

function DimensionArea({ area }: { area: number }) {
  const t = useT();
  const units = useProject((s) => s.units);
  return <div className="dimension-total flex h-9 shrink-0 items-center gap-1 rounded-sm bg-tool/10 px-1.5">
    <span className="min-w-5 text-center text-xs font-bold text-ink">S</span>
    <output aria-label={t("area")} className="text-sm font-semibold tabular-nums text-ink">{formatAreaU(area, units.area)}</output>
  </div>;
}

function SegmentFigureConfirmation({ deletingSelection, onDeleteSelected }: {
  deletingSelection: boolean; onDeleteSelected?: () => void;
}) {
  const t=useT();
  const project=useProject(s=>s.project);
  const selectedPolyIds=useProject(s=>s.selectedPolyIds);
  const [dismissed,setDismissed]=useState<string[]>([]);
  const candidates=useMemo(()=>segmentFigures(drawingOrMigrate(project)),[project.drawing]);
  const drawing=drawingOrMigrate(project);
  const multipleSegments=selectedPolyIds.length>1 && selectedPolyIds.every(id=>drawing.faces[id]?.segment);
  const candidate=candidates.find(c=>!dismissed.includes(c.key) &&
    (selectedPolyIds.length<2 || c.parts.every(part=>selectedPolyIds.includes(part.id))));
  const showDelete=multipleSegments && !!onDeleteSelected;
  // Let the existing bulk-delete confirmation take this same panel position.
  if(!candidate || deletingSelection) return null;
  return <section className="bulk-selection-actions segment-figure-confirm" data-confirming="true" data-selection-delete={showDelete} role="region" aria-label={t("createSegmentFigure")}
    onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
    <p role="status">{t("closedSegmentFigure")}</p>
    <button type="button" className="bulk-create" onClick={()=>{
      const st=useProject.getState();
      const result=createSegmentFigure(drawingOrMigrate(st.project),candidate.key);
      if(!result) return;
      st.commitDrawing(result.drawing,result.faceId);
      st.setCadEdit(result.faceId);
    }}>{t("createSegmentFigure")}</button>
    <button type="button" className="action-cancel" aria-label={t("cancel")} title={t("cancel")} onClick={()=>setDismissed(ids=>[...ids,candidate.key])}><X size={18}/></button>
    {showDelete && <button type="button" className="bulk-delete"
      disabled={selectedPolyIds.some(id=>drawing.faces[id]?.locked)}
      aria-label={t("deleteSelectedLayers")} title={t("deleteSelectedLayers")}
      onClick={onDeleteSelected}><Trash2 size={18}/></button>}
  </section>;
}

function SplineLengthsPad({ faceId, compact = false }: { faceId: string | null; compact?: boolean }) {
  const t=useT();
  const project = useProject((s) => s.project);
  const draft = useProject((s) => s.draft);
  const splinePreview = useProject((s) => s.splinePreview);
  const units = useProject((s) => s.units);
  const kbLift = useKbLift();
  const drawing = drawingOrMigrate(project);
  const spline = faceId ? drawing.faces[faceId]?.spline : null;
  const points =
    faceId && splinePreview?.faceId === faceId
      ? splinePreview.points
      : spline?.pts ?? draft.points;
  const segment = Boolean(faceId && drawing.faces[faceId]?.segment);
  const closed = Boolean(spline?.closed);
  const segmentCount = closed ? points.length : Math.max(0, points.length - 1);
  const lengths = Array.from({ length: segmentCount }, (_, index) =>
    dist(points[index]!, points[(index + 1) % points.length]!),
  );
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  const lengthsKey = lengths.map((length) => length.toFixed(8)).join("|");
  const digits = units.length === "mm" ? 0 : units.length === "cm" ? 1 : 2;
  const formatLength = (meters: number) => {
    const fixed = fromMeters(meters, units.length).toFixed(digits);
    return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  };
  const [values, setValues] = useState<string[]>(() => lengths.map(formatLength));
  const [nextValue, setNextValue] = useState("");
  const cancelNextBlur = useRef(false);

  useEffect(() => {
    setValues(lengths.map(formatLength));
    // Geometry key keeps every field current when one control point changes two segments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceId, lengthsKey, units.length]);

  useEffect(() => {
    setNextValue("");
  }, [points.length, faceId]);

  const pointAtLength = (a: Pt, b: Pt, meters: number) => {
    const current = dist(a, b);
    if (current <= 1e-9) return { x: a.x + meters, y: a.y };
    return {
      x: a.x + ((b.x - a.x) / current) * meters,
      y: a.y + ((b.y - a.y) / current) * meters,
    };
  };

  const resetValue = (index: number) => {
    setValues((current) => {
      const next = [...current];
      next[index] = formatLength(lengths[index] ?? 0);
      return next;
    });
  };

  const applySegmentLength = (index: number) => {
    const entered = Number((values[index] ?? "").trim().replace(",", "."));
    if (!Number.isFinite(entered) || entered <= 0) {
      resetValue(index);
      return;
    }
    const targetLength = toMetersLen(entered, units.length);
    const state = useProject.getState();
    if (faceId) {
      const latestFace = drawingOrMigrate(state.project).faces[faceId];
      const latestPoints = latestFace?.spline?.pts;
      if (!latestPoints?.length) return;
      const latestCount = latestFace.spline!.closed
        ? latestPoints.length
        : Math.max(0, latestPoints.length - 1);
      if (index >= latestCount) return;
      const nextIndex = (index + 1) % latestPoints.length;
      const a = latestPoints[index]!;
      const b = latestPoints[nextIndex]!;
      if (Math.abs(dist(a, b) - targetLength) <= 1e-9) {
        resetValue(index);
        return;
      }
      state.setSplinePt(nextIndex, pointAtLength(a, b, targetLength));
      return;
    }
    const latestPoints = state.draft.points;
    if (index >= latestPoints.length - 1) return;
    const a = latestPoints[index]!;
    const b = latestPoints[index + 1]!;
    if (Math.abs(dist(a, b) - targetLength) <= 1e-9) {
      resetValue(index);
      return;
    }
    const next = [...latestPoints];
    next[index + 1] = pointAtLength(a, b, targetLength);
    state.setDraftPoints(next);
  };

  const addNextSegment = () => {
    const entered = Number(nextValue.trim().replace(",", "."));
    if (!Number.isFinite(entered) || entered <= 0 || !points.length || faceId) return;
    const state = useProject.getState();
    if (state.tool !== "draw" || state.drawSub !== "spline") return;
    state.applyCadLength(toMetersLen(entered, units.length), null);
    setNextValue("");
  };

  return (
    <div
      className="dimension-pad pointer-events-auto fixed inset-x-2 z-[90] overflow-x-auto overscroll-x-contain rounded-md border-2 border-tool bg-surface px-1.5 py-1 shadow-border"
      style={{ bottom: `calc(3.55rem + env(safe-area-inset-bottom, 0px) + ${kbLift}px)` }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex h-10 w-max min-w-full items-center gap-1.5">
        {closed && <DimensionArea area={polygonArea(catmullRom(points, 8, true))} />}
        {!segment && <div
          className="dimension-total flex h-9 shrink-0 items-center gap-1 rounded-sm bg-tool/10 px-1.5"
          title="Общая длина кривой"
        >
          <span className="min-w-5 text-center text-xs font-bold text-ink">Σ</span>
          <output
            aria-label="Общая длина кривой"
            className="min-w-[4.4rem] text-right text-sm font-semibold tabular-nums text-ink"
          >
            {formatLength(totalLength)}
          </output>
          <span className="pr-0.5 text-[11px] text-muted">{lenLabel(units.length)}</span>
        </div>}
        {lengths.map((length, index) => (
          <label key={`${faceId ?? "draft"}-${index}`} className="flex h-9 shrink-0 items-center gap-1 rounded-sm bg-bg-2 px-1.5">
            <span className="min-w-5 text-center text-xs font-bold text-ink">{segment ? "L" : sideLetter(index)}</span>
            <input
              aria-label={`Отрезок ${sideLetter(index)}`}
              inputMode="decimal"
              className="h-7 w-[5.2rem] rounded-sm border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-tool"
              value={values[index] ?? formatLength(length)}
              onChange={(event) => {
                const next = [...values];
                next[index] = event.target.value;
                setValues(next);
              }}
              onFocus={(event) => event.currentTarget.select()}
              onBlur={() => applySegmentLength(index)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  resetValue(index);
                  event.currentTarget.blur();
                }
              }}
            />
            <span className="pr-0.5 text-[11px] text-muted">{lenLabel(units.length)}</span>
          </label>
        ))}
        {!faceId && points.length >= 1 && (
          <label className="flex h-9 shrink-0 items-center gap-1 rounded-sm border border-dashed border-tool/60 bg-bg-2 px-1.5">
            <span className="min-w-5 text-center text-xs font-bold text-tool">{sideLetter(segmentCount)}</span>
            <input
              aria-label={`Новый отрезок ${sideLetter(segmentCount)}`}
              inputMode="decimal"
              placeholder="+"
              className="h-7 w-[5.2rem] rounded-sm border border-line bg-surface px-2 text-sm text-ink outline-none placeholder:text-muted focus:border-tool"
              value={nextValue}
              onChange={(event) => setNextValue(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              onBlur={() => { if (compact && !cancelNextBlur.current) addNextSegment(); cancelNextBlur.current = false; }}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") { if (compact) event.currentTarget.blur(); else addNextSegment(); }
                if (event.key === "Escape") {
                  cancelNextBlur.current = true;
                  setNextValue("");
                  event.currentTarget.blur();
                }
              }}
            />
            <span className="pr-0.5 text-[11px] text-muted">{lenLabel(units.length)}</span>
            {!compact && <button
              type="button"
              aria-label={`Построить отрезок ${sideLetter(segmentCount)}`}
              className="grid size-7 place-items-center rounded-sm bg-tool text-white disabled:opacity-40"
              disabled={!nextValue.trim()}
              onClick={addNextSegment}
            >
              <Plus className="size-4" />
            </button>}
          </label>
        )}
      </div>
    </div>
  );
}

function FreeformSidesPad({ faceId }: { faceId: string }) {
  const project = useProject((s) => s.project);
  const units = useProject((s) => s.units);
  const kbLift = useKbLift();
  const drawing = drawingOrMigrate(project);
  const edges = faceEdges(drawing, faceId);
  const starts = closedPathSideStarts(edges.map((edge) => edge.a));
  const sides = starts.map((start, index) => {
    const end = starts[(index + 1) % starts.length]!;
    return { id: edges[start]!.id, a: edges[start]!.a, b: edges[end]!.a };
  });
  const lengths = sides.map((side) => dist(side.a, side.b));
  const lengthsKey = lengths.map((length) => length.toFixed(8)).join("|");
  const digits = units.length === "mm" ? 0 : units.length === "cm" ? 1 : 2;
  const formatLength = (meters: number) => {
    const fixed = fromMeters(meters, units.length).toFixed(digits);
    return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  };
  const [values, setValues] = useState<string[]>(() => lengths.map(formatLength));

  useEffect(() => {
    setValues(lengths.map(formatLength));
    // Geometry key is intentionally used so inputs refresh after a handle or another side moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceId, lengthsKey, units.length]);

  const applySideLength = (index: number) => {
    const entered = Number((values[index] ?? "").trim().replace(",", "."));
    if (!Number.isFinite(entered) || entered <= 0) {
      setValues(lengths.map(formatLength));
      return;
    }
    const targetLength = toMetersLen(entered, units.length);
    const latestDrawing = drawingOrMigrate(useProject.getState().project);
    const side = sides[index];
    if (!side || !(targetLength > 0)) return;
    useProject
      .getState()
      .commitDrawing(setFaceSideLength(latestDrawing, faceId, side.id, targetLength), faceId, true);
  };

  if (!sides.length) return null;
  return (
    <div
      className="dimension-pad pointer-events-auto fixed inset-x-2 z-[90] overflow-x-auto overscroll-x-contain rounded-md border-2 border-tool bg-surface px-1.5 py-1 shadow-border"
      style={{ bottom: `calc(3.55rem + env(safe-area-inset-bottom, 0px) + ${kbLift}px)` }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex h-10 w-max min-w-full items-center gap-1.5">
        <DimensionArea area={faceArea(drawing, faceId)} />
        {sides.map((side, index) => (
          <label key={side.id} className="flex h-9 shrink-0 items-center gap-1 rounded-sm bg-bg-2 px-1.5">
            <span className="min-w-5 text-center text-xs font-bold text-ink">{sideLetter(index)}</span>
            <input
              aria-label={`Сторона ${sideLetter(index)}`}
              inputMode="decimal"
              className="h-7 w-[5.2rem] rounded-sm border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-tool"
              value={values[index] ?? ""}
              onChange={(event) => {
                const next = [...values];
                next[index] = event.target.value;
                setValues(next);
              }}
              onBlur={() => applySideLength(index)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  const next = [...values];
                  next[index] = formatLength(lengths[index] ?? 0);
                  setValues(next);
                  event.currentTarget.blur();
                }
              }}
            />
            <span className="pr-0.5 text-[11px] text-muted">{lenLabel(units.length)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function DrawMeasurePad({
  compact = false,
  drawSub,
  liveLen,
  liveWH,
  liveTriangle,
  liveRot,
  liveR,
  liveArc,
  measureText,
  cadBuf,
  hasPoint,
  hover,
  last,
  editFaceId,
}: {
  compact?: boolean;
  drawSub: string;
  liveLen: number;
  liveWH: { w: number; h: number } | null;
  liveTriangle: { base: number; height: number; left: number; right: number } | null;
  liveRot: number | null;
  liveR: number | null;
  liveArc: { r: number; sag: number } | null;
  measureText: string;
  cadBuf: string;
  hasPoint: boolean;
  hover: Pt | null;
  last: Pt | null;
  editFaceId: string | null;
}) {
  type InputKey = "r" | "d" | "s" | "w" | "l" | "b" | "c" | "k" | "rot";
  const t = useT();
  const pendingLineLength=useProject(s=>s.draft.lineLength);
  const kbLift = useKbLift();
  const units = useProject((s) => s.units);
  const [text, setText] = useState("");
  const [rIn, setRIn] = useState("");
  const [dIn, setDIn] = useState("");
  const [sIn, setSIn] = useState("");
  const [wIn, setWIn] = useState("");
  const [lIn, setLIn] = useState("");
  const [bIn, setBIn] = useState("");
  const [cIn, setCIn] = useState("");
  const [kIn, setKIn] = useState("100");
  const [rotIn, setRotIn] = useState("0");
  const dirty = useRef<InputKey | null>(null);
  const param =
    drawSub === "circle" ? t("drawRadius") :
    drawSub === "rect" || drawSub === "ellipse" || drawSub === "triangle" || drawSub === "hexagon" ? t("drawSize") :
    drawSub === "arc" ? t("drawRadius") :
    drawSub === "line" ? t("segmentLength") : t("drawLength");
  const lenDec = units.length === "mm" ? 0 : units.length === "cm" ? 1 : 2;
  const areaDec = units.area === "acre" || units.area === "ha" ? 3 : 1;
  const fmtN = (n: number, d: number) => n.toFixed(d).replace(/\.?0+$/, (x) => (x.startsWith(".") ? x.replace(/0+$/, "").replace(/\.$/, "") : ""));
  const syncCircle = (r: number) => {
    setRIn(fmtN(fromMeters(r, units.length), lenDec));
    setDIn(fmtN(fromMeters(r * 2, units.length), lenDec));
    setSIn(fmtN(fromM2(Math.PI * r * r, units.area), areaDec));
  };
  useEffect(() => {
    if (liveR == null || dirty.current) return;
    syncCircle(liveR);
  }, [liveR, units.length, units.area]);
  useEffect(() => {
    if (!liveWH || dirty.current) return;
    setWIn(fmtN(fromMeters(liveWH.w, units.length), lenDec));
    setLIn(fmtN(fromMeters(liveWH.h, units.length), lenDec));
    const area = drawSub === "ellipse" ? Math.PI * (liveWH.w / 2) * (liveWH.h / 2) : drawSub === "triangle" ? (liveWH.w * liveWH.h) / 2 : drawSub === "hexagon" ? liveWH.w * liveWH.h * 0.75 : liveWH.w * liveWH.h;
    setSIn(fmtN(fromM2(area, units.area), areaDec));
  }, [liveWH, units.length, units.area, drawSub]);
  useEffect(() => {
    if (!liveTriangle || dirty.current) return;
    setBIn(fmtN(fromMeters(liveTriangle.left, units.length), lenDec));
    setCIn(fmtN(fromMeters(liveTriangle.right, units.length), lenDec));
  }, [liveTriangle, units.length]);
  useEffect(() => {
    if (liveRot == null || dirty.current === "rot") return;
    const n = ((liveRot % 360) + 360) % 360;
    setRotIn(n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1));
  }, [liveRot]);
  const parseN = (raw: string) => {
    const n = Number(raw.trim().replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const applyCircleFrom = (which: "r" | "d" | "s") => {
    let r = 0;
    if (which === "d") {
      const n = parseN(dIn);
      if (n == null) return;
      r = toMetersLen(n, units.length) / 2;
    } else if (which === "s") {
      const n = parseN(sIn);
      if (n == null) return;
      r = Math.sqrt(toM2(n, units.area) / Math.PI);
    } else {
      const n = parseN(rIn);
      if (n == null) return;
      r = toMetersLen(n, units.length);
    }
    if (r <= 0) return;
    const st = useProject.getState();
    if (editFaceId) st.setCircleR(r);
    else st.applyCadRadius(r, hover);
    dirty.current = null;
    syncCircle(r);
  };
  const apply = (raw: string) => {
    const normalized=raw.trim();
    const parsed = parseCadInput(drawSub === "line" && /^[0-9]+([.,][0-9]+)?$/.test(normalized) ? `${normalized}${units.length}` : normalized, true);
    if (!parsed.ok) return;
    const st = useProject.getState();
    if (drawSub === "circle") {
      let r = 0;
      if (parsed.kind === "length") r = parsed.meters;
      else if (parsed.kind === "diameter") r = parsed.meters / 2;
      else if (parsed.kind === "area") r = Math.sqrt(parsed.meters2 / Math.PI);
      if (r <= 0) return;
      if (editFaceId) st.setCircleR(r);
      else st.applyCadRadius(r, hover);
      return;
    }
    if (parsed.kind === "length") {
      if (drawSub === "rect" || drawSub === "ellipse" || drawSub === "triangle" || drawSub === "hexagon") st.applyCadSize(parsed.meters, parsed.meters, hover);
      else st.applyCadLength(parsed.meters, hover);
    } else if (parsed.kind === "size") st.applyCadSize(parsed.width, parsed.height, hover);
    else if (parsed.kind === "area") st.applyCadArea(parsed.meters2, hover);
  };
  const areaM2 =
    drawSub === "circle" && liveR != null
      ? Math.PI * liveR * liveR
      : drawSub === "ellipse" && liveWH
        ? Math.PI * (liveWH.w / 2) * (liveWH.h / 2)
        : drawSub === "triangle" && liveWH
          ? (liveWH.w * liveWH.h) / 2
        : drawSub === "hexagon" && liveWH
          ? liveWH.w * liveWH.h * 0.75
        : liveWH
          ? liveWH.w * liveWH.h
          : null;
  const applyTriangleSides = () => {
    const baseN = parseN(wIn);
    const leftN = parseN(bIn);
    const rightN = parseN(cIn);
    if (baseN == null || leftN == null || rightN == null) return;
    const base = toMetersLen(baseN, units.length);
    const left = toMetersLen(leftN, units.length);
    const right = toMetersLen(rightN, units.length);
    if (left + right <= base || base + left <= right || base + right <= left) {
      toast(t("invalidTriangle"));
      return;
    }
    const st = useProject.getState();
    if (editFaceId) st.setTriangleSides(base, left, right);
    else {
      const x = (left * left - right * right) / (2 * base);
      const h = Math.sqrt(Math.max(0, left * left - (x + base / 2) ** 2));
      st.applyCadSize(base, h, hover);
    }
    dirty.current = null;
  };
  const applyRectFrom = (which: "w" | "l" | "s" | "k" | "rot" = dirty.current === "s" ? "s" : dirty.current === "k" ? "k" : dirty.current === "rot" ? "rot" : "w") => {
    const st = useProject.getState();
    const dnow = drawingOrMigrate(st.project);
    const f = editFaceId ? dnow.faces[editFaceId] : null;
    const curW = liveWH?.w ?? 1;
    const curH = liveWH?.h ?? 1;
    if (which === "rot") {
      const n = Number(rotIn.trim().replace(",", "."));
      if (!Number.isFinite(n)) return;
      st.setRectRotation(n);
      dirty.current = null;
      return;
    }
    if (which === "k") {
      const n = parseN(kIn);
      if (n == null || n <= 0) return;
      if (editFaceId) st.scaleSelectedFace(n / 100);
      dirty.current = null;
      setKIn("100");
      return;
    }
    if (which === "s") {
      const n = parseN(sIn);
      if (n == null) return;
      const area = toM2(n, units.area);
      if (area <= 0) return;
      if (editFaceId) {
        st.setFaceArea(area);
      } else {
        const currentArea = drawSub === "triangle" ? (curW * curH) / 2 : drawSub === "hexagon" ? curW * curH * 0.75 : drawSub === "ellipse" ? Math.PI * (curW / 2) * (curH / 2) : curW * curH;
        const k = Math.sqrt(area / Math.max(currentArea, 1e-9));
        st.applyCadSize(Math.max(0.01, curW * k), Math.max(0.01, curH * k), hover);
      }
      dirty.current = null;
      return;
    }
    const wn = parseN(wIn);
    const ln = parseN(lIn);
    if (wn == null && ln == null) return;
    const w = wn != null ? toMetersLen(wn, units.length) : curW;
    const h = ln != null ? toMetersLen(ln, units.length) : curH;
    if (w <= 0 || h <= 0) return;
    if (editFaceId && f?.ellipse) st.setEllipseR(w / 2, h / 2);
    else if (editFaceId) st.setRectWH(w, h);
    else st.applyCadSize(w, h, hover);
    dirty.current = null;
  };
  const applyCompactField = (which: InputKey) => {
    if (drawSub === "circle" && (which === "r" || which === "d" || which === "s")) {
      applyCircleFrom(which);
      return;
    }
    if (drawSub === "triangle" && (which === "w" || which === "b" || which === "c")) {
      applyTriangleSides();
      return;
    }
    if (which === "w" || which === "l" || which === "s" || which === "rot") {
      applyRectFrom(which);
    }
  };
  const compactField = (
    label: string,
    unit: string,
    value: string,
    which: InputKey,
    set: (value: string) => void,
  ) => (
    <label key={which} className="flex h-9 shrink-0 items-center gap-1 rounded-sm bg-bg-2 px-1.5">
      <span className="min-w-5 text-center text-xs font-bold text-ink">{label}</span>
      <input
        aria-label={label}
        inputMode="decimal"
        className="h-7 w-[5.2rem] rounded-sm border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-tool"
        value={value}
        onChange={(event) => {
          dirty.current = which;
          set(event.target.value);
        }}
        onFocus={(event) => {
          dirty.current = which;
          event.currentTarget.select();
        }}
        onBlur={() => applyCompactField(which)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <span className="pr-0.5 text-[11px] text-muted">{unit}</span>
    </label>
  );
  if (["circle", "rect", "ellipse", "triangle", "hexagon"].includes(drawSub)) {
    const lengthUnit = lenLabel(units.length);
    const areaUnit = areaLabel(units.area);
    return (
      <div
        className="dimension-pad pointer-events-auto fixed inset-x-2 z-[90] overflow-x-auto overscroll-x-contain rounded-md border-2 border-tool bg-surface px-1.5 py-1 shadow-border"
        style={{ bottom: `calc(3.55rem + env(safe-area-inset-bottom, 0px) + ${kbLift}px)` }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex h-10 w-max min-w-full items-center gap-1.5">
          {compactField("S", areaUnit, sIn, "s", setSIn)}
          {drawSub === "circle" && (
            <>
              {compactField("R", lengthUnit, rIn, "r", setRIn)}
              {compactField("Ø", lengthUnit, dIn, "d", setDIn)}
            </>
          )}
          {(drawSub === "rect" || drawSub === "hexagon") && (
            <>
              {compactField("A", lengthUnit, wIn, "w", setWIn)}
              {compactField("B", lengthUnit, lIn, "l", setLIn)}
            </>
          )}
          {drawSub === "ellipse" && (
            <>
              {compactField("A", lengthUnit, wIn, "w", setWIn)}
              {compactField("B", lengthUnit, lIn, "l", setLIn)}
              {compactField("°", "°", rotIn, "rot", setRotIn)}
            </>
          )}
          {drawSub === "triangle" && (
            <>
              {compactField("A", lengthUnit, wIn, "w", setWIn)}
              {compactField("B", lengthUnit, bIn, "b", setBIn)}
              {compactField("C", lengthUnit, cIn, "c", setCIn)}
            </>
          )}
        </div>
      </div>
    );
  }
  return <div
    className={compact ? "dimension-pad" : "dimension-pad pointer-events-auto fixed inset-x-2 z-[90] overflow-x-auto overscroll-x-contain rounded-md border-2 border-tool bg-surface px-1.5 py-1 shadow-border"}
    style={compact ? undefined : { bottom: `calc(3.55rem + env(safe-area-inset-bottom, 0px) + ${kbLift}px)` }}
    onPointerDown={event => event.stopPropagation()}>
    <div className="flex h-10 w-max min-w-full items-center gap-1.5">
      <label className="flex h-9 shrink-0 items-center gap-1 rounded-sm bg-bg-2 px-1.5">
        <span className="min-w-5 text-center text-xs font-bold text-ink">{drawSub === "line" ? "L" : "A"}</span>
        <input aria-label={param} inputMode="decimal" value={text}
          className="h-7 w-[5.2rem] rounded-sm border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-tool"
          placeholder={pendingLineLength ? String(fromMeters(pendingLineLength,units.length)) : hasPoint ? String(fromMeters(liveLen, units.length).toFixed(lenDec)) : "0"}
          onChange={e => setText(e.target.value)} onFocus={e => e.currentTarget.select()}
          onBlur={() => { if (text.trim()) { apply(text); setText(""); } }}
          onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); }}/>
        <span className="pr-0.5 text-[11px] text-muted">{lenLabel(units.length)}</span>
      </label>
    </div>
  </div>;
}

function AngleInput({ from, to }: { from: Pt; to: Pt }) {
  const deg = headingDeg(from, to);
  return (
    <>
      <span className="text-xs text-muted">{Math.round(deg)}°</span>
      <input
        className="h-8 w-16 rounded-sm bg-bg-2 px-2 text-sm tabular shadow-border"
        defaultValue={String(Math.round(deg))}
        key={Math.round(deg)}
        onBlur={(e) => {
          const n = Number(e.target.value.replace(",", "."));
          if (!Number.isFinite(n)) return;
          const st = useProject.getState();
          const pts = st.draft.points;
          if (pts.length < 2) return;
          const prev = pts[pts.length - 2]!;
          const len = dist(prev, pts[pts.length - 1]!);
          const rad = (n * Math.PI) / 180;
          st.setDraftPoints([...pts.slice(0, -1), { x: prev.x + Math.cos(rad) * len, y: prev.y + Math.sin(rad) * len }]);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </>
  );
}

function KeyboardSheet({ children, onBackdrop }: { children: ReactNode; onBackdrop?: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-3 pt-16 pb-3"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onBackdrop?.();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-surface shadow-border">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  autoFocus,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  required?: boolean;
}) {
  const t = useT();
  const empty = required && !value.trim();
  return (
    <label className="block text-xs">
      <span className={cn("flex items-center gap-1.5 font-medium", required ? "text-tool" : "text-muted")}>
        {label}
        {required ? (
          <span className="rounded-sm bg-tool-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-tool uppercase">{t("required")}</span>
        ) : (
          <span className="font-normal text-faint">{t("optional")}</span>
        )}
      </span>
      <input
        value={value}
        autoFocus={autoFocus}
        required={required}
        aria-required={required}
        autoComplete="off"
        autoCorrect="off"
        enterKeyHint={required ? "done" : undefined}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={cn(
          "mt-1 h-10 w-full rounded-sm bg-bg-2 px-2 text-base leading-normal text-ink shadow-border",
          empty && "ring-2 ring-tool/70",
        )}
      />
    </label>
  );
}

function ProjectCard() {
  const t = useT();
  const project = useProject((s) => s.project);
  return (
    <div className="p-1.5 sm:p-4">
      <p className="text-[9px] font-semibold tracking-wide text-muted uppercase sm:text-[10px]">{t("project")}</p>
      <h2 className="mt-0.5 font-display text-sm sm:mt-1 sm:text-xl">{project.name === "Без названия" ? t("untitled") : project.name}</h2>
      <Button className="mt-2 sm:mt-3" size="sm" onClick={() => useProject.getState().setProjectFormOpen(true)}>
        {t("edit")}
      </Button>
    </div>
  );
}

type UnlockFn = () => void;
let unlockTimer = 0;
let pinListeners = false;

function pinToVisualViewport() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  const y = window.visualViewport?.offsetTop ?? 0;
  const shell = document.querySelector(".app-shell");
  if (shell instanceof HTMLElement) {
    shell.style.transform = y > 0 ? `translate3d(0, ${y}px, 0)` : "";
  }
}

function startPin() {
  if (pinListeners) return;
  pinListeners = true;
  window.visualViewport?.addEventListener("scroll", pinToVisualViewport);
  window.visualViewport?.addEventListener("resize", pinToVisualViewport);
  window.addEventListener("scroll", pinToVisualViewport);
  pinToVisualViewport();
}

function stopPin() {
  if (!pinListeners) return;
  pinListeners = false;
  window.visualViewport?.removeEventListener("scroll", pinToVisualViewport);
  window.visualViewport?.removeEventListener("resize", pinToVisualViewport);
  window.removeEventListener("scroll", pinToVisualViewport);
  const shell = document.querySelector(".app-shell");
  if (shell instanceof HTMLElement) shell.style.transform = "";
  window.scrollTo(0, 0);
}

function lockScreen() {
  const html = document.documentElement;
  const body = document.body;
  if (!body.dataset.screenLock) {
    const h = window.innerHeight;
    body.dataset.screenLock = "1";
    for (const el of [html, body]) {
      el.style.position = "fixed";
      el.style.top = "0";
      el.style.left = "0";
      el.style.right = "0";
      el.style.width = "100%";
      el.style.height = `${h}px`;
      el.style.overflow = "hidden";
    }
  }
  startPin();
}

function unlockScreen(after?: UnlockFn) {
  window.clearTimeout(unlockTimer);
  const html = document.documentElement;
  const body = document.body;
  const vv = window.visualViewport;
  const done = () => {
    window.clearTimeout(unlockTimer);
    vv?.removeEventListener("resize", tryDone);
    vv?.removeEventListener("scroll", tryDone);
    stopPin();
    if (body.dataset.screenLock) {
      for (const el of [html, body]) {
        el.style.position = "";
        el.style.top = "";
        el.style.left = "";
        el.style.right = "";
        el.style.width = "";
        el.style.height = "";
        el.style.overflow = "";
      }
      delete body.dataset.screenLock;
    }
    window.scrollTo(0, 0);
    after?.();
  };
  const tryDone = () => {
    pinToVisualViewport();
    if ((vv?.offsetTop ?? 0) < 2) done();
  };
  startPin();
  vv?.addEventListener("resize", tryDone);
  vv?.addEventListener("scroll", tryDone);
  unlockTimer = window.setTimeout(done, 500);
  tryDone();
}

function focusWithoutScroll(el: HTMLInputElement) {
  lockScreen();
  el.focus({ preventScroll: true });
  pinToVisualViewport();
}

function ProjectFormBar() {
  const t = useT();
  const kbLift = useKbLift();
  const project = useProject((s) => s.project);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(project.name === "Без названия" ? "" : project.name);
  const [nameError, setNameError] = useState(false);
  const [more, setMore] = useState(false);
  const [meta, setMeta] = useState({
    address: project.meta.address,
    client: project.meta.client,
    person: project.meta.person,
    phone: project.meta.phone,
    email: project.meta.email,
    designer: project.meta.designer,
    createdAt: project.meta.createdAt,
    notes: project.meta.notes,
  });

  useEffect(
    () => () => {
      window.clearTimeout(unlockTimer);
      stopPin();
      const html = document.documentElement;
      const body = document.body;
      for (const el of [html, body]) {
        el.style.position = "";
        el.style.top = "";
        el.style.left = "";
        el.style.right = "";
        el.style.width = "";
        el.style.height = "";
        el.style.overflow = "";
      }
      delete body.dataset.screenLock;
    },
    [],
  );

  const canSave = name.trim().length > 0;
  const required = project.name.trim() === "" || project.name === "Без названия";
  const closeForm = () => {
    if (required) {
      setNameError(true);
      return;
    }
    nameRef.current?.blur();
    unlockScreen(() => useProject.getState().setProjectFormOpen(false));
  };
  const save = () => {
    const n = (nameRef.current?.value ?? name).trim();
    if (!n) {
      setNameError(true);
      toast(t("enterName"));
      return;
    }
    setNameError(false);
    useProject.getState().patchProject({
      name: n,
      meta: {
        ...project.meta,
        ...meta,
        createdAt: meta.createdAt || new Date().toISOString().slice(0, 10),
      },
    });
    useProject.getState().saveCurrentToLibrary();
    useProject.getState().setRightOpen(false);
    nameRef.current?.blur();
    unlockScreen(() => useProject.getState().setProjectFormOpen(false));
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[80] flex justify-center bg-ink/45 px-4",
        kbLift > 0 ? "items-end" : "items-center",
      )}
      style={{
        paddingTop: 16,
        paddingBottom: kbLift > 0 ? kbLift + 16 : 24,
      }}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (required) {
          setNameError(true);
          return;
        }
        closeForm();
      }}
    >
      <div
        className={cn(
          "mb-2 w-full max-w-sm rounded-lg bg-surface p-4 shadow-border",
          nameError && "ring-2 ring-danger",
        )}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="text-center font-display text-lg">{t("projectName")}</p>
        <p className={cn("mt-1 text-center text-xs", nameError ? "font-medium text-danger" : "text-muted")}>{t("enterName")}</p>
        <input
          ref={nameRef}
          value={name}
          placeholder={`${t("projectName")} *`}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          inputMode="text"
          aria-required
          aria-invalid={nameError}
          autoFocus
          onPointerDown={() => lockScreen()}
          onTouchEnd={(e) => {
            e.preventDefault();
            focusWithoutScroll(e.currentTarget);
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            focusWithoutScroll(e.currentTarget);
          }}
          onChange={(e) => {
            setName(e.target.value);
            if (e.target.value.trim()) setNameError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          className={cn(
            "mt-4 h-11 w-full rounded-md px-3 text-center text-base leading-normal text-ink shadow-border",
            nameError ? "bg-danger/10 ring-2 ring-danger" : "bg-bg-2",
            !canSave && !nameError && "ring-2 ring-tool/70",
          )}
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className={cn(
              "inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-sm px-3 text-sm font-medium",
              canSave ? "bg-btn text-btn-fg" : "bg-btn-soft text-btn",
            )}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              save();
            }}
            onClick={() => save()}
          >
            {t("save")}
          </button>
          {!required && (
            <button
              type="button"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-line text-tool"
              aria-label={t("close")}
              onPointerDown={(e) => {
                e.preventDefault();
                closeForm();
              }}
            >
              <X />
            </button>
          )}
        </div>
        <button type="button" className="mt-2 w-full text-center text-[11px] font-medium text-muted" onClick={() => setMore((v) => !v)}>
          {more ? t("extraHide") : t("extra")}
        </button>
        {more && (
          <div className="mt-1 grid max-h-36 grid-cols-2 gap-1 overflow-y-auto">
            <Field label={t("address")} value={meta.address} onChange={(v) => setMeta({ ...meta, address: v })} />
            <Field label={t("client")} value={meta.client} onChange={(v) => setMeta({ ...meta, client: v })} />
            <Field label={t("phone")} value={meta.phone} onChange={(v) => setMeta({ ...meta, phone: v })} />
            <Field label={t("notes")} value={meta.notes} onChange={(v) => setMeta({ ...meta, notes: v })} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function LayerIrrigCard() {
  const locale = useProject((s) => s.locale);
  const t = useT();
  const project = useProject((s) => s.project);
  const selectedPolyId = useProject((s) => s.selectedPolyId);
  const d = drawingOrMigrate(project);
  const face = selectedPolyId ? d.faces[selectedPolyId] : null;
  if (!face) {
    return (
      <div className="border-b border-line px-2 py-2">
        <p className="text-[11px] text-muted">{t("noLayers")}</p>
      </div>
    );
  }
  const n = faceLayerNumber(d, face.id);
  const label = layerTitle(d, face.id, locale);
  return (
    <div className="border-b border-line px-2 py-2">
      <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">{t("irrigation")}</p>
      <p className="mt-0.5 truncate text-sm font-medium">{label}</p>
      <p className="text-[11px] tabular text-muted">
        {t("area")}: {formatAreaU(faceArea(d, face.id), useProject.getState().units.area)}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {(["low", "medium", "high"] as const).map((need) => (
          <Button
            key={need}
            size="xs"
            variant={face.hydro?.need === need ? "pale-on" : "pale"}
            onClick={() => useProject.getState().setHydro(need, face.hydro?.method ?? "mp")}
          >
            {t(`hydro_${need}`)}
          </Button>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {(["none", "spray", "mp", "rotor", "drip", "bubbler"] as const).map((m) => (
          <Button
            key={m}
            size="xs"
            variant={face.hydro?.method === m ? "pale-on" : "pale"}
            onClick={() => useProject.getState().setHydro(face.hydro?.need ?? "medium", m)}
          >
            {t(`hydroM_${m}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}

function DrawingCard({ onlyConstraints = false }: { onlyConstraints?: boolean }) {
  const t = useT();
  const project = useProject((s) => s.project);
  const selectedEdgeId = useProject((s) => s.selectedEdgeId);
  const d = drawingOrMigrate(project);
  const internal = selectedEdgeId ? isInternalEdge(d, selectedEdgeId) : false;
  return (
    <div className="space-y-1 p-1 sm:space-y-3 sm:p-3">
      {!onlyConstraints && <>
        <div className="flex items-center gap-2 px-2">
          <h2 className="min-w-0 flex-1 break-words text-base font-semibold">{project.name === "Без названия" ? t("untitled") : project.name}</h2>
          <Button onClick={() => useProject.getState().setProjectFormOpen(true)}>{t("edit")}</Button>
        </div>
        <MobileLayers selectedFirst={false} onEdit={(id) => useProject.getState().setCadEdit(id)} onInspect={() => { const st = useProject.getState(); st.setRightMode(st.selectedId ? "object" : "drawing"); st.setRightOpen(true); }} />
      </>}
      {selectedEdgeId && (
        <div className="flex flex-wrap gap-1">
          {d.edges[selectedEdgeId] && Math.abs(d.edges[selectedEdgeId]!.bulge) > 1e-6 && (
            <Button size="xs" variant="pale" onClick={() => useProject.getState().flattenEdge(selectedEdgeId)}>
              {t("flattenArc")}
            </Button>
          )}
          <Button size="xs" variant="pale" onClick={() => {
            const ed = d.edges[selectedEdgeId];
            if (ed) useProject.getState().addCadConstraint("horiz", ed.a, ed.b);
          }}>
            {t("cHoriz")}
          </Button>
          <Button size="xs" variant="pale" onClick={() => {
            const ed = d.edges[selectedEdgeId];
            if (ed) useProject.getState().addCadConstraint("vert", ed.a, ed.b);
          }}>
            {t("cVert")}
          </Button>
          <Button size="xs" variant="pale" onClick={() => useProject.getState().beginConstraint("parallel", selectedEdgeId)}>
            {t("cParallel")}
          </Button>
          <Button size="xs" variant="pale" onClick={() => useProject.getState().beginConstraint("perp", selectedEdgeId)}>
            {t("cPerp")}
          </Button>
          <Button size="xs" variant="pale" onClick={() => useProject.getState().beginConstraint("equalLen", selectedEdgeId)}>
            {t("cEqualLen")}
          </Button>
          <Button size="xs" variant="pale" onClick={() => useProject.getState().alignSelectedEdge(90)}>
            {t("alignV")}
          </Button>
          <Button size="xs" variant="pale" onClick={() => useProject.getState().divideSelectedEdge(3)}>
            {t("divide3")}
          </Button>
          <Button size="xs" variant="pale" onClick={() => useProject.getState().lengthenSelectedEdge(0.5)}>
            {t("lengthen")} +0.5
          </Button>
          <Button size="xs" variant="pale" onClick={() => useProject.getState().lengthenSelectedEdge(-0.5)}>
            {t("lengthen")} −0.5
          </Button>
        </div>
      )}
      {internal && (
        <Button
          size="sm"
          className="w-full"
          variant="pale"
          onClick={() => {
            const r = useProject.getState().removeBoundary(selectedEdgeId!);
            if (r.warning) toast(t("outerEdgeWarn"));
          }}
        >
          {t("removeBoundary")}
        </Button>
      )}
    </div>
  );
}

function CatalogSource({ item }: { item: CatalogItem }) {
  return <div className="mt-3 border-t border-line pt-2 text-[11px] leading-relaxed">
    {item.dataNote && <p className="mb-2 text-muted">{item.dataNote}</p>}
    <a className="text-accent underline underline-offset-2" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Таблица производителя Hunter ↗</a>
    {item.verifiedOn && <p className="mt-1 text-muted">Сверено: {item.verifiedOn.split("-").reverse().join(".")}</p>}
  </div>;
}
function FlowStats({ lpm, m3h }: { lpm: number | null; m3h: number | null }) {
  const flowUnit = useProject(s => s.units.flow);
  const locale = useProject(s => s.locale);
  const tx = useT();
  // Keep custom/US units, with the equivalent hourly metric flow alongside.
  const primary = flowUnit === "m3h" ? "lpm" : flowUnit;
  const unitLabel = locale === "ru"
    ? ({ lpm: "л/мин", lph: "л/ч", gpm: "GPM", gph: "GPH" }[primary])
    : flowLabel(primary);
  return <>
    <Stat k={`${tx("flow")}, ${unitLabel}`} v={lpm == null ? tx("noData") : formatNumber(fromLpm(lpm, primary), 2)}/>
    <Stat k={`${tx("flow")}, ${locale === "ru" ? "м³/ч" : flowLabel("m3h")}`} v={m3h == null ? tx("noData") : formatNumber(m3h, 3)}/>
  </>;
}

function CatalogInfo({ catalogId }: { catalogId: string }) {
  const units=useProject(s=>s.units),target=useProject(s=>s.project.meta.targetMm);
  const item=itemById(catalogId);
  if (!item) return null;
  const defaults=catalogHeadDefaults(item),nozzle=item.nozzles.find(n=>n.id===defaults.nozzleId);
  const strip=stripAtPressure(item,defaults.designPressure);
  const pressure=pressureRange(item,defaults.nozzleId,defaults.arc);
  const fl=computeFlow(item,{arc:defaults.arc,radius:defaults.r,pressureBar:defaults.designPressure,nozzleId:defaults.nozzleId});
  const minutes=fl.precipMmHr!=null?runTimeMin(target,fl.precipMmHr):null;
  return <div className="p-3" aria-label={`Характеристики ${item.id}`}>
    <CatalogPic item={item} className="mx-auto h-28 w-full max-w-[11rem]" />
    <h2 className="mt-2 text-sm font-semibold">Hunter {item.id}</h2>
    <p className="mt-1 text-xs text-muted">{item.name}</p>
    <p className="mt-2 text-xs leading-relaxed">{item.use}</p>
    {item.type==="rotor" && <p className="mt-2 text-xs">По умолчанию: сопло {nozzle?.size??"—"} · {nozzle?.colorName??"Нет данных"}</p>}
    <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-2 text-[11px]">
      <FlowStats lpm={fl.lpm} m3h={fl.m3h}/>
      <Stat k={item.strip?"Полоса при выбранном давлении":"Радиус при выбранном давлении"} v={item.coverageKind==="point"?"Нет данных":item.strip?(strip?`${formatLenU(strip.w,units.length)} × ${formatLenU(strip.l,units.length)}`:"Нет данных"):formatLenU(defaults.r,units.length)}/>
      <Stat k="Рабочее давление" v={formatPressureU(defaults.designPressure,units.pressure)}/>
      <Stat k={item.precipBasis==="single"?"Осаждение без перекрытия":"Осаждение, квадратная схема"} v={fl.precipMmHr==null?"Нет данных":`${fmt1(fl.precipMmHr)} мм/ч`}/>
      <Stat k="Осаждение, треугольная схема" v={fl.precipTriangleMmHr==null?"Нет данных":`${fmt1(fl.precipTriangleMmHr)} мм/ч`}/>
      <Stat k={`Время на ${fmt1(target)} мм`} v={minutes==null?"Нет данных":`${fmt1(minutes)} мин`}/>
      <Stat k="Сектор" v={item.arcMin===item.arcMax?`${item.arcMax}°`:`${item.arcMin}–${item.arcMax}°`}/>
      <Stat k="Диапазон давления сопла" v={pressure ? `${formatPressureU(pressure.min,units.pressure)}–${formatPressureU(pressure.max,units.pressure)}` : "Нет данных"}/>
    </dl>
    <CatalogReference item={item} nozzle={nozzle}/>
    <CatalogSource item={item}/>
  </div>;
}

function HeadCard({ head }: { head: Head }) {
  const item = itemById(head.catalogId);
  const units = useProject((s) => s.units);
  const tx = useT();
  const zones = useProject((s) => s.project.zones);
  const target = useProject((s) => s.project.meta.targetMm);
  if (!item) return <p className="p-1.5 text-[11px] text-warn sm:p-4 sm:text-sm">{tx("modelReview")}</p>;
  const fl = headFlow(head);
  const t = fl.precipMmHr ? runTimeMin(target, fl.precipMmHr) : null;
  const upd = (patch: Partial<Head>) => useProject.getState().updateHead(head.id, patch);
  const live = (patch: Partial<Head>) => useProject.getState().patchHeadLive(head.id, patch);
  const nozzle = head.nozzleId ? item.nozzles.find((n) => n.id === head.nozzleId) : defaultNozzle(item);
  const strip = stripAtPressure(item,head.designPressure);
  const bodies = bodiesFor(item);
  const bodyId = head.bodyId && bodies.some((b) => b.id === head.bodyId) ? head.bodyId : defaultBodyFor(item);
  const { radius, pressure } = headParameterRanges(item, head);
  const pickNozzle = (id: string) => {
    const n = item.nozzles.find((x) => x.id === id);
    if (!n) {
      upd({ nozzleId: id });
      return;
    }
    const st = nozzleRange(n);
    upd({
      nozzleId: id,
      r: st.recR || head.r,
      designPressure: st.recBar,
    });
  };
  return (
    <div className="p-1.5 sm:p-3">
      <div className="relative">
        <CatalogPic item={item} className="mx-auto h-28 w-full max-w-[11rem]" />
        <button type="button" className="head-card-delete" disabled={head.locked || zones.some(z => z.id === head.zone && z.locked)} aria-label={tx("deleteSprinkler")} title={tx("deleteSprinkler")}
          onClick={() => useProject.getState().removeHead(head.id)}><Trash2 size={18}/></button>
      </div>
      <p className="mt-1 text-[10px] font-semibold tracking-wide text-muted uppercase">{item.series}</p>
      <h2 className="font-display text-sm leading-tight">{item.id}</h2>
      <p className="text-[11px] text-ink-soft">{item.name}</p>
      {head.needsReview && <p className="mt-2 text-xs text-warn">Проверьте сопло и давление: сохранённые настройки отсутствуют в актуальной таблице Hunter.</p>}
      {item.type === "rotor" && item.nozzles.length > 1 && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold text-muted">{tx("nozzleSize")} · {tx("automaticNozzle")}</p>
          <div className="mt-1 grid grid-cols-4 gap-1">
            {item.nozzles.map((n) => {
              const on = (head.nozzleId ?? nozzle?.id) === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => pickNozzle(n.id)}
                  aria-pressed={on}
                  title={`${n.name} · ${n.colorName}`}
                  className={cn("h-8 rounded-sm text-[11px] font-semibold tabular", on ? "text-white" : "hover:opacity-90")}
                  style={{ background: on ? n.color : "transparent", color: on && !["белый","светло-коричневый","жёлтый"].includes(n.colorName) ? "#fff" : "var(--color-ink)", border: `1px solid ${on ? n.color : "transparent"}` }}
                >
                  {n.size ?? n.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-2">
        <p className="mb-2 text-xs text-muted">{tx("recommendedPressure")} — {formatPressureU(workingPressureBar(item, bodyId, head.nozzleId), units.pressure)}</p>
        {pressure && <ColorSlider
          label={tx("workingPressure")}
          color="#2563eb"
          min={pressure.min}
          max={pressure.max}
          step={0.1}
          value={Math.max(pressure.min, Math.min(pressure.max, head.designPressure))}
          endLabels={[formatPressureU(pressure.min, units.pressure), formatPressureU(pressure.max, units.pressure)]}
          display={formatPressureU(head.designPressure, units.pressure)}
          onChange={designPressure => live({ designPressure })}
        />}
        {radius && radius.max > radius.min && <ColorSlider
          label={tx("radius")}
          color="#e67a2e"
          min={radius.min}
          max={radius.max}
          step={0.05}
          value={Math.min(radius.max, Math.max(radius.min, head.r))}
          endLabels={[formatLenU(radius.min, units.length), formatLenU(radius.max, units.length)]}
          display={formatLenU(head.r, units.length)}
          onChange={(r) => live({ r })}
        />}
        {item.arcMin !== item.arcMax && (
          <ColorSlider
            label={tx("sector")}
            color="#2a9d5c"
            min={item.arcMin}
            max={item.arcMax}
            step={1}
            value={Math.min(item.arcMax, Math.max(item.arcMin, head.arc))}
            display={`${Math.round(head.arc)}°`}
            onChange={(arc) => live({ arc })}
          />
        )}
        {(item.strip || (item.coverageKind !== "point" && head.arc < 360)) && <ColorSlider
          label={tx("rotation")}
          color="#7b3fd0"
          min={0}
          max={359}
          step={1}
          value={((head.start % 360) + 360) % 360}
          display={`${Math.round(head.start)}°`}
          onChange={(start) => live({ start })}
        />}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
        <FlowStats lpm={fl.lpm} m3h={fl.m3h}/>
        <Stat k={item.strip?"Размер полосы":tx("radius")} v={item.coverageKind==="point"?tx("noData"):item.strip?(strip?`${formatLenU(strip.w,units.length)} × ${formatLenU(strip.l,units.length)}`:tx("noData")):formatLenU(head.r, units.length)} />
        <Stat k={tx("workingPressure")} v={formatPressureU(head.designPressure, units.pressure)} />
        <Stat k={item.precipBasis==="single"?"Осаждение без перекрытия":"Осаждение, квадратная схема"} v={fl.precipMmHr == null ? tx("noData") : `${fmt1(fl.precipMmHr)} ${tx("mmhr")}`} />
        <Stat k="Осаждение, треугольная схема" v={fl.precipTriangleMmHr==null?tx("noData"):`${fmt1(fl.precipTriangleMmHr)} ${tx("mmhr")}`}/>
        <Stat k={`${tx("runTime")} · ${fmt1(target)} мм`} v={t == null ? tx("noData") : `${fmt1(t)} ${tx("min")}`} />
      </dl>
      <CatalogSource item={item}/>

      {item.nozzles.length > 1 && item.type !== "rotor" && (
        <label className="mt-2 block text-[10px] text-muted">
          {tx("nozzle")}
          <select value={head.nozzleId ?? ""} onChange={(e) => pickNozzle(e.target.value)} className="mt-0.5 h-8 w-full rounded-sm bg-bg-2 px-1.5 text-[13px] shadow-border">
            {item.nozzles.map((n) => (
              <option key={n.id} value={n.id}>
                {n.size ? `${n.size} · ${n.name}` : n.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="mt-2 grid grid-cols-1 gap-1.5">
        {item.type !== "rotor" && bodies.length > 0 && (
          <label className="block text-[10px] text-muted">
            {tx("body")}
            <select
              value={bodyId}
              onChange={(e) => {
                const next = e.target.value;
                upd({ bodyId: next, designPressure: workingPressureBar(item, next) });
              }}
              className="mt-0.5 h-8 w-full rounded-sm bg-bg-2 px-1.5 text-[13px] text-ink shadow-border"
            >
              {bodies.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name.replace(/\s+\d+(?:[.,]\d+)?\s*см$/i, "")}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-[10px] text-muted">
          {tx("zone")}
          <select
            value={head.zone}
            onChange={(e) => upd({ zone: Number(e.target.value) })}
            className="mt-0.5 h-8 w-full rounded-sm bg-bg-2 px-1.5 text-[13px] text-ink shadow-border"
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="inline-flex h-7 items-center justify-center gap-1 rounded-sm bg-[#e67a2e] px-1.5 text-[10px] font-semibold text-white"
          onClick={() => useProject.getState().addZone(head.id)}
        >
          <Plus className="size-3.5" />
          {tx("addZone")}
        </button>
      </div>
      <CatalogReference item={item} nozzle={nozzle}/>
    </div>
  );
}

function EstimateCard({ onCheck }: { onCheck: () => void }) {
  const t = useT();
  const project = useProject((s) => s.project);
  const heads = project.heads;
  const bomBodyQty = project.bomBodyQty ?? {};
  const [saveAsk, setSaveAsk] = useState(false);
  const [saving, setSaving] = useState(false);
  const { sprinklers, bodies } = useMemo(() => {
    const spr = new Map<string, { item: CatalogItem; ids: string[] }>();
    const bod = new Map<string, { body: CatalogItem; ids: string[]; recIds: string[] }>();
    for (const h of heads) {
      const item = itemById(h.catalogId);
      if (!item) continue;
      const s = spr.get(item.id) ?? { item, ids: [] };
      s.ids.push(h.id);
      spr.set(item.id, s);
      if (item.type === "rotor") continue;
      const bodyId = h.bodyId ?? defaultBodyFor(item);
      const body = itemById(bodyId);
      if (!body) continue;
      const b = bod.get(body.id) ?? { body, ids: [], recIds: [] };
      b.ids.push(h.id);
      const rec = defaultBodyFor(item);
      if (!b.recIds.includes(rec)) b.recIds.push(rec);
      bod.set(body.id, b);
    }
    return { sprinklers: [...spr.values()], bodies: [...bod.values()] };
  }, [heads]);
  const setBodyQty = (bodyId: string, n: number) => {
    const st = useProject.getState();
    st.patchProject({
      bomBodyQty: { ...(st.project.bomBodyQty ?? {}), [bodyId]: Math.max(0, Math.round(n) || 0) },
    });
  };
  const setBodyKind = (fromId: string, toId: string, ids: string[]) => {
    if (fromId === toId) return;
    const st = useProject.getState();
    const qty = { ...(st.project.bomBodyQty ?? {}) };
    if (qty[fromId] != null) {
      qty[toId] = (qty[toId] ?? 0) + qty[fromId];
      delete qty[fromId];
    }
    st.patchProject({
      heads: st.project.heads.map((h) => (ids.includes(h.id) ? { ...h, bodyId: toId } : h)),
      bomBodyQty: qty,
    });
  };
  const bodyChoices = (ids: string[]) => {
    const seen = new Map<string, CatalogItem>();
    for (const id of ids) {
      const h = heads.find((x) => x.id === id);
      const item = h ? itemById(h.catalogId) : null;
      if (!item) continue;
      for (const b of bodiesFor(item)) seen.set(b.id, b);
    }
    return [...seen.values()];
  };
  return (
    <div className="p-1.5 sm:p-4">
      <Button
        className="w-full"
        variant="solid"
        size="sm"
        disabled={saving || sprinklers.length === 0}
        onClick={() => setSaveAsk(true)}
      >
        {t("saveEstimate")}
      </Button>
      <p className="mt-3 text-[10px] font-semibold tracking-wide text-muted uppercase">{t("estimate")}</p>
      {sprinklers.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted">{t("heads")}: 0</p>
      ) : (
        <ul className="mt-2 space-y-2">
          <li className="flex items-center gap-2 px-1.5 text-[10px] font-semibold text-muted">
            <span className="w-5 text-center">{t("colNo")}</span>
            <span className="flex-1">{t("colName")}</span>
            <span>{t("colQty")}</span>
          </li>
          {sprinklers.map((g, i) => (
            <li key={g.item.id} className="flex items-center gap-2 rounded-sm border border-line p-1.5">
              <span className="w-5 shrink-0 text-center text-[11px] tabular text-muted">{i + 1}</span>
              <CatalogPic item={g.item} className="h-9 w-9" />
              <span className="min-w-0 flex-1 text-[11px] font-medium leading-snug">{bomLineName(g.item)}</span>
              <span className="shrink-0 text-[11px] tabular text-muted">
                {g.ids.length} {t("pcs")}
              </span>
            </li>
          ))}
          {bodies.map((g, i) => {
            const rec = g.recIds.map((id) => itemById(id)).filter(Boolean);
            const n = bomBodyQty[g.body.id] ?? g.ids.length;
            const choices = bodyChoices(g.ids);
            return (
              <li key={g.body.id} className="rounded-sm border border-line p-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-center text-[11px] tabular text-muted">{sprinklers.length + i + 1}</span>
                  <CatalogPic item={g.body} className="h-9 w-9" />
                  <span className="min-w-0 flex-1 text-[11px] font-medium leading-snug">{bomLineName(g.body)}</span>
                  <label className="flex shrink-0 items-center gap-1 text-[10px] text-muted">
                    <input
                      className="h-7 w-11 rounded-sm bg-bg-2 px-1 text-center text-xs tabular shadow-border"
                      inputMode="numeric"
                      value={n}
                      onChange={(e) => setBodyQty(g.body.id, Number(e.target.value) || 0)}
                    />
                    {t("pcs")}
                  </label>
                </div>
                {choices.length > 0 && (
                  <select
                    className="mt-1.5 h-8 w-full rounded-sm bg-bg-2 px-1 text-[11px] text-ink shadow-border"
                    value={g.body.id}
                    onChange={(e) => setBodyKind(g.body.id, e.target.value, g.ids)}
                  >
                    {choices.map((b) => (
                      <option key={b.id} value={b.id}>
                        {bomLineName(b)}
                      </option>
                    ))}
                  </select>
                )}
                {rec.length > 0 && (
                  <p className="mt-1 text-[10px] leading-snug text-muted">
                    {t("recommended")}: {rec.map((b) => bomLineName(b!)).join(", ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Button className="mt-3 w-full" variant="solid" size="sm" onClick={onCheck}>
        {t("checkProject")}
      </Button>
      {saveAsk &&
        createPortal(
          <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/40 p-4" onClick={() => !saving && setSaveAsk(false)}>
            <div className="w-full max-w-sm rounded-lg bg-surface p-5 shadow-border" onClick={(e) => e.stopPropagation()}>
              <p className="font-display text-lg">{t("saveEstimate")}</p>
              <div className="mt-4 flex flex-col gap-2">
                {(
                  [
                    ["pdf", t("estimatePdf"), () => exportEstimatePdf(project, fileStem(project.name) + "-smeta")],
                    ["xls", t("estimateExcel"), () => exportEstimateExcel(project, fileStem(project.name) + "-smeta")],
                    ["doc", t("estimateWord"), () => exportEstimateWord(project, fileStem(project.name) + "-smeta")],
                  ] as const
                ).map(([id, label, run]) => (
                  <Button
                    key={id}
                    variant={id === "pdf" ? "solid" : undefined}
                    className="w-full"
                    size="sm"
                    disabled={saving}
                    onClick={() => {
                      setSaving(true);
                      void run().finally(() => {
                        setSaving(false);
                        setSaveAsk(false);
                      });
                    }}
                  >
                    {label}
                  </Button>
                ))}
                <Button className="w-full" size="sm" variant="pale" onClick={() => setSaveAsk(false)}>
                  {t("cancel")}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function ZoneList({ compact }: { compact?: boolean }) {
  const project = useProject((s) => s.project);
  const activeId = useProject((s) => s.activeZoneId);
  const units = useProject((s) => s.units);
  const t = useT();
  const [openId, setOpenId] = useState<number | null>(null);
  const [zoneAsk, setZoneAsk] = useState<{ id: number; name: string } | null>(null);
  const firstId = [...project.zones].sort((a, b) => a.id - b.id)[0]?.id;
  const canDelete = (id: number) => project.zones.length > 1 && id !== 1 && id !== firstId;
  const askDelete = (id: number) => {
    const z = project.zones.find((x) => x.id === id);
    if (z && canDelete(z.id)) setZoneAsk({ id: z.id, name: z.name });
  };
  const holes = exclusionPolygons(project.polygons);
  const d = drawingOrMigrate(project);
  return (
    <div className="zone-list">
      <div className="flex items-center gap-1">
        <p className="min-w-0 flex-1 px-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase">{t("zonesTitle")}</p>
        <button
          type="button"
          className="grid size-6 place-items-center rounded-sm text-ink-soft hover:bg-bg-2"
          aria-label={t("addZone")}
          onClick={() => useProject.getState().addZone()}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      {project.zones.length === 0 ? (
        <p className="px-0.5 text-[11px] text-muted">{t("noZones")}</p>
      ) : (
        <div className="mt-1 flex flex-col gap-1">
          {project.zones.map((zone) => {
            const heads = project.heads.filter((h) => h.zone === zone.id);
            const n = heads.length;
            const current = zone.id === activeId;
            const open = openId === zone.id;
            const q = zoneFlow(heads, zone.id);
            const pressure = zonePressure(heads, zone.id);
            const faces = Object.values(d.faces).filter((f) => heads.some((h) => headInsideFace(d, f.id, h)));
            const areaM2 = faces.length && faces.every(f => !project.heads.some(h => h.zone !== zone.id && headInsideFace(d, f.id, h)))
              ? faces.reduce((s, f) => s + faceArea(d, f.id), 0)
              : 0;
            const footprint = faces[0] ? facePoints(d, faces[0].id) : lawnPolygon(project.polygons);
            const cov = footprint && footprint.length >= 3 ? coverageStats(footprint, heads, 0.7, holes) : null;
            const precip = areaM2 > 0 && q ? totalAreaPrecip(q, areaM2) : null;
            return (
              <div key={zone.id} className={cn("rounded-sm border border-line", current || open ? "bg-btn-soft" : "bg-surface")}>
                <div className="flex h-8 items-center gap-0.5 px-0.5">
                  <button
                    type="button"
                    className={cn("relative flex size-7 shrink-0 items-center justify-center", zone.hidden ? "text-danger" : "text-muted")}
                    aria-label={zone.hidden ? t("showLayer") : t("hideLayer")}
                    onClick={() => useProject.getState().toggleZoneHidden(zone.id)}
                  >
                    <Eye className="size-3.5" />
                    {zone.hidden && <span className="absolute inset-x-1.5 top-1/2 h-[1.5px] -rotate-45 bg-danger" />}
                  </button>
                  <button
                    type="button"
                    className={cn("flex size-7 shrink-0 items-center justify-center", zone.locked ? "text-danger" : "text-muted")}
                    aria-label={zone.locked ? t("unlockLayer") : t("lockLayer")}
                    onClick={() => useProject.getState().toggleZoneLocked(zone.id)}
                  >
                    {zone.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                  </button>
                  <span
                    className="mx-0.5 size-2.5 shrink-0 rounded-[2px] border border-black/15"
                    style={{ background: zoneColor(zone.id), opacity: zone.hidden ? 0.35 : 1 }}
                  />
                  <button
                    type="button"
                    className={cn("min-w-0 flex-1 truncate text-left text-[11px]", zone.hidden && "text-muted")}
                    onClick={() => useProject.getState().setActiveZone(zone.id)}
                  >
                    {zone.name}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 px-1.5 text-[10px] font-medium text-tool"
                    onClick={() => {
                      useProject.getState().setActiveZone(zone.id);
                      setOpenId(open ? null : zone.id);
                    }}
                  >
                    {t("layerMore")}
                  </button>
                </div>
                <div className="zone-demand" aria-label={`${zone.name}: ${t("flow")}, ${t("zonePressure")}`}>
                  <span>{q == null ? t("noData") : formatFlowU(q, units.flow)}</span>
                  <span title={t("zonePressure")}>{pressure == null ? t("noData") : formatPressureU(pressure, units.pressure)}</span>
                  <span>{t("heads")}: {n}</span>
                </div>
                {open && (
                  <div className={cn("border-t border-line p-2 text-[11px] tabular", compact && "p-1.5")}>
                    <input
                      value={zone.name}
                      onChange={(e) => useProject.getState().renameZone(zone.id, e.target.value)}
                      className="h-7 w-full rounded-sm bg-bg-2 px-2 text-[11px] shadow-border"
                    />
                    <p className="mt-1.5">
                      {t("flow")}: {q == null ? "Нет данных" : formatFlowU(q, units.flow)}
                      {precip != null ? ` · ≈ ${fmt1(precip)} ${t("mmhr")} (оценка по площади)` : ""}
                    </p>
                    <p>
                      {t("heads")}: {n}
                    </p>
                    <p>
                      {t("area")}: {areaM2 > 0 ? formatAreaU(areaM2, units.area) : "—"}
                    </p>
                    <p>
                      {t("coverage1")}: {cov ? `${fmt1(cov.cover1)}%` : "—"}
                    </p>
                    <p>
                      {t("coverage2")}: {cov ? `${fmt1(cov.cover2)}%` : "—"}
                    </p>
                    {canDelete(zone.id) && (
                      <Button size="xs" className="mt-2" variant="pale" onClick={() => askDelete(zone.id)}>
                        {t("delete")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {zoneAsk &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] grid place-items-center bg-ink/40 p-4"
            onPointerUp={() => setZoneAsk(null)}
          >
            <div
              className="w-full max-w-sm rounded-lg bg-surface p-5 shadow-border"
              onPointerUp={(e) => e.stopPropagation()}
            >
              <p className="font-display text-lg">{t("deleteZone")}</p>
              <p className="mt-2 text-sm text-ink-soft">{t("deleteZoneConfirm", { name: zoneAsk.name })}</p>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="solid"
                  className="flex-1"
                  size="sm"
                  onPointerUp={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = zoneAsk.id;
                    setZoneAsk(null);
                    useProject.getState().removeZone(id);
                  }}
                >
                  {t("delete")}
                </Button>
                <Button
                  className="flex-1"
                  size="sm"
                  onPointerUp={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setZoneAsk(null);
                  }}
                >
                  {t("cancel")}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function PumpBox() {
  const t = useT();
  const project = useProject((s) => s.project);
  const units = useProject((s) => s.units);
  const rec = recommendPump(project);
  if (!rec) return project.heads.length ? <p className="mt-2 text-xs text-muted">Расчёт насоса: нет данных о расходе одного или нескольких дождевателей. Проверьте сопла и давление.</p> : null;
  const us = units.flow === "gpm" || units.flow === "gph" || units.pressure === "psi" || units.length === "ft" || units.length === "in";
  const qMain = formatFlowU(rec.qLpm, us ? "gpm" : "lpm");
  const qAlt = formatFlowU(rec.qLpm, us ? "gph" : "m3h");
  const hMain = us ? formatLenU(rec.headM, "ft") : `${Math.round(rec.headM)} ${t("unit_m")}`;
  const hAlt = formatPressureU(rec.pBar, us ? "psi" : "bar");
  return (
    <div className="mt-1.5 rounded-sm bg-bg-2 px-1.5 py-1.5">
      <p className="text-xs font-semibold text-ink">{t("pumpRec")}</p>
      <p className="mt-0.5 text-[11px] font-medium leading-snug">
        Q {qMain} · {qAlt}
      </p>
      <p className="text-[11px] font-medium leading-snug">
        H {hMain} · {hAlt}
      </p>
      <p className="mt-0.5 text-[10px] leading-snug text-muted">
        {t("pumpOneZone")}: {rec.zoneName} ({formatFlowU(rec.zoneMaxLpm, us ? "gpm" : "lpm")})
      </p>
      <p className="mt-1 text-xs text-muted">{t("zonePressure")}: {formatPressureU(rec.workingBar, units.pressure)} · {rec.pressureZoneName}</p>
      <p className="text-[10px] leading-snug text-muted">{t("pumpNote")}</p>
      <details className="mt-2 text-xs text-muted">
        <summary>{t("pumpBasis")}</summary>
        <p className="mt-1">{t("pumpEstimate", { loss: formatPressureU(rec.lossBar, units.pressure), elevation: formatPressureU(rec.elevBar, units.pressure) })}</p>
        <a className="underline" href="https://www.hunterirrigation.com/sites/default/files/dg_student_guide_dom.pdf" target="_blank" rel="noreferrer">Hunter · {t("designGuide")}</a>
      </details>
    </div>
  );
}

function ZoneCard({ zoneId }: { zoneId: number }) {
  const project = useProject((s) => s.project);
  const units = useProject((s) => s.units);
  const t = useT();
  const z = project.zones.find((x) => x.id === zoneId);
  const heads = project.heads.filter((h) => h.zone === zoneId);
  const q = zoneFlow(heads, zoneId);
  const avail = project.water.availableLpm;
  const limit = defaultMaxZoneLpm(avail);
  const [maxLpm, setMaxLpm] = useState(String(limit));
  const patchWater = (patch: Partial<typeof project.water>) =>
    useProject.getState().patchProject({ water: { ...project.water, ...patch } });
  if (!z) return null;
  const over = q != null && q > limit + 0.05;
  return (
    <div className="p-1.5 sm:p-4">
      <p className={cn("text-[11px]", over ? "text-warn" : "text-muted")}>
        {z.name}: {heads.length} · {q == null ? "Нет данных о расходе" : formatFlowU(q, units.flow)}
        {over ? ` · > ${formatFlowU(limit, units.flow)}` : ""}
      </p>
      <p className="mt-2 text-[9px] font-semibold tracking-wide text-muted uppercase">{t("waterSource")}</p>
      <label className="mt-1 block text-[10px] text-muted">
        {t("sourceFlow")}
        <input
          inputMode="decimal"
          value={avail ?? ""}
          placeholder={String(DEFAULT_ZONE_LPM)}
          onChange={(e) => {
            const n = Number(e.target.value.replace(",", "."));
            patchWater({ availableLpm: e.target.value.trim() === "" || !n ? null : n });
            if (n > 0) setMaxLpm(String(n));
          }}
          className="mt-0.5 h-7 w-full rounded-sm bg-bg-2 px-1.5 text-[16px] text-ink shadow-border"
        />
      </label>
      <label className="mt-1 block text-[10px] text-muted">
        {t("sourceP")}
        <input
          inputMode="decimal"
          value={project.water.dynamicBar ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value.replace(",", "."));
            patchWater({ dynamicBar: e.target.value.trim() === "" || !n ? null : n });
          }}
          className="mt-0.5 h-7 w-full rounded-sm bg-bg-2 px-1.5 text-[16px] text-ink shadow-border"
        />
      </label>
      <label className="mt-1 block text-[10px] text-muted">
        {t("elevation")}
        <input
          inputMode="decimal"
          value={project.water.elevationM ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value.replace(",", "."));
            patchWater({ elevationM: e.target.value.trim() === "" ? null : n });
          }}
          className="mt-0.5 h-7 w-full rounded-sm bg-bg-2 px-1.5 text-[16px] text-ink shadow-border"
        />
      </label>
      <label className="mt-2 block text-[10px] text-muted">
        {t("maxZoneFlow")}
        <input
          value={maxLpm}
          onChange={(e) => setMaxLpm(e.target.value)}
          className="mt-0.5 h-7 w-full rounded-sm bg-bg-2 px-1.5 text-[16px] text-ink shadow-border"
        />
      </label>
      <p className="mt-1 text-[10px] text-muted">{t("autoZoneHint")}</p>
      <Button
        className="mt-2 w-full"
        size="sm"
        onClick={() => {
          const n = Number(maxLpm.replace(",", ".")) || defaultMaxZoneLpm(project.water.availableLpm);
          useProject.getState().autoZone(n);
        }}
      >
        {t("autoZone")}
      </Button>
    </div>
  );
}
