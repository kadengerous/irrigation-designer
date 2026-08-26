"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Circle,
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
  ImageDown,
  LayoutGrid,
  Magnet,
  Maximize2,
  Menu,
  Minus,
  MoreHorizontal,
  MoveHorizontal,
  PaintBucket,
  Pencil,
  Play,
  Plus,
  Redo2,
  Ruler,
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
import { setActiveLocale, setNumberPrefs, tr } from "@/lib/i18n";
import { applyTheme } from "@/lib/theme";
import { formatAreaU, formatFlowU, formatGridStep, formatLenU, formatPressureU, fromM2, fromMeters, lenLabel, areaLabel, LENGTH_OPTS, toM2, toMetersLen } from "@/lib/units";
import { SettingsPanel } from "@/components/designer/settings-panel";
import { layoutOnDrawing, layoutOnPolygon } from "@/lib/auto-layout";
import { checkProject } from "@/lib/check-project";
import { coverageStats, exclusionPolygons, lawnPolygon } from "@/lib/coverage";
import { CATEGORIES, bodiesFor, bomLineName, catalogPhoto, categoryPhoto, defaultBodyFor, itemById, nozzleRange, placeableCatalog, popUpHeights, workingPressureBar, type CatalogItem } from "@/lib/hunter-catalog";
import { docsForFamily } from "@/lib/hunter-docs";
import { exportDxf, exportEstimateExcel, exportEstimatePdf, exportEstimateWord, exportPdf, exportPdfFromProject, exportPng, exportPngFromProject, exportProjectJson, exportSvg } from "@/lib/export-plan";
import { downloadProjectFile, fileStem, parseProjectFile, toProjectFile } from "@/lib/project-file";
import { downloadSourceZip } from "@/lib/download-source";
import { headFlow, runTimeMin, totalAreaPrecip } from "@/lib/flow";
import { dist, fmt1, fmtM, headingDeg, parseMeasureUnit, pointInPoly, polygonArea, toMeters, uid, type Pt } from "@/lib/geometry";
import { parseCadInput } from "@/lib/cad/parse";
import { drawingOrMigrate, faceArea, faceCentroid, faceLayerNumber, facePerimeter, facePoints, headInsideFace, isInternalEdge, rectWorldCorners } from "@/lib/cad/engine";
import { CAD_LAYERS, FACE_FILLS, REGION_FILL, layerForType } from "@/lib/cad/types";
import { DEFAULT_ZONE_LPM, defaultMaxZoneLpm, recommendPump } from "@/lib/hydro";
import { type Head, type Project, zoneColor } from "@/lib/project-types";
import { isNamed, useProject } from "@/lib/project-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CanvasHost } from "@/components/designer/canvas-host";

const MEASURE_SUBS: { id: "measure" | "guide"; key: string }[] = [
  { id: "measure", key: "measure" },
  { id: "guide", key: "guide" },
];

function IconDim() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4v16M19 4v16" />
      <path d="M5 12h14" />
      <path d="M8 9 5 12l3 3M16 9l3 3-3 3" />
    </svg>
  );
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
      <path d="M3 17c3.5-11 5.5 9 9 0 3.5-9 5.5 11 9 0" />
    </svg>
  );
}

const DRAW_SUBS: { id: import("@/lib/project-types").DrawSub; key: string; icon: ReactNode }[] = [
  { id: "line", key: "drawLine", icon: <Minus className="size-5" strokeWidth={1.4} /> },
  { id: "rect", key: "drawRect", icon: <Square className="size-5" strokeWidth={1.4} /> },
  { id: "circle", key: "drawCircle", icon: <Circle className="size-5" strokeWidth={1.4} /> },
  { id: "triangle", key: "drawTriangle", icon: <Triangle className="size-5" strokeWidth={1.4} /> },
  { id: "ellipse", key: "drawEllipse", icon: <Circle className="size-5 scale-x-125" strokeWidth={1.4} /> },
  { id: "arc", key: "drawArc", icon: <IconArc /> },
  { id: "spline", key: "drawSpline", icon: <IconCurve /> },
  { id: "freehand", key: "drawFreehand", icon: <Pencil className="size-5" strokeWidth={1.4} /> },
  { id: "dim", key: "drawDim", icon: <IconDim /> },
  { id: "text", key: "drawText", icon: <Type className="size-5" strokeWidth={1.4} /> },
];

const DRAW_PRIMARY = DRAW_SUBS;

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
  { id: 0.005, label: "0,5 см" },
  { id: 0.01, label: "1 см" },
  { id: 0.05, label: "5 см" },
  { id: 0.1, label: "10 см" },
  { id: 0.2, label: "20 см" },
  { id: 0.5, label: "50 см" },
  { id: 0.8, label: "80 см" },
  { id: 1, label: "100 см" },
] as const;

function useT() {
  const locale = useProject((s) => s.locale);
  return (key: string, vars?: Record<string, string | number>) => tr(locale, key, vars);
}

