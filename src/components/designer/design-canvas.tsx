import {operatingGeometryAvailable} from "@/lib/flow";
import {specialFootprint} from "@/lib/equipment-footprint";
import {CanvasNote,canvasNoteHit} from "./canvas-note";
import {isIrrigationSimulation,canvasDimensionsVisible,equipmentLabelsVisible} from "@/lib/simulation-presentation";
import {SimulationLawn} from "./simulation-lawn";
import {simulationLawnSurface} from "@/lib/simulation-lawn";
import {LandscapeObjectGlyph} from "./landscape-object-glyph";
import {snapLandscapePoint,snapLandscapeRotation,landscapeAlignmentGuides,type LandscapeAlignmentGuide} from '@/lib/landscape-snapping';
import {landscapeReturnDrop} from '@/lib/landscape-return-drop';
import {ensureLandscapeImages} from "@/lib/landscape-object-images";
import {landscapeLayerVisible,landscapeLayerLocked,landscapeExclusions,resizeLandscapeObject,rotationDegrees,objectToLocal,type LandscapeObject} from "@/lib/landscape-objects";
import {UI_SCALE} from "@/lib/ui-scale";
import {plantLayerLocked,plantLayerVisible,resizedPlantRadius,normalizedPlantRotation} from "@/lib/plant-visuals";
import {ensurePlantImages} from "@/lib/plant-images";
import { CornerRoundingHandles, RoundedFigureHandles } from "./corner-rounding-handles";
import { useCornerRounding } from "@/lib/corner-rounding-store";
import { toPolygons } from "@/lib/cad/engine";
import { cutFigures, snapCutPoint } from "@/lib/cad/cut-figures";
import { headPaintOrder, isHeadVisible, visibleProjectHeads } from "@/lib/head-visibility";
import { ZoneHighlights, WateringHead, FocusedHead } from "./zone-highlights";
import { DiagnosticOverlay } from "./diagnostic-overlay";
import { focusedIssue, liveDiagnosticIssue, useDiagnosticFocus } from "@/lib/diagnostic-focus";
import { useCoverageDisplay } from '@/lib/coverage-display';
import { diagnosticCoverage } from '@/lib/diagnostic-coverage';
import { hatchedPaintMask, outsideHatchesClip, sprinklerPaintClip } from '@/lib/coverage-paint';
import { text as uiText } from "@/lib/i18n";
import { ReferenceCanvas } from "./reference-canvas";
import {AutomaticHeadTool} from './automatic-head-tool';
import {ENGINEERING_BACKGROUND,engineeringPlanDrawing} from '@/lib/engineering-view';
import { installCanvasZoom } from './canvas-zoom-events';
import { headAtPointer, HEAD_MOUSE_HIT_RADIUS } from "@/lib/head-hit-target";
import { snapSprinklerPoint } from "@/lib/head-snapping";
import { catalogName, nozzleName } from '@/lib/catalog-localization';
import {ManualSprinklerPlacement} from './manual-sprinkler-placement';
import type {ManualPlacementTracker} from '@/lib/manual-placement-tracker';
import { SprinklerGuides } from './sprinkler-placement-guides';
import { TapeMeasureIcon, TAPE_MEASURE_TIP } from "./tape-measure-icon";
import {createPortal, flushSync} from "react-dom";
import {snapDimensionOffset} from "@/lib/cad/dimension-offset-snap";
import { DimensionLine } from "./dimension-line";
import { layoutHeadLabels,equipmentLabel, headSymbolScale, HEAD_SYMBOL_RADIUS } from '@/lib/head-presentation';
import {annotationPaintInk,type InkRequest} from './annotation-contrast';
import { displayedDimensions } from '@/lib/cad/sprinkler-dimensions';
import {loadMaterialImage} from "@/lib/cad/material-images";
import { TextEditor } from "./text-editor";
import { PlantGlyph } from "./plant-glyph";
import type { CadPlant } from "@/lib/cad/types";
import type { CadText } from "@/lib/cad/types";
"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { layerFrame, layerFaceIds, layerCenter, transformLayer } from "@/lib/cad/engine";
import { snapLayerTransform } from "@/lib/cad/layer-snapping";
import { EditPointGlyph, RotationHandleGlyph, EDIT_HANDLE_COLOR, EDIT_OUTLINE_COLOR, SELECTION_OUTLINE_COLOR, ROTATION_STEM_PX } from "./edit-handle-glyphs";
import { snapFigurePoint, snapFigureTranslation } from "@/lib/cad/figure-snapping";
import { segmentAlignmentAnchors, snapSegmentAlignment } from "@/lib/cad/segment-alignment";
import {snapPointDraft} from '@/lib/cad/point-draft-snap';
import {canvasWorkspace,canvasSnapDrawing} from '@/lib/workspace-canvas';
import { SegmentAlignmentGuides } from "./segment-alignment-guides";
import { DrawingGuidance, ClosureGuide } from "./drawing-guidance";
import { CanvasMagnifier } from "./canvas-magnifier";
import {setPlacementFocus,usePlacementFocus} from './placement-focus';
import { HeadSectorHandles } from "./head-sector-handles";
import { startSprinklerHold } from "./sprinkler-hold";
import { rotationHandleLayout } from "@/lib/cad/edit-handle-layout";
import { installSingleFingerPan } from "./single-finger-pan";
import { bindMaterialPattern } from "./material-pattern";
import { bindHippedMaterial } from "./hipped-material";
import { textureFrame, texturePatternAttrs, validTextureSize } from "@/lib/cad/texture-mapping";
import { Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { catalogForHead, equipmentAppearance, defaultNozzle, itemById, stripAtPressure, supportsArc } from "@/lib/equipment-catalog";
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
  centroid,
  shoelace,
  closedPathSideStarts,
  ellipseBoundaryGridAnchors,
  type Pt,
} from "@/lib/geometry";
import { formatAreaU, formatLenU } from "@/lib/units";
import {dimensionLabelLayout} from "@/lib/cad/dimension-label-layout";
import { zoneColor, type Geom } from "@/lib/project-types";
import { canvasTheme, themeFigureFill } from "@/lib/theme";
import { useProject, drawingForEditing as drawingOrMigrate } from "@/lib/project-store";
import type { DesignCanvasProps } from "@/components/designer/canvas-types";
import { cadSnap } from "@/lib/cad/snap";
import {layoutDimensions} from "@/lib/cad/dimension-layout";
import {dimensionScaleResolver,dimensionTextScale} from "@/lib/cad/dimension-appearance";
import {dimensionsInBox,updateDimensionSelection,irrigationSelectionTarget} from "@/lib/cad/dimension-selection";
import { pathTouchesBox } from "@/lib/cad/workspace-selection";
import { isDimensionGeometrySnap, snapDimension } from "@/lib/cad/dimension-snap";
import {
  addChain,
  addDrawingLines,
  addEllipse,
  addRect,
  addSpline,
  updateSpline,
  catmullRom,
  addRotatedRect,
  addTriangle,
  addHexagon,
  deleteLooseEdge,
  faceArea,
  faceBoundaryKey,
  faceCentroid,
  faceEdges,
  facePoints,
  faceHoles,
  faceVertices,
  filletPreview,
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
  pickOpenPathAt,
  pickVertexAt,
  rectFromEdge,
  rectMetaMatchesFace,
  rectWorldCorners,
  resolveDim,
  setDimensionLabel,
  outsideDimensionOffset,
  deleteDimensions,
  selfIntersects,
  triangleFromBounds,
  hexagonFromBounds,
  triangleMetrics,
} from "@/lib/cad/engine";
import { REGION_FILL, layerForType, type CadDrawing } from "@/lib/cad/types";

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
  "cut",
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

