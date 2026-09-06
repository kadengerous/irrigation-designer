"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Circle,
  Ellipse,
  Group,
  Image as KImage,
  Layer,
  Line,
  Rect,
  Shape,
  Stage,
  Text,
} from "react-konva";
import type Konva from "konva";
import { Copy, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { itemById } from "@/lib/hunter-catalog";
import { tr } from "@/lib/i18n";
import { exclusionPolygons, lawnPolygon, sampleGrid } from "@/lib/coverage";
import {
  dist,
  formatLen,
  projectOnSegment,
  sectorLocal,
  snapGrid,
  uid,
  visibleGridStep,
  clampPxPerMeter,
  snapDeltaToAngle,
  normDeg,
  polygonArea,
  closedPathSideStarts,
  snapShapeTranslationToGrid,
  ellipseBoundaryGridAnchors,
  type Pt,
} from "@/lib/geometry";
import { formatAreaU } from "@/lib/units";
import { zoneColor, type Geom, type Head } from "@/lib/project-types";
import { canvasTheme } from "@/lib/theme";
import { useProject } from "@/lib/project-store";
import type { DesignCanvasProps } from "@/components/designer/canvas-types";
import { cadSnap } from "@/lib/cad/snap";
import {
  addChain,
  addEllipse,
  addRect,
  addSpline,
  catmullRom,
  addRotatedRect,
  addTriangle,
  addHexagon,
  deleteLooseEdge,
  drawingOrMigrate,
  faceArea,
  faceBoundaryKey,
  faceCentroid,
  faceEdges,
  facePoints,
  faceVertices,
  filletPreview,
  isInternalEdge,
  isDrawnCurveFace,
  isTriangleFace,
  moveNodeEditVertex,
  moveVertex,
  nearestFaceBoundary,
  nearestOpenSplineEndpoint,
  setPointShapeVertices,
  offsetPoints,
  pickCandidates,
  pickEdgeAt,
  pickFaceAt,
  pickVertexAt,
  rectFromEdge,
  rectMetaMatchesFace,
  rectWorldCorners,
  resolveDim,
  selfIntersects,
  triangleFromBounds,
  hexagonFromBounds,
  triangleMetrics,
} from "@/lib/cad/engine";
import { FACE_TEXTURES, REGION_FILL, layerForType, type CadDrawing } from "@/lib/cad/types";

const DRAW_CREATE = new Set([
  "line",
  "polyline",
  "polygon",
  "rect",
  "rotrect",
  "circle",
  "triangle",
  "hexagon",
  "arc",
  "ellipse",
  "freehand",
  "spline",
  "path",
  "text",
]);

function CadGrid({
  x0,
  x1,
  y0,
  y1,
  step,
  sx,
  sy,
}: {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  step: number;
  sx: (n: number) => number;
  sy: (n: number) => number;
}) {
  const appearance = canvasTheme(useProject((s) => s.themeId));
  if (step <= 0) return null;
  const majorEvery = 5;
  const pass = (kind: "minor" | "major" | "axis", color: string, width: number) => (
    <Shape
      listening={false}
      stroke={color}
      strokeWidth={width}
      perfectDrawEnabled={false}
      sceneFunc={(ctx, shape) => {
        ctx.beginPath();
        const i0 = Math.floor(x0 / step);
        const i1 = Math.ceil(x1 / step);
        const j0 = Math.floor(y0 / step);
        const j1 = Math.ceil(y1 / step);
        for (let i = i0; i <= i1; i++) {
          const axis = i === 0;
          const maj = i % majorEvery === 0;
          if (kind === "axis" && !axis) continue;
          if (kind === "major" && (!maj || axis)) continue;
          if (kind === "minor" && (maj || axis)) continue;
          const x = i * step;
          ctx.moveTo(sx(x), sy(y0));
          ctx.lineTo(sx(x), sy(y1));
        }
        for (let j = j0; j <= j1; j++) {
          const axis = j === 0;
          const maj = j % majorEvery === 0;
          if (kind === "axis" && !axis) continue;
          if (kind === "major" && (!maj || axis)) continue;
          if (kind === "minor" && (maj || axis)) continue;
          const y = j * step;
          ctx.moveTo(sx(x0), sy(y));
          ctx.lineTo(sx(x1), sy(y));
        }
        ctx.strokeShape(shape);
      }}
    />
  );
  return (
    <>
      {pass("minor", appearance.minor, 0.65)}
      {pass("major", appearance.major, 0.9)}
      {pass("axis", appearance.axis, 1.1)}
    </>
  );
}

function snapToGrid(p: Pt, step: number): Pt {
  const g = Math.max(Number(step) || 0.1, 1e-4);
  return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
}

function snapIfMagnet(p: Pt): Pt {
  const st = useProject.getState();
  if (!st.snapOn) return p;
  return snapToGrid(p, st.gridStep);
}

function pickDraftSegment(points: Pt[], p: Pt, tolerance: number): number | null {
  let picked: number | null = null;
  let best = tolerance;
  for (let i = 0; i < points.length - 1; i++) {
    const projected = projectOnSegment(p, points[i]!, points[i + 1]!).pt;
    const d = dist(p, projected);
    if (d <= best) {
      best = d;
      picked = i;
    }
  }
  return picked;
}

function pickLooseStraightEdge(drawing: CadDrawing, p: Pt, tolerance: number): string | null {
  let picked: string | null = null;
  let best = tolerance;
  for (const edge of Object.values(drawing.edges)) {
    if (edge.faceL || edge.faceR || Math.abs(edge.bulge) > 1e-6) continue;
    if (isLegacyDrawnLooseEdge(drawing, edge.id)) continue;
    const a = drawing.vertices[edge.a];
    const b = drawing.vertices[edge.b];
    if (!a || !b) continue;
    const d = Math.min(dist(p, a), dist(p, b), dist(p, projectOnSegment(p, a, b).pt));
    if (d <= best) {
      best = d;
      picked = edge.id;
    }
  }
  return picked;
}

function pickLooseEndpoint(drawing: CadDrawing, p: Pt, tolerance: number): Pt | null {
  let picked: Pt | null = null;
  let best = tolerance;
  for (const edge of Object.values(drawing.edges)) {
    if (edge.faceL || edge.faceR || Math.abs(edge.bulge) > 1e-6) continue;
    if (isLegacyDrawnLooseEdge(drawing, edge.id)) continue;
    const a = drawing.vertices[edge.a];
    const b = drawing.vertices[edge.b];
    if (!a || !b) continue;
    for (const endpoint of [a, b]) {
      const d = dist(p, endpoint);
      if (d <= best) {
        best = d;
        picked = endpoint;
      }
    }
  }
  return picked;
}

/** Older pencil/curve strokes were stored as a long connected chain of loose segments. */
function isLegacyDrawnLooseEdge(drawing: CadDrawing, edgeId: string): boolean {
  const first = drawing.edges[edgeId];
  if (!first || first.faceL || first.faceR) return false;
  const byVertex = new Map<string, string[]>();
  for (const edge of Object.values(drawing.edges)) {
    if (edge.faceL || edge.faceR) continue;
    byVertex.set(edge.a, [...(byVertex.get(edge.a) ?? []), edge.id]);
    byVertex.set(edge.b, [...(byVertex.get(edge.b) ?? []), edge.id]);
  }
  const seen = new Set<string>();
  const queue = [edgeId];
  while (queue.length && seen.size < 8) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    const edge = drawing.edges[id];
    if (!edge || edge.faceL || edge.faceR) continue;
    seen.add(id);
    for (const vertexId of [edge.a, edge.b]) {
      for (const next of byVertex.get(vertexId) ?? []) if (!seen.has(next)) queue.push(next);
    }
  }
  return seen.size >= 8;
}

function findStraightEdgeId(drawing: CadDrawing, a: Pt, b: Pt): string | null {
  for (const edge of Object.values(drawing.edges)) {
    if (Math.abs(edge.bulge) > 1e-6) continue;
    const va = drawing.vertices[edge.a];
    const vb = drawing.vertices[edge.b];
    if (!va || !vb) continue;
    if ((dist(va, a) < 1e-7 && dist(vb, b) < 1e-7) || (dist(va, b) < 1e-7 && dist(vb, a) < 1e-7))
      return edge.id;
  }
  return null;
}

function pointsAreStraightThrough(a: Pt, joint: Pt, b: Pt) {
  const ax = a.x - joint.x;
  const ay = a.y - joint.y;
  const bx = b.x - joint.x;
  const by = b.y - joint.y;
  const an = Math.hypot(ax, ay);
  const bn = Math.hypot(bx, by);
  if (an < 1e-9 || bn < 1e-9) return false;
  const cross = Math.abs(ax * by - ay * bx) / (an * bn);
  const dot = (ax * bx + ay * by) / (an * bn);
  return cross < 1e-4 && dot < -0.9999;
}

function mergeOpenCollinearEdges(drawing: CadDrawing): CadDrawing {
  let changed = true;
  while (changed) {
    changed = false;
    for (const vertex of Object.values(drawing.vertices)) {
      const incident = Object.values(drawing.edges).filter(
        (edge) => edge.a === vertex.id || edge.b === vertex.id,
      );
      if (incident.length !== 2) continue;
      const [first, second] = incident;
      if (
        !first ||
        !second ||
        first.faceL ||
        first.faceR ||
        second.faceL ||
        second.faceR ||
        Math.abs(first.bulge) > 1e-6 ||
        Math.abs(second.bulge) > 1e-6
      )
        continue;
      const firstOtherId = first.a === vertex.id ? first.b : first.a;
      const secondOtherId = second.a === vertex.id ? second.b : second.a;
      const firstOther = drawing.vertices[firstOtherId];
      const secondOther = drawing.vertices[secondOtherId];
      if (!firstOther || !secondOther || !pointsAreStraightThrough(firstOther, vertex, secondOther))
        continue;
      const duplicate = Object.values(drawing.edges).some(
        (edge) =>
          edge.id !== first.id &&
          edge.id !== second.id &&
          ((edge.a === firstOtherId && edge.b === secondOtherId) ||
            (edge.a === secondOtherId && edge.b === firstOtherId)),
      );
      if (duplicate) continue;
      drawing.edges[first.id] = { ...first, a: firstOtherId, b: secondOtherId, bulge: 0 };
      delete drawing.edges[second.id];
      delete drawing.vertices[vertex.id];
      for (const constraint of Object.values(drawing.constraints ?? {})) {
        if (constraint.a === second.id) constraint.a = first.id;
        if (constraint.b === second.id) constraint.b = first.id;
      }
      changed = true;
      break;
    }
  }
  return drawing;
}

function pinchInfo(touches: TouchList, wrap: HTMLDivElement) {
  const a = touches.item(0);
  const b = touches.item(1);
  if (!a || !b) return null;
  const rect = wrap.getBoundingClientRect();
  const x1 = a.clientX - rect.left;
  const y1 = a.clientY - rect.top;
  const x2 = b.clientX - rect.left;
  const y2 = b.clientY - rect.top;
  return { dist: Math.hypot(x2 - x1, y2 - y1), midX: (x1 + x2) / 2, midY: (y1 + y2) / 2 };
}

function worldOfPointer(
  clientX: number,
  clientY: number,
  wrap: HTMLDivElement,
  panX: number,
  panY: number,
  px: number,
): Pt {
  const rect = wrap.getBoundingClientRect();
  return { x: (clientX - rect.left - panX) / px, y: (clientY - rect.top - panY) / px };
}

const PREVIEW_EMPTY_IDS: string[] = [];
const PREVIEW_EMPTY_DRAFT = { points: [], scaleA: null, scaleB: null, measureA: null };