export function DesignerApp() {
  const fileRef = useRef<HTMLInputElement>(null);
  const exportFn = useRef<(() => string | null) | null>(null);
  const [scalePair, setScalePair] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const [scaleValue, setScaleValue] = useState("5.00");
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [cadTick, setCadTick] = useState(0);
  useEffect(() => {
    hoverRef.current = hover;
  }, [hover]);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [exportDrawOpen, setExportDrawOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourcePct, setSourcePct] = useState<number | null>(null);
  const [sourcePacks, setSourcePacks] = useState<{ file: string; label: string }[]>([
    { file: "irrigation-designer-source.zip", label: "Irrigation Designer" },
  ]);
  useEffect(() => {
    if (!sourceOpen) return;
    void fetch("/downloads/manifest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data[0]?.file) setSourcePacks(data);
      })
      .catch(() => {});
  }, [sourceOpen]);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [nameAsk, setNameAsk] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [deleteAsk, setDeleteAsk] = useState<{ id: string; name: string } | null>(null);
  const [catalogGhost, setCatalogGhost] = useState<{ id: string; x: number; y: number } | null>(null);
  const [libInfo, setLibInfo] = useState<string | null>(null);
  const [catInfo, setCatInfo] = useState<(typeof CATEGORIES)[number]["id"] | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
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
  const cadEditId = useProject((s) => s.cadEditId);
  const cadLiveRot = useProject((s) => s.cadLiveRot);
  const selectedIds = useProject((s) => s.selectedIds);
  const familyFilter = useProject((s) => s.familyFilter);
  const showGrid = useProject((s) => s.showGrid);
  const showCoverage = useProject((s) => s.showCoverage);
  const showLabels = useProject((s) => s.showLabels);
  const catalogOpen = useProject((s) => s.catalogOpen);
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
  useEffect(() => {
    if (!libInfo && !catInfo) return;
    let armed = false;
    const arm = window.setTimeout(() => {
      armed = true;
    }, 80);
    const close = (e: PointerEvent) => {
      if (!armed) return;
      const node = e.target;
      if (node instanceof Element && (node.closest("[data-cat-bar] button") || node.closest("[data-cat-docs]"))) {
        setLibInfo(null);
        return;
      }
      setLibInfo(null);
      setCatInfo(null);
      setDocsOpen(false);
    };
    window.addEventListener("pointerdown", close, true);
    return () => {
      window.clearTimeout(arm);
      window.removeEventListener("pointerdown", close, true);
    };
  }, [libInfo, catInfo]);
  const activeZoneId = useProject((s) => s.activeZoneId);
  const saveState = useProject((s) => s.saveState);
  const past = useProject((s) => s.past);
  const lastOp = useProject((s) => s.lastOp);
  const [drawMoreOpen, setDrawMoreOpen] = useState(false);
  const [kindsOpen, setKindsOpen] = useState(false);
  const future = useProject((s) => s.future);
  const snapOn = useProject((s) => s.snapOn);
  const orthoOn = useProject((s) => s.orthoOn);
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

  const zoneFlows = useMemo(() => {
    const map = new Map<number, number>();
    let all = 0;
    let known = true;
    for (const h of project.heads) {
      const q = headFlow(h).lpm;
      if (q == null) {
        known = false;
        continue;
      }
      all += q;
      map.set(h.zone, (map.get(h.zone) ?? 0) + q);
    }
    const maxZ = Math.max(0, ...map.values());
    return { all, maxZ, map, known };
  }, [project.heads]);

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
    const x = Math.min(rect.right - 2, Math.max(rect.left + 2, clientX));
    const y = Math.min(rect.bottom - 2, Math.max(rect.top + 2, clientY));
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
    useProject.getState().setPlaceId(catalogId);
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
      setCatalogGhost({ id: d.id, x: d.lastX, y: d.lastY });
    }, 380);

    const onMove = (ev: PointerEvent) => {
      const d = catalogDrag.current;
      if (!d || d.pointerId !== ev.pointerId) return;
      trackFrom(ev.clientX, ev.clientY);
      if (!d.hold) {
        if (Math.hypot(d.lastX - d.startX, d.lastY - d.startY) > 8) {
          window.clearTimeout(holdTimer);
          catalogDrag.current = null;
          setLibInfo(null);
        }
        return;
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
    const finish = (clientX?: number, clientY?: number) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(holdTimer);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onCancel, true);
      window.removeEventListener("touchmove", onTouchMove, true);
      window.removeEventListener("touchend", onTouchEnd, true);
      window.removeEventListener("touchcancel", onTouchEnd, true);
      const d = catalogDrag.current;
      catalogDrag.current = null;
      setCatalogGhost(null);
      if (!d?.hold) return;
      setLibInfo(null);
      dropCatalogAt(clientX || d.lastX, clientY || d.lastY, d.id);
    };

    const onUp = (ev: PointerEvent) => {
      if (catalogDrag.current && catalogDrag.current.pointerId !== ev.pointerId) return;
      finish(ev.clientX, ev.clientY);
    };
    const onCancel = (ev: PointerEvent) => {
      const d = catalogDrag.current;
      if (d?.hold) {
        ev.preventDefault();
        trackFrom(ev.clientX, ev.clientY);
        return;
      }
      finish();
    };
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
    window.addEventListener("touchcancel", onTouchEnd, { capture: true });
  };

  const liveLen =
    tool === "draw" && draft.points.length >= 1 && hover
      ? Math.hypot(hover.x - draft.points[draft.points.length - 1]!.x, hover.y - draft.points[draft.points.length - 1]!.y)
      : lastSeg;
  const a0 = draft.points[0];
  const editFace = cadEditId ? drawingOrMigrate(project).faces[cadEditId] : null;
  const editPts = cadEditId ? facePoints(drawingOrMigrate(project), cadEditId) : [];
  const liveWH =
    editFace?.rect
      ? { w: editFace.rect.w, h: editFace.rect.h }
      : editFace?.ellipse
        ? { w: editFace.ellipse.rx * 2, h: editFace.ellipse.ry * 2 }
        : editFace && !editFace.circle && editPts.length >= 3
          ? (() => {
              const xs = editPts.map((p) => p.x);
              const ys = editPts.map((p) => p.y);
              return { w: Math.max(0.01, Math.max(...xs) - Math.min(...xs)), h: Math.max(0.01, Math.max(...ys) - Math.min(...ys)) };
            })()
          : tool === "draw" && (drawSub === "rect" || drawSub === "ellipse") && a0 && hover
            ? { w: Math.abs(hover.x - a0.x), h: Math.abs(hover.y - a0.y) }
            : null;
  const liveR = tool === "draw" && drawSub === "circle" && a0 && hover ? Math.hypot(hover.x - a0.x, hover.y - a0.y) : null;
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

  const context = catalogOpen || tool === "measure" || tool === "scale" || tool === "draw";
  const activeQ = zoneFlows.map.get(activeZoneId);

  return (
    <div className="app-shell bg-bg text-ink">
      <Toaster position="bottom-center" />
      {(fileMenuOpen || gridOpen) && (
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
            className="max-sm:size-10"
            aria-label={t("file")}
            onClick={() => {
              setFileMenuOpen((v) => !v);
              setExportDrawOpen(false);
              setGridOpen(false);
            }}
          >
            <Menu />
          </Button>
          {fileMenuOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md bg-surface p-1 text-ink shadow-border">
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
              <MenuBtn
                onClick={() => {
                  setFileMenuOpen(false);
                  setSourceOpen(true);
                }}
                icon={<FileDown className="size-3.5" />}
                label={t("downloadSource")}
              />
            </div>
          )}
        </div>
        <div className="mr-2 hidden shrink-0 border-r border-white/20 pr-3 md:block">
          <p className="font-display text-sm font-semibold tracking-[0.12em] leading-none">IRRIGATION DESIGNER</p>
          <p className="mt-0.5 text-[10px] text-tool-fg/75">{t("hunterTagline")}</p>
        </div>
        <div className="scroll-touch flex min-w-0 flex-1 items-center gap-1">
        <Button size="icon" variant="bar" className="max-sm:size-10" disabled={!past.length} onClick={() => useProject.getState().undo()} aria-label={t("undo")}>
          <Undo2 />
        </Button>
        <Button size="icon" variant="bar" className="max-sm:size-10" disabled={!future.length} onClick={() => useProject.getState().redo()} aria-label={t("redo")}>
          <Redo2 />
        </Button>
        <BarTool
          id="draw"
          label={t("draw")}
          active={tool === "draw"}
          onClick={() => {
            const st = useProject.getState();
            st.setTool(st.tool === "draw" ? null : "draw");
            st.setRightMode("drawing");
            st.setRightOpen(true);
          }}
        />
        <BarTool
          id="place"
          label={t("sprinklers")}
          active={catalogOpen}
          onClick={() => {
            const st = useProject.getState();
            if (catalogOpen) {
              st.setCatalogOpen(false);
            } else {
              st.setCatalogOpen(true);
              st.setRightMode("zone");
              st.setRightOpen(true);
            }
          }}
        />
        {catalogOpen && (
          <Button size="xs" variant="bar" className="shrink-0" onClick={autoPlace} aria-label={t("autoPlace")}>
            <LayoutGrid />
            <span className="hidden sm:inline">{t("autoPlace")}</span>
          </Button>
        )}
        </div>
        <div className="flex shrink-0 items-center gap-1 pl-1">
          <Button size="xs" variant="bar" className="max-sm:size-10 max-sm:px-0" aria-label={t("projects")} onClick={() => {
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

      {context && (
        <div className="relative z-30 shrink-0 overflow-visible" data-cat-bar>
        <div className="flex h-[42px] items-center gap-1 overflow-visible border-b border-line bg-tool-2/90 px-2">
          {catalogOpen &&
            CATEGORIES.map((f) => (
              <Button
                key={f.id}
                size="xs"
                variant={familyFilter === f.id ? "pale-on" : "pale"}
                onClick={() => {
                  useProject.getState().setFamily(f.id);
                  useProject.getState().setCatalogVisible(true);
                  setLibInfo(null);
                  setDocsOpen(false);
                  if (f.id === "all") {
                    setCatInfo(null);
                    return;
                  }
                  setCatInfo(catInfo === f.id ? null : f.id);
                }}
              >
                {t(`cat_${f.id}`)}
              </Button>
            ))}
          {showHints && tool === "scale" && <p className="px-2 text-xs text-ink-soft">{t("scaleHint")}</p>}
          {(tool === "draw" || tool === "measure") && (
            <>
              {DRAW_PRIMARY.map((s) => (
                <Button
                  key={s.id}
                  size="icon"
                  variant={tool === "draw" && drawSub === s.id ? "pale-on" : "pale"}
                  className="size-9 text-ink [&_svg]:size-5"
                  aria-label={t(s.key)}
                  onClick={() => useProject.getState().setDrawSub(s.id)}
                >
                  {s.icon}
                </Button>
              ))}
              <Button
                size="icon"
                variant={tool === "measure" ? "pale-on" : "pale"}
                className="size-9 text-ink [&_svg]:size-5"
                aria-label={t("ruler")}
                onClick={() => useProject.getState().setTool("measure")}
              >
                <Ruler className="size-5" strokeWidth={2.2} />
              </Button>
            </>
          )}
        </div>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {catalogOpen && catalogVisible && (
          <aside
            className={cn(
              "absolute inset-y-0 left-0 z-20 flex w-56 flex-col border-r border-line bg-surface shadow-border lg:static lg:h-auto lg:w-56",
              catalogGhost && "opacity-50",
            )}
            data-catalog
          >
            <div className="flex items-center justify-between gap-1 px-1.5 pt-2">
              <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">{t("library")}</p>
              <Button
                size="xs"
                variant="solid"
                className="shrink-0 border-[#c45c26] bg-[#c45c26] text-white hover:bg-[#b35220]"
                onClick={() => useProject.getState().setCatalogVisible(false)}
              >
                <ChevronLeft className="size-3.5" />
                {t("hide")}
              </Button>
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
                    onPointerDown={(e) => startCatalogDrag(e, c.id)}
                    className={cn(
                      "mb-1 flex w-full touch-pan-y select-none items-center gap-1 rounded-md border px-1 text-left text-xs",
                      familyFilter === "all" ? "py-1.5" : "py-1",
                      placeId === c.id ? "border-catalog bg-catalog text-catalog-fg" : "border-line bg-transparent hover:bg-catalog-soft",
                    )}
                  >
                    <CatalogPic item={c} className="h-12 w-12" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium leading-tight">{c.id}</span>
                      <span className={cn("block text-[10px] leading-tight", placeId === c.id ? "text-catalog-fg/80" : "text-muted")}>
                        {formatLenU(c.rMin, units.length)}–{formatLenU(c.rMax, units.length)}
                      </span>
                      <span className={cn("block text-[10px] leading-tight", placeId === c.id ? "text-catalog-fg/80" : "text-muted")}>
                        {c.arcMin === c.arcMax ? `${c.arcMax}°` : `${c.arcMin}–${c.arcMax}°`}
                      </span>
                    </span>
                    <CatalogThumb color={c.color} arc={c.arcMax} />
                  </button>
                </li>
              ))}
            </ul>
            {catalog.length > 0 && <CatalogScroller listRef={catalogListRef} dep={`${familyFilter}:${catalog.length}`} />}
            </div>
          </aside>
        )}
        {catalogOpen && !catalogVisible && (
          <button
            type="button"
            className="absolute left-0 top-1/2 z-20 flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-[#c45c26]/40 bg-[#c45c26]/55 text-white shadow-border"
            onClick={() => useProject.getState().setCatalogVisible(true)}
            aria-label={t("library")}
          >
            <ChevronRight className="size-4" />
          </button>
        )}

        {catalogOpen && (libInfo || catInfo) && (
          <div className="pointer-events-none absolute left-[14.25rem] top-2 z-30 w-[22rem] max-w-[min(22rem,calc(100vw-15rem))] rounded-lg bg-surface/80 p-3 text-ink shadow-border backdrop-blur-[2px]">
            {libInfo &&
              (() => {
                const item = itemById(libInfo);
                if (!item) return null;
                return (
                  <>
                    <CatalogPic item={item} className="mx-auto h-32 w-32" />
                    <p className="mt-2 text-center text-sm font-semibold leading-tight text-[#0077a3]">{item.id}</p>
                    <p className="mt-0.5 text-center text-[11px] text-muted">{item.series}</p>
                    <p className="mt-2 text-xs leading-relaxed text-ink-soft">{item.use}</p>
                    <p className="mt-2 text-xs leading-relaxed text-ink">
                      {formatLenU(item.rMin, units.length)}–{formatLenU(item.rMax, units.length)}
                      {" · "}
                      {item.arcMin === item.arcMax ? `${item.arcMax}°` : `${item.arcMin}–${item.arcMax}°`}
                      {item.thread ? ` · ${item.thread}` : ""}
                    </p>
                  </>
                );
              })()}
            {!libInfo && catInfo && (
              <>
                {categoryPhoto(catInfo) && (
                  <img src={categoryPhoto(catInfo)!} alt="" className="mx-auto w-full max-h-56 object-contain" />
                )}
                <p className="mt-2 text-center text-sm font-semibold leading-tight">{t(`cat_${catInfo}`)}</p>
                <p className="mt-2 text-xs leading-relaxed text-ink-soft">{t(`catInfo_${catInfo}`)}</p>
                {catInfo !== "all" && (
                  <div data-cat-docs className="pointer-events-auto mt-3">
                    <Button
                      type="button"
                      variant="solid"
                      size="sm"
                      className="w-full"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => setDocsOpen((v) => !v)}
                    >
                      <FileText />
                      {t("docs")}
                    </Button>
                    {docsOpen && (
                      <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-md bg-panel/80 p-1.5">
                        {docsForFamily(catInfo, locale, units).map((d) => (
                          <li key={d.url + (d.label ?? "")}>
                            <a
                              href={d.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs text-ink hover:bg-surface"
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              <span className="min-w-0 truncate">
                                {d.kind === "video" ? (d.label ?? t("docsVideo")) : d.label ? `${d.label} · ${t(d.titleKey)}` : t(d.titleKey)}
                                <span className="ml-1 text-[10px] uppercase text-muted">{d.kind === "video" ? t("docsVideo") : d.kind}</span>
                              </span>
                              <span className="shrink-0 text-accent">{d.kind === "video" ? <Play className="inline size-3.5" /> : t("docsOpen")}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <section className="relative min-w-0 flex-1 overflow-visible">
          <CanvasHost
            onScalePair={(a, b) => setScalePair({ a, b })}
            onMeasure={(m) => toast(formatLenU(m, useProject.getState().units.length))}
            onHover={setHover}
            onExportReady={(fn) => {
              exportFn.current = fn;
            }}
          />
          {tool === "draw" && drawSub !== "none" && (
            <div className="pointer-events-none absolute bottom-12 left-1/2 z-30 max-w-[min(92%,22rem)] -translate-x-1/2 rounded-md bg-ink/80 px-2.5 py-1 text-center text-[11px] leading-snug text-white shadow-border">
              {t(DRAW_PRIMARY.find((s) => s.id === drawSub)?.key ?? "draw")}
              {t(`hint_${drawSub}`) ? ` · ${t(`hint_${drawSub}`)}` : ""}
            </div>
          )}
          {cadEditId && !catalogOpen && !draft.points.length && <CadEditBar faceId={cadEditId} />}
          {((tool === "draw" && drawSub !== "none") || cadEditId) && (
            <DrawMeasurePad
              drawSub={
                cadEditId && drawingOrMigrate(project).faces[cadEditId]?.circle
                  ? "circle"
                  : cadEditId && drawingOrMigrate(project).faces[cadEditId]?.ellipse
                    ? "ellipse"
                    : cadEditId
                      ? "rect"
                      : drawSub
              }
              liveLen={liveLen}
              liveWH={liveWH}
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
              hasPoint={draft.points.length >= 1 || Boolean(cadEditId)}
              hover={hover}
              last={draft.points[draft.points.length - 1] ?? null}
              editFaceId={cadEditId}
            />
          )}
        </section>

        {rightOpen ? (
          <aside className="info-panel absolute inset-y-0 right-0 z-40 flex w-36 flex-col overflow-y-auto border-l border-line bg-surface shadow-border sm:w-[min(100%,22rem)] lg:static lg:h-auto lg:w-[320px]">
            <div className="flex shrink-0 items-center gap-1 border-b border-line px-1 py-1 sm:gap-2 sm:px-2 sm:py-2">
              <Button
                type="button"
                size="xs"
                variant="solid"
                className="shrink-0 border-[#c45c26] bg-[#c45c26] text-white hover:bg-[#b35220]"
                onPointerUp={(e) => {
                  e.preventDefault();
                  useProject.getState().setRightOpen(false);
                }}
              >
                {t("hide")}
                <ChevronRight className="size-3.5" />
              </Button>
              <div className="ml-auto flex min-w-0 flex-row overflow-x-auto">
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
                      className={cn("h-7 shrink-0 rounded-sm px-2 text-[11px] font-semibold sm:h-8", on ? "bg-btn text-btn-fg" : "text-muted hover:bg-bg-2")}
                      onClick={() =>
                        useProject.getState().setRightMode(id === "drawing" ? "drawing" : id === "estimate" ? "estimate" : "zone")
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {rightMode === "estimate" ? (
              <EstimateCard onCheck={() => setIssuesOpen(true)} />
            ) : rightMode === "zone" || rightMode === "object" || rightMode === "irrigation" ? (
              selected && selectedItem ? (
                <HeadCard head={selected} />
              ) : (
                <div className="p-1.5 sm:p-3">
                  <ZoneList />
                  <PumpBox />
                </div>
              )
            ) : (
              <DrawingCard />
            )}
          </aside>
        ) : (
          <button
            type="button"
            className="absolute right-0 top-1/2 z-20 flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-[#c45c26]/40 bg-[#c45c26]/55 text-white shadow-border"
            onClick={() => useProject.getState().setRightOpen(true)}
            aria-label={t("showPanel")}
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
      </div>

      <footer className="app-footer relative z-30 flex min-h-11 shrink-0 items-center gap-2 scroll-touch border-t border-line bg-surface px-2 py-1 text-xs">
        <div className="relative shrink-0">
          <div className="flex items-stretch overflow-hidden rounded-md border border-tool">
            <Button
              size="xs"
              variant={showGrid ? "pressed" : "ghost"}
              className="rounded-none border-0"
              onClick={() => {
                useProject.getState().setGrid(!showGrid);
                setGridOpen(false);
                setFileMenuOpen(false);
              }}
            >
              <Grid3x3 />
              {t("grid")}
            </Button>
            <span className="w-px self-stretch bg-tool/35" aria-hidden />
            <Button
              size="xs"
              variant={gridOpen ? "pressed" : "ghost"}
              className="shrink-0 rounded-none border-0"
              onClick={() => {
                setGridOpen((v) => !v);
                setFileMenuOpen(false);
              }}
            >
              {t("step")} {formatGridStep(gridStep, units.length)}
            </Button>
          </div>
          {gridOpen && (
            <div className="grid-step-pop fixed left-2 z-50 w-36 rounded-md bg-surface p-2 text-ink shadow-border">
              <p className="px-1 pb-1 text-[10px] font-semibold tracking-wide text-muted uppercase">{t("gridStep")}</p>
              <div className="flex flex-col gap-0.5">
                {GRID_STEPS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={cn(
                      "h-8 rounded-sm px-2 text-left text-xs font-medium",
                      gridStep === g.id ? "bg-btn text-btn-fg" : "text-ink hover:bg-btn-soft",
                    )}
                    onClick={() => {
                      useProject.getState().setGridStep(g.id);
                      useProject.getState().setGrid(true);
                      setGridOpen(false);
                    }}
                  >
                    {formatLenU(g.id, units.length)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {project.heads.length > 0 && (
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
              {activeQ != null ? ` · ${formatFlowU(activeQ, units.flow)}` : ""}
            </>
          ) : null}
        </span>
        <Button
          size="xs"
          variant={snapOn ? "pressed" : "ghost"}
          className="shrink-0"
          onClick={() => useProject.getState().setSnap(!useProject.getState().snapOn)}
        >
          <Magnet className="size-3.5" />
          <span className="hidden sm:inline">{t("magnet")}</span>
        </Button>
        <button
          type="button"
          className={cn("inline-flex h-8 shrink-0 items-center gap-1 rounded-sm px-1.5", orthoOn ? "text-ok" : "text-muted")}
          onClick={() => useProject.getState().setOrtho(!useProject.getState().orthoOn)}
        >
          <MoveHorizontal className="size-3.5" />
          <span className="hidden sm:inline">{t("ortho")}</span>
          {orthoOn ? "●" : "○"}
        </button>
        <span className={cn("shrink-0", project.scaleCalibrated ? "text-ok" : "text-warn")}>
          {project.scaleCalibrated ? t("scaleOk") : t("scaleWarn")}
        </span>
        <span className="ml-auto hidden shrink-0 tabular text-muted sm:inline">
          {lastOp ? lastOp : ""} {saveState === "saved" ? t("savedOk") : saveState === "saving" ? t("saving") : ""}
        </span>
      </footer>

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

      {scalePair && (
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
      {sourceOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-end bg-ink/40 p-3 sm:place-items-center" onPointerUp={() => setSourceOpen(false)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg bg-surface p-4 text-ink shadow-border" onPointerUp={(e) => e.stopPropagation()}>
            <p className="font-display text-lg">{t("downloadSource")}</p>
            <p className="mt-2 text-sm text-ink-soft">{t("downloadSourceHint")}</p>
            <p className="mt-1 text-xs text-ink-soft">Файл ~95 МБ, остаёшься в приложении — не уходим на другую страницу.</p>
            <button
              type="button"
              disabled={sourcePct !== null}
              onClick={() => {
                setSourcePct(0);
                void downloadSourceZip(setSourcePct)
                  .then(() => {
                    toast("Архив скачан");
                    setSourcePct(null);
                  })
                  .catch(() => {
                    toast("Не удалось скачать архив. Попробуй ещё раз.");
                    setSourcePct(null);
                  });
              }}
              className="mt-3 flex w-full items-center justify-between rounded-md border border-line px-3 py-2 text-left text-sm hover:bg-panel disabled:opacity-60"
            >
              <span>{sourcePacks[0]?.label ?? "Irrigation Designer (95 МБ)"}</span>
              <FileDown className="size-4 text-btn" />
            </button>
            {sourcePct !== null && (
              <div className="mt-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-line">
                  <div className="h-full bg-btn" style={{ width: `${sourcePct}%` }} />
                </div>
                <p className="mt-1 text-xs text-ink-soft">Скачивание {sourcePct}%</p>
              </div>
            )}
            <Button className="mt-3 w-full" size="sm" onClick={() => setSourceOpen(false)}>
              {t("close")}
            </Button>
          </div>
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
      onClick={
        onClick ??
        (() => {
          const cur = useProject.getState().tool;
          useProject.getState().setTool(cur === id ? null : id);
        })
      }
    >
      {id === "draw" && <Pencil />}
      {id === "place" && <Crosshair />}
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

function CatalogThumb({ color, arc }: { color: string; arc: number }) {
  const sweep = Math.min(360, Math.max(40, arc));
  const r = 10;
  const cx = 14;
  const cy = 14;
  const a0 = -sweep / 2;
  const a1 = sweep / 2;
  const rad = (d: number) => (d * Math.PI) / 180;
  const large = sweep > 180 ? 1 : 0;
  const d =
    sweep >= 359
      ? `M ${cx} ${cy} m -${r} 0 a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 -${r * 2} 0`
      : `M ${cx} ${cy} L ${cx + r * Math.cos(rad(a0))} ${cy + r * Math.sin(rad(a0))} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(rad(a1))} ${cy + r * Math.sin(rad(a1))} Z`;
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" className="mt-0.5 shrink-0" aria-hidden>
      <circle cx="14" cy="14" r="13" fill="transparent" stroke="currentColor" opacity="0.12" />
      <path d={d} fill={color} opacity="0.9" />
    </svg>
  );
}

function CatalogPic({ item, className }: { item: CatalogItem; className?: string }) {
  const fallback =
    item.type === "rotor" || item.family === "rotor"
      ? "/catalog/PGP-ADJ.png?v=8"
      : item.type === "bubbler" || item.family === "bubbler"
        ? "/catalog/MSBN-50Q.png?v=8"
        : item.family === "mp" || item.family === "mp800" || item.family === "strip"
        ? "/catalog/MP2000.png?v=8"
        : item.type === "body"
          ? "/catalog/body.png?v=8"
          : "/catalog/8A.png?v=8";
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
          className="shrink-0 bg-[#7ec8f2] px-1.5 text-[#1b2430]"
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
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  color: string;
  display: string;
  onChange: (n: number) => void;
}) {
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
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        className="head-slider mt-0.5 w-full"
        style={{
          color,
          background: `linear-gradient(90deg, ${color} ${pct}%, color-mix(in srgb, ${color} 22%, transparent) ${pct}%)`,
        }}
        onPointerDown={() => useProject.getState().beginHeadEdit()}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={() => useProject.getState().endHeadEdit()}
        onPointerCancel={() => useProject.getState().endHeadEdit()}
        onLostPointerCapture={() => useProject.getState().endHeadEdit()}
      />
    </label>
  );
}

function CadEditBar({ faceId }: { faceId: string }) {
  const t = useT();
  const panX = useProject((s) => s.panX);
  const panY = useProject((s) => s.panY);
  const px = useProject((s) => s.pxPerMeter);
  const project = useProject((s) => s.project);
  const themeId = useProject((s) => s.themeId);
  const dark = themeId === "dusk" || themeId === "night" || themeId === "graphite";
  const [askDel, setAskDel] = useState(false);
  const [fillOpen, setFillOpen] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const [name, setName] = useState("");
  const hideTip = useRef(0);
  const nameRef = useRef("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const d = drawingOrMigrate(project);
  const face = d.faces[faceId];
  nameRef.current = name;
  useEffect(() => {
    setAskDel(false);
    setFillOpen(false);
    setTip(null);
    const n = drawingOrMigrate(useProject.getState().project).faces[faceId]?.name ?? "";
    setName(n);
    nameRef.current = n;
    return () => window.clearTimeout(hideTip.current);
  }, [faceId]);
  const saveName = () => {
    const next = nameRef.current.trim();
    const cur = drawingOrMigrate(useProject.getState().project).faces[faceId]?.name ?? "";
    if (next === cur) return;
    useProject.getState().setFaceName(next);
  };
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const node = e.target as Node | null;
      if (wrapRef.current?.contains(node)) return;
      saveName();
      setFillOpen(false);
      setAskDel(false);
      setTip(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [faceId]);
  if (!face || face.locked) return null;
  const pts = face.circle
    ? [
        { x: face.circle.cx - face.circle.r, y: face.circle.cy - face.circle.r },
        { x: face.circle.cx + face.circle.r, y: face.circle.cy + face.circle.r },
      ]
    : face.rect
      ? rectWorldCorners(face.rect)
      : facePoints(d, faceId);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p.x * px + panX);
  const ys = pts.map((p) => p.y * px + panY);
  const box = { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
  const bw = Math.max(8, box.r - box.l);
  const bh = Math.max(8, box.b - box.t);
  const barW = 232;
  const barH = 42;
  const palW = 152;
  const palH = 128;
  const host = typeof document !== "undefined" ? document.querySelector("[data-design-canvas]") : null;
  const cw = host instanceof HTMLElement ? host.clientWidth : 480;
  const ch = host instanceof HTMLElement ? host.clientHeight : 480;
  const gapA = 56;
  const gapB = 68;
  const keep = { l: box.l - 12, r: box.r + gapB, t: box.t - gapA, b: box.b + 16 };
  const clampPos = (left: number, top: number) => ({
    left: Math.max(8, Math.min(left, cw - barW - 8)),
    top: Math.max(14, Math.min(top, ch - barH - 8)),
  });
  const hits = (p: { left: number; top: number }) =>
    p.left < keep.r && p.left + barW > keep.l && p.top < keep.b && p.top + barH > keep.t;
  const candidates = [
    clampPos(box.l - gapB - barW, box.t + (bh - barH) / 2),
    clampPos(box.l + (bw - barW) / 2, box.b + 28),
    clampPos(box.l + (bw - barW) / 2, box.t - gapA - barH),
    clampPos(8, box.b + 28),
    clampPos(cw - barW - 8, box.b + 28),
    clampPos(8, 14),
    clampPos(cw - barW - 8, 14),
  ];
  const placed = candidates.find((p) => !hits(p)) ?? candidates[5]!;
  const left = placed.left;
  const top = placed.top;
  const palLeft0 = Math.max(8, Math.min(left + (barW - palW) / 2, cw - palW - 8));
  let palLeft = palLeft0;
  let palTop = top - palH - 6;
  if (palTop < 8) {
    palTop = top;
    palLeft = left + barW + 6;
    if (palLeft + palW > cw - 8) palLeft = Math.max(8, left - palW - 6);
  }
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
        "relative flex size-9 shrink-0 items-center justify-center rounded-sm",
        danger ? "text-danger hover:bg-danger/10" : dark ? "text-[#1b2430] hover:bg-white/35" : "text-ink hover:bg-btn-soft",
      )}
      onPointerEnter={() => showTip(label)}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        showTip(label);
        onPress();
      }}
    >
      {children}
    </button>
  );
  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 z-40">
      <div
        className={cn(
          "pointer-events-auto absolute flex flex-row items-center gap-0.5 rounded-md p-0.5 shadow-border",
          dark
            ? "border border-sky-300/50 bg-sky-200/40 text-[#1b2430] backdrop-blur-md"
            : "border border-line bg-surface",
        )}
        style={{ left, top, width: barW, height: barH }}
      >
        <input
          aria-label={t("faceName")}
          placeholder={t("layerN", { n: faceLayerNumber(d, faceId) })}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            nameRef.current = e.target.value;
          }}
          onFocus={(e) => {
            showTip(t("faceName"));
            e.currentTarget.select();
          }}
          onBlur={saveName}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              saveName();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={cn(
            "h-8 w-[4.75rem] shrink-0 rounded-sm px-1.5 text-[11px] shadow-border placeholder:text-muted/55",
            dark ? "bg-white/45 text-[#1b2430] placeholder:text-[#1b2430]/45" : "bg-bg-2 text-ink",
          )}
        />
        <div className="flex flex-row items-center">
          <Btn
            label={t("fillShapeHint")}
            onPress={() => {
              setAskDel(false);
              setFillOpen((v) => !v);
            }}
          >
            <span className="relative">
              <PaintBucket className="size-4" />
              <span
                className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full border border-white"
                style={{ background: face.fill ?? REGION_FILL[face.type] ?? "#c8e6b0" }}
              />
            </span>
          </Btn>
          <Btn
            label={t("duplicateHint")}
            onPress={() => {
              setAskDel(false);
              setFillOpen(false);
              useProject.getState().duplicateSelected();
            }}
          >
            <Copy className="size-4" />
          </Btn>
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
          <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 w-max max-w-[12rem] -translate-x-1/2 rounded-sm bg-ink px-2 py-1 text-[10px] leading-snug text-white shadow-border">
            {tip}
          </span>
        )}
      </div>
      {fillOpen && (
        <div
          className={cn(
            "pointer-events-auto absolute z-50 grid w-[9.5rem] grid-cols-5 gap-1 rounded-md p-1.5 shadow-border",
            dark ? "border border-sky-300/50 bg-sky-200/50 backdrop-blur-md" : "border border-line bg-surface",
          )}
          style={{ left: palLeft, top: palTop }}
        >
          {FACE_FILLS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              className={cn(
                "size-6 rounded-sm border",
                (face.fill ?? "") === c ? "border-tool ring-1 ring-tool" : "border-line",
              )}
              style={{ background: c }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                useProject.getState().setFaceFill(c);
              }}
            />
          ))}
        </div>
      )}
      {askDel && (
        <div
          className={cn(
            "pointer-events-auto absolute z-50 w-[11.5rem] rounded-md p-2 shadow-border",
            dark ? "border border-sky-300/50 bg-sky-200/50 text-[#1b2430] backdrop-blur-md" : "border border-line bg-surface",
          )}
          style={{
            left: Math.max(8, Math.min(left, cw - 192)),
            top: Math.max(14, Math.min(top + barH + 6, ch - 96)),
          }}
        >
          <p className={cn("text-xs font-medium", dark ? "text-[#1b2430]" : "text-ink")}>{t("deleteShapeAsk")}</p>
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

function DrawMeasurePad({
  drawSub,
  liveLen,
  liveWH,
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
  drawSub: string;
  liveLen: number;
  liveWH: { w: number; h: number } | null;
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
  const t = useT();
  const kbLift = useKbLift();
  const units = useProject((s) => s.units);
  const [text, setText] = useState("");
  const [rIn, setRIn] = useState("");
  const [dIn, setDIn] = useState("");
  const [sIn, setSIn] = useState("");
  const [wIn, setWIn] = useState("");
  const [lIn, setLIn] = useState("");
  const [kIn, setKIn] = useState("100");
  const [rotIn, setRotIn] = useState("0");
  const dirty = useRef<"r" | "d" | "s" | "w" | "l" | "k" | "rot" | null>(null);
  const param =
    drawSub === "circle" ? t("drawRadius") :
    drawSub === "rect" || drawSub === "ellipse" ? t("drawSize") :
    drawSub === "arc" ? t("drawRadius") :
    t("drawLength");
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
    const area = drawSub === "ellipse" ? Math.PI * (liveWH.w / 2) * (liveWH.h / 2) : liveWH.w * liveWH.h;
    setSIn(fmtN(fromM2(area, units.area), areaDec));
  }, [liveWH, units.length, units.area, drawSub]);
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
    const parsed = parseCadInput(raw, true);
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
      if (drawSub === "rect" || drawSub === "ellipse") st.applyCadSize(parsed.meters, parsed.meters, hover);
      else st.applyCadLength(parsed.meters, hover);
    } else if (parsed.kind === "size") st.applyCadSize(parsed.width, parsed.height, hover);
    else if (parsed.kind === "area") st.applyCadArea(parsed.meters2, hover);
  };
  const areaM2 =
    drawSub === "circle" && liveR != null
      ? Math.PI * liveR * liveR
      : drawSub === "ellipse" && liveWH
        ? Math.PI * (liveWH.w / 2) * (liveWH.h / 2)
        : liveWH
          ? liveWH.w * liveWH.h
          : null;
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
        const k = Math.sqrt(area / Math.max(curW * curH, 1e-9));
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
  const field = (label: string, unit: string, value: string, which: "r" | "d" | "s" | "w" | "l" | "k" | "rot", set: (v: string) => void) => (
    <label className="flex items-center gap-1 sm:gap-2">
      <span className="w-[4.85rem] shrink-0 whitespace-nowrap text-[11px] font-semibold text-ink sm:w-24 sm:text-sm">{label}</span>
      <input
        inputMode="decimal"
        className="h-7 min-w-0 flex-1 rounded-sm bg-bg-2 px-1.5 text-[11px] tabular shadow-border sm:h-10 sm:px-2 sm:text-sm"
        value={value}
        onChange={(e) => {
          dirty.current = which;
          set(e.target.value);
        }}
        onFocus={(e) => {
          dirty.current = which;
          e.currentTarget.select();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            if (which === "w" || which === "l" || which === "k" || which === "rot" || (which === "s" && (drawSub === "rect" || drawSub === "ellipse"))) applyRectFrom(which === "s" ? "s" : which === "k" ? "k" : which === "rot" ? "rot" : which);
            else applyCircleFrom(which);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <span className="w-6 shrink-0 text-[10px] text-muted sm:w-8 sm:text-[11px]">{unit}</span>
    </label>
  );
  return (
    <div
      className="pointer-events-auto fixed left-2 z-[90] w-[13.5rem] rounded-md border-2 border-tool bg-surface px-1.5 py-1 shadow-border sm:w-[18rem] sm:px-2.5 sm:py-2"
      style={{ bottom: `calc(3.4rem + env(safe-area-inset-bottom, 0px) + ${kbLift}px)` }}
    >
      {drawSub === "circle" ? (
        <div className="space-y-1 sm:space-y-1.5">
          {field("R", lenLabel(units.length), rIn, "r", setRIn)}
          {field("Ø", lenLabel(units.length), dIn, "d", setDIn)}
          {field(t("drawArea"), areaLabel(units.area), sIn, "s", setSIn)}
          <Button
            size="xs"
            variant="pale-on"
            className="h-7 w-full bg-[#7ec8f2] text-[11px] text-[#1b2430] sm:h-10 sm:text-sm"
            disabled={!rIn.trim() && !dIn.trim() && !sIn.trim()}
            onClick={() => {
              const d = dirty.current;
              applyCircleFrom(d === "d" || d === "s" ? d : "r");
            }}
          >
            {t("applySize")}
          </Button>
        </div>
      ) : drawSub === "ellipse" ? (
        <div className="space-y-1 sm:space-y-1.5">
          {field(t("axisA"), lenLabel(units.length), wIn, "w", setWIn)}
          {field(t("axisB"), lenLabel(units.length), lIn, "l", setLIn)}
          {field(t("rotation"), "°", rotIn, "rot", setRotIn)}
          {field(t("drawArea"), areaLabel(units.area), sIn, "s", setSIn)}
          <Button
            size="xs"
            variant="pale-on"
            className="h-7 w-full bg-[#7ec8f2] text-[11px] text-[#1b2430] sm:h-10 sm:text-sm"
            disabled={!wIn.trim() && !lIn.trim() && !sIn.trim() && !rotIn.trim()}
            onClick={() => applyRectFrom(dirty.current === "s" ? "s" : dirty.current === "rot" ? "rot" : dirty.current === "l" ? "l" : "w")}
          >
            {t("applySize")}
          </Button>
        </div>
      ) : drawSub === "rect" ? (
        <div className="space-y-1 sm:space-y-1.5">
          {field(t("drawWidth"), lenLabel(units.length), wIn, "w", setWIn)}
          {field(t("drawHeight"), lenLabel(units.length), lIn, "l", setLIn)}
          {field(t("drawArea"), areaLabel(units.area), sIn, "s", setSIn)}
          <Button
            size="xs"
            variant="pale-on"
            className="h-7 w-full bg-[#7ec8f2] text-[11px] text-[#1b2430] sm:h-10 sm:text-sm"
            disabled={!wIn.trim() && !lIn.trim() && !sIn.trim()}
            onClick={() => applyRectFrom(dirty.current === "s" ? "s" : dirty.current === "l" ? "l" : "w")}
          >
            {t("applySize")}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">{param}</p>
          <p className="truncate text-xs tabular font-medium text-ink">{cadBuf || (hasPoint ? measureText : "—")}</p>
          {areaM2 != null && <p className="text-[10px] tabular text-muted">{formatAreaU(areaM2, units.area)}</p>}
          <div className="mt-1 flex items-center gap-1">
            <input
              inputMode="decimal"
              placeholder={drawSub === "rect" || drawSub === "ellipse" ? "10x6" : "5"}
              className="h-10 min-w-0 flex-1 rounded-sm bg-bg-2 px-2 text-sm tabular shadow-border"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  apply(text);
                  setText("");
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            <Button
              size="sm"
              variant="pale-on"
              className="h-10"
              disabled={!text.trim()}
              onClick={() => {
                apply(text);
                setText("");
              }}
            >
              {t("applySize")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
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
  const label = face.name?.trim() || t("layerN", { n });
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

function DrawingCard() {
  const t = useT();
  const project = useProject((s) => s.project);
  const selectedPolyId = useProject((s) => s.selectedPolyId);
  const selectedPolyIds = useProject((s) => s.selectedPolyIds);
  const selectedEdgeId = useProject((s) => s.selectedEdgeId);
  const units = useProject((s) => s.units);
  const [openId, setOpenId] = useState<string | null>(null);
  const d = drawingOrMigrate(project);
  const face = (openId && d.faces[openId]) || (selectedPolyId ? d.faces[selectedPolyId] : null);
  const internal = selectedEdgeId ? isInternalEdge(d, selectedEdgeId) : false;
  const faces = Object.values(d.faces);
  const showDetail = Boolean(face && openId === face.id);
  return (
    <div className="space-y-2 p-1.5 sm:space-y-3 sm:p-3">
      <div className="flex items-center gap-1">
        <h2 className="min-w-0 flex-1 truncate font-display text-sm sm:text-base">
          {project.name === "Без названия" ? t("untitled") : project.name}
        </h2>
        <Button
          size="xs"
          variant="pale"
          className="h-6 shrink-0 px-1.5 text-[10px]"
          onClick={() => useProject.getState().setProjectFormOpen(true)}
        >
          {t("edit")}
        </Button>
      </div>
      <div>
        <p className="px-0.5 pb-1 text-[10px] font-semibold tracking-wide text-muted uppercase">{t("layers")}</p>
        {faces.length === 0 ? (
          <p className="px-0.5 text-[11px] text-muted">{t("noLayers")}</p>
        ) : (
          <div className="flex flex-col gap-1">
            {faces.map((f, i) => {
              const n = i + 1;
              const label = f.name?.trim() || t("layerN", { n });
              const open = openId === f.id;
              const on = selectedPolyId === f.id || open;
              return (
                <div key={f.id} className={cn("rounded-sm border border-line", on ? "bg-btn-soft" : "bg-surface")}>
                  <div className="flex h-8 items-center gap-0.5 px-0.5">
                    <button
                      type="button"
                      className={cn("relative flex size-7 shrink-0 items-center justify-center", f.hidden ? "text-danger" : "text-muted")}
                      aria-label={f.hidden ? t("showLayer") : t("hideLayer")}
                      onClick={() => {
                        const st = useProject.getState();
                        st.selectPoly(f.id);
                        st.hideSelected(!f.hidden);
                      }}
                    >
                      <Eye className="size-3.5" />
                      {f.hidden && <span className="absolute inset-x-1.5 top-1/2 h-[1.5px] -rotate-45 bg-danger" />}
                    </button>
                    <button
                      type="button"
                      className={cn("flex size-7 shrink-0 items-center justify-center", f.locked ? "text-danger" : "text-muted")}
                      aria-label={f.locked ? t("unlockLayer") : t("lockLayer")}
                      onClick={() => {
                        const st = useProject.getState();
                        st.selectPoly(f.id);
                        st.lockSelected(!f.locked);
                      }}
                    >
                      {f.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                    </button>
                    <span
                      className="mx-0.5 size-2.5 shrink-0 rounded-[2px] border border-black/15"
                      style={{ background: f.fill ?? REGION_FILL[f.type] ?? "#ccc" }}
                    />
                    <button
                      type="button"
                      className={cn("min-w-0 flex-1 truncate text-left text-[11px]", f.hidden && "text-muted")}
                      onClick={() => useProject.getState().selectPoly(f.id)}
                    >
                      {label}
                    </button>
                    <button
                      type="button"
                      className="shrink-0 px-1.5 text-[10px] font-medium text-tool"
                      onClick={() => {
                        useProject.getState().selectPoly(f.id);
                        setOpenId(open ? null : f.id);
                      }}
                    >
                      {t("layerMore")}
                    </button>
                  </div>
                  {open && showDetail && face && face.id === f.id && (
                    <div className="border-t border-line p-2">
          <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">{t("region")}</p>
          <input
            className="mt-1 h-7 w-full rounded-sm bg-bg-2 px-2 text-[11px] shadow-border"
            defaultValue={face.name ?? ""}
            key={`${face.id}-${face.name ?? ""}`}
            placeholder={t("layerN", { n: faceLayerNumber(d, face.id) })}
            onBlur={(e) => useProject.getState().setFaceName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
          <p className="mt-1 text-xs tabular">
            {t("area")}: {formatAreaU(faceArea(d, face.id), units.area)}
          </p>
          <p className="text-xs tabular">
            {t("perimeter")}: {formatLenU(facePerimeter(d, face.id), units.length)}
          </p>
          {face.rect && (
            <p className="text-xs tabular">
              {t("drawWidth")} {formatLenU(face.rect.w, units.length)} · {t("drawHeight")} {formatLenU(face.rect.h, units.length)}
            </p>
          )}
          {face.circle && (
            <p className="text-xs tabular">Ø {formatLenU(face.circle.r * 2, units.length)}</p>
          )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
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

function formatPopUp(mm: number, u: ReturnType<typeof useProject.getState>["units"]["length"]): string {
  if (u === "in" || u === "ft") return `${Math.round(mm / 25.4)} in`;
  return `${Math.round(mm / 10)} cm`;
}

function HeadCard({ head }: { head: Head }) {
  const item = itemById(head.catalogId);
  const units = useProject((s) => s.units);
  const tx = useT();
  if (!item) return <p className="p-1.5 text-[11px] text-warn sm:p-4 sm:text-sm">{tx("modelReview")}</p>;
  const fl = headFlow(head);
  const zones = useProject((s) => s.project.zones);
  const target = useProject((s) => s.project.meta.targetMm);
  const t = fl.precipMmHr ? runTimeMin(target, fl.precipMmHr) : null;
  const upd = (patch: Partial<Head>) => useProject.getState().updateHead(head.id, patch);
  const live = (patch: Partial<Head>) => useProject.getState().patchHeadLive(head.id, patch);
  const nozzle = item.nozzles.find((n) => n.id === head.nozzleId) ?? item.nozzles[0];
  const bodies = bodiesFor(item);
  const bodyId = head.bodyId && bodies.some((b) => b.id === head.bodyId) ? head.bodyId : defaultBodyFor(item);
  const nzSt = nozzle && nozzle.performance.length ? nozzleRange(nozzle) : null;
  const rotorRack = item.type === "rotor" && item.nozzles.length > 1;
  const rMin = rotorRack ? item.rMin : nzSt && nzSt.rMax > nzSt.rMin ? nzSt.rMin : item.rMin;
  const rMax = rotorRack ? item.rMax : nzSt && nzSt.rMax > nzSt.rMin ? nzSt.rMax : item.rMax;
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
      <CatalogPic item={item} className="mx-auto h-28 w-full max-w-[11rem]" />
      <p className="mt-1 text-[10px] font-semibold tracking-wide text-muted uppercase">{item.series}</p>
      <h2 className="font-display text-sm leading-tight">{item.id}</h2>
      <p className="text-[11px] text-ink-soft">{item.name}</p>
      {item.type === "rotor" && item.nozzles.length > 1 && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold text-muted">{tx("nozzleSize")}</p>
          <div className="mt-1 grid grid-cols-4 gap-1">
            {item.nozzles.map((n) => {
              const on = (head.nozzleId ?? nozzle?.id) === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => pickNozzle(n.id)}
                  className={cn("h-8 rounded-sm text-[11px] font-semibold tabular", on ? "text-white" : "hover:opacity-90")}
                  style={on ? { background: n.color } : { background: n.color, color: "#fff", opacity: 0.38 }}
                >
                  {n.size ?? n.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-2">
        <ColorSlider
          label={tx("radius")}
          color="#e67a2e"
          min={rMin}
          max={rMax}
          step={0.05}
          value={Math.min(rMax, Math.max(rMin, head.r))}
          display={formatLenU(head.r, units.length)}
          onChange={(r) => live({ r })}
        />
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
        <ColorSlider
          label={tx("rotation")}
          color="#7b3fd0"
          min={0}
          max={359}
          step={1}
          value={((head.start % 360) + 360) % 360}
          display={`${Math.round(head.start)}°`}
          onChange={(start) => live({ start })}
        />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
        <Stat k={tx("flow")} v={fl.lpm == null ? tx("noData") : formatFlowU(fl.lpm, units.flow)} />
        <Stat k={tx("radius")} v={formatLenU(head.r, units.length)} />
        <Stat k={tx("m3h")} v={fl.m3h == null ? "—" : fmt1(fl.m3h)} />
        <Stat k={tx("workingPressure")} v={formatPressureU(head.designPressure, units.pressure)} />
        <Stat k={tx("precipSpeed")} v={fl.precipMmHr == null ? "—" : `${fmt1(fl.precipMmHr)} ${tx("mmhr")}`} />
        <Stat k="Траектория" v={nozzle?.trajectoryDeg != null ? `${nozzle.trajectoryDeg}°` : "—"} />
        <Stat k={tx("runTime")} v={t == null ? "—" : `${Math.round(t)} ${tx("min")}`} />
        <Stat k={tx("popUp")} v={formatPopUp(head.popUpMm ?? item.popUpMm ?? 100, units.length)} />
      </dl>
      {fl.note && <p className="mt-1 text-[10px] text-muted">{fl.note}</p>}
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
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-[10px] text-muted">
          {tx("popUp")}
          <select
            value={head.popUpMm ?? item.popUpMm ?? 100}
            onChange={(e) => upd({ popUpMm: Number(e.target.value) })}
            className="mt-0.5 h-8 w-full rounded-sm bg-bg-2 px-1.5 text-[13px] text-ink shadow-border"
          >
            {popUpHeights(item).map((mm) => (
              <option key={mm} value={mm}>
                {formatPopUp(mm, units.length)}
              </option>
            ))}
          </select>
        </label>
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
      <Button className="mt-2 w-full" size="sm" onClick={() => useProject.getState().deleteSelected()}>
        <Trash2 />
        {tx("delete")}
      </Button>
      <section className="mt-2 border-t border-line pt-2">
        <p className="text-[9px] font-semibold tracking-wide text-muted uppercase">{tx("charTable")}</p>
        {nozzle && nozzle.performance.length > 0 && (
          <div className="mt-1.5 overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="pr-1">{tx("sector")}</th>
                  <th className="pr-1">{tx("bar")}</th>
                  <th className="pr-1">{tx("unit_m")}</th>
                  <th className="pr-1">{tx("lpm")}</th>
                  <th className="pr-1">{tx("m3h")}</th>
                  <th>{tx("mmhr")}</th>
                </tr>
              </thead>
              <tbody>
                {nozzle.performance.map((r, i) => (
                  <tr key={i} className="tabular">
                    <td className="pr-1">{r.arcDeg}°</td>
                    <td className="pr-1">{fmt1(r.pressureBar)}</td>
                    <td className="pr-1">{fmt1(r.radiusM)}</td>
                    <td className="pr-1">{fmt1(r.flowLMin)}</td>
                    <td className="pr-1">{fmt1(r.flowM3H)}</td>
                    <td>{fmt1(r.precipSquareMmH)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
    <div>
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
            const q = heads.reduce((s, h) => s + (headFlow(h).lpm ?? 0), 0);
            const faces = Object.values(d.faces).filter((f) => heads.some((h) => headInsideFace(d, f.id, h)));
            const areaM2 = faces.length
              ? faces.reduce((s, f) => s + faceArea(d, f.id), 0)
              : lawnPolygon(project.polygons)
                ? polygonArea(lawnPolygon(project.polygons)!) * (n / Math.max(1, project.heads.length))
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
                {open && (
                  <div className={cn("border-t border-line p-2 text-[11px] tabular", compact && "p-1.5")}>
                    <input
                      value={zone.name}
                      onChange={(e) => useProject.getState().renameZone(zone.id, e.target.value)}
                      className="h-7 w-full rounded-sm bg-bg-2 px-2 text-[11px] shadow-border"
                    />
                    <p className="mt-1.5">
                      {t("precipRate")}: {formatFlowU(q, units.flow)}
                      {precip != null ? ` · ${fmt1(precip)} ${t("mmhr")}` : ""}
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
  if (!rec) return null;
  const us = units.flow === "gpm" || units.flow === "gph" || units.pressure === "psi" || units.length === "ft" || units.length === "in";
  const qMain = formatFlowU(rec.qLpm, us ? "gpm" : "lpm");
  const qAlt = formatFlowU(rec.qLpm, us ? "gph" : "m3h");
  const hMain = us ? formatLenU(rec.headM, "ft") : `${Math.round(rec.headM)} ${t("unit_m")}`;
  const hAlt = formatPressureU(rec.pBar, us ? "psi" : "bar");
  return (
    <div className="mt-1.5 rounded-sm bg-bg-2 px-1.5 py-1.5">
      <p className="text-[9px] font-semibold tracking-wide text-muted uppercase">{t("pumpRec")}</p>
      <p className="mt-0.5 text-[11px] font-medium leading-snug">
        Q {qMain} · {qAlt}
      </p>
      <p className="text-[11px] font-medium leading-snug">
        H {hMain} · {hAlt}
      </p>
      <p className="mt-0.5 text-[10px] leading-snug text-muted">
        {t("pumpOneZone")}: {rec.zoneName} ({formatFlowU(rec.zoneMaxLpm, us ? "gpm" : "lpm")})
      </p>
      <p className="text-[10px] leading-snug text-muted">{t("pumpNote")}</p>
    </div>
  );
}

function ZoneCard({ zoneId }: { zoneId: number }) {
  const project = useProject((s) => s.project);
  const units = useProject((s) => s.units);
  const t = useT();
  const z = project.zones.find((x) => x.id === zoneId);
  const heads = project.heads.filter((h) => h.zone === zoneId);
  const q = heads.reduce((s, h) => s + (headFlow(h).lpm ?? 0), 0);
  const lawn = lawnPolygon(project.polygons);
  const precip = lawn && q ? totalAreaPrecip(q, polygonArea(lawn) * (heads.length / Math.max(1, project.heads.length))) : null;
  const avail = project.water.availableLpm;
  const limit = defaultMaxZoneLpm(avail);
  const [maxLpm, setMaxLpm] = useState(String(limit));
  const patchWater = (patch: Partial<typeof project.water>) =>
    useProject.getState().patchProject({ water: { ...project.water, ...patch } });
  if (!z) return null;
  const over = q > limit + 0.05;
  return (
    <div className="p-1.5 sm:p-4">
      <p className={cn("text-[11px]", over ? "text-warn" : "text-muted")}>
        {z.name}: {heads.length} · {formatFlowU(q, units.flow)}
        {precip ? ` · ${fmt1(precip)} ${t("mmhr")}` : ""}
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
