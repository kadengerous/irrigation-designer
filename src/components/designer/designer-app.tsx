import {EquipmentLibraryControls,EquipmentDataStatus,EquipmentSeriesSelector,EquipmentGroupNote,EquipmentSubgroupButtons} from "./equipment-library-controls";
import {hunterLibrarySubgroups} from '@/lib/hunter-library';
import {equipmentGroupsFor,equipmentGroupSelection,equipmentGroup,equipmentGroupCatalog,equipmentInnerSeries,equipmentSeriesOptions,equipmentGroupItem} from '@/lib/equipment-groups';
import {equipmentTechnology} from "@/lib/equipment-library";
import {automaticCandidateSupported} from '@/lib/automatic-head';
import {manufacturerName, nozzleTablePressure} from "@/lib/equipment-catalog";
import {engineeringMaterials} from '@/lib/engineering-materials';
"use client";
import {EngineeringWorkspace} from './engineering-workspace';
import {IrrigationSystemCards} from './irrigation-system-cards';
import {EngineeringIcon} from './engineering-symbol';
import {installDesignerSelectionGuard} from "@/lib/designer-selection";
import { CornerRoundingPanel, FigureContextTools, RoundedFigureDimensions } from "./figure-context-tools";
import { contextualFigure, useCornerRounding } from "@/lib/corner-rounding-store";
import { useLayerFillLibrary } from "@/lib/layer-fill-library";
import { cutFigures } from "@/lib/cad/cut-figures";
import { projectRequiresName } from "@/lib/project-store";
import { applyUiSize, uiPixels } from "@/lib/ui-scale";
import { frameUpdate } from "@/lib/frame-update";
import { zoneLabel } from "@/lib/project-types";
import { nozzleName, catalogName, catalogUse, catalogNote, catalogColor, plantName } from "@/lib/catalog-localization";
import { LocalizedNumberInput } from "./localized-number-input";
import { text as uiText } from "@/lib/i18n";

import { FloatingToolbar, AdaptiveTooltip, WorkspacePanelBounds, WorkspaceTooltips } from "./floating-workspace";
import { TapeMeasureIcon } from "./tape-measure-icon";
import { SprinklerIcon } from "./sprinkler-icon";
import { MeasurementResult } from "./measurement-result";
import { CatalogSeriesInfo, CatalogThumb, CatalogReference } from "./catalog-details";
import {coveragePatternLabel, coverageSize, coverageSizeLabel, coverageSizeRange, hasStreamCoverage} from '@/lib/catalog-coverage';
import { PrecipitationStats } from "./precipitation-stats";
import { displayPrecipitation } from "@/lib/precipitation-display";
import { sliderRange, sliderFillPosition } from "@/lib/slider-range";
import { headRadiusScale } from "@/lib/head-adjustment";
import { HEAD_CONTROL_COLORS } from "@/lib/head-sector-edit";
import {LandscapeLibrary} from "./landscape-objects-library";
import {LandscapeLayersPanel} from './landscape-layers-panel';
import {WorkspacePanelTitle} from './workspace-panel-title';
import {LandscapeCategoryBar} from './landscape-category-bar';
import {LandscapeSelectionActions} from './landscape-selection-actions';
import {LandscapeReturnTrash} from './landscape-return-trash';
import { ReferencePanel, useReferenceImport } from "./reference-panel";
import { REFERENCE_ACCEPT, referenceFileKind } from "@/lib/reference-file";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal, flushSync } from "react-dom";
import * as Popover from "@radix-ui/react-popover";
import * as Dialog from "@radix-ui/react-dialog";
import { DirectionProvider } from "@radix-ui/react-direction";
import { localeDirection } from "@/lib/locale-config";
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
  FileImage,
  FileText,
  FilePlus2,
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
import { activeNumberLocale, formatDate, formatNumber, parseLocalizedNumber, setActiveLocale, setNumberPrefs, tr } from "@/lib/i18n";
import { applyTheme } from "@/lib/theme";
import { fromBar, toBar, toLpm, pressureLabel, setActiveUnits, flowLabel, fromLpm, formatAreaU, formatFlowU, formatGridStep, formatLenU, formatPressureU, fromM2, fromMeters, lenLabel, areaLabel, LENGTH_OPTS, toM2, toMetersLen } from "@/lib/units";
import { SettingsPanel } from "@/components/designer/settings-panel";
import { layoutOnDrawing, layoutOnPolygon } from "@/lib/auto-layout";
import { AutomaticPlanControls } from "./automatic-plan-controls";
import { ProjectsSubmenu } from "./projects-submenu";
import { FileSaveDialog } from './file-save-dialog';
import { ProjectExportDialog, ProjectTrashDialog } from "./project-files-dialogs";
import { attachStorageLifecycle, flushProjectStorage } from "@/lib/workspace-storage";
import { coverageStats, exclusionPolygons, lawnPolygon } from "@/lib/coverage";
import { catalogForHead, catalogPressureLabel, equipmentAppearance, CATEGORIES, bodiesFor, bodyForHead, bomLineName, defaultBodyFor, defaultNozzle, itemById, nozzleRange, placeableCatalog, recommendedBodyFor, stripAtPressure, workingPressureBar, type CatalogItem } from "@/lib/equipment-catalog";
import { exportDxf, exportEstimateExcel, exportEstimatePdf, exportEstimateWord, exportPdf, exportPdfFromProject, exportPng, exportPngFromProject, exportProjectJson, exportSvg } from "@/lib/export-plan";
import { downloadProjectFile, fileStem, parseProjectFile, toProjectFile } from "@/lib/project-file";
import { catalogHeadDefaults, computeFlow, geometryAt, pressureRange, headPressureSteps, headFlow } from "@/lib/flow";
import { closedPathSideStarts, dist, fmt1, fmtM, headingDeg, parseMeasureUnit, pointInPoly, polygonArea, toMeters, uid, type Pt } from "@/lib/geometry";
import { parseCadInput } from "@/lib/cad/parse";
import { arcLength, catmullRom, faceArea, faceCentroid, faceEdges, faceLayerNumber, facePerimeter, facePoints, isDrawnCurveFace, isInternalEdge, isTriangleFace, rectMetaMatchesFace, rectWorldCorners, setFaceSideLength, triangleMetrics, mergeLayers, layerFaceIds, layerRepresentatives, layerArea, layerBounds } from "@/lib/cad/engine";
import { segmentFigures, createSegmentFigure } from "@/lib/cad/segment-figures";
import { attachedSegmentFigures, resolveAttachedSegmentFigure } from "@/lib/cad/attached-segment-figures";
import { fusionCandidates, fuseFigures } from "@/lib/cad/fuse-figures";
import { CAD_LAYERS, REGION_FILL, layerForType } from "@/lib/cad/types";
import { DEFAULT_ZONE_LPM, defaultMaxZoneLpm, projectZoneLimit, zoneFlow } from "@/lib/hydro";
import { HeadSelectionActions } from "./head-selection-actions";
import { PressureSteps } from "./pressure-steps";
import { HeadPlacementSettings } from "./head-placement-settings";
import { BodyOptions } from "./body-options";
import { useZoneDeletion } from "./zone-delete-dialog";
import { SectorEditIcon } from "./head-sector-actions";
import { type Head, type Project, zoneColor } from "@/lib/project-types";
import { isNamed, useProject, projectWithView, updateHeadSettings, drawingForEditing as drawingOrMigrate } from "@/lib/project-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CanvasHost } from "@/components/designer/canvas-host";
import { MobilePreview } from "@/components/designer/mobile-preview";
import { MobileGridButton } from "@/components/designer/mobile-grid-button";
import { LayerFillLibrary, layerTitle, LayerColorPicker, MobileLayers, MobileSheet, selectedObjectKey, usePhoneWorkspace, useWorkspaceViewport, type MobilePanel } from "@/components/designer/mobile-workspace";

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
  { id: 0.1 },
  { id: 0.25 },
  { id: 0.5 },
  { id: 1 },
  { id: 2 },
  { id: 5 },
] as const;

function useT() {
  const locale = useProject((s) => s.locale);
  return (key: string, vars?: Record<string, string | number>) => tr(locale, key, vars);
}