export function DesignCanvas({
  previewView,
  multiSelect = false,
  mobile = false,
  onScalePair,
  onMeasure,
  onHover,
  onExportReady,
}: DesignCanvasProps) {
  const readOnly = Boolean(previewView);
  const appearance = canvasTheme(useProject((s) => s.themeId));
  const wrapRef = useRef<HTMLDivElement>(null);
  const hoverRaf = useRef(0);
  const pendingHover = useRef<ReturnType<typeof cadSnap> | null>(null);
  const [pickList, setPickList] = useState<{
    x: number;
    y: number;
    items: { kind: "face" | "edge" | "head"; id: string }[];
  } | null>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 640, h: 480 });
  const panDrag = useRef<{ x: number; y: number } | null>(null);
  const box = useRef<{ x: number; y: number } | null>(null);
  const [boxNow, setBoxNow] = useState<Pt | null>(null);
  const pinch = useRef<{
    dist: number;
    midX: number;
    midY: number;
    panX: number;
    panY: number;
    px: number;
  } | null>(null);
  const pinchSuppressClickUntil = useRef(0);
  const pinchGestureActive = useRef(false);
  const [pinching, setPinching] = useState(false);
  const skipClick = useRef(false);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [textureImages, setTextureImages] = useState<Record<string, HTMLImageElement>>({});
  const lastFit = useRef(-1);
  const midDown = useRef(false);
  const [hoverPt, setHoverPt] = useState<Pt | null>(null);
  const [snapHit, setSnapHit] = useState<{ kind: string; pt: Pt } | null>(null);
  const [selectedDraftSegment, setSelectedDraftSegment] = useState<number | null>(null);
  const [selectedDraftEdgeId, setSelectedDraftEdgeId] = useState<string | null>(null);
  const [activeDraftPolygonPoint, setActiveDraftPolygonPoint] = useState<number | null>(null);
  const [activeDraftSplinePoint, setActiveDraftSplinePoint] = useState<number | null>(null);
  const lineEditingRef = useRef(false);
  const lineTapGuardUntil = useRef(0);
  const pointerType = useRef("mouse");
  const hold = useRef<{
    id: string;
    timer: number;
    node: Konva.Node;
    pointerId: number | null;
  } | null>(null);
  const lastClient = useRef({ x: 0, y: 0 });
  const headDragStart = useRef({ x: 0, y: 0 });
  const overCatalog = useRef(false);
  const holdMenu = useRef(false);
  const editDrag = useRef(false);
  const headDragMove = useRef<((e: PointerEvent) => void) | null>(null);
  const [deleteMenu, setDeleteMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editHandles, setEditHandles] = useState<string | null>(null);
  const [liveCadPath, setLiveCadPath] = useState<{ faceId: string; points: Pt[] } | null>(null);
  const freehandOn = useRef(false);
  const cadHold = useRef<number | null>(null);
  const startCadHold = (id: string) => {
    if (pinch.current) return;
    const st = useProject.getState();
    if (st.catalogOpen) return;
    if (st.tool === "draw" && st.drawSub && st.drawSub !== "none") return;
    const face = drawingOrMigrate(st.project).faces[id];
    if (face?.locked) return;
    if (face?.freehand) {
      st.selectPoly(id);
      return;
    }
    if (cadHold.current) window.clearTimeout(cadHold.current);
    if (editDrag.current) return;
    cadHold.current = window.setTimeout(() => {
      cadHold.current = null;
      skipClick.current = true;
      window.setTimeout(() => {
        skipClick.current = false;
      }, 400);
      useProject.getState().setCadEdit(id);
      try {
        navigator.vibrate?.(20);
      } catch {
        /* ignore */
      }
    }, 380);
  };
  const endCadHold = () => {
    if (cadHold.current) {
      window.clearTimeout(cadHold.current);
      cadHold.current = null;
    }
  };

  const clearHold = () => {
    if (hold.current) {
      window.clearTimeout(hold.current.timer);
      hold.current = null;
    }
  };

  const beginHold = (id: string, node: Konva.Node, pointerId: number | null = null) => {
    clearHold();
    hold.current = {
      id,
      node,
      pointerId,
      timer: window.setTimeout(() => {
        const cur = hold.current;
        hold.current = null;
        if (!cur || cur.id !== id) return;
        skipClick.current = true;
        holdMenu.current = true;
        window.setTimeout(() => {
          skipClick.current = false;
        }, 500);
        try {
          cur.node.stopDrag();
          const el = cur.node.getStage()?.container();
          if (el && cur.pointerId != null && el.hasPointerCapture?.(cur.pointerId)) {
            el.releasePointerCapture(cur.pointerId);
          }
        } catch {
          /* ignore */
        }
        const st = useProject.getState();
        const head = st.project.heads.find((h) => h.id === id);
        if (!head) return;
        const zone = st.project.zones.find((z) => z.id === head.zone);
        if (head.locked || zone?.locked) return;
        setDeleteMenu({
          id,
          x: head.x * st.pxPerMeter + st.panX,
          y: head.y * st.pxPerMeter + st.panY,
        });
        try {
          navigator.vibrate?.(20);
        } catch {
          /* ignore */
        }
      }, 500),
    };
  };

  const project = useProject((s) => s.project);
  const tool = useProject((s) => readOnly ? null : s.tool);
  const drawSub = useProject((s) => readOnly ? "none" : s.drawSub);
  const measureSub = useProject((s) => s.measureSub);
  const px = useProject((s) => previewView?.px ?? s.pxPerMeter);
  const panX = useProject((s) => previewView?.panX ?? s.panX);
  const panY = useProject((s) => previewView?.panY ?? s.panY);
  const showCoverage = useProject((s) => s.showCoverage);
  const showGrid = useProject((s) => !readOnly && s.showGrid);
  const showLabels = useProject((s) => s.showLabels);
  const selectedId = useProject((s) => readOnly ? null : s.selectedId);
  const selectedIds = useProject((s) => readOnly ? PREVIEW_EMPTY_IDS : s.selectedIds);
  const selectedPolyId = useProject((s) => readOnly ? null : s.selectedPolyId);
  const selectedEdgeId = useProject((s) => readOnly ? null : s.selectedEdgeId);
  const cadEditId = useProject((s) => readOnly ? null : s.cadEditId);
  const catalogOpen = useProject((s) => !readOnly && s.catalogOpen);
  const selectedPolyIds = useProject((s) => readOnly ? PREVIEW_EMPTY_IDS : s.selectedPolyIds);
  const draft = useProject((s) => readOnly ? PREVIEW_EMPTY_DRAFT : s.draft);
  const fitNonce = useProject((s) => s.fitNonce);
  const measureUnit = useProject((s) => s.measureUnit);
  const spaceDown = useProject((s) => s.spaceDown);
  const gridStep = useProject((s) => s.gridStep);
  const analysis = useProject((s) => !readOnly && s.analysis);
  const snapOn = useProject((s) => s.snapOn);
  const snapGridOn = useProject((s) => s.snapGridOn);
  const locale = useProject((s) => s.locale);
  const cadDrawing = drawingOrMigrate(project);
  const editedFace = cadEditId ? cadDrawing.faces[cadEditId] : null;
  const editedFaceEdges = cadEditId ? faceEdges(cadDrawing, cadEditId) : [];
  const editedFaceVertices = cadEditId ? faceVertices(cadDrawing, cadEditId) : [];
  const editedFaceIsDrawnCurve = Boolean(
    cadEditId && isDrawnCurveFace(cadDrawing, cadEditId),
  );
  const editedFaceShowsOwnLengths = Boolean(
    cadEditId &&
    editedFace &&
    !editedFaceIsDrawnCurve &&
    !editedFace.nodeEdit &&
    (editedFace.circle ||
      editedFace.ellipse ||
      (editedFace.rect && rectMetaMatchesFace(cadDrawing, cadEditId)) ||
      isTriangleFace(cadDrawing, cadEditId) ||
      (editedFaceVertices.length >= 3 &&
        editedFaceEdges.length === editedFaceVertices.length &&
        editedFaceEdges.every((edge) => Math.abs(edge.bulge) < 1e-6))),
  );
  const editedFaceLengthIds = editedFaceShowsOwnLengths
    ? editedFaceEdges.map((edge) => edge.id)
    : [];

  useEffect(() => {
    if (
      tool !== "draw" ||
      drawSub !== "polygon" ||
      activeDraftPolygonPoint == null ||
      activeDraftPolygonPoint >= draft.points.length
    ) {
      setActiveDraftPolygonPoint(null);
    }
  }, [tool, drawSub, draft.points.length, activeDraftPolygonPoint]);

  useEffect(() => {
    if (
      tool !== "draw" ||
      drawSub !== "line" ||
      selectedDraftSegment == null ||
      selectedDraftSegment >= draft.points.length - 1
    ) {
      setSelectedDraftSegment(null);
      setSelectedDraftEdgeId(null);
      lineEditingRef.current = false;
    }
  }, [tool, drawSub, draft.points.length, selectedDraftSegment]);

  useEffect(() => {
    if (
      tool !== "draw" ||
      drawSub !== "spline" ||
      activeDraftSplinePoint == null ||
      activeDraftSplinePoint >= draft.points.length
    ) {
      setActiveDraftSplinePoint(null);
    }
  }, [tool, drawSub, draft.points.length, activeDraftSplinePoint]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      setSize({ w, h });
      if (!readOnly && w >= 40 && h >= 40 && lastFit.current === -1) {
        lastFit.current = useProject.getState().fitNonce;
        useProject.getState().fitToView(w, h);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (readOnly) return () => ro.disconnect();
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      if (cadHold.current) {
        window.clearTimeout(cadHold.current);
        cadHold.current = null;
      }
      clearHold();
      skipClick.current = true;
      pinchGestureActive.current = true;
      setPinching(true);
      setHoverPt(null);
      setSnapHit(null);
      pinchSuppressClickUntil.current = Date.now() + 650;
      const info = pinchInfo(e.touches, el);
      const st = useProject.getState();
      if (info)
        pinch.current = {
          dist: info.dist,
          midX: info.midX,
          midY: info.midY,
          panX: st.panX,
          panY: st.panY,
          px: st.pxPerMeter,
        };
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length < 2) return;
      if (cadHold.current) {
        window.clearTimeout(cadHold.current);
        cadHold.current = null;
      }
      clearHold();
      const info = pinchInfo(e.touches, el);
      if (!info) return;
      if (!pinch.current) {
        const st = useProject.getState();
        pinch.current = {
          dist: info.dist,
          midX: info.midX,
          midY: info.midY,
          panX: st.panX,
          panY: st.panY,
          px: st.pxPerMeter,
        };
      }
      const g = pinch.current;
      if (info.dist < 8) return;
      const scale = info.dist / (g.dist || 1);
      const nextPx = clampPxPerMeter(g.px * scale);
      const wx = (g.midX - g.panX) / g.px;
      const wy = (g.midY - g.panY) / g.px;
      const st = useProject.getState();
      st.setZoom(nextPx);
      st.setPan(info.midX - wx * nextPx, info.midY - wy * nextPx);
      skipClick.current = true;
      pinchSuppressClickUntil.current = Date.now() + 650;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (pinchGestureActive.current) pinchSuppressClickUntil.current = Date.now() + 650;
      if (e.touches.length < 2) pinch.current = null;
      if (e.touches.length === 0) {
        pinchGestureActive.current = false;
        setPinching(false);
      }
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      ro.disconnect();
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  useEffect(() => {
    if (readOnly) return;
    if (size.w < 40 || size.h < 40) return;
    if (lastFit.current === fitNonce && lastFit.current !== -1) return;
    lastFit.current = fitNonce;
    useProject.getState().fitToView(size.w, size.h);
  }, [size.w, size.h, fitNonce]);

  useEffect(() => {
    const src = project.underlay?.src;
    if (!src || project.underlay?.visible === false) {
      setImg(null);
      return;
    }
    const im = new window.Image();
    im.crossOrigin = "anonymous";
    im.onload = () => setImg(im);
    im.onerror = () => setImg(null);
    im.src = src;
  }, [project.underlay?.src, project.underlay?.visible]);

  useEffect(() => {
    let active = true;
    const loaded: Record<string, HTMLImageElement> = {};
    for (const texture of FACE_TEXTURES) {
      const image = new window.Image();
      image.onload = () => {
        if (!active) return;
        loaded[texture.id] = image;
        setTextureImages({ ...loaded });
      };
      image.src = texture.src;
    }
    return () => { active = false; };
  }, []);

  useEffect(() => {
    onExportReady?.(() => {
      const stage = stageRef.current;
      if (!stage) return null;
      try {
        return stage.toDataURL({ pixelRatio: 2, mimeType: "image/png" });
      } catch {
        return null;
      }
    });
  }, [onExportReady]);

  useEffect(() => () => clearHold(), []);

  const toWorld = (stage: Konva.Stage | null): Pt => {
    const p = stage?.getPointerPosition();
    if (!p) return { x: 0, y: 0 };
    return { x: (p.x - panX) / px, y: (p.y - panY) / px };
  };
  const sx = (x: number) => x * px + panX;
  const sy = (y: number) => y * px + panY;

  const applySnap = (
    p: Pt,
    extra?: { angleFrom?: Pt | null; excludeHead?: string; free?: boolean },
  ) => {
    if (extra?.free) return { pt: p, kind: "none" as const };
    const st = useProject.getState();
    const d = drawingOrMigrate(st.project);
    const canCloseDraft =
      st.tool === "draw" &&
      (st.drawSub === "polygon" ||
        st.drawSub === "polyline" ||
        st.drawSub === "line" ||
        st.drawSub === "spline") &&
      st.draft.points.length >= (st.drawSub === "spline" ? 3 : 2);
    const closeTo =
      canCloseDraft
        ? st.draft.points[0]!
        : null;
    const snapped = cadSnap(p, d, {
      pxPerMeter: st.pxPerMeter,
      pointerType: pointerType.current,
      snapOn: st.snapOn,
      snapGridOn: st.snapOn && st.snapGridOn,
      orthoOn: st.orthoOn,
      lock: st.inferenceLock,
      gridStep: st.gridStep,
      angleFrom: extra?.angleFrom,
      closeTo,
      heads: st.project.heads.map((h) => ({ x: h.x, y: h.y })),
    });
    if (st.tool === "draw" && st.drawSub === "spline" && st.snapOn && snapped.kind !== "close") {
      const endpoint = nearestOpenSplineEndpoint(
        d,
        p,
        Math.max(0.12, 24 / Math.max(st.pxPerMeter, 1)),
      );
      if (endpoint) {
        return { pt: endpoint.pt, kind: "end" as const, faceId: endpoint.faceId };
      }
      const boundary = nearestFaceBoundary(d, p, Math.max(0.12, 24 / Math.max(st.pxPerMeter, 1)));
      if (boundary) {
        return { pt: boundary.pt, kind: "edge" as const, faceId: boundary.faceId };
      }
    }
    return snapped;
  };

  const snapPolygonDraftPoint = (p: Pt, pointIndex: number) => {
    const st = useProject.getState();
    const d = drawingOrMigrate(st.project);
    return cadSnap(p, d, {
      pxPerMeter: st.pxPerMeter,
      pointerType: pointerType.current,
      snapOn: st.snapOn,
      snapGridOn: st.snapOn && st.snapGridOn,
      orthoOn: st.orthoOn,
      lock: st.inferenceLock,
      gridStep: st.gridStep,
      angleFrom: pointIndex > 0 ? st.draft.points[0] ?? null : null,
      closeTo: null,
      heads: st.project.heads.map((h) => ({ x: h.x, y: h.y })),
    });
  };

  const trackPointer = (p: Pt) => {
    const st = useProject.getState();
    const stretching =
      st.tool === "draw" &&
      st.draft.points.length >= 1 &&
      (st.drawSub === "circle" || st.drawSub === "ellipse");
    const angleFrom = stretching
      ? null
      : st.tool === "draw" && st.draft.points.length
        ? st.drawSub === "polygon"
          ? st.draft.points[0]!
          : st.draft.points[st.draft.points.length - 1]!
        : null;
    const snapped = applySnap(p, { angleFrom, free: stretching });
    pendingHover.current = snapped;
    if (!hoverRaf.current) {
      hoverRaf.current = requestAnimationFrame(() => {
        hoverRaf.current = 0;
        if (editDrag.current) return;
        const s = pendingHover.current;
        if (!s) return;
        setHoverPt(s.pt);
        setSnapHit(s.kind !== "none" ? { kind: s.kind, pt: s.pt } : null);
        onHover?.(s.pt);
      });
    }
    return snapped;
  };

  const zoomAt = (pointerX: number, pointerY: number, nextPx: number) => {
    const st = useProject.getState();
    const old = st.pxPerMeter;
    const clamped = clampPxPerMeter(nextPx);
    const wx = (pointerX - st.panX) / old;
    const wy = (pointerY - st.panY) / old;
    st.setZoom(clamped);
    st.setPan(pointerX - wx * clamped, pointerY - wy * clamped);
  };

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const old = useProject.getState().pxPerMeter;
    zoomAt(pointer.x, pointer.y, e.evt.deltaY > 0 ? old * 0.92 : old * 1.08);
  };

  const startFreehand = (point: Pt) => {
    const st = useProject.getState();
    const tolerance = Math.max(0.12, 24 / Math.max(st.pxPerMeter, 1));
    const boundary = nearestFaceBoundary(drawingOrMigrate(st.project), point, tolerance);
    freehandOn.current = true;
    skipClick.current = true;
    st.setDraftPoints([{ ...(boundary?.pt ?? point) }]);
  };

  const appendFreehand = (point: Pt) => {
    const st = useProject.getState();
    const previous = st.draft.points[st.draft.points.length - 1];
    const minimum = Math.max(0.006, 1.4 / Math.max(st.pxPerMeter, 1));
    if (!previous || dist(previous, point) >= minimum) st.addDraftPoint(point);
  };

  const finishFreehand = () => {
    if (!freehandOn.current) return;
    freehandOn.current = false;
    const st = useProject.getState();
    if (st.tool === "draw" && st.drawSub === "freehand" && st.draft.points.length > 1) {
      const points = st.draft.points.slice();
      const first = points[0]!;
      const lastIndex = points.length - 1;
      const last = points[lastIndex]!;
      const pxPerMeter = Math.max(st.pxPerMeter, 1);
      const closeTolerance = Math.max(0.12, 28 / pxPerMeter);
      if (points.length >= 3 && dist(first, last) <= closeTolerance) {
        points[lastIndex] = { ...first };
      } else {
        const boundary = nearestFaceBoundary(
          drawingOrMigrate(st.project),
          last,
          Math.max(0.12, 24 / pxPerMeter),
        );
        if (boundary) points[lastIndex] = { ...boundary.pt };
      }
      st.setDraftPoints(points);
      useProject.getState().finishOpenDraw();
    } else {
      st.cancelDraft();
    }
  };

  const finishDraw = (pts: Pt[]) => {
    const st = useProject.getState();
    if (drawSub === "polygon" || drawSub === "polyline" || drawSub === "freehand") {
      if (pts.length < 2) return;
      if (drawSub === "polygon" && pts.length >= 3) {
        st.closePolygon();
        return;
      }
      st.commitGeom({
        id: uid("g"),
        type: drawSub === "polyline" || drawSub === "freehand" ? "line" : "poly",
        kind: st.polyKind,
        points: pts,
        closed: false,
        locked: false,
        hidden: false,
      });
      st.cancelDraft();
      return;
    }
    if (drawSub === "line" && pts.length >= 2) {
      st.commitGeom({
        id: uid("g"),
        type: "line",
        kind: st.polyKind,
        points: pts.slice(0, 2),
        closed: false,
        locked: false,
        hidden: false,
      });
      st.cancelDraft();
    }
    if (drawSub === "rect" && pts.length >= 2) {
      const a = pts[0]!;
      const b = pts[1]!;
      st.commitGeom({
        id: uid("g"),
        type: "rect",
        kind: st.polyKind,
        points: [
          { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
          { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) },
          { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
          { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) },
        ],
        closed: true,
        locked: false,
        hidden: false,
      });
      st.cancelDraft();
    }
    if (drawSub === "circle" && pts.length >= 2) {
      const c = pts[0]!;
      const r = dist(c, pts[1]!);
      st.commitGeom({
        id: uid("g"),
        type: "circle",
        kind: st.polyKind,
        points: [c],
        radius: r,
        closed: true,
        locked: false,
        hidden: false,
      });
      st.cancelDraft();
    }
    if (drawSub === "arc" && pts.length >= 3) {
      st.commitGeom({
        id: uid("g"),
        type: "arc",
        kind: st.polyKind,
        points: pts.slice(0, 3),
        closed: false,
        locked: false,
        hidden: false,
      });
      st.cancelDraft();
    }
  };

  const closeSplineDraft = () => {
    const st = useProject.getState();
    if (st.tool !== "draw" || st.drawSub !== "spline" || st.draft.points.length < 3)
      return;
    st.commitDrawing(
      addSpline(
        drawingOrMigrate(st.project),
        st.draft.points,
        true,
        st.regionType,
      ),
    );
    pendingHover.current = null;
    if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current);
    hoverRaf.current = 0;
    setHoverPt(null);
    setSnapHit(null);
    setActiveDraftSplinePoint(null);
  };

  const finishOpenSplineDraft = () => {
    const st = useProject.getState();
    if (st.tool !== "draw" || st.drawSub !== "spline" || st.draft.points.length < 2)
      return;
    st.finishOpenDraw();
    pendingHover.current = null;
    if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current);
    hoverRaf.current = 0;
    setHoverPt(null);
    setSnapHit(null);
    setActiveDraftSplinePoint(null);
    try {
      navigator.vibrate?.(20);
    } catch {
      /* ignore */
    }
  };

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (pinchGestureActive.current || pinching) return;
    if (Date.now() < pinchSuppressClickUntil.current) return;
    if (Date.now() < lineTapGuardUntil.current) return;
    if (skipClick.current || editDrag.current) {
      skipClick.current = false;
      return;
    }
    const raw = toWorld(e.target.getStage());
    const st = useProject.getState();
    if (st.spaceDown) return;
    const stretching =
      st.tool === "draw" &&
      st.draft.points.length >= 1 &&
      (st.drawSub === "circle" || st.drawSub === "ellipse");
    const angleFrom = stretching
      ? null
      : st.tool === "draw" && st.draft.points.length
        ? st.draft.points[st.draft.points.length - 1]!
        : null;
    const p = applySnap(raw, { angleFrom, free: stretching }).pt;

    if (st.tool === "scale") {
      if (!st.draft.scaleA)
        useProject.setState({ draft: { ...st.draft, scaleA: p, scaleB: null } });
      else {
        useProject.setState({ draft: { ...st.draft, scaleB: p } });
        onScalePair(st.draft.scaleA, p);
      }
      return;
    }
    if (st.tool === "measure") {
      if (st.measureSub === "guide" && st.draft.measureA) {
        const a = st.draft.measureA;
        const dx = p.x - a.x;
        const dy = p.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const reach = 80;
        st.commitGeom({
          id: uid("guide"),
          type: "guide",
          kind: "path",
          points: [
            { x: a.x - ux * reach, y: a.y - uy * reach },
            { x: a.x + ux * reach, y: a.y + uy * reach },
          ],
          closed: false,
          locked: false,
          hidden: false,
        });
        useProject.setState({ draft: { ...st.draft, measureA: null } });
        return;
      }
      const face = pickFaceAt(drawingOrMigrate(st.project), p);
      if (!st.draft.measureA && face) {
        toast(
          `${tr(locale, "area")}: ${faceArea(drawingOrMigrate(st.project), face).toFixed(2)} m²`,
        );
      }
      if (!st.draft.measureA) useProject.setState({ draft: { ...st.draft, measureA: p } });
      else {
        onMeasure(dist(st.draft.measureA, p));
        useProject.setState({ draft: { ...st.draft, measureA: null } });
      }
      return;
    }
    if (st.tool === "draw") {
      if (!st.drawSub || st.drawSub === "none") {
        const d = drawingOrMigrate(st.project);
        const edge = pickEdgeAt(d, p, 14 / px);
        const face = pickFaceAt(d, p);
        if (edge && !face && isLegacyDrawnLooseEdge(d, edge)) {
          st.selectEdge(null);
          return;
        }
        const edgeFace = edge
          ? face ?? d.edges[edge]?.faceL ?? d.edges[edge]?.faceR ?? null
          : null;
        if (edgeFace) {
          if (st.cadEditId === edgeFace) return;
          st.selectPoly(edgeFace, multiSelect);
          return;
        }
        if (edge) {
          st.selectEdge(edge);
          return;
        }
        if (st.cadEditId && face === st.cadEditId) return;
        if (face) {
          st.selectPoly(face, multiSelect);
          return;
        }
        if (e.target.name() === "bg") {
          st.setCadEdit(null);
          st.selectPoly(null);
        }
        return;
      }
      if (drawSub === "freehand") return;
      if (drawSub === "fill") {
        st.fillRegionAt(p);
        return;
      }
      if (drawSub === "offset") {
        const face = pickFaceAt(drawingOrMigrate(st.project), p);
        if (face) st.selectPoly(face);
        if (st.draft.points.length === 0) {
          st.addDraftPoint(p);
          return;
        }
        const dlt = dist(st.draft.points[0]!, p);
        st.offsetBy(dlt);
        return;
      }
      if (drawSub === "fillet") {
        st.filletAt(p, 0.5);
        return;
      }
      if (drawSub === "chamfer") {
        st.chamferAt(p, 0.3);
        return;
      }
      if (drawSub === "dim") {
        const dnow = drawingOrMigrate(st.project);
        const hit = Object.values(dnow.dims ?? {}).find((dim) => {
          const pr = { x: (dim.a.x + dim.b.x) / 2, y: (dim.a.y + dim.b.y) / 2 };
          return dist(p, pr) < 24 / px || dist(p, dim.a) < 16 / px;
        });
        if (hit) {
          const next = { ...dnow, dims: { ...dnow.dims } };
          delete next.dims![hit.id];
          st.commitDrawing(next, st.selectedPolyId, true);
          return;
        }
        if (!st.draft.points.length) {
          st.addDraftPoint(p);
          return;
        }
        const a = st.draft.points[0]!;
        st.addDimension(a, p, 0.45);
        return;
      }
      if (drawSub === "text") {
        const label = window.prompt(tr(locale, "drawText"), tr(locale, "textPlaceholder"));
        if (label) st.addNote(p, label);
        return;
      }
      if (drawSub === "trim") {
        st.trimAt(p);
        return;
      }
      if (drawSub === "extend") {
        st.extendAt(p);
        return;
      }
      if (drawSub === "copy" || drawSub === "array") {
        const face = pickFaceAt(drawingOrMigrate(st.project), p);
        if (face && !st.selectedPolyId) {
          st.selectPoly(face);
          st.addDraftPoint(p);
          return;
        }
        if (!st.draft.points.length) {
          st.addDraftPoint(p);
          return;
        }
        const a = st.draft.points[0]!;
        const dx = p.x - a.x;
        const dy = p.y - a.y;
        if (drawSub === "array") st.arraySelected(dx, dy, st.arrayCount);
        else st.copySelectedBy(dx, dy);
        return;
      }
      if (drawSub === "polar") {
        const face = pickFaceAt(drawingOrMigrate(st.project), p);
        if (face && !st.selectedPolyId) {
          st.selectPoly(face);
          return;
        }
        st.polarSelected(p, st.arrayCount);
        return;
      }
      if (drawSub === "hole") {
        if (!st.draft.points.length) {
          st.addDraftPoint(p);
          return;
        }
        const a = st.draft.points[0]!;
        st.commitDrawing(addRect(drawingOrMigrate(st.project), a, p, "no_irrigation"));
        return;
      }
      if (drawSub === "match") {
        const face = pickFaceAt(drawingOrMigrate(st.project), p);
        if (!face) return;
        if (!st.selectedPolyId) {
          st.selectPoly(face);
          return;
        }
        const src = drawingOrMigrate(st.project).faces[st.selectedPolyId];
        if (src) st.setRegionType(face, src.type);
        return;
      }
      const kind = st.polyKind;
      if (st.drawSub === "line") {
        if (lineEditingRef.current) {
          const draftSegment = pickDraftSegment(st.draft.points, p, 14 / px);
          if (draftSegment != null) {
            setSelectedDraftSegment(draftSegment);
            setSelectedDraftEdgeId(
              findStraightEdgeId(
                drawingOrMigrate(st.project),
                st.draft.points[draftSegment]!,
                st.draft.points[draftSegment + 1]!,
              ),
            );
          } else {
            lineEditingRef.current = false;
            lineTapGuardUntil.current = Date.now() + 280;
            st.cancelDraft();
            setSelectedDraftSegment(null);
            setSelectedDraftEdgeId(null);
            setHoverPt(null);
          }
          return;
        }
        if (st.selectedEdgeId) {
          const d = drawingOrMigrate(st.project);
          const tappedEdgeId = pickLooseStraightEdge(d, p, 18 / px);
          const tappedEdge = tappedEdgeId ? d.edges[tappedEdgeId] : null;
          if (
            tappedEdge &&
            !tappedEdge.faceL &&
            !tappedEdge.faceR &&
            Math.abs(tappedEdge.bulge) < 1e-6
          ) {
            st.selectEdge(tappedEdge.id);
          } else {
            st.selectEdge(null);
            lineTapGuardUntil.current = Date.now() + 280;
          }
          setHoverPt(null);
          return;
        }
        if (!st.draft.points.length) {
          const d = drawingOrMigrate(st.project);
          const tappedEndpoint = pickLooseEndpoint(d, p, 14 / px);
          if (tappedEndpoint) {
            lineEditingRef.current = false;
            setSelectedDraftSegment(null);
            setSelectedDraftEdgeId(null);
            setHoverPt(tappedEndpoint);
            st.addDraftPoint(tappedEndpoint);
            return;
          }
          const tappedEdgeId = pickLooseStraightEdge(d, p, 18 / px);
          const tappedEdge = tappedEdgeId ? d.edges[tappedEdgeId] : null;
          if (
            tappedEdge &&
            !tappedEdge.faceL &&
            !tappedEdge.faceR &&
            Math.abs(tappedEdge.bulge) < 1e-6
          ) {
            st.selectEdge(tappedEdge.id);
            setHoverPt(null);
            return;
          }
          lineEditingRef.current = false;
          setSelectedDraftSegment(null);
          setSelectedDraftEdgeId(null);
          st.addDraftPoint(p);
          return;
        }
        const a = st.draft.points[st.draft.points.length - 1]!;
        if (st.draft.points.length >= 3 && dist(st.draft.points[0]!, p) < Math.max(0.2, 28 / px)) {
          if (selfIntersects([...st.draft.points, st.draft.points[0]!]))
            toast(tr(locale, "selfIntersect"));
          setSelectedDraftSegment(null);
          setSelectedDraftEdgeId(null);
          lineEditingRef.current = false;
          st.closePolygon();
          return;
        }
        const draftSegment = pickDraftSegment(st.draft.points, p, 14 / px);
        if (draftSegment != null) {
          lineEditingRef.current = true;
          setSelectedDraftSegment(draftSegment);
          setSelectedDraftEdgeId(
            findStraightEdgeId(
              drawingOrMigrate(st.project),
              st.draft.points[draftSegment]!,
              st.draft.points[draftSegment + 1]!,
            ),
          );
          return;
        }
        setSelectedDraftSegment(null);
        setSelectedDraftEdgeId(null);
        lineEditingRef.current = false;
        if (dist(a, p) < 1e-9) return;
        const currentDrawing = drawingOrMigrate(st.project);
        const previousFaces = Object.values(currentDrawing.faces);
        const previousFaceKeys = new Set(previousFaces.map(faceBoundaryKey));
        const nextDrawing = mergeOpenCollinearEdges(
          addChain(currentDrawing, [a, p], false, st.regionType),
        );
        const nextFaces = Object.values(nextDrawing.faces);
        const createdFaceId =
          nextFaces.length > previousFaces.length
            ? (nextFaces.find((face) => !previousFaceKeys.has(faceBoundaryKey(face)))?.id ?? null)
            : null;
        st.commitDrawing(nextDrawing, createdFaceId, !createdFaceId);
        lineTapGuardUntil.current = Date.now() + 280;
        setHoverPt(null);
        setSnapHit(null);
        if (createdFaceId) {
          useProject.setState({
            draft: { ...st.draft, points: [] },
            tool: "draw",
            drawSub: "none",
            cadEditId: createdFaceId,
            selectedPolyId: createdFaceId,
            selectedPolyIds: [createdFaceId],
            selectedEdgeId: null,
            rightMode: "drawing",
            rightOpen: true,
          });
          return;
        }
        useProject.setState({
          draft: { ...st.draft, points: [] },
          tool: "draw",
          drawSub: "line",
          cadEditId: null,
          selectedPolyId: null,
          selectedPolyIds: [],
          selectedEdgeId: null,
          rightOpen: false,
        });
        return;
      }
      if (st.drawSub === "polyline") {
        if (!st.draft.points.length) {
          st.addDraftPoint(p);
          return;
        }
        const a = st.draft.points[st.draft.points.length - 1]!;
        if (dist(a, p) < 1e-9) return;
        st.commitGeom({
          id: uid("g"),
          type: "line",
          kind,
          points: [a, p],
          closed: false,
          locked: false,
          hidden: false,
        });
        useProject.setState({
          draft: { points: [p], scaleA: null, scaleB: null, measureA: null },
          tool: "draw",
        });
        return;
      }
      if (drawSub === "polygon") {
        const current = st.draft.points;
        const closeM = Math.max(0.2, 32 / px);
        if (current.length >= 4 && dist(current[1]!, p) < closeM) {
          pendingHover.current = null;
          if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current);
          hoverRaf.current = 0;
          setHoverPt(null);
          setSnapHit(null);
          st.closePolygon();
          return;
        }
        setActiveDraftPolygonPoint(null);
        st.addDraftPoint(p);
        pendingHover.current = null;
        if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current);
        hoverRaf.current = 0;
        setHoverPt(null);
        setSnapHit(null);
        return;
      }
      if (drawSub === "spline") {
        const current = st.draft.points;
        const closeM = Math.max(0.2, 32 / px);
        const continuation =
          current.length && st.snapOn
            ? nearestOpenSplineEndpoint(
                drawingOrMigrate(st.project),
                current[0]!,
                closeM,
              )
            : null;
        if (
          continuation &&
          current.length >= 1 &&
          dist(continuation.opposite, p) < closeM
        ) {
          st.setDraftPoints([...current, { ...continuation.opposite }]);
          useProject.getState().finishOpenDraw();
          pendingHover.current = null;
          if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current);
          hoverRaf.current = 0;
          setHoverPt(null);
          setSnapHit(null);
          setActiveDraftSplinePoint(null);
          return;
        }
        if (current.length >= 3 && dist(current[0]!, p) < closeM) {
          closeSplineDraft();
          return;
        }
        if (!current.length || dist(current[current.length - 1]!, p) > 1e-9) {
          setActiveDraftSplinePoint(null);
          st.addDraftPoint(p);
        }
        return;
      }
      st.addDraftPoint(p);
      const pts = [...st.draft.points, p];
      if (drawSub === "rect" && pts.length >= 2) finishDraw(pts);
      if (drawSub === "rotrect" && pts.length >= 3) {
        const a = pts[0]!;
        const b = pts[1]!;
        const w = ((p.x - b.x) * -(b.y - a.y) + (p.y - b.y) * (b.x - a.x)) / (dist(a, b) || 1);
        st.commitDrawing(addRotatedRect(drawingOrMigrate(st.project), a, b, w, st.regionType));
        return;
      }
      if (drawSub === "circle" && pts.length >= 2) finishDraw(pts);
      if (drawSub === "triangle" && pts.length >= 2) {
        st.commitDrawing(
          addTriangle(drawingOrMigrate(st.project), triangleFromBounds(pts[0]!, p), st.regionType),
        );
        return;
      }
      if (drawSub === "hexagon" && pts.length >= 2) {
        st.commitDrawing(
          addHexagon(drawingOrMigrate(st.project), hexagonFromBounds(pts[0]!, p), st.regionType),
        );
        return;
      }
      if (drawSub === "arc" && pts.length >= 3) finishDraw(pts);
      if (drawSub === "ellipse" && pts.length >= 2) {
        const c = pts[0]!;
        st.commitDrawing(
          addEllipse(
            drawingOrMigrate(st.project),
            c,
            Math.abs(p.x - c.x),
            Math.abs(p.y - c.y),
            st.regionType,
          ),
        );
        return;
      }
      if (!drawSub && pts.length >= 3) {
        const closeM = Math.max(0.2, 32 / px);
        if (dist(pts[0]!, p) < closeM) st.closePolygon();
      }
      return;
    }
    if (!st.tool || st.tool === "move" || multiSelect) {
      const d = drawingOrMigrate(st.project);
      const eTol = 14 / px;
      const cands = pickCandidates(
        d,
        p,
        eTol,
        st.project.heads.map((h) => ({ id: h.id, x: h.x, y: h.y })),
      );
      if (!mobile && cands.length > 1) {
        const faces = cands.filter((c) => c.kind === "face");
        if (
          faces.length > 1 &&
          Math.abs(faces[0]!.d - faces[1]!.d) < Math.max(faces[0]!.d * 0.35, 2)
        ) {
          setPickList({ x: sx(p.x), y: sy(p.y), items: cands.slice(0, 5) });
          return;
        }
      }
      const edge = pickEdgeAt(d, p, eTol);
      const face = pickFaceAt(d, p);
      const ev = e.evt as MouseEvent | PointerEvent | undefined;
      const shift = Boolean(ev?.shiftKey);
      const ctrl = Boolean(ev?.ctrlKey || ev?.metaKey);
      const alt = Boolean(ev?.altKey);
      if (shift && face && st.selectedPolyId && face !== st.selectedPolyId) {
        st.unionWith(face);
        return;
      }
      if ((ctrl || multiSelect) && face) {
        st.selectPoly(face, true);
        return;
      }
      if (st.pendingPlant) {
        st.addPlantAt(p, st.pendingPlant);
        st.setPendingPlant(null);
        return;
      }
      if (alt && face && st.selectedPolyId) {
        st.punchSelected(face);
        return;
      }
      if (edge && !face && isLegacyDrawnLooseEdge(d, edge)) {
        st.selectEdge(null);
        return;
      }
      if (edge && isInternalEdge(d, edge)) {
        st.selectEdge(edge);
        return;
      }
      if (face) {
        st.selectPoly(face);
        return;
      }
      if (edge) {
        st.selectEdge(edge);
        return;
      }
    }
    if (e.target.name() === "bg") {
      st.selectHead(null);
      st.selectPoly(null);
      st.selectEdge(null);
      st.setCadEdit(null);
      setDeleteMenu(null);
      setEditHandles(null);
      return;
    }
  };

  const canPan = () => useProject.getState().spaceDown || midDown.current;

  const startPan = (stage: Konva.Stage | null) => {
    if (!canPan()) return;
    const p = stage?.getPointerPosition();
    if (p) panDrag.current = p;
  };

  const movePan = (stage: Konva.Stage | null) => {
    if (!panDrag.current) return;
    const p = stage?.getPointerPosition();
    if (!p) return;
    const dx = p.x - panDrag.current.x;
    const dy = p.y - panDrag.current.y;
    panDrag.current = p;
    const st = useProject.getState();
    st.setPan(st.panX + dx, st.panY + dy);
  };

  const hiddenZones = new Set((project.zones ?? []).filter((z) => z.hidden).map((z) => z.id));
  const lockedZones = new Set((project.zones ?? []).filter((z) => z.locked).map((z) => z.id));
  const u = project.underlay;
  const x0 = Math.floor(-panX / px) - 1;
  const y0 = Math.floor(-panY / px) - 1;
  const x1 = Math.ceil((size.w - panX) / px) + 1;
  const y1 = Math.ceil((size.h - panY) / px) + 1;
  const visualGrid = visibleGridStep(gridStep, px, Math.max(x1 - x0, y1 - y0));

  const cursor = spaceDown
    ? "grab"
    : tool === "draw" && drawSub === "line"
      ? "none"
      : tool
        ? "crosshair"
        : "default";
  const lawn = lawnPolygon(project.polygons);
  const holes = exclusionPolygons(project.polygons);
  const visibleHeads = project.heads.filter((h) => !hiddenZones.has(h.zone));
  const heat =
    analysis === "cover" || analysis === "overlap"
      ? lawn && visibleHeads.length <= 48
        ? sampleGrid(lawn, visibleHeads, 0.9, holes)
        : []
      : [];

  const rubberFrom =
    tool === "draw" &&
    draft.points.length &&
    !(drawSub === "line" && (selectedDraftSegment != null || selectedEdgeId || pinching))
      ? draft.points[draft.points.length - 1]!
      : tool === "scale" && draft.scaleA && !draft.scaleB
        ? draft.scaleA
        : tool === "measure" && draft.measureA
          ? draft.measureA
          : null;
  const rubberTo = hoverPt;
  const editingLineEdgeId = selectedDraftEdgeId ?? selectedEdgeId;
  const editingLineEdge = editingLineEdgeId
    ? drawingOrMigrate(project).edges[editingLineEdgeId]
    : null;
  const editingLineA = editingLineEdge
    ? drawingOrMigrate(project).vertices[editingLineEdge.a]
    : null;
  const editingLineB = editingLineEdge
    ? drawingOrMigrate(project).vertices[editingLineEdge.b]
    : null;
  const lineDeletePosition =
    editingLineEdge &&
    !editingLineEdge.faceL &&
    !editingLineEdge.faceR &&
    editingLineA &&
    editingLineB
      ? (() => {
          const ax = sx(editingLineA.x);
          const ay = sy(editingLineA.y);
          const bx = sx(editingLineB.x);
          const by = sy(editingLineB.y);
          const length = Math.hypot(bx - ax, by - ay) || 1;
          const x = (ax + bx) / 2 - ((by - ay) / length) * 34;
          const y = (ay + by) / 2 + ((bx - ax) / length) * 34;
          return {
            x: Math.max(24, Math.min(size.w - 24, x)),
            y: Math.max(24, Math.min(size.h - 24, y)),
          };
        })()
      : null;
  const polygonPreviewPt =
    drawSub === "polygon" && draft.points.length
      ? hoverPt ?? draft.points[draft.points.length - 1]!
      : null;
  const polygonBoundaryPoints = drawSub === "polygon" ? draft.points.slice(1) : [];
  const polygonLivePoints =
    polygonPreviewPt &&
    polygonBoundaryPoints.length &&
    dist(polygonBoundaryPoints[polygonBoundaryPoints.length - 1]!, polygonPreviewPt) > 1e-7
      ? [...polygonBoundaryPoints, polygonPreviewPt]
      : polygonBoundaryPoints;
  const polygonFillPoints =
    drawSub === "polygon" && draft.points.length
      ? [draft.points[0]!, ...polygonLivePoints]
      : [];
  const activeConstructionPoint =
    (drawSub === "polygon" ? activeDraftPolygonPoint : activeDraftSplinePoint) ??
    (draft.points.length > 1 ? draft.points.length - 1 : null);
  const beginPolygonDraftPointDrag = (
    pointIndex: number,
    e: Konva.KonvaEventObject<PointerEvent | MouseEvent | TouchEvent>,
  ) => {
    const movePoint = (p: Pt) => {
      const snapped = snapPolygonDraftPoint(p, pointIndex);
      const st = useProject.getState();
      const next = st.draft.points.slice();
      if (!next[pointIndex]) return;
      next[pointIndex] = snapped.pt;
      st.setDraftPoints(next);
      setSnapHit(snapped.kind !== "none" ? { kind: snapped.kind, pt: snapped.pt } : null);
    };
    bindPointerDrag(
      e,
      editDrag,
      panX,
      panY,
      px,
      () => {
        setActiveDraftPolygonPoint(pointIndex);
        setHoverPt(null);
        setSnapHit(null);
      },
      movePoint,
      (p) => {
        movePoint(p);
        setSnapHit(null);
      },
      skipClick,
      pinchGestureActive,
      () => setSnapHit(null),
      () => {
        const st = useProject.getState();
        if (pointIndex !== 1 || st.drawSub !== "polygon" || st.draft.points.length < 4) return;
        pendingHover.current = null;
        if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current);
        hoverRaf.current = 0;
        setHoverPt(null);
        setSnapHit(null);
        st.closePolygon();
      },
    );
  };

  const beginSplineDraftPointDrag = (
    pointIndex: number,
    e: Konva.KonvaEventObject<PointerEvent | MouseEvent | TouchEvent>,
  ) => {
    const draftAtStart = useProject.getState().draft.points;
    const canFinishOnHold =
      draftAtStart.length >= 2 && pointIndex === draftAtStart.length - 1;
    const movePoint = (point: Pt) => {
      const st = useProject.getState();
      const previous = pointIndex > 0 ? st.draft.points[pointIndex - 1] ?? null : null;
      const snapped = applySnap(point, { angleFrom: previous });
      const next = st.draft.points.slice();
      if (!next[pointIndex]) return;
      next[pointIndex] = snapped.pt;
      st.setDraftPoints(next);
      setSnapHit(snapped.kind !== "none" ? { kind: snapped.kind, pt: snapped.pt } : null);
    };
    bindPointerDrag(
      e,
      editDrag,
      panX,
      panY,
      px,
      () => {
        setActiveDraftSplinePoint(pointIndex);
        setHoverPt(null);
        setSnapHit(null);
      },
      movePoint,
      (point) => {
        movePoint(point);
        const st = useProject.getState();
        const lastIndex = st.draft.points.length - 1;
        const closeM = Math.max(0.2, 32 / Math.max(st.pxPerMeter, 1));
        if (
          pointIndex === lastIndex &&
          st.draft.points.length >= 3 &&
          dist(st.draft.points[0]!, st.draft.points[lastIndex]!) < closeM
        ) {
          closeSplineDraft();
          return;
        }
        setSnapHit(null);
      },
      skipClick,
      pinchGestureActive,
      () => setSnapHit(null),
      () => {
        if (pointIndex === 0) closeSplineDraft();
      },
      canFinishOnHold ? finishOpenSplineDraft : undefined,
    );
  };

  const finishOpenDrawFromDoubleTap = () => {
    const st = useProject.getState();
    if (
      st.tool !== "draw" ||
      st.drawSub === "polygon" ||
      st.drawSub === "line" ||
      st.drawSub === "spline"
    )
      return;
    if (st.draft.points.length >= 2) st.finishOpenDraw();
  };

  return (
    <div
      ref={wrapRef}
      data-design-canvas="1"
      className="relative h-full min-h-0 w-full overflow-hidden touch-none bg-surface-2"
      onContextMenu={(e) => e.preventDefault()}
    >
      <Stage
        ref={stageRef}
        listening={!readOnly}
        width={size.w}
        height={size.h}
        style={{ position: "absolute", top: 0, left: 0, width: size.w, height: size.h, cursor }}
        onWheel={onWheel}
        onClick={handleClick}
        onTap={handleClick}
        onDblClick={finishOpenDrawFromDoubleTap}
        onDblTap={finishOpenDrawFromDoubleTap}
        onMouseDown={(e) => {
          pointerType.current = "mouse";
          if (e.evt.button === 0 && tool === "draw" && drawSub === "freehand") {
            startFreehand(toWorld(e.target.getStage()));
            return;
          }
          if (e.evt.button === 1) {
            midDown.current = true;
            startPan(e.target.getStage());
            return;
          }
          if (spaceDown) {
            startPan(e.target.getStage());
            return;
          }
          if (!tool && e.target.name() === "bg") {
            box.current = toWorld(e.target.getStage());
            setBoxNow(box.current);
          }
        }}
        onMouseUp={() => {
          midDown.current = false;
          panDrag.current = null;
          if (box.current && boxNow) {
            const a = box.current;
            const b = boxNow;
            const minX = Math.min(a.x, b.x);
            const maxX = Math.max(a.x, b.x);
            const minY = Math.min(a.y, b.y);
            const maxY = Math.max(a.y, b.y);
            if (maxX - minX > 0.3 && maxY - minY > 0.3) {
              const ids = project.heads
                .filter((h) => h.x >= minX && h.x <= maxX && h.y >= minY && h.y <= maxY)
                .map((h) => h.id);
              useProject.getState().selectHeads(ids);
            }
          }
          box.current = null;
          setBoxNow(null);
          finishFreehand();
        }}
        onMouseLeave={() => {
          panDrag.current = null;
          setHoverPt(null);
          onHover?.(null);
        }}
        onMouseMove={(e) => {
          const stage = e.target.getStage();
          const wpt = toWorld(stage);
          trackPointer(wpt);
          movePan(stage);
          if (box.current) setBoxNow(wpt);
          if (
            freehandOn.current &&
            tool === "draw" &&
            drawSub === "freehand" &&
            e.evt.buttons === 1
          ) {
            appendFreehand(wpt);
          }
        }}
        onTouchStart={(e) => {
          pointerType.current = "touch";
          const wrap = wrapRef.current;
          const touches = e.evt.touches;
          if (wrap && touches.length >= 2) {
            e.evt.preventDefault();
            pinchGestureActive.current = true;
            setPinching(true);
            setHoverPt(null);
            setSnapHit(null);
            const info = pinchInfo(touches, wrap);
            const st = useProject.getState();
            if (info) {
              pinch.current = {
                dist: info.dist,
                midX: info.midX,
                midY: info.midY,
                panX: st.panX,
                panY: st.panY,
                px: st.pxPerMeter,
              };
            }
            skipClick.current = true;
            pinchSuppressClickUntil.current = Date.now() + 650;
            freehandOn.current = false;
            return;
          }
          if (wrap && touches.length === 1 && tool === "draw" && drawSub === "freehand") {
            const t = touches.item(0);
            if (!t) return;
            const st = useProject.getState();
            const wpt = worldOfPointer(t.clientX, t.clientY, wrap, st.panX, st.panY, st.pxPerMeter);
            startFreehand(wpt);
          }
        }}
        onTouchMove={(e) => {
          const wrap = wrapRef.current;
          const touches = e.evt.touches;
          if (wrap && touches.length >= 2 && pinch.current) {
            e.evt.preventDefault();
            const info = pinchInfo(touches, wrap);
            if (!info || info.dist < 8) return;
            const g = pinch.current;
            const scale = info.dist / (g.dist || 1);
            const nextPx = clampPxPerMeter(g.px * scale);
            const wx = (g.midX - g.panX) / g.px;
            const wy = (g.midY - g.panY) / g.px;
            useProject.getState().setZoom(nextPx);
            useProject.getState().setPan(info.midX - wx * nextPx, info.midY - wy * nextPx);
            skipClick.current = true;
            pinchSuppressClickUntil.current = Date.now() + 650;
            return;
          }
          if (pinchGestureActive.current) return;
          if (wrap && touches.length === 1) {
            const t = touches.item(0);
            if (!t) return;
            const st = useProject.getState();
            const wpt = worldOfPointer(t.clientX, t.clientY, wrap, st.panX, st.panY, st.pxPerMeter);
            if (freehandOn.current && st.tool === "draw" && drawSub === "freehand") {
              appendFreehand(wpt);
              return;
            }
            trackPointer(wpt);
          }
        }}
        onTouchEnd={(e) => {
          if (pinchGestureActive.current) pinchSuppressClickUntil.current = Date.now() + 650;
          if (e.evt.touches.length < 2) pinch.current = null;
          if (e.evt.touches.length === 0) {
            pinchGestureActive.current = false;
            setPinching(false);
          }
          if (e.evt.touches.length === 0 && freehandOn.current) {
            finishFreehand();
          }
        }}
      >
        <Layer perfectDrawEnabled={false}>
          <Rect name="bg" x={0} y={0} width={size.w} height={size.h} fill={appearance.bg} />
          {showGrid && (
            <CadGrid x0={x0} x1={x1} y0={y0} y1={y1} step={visualGrid} sx={sx} sy={sy} />
          )}
          {u && img && u.visible !== false && (
            <KImage
              image={img}
              x={sx(u.x)}
              y={sy(u.y)}
              width={u.width * px}
              height={u.height * px}
              opacity={u.opacity}
              listening={false}
            />
          )}
          {!readOnly && <Line
            points={[sx(-2), sy(0), sx(2), sy(0)]}
            stroke="#c45c26"
            strokeWidth={1.2}
            listening={false}
          />}
          {!readOnly && <Line
            points={[sx(0), sy(-2), sx(0), sy(2)]}
            stroke="#c45c26"
            strokeWidth={1.2}
            listening={false}
          />}
          {project.polygons.map((poly) =>
            poly.type === "line" && (poly.id === selectedEdgeId || poly.id === selectedDraftEdgeId)
              ? null
              : renderGeom(
                  poly,
                  sx,
                  sy,
                  px,
                  selectedPolyId,
                  selectedPolyIds,
                  (k) => REGION_FILL[k as keyof typeof REGION_FILL] ?? "#ddd",
                  startCadHold,
                  endCadHold,
                  DRAW_CREATE.has(drawSub) || catalogOpen,
                  liveCadPath?.faceId === poly.id && cadEditId === poly.id
                    ? liveCadPath.points
                    : null,
                  appearance,
                  textureImages,
                ),
          )}
          {Object.values(drawingOrMigrate(project).plants ?? {}).map((pl) =>
            drawingOrMigrate(project).layers?.plants?.visible === false ? null : (
              <Group key={pl.id} x={sx(pl.x)} y={sy(pl.y)} listening={false}>
                <Circle
                  radius={pl.r * px}
                  fill={pl.kind === "tree" ? "rgba(70,110,60,0.25)" : "rgba(90,120,70,0.25)"}
                  stroke="#4a6a3a"
                  strokeWidth={1}
                />
                <Circle radius={4} fill="#4a6a3a" />
              </Group>
            ),
          )}
          {heat.map((c, i) => (
            <Rect
              key={`h${i}`}
              x={sx(c.x) - px * 0.35}
              y={sy(c.y) - px * 0.35}
              width={px * 0.7}
              height={px * 0.7}
              fill={c.n === 0 ? "#9b3a2f" : c.n === 1 ? "#c5a35a" : "#2f6b45"}
              opacity={0.35}
              listening={false}
            />
          ))}
          {Object.values(drawingOrMigrate(project).texts ?? {}).map((tx) =>
            drawingOrMigrate(project).layers?.annotations?.visible === false ? null : (
              <Text
                key={tx.id}
                x={sx(tx.x)}
                y={sy(tx.y)}
                text={tx.text}
                fontSize={Math.max(11, tx.size * px)}
                fontFamily="IBM Plex Sans, sans-serif"
                fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
                draggable={!tool}
                onDragEnd={(e) => {
                  useProject.getState().moveNote(tx.id, {
                    x: (e.target.x() - panX) / px,
                    y: (e.target.y() - panY) / px,
                  });
                }}
              />
            ),
          )}
          {Object.values(drawingOrMigrate(project).dims ?? {}).map((dim) => {
            if (px < 14 || drawingOrMigrate(project).layers?.dims?.visible === false) return null;
            const { a, b } = resolveDim(drawingOrMigrate(project), dim);
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;
            const o = dim.offset;
            const a2 = { x: a.x + nx * o, y: a.y + ny * o };
            const b2 = { x: b.x + nx * o, y: b.y + ny * o };
            const mx = (a2.x + b2.x) / 2;
            const my = (a2.y + b2.y) / 2;
            return (
              <Group
                key={dim.id}
                draggable={!tool}
                x={sx(mx)}
                y={sy(my)}
                onDragEnd={(e) => {
                  const p = { x: (e.target.x() - panX) / px, y: (e.target.y() - panY) / px };
                  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                  useProject
                    .getState()
                    .setDimOffset(dim.id, (p.x - mid.x) * nx + (p.y - mid.y) * ny);
                }}
              >
                <Line
                  points={[
                    sx(a.x) - sx(mx),
                    sy(a.y) - sy(my),
                    sx(a2.x) - sx(mx),
                    sy(a2.y) - sy(my),
                  ]}
                  stroke={appearance.accent}
                  strokeWidth={1}
                />
                <Line
                  points={[
                    sx(b.x) - sx(mx),
                    sy(b.y) - sy(my),
                    sx(b2.x) - sx(mx),
                    sy(b2.y) - sy(my),
                  ]}
                  stroke={appearance.accent}
                  strokeWidth={1}
                />
                <Line
                  points={[
                    sx(a2.x) - sx(mx),
                    sy(a2.y) - sy(my),
                    sx(b2.x) - sx(mx),
                    sy(b2.y) - sy(my),
                  ]}
                  stroke={appearance.accent}
                  strokeWidth={1.4}
                />
                <Circle radius={16} fill="rgba(255,255,255,0.001)" />
                <Text
                  x={-36}
                  y={-8}
                  width={72}
                  align="center"
                  text={formatLen(len, measureUnit)}
                  fontSize={12}
                  fontFamily="IBM Plex Sans, sans-serif"
                  fill={appearance.accent}
                />
              </Group>
            );
          })}
          {(readOnly || catalogOpen) &&
            project.heads
              .slice()
              .sort((a, b) => {
                const as = a.id === selectedId || selectedIds.includes(a.id) ? 1 : 0;
                const bs = b.id === selectedId || selectedIds.includes(b.id) ? 1 : 0;
                if (as !== bs) return as - bs;
                return b.r - a.r;
              })
              .map((h) => {
                if (hiddenZones.has(h.zone)) return null;
                const item = itemById(h.catalogId);
                const selected = h.id === selectedId || selectedIds.includes(h.id);
                const rPx = h.r * px;
                const rotorColor = item?.color ?? "#c45c26";
                const strip = item?.strip;
                const nz = item?.nozzles.find((n) => n.id === h.nozzleId) ?? item?.nozzles[0];
                const size = nz?.size ?? nz?.name;
                const model = item?.id ?? item?.name ?? "";
                const nozzleWord = tr(locale, "nozzle").toLowerCase();
                const label =
                  item?.type === "rotor"
                    ? size
                      ? `${item.id} (${nozzleWord} ${size})`
                      : item.id
                    : model;
                const grabR =
                  item?.type === "rotor" || item?.family === "st" || item?.family === "golf"
                    ? 48
                    : 36;
                const canDrag =
                  tool !== "draw" &&
                  tool !== "measure" &&
                  tool !== "scale" &&
                  !h.locked &&
                  !lockedZones.has(h.zone);
                return (
                  <Group
                    key={h.id}
                    x={sx(h.x)}
                    y={sy(h.y)}
                    draggable={canDrag}
                    dragDistance={12}
                    hitFunc={(ctx: Konva.Context, shape: Konva.Shape) => {
                      ctx.beginPath();
                      ctx.arc(0, 0, grabR, 0, Math.PI * 2, false);
                      ctx.closePath();
                      ctx.fillStrokeShape(shape);
                    }}
                    onPointerDown={(ev) => {
                      if (tool === "draw" || tool === "measure" || tool === "scale") return;
                      ev.cancelBubble = true;
                      pointerType.current = (ev.evt as PointerEvent).pointerType || "mouse";
                      beginHold(h.id, ev.currentTarget, (ev.evt as PointerEvent).pointerId ?? null);
                    }}
                    onPointerUp={clearHold}
                    onPointerCancel={clearHold}
                    onDragStart={(ev) => {
                      ev.cancelBubble = true;
                      clearHold();
                      holdMenu.current = false;
                      overCatalog.current = false;
                      setDeleteMenu(null);
                      const native = ev.evt as MouseEvent & { touches?: TouchList };
                      const t = native.touches?.[0];
                      const sx0 = t?.clientX ?? native.clientX ?? 0;
                      const sy0 = t?.clientY ?? native.clientY ?? 0;
                      lastClient.current = { x: sx0, y: sy0 };
                      headDragStart.current = { x: sx0, y: sy0 };
                      document.documentElement.dataset.headDrag = "1";
                      const inLib = (x: number, y: number) => {
                        const lib = document.querySelector("[data-catalog]");
                        if (!lib) return false;
                        const r = lib.getBoundingClientRect();
                        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
                      };
                      const move = (e: PointerEvent) => {
                        lastClient.current = { x: e.clientX, y: e.clientY };
                        if (inLib(e.clientX, e.clientY)) overCatalog.current = true;
                      };
                      headDragMove.current = move;
                      window.addEventListener("pointermove", move, true);
                    }}
                    onDragMove={(ev) => {
                      if (!snapOn) return;
                      const world = {
                        x: (ev.target.x() - panX) / px,
                        y: (ev.target.y() - panY) / px,
                      };
                      const g = useProject.getState().gridStep;
                      const pt = snapGrid(world, g);
                      ev.target.position({ x: sx(pt.x), y: sy(pt.y) });
                    }}
                    onDragEnd={(ev) => {
                      if (headDragMove.current) {
                        window.removeEventListener("pointermove", headDragMove.current, true);
                        headDragMove.current = null;
                      }
                      document.documentElement.removeAttribute("data-head-drag");
                      if (holdMenu.current) {
                        holdMenu.current = false;
                        ev.target.position({ x: sx(h.x), y: sy(h.y) });
                        return;
                      }
                      const pt = lastClient.current;
                      const start = headDragStart.current;
                      const moved = Math.hypot(pt.x - start.x, pt.y - start.y) > 36;
                      const lib = document.querySelector("[data-catalog]");
                      if (moved && overCatalog.current && lib) {
                        const r = lib.getBoundingClientRect();
                        if (
                          pt.x >= r.left &&
                          pt.x <= r.right &&
                          pt.y >= r.top &&
                          pt.y <= r.bottom
                        ) {
                          useProject.getState().removeHead(h.id);
                          return;
                        }
                      }
                      let world = {
                        x: (ev.target.x() - panX) / px,
                        y: (ev.target.y() - panY) / px,
                      };
                      if (snapOn) world = snapGrid(world, useProject.getState().gridStep);
                      ev.target.position({ x: sx(world.x), y: sy(world.y) });
                      useProject.getState().finishMoveHead(h.id, world);
                    }}
                    onClick={(ev) => {
                      if (tool === "draw" || tool === "measure" || tool === "scale") return;
                      ev.cancelBubble = true;
                      if (skipClick.current) return;
                      setDeleteMenu(null);
                      useProject.getState().selectHead(h.id);
                    }}
                    onTap={(ev) => {
                      if (tool === "draw" || tool === "measure" || tool === "scale") return;
                      ev.cancelBubble = true;
                      if (skipClick.current) return;
                      setDeleteMenu(null);
                      useProject.getState().selectHead(h.id);
                    }}
                  >
                    {showCoverage && visibleHeads.length <= 48 && !strip && (
                      <Line
                        points={sectorLocal(rPx, h.start, h.arc)}
                        closed
                        fill={rotorColor}
                        opacity={selected ? 0.55 : 0.32}
                        stroke={rotorColor}
                        strokeWidth={selected ? 2.5 : 1.5}
                        listening={false}
                      />
                    )}
                    {showCoverage && visibleHeads.length <= 48 && strip && (
                      <Line
                        points={stripLocal(strip, h.start, rPx / (h.r || 1))}
                        closed
                        fill={rotorColor}
                        opacity={0.4}
                        listening={false}
                      />
                    )}
                    <Circle radius={grabR} fill="transparent" />
                    <Circle
                      radius={selected ? 13 : 11}
                      fill="#fff"
                      stroke={zoneColor(h.zone)}
                      strokeWidth={2.6}
                      listening={false}
                    />
                    <Circle radius={4} fill={rotorColor} listening={false} />
                    {showLabels && label && (
                      <Text
                        x={12}
                        y={-10}
                        text={label}
                        fontSize={11}
                        fontFamily="IBM Plex Sans, sans-serif"
                        fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
                        listening={false}
                      />
                    )}
                    {editHandles === h.id && (
                      <HeadHandles
                        head={h}
                        rPx={rPx}
                        px={px}
                        adjustable={item ? item.arcMin !== item.arcMax && h.arc < 359 : true}
                      />
                    )}
                  </Group>
                );
              })}
          {cadEditId && !catalogOpen && (
            <>
              <CadHandles
                faceId={cadEditId}
                sx={sx}
                sy={sy}
                px={px}
                panX={panX}
                panY={panY}
                editDrag={editDrag}
                skipClick={skipClick}
                gestureBlocked={pinchGestureActive}
                onPreviewPath={(points) =>
                  setLiveCadPath(points ? { faceId: cadEditId, points } : null)
                }
              />
              {drawingOrMigrate(project).faces[cadEditId]?.circle && (
                <CircleMeasure
                  cx={drawingOrMigrate(project).faces[cadEditId]!.circle!.cx}
                  cy={drawingOrMigrate(project).faces[cadEditId]!.circle!.cy}
                  r={drawingOrMigrate(project).faces[cadEditId]!.circle!.r}
                  hx={
                    drawingOrMigrate(project).faces[cadEditId]!.circle!.cx +
                    drawingOrMigrate(project).faces[cadEditId]!.circle!.r
                  }
                  hy={drawingOrMigrate(project).faces[cadEditId]!.circle!.cy}
                  sx={sx}
                  sy={sy}
                  px={px}
                  unit={measureUnit}
                />
              )}
            </>
          )}
          {draft.points.length >= 1 &&
            drawSub !== "ellipse" &&
            drawSub !== "circle" &&
            drawSub !== "triangle" &&
            drawSub !== "hexagon" &&
            drawSub !== "polygon" &&
            drawSub !== "line" && (
              <Line
                points={draft.points.flatMap((pt) => [sx(pt.x), sy(pt.y)])}
                stroke={appearance.accent}
                strokeWidth={2.5}
                dash={drawSub === "freehand" || drawSub === "spline" ? undefined : [6, 4]}
                tension={drawSub === "freehand" ? 0.35 : drawSub === "spline" ? 0.45 : 0}
                lineCap={drawSub === "freehand" || drawSub === "spline" ? "round" : "butt"}
                lineJoin={drawSub === "freehand" || drawSub === "spline" ? "round" : "miter"}
                listening={false}
              />
            )}
          {drawSub === "spline" && draft.points.length >= 2 && (
            <PathTotalMeasure
              points={catmullRom(draft.points, 8, false)}
              sx={sx}
              sy={sy}
              unit={measureUnit}
            />
          )}
          {drawSub === "polygon" && draft.points.length >= 1 && polygonPreviewPt && (
            <>
              <Line
                points={[
                  sx(draft.points[0]!.x),
                  sy(draft.points[0]!.y),
                  sx(polygonPreviewPt.x),
                  sy(polygonPreviewPt.y),
                ]}
                stroke="#d56a2b"
                strokeWidth={1.5}
                dash={[5, 5]}
                opacity={0.8}
                listening={false}
              />
              {polygonBoundaryPoints.length >= 2 && (
                <Line
                  points={polygonBoundaryPoints.flatMap((point) => [sx(point.x), sy(point.y)])}
                  stroke={appearance.accent}
                  strokeWidth={2.5}
                  listening={false}
                />
              )}
              {polygonFillPoints.length >= 3 && (
                <Line
                  points={polygonFillPoints.flatMap((point) => [sx(point.x), sy(point.y)])}
                  closed
                  strokeEnabled={false}
                  fill="rgba(75,163,214,0.16)"
                  listening={false}
                />
              )}
              {polygonBoundaryPoints.length >= 1 && (
              <Line
                points={[
                  sx(polygonBoundaryPoints[polygonBoundaryPoints.length - 1]!.x),
                  sy(polygonBoundaryPoints[polygonBoundaryPoints.length - 1]!.y),
                  sx(polygonPreviewPt.x),
                  sy(polygonPreviewPt.y),
                ]}
                stroke={appearance.accent}
                strokeWidth={2.5}
                listening={false}
              />
              )}
              <PathTotalMeasure
                points={polygonFillPoints}
                sx={sx}
                sy={sy}
                unit={measureUnit}
              />
            </>
          )}
          {drawSub !== "line" &&
            drawSub !== "triangle" &&
            drawSub !== "hexagon" &&
            drawSub !== "freehand" &&
            draft.points.map((pt, i) =>
              drawSub === "polygon" ? (
                <Group
                  key={`d${i}`}
                  x={sx(pt.x)}
                  y={sy(pt.y)}
                  onMouseDown={(e) => {
                    e.cancelBubble = true;
                  }}
                  onPointerDown={(e) => {
                    beginPolygonDraftPointDrag(i, e);
                  }}
                  onTouchStart={(e) => {
                    beginPolygonDraftPointDrag(i, e);
                  }}
                >
                  <Circle radius={20} fill="rgba(255,255,255,0.001)" />
                  <Circle
                    radius={activeConstructionPoint === i ? 11 : i === 0 ? 9 : 7}
                    fill={activeConstructionPoint === i ? "#f5222d" : i === 0 ? appearance.accent : "#d56a2b"}
                    stroke={appearance.handleOutline}
                    strokeWidth={1.5}
                    listening={false}
                  />
                  <Text
                    x={-9}
                    y={-6}
                    width={18}
                    align="center"
                    text={String(i)}
                    fontSize={10}
                    fontStyle="bold"
                    fontFamily="IBM Plex Sans, sans-serif"
                    fill="#fff"
                    listening={false}
                  />
                </Group>
              ) : drawSub === "spline" ? (
                <Group
                  key={`d${i}`}
                  x={sx(pt.x)}
                  y={sy(pt.y)}
                  onMouseDown={(e) => {
                    e.cancelBubble = true;
                  }}
                  onPointerDown={(e) => beginSplineDraftPointDrag(i, e)}
                  onTouchStart={(e) => beginSplineDraftPointDrag(i, e)}
                >
                  <Circle radius={20} fill="rgba(255,255,255,0.001)" />
                  <Circle
                    radius={activeConstructionPoint === i ? 11 : i === 0 ? 9 : 7}
                    fill={
                      activeConstructionPoint === i
                        ? "#f5222d"
                        : i === 0
                          ? appearance.accent
                          : "#d56a2b"
                    }
                    stroke={appearance.handleOutline}
                    strokeWidth={2}
                    listening={false}
                  />
                </Group>
              ) : (
                <Circle
                  key={`d${i}`}
                  x={sx(pt.x)}
                  y={sy(pt.y)}
                  radius={i === 0 ? 9 : 6}
                  fill={i === 0 ? "#2b6f9a" : "#fff"}
                  stroke={appearance.accent}
                  strokeWidth={2}
                  listening={false}
                />
              ),
            )}
          {drawSub === "line" &&
            draft.points.length > 0 &&
            selectedDraftSegment == null &&
            !selectedEdgeId &&
            !pinching &&
            (() => {
              const endpoint = draft.points[draft.points.length - 1]!;
              const x = sx(endpoint.x);
              const y = sy(endpoint.y);
              return (
                <Group listening={false}>
                  <Line
                    points={[x - 9, y, x + 9, y]}
                    stroke={appearance.accent}
                    strokeWidth={2}
                    lineCap="round"
                  />
                  <Line
                    points={[x, y - 9, x, y + 9]}
                    stroke={appearance.accent}
                    strokeWidth={2}
                    lineCap="round"
                  />
                  <Circle x={x} y={y} radius={3} fill="#fff" stroke={appearance.accent} strokeWidth={1.5} />
                </Group>
              );
            })()}
          {tool === "draw" && drawSub === "line" && selectedDraftSegment != null && (
            <DraftSegmentHandles
              points={draft.points}
              segmentIndex={selectedDraftSegment}
              edgeId={selectedDraftEdgeId}
              sx={sx}
              sy={sy}
              px={px}
              panX={panX}
              panY={panY}
              editDrag={editDrag}
              skipClick={skipClick}
              gestureBlocked={pinchGestureActive}
            />
          )}
          {selectedEdgeId && !catalogOpen && (
            <SelectedEdgeHandles
              edgeId={selectedEdgeId}
              sx={sx}
              sy={sy}
              px={px}
              panX={panX}
              panY={panY}
              editDrag={editDrag}
              skipClick={skipClick}
              gestureBlocked={pinchGestureActive}
            />
          )}
          {tool === "draw" &&
            drawSub === "line" &&
            draft.points.length > 0 &&
            hoverPt &&
            selectedDraftSegment == null &&
            !selectedEdgeId &&
            !pinching && (
              <Group listening={false}>
                <Line
                  points={[sx(hoverPt.x) - 9, sy(hoverPt.y), sx(hoverPt.x) + 9, sy(hoverPt.y)]}
                  stroke={appearance.accent}
                  strokeWidth={2}
                  lineCap="round"
                />
                <Line
                  points={[sx(hoverPt.x), sy(hoverPt.y) - 9, sx(hoverPt.x), sy(hoverPt.y) + 9]}
                  stroke={appearance.accent}
                  strokeWidth={2}
                  lineCap="round"
                />
                <Circle
                  x={sx(hoverPt.x)}
                  y={sy(hoverPt.y)}
                  radius={3}
                  fill="#fff"
                  stroke={appearance.accent}
                  strokeWidth={1.5}
                />
              </Group>
            )}
          {rubberFrom &&
            rubberTo &&
            drawSub !== "line" &&
            (snapHit?.kind === "horiz" || snapHit?.kind === "vert") && (
              <Line
                points={
                  snapHit.kind === "horiz"
                    ? [0, sy(rubberFrom.y), size.w, sy(rubberFrom.y)]
                    : [sx(rubberFrom.x), 0, sx(rubberFrom.x), size.h]
                }
                stroke={appearance.accent}
                strokeWidth={1}
                dash={[4, 6]}
                opacity={0.45}
                listening={false}
              />
            )}
          {rubberFrom && rubberTo && drawSub === "rect" && (
            <>
              <Rect
                x={sx(Math.min(rubberFrom.x, rubberTo.x))}
                y={sy(Math.min(rubberFrom.y, rubberTo.y))}
                width={Math.abs(rubberTo.x - rubberFrom.x) * px}
                height={Math.abs(rubberTo.y - rubberFrom.y) * px}
                stroke={appearance.accent}
                dash={[5, 4]}
                strokeWidth={1.5}
                fill="rgba(43,111,154,0.08)"
                listening={false}
              />
              <RectMeasure
                corners={[
                  { x: Math.min(rubberFrom.x, rubberTo.x), y: Math.min(rubberFrom.y, rubberTo.y) },
                  { x: Math.max(rubberFrom.x, rubberTo.x), y: Math.min(rubberFrom.y, rubberTo.y) },
                  { x: Math.max(rubberFrom.x, rubberTo.x), y: Math.max(rubberFrom.y, rubberTo.y) },
                  { x: Math.min(rubberFrom.x, rubberTo.x), y: Math.max(rubberFrom.y, rubberTo.y) },
                ]}
                sx={sx}
                sy={sy}
                px={px}
                unit={measureUnit}
              />
            </>
          )}
          {rubberFrom && rubberTo && drawSub === "ellipse" && (
            <>
              <Ellipse
                x={sx(rubberFrom.x)}
                y={sy(rubberFrom.y)}
                radiusX={Math.max(0.02, Math.abs(rubberTo.x - rubberFrom.x)) * px}
                radiusY={Math.max(0.02, Math.abs(rubberTo.y - rubberFrom.y)) * px}
                stroke={appearance.accent}
                dash={[5, 4]}
                strokeWidth={1.5}
                listening={false}
              />
              <Text
                x={sx(rubberFrom.x + Math.abs(rubberTo.x - rubberFrom.x)) + 10}
                y={sy(rubberFrom.y) - 8}
                width={88}
                text={`A ${formatLen(Math.abs(rubberTo.x - rubberFrom.x) * 2, measureUnit)}`}
                fontSize={12}
                fontFamily="IBM Plex Sans, sans-serif"
                fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
                listening={false}
              />
              <Text
                x={sx(rubberFrom.x) - 44}
                y={sy(rubberFrom.y - Math.abs(rubberTo.y - rubberFrom.y)) - 20}
                width={88}
                align="center"
                text={`B ${formatLen(Math.abs(rubberTo.y - rubberFrom.y) * 2, measureUnit)}`}
                fontSize={12}
                fontFamily="IBM Plex Sans, sans-serif"
                fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
                listening={false}
              />
              <Text
                x={sx(rubberFrom.x) + 16}
                y={sy(rubberFrom.y) - 8}
                width={88}
                text={formatAreaU(
                  Math.PI *
                    Math.abs(rubberTo.x - rubberFrom.x) *
                    Math.abs(rubberTo.y - rubberFrom.y),
                  useProject.getState().units.area,
                )}
                fontSize={12}
                fontFamily="IBM Plex Sans, sans-serif"
                fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
                listening={false}
              />
            </>
          )}
          {rubberFrom && rubberTo && drawSub === "circle" && (
            <>
              <Circle
                x={sx(rubberFrom.x)}
                y={sy(rubberFrom.y)}
                radius={dist(rubberFrom, rubberTo) * px}
                stroke={appearance.accent}
                dash={[5, 4]}
                strokeWidth={1.5}
                listening={false}
              />
              <CircleMeasure
                cx={rubberFrom.x}
                cy={rubberFrom.y}
                r={dist(rubberFrom, rubberTo)}
                hx={rubberTo.x}
                hy={rubberTo.y}
                sx={sx}
                sy={sy}
                px={px}
                unit={measureUnit}
              />
            </>
          )}
          {rubberFrom && rubberTo && drawSub === "triangle" && (
            <>
              <Line
                points={triangleFromBounds(rubberFrom, rubberTo).flatMap((pt) => [
                  sx(pt.x),
                  sy(pt.y),
                ])}
                closed
                stroke={appearance.accent}
                dash={[5, 4]}
                strokeWidth={1.5}
                fill="rgba(43,111,154,0.08)"
                listening={false}
              />
              <TriangleMeasure
                points={triangleFromBounds(rubberFrom, rubberTo)}
                sx={sx}
                sy={sy}
                px={px}
                unit={measureUnit}
              />
            </>
          )}
          {rubberFrom && rubberTo && drawSub === "hexagon" && (
            <>
              <Line
                points={hexagonFromBounds(rubberFrom, rubberTo).flatMap((pt) => [sx(pt.x), sy(pt.y)])}
                closed
                stroke={appearance.accent}
                dash={[5, 4]}
                strokeWidth={1.5}
                fill="rgba(43,111,154,0.08)"
                listening={false}
              />
              <ClosedPathMeasures
                points={hexagonFromBounds(rubberFrom, rubberTo)}
                sx={sx}
                sy={sy}
                px={px}
                unit={measureUnit}
              />
            </>
          )}
          {tool === "draw" && drawSub === "fillet" && hoverPt && (
            <Line
              points={(() => {
                const dnow = drawingOrMigrate(project);
                const vid = pickVertexAt(dnow, hoverPt, 24 / px);
                if (!vid) return [];
                return filletPreview(dnow, vid, 0.5).flatMap((pt) => [sx(pt.x), sy(pt.y)]);
              })()}
              stroke="#c45c26"
              strokeWidth={2}
              listening={false}
            />
          )}
          {tool === "draw" &&
            drawSub === "offset" &&
            selectedPolyId &&
            hoverPt &&
            draft.points[0] && (
              <Line
                points={offsetPoints(
                  facePoints(drawingOrMigrate(project), selectedPolyId),
                  dist(draft.points[0], hoverPt),
                ).flatMap((pt) => [sx(pt.x), sy(pt.y)])}
                closed
                stroke="#c45c26"
                dash={[6, 4]}
                strokeWidth={1.5}
                listening={false}
              />
            )}
          {rubberFrom &&
            rubberTo &&
            drawSub !== "rect" &&
            drawSub !== "circle" &&
            drawSub !== "ellipse" &&
            drawSub !== "triangle" &&
            drawSub !== "hexagon" &&
            drawSub !== "polygon" &&
            drawSub !== "spline" &&
            drawSub !== "freehand" && (
              <>
                <Line
                  points={[sx(rubberFrom.x), sy(rubberFrom.y), sx(rubberTo.x), sy(rubberTo.y)]}
                  stroke={appearance.accent}
                  strokeWidth={drawSub === "line" ? 2.5 : 1.5}
                  dash={drawSub === "line" ? undefined : [5, 4]}
                  listening={false}
                />
                <Text
                  x={(sx(rubberFrom.x) + sx(rubberTo.x)) / 2}
                  y={(sy(rubberFrom.y) + sy(rubberTo.y)) / 2}
                  offsetX={48}
                  offsetY={drawSub === "line" ? 24 : 20}
                  width={96}
                  align="center"
                  rotation={(() => {
                    if (drawSub !== "line") return 0;
                    let angle =
                      (Math.atan2(
                        sy(rubberTo.y) - sy(rubberFrom.y),
                        sx(rubberTo.x) - sx(rubberFrom.x),
                      ) *
                        180) /
                      Math.PI;
                    if (angle > 90 || angle < -90) angle += 180;
                    return angle;
                  })()}
                  text={formatLen(dist(rubberFrom, rubberTo), measureUnit)}
                  fontSize={13}
                  fontFamily="IBM Plex Sans, sans-serif"
                  fill={appearance.accent}
                  listening={false}
                />
              </>
            )}
          {draft.scaleA && draft.scaleB && (
            <Line
              points={[
                sx(draft.scaleA.x),
                sy(draft.scaleA.y),
                sx(draft.scaleB.x),
                sy(draft.scaleB.y),
              ]}
              stroke={appearance.accent}
              strokeWidth={2}
              listening={false}
            />
          )}
          {draft.scaleA && (
            <Circle
              x={sx(draft.scaleA.x)}
              y={sy(draft.scaleA.y)}
              radius={5}
              fill={appearance.accent}
              listening={false}
            />
          )}
          {draft.scaleB && (
            <Circle
              x={sx(draft.scaleB.x)}
              y={sy(draft.scaleB.y)}
              radius={5}
              fill={appearance.accent}
              listening={false}
            />
          )}
          {draft.measureA && (
            <Circle
              x={sx(draft.measureA.x)}
              y={sy(draft.measureA.y)}
              radius={5}
              fill={appearance.accent}
              listening={false}
            />
          )}
          {box.current && boxNow && (
            <Rect
              x={sx(Math.min(box.current.x, boxNow.x))}
              y={sy(Math.min(box.current.y, boxNow.y))}
              width={Math.abs(boxNow.x - box.current.x) * px}
              height={Math.abs(boxNow.y - box.current.y) * px}
              stroke={appearance.accent}
              dash={[4, 3]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
      {editingLineEdgeId && lineDeletePosition && (
        <div
          className="absolute z-40 -translate-x-1/2 -translate-y-1/2 rounded-md bg-surface p-1 shadow-border"
          style={{
            left: lineDeletePosition.x,
            top: lineDeletePosition.y,
            pointerEvents: "auto",
            touchAction: "manipulation",
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <button
            type="button"
            aria-label="Удалить отрезок"
            className="flex size-9 items-center justify-center rounded-sm text-danger hover:bg-danger/10"
            onPointerUp={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const st = useProject.getState();
              const current = drawingOrMigrate(st.project);
              st.commitDrawing(deleteLooseEdge(current, editingLineEdgeId), undefined, true);
              st.selectEdge(null);
              st.cancelDraft();
              setSelectedDraftSegment(null);
              setSelectedDraftEdgeId(null);
              lineEditingRef.current = false;
              lineTapGuardUntil.current = Date.now() + 280;
            }}
          >
            <Trash2 className="size-5" />
          </button>
        </div>
      )}
      {deleteMenu && (
        <div
          className="absolute z-40 flex -translate-x-1/2 -translate-y-[120%] items-center gap-1"
          style={{
            left: deleteMenu.x,
            top: deleteMenu.y,
            pointerEvents: "auto",
            touchAction: "manipulation",
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <button
            type="button"
            aria-label="Ручки"
            className="flex size-11 items-center justify-center rounded-md bg-surface text-tool shadow-border"
            onPointerUp={(e) => {
              e.stopPropagation();
              e.preventDefault();
              useProject.getState().selectHead(deleteMenu.id);
              setEditHandles(deleteMenu.id);
              setDeleteMenu(null);
            }}
          >
            <SlidersHorizontal className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Дублировать дождеватель"
            className="flex size-11 items-center justify-center rounded-md bg-surface text-tool shadow-border"
            onPointerUp={(e) => {
              e.stopPropagation();
              e.preventDefault();
              useProject.getState().selectHead(deleteMenu.id);
              useProject.getState().duplicateSelected();
              setDeleteMenu(null);
              setEditHandles(null);
            }}
          >
            <Copy className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Удалить дождеватель"
            className="flex size-11 items-center justify-center rounded-md bg-surface text-danger shadow-border"
            onPointerUp={(e) => {
              e.stopPropagation();
              e.preventDefault();
              useProject.getState().removeHead(deleteMenu.id);
              setDeleteMenu(null);
              setEditHandles(null);
            }}
          >
            <Trash2 className="size-5" />
          </button>
        </div>
      )}
      {pickList && (
        <div
          className="absolute z-30 min-w-36 rounded-md bg-surface p-1 text-ink shadow-border"
          style={{ left: pickList.x, top: pickList.y }}
        >
          {pickList.items.map((it) => (
            <button
              key={`${it.kind}${it.id}`}
              type="button"
              className="block w-full rounded-sm px-2 py-1 text-left text-xs hover:bg-panel"
              onClick={(e) => {
                e.stopPropagation();
                if (it.kind === "face") useProject.getState().selectPoly(it.id);
                else if (it.kind === "edge") useProject.getState().selectEdge(it.id);
                else useProject.getState().selectHead(it.id);
                setPickList(null);
              }}
            >
              {it.kind === "face" ? "область" : it.kind === "edge" ? "ребро" : "дождеватель"}{" "}
              {it.id.slice(-4)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ScaleBar({
  px,
  unit,
}: {
  px: number;
  unit: ReturnType<typeof useProject.getState>["measureUnit"];
}) {
  const meters = niceScale(px);
  const width = Math.max(24, meters * px);
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 flex items-end gap-2 text-[10px] text-ink-soft">
      <div className="flex flex-col items-center">
        <div className="h-1.5 border-x border-b border-ink" style={{ width }} />
        <span className="mt-0.5 tabular">{formatLen(meters, unit)}</span>
      </div>
    </div>
  );
}

function niceScale(pxPerMeter: number) {
  const target = 80 / Math.max(1, pxPerMeter);
  const exp = 10 ** Math.floor(Math.log10(Math.max(1e-6, target)));
  const n = target / exp;
  const m = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
  return m * exp;
}

const HANDLE_SNAP: { head: Head | null } = { head: null };

function HeadHandles({
  head,
  rPx,
  px,
  adjustable,
}: {
  head: Head;
  rPx: number;
  px: number;
  adjustable: boolean;
}) {
  const appearance = canvasTheme(useProject((s) => s.themeId));
  const midA = head.start + head.arc / 2;
  const endA = head.start + head.arc;
  const rad = (d: number) => (d * Math.PI) / 180;
  const at = (deg: number, r: number) => ({ x: r * Math.cos(rad(deg)), y: r * Math.sin(rad(deg)) });
  const radiusPos = at(midA, rPx);
  const rotPos = at(midA, Math.max(28, rPx * 0.42));
  const startPos = at(head.start, rPx);
  const endPos = at(endA, rPx);
  const full = head.arc >= 359;

  const begin = () => {
    HANDLE_SNAP.head = { ...head };
  };
  const commit = (patch: Partial<Head>) => {
    const orig = HANDLE_SNAP.head;
    const st = useProject.getState();
    if (orig) st.patchHeadLive(head.id, { r: orig.r, start: orig.start, arc: orig.arc });
    st.updateHead(head.id, patch);
    HANDLE_SNAP.head = null;
  };

  return (
    <>
      <Line
        points={[0, 0, radiusPos.x, radiusPos.y]}
        stroke={appearance.accent}
        strokeWidth={1}
        dash={[4, 3]}
        listening={false}
      />
      <HandleDot
        x={radiusPos.x}
        y={radiusPos.y}
        color="#2b6f9a"
        onStart={begin}
        onMove={(lx, ly, node) => {
          const r = Math.max(0.05, Math.hypot(lx, ly) / px);
          useProject.getState().patchHeadLive(head.id, { r });
          node.position(at(midA, r * px));
        }}
        onEnd={(lx, ly) => commit({ r: Math.max(0.05, Math.hypot(lx, ly) / px) })}
      />
      <HandleDot
        x={rotPos.x}
        y={rotPos.y}
        color="#c47a22"
        onStart={begin}
        onMove={(lx, ly, node) => {
          const ang = (Math.atan2(ly, lx) * 180) / Math.PI;
          useProject.getState().patchHeadLive(head.id, { start: ang - head.arc / 2 });
          node.position(at(ang, Math.max(28, rPx * 0.42)));
        }}
        onEnd={(lx, ly) => {
          const ang = (Math.atan2(ly, lx) * 180) / Math.PI;
          commit({ start: ang - head.arc / 2 });
        }}
      />
      {adjustable && !full && (
        <>
          <HandleDot
            x={startPos.x}
            y={startPos.y}
            color="#2f6b45"
            onStart={begin}
            onMove={(lx, ly, node) => {
              const ang = (Math.atan2(ly, lx) * 180) / Math.PI;
              let arc = endA - ang;
              while (arc <= 0) arc += 360;
              while (arc > 360) arc -= 360;
              useProject.getState().patchHeadLive(head.id, { start: ang, arc });
              node.position(at(ang, rPx));
            }}
            onEnd={(lx, ly) => {
              const ang = (Math.atan2(ly, lx) * 180) / Math.PI;
              let arc = endA - ang;
              while (arc <= 0) arc += 360;
              while (arc > 360) arc -= 360;
              commit({ start: ang, arc });
            }}
          />
          <HandleDot
            x={endPos.x}
            y={endPos.y}
            color="#6b4f7a"
            onStart={begin}
            onMove={(lx, ly, node) => {
              const ang = (Math.atan2(ly, lx) * 180) / Math.PI;
              let arc = ang - head.start;
              while (arc <= 0) arc += 360;
              while (arc > 360) arc -= 360;
              useProject.getState().patchHeadLive(head.id, { arc });
              node.position(at(ang, rPx));
            }}
            onEnd={(lx, ly) => {
              const ang = (Math.atan2(ly, lx) * 180) / Math.PI;
              let arc = ang - head.start;
              while (arc <= 0) arc += 360;
              while (arc > 360) arc -= 360;
              commit({ arc });
            }}
          />
        </>
      )}
    </>
  );
}

function HandleDot({
  x,
  y,
  color,
  onStart,
  onMove,
  onEnd,
}: {
  x: number;
  y: number;
  color: string;
  onStart: () => void;
  onMove: (lx: number, ly: number, node: Konva.Node) => void;
  onEnd: (lx: number, ly: number) => void;
}) {
  const appearance = canvasTheme(useProject((s) => s.themeId));
  return (
    <Group
      x={x}
      y={y}
      draggable
      onMouseDown={(e) => {
        e.cancelBubble = true;
      }}
      onTouchStart={(e) => {
        e.cancelBubble = true;
      }}
      onDragStart={(e) => {
        e.cancelBubble = true;
        onStart();
      }}
      onDragMove={(e) => {
        e.cancelBubble = true;
        onMove(e.target.x(), e.target.y(), e.target);
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true;
        onEnd(e.target.x(), e.target.y());
      }}
    >
      <Circle radius={22} fill="rgba(255,255,255,0.001)" />
      <Circle radius={8} fill={color} stroke={appearance.handleOutline} strokeWidth={2} listening={false} />
    </Group>
  );
}

function CircleMeasure({
  cx,
  cy,
  r,
  sx,
  sy,
  px,
  unit,
}: {
  cx: number;
  cy: number;
  r: number;
  hx?: number;
  hy?: number;
  sx: (n: number) => number;
  sy: (n: number) => number;
  px: number;
  unit: ReturnType<typeof useProject.getState>["measureUnit"];
}) {
  const appearance = canvasTheme(useProject((s) => s.themeId));
  if (r < 0.02) return null;
  const rAng = -Math.PI / 6;
  const rc = Math.cos(rAng);
  const rs = Math.sin(rAng);
  const gap = Math.max(0.48, 36 / px);
  const areaU = useProject.getState().units.area;
  return (
    <>
      <Text
        id="circ-dtext"
        x={sx(cx) - 48}
        y={sy(cy - r * 0.42) - 8}
        width={96}
        align="center"
        text={`Ø ${formatLen(r * 2, unit)}`}
        fontSize={13}
        fontFamily="IBM Plex Sans, sans-serif"
        fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
        listening={false}
      />
      <Text
        id="circ-rtext"
        x={sx(cx + (r + gap) * rc) - 36}
        y={sy(cy + (r + gap) * rs) - 8}
        width={72}
        align="center"
        text={`R ${formatLen(r, unit)}`}
        fontSize={13}
        fontFamily="IBM Plex Sans, sans-serif"
        fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
        listening={false}
      />
      <Text
        id="circ-stext"
        x={sx(cx) - 52}
        y={sy(cy) - 8}
        width={104}
        align="center"
        text={formatAreaU(Math.PI * r * r, areaU)}
        fontSize={13}
        fontFamily="IBM Plex Sans, sans-serif"
        fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
        listening={false}
      />
    </>
  );
}

function readableLineAngle(a: Pt, b: Pt) {
  let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return deg;
}

function SegmentLengthText({
  a,
  b,
  sx,
  sy,
  px,
  unit,
  offsetFromLine = true,
  prefix,
}: {
  a: Pt;
  b: Pt;
  sx: (n: number) => number;
  sy: (n: number) => number;
  px: number;
  unit: ReturnType<typeof useProject.getState>["measureUnit"];
  offsetFromLine?: boolean;
  prefix?: string;
}) {
  const appearance = canvasTheme(useProject((s) => s.themeId));
  const length = dist(a, b);
  if (length < 0.002) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const n = Math.hypot(dx, dy) || 1;
  let nx = -dy / n;
  let ny = dx / n;
  if (ny > 0 || (Math.abs(ny) < 1e-7 && nx < 0)) {
    nx *= -1;
    ny *= -1;
  }
  const offset = offsetFromLine ? Math.max(0.22, 14 / px) : 0;
  const x = (a.x + b.x) / 2 + nx * offset;
  const y = (a.y + b.y) / 2 + ny * offset;
  const width = prefix ? 88 : 78;
  return (
    <Group x={sx(x)} y={sy(y)} rotation={readableLineAngle(a, b)} listening={false}>
      <Text
        x={-width / 2}
        y={-7}
        width={width}
        align="center"
        text={`${prefix ? `${prefix} ` : ""}${formatLen(length, unit)}`}
        fontSize={12}
        fontFamily="IBM Plex Sans, sans-serif"
        fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
      />
    </Group>
  );
}

function EdgeLengthLabels({
  drawing,
  sx,
  sy,
  px,
  unit,
  hiddenEdgeIds,
  onlyEdgeIds,
}: {
  drawing: CadDrawing;
  sx: (n: number) => number;
  sy: (n: number) => number;
  px: number;
  unit: ReturnType<typeof useProject.getState>["measureUnit"];
  hiddenEdgeIds: string[];
  onlyEdgeIds?: string[];
}) {
  const hidden = new Set(hiddenEdgeIds);
  const only = onlyEdgeIds ? new Set(onlyEdgeIds) : null;
  const faceVisible = (id: string) => {
    const face = drawing.faces[id];
    return Boolean(
      face && !face.hidden && drawing.layers?.[layerForType(face.type)]?.visible !== false,
    );
  };
  const edges = Object.values(drawing.edges).filter((edge) => {
    if ((only && !only.has(edge.id)) || hidden.has(edge.id) || Math.abs(edge.bulge) > 1e-6)
      return false;
    if (!drawing.vertices[edge.a] || !drawing.vertices[edge.b]) return false;
    const faceIds = [edge.faceL, edge.faceR].filter((id): id is string => Boolean(id));
    if (faceIds.some((id) => Boolean(drawing.faces[id]?.ellipse))) return false;
    return !faceIds.length || faceIds.some(faceVisible);
  });
  const byId = new Map(edges.map((edge) => [edge.id, edge]));
  const atVertex = new Map<string, string[]>();
  for (const edge of edges) {
    atVertex.set(edge.a, [...(atVertex.get(edge.a) ?? []), edge.id]);
    atVertex.set(edge.b, [...(atVertex.get(edge.b) ?? []), edge.id]);
  }
  const otherVertex = (edgeId: string, vertexId: string) => {
    const edge = byId.get(edgeId);
    if (!edge) return null;
    return edge.a === vertexId ? edge.b : edge.b === vertexId ? edge.a : null;
  };
  const straightThrough = (firstId: string, secondId: string, vertexId: string) => {
    const firstOther = otherVertex(firstId, vertexId);
    const secondOther = otherVertex(secondId, vertexId);
    const center = drawing.vertices[vertexId];
    const a = firstOther ? drawing.vertices[firstOther] : null;
    const b = secondOther ? drawing.vertices[secondOther] : null;
    if (!center || !a || !b) return false;
    const ax = a.x - center.x;
    const ay = a.y - center.y;
    const bx = b.x - center.x;
    const by = b.y - center.y;
    const an = Math.hypot(ax, ay);
    const bn = Math.hypot(bx, by);
    if (an < 1e-9 || bn < 1e-9) return false;
    const cross = Math.abs(ax * by - ay * bx) / (an * bn);
    const dot = (ax * bx + ay * by) / (an * bn);
    return cross < 1e-4 && dot < -0.9999;
  };
  const unvisited = new Set(edges.map((edge) => edge.id));
  const runs: { edgeIds: string[]; startId: string; endId: string }[] = [];
  while (unvisited.size) {
    const firstId = unvisited.values().next().value as string;
    const first = byId.get(firstId);
    if (!first) {
      unvisited.delete(firstId);
      continue;
    }
    unvisited.delete(firstId);
    const run = { edgeIds: [firstId], startId: first.a, endId: first.b };
    const extend = (fromStart: boolean) => {
      let vertexId = fromStart ? run.startId : run.endId;
      let currentEdgeId = firstId;
      while (true) {
        const incident = atVertex.get(vertexId) ?? [];
        if (incident.length !== 2) break;
        const nextId = incident.find((id) => id !== currentEdgeId && unvisited.has(id));
        if (!nextId || !straightThrough(currentEdgeId, nextId, vertexId)) break;
        const nextVertex = otherVertex(nextId, vertexId);
        if (!nextVertex) break;
        unvisited.delete(nextId);
        if (fromStart) {
          run.edgeIds.unshift(nextId);
          run.startId = nextVertex;
        } else {
          run.edgeIds.push(nextId);
          run.endId = nextVertex;
        }
        currentEdgeId = nextId;
        vertexId = nextVertex;
      }
    };
    extend(false);
    extend(true);
    runs.push(run);
  }
  return (
    <Group listening={false}>
      {runs.map((run) => {
        const a = drawing.vertices[run.startId];
        const b = drawing.vertices[run.endId];
        if (!a || !b) return null;
        let labelA: Pt = a;
        let labelB: Pt = b;
        const visibleFaceId = run.edgeIds
          .flatMap((id) => {
            const edge = byId.get(id);
            return edge ? [edge.faceL, edge.faceR] : [];
          })
          .find((id): id is string => Boolean(id && faceVisible(id)));
        if (visibleFaceId) {
          const center = faceCentroid(drawing, visibleFaceId);
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const n = Math.hypot(dx, dy) || 1;
          let nx = -dy / n;
          let ny = dx / n;
          if ((mid.x - center.x) * nx + (mid.y - center.y) * ny < 0) {
            nx *= -1;
            ny *= -1;
          }
          const shift = Math.max(0.22, 14 / px);
          labelA = { x: a.x + nx * shift, y: a.y + ny * shift };
          labelB = { x: b.x + nx * shift, y: b.y + ny * shift };
        }
        return (
          <SegmentLengthText
            key={run.edgeIds.join("-")}
            a={labelA}
            b={labelB}
            sx={sx}
            sy={sy}
            px={px}
            unit={unit}
            offsetFromLine={!visibleFaceId}
          />
        );
      })}
    </Group>
  );
}

function ellipseTangentAngle(rx: number, ry: number, param: number, rotDeg = 0) {
  const rot = (rotDeg * Math.PI) / 180;
  const dx = -rx * Math.sin(param);
  const dy = ry * Math.cos(param);
  return readableLineAngle(
    { x: 0, y: 0 },
    { x: dx * Math.cos(rot) - dy * Math.sin(rot), y: dx * Math.sin(rot) + dy * Math.cos(rot) },
  );
}

function RectMeasure({
  corners,
  sx,
  sy,
  px,
  unit,
}: {
  corners: Pt[];
  sx: (n: number) => number;
  sy: (n: number) => number;
  px: number;
  unit: ReturnType<typeof useProject.getState>["measureUnit"];
}) {
  const appearance = canvasTheme(useProject((s) => s.themeId));
  if (corners.length < 4) return null;
  const a = corners[0]!;
  const b = corners[1]!;
  const c = corners[2]!;
  const w = dist(a, b);
  const len = dist(b, c);
  if (w < 0.02 || len < 0.02) return null;
  const locale = useProject.getState().locale;
  const areaU = useProject.getState().units.area;
  const wLab = tr(locale, "drawW");
  const hLab = tr(locale, "drawH");
  const cx = (a.x + c.x) / 2;
  const cy = (a.y + c.y) / 2;
  const off = Math.max(0.18, 16 / px);
  const outward = (p: Pt, q: Pt) => {
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    let ox = mx - cx;
    let oy = my - cy;
    const n = Math.hypot(ox, oy) || 1;
    ox /= n;
    oy /= n;
    return { x: mx + ox * off, y: my + oy * off };
  };
  const top = outward(a, b);
  const side = outward(b, c);
  const wAngle = readableLineAngle(a, b);
  const hAngle = readableLineAngle(b, c);
  return (
    <>
      <Text
        id="rect-wtext"
        x={sx(top.x)}
        y={sy(top.y)}
        offsetX={44}
        offsetY={8}
        width={88}
        align="center"
        rotation={wAngle}
        text={`${wLab} ${formatLen(w, unit)}`}
        fontSize={12}
        fontFamily="IBM Plex Sans, sans-serif"
        fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
        listening={false}
      />
      <Text
        id="rect-ltext"
        x={sx(side.x)}
        y={sy(side.y)}
        offsetX={44}
        offsetY={8}
        width={88}
        align="center"
        rotation={hAngle}
        text={`${hLab} ${formatLen(len, unit)}`}
        fontSize={12}
        fontFamily="IBM Plex Sans, sans-serif"
        fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
        listening={false}
      />
      <Text
        id="rect-atext"
        x={sx(cx) - 40}
        y={sy(cy) - 8}
        width={80}
        align="center"
        text={formatAreaU(w * len, areaU)}
        fontSize={12}
        fontFamily="IBM Plex Sans, sans-serif"
        fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
        listening={false}
      />
    </>
  );
}

function triangleLabelLayout(points: Pt[], px: number) {
  const metrics = triangleMetrics(points);
  if (!metrics) return null;
  const off = Math.max(0.18, 16 / px);
  const baseDx = metrics.baseMid.x - metrics.center.x;
  const baseDy = metrics.baseMid.y - metrics.center.y;
  const baseN = Math.hypot(baseDx, baseDy) || 1;
  const baseLabel = {
    x: metrics.baseMid.x + (baseDx / baseN) * off,
    y: metrics.baseMid.y + (baseDy / baseN) * off,
  };
  const sideLabel = (a: Pt, b: Pt) => {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = mid.x - metrics.center.x;
    const dy = mid.y - metrics.center.y;
    const n = Math.hypot(dx, dy) || 1;
    return { x: mid.x + (dx / n) * off, y: mid.y + (dy / n) * off };
  };
  return {
    metrics,
    baseLabel,
    leftLabel: sideLabel(metrics.apex, metrics.baseA),
    rightLabel: sideLabel(metrics.apex, metrics.baseB),
    baseAngle: readableLineAngle(metrics.baseA, metrics.baseB),
    leftAngle: readableLineAngle(metrics.apex, metrics.baseA),
    rightAngle: readableLineAngle(metrics.apex, metrics.baseB),
    areaLabel: metrics.center,
  };
}

function triangleRotationPoint(points: Pt[], px: number): Pt | null {
  const metrics = triangleMetrics(points);
  if (!metrics) return null;
  const dx = metrics.apex.x - metrics.center.x;
  const dy = metrics.apex.y - metrics.center.y;
  const n = Math.hypot(dx, dy) || 1;
  const gap = Math.max(0.7, 34 / px);
  return { x: metrics.apex.x + (dx / n) * gap, y: metrics.apex.y + (dy / n) * gap };
}

function triangleScalePoint(points: Pt[]): Pt | null {
  const metrics = triangleMetrics(points);
  if (!metrics) return null;
  return {
    x: (metrics.apex.x + metrics.baseB.x) / 2,
    y: (metrics.apex.y + metrics.baseB.y) / 2,
  };
}

function TriangleMeasure({
  points,
  sx,
  sy,
  px,
  unit,
}: {
  points: Pt[];
  sx: (n: number) => number;
  sy: (n: number) => number;
  px: number;
  unit: ReturnType<typeof useProject.getState>["measureUnit"];
}) {
  const appearance = canvasTheme(useProject((s) => s.themeId));
  const layout = triangleLabelLayout(points, px);
  if (!layout || layout.metrics.width < 0.02 || layout.metrics.height < 0.02) return null;
  const areaU = useProject.getState().units.area;
  return (
    <>
      <Text
        id="tri-wtext"
        x={sx(layout.baseLabel.x)}
        y={sy(layout.baseLabel.y)}
        offsetX={44}
        offsetY={8}
        width={88}
        align="center"
        rotation={layout.baseAngle}
        text={`A ${formatLen(layout.metrics.width, unit)}`}
        fontSize={12}
        fontFamily="IBM Plex Sans, sans-serif"
        fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
        listening={false}
      />
      <Text
        id="tri-lefttext"
        x={sx(layout.leftLabel.x)}
        y={sy(layout.leftLabel.y)}
        offsetX={42}
        offsetY={8}
        width={84}
        align="center"
        rotation={layout.leftAngle}
        text={`B ${formatLen(layout.metrics.leftSide, unit)}`}
        fontSize={12}
        fontFamily="IBM Plex Sans, sans-serif"
        fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
        listening={false}
      />
      <Text
        id="tri-righttext"
        x={sx(layout.rightLabel.x)}
        y={sy(layout.rightLabel.y)}
        offsetX={42}
        offsetY={8}
        width={84}
        align="center"
        rotation={layout.rightAngle}
        text={`C ${formatLen(layout.metrics.rightSide, unit)}`}
        fontSize={12}
        fontFamily="IBM Plex Sans, sans-serif"
        fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
        listening={false}
      />
      <Text
        id="tri-stext"
        x={sx(layout.areaLabel.x) - 40}
        y={sy(layout.areaLabel.y) - 8}
        width={80}
        align="center"
        text={formatAreaU(layout.metrics.area, areaU)}
        fontSize={12}
        fontFamily="IBM Plex Sans, sans-serif"
        fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
        listening={false}
      />
    </>
  );
}

const TRANSFORM_HANDLE_COLOR = "#e8892f";

function RotationHandleGlyph() {
  const appearance = canvasTheme(useProject((s) => s.themeId));
  return (
    <Text
      x={-15}
      y={-17}
      width={30}
      height={30}
      align="center"
      text="↻"
      fontSize={29}
      fontFamily="Arial, sans-serif"
      fontStyle="bold"
      fill={TRANSFORM_HANDLE_COLOR}
      stroke={appearance.ink}
      strokeWidth={0.75}
      listening={false}
    />
  );
}

function ScaleHandleGlyph({ angle = 0 }: { angle?: number }) {
  const shaft = [-10, 0, 10, 0];
  const leftArrow = [-10, 0, -5.5, -4, -10, 0, -5.5, 4];
  const rightArrow = [10, 0, 5.5, -4, 10, 0, 5.5, 4];
  return (
    <Group rotation={angle} listening={false}>
      <Line
        points={shaft}
        stroke="#171717"
        strokeWidth={3.5}
        lineCap="round"
        listening={false}
      />
      <Line
        points={leftArrow}
        stroke="#171717"
        strokeWidth={3.5}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
      <Line
        points={rightArrow}
        stroke="#171717"
        strokeWidth={3.5}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
      <Line
        points={shaft}
        stroke={TRANSFORM_HANDLE_COLOR}
        strokeWidth={2.2}
        lineCap="round"
        listening={false}
      />
      <Line
        points={leftArrow}
        stroke={TRANSFORM_HANDLE_COLOR}
        strokeWidth={2.2}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
      <Line
        points={rightArrow}
        stroke={TRANSFORM_HANDLE_COLOR}
        strokeWidth={2.2}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
    </Group>
  );
}

type PathTransformFrame = {
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
};

function pathTransformFrame(points: Pt[]): PathTransformFrame {
  let best = { dx: 1, dy: 0, len: 0 };
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    const next = points[(i + 1) % points.length];
    if (!next) continue;
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-9) {
      best = { dx, dy, len };
      break;
    }
  }
  let ux = best.len > 1e-9 ? best.dx / best.len : 1;
  let uy = best.len > 1e-9 ? best.dy / best.len : 0;
  if (ux < -1e-7 || (Math.abs(ux) <= 1e-7 && uy < 0)) {
    ux *= -1;
    uy *= -1;
  }
  const vx = -uy;
  const vy = ux;
  const us = points.map((point) => point.x * ux + point.y * uy);
  const vs = points.map((point) => point.x * vx + point.y * vy);
  return {
    ux,
    uy,
    vx,
    vy,
    minU: Math.min(...us),
    maxU: Math.max(...us),
    minV: Math.min(...vs),
    maxV: Math.max(...vs),
  };
}

function pathFramePoint(frame: PathTransformFrame, u: number, v: number): Pt {
  return { x: u * frame.ux + v * frame.vx, y: u * frame.uy + v * frame.vy };
}

function pathFrameLocal(frame: PathTransformFrame, point: Pt) {
  return { u: point.x * frame.ux + point.y * frame.uy, v: point.x * frame.vx + point.y * frame.vy };
}

function pathFrameCorners(frame: PathTransformFrame): Pt[] {
  return [
    pathFramePoint(frame, frame.minU, frame.minV),
    pathFramePoint(frame, frame.maxU, frame.minV),
    pathFramePoint(frame, frame.maxU, frame.maxV),
    pathFramePoint(frame, frame.minU, frame.maxV),
  ];
}

function pathFrameMids(frame: PathTransformFrame): Pt[] {
  const midU = (frame.minU + frame.maxU) / 2;
  const midV = (frame.minV + frame.maxV) / 2;
  return [
    pathFramePoint(frame, midU, frame.minV),
    pathFramePoint(frame, frame.maxU, midV),
    pathFramePoint(frame, midU, frame.maxV),
    pathFramePoint(frame, frame.minU, midV),
  ];
}

function resizePathFromFrame(
  points: Pt[],
  frame: PathTransformFrame,
  kind: "corner" | "side",
  index: number,
  pointer: Pt,
  minSize: number,
): Pt[] {
  const ratio = (numerator: number, denominator: number) =>
    numerator / (Math.abs(denominator) > 1e-9 ? denominator : denominator < 0 ? -1e-9 : 1e-9);
  const q = pathFrameLocal(frame, pointer);
  const midU = (frame.minU + frame.maxU) / 2;
  const midV = (frame.minV + frame.maxV) / 2;
  const handleU = [frame.minU, frame.maxU, frame.maxU, frame.minU][index] ?? midU;
  const handleV = [frame.minV, frame.minV, frame.maxV, frame.maxV][index] ?? midV;
  const anchorU = [frame.maxU, frame.minU, frame.minU, frame.maxU][index] ?? midU;
  const anchorV = [frame.maxV, frame.maxV, frame.minV, frame.minV][index] ?? midV;
  let scaleU = 1;
  let scaleV = 1;
  if (kind === "corner" || index === 1 || index === 3) {
    const sideAnchorU = kind === "corner" ? anchorU : index === 1 ? frame.minU : frame.maxU;
    const sideHandleU = kind === "corner" ? handleU : index === 1 ? frame.maxU : frame.minU;
    const raw = ratio(q.u - sideAnchorU, sideHandleU - sideAnchorU);
    scaleU = Math.max(minSize / Math.max(frame.maxU - frame.minU, 1e-9), raw);
  }
  if (kind === "corner" || index === 0 || index === 2) {
    const sideAnchorV = kind === "corner" ? anchorV : index === 0 ? frame.maxV : frame.minV;
    const sideHandleV = kind === "corner" ? handleV : index === 0 ? frame.minV : frame.maxV;
    const raw = ratio(q.v - sideAnchorV, sideHandleV - sideAnchorV);
    scaleV = Math.max(minSize / Math.max(frame.maxV - frame.minV, 1e-9), raw);
  }
  const fixedU =
    kind === "corner" ? anchorU : index === 1 ? frame.minU : index === 3 ? frame.maxU : midU;
  const fixedV =
    kind === "corner" ? anchorV : index === 0 ? frame.maxV : index === 2 ? frame.minV : midV;
  return points.map((point) => {
    const local = pathFrameLocal(frame, point);
    const u =
      kind === "corner" || index === 1 || index === 3
        ? fixedU + (local.u - fixedU) * scaleU
        : local.u;
    const v =
      kind === "corner" || index === 0 || index === 2
        ? fixedV + (local.v - fixedV) * scaleV
        : local.v;
    return pathFramePoint(frame, u, v);
  });
}

function rotatePathAround(points: Pt[], center: Pt, deg: number): Pt[] {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return points.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
  });
}

function OpenPathMeasures({
  points,
  closed = false,
  showLetters = false,
  sx,
  sy,
  px,
  unit,
}: {
  points: Pt[];
  closed?: boolean;
  showLetters?: boolean;
  sx: (n: number) => number;
  sy: (n: number) => number;
  px: number;
  unit: ReturnType<typeof useProject.getState>["measureUnit"];
}) {
  if (points.length < 2) return null;
  const signedArea = points.reduce((sum, point, i) => {
    const next = points[(i + 1) % points.length]!;
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  const shift = Math.max(0.22, 14 / px);
  const direction = signedArea >= 0 ? -1 : 1;
  const segmentCount = closed ? points.length : points.length - 1;
  return (
    <Group listening={false}>
      {Array.from({ length: segmentCount }, (_, i) => {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy) || 1;
        const nx = (-dy / length) * direction;
        const ny = (dx / length) * direction;
        return (
          <SegmentLengthText
            key={`open-measure-${i}`}
            a={{ x: a.x + nx * shift, y: a.y + ny * shift }}
            b={{ x: b.x + nx * shift, y: b.y + ny * shift }}
            sx={sx}
            sy={sy}
            px={px}
            unit={unit}
            offsetFromLine={false}
            prefix={showLetters ? sideMeasureLetter(i) : undefined}
          />
        );
      })}
    </Group>
  );
}

function PathTotalMeasure({
  points,
  sx,
  sy,
  unit,
}: {
  points: Pt[];
  sx: (n: number) => number;
  sy: (n: number) => number;
  unit: ReturnType<typeof useProject.getState>["measureUnit"];
}) {
  const appearance = canvasTheme(useProject((s) => s.themeId));
  if (points.length < 2) return null;
  const lengths = points.slice(1).map((point, index) => dist(points[index]!, point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total < 0.002) return null;
  let remaining = total / 2;
  let center = points[0]!;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]!;
    if (remaining <= length) {
      const a = points[index]!;
      const b = points[index + 1]!;
      const ratio = length > 0 ? remaining / length : 0;
      center = { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
      break;
    }
    remaining -= length;
  }
  return (
    <Text
      x={sx(center.x) - 55}
      y={sy(center.y) - 9}
      width={110}
      align="center"
      text={formatLen(total, unit)}
      fontSize={13}
      fontFamily="IBM Plex Sans, sans-serif"
      fill={appearance.ink}
      stroke={appearance.bg}
      strokeWidth={2}
      fillAfterStrokeEnabled
      listening={false}
    />
  );
}

function ClosedPathMeasures({
  points,
  sx,
  sy,
  px,
  unit,
  showLetters = true,
}: {
  points: Pt[];
  sx: (n: number) => number;
  sy: (n: number) => number;
  px: number;
  unit: ReturnType<typeof useProject.getState>["measureUnit"];
  showLetters?: boolean;
}) {
  if (points.length < 3) return null;
  const starts = closedPathSideStarts(points);
  const signedArea = points.reduce((sum, point, i) => {
    const next = points[(i + 1) % points.length]!;
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  const shift = Math.max(0.22, 14 / px);
  return (
    <Group listening={false}>
      {starts.map((start, i) => {
        const end = starts[(i + 1) % starts.length]!;
        const a = points[start]!;
        const b = points[end]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const n = Math.hypot(dx, dy) || 1;
        const direction = signedArea >= 0 ? -1 : 1;
        const nx = (-dy / n) * direction;
        const ny = (dx / n) * direction;
        return (
          <SegmentLengthText
            key={`${start}-${end}`}
            a={{ x: a.x + nx * shift, y: a.y + ny * shift }}
            b={{ x: b.x + nx * shift, y: b.y + ny * shift }}
            sx={sx}
            sy={sy}
            px={px}
            unit={unit}
            offsetFromLine={false}
            prefix={showLetters ? sideMeasureLetter(i) : undefined}
          />
        );
      })}
    </Group>
  );
}

function sideMeasureLetter(index: number) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number, rotDeg = 0, n = 96): Pt[] {
  const rad = ((rotDeg || 0) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    const lx = rx * Math.cos(a);
    const ly = ry * Math.sin(a);
    pts.push({ x: cx + lx * c - ly * s, y: cy + lx * s + ly * c });
  }
  return pts;
}

function clientXY(ev: {
  clientX?: number;
  clientY?: number;
  touches?: TouchList;
  changedTouches?: TouchList;
}): { clientX: number; clientY: number } {
  if (typeof ev.clientX === "number" && typeof ev.clientY === "number")
    return { clientX: ev.clientX, clientY: ev.clientY };
  const t = ev.touches?.item(0) ?? ev.changedTouches?.item(0);
  return { clientX: t?.clientX ?? 0, clientY: t?.clientY ?? 0 };
}

function worldFromClient(
  ev: { clientX?: number; clientY?: number; touches?: TouchList; changedTouches?: TouchList },
  stage: Konva.Stage | null,
  panX: number,
  panY: number,
  px: number,
): Pt {
  const { clientX, clientY } = clientXY(ev);
  const box = stage?.container().getBoundingClientRect();
  if (!box) return { x: 0, y: 0 };
  return { x: (clientX - box.left - panX) / px, y: (clientY - box.top - panY) / px };
}

function bindPointerDrag(
  e: Konva.KonvaEventObject<PointerEvent | MouseEvent | TouchEvent>,
  editDrag: { current: boolean },
  panX: number,
  panY: number,
  px: number,
  onStart: (p: Pt) => void,
  onMove: (p: Pt) => void,
  onEnd: (p: Pt) => void,
  skipClick?: { current: boolean },
  gestureBlocked?: { current: boolean },
  onCancel?: () => void,
  onTap?: () => void,
  onHold?: () => void,
) {
  if (editDrag.current) return;
  e.cancelBubble = true;
  const native = e.evt as PointerEvent & TouchEvent;
  native.preventDefault?.();
  native.stopPropagation?.();
  const stage = e.target.getStage();
  const startClient = clientXY(native);
  editDrag.current = true;
  onStart(worldFromClient(native, stage, panX, panY, px));
  let holdTimer: number | null = null;
  const clearLongHold = () => {
    if (holdTimer != null) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
  };
  const cleanup = () => {
    clearLongHold();
    window.removeEventListener("pointermove", move as EventListener, true);
    window.removeEventListener("pointerup", end as EventListener, true);
    window.removeEventListener("pointercancel", end as EventListener, true);
    window.removeEventListener("touchmove", move as EventListener, true);
    window.removeEventListener("touchend", end as EventListener, true);
    window.removeEventListener("touchcancel", end as EventListener, true);
  };
  const cancel = () => {
    cleanup();
    editDrag.current = false;
    onCancel?.();
  };
  const move = (ev: PointerEvent | TouchEvent) => {
    if (gestureBlocked?.current || ("touches" in ev && ev.touches.length >= 2)) {
      cancel();
      return;
    }
    ev.preventDefault();
    const currentClient = clientXY(ev);
    if (
      Math.hypot(
        currentClient.clientX - startClient.clientX,
        currentClient.clientY - startClient.clientY,
      ) > 6
    ) {
      clearLongHold();
    }
    onMove(worldFromClient(ev, stage, panX, panY, px));
  };
  const end = (ev: PointerEvent | TouchEvent) => {
    if (gestureBlocked?.current) {
      cancel();
      return;
    }
    cleanup();
    const endClient = clientXY(ev);
    const tapDistance = Math.hypot(
      endClient.clientX - startClient.clientX,
      endClient.clientY - startClient.clientY,
    );
    if (onTap && tapDistance <= 6) {
      editDrag.current = false;
      onTap();
      return;
    }
    if (skipClick) {
      skipClick.current = true;
      window.setTimeout(() => {
        skipClick.current = false;
      }, 500);
    }
    editDrag.current = false;
    onEnd(worldFromClient(ev, stage, panX, panY, px));
  };
  if (onHold) {
    holdTimer = window.setTimeout(() => {
      holdTimer = null;
      if (gestureBlocked?.current || !editDrag.current) return;
      cleanup();
      if (skipClick) {
        skipClick.current = true;
        window.setTimeout(() => {
          skipClick.current = false;
        }, 600);
      }
      editDrag.current = false;
      onHold();
    }, 480);
  }
  window.addEventListener("pointermove", move as EventListener, { capture: true, passive: false });
  window.addEventListener("pointerup", end as EventListener, { capture: true });
  window.addEventListener("pointercancel", end as EventListener, { capture: true });
  window.addEventListener("touchmove", move as EventListener, { capture: true, passive: false });
  window.addEventListener("touchend", end as EventListener, { capture: true });
  window.addEventListener("touchcancel", end as EventListener, { capture: true });
}

function bindClientDeltaDrag(
  e: Konva.KonvaEventObject<PointerEvent | MouseEvent | TouchEvent>,
  editDrag: { current: boolean },
  skipClick: { current: boolean },
  onDelta: (dxPx: number, dyPx: number, commit: boolean) => void,
  gestureBlocked?: { current: boolean },
) {
  if (editDrag.current) return;
  e.cancelBubble = true;
  const native = e.evt as PointerEvent & TouchEvent;
  if (gestureBlocked?.current || (native.touches?.length ?? 0) >= 2) return;
  native.preventDefault?.();
  native.stopPropagation?.();
  const s0 = clientXY(native);
  editDrag.current = true;
  const cleanup = () => {
    window.removeEventListener("pointermove", move as EventListener, true);
    window.removeEventListener("pointerup", end as EventListener, true);
    window.removeEventListener("pointercancel", end as EventListener, true);
    window.removeEventListener("touchmove", move as EventListener, true);
    window.removeEventListener("touchend", end as EventListener, true);
    window.removeEventListener("touchcancel", end as EventListener, true);
  };
  const cancel = () => {
    cleanup();
    editDrag.current = false;
    onDelta(0, 0, false);
  };
  const move = (ev: PointerEvent | TouchEvent) => {
    if (gestureBlocked?.current || ("touches" in ev && ev.touches.length >= 2)) {
      cancel();
      return;
    }
    ev.preventDefault();
    const c = clientXY(ev);
    onDelta(c.clientX - s0.clientX, c.clientY - s0.clientY, false);
  };
  const end = (ev: PointerEvent | TouchEvent) => {
    if (gestureBlocked?.current) {
      cancel();
      return;
    }
    cleanup();
    skipClick.current = true;
    window.setTimeout(() => {
      skipClick.current = false;
    }, 500);
    editDrag.current = false;
    const c = clientXY(ev);
    onDelta(c.clientX - s0.clientX, c.clientY - s0.clientY, true);
  };
  window.addEventListener("pointermove", move as EventListener, { capture: true, passive: false });
  window.addEventListener("pointerup", end as EventListener, { capture: true });
  window.addEventListener("pointercancel", end as EventListener, { capture: true });
  window.addEventListener("touchmove", move as EventListener, { capture: true, passive: false });
  window.addEventListener("touchend", end as EventListener, { capture: true });
  window.addEventListener("touchcancel", end as EventListener, { capture: true });
}

function snapEditableEndpoint(p: Pt): Pt {
  const st = useProject.getState();
  if (!st.snapOn) return p;
  return cadSnap(p, drawingOrMigrate(st.project), {
    pxPerMeter: st.pxPerMeter,
    pointerType: "touch",
    snapOn: st.snapOn,
    snapGridOn: st.snapGridOn,
    orthoOn: false,
    lock: null,
    gridStep: st.gridStep,
    angleFrom: null,
    closeTo: null,
    heads: st.project.heads.map((h) => ({ x: h.x, y: h.y })),
  }).pt;
}

function SegmentEndHandle({
  x,
  y,
  angle,
  onStart,
}: {
  x: number;
  y: number;
  angle: number;
  onStart: (e: Konva.KonvaEventObject<PointerEvent | MouseEvent | TouchEvent>) => void;
}) {
  const appearance = canvasTheme(useProject((s) => s.themeId));
  return (
    <Group x={x} y={y} rotation={angle} onMouseDown={onStart} onTouchStart={onStart}>
      <Circle radius={14} fill="rgba(0,0,0,0.001)" />
      <Line
        points={[-10, 0, 10, 0]}
        stroke="#b94f1f"
        strokeWidth={1.3}
        lineCap="round"
        listening={false}
      />
      <Line
        points={[0, -10, 0, 10]}
        stroke="#b94f1f"
        strokeWidth={1.3}
        lineCap="round"
        listening={false}
      />
      <Rect
        x={-5}
        y={-5}
        width={10}
        height={10}
        fill="#c45c26"
        stroke={appearance.handleOutline}
        strokeWidth={1.5}
        listening={false}
      />
    </Group>
  );
}

function DraftSegmentHandles({
  points,
  segmentIndex,
  edgeId,
  sx,
  sy,
  px,
  panX,
  panY,
  editDrag,
  skipClick,
  gestureBlocked,
}: {
  points: Pt[];
  segmentIndex: number;
  edgeId: string | null;
  sx: (n: number) => number;
  sy: (n: number) => number;
  px: number;
  panX: number;
  panY: number;
  editDrag: { current: boolean };
  skipClick: { current: boolean };
  gestureBlocked: { current: boolean };
}) {
  const appearance = canvasTheme(useProject((s) => s.themeId));
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  if (!a || !b) return null;
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const drag =
    (endpoint: 0 | 1) => (e: Konva.KonvaEventObject<PointerEvent | MouseEvent | TouchEvent>) => {
      const original = points.slice();
      const moving = endpoint === 0 ? a : b;
      const fixed = endpoint === 0 ? b : a;
      bindPointerDrag(
        e,
        editDrag,
        panX,
        panY,
        px,
        () => {},
        (p) => {
          const next = original.slice();
          const q = snapEditableEndpoint(p);
          next[segmentIndex + endpoint] = q;
          useProject.getState().setDraftPoints(next);
        },
        (p) => {
          const next = original.slice();
          const q = snapEditableEndpoint(p);
          next[segmentIndex + endpoint] = q;
          const st = useProject.getState();
          const d0 = drawingOrMigrate(st.project);
          const edge = edgeId ? d0.edges[edgeId] : null;
          const va = edge ? d0.vertices[edge.a] : null;
          const vb = edge ? d0.vertices[edge.b] : null;
          const vertex =
            va && vb
              ? dist(va, moving) <= dist(vb, moving)
                ? va
                : vb
              : Object.values(d0.vertices).find((v) => dist(v, moving) < 1e-7);
          if (vertex) st.commitDrawing(moveVertex(d0, vertex.id, q), undefined, true);
          useProject.setState({
            draft: { ...st.draft, points: next },
            tool: "draw",
            drawSub: "line",
            cadEditId: null,
            selectedEdgeId: null,
          });
        },
        skipClick,
        gestureBlocked,
        () => useProject.getState().setDraftPoints(original),
      );
    };
  return (
    <Group>
      <Line
        points={[sx(a.x), sy(a.y), sx(b.x), sy(b.y)]}
        stroke={appearance.accent}
        strokeWidth={2}
        opacity={0.9}
        listening={false}
      />
      <SegmentLengthText
        a={a}
        b={b}
        sx={sx}
        sy={sy}
        px={px}
        unit={useProject.getState().measureUnit}
      />
      <SegmentEndHandle x={sx(a.x)} y={sy(a.y)} angle={angle} onStart={drag(0)} />
      <SegmentEndHandle x={sx(b.x)} y={sy(b.y)} angle={angle} onStart={drag(1)} />
    </Group>
  );
}

function SelectedEdgeHandles({
  edgeId,
  sx,
  sy,
  px,
  panX,
  panY,
  editDrag,
  skipClick,
  gestureBlocked,
}: {
  edgeId: string;
  sx: (n: number) => number;
  sy: (n: number) => number;
  px: number;
  panX: number;
  panY: number;
  editDrag: { current: boolean };
  skipClick: { current: boolean };
  gestureBlocked: { current: boolean };
}) {
  const appearance = canvasTheme(useProject((s) => s.themeId));
  const project = useProject((s) => s.project);
  const d = drawingOrMigrate(project);
  const edge = d.edges[edgeId];
  const a = edge ? d.vertices[edge.a] : null;
  const b = edge ? d.vertices[edge.b] : null;
  const faceId = edge?.faceL ?? edge?.faceR ?? null;
  const edgeLocked = Boolean(
    edge && [edge.faceL, edge.faceR].some((id) => id && d.faces[id]?.locked),
  );
  const [preview, setPreview] = useState<{ a: Pt; b: Pt } | null>(null);
  useEffect(() => setPreview(null), [edgeId, a?.x, a?.y, b?.x, b?.y]);
  if (!edge || !a || !b || Math.abs(edge.bulge) > 1e-6 || edgeLocked) return null;
  const shownA = preview?.a ?? a;
  const shownB = preview?.b ?? b;
  const angle = (Math.atan2(shownB.y - shownA.y, shownB.x - shownA.x) * 180) / Math.PI;
  const drag =
    (endpoint: 0 | 1, vertexId: string, moving: Pt, fixed: Pt) =>
    (e: Konva.KonvaEventObject<PointerEvent | MouseEvent | TouchEvent>) => {
      bindPointerDrag(
        e,
        editDrag,
        panX,
        panY,
        px,
        () => setPreview({ a, b }),
        (p) => {
          const q = snapEditableEndpoint(p);
          setPreview(endpoint === 0 ? { a: q, b } : { a, b: q });
        },
        (p) => {
          const q = snapEditableEndpoint(p);
          setPreview(null);
          const st = useProject.getState();
          const current = drawingOrMigrate(st.project);
          const currentEdge = current.edges[edgeId];
          if (!currentEdge) return;
          const selectedFace = currentEdge.faceL ?? currentEdge.faceR ?? undefined;
          st.commitDrawing(moveVertex(current, vertexId, q), selectedFace, true);
          st.selectEdge(edgeId);
        },
        skipClick,
        gestureBlocked,
        () => setPreview(null),
      );
    };
  return (
    <Group>
      <Line
        points={[sx(shownA.x), sy(shownA.y), sx(shownB.x), sy(shownB.y)]}
        stroke={appearance.accent}
        strokeWidth={2}
        opacity={0.9}
        listening={false}
      />
      <SegmentLengthText
        a={shownA}
        b={shownB}
        sx={sx}
        sy={sy}
        px={px}
        unit={useProject.getState().measureUnit}
      />
      <SegmentEndHandle
        x={sx(shownA.x)}
        y={sy(shownA.y)}
        angle={angle}
        onStart={drag(0, edge.a, a, b)}
      />
      <SegmentEndHandle
        x={sx(shownB.x)}
        y={sy(shownB.y)}
        angle={angle}
        onStart={drag(1, edge.b, b, a)}
      />
    </Group>
  );
}

function CadHandles({
  faceId,
  sx,
  sy,
  px,
  panX,
  panY,
  editDrag,
  skipClick,
  gestureBlocked,
  onPreviewPath,
}: {
  faceId: string;
  sx: (n: number) => number;
  sy: (n: number) => number;
  px: number;
  panX: number;
  panY: number;
  editDrag: { current: boolean };
  skipClick: { current: boolean };
  gestureBlocked: { current: boolean };
  onPreviewPath: (points: Pt[] | null) => void;
}) {
  const appearance = canvasTheme(useProject((s) => s.themeId));
  const bitsRef = useRef<Konva.Group>(null);
  const rotRef = useRef<Konva.Group>(null);
  const scaleRef = useRef<Konva.Group>(null);
  const bodyRef = useRef<Konva.Line>(null);
  const centerRef = useRef<Konva.Group>(null);
  const rim = useRef<Konva.Group>(null);
  const cornerRefs = useRef<(Konva.Group | null)[]>([null, null, null, null]);
  const midRefs = useRef<(Konva.Group | null)[]>([null, null, null, null]);
  const rot0 = useRef(0);
  const scale0 = useRef({ rx: 1, ry: 1, d: 1, k: 1 });
  const [liveFreeformPath, setLiveFreeformPath] = useState<Pt[] | null>(null);
  const [liveSplineControls, setLiveSplineControls] = useState<Pt[] | null>(null);
  const [activeCurvePoint, setActiveCurvePoint] = useState<number | null>(null);
  useEffect(() => setActiveCurvePoint(null), [faceId]);
  const d = drawingOrMigrate(useProject.getState().project);
  const face = d.faces[faceId];
  if (!face || face.locked) return null;
  const pointShape = Boolean(face.pointShape);
  const c = faceCentroid(d, faceId);
  const toWorld = (node: Konva.Node) => {
    const p = node.getAbsolutePosition();
    return { x: (p.x - panX) / px, y: (p.y - panY) / px };
  };
  const circle = face.circle;
  const verts = faceVertices(d, faceId);
  const triangle = isTriangleFace(d, faceId);
  const inferredEll = triangle ? undefined : face.ellipse;
  // Only shapes created as rectangles carry rectangle metadata.  Inferring a
  // rectangle from every four-point contour makes its handles and dimensions
  // leave the actual segment-built vertices.
  const rect = triangle || !rectMetaMatchesFace(d, faceId) ? undefined : face.rect;
  const corners: Pt[] = rect ? rectWorldCorners(rect) : [];
  const geom = (node: Konva.Node) =>
    node.getStage()?.findOne(`#face-${faceId}`) as Konva.Shape | undefined;
  if (face.nodeEdit && verts.length >= 3) {
    const path = verts.map((vertex) => ({ x: vertex.x, y: vertex.y }));
    const shownPath = liveFreeformPath?.length === path.length ? liveFreeformPath : path;
    const curved = new Set(face.nodeEdit.curvedVertexIds);
    const visibleNodes = new Set<number>();
    const curvedIndices: number[] = [];
    verts.forEach((vertex, index) => {
      if (curved.has(vertex.id)) {
        curvedIndices.push(index);
        return;
      }
      const previous = verts[(index - 1 + verts.length) % verts.length]!;
      const next = verts[(index + 1) % verts.length]!;
      const ax = vertex.x - previous.x;
      const ay = vertex.y - previous.y;
      const bx = next.x - vertex.x;
      const by = next.y - vertex.y;
      const turn = Math.abs(ax * by - ay * bx) / Math.max(1e-9, Math.hypot(ax, ay) * Math.hypot(bx, by));
      if (turn > 0.025 || curved.has(previous.id) || curved.has(next.id)) visibleNodes.add(index);
    });
    const curveStride = Math.max(1, Math.ceil(curvedIndices.length / 14));
    curvedIndices.forEach((index, position) => {
      const previous = verts[(index - 1 + verts.length) % verts.length]!;
      const next = verts[(index + 1) % verts.length]!;
      if (position % curveStride === 0 || !curved.has(previous.id) || !curved.has(next.id)) visibleNodes.add(index);
    });
    if (!visibleNodes.size) {
      const stride = Math.max(1, Math.ceil(verts.length / 16));
      verts.forEach((_, index) => {
        if (index % stride === 0) visibleNodes.add(index);
      });
    }
    const cancelNodeMove = () => {
      setLiveFreeformPath(null);
      onPreviewPath(null);
    };
    const moveNode = (index: number, pointer: Pt, commit: boolean) => {
      const point = snapEditableEndpoint(pointer);
      const nextDrawing = moveNodeEditVertex(d, faceId, verts[index]!.id, point);
      const nextPath = facePoints(nextDrawing, faceId);
      if (!commit) {
        setLiveFreeformPath(nextPath);
        onPreviewPath(nextPath);
        return;
      }
      useProject.getState().commitDrawing(nextDrawing, faceId, true);
      setLiveFreeformPath(null);
      onPreviewPath(null);
    };
    const center = polygonMassCenter(shownPath);
    return (
      <Group>
        <Line
          points={shownPath.flatMap((point) => [sx(point.x), sy(point.y)])}
          closed
          stroke={appearance.accent}
          strokeWidth={2.5}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
        {[...visibleNodes].sort((a, b) => a - b).map((index) => {
          const point = shownPath[index]!;
          const isCurveNode = curved.has(verts[index]!.id);
          return (
            <Group
              key={`merged-contour-node-${verts[index]!.id}`}
              x={sx(point.x)}
              y={sy(point.y)}
              onMouseDown={(event) => {
                event.cancelBubble = true;
              }}
              onPointerDown={(event) => {
                bindPointerDrag(
                  event,
                  editDrag,
                  panX,
                  panY,
                  px,
                  () => setActiveCurvePoint(index),
                  (next) => moveNode(index, next, false),
                  (next) => moveNode(index, next, true),
                  skipClick,
                  gestureBlocked,
                  cancelNodeMove,
                );
              }}
              onTouchStart={(event) => {
                if (event.evt.touches.length >= 2) return;
                bindPointerDrag(
                  event,
                  editDrag,
                  panX,
                  panY,
                  px,
                  () => {},
                  (next) => moveNode(index, next, false),
                  (next) => moveNode(index, next, true),
                  skipClick,
                  gestureBlocked,
                  cancelNodeMove,
                );
              }}
            >
              <Circle radius={22} fill="rgba(255,255,255,0.001)" />
              {isCurveNode ? (
                <Circle
                  radius={7.5}
                  fill={activeCurvePoint === index ? "#cf2f2f" : "#d56a2b"}
                  stroke={appearance.handleOutline}
                  strokeWidth={1.5}
                  listening={false}
                />
              ) : (
                <Rect
                  x={-6}
                  y={-6}
                  width={12}
                  height={12}
                  fill={activeCurvePoint === index ? "#cf2f2f" : "#d56a2b"}
                  stroke={appearance.handleOutline}
                  strokeWidth={1.5}
                  listening={false}
                />
              )}
            </Group>
          );
        })}
        <Text
          x={sx(center.x) - 50}
          y={sy(center.y) - 8}
          width={100}
          align="center"
          text={formatAreaU(polygonArea(shownPath), useProject.getState().units.area)}
          fontSize={12}
          fontFamily="IBM Plex Sans, sans-serif"
          fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
          listening={false}
        />
      </Group>
    );
  }
  if (face.spline) {
    const controls = face.spline.pts;
    const shownControls = liveSplineControls?.length === controls.length
      ? liveSplineControls
      : controls;
    const curve = catmullRom(shownControls, 8, face.spline.closed);
    const moveControl = (index: number, point: Pt, commit: boolean) => {
      const snapped = snapEditableEndpoint(point);
      const next = controls.map((control, controlIndex) =>
        controlIndex === index ? snapped : control,
      );
      if (!commit) {
        setLiveSplineControls(next);
        useProject.setState({ splinePreview: { faceId: face.id, points: next } });
        onPreviewPath(catmullRom(next, 8, face.spline!.closed));
        return;
      }
      useProject.getState().setSplinePt(index, snapped);
      setLiveSplineControls(null);
      onPreviewPath(null);
    };
    const center = face.spline.closed && curve.length >= 3
      ? polygonMassCenter(curve)
      : null;
    return (
      <Group>
        <Line
          points={curve.flatMap((point) => [sx(point.x), sy(point.y)])}
          closed={face.spline.closed}
          stroke={appearance.accent}
          strokeWidth={2.5}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
        <OpenPathMeasures
          points={shownControls}
          closed={face.spline.closed}
          showLetters
          sx={sx}
          sy={sy}
          px={px}
          unit={useProject.getState().measureUnit}
        />
        {shownControls.map((point, index) => (
          <Group
            key={`spline-control-${index}`}
            x={sx(point.x)}
            y={sy(point.y)}
            onMouseDown={(event) => {
              event.cancelBubble = true;
            }}
            onPointerDown={(event) => {
              bindPointerDrag(
                event,
                editDrag,
                panX,
                panY,
                px,
                () => setActiveCurvePoint(index),
                (next) => moveControl(index, next, false),
                (next) => moveControl(index, next, true),
                skipClick,
                gestureBlocked,
                () => {
                  setLiveSplineControls(null);
                  useProject.setState({ splinePreview: null });
                  onPreviewPath(null);
                },
              );
            }}
            onTouchStart={(event) => {
              if (event.evt.touches.length >= 2) return;
              bindPointerDrag(
                event,
                editDrag,
                panX,
                panY,
                px,
                () => setActiveCurvePoint(index),
                (next) => moveControl(index, next, false),
                (next) => moveControl(index, next, true),
                skipClick,
                gestureBlocked,
                () => {
                  setLiveSplineControls(null);
                  useProject.setState({ splinePreview: null });
                  onPreviewPath(null);
                },
              );
            }}
          >
            <Circle radius={22} fill="rgba(255,255,255,0.001)" />
            <Circle
              radius={7}
              fill={activeCurvePoint === index ? "#cf2f2f" : "#d56a2b"}
              stroke={appearance.handleOutline}
              strokeWidth={1.5}
              listening={false}
            />
          </Group>
        ))}
        {center && (
          <Text
            x={sx(center.x) - 50}
            y={sy(center.y) - 8}
            width={100}
            align="center"
            text={formatAreaU(polygonArea(curve), useProject.getState().units.area)}
            fontSize={12}
            fontFamily="IBM Plex Sans, sans-serif"
            fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
            listening={false}
          />
        )}
      </Group>
    );
  }
  if (face.freehand || isDrawnCurveFace(d, faceId)) {
    const area = faceArea(d, faceId);
    if (area <= 1e-9) return null;
    const center = faceCentroid(d, faceId);
    return (
      <Text
        x={sx(center.x) - 50}
        y={sy(center.y) - 8}
        width={100}
        align="center"
        text={formatAreaU(area, useProject.getState().units.area)}
        fontSize={12}
        fontFamily="IBM Plex Sans, sans-serif"
        fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
        listening={false}
      />
    );
  }
  const paintDims = (node: Konva.Node, nr: number, cx: number, cy: number) => {
    const stage = node.getStage();
    if (!stage) return;
    const unit = useProject.getState().measureUnit;
    const areaU = useProject.getState().units.area;
    const rAng = -Math.PI / 6;
    const rc = Math.cos(rAng);
    const rs = Math.sin(rAng);
    const gap = Math.max(0.48, 36 / px);
    const dtext = stage.findOne("#circ-dtext") as Konva.Text | undefined;
    const rtext = stage.findOne("#circ-rtext") as Konva.Text | undefined;
    const stext = stage.findOne("#circ-stext") as Konva.Text | undefined;
    dtext?.setAttrs({
      x: sx(cx) - 48,
      y: sy(cy - nr * 0.42) - 8,
      text: `Ø ${formatLen(nr * 2, unit)}`,
    });
    rtext?.setAttrs({
      x: sx(cx + (nr + gap) * rc) - 36,
      y: sy(cy + (nr + gap) * rs) - 8,
      text: `R ${formatLen(nr, unit)}`,
    });
    stext?.setAttrs({
      x: sx(cx) - 52,
      y: sy(cy) - 8,
      text: formatAreaU(Math.PI * nr * nr, areaU),
    });
  };
  const rotPos = (pts: Pt[]) => {
    const trPt = pts[1];
    if (!trPt) return { x: 0, y: 0 };
    return { x: sx(trPt.x), y: sy(trPt.y) };
  };
  const paintRectDims = (pts: Pt[], stage: Konva.Stage | null) => {
    if (!stage || pts.length < 4) return;
    const unit = useProject.getState().measureUnit;
    const areaU = useProject.getState().units.area;
    const locale = useProject.getState().locale;
    const a = pts[0]!;
    const b = pts[1]!;
    const cc = pts[2]!;
    const w = dist(a, b);
    const len = dist(b, cc);
    const cx = (a.x + cc.x) / 2;
    const cy = (a.y + cc.y) / 2;
    const off = Math.max(0.18, 16 / px);
    const outward = (p: Pt, q: Pt) => {
      const mx = (p.x + q.x) / 2;
      const my = (p.y + q.y) / 2;
      let ox = mx - cx;
      let oy = my - cy;
      const n = Math.hypot(ox, oy) || 1;
      return { x: mx + (ox / n) * off, y: my + (oy / n) * off };
    };
    const top = outward(a, b);
    const side = outward(b, cc);
    const wAngle = readableLineAngle(a, b);
    const hAngle = readableLineAngle(b, cc);
    stage.findOne("#rect-wtext")?.setAttrs({
      x: sx(top.x),
      y: sy(top.y),
      offsetX: 44,
      offsetY: 8,
      rotation: wAngle,
      text: `${tr(locale, "drawW")} ${formatLen(w, unit)}`,
    });
    stage.findOne("#rect-ltext")?.setAttrs({
      x: sx(side.x),
      y: sy(side.y),
      offsetX: 44,
      offsetY: 8,
      rotation: hAngle,
      text: `${tr(locale, "drawH")} ${formatLen(len, unit)}`,
    });
    stage.findOne("#rect-atext")?.setAttrs({
      x: sx(cx) - 40,
      y: sy(cy) - 8,
      text: formatAreaU(w * len, areaU),
    });
  };
  const applyLiveCorners = (
    pts: Pt[],
    node: Konva.Node | undefined,
    skipCorner?: number,
    skipRot?: boolean,
    skipMid?: number,
  ) => {
    const flat = pts.flatMap((pt) => [sx(pt.x), sy(pt.y)]);
    if (node?.getClassName() === "Line") {
      (node as Konva.Line).points(flat);
      node.x(0);
      node.y(0);
    }
    bodyRef.current?.points(flat);
    if (pts.length >= 4) {
      const mx = (pts[0]!.x + pts[2]!.x) / 2;
      const my = (pts[0]!.y + pts[2]!.y) / 2;
      centerRef.current?.position({ x: sx(mx), y: sy(my) });
      for (let i = 0; i < 4; i++) {
        if (i === skipMid) continue;
        const a = pts[i]!;
        const b = pts[(i + 1) % 4]!;
        midRefs.current[i]?.position({ x: sx((a.x + b.x) / 2), y: sy((a.y + b.y) / 2) });
      }
    }
    pts.forEach((pt, i) => {
      if (i === skipCorner) return;
      cornerRefs.current[i]?.position({ x: sx(pt.x), y: sy(pt.y) });
    });
    if (!skipRot) {
      const rp = rotPos(pts);
      rotRef.current?.position(rp);
    }
    const stage = node?.getStage() ?? bitsRef.current?.getStage() ?? null;
    paintRectDims(pts, stage);
    stage?.batchDraw();
  };
  const cornersFromDiag = (opp: Pt, p: Pt, rotDeg: number): Pt[] => {
    const min = Math.max(useProject.getState().gridStep || 0.01, 0.002);
    const rad = (rotDeg * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const vx = -uy;
    const vy = ux;
    const dx = p.x - opp.x;
    const dy = p.y - opp.y;
    const w = Math.max(min, Math.abs(dx * ux + dy * uy));
    const h = Math.max(min, Math.abs(dx * vx + dy * vy));
    const mid = { x: (opp.x + p.x) / 2, y: (opp.y + p.y) / 2 };
    return rectWorldCorners({ x: mid.x - w / 2, y: mid.y - h / 2, w, h, rot: rotDeg });
  };
  const cornersFromSide = (edge: 0 | 1 | 2 | 3, p: Pt): Pt[] => {
    const min = Math.max(useProject.getState().gridStep || 0.01, 0.002);
    return rectWorldCorners(rectFromEdge(rect!, edge, p, min));
  };

  if (circle) {
    const snapCircleCenter = (point: Pt) => {
      const state = useProject.getState();
      if (!state.snapOn || !state.snapGridOn) return point;
      const dx = point.x - c.x;
      const dy = point.y - c.y;
      const anchors = [
        { x: circle.cx - circle.r, y: circle.cy },
        { x: circle.cx + circle.r, y: circle.cy },
        { x: circle.cx, y: circle.cy - circle.r },
        { x: circle.cx, y: circle.cy + circle.r },
      ];
      const snapped = snapShapeTranslationToGrid(
        anchors,
        dx,
        dy,
        Math.max(state.gridStep || 0.1, 1e-4),
        px,
      );
      return { x: c.x + snapped.dx, y: c.y + snapped.dy };
    };
    return (
      <>
        <Group
          x={sx(c.x)}
          y={sy(c.y)}
          draggable
          onMouseDown={(e) => {
            e.cancelBubble = true;
          }}
          onTouchStart={(e) => {
            e.cancelBubble = true;
          }}
          onDragStart={(e) => {
            e.cancelBubble = true;
            editDrag.current = true;
          }}
          onDragMove={(e) => {
            e.cancelBubble = true;
            let p = toWorld(e.target);
            p = snapCircleCenter(p);
            e.target.position({ x: sx(p.x), y: sy(p.y) });
            const dx = p.x - c.x;
            const dy = p.y - c.y;
            const node = geom(e.target);
            if (node) {
              node.x(sx(circle.cx + dx));
              node.y(sy(circle.cy + dy));
              paintDims(e.target, circle.r, circle.cx + dx, circle.cy + dy);
            }
            if (rim.current) {
              rim.current.x(sx(circle.cx + dx + circle.r));
              rim.current.y(sy(circle.cy + dy));
            }
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            editDrag.current = false;
            let p = toWorld(e.target);
            p = snapCircleCenter(p);
            useProject.getState().moveSelectedFace(p.x - c.x, p.y - c.y);
          }}
        >
          <Circle radius={circle.r * px} fill="rgba(0,0,0,0.001)" />
          <Group visible={false} listening={false}>
          <Line
            points={[-10, 0, -2.5, 0]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[2.5, 0, 10, 0]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[0, -10, 0, -2.5]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[0, 2.5, 0, 10]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[-10, 0, -7, -2.4]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[-10, 0, -7, 2.4]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[10, 0, 7, -2.4]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[10, 0, 7, 2.4]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[0, -10, -2.4, -7]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[0, -10, 2.4, -7]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[0, 10, -2.4, 7]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[0, 10, 2.4, 7]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          </Group>
        </Group>
        <Group
          ref={rim}
          x={sx(circle.cx + circle.r)}
          y={sy(circle.cy)}
          draggable
          onMouseDown={(e) => {
            e.cancelBubble = true;
          }}
          onTouchStart={(e) => {
            e.cancelBubble = true;
          }}
          onDragStart={(e) => {
            e.cancelBubble = true;
            editDrag.current = true;
          }}
          onDragMove={(e) => {
            e.cancelBubble = true;
            const p = toWorld(e.target);
            const nr = Math.max(0.05, dist(p, { x: circle.cx, y: circle.cy }));
            const node = geom(e.target);
            if (node && node.getClassName() === "Circle") (node as Konva.Circle).radius(nr * px);
            paintDims(e.target, nr, circle.cx, circle.cy);
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            editDrag.current = false;
            const p = toWorld(e.target);
            const nr = Math.max(0.05, dist(p, { x: circle.cx, y: circle.cy }));
            useProject.getState().setCircleR(nr);
          }}
        >
          <Circle radius={26} fill="rgba(0,0,0,0.001)" />
          <Rect
            x={-5}
            y={-5}
            width={10}
            height={10}
            fill="#c45c26"
            stroke={appearance.handleOutline}
            strokeWidth={1.5}
            listening={false}
          />
        </Group>
      </>
    );
  }

  if (inferredEll) {
    const ell = inferredEll;
    const rot0deg = ell.rot ?? 0;
    const ellPt = (
      rx: number,
      ry: number,
      param: number,
      cx = ell.cx,
      cy = ell.cy,
      rot = rot0deg,
    ) => {
      const rad = (rot * Math.PI) / 180;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      const lx = rx * Math.cos(param);
      const ly = ry * Math.sin(param);
      return { x: cx + lx * c - ly * s, y: cy + lx * s + ly * c };
    };
    const scalePos = (rx: number, ry: number, cx = ell.cx, cy = ell.cy, rot = rot0deg) =>
      ellPt(rx, ry, -Math.PI / 4, cx, cy, rot);
    const rotHandlePos = (rx: number, ry: number, cx = ell.cx, cy = ell.cy, rot = rot0deg) =>
      ellPt(rx, ry, (3 * Math.PI) / 4, cx, cy, rot);
    const offAxis = (end: Pt, cx = ell.cx, cy = ell.cy, outPx = 20) => {
      const dx = end.x - cx;
      const dy = end.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      const out = outPx / px;
      return {
        x: end.x + (dx / len) * out,
        y: end.y + (dy / len) * out,
      };
    };
    const axisLabel = (end: Pt, cx: number, cy: number, outPx: number) => {
      const p = offAxis(end, cx, cy, outPx);
      return { x: sx(p.x), y: sy(p.y), offsetX: 44, offsetY: 8 };
    };
    const paintEll = (
      node: Konva.Node | undefined,
      rx: number,
      ry: number,
      cx = ell.cx,
      cy = ell.cy,
      rot = rot0deg,
    ) => {
      const pts = ellipsePts(cx, cy, rx, ry, rot);
      if (node?.getClassName() === "Line") {
        (node as Konva.Line).points(pts.flatMap((p) => [sx(p.x), sy(p.y)]));
        node.x(0);
        node.y(0);
      } else if (node?.getClassName() === "Circle") {
        node.x(sx(cx));
        node.y(sy(cy));
      } else if (node?.getClassName() === "Ellipse") {
        const ellNode = node as Konva.Ellipse;
        ellNode.x(sx(cx));
        ellNode.y(sy(cy));
        ellNode.radiusX(rx * px);
        ellNode.radiusY(ry * px);
        ellNode.rotation(rot);
      }
      bodyRef.current?.points(pts.flatMap((p) => [sx(p.x), sy(p.y)]));
      const next = [
        ellPt(rx, ry, 0, cx, cy, rot),
        ellPt(rx, ry, Math.PI, cx, cy, rot),
        ellPt(rx, ry, Math.PI / 2, cx, cy, rot),
        ellPt(rx, ry, -Math.PI / 2, cx, cy, rot),
      ];
      next.forEach((pt, j) => midRefs.current[j]?.position({ x: sx(pt.x), y: sy(pt.y) }));
      const sp = scalePos(rx, ry, cx, cy, rot);
      const rp = rotHandlePos(rx, ry, cx, cy, rot);
      scaleRef.current?.position({ x: sx(sp.x), y: sy(sp.y) });
      rotRef.current?.position({ x: sx(rp.x), y: sy(rp.y) });
      centerRef.current?.position({ x: sx(cx), y: sy(cy) });
      const stage = node?.getStage() ?? bitsRef.current?.getStage() ?? scaleRef.current?.getStage();
      const unit = useProject.getState().measureUnit;
      const areaU = useProject.getState().units.area;
      const top = ellPt(rx, ry, -Math.PI / 2, cx, cy, rot);
      const right = ellPt(rx, ry, 0, cx, cy, rot);
      const left = ellPt(rx, ry, Math.PI, cx, cy, rot);
      const bottom = ellPt(rx, ry, Math.PI / 2, cx, cy, rot);
      const aLab = axisLabel(right, cx, cy, 40);
      const bLab = axisLabel(top, cx, cy, 18);
      const aAngle = ellipseTangentAngle(rx, ry, 0, rot);
      const bAngle = ellipseTangentAngle(rx, ry, -Math.PI / 2, rot);
      stage?.findOne("#ell-axis-a")?.setAttrs({
        points: [sx(left.x), sy(left.y), sx(right.x), sy(right.y)],
      });
      stage?.findOne("#ell-axis-b")?.setAttrs({
        points: [sx(top.x), sy(top.y), sx(bottom.x), sy(bottom.y)],
      });
      stage?.findOne("#ell-wtext")?.setAttrs({
        x: aLab.x,
        y: aLab.y,
        offsetX: aLab.offsetX,
        offsetY: aLab.offsetY,
        rotation: aAngle,
        text: `A ${formatLen(rx * 2, unit)}`,
      });
      stage?.findOne("#ell-htext")?.setAttrs({
        x: bLab.x,
        y: bLab.y,
        offsetX: bLab.offsetX,
        offsetY: bLab.offsetY,
        rotation: bAngle,
        text: `B ${formatLen(ry * 2, unit)}`,
      });
      stage?.findOne("#ell-atext")?.setAttrs({
        x: sx(cx) - 40,
        y: sy(cy) - 8,
        width: 80,
        align: "center",
        text: formatAreaU(Math.PI * rx * ry, areaU),
      });
      stage?.batchDraw();
    };
    const snapK = (k: number) => {
      if (!useProject.getState().snapOn) return k;
      for (const s of [0.5, 1, 1.5, 2, 2.5, 3]) {
        if (Math.abs(k - s) < 0.07) return s;
      }
      return k;
    };
    const sides: { key: string; param: number; axis: "x" | "y" }[] = [
      { key: "e", param: 0, axis: "x" },
      { key: "w", param: Math.PI, axis: "x" },
      { key: "s", param: Math.PI / 2, axis: "y" },
      { key: "n", param: -Math.PI / 2, axis: "y" },
    ];
    const sp0 = scalePos(ell.rx, ell.ry);
    const rp0 = rotHandlePos(ell.rx, ell.ry);
    const axisLen = (p: Pt, axis: "x" | "y", cx = ell.cx, cy = ell.cy, rot = rot0deg) => {
      const rad = (rot * Math.PI) / 180;
      const ux = Math.cos(rad);
      const uy = Math.sin(rad);
      const vx = -uy;
      const vy = ux;
      return axis === "x"
        ? Math.max(0.05, Math.abs((p.x - cx) * ux + (p.y - cy) * uy))
        : Math.max(0.05, Math.abs((p.x - cx) * vx + (p.y - cy) * vy));
    };
    const applyScale = (p: Pt, commit: boolean) => {
      let k = dist(p, { x: ell.cx, y: ell.cy }) / scale0.current.d;
      k = snapK(Math.max(0.05, k));
      scale0.current.k = k;
      const rx = Math.max(0.05, scale0.current.rx * k);
      const ry = Math.max(0.05, scale0.current.ry * k);
      const sp = scalePos(rx, ry);
      scaleRef.current?.position({ x: sx(sp.x), y: sy(sp.y) });
      const host = scaleRef.current ?? bitsRef.current;
      paintEll(host ? geom(host) : undefined, rx, ry);
      if (commit) useProject.getState().setEllipseR(rx, ry);
    };
    const applyRot = (p: Pt, commit: boolean) => {
      const ang = Math.atan2(p.y - ell.cy, p.x - ell.cx);
      const deg = snapDeltaToAngle(rot0deg, ((ang - rot0.current) * 180) / Math.PI, 45, 10);
      paintEll(
        bitsRef.current ? geom(bitsRef.current) : undefined,
        ell.rx,
        ell.ry,
        ell.cx,
        ell.cy,
        rot0deg + deg,
      );
      if (commit) useProject.getState().rotateSelectedFace(deg);
    };
    const applyBodyMove = (dxPx: number, dyPx: number, commit: boolean) => {
      let dx = dxPx / px;
      let dy = dyPx / px;
      const state = useProject.getState();
      if (state.snapOn && state.snapGridOn) {
        const snapped = snapShapeTranslationToGrid(
          ellipseBoundaryGridAnchors(ell.cx, ell.cy, ell.rx, ell.ry, rot0deg),
          dx,
          dy,
          Math.max(state.gridStep || 0.1, 1e-4),
          px,
        );
        dx = snapped.dx;
        dy = snapped.dy;
      }
      const x = dx * px;
      const y = dy * px;
      bitsRef.current?.position({ x, y });
      const node = bitsRef.current ? geom(bitsRef.current) : undefined;
      if (node) {
        if (node.getClassName() === "Ellipse" || node.getClassName() === "Circle") {
          node.position({ x: sx(ell.cx) + x, y: sy(ell.cy) + y });
        } else {
          node.position({ x, y });
        }
      }
      if (commit) {
        bitsRef.current?.position({ x: 0, y: 0 });
        if (node) {
          if (node.getClassName() === "Ellipse" || node.getClassName() === "Circle") {
            node.position({ x: sx(ell.cx), y: sy(ell.cy) });
          } else {
            node.position({ x: 0, y: 0 });
          }
        }
        if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9)
          useProject.getState().moveSelectedFace(dx, dy);
      }
    };
    return (
      <Group ref={bitsRef} x={0} y={0} listening>
        <Line
          ref={bodyRef}
          points={ellipsePts(ell.cx, ell.cy, ell.rx, ell.ry, rot0deg).flatMap((pt) => [
            sx(pt.x),
            sy(pt.y),
          ])}
          closed
          fill="rgba(43,111,154,0.04)"
          strokeEnabled={false}
          hitStrokeWidth={36}
          onMouseDown={(e) => {
            e.cancelBubble = true;
          }}
          onPointerDown={(e) => {
            bindClientDeltaDrag(e, editDrag, skipClick, applyBodyMove, gestureBlocked);
          }}
          onTouchStart={(e) => {
            if (e.evt.touches.length >= 2) return;
            bindClientDeltaDrag(e, editDrag, skipClick, applyBodyMove, gestureBlocked);
          }}
        />
        <Line
          id="ell-axis-a"
          points={[
            sx(ellPt(ell.rx, ell.ry, Math.PI).x),
            sy(ellPt(ell.rx, ell.ry, Math.PI).y),
            sx(ellPt(ell.rx, ell.ry, 0).x),
            sy(ellPt(ell.rx, ell.ry, 0).y),
          ]}
          stroke="#1b1f24"
          strokeWidth={0.55}
          dash={[4, 5]}
          opacity={0.38}
          listening={false}
        />
        <Line
          id="ell-axis-b"
          points={[
            sx(ellPt(ell.rx, ell.ry, -Math.PI / 2).x),
            sy(ellPt(ell.rx, ell.ry, -Math.PI / 2).y),
            sx(ellPt(ell.rx, ell.ry, Math.PI / 2).x),
            sy(ellPt(ell.rx, ell.ry, Math.PI / 2).y),
          ]}
          stroke="#1b1f24"
          strokeWidth={0.55}
          dash={[4, 5]}
          opacity={0.38}
          listening={false}
        />
        <Group ref={centerRef} x={sx(ell.cx)} y={sy(ell.cy)} visible={false} listening={false}>
          <Line points={[-10, 0, -2.5, 0]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[2.5, 0, 10, 0]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[0, -10, 0, -2.5]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[0, 2.5, 0, 10]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[-10, 0, -7, -2.4]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[-10, 0, -7, 2.4]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[10, 0, 7, -2.4]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[10, 0, 7, 2.4]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[0, -10, -2.4, -7]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[0, -10, 2.4, -7]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[0, 10, -2.4, 7]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[0, 10, 2.4, 7]} stroke="#111" strokeWidth={1.4} lineCap="round" />
        </Group>
        {sides.map((s, i) => {
          const hp = ellPt(ell.rx, ell.ry, s.param);
          return (
            <Group
              key={s.key}
              ref={(n) => {
                midRefs.current[i] = n;
              }}
              x={sx(hp.x)}
              y={sy(hp.y)}
              onMouseDown={(e) => {
                e.cancelBubble = true;
              }}
              onPointerDown={(e) => {
                bindPointerDrag(
                  e,
                  editDrag,
                  panX,
                  panY,
                  px,
                  () => {},
                  (p) => {
                    const q = snapIfMagnet(p);
                    const rx = s.axis === "x" ? axisLen(q, "x") : ell.rx;
                    const ry = s.axis === "y" ? axisLen(q, "y") : ell.ry;
                    paintEll(geom(e.target), rx, ry);
                  },
                  (p) => {
                    const q = snapIfMagnet(p);
                    const rx = s.axis === "x" ? axisLen(q, "x") : ell.rx;
                    const ry = s.axis === "y" ? axisLen(q, "y") : ell.ry;
                    useProject.getState().setEllipseR(rx, ry);
                  },
                  skipClick,
                );
              }}
              onTouchStart={(e) => {
                bindPointerDrag(
                  e,
                  editDrag,
                  panX,
                  panY,
                  px,
                  () => {},
                  (p) => {
                    const q = snapIfMagnet(p);
                    const rx = s.axis === "x" ? axisLen(q, "x") : ell.rx;
                    const ry = s.axis === "y" ? axisLen(q, "y") : ell.ry;
                    paintEll(geom(e.target), rx, ry);
                  },
                  (p) => {
                    const q = snapIfMagnet(p);
                    const rx = s.axis === "x" ? axisLen(q, "x") : ell.rx;
                    const ry = s.axis === "y" ? axisLen(q, "y") : ell.ry;
                    useProject.getState().setEllipseR(rx, ry);
                  },
                  skipClick,
                );
              }}
            >
              <Circle radius={22} fill="rgba(255,255,255,0.001)" />
              <Rect
                x={-6}
                y={-6}
                width={12}
                height={12}
                fill="#c45c26"
                stroke={appearance.handleOutline}
                strokeWidth={2}
                listening={false}
              />
            </Group>
          );
        })}
        <Group
          ref={rotRef}
          x={sx(rp0.x)}
          y={sy(rp0.y)}
          onMouseDown={(e) => {
            e.cancelBubble = true;
          }}
          onPointerDown={(e) => {
            bindPointerDrag(
              e,
              editDrag,
              panX,
              panY,
              px,
              (p) => {
                rot0.current = Math.atan2(p.y - ell.cy, p.x - ell.cx);
              },
              (p) => applyRot(p, false),
              (p) => applyRot(p, true),
              skipClick,
            );
          }}
          onTouchStart={(e) => {
            bindPointerDrag(
              e,
              editDrag,
              panX,
              panY,
              px,
              (p) => {
                rot0.current = Math.atan2(p.y - ell.cy, p.x - ell.cx);
              },
              (p) => applyRot(p, false),
              (p) => applyRot(p, true),
              skipClick,
            );
          }}
        >
          <Circle radius={22} fill="rgba(255,255,255,0.001)" />
          <RotationHandleGlyph />
        </Group>
        <Group
          ref={scaleRef}
          x={sx(sp0.x)}
          y={sy(sp0.y)}
          onMouseDown={(e) => {
            e.cancelBubble = true;
          }}
          onPointerDown={(e) => {
            bindPointerDrag(
              e,
              editDrag,
              panX,
              panY,
              px,
              (p) => {
                scale0.current = {
                  rx: ell.rx,
                  ry: ell.ry,
                  d: Math.max(1e-6, dist(p, { x: ell.cx, y: ell.cy })),
                  k: 1,
                };
              },
              (p) => applyScale(p, false),
              (p) => applyScale(p, true),
              skipClick,
            );
          }}
          onTouchStart={(e) => {
            bindPointerDrag(
              e,
              editDrag,
              panX,
              panY,
              px,
              (p) => {
                scale0.current = {
                  rx: ell.rx,
                  ry: ell.ry,
                  d: Math.max(1e-6, dist(p, { x: ell.cx, y: ell.cy })),
                  k: 1,
                };
              },
              (p) => applyScale(p, false),
              (p) => applyScale(p, true),
              skipClick,
            );
          }}
        >
          <Circle radius={22} fill="rgba(255,255,255,0.001)" />
          <ScaleHandleGlyph angle={readableLineAngle({ x: ell.cx, y: ell.cy }, sp0)} />
        </Group>
        <Text
          id="ell-wtext"
          x={axisLabel(ellPt(ell.rx, ell.ry, 0), ell.cx, ell.cy, 40).x}
          y={axisLabel(ellPt(ell.rx, ell.ry, 0), ell.cx, ell.cy, 40).y}
          offsetX={axisLabel(ellPt(ell.rx, ell.ry, 0), ell.cx, ell.cy, 40).offsetX}
          offsetY={8}
          width={88}
          align="center"
          rotation={ellipseTangentAngle(ell.rx, ell.ry, 0, rot0deg)}
          text={`A ${formatLen(ell.rx * 2, useProject.getState().measureUnit)}`}
          fontSize={12}
          fontFamily="IBM Plex Sans, sans-serif"
          fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
          listening={false}
        />
        <Text
          id="ell-htext"
          x={axisLabel(ellPt(ell.rx, ell.ry, -Math.PI / 2), ell.cx, ell.cy, 18).x}
          y={axisLabel(ellPt(ell.rx, ell.ry, -Math.PI / 2), ell.cx, ell.cy, 18).y}
          offsetX={axisLabel(ellPt(ell.rx, ell.ry, -Math.PI / 2), ell.cx, ell.cy, 18).offsetX}
          offsetY={8}
          width={88}
          align="center"
          rotation={ellipseTangentAngle(ell.rx, ell.ry, -Math.PI / 2, rot0deg)}
          text={`B ${formatLen(ell.ry * 2, useProject.getState().measureUnit)}`}
          fontSize={12}
          fontFamily="IBM Plex Sans, sans-serif"
          fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
          listening={false}
        />
        <Text
          id="ell-atext"
          x={sx(ell.cx) - 40}
          y={sy(ell.cy) - 8}
          width={80}
          align="center"
          text={formatAreaU(Math.PI * ell.rx * ell.ry, useProject.getState().units.area)}
          fontSize={12}
          fontFamily="IBM Plex Sans, sans-serif"
          fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
          listening={false}
        />
      </Group>
    );
  }

  if (rect && corners.length >= 4) {
    const rp = rotPos(corners);
    const applyRectBodyMove = (dxPx: number, dyPx: number, commit: boolean) => {
      let dx = dxPx / px;
      let dy = dyPx / px;
      const state = useProject.getState();
      if (state.snapOn && state.snapGridOn) {
        const anchors = corners.flatMap((point, index) => {
          const next = corners[(index + 1) % corners.length]!;
          return [point, { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }];
        });
        const snapped = snapShapeTranslationToGrid(
          anchors,
          dx,
          dy,
          Math.max(state.gridStep || 0.1, 1e-4),
          px,
        );
        dx = snapped.dx;
        dy = snapped.dy;
      }
      const x = dx * px;
      const y = dy * px;
      bitsRef.current?.position({ x, y });
      const node = bitsRef.current ? geom(bitsRef.current) : undefined;
      node?.position({ x, y });
      if (commit) {
        bitsRef.current?.position({ x: 0, y: 0 });
        node?.position({ x: 0, y: 0 });
        if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9)
          useProject.getState().moveSelectedFace(dx, dy);
      }
    };
    const applyRectRotation = (p: Pt, commit: boolean) => {
      const ang = Math.atan2(p.y - c.y, p.x - c.x);
      const deg = snapDeltaToAngle(rect.rot || 0, ((ang - rot0.current) * 180) / Math.PI, 45, 10);
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const next = corners.map((pt) => ({
        x: c.x + (pt.x - c.x) * cos - (pt.y - c.y) * sin,
        y: c.y + (pt.x - c.x) * sin + (pt.y - c.y) * cos,
      }));
      const host = rotRef.current ?? bitsRef.current;
      applyLiveCorners(next, host ? geom(host) : undefined);
      if (commit) useProject.getState().rotateSelectedFace(deg);
    };
    return (
      <Group ref={bitsRef} x={0} y={0}>
        <Line
          ref={bodyRef}
          points={corners.flatMap((pt) => [sx(pt.x), sy(pt.y)])}
          closed
          fill="rgba(0,0,0,0.01)"
          strokeEnabled={false}
          hitStrokeWidth={36}
          onMouseDown={(e) => {
            e.cancelBubble = true;
          }}
          onPointerDown={(e) => {
            bindClientDeltaDrag(e, editDrag, skipClick, applyRectBodyMove, gestureBlocked);
          }}
          onTouchStart={(e) => {
            if (e.evt.touches.length >= 2) return;
            bindClientDeltaDrag(e, editDrag, skipClick, applyRectBodyMove, gestureBlocked);
          }}
        />
        <Group ref={centerRef} x={sx(c.x)} y={sy(c.y)} visible={false} listening={false}>
          <Circle radius={22} fill="rgba(0,0,0,0.001)" />
          <Line
            points={[-10, 0, -2.5, 0]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[2.5, 0, 10, 0]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[0, -10, 0, -2.5]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[0, 2.5, 0, 10]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[-10, 0, -7, -2.4]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[-10, 0, -7, 2.4]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[10, 0, 7, -2.4]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[10, 0, 7, 2.4]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[0, -10, -2.4, -7]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[0, -10, 2.4, -7]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[0, 10, -2.4, 7]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[0, 10, 2.4, 7]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
        </Group>
        {corners.map((pt, i) => {
          if (i === 1) return null;
          const opp = corners[(i + 2) % 4]!;
          return (
            <Group
              key={`c${i}`}
              ref={(n) => {
                cornerRefs.current[i] = n;
              }}
              x={sx(pt.x)}
              y={sy(pt.y)}
              draggable
              onMouseDown={(e) => {
                e.cancelBubble = true;
              }}
              onTouchStart={(e) => {
                e.cancelBubble = true;
              }}
              onDragStart={(e) => {
                e.cancelBubble = true;
                editDrag.current = true;
              }}
              onDragMove={(e) => {
                e.cancelBubble = true;
                let p = toWorld(e.target);
                p = snapIfMagnet(p);
                e.target.position({ x: sx(p.x), y: sy(p.y) });
                const next = cornersFromDiag(opp, p, rect.rot || 0);
                applyLiveCorners(next, geom(e.target), i);
              }}
              onDragEnd={(e) => {
                e.cancelBubble = true;
                editDrag.current = false;
                let p = toWorld(e.target);
                p = snapIfMagnet(p);
                useProject.getState().setRectCorner(opp, p);
              }}
            >
              <Circle radius={22} fill="rgba(255,255,255,0.001)" />
              <Rect
                x={-6}
                y={-6}
                width={12}
                height={12}
                fill="#c45c26"
                stroke={appearance.handleOutline}
                strokeWidth={2}
                listening={false}
              />
            </Group>
          );
        })}
        {([0, 1, 2, 3] as const).map((edge) => {
          const a = corners[edge]!;
          const b = corners[(edge + 1) % 4]!;
          return (
            <Group
              key={`m${edge}`}
              ref={(n) => {
                midRefs.current[edge] = n;
              }}
              x={sx((a.x + b.x) / 2)}
              y={sy((a.y + b.y) / 2)}
              draggable
              onMouseDown={(e) => {
                e.cancelBubble = true;
              }}
              onTouchStart={(e) => {
                e.cancelBubble = true;
              }}
              onDragStart={(e) => {
                e.cancelBubble = true;
                editDrag.current = true;
              }}
              onDragMove={(e) => {
                e.cancelBubble = true;
                let p = toWorld(e.target);
                p = snapIfMagnet(p);
                const next = cornersFromSide(edge, p);
                applyLiveCorners(next, geom(e.target));
                const a2 = next[edge]!;
                const b2 = next[(edge + 1) % 4]!;
                e.target.position({ x: sx((a2.x + b2.x) / 2), y: sy((a2.y + b2.y) / 2) });
              }}
              onDragEnd={(e) => {
                e.cancelBubble = true;
                editDrag.current = false;
                let p = toWorld(e.target);
                p = snapIfMagnet(p);
                const next = cornersFromSide(edge, p);
                const a2 = next[edge]!;
                const b2 = next[(edge + 1) % 4]!;
                const mid = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
                useProject.getState().setRectEdge(edge, mid);
              }}
            >
              <Circle radius={22} fill="rgba(255,255,255,0.001)" />
              <Rect
                x={-5}
                y={-5}
                width={10}
                height={10}
                fill="#c45c26"
                stroke={appearance.handleOutline}
                strokeWidth={2}
                listening={false}
              />
            </Group>
          );
        })}
        <Group
          ref={rotRef}
          x={rp.x}
          y={rp.y}
          onMouseDown={(e) => {
            e.cancelBubble = true;
          }}
          onPointerDown={(e) => {
            bindPointerDrag(
              e,
              editDrag,
              panX,
              panY,
              px,
              (p) => {
                rot0.current = Math.atan2(p.y - c.y, p.x - c.x);
              },
              (p) => applyRectRotation(p, false),
              (p) => applyRectRotation(p, true),
              skipClick,
            );
          }}
          onTouchStart={(e) => {
            bindPointerDrag(
              e,
              editDrag,
              panX,
              panY,
              px,
              (p) => {
                rot0.current = Math.atan2(p.y - c.y, p.x - c.x);
              },
              (p) => applyRectRotation(p, false),
              (p) => applyRectRotation(p, true),
              skipClick,
            );
          }}
        >
          <Circle radius={22} fill="rgba(255,255,255,0.001)" />
          <RotationHandleGlyph />
        </Group>
        <RectMeasure
          corners={corners}
          sx={sx}
          sy={sy}
          px={px}
          unit={useProject.getState().measureUnit}
        />
      </Group>
    );
  }

  if (triangle) {
    const tri = verts.map((v) => ({ x: v.x, y: v.y }));
    const metrics = triangleMetrics(tri);
    if (!metrics) return null;
    const triCenter = metrics.center;
    const rotPoint = triangleRotationPoint(tri, px);
    const scalePoint = triangleScalePoint(tri);
    const rotatePts = (pts: Pt[], deg: number) => {
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      return pts.map((pt) => ({
        x: triCenter.x + (pt.x - triCenter.x) * cos - (pt.y - triCenter.y) * sin,
        y: triCenter.y + (pt.x - triCenter.x) * sin + (pt.y - triCenter.y) * cos,
      }));
    };
    const paintTri = (pts: Pt[], node?: Konva.Node, skip?: number, skipRot = false) => {
      const flat = pts.flatMap((pt) => [sx(pt.x), sy(pt.y)]);
      if (node?.getClassName() === "Line") {
        (node as Konva.Line).points(flat);
        node.x(0);
        node.y(0);
      }
      bodyRef.current?.points(flat);
      pts.forEach((pt, i) => {
        if (i === skip) return;
        cornerRefs.current[i]?.position({ x: sx(pt.x), y: sy(pt.y) });
      });
      const layout = triangleLabelLayout(pts, px);
      if (!layout) return;
      centerRef.current?.position({
        x: sx(layout.metrics.center.x),
        y: sy(layout.metrics.center.y),
      });
      if (!skipRot) {
        const rp = triangleRotationPoint(pts, px);
        if (rp) rotRef.current?.position({ x: sx(rp.x), y: sy(rp.y) });
      }
      const sp = triangleScalePoint(pts);
      if (sp) scaleRef.current?.position({ x: sx(sp.x), y: sy(sp.y) });
      const unit = useProject.getState().measureUnit;
      const areaU = useProject.getState().units.area;
      const stage = node?.getStage() ?? bitsRef.current?.getStage();
      stage?.findOne("#tri-wtext")?.setAttrs({
        x: sx(layout.baseLabel.x),
        y: sy(layout.baseLabel.y),
        offsetX: 44,
        offsetY: 8,
        rotation: layout.baseAngle,
        text: `A ${formatLen(layout.metrics.width, unit)}`,
      });
      stage?.findOne("#tri-lefttext")?.setAttrs({
        x: sx(layout.leftLabel.x),
        y: sy(layout.leftLabel.y),
        offsetX: 42,
        offsetY: 8,
        rotation: layout.leftAngle,
        text: `B ${formatLen(layout.metrics.leftSide, unit)}`,
      });
      stage?.findOne("#tri-righttext")?.setAttrs({
        x: sx(layout.rightLabel.x),
        y: sy(layout.rightLabel.y),
        offsetX: 42,
        offsetY: 8,
        rotation: layout.rightAngle,
        text: `C ${formatLen(layout.metrics.rightSide, unit)}`,
      });
      stage?.findOne("#tri-stext")?.setAttrs({
        x: sx(layout.areaLabel.x) - 40,
        y: sy(layout.areaLabel.y) - 8,
        text: formatAreaU(layout.metrics.area, areaU),
      });
      stage?.batchDraw();
    };
    const applyBodyMove = (dxPx: number, dyPx: number, commit: boolean) => {
      let dx = dxPx / px;
      let dy = dyPx / px;
      const state = useProject.getState();
      if (state.snapOn && state.snapGridOn) {
        const anchors = tri.flatMap((point, index) => {
          const next = tri[(index + 1) % tri.length]!;
          return [point, { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }];
        });
        const snapped = snapShapeTranslationToGrid(
          anchors,
          dx,
          dy,
          Math.max(state.gridStep || 0.1, 1e-4),
          px,
        );
        dx = snapped.dx;
        dy = snapped.dy;
      }
      const x = dx * px;
      const y = dy * px;
      bitsRef.current?.position({ x, y });
      const node = bitsRef.current ? geom(bitsRef.current) : undefined;
      node?.position({ x, y });
      if (commit) {
        bitsRef.current?.position({ x: 0, y: 0 });
        node?.position({ x: 0, y: 0 });
        if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9)
          useProject.getState().moveSelectedFace(dx, dy);
      }
    };
    const snapScaleK = (k: number) => {
      if (!useProject.getState().snapOn) return k;
      for (const s of [0.5, 1, 1.5, 2, 2.5, 3]) {
        if (Math.abs(k - s) < 0.07) return s;
      }
      return k;
    };
    const applyScale = (p: Pt, commit: boolean) => {
      const minK = Math.max(0.05, 0.05 / metrics.width, 0.05 / metrics.height);
      let k = dist(p, triCenter) / scale0.current.d;
      k = Math.max(minK, snapScaleK(k));
      scale0.current.k = k;
      const next = tri.map((pt) => ({
        x: triCenter.x + (pt.x - triCenter.x) * k,
        y: triCenter.y + (pt.y - triCenter.y) * k,
      }));
      const host = scaleRef.current ?? bitsRef.current;
      paintTri(next, host ? geom(host) : undefined);
      if (commit) useProject.getState().scaleSelectedFace(k);
    };
    const applyTriangleRotation = (p: Pt, commit: boolean) => {
      const ang = Math.atan2(p.y - triCenter.y, p.x - triCenter.x);
      const deg = snapDeltaToAngle(
        metrics.rotation,
        ((ang - rot0.current) * 180) / Math.PI,
        45,
        10,
      );
      const next = rotatePts(tri, deg);
      const host = rotRef.current ?? bitsRef.current;
      paintTri(next, host ? geom(host) : undefined);
      if (commit) useProject.getState().rotateSelectedFace(deg);
    };
    return (
      <Group ref={bitsRef} x={0} y={0}>
        <Line
          ref={bodyRef}
          points={tri.flatMap((pt) => [sx(pt.x), sy(pt.y)])}
          closed
          fill="rgba(0,0,0,0.01)"
          strokeEnabled={false}
          hitStrokeWidth={36}
          onMouseDown={(e) => {
            e.cancelBubble = true;
          }}
          onPointerDown={(e) => {
            bindClientDeltaDrag(e, editDrag, skipClick, applyBodyMove, gestureBlocked);
          }}
          onTouchStart={(e) => {
            if (e.evt.touches.length >= 2) return;
            bindClientDeltaDrag(e, editDrag, skipClick, applyBodyMove, gestureBlocked);
          }}
        />
        <Group ref={centerRef} x={sx(triCenter.x)} y={sy(triCenter.y)} visible={false} listening={false}>
          <Circle radius={22} fill="rgba(0,0,0,0.001)" />
          <Line
            points={[-10, 0, -2.5, 0]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[2.5, 0, 10, 0]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[0, -10, 0, -2.5]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[0, 2.5, 0, 10]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[-10, 0, -7, -2.4]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[-10, 0, -7, 2.4]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[10, 0, 7, -2.4]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[10, 0, 7, 2.4]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[0, -10, -2.4, -7]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[0, -10, 2.4, -7]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[0, 10, -2.4, 7]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[0, 10, 2.4, 7]}
            stroke="#111"
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
        </Group>
        {verts.map((v, i) => (
          <Group
            key={v.id}
            ref={(n) => {
              cornerRefs.current[i] = n;
            }}
            x={sx(v.x)}
            y={sy(v.y)}
            draggable
            onMouseDown={(e) => {
              e.cancelBubble = true;
            }}
            onTouchStart={(e) => {
              e.cancelBubble = true;
            }}
            onDragStart={(e) => {
              e.cancelBubble = true;
              editDrag.current = true;
            }}
            onDragMove={(e) => {
              e.cancelBubble = true;
              let p = toWorld(e.target);
              p = snapIfMagnet(p);
              e.target.position({ x: sx(p.x), y: sy(p.y) });
              const next = tri.map((pt, j) => (j === i ? p : pt));
              paintTri(next, geom(e.target), i);
            }}
            onDragEnd={(e) => {
              e.cancelBubble = true;
              editDrag.current = false;
              let p = toWorld(e.target);
              p = snapIfMagnet(p);
              useProject.getState().setFaceVertex(v.id, p);
            }}
          >
            <Circle radius={22} fill="rgba(255,255,255,0.001)" />
            <Rect
              x={-6}
              y={-6}
              width={12}
              height={12}
              fill="#c45c26"
              stroke={appearance.handleOutline}
              strokeWidth={2}
              listening={false}
            />
          </Group>
        ))}
        {scalePoint && (
          <Group
            ref={scaleRef}
            x={sx(scalePoint.x)}
            y={sy(scalePoint.y)}
            onMouseDown={(e) => {
              e.cancelBubble = true;
            }}
            onPointerDown={(e) => {
              bindPointerDrag(
                e,
                editDrag,
                panX,
                panY,
                px,
                (p) => {
                  scale0.current = {
                    rx: metrics.width,
                    ry: metrics.height,
                    d: Math.max(1e-6, dist(p, triCenter)),
                    k: 1,
                  };
                },
                (p) => applyScale(p, false),
                (p) => applyScale(p, true),
                skipClick,
              );
            }}
            onTouchStart={(e) => {
              bindPointerDrag(
                e,
                editDrag,
                panX,
                panY,
                px,
                (p) => {
                  scale0.current = {
                    rx: metrics.width,
                    ry: metrics.height,
                    d: Math.max(1e-6, dist(p, triCenter)),
                    k: 1,
                  };
                },
                (p) => applyScale(p, false),
                (p) => applyScale(p, true),
                skipClick,
              );
            }}
          >
            <Circle radius={22} fill="rgba(255,255,255,0.001)" />
            <ScaleHandleGlyph angle={readableLineAngle(triCenter, scalePoint)} />
          </Group>
        )}
        {rotPoint && (
          <Group
            ref={rotRef}
            x={sx(rotPoint.x)}
            y={sy(rotPoint.y)}
            onMouseDown={(e) => {
              e.cancelBubble = true;
            }}
            onPointerDown={(e) => {
              bindPointerDrag(
                e,
                editDrag,
                panX,
                panY,
                px,
                (p) => {
                  rot0.current = Math.atan2(p.y - triCenter.y, p.x - triCenter.x);
                },
                (p) => applyTriangleRotation(p, false),
                (p) => applyTriangleRotation(p, true),
                skipClick,
              );
            }}
            onTouchStart={(e) => {
              bindPointerDrag(
                e,
                editDrag,
                panX,
                panY,
                px,
                (p) => {
                  rot0.current = Math.atan2(p.y - triCenter.y, p.x - triCenter.x);
                },
                (p) => applyTriangleRotation(p, false),
                (p) => applyTriangleRotation(p, true),
                skipClick,
              );
            }}
          >
            <Circle radius={22} fill="rgba(255,255,255,0.001)" />
            <RotationHandleGlyph />
          </Group>
        )}
        <TriangleMeasure
          points={tri}
          sx={sx}
          sy={sy}
          px={px}
          unit={useProject.getState().measureUnit}
        />
      </Group>
    );
  }

  const straightEdges = faceEdges(d, faceId);
  if (
    verts.length >= 3 &&
    straightEdges.length === verts.length &&
    straightEdges.every((edge) => Math.abs(edge.bulge) < 1e-6)
  ) {
    const path = verts.map((v) => ({ x: v.x, y: v.y }));
    const shownPath = liveFreeformPath?.length === path.length ? liveFreeformPath : path;
    const frame = pathTransformFrame(path);
    const shownFrame = pathTransformFrame(shownPath);
    const corners = pathFrameCorners(shownFrame);
    const mids = pathFrameMids(shownFrame);
    const pathCenter = polygonMassCenter(path);
    const shownCenter = polygonMassCenter(shownPath);
    const frameAngle = (Math.atan2(frame.uy, frame.ux) * 180) / Math.PI;
    const rotationGap = Math.max(0.7, 34 / px);
    const rotationPoint = pathFramePoint(
      shownFrame,
      (shownFrame.minU + shownFrame.maxU) / 2,
      shownFrame.minV - rotationGap,
    );
    const paintFreeform = (pts: Pt[]) => {
      const node = bitsRef.current ? geom(bitsRef.current) : undefined;
      if (node?.getClassName() === "Line") {
        (node as Konva.Line).points(pts.flatMap((pt) => [sx(pt.x), sy(pt.y)]));
        node.position({ x: 0, y: 0 });
        node.getStage()?.batchDraw();
      }
      setLiveFreeformPath(pts);
    };
    const cancelFreeform = () => {
      const node = bitsRef.current ? geom(bitsRef.current) : undefined;
      if (node?.getClassName() === "Line") {
        (node as Konva.Line).points(path.flatMap((pt) => [sx(pt.x), sy(pt.y)]));
        node.getStage()?.batchDraw();
      }
      setLiveFreeformPath(null);
    };
    const commitPath = (pts: Pt[]) => {
      const st = useProject.getState();
      let moved = drawingOrMigrate(st.project);
      if (pointShape) {
        moved = setPointShapeVertices(moved, faceId, pts);
      } else {
        verts.forEach((vertex, i) => {
          const point = pts[i];
          if (point) moved = moveVertex(moved, vertex.id, point);
        });
      }
      setLiveFreeformPath(null);
      st.commitDrawing(moved, faceId, true);
    };
    const resizePath = (kind: "corner" | "side", index: number, pointer: Pt, commit: boolean) => {
      const point = snapIfMagnet(pointer);
      const minSize = Math.max(0.02, (useProject.getState().gridStep || 0.01) * 0.2);
      const next = resizePathFromFrame(path, frame, kind, index, point, minSize);
      paintFreeform(next);
      if (commit) commitPath(next);
    };
    const movePathVertex = (index: number, pointer: Pt, commit: boolean) => {
      const point = snapEditableEndpoint(pointer);
      const next = path.map((current, i) => (i === index ? point : current));
      paintFreeform(next);
      if (commit) commitPath(next);
    };
    const rotatePath = (pointer: Pt, commit: boolean) => {
      const angle = Math.atan2(pointer.y - pathCenter.y, pointer.x - pathCenter.x);
      const delta = snapDeltaToAngle(frameAngle, ((angle - rot0.current) * 180) / Math.PI, 45, 10);
      const next = rotatePathAround(path, pathCenter, delta);
      paintFreeform(next);
      if (commit) commitPath(next);
    };
    const applyBodyMove = (dxPx: number, dyPx: number, commit: boolean) => {
      let dx = dxPx / px;
      let dy = dyPx / px;
      const state = useProject.getState();
      if (state.snapOn && state.snapGridOn) {
        const anchors = path.flatMap((point, index) => {
          const next = path[(index + 1) % path.length]!;
          return [point, { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }];
        });
        const snapped = snapShapeTranslationToGrid(
          anchors,
          dx,
          dy,
          Math.max(state.gridStep || 0.1, 1e-4),
          px,
        );
        dx = snapped.dx;
        dy = snapped.dy;
      }
      const x = dx * px;
      const y = dy * px;
      bitsRef.current?.position({ x, y });
      const node = bitsRef.current ? geom(bitsRef.current) : undefined;
      node?.position({ x, y });
      if (commit) {
        bitsRef.current?.position({ x: 0, y: 0 });
        node?.position({ x: 0, y: 0 });
        if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9)
          useProject.getState().moveSelectedFace(dx, dy);
      }
    };
    return (
      <Group ref={bitsRef} x={0} y={0}>
        <Line
          ref={bodyRef}
          points={shownPath.flatMap((pt) => [sx(pt.x), sy(pt.y)])}
          closed
          fill="rgba(0,0,0,0.01)"
          strokeEnabled={false}
          hitStrokeWidth={36}
          onMouseDown={(e) => {
            e.cancelBubble = true;
          }}
          onPointerDown={(e) =>
            bindClientDeltaDrag(e, editDrag, skipClick, applyBodyMove, gestureBlocked)
          }
          onTouchStart={(e) => {
            if (e.evt.touches.length >= 2) return;
            bindClientDeltaDrag(e, editDrag, skipClick, applyBodyMove, gestureBlocked);
          }}
        />
        {!pointShape && (
          <Line
            points={[...corners, corners[0]!].flatMap((point) => [sx(point.x), sy(point.y)])}
            stroke="#c45c26"
            strokeWidth={1}
            dash={[5, 5]}
            opacity={0.42}
            listening={false}
          />
        )}
        <Group ref={centerRef} x={sx(shownCenter.x)} y={sy(shownCenter.y)} visible={false} listening={false}>
          <Circle radius={22} fill="rgba(0,0,0,0.001)" />
          <Line points={[-10, 0, -2.5, 0]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[2.5, 0, 10, 0]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[0, -10, 0, -2.5]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[0, 2.5, 0, 10]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[-10, 0, -7, -2.4]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[-10, 0, -7, 2.4]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[10, 0, 7, -2.4]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[10, 0, 7, 2.4]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[0, -10, -2.4, -7]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[0, -10, 2.4, -7]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[0, 10, -2.4, 7]} stroke="#111" strokeWidth={1.4} lineCap="round" />
          <Line points={[0, 10, 2.4, 7]} stroke="#111" strokeWidth={1.4} lineCap="round" />
        </Group>
        {!pointShape && corners.map((point, i) => (
          <Group
            key={`path-frame-corner-${i}`}
            ref={(node) => {
              cornerRefs.current[i] = node;
            }}
            x={sx(point.x)}
            y={sy(point.y)}
            onMouseDown={(e) => {
              e.cancelBubble = true;
            }}
            onPointerDown={(e) => {
              bindPointerDrag(
                e,
                editDrag,
                panX,
                panY,
                px,
                () => {},
                (p) => resizePath("corner", i, p, false),
                (p) => resizePath("corner", i, p, true),
                skipClick,
                undefined,
                cancelFreeform,
              );
            }}
            onTouchStart={(e) => {
              if (e.evt.touches.length >= 2) return;
              bindPointerDrag(
                e,
                editDrag,
                panX,
                panY,
                px,
                () => {},
                (p) => resizePath("corner", i, p, false),
                (p) => resizePath("corner", i, p, true),
                skipClick,
                undefined,
                cancelFreeform,
              );
            }}
          >
            <Circle radius={22} fill="rgba(255,255,255,0.001)" />
            <Rect
              x={-6}
              y={-6}
              width={12}
              height={12}
              fill="#c45c26"
              stroke={appearance.handleOutline}
              strokeWidth={2}
              listening={false}
            />
          </Group>
        ))}
        {!pointShape && mids.map((point, i) => (
          <Group
            key={`path-frame-mid-${i}`}
            ref={(node) => {
              midRefs.current[i] = node;
            }}
            x={sx(point.x)}
            y={sy(point.y)}
            onMouseDown={(e) => {
              e.cancelBubble = true;
            }}
            onPointerDown={(e) => {
              bindPointerDrag(
                e,
                editDrag,
                panX,
                panY,
                px,
                () => {},
                (p) => resizePath("side", i, p, false),
                (p) => resizePath("side", i, p, true),
                skipClick,
                undefined,
                cancelFreeform,
              );
            }}
            onTouchStart={(e) => {
              if (e.evt.touches.length >= 2) return;
              bindPointerDrag(
                e,
                editDrag,
                panX,
                panY,
                px,
                () => {},
                (p) => resizePath("side", i, p, false),
                (p) => resizePath("side", i, p, true),
                skipClick,
                undefined,
                cancelFreeform,
              );
            }}
          >
            <Circle radius={22} fill="rgba(255,255,255,0.001)" />
            <Rect
              x={-5}
              y={-5}
              width={10}
              height={10}
              fill="#c45c26"
              stroke={appearance.handleOutline}
              strokeWidth={2}
              listening={false}
            />
          </Group>
        ))}
        {!pointShape && <Group
          ref={rotRef}
          x={sx(rotationPoint.x)}
          y={sy(rotationPoint.y)}
          onMouseDown={(e) => {
            e.cancelBubble = true;
          }}
          onPointerDown={(e) => {
            bindPointerDrag(
              e,
              editDrag,
              panX,
              panY,
              px,
              (p) => {
                rot0.current = Math.atan2(p.y - pathCenter.y, p.x - pathCenter.x);
              },
              (p) => rotatePath(p, false),
              (p) => rotatePath(p, true),
              skipClick,
              undefined,
              cancelFreeform,
            );
          }}
          onTouchStart={(e) => {
            if (e.evt.touches.length >= 2) return;
            bindPointerDrag(
              e,
              editDrag,
              panX,
              panY,
              px,
              (p) => {
                rot0.current = Math.atan2(p.y - pathCenter.y, p.x - pathCenter.x);
              },
              (p) => rotatePath(p, false),
              (p) => rotatePath(p, true),
              skipClick,
              undefined,
              cancelFreeform,
            );
          }}
        >
          <Circle radius={22} fill="rgba(255,255,255,0.001)" />
          <RotationHandleGlyph />
        </Group>}
        {pointShape && shownPath.map((point, i) => (
          <Group
            key={`point-shape-vertex-${i}`}
            x={sx(point.x)}
            y={sy(point.y)}
            onMouseDown={(e) => {
              e.cancelBubble = true;
            }}
            onPointerDown={(e) => {
              bindPointerDrag(
                e,
                editDrag,
                panX,
                panY,
                px,
                () => {},
                (p) => movePathVertex(i, p, false),
                (p) => movePathVertex(i, p, true),
                skipClick,
                gestureBlocked,
                cancelFreeform,
              );
            }}
            onTouchStart={(e) => {
              if (e.evt.touches.length >= 2) return;
              bindPointerDrag(
                e,
                editDrag,
                panX,
                panY,
                px,
                () => {},
                (p) => movePathVertex(i, p, false),
                (p) => movePathVertex(i, p, true),
                skipClick,
                gestureBlocked,
                cancelFreeform,
              );
            }}
          >
            <Circle radius={22} fill="rgba(255,255,255,0.001)" />
            <Circle radius={10} fill="#d56a2b" stroke={appearance.handleOutline} strokeWidth={1.5} listening={false} />
            <Text
              x={-9}
              y={-6}
              width={18}
              align="center"
              text={String(i + 1)}
              fontSize={10}
              fontStyle="bold"
              fontFamily="IBM Plex Sans, sans-serif"
              fill="#fff"
              listening={false}
            />
          </Group>
        ))}
        <ClosedPathMeasures
          points={shownPath}
          sx={sx}
          sy={sy}
          px={px}
          unit={useProject.getState().measureUnit}
        />
        <Text
          x={sx(shownCenter.x) - 50}
          y={sy(shownCenter.y) - 8}
          width={100}
          align="center"
          text={formatAreaU(polygonArea(shownPath), useProject.getState().units.area)}
          fontSize={12}
          fontFamily="IBM Plex Sans, sans-serif"
          fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled
          listening={false}
        />
      </Group>
    );
  }

  return null;
}

function polygonMassCenter(points: Pt[]): Pt {
  if (points.length < 3) return { x: 0, y: 0 };
  let crossSum = 0;
  let xSum = 0;
  let ySum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const cross = a.x * b.y - b.x * a.y;
    crossSum += cross;
    xSum += (a.x + b.x) * cross;
    ySum += (a.y + b.y) * cross;
  }
  if (Math.abs(crossSum) < 1e-9) {
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
  }
  return { x: xSum / (3 * crossSum), y: ySum / (3 * crossSum) };
}

function polyKindFill(kind: string) {
  return REGION_FILL[kind as keyof typeof REGION_FILL] ?? "#ddd";
}

function renderGeom(
  poly: Geom,
  sx: (n: number) => number,
  sy: (n: number) => number,
  px: number,
  selectedPolyId: string | null,
  selectedPolyIds: string[],
  fillOf: (k: string) => string,
  startHold: (id: string) => void,
  endHold: () => void,
  passThrough: boolean,
  previewPoints: Pt[] | null = null,
  appearance = canvasTheme("crystal"),
  textureImages: Record<string, HTMLImageElement> = {},
) {
  if (poly.hidden) return null;
  const selected = poly.id === selectedPolyId || selectedPolyIds.includes(poly.id);
  const fill = poly.fill ?? fillOf(poly.cadType ?? poly.kind);
  const texture = textureImages[fill];
  const solidFill = fill.startsWith("texture:") ? "#d8d4cc" : fill;
  const pattern = texture ? {
    fill: undefined,
    fillPatternImage: texture,
    fillPatternRepeat: "repeat" as const,
    fillPatternScaleX: 0.24,
    fillPatternScaleY: 0.24,
  } : { fill: solidFill };
  const hold = passThrough
    ? { listening: false as const }
    : {
        listening: true as const,
        onPointerDown: (ev: Konva.KonvaEventObject<PointerEvent>) => {
          ev.cancelBubble = true;
          startHold(poly.id);
        },
        onPointerUp: () => endHold(),
        onPointerCancel: () => endHold(),
        onTouchStart: (ev: Konva.KonvaEventObject<TouchEvent>) => {
          if ((ev.evt.touches?.length ?? 1) >= 2) {
            endHold();
            return;
          }
          ev.cancelBubble = true;
          startHold(poly.id);
        },
        onTouchEnd: () => endHold(),
      };
  if (poly.type === "guide") {
    return (
      <Line
        key={poly.id}
        points={poly.points.flatMap((p) => [sx(p.x), sy(p.y)])}
        stroke="#7a5a2b"
        dash={[8, 5]}
        strokeWidth={1.2}
        listening={false}
      />
    );
  }
  if (poly.type === "circle" && poly.points[0] && poly.radius) {
    return (
      <Circle
        key={poly.id}
        id={`face-${poly.id}`}
        x={sx(poly.points[0].x)}
        y={sy(poly.points[0].y)}
        radius={poly.radius * px}
        {...pattern}
        opacity={0.72}
        stroke={selected ? appearance.accent : appearance.ink}
        strokeWidth={selected ? 2.5 : 1.5}
        {...hold}
      />
    );
  }
  if (poly.ellipse) {
    const e = poly.ellipse;
    return (
      <Ellipse
        key={poly.id}
        id={`face-${poly.id}`}
        x={sx(e.cx)}
        y={sy(e.cy)}
        radiusX={e.rx * px}
        radiusY={e.ry * px}
        rotation={e.rot ?? 0}
        {...pattern}
        opacity={0.72}
        stroke={selected ? appearance.accent : appearance.ink}
        strokeWidth={selected ? 2.5 : 1.5}
        {...hold}
      />
    );
  }
  const shownPoints = previewPoints ?? poly.points;
  return (
    <Line
      key={poly.id}
      id={`face-${poly.id}`}
      x={0}
      y={0}
      points={shownPoints.flatMap((p) => [sx(p.x), sy(p.y)])}
      closed={poly.closed}
      {...(poly.closed ? pattern : { fill: undefined })}
      opacity={poly.closed ? 0.72 : poly.type === "line" ? 0.9 : 0.5}
      stroke={selected ? appearance.accent : poly.type === "line" ? appearance.accent : appearance.ink}
      strokeWidth={selected ? 2.5 : 2}
      lineCap={poly.type === "line" ? "round" : "butt"}
      lineJoin={poly.type === "line" ? "round" : "miter"}
      hitStrokeWidth={poly.type === "line" ? 24 : "auto"}
      {...hold}
    />
  );
}

function stripLocal(
  s: { w: number; l: number; ox: number; oy: number },
  start: number,
  pxPerM: number,
) {
  const rad = (start * Math.PI) / 180;
  const corners = [
    { x: s.ox, y: s.oy },
    { x: s.ox + s.l, y: s.oy },
    { x: s.ox + s.l, y: s.oy + s.w },
    { x: s.ox, y: s.oy + s.w },
  ];
  const pts: number[] = [];
  for (const c of corners) {
    const x = (c.x * Math.cos(rad) - c.y * Math.sin(rad)) * pxPerM;
    const y = (c.x * Math.sin(rad) + c.y * Math.cos(rad)) * pxPerM;
    pts.push(x, y);
  }
  return pts;
}