function snapIfMagnet(p: Pt): Pt { return snapEditableEndpoint(p); }
function snapShapeTranslationToGrid(anchors: Pt[], dx: number, dy: number, step: number, px: number) {
  const st=useProject.getState();
  return snapFigureTranslation(drawingOrMigrate(st.project),st.cadEditId,anchors,dx,dy,step,px,st.snapGridOn);
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
  automaticHeadPanelHost,
  engineeringBase = false,
  previewView,
  multiSelect = false,
  shortcutsDisabled = false,
  onSelectionClear,
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
  const manualTracker=useRef<ManualPlacementTracker|null>(null);
  const [pickList, setPickList] = useState<{
    x: number;
    y: number;
    items: { kind: "face" | "edge" | "head"; id: string }[];
  } | null>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const wateringTime = useRef(1);
  const [size, setSize] = useState({ w: 640, h: 480 });
  const [textEditor, setTextEditor] = useState<CadText | null>(null);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [notePreview, setNotePreview] = useState<(Pt & {id:string;size?:number}) | null>(null);
  const panDrag = useRef<{ x: number; y: number } | null>(null);
  const mousePan = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const [mousePanning, setMousePanning] = useState(false);
  const [hoveredHead, setHoveredHead] = useState<string | null>(null);
  const [draggingHead, setDraggingHead] = useState(false);
  const [headMovePreview, setHeadMovePreview] = useState<(Pt & { id: string }) | null>(null);
  const [pressedHead, setPressedHead] = useState<string | null>(null);
  const headHold = useRef<(() => void) | null>(null);
  useEffect(() => () => headHold.current?.(), []);
  const box = useRef<{ x: number; y: number } | null>(null);
  const [boxNow, setBoxNow] = useState<Pt | null>(null);
  const marqueePointer = useRef<number | null>(null);
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
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
  const selectedDimension=selectedDimensions[0]??null;
  const setSelectedDimension=(id:string|null)=>setSelectedDimensions(id?[id]:[]);
  const dimensionInteraction = useRef(false);
  const [dimensionPreview, setDimensionPreview] = useState<{id:string;offset:number}|null>(null);
  const [dimensionEditor, setDimensionEditor] = useState<{id:string;value:string}|null>(null);
  const applyDimensionLabel = () => {
    if (!dimensionEditor) return;
    const st=useProject.getState(),d=drawingOrMigrate(st.project);
    const next=setDimensionLabel(d,dimensionEditor.id,dimensionEditor.value);
    if(next!==d) st.commitDrawing(next,st.selectedPolyId,true);
    setDimensionEditor(null);
  };
  const [selectedDraftSegment, setSelectedDraftSegment] = useState<number | null>(null);
  const [selectedDraftEdgeId, setSelectedDraftEdgeId] = useState<string | null>(null);
  const [activeDraftPolygonPoint, setActiveDraftPolygonPoint] = useState<number | null>(null);
  const [activeDraftSplinePoint, setActiveDraftSplinePoint] = useState<number | null>(null);
  const lineEditingRef = useRef(false);
  const lineTapGuardUntil = useRef(0);
  const segmentEditTapConsumed = useRef(false);
  const pointerType = useRef("mouse");
  const lastClient = useRef({ x: 0, y: 0 });
  const headDragStart = useRef({ x: 0, y: 0 });
  const overCatalog = useRef(false);
  const trashPreview = useRef<HTMLDivElement>(null);
  const draggedHeadNode = useRef<Konva.Node | null>(null);
  useEffect(() => {
    const clearDrop = () => {
      setPlacementFocus('head-move',null);
      setHeadMovePreview(null);
      overCatalog.current = false;
      document.querySelectorAll("[data-head-drop]").forEach(el => el.removeAttribute("data-head-drop"));
      if (trashPreview.current) trashPreview.current.style.display = "none";
      draggedHeadNode.current?.opacity(1);
    };
    window.addEventListener("pointercancel", clearDrop, true);
    return () => {
      clearDrop(); window.removeEventListener("pointercancel", clearDrop, true);
      if (headDragMove.current) window.removeEventListener("pointermove", headDragMove.current, true);
      document.documentElement.removeAttribute("data-head-drag");
    };
  }, []);
  const editDrag = useRef(false);
  const headDragMove = useRef<((e: PointerEvent) => void) | null>(null);
  const [liveCadPath, setLiveCadPath] = useState<{ faceId: string; points: Pt[] } | null>(null);
  const freehandOn = useRef(false);
  const cadHold = useRef<number | null>(null);
  const segmentHoldStart = useRef<Pt | null>(null);
  const startCadHold = (id: string) => {
    if (pinch.current) return;
    const st = useProject.getState();
    if(!canvasWorkspace(st.workspaceSection).editPlan)return;
    if (st.tool === "place" || st.tool === "measure" || st.tool === "scale" || multiSelect) return;
    const face = drawingOrMigrate(st.project).faces[id];
    const drawingSegment = st.tool === "draw" && st.drawSub === "line" && face?.segment;
    if (st.tool === "draw" && st.drawSub && st.drawSub !== "none" && !drawingSegment) return;
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
      if (drawingSegment) useProject.setState({drawSub:"line",tool:"draw"});
      try {
        navigator.vibrate?.(20);
      } catch {
        /* ignore */
      }
    }, 380);
  };
  const startSegmentHold = (p: Pt) => {
    const st=useProject.getState();
    if(st.tool!=="draw" || st.drawSub!=="line" || st.cadEditId) return;
    const d=drawingOrMigrate(st.project);
    for(const face of Object.values(d.faces)) {
      if(!face.segment || face.hidden || face.locked || face.layerId || !face.spline) continue;
      const [a,b]=face.spline.pts;
      if(!a || !b) continue;
      const hit=projectOnSegment(p,a,b).pt;
      const inset=Math.min(18/st.pxPerMeter,dist(a,b)*.2);
      if(dist(p,hit)<=14/st.pxPerMeter && dist(hit,a)>inset && dist(hit,b)>inset) { segmentHoldStart.current=p; startCadHold(face.id); break; }
    }
  };
  const endCadHold = () => {
    if(segmentHoldStart.current && !cadHold.current && useProject.getState().cadEditId) {
      skipClick.current=true;
      pinchSuppressClickUntil.current=Date.now()+650;
    }
    segmentHoldStart.current=null;
    if (cadHold.current) {
      window.clearTimeout(cadHold.current);
      cadHold.current = null;
    }
  };

  const storedProject = useProject((s) => s.project);
  const cornerPreview = useCornerRounding(s => s.preview);
  const project = useMemo(() => !readOnly && cornerPreview?.base === storedProject ? {...storedProject, drawing:cornerPreview.drawing, polygons:toPolygons(cornerPreview.drawing)} : storedProject, [storedProject, cornerPreview, readOnly]);
  const workspaceSection = useProject(s => s.workspaceSection);
  const hideLandscapeInIrrigation=useProject(s=>s.hideLandscapeInIrrigation);
  const workspace=canvasWorkspace(workspaceSection,readOnly,hideLandscapeInIrrigation);
  const placementFocus=usePlacementFocus(s=>!readOnly&&s.focus&&['plant-move','landscape-move'].includes(s.focus.owner)?s.focus:null);
  const diagnosticProject = useMemo(() => headMovePreview ? { ...project,
    heads: project.heads.map(head => head.id === headMovePreview.id ? { ...head, x: headMovePreview.x, y: headMovePreview.y } : head),
  } : project, [project, headMovePreview]);
  const diagnosticFocus = useDiagnosticFocus(s => s.focus);
  const diagnosticIssue = readOnly || !workspace.showIrrigation ? null : focusedIssue(diagnosticFocus, project);
  const diagnosticHeads = diagnosticIssue ? project.heads.filter(h => diagnosticIssue.headIds.includes(h.id) && !h.hidden && !h.locked &&
    !project.zones.some(z => z.id === h.zone && (z.hidden || z.locked)) && catalogForHead(h) && catalogForHead(h)?.coverageKind !== "point") : [];
  const tool = useProject((s) => readOnly ? null : s.tool);
  const drawSub = useProject((s) => readOnly || s.tool !== "draw" ? "none" : s.drawSub);
  const measureSub = useProject((s) => s.measureSub);
  const px = useProject((s) => previewView?.px ?? s.pxPerMeter);
  const panX = useProject((s) => previewView?.panX ?? s.panX);
  const panY = useProject((s) => previewView?.panY ?? s.panY);
  const coverageProjectId = useCoverageDisplay(s => s.projectId);
  const paintMask = useMemo(() => {
    if (readOnly || workspaceSection==='plan') return [];
    const issue = liveDiagnosticIssue(diagnosticFocus, diagnosticProject);
    const coverage = issue || workspaceSection === 'irrigation' && coverageProjectId === project.id
      ? diagnosticCoverage(diagnosticProject, headMovePreview ? project : undefined, headMovePreview?.id) : null;
    return hatchedPaintMask(coverage, issue?.area);
  }, [readOnly, diagnosticFocus, diagnosticProject, workspaceSection, coverageProjectId, project, headMovePreview]);
  const figurePaintClip = useMemo(() => outsideHatchesClip(paintMask, px, panX, panY), [paintMask, px, panX, panY]);
  const showCoverage = useProject((s) => !engineeringBase && s.showCoverage);
  const simulationActive = useProject(s => !readOnly && isIrrigationSimulation(s));
  const simulationLawn=useMemo(()=>simulationActive?simulationLawnSurface(project):[],[simulationActive,project]);
  const showGrid = useProject((s) => !readOnly && s.showGrid);
  const textHidden = useProject((s) => s.textHidden);
  const showLabels = useProject((s) => s.showLabels);
  const showHeadLabels = useProject(s => !engineeringBase && (readOnly ? s.showLabels : equipmentLabelsVisible(s)));
  const selectedId = useProject((s) => readOnly || simulationActive ? null : s.selectedId);
  const zoneFocus = useProject(s => !readOnly && s.workspaceSection === "irrigation" && s.rightMode === "zone" ? s.zoneFocus : null);
  const sectorEditId = useProject(s => readOnly || simulationActive ? null : s.sectorEditId);
  const selectedIds = useProject((s) => readOnly || simulationActive ? PREVIEW_EMPTY_IDS : s.selectedIds);
  const selectedPolyId = useProject((s) => workspace.editPlan ? s.selectedPolyId : null);
  const plantUiScale = useProject(s=>UI_SCALE[s.uiSize]);
  const selectedPlantId = useProject(s => readOnly || simulationActive ? null : s.selectedPlantId);
  const pendingCatalogPlant = useProject(s => readOnly ? null : s.pendingCatalogPlant);
  const selectedLandscapeId=useProject(s=>readOnly||simulationActive?null:s.selectedLandscapeId);
  const pendingLandscapeObject=useProject(s=>readOnly?null:s.pendingLandscapeObject);
  const catalogPlacementArmed=useProject(s=>s.catalogPlacementArmed);
  const manualPlacement=!readOnly&&workspaceSection==='irrigation'&&tool==='place'&&catalogPlacementArmed;
  const pendingPlacement=pendingCatalogPlant||pendingLandscapeObject||manualPlacement;
  const [landscapePreview,setLandscapePreview]=useState<LandscapeObject|null>(null);
  const [landscapeGuides,setLandscapeGuides]=useState<LandscapeAlignmentGuide[]>([]);
  const [plantPreview, setPlantPreview] = useState<CadPlant | null>(null);
  const selectedEdgeId = useProject((s) => workspace.editPlan ? s.selectedEdgeId : null);
  const cadEditId = useProject((s) => workspace.editPlan ? s.cadEditId : null);
  const catalogOpen = useProject((s) => !readOnly && s.catalogOpen);
  const selectedPolyIds = useProject((s) => workspace.editPlan ? s.selectedPolyIds : PREVIEW_EMPTY_IDS);
  const draft = useProject((s) => readOnly || simulationActive ? PREVIEW_EMPTY_DRAFT : s.draft);
  const fitNonce = useProject((s) => s.fitNonce);
  const measureUnit = useProject((s) => s.measureUnit);
  const areaUnit = useProject((s) => s.units.area);
  const dimensionFormat = useProject(s => `${s.units.length}|${s.numberFormat}|${s.decimals}`);
  const spaceDown = useProject((s) => s.spaceDown);
  const gridStep = useProject((s) => s.gridStep);
  const analysis = useProject((s) => !readOnly && !simulationActive && workspace.showIrrigation && s.analysis);
  const snapOn = useProject((s) => s.snapOn);
  const snapGridOn = useProject((s) => s.snapGridOn);
  const locale = useProject((s) => s.locale);
  const cadDrawing = drawingOrMigrate(project);
  const selectedHead = !readOnly && !multiSelect && catalogOpen && selectedIds.length === 1 && tool !== "measure" && tool !== "scale" && drawSub === "none"
    ? project.heads.find(h => h.id === selectedId && !h.hidden && !h.locked && !project.zones.some(z => z.id === h.zone && (z.locked || z.hidden))) : undefined;
  const sectorHead = selectedHead?.id === sectorEditId ? selectedHead : undefined;
  useEffect(() => {
    headHold.current?.();
    if (sectorEditId && !sectorHead) useProject.getState().setSectorEdit(null);
  }, [sectorEditId, sectorHead?.id, tool, drawSub, multiSelect]);
  useEffect(() => {
    if (!sectorEditId || shortcutsDisabled) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editDrag.current) useProject.getState().setSectorEdit(null);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [sectorEditId, shortcutsDisabled]);
  const dimensionsVisible = !simulationActive && cadDrawing.layers?.dims?.visible !== false;
  useEffect(()=>{
    if(!dimensionsVisible) {
      setSelectedDimension(null);setDimensionEditor(null);setDimensionPreview(null);dimensionInteraction.current=false;
    }
  },[dimensionsVisible]);
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
    (editedFace.rounding || editedFace.circle ||
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

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || readOnly) return;
    return installSingleFingerPan(el, {
      canPan: () => {
        const st = useProject.getState();
        return !dimensionInteraction.current && !multiSelect && !pinchGestureActive.current && !editDrag.current && !st.cadEditId &&
          !st.selectedEdgeId && !st.draft.points.length &&
          (!st.tool || (st.tool === "draw" && st.drawSub === "none"));
      },
      readPan: () => { const st = useProject.getState(); return { x: st.panX, y: st.panY }; },
      setPan: (x, y) => useProject.getState().setPan(x, y),
      begin: () => { skipClick.current = false; pinchSuppressClickUntil.current = 0; },
      suppressTap: () => { skipClick.current = true; pinchSuppressClickUntil.current = Date.now() + 650; },
      cancelHold: () => { endCadHold(); headHold.current?.(); },
    });
  }, [readOnly, multiSelect]);

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
      if(useProject.getState().tool==='auto-head')return;
      if (e.touches.length < 2) return;
      if (cadHold.current) {
        window.clearTimeout(cadHold.current);
        cadHold.current = null;
      }
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
      if(useProject.getState().tool==='auto-head')return;
      e.preventDefault();
      if (e.touches.length < 2) return;
      if (cadHold.current) {
        window.clearTimeout(cadHold.current);
        cadHold.current = null;
      }
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

  const neededMaterialIds=JSON.stringify([...new Set([
    ...project.polygons.filter(poly=>!poly.hidden).map(poly=>poly.fill),
    ...(simulationActive?["texture:lawn-parterre"]:[]),
  ].filter((fill):fill is string=>Boolean(fill?.startsWith("texture:"))))].sort());
  useEffect(() => {
    let active=true;
    for(const fill of JSON.parse(neededMaterialIds) as string[]) {
      loadMaterialImage(fill).then(image=>{
        if(active)setTextureImages(current=>current[fill]===image?current:{...current,[fill]:image});
      }).catch(()=>{/* The canvas keeps its solid material fallback. */});
    }
    return ()=>{active=false;};
  },[neededMaterialIds]);

  useEffect(() => {
    onExportReady?.(async () => {
      await Promise.all([ensurePlantImages(drawingOrMigrate(useProject.getState().project)),ensureLandscapeImages(drawingOrMigrate(useProject.getState().project))]);
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      const stage = stageRef.current;
      if (!stage) return null;
      const landscapeControls=[...stage.find('.landscape-controls'),...stage.find('.landscape-selection')];
      const visible=landscapeControls.map(node=>node.visible());
      try {
        landscapeControls.forEach(node=>node.visible(false));
        stage.draw();
        return stage.toDataURL({ pixelRatio: 2, mimeType: "image/png" });
      } catch {
        return null;
      } finally {
        landscapeControls.forEach((node,i)=>node.visible(visible[i]!));stage.draw();
      }
    });
  }, [onExportReady]);

  useEffect(() => {
    if (!pressedHead) return;
    const release = () => setPressedHead(null);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, [pressedHead]);

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
    const d = canvasSnapDrawing(drawingOrMigrate(st.project),st.workspaceSection);
    if(st.tool === "draw" && st.drawSub === "cut") return snapCutPoint(d,p,{
      snapOn:st.snapOn,snapGridOn:st.snapGridOn,gridStep:st.gridStep,pxPerMeter:st.pxPerMeter,
      pointerType:pointerType.current,closeTo:st.draft.points.length>=3?st.draft.points[0]:null,
    });
    if ((st.tool === "draw" && st.drawSub === "dim") || (st.tool === "measure" && st.measureSub === "measure")) {
      return snapDimension(p,d,{pxPerMeter:st.pxPerMeter,pointerType:pointerType.current,
        snapOn:st.snapOn,snapGridOn:st.snapGridOn,gridStep:st.gridStep});
    }
    const canCloseDraft =
      st.tool === "draw" &&
      (st.drawSub === "polygon" ||
        st.drawSub === "polyline" ||
        st.drawSub === "line" ||
        st.drawSub === "spline") &&
      st.draft.points.length >= (st.drawSub === "spline" || st.drawSub === "polygon" ? 3 : 2);
    const closeTo =
      canCloseDraft
        ? st.draft.points[0]!
        : null;
    const snapOptions = {
      pxPerMeter: st.pxPerMeter,
      pointerType: pointerType.current,
      snapOn: st.snapOn,
      snapGridOn: st.snapOn && st.snapGridOn,
      orthoOn: st.orthoOn,
      lock: st.inferenceLock,
      gridStep: st.gridStep,
      angleFrom: extra?.angleFrom,
      closeTo,
      heads: canvasWorkspace(st.workspaceSection).showIrrigation?visibleProjectHeads(st.project).map((h) => ({ x: h.x, y: h.y })):[],
    };
    const snapped = st.tool==='draw'&&st.drawSub==='polygon'
      ?snapPointDraft(p,d,st.draft.points,snapOptions):cadSnap(p,d,snapOptions);
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
    if (st.snapOn && st.tool === "draw" && st.drawSub === "line" && extra?.angleFrom && ['none','grid','horiz','vert','parallel','perp','extend'].includes(snapped.kind)) {
      return {...snapped,pt:snapSegmentAlignment(p,snapped.pt,segmentAlignmentAnchors(d,extra.angleFrom),st.pxPerMeter)};
    }
    return snapped;
  };

  const snapPolygonDraftPoint = (p: Pt, pointIndex: number) => {
    const st = useProject.getState();
    const d = canvasSnapDrawing(drawingOrMigrate(st.project),st.workspaceSection);
    if (pointIndex === st.draft.points.length - 1 && pointIndex >= 3 && dist(p, st.draft.points[0]!) * st.pxPerMeter <= 18) return {pt: st.draft.points[0]!, kind: "close"};
    return snapPointDraft(p, d, st.draft.points.filter((_,i)=>i!==pointIndex), {
      pxPerMeter: st.pxPerMeter,
      pointerType: pointerType.current,
      snapOn: st.snapOn,
      snapGridOn: st.snapOn && st.snapGridOn,
      orthoOn: st.orthoOn,
      lock: st.inferenceLock,
      gridStep: st.gridStep,
      angleFrom: pointIndex > 0 ? st.draft.points[pointIndex - 1] ?? null : null,
      closeTo: pointIndex === st.draft.points.length - 1 && pointIndex >= 3 ? st.draft.points[0]! : null,
      heads: canvasWorkspace(st.workspaceSection).showIrrigation?visibleProjectHeads(st.project).map((h) => ({ x: h.x, y: h.y })):[],
    });
  };

  const trackPointer = (p: Pt) => {
    if(segmentHoldStart.current && dist(p,segmentHoldStart.current)*useProject.getState().pxPerMeter>8) endCadHold();
    const st = useProject.getState();
    if(st.tool==='place'&&st.catalogPlacementArmed){
      if(st.spaceDown||pinchGestureActive.current||midDown.current||mousePan.current)manualTracker.current?.clear();
      else manualTracker.current?.move({x:p.x*st.pxPerMeter+st.panX,y:p.y*st.pxPerMeter+st.panY},pointerType.current==='touch');
      return {pt:p,kind:'none' as const};
    }
    if(st.tool === "draw" && st.drawSub === "cut" && cutFigures(drawingOrMigrate(st.project),st.draft.points)) return {pt:p,kind:"none" as const};
    const stretching =
      st.tool === "draw" &&
      st.draft.points.length >= 1 &&
      (st.drawSub === "circle" || st.drawSub === "ellipse");
    const angleFrom = stretching
      ? null
      : st.tool === "draw" && st.draft.points.length
        ? st.draft.points[st.draft.points.length - 1]!
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

  useEffect(() => {
    const element=wrapRef.current;
    if(!element || readOnly) return;
    return installCanvasZoom(element, useProject.getState, view => {
      endCadHold(); useProject.setState(view);
    }, () => editDrag.current || pinchGestureActive.current);
  }, [readOnly]);

  const startFreehand = (point: Pt) => {
    const st = useProject.getState();
    const tolerance = Math.max(0.12, 24 / Math.max(st.pxPerMeter, 1));
    const boundary = nearestFaceBoundary(drawingOrMigrate(st.project), point, tolerance);
    setHoverPt(boundary?.pt ?? point);
    setSnapHit(null);
    freehandOn.current = true;
    skipClick.current = true;
    st.setDraftPoints([{ ...(boundary?.pt ?? point) }]);
  };

  const appendFreehand = (point: Pt) => {
    setHoverPt(point);
    setSnapHit(null);
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

  const finishSegmentEditOnTap = () => {
    if (!useProject.getState().finishSegmentEdit()) return false;
    lineEditingRef.current = false;
    setSelectedDraftSegment(null);
    setSelectedDraftEdgeId(null);
    if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current);
    hoverRaf.current = 0;
    setHoverPt(null);
    setSnapHit(null);
    setLiveCadPath(null);
    // Block only this contact's compatibility click, not a fast next tap.
    segmentEditTapConsumed.current = true;
    return true;
  };

  const beginCanvasContact = () => {
    if (pinchGestureActive.current || editDrag.current) return;
    pinchSuppressClickUntil.current = 0;
    segmentEditTapConsumed.current = false;
    skipClick.current = false;
    lineTapGuardUntil.current = 0;
  };

  useEffect(() => {
    skipClick.current = false;
    lineTapGuardUntil.current = 0;
    segmentEditTapConsumed.current = false;
    pinchSuppressClickUntil.current = 0;
    lineEditingRef.current = false;
  }, [tool, drawSub]);
  useEffect(() => {
    if (!("redoPoints" in draft) || !draft.redoPoints?.length) return;
    pendingHover.current = null;
    if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current);
    hoverRaf.current = 0;
    setHoverPt(null);
    onHover?.(null);
    setSnapHit(null);
  }, ["redoPoints" in draft ? draft.redoPoints : undefined]);

  const clearEmptyCanvasSelection = () => {
    const st=useProject.getState();
    st.selectHead(null);
    st.selectPoly(null);
    st.setCadEdit(null);
    setSelectedNote(null);setSelectedDimension(null);setDimensionEditor(null);setPickList(null);
    onSelectionClear?.();
  };
  const handleClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (textEditor || e.target.name() === "drawing-annotation") return;
    if (segmentEditTapConsumed.current) return;
    if (pinchGestureActive.current || pinching) return;
    if (Date.now() < pinchSuppressClickUntil.current) return;
    if (Date.now() < lineTapGuardUntil.current) return;
    if (skipClick.current || editDrag.current) {
      skipClick.current = false;
      return;
    }
    const raw = toWorld(e.target.getStage());
    setSelectedNote(null);
    const st = useProject.getState();
    if (st.spaceDown) return;
    if (finishSegmentEditOnTap()) return;
    const stretching =
      st.tool === "draw" &&
      st.draft.points.length >= 1 &&
      (st.drawSub === "circle" || st.drawSub === "ellipse");
    const angleFrom = stretching
      ? null
      : st.tool === "draw" && st.draft.points.length
        ? st.draft.points[st.draft.points.length - 1]!
        : null;
    const p = st.tool === "scale" ? raw : applySnap(raw, { angleFrom, free: stretching }).pt;
    if (!readOnly&&st.workspaceSection==='irrigation'&&st.tool==='place'&&st.catalogPlacementArmed&&st.placeId) {
      st.placeHead(raw,st.placeId);return;
    }
    if (st.pendingLandscapeObject) { st.placeLandscape(raw,'touches' in e.evt?'touch':'mouse'); return; }
    if (st.pendingCatalogPlant) { st.placeCatalogPlant(raw); return; }
    const emptyTarget=e.target.name()==='bg'||e.target===e.target.getStage();
    const selecting=!st.tool||st.tool==='move'||st.tool==='place'||st.tool==='draw'&&st.drawSub==='none';
    if(!readOnly && emptyTarget && selecting && st.workspaceSection!=='plan'){
      clearEmptyCanvasSelection();return;
    }
    if (st.tool === "place") {
      if (emptyTarget) clearEmptyCanvasSelection();
      return; // Opening the library alone never arms placement.
    }

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
      if (!st.draft.measureA) useProject.setState({ draft: { ...st.draft, measureA: p } });
      else {
        onMeasure(dist(st.draft.measureA, p));
        useProject.setState({ draft: { ...st.draft, measureA: null } });
      }
      return;
    }
    if (!canvasWorkspace(st.workspaceSection).editPlan && (!st.tool||st.tool==='move'||st.tool==='draw'&&st.drawSub==='none')) return;
    if (!st.cadEditId && (!st.tool || st.tool === "move" || multiSelect || (st.tool === "draw" && st.drawSub === "none"))) {
      const d = drawingOrMigrate(st.project);
      const hit = pickOpenPathAt(d, p, 18 / px);
      if (hit) { st.selectPoly(hit, multiSelect); return; }
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
      if (drawSub === "cut") {
        const points=st.draft.points;
        if(cutFigures(drawingOrMigrate(st.project),points)) return;
        if(points.length>=4 && dist(points[0]!,points.at(-1)!)<1e-8) return;
        if(points.length && dist(points.at(-1)!,p)<1e-8) return;
        st.addDraftPoint(p);
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
        if (!st.draft.points.length) {
          st.addDraftPoint(p);
          return;
        }
        const a = st.draft.points[0]!;
        st.addDimension(a, p);
        return;
      }
      if (drawSub === "text") {
        setTextEditor({id:uid("txt"),x:p.x,y:p.y,text:"",size:0.35,fontFamily:"PT Mono",color:appearance.ink});
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
        if (st.cadEditId) { st.setCadEdit(null); return; }
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
        setSelectedDraftSegment(null);
        setSelectedDraftEdgeId(null);
        lineEditingRef.current = false;
        if (dist(a, p) < 1e-9) return;
        const currentDrawing = drawingOrMigrate(st.project);
        const previousFaces = Object.values(currentDrawing.faces);
        const previousFaceKeys = new Set(previousFaces.map(faceBoundaryKey));
        const nextDrawing = mergeOpenCollinearEdges(
          addDrawingLines(currentDrawing, [a, st.draft.lineLength ? {x:a.x+(p.x-a.x)/dist(a,p)*st.draft.lineLength,y:a.y+(p.y-a.y)/dist(a,p)*st.draft.lineLength} : p], st.regionType),
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
            draft: { ...st.draft, lineLength: undefined, points: [] },
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
          draft: { ...st.draft, lineLength: undefined, points: [] },
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
        if (current.length >= 3 && dist(current[0]!, p) < closeM) {
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
        visibleProjectHeads(st.project).map((h) => ({ id: h.id, x: h.x, y: h.y })),
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
      const owner = face ?? (edge ? d.edges[edge]?.faceL ?? d.edges[edge]?.faceR : null);
      if (owner && d.faces[owner]) {
        st.selectPoly(owner);
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

  const lockedZones = new Set((project.zones ?? []).filter((z) => z.locked).map((z) => z.id));
  const u = project.underlay;
  const x0 = Math.floor(-panX / px) - 1;
  const y0 = Math.floor(-panY / px) - 1;
  const x1 = Math.ceil((size.w - panX) / px) + 1;
  const y1 = Math.ceil((size.h - panY) / px) + 1;
  const visualGrid = visibleGridStep(gridStep, px, Math.max(x1 - x0, y1 - y0));

  // The drawing workspace is also a selection workspace when no tool is armed.
  // Hide the native crosshair only while its snapped canvas replacement is visible.
  const selecting = !tool || tool === "move" ||
    (tool === "draw" && (!drawSub || drawSub === "none" || !!cadEditId ||
      (drawSub === "line" && (selectedDraftSegment != null || !!selectedEdgeId))));
  const dimensionInteractive = !readOnly && !simulationActive && (workspace.editPlan||workspaceSection==='irrigation') && !pendingPlacement && !spaceDown && cadDrawing.layers?.dims?.locked !== true &&
    (multiSelect || selecting || tool === "place" || (tool === "draw" && drawSub === "dim"));
  const selectDimension = (id: string, additive=false) => {
    const st = useProject.getState();
    if (st.selectedId || st.selectedPolyId || st.selectedPlantId || st.selectedLandscapeId) st.selectHead(null);
    setSelectedNote(null);
    dimensionInteraction.current = true;
    setSelectedDimensions(previous=>updateDimensionSelection(previous,[id],additive,additive));
  };
  useEffect(() => {
    if (!dimensionInteractive || selectedId || selectedPlantId || selectedLandscapeId || selectedPolyId) {
      setSelectedDimension(null); setDimensionEditor(null); setDimensionPreview(null);
      dimensionInteraction.current = false;
    }
  }, [dimensionInteractive, selectedId, selectedPlantId, selectedLandscapeId, selectedPolyId]);
  useEffect(()=>{setSelectedDimension(null);dimensionInteraction.current=false;},[project.id,workspaceSection]);
  useEffect(()=>{dimensionInteraction.current=selectedDimensions.length>0;},[selectedDimensions]);
  const deleteSelectedDimensions=()=>{
    const st=useProject.getState(),d=drawingOrMigrate(st.project);
    const next=deleteDimensions(d,selectedDimensions);
    if(next!==d)st.commitDrawing(next,null,true);
    setSelectedDimension(null);setDimensionEditor(null);setDimensionPreview(null);dimensionInteraction.current=false;
  };
  useEffect(()=>{
    if(shortcutsDisabled||!selectedDimensions.length||!dimensionInteractive||!dimensionsVisible)return;
    const key=(event:KeyboardEvent)=>{
      if((event.target as HTMLElement)?.closest?.("input,textarea,select,[contenteditable=true],[role=dialog]"))return;
      if(event.key=== "Escape"){setSelectedDimension(null);dimensionInteraction.current=false;return;}
      if(event.key!=="Delete"&&event.key!=="Backspace")return;
      event.preventDefault();event.stopImmediatePropagation();deleteSelectedDimensions();
    };
    window.addEventListener("keydown",key,true);
    return ()=>window.removeEventListener("keydown",key,true);
  },[selectedDimensions,dimensionInteractive,dimensionsVisible,shortcutsDisabled]);
  const cutReady=useMemo(()=>tool === "draw" && drawSub === "cut" && Boolean(cutFigures(cadDrawing,draft.points)),[tool,drawSub,cadDrawing,draft.points]);
  const showLinePointer = !readOnly && tool === "draw" && (drawSub === "line" || drawSub === "dim" || (drawSub === "cut" && !cutReady)) &&
    !selecting && !spaceDown && !pinching && !!hoverPt;
  const showFirstPoint = !readOnly && tool === "draw" && (drawSub === "polygon" || drawSub === "spline") &&
    !draft.points.length && !selecting && !spaceDown && !pinching && !!hoverPt;
  const showTapePointer = !readOnly && tool === "measure" && measureSub === "measure" &&
    !spaceDown && !pinching && !!hoverPt;
  const cursor = readOnly || cutReady ? "default" : draggingHead ? "none" : mousePanning || pressedHead ? "grabbing" : spaceDown ? "grab"
     : manualPlacement ? "none" : pendingPlacement ? "crosshair"
    : hoveredHead && !multiSelect && (selecting || tool === "place") ? "pointer"
    : selecting || tool === "place" ? "default"
    : showLinePointer || showFirstPoint || showTapePointer ? "none"
    : tool === "draw" && drawSub === "text" ? "text" : "crosshair";
  const lawn = lawnPolygon(project.polygons);
  const holes = [...exclusionPolygons(project.polygons),...landscapeExclusions(cadDrawing)];
  const visibleHeads = useMemo(()=>!engineeringBase&&workspace.showIrrigation?visibleProjectHeads(project):[],[project.heads,project.zones,workspace.showIrrigation,engineeringBase]);
  const labelScale=.85*px/36;
  const dimensionSource=useMemo(()=>{const d=drawingOrMigrate(diagnosticProject);return engineeringBase?engineeringPlanDrawing(d):d;},[diagnosticProject,engineeringBase]);
  const dimensionScale=useMemo(()=>dimensionScaleResolver(dimensionSource),[dimensionSource]);
  const dimensionMode=engineeringBase?'plan':readOnly?undefined:workspaceSection==='irrigation'?'irrigation':'plan';
  const renderedDimensions=useMemo(()=>layoutDimensions(dimensionSource,px,
    dimensionMode,length=>formatLenU(length,useProject.getState().units.length),dimensionPreview),
    [dimensionSource,px,dimensionMode,dimensionPreview,locale,dimensionFormat]);
  const labelsInside=dimensionsVisible&&renderedDimensions.size>0;
  const headLabels=useMemo(()=>new Map(visibleHeads.map(h=>{
    const item=catalogForHead(h),nz=h.nozzleId?item?.nozzles.find(n=>n.id===h.nozzleId):item&&defaultNozzle(item);
    const model=item?catalogName(item):h.catalogId;
    const text=item?.type==='rotor'&&nz?`${model} (${nozzleName(nz)})`:model;
    return [h.id,equipmentLabel(text,labelScale,labelsInside)];
  })),[visibleHeads,labelScale,labelsInside]);
  const labelPositions=useMemo(()=>showHeadLabels?layoutHeadLabels(visibleHeads.map(h=>({
    ...h,...(headMovePreview?.id===h.id?headMovePreview:{}),width:headLabels.get(h.id)!.width,height:headLabels.get(h.id)!.height,
    radius:13*labelScale,priority:h.id===selectedId||selectedIds.includes(h.id),
  })),cadDrawing,px,dimensionsVisible?{boxes:[...renderedDimensions.values()].map(o=>o.box),segments:[...renderedDimensions.values()].flatMap(o=>o.segments)}:{boxes:[],segments:[]},labelsInside):new Map<string,Pt>(),
    [showHeadLabels,visibleHeads,headMovePreview,headLabels,labelScale,selectedId,selectedIds,cadDrawing,px,dimensionsVisible,renderedDimensions,labelsInside]);
  const annotationRequests=useMemo(()=>{
    const requests:InkRequest[]=[];
    if(dimensionsVisible)for(const row of renderedDimensions.values())requests.push({id:`dim:${row.id}`,x:row.text.x+panX,y:row.text.y+panY,dark:'#626b75'});
    if(showHeadLabels)for(const h of visibleHeads){
      const label=headLabels.get(h.id),position=labelPositions.get(h.id),point=headMovePreview?.id===h.id?headMovePreview:h;
      if(label&&position)requests.push({id:`head:${h.id}`,x:point.x*px+panX+position.x+label.width/2,y:point.y*px+panY+position.y+label.height/2,dark:'#626b75'});
    }
    return requests;
  },[dimensionsVisible,renderedDimensions,panX,panY,showHeadLabels,visibleHeads,headLabels,labelPositions,headMovePreview,px]);
  const annotationInk=useMemo(()=>{
    const heads=visibleHeads.map(h=>headMovePreview?.id===h.id?{...h,...headMovePreview}:h);
    return Object.fromEntries(annotationRequests.map(request=>[request.id,annotationPaintInk(
      {x:(request.x-panX)/px,y:(request.y-panY)/px},cadDrawing,heads,showCoverage&&!simulationActive,paintMask)]));
  },[annotationRequests,cadDrawing,visibleHeads,headMovePreview,showCoverage,simulationActive,paintMask,panX,panY,px]);

  const heat =
    analysis === "cover" || analysis === "overlap"
      ? lawn && visibleHeads.length <= 48
        ? sampleGrid(lawn, visibleHeads, 0.9, holes)
        : []
      : [];

  const rubberFrom =
    tool === "draw" &&
    draft.points.length &&
    !(drawSub === "cut" && (cutReady || (draft.points.length>=4 && dist(draft.points[0]!,draft.points.at(-1)!)<1e-8))) &&
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
  const polygonBoundaryPoints = drawSub === "polygon" ? draft.points : [];
  const polygonLivePoints =
    polygonPreviewPt &&
    polygonBoundaryPoints.length &&
    dist(polygonBoundaryPoints[polygonBoundaryPoints.length - 1]!, polygonPreviewPt) > 1e-7
      ? [...polygonBoundaryPoints, polygonPreviewPt]
      : polygonBoundaryPoints;
  const polygonFillPoints = polygonLivePoints;
  const polygonClosing = drawSub === "polygon" && snapHit?.kind === "close";
  const activeConstructionPoint =
    (drawSub === "polygon" ? activeDraftPolygonPoint : activeDraftSplinePoint) ??
    (draft.points.length > 1 ? draft.points.length - 1 : null);
  const beginPolygonDraftPointDrag = (
    pointIndex: number,
    e: Konva.KonvaEventObject<PointerEvent | MouseEvent | TouchEvent>,
  ) => {
    const originalPoints=useProject.getState().draft.points.map(p=>({...p}));
    const movePoint = (p: Pt) => {
      const snapped = snapPolygonDraftPoint(p, pointIndex);
      const st = useProject.getState();
      const next = st.draft.points.slice();
      if (!next[pointIndex]) return;
      next[pointIndex] = snapped.pt;
      st.setDraftPoints(next);
      setHoverPt(pointIndex === next.length - 1 ? snapped.pt : null);
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
        onHover?.(null);
        setSnapHit(null);
      },
      movePoint,
      (p) => {
        movePoint(p);
        const st = useProject.getState();
        const points = st.draft.points;
        if (pointIndex === points.length - 1 && pointIndex >= 3 && dist(points[pointIndex]!, points[0]!) * px <= 18) {
          st.setDraftPoints(points.slice(0, -1));
          st.closePolygon();
          setHoverPt(null);
        }
        setSnapHit(null);
      },
      skipClick,
      pinchGestureActive,
      () => setSnapHit(null),
      () => {
        const st = useProject.getState();
        if (st.drawSub !== "polygon") return;
        // Restore pre-tap coordinates: touch jitter must not move a revisited vertex.
        st.setDraftPoints(originalPoints);
        skipClick.current=true;
        window.setTimeout(()=>{skipClick.current=false;},500);
        pendingHover.current = null;
        if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current);
        hoverRaf.current = 0;
        setHoverPt(null);
        setSnapHit(null);
        setActiveDraftPolygonPoint(null);
        st.tapPolygonDraftPoint(pointIndex);
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
      st.drawSub === "cut" ||
      st.drawSub === "polygon" ||
      st.drawSub === "line" ||
      st.drawSub === "spline"
    )
      return;
    if (st.draft.points.length >= 2) st.finishOpenDraw();
  };

  const noteEnabled = !readOnly && !simulationActive &&
    (workspaceSection === 'plan' || workspaceSection === 'landscape' || workspaceSection === 'irrigation') &&
    !spaceDown && !pendingPlacement &&
    (!tool || tool === "move" || (tool === "draw" && (drawSub === "none" || drawSub === "text"))) &&
    cadDrawing.layers?.annotations?.locked !== true;
  const beginNote = (tx:CadText, e:Konva.KonvaEventObject<PointerEvent | TouchEvent | MouseEvent>) => {
    if(!noteEnabled || ("touches" in e.evt && e.evt.touches.length>1)) return;
    e.cancelBubble=true;
    if(editDrag.current) return;
    let anchor:Pt={x:tx.x,y:tx.y};
    const moved=(p:Pt)=>({x:tx.x+p.x-anchor.x,y:tx.y+p.y-anchor.y});
    bindPointerDrag(e,editDrag,panX,panY,px,
      p=>{anchor=p;setSelectedDimension(null);setDimensionEditor(null);dimensionInteraction.current=false;setSelectedNote(tx.id);const st=useProject.getState();st.setCadEdit(null);st.selectPoly(null);st.selectEdge(null);onSelectionClear?.();},
      p=>setNotePreview({id:tx.id,...moved(p)}),
      p=>{setNotePreview(null);useProject.getState().moveNote(tx.id,moved(p));},
      skipClick,pinchGestureActive,()=>setNotePreview(null),()=>{
        setNotePreview(null);setSelectedNote(tx.id);
      });
  };
  const beginNoteResize = (tx:CadText, corner:number, bounds:{width:number;height:number}, e:Konva.KonvaEventObject<PointerEvent | TouchEvent>) => {
    if(!noteEnabled || ("touches" in e.evt && e.evt.touches.length>1)) return;
    const right=corner===1 || corner===2, bottom=corner>=2;
    const anchor={x:tx.x+(right?0:bounds.width/px),y:tx.y+(bottom?0:bounds.height/px)};
    const vx=(right?1:-1)*bounds.width,vy=(bottom?1:-1)*bounds.height;
    let start:Pt={x:0,y:0};
    const scaled=(p:Pt)=>{
      const factor=Math.max(0.1/tx.size,Math.min(10/tx.size,1+((p.x-start.x)*px*vx+(p.y-start.y)*px*vy)/Math.max(1,vx*vx+vy*vy)));
      return {...tx,size:tx.size*factor,x:anchor.x-(right?0:bounds.width*factor/px),y:anchor.y-(bottom?0:bounds.height*factor/px)};
    };
    bindPointerDrag(e,editDrag,panX,panY,px,p=>{start=p;},p=>setNotePreview(scaled(p)),p=>{
      const st=useProject.getState(),d=drawingOrMigrate(st.project);
      setNotePreview(null);
      if(d.texts?.[tx.id]) st.commitDrawing({...d,texts:{...d.texts,[tx.id]:scaled(p)}},null,true);
    },skipClick,pinchGestureActive,()=>setNotePreview(null),()=>setNotePreview(null));
  };
  const beginLandscapeMove=(o:LandscapeObject,event:Konva.KonvaEventObject<PointerEvent|TouchEvent>)=>{
    event.cancelBubble=true;
    if(editDrag.current)return;
    const st=useProject.getState();if(pendingPlacement||st.spaceDown)return;
    st.selectLandscape(o.id);
    if(o.locked||landscapeLayerLocked(cadDrawing,o.category)){event.cancelBubble=true;return;}
    const start=clientXY(event.evt);
    bindClientDeltaDrag(event,editDrag,skipClick,(dx,dy,commit)=>{
      if(commit||(!dx&&!dy))setPlacementFocus('landscape-move',null);
      if(landscapeReturnDrop(start,dx,dy,commit)){setLandscapePreview(null);setLandscapeGuides([]);setSnapHit(null);useProject.getState().removeLandscape(o.id);return;}
      const state=useProject.getState(),drawing=drawingOrMigrate(state.project),hit=snapLandscapePoint({x:o.x+dx/px,y:o.y+dy/px},o,drawing,{pxPerMeter:px,snapOn:state.snapOn,snapGridOn:state.snapOn&&state.snapGridOn,gridStep:state.gridStep,heads:visibleProjectHeads(state.project),origin:o,pointerType:'pointerType' in event.evt?event.evt.pointerType:'touch'});
      if(commit){setLandscapePreview(null);setLandscapeGuides([]);setSnapHit(null);state.updateLandscape(o.id,hit.pt);}
      else{if(dx||dy)setPlacementFocus('landscape-move',hit.pt,o.id,hit.kind);setLandscapePreview(dx||dy?{...o,...hit.pt}:null);setSnapHit(dx||dy?hit:null);setLandscapeGuides(state.snapOn&&(dx||dy)?landscapeAlignmentGuides(hit.pt,o,drawing,px,o):[]);}
    },pinchGestureActive,()=>{setLandscapePreview(null);setLandscapeGuides([]);setSnapHit(null);});
  };
  const beginLandscapeResize=(o:LandscapeObject,axis:'both'|'length'|'width',event:Konva.KonvaEventObject<PointerEvent|TouchEvent>)=>{
    if(o.locked||landscapeLayerLocked(cadDrawing,o.category))return;
    bindClientDeltaDrag(event,editDrag,skipClick,(dx,dy,commit)=>{
      const size=resizeLandscapeObject(o,dx,dy,px,axis);
      if(commit){setLandscapePreview(null);useProject.getState().updateLandscape(o.id,size);}else setLandscapePreview(dx||dy?{...o,...size}:null);
    },pinchGestureActive,()=>setLandscapePreview(null));
  };
  const beginLandscapeRotate=(o:LandscapeObject,event:Konva.KonvaEventObject<PointerEvent|TouchEvent>)=>{
    if(o.locked||landscapeLayerLocked(cadDrawing,o.category))return;
    bindClientDeltaDrag(event,editDrag,skipClick,(dx,dy,commit)=>{
      const delta=objectToLocal(o,{x:o.x+dx,y:o.y+dy});
      const rotation=snapLandscapeRotation(o.rotation+Math.atan2(delta.x,o.width*px/2+30*plantUiScale-delta.y)*180/Math.PI,useProject.getState().snapOn);
      if(commit){setLandscapePreview(null);useProject.getState().updateLandscape(o.id,{rotation});}else setLandscapePreview(dx||dy?{...o,rotation}:null);
    },pinchGestureActive,()=>setLandscapePreview(null));
  };

  const beginPlantMove = (plant: CadPlant, event: Konva.KonvaEventObject<PointerEvent | TouchEvent>) => {
    event.cancelBubble=true;
    if(editDrag.current)return;
    const st = useProject.getState();
    if (st.pendingCatalogPlant || st.pendingLandscapeObject || st.spaceDown || (st.tool && st.tool !== "move" && !(st.tool === "draw" && st.drawSub === "none"))) return;
    if (plant.locked || plantLayerLocked(cadDrawing,plant.kind)) { event.cancelBubble = true; st.selectPlant(plant.id); return; }
    st.selectPlant(plant.id);
    const start=clientXY(event.evt);
    bindClientDeltaDrag(event, editDrag, skipClick, (dx, dy, commit) => {
      if(commit||(!dx&&!dy))setPlacementFocus('plant-move',null);
      if(landscapeReturnDrop(start,dx,dy,commit)){setPlantPreview(null);setSnapHit(null);useProject.getState().removePlant(plant.id);return;}
      const state = useProject.getState();
      const hit = cadSnap({x:plant.x+dx/px,y:plant.y+dy/px}, drawingOrMigrate(state.project), {
        pxPerMeter: px, snapOn: state.snapOn, snapGridOn: state.snapOn && state.snapGridOn,
        gridStep: state.gridStep, heads: visibleProjectHeads(state.project), excludePlant: plant.id,
      });
      if (commit) { setPlantPreview(null); setSnapHit(null); state.updatePlant(plant.id, hit.pt); }
      else { if(dx||dy)setPlacementFocus('plant-move',hit.pt,plant.id,hit.kind);setPlantPreview(dx || dy ? {...plant,...hit.pt} : null); setSnapHit(dx || dy ? hit : null); }
    }, pinchGestureActive, () => {setPlantPreview(null); useProject.getState().selectPlant(plant.id);});
  };
  const beginPlantResize = (plant: CadPlant, event: Konva.KonvaEventObject<PointerEvent | TouchEvent>) => {
    if (plant.locked || plantLayerLocked(cadDrawing,plant.kind)) return;
    bindClientDeltaDrag(event, editDrag, skipClick, (dx, dy, commit) => {
      const r = resizedPlantRadius(plant.r,dx,dy,px);
      if (commit) { setPlantPreview(null); useProject.getState().updatePlant(plant.id, {r}); }
      else setPlantPreview(dx || dy ? {...plant,r} : null);
    }, pinchGestureActive, () => setPlantPreview(null));
  };
  const beginPlantRotate = (plant: CadPlant, event: Konva.KonvaEventObject<PointerEvent | TouchEvent>) => {
    if (plant.locked || plantLayerLocked(cadDrawing,plant.kind)) return;
    bindClientDeltaDrag(event, editDrag, skipClick, (dx,dy,commit) => {
      const rotation=normalizedPlantRotation((plant.rotation??0) + Math.atan2(dx,plant.r*px+30*plantUiScale-dy)*180/Math.PI);
      if(commit){setPlantPreview(null);useProject.getState().updatePlant(plant.id,{rotation});}
      else setPlantPreview(dx||dy?{...plant,rotation}:null);
    },pinchGestureActive,()=>setPlantPreview(null));
  };

  const selectedText = selectedNote ? cadDrawing.texts?.[selectedNote] : undefined;

  return (
    <div
      ref={wrapRef}
      data-design-canvas="1"
      onPointerDownCapture={event => {
        if(tool==='auto-head')return;
        if (!readOnly && event.pointerType === "mouse" && (event.button === 2 || event.button === 1) && (event.target as HTMLElement).tagName === "CANVAS") {
          event.preventDefault(); event.stopPropagation(); endCadHold();
          const st = useProject.getState();
          mousePan.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: st.panX, panY: st.panY };
          setMousePanning(true); setHoveredHead(null);
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
        if(dimensionEditor && !(event.target as HTMLElement).closest?.('.dimension-value-editor, .dimension-delete-action')) {
          applyDimensionLabel();event.preventDefault();event.stopPropagation();return;
        }
        beginCanvasContact();
        if(noteEnabled && event.button===0 && (event.target as HTMLElement).tagName==="CANVAS") {
          const rect=event.currentTarget.getBoundingClientRect();
          const hit=canvasNoteHit(stageRef.current,{x:event.clientX-rect.left,y:event.clientY-rect.top});
          const note=hit&&cadDrawing.texts?.[hit.id];
          if(hit&&note){
            if(!hit.resize){
              event.stopPropagation();
              beginNote(note,{evt:event.nativeEvent,target:hit.node,cancelBubble:false} as Konva.KonvaEventObject<PointerEvent>);
            }
            return; // Text and its handles take priority over the selection marquee.
          }
        }
        if (!multiSelect || readOnly || spaceDown || event.button !== 0 || (event.target as HTMLElement).tagName !== "CANVAS") return;
        if (!event.isPrimary) {
          box.current = null; setBoxNow(null); marqueePointer.current = null;
          return;
        }
        event.preventDefault(); event.stopPropagation();
        endCadHold();
        const st = useProject.getState();
        box.current = worldOfPointer(event.clientX,event.clientY,event.currentTarget,st.panX,st.panY,st.pxPerMeter);
        setBoxNow(box.current);
        marqueePointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMoveCapture={event => {
        if (mousePan.current?.pointerId === event.pointerId) {
          event.preventDefault(); event.stopPropagation();
          const start = mousePan.current;
          useProject.getState().setPan(start.panX + event.clientX - start.x, start.panY + event.clientY - start.y);
          return;
        }
        if (event.pointerType === "mouse") {
          pointerType.current = "mouse";
          const st = useProject.getState();
          const canHover = !readOnly && st.catalogOpen && !multiSelect && !st.pendingCatalogPlant && !st.pendingLandscapeObject && !st.spaceDown &&
            (selecting || tool === "place") && (event.target as HTMLElement).tagName === "CANVAS";
          const point = worldOfPointer(event.clientX, event.clientY, event.currentTarget, st.panX, st.panY, st.pxPerMeter);
          setHoveredHead(canHover ? headAtPointer(st.project.heads, st.project.zones, point, st.pxPerMeter) : null);
        }
        if (marqueePointer.current !== event.pointerId || !box.current) return;
        event.preventDefault(); event.stopPropagation();
        const st = useProject.getState();
        setBoxNow(worldOfPointer(event.clientX,event.clientY,event.currentTarget,st.panX,st.panY,st.pxPerMeter));
      }}
      onPointerLeave={() => setHoveredHead(null)}
      onPointerUpCapture={event => {
        setPressedHead(null);
        if (mousePan.current?.pointerId === event.pointerId) {
          event.preventDefault(); event.stopPropagation();
          mousePan.current = null; setMousePanning(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          return;
        }
        if (marqueePointer.current !== event.pointerId || !box.current) return;
        event.preventDefault(); event.stopPropagation();
        const st = useProject.getState(), d = drawingOrMigrate(st.project);
        const a = box.current;
        const b = worldOfPointer(event.clientX,event.clientY,event.currentTarget,st.panX,st.panY,st.pxPerMeter);
        box.current = null; setBoxNow(null); marqueePointer.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        skipClick.current = true;
        const tap=Math.hypot(b.x-a.x,b.y-a.y)*st.pxPerMeter < 5;
        const dimensionIds=dimensionsVisible&&dimensionInteractive ? dimensionsInBox(d,a,b,st.pxPerMeter,st.workspaceSection==='irrigation'?'irrigation':'plan',length=>formatLenU(length,st.units.length),tap) : [];
        const target=irrigationSelectionTarget(st.workspaceSection==='irrigation'
          ? st.project.heads.filter(h=>isHeadVisible(h,st.project.zones)) : [],dimensionIds,a,b,st.pxPerMeter,tap);
        if(target?.kind==='heads'){
          setSelectedDimension(null);setDimensionEditor(null);setDimensionPreview(null);dimensionInteraction.current=false;
          const additive=tap||event.shiftKey||event.metaKey||event.ctrlKey;
          st.selectHeads(updateDimensionSelection(st.selectedIds,target.ids,additive,tap));
          return;
        }
        if(target?.kind==='dimensions'){
          st.selectHead(null);setSelectedNote(null);setDimensionEditor(null);dimensionInteraction.current=true;
          setSelectedDimensions(previous=>updateDimensionSelection(previous,dimensionIds,tap||event.shiftKey||event.metaKey||event.ctrlKey,tap));
          return;
        }
        setSelectedDimension(null);dimensionInteraction.current=false;
        if(!canvasWorkspace(st.workspaceSection).editPlan){
          if(tap){
            const node=stageRef.current?.getIntersection({x:b.x*st.pxPerMeter+st.panX,y:b.y*st.pxPerMeter+st.panY});
            if(!node||node.name()==='bg')clearEmptyCanvasSelection();
          }
          return;
        }
        if (tap) {
          const hit = pickOpenPathAt(d,b,14/st.pxPerMeter) ?? pickFaceAt(d,b);
          if (hit) st.selectPoly(hit,true);
          else {
            // Clear only a tap on empty drawing space, never a pan, a box drag or an overlay.
            const node = stageRef.current?.getIntersection({x: b.x * st.pxPerMeter + st.panX, y: b.y * st.pxPerMeter + st.panY});
            if (!node || node.name() === "bg") {
              st.selectHead(null);
              st.selectPoly(null);
              st.setCadMode("select");
              setSelectedNote(null); setSelectedDimension(null); setPickList(null);
              onSelectionClear?.();
            }
          }
          return;
        }
        const ids = Object.values(d.faces).filter(face => {
          if (face.hidden) return false;
          if (d.layers?.[layerForType(face.type)]?.visible === false) return false;
          const pts = facePoints(d,face.id);
          const closed = !face.segment && (face.spline?.closed ?? face.freehand?.closed ?? true);
          return pathTouchesBox(pts,closed,a,b,faceHoles(d,face.id));
        }).map(face => face.id);
        if (!event.shiftKey && !event.metaKey && !event.ctrlKey) st.selectPoly(null);
        for (const id of ids) if (!useProject.getState().selectedPolyIds.includes(id)) st.selectPoly(id,true);
        if (!ids.length && !event.shiftKey && !event.metaKey && !event.ctrlKey) st.selectHeads([]);
      }}
      onPointerCancelCapture={event => {
        manualTracker.current?.clear();
        setPressedHead(null);
        if (mousePan.current?.pointerId === event.pointerId) { mousePan.current = null; setMousePanning(false); }
        if (marqueePointer.current !== event.pointerId) return;
        box.current = null; setBoxNow(null); marqueePointer.current = null;
      }}
      onLostPointerCapture={event => {
        if (mousePan.current?.pointerId === event.pointerId) { mousePan.current = null; setMousePanning(false); }
        if (marqueePointer.current !== event.pointerId) return;
        box.current = null; setBoxNow(null); marqueePointer.current = null;
      }}
      onClickCapture={event => { if (multiSelect && (event.target as HTMLElement).tagName === "CANVAS") { event.preventDefault(); event.stopPropagation(); } }}
      onTouchStartCapture={beginCanvasContact}
      className="relative h-full min-h-0 w-full overflow-hidden touch-none bg-surface-2"
      onContextMenu={(e) => e.preventDefault()}
    >
      {textEditor && <TextEditor key={textEditor.id} note={textEditor} onClose={()=>setTextEditor(null)} onSave={note=>{
        const st=useProject.getState(),d=drawingOrMigrate(st.project);
        st.commitDrawing({...d,texts:{...d.texts,[note.id]:note}},null,true);
        if(st.workspaceSection === 'plan') st.setCadMode("select");
        st.selectPoly(null);setSelectedNote(note.id);setTextEditor(null);
      }}/>}
      {selectedText && !textHidden && noteEnabled && !textEditor && !pinching && cadDrawing.layers?.annotations?.visible !== false && createPortal(
        <section className="note-canvas-actions" onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
          <button type="button" onClick={()=>setTextEditor(selectedText)}><Pencil size={16}/>{tr(locale,"edit")}</button>
          <button type="button" className="text-danger" onClick={()=>{
            const st=useProject.getState(),d=drawingOrMigrate(st.project),texts={...d.texts};
            delete texts[selectedText.id];st.commitDrawing({...d,texts},null,true);setSelectedNote(null);
          }}><Trash2 size={16}/>{tr(locale,"delete")}</button>
        </section>,document.querySelector("[data-note-actions]") ?? wrapRef.current!)}
      {draggingHead && createPortal(<div ref={trashPreview} className="head-return-trash" aria-hidden="true"><Trash2 size={30} strokeWidth={1.25}/></div>, document.body)}
      <Stage
        ref={stageRef}
        listening={!readOnly}
        width={size.w}
        height={size.h}
        style={{ position: "absolute", top: 0, left: 0, width: size.w, height: size.h, cursor }}
        onClick={e=>{if(e.evt.button !== 0) return;setSelectedDimension(null);setDimensionEditor(null);dimensionInteraction.current=false;handleClick(e);}}
        onTap={e=>{setSelectedDimension(null);setDimensionEditor(null);dimensionInteraction.current=false;handleClick(e);}}
        onDblClick={finishOpenDrawFromDoubleTap}
        onDblTap={finishOpenDrawFromDoubleTap}
        onMouseEnter={(e) => trackPointer(toWorld(e.target.getStage()))}
        onMouseDown={(e) => {
          if(editDrag.current){e.cancelBubble=true;return;}
          pointerType.current = "mouse";
          if(e.evt.button===0 && !spaceDown) startSegmentHold(toWorld(e.target.getStage()));
          if (e.evt.button === 0 && !spaceDown && tool === "draw" && drawSub === "freehand") {
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
          if (!tool && !pendingPlacement && e.target.name() === "bg") {
            box.current = toWorld(e.target.getStage());
            setBoxNow(box.current);
          }
        }}
        onMouseUp={() => {
          endCadHold();
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
              const ids = visibleHeads
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
          manualTracker.current?.clear();
          endCadHold();
          panDrag.current = null;
          pendingHover.current = null;
          if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current);
          hoverRaf.current = 0;
          setHoverPt(null);
          setSnapHit(null);
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
          if(touches.length===1) { startSegmentHold(toWorld(e.target.getStage())); if(manualPlacement)trackPointer(toWorld(e.target.getStage())); }
          else endCadHold();
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
        onTouchCancel={()=>endCadHold()}
        onTouchEnd={(e) => {
          endCadHold();
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
            <ReferenceCanvas underlay={u} image={img} px={px} panX={panX} panY={panY} readOnly={readOnly} />
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
              : <CoverageGeom
                  clip={figurePaintClip}
                  materialOpacity={engineeringBase?ENGINEERING_BACKGROUND.materials:1}
                  key={poly.id}
                  poly={poly} sx={sx} sy={sy} px={px}
                  selectedPolyId={selectedPolyId} selectedPolyIds={selectedPolyIds}
                  fillOf={(k) => REGION_FILL[k as keyof typeof REGION_FILL] ?? "#ddd"}
                  startHold={startCadHold} endHold={endCadHold}
                  passThrough={!workspace.editPlan || DRAW_CREATE.has(drawSub) || tool === "place" || tool === "measure" || tool === "scale" || !!pendingPlacement}
                  previewPoints={liveCadPath?.faceId === poly.id && cadEditId === poly.id ? liveCadPath.points : null}
                  appearance={appearance} textureImages={textureImages}
                />,
          )}
          {simulationActive&&<SimulationLawn surface={simulationLawn} image={textureImages["texture:lawn-parterre"]} px={px} panX={panX} panY={panY}/>}
          {Object.values(cadDrawing.faces).map((face) => {
            if (!face.spline?.closed || face.hidden ||
              cadDrawing.layers?.[layerForType(face.type)]?.visible === false ||
              !dimensionsVisible ||
              (cadEditId && layerFaceIds(cadDrawing, cadEditId).includes(face.id))) return null;
            const center = faceCentroid(cadDrawing, face.id);
            return <Text
              key={`curve-area-${face.id}`}
              x={sx(center.x) - 60} y={sy(center.y) - 8} width={120}
              align="center" text={formatAreaU(faceArea(cadDrawing, face.id), areaUnit)}
              fontSize={12} fontFamily="IBM Plex Sans, sans-serif"
              fill={appearance.ink} stroke={appearance.bg} strokeWidth={2}
              fillAfterStrokeEnabled listening={false}
            />;
          })}
          {workspace.showLandscape&&Object.values(cadDrawing.landscapeObjects??{}).filter(o=>landscapeLayerVisible(cadDrawing,o.category,o)).map(original=>{
            const object=landscapePreview?.id===original.id?landscapePreview:original;
            return <Group key={object.id} opacity={engineeringBase?(object.category==='furniture'?ENGINEERING_BACKGROUND.furniture:ENGINEERING_BACKGROUND.decoration):1}><LandscapeObjectGlyph object={object} x={sx(object.x)} y={sy(object.y)} px={px} uiScale={plantUiScale} selected={selectedLandscapeId===object.id} locked={landscapeLayerLocked(cadDrawing,object.category)} interactive={!readOnly&&!pendingPlacement&&!spaceDown&&(!tool||tool==='move'||tool==='draw'&&drawSub==='none')} onBegin={e=>beginLandscapeMove(original,e)} onResize={(axis,e)=>beginLandscapeResize(original,axis,e)} onRotate={e=>beginLandscapeRotate(original,e)}/></Group>;
          })}
          {workspace.showLandscape&&cadDrawing.layers?.plants?.visible !== false && Object.values(cadDrawing.plants ?? {}).filter(p=>plantLayerVisible(cadDrawing,p.kind,p)).map(original => {
            const plant = plantPreview?.id === original.id ? plantPreview : original;
            return <Group key={plant.id} opacity={engineeringBase?ENGINEERING_BACKGROUND.plants:1}><PlantGlyph plant={plant} x={sx(plant.x)} y={sy(plant.y)} px={px}
              uiScale={plantUiScale} locked={plantLayerLocked(cadDrawing,plant.kind)} selected={selectedPlantId === plant.id} showLabel={showLabels} interactive={!readOnly && !pendingPlacement && !spaceDown && (!tool || tool === "move" || tool === "draw" && drawSub === "none")}
              onBegin={e => beginPlantMove(original,e)} onResize={e => beginPlantResize(original,e)} onRotate={e=>beginPlantRotate(original,e)} /></Group>;
          })}
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
            textHidden || drawingOrMigrate(project).layers?.annotations?.visible === false ? null : (
              <CanvasNote
                key={tx.id}
                note={{...tx,...(notePreview?.id===tx.id ? notePreview : {})}}
                x={sx(notePreview?.id === tx.id ? notePreview.x : tx.x)}
                y={sy(notePreview?.id === tx.id ? notePreview.y : tx.y)}
                px={px} ink={appearance.ink} enabled={noteEnabled}
                selected={noteEnabled && selectedNote===tx.id && !textEditor}
                onBegin={e=>beginNote(tx,e)} onSelect={()=>setSelectedNote(tx.id)}
                onResize={(corner,bounds,e)=>beginNoteResize(tx,corner,bounds,e)}
              />
            ),
          )}
          {(readOnly || workspaceSection === 'irrigation' || simulationActive) &&
            headPaintOrder(visibleHeads, [...selectedIds,...(selectedId?[selectedId]:[]),...(diagnosticIssue?.headIds??[])],
              !simulationActive && zoneFocus?.projectId === project.id ? zoneFocus.headId : null)
              .map((h) => {
                const item = catalogForHead(h);
                const selected = h.id === selectedId || selectedIds.includes(h.id);
                // A normal marker can cover the entire 0.3 m micro-stream
                // pattern. Shrink only its paint in simulation, keeping the
                // true throw and the independently sized pointer hit target.
                const baseSymbolScale = headSymbolScale(px);
                const symbolScale = simulationActive && item?.type === 'bubbler' && item.coverageKind === 'streams' && h.r > 0
                  ? Math.min(baseSymbolScale, h.r * px * .25 / HEAD_SYMBOL_RADIUS) : baseSymbolScale;
                const symbolRadius = (selected ? 13 : HEAD_SYMBOL_RADIUS) * symbolScale;
                const special=specialFootprint(h)?.flatMap(p=>[p.x*px,p.y*px]);
                const rPx = h.r * px;
                const strip = item && stripAtPressure(item, h.designPressure);
                const rotorColor = equipmentAppearance(item,h.nozzleId).color;
                const grabR =
                  item?.type === "rotor" || item?.family === "st" || item?.family === "golf"
                    ? 48
                    : 36;
                const canDrag =
                  !readOnly && !spaceDown && !multiSelect && !pendingPlacement &&
                  !(tool === "draw" && drawSub !== "none") &&
                  tool !== "measure" &&
                  tool !== "scale" &&
                  !h.locked &&
                  !lockedZones.has(h.zone);
                return (
                  <Group
                    key={h.id}
                    placementId={h.id}
                    listening={!pendingPlacement && !multiSelect}
                    x={sx(h.x)}
                    y={sy(h.y)}
                    draggable={canDrag && sectorEditId !== h.id && !diagnosticHeads.some(head => head.id === h.id)}
                    dragDistance={12}
                    hitFunc={(ctx: Konva.Context, shape: Konva.Shape) => {
                      ctx.beginPath();
                      ctx.arc(0, 0, grabR, 0, Math.PI * 2, false);
                      ctx.closePath();
                      ctx.fillStrokeShape(shape);
                    }}
                    onPointerDown={(ev) => {
                      if ((ev.evt as PointerEvent).pointerType === "mouse" && (ev.evt as PointerEvent).button !== 0) return;
                      if ((tool === "draw" && drawSub !== "none") || tool === "measure" || tool === "scale") return;
                      ev.cancelBubble = true;
                      pointerType.current = (ev.evt as PointerEvent).pointerType || "mouse";
                      if (canDrag) {
                        setPressedHead(h.id);
                        headHold.current?.();
                        headHold.current = startSprinklerHold(ev.evt as PointerEvent, () => {
                          if (pinchGestureActive.current) return;
                          skipClick.current = true;
                          window.setTimeout(() => { skipClick.current = false; }, 600);
                          setPressedHead(null);
                          useProject.getState().setSectorEdit(h.id);
                        });
                      }
                    }}
                    onPointerUp={() => setPressedHead(null)}
                    onPointerCancel={() => setPressedHead(null)}
                    onDragStart={(ev) => {
                      headHold.current?.();
                      setDraggingHead(true);
                      ev.cancelBubble = true;
                      overCatalog.current = false;
                      draggedHeadNode.current = ev.target;
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
                        const inside = inLib(e.clientX, e.clientY);
                        overCatalog.current = inside;
                        const lib = document.querySelector("[data-catalog]");
                        if (inside) lib?.setAttribute("data-head-drop", "true");
                        else lib?.removeAttribute("data-head-drop");
                        ev.target.opacity(inside ? 0 : 1);
                        if (trashPreview.current) {
                          trashPreview.current.style.display = inside ? "grid" : "none";
                          trashPreview.current.style.left = `${e.clientX}px`;
                          trashPreview.current.style.top = `${e.clientY}px`;
                        }
                      };
                      headDragMove.current = move;
                      window.addEventListener("pointermove", move, true);
                    }}
                    onDragMove={(ev) => {
                      const world = {
                        x: (ev.target.x() - panX) / px,
                        y: (ev.target.y() - panY) / px,
                      };
                      const st = useProject.getState();
                      const hit = snapSprinklerPoint(world, drawingOrMigrate(st.project), {
                        snapOn: st.snapOn, pxPerMeter: px, pointerType: pointerType.current,
                        snapGridOn:st.snapGridOn,gridStep:st.gridStep,heads:visibleProjectHeads(st.project),excludeHead:h.id,
                      });
                      const pt=hit.pt;
                      ev.target.position({ x: sx(pt.x), y: sy(pt.y) });
                      setPlacementFocus('head-move',pt,h.id,hit.kind);
                      // Konva moves the head immediately. Commit the matching
                      // coverage and paint masks before its next canvas draw.
                      const preview = { id: h.id, ...pt };
                      if (coverageProjectId === project.id || diagnosticIssue) {
                        flushSync(() => setHeadMovePreview(preview));
                      } else setHeadMovePreview(preview);
                    }}
                    onDragEnd={(ev) => flushSync(() => {
                      setPlacementFocus('head-move',null);
                      setHeadMovePreview(null);
                      ev.target.opacity(1); draggedHeadNode.current = null;
                      document.querySelectorAll("[data-head-drop]").forEach(el => el.removeAttribute("data-head-drop"));
                      if (trashPreview.current) trashPreview.current.style.display = "none";
                      setDraggingHead(false); setPressedHead(null); setHoveredHead(h.id);
                      if (headDragMove.current) {
                        window.removeEventListener("pointermove", headDragMove.current, true);
                        headDragMove.current = null;
                      }
                      document.documentElement.removeAttribute("data-head-drag");
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
                      const raw = {
                        x: (ev.target.x() - panX) / px,
                        y: (ev.target.y() - panY) / px,
                      };
                      const st = useProject.getState();
                      const world = snapSprinklerPoint(raw, drawingOrMigrate(st.project), {
                        snapOn: st.snapOn, pxPerMeter: px, pointerType: pointerType.current,
                        snapGridOn:st.snapGridOn,gridStep:st.gridStep,heads:visibleProjectHeads(st.project),excludeHead:h.id,
                      }).pt;
                      ev.target.position({ x: sx(world.x), y: sy(world.y) });
                      useProject.getState().finishMoveHead(h.id, world);
                    })}
                    onClick={(ev) => {
                      if (ev.evt.button !== 0) return;
                      if ((tool === "draw" && drawSub !== "none") || tool === "measure" || tool === "scale") return;
                      ev.cancelBubble = true;
                      if (skipClick.current) return;
                      useProject.getState().selectHead(h.id);
                    }}
                    onTap={(ev) => {
                      if ((tool === "draw" && drawSub !== "none") || tool === "measure" || tool === "scale") return;
                      ev.cancelBubble = true;
                      if (skipClick.current) return;
                      useProject.getState().selectHead(h.id);
                    }}
                  >
                    {showCoverage && !simulationActive && item && operatingGeometryAvailable(item,h) && supportsArc(item,h.arc) && h.r>=0 && (!item.strip || strip) && item.coverageKind !== "point" && item.coverageKind !== "streams" && (
                      <Group listening={false} clipFunc={sprinklerPaintClip(paintMask, px, h, headMovePreview)}>
                      <Line
                        points={special ?? (strip ? stripLocal(strip, h.start, px) : sectorLocal(rPx, h.start, h.arc))}
                        closed
                        fill={rotorColor}
                        opacity={selected ? 0.55 : 0.32}
                        stroke={rotorColor}
                        strokeWidth={selected ? 2.5 : 1.5}
                        lineJoin="miter"
                        listening={false}
                      />
                      </Group>
                    )}
                    {simulationActive && <WateringHead head={h} elapsed={wateringTime} px={px}/>}
                    <Circle radius={pointerType.current === "mouse" ? HEAD_MOUSE_HIT_RADIUS : grabR} fill="transparent" />
                    <Circle
                      radius={symbolRadius}
                      fill="#fff"
                      stroke={zoneColor(h.zone)}
                      strokeWidth={(selected ? 3.2 : 2.6) * symbolScale}
                      listening={false}
                    />
                    <Circle radius={4 * symbolScale} fill={zoneColor(h.zone)} listening={false} />
                    {!simulationActive && zoneFocus?.projectId === project.id && zoneFocus.zoneId === h.zone &&
                      (zoneFocus.headId == null || zoneFocus.headId === h.id) &&
                      <FocusedHead symbolScale={symbolScale} elapsed={wateringTime} points={item?.coverageKind === "point"||item?.coverageKind === "streams" ? [] : special ?? (strip ? stripLocal(strip, h.start, px) : sectorLocal(rPx, h.start, h.arc))}/>}
                  </Group>
                );
              })}
          {(simulationActive || workspaceSection === 'irrigation' && zoneFocus?.projectId === project.id) && <ZoneHighlights elapsed={wateringTime}/>}
          {sectorHead && !diagnosticHeads.some(h => h.id === sectorHead.id) && <HeadSectorHandles key={sectorHead.id} head={sectorHead} px={px} panX={panX} panY={panY}
            editDrag={editDrag} gestureBlocked={pinchGestureActive} skipClick={skipClick}
            onCenterDragChange={active => setPressedHead(active ? sectorHead.id : null)}/>}
          {workspace.editPlan && <CornerRoundingHandles px={px} panX={panX} panY={panY} editDrag={editDrag} skipClick={skipClick} gestureBlocked={pinchGestureActive}/>}
          {cadEditId && drawingOrMigrate(project).faces[cadEditId]?.layerId && <LayerHandles faceId={cadEditId} px={px} panX={panX} panY={panY} editDrag={editDrag} skipClick={skipClick} gestureBlocked={pinchGestureActive} />}
          {cadEditId && !drawingOrMigrate(project).faces[cadEditId]?.layerId && (
            <>
              {cadDrawing.faces[cadEditId]?.rounding ? <RoundedFigureHandles faceId={cadEditId} px={px} panX={panX} panY={panY} editDrag={editDrag} skipClick={skipClick} gestureBlocked={pinchGestureActive}/> : <CadHandles
                faceId={cadEditId}
                sx={sx}
                sy={sy}
                px={px}
                panX={panX}
                panY={panY}
                editDrag={editDrag}
                skipClick={skipClick}
                gestureBlocked={pinchGestureActive}
                onSegmentEditDone={finishSegmentEditOnTap}
                onPreviewPath={(points) =>
                  setLiveCadPath(points ? { faceId: cadEditId, points } : null)
                }
              />}
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
                stroke={appearance.accent}
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
              {polygonFillPoints.slice(1).map((point, i) => <SegmentLengthText key={`draft-length-${i}`} a={polygonFillPoints[i]!} b={point} sx={sx} sy={sy} px={px} unit={measureUnit} outsideWinding={shoelace(polygonFillPoints)} />)}
              {polygonFillPoints.length >= 3 && polygonArea(polygonFillPoints)>1e-8 && <Text x={sx(centroid(polygonFillPoints).x)-60} y={sy(centroid(polygonFillPoints).y)-8} width={120} align="center" text={formatAreaU(polygonArea(polygonFillPoints),areaUnit)} fontSize={14} fill={appearance.ink} stroke={appearance.bg} strokeWidth={2} fillAfterStrokeEnabled listening={false}/>}
              {polygonClosing && polygonBoundaryPoints.length >= 3 && <Line points={[sx(polygonBoundaryPoints[polygonBoundaryPoints.length-2]!.x),sy(polygonBoundaryPoints[polygonBoundaryPoints.length-2]!.y),sx(polygonBoundaryPoints[0]!.x),sy(polygonBoundaryPoints[0]!.y)]} stroke={appearance.guideAligned} strokeWidth={1} dash={[5,4]} listening={false}/>}
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
                  name="magnifier-symbol construction-point"
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
                  {i === 0 ? <ConstructionOrigin color={appearance.accent} closing={polygonClosing}/> : <Circle
                    radius={i === 0 || polygonClosing ? 7 : activeConstructionPoint === i ? 11 : 7}
                    fill={i === 0 ? "#d56a2b" : activeConstructionPoint === i ? "#f5222d" : "#d56a2b"}
                    stroke={appearance.handleOutline}
                    strokeWidth={1.5}
                    listening={false}
                  />}
                  {i !== 0 && <Text
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
                  />}
                </Group>
              ) : drawSub === "spline" ? (
                <Group
                  key={`d${i}`}
                  name="magnifier-symbol construction-point"
                  x={sx(pt.x)}
                  y={sy(pt.y)}
                  onMouseDown={(e) => {
                    e.cancelBubble = true;
                  }}
                  onPointerDown={(e) => beginSplineDraftPointDrag(i, e)}
                  onTouchStart={(e) => beginSplineDraftPointDrag(i, e)}
                >
                  <Circle radius={20} fill="rgba(255,255,255,0.001)" />
                  {i === 0 ? <ConstructionOrigin color={appearance.accent} closing={snapHit?.kind === "close"}/> : <Circle
                    radius={i === 0 ? 9 : activeConstructionPoint === i ? 11 : 7}
                    fill={
                      i === 0 ? appearance.accent : activeConstructionPoint === i
                        ? "#f5222d" : "#d56a2b"
                    }
                    stroke={appearance.handleOutline}
                    strokeWidth={2}
                    listening={false}
                  />}
                </Group>
              ) : (
                i === 0 ? <Group key={`d${i}`} name="magnifier-symbol" x={sx(pt.x)} y={sy(pt.y)} listening={false}><ConstructionStartMark color={appearance.accent}/></Group> : <Circle
                  key={`d${i}`}
                  name="magnifier-symbol"
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
          {tool === "draw" && !pinching && <ClosureGuide points={draft.points} drawSub={drawSub} hover={hoverPt} px={px} sx={sx} sy={sy} />}
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
                  <Text x={x-50} y={y+14} width={100} align="center" text={formatLenU(0,useProject.getState().units.length)} fontSize={13} fill={appearance.ink} listening={false} />
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
          {selectedEdgeId && (
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
          {showFirstPoint && hoverPt && (
            <Group name="magnifier-symbol" x={sx(hoverPt.x)} y={sy(hoverPt.y)} listening={false}>
              <Circle radius={6} fill={appearance.accent}/>
            </Group>
          )}
          {showLinePointer && hoverPt && (
              <Group name="magnifier-symbol" x={sx(hoverPt.x)} y={sy(hoverPt.y)} listening={false}>
                <Line
                  points={[-9, 0, 9, 0]}
                  stroke={appearance.accent}
                  strokeWidth={2}
                  lineCap="round"
                />
                <Line
                  points={[0, -9, 0, 9]}
                  stroke={appearance.accent}
                  strokeWidth={2}
                  lineCap="round"
                />
                <Circle
                  radius={3}
                  fill="#fff"
                  stroke={appearance.accent}
                  strokeWidth={1.5}
                />
              </Group>
            )}
          {snapOn&&(drawSub === "line"||drawSub==='polygon') && !cadEditId && rubberFrom && rubberTo && dist(rubberFrom,rubberTo)*px > 6 &&
            <SegmentAlignmentGuides drawing={cadDrawing} point={rubberTo} fixed={rubberFrom} extraPoints={drawSub==='polygon'?draft.points:undefined} sx={sx} sy={sy} px={px} appearance={appearance}/>}
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
                stroke={appearance.guideAligned}
                strokeWidth={1}
                dash={[4, 6]}
                opacity={0.95}
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
          {dimensionsVisible && tool === "draw" && drawSub === "dim" && rubberFrom && rubberTo && (()=>{
            const st=useProject.getState(),length=dist(rubberFrom,rubberTo)||1;
            const offset=outsideDimensionOffset(cadDrawing,rubberFrom,rubberTo,st.dimensionOffsetCustomized ? st.dimensionOffset : gridStep*2);
            const nx=-(rubberTo.y-rubberFrom.y)/length,ny=(rubberTo.x-rubberFrom.x)/length;
            const a={x:sx(rubberFrom.x+nx*offset),y:sy(rubberFrom.y+ny*offset)};
            const b={x:sx(rubberTo.x+nx*offset),y:sy(rubberTo.y+ny*offset)};
            return <Group listening={false}>
              <Line points={[sx(rubberFrom.x),sy(rubberFrom.y),a.x,a.y]} stroke={appearance.accent} strokeWidth={0.8}/>
              <Line points={[sx(rubberTo.x),sy(rubberTo.y),b.x,b.y]} stroke={appearance.accent} strokeWidth={0.8}/>
              <DimensionLine a={a} b={b} visualScale={dimensionScale(rubberFrom,rubberTo)*px/36} offset={offset} label={formatLenU(dist(rubberFrom,rubberTo),useProject.getState().units.length)} color={appearance.accent}/>
            </Group>;
          })()}
          {rubberFrom &&
            rubberTo &&
            drawSub !== "rect" &&
            drawSub !== "dim" &&
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
                  dash={[5, 4]}
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
          {!readOnly&&!simulationActive&&workspace.showIrrigation && <DiagnosticOverlay project={diagnosticProject} px={px} panX={panX} panY={panY} size={size} canvas={wrapRef}/>}
          {!simulationActive && workspace.showIrrigation && headMovePreview && <SprinklerGuides point={headMovePreview} px={px} panX={panX} panY={panY} excludeHead={headMovePreview.id}/>}
          {placementFocus&&['plant-move','landscape-move'].includes(placementFocus.owner)&&<Group name="magnifier-placement-overlay" x={sx(placementFocus.point.x)} y={sy(placementFocus.point.y)} listening={false}>
            <Line points={[-12,0,-3,0]} stroke="white" strokeWidth={3}/><Line points={[3,0,12,0]} stroke="white" strokeWidth={3}/><Line points={[0,-12,0,-3]} stroke="white" strokeWidth={3}/><Line points={[0,3,0,12]} stroke="white" strokeWidth={3}/>
            <Line points={[-12,0,-3,0]} stroke={appearance.ink} strokeWidth={1}/><Line points={[3,0,12,0]} stroke={appearance.ink} strokeWidth={1}/><Line points={[0,-12,0,-3]} stroke={appearance.ink} strokeWidth={1}/><Line points={[0,3,0,12]} stroke={appearance.ink} strokeWidth={1}/>
          </Group>}
          {!readOnly&&snapOn&&landscapePreview&&landscapeGuides.map(g=><Line key={`landscape-align-${g.axis}`} points={[sx(g.anchor.x),sy(g.anchor.y),sx(g.axis==='x'?g.anchor.x:g.point.x),sy(g.axis==='y'?g.anchor.y:g.point.y)]} stroke={g.aligned?appearance.guideAligned:appearance.guideError} strokeWidth={1.25} dash={[6,5]} listening={false}/>)}
          {!simulationActive && diagnosticHeads.map(head => <HeadSectorHandles key={`diagnostic-${head.id}`} diagnostic head={head} px={px} panX={panX} panY={panY}
            editDrag={editDrag} gestureBlocked={pinchGestureActive} skipClick={skipClick}
            onCenterDragChange={active => setPressedHead(active ? head.id : null)}/>)}
        </Layer>
        <Layer name="dimension-annotations">
          {displayedDimensions(dimensionSource, dimensionMode).map((dim) => {
            if (!dimensionsVisible) return null;
            const dimensionDrawing = drawingOrMigrate(diagnosticProject);
            const { a, b } = resolveDim(dimensionDrawing, dimensionDrawing.dims?.[dim.id] ?? dim);
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;
            const o = dimensionPreview?.id === dim.id ? dimensionPreview.offset : dim.offset;
            const active = selectedDimensions.includes(dim.id);
            const textPlacement=renderedDimensions.get(dim.id)?.text;
            const dimensionColor = engineeringBase ? appearance.ink : active ? "#1689e8" : (annotationInk[`dim:${dim.id}`]??'#626b75');
            const interactive = dimensionInteractive;
            const a2 = { x: a.x + nx * o, y: a.y + ny * o };
            const b2 = { x: b.x + nx * o, y: b.y + ny * o };
            const mx = (a2.x + b2.x) / 2;
            const my = (a2.y + b2.y) / 2;
            return (
              <Group
                key={dim.id}
                listening={interactive}
                draggable={interactive && !multiSelect && selectedDimensions.length<=1}
                onMouseDown={e=>{e.cancelBubble=true;selectDimension(dim.id,e.evt.shiftKey||e.evt.ctrlKey||e.evt.metaKey);}}
                onTouchStart={e=>{e.cancelBubble=true;selectDimension(dim.id);}}
                onClick={e=>{e.cancelBubble=true;}}
                onTap={e=>{e.cancelBubble=true;}}
                dragBoundFunc={pos=>{
                  const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
                  const raw=((pos.x-panX)/px-mid.x)*nx+((pos.y-panY)/px-mid.y)*ny;
                  const offset=snapDimensionOffset(drawingOrMigrate(useProject.getState().project),dim.id,raw,px);
                  return {x:sx(mid.x+offset*nx),y:sy(mid.y+offset*ny)};
                }}
                onDragStart={e=>{e.cancelBubble=true;setDimensionEditor(null);selectDimension(dim.id);editDrag.current=true;}}
                onDragMove={e=>{
                  const delta=((e.target.x()-panX)/px-(a.x+b.x)/2)*nx+((e.target.y()-panY)/px-(a.y+b.y)/2)*ny;
                  setDimensionPreview({id:dim.id,offset:delta});
                }}
                x={sx(mx)}
                y={sy(my)}
                onDragEnd={(e) => {
                  e.cancelBubble=true;editDrag.current=false;skipClick.current=true;
                  const p = { x: (e.target.x() - panX) / px, y: (e.target.y() - panY) / px };
                  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                  useProject
                    .getState()
                    .setDimOffset(dim.id, (p.x - mid.x) * nx + (p.y - mid.y) * ny);
                  setDimensionPreview(null);
                }}
              >
                <Line
                  points={[
                    sx(a.x) - sx(mx),
                    sy(a.y) - sy(my),
                    sx(a2.x) - sx(mx),
                    sy(a2.y) - sy(my),
                  ]}
                  stroke={dimensionColor}
                  strokeWidth={0.8}
                />
                <Line
                  points={[
                    sx(b.x) - sx(mx),
                    sy(b.y) - sy(my),
                    sx(b2.x) - sx(mx),
                    sy(b2.y) - sy(my),
                  ]}
                  stroke={dimensionColor}
                  strokeWidth={0.8}
                />
                <DimensionLine a={{x:sx(a2.x)-sx(mx),y:sy(a2.y)-sy(my)}}
                  b={{x:sx(b2.x)-sx(mx),y:sy(b2.y)-sy(my)}}
                  label={dim.label ?? formatLenU(len,useProject.getState().units.length)} color={dimensionColor} selected={active}
                  visualScale={(renderedDimensions.get(dim.id)?.annotationScale??dimensionScale(a,b))*px/36} offset={o} textPlacement={textPlacement?{...textPlacement,x:textPlacement.x-mx*px,y:textPlacement.y-my*px}:undefined} hideLabel={dimensionEditor?.id===dim.id}
                  onEdit={interactive && !multiSelect ? event=>{
                    if(event.shiftKey||event.ctrlKey||event.metaKey)return;
                    selectDimension(dim.id);
                    setDimensionEditor({id:dim.id,value:dim.label ?? formatLenU(len,useProject.getState().units.length)});
                  }:undefined}/>
              </Group>
            );
          })}
        </Layer>
        <Layer listening={false} name="equipment-labels">
          {showHeadLabels && (readOnly || workspaceSection==='irrigation' || simulationActive) && visibleHeads.map(head=>{
            const label=headLabels.get(head.id),position=labelPositions.get(head.id);
            if(!label||!position)return null;
            const point=headMovePreview?.id===head.id?headMovePreview:head;
            return <Text key={head.id} x={sx(point.x)+position.x} y={sy(point.y)+position.y}
              width={label.width} text={label.text} lineHeight={12/11} fontSize={11*labelScale}
              fontFamily="IBM Plex Sans, sans-serif" fill={annotationInk[`head:${head.id}`]??'#626b75'} stroke={annotationInk[`head:${head.id}`]==='#ffffff'?'#18232d':'#fff'}
              strokeWidth={0.8*labelScale} fillAfterStrokeEnabled listening={false}/>;
          })}
        </Layer>
      </Stage>
      {manualPlacement && !pinching && !spaceDown && !mousePanning && <ManualSprinklerPlacement trackerRef={manualTracker}/>}
      {!readOnly && workspaceSection==='irrigation' && tool==='auto-head' && <AutomaticHeadTool key={project.id} panelHost={automaticHeadPanelHost}/>}
      {dimensionsVisible && selectedDimension && dimensionInteractive && cadDrawing.dims?.[selectedDimension] && createPortal(
        <div className="dimension-delete-action" onPointerDown={e=>e.stopPropagation()}>
          <button type="button" className="bulk-delete" onClick={deleteSelectedDimensions}><Trash2 size={18}/>{selectedDimensions.length===1?uiText("deleteDimension"):`${uiText("delete")} (${selectedDimensions.length})`}</button>
        </div>,document.querySelector('.figure-actions-surface') ?? wrapRef.current!)}
      {dimensionsVisible && dimensionEditor && !readOnly && (()=>{
        const d=drawingOrMigrate(project), dim=d.dims?.[dimensionEditor.id];
        if(!dim) return null;
        const {a,b}=resolveDim(d,dim),length=dist(a,b)||1;
        const nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
        const arranged=renderedDimensions.get(dim.id)?.text;
        const placement=arranged?{...arranged,x:arranged.x+panX,y:arranged.y+panY}:dimensionLabelLayout({x:sx(a.x+nx*dim.offset),y:sy(a.y+ny*dim.offset)},
          {x:sx(b.x+nx*dim.offset),y:sy(b.y+ny*dim.offset)},dim.offset,dimensionTextScale(dimensionScale(a,b)*px/36));
        return <form className="dimension-value-editor" style={{left:placement.x,top:placement.y,transform:`translate(-50%,-50%) rotate(${placement.angle}deg)`}}
          onPointerDown={e=>e.stopPropagation()} onSubmit={e=>{e.preventDefault();applyDimensionLabel();}}>
          <input autoFocus aria-label={uiText("dimensionLabel")} value={dimensionEditor.value}
            onBlur={applyDimensionLabel} onFocus={e=>e.target.select()}
            onChange={e=>setDimensionEditor({...dimensionEditor,value:e.target.value})}
            onKeyDown={e=>{e.stopPropagation();if(e.key==="Escape"){e.preventDefault();setDimensionEditor(null);}}}/>
        </form>;
      })()}
      {showTapePointer && hoverPt && <div className="tape-measure-pointer" aria-hidden="true"
        style={{ left: sx(hoverPt.x) - TAPE_MEASURE_TIP.x * 28 / 24, top: sy(hoverPt.y) - TAPE_MEASURE_TIP.y * 28 / 24 }}>
        <TapeMeasureIcon showTip snapped={isDimensionGeometrySnap(snapHit?.kind)}/>
      </div>}
      {!readOnly && <DrawingGuidance wrapRef={wrapRef} hover={hoverPt} />}
      {!readOnly && <CanvasMagnifier stageRef={stageRef} wrapRef={wrapRef} editDrag={editDrag} gestureBlocked={pinchGestureActive} drawingFocus={hoverPt}/>}
      {workspace.editPlan&&pickList && (
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
              {it.kind === "face" ? uiText("regionObject") : it.kind === "edge" ? uiText("edgeObject") : uiText("headObject")}{" "}
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
    <div className="pointer-events-none absolute bottom-2 left-2 flex items-end gap-2 text-[0.625rem] text-ink-soft">
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
  const visible = useProject(canvasDimensionsVisible);
  if(!visible) return null;
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
  outsideWinding,
}: {
  a: Pt;
  b: Pt;
  sx: (n: number) => number;
  sy: (n: number) => number;
  px: number;
  unit: ReturnType<typeof useProject.getState>["measureUnit"];
  offsetFromLine?: boolean;
  prefix?: string;
  outsideWinding?: number;
}) {
  const appearance = canvasTheme(useProject((s) => s.themeId));
  const visible = useProject(canvasDimensionsVisible);
  if(!visible) return null;
  const length = dist(a, b);
  if (length < 0.002) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const n = Math.hypot(dx, dy) || 1;
  let nx = -dy / n;
  let ny = dx / n;
  if (outsideWinding !== undefined ? outsideWinding > 0 : ny > 0 || (Math.abs(ny) < 1e-7 && nx < 0)) {
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
  const visible = useProject(canvasDimensionsVisible);
  if(!visible) return null;
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
  return rotationHandleLayout(metrics.apex, metrics.center, px).point;
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
  const visible = useProject(canvasDimensionsVisible);
  if(!visible) return null;
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
  const visible = useProject(canvasDimensionsVisible);
  if(!visible) return null;
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
  e.cancelBubble = true;
  if (editDrag.current) return;
  const native = e.evt as PointerEvent & TouchEvent;
  native.preventDefault?.();
  native.stopPropagation?.();
  const stage = e.target.getStage();
  const startClient = clientXY(native);
  editDrag.current = true;
  onStart(worldFromClient(native, stage, panX, panY, px));
  let holdTimer: number | null = null;
  let moved = false;
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
      moved = true;
      clearLongHold();
    }
    onMove(worldFromClient(ev, stage, panX, panY, px));
  };
  const end = (ev: PointerEvent | TouchEvent) => {
    if (gestureBlocked?.current || ev.type === "pointercancel" || ev.type === "touchcancel") {
      cancel();
      return;
    }
    cleanup();
    const endClient = clientXY(ev);
    const tapDistance = Math.hypot(
      endClient.clientX - startClient.clientX,
      endClient.clientY - startClient.clientY,
    );
    if (onTap && !moved && tapDistance <= 6) {
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
  onTap?: () => void,
) {
  e.cancelBubble = true;
  if (editDrag.current) return;
  const native = e.evt as PointerEvent & TouchEvent;
  if (gestureBlocked?.current || (native.touches?.length ?? 0) >= 2) return;
  native.preventDefault?.();
  native.stopPropagation?.();
  const s0 = clientXY(native);
  let maxDistance = 0;
  editDrag.current = true;
  const cleanup = () => {
    window.removeEventListener("pointerdown", interrupt as EventListener, true);
    window.removeEventListener("touchstart", interrupt as EventListener, true);
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
  const interrupt = (ev: PointerEvent | TouchEvent) => {
    if (("touches" in ev && ev.touches.length >= 2) ||
      ("pointerId" in ev && ev.pointerType === "touch" && ev.pointerId !== native.pointerId)) cancel();
  };
  const move = (ev: PointerEvent | TouchEvent) => {
    if (gestureBlocked?.current || ("touches" in ev && ev.touches.length >= 2)) {
      cancel();
      return;
    }
    if ("pointerId" in ev && native.pointerId != null && ev.pointerId !== native.pointerId) return;
    ev.preventDefault();
    const c = clientXY(ev);
    maxDistance = Math.max(maxDistance, Math.hypot(c.clientX - s0.clientX, c.clientY - s0.clientY));
    onDelta(c.clientX - s0.clientX, c.clientY - s0.clientY, false);
  };
  const end = (ev: PointerEvent | TouchEvent) => {
    if (gestureBlocked?.current || ev.type.endsWith("cancel")) {
      cancel();
      return;
    }
    if ("pointerId" in ev && native.pointerId != null && ev.pointerId !== native.pointerId) return;
    cleanup();
    skipClick.current = true;
    window.setTimeout(() => {
      skipClick.current = false;
    }, 500);
    editDrag.current = false;
    const c = clientXY(ev);
    maxDistance = Math.max(maxDistance, Math.hypot(c.clientX - s0.clientX, c.clientY - s0.clientY));
    if (onTap && maxDistance <= 6) {
      onDelta(0, 0, false);
      onTap();
      return;
    }
    onDelta(c.clientX - s0.clientX, c.clientY - s0.clientY, true);
  };
  window.addEventListener("pointerdown", interrupt as EventListener, { capture: true });
  window.addEventListener("touchstart", interrupt as EventListener, { capture: true });
  window.addEventListener("pointermove", move as EventListener, { capture: true, passive: false });
  window.addEventListener("pointerup", end as EventListener, { capture: true });
  window.addEventListener("pointercancel", end as EventListener, { capture: true });
  window.addEventListener("touchmove", move as EventListener, { capture: true, passive: false });
  window.addEventListener("touchend", end as EventListener, { capture: true });
  window.addEventListener("touchcancel", end as EventListener, { capture: true });
}

function snapEditableEndpoint(p: Pt, fixed?: Pt): Pt {
  const st = useProject.getState();
  if (!st.snapOn) return p;
  return snapFigurePoint(drawingOrMigrate(st.project),p,st.cadEditId,st.pxPerMeter,st.gridStep,st.snapGridOn,fixed);
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
  return (
    <Group x={x} y={y} rotation={angle} onMouseDown={onStart} onTouchStart={onStart}>
      <Circle radius={22} fill="rgba(0,0,0,0.001)" />
      <EditPointGlyph corner />
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
  const project = useProject((s) => s.project);
  const [activeEndpoint, setActiveEndpoint] = useState<0 | 1 | null>(null);
  useEffect(() => setActiveEndpoint(null), [segmentIndex, edgeId]);
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
        () => setActiveEndpoint(endpoint),
        (p) => {
          const next = original.slice();
          const q = snapEditableEndpoint(p, fixed);
          next[segmentIndex + endpoint] = q;
          useProject.getState().setDraftPoints(next);
        },
        (p) => {
          setActiveEndpoint(null);
          const next = original.slice();
          const q = snapEditableEndpoint(p, fixed);
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
        () => {
          setActiveEndpoint(null);
          useProject.getState().setDraftPoints(original);
        },
      );
    };
  return (
    <Group>
      {activeEndpoint !== null && !gestureBlocked.current && <SegmentAlignmentGuides
        drawing={drawingOrMigrate(project)} point={activeEndpoint === 0 ? a : b} fixed={activeEndpoint === 0 ? b : a}
        excludeEdgeId={edgeId ?? undefined} extraPoints={points.filter((_,index) => index !== segmentIndex + activeEndpoint)}
        sx={sx} sy={sy} px={px} appearance={appearance}/>}
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
  const [activeEndpoint, setActiveEndpoint] = useState<0 | 1 | null>(null);
  useEffect(() => { setPreview(null); setActiveEndpoint(null); }, [edgeId, a?.x, a?.y, b?.x, b?.y]);
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
        () => { setActiveEndpoint(endpoint); setPreview({ a, b }); },
        (p) => {
          const q = snapEditableEndpoint(p, fixed);
          setPreview(endpoint === 0 ? { a: q, b } : { a, b: q });
        },
        (p) => {
          const q = snapEditableEndpoint(p, fixed);
          setPreview(null);
          setActiveEndpoint(null);
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
        () => { setPreview(null); setActiveEndpoint(null); },
      );
    };
  return (
    <Group>
      {activeEndpoint !== null && !gestureBlocked.current && <SegmentAlignmentGuides
        drawing={d} point={activeEndpoint === 0 ? shownA : shownB} fixed={activeEndpoint === 0 ? shownB : shownA}
        excludeFaceId={faceId ?? undefined} excludeEdgeId={edgeId}
        sx={sx} sy={sy} px={px} appearance={appearance}/>}
      <Line
        points={[sx(shownA.x), sy(shownA.y), sx(shownB.x), sy(shownB.y)]}
        stroke={EDIT_OUTLINE_COLOR}
        strokeWidth={2.5}
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

function LayerHandles({ faceId, px, panX, panY, editDrag, skipClick, gestureBlocked }: {
  faceId: string; px: number; panX: number; panY: number;
  editDrag: { current: boolean }; skipClick: { current: boolean }; gestureBlocked: { current: boolean };
}) {
  const project = useProject(s => s.project);
  const d = drawingOrMigrate(project), ids = layerFaceIds(d, faceId);
  const [preview, setPreview] = useState({ dx: 0, dy: 0, scale: 1, angle: 0 });
  const center = layerCenter(d, faceId);
  const screen = (p: Pt) => ({ x: p.x*px+panX, y: p.y*px+panY });
  const transformed = (p: Pt) => {
    const r=preview.angle*Math.PI/180, c=Math.cos(r), s=Math.sin(r);
    return screen({ x: center.x+((p.x-center.x)*c-(p.y-center.y)*s)*preview.scale+preview.dx,
      y: center.y+((p.x-center.x)*s+(p.y-center.y)*c)*preview.scale+preview.dy });
  };
  const corners = layerFrame(d, faceId);
  const begin = (mode: "rotate" | "move", e: Konva.KonvaEventObject<PointerEvent | MouseEvent | TouchEvent>) => {
    if (gestureBlocked.current) return;
    const stage = e.target.getStage();
    const nodes = ids.map(id => stage?.findOne(`#face-${id}`)).filter((n): n is Konva.Node => Boolean(n));
    const attrs = nodes.map(n => ({ x:n.x(), y:n.y(), scaleX:n.scaleX(), scaleY:n.scaleY(), rotation:n.rotation() }));
    let start = center, change = { dx:0, dy:0, scale:1, angle:0 };
    const restore = () => {
      const current = useProject.getState();
      nodes.forEach((n,i) => {
        const a = attrs[i]!;
        const centered = n.getClassName() === "Circle" || n.getClassName() === "Ellipse";
        n.setAttrs(centered ? { ...a, x:(a.x-panX)*current.pxPerMeter/px+current.panX, y:(a.y-panY)*current.pxPerMeter/px+current.panY } : a);
      });
      setPreview({ dx:0,dy:0,scale:1,angle:0 }); stage?.batchDraw();
    };
    const update = (p: Pt) => {
      if (mode === "rotate") change = { ...change, angle:(Math.atan2(p.y-center.y,p.x-center.x)-Math.atan2(start.y-center.y,start.x-center.x))*180/Math.PI };
      else change = { ...change, dx:p.x-start.x, dy:p.y-start.y };
      change = { ...change, ...snapLayerTransform(d, faceId, mode, change, useProject.getState()) };
      const o=screen(center), r=change.angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),k=change.scale;
      nodes.forEach((n,i) => { const a=attrs[i]!,x=a.x-o.x,y=a.y-o.y; n.setAttrs({x:o.x+(x*c-y*s)*k+change.dx*px,y:o.y+(x*s+y*c)*k+change.dy*px,scaleX:a.scaleX*k,scaleY:a.scaleY*k,rotation:a.rotation+change.angle}); });
      setPreview(change); stage?.batchDraw();
    };
    bindPointerDrag(e, editDrag, panX, panY, px, p => { start=p; }, update, p => {
      update(p); restore();
      useProject.getState().commitDrawing(transformLayer(d,faceId,change,center),faceId,true);
    }, skipClick, gestureBlocked, restore, restore);
  };
  const body = transformed(center);
  const axisAngle = ((d.faces[faceId]?.layerAngle ?? 0)-90)*Math.PI/180;
  const radius = Math.max(...corners.map(p => (p.x-center.x)*Math.cos(axisAngle)+(p.y-center.y)*Math.sin(axisAngle))) + ROTATION_STEM_PX/px;
  const rotate = transformed({ x:center.x+Math.cos(axisAngle)*radius, y:center.y+Math.sin(axisAngle)*radius });
  const stemLength = Math.hypot(rotate.x-body.x, rotate.y-body.y) || 1;
  const stemEnd = { x:rotate.x-(rotate.x-body.x)*12/stemLength, y:rotate.y-(rotate.y-body.y)*12/stemLength };
  return <Group>
    <Line points={corners.flatMap(p => {const q=transformed(p);return [q.x,q.y];})} closed stroke={EDIT_HANDLE_COLOR} strokeWidth={1} dash={[5,5]} fill="rgba(0,0,0,0.001)" onPointerDown={e=>begin("move",e)} onTouchStart={e=>begin("move",e)}/>
    <Line points={[body.x,body.y,stemEnd.x,stemEnd.y]} stroke={EDIT_HANDLE_COLOR} strokeWidth={1.1} listening={false}/>
    <Group x={body.x} y={body.y} onPointerDown={e=>begin("move",e)} onTouchStart={e=>begin("move",e)}>
      <Circle radius={22} fill="rgba(0,0,0,0.001)"/><EditPointGlyph />
    </Group>
    <Group x={rotate.x} y={rotate.y} onPointerDown={e=>begin("rotate",e)} onTouchStart={e=>begin("rotate",e)}>
      <Circle radius={22} fill="rgba(0,0,0,0.001)"/><RotationHandleGlyph stem={false} />
    </Group>
  </Group>;
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
  onSegmentEditDone,
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
  onSegmentEditDone: () => void;
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
  const [segmentGuide, setSegmentGuide] = useState<{ point: Pt; fixed: Pt } | null>(null);
  const [activeCurvePoint, setActiveCurvePoint] = useState<number | null>(null);
  useEffect(() => { setActiveCurvePoint(null); setSegmentGuide(null); }, [faceId]);
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
    if(face.nodeEdit.curveRuns?.length) {
      for(const index of curvedIndices) visibleNodes.delete(index);
      for(const run of face.nodeEdit.curveRuns) for(const id of [run[0],run[Math.floor(run.length/2)],run.at(-1)]) {
        const index=verts.findIndex(v=>v.id===id); if(index>=0) visibleNodes.add(index);
      }
    }
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
          stroke={EDIT_OUTLINE_COLOR}
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
              <EditPointGlyph corner={!isCurveNode} active={activeCurvePoint === index} />
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
    const clearSplineMove = () => {
      setLiveSplineControls(null);
      setSegmentGuide(null);
      useProject.setState({ splinePreview: null });
      onPreviewPath(null);
    };
    const moveCurve = (dxPx: number, dyPx: number, commit: boolean) => {
      // Moving the body needs a drag. Segment body taps finish editing instead.
      if (Math.hypot(dxPx, dyPx) < 6) {
        clearSplineMove();
        return;
      }
      const state = useProject.getState();
      let dx = dxPx / px, dy = dyPx / px;
      if (state.snapOn) {
        const snapped = snapShapeTranslationToGrid(
          controls, dx, dy, Math.max(state.gridStep || 0.1, 1e-4), px,
        );
        dx = snapped.dx;
        dy = snapped.dy;
      }
      const next = controls.map(point => ({ x: point.x + dx, y: point.y + dy }));
      if (commit) {
        clearSplineMove();
        state.commitDrawing(updateSpline(drawingOrMigrate(state.project), face.id, next), face.id, true);
      } else {
        setActiveCurvePoint(null);
        setLiveSplineControls(next);
        useProject.setState({ splinePreview: { faceId: face.id, points: next } });
        onPreviewPath(catmullRom(next, 8, face.spline!.closed));
      }
    };
    const beginControlMove = (index: number) => {
      setActiveCurvePoint(index);
      if (face.segment && controls.length === 2) setSegmentGuide({ point: controls[index]!, fixed: controls[1-index]! });
    };
    const moveControl = (index: number, point: Pt, commit: boolean) => {
      const snapped = snapEditableEndpoint(point, face.segment && controls.length === 2 ? controls[1-index] : undefined);
      const next = controls.map((control, controlIndex) =>
        controlIndex === index ? snapped : control,
      );
      if (!commit) {
        if (face.segment && controls.length === 2) setSegmentGuide({ point: snapped, fixed: controls[1-index]! });
        setLiveSplineControls(next);
        useProject.setState({ splinePreview: { faceId: face.id, points: next } });
        onPreviewPath(catmullRom(next, 8, face.spline!.closed));
        return;
      }
      useProject.getState().setSplinePt(index, snapped);
      setSegmentGuide(null);
      setLiveSplineControls(null);
      onPreviewPath(null);
    };
    const center = face.spline.closed && curve.length >= 3
      ? polygonMassCenter(curve)
      : null;
    return (
      <Group>
        {face.segment && segmentGuide && !gestureBlocked.current && <SegmentAlignmentGuides
          drawing={d} point={segmentGuide.point} fixed={segmentGuide.fixed} excludeFaceId={face.id}
          sx={sx} sy={sy} px={px} appearance={appearance}/>}
        <Line
          points={curve.flatMap((point) => [sx(point.x), sy(point.y)])}
          closed={face.spline.closed}
          stroke={EDIT_OUTLINE_COLOR}
          strokeWidth={2.5}
          lineCap="round"
          lineJoin="round"
          fill={face.spline.closed ? "rgba(0,0,0,0.001)" : undefined}
          hitStrokeWidth={24}
          onMouseDown={event => { event.cancelBubble = true; }}
          onPointerDown={event => bindClientDeltaDrag(event, editDrag, skipClick, moveCurve, gestureBlocked, face.segment ? onSegmentEditDone : undefined)}
          onTouchStart={event => {
            if (event.evt.touches.length >= 2) return;
            bindClientDeltaDrag(event, editDrag, skipClick, moveCurve, gestureBlocked, face.segment ? onSegmentEditDone : undefined);
          }}
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
                () => beginControlMove(index),
                (next) => moveControl(index, next, false),
                (next) => moveControl(index, next, true),
                skipClick,
                gestureBlocked,
                clearSplineMove,
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
                () => beginControlMove(index),
                (next) => moveControl(index, next, false),
                (next) => moveControl(index, next, true),
                skipClick,
                gestureBlocked,
                clearSplineMove,
              );
            }}
          >
            <Circle radius={22} fill="rgba(255,255,255,0.001)" />
            <EditPointGlyph corner={Boolean(face.segment)} active={activeCurvePoint === index} />
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
    const a = pts[0], b = pts[1], opposite = pts[2];
    if (!a || !b || !opposite) return { x: 0, y: 0, rotation: 0 };
    const top = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const center = { x: (a.x + opposite.x) / 2, y: (a.y + opposite.y) / 2 };
    const handle = rotationHandleLayout(top, center, px);
    return { x: sx(handle.point.x), y: sy(handle.point.y), rotation: handle.rotation };
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
      rotRef.current?.setAttrs(rp);
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
          <EditPointGlyph corner />
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
      ellPt(rx, ry + ROTATION_STEM_PX / px, -Math.PI / 2, cx, cy, rot);
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
      rotRef.current?.setAttrs({ x: sx(rp.x), y: sy(rp.y), rotation: rot });
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
      if (state.snapOn) {
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
              <EditPointGlyph corner />
            </Group>
          );
        })}
        <Group
          ref={rotRef}
          x={sx(rp0.x)}
          y={sy(rp0.y)}
          rotation={rot0deg}
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
          <EditPointGlyph />
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
      if (state.snapOn) {
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
              <EditPointGlyph corner />
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
              <EditPointGlyph />
            </Group>
          );
        })}
        <Group
          ref={rotRef}
          x={rp.x}
          y={rp.y}
          rotation={rp.rotation}
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
        if (rp) rotRef.current?.setAttrs({ x: sx(rp.x), y: sy(rp.y), rotation: rotationHandleLayout(layout.metrics.apex, layout.metrics.center, px).rotation });
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
      if (state.snapOn) {
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
            <EditPointGlyph corner />
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
            <EditPointGlyph />
          </Group>
        )}
        {rotPoint && (
          <Group
            ref={rotRef}
            x={sx(rotPoint.x)}
            y={sy(rotPoint.y)}
            rotation={rotationHandleLayout(metrics.apex, metrics.center, px).rotation}
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
    const rotationGap = ROTATION_STEM_PX / px;
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
      if (state.snapOn) {
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
            stroke={EDIT_HANDLE_COLOR}
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
            <EditPointGlyph corner />
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
            <EditPointGlyph />
          </Group>
        ))}
        {!pointShape && <Group
          ref={rotRef}
          x={sx(rotationPoint.x)}
          y={sy(rotationPoint.y)}
          rotation={Math.atan2(shownFrame.uy, shownFrame.ux) * 180 / Math.PI}
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
            <EditPointGlyph radius={8} />
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

function CoverageGeom({clip,materialOpacity=1,...props}: Parameters<typeof RenderedGeom>[0] & {clip: ReturnType<typeof outsideHatchesClip>;materialOpacity?:number}) {
  if ((!clip&&materialOpacity===1) || props.poly.type === 'guide' || props.poly.type === 'line') return <RenderedGeom {...props}/>;
  return <>
    <Group listening={false} clipFunc={clip??undefined} opacity={materialOpacity}><RenderedGeom {...props} paint="fill" passThrough/></Group>
    <RenderedGeom {...props} paint="outline"/>
  </>;
}

function RenderedGeom({ poly, sx, sy, px, selectedPolyId, selectedPolyIds, fillOf, startHold, endHold, passThrough,
  previewPoints = null, appearance = canvasTheme("mint"), textureImages = {}, paint = 'all',
}: {
  poly: Geom; sx: (n: number) => number; sy: (n: number) => number; px: number;
  selectedPolyId: string | null; selectedPolyIds: string[]; fillOf: (k: string) => string;
  startHold: (id: string) => void; endHold: () => void; passThrough: boolean;
  previewPoints?: Pt[] | null; appearance?: ReturnType<typeof canvasTheme>;
  textureImages?: Record<string, HTMLImageElement>;
  paint?: 'all' | 'fill' | 'outline';
}) {
  const nodeRef = useRef<Konva.Shape | null>(null);
  const selected = poly.id === selectedPolyId || selectedPolyIds.includes(poly.id);
  const editing = useProject(s => Boolean(s.cadEditId && layerFaceIds(drawingOrMigrate(s.project), s.cadEditId).includes(poly.id)));
  const outline = editing ? EDIT_OUTLINE_COLOR : SELECTION_OUTLINE_COLOR;
  const segment = useProject(s => Boolean(drawingOrMigrate(s.project).faces[poly.id]?.segment));
  const themeId = useProject(s=>s.themeId);
  const themeFill = poly.fill === "theme";
  const fill = themeFill ? themeFigureFill(themeId) : poly.fill ?? fillOf(poly.cadType ?? poly.kind);
  const texture = paint === 'outline' ? undefined : textureImages[fill];
  const shapeKind = poly.ellipse ? "ellipse" : poly.type;
  const reference = validTextureSize(poly.textureSize) ? poly.textureSize : textureFrame(poly);
  useLayoutEffect(() => {
    if (!texture || !nodeRef.current) return;
    return bindMaterialPattern(nodeRef.current, fill, reference, px, poly.textureRotation ?? 0,{x:sx(0),y:sy(0)});
  });
  // Hole contours have a React scene function; bind after each commit to its latest version.
  useLayoutEffect(() => {
    if (texture && nodeRef.current) return bindHippedMaterial(nodeRef.current, fill);
  });
  if (poly.hidden) return null;
  const solidFill = fill.startsWith("texture:") ? "#d8d4cc" : fill;
  const frame = textureFrame({ ...poly,
    points: (previewPoints ?? poly.points).map((point) => ({ x: sx(point.x), y: sy(point.y) })),
    radius: poly.radius == null ? undefined : poly.radius * px,
    ellipse: poly.ellipse ? { ...poly.ellipse, rx: poly.ellipse.rx * px, ry: poly.ellipse.ry * px } : undefined });
  const pattern = { ...(texture ? {
    fill: undefined,
    fillPriority: "pattern",
    fillPatternImage: texture,
    fillPatternRepeat: "repeat" as const,
    ...texturePatternAttrs(fill, frame, reference, px, poly.textureRotation ?? 0),
  } : { fill: paint === 'outline' ? 'rgba(0,0,0,0)' : solidFill, fillPriority: "color" }), strokeEnabled: paint !== 'fill' };
  const shapeRef = (node: Konva.Shape | null) => { nodeRef.current = node; };
  const shapeId = `face-${poly.id}${paint === 'fill' ? '-paint' : ''}`;
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
        ref={shapeRef}
        id={shapeId}
        x={sx(poly.points[0].x)}
        y={sy(poly.points[0].y)}
        radius={poly.radius * px}
        {...pattern}
        opacity={themeFill || fill.startsWith("texture:") ? 1 : 0.72}
        stroke={selected ? outline : appearance.ink}
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
        ref={shapeRef}
        id={shapeId}
        x={sx(e.cx)}
        y={sy(e.cy)}
        radiusX={e.rx * px}
        radiusY={e.ry * px}
        rotation={e.rot ?? 0}
        {...pattern}
        opacity={themeFill || fill.startsWith("texture:") ? 1 : 0.72}
        stroke={selected ? outline : appearance.ink}
        strokeWidth={selected ? 2.5 : 1.5}
        {...hold}
      />
    );
  }
  const shownPoints = previewPoints ?? poly.points;
  if(poly.holes?.length) return <Shape ref={shapeRef} id={shapeId} {...pattern}
    points={shownPoints.flatMap(p => [sx(p.x), sy(p.y)])}
    materialHoles={poly.holes.map(ring => ring.map(p => ({x:sx(p.x),y:sy(p.y)})))}
    fillRule="evenodd" opacity={themeFill || texture ? 1 : 0.72} stroke={selected ? outline : appearance.ink} strokeWidth={selected ? 2.5 : 2} {...hold}
    sceneFunc={(ctx,shape)=>{
      ctx.beginPath();
      for(const ring of [shownPoints,...poly.holes!]) {
        ring.forEach((p,i)=>i===0 ? ctx.moveTo(sx(p.x),sy(p.y)) : ctx.lineTo(sx(p.x),sy(p.y)));
        ctx.closePath();
      }
      ctx.fillStrokeShape(shape);
    }}/>;
  return (
    <Line
      key={poly.id}
      ref={shapeRef}
        id={shapeId}
      x={0}
      y={0}
      points={shownPoints.flatMap((p) => [sx(p.x), sy(p.y)])}
      closed={poly.closed}
      {...(poly.closed ? pattern : { fill: undefined })}
      opacity={segment || themeFill ? 1 : fill.startsWith("texture:") ? 1 : poly.closed ? 0.72 : poly.type === "line" ? 0.9 : 0.5}
      stroke={selected ? outline : segment ? appearance.segmentStroke : poly.type === "line" ? appearance.accent : appearance.ink}
      strokeWidth={selected ? 2.5 : 2}
      lineCap={poly.type === "line" ? "round" : "butt"}
      lineJoin={poly.type === "line" ? "round" : "miter"}
      hitStrokeWidth={poly.type === "line" ? 24 : "auto"}
      {...hold}
    />
  );
}

function ConstructionStartMark({color}:{color:string}) {
  return <Group listening={false}>
    <Line points={[-7,0,7,0]} stroke={color} strokeWidth={1.25}/>
    <Line points={[0,-7,0,7]} stroke={color} strokeWidth={1.25}/>
  </Group>;
}

function ConstructionOrigin({color,closing=false}:{color:string;closing?:boolean}) {
  return <Group listening={false}><Circle radius={6} fill={color}/><Circle radius={11} stroke={closing ? color : "#ff2538"} strokeWidth={1} dash={[2,3]} lineCap="round"/></Group>;
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