export function DesignerApp() {
  useEffect(()=>installDesignerSelectionGuard(document),[]);
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
  const previousMobileHead = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const referenceFileRef = useRef<HTMLInputElement>(null);
  const referenceOpen = useProject(s => s.referenceOpen);
  const referenceImport = useReferenceImport();
  const exportFn = useRef<(() => Promise<string | null>) | null>(null);
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
  const [trashOpen, setTrashOpen] = useState(false);
  const [exportProject, setExportProject] = useState<Project|null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const projectMenuAnchor = useRef<HTMLButtonElement>(null);
  const [gridOpen, setGridOpen] = useState(false);
  const [customGridOpen, setCustomGridOpen] = useState(false);
  const [customGridDraft, setCustomGridDraft] = useState("");
  const [nameAsk, setNameAsk] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [dismissedFusion, setDismissedFusion] = useState("");
  const [libInfo, setLibInfo] = useState<string | null>(null);
  const [catInfo, setCatInfo] = useState<(typeof CATEGORIES)[number]["id"] | null>(null);
  const catalogListRef = useRef<HTMLUListElement>(null);
  const [automaticHeadPanelHost,setAutomaticHeadPanelHost]=useState<HTMLDivElement|null>(null);
  const [irrigationPanelVisit,setIrrigationPanelVisit]=useState(0);
  const [seriesByGroup,setSeriesByGroup]=useState<Record<string,string>>({});

  const project = useProject((s) => s.project);
  const savedProjects = useProject(s=>s.projects);
  const nameRequired = projectRequiresName(project,savedProjects);
  const workspaceSection = useProject(s => s.workspaceSection);
  useEffect(() => {
    if (isPhone && workspaceSection === "plan") setMobilePanel("tools");
  }, [isPhone, workspaceSection]);
  const simulationProjectId = useProject(s => s.simulationProjectId);
  useEffect(() => {
    if (workspaceSection !== "irrigation" || simulationProjectId !== project.id)
      useProject.setState({ simulationProjectId: null });
  }, [workspaceSection, project.id, simulationProjectId]);
  const tool = useProject((s) => s.tool);
  const drawSub = useProject((s) => s.drawSub);
  const polyKind = useProject((s) => s.regionType);
  const selectedEdgeId = useProject((s) => s.selectedEdgeId);
  const cadBuf = useRef("");
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const measureSub = useProject((s) => s.measureSub);
  const placeId = useProject((s) => s.placeId);
  const catalogPlacementArmed=useProject(s=>s.catalogPlacementArmed);
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
  const hideLandscapeInIrrigation=useProject(s=>s.hideLandscapeInIrrigation);
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
  setActiveLocale(locale); setNumberPrefs(numberFormat, decimals); setActiveUnits(units);
  useEffect(() => {
    setActiveLocale(locale);
    setNumberPrefs(numberFormat, decimals);
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
    document.title = tr(locale, "appTitle");
    document.querySelector('meta[name="description"]')?.setAttribute("content", tr(locale, "appDescription"));
  }, [locale, numberFormat, decimals]);
  useEffect(() => {
    const onStorageError = () => toast.error(uiText("storageError"), { duration: 12000 });
    window.addEventListener("project-storage-error", onStorageError);
    return () => window.removeEventListener("project-storage-error", onStorageError);
  }, []);
  useEffect(() => {
    applyTheme(themeId, buttonStyle, accent, themeAccent, themeGradient, themeAccent2);
  }, [themeId, buttonStyle, accent, themeAccent, themeAccent2, themeGradient]);
  useLayoutEffect(() => { applyUiSize(uiSize); }, [uiSize]);
  useEffect(() => { if(selectedId || selectedIds.length) { setLibInfo(null); setCatInfo(null); } }, [selectedId, selectedIds]);
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
  const draft = useProject((s) => s.draft);
  useEffect(() => { setMeasurementResult(null); }, [tool, measureSub, project.id]);
  useEffect(() => { if (draft.measureA) setMeasurementResult(null); }, [draft.measureA]);
  const pointHistoryActive = tool === "draw" && (drawSub === "polygon" || drawSub === "spline" || (drawSub === "cut" && (!!draft.points.length || !!draft.redoPoints?.length)));
  useEffect(() => {
    if (!isPhone) return;
    const deselectedHead = Boolean(previousMobileHead.current && !selectedId);
    previousMobileHead.current = selectedId;
    const selectionKey = selectedObjectKey({ selectedPolyId, selectedId, selectedEdgeId, cadEditId });
    if (mobileInspectTarget.current !== selectionKey) mobileInspectTarget.current = null;
    const editing = (cadEditId && !selectedId) || (selectionKey && mobileInspectTarget.current === selectionKey);
    const constructing = (tool === "draw" && drawSub !== "none") || tool === "measure" || tool === "scale";
    setMobileWorkspaceMode(workspaceSection === "irrigation" ? "irrigation" : "drawing");
    setMobilePanel((current) => {
      if (selectedId && workspaceSection === "irrigation") return "properties";
      if (deselectedHead && current === "properties") return workspaceSection === "irrigation" ? "irrigation" : null;
      // The drawing palette is persistent and is closed only by its dock button.
      if (current === "tools") return current;
      // Only interface state changes here; selecting never enters geometry editing.
      if (editing || constructing || (selectedPolyId && drawingOrMigrate(useProject.getState().project).faces[selectedPolyId]?.segment)) return "properties";
      return current === "properties" ? null : current;
    });
  }, [isPhone, cadEditId, selectedPolyId, selectedId, selectedIds, selectedEdgeId, tool, drawSub, workspaceSection]);
  const lastSeg =
    draft.points.length >= 2
      ? Math.hypot(
          draft.points[draft.points.length - 1]!.x - draft.points[draft.points.length - 2]!.x,
          draft.points[draft.points.length - 1]!.y - draft.points[draft.points.length - 2]!.y,
        )
      : 0;

  const selected = project.heads.find((h) => h.id === selectedId) ?? null;
  const panelMode = workspaceSection === "irrigation"
    ? rightMode === "object" && selected ? "object" : rightMode === "irrigation" ? "irrigation" : "zone"
    : workspaceSection === "landscape" ? "landscape" : "drawing";
  const selectedItem = selected ? catalogForHead(selected) : null;
  const lawnPts = lawnPolygon(project.polygons);
  const holes = exclusionPolygons(project.polygons);
  const area = lawnPts ? Math.max(0, polygonArea(lawnPts) - holes.reduce((s, h) => s + polygonArea(h), 0)) : 0;
  const cover = useMemo(() => {
    const lawn = lawnPolygon(project.polygons);
    if (!lawn) return null;
    return coverageStats(lawn, project.heads, project.heads.length > 36 ? 1.2 : 0.55, exclusionPolygons(project.polygons));
  }, [project.polygons, project.heads]);




  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if(fileMenuOpen){
        if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();setFileMenuOpen(false);setExportDrawOpen(false);setGridOpen(false);}
        return;
      }
      const state=useProject.getState();
      if(state.projectFormOpen||projectRequiresName(state.project,state.projects))return;
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
      if(state.workspaceSection === 'engineering' || state.tool === 'auto-head') return;
      if (e.code === "Space" && !typing) {
        e.preventDefault();
        useProject.getState().setSpaceDown(true);
      }
      const st0 = useProject.getState();
      if (e.key === "Escape" && st0.pendingLandscapeObject) { useProject.setState({pendingLandscapeObject:null}); return; }
      if (e.key === "Escape" && st0.pendingCatalogPlant) { useProject.setState({pendingCatalogPlant:null}); return; }
      if (!typing && st0.tool === "draw") {
        if (/^[0-9٠-٩۰-۹０-９.,٫٬x×;mсм]$/i.test(e.key) || e.key === "Backspace" && cadBuf.current) {
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
      if(fileMenuOpen){if(e.code==='Space')useProject.getState().setSpaceDown(false);return;}
      if (e.code === "Space") {
        useProject.getState().setSpaceDown(false);
        const st = useProject.getState();
        if (!st.draft.points.length) st.setCadMode("select");
      }
      if (e.key === "Shift") useProject.getState().setInferenceLock(null);
    };
    window.addEventListener("keydown", onKey, fileMenuOpen);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", onKey, fileMenuOpen);
      window.removeEventListener("keyup", up);
    };
  }, [fileMenuOpen]);

  useEffect(() => {
    const ready=()=>{const state=useProject.getState();
      if(projectRequiresName(state.project,state.projects))state.setProjectFormOpen(true);
      else state.saveCurrentToLibrary();
      void flushProjectStorage();};
    if(useProject.persist.hasHydrated()) ready();
    const off=useProject.persist.onFinishHydration(ready),detach=attachStorageLifecycle();
    return ()=>{off();detach();};
  }, []);

  useEffect(() => {
    const fit = () => {if(!useProject.getState().project.view)useProject.getState().requestFit();};
    if (useProject.persist.hasHydrated()) {
      fit();
      return;
    }
    return useProject.persist.onFinishHydration(fit);
  }, []);

  const equipmentFilters=useProject(s=>s.equipmentFilters);
  useEffect(()=>{setLibInfo(null);setCatInfo(null);},[equipmentFilters.manufacturerId]);
  const equipmentGroups=equipmentGroupsFor(equipmentFilters.manufacturerId);
  const equipmentGroupId=equipmentGroupSelection(equipmentFilters.manufacturerId,familyFilter);
  const activeEquipmentGroup=equipmentGroup(equipmentFilters.manufacturerId,equipmentGroupId);
  const catalog=useMemo(()=>equipmentGroupCatalog(placeableCatalog(),equipmentFilters.manufacturerId,equipmentGroupId),[equipmentFilters.manufacturerId,equipmentGroupId]);
  const seriesOptions=useMemo(()=>activeEquipmentGroup.browseBySeries?equipmentSeriesOptions(catalog):[],[catalog,activeEquipmentGroup]);
  const seriesKey=`${equipmentFilters.manufacturerId}:${equipmentGroupId}`;
  const storedSeries=seriesByGroup[seriesKey];
  const activeSeries=storedSeries&&seriesOptions.includes(storedSeries)?storedSeries:seriesOptions[0]??'';
  const librarySubgroups=useMemo(()=>hunterLibrarySubgroups(catalog,equipmentGroupId),[catalog,equipmentGroupId]);
  const activeSubgroup=librarySubgroups.find(group=>group.id===storedSeries)??librarySubgroups[0];
  // Subgroups organize browsing; automatic selection retains the full compatibility group.
  const visibleCatalog=activeSubgroup?.catalog??(seriesOptions.length>1?catalog.filter(item=>equipmentInnerSeries(item)===activeSeries):catalog);
  const automaticSupported=visibleCatalog.some(automaticCandidateSupported);
  const inspectedCatalogItem=libInfo?equipmentGroupItem(libInfo,equipmentFilters.manufacturerId,equipmentGroupId):undefined;
  const openEquipmentSeries=(series:string)=>{
    setSeriesByGroup(previous=>({...previous,[seriesKey]:series}));setLibInfo(null);setCatInfo(null);
    const nextCatalog=librarySubgroups.find(group=>group.id===series)?.catalog??(seriesOptions.length>1?catalog.filter(item=>equipmentInnerSeries(item)===series):catalog);
    const manualOnly=!nextCatalog.some(automaticCandidateSupported);
    useProject.setState({catalogPlacementArmed:false,...(manualOnly&&useProject.getState().tool==='auto-head'?{tool:'place' as const}:{})});
    const list=catalogListRef.current;
    if(list)list.scrollTop=0;
    const sheet=list?.closest('.mobile-sheet-body');if(sheet)sheet.scrollTop=0;
  };

  const onUploadFile = (file: File) => {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".dxf")) {
      void file.text().then((txt) => {
        useProject.getState().importDxf(txt);
        toast(t("toastDxfIn"));
        useProject.getState().requestFit();
      });
      return;
    }
    if (referenceFileKind(file)) { void referenceImport.importFile(file); return; }
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
        void flushProjectStorage();
        toast(t("toastOpen"));
      } catch (err) {
        toast(err instanceof Error ? err.message : t("toastOpenFail"));
      }
    };
    reader.readAsText(file);
  };

  const packedNow = (name = project.name) =>
    toProjectFile({
      project: { ...projectWithView(useProject.getState()), name },
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
    try { await downloadProjectFile(packedNow(name.trim())); }
    catch { toast.error(t("toastExportFail")); }
  };

  const runExport = async (kind: "pdf" | "png" | "project") => {
    const name = fileStem(project.name);
    try {
      if (kind === "project") {
        await saveProjectAsFile(project.name);
        return;
      }
      const uri = await exportFn.current?.();
      if (!uri) {
        toast(t("toastCanvas"));
        return;
      }
      if (kind === "png") {
        await exportPng(uri, name);
        return;
      }
      await exportPdf(uri, project, name);
    } catch {
      toast(t("toastExportFail"));
    }
  };

  const exportLibrary = async (p: Project, kind: "pdf" | "dxf" | "png" | "svg" | "json") => {
    const name = fileStem(p.name);
    try {
      if (kind === "pdf") {
        const snap = p.id === project.id ? (await exportFn.current?.()) ?? undefined : undefined;
        await exportPdfFromProject(p, name, snap);
        return;
      }
      if (kind === "dxf") {
        await exportDxf(p, name);
        return;
      }
      if (kind === "png") {
        const snap = p.id === project.id ? await exportFn.current?.() : undefined;
        if (snap) await exportPng(snap, name);
        else await exportPngFromProject(p, name);
        return;
      }
      if (kind === "svg") {
        await exportSvg(p, name);
        return;
      }
      await exportProjectJson(p, name);
    } catch {
      toast(t("toastExportFail"));
    }
  };

  const autoPlace = () => {
    const d = drawingOrMigrate(project);
    const fromCad = layoutOnDrawing(d,catalog,project.water.dynamicBar??undefined);
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
    const technology=catalog[0]&&equipmentTechnology(catalog[0]);
    const layoutFamily=technology==='rotor'?'rotor':technology==='spray'?'spray':familyFilter==='mp800'?'mp800':'mp';
    const placed = layoutOnPolygon(lawnPts,layoutFamily,null,holes,catalog,project.water.dynamicBar??undefined).filter((h) => !holes.some((poly) => pointInPoly(h, poly)));
    if(!placed.length){toast(t("autoHead.noMatch"));return;}
    useProject.getState().setHeads(placed);
    useProject.getState().autoZone(defaultMaxZoneLpm(project.water.availableLpm));
    toast(t("toastAuto"));
  };

  const selectCatalogItem = (id: string) => {
    useProject.getState().selectCatalogItem(id);
    setLibInfo(id);setCatInfo(null);setWorkspaceMultiSelect(false);
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

  const contextualFace = contextualFigure();
  const roundingId = useCornerRounding(s => s.faceId);
  const context = catalogOpen || tool === "measure" || tool === "scale" || tool === "draw" || Boolean(contextualFace);
  const mobileFaceId = selected ? null : cadEditId ?? selectedPolyId;
  const mobileDrawing = drawingOrMigrate(project);
  const groupedLayer = mobileFaceId && mobileDrawing.faces[mobileFaceId]?.layerId ? mobileFaceId : null;
  const mobileFace = mobileFaceId ? mobileDrawing.faces[mobileFaceId] : null;
  const contextTitle = mobileFace ? layerTitle(mobileDrawing, mobileFace.id, locale)
    : selected ? selected.catalogId : tool === "draw" ? t([...DRAW_SUBS, ...MOBILE_EXTRA_DRAW].find((s) => s.id === drawSub)?.key ?? "draw") : tool === "scale" ? t("calibrateScale") : t("measure");
  const selectedSegment = !cadEditId && selectedPolyIds.length === 1 && mobileFace?.segment && !groupedLayer ? mobileFace : null;
  const drawingDimensionsVisible = simulationProjectId !== project.id && !(tool === "draw" && drawSub === "text") && Boolean(selectedSegment || cadEditId || selectedEdgeId || (tool === "draw" && drawSub !== "none"));
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
  const headSelectionActions = selectedIds.length > 1 && <HeadSelectionActions />;
  const hasAttachedSegments = useMemo(() => attachedSegmentFigures(mobileDrawing).some(c=>selectedPolyIds.length<2 || c.parts.every(p=>selectedPolyIds.includes(p.id))), [project.drawing, selectedPolyIds]);
  const fusionIds = useMemo(() => draft.points.length ? [] : fusionCandidates(mobileDrawing, selectedPolyIds), [project.drawing, selectedPolyIds, draft.points.length]);
  const fusionKey = fusionIds.length ? JSON.stringify(fusionIds.map(id => [id, facePoints(mobileDrawing,id)])) : "";
  const fusionActions = !hasAttachedSegments && drawSub !== "cut" && fusionKey && fusionKey !== dismissedFusion && <section className="figure-fusion-actions" role="region" aria-label={t("fuseFigures")}
    onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onTouchMove={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
    <FuseFiguresButton onClick={()=>{
      const st=useProject.getState(), drawing=drawingOrMigrate(st.project);
      const next=fuseFigures(drawing,fusionIds);
      if(next===drawing) return;
      st.setCadEdit(null);
      st.commitDrawing(next,fusionIds[0],true);
      st.setCadMode("select");
      setWorkspaceMultiSelect(false);
      st.selectPoly(fusionIds[0]!);
      setDismissedFusion(fusionKey);
    }}/>
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
  const cutControl = workspaceSection === "plan" && <button type="button" className="mobile-icon-button" aria-label={t("drawCut")} title={t("drawCut")} aria-pressed={tool === "draw" && drawSub === "cut"} onClick={()=>useProject.getState().setDrawSub("cut")}><Scissors/></button>;
  const textControl = <button type="button" className="mobile-icon-button" aria-label={t("drawText")} title={t("drawText")} aria-pressed={tool === "draw" && drawSub === "text"} onClick={()=>useProject.getState().setDrawSub("text")}><Type /></button>;
  const dimensionVisibilityControl = <AdaptiveTooltip label={t(dimensionsHidden ? "showDimensions":"hideDimensions")}>
    <button type="button" className="mobile-icon-button visibility-toggle dimension-visibility-toggle" aria-label={t(dimensionsHidden ? "showDimensions":"hideDimensions")}
      aria-pressed={dimensionsHidden} onClick={()=>useProject.getState().setCadLayer("dims",{visible:dimensionsHidden})}><IconDim/><VisibilitySlash/></button>
  </AdaptiveTooltip>;
  const contextControls = roundingId ? null : editFace?.rounding && cadEditId ? <RoundedFigureDimensions faceId={cadEditId} compact={isPhone}/> : tool === "draw" && (drawSub === "cut" || drawSub === "text") ? null : <div className={isPhone ? "mobile-context-content" : "contents"}>
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
                <Popover.Close asChild><button type="button" className="mobile-icon-button" aria-label={uiText("closeGridStep")}><X size={20} /></button></Popover.Close>
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
                    {formatGridStep(g.id, units.length)}
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
                    setCustomGridDraft(formatNumber(fromMeters(gridStep, units.length), 3));
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
                      const value = parseLocalizedNumber(customGridDraft.trim());
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
                    <span className="shrink-0 text-[0.625rem] text-muted">{lenLabel(units.length)}</span>
                    <button type="submit" aria-label={uiText("applyGridStep")} className="h-8 rounded-sm bg-btn px-2 text-[0.625rem] font-semibold text-btn-fg">
                      ✓
                    </button>
                  </form>
                )}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
  </>;

  const openCatalogFamily = (family: string) => {
    const st = useProject.getState();
    if(st.tool==='auto-head')useProject.setState({tool:'place'});
    st.setFamily(family);st.setCatalogVisible(true);st.setRightMode('irrigation');setLibInfo(null);setCatInfo(null);
  };

  const openAutomaticHead = () => {
    if(!automaticSupported)return;
    const st=useProject.getState();st.setTool('place');st.selectHead(null);st.selectPoly(null);
    useProject.setState({tool:'auto-head',catalogOpen:true,catalogVisible:true,catalogPlacementArmed:false,sectorEditId:null,rightOpen:true,rightMode:'irrigation'});
    if(isPhone)setMobilePanel(null);
    setLibInfo(null);setCatInfo(null);setLayerManagerOpen(false);setWorkspaceMultiSelect(false);
  };

  const WorkspaceStrip = catalogOpen ? "div" : FloatingToolbar;
  const workspaceToolStrip = !isPhone && context && (
        <div className={catalogOpen ? "library-category-bar relative z-30 shrink-0" : "tablet-tool-overlay"} data-right-open={rightOpen} data-cat-bar>
        <WorkspaceStrip className="workspace-tool-strip" role="toolbar" aria-label={t(catalogOpen ? "irrigation" : "draw")}>
          {catalogOpen &&
            <>{equipmentGroups.map((f) => (
              <Button
                key={f.id}
                data-no-tooltip
                size="xs"
                variant={equipmentGroupId === f.id ? "pale-on" : "pale"}
                aria-pressed={equipmentGroupId === f.id}
                onClick={() => openCatalogFamily(f.id)}
              >
                {f.label}
              </Button>
            ))}</>}
          {showHints && tool === "scale" && <p className="px-2 text-xs text-ink-soft">{t("scaleHint")}</p>}
          {!catalogOpen && (tool === "draw" || tool === "measure" || contextualFace) && (
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
          <FigureContextTools onRounding={() => setWorkspaceMultiSelect(false)} />
        </WorkspaceStrip>
        </div>
      );

  return (
    <DirectionProvider dir={localeDirection(locale)}><div className="app-shell bg-bg text-ink" dir={localeDirection(locale)} lang={locale} data-locale={locale} data-mobile={isPhone} data-preview={projectPreview} data-name-required={nameRequired} data-main-menu-open={fileMenuOpen}>
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
              if(nameRequired&&projectFormOpen) {
                (document.activeElement as HTMLElement)?.blur?.();
                flushSync(()=>useProject.getState().setProjectFormOpen(false));
              }
              setFileMenuOpen((v) => !v);
              setExportDrawOpen(false);
              setGridOpen(false);
            }}
          >
            <Menu />
          </Button>
          {fileMenuOpen && createPortal(
            <div className="project-menu fixed z-[150] w-64 rounded-md text-ink shadow-border" style={{
              left: Math.max(8,Math.min(projectMenuAnchor.current?.getBoundingClientRect().left ?? 8,window.innerWidth-uiPixels(256)-16)),
              top:(projectMenuAnchor.current?.getBoundingClientRect().bottom ?? 56)+8,
              maxHeight:`calc(100dvh - ${(projectMenuAnchor.current?.getBoundingClientRect().bottom ?? 56)+16}px)`,overflowY:"auto",
            }}>
              <ProjectsSubmenu onShow={() => {setLayerManagerOpen(false);setGridOpen(false);}} onOpenProject={() => setFileMenuOpen(false)}/>
              <MenuBtn icon={<FilePlus2 className="size-4" />} label={t("newProject")} onClick={() => {
                flushSync(()=>{useProject.getState().saveCurrentToLibrary();useProject.getState().newProject();setFileMenuOpen(false);setMobilePanel(null);});
                document.querySelector<HTMLInputElement>('[data-project-name-input]')?.focus({preventScroll:true});
              }} />
              <MenuBtn icon={<FolderOpen className="size-4" />} label={t("openEditableProject")} onClick={() => { if(fileRef.current)fileRef.current.accept=".ird,.irrigationproject,.json";fileRef.current?.click();setFileMenuOpen(false); }} />
              <MenuBtn disabled={nameRequired} icon={<Save className="size-4" />} label={t("saveProjectCopy")} onClick={() => {setFileMenuOpen(false);void saveProjectAsFile();}} />
              <MenuBtn icon={<Trash2 className="size-4" />} label={t("projectTrash")} onClick={() => {setFileMenuOpen(false);setTrashOpen(true);}} />
              <div className="mx-1 my-1 h-px bg-line" />
              <MenuBtn disabled={nameRequired} icon={<FileDown className="size-4" />} label={t("exportMaterials")} onClick={()=>{setFileMenuOpen(false);setExportProject(project);}} />
              <MenuBtn disabled={nameRequired} icon={<Upload className="size-4" />} label={t("importDxfDrawing")} onClick={() => { if(fileRef.current)fileRef.current.accept=".dxf";fileRef.current?.click();setFileMenuOpen(false); }} />
              <MenuBtn
                disabled={nameRequired}
                onClick={() => {
                  setFileMenuOpen(false);
                  void exportDxf(useProject.getState().project, fileStem(useProject.getState().project.name)).then(
                    () => {},
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
        <button type="button" disabled={nameRequired} className="app-brand-refresh shrink-0"
          aria-label={t("refreshApplication")} title={t("refreshApplication")} onClick={()=>{
            const url=new URL(window.location.href);
            url.searchParams.set("__refresh",String(Date.now()));
            window.location.replace(url.toString());
          }}>
          <span className="app-brand-logo" role="img" aria-label="IRRI — Irrigation Designer">
            <span className="app-brand-mark" aria-hidden="true">
              <img src="/brand/irri-sprinkler-transparent.png" alt="" width={1101} height={682} draggable={false} />
              <img className="app-brand-lettering" src="/brand/irri-sprinkler-transparent.png" alt="" width={1101} height={682} draggable={false} />
            </span>
            <span className="app-brand-caption" aria-hidden="true">
              <img src="/brand/irri-sprinkler-transparent.png" alt="" width={1101} height={682} draggable={false} />
            </span>
          </span>
        </button>
        <div inert={nameRequired} className="scroll-touch flex min-w-0 flex-1 items-center gap-1">
        <Button size="icon" variant="bar" className="max-sm:size-10" disabled={pointHistoryActive && !(drawSub === "cut" && !draft.points.length) ? !draft.points.length : !past.length} onClick={() => useProject.getState().undo()} aria-label={t("undo")}>
          <Undo2 />
        </Button>
        <Button size="icon" variant="bar" className="max-sm:size-10" disabled={pointHistoryActive ? !(draft.redoPoints?.length || draft.redoClosure) : !future.length} onClick={() => useProject.getState().redo()} aria-label={t("redo")}>
          <Redo2 />
        </Button>
        <nav className="workspace-sections" aria-label={t("mainSections")}>
          <Button size="sm" variant={referenceOpen ? "bar-on" : "bar"} title={t("reference")} aria-pressed={referenceOpen} onClick={() => {
            useProject.getState().setReferenceOpen(!referenceOpen); setMobilePanel(null); setFileMenuOpen(false); setLayerManagerOpen(false);
          }}><FileImage /><span>{t("reference")}</span></Button>
          <span className="workspace-section-divider" aria-hidden="true" />
          <Button size="sm" variant={!referenceOpen && workspaceSection === "plan" ? "bar-on" : "bar"} aria-pressed={!referenceOpen && workspaceSection === "plan"} title={t("plan")} onClick={() => {
            if (!referenceOpen && workspaceSection === "plan") {
              useProject.getState().deactivateDrawing();
              setMobilePanel(null);setMobileLayersVisible(false);setLayerManagerOpen(false);setGridOpen(false);setWorkspaceMultiSelect(false);
              return;
            }
            const st = useProject.getState(); st.setReferenceOpen(false); st.setLandscapeOpen(false); st.setCatalogOpen(false); st.setTool("draw"); st.setRightMode("drawing");
            setLibInfo(null); setCatInfo(null);
            setMobilePanel(isPhone ? "tools" : null); setWorkspaceMultiSelect(false);
          }}><Pencil /><span>{t("plan")}</span></Button>
          <Button size="sm" variant={!referenceOpen && workspaceSection === "landscape" ? "bar-on" : "bar"} aria-pressed={!referenceOpen && workspaceSection === "landscape"} title={t("landscape")} onClick={() => {
            const st = useProject.getState(); st.setReferenceOpen(false); st.setLandscapeOpen(!landscapeOpen);
            setMobilePanel(null); setLayerManagerOpen(false); setWorkspaceMultiSelect(false);
          }}><Trees /><span>{t("landscape")}</span></Button>
          <Button size="sm" variant={!referenceOpen && workspaceSection === "irrigation" ? "bar-on" : "bar"} aria-pressed={!referenceOpen && workspaceSection === "irrigation"} title={t("irrigation")} onClick={() => {
            const st = useProject.getState(); st.setReferenceOpen(false); st.setLandscapeOpen(false); st.setCatalogOpen(true); st.setCatalogVisible(true); st.setRightMode("zone");
            setLibInfo(null); setCatInfo(null);
            setMobilePanel(isPhone ? "library" : null); setGridOpen(false); setFileMenuOpen(false);
          }}><SprinklerIcon width={20} height={20} /><span>{t("irrigation")}</span></Button>
          <Button size="sm" variant={!referenceOpen && workspaceSection === 'engineering' ? 'bar-on' : 'bar'} aria-pressed={!referenceOpen && workspaceSection === 'engineering'} title={t('engineering.title')} onClick={()=>{
            const st=useProject.getState();
            if(st.groupMemberId)st.finishGroupMember();
            st.cancelDraft();st.setCadEdit(null);st.selectHead(null);st.selectPoly(null);
            st.setReferenceOpen(false);st.setLandscapeOpen(false);st.setCatalogOpen(false);
            useProject.setState({workspaceSection:'engineering',tool:null,drawSub:'none',sectorEditId:null,pendingCatalogPlant:null,pendingLandscapeObject:null});
            setMobilePanel(null);setLayerManagerOpen(false);setWorkspaceMultiSelect(false);setGridOpen(false);setLibInfo(null);setCatInfo(null);
          }}><EngineeringIcon/><span>{t('engineering.title')}</span></Button>
        </nav>
        </div>
        <div inert={nameRequired} className="flex shrink-0 items-center gap-1 pl-1">
          {previewControl}
          {workspaceSection === "irrigation" && <button type="button" className="mobile-icon-button workspace-header-action simulation-control"
            aria-pressed={simulationProjectId === project.id} aria-label={t("simulation")}
            title={t(simulationProjectId === project.id ? "stopSimulation" : "simulation")}
            onClick={() => useProject.getState().toggleSimulation()}><Droplets />{!isPhone && <span>{t("simulation")}</span>}</button>}
          <EstimateDialog mobile={isPhone} onOpen={() => {
            setMobilePanel(null); setGridOpen(false); setFileMenuOpen(false);
          }} />
        </div>
      </header>

      {projectFormOpen && <ProjectFormBar key={project.id} allowMenu={nameRequired} />}
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

      {workspaceSection === 'engineering' && !referenceOpen ? <EngineeringWorkspace key={project.id} onExportReady={fn=>{exportFn.current=fn;}}/> : <>
      {workspaceSection === "landscape" ? <LandscapeCategoryBar /> : catalogOpen && workspaceToolStrip}
      <div inert={nameRequired} className="designer-workspace relative flex min-h-0 flex-1">
        <LayerFillLibrary />
        {workspaceSection === 'irrigation' && simulationProjectId === project.id && <div className="simulation-note" role="status">{t('simulationApproximate')}</div>}
        {referenceOpen && <ReferencePanel busy={referenceImport.busy} onUpload={() => referenceFileRef.current?.click()} />}
        {tool === "scale" && <div className="reference-scale-banner" role="status"><span>{t("referenceCalibrateHint")}</span><Button size="xs" onClick={() => { useProject.getState().cancelDraft(); useProject.getState().setTool(null); useProject.getState().setReferenceOpen(true); }}>{t("cancel")}</Button></div>}

        {workspaceSection !== "landscape" && !catalogOpen && workspaceToolStrip}
        {landscapeOpen && <LandscapeLibrary mobile={isPhone} />}

        {!isPhone && catalogOpen && catalogVisible && (
          <aside
            className={cn(
              "library-panel absolute inset-y-0 left-0 z-30 flex w-56 flex-col border-r border-line",
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
            <EquipmentLibraryControls/>
            <EquipmentSeriesSelector series={seriesOptions} value={activeSeries} onChange={openEquipmentSeries}/>
            <EquipmentSubgroupButtons groups={librarySubgroups} value={activeSubgroup?.id??''} onChange={openEquipmentSeries}/>
            {showHints && <p className="px-1.5 pt-0.5 text-[0.625rem] leading-snug text-muted">{t("dragHint")}</p>}
            <div className="mt-1.5 flex min-h-0 flex-1">
            <ul
              ref={catalogListRef}
              className="catalog-list min-h-0 flex-1 overflow-y-auto px-1 pb-3"
            >
              {automaticSupported&&<li><AutomaticLibraryCard active={tool==='auto-head'} onClick={openAutomaticHead}/></li>}
              {visibleCatalog.map((c) => (
                <li key={c.id}>
                  <EquipmentLibraryCard item={c} selected={placeId===c.id && tool!=='auto-head'} onSelect={()=>selectCatalogItem(c.id)}/>
                  <EquipmentDataStatus item={c}/>
                </li>
              ))}
              {!visibleCatalog.length&&<li className="p-3 text-xs text-muted">{t("equipment.empty")}</li>}
            </ul>
            {visibleCatalog.length > 0 && <CatalogScroller listRef={catalogListRef} dep={`${seriesKey}:${activeSubgroup?.id??activeSeries}:${visibleCatalog.length}`} />}
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
          {isPhone && (fusionActions || layerManagerOpen || mobilePanel === "tools" || contextualFace || mobileWorkspaceMode === "irrigation" || mobileLayersVisible) && <div className="mobile-top-overlays" data-magnifier-top-panel>
            {(mobilePanel === "tools" || contextualFace) && <div className="mobile-tool-stack">
              <div className="mobile-tool-strip-panel" role="toolbar" aria-label={uiText("tools")}>
                <div className="mobile-tool-strip scroll-touch">
                  {DRAW_SUBS.filter((item) => item.id !== "arc" && item.id !== "dim" && item.id !== "text").map((item) => <button key={item.id} type="button" aria-label={t(item.key)} title={t(item.key)} aria-pressed={tool === "draw" && drawSub === item.id} onClick={() => chooseMobileTool(() => useProject.getState().setDrawSub(item.id))}>{item.icon}</button>)}
                  <FigureContextTools onRounding={() => {setWorkspaceMultiSelect(false);setMobilePanel(null);}} />
                </div>
              </div>
            </div>}
            {layerManagerOpen && <section className="mobile-layer-manager" role="region" aria-label={t("layerManager")}
              onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onTouchMove={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==="Escape")setLayerManagerOpen(false);}}>
              <header><WorkspacePanelTitle section={workspaceSection}/><button type="button" aria-label={t("close")} onClick={()=>setLayerManagerOpen(false)}><X size={18}/></button></header>
              {workspaceSection === "landscape" ? <LandscapeLayersPanel /> : workspaceSection === "irrigation" ? <IrrigationSystemCards /> : <MobileLayers manager selectedFirst={false} onEdit={id=>{useProject.getState().setCadEdit(id);setLayerManagerOpen(false);setMobilePanel("properties");}} />}
            </section>}
            {workspaceSection !== "landscape" && !layerManagerOpen && !bulkSelection && (workspaceSection === "irrigation" || mobileLayersVisible) && <section className="mobile-top-layers" data-workspace-mode={mobileWorkspaceMode} aria-label={mobileWorkspaceMode === "drawing" ? t("layers") : t("irrigation")}
              onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              {workspaceSection !== "irrigation" ? <MobileLayers onEdit={(id) => { useProject.getState().setCadEdit(id); setMobilePanel("properties"); }} onInspect={() => { mobileInspectTarget.current = selectedObjectKey(useProject.getState()); setMobilePanel("properties"); }} /> : <div className="mobile-zone-strip">
                {project.zones.map((zone) => <button type="button" key={zone.id} aria-pressed={zone.id === activeZoneId} onClick={() => useProject.getState().setActiveZone(zone.id)}><span style={{ background: zoneColor(zone.id) }} />{zoneLabel(zone)}</button>)}
                <Popover.Root modal><Popover.Trigger asChild><button type="button" aria-label={uiText("zoneInfo")}>{uiText("details")}<ChevronRight size={16} /></button></Popover.Trigger><Popover.Portal><Popover.Content side="bottom" align="end" sideOffset={4} collisionPadding={8} aria-label={uiText("irrigationZones")} className="layer-details-dialog" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}><div className="layer-dialog-body"><IrrigationSystemCards /><Popover.Close asChild><Button className="w-full">{uiText("close")}</Button></Popover.Close></div></Popover.Content></Popover.Portal></Popover.Root>
              </div>}
            </section>}
            {!layerManagerOpen && fusionActions}
          </div>}
          <CanvasHost
            automaticHeadPanelHost={automaticHeadPanelHost}
            mobile={isPhone}
            shortcutsDisabled={fileMenuOpen}
            multiSelect={workspaceMultiSelect && selectionModeAvailable}
            onSelectionClear={() => setWorkspaceMultiSelect(false)}
            onScalePair={(a, b) => { setScaleValue(formatNumber(fromMeters(5, units.length), 2)); setScalePair({ a, b }); }}
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

        {isPhone && rightOpen && workspaceSection === "landscape" && <aside className="info-panel landscape-phone-inspector" aria-label={t("landscapeObjectsTitle")}>
          <div className="workspace-panel-heading"><WorkspacePanelTitle section={workspaceSection}/><Button onClick={() => useProject.getState().setRightOpen(false)} aria-label={uiText("hide")}><X />{uiText("hide")}</Button></div>
          <LandscapeLayersPanel />
        </aside>}
        {isPhone && tool==='auto-head' && rightOpen && <aside data-mobile-sheet="automatic-head" className="info-panel landscape-phone-inspector automatic-phone-inspector" aria-label={t('autoHead.title')}>
          <div className="workspace-panel-heading"><strong>{uiText('irrigationInfo')}</strong><Button onClick={()=>useProject.getState().setRightOpen(false)} aria-label={t('hide')}><ChevronRight/>{t('hide')}</Button></div>
          <div ref={setAutomaticHeadPanelHost} data-auto-head-panel-host/>
          <EquipmentGroupNote group={activeEquipmentGroup} catalog={visibleCatalog}/>
        </aside>}
        {isPhone && tool==='auto-head' && !rightOpen && <button className="tablet-panel-handle" type="button" onClick={()=>useProject.getState().setRightOpen(true)} aria-label={t('autoHead.title')}><ChevronLeft/></button>}
        {isPhone && tool!=='auto-head' && mobilePanel!=="library" && rightOpen && (catInfo || libInfo) && rightMode === "irrigation" && <aside className="info-panel landscape-phone-inspector" aria-label={uiText("irrigationInfo")}>
          <div className="workspace-panel-heading"><strong>{catInfo ? t(`cat_${catInfo}`) : uiText("headTab")}</strong><Button onClick={() => { setLibInfo(null); setCatInfo(null); useProject.getState().setRightOpen(false); }} aria-label={uiText("hideHeadCard")}><X />{uiText("hide")}</Button></div>
          <IrrigationSystemCards selection={{key:catInfo?`series:${catInfo}`:`catalog:${libInfo}`,title:catInfo?t(`cat_${catInfo}`):inspectedCatalogItem?catalogName(inspectedCatalogItem):libInfo,content:<>{catInfo ? <CatalogSeriesInfo key={catInfo} family={catInfo} /> : libInfo && <CatalogInfo catalogId={libInfo} item={inspectedCatalogItem}/>}<EquipmentGroupNote group={activeEquipmentGroup} catalog={visibleCatalog}/></>}}/>
        </aside>}
        {!isPhone && (rightOpen ? (
          <aside className="info-panel absolute inset-x-0 top-0 z-40 flex max-h-[45vh] flex-col overflow-y-auto border-b border-line bg-surface shadow-border sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-none sm:w-[min(100%,22rem)] lg:w-[20rem]">
            <div className="workspace-panel-heading hidden shrink-0 items-center gap-2 border-b border-line px-2 py-2 sm:flex">
              <Button
                type="button"
                size="xs"
                variant="solid"
                className="workspace-panel-hide shrink-0 border-line bg-surface text-ink hover:bg-btn-soft"
                onClick={() => useProject.getState().setRightOpen(false)}
              >
                {t("hide")}
                <ChevronRight className="size-3.5" />
              </Button>
              {tool==='auto-head'?<strong className="ms-auto">{uiText('irrigationInfo')}</strong>:workspaceSection === "irrigation" ? <button type="button" className="zones-navigation ml-auto"
                aria-pressed={panelMode === "zone"} onClick={() => {
                  setIrrigationPanelVisit(value=>value+1);
                  setLibInfo(null); setCatInfo(null); useProject.getState().endHeadEdit(); useProject.getState().setRightMode("zone");
                }}><WorkspacePanelTitle section={workspaceSection}/></button> : <div className="ms-auto"><WorkspacePanelTitle section={workspaceSection}/></div>}
            </div>
            {tool==='auto-head'?<div ref={setAutomaticHeadPanelHost} data-auto-head-panel-host/>:panelMode === "landscape" ? <LandscapeLayersPanel /> : panelMode === "zone" || panelMode === "object" || panelMode === "irrigation" ? (
              <IrrigationSystemCards key={irrigationPanelVisit} selection={panelMode === "irrigation" && catInfo ? {
                key:`series:${catInfo}`,title:t(`cat_${catInfo}`),content:<><CatalogSeriesInfo key={catInfo} family={catInfo}/><EquipmentGroupNote group={activeEquipmentGroup} catalog={visibleCatalog}/></>
              } : panelMode === "irrigation" && libInfo ? {
                key:`catalog:${libInfo}`,title:inspectedCatalogItem?catalogName(inspectedCatalogItem):libInfo,content:<><CatalogInfo catalogId={libInfo} item={inspectedCatalogItem}/><EquipmentGroupNote group={activeEquipmentGroup} catalog={visibleCatalog}/></>
              } : panelMode === "object" && selected && selectedItem && selectedIds.length <= 1 ? {
                key:`head:${selected.id}`,title:catalogName(selectedItem),content:<HeadCard head={selected}/>
              } : undefined}/>
            ) : (
              <DrawingCard />
            )}
            {tool==='auto-head'&&<EquipmentGroupNote group={activeEquipmentGroup} catalog={visibleCatalog}/>}
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

      <footer inert={nameRequired} className="app-footer relative z-30 flex min-h-11 shrink-0 items-center gap-2 border-t border-line bg-surface px-2 py-1 text-xs">
        <div className="footer-tools-scroll scroll-touch">
        {isPhone && <nav className="mobile-canvas-controls" aria-label={uiText("gridNavigation")}>
          {cursorControl}
          {selectionControls}
          {textControl}
          {cutControl}
          <button type="button" className="mobile-icon-button" aria-label={t("drawDim")} title={t("drawDim")} aria-pressed={tool === "draw" && drawSub === "dim"} onClick={() => chooseMobileTool(() => useProject.getState().setDrawSub("dim"))}><IconDim /></button>
          <button type="button" className="mobile-icon-button" aria-label={t("ruler")} title={t("ruler")} aria-pressed={tool === "measure" && measureSub === "measure"} onClick={() => chooseMobileTool(() => useProject.getState().setMeasureSub("measure"))}><TapeMeasureIcon /></button>
          {viewControls}
          <AutomaticPlanControls/>
          <button type="button" className="mobile-icon-button" aria-label={t("layerManager")} aria-pressed={layerManagerOpen} onClick={() => { setLayerManagerOpen(open=>!open); setMobileWorkspaceMode("drawing"); setMobilePanel(null); setGridOpen(false); }}><Layers /></button>
          {gridControls}
          {textVisibilityControl}
          {dimensionVisibilityControl}
        </nav>}
        {!isPhone && <nav className="workspace-canvas-controls tablet-canvas-controls" aria-label={t("canvasControls")}>
          {cursorControl}
          {selectionControls}
          {textControl}
          {cutControl}
          <button type="button" className="mobile-icon-button" aria-label={t("drawDim")} title={t("drawDim")} aria-pressed={tool === "draw" && drawSub === "dim"} onClick={() => useProject.getState().setDrawSub("dim")}><IconDim /></button>
          <button type="button" className="mobile-icon-button" aria-label={t("ruler")} title={t("ruler")} aria-pressed={tool === "measure" && measureSub === "measure"} onClick={() => useProject.getState().setMeasureSub("measure")}><TapeMeasureIcon /></button>
          {viewControls}
          <AutomaticPlanControls/>
          <button type="button" className="mobile-icon-button" aria-label={t(workspaceSection === "irrigation" ? "zonesTitle" : "layerManager")} title={t(workspaceSection === "irrigation" ? "zonesTitle" : "layerManager")} aria-pressed={rightOpen} onClick={() => {
            if (rightOpen) useProject.getState().setRightOpen(false);
            else useProject.getState().setRightMode(workspaceSection === "irrigation" ? "zone" : "drawing");
          }}><Layers /></button>
          <div className="tablet-grid-controls">{gridControls}</div>
          {textVisibilityControl}
          {dimensionVisibilityControl}
        </nav>}
        {(project.heads.length > 0 || workspaceSection==='irrigation') && (
          <div className="workspace-canvas-controls irrigation-visibility-controls">
            {workspaceSection==='irrigation'&&<AdaptiveTooltip label={t(hideLandscapeInIrrigation?"showLandscape":"hideLandscape")}>
              <button type="button" className="mobile-icon-button visibility-toggle" aria-label={t(hideLandscapeInIrrigation?"showLandscape":"hideLandscape")}
                aria-pressed={hideLandscapeInIrrigation} onClick={()=>useProject.setState({hideLandscapeInIrrigation:!hideLandscapeInIrrigation})}><Trees/><VisibilitySlash/></button>
            </AdaptiveTooltip>}
            {project.heads.length>0&&<>
            <AdaptiveTooltip label={t(showCoverage ? "hideSectors" : "showSectors")}>
              <button type="button" className="mobile-icon-button visibility-toggle" aria-label={t(showCoverage ? "hideSectors" : "showSectors")}
                aria-pressed={!showCoverage} onClick={() => useProject.getState().setCoverage(!showCoverage)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 20V4a16 16 0 0 1 16 16Z"/><path d="M4 9a11 11 0 0 1 11 11" strokeDasharray="2 3"/>
                </svg><VisibilitySlash/>
              </button>
            </AdaptiveTooltip>
            <AdaptiveTooltip label={t(showLabels ? "hideHeadLabels" : "showHeadLabels")}>
              <button type="button" className="mobile-icon-button visibility-toggle" aria-label={t(showLabels ? "hideHeadLabels" : "showHeadLabels")}
                aria-pressed={!showLabels} onClick={() => useProject.getState().setLabels(!showLabels)}><Tag/><VisibilitySlash/></button>
            </AdaptiveTooltip>
            </>}
          </div>
        )}
        </div>
      </footer>
      </>}
      <div className="desktop-bottom-actions note-actions-host" data-note-actions />
      <LandscapeSelectionActions/>
      <LandscapeReturnTrash/>
      {isPhone ? <>{drawSub === "cut" ? <CutFigureConfirmation/> : <SegmentFigureConfirmation deletingSelection={bulkDeleteConfirm}
        onDeleteSelected={bulkSelection ? () => setBulkDeleteConfirm(true) : undefined} />}
        {headSelectionActions && <div className="desktop-bottom-actions"><div className="figure-actions-surface">{headSelectionActions}</div></div>}
        </> : (
        <div className="desktop-bottom-actions">
          <div className="figure-actions-surface">
            {headSelectionActions}
            {bulkActions}
            {fusionActions}
            {drawSub === "cut" ? <CutFigureConfirmation/> : <SegmentFigureConfirmation deletingSelection={bulkDeleteConfirm}
              onDeleteSelected={bulkSelection ? () => setBulkDeleteConfirm(true) : undefined} />}
          </div>
        </div>
      )}

      {isPhone && !bulkSelection && mobilePanel === "tools" && drawingDimensionsVisible && !groupedLayer && <section data-mobile-sheet="tool-properties" className="mobile-parameter-bar mobile-tool-parameter-bar" role="region" aria-label={contextTitle}
        onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
        <div className="mobile-parameter-scroll">
          {cadEditId && editingNodeContour && <div className="mobile-face-dimensions">{mobileFaceDimensions.map((dimension, index) => <span key={index}>{dimension.label}<output>{dimension.kind === "area" ? formatAreaU(dimension.value, units.area) : formatLenU(dimension.value, units.length)}</output></span>)}</div>}
          {contextControls}
        </div>
      </section>}

      {isPhone && !mobilePanel && tool === "place" && catalogPlacementArmed && <div className="mobile-placement-hint"><span>{placeId} {uiText("dragLibrary")}</span><button type="button" aria-label={uiText("finishPlacement")} onClick={() => useProject.getState().setTool(null)}><X size={20} /></button></div>}
      {isPhone && !((bulkSelection || headSelectionActions || groupedLayer || (!selected && !drawingDimensionsVisible && tool !== "measure" && tool !== "scale")) && mobilePanel === "properties") && mobilePanel && mobilePanel !== "layers" && mobilePanel !== "tools" && <MobileSheet panelKey={mobilePanel} compact={mobilePanel === "properties" && !selected} title={mobilePanel === "library" ? t("library") : mobilePanel === "irrigation" ? t("zonesTitle") : contextTitle} onClose={() => setMobilePanel(null)}
        footer={mobilePanel === "properties" && selected ? <div className="mobile-context-footer">
          <Button className="ml-auto" aria-label={uiText("drawFinish")} title={uiText("drawFinish")} onPointerDown={(e) => e.preventDefault()} onClick={() => { (document.activeElement as HTMLElement)?.blur?.(); if (selected) setMobilePanel(null); }}><Check /></Button>
        </div> : undefined}>
        {mobilePanel === "library" && <div className="mobile-catalog" data-catalog>
          <EquipmentLibraryControls/>
          <div className="mobile-catalog-navigation">
          <div className="mobile-categories" data-cat-bar>{equipmentGroups.map(category=><button type="button" key={category.id} data-no-tooltip aria-pressed={equipmentGroupId===category.id} onClick={()=>openCatalogFamily(category.id)}>{category.label}</button>)}</div>
          <EquipmentSeriesSelector series={seriesOptions} value={activeSeries} onChange={openEquipmentSeries}/>
          <EquipmentSubgroupButtons groups={librarySubgroups} value={activeSubgroup?.id??''} onChange={openEquipmentSeries}/>
          </div>
          <div className="mobile-library-actions"><span>{uiText("catalogGestureHint")}</span></div>
          <ul className="mobile-catalog-list" ref={catalogListRef}>
            {automaticSupported&&<li><AutomaticLibraryCard active={tool==='auto-head'} onClick={openAutomaticHead}/></li>}
            {visibleCatalog.map(item=><li key={item.id} className="mobile-catalog-card" data-selected={placeId===item.id && tool!=='auto-head'}>
              <EquipmentLibraryCard item={item} selected={placeId===item.id && tool!=='auto-head'} onSelect={()=>selectCatalogItem(item.id)}/>
              <EquipmentDataStatus item={item}/>
              {rightOpen && rightMode==='irrigation' && libInfo===item.id && <div className="mobile-catalog-info"><CatalogInfo catalogId={item.id} item={item}/><EquipmentGroupNote group={activeEquipmentGroup} catalog={visibleCatalog}/></div>}
            </li>)}
          </ul>
        </div>}
        {mobilePanel === "properties" && <>
          {!groupedLayer && mobileFace && cadEditId && editingNodeContour && <div className="mobile-face-dimensions">{mobileFaceDimensions.map((dimension, index) => <span key={index}>{dimension.label}<output>{dimension.kind === "area" ? formatAreaU(dimension.value, units.area) : formatLenU(dimension.value, units.length)}</output></span>)}</div>}
          {selected ? <IrrigationSystemCards selection={selectedIds.length > 1 ? undefined : {key:`head:${selected.id}`,title:selectedItem?catalogName(selectedItem):selected.catalogId,content:<HeadCard head={selected} onZones={() => {
            setLibInfo(null); setCatInfo(null); useProject.getState().endHeadEdit(); useProject.getState().setRightMode("zone"); setMobilePanel("irrigation");
          }}/>} }/> : drawingDimensionsVisible ? contextControls : null}
          {showHints && tool === "scale" && <p className="mobile-context-hint">{t("scaleHint")}</p>}
          {showHints && tool === "measure" && <p className="mobile-context-hint">{uiText("chooseTwoPoints")}</p>}
        </>}
        {mobilePanel === "irrigation" && <IrrigationSystemCards/>}
      </MobileSheet>}

      <CornerRoundingPanel/>
      {referenceImport.picker}
      <input ref={referenceFileRef} type="file" accept={REFERENCE_ACCEPT} hidden onChange={e => {
        const file = e.target.files?.[0]; if (file) void referenceImport.importFile(file); e.target.value = "";
      }} />
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
            <label className="mt-3 flex items-center gap-2">
            <input
              aria-label={`${t("actualDistance")}, ${lenLabel(units.length)}`}
              value={scaleValue}
              onChange={(e) => setScaleValue(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-md bg-bg-2 px-3 text-sm shadow-border"
              inputMode="decimal"
              autoFocus
            />
            <span className="shrink-0 text-sm font-medium">{lenLabel(units.length)}</span>
            </label>
            <div className="mt-3 flex gap-2">
              <Button
                variant="solid"
                className="flex-1"
                size="sm"
                onClick={() => {
                  const n = parseLocalizedNumber(scaleValue);
                  if (!Number.isFinite(n) || n <= 0 || dist(scalePair.a, scalePair.b) < 1e-6) { toast.error(t("referenceDistanceError")); return; }
                  useProject.getState().applyScale(scalePair.a, scalePair.b, toMeters(n, units.length));
                  setScalePair(null);
                  toast(t("scaleCalibrated"));
                }}
              >
                {t("apply")}
              </Button>
              <Button
                className="flex-1 reference-scale-cancel"
                size="sm"
                onClick={() => {
                  setScalePair(null);
                  useProject.getState().cancelDraft();
                  useProject.getState().setTool(null);
                  useProject.getState().setReferenceOpen(true);
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

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}

      <ProjectExportDialog project={exportProject} onClose={()=>setExportProject(null)}/>
      <ProjectTrashDialog open={trashOpen} onClose={()=>setTrashOpen(false)}/>
      <FileSaveDialog/>

    </div></DirectionProvider>
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

export function formatCatalogArc(item:CatalogItem) {
  return coveragePatternLabel(item);
}

export function EquipmentLibraryCard({item,selected,onSelect}:{item:CatalogItem;selected:boolean;onSelect:()=>void}) {
  const units=useProject.getState().units;
  return <button type="button" className="irrigation-catalog-card" aria-pressed={selected}
    aria-label={uiText("itemProperties",{name:item.modelId??item.id})}
    onClick={onSelect} onDragStart={e=>e.preventDefault()}>
    <span className="irrigation-catalog-copy">
      <span className="irrigation-catalog-brand">{manufacturerName(item)}</span>
      <strong><bdi dir="ltr">{item.modelId??item.id}</bdi></strong>
      <span className="irrigation-catalog-spec">{coverageSizeRange(item,units.length)}</span>
      <span className="irrigation-catalog-spec">{formatCatalogArc(item)}</span>
    </span>
    <CatalogThumb item={item} color={equipmentAppearance(item).color}/>
  </button>;
}
export function AutomaticLibraryCard({active,onClick,disabled=false}:{active:boolean;onClick:()=>void;disabled?:boolean}) {
  if(disabled)return null;
  return <button type="button" className="irrigation-catalog-card automatic-library-card" aria-pressed={active} onClick={onClick}>
    <span className="irrigation-catalog-copy"><strong>{uiText('autoHead.title')}</strong></span><Crosshair className="size-6 shrink-0" aria-hidden="true"/>
  </button>;
}

function MenuBtn({ onClick, icon, label, disabled=false }: { onClick: () => void; icon: ReactNode; label: string; disabled?:boolean }) {
  return (
    <button type="button" disabled={disabled} className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-btn hover:bg-btn-soft disabled:opacity-45" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="info-stat rounded-sm bg-bg-2 px-1.5 py-1 sm:rounded-md sm:px-2.5 sm:py-2">
      <dt className="text-[0.5rem] font-semibold text-faint uppercase sm:text-[0.625rem]">{k}</dt>
      <dd className="mt-0.5 text-[0.6875rem] font-medium leading-tight tabular sm:text-sm">{v}</dd>
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
  const [draft, setDraft] = useState<number | null>(null);
  const updates = useMemo(() => frameUpdate<() => void>(apply => apply(),
    callback => requestAnimationFrame(callback), id => cancelAnimationFrame(id)), []);
  useEffect(() => () => { updates.flush(); useProject.getState().endHeadEdit(); }, [updates]);
  const finish = () => { updates.flush(); setDraft(null); useProject.getState().endHeadEdit(); };
  const range = sliderRange(min, max, step, draft ?? value);
  const fillEnd = sliderFillPosition(range.tick, range.ticks);
  return (
    <label className="head-slider-control">
      <span className="head-slider-label flex items-center justify-between gap-1 font-semibold" style={{ color }}>
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
          backgroundImage: `linear-gradient(90deg, ${color} 0, ${color} ${fillEnd}, color-mix(in srgb, ${color} 22%, transparent) ${fillEnd})`,
        }}
        onPointerDown={() => useProject.getState().beginHeadEdit()}
        onChange={(e) => {
          const next = range.fromTick(Number(e.target.value));
          setDraft(next);
          updates.push(() => onChange(next));
        }}
        onKeyDown={(e) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) useProject.getState().beginHeadEdit(); }}
        onKeyUp={finish}
        onBlur={finish}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
      />
      {endLabels && <span className="head-slider-limits text-muted tabular"><span>{endLabels[0]}</span><span>{endLabels[1]}</span></span>}
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
  const fillOpen = useLayerFillLibrary(s => s.open);
  const [tip, setTip] = useState<string | null>(null);
  const hideTip = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const d = drawingOrMigrate(project);
  const face = d.faces[faceId];
  useEffect(() => {
    setAskDel(false);
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
            faceId={faceId}
            orientation={face.textureRotation ?? 0}
            title={face.name || t("layerN", { n: faceLayerNumber(d, faceId) })}
            color={face.fill ?? REGION_FILL[face.type] ?? "#c8e6b0"}
            className="cad-fill-trigger"
            onOpen={() => { setAskDel(false); setTip(null); }}
          />}
          {!face.layerId && !memberScope && <Btn
            label={t("duplicateHint")}
            onPress={() => {
              setAskDel(false);
              useProject.getState().duplicateSelected();
            }}
          >
            <Copy className="size-4" />
          </Btn>}
          <Btn
            label={t("deleteShapeHint")}
            danger
            onPress={() => {
              setAskDel(true);
            }}
          >
            <Trash2 className="size-4" />
          </Btn>
        </div>
        {tip && !askDel && !fillOpen && (
          <span className="pointer-events-none absolute left-full top-1/2 z-10 ml-1 w-max max-w-[12rem] -translate-y-1/2 rounded-sm bg-ink px-2 py-1 text-[0.625rem] leading-snug text-white shadow-border">
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
      {boundary.slice(1).map((p,i)=><label key={i} className="flex h-9 shrink-0 items-center gap-1 rounded-sm bg-bg-2 px-1.5"><strong>{sideLetter(i)}</strong><input key={`${p.x}:${p.y}:${boundary[i]!.x}:${boundary[i]!.y}`} className="w-20" inputMode="decimal" aria-label={sideLetter(i)} defaultValue={formatNumber(fromMeters(dist(boundary[i]!,p),units.length),2)} onBlur={e=>{
        const value=parseLocalizedNumber(e.currentTarget.value);
        const st=useProject.getState(),next=st.draft.points.map(p=>({...p})),a=next[i],b=next[i+1];
        if(!a||!b||!Number.isFinite(value)||value<=0)return;
        const length=dist(a,b);if(length<1e-7)return;
        const scale=toMetersLen(value,units.length)/length;
        next[i+1]={x:a.x+(b.x-a.x)*scale,y:a.y+(b.y-a.y)*scale};st.setDraftPoints(next);
      }} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')e.currentTarget.blur();}}/><span>{lenLabel(units.length)}</span></label>)}
      <label className="flex h-9 shrink-0 items-center gap-1 rounded-sm bg-bg-2 px-1.5"><strong>L</strong><input className="w-20" inputMode="decimal" placeholder={hover && points.length ? formatNumber(fromMeters(dist(points[points.length-1]!,hover),units.length),2) : "0"} aria-label="L" onKeyDown={e=>{
        e.stopPropagation();if(e.key!=='Enter')return;const value=parseLocalizedNumber(e.currentTarget.value);if(value>0){useProject.getState().applyCadLength(toMetersLen(value,units.length),hover);e.currentTarget.value='';}
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

function FuseFiguresButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  const t=useT();
  return <button type="button" className={`figure-fuse-button ${className}`} onClick={onClick}>
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M3 3h12v6h6v12H9v-6H3Z"/><path d="M9 9h6v6H9Z" strokeDasharray="2 2" opacity=".45"/></svg>{t("fuseFigures")}
  </button>;
}

function CutFigureConfirmation() {
  const t=useT();
  const project=useProject(s=>s.project),points=useProject(s=>s.draft.points);
  const ready=useMemo(()=>Boolean(cutFigures(drawingOrMigrate(project),points)),[project,points]);
  if(points.length<2) return null;
  return <section className="bulk-selection-actions segment-figure-confirm" data-confirming="true" role="region" aria-label={t("drawCut")}
    onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
    <button type="button" className="bulk-create" disabled={!ready} onClick={()=>useProject.getState().confirmCut()}><Scissors size="1.25rem"/>{t("drawCut")}</button>
    <button type="button" className="action-cancel" aria-label={t("cancel")} title={t("cancel")} onClick={()=>useProject.getState().setDrawSub("cut")}><X size="1.25rem"/></button>
  </section>;
}

function SegmentFigureConfirmation({ deletingSelection, onDeleteSelected }: {
  deletingSelection: boolean; onDeleteSelected?: () => void;
}) {
  const t=useT();
  const project=useProject(s=>s.project);
  const selectedPolyIds=useProject(s=>s.selectedPolyIds);
  const [dismissed,setDismissed]=useState<string[]>([]);
  const candidates=useMemo(()=>segmentFigures(drawingOrMigrate(project)),[project.drawing]);
  const attachedCandidates=useMemo(()=>attachedSegmentFigures(drawingOrMigrate(project)),[project.drawing]);
  const drawing=drawingOrMigrate(project);
  const multipleSegments=selectedPolyIds.length>1 && selectedPolyIds.every(id=>drawing.faces[id]?.segment);
  const candidate=candidates.find(c=>!dismissed.includes(c.key) &&
    (selectedPolyIds.length<2 || c.parts.every(part=>selectedPolyIds.includes(part.id))));
  const showDelete=multipleSegments && !!onDeleteSelected;
  const attached=attachedCandidates.find(c=>!dismissed.includes(c.key) &&
    (selectedPolyIds.length<2 || c.parts.every(part=>selectedPolyIds.includes(part.id))));
  if(attached && !deletingSelection) {
    const resolve=(action: 'merge' | 'separate' | 'delete')=>{
      const st=useProject.getState();
      const result=resolveAttachedSegmentFigure(drawingOrMigrate(st.project),attached.key,action);
      if(!result) return;
      st.commitDrawing(result.drawing,result.faceId);
      st.setCadEdit(action==='delete' ? null : result.faceId);
    };
    return <section className="bulk-selection-actions segment-figure-confirm attached-segment-confirm" data-confirming="true" role="region" aria-label={t("attachedSegmentActions")}
      onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onTouchMove={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
      <FuseFiguresButton className="bulk-create attached-merge" onClick={()=>resolve('merge')}/>
      <button type="button" className="bulk-create attached-separate" onClick={()=>resolve('separate')}><Square size="1.25rem" strokeWidth={1.6} aria-hidden="true"/>{t("makeSeparateFigure")}</button>
      <button type="button" className="bulk-delete" onClick={()=>resolve('delete')}><Trash2 size={18}/>{t("delete")}</button>
    </section>;
  }
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
  const displayLocale = useProject(s => `${s.locale}:${s.numberFormat}`);
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
    return formatNumber(fromMeters(meters, units.length), digits);
  };
  const [values, setValues] = useState<string[]>(() => lengths.map(formatLength));
  const [nextValue, setNextValue] = useState("");
  const cancelNextBlur = useRef(false);

  useEffect(() => {
    setValues(lengths.map(formatLength));
    // Geometry key keeps every field current when one control point changes two segments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceId, lengthsKey, units.length, displayLocale]);

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
    const entered = parseLocalizedNumber((values[index] ?? "").trim());
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
    const entered = parseLocalizedNumber(nextValue.trim());
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
          title={uiText("curveLength")}
        >
          <span className="min-w-5 text-center text-xs font-bold text-ink">Σ</span>
          <output
            aria-label={uiText("curveLength")}
            className="min-w-[4.4rem] text-right text-sm font-semibold tabular-nums text-ink"
          >
            {formatLength(totalLength)}
          </output>
          <span className="pr-0.5 text-[0.6875rem] text-muted">{lenLabel(units.length)}</span>
        </div>}
        {lengths.map((length, index) => (
          <label key={`${faceId ?? "draft"}-${index}`} className="flex h-9 shrink-0 items-center gap-1 rounded-sm bg-bg-2 px-1.5">
            <span className="min-w-5 text-center text-xs font-bold text-ink">{segment ? "L" : sideLetter(index)}</span>
            <input
              aria-label={uiText("segmentNamed", { name: sideLetter(index) })}
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
            <span className="pr-0.5 text-[0.6875rem] text-muted">{lenLabel(units.length)}</span>
          </label>
        ))}
        {!faceId && points.length >= 1 && (
          <label className="flex h-9 shrink-0 items-center gap-1 rounded-sm border border-dashed border-tool/60 bg-bg-2 px-1.5">
            <span className="min-w-5 text-center text-xs font-bold text-tool">{sideLetter(segmentCount)}</span>
            <input
              aria-label={uiText("newSegmentNamed", { name: sideLetter(segmentCount) })}
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
            <span className="pr-0.5 text-[0.6875rem] text-muted">{lenLabel(units.length)}</span>
            {!compact && <button
              type="button"
              aria-label={uiText("drawSegmentNamed", { name: sideLetter(segmentCount) })}
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
  const displayLocale = useProject(s => `${s.locale}:${s.numberFormat}`);
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
    return formatNumber(fromMeters(meters, units.length), digits);
  };
  const [values, setValues] = useState<string[]>(() => lengths.map(formatLength));

  useEffect(() => {
    setValues(lengths.map(formatLength));
    // Geometry key is intentionally used so inputs refresh after a handle or another side moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceId, lengthsKey, units.length, displayLocale]);

  const applySideLength = (index: number) => {
    const entered = parseLocalizedNumber((values[index] ?? "").trim());
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
              aria-label={uiText("sideNamed", { name: sideLetter(index) })}
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
            <span className="pr-0.5 text-[0.6875rem] text-muted">{lenLabel(units.length)}</span>
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
  const displayLocale = useProject(s => `${s.locale}:${s.numberFormat}`);
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
  const fmtN = (n: number, d: number) => formatNumber(n, d);
  const syncCircle = (r: number) => {
    setRIn(fmtN(fromMeters(r, units.length), lenDec));
    setDIn(fmtN(fromMeters(r * 2, units.length), lenDec));
    setSIn(fmtN(fromM2(Math.PI * r * r, units.area), areaDec));
  };
  useEffect(() => {
    if (liveR == null || dirty.current) return;
    syncCircle(liveR);
  }, [liveR, units.length, units.area, displayLocale]);
  useEffect(() => {
    if (!liveWH || dirty.current) return;
    setWIn(fmtN(fromMeters(liveWH.w, units.length), lenDec));
    setLIn(fmtN(fromMeters(liveWH.h, units.length), lenDec));
    const area = drawSub === "ellipse" ? Math.PI * (liveWH.w / 2) * (liveWH.h / 2) : drawSub === "triangle" ? (liveWH.w * liveWH.h) / 2 : drawSub === "hexagon" ? liveWH.w * liveWH.h * 0.75 : liveWH.w * liveWH.h;
    setSIn(fmtN(fromM2(area, units.area), areaDec));
  }, [liveWH, units.length, units.area, drawSub, displayLocale]);
  useEffect(() => {
    if (!liveTriangle || dirty.current) return;
    setBIn(fmtN(fromMeters(liveTriangle.left, units.length), lenDec));
    setCIn(fmtN(fromMeters(liveTriangle.right, units.length), lenDec));
  }, [liveTriangle, units.length, displayLocale]);
  useEffect(() => {
    if (liveRot == null || dirty.current === "rot") return;
    const n = ((liveRot % 360) + 360) % 360;
    setRotIn(formatNumber(n, n % 1 === 0 ? 0 : 1));
  }, [liveRot, displayLocale]);
  const parseN = (raw: string) => {
    const n = parseLocalizedNumber(raw.trim());
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
      const n = parseLocalizedNumber(rotIn.trim());
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
      <span className="pr-0.5 text-[0.6875rem] text-muted">{unit}</span>
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
          placeholder={pendingLineLength ? formatNumber(fromMeters(pendingLineLength,units.length),lenDec) : hasPoint ? formatNumber(fromMeters(liveLen, units.length),lenDec) : "0"}
          onChange={e => setText(e.target.value)} onFocus={e => e.currentTarget.select()}
          onBlur={() => { if (text.trim()) { apply(text); setText(""); } }}
          onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); }}/>
        <span className="pr-0.5 text-[0.6875rem] text-muted">{lenLabel(units.length)}</span>
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
          const n = parseLocalizedNumber(e.target.value);
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
          <span className="rounded-sm bg-tool-soft px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide text-tool uppercase">{t("required")}</span>
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
      <p className="text-[0.5625rem] font-semibold tracking-wide text-muted uppercase sm:text-[0.625rem]">{t("project")}</p>
      <h2 className="mt-0.5 font-display text-sm sm:mt-1 sm:text-xl">{!isNamed(project) ? t("untitled") : project.name}</h2>
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

function ProjectFormBar({allowMenu=false}:{allowMenu?:boolean}) {
  const t = useT();
  const [viewport,setViewport]=useState<{top:number;height:number;keyboard:boolean}|null>(null);
  useLayoutEffect(()=>{
    const vv=window.visualViewport;
    const update=()=>setViewport({top:vv?.offsetTop??0,height:vv?.height??window.innerHeight,
      keyboard:window.innerHeight-(vv?.height??window.innerHeight)>48});
    update();vv?.addEventListener('resize',update);vv?.addEventListener('scroll',update);window.addEventListener('resize',update);
    return()=>{vv?.removeEventListener('resize',update);vv?.removeEventListener('scroll',update);window.removeEventListener('resize',update);};
  },[]);
  const project = useProject((s) => s.project);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(!isNamed(project) ? "" : project.name);
  const [nameError, setNameError] = useState(false);
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
  const closeForm = () => {
    nameRef.current?.blur();
    unlockScreen(() => useProject.getState().cancelProjectForm());
  };
  const save = () => {
    const n = (nameRef.current?.value ?? name).trim();
    if (!n) {
      setNameError(true);
      if(nameRef.current)focusWithoutScroll(nameRef.current);
      nameRef.current?.closest('.project-details-form')?.scrollTo({top:0,behavior:'smooth'});
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
        "fixed inset-x-0 top-0 z-[80] flex justify-center bg-ink/45 px-4",
        allowMenu && "pointer-events-none",
        viewport?.keyboard ? "items-end" : "items-center",
      )}
      style={{
        top:viewport?.top??0,
        height:viewport?.height??'100dvh',
        paddingBlock:12,
      }}
      onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();closeForm();}}}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if(isNamed(project))closeForm();
      }}
    >
      <div
        className={cn(
          "project-details-form pointer-events-auto mb-2 w-full max-w-md overflow-y-auto overscroll-contain rounded-lg bg-surface p-4 shadow-border",
        )}
        style={{ maxHeight:'100%' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="project-details-heading">
          <p className="font-display text-lg">{t("projectName")}</p>
          <Button size="icon" aria-label={t("cancel")} title={t("cancel")} onPointerDown={e=>e.preventDefault()} onClick={closeForm}><X /></Button>
        </div>
        <label className="mt-4 block">
          <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-tool">
            {t("projectName")}
            <span className="rounded-sm bg-tool-soft px-1.5 py-0.5 text-xs">{t("required")}</span>
          </span>
        <span className="project-name-control" data-invalid={nameError}>
        <input
          data-project-name-input
          ref={nameRef}
          value={name}
          placeholder={t("projectName")}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          inputMode="text"
          aria-required
          aria-invalid={nameError}
          aria-describedby={nameError?'project-name-error':undefined}
          autoFocus
          onFocus={()=>lockScreen()}
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
          className="project-name-input h-11 w-full text-base leading-normal text-ink"
        />
          <span className="project-name-asterisk" aria-hidden="true">*</span>
        </span>
        </label>
        {nameError&&<p id="project-name-error" className="project-name-error" role="alert">{t("enterName")}</p>}
        <div className="project-details-fields mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("address")} value={meta.address} onChange={(v) => setMeta({ ...meta, address: v })} />
          <Field label={t("client")} value={meta.client} onChange={(v) => setMeta({ ...meta, client: v })} />
          <Field label={t("phone")} value={meta.phone} onChange={(v) => setMeta({ ...meta, phone: v })} />
          <Field label={t("notes")} value={meta.notes} onChange={(v) => setMeta({ ...meta, notes: v })} />
        </div>
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
        </div>
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
        <p className="text-[0.6875rem] text-muted">{t("noLayers")}</p>
      </div>
    );
  }
  const n = faceLayerNumber(d, face.id);
  const label = layerTitle(d, face.id, locale);
  return (
    <div className="border-b border-line px-2 py-2">
      <p className="text-[0.625rem] font-semibold tracking-wide text-muted uppercase">{t("irrigation")}</p>
      <p className="mt-0.5 truncate text-sm font-medium">{label}</p>
      <p className="text-[0.6875rem] tabular text-muted">
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
          <h2 className="min-w-0 flex-1 break-words text-base font-semibold">{!isNamed(project) ? t("untitled") : project.name}</h2>
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
  return <div className="mt-3 border-t border-line pt-2 text-[0.6875rem] leading-relaxed">
    {item.dataNote && <p className="mb-2 text-muted">{catalogNote(item)}</p>}
    <a className="text-accent underline underline-offset-2" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{manufacturerName(item)} · {uiText("source")}</a>
    {item.verifiedOn && <p className="mt-1 text-muted">{uiText("checkedOn")}{formatDate(item.verifiedOn)}</p>}
  </div>;
}
function FlowStats({ lpm }: { lpm: number | null; m3h: number | null }) {
  const flowUnit = useProject(s => s.units.flow);
  const tx = useT();
  const secondary: import("@/lib/units").FlowUnit = flowUnit === "gpm" ? "gph" : flowUnit === "gph" ? "gpm" : flowUnit === "m3h" ? "lpm" : "m3h";
  return <>{[flowUnit, secondary].map(unit => <Stat key={unit} k={`${tx("flow")}, ${flowLabel(unit)}`} v={lpm == null ? tx("noData") : formatNumber(fromLpm(lpm, unit), unit === "m3h" ? 3 : 2)} />)}</>;
}
function isLightColor(hex: string) {
  const rgb = hex.replace("#", "");
  return rgb.length === 6 && [0, 2, 4].reduce((sum, i, j) => sum + parseInt(rgb.slice(i, i + 2), 16) * [0.2126, 0.7152, 0.0722][j]!, 0) > 175;
}

export function CatalogInfo({ catalogId,item:scopedItem }: { catalogId: string;item?:CatalogItem }) {
  const units=useProject(s=>s.units),target=useProject(s=>s.project.meta.targetMm);
  const item=scopedItem??itemById(catalogId);
  if (!item) return null;
  const defaults=catalogHeadDefaults(item),nozzle=item.nozzles.find(n=>n.id===defaults.nozzleId);
  const pressure=pressureRange(item,defaults.nozzleId,defaults.arc);
  const point={arc:defaults.arc,radius:defaults.r,pressureBar:defaults.designPressure,nozzleId:defaults.nozzleId};
  const fl=computeFlow(item,point),precipitation=displayPrecipitation(item,point,fl);
  const radiusVerified=item.performanceReview!=='per-row'||!!geometryAt(item,defaults.nozzleId,defaults.designPressure,defaults.arc);
  return <div className="p-3" aria-label={uiText("itemProperties", { name: item.id })}>

    <h2 className="mt-2 text-base font-semibold"><bdi dir="ltr">{manufacturerName(item)} {item.modelId??item.id}</bdi></h2>
    <p className="mt-1 text-xs text-muted">{catalogName(item)}</p>
    <p className="mt-2 text-sm leading-relaxed">{catalogUse(item)}</p>
    {item.type==="rotor" && <p className="mt-2 text-xs">{uiText("defaultNozzleLabel")}{nozzle?.size??nozzle?.name??"—"} · {nozzle ? catalogColor(nozzle.colorName) : uiText("noData")}</p>}
    <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-2 text-[0.6875rem]">
      <FlowStats lpm={fl.lpm} m3h={fl.m3h}/>
      <Stat k={coverageSizeLabel(item,undefined,true)} v={!radiusVerified?uiText("noData"):coverageSize(item,defaults.r,units.length,defaults.designPressure)}/>
      <Stat k={uiText(catalogPressureLabel(item))} v={formatPressureU(defaults.designPressure,units.pressure)}/>
      <PrecipitationStats value={precipitation} targetMm={target}/>
      <Stat k={uiText(item.strip||hasStreamCoverage(item)||item.coverageKind&&item.coverageKind!=="sector"?"coveragePattern":"sector")} v={formatCatalogArc(item)}/>
      <Stat k={uiText(item.pressureBasis==='inlet'?catalogPressureLabel(item):"nozzlePressureRange")} v={pressure ? `${formatPressureU(pressure.min,units.pressure)}–${formatPressureU(pressure.max,units.pressure)}` : uiText("noData")}/>
    </dl>
    {item.coverageKind==="square"&&<p className="sq-size-hint">{uiText("sqSizeHint")}{item.squarePatternFraction===.75?` ${uiText("sqThreeQuarterHint")}`:""}</p>}
    <CatalogReference item={item} nozzle={nozzle}/>
    <p className="mt-2 text-xs text-muted">{uiText("equipment.verification")}: {uiText(item.performanceReview==='per-row'&&fl.lpm!=null?'equipment.verifiedPoint':item.verificationStatus==='Needs Review'?"equipment.sourceConflict":item.verificationStatus==='Deprecated'?"equipment.deprecated":"equipment.verified")} · {item.verifiedOn}</p>
    {item.verificationStatus==='Needs Review'&&<p className="mt-1 text-xs text-muted">{uiText(item.performanceReview==='per-row'?'equipment.rowReviewHint':'equipment.sourceConflictHint')}</p>}
    {item.fullCircleRotation==='unknown'&&<p className="mt-1 text-xs text-muted">{uiText('equipment.rotationUnverified')}</p>}
    <CatalogSource item={item}/>
  </div>;
}

export function HeadCard({ head, onZones }: { head: Head; onZones?: () => void }) {
  const item = catalogForHead(head);
  const units = useProject((s) => s.units);
  const tx = useT();
  const zones = useProject((s) => s.project.zones);
  const target = useProject((s) => s.project.meta.targetMm);
  const editingSector = useProject(s => s.sectorEditId === head.id);
  if (!item) return <p className="p-1.5 text-[0.6875rem] text-warn sm:p-4 sm:text-sm">{tx("modelReview")}</p>;
  const fl = headFlow(head);
  const pressure=nozzleTablePressure(item,head.designPressure);
  const precipitation=displayPrecipitation(item,{arc:head.arc,radius:head.r,pressureBar:head.designPressure,nozzleId:head.nozzleId},fl);
  const upd = (patch: Partial<Head>) => useProject.getState().updateHead(head.id, patch);
  const live = (patch: Partial<Head>) => useProject.getState().patchHeadLive(head.id, patch);
  const nozzle = head.nozzleId ? item.nozzles.find((n) => n.id === head.nozzleId) : defaultNozzle(item);
  const bodies = bodiesFor(item);
  const bodyId = head.bodyId && bodies.some((b) => b.id === head.bodyId) ? head.bodyId : defaultBodyFor(item);
  const radius = headRadiusScale(item, head);
  const pressures = headPressureSteps(item, head);
  const square=item.coverageKind==="square";
  const shortNozzle=square?[...item.nozzles].sort((a,b)=>Math.min(...a.performance.map(r=>r.radiusM))-Math.min(...b.performance.map(r=>r.radiusM)))[0]?.id:null;
  const optionName=(n:typeof item.nozzles[number])=>square?tx(n.id===shortNozzle?"sqShortThrow":"sqLongThrow"):n.size??nozzleName(n);
  const pickNozzle = (id: string) => {
    // SQ throw is a nozzle setting, independent of working pressure. The store
    // preserves that pressure and derives the new footprint from its table row.
    if (square) {
      if (id !== (head.nozzleId ?? nozzle?.id)) upd({ nozzleId: id });
      return;
    }
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
      {onZones && <button type="button" className="zones-navigation" onClick={onZones}>{tx("zonesTitle")}</button>}
      <HeadPlacementSettings key={`${head.id}:${head.zone}`} head={head} item={item}/>
      <div className="relative">

        <div className="head-card-actions">
        {item.coverageKind !== "point" && <button type="button" className="head-card-edit" aria-pressed={editingSector} disabled={head.locked || zones.some(z => z.id === head.zone && z.locked)}
          aria-label={tx(editingSector ? "finishSectorEdit" : "editSector")} title={tx(editingSector ? "finishSectorEdit" : "editSector")}
          onClick={() => useProject.getState().setSectorEdit(editingSector ? null : head.id)}><SectorEditIcon/></button>}
        <button type="button" disabled={head.locked || zones.some(z => z.id === head.zone && z.locked)} aria-label={tx("duplicate")} title={tx("duplicate")}
          onClick={() => { const st = useProject.getState(); st.endHeadEdit(); st.selectHead(head.id); st.duplicateSelected(); }}><Copy size={18}/></button>
        <button type="button" className="irrigation-delete-action" disabled={head.locked || zones.some(z => z.id === head.zone && z.locked)} aria-label={tx("deleteSprinkler")} title={tx("deleteSprinkler")}
          onClick={() => useProject.getState().removeHead(head.id)}><Trash2 size={18}/></button>
        </div>
      </div>
      <p className="mt-1 text-[0.625rem] font-semibold tracking-wide text-muted uppercase">{item.series}</p>
      <h2 className="font-display text-base leading-tight"><bdi dir="ltr">{manufacturerName(item)} {item.modelId??item.id}</bdi></h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{catalogUse(item)}</p>
      {head.needsReview && <p className="mt-2 text-xs text-warn">{uiText("headVerifyHint")}</p>}
      {item.nozzles.length > 1 && (
        <div className="mt-2">
          <p className="text-[0.625rem] font-semibold text-muted">{tx(square?"sqThrowSetting":"nozzleSize")}{item.type==='rotor'?` · ${tx("automaticNozzle")}`:''}</p>
          <div className={square?"sq-nozzle-options":"mt-1 grid grid-cols-4 gap-1"}>
            {item.nozzles.map((n) => {
              const on = (head.nozzleId ?? nozzle?.id) === n.id;
              const appearance=equipmentAppearance(item,n.id,'nozzle');
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => pickNozzle(n.id)}
                  aria-pressed={on}
                  title={`${optionName(n)} · ${catalogColor(appearance.colorName)}${n.hydraulicVerificationStatus==='Needs Review'?` · ${tx("equipment.sourceConflict")}`:""}`}
                  className={cn(square?"sq-nozzle-option":"h-8 rounded-sm text-[0.6875rem] font-semibold tabular", on ? "text-white" : "hover:opacity-90")}
                  style={{ background: on ? appearance.color : "transparent", color: on && !isLightColor(appearance.color) ? "#fff" : "var(--color-ink)", border: `1px solid ${on ? appearance.color : square?"var(--color-line)":"transparent"}` }}
                >
                  {optionName(n)}{n.hydraulicVerificationStatus==='Needs Review' ? " ⚠" : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-2">
        <PressureSteps labelKey={catalogPressureLabel(item)} values={pressures} value={pressure}
          recommended={item.recommendedPressureIsDefault?undefined:workingPressureBar(item, bodyId, head.nozzleId)}
          onChange={designPressure => upd({ designPressure })}/>
        {square&&<p className="sq-size-hint">{tx("sqSizeHint")}{item.squarePatternFraction===.75?` ${tx("sqThreeQuarterHint")}`:""}</p>}
        {!square && item.coverageKind!=="point" && item.placementSupported!==false && radius && radius.max > radius.min && <ColorSlider
          label={tx("radius")}
          color={HEAD_CONTROL_COLORS.radius}
          min={radius.min}
          max={radius.max}
          step={0.05}
          value={Math.min(radius.max, Math.max(radius.min, head.r))}
          endLabels={[formatLenU(radius.min, units.length), formatLenU(radius.max, units.length)]}
          display={formatLenU(head.r, units.length)}
          onChange={(r) => live({ r })}
        />}
        {item.coverageKind!=="point" && item.placementSupported!==false && item.arcMin !== item.arcMax && (
          <ColorSlider
            label={tx("sector")}
            color={HEAD_CONTROL_COLORS.sector}
            min={item.arcMin}
            max={item.arcMax}
            step={1}
            value={Math.min(item.arcMax, Math.max(item.arcMin, head.arc))}
            display={`${Math.round(head.arc)}°`}
            endLabels={[`${item.arcMin}°`, `${item.arcMax}°`]}
            onChange={(arc) => live({ arc })}
          />
        )}
        {(item.strip || item.coverageKind === "square" || (item.coverageKind !== "point" && head.arc < 360)) && <ColorSlider
          label={tx("rotation")}
          color={HEAD_CONTROL_COLORS.rotation}
          min={0}
          max={359}
          step={1}
          value={((head.start % 360) + 360) % 360}
          display={`${Math.round(head.start)}°`}
          onChange={(start) => live({ start })}
        />}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[0.6875rem]">
        <FlowStats lpm={fl.lpm} m3h={fl.m3h}/>
        <Stat k={coverageSizeLabel(item)} v={coverageSize(item,head.r,units.length,head.designPressure)} />
        {(item.strip||hasStreamCoverage(item)||item.coverageKind&&item.coverageKind!=="sector")&&<Stat k={tx("coveragePattern")} v={coveragePatternLabel(item)}/>}
        <Stat k={tx(catalogPressureLabel(item))} v={formatPressureU(pressure, units.pressure)} />
        <PrecipitationStats value={precipitation} targetMm={target}/>
      </dl>
      {(item.manufacturerId==='toro'||item.manufacturerId==='k-rain')&&fl.kind==='matched-precip'&&fl.note&&<p className="mt-2 text-xs text-muted">{fl.note}</p>}
      <p className="mt-2 text-xs text-muted">{uiText("equipment.verification")}: {uiText(item.performanceReview==='per-row'&&fl.lpm!=null?'equipment.verifiedPoint':item.verificationStatus==='Needs Review'?"equipment.sourceConflict":item.verificationStatus==='Deprecated'?"equipment.deprecated":"equipment.verified")} · {item.verifiedOn}</p>
    {item.verificationStatus==='Needs Review'&&<p className="mt-1 text-xs text-muted">{uiText(item.performanceReview==='per-row'?'equipment.rowReviewHint':'equipment.sourceConflictHint')}</p>}
    {item.fullCircleRotation==='unknown'&&head.arc===360&&<p className="mt-1 text-xs text-muted">{uiText('equipment.rotationUnverified')}</p>}
    <CatalogSource item={item}/>

      {item.nozzles.length > 1 && item.type !== "rotor" && !square && (
        <label className="mt-2 block text-[0.625rem] text-muted">
          {tx("nozzle")}
          <select value={head.nozzleId ?? ""} onChange={(e) => pickNozzle(e.target.value)} className="mt-0.5 h-8 w-full rounded-sm bg-bg-2 px-1.5 text-[0.8125rem] shadow-border">
            {item.nozzles.map((n) => (
              <option key={n.id} value={n.id}>
                {n.size ? `${n.size} · ${nozzleName(n)}` : nozzleName(n)}{n.hydraulicVerificationStatus==='Needs Review' ? ` · ${tx("equipment.sourceConflict")}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <CatalogReference item={item} nozzle={nozzle}/>
    </div>
  );
}

/** Shared centered estimate window; it does not change sidebar mode or selection. */
function EstimateDialog({ mobile, onOpen }: { mobile: boolean; onOpen: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return <Dialog.Root open={open} onOpenChange={next => { setOpen(next); if (next) onOpen(); }}>
    <Dialog.Trigger asChild>
      <button type="button" className="mobile-icon-button workspace-header-action" aria-label={t("estimate")} aria-pressed={open}>
        <FileText />{!mobile && <span>{t("estimate")}</span>}
      </button>
    </Dialog.Trigger>
    <Dialog.Portal container={typeof document === "undefined" ? undefined : document.querySelector(".app-shell")}>
      <Dialog.Overlay className="estimate-dialog-overlay" />
      <Dialog.Content className="estimate-dialog" aria-describedby={undefined}
        onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
        <header className="estimate-dialog-heading">
          <Dialog.Title>{t("estimate")}</Dialog.Title>
          <Dialog.Close asChild><Button size="icon" variant="ghost" aria-label={t("close")}><X /></Button></Dialog.Close>
        </header>
        <div className="estimate-dialog-scroll"><EstimateCard /></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function EstimateCard() {
  const t = useT();
  const locale = useProject(s => s.locale);
  const numberFormat = useProject(s => s.numberFormat);
  const units = useProject(s => s.units);
  const project = useProject((s) => s.project);
  const heads = project.heads;
  const engineeringBom=useMemo(()=>engineeringMaterials(project,units),[project,units,locale,numberFormat]);
  const bomBodyQty = project.bomBodyQty ?? {};
  const [saveAsk, setSaveAsk] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const { sprinklers, bodies } = useMemo(() => {
    const spr = new Map<string, { key: string; item: CatalogItem; name: string; ids: string[] }>();
    const bod = new Map<string, { body: CatalogItem; ids: string[]; recIds: string[] }>();
    for (const h of heads) {
      const item = catalogForHead(h);
      if (!item) continue;
      const key = item.type === "rotor" ? `${item.id}:${h.popUpMm ?? item.popUpMm}` : item.id;
      const s = spr.get(key) ?? { key, item, name: bomLineName(item, h.popUpMm), ids: [] };
      s.ids.push(h.id);
      spr.set(key, s);
      if (item.type === "rotor") continue;
      const body = bodyForHead(item, h.bodyId, h.popUpMm, h.bodySnapshot);
      if (!body) continue;
      const b = bod.get(body.id) ?? { body, ids: [], recIds: [] };
      b.ids.push(h.id);
      const rec = recommendedBodyFor(item, body.popUpMm)?.id ?? defaultBodyFor(item);
      if (!b.recIds.includes(rec)) b.recIds.push(rec);
      bod.set(body.id, b);
    }
    return { sprinklers: [...spr.values()], bodies: [...bod.values()] };
  }, [heads, locale, units, numberFormat]);
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
      heads: st.project.heads.map((h) => (ids.includes(h.id) && !h.locked && !st.project.zones.some(z => z.id === h.zone && z.locked)
        ? updateHeadSettings(h, { bodyId: toId }) : h)),
      bomBodyQty: qty,
    });
  };
  const bodyChoices = (ids: string[]) => {
    const compatible: CatalogItem[][] = [];
    for (const id of ids) {
      const h = heads.find((x) => x.id === id);
      const item = h ? catalogForHead(h) : null;
      if (!item) continue;
      compatible.push(bodiesFor(item));
    }
    return (compatible[0] ?? []).filter(body => compatible.every(list => list.some(option => option.id === body.id)));
  };
  return (
    <div className="estimate-card">
      <Button
        ref={saveButtonRef}
        className="w-full"
        variant="solid"
        size="sm"
        disabled={saving || (sprinklers.length === 0 && engineeringBom.rows.length === 0)}
        onClick={() => setSaveAsk(true)}
      >
        {t("saveEstimate")}
      </Button>
      {sprinklers.length === 0 ? (
        <p className="mt-2 text-[0.6875rem] text-muted">{t("heads")}: 0</p>
      ) : (
        <ul className="mt-2 space-y-2">
          <li className="flex items-center gap-2 px-1.5 text-[0.625rem] font-semibold text-muted">
            <span className="w-5 text-center">{t("colNo")}</span>
            <span className="flex-1">{t("colName")}</span>
            <span>{t("colQty")}</span>
          </li>
          {sprinklers.map((g, i) => (
            <li key={g.key} className="flex items-center gap-2 rounded-sm border border-line p-1.5">
              <span className="w-5 shrink-0 text-center text-[0.6875rem] tabular text-muted">{i + 1}</span>

              <span className="min-w-0 flex-1 text-[0.6875rem] font-medium leading-snug">{g.name}</span>
              <span className="shrink-0 text-[0.6875rem] tabular text-muted">
                {formatNumber(g.ids.length, 0)} {t("pcs")}
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
                  <span className="w-5 shrink-0 text-center text-[0.6875rem] tabular text-muted">{sprinklers.length + i + 1}</span>

                  <span className="min-w-0 flex-1 text-[0.6875rem] font-medium leading-snug">{bomLineName(g.body)}</span>
                  <label className="flex shrink-0 items-center gap-1 text-[0.625rem] text-muted">
                    <LocalizedNumberInput
                      className="h-7 w-11 rounded-sm bg-bg-2 px-1 text-center text-xs tabular shadow-border"
                      aria-label={`${t("colQty")}: ${bomLineName(g.body)}`}
                      min={0}
                      digits={0}
                      value={n}
                      onCommit={value => setBodyQty(g.body.id, value ?? 0)}
                    />
                    {t("pcs")}
                  </label>
                </div>
                {choices.length > 0 && (
                  <select
                    className="mt-1.5 h-8 w-full rounded-sm bg-bg-2 px-1 text-[0.6875rem] text-ink shadow-border"
                    aria-label={bomLineName(g.body)}
                    value={g.body.id}
                    disabled={g.ids.some(id => heads.some(h => h.id === id && (h.locked || project.zones.some(z => z.id === h.zone && z.locked))))}
                    onChange={(e) => setBodyKind(g.body.id, e.target.value, g.ids)}
                  >
                    <BodyOptions bodies={choices} locale={locale}/>
                  </select>
                )}
                {rec.length > 0 && (
                  <p className="mt-1 text-[0.625rem] leading-snug text-muted">
                    {t("recommended")}: {rec.map((b) => bomLineName(b!)).join(", ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {(engineeringBom.rows.length>0||engineeringBom.incomplete)&&<section className="mt-3 border-t border-line pt-3">
        <h3 className="text-sm font-semibold">{t('engineering.networks')}</h3>
        <ul className="mt-2 space-y-2">{engineeringBom.rows.map((row,i)=><li key={row.key} className="rounded-sm border border-line p-2"><div className="flex items-start gap-2"><span className="shrink-0 text-xs text-muted">{formatNumber(sprinklers.length+bodies.length+i+1,0)}</span><span className="min-w-0 flex-1 text-sm">{row.name}</span><span className="shrink-0 text-sm tabular">{formatNumber(row.qty,row.digits)} {row.unit}</span></div>{row.note&&<p className="mt-1 text-xs text-muted">{row.note}</p>}</li>)}</ul>
        {engineeringBom.incomplete&&<p role="status" className="mt-2 text-xs text-muted">{t('engineering.materialReview')}</p>}
      </section>}
      <Dialog.Root open={saveAsk} onOpenChange={open => { if (!saving) setSaveAsk(open); }}>
        <Dialog.Portal container={typeof document === "undefined" ? undefined : document.querySelector(".app-shell")}>
          <Dialog.Overlay className="estimate-dialog-overlay estimate-export-overlay" />
          <Dialog.Content className="estimate-dialog estimate-export-dialog" aria-describedby={undefined}
            onCloseAutoFocus={event => { event.preventDefault(); saveButtonRef.current?.focus(); }}
            onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
            <Dialog.Title className="font-display text-lg">{t("saveEstimate")}</Dialog.Title>
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
                      void run().catch(()=>toast.error(t('toastExportFail'))).finally(() => {
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
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export function ZoneReview() {
  return <IrrigationSystemCards showZones={false}/>;
}

function ZoneCard({ zoneId }: { zoneId: number }) {
  const project = useProject((s) => s.project);
  const units = useProject((s) => s.units);
  const t = useT();
  const z = project.zones.find((x) => x.id === zoneId);
  const heads = project.heads.filter((h) => h.zone === zoneId);
  const q = zoneFlow(heads, zoneId);
  const avail = project.water.availableLpm;
  const limit = projectZoneLimit(project);
  const [maxLpm, setMaxLpm] = useState(formatNumber(fromLpm(limit, units.flow), 2));
  useEffect(() => setMaxLpm(formatNumber(fromLpm(limit, units.flow), 2)), [limit, units.flow]);
  const patchWater = (patch: Partial<typeof project.water>) =>
    useProject.getState().patchProject({ water: { ...project.water, ...patch } });
  if (!z) return null;
  const over = q != null && q > limit + 0.05;
  return (
    <div className="p-1.5 sm:p-4">
      <p className={cn("text-[0.6875rem]", over ? "text-warn" : "text-muted")}>
        {zoneLabel(z)}: {heads.length} · {q == null ? uiText("noFlowData") : formatFlowU(q, units.flow)}
        {over ? ` · > ${formatFlowU(limit, units.flow)}` : ""}
      </p>
      <p className="mt-2 text-[0.5625rem] font-semibold tracking-wide text-muted uppercase">{t("waterSource")}</p>
      <label className="mt-1 block text-[0.625rem] text-muted">{t("sourceFlow")} · {flowLabel(units.flow)}
        <LocalizedNumberInput value={avail == null ? null : fromLpm(avail, units.flow)} min={0.001}
          placeholder={formatNumber(fromLpm(DEFAULT_ZONE_LPM, units.flow), 2)} onCommit={v => { const n = v == null ? null : toLpm(v, units.flow); patchWater({ availableLpm: n }); if (v != null) setMaxLpm(formatNumber(v, 2)); }}
          className="mt-0.5 h-8 w-full rounded-sm bg-bg-2 px-1.5 text-[1rem] text-ink shadow-border" />
      </label>
      <label className="mt-1 block text-[0.625rem] text-muted">{t("sourceP")} · {pressureLabel(units.pressure)}
        <LocalizedNumberInput value={project.water.dynamicBar == null ? null : fromBar(project.water.dynamicBar, units.pressure)} min={0.001} onCommit={v => patchWater({ dynamicBar: v == null ? null : toBar(v, units.pressure) })}
          className="mt-0.5 h-8 w-full rounded-sm bg-bg-2 px-1.5 text-[1rem] text-ink shadow-border" />
      </label>
      <label className="mt-1 block text-[0.625rem] text-muted">{t("elevation")} · {lenLabel(units.length)}
        <LocalizedNumberInput value={project.water.elevationM == null ? null : fromMeters(project.water.elevationM, units.length)} onCommit={v => patchWater({ elevationM: v == null ? null : toMetersLen(v, units.length) })}
          className="mt-0.5 h-8 w-full rounded-sm bg-bg-2 px-1.5 text-[1rem] text-ink shadow-border" />
      </label>
      <label className="mt-2 block text-[0.625rem] text-muted">
        {t("maxZoneFlow")} · {flowLabel(units.flow)}
        <input
          value={maxLpm}
          onChange={(e) => setMaxLpm(e.target.value)}
          className="mt-0.5 h-7 w-full rounded-sm bg-bg-2 px-1.5 text-[1rem] text-ink shadow-border"
        />
      </label>
      <p className="mt-1 text-[0.625rem] text-muted">{t("autoZoneHint")}</p>
      <Button
        className="irrigation-zone-action mt-2 w-full"
        size="sm"
        onClick={() => {
          const n = toLpm(parseLocalizedNumber(maxLpm), units.flow) || defaultMaxZoneLpm(project.water.availableLpm);
          useProject.getState().autoZone(n);
        }}
      >
        {t("autoZone")}
      </Button>
    </div>
  );
}
