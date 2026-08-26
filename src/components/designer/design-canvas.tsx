"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Arc, Circle, Ellipse, Group, Image as KImage, Layer, Line, Rect, Shape, Stage, Text } from "react-konva";
import type Konva from "konva";
import { Copy, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { itemById } from "@/lib/hunter-catalog";
import { tr } from "@/lib/i18n";
import { exclusionPolygons, lawnPolygon, sampleGrid } from "@/lib/coverage";
import { dist, formatLen, sectorLocal, snapGrid, uid, visibleGridStep, clampPxPerMeter, snapDeltaToAngle, normDeg, type Pt } from "@/lib/geometry";
import { formatAreaU } from "@/lib/units";
import { zoneColor, type Geom, type Head } from "@/lib/project-types";
import { useProject } from "@/lib/project-store";
import type { DesignCanvasProps } from "@/components/designer/canvas-types";
import { cadSnap } from "@/lib/cad/snap";
import { addEllipse, addRect, addSpline, addRotatedRect, addTriangle, drawingOrMigrate, faceArea, faceCentroid, faceEdges, facePoints, faceVertices, filletPreview, inferEllipseFromPoints, inferRectFromPoints, isInternalEdge, moveVertex, offsetPoints, pickCandidates, pickEdgeAt, pickFaceAt, pickVertexAt, rectFromEdge, rectWorldCorners, resolveDim, selfIntersects } from "@/lib/cad/engine";
import { REGION_FILL } from "@/lib/cad/types";

const DRAW_CREATE = new Set([
  "line",
  "polyline",
  "polygon",
  "rect",
  "rotrect",
  "circle",
  "triangle",
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
      {pass("minor", "#c5d0d8", 0.7)}
      {pass("major", "#8b939c", 1)}
      {pass("axis", "#1b1f24", 1.4)}
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

function worldOfPointer(clientX: number, clientY: number, wrap: HTMLDivElement, panX: number, panY: number, px: number): Pt {
  const rect = wrap.getBoundingClientRect();
  return { x: (clientX - rect.left - panX) / px, y: (clientY - rect.top - panY) / px };
}

export function DesignCanvas({ onScalePair, onMeasure, onHover, onExportReady }: DesignCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hoverRaf = useRef(0);
  const pendingHover = useRef<ReturnType<typeof cadSnap> | null>(null);
  const [pickList, setPickList] = useState<{ x: number; y: number; items: { kind: "face" | "edge" | "head"; id: string }[] } | null>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 640, h: 480 });
  const panDrag = useRef<{ x: number; y: number } | null>(null);
  const box = useRef<{ x: number; y: number } | null>(null);
  const [boxNow, setBoxNow] = useState<Pt | null>(null);
  const pinch = useRef<{ dist: number; midX: number; midY: number; panX: number; panY: number; px: number } | null>(null);
  const skipClick = useRef(false);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const lastFit = useRef(-1);
  const midDown = useRef(false);
  const [hoverPt, setHoverPt] = useState<Pt | null>(null);
  const [snapHit, setSnapHit] = useState<{ kind: string; pt: Pt } | null>(null);
  const pointerType = useRef("mouse");
  const hold = useRef<{ id: string; timer: number; node: Konva.Node; pointerId: number | null } | null>(null);
  const lastClient = useRef({ x: 0, y: 0 });
  const headDragStart = useRef({ x: 0, y: 0 });
  const overCatalog = useRef(false);
  const holdMenu = useRef(false);
  const editDrag = useRef(false);
  const headDragMove = useRef<((e: PointerEvent) => void) | null>(null);
  const [deleteMenu, setDeleteMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editHandles, setEditHandles] = useState<string | null>(null);
  const freehandOn = useRef(false);
  const cadHold = useRef<number | null>(null);
  const startCadHold = (id: string) => {
    if (pinch.current) return;
    const st = useProject.getState();
    if (st.catalogOpen) return;
    if (st.tool === "draw" && st.drawSub && st.drawSub !== "none") return;
    const face = drawingOrMigrate(st.project).faces[id];
    if (face?.locked) return;
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
  const tool = useProject((s) => s.tool);
  const drawSub = useProject((s) => s.drawSub);
  const measureSub = useProject((s) => s.measureSub);
  const px = useProject((s) => s.pxPerMeter);
  const panX = useProject((s) => s.panX);
  const panY = useProject((s) => s.panY);
  const showCoverage = useProject((s) => s.showCoverage);
  const showGrid = useProject((s) => s.showGrid);
  const showLabels = useProject((s) => s.showLabels);
  const selectedId = useProject((s) => s.selectedId);
  const selectedIds = useProject((s) => s.selectedIds);
  const selectedPolyId = useProject((s) => s.selectedPolyId);
  const cadEditId = useProject((s) => s.cadEditId);
  const catalogOpen = useProject((s) => s.catalogOpen);
  const selectedPolyIds = useProject((s) => s.selectedPolyIds);
  const draft = useProject((s) => s.draft);
  const fitNonce = useProject((s) => s.fitNonce);
  const measureUnit = useProject((s) => s.measureUnit);
  const spaceDown = useProject((s) => s.spaceDown);
  const gridStep = useProject((s) => s.gridStep);
  const analysis = useProject((s) => s.analysis);
  const snapOn = useProject((s) => s.snapOn);
  const snapGridOn = useProject((s) => s.snapGridOn);
  const locale = useProject((s) => s.locale);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      setSize({ w, h });
      if (w >= 40 && h >= 40 && lastFit.current === -1) {
        lastFit.current = useProject.getState().fitNonce;
        useProject.getState().fitToView(w, h);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      if (cadHold.current) {
        window.clearTimeout(cadHold.current);
        cadHold.current = null;
      }
      clearHold();
      skipClick.current = true;
      const info = pinchInfo(e.touches, el);
      const st = useProject.getState();
      if (info) pinch.current = { dist: info.dist, midX: info.midX, midY: info.midY, panX: st.panX, panY: st.panY, px: st.pxPerMeter };
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
        pinch.current = { dist: info.dist, midX: info.midX, midY: info.midY, panX: st.panX, panY: st.panY, px: st.pxPerMeter };
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
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch.current = null;
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

  const applySnap = (p: Pt, extra?: { angleFrom?: Pt | null; excludeHead?: string; free?: boolean }) => {
    if (extra?.free) return { pt: p, kind: "none" as const };
    const st = useProject.getState();
    const d = drawingOrMigrate(st.project);
    const closeTo = st.tool === "draw" && (st.drawSub === "polygon" || st.drawSub === "polyline") && st.draft.points.length >= 2 ? st.draft.points[0]! : null;
    return cadSnap(p, d, {
      pxPerMeter: st.pxPerMeter,
      pointerType: pointerType.current,
      snapOn: st.snapOn,
      snapGridOn: st.snapOn,
      orthoOn: st.orthoOn,
      lock: st.inferenceLock,
      gridStep: st.gridStep,
      angleFrom: extra?.angleFrom,
      closeTo,
      heads: st.project.heads.map((h) => ({ x: h.x, y: h.y })),
    });
  };

  const trackPointer = (p: Pt) => {
    const st = useProject.getState();
    const stretching =
      st.tool === "draw" &&
      st.draft.points.length >= 1 &&
      (st.drawSub === "circle" || st.drawSub === "ellipse");
    const angleFrom =
      stretching ? null : st.tool === "draw" && st.draft.points.length ? st.draft.points[st.draft.points.length - 1]! : null;
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

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
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
    const angleFrom =
      stretching ? null : st.tool === "draw" && st.draft.points.length ? st.draft.points[st.draft.points.length - 1]! : null;
    const p = applySnap(raw, { angleFrom, free: stretching }).pt;

    if (st.tool === "scale") {
      if (!st.draft.scaleA) useProject.setState({ draft: { ...st.draft, scaleA: p, scaleB: null } });
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
        toast(`${tr(locale, "area")}: ${faceArea(drawingOrMigrate(st.project), face).toFixed(2)} m²`);
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
        const face = pickFaceAt(drawingOrMigrate(st.project), p);
        if (st.cadEditId && face === st.cadEditId) return;
        if (face) {
          st.selectPoly(face);
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
      if (st.drawSub === "line" || st.drawSub === "polyline") {
        if (!st.draft.points.length) {
          st.addDraftPoint(p);
          return;
        }
        const a = st.draft.points[st.draft.points.length - 1]!;
        if (dist(a, p) < 1e-9) return;
        if (st.draft.points.length >= 2 && dist(st.draft.points[0]!, p) < Math.max(0.2, 28 / px)) {
          if (selfIntersects([...st.draft.points, st.draft.points[0]!])) toast(tr(locale, "selfIntersect"));
          st.closePolygon();
          return;
        }
        st.commitGeom({
          id: uid("g"),
          type: "line",
          kind,
          points: [a, p],
          closed: false,
          locked: false,
          hidden: false,
        });
        useProject.setState({ draft: { points: [p], scaleA: null, scaleB: null, measureA: null }, tool: "draw" });
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
      if (drawSub === "triangle" && pts.length >= 3) {
        st.commitDrawing(addTriangle(drawingOrMigrate(st.project), pts.slice(0, 3), st.regionType));
        return;
      }
      if (drawSub === "arc" && pts.length >= 3) finishDraw(pts);
      if (drawSub === "ellipse" && pts.length >= 2) {
        const c = pts[0]!;
        st.commitDrawing(addEllipse(drawingOrMigrate(st.project), c, Math.abs(p.x - c.x), Math.abs(p.y - c.y), st.regionType));
        return;
      }
      if (drawSub === "spline") {
        if (pts.length >= 3 && dist(pts[0]!, p) < Math.max(0.2, 32 / px)) {
          st.commitDrawing(addSpline(drawingOrMigrate(st.project), pts.slice(0, -1), true, st.regionType));
          return;
        }
      }
      if ((drawSub === "polygon" || !drawSub) && pts.length >= 3) {
        const closeM = Math.max(0.2, 32 / px);
        if (dist(pts[0]!, p) < closeM) st.closePolygon();
      }
      return;
    }
    if (!st.tool || st.tool === "move") {
      const d = drawingOrMigrate(st.project);
      const eTol = 14 / px;
      const cands = pickCandidates(
        d,
        p,
        eTol,
        st.project.heads.map((h) => ({ id: h.id, x: h.x, y: h.y })),
      );
      if (cands.length > 1) {
        const faces = cands.filter((c) => c.kind === "face");
        if (faces.length > 1 && Math.abs(faces[0]!.d - faces[1]!.d) < Math.max(faces[0]!.d * 0.35, 2)) {
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
      if (ctrl && face) {
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

  const cursor = spaceDown ? "grab" : tool ? "crosshair" : "default";
  const lawn = lawnPolygon(project.polygons);
  const holes = exclusionPolygons(project.polygons);
  const visibleHeads = project.heads.filter((h) => !hiddenZones.has(h.zone));
  const heat = analysis === "cover" || analysis === "overlap" ? (lawn && visibleHeads.length <= 48 ? sampleGrid(lawn, visibleHeads, 0.9, holes) : []) : [];

  const rubberFrom =
    tool === "draw" && draft.points.length
      ? draft.points[draft.points.length - 1]!
      : tool === "scale" && draft.scaleA && !draft.scaleB
        ? draft.scaleA
        : tool === "measure" && draft.measureA
          ? draft.measureA
          : null;
  const rubberTo = hoverPt;

  return (
    <div
      ref={wrapRef}
      data-design-canvas="1"
      className="relative h-full min-h-0 w-full overflow-hidden touch-none bg-surface-2"
      onContextMenu={(e) => e.preventDefault()}
    >
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        style={{ position: "absolute", top: 0, left: 0, width: size.w, height: size.h, cursor }}
        onWheel={onWheel}
        onClick={handleClick}
        onTap={handleClick}
        onDblClick={() => {
          const st = useProject.getState();
          if (st.tool !== "draw") return;
          if (st.draft.points.length) st.popDraftPoint();
          if (st.drawSub === "polygon") st.closePolygon();
          else if (st.draft.points.length >= 2) st.finishOpenDraw();
        }}
        onDblTap={() => {
          const st = useProject.getState();
          if (st.tool !== "draw") return;
          if (st.draft.points.length) st.popDraftPoint();
          if (st.drawSub === "polygon") st.closePolygon();
          else if (st.draft.points.length >= 2) st.finishOpenDraw();
        }}
        onMouseDown={(e) => {
          pointerType.current = "mouse";
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
              const ids = project.heads.filter((h) => h.x >= minX && h.x <= maxX && h.y >= minY && h.y <= maxY).map((h) => h.id);
              useProject.getState().selectHeads(ids);
            }
          }
          box.current = null;
          setBoxNow(null);
          if (drawSub === "freehand" && draft.points.length > 2 && tool === "draw") finishDraw(draft.points);
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
          if (tool === "draw" && drawSub === "freehand" && e.evt.buttons === 1) {
            useProject.getState().addDraftPoint(wpt);
          }
        }}
        onTouchStart={(e) => {
          pointerType.current = "touch";
          const wrap = wrapRef.current;
          const touches = e.evt.touches;
          if (wrap && touches.length >= 2) {
            e.evt.preventDefault();
            const info = pinchInfo(touches, wrap);
            const st = useProject.getState();
            if (info) {
              pinch.current = { dist: info.dist, midX: info.midX, midY: info.midY, panX: st.panX, panY: st.panY, px: st.pxPerMeter };
            }
            skipClick.current = true;
            freehandOn.current = false;
            return;
          }
          if (wrap && touches.length === 1 && tool === "draw" && drawSub === "freehand") {
            const t = touches.item(0);
            if (!t) return;
            const st = useProject.getState();
            const wpt = worldOfPointer(t.clientX, t.clientY, wrap, st.panX, st.panY, st.pxPerMeter);
            const snapped = applySnap(wpt, { angleFrom: st.draft.points.at(-1) ?? null }).pt;
            freehandOn.current = true;
            skipClick.current = true;
            st.addDraftPoint(snapped);
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
            return;
          }
          if (wrap && touches.length === 1) {
            const t = touches.item(0);
            if (!t) return;
            const st = useProject.getState();
            const wpt = worldOfPointer(t.clientX, t.clientY, wrap, st.panX, st.panY, st.pxPerMeter);
            const snapped = trackPointer(wpt);
            if (freehandOn.current && st.tool === "draw" && drawSub === "freehand") {
              st.addDraftPoint(snapped.pt);
            }
          }
        }}
        onTouchEnd={(e) => {
          if (e.evt.touches.length < 2) pinch.current = null;
          if (e.evt.touches.length === 0 && freehandOn.current) {
            freehandOn.current = false;
            const st = useProject.getState();
            if (st.drawSub === "freehand" && st.draft.points.length > 2 && st.tool === "draw") finishDraw(st.draft.points);
          }
        }}
      >
        <Layer perfectDrawEnabled={false}>
          <Rect name="bg" x={0} y={0} width={size.w} height={size.h} fill="#f7f9fb" />
          {showGrid && <CadGrid x0={x0} x1={x1} y0={y0} y1={y1} step={visualGrid} sx={sx} sy={sy} />}
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
          <Line points={[sx(-2), sy(0), sx(2), sy(0)]} stroke="#c45c26" strokeWidth={1.2} listening={false} />
          <Line points={[sx(0), sy(-2), sx(0), sy(2)]} stroke="#c45c26" strokeWidth={1.2} listening={false} />
          {project.polygons.map((poly) =>
            renderGeom(
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
            ),
          )}
          {Object.values(drawingOrMigrate(project).plants ?? {}).map((pl) => (
            drawingOrMigrate(project).layers?.plants?.visible === false ? null : (
              <Group key={pl.id} x={sx(pl.x)} y={sy(pl.y)} listening={false}>
                <Circle radius={pl.r * px} fill={pl.kind === "tree" ? "rgba(70,110,60,0.25)" : "rgba(90,120,70,0.25)"} stroke="#4a6a3a" strokeWidth={1} />
                <Circle radius={4} fill="#4a6a3a" />
              </Group>
            )
          ))}
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
          {Object.values(drawingOrMigrate(project).texts ?? {}).map((tx) => (
            drawingOrMigrate(project).layers?.annotations?.visible === false ? null : (
            <Text
              key={tx.id}
              x={sx(tx.x)}
              y={sy(tx.y)}
              text={tx.text}
              fontSize={Math.max(11, tx.size * px)}
              fontFamily="IBM Plex Sans, sans-serif"
              fill="#1b1f24"
              draggable={!tool}
              onDragEnd={(e) => {
                useProject.getState().moveNote(tx.id, {
                  x: (e.target.x() - panX) / px,
                  y: (e.target.y() - panY) / px,
                });
              }}
            />
            )
          ))}
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
                  useProject.getState().setDimOffset(dim.id, (p.x - mid.x) * nx + (p.y - mid.y) * ny);
                }}
              >
                <Line points={[sx(a.x) - sx(mx), sy(a.y) - sy(my), sx(a2.x) - sx(mx), sy(a2.y) - sy(my)]} stroke="#2b6f9a" strokeWidth={1} />
                <Line points={[sx(b.x) - sx(mx), sy(b.y) - sy(my), sx(b2.x) - sx(mx), sy(b2.y) - sy(my)]} stroke="#2b6f9a" strokeWidth={1} />
                <Line points={[sx(a2.x) - sx(mx), sy(a2.y) - sy(my), sx(b2.x) - sx(mx), sy(b2.y) - sy(my)]} stroke="#2b6f9a" strokeWidth={1.4} />
                <Circle radius={16} fill="rgba(255,255,255,0.001)" />
                <Text
                  x={-36}
                  y={-8}
                  width={72}
                  align="center"
                  text={formatLen(len, measureUnit)}
                  fontSize={12}
                  fontFamily="IBM Plex Sans, sans-serif"
                  fill="#2b6f9a"
                />
              </Group>
            );
          })}
          {catalogOpen && project.heads
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
            const grabR = item?.type === "rotor" || item?.family === "st" || item?.family === "golf" ? 48 : 36;
            const canDrag = tool !== "draw" && tool !== "measure" && tool !== "scale" && !h.locked && !lockedZones.has(h.zone);
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
                    if (pt.x >= r.left && pt.x <= r.right && pt.y >= r.top && pt.y <= r.bottom) {
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
                  <Line points={sectorLocal(rPx, h.start, h.arc)} closed fill={rotorColor} opacity={selected ? 0.55 : 0.32} stroke={rotorColor} strokeWidth={selected ? 2.5 : 1.5} listening={false} />
                )}
                {showCoverage && visibleHeads.length <= 48 && strip && (
                  <Line points={stripLocal(strip, h.start, rPx / (h.r || 1))} closed fill={rotorColor} opacity={0.4} listening={false} />
                )}
                <Circle radius={grabR} fill="transparent" />
                <Circle radius={selected ? 13 : 11} fill="#fff" stroke={zoneColor(h.zone)} strokeWidth={2.6} listening={false} />
                <Circle radius={4} fill={rotorColor} listening={false} />
                {showLabels && label && (
                  <Text
                    x={12}
                    y={-10}
                    text={label}
                    fontSize={11}
                    fontFamily="IBM Plex Sans, sans-serif"
                    fill="#1b1f24"
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
              />
              {drawingOrMigrate(project).faces[cadEditId]?.circle && (
                <CircleMeasure
                  cx={drawingOrMigrate(project).faces[cadEditId]!.circle!.cx}
                  cy={drawingOrMigrate(project).faces[cadEditId]!.circle!.cy}
                  r={drawingOrMigrate(project).faces[cadEditId]!.circle!.r}
                  hx={drawingOrMigrate(project).faces[cadEditId]!.circle!.cx + drawingOrMigrate(project).faces[cadEditId]!.circle!.r}
                  hy={drawingOrMigrate(project).faces[cadEditId]!.circle!.cy}
                  sx={sx}
                  sy={sy}
                  px={px}
                  unit={measureUnit}
                />
              )}
            </>
          )}
          {draft.points.length >= 1 && drawSub !== "ellipse" && drawSub !== "circle" && (
            <Line
              points={draft.points.flatMap((pt) => [sx(pt.x), sy(pt.y)])}
              stroke="#2b6f9a"
              strokeWidth={2.5}
              dash={drawSub === "freehand" ? undefined : [6, 4]}
              listening={false}
            />
          )}
          {draft.points.map((pt, i) => (
            <Circle
              key={`d${i}`}
              x={sx(pt.x)}
              y={sy(pt.y)}
              radius={i === 0 ? 9 : 6}
              fill={i === 0 ? "#2b6f9a" : "#fff"}
              stroke="#2b6f9a"
              strokeWidth={2}
              listening={false}
            />
          ))}
          {rubberFrom && rubberTo && (snapHit?.kind === "horiz" || snapHit?.kind === "vert") && (
            <Line
              points={
                snapHit.kind === "horiz"
                  ? [0, sy(rubberFrom.y), size.w, sy(rubberFrom.y)]
                  : [sx(rubberFrom.x), 0, sx(rubberFrom.x), size.h]
              }
              stroke="#2b6f9a"
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
                stroke="#2b6f9a"
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
                stroke="#2b6f9a"
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
                fill="#1b1f24"
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
                fill="#1b1f24"
                listening={false}
              />
              <Text
                x={sx(rubberFrom.x) + 16}
                y={sy(rubberFrom.y) - 8}
                width={88}
                text={formatAreaU(Math.PI * Math.abs(rubberTo.x - rubberFrom.x) * Math.abs(rubberTo.y - rubberFrom.y), useProject.getState().units.area)}
                fontSize={12}
                fontFamily="IBM Plex Sans, sans-serif"
                fill="#1b1f24"
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
                stroke="#2b6f9a"
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
          {tool === "draw" && drawSub === "offset" && selectedPolyId && hoverPt && draft.points[0] && (
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
          {rubberFrom && rubberTo && drawSub !== "rect" && drawSub !== "circle" && drawSub !== "ellipse" && (
            <>
              <Line
                points={[sx(rubberFrom.x), sy(rubberFrom.y), sx(rubberTo.x), sy(rubberTo.y)]}
                stroke="#2b6f9a"
                strokeWidth={1.5}
                dash={[5, 4]}
                listening={false}
              />
              <Text
                x={(sx(rubberFrom.x) + sx(rubberTo.x)) / 2 + 8}
                y={(sy(rubberFrom.y) + sy(rubberTo.y)) / 2 - 14}
                text={formatLen(dist(rubberFrom, rubberTo), measureUnit)}
                fontSize={13}
                fontFamily="IBM Plex Sans, sans-serif"
                fill="#2b6f9a"
                listening={false}
              />
            </>
          )}
          {draft.scaleA && draft.scaleB && (
            <Line
              points={[sx(draft.scaleA.x), sy(draft.scaleA.y), sx(draft.scaleB.x), sy(draft.scaleB.y)]}
              stroke="#2b6f9a"
              strokeWidth={2}
              listening={false}
            />
          )}
          {draft.scaleA && <Circle x={sx(draft.scaleA.x)} y={sy(draft.scaleA.y)} radius={5} fill="#2b6f9a" listening={false} />}
          {draft.scaleB && <Circle x={sx(draft.scaleB.x)} y={sy(draft.scaleB.y)} radius={5} fill="#2b6f9a" listening={false} />}
          {draft.measureA && <Circle x={sx(draft.measureA.x)} y={sy(draft.measureA.y)} radius={5} fill="#2b6f9a" listening={false} />}
          {box.current && boxNow && (
            <Rect
              x={sx(Math.min(box.current.x, boxNow.x))}
              y={sy(Math.min(box.current.y, boxNow.y))}
              width={Math.abs(boxNow.x - box.current.x) * px}
              height={Math.abs(boxNow.y - box.current.y) * px}
              stroke="#2b6f9a"
              dash={[4, 3]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
      {deleteMenu && (
        <div
          className="absolute z-40 flex -translate-x-1/2 -translate-y-[120%] items-center gap-1"
          style={{ left: deleteMenu.x, top: deleteMenu.y, pointerEvents: "auto", touchAction: "manipulation" }}
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
              {it.kind === "face" ? "область" : it.kind === "edge" ? "ребро" : "дождеватель"} {it.id.slice(-4)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ScaleBar({ px, unit }: { px: number; unit: ReturnType<typeof useProject.getState>["measureUnit"] }) {
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
      <Line points={[0, 0, radiusPos.x, radiusPos.y]} stroke="#2b6f9a" strokeWidth={1} dash={[4, 3]} listening={false} />
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
      <Circle radius={8} fill={color} stroke="#fff" strokeWidth={2} listening={false} />
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
  if (r < 0.02) return null;
  const rAng = -Math.PI / 6;
  const rc = Math.cos(rAng);
  const rs = Math.sin(rAng);
  const gap = Math.max(0.45, 24 / px);
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
        fill="#1b1f24"
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
        fill="#1b1f24"
        listening={false}
      />
      <Text
        id="circ-stext"
        x={sx(cx) - 52}
        y={sy(cy + r * 0.42) - 8}
        width={104}
        align="center"
        text={formatAreaU(Math.PI * r * r, areaU)}
        fontSize={13}
        fontFamily="IBM Plex Sans, sans-serif"
        fill="#1b1f24"
        listening={false}
      />
    </>
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
  const trPt = b;
  const ax = cx + (trPt.x - cx) * 0.62;
  const ay = cy + (trPt.y - cy) * 0.62;
  return (
    <>
      <Text
        id="rect-wtext"
        x={sx(top.x) - 44}
        y={sy(top.y) - 9}
        width={88}
        align="center"
        text={`${wLab} ${formatLen(w, unit)}`}
        fontSize={12}
        fontFamily="IBM Plex Sans, sans-serif"
        fill="#1b1f24"
        listening={false}
      />
      <Text
        id="rect-ltext"
        x={sx(side.x) - 8}
        y={sy(side.y) - 9}
        width={88}
        align="center"
        text={`${hLab} ${formatLen(len, unit)}`}
        fontSize={12}
        fontFamily="IBM Plex Sans, sans-serif"
        fill="#1b1f24"
        listening={false}
      />
      <Text
        id="rect-atext"
        x={sx(ax) - 40}
        y={sy(ay) - 8}
        width={80}
        align="center"
        text={formatAreaU(w * len, areaU)}
        fontSize={12}
        fontFamily="IBM Plex Sans, sans-serif"
        fill="#1b1f24"
        listening={false}
      />
    </>
  );
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

function clientXY(ev: { clientX?: number; clientY?: number; touches?: TouchList; changedTouches?: TouchList }): { clientX: number; clientY: number } {
  if (typeof ev.clientX === "number" && typeof ev.clientY === "number") return { clientX: ev.clientX, clientY: ev.clientY };
  const t = ev.touches?.item(0) ?? ev.changedTouches?.item(0);
  return { clientX: t?.clientX ?? 0, clientY: t?.clientY ?? 0 };
}

function worldFromClient(ev: { clientX?: number; clientY?: number; touches?: TouchList; changedTouches?: TouchList }, stage: Konva.Stage | null, panX: number, panY: number, px: number): Pt {
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
) {
  if (editDrag.current) return;
  e.cancelBubble = true;
  const native = e.evt as PointerEvent & TouchEvent;
  native.preventDefault?.();
  native.stopPropagation?.();
  const stage = e.target.getStage();
  editDrag.current = true;
  onStart(worldFromClient(native, stage, panX, panY, px));
  const move = (ev: PointerEvent | TouchEvent) => {
    ev.preventDefault();
    onMove(worldFromClient(ev, stage, panX, panY, px));
  };
  const end = (ev: PointerEvent | TouchEvent) => {
    window.removeEventListener("pointermove", move as EventListener, true);
    window.removeEventListener("pointerup", end as EventListener, true);
    window.removeEventListener("pointercancel", end as EventListener, true);
    window.removeEventListener("touchmove", move as EventListener, true);
    window.removeEventListener("touchend", end as EventListener, true);
    window.removeEventListener("touchcancel", end as EventListener, true);
    if (skipClick) {
      skipClick.current = true;
      window.setTimeout(() => {
        skipClick.current = false;
      }, 500);
    }
    editDrag.current = false;
    onEnd(worldFromClient(ev, stage, panX, panY, px));
  };
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
) {
  if (editDrag.current) return;
  e.cancelBubble = true;
  const native = e.evt as PointerEvent & TouchEvent;
  native.preventDefault?.();
  native.stopPropagation?.();
  const s0 = clientXY(native);
  editDrag.current = true;
  const move = (ev: PointerEvent | TouchEvent) => {
    ev.preventDefault();
    const c = clientXY(ev);
    onDelta(c.clientX - s0.clientX, c.clientY - s0.clientY, false);
  };
  const end = (ev: PointerEvent | TouchEvent) => {
    window.removeEventListener("pointermove", move as EventListener, true);
    window.removeEventListener("pointerup", end as EventListener, true);
    window.removeEventListener("pointercancel", end as EventListener, true);
    window.removeEventListener("touchmove", move as EventListener, true);
    window.removeEventListener("touchend", end as EventListener, true);
    window.removeEventListener("touchcancel", end as EventListener, true);
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

function CadHandles({
  faceId,
  sx,
  sy,
  px,
  panX,
  panY,
  editDrag,
  skipClick,
}: {
  faceId: string;
  sx: (n: number) => number;
  sy: (n: number) => number;
  px: number;
  panX: number;
  panY: number;
  editDrag: { current: boolean };
  skipClick: { current: boolean };
}) {
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
  const d = drawingOrMigrate(useProject.getState().project);
  const face = d.faces[faceId];
  if (!face || face.locked) return null;
  const c = faceCentroid(d, faceId);
  const toWorld = (node: Konva.Node) => {
    const p = node.getAbsolutePosition();
    return { x: (p.x - panX) / px, y: (p.y - panY) / px };
  };
  const circle = face.circle;
  const inferredEll = face.ellipse ?? inferEllipseFromPoints(faceVertices(d, faceId)) ?? undefined;
  const rect = face.rect ?? (circle || inferredEll ? undefined : inferRectFromPoints(faceVertices(d, faceId)) ?? undefined);
  const corners: Pt[] = rect ? rectWorldCorners(rect) : [];
  const geom = (node: Konva.Node) => node.getStage()?.findOne(`#face-${faceId}`) as Konva.Shape | undefined;
  const paintDims = (node: Konva.Node, nr: number, cx: number, cy: number) => {
    const stage = node.getStage();
    if (!stage) return;
    const unit = useProject.getState().measureUnit;
    const areaU = useProject.getState().units.area;
    const rAng = -Math.PI / 6;
    const rc = Math.cos(rAng);
    const rs = Math.sin(rAng);
    const gap = Math.max(0.45, 24 / px);
    const dtext = stage.findOne("#circ-dtext") as Konva.Text | undefined;
    const rtext = stage.findOne("#circ-rtext") as Konva.Text | undefined;
    const stext = stage.findOne("#circ-stext") as Konva.Text | undefined;
    dtext?.setAttrs({ x: sx(cx) - 48, y: sy(cy - nr * 0.42) - 8, text: `Ø ${formatLen(nr * 2, unit)}` });
    rtext?.setAttrs({
      x: sx(cx + (nr + gap) * rc) - 36,
      y: sy(cy + (nr + gap) * rs) - 8,
      text: `R ${formatLen(nr, unit)}`,
    });
    stext?.setAttrs({
      x: sx(cx) - 52,
      y: sy(cy + nr * 0.42) - 8,
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
    const ax = cx + (b.x - cx) * 0.62;
    const ay = cy + (b.y - cy) * 0.62;
    stage.findOne("#rect-wtext")?.setAttrs({
      x: sx(top.x) - 44,
      y: sy(top.y) - 9,
      text: `${tr(locale, "drawW")} ${formatLen(w, unit)}`,
    });
    stage.findOne("#rect-ltext")?.setAttrs({
      x: sx(side.x) - 8,
      y: sy(side.y) - 9,
      text: `${tr(locale, "drawH")} ${formatLen(len, unit)}`,
    });
    stage.findOne("#rect-atext")?.setAttrs({
      x: sx(ax) - 40,
      y: sy(ay) - 8,
      text: formatAreaU(w * len, areaU),
    });
  };
  const applyLiveCorners = (pts: Pt[], node: Konva.Node | undefined, skipCorner?: number, skipRot?: boolean, skipMid?: number) => {
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
    paintRectDims(pts, node?.getStage() ?? bitsRef.current?.getStage() ?? null);
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
            p = snapIfMagnet(p);
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
            p = snapIfMagnet(p);
            useProject.getState().moveSelectedFace(p.x - c.x, p.y - c.y);
          }}
        >
          <Circle radius={22} fill="rgba(0,0,0,0.001)" />
          <Line points={[-10, 0, -2.5, 0]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[2.5, 0, 10, 0]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[0, -10, 0, -2.5]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[0, 2.5, 0, 10]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[-10, 0, -7, -2.4]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[-10, 0, -7, 2.4]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[10, 0, 7, -2.4]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[10, 0, 7, 2.4]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[0, -10, -2.4, -7]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[0, -10, 2.4, -7]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[0, 10, -2.4, 7]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[0, 10, 2.4, 7]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
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
          <Rect x={-5} y={-5} width={10} height={10} fill="#c45c26" stroke="#fff" strokeWidth={1.5} listening={false} />
        </Group>
      </>
    );
  }

  if (inferredEll) {
    const ell = inferredEll;
    const rot0deg = ell.rot ?? 0;
    const ellPt = (rx: number, ry: number, param: number, cx = ell.cx, cy = ell.cy, rot = rot0deg) => {
      const rad = (rot * Math.PI) / 180;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      const lx = rx * Math.cos(param);
      const ly = ry * Math.sin(param);
      return { x: cx + lx * c - ly * s, y: cy + lx * s + ly * c };
    };
    const scalePos = (rx: number, ry: number, cx = ell.cx, cy = ell.cy, rot = rot0deg) => ellPt(rx, ry, -Math.PI / 4, cx, cy, rot);
    const rotHandlePos = (rx: number, ry: number, cx = ell.cx, cy = ell.cy, rot = rot0deg) => ellPt(rx, ry, (3 * Math.PI) / 4, cx, cy, rot);
    const offAxis = (end: Pt, cx = ell.cx, cy = ell.cy, outPx = 20) => {
      const dx = end.x - cx;
      const dy = end.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      const out = outPx / px;
      const side = 10 / px;
      return {
        x: end.x + (dx / len) * out - (dy / len) * side,
        y: end.y + (dy / len) * out + (dx / len) * side,
      };
    };
    const axisLabel = (end: Pt, cx: number, cy: number, outPx: number) => {
      const p = offAxis(end, cx, cy, outPx);
      const awayRight = sx(p.x) >= sx(end.x);
      return { x: sx(p.x), y: sy(p.y), offsetX: awayRight ? 0 : 88, offsetY: 8 };
    };
    const paintEll = (node: Konva.Node | undefined, rx: number, ry: number, cx = ell.cx, cy = ell.cy, rot = rot0deg) => {
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
      const aLab = axisLabel(right, cx, cy, 36);
      const bLab = axisLabel(top, cx, cy, 22);
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
        text: `A ${formatLen(rx * 2, unit)}`,
      });
      stage?.findOne("#ell-htext")?.setAttrs({
        x: bLab.x,
        y: bLab.y,
        offsetX: bLab.offsetX,
        offsetY: bLab.offsetY,
        text: `B ${formatLen(ry * 2, unit)}`,
      });
      const twoOclock = -Math.PI / 3;
      stage?.findOne("#ell-atext")?.setAttrs({
        x: sx(cx) + 30 * Math.cos(twoOclock),
        y: sy(cy) + 30 * Math.sin(twoOclock),
        text: formatAreaU(Math.PI * rx * ry, areaU),
      });
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
      paintEll(bitsRef.current ? geom(bitsRef.current) : undefined, ell.rx, ell.ry, ell.cx, ell.cy, rot0deg + deg);
      useProject.getState().setCadLiveRot(normDeg(rot0deg + deg));
      if (commit) useProject.getState().rotateSelectedFace(deg);
    };
    const applyBodyMove = (dxPx: number, dyPx: number, commit: boolean) => {
      let dx = dxPx / px;
      let dy = dyPx / px;
      if (useProject.getState().snapOn) {
        const g = Math.max(useProject.getState().gridStep || 0.1, 1e-4);
        dx = Math.round((ell.cx + dx) / g) * g - ell.cx;
        dy = Math.round((ell.cy + dy) / g) * g - ell.cy;
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
        if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) useProject.getState().moveSelectedFace(dx, dy);
      }
    };
    return (
      <Group ref={bitsRef} x={0} y={0} listening>
        <Line
          ref={bodyRef}
          points={ellipsePts(ell.cx, ell.cy, ell.rx, ell.ry, rot0deg).flatMap((pt) => [sx(pt.x), sy(pt.y)])}
          closed
          fill="rgba(43,111,154,0.04)"
          strokeEnabled={false}
          hitStrokeWidth={36}
          onMouseDown={(e) => {
            e.cancelBubble = true;
          }}
          onPointerDown={(e) => {
            bindClientDeltaDrag(e, editDrag, skipClick, applyBodyMove);
          }}
          onTouchStart={(e) => {
            if (e.evt.touches.length >= 2) return;
            bindClientDeltaDrag(e, editDrag, skipClick, applyBodyMove);
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
        <Group ref={centerRef} x={sx(ell.cx)} y={sy(ell.cy)} listening={false}>
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
            <Rect x={-6} y={-6} width={12} height={12} fill="#c45c26" stroke="#fff" strokeWidth={2} listening={false} />
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
                useProject.getState().setCadLiveRot(rot0deg);
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
                useProject.getState().setCadLiveRot(rot0deg);
              },
              (p) => applyRot(p, false),
              (p) => applyRot(p, true),
              skipClick,
            );
          }}
        >
          <Circle radius={22} fill="rgba(255,255,255,0.001)" />
          <Circle radius={12} fill="#fff" stroke="#1b1f24" strokeWidth={1.5} listening={false} />
          <Arc
            innerRadius={5}
            outerRadius={7.5}
            angle={230}
            rotation={-35}
            fillEnabled={false}
            stroke="#1b1f24"
            strokeWidth={1.4}
            listening={false}
          />
          <Line points={[5.2, -7.4, 9.2, -3.6, 3.4, -3.2]} closed fill="#1b1f24" listening={false} />
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
          <Circle radius={8} fill="#1565c0" stroke="#fff" strokeWidth={1.8} listening={false} />
          <Line points={[-5, 5, 5, -5]} stroke="#fff" strokeWidth={1.6} lineCap="round" listening={false} />
          <Line points={[1.8, -5.4, 5, -5, 5.4, -1.8]} stroke="#fff" strokeWidth={1.6} lineCap="round" lineJoin="round" listening={false} />
          <Line points={[-1.8, 5.4, -5, 5, -5.4, 1.8]} stroke="#fff" strokeWidth={1.6} lineCap="round" lineJoin="round" listening={false} />
        </Group>
        <Text
          id="ell-wtext"
          x={axisLabel(ellPt(ell.rx, ell.ry, 0), ell.cx, ell.cy, 36).x}
          y={axisLabel(ellPt(ell.rx, ell.ry, 0), ell.cx, ell.cy, 36).y}
          offsetX={axisLabel(ellPt(ell.rx, ell.ry, 0), ell.cx, ell.cy, 36).offsetX}
          offsetY={8}
          width={88}
          align="center"
          text={`A ${formatLen(ell.rx * 2, useProject.getState().measureUnit)}`}
          fontSize={12}
          fontFamily="IBM Plex Sans, sans-serif"
          fill="#1b1f24"
          listening={false}
        />
        <Text
          id="ell-htext"
          x={axisLabel(ellPt(ell.rx, ell.ry, -Math.PI / 2), ell.cx, ell.cy, 22).x}
          y={axisLabel(ellPt(ell.rx, ell.ry, -Math.PI / 2), ell.cx, ell.cy, 22).y}
          offsetX={axisLabel(ellPt(ell.rx, ell.ry, -Math.PI / 2), ell.cx, ell.cy, 22).offsetX}
          offsetY={8}
          width={88}
          align="center"
          text={`B ${formatLen(ell.ry * 2, useProject.getState().measureUnit)}`}
          fontSize={12}
          fontFamily="IBM Plex Sans, sans-serif"
          fill="#1b1f24"
          listening={false}
        />
        <Text
          id="ell-atext"
          x={sx(ell.cx) + 30 * Math.cos(-Math.PI / 3)}
          y={sy(ell.cy) + 30 * Math.sin(-Math.PI / 3)}
          width={80}
          align="left"
          text={formatAreaU(Math.PI * ell.rx * ell.ry, useProject.getState().units.area)}
          fontSize={12}
          fontFamily="IBM Plex Sans, sans-serif"
          fill="#1b1f24"
          listening={false}
        />
      </Group>
    );
  }

  if (rect && corners.length >= 4) {
    const rp = rotPos(corners);
    return (
      <Group
        ref={bitsRef}
        x={0}
        y={0}
        draggable
        onMouseDown={(e) => {
          e.cancelBubble = true;
        }}
        onTouchStart={(e) => {
          if (e.evt.touches.length >= 2) return;
          e.cancelBubble = true;
        }}
        onDragStart={(e) => {
          e.cancelBubble = true;
          editDrag.current = true;
        }}
        onDragMove={(e) => {
          e.cancelBubble = true;
          let x = e.target.x();
          let y = e.target.y();
          if (useProject.getState().snapOn) {
            const g = Math.max(useProject.getState().gridStep || 0.1, 1e-4);
            const nx = Math.round((c.x + x / px) / g) * g;
            const ny = Math.round((c.y + y / px) / g) * g;
            x = (nx - c.x) * px;
            y = (ny - c.y) * px;
            e.target.position({ x, y });
          }
          const node = geom(e.target);
          if (node) {
            node.x(x);
            node.y(y);
          }
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          skipClick.current = true;
          window.setTimeout(() => {
            skipClick.current = false;
          }, 500);
          editDrag.current = false;
          const dx = e.target.x() / px;
          const dy = e.target.y() / px;
          const node = geom(e.target);
          if (node) {
            node.x(0);
            node.y(0);
          }
          e.target.position({ x: 0, y: 0 });
          if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) useProject.getState().moveSelectedFace(dx, dy);
        }}
      >
        <Line
          ref={bodyRef}
          points={corners.flatMap((pt) => [sx(pt.x), sy(pt.y)])}
          closed
          fill="rgba(0,0,0,0.01)"
          strokeEnabled={false}
        />
        <Group ref={centerRef} x={sx(c.x)} y={sy(c.y)} listening>
          <Circle radius={22} fill="rgba(0,0,0,0.001)" />
          <Line points={[-10, 0, -2.5, 0]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[2.5, 0, 10, 0]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[0, -10, 0, -2.5]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[0, 2.5, 0, 10]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[-10, 0, -7, -2.4]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[-10, 0, -7, 2.4]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[10, 0, 7, -2.4]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[10, 0, 7, 2.4]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[0, -10, -2.4, -7]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[0, -10, 2.4, -7]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[0, 10, -2.4, 7]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[0, 10, 2.4, 7]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
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
              <Rect x={-6} y={-6} width={12} height={12} fill="#c45c26" stroke="#fff" strokeWidth={2} listening={false} />
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
              <Rect x={-5} y={-5} width={10} height={10} fill="#c45c26" stroke="#fff" strokeWidth={2} listening={false} />
            </Group>
          );
        })}
        <Group
          ref={rotRef}
          x={rp.x}
          y={rp.y}
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
            const stage = e.target.getStage();
            const ptr = stage?.getPointerPosition();
            const p = ptr ? { x: (ptr.x - panX) / px, y: (ptr.y - panY) / px } : toWorld(e.target);
            rot0.current = Math.atan2(p.y - c.y, p.x - c.x);
            useProject.getState().setCadLiveRot(rect.rot || 0);
          }}
          onDragMove={(e) => {
            e.cancelBubble = true;
            const stage = e.target.getStage();
            const ptr = stage?.getPointerPosition();
            if (!ptr) return;
            const p = { x: (ptr.x - panX) / px, y: (ptr.y - panY) / px };
            const ang = Math.atan2(p.y - c.y, p.x - c.x);
            const deg = snapDeltaToAngle(rect.rot || 0, ((ang - rot0.current) * 180) / Math.PI, 45, 10);
            const rad = (deg * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const next = corners.map((pt) => ({
              x: c.x + (pt.x - c.x) * cos - (pt.y - c.y) * sin,
              y: c.y + (pt.x - c.x) * sin + (pt.y - c.y) * cos,
            }));
            applyLiveCorners(next, geom(e.target));
            e.target.position(rotPos(next));
            useProject.getState().setCadLiveRot(normDeg((rect.rot || 0) + deg));
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            editDrag.current = false;
            const stage = e.target.getStage();
            const ptr = stage?.getPointerPosition();
            const p = ptr ? { x: (ptr.x - panX) / px, y: (ptr.y - panY) / px } : toWorld(e.target);
            const ang = Math.atan2(p.y - c.y, p.x - c.x);
            const deg = snapDeltaToAngle(rect.rot || 0, ((ang - rot0.current) * 180) / Math.PI, 45, 10);
            useProject.getState().rotateSelectedFace(deg);
          }}
        >
          <Circle radius={22} fill="rgba(255,255,255,0.001)" />
          <Circle radius={12} fill="#fff" stroke="#1b1f24" strokeWidth={1.5} listening={false} />
          <Arc
            innerRadius={5}
            outerRadius={7.5}
            angle={230}
            rotation={-35}
            fillEnabled={false}
            stroke="#1b1f24"
            strokeWidth={1.4}
            listening={false}
          />
          <Line points={[5.2, -7.4, 9.2, -3.6, 3.4, -3.2]} closed fill="#1b1f24" listening={false} />
        </Group>
        <RectMeasure corners={corners} sx={sx} sy={sy} px={px} unit={useProject.getState().measureUnit} />
      </Group>
    );
  }

  const verts = faceVertices(d, faceId);
  if (verts.length === 3) {
    const tri = verts.map((v) => ({ x: v.x, y: v.y }));
    const aLen = dist(tri[0]!, tri[1]!);
    const bLen = dist(tri[1]!, tri[2]!);
    const area = faceArea(d, faceId);
    const paintTri = (pts: Pt[], node?: Konva.Node, skip?: number) => {
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
      const mx = (pts[0]!.x + pts[1]!.x + pts[2]!.x) / 3;
      const my = (pts[0]!.y + pts[1]!.y + pts[2]!.y) / 3;
      centerRef.current?.position({ x: sx(mx), y: sy(my) });
      const locale = useProject.getState().locale;
      const unit = useProject.getState().measureUnit;
      const areaU = useProject.getState().units.area;
      const stage = node?.getStage() ?? bitsRef.current?.getStage();
      const midA = { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2 };
      const midB = { x: (pts[1]!.x + pts[2]!.x) / 2, y: (pts[1]!.y + pts[2]!.y) / 2 };
      stage?.findOne("#tri-atext")?.setAttrs({
        x: sx(midA.x) - 40,
        y: sy(midA.y) - 14,
        text: `${tr(locale, "drawW")} ${formatLen(dist(pts[0]!, pts[1]!), unit)}`,
      });
      stage?.findOne("#tri-btext")?.setAttrs({
        x: sx(midB.x) - 8,
        y: sy(midB.y) - 8,
        text: `${tr(locale, "drawH")} ${formatLen(dist(pts[1]!, pts[2]!), unit)}`,
      });
      stage?.findOne("#tri-stext")?.setAttrs({
        x: sx(mx) - 40,
        y: sy(my) - 8,
        text: formatAreaU(Math.abs((pts[0]!.x * (pts[1]!.y - pts[2]!.y) + pts[1]!.x * (pts[2]!.y - pts[0]!.y) + pts[2]!.x * (pts[0]!.y - pts[1]!.y)) / 2), areaU),
      });
    };
    return (
      <Group
        ref={bitsRef}
        x={0}
        y={0}
        draggable
        onMouseDown={(e) => {
          e.cancelBubble = true;
        }}
        onTouchStart={(e) => {
          if (e.evt.touches.length >= 2) return;
          e.cancelBubble = true;
        }}
        onDragStart={(e) => {
          e.cancelBubble = true;
          editDrag.current = true;
        }}
        onDragMove={(e) => {
          e.cancelBubble = true;
          let x = e.target.x();
          let y = e.target.y();
          if (useProject.getState().snapOn) {
            const g = Math.max(useProject.getState().gridStep || 0.1, 1e-4);
            const nx = Math.round((c.x + x / px) / g) * g;
            const ny = Math.round((c.y + y / px) / g) * g;
            x = (nx - c.x) * px;
            y = (ny - c.y) * px;
            e.target.position({ x, y });
          }
          const node = geom(e.target);
          if (node) {
            node.x(x);
            node.y(y);
          }
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          skipClick.current = true;
          window.setTimeout(() => {
            skipClick.current = false;
          }, 500);
          editDrag.current = false;
          const dx = e.target.x() / px;
          const dy = e.target.y() / px;
          const node = geom(e.target);
          if (node) {
            node.x(0);
            node.y(0);
          }
          e.target.position({ x: 0, y: 0 });
          if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) useProject.getState().moveSelectedFace(dx, dy);
        }}
      >
        <Line
          ref={bodyRef}
          points={tri.flatMap((pt) => [sx(pt.x), sy(pt.y)])}
          closed
          fill="rgba(0,0,0,0.01)"
          strokeEnabled={false}
        />
        <Group ref={centerRef} x={sx(c.x)} y={sy(c.y)} listening>
          <Circle radius={22} fill="rgba(0,0,0,0.001)" />
          <Line points={[-10, 0, -2.5, 0]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[2.5, 0, 10, 0]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[0, -10, 0, -2.5]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
          <Line points={[0, 2.5, 0, 10]} stroke="#111" strokeWidth={1.4} lineCap="round" listening={false} />
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
            <Rect x={-6} y={-6} width={12} height={12} fill="#c45c26" stroke="#fff" strokeWidth={2} listening={false} />
          </Group>
        ))}
        <Text
          id="tri-atext"
          x={sx((tri[0]!.x + tri[1]!.x) / 2) - 40}
          y={sy((tri[0]!.y + tri[1]!.y) / 2) - 14}
          width={88}
          align="center"
          text={`${tr(useProject.getState().locale, "drawW")} ${formatLen(aLen, useProject.getState().measureUnit)}`}
          fontSize={12}
          fontFamily="IBM Plex Sans, sans-serif"
          fill="#1b1f24"
          listening={false}
        />
        <Text
          id="tri-btext"
          x={sx((tri[1]!.x + tri[2]!.x) / 2) - 8}
          y={sy((tri[1]!.y + tri[2]!.y) / 2) - 8}
          width={88}
          text={`${tr(useProject.getState().locale, "drawH")} ${formatLen(bLen, useProject.getState().measureUnit)}`}
          fontSize={12}
          fontFamily="IBM Plex Sans, sans-serif"
          fill="#1b1f24"
          listening={false}
        />
        <Text
          id="tri-stext"
          x={sx(c.x) - 40}
          y={sy(c.y) - 8}
          width={80}
          align="center"
          text={formatAreaU(area, useProject.getState().units.area)}
          fontSize={12}
          fontFamily="IBM Plex Sans, sans-serif"
          fill="#1b1f24"
          listening={false}
        />
      </Group>
    );
  }

  return null;
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
) {
  if (poly.hidden) return null;
  const selected = poly.id === selectedPolyId || selectedPolyIds.includes(poly.id);
  const fill = poly.fill ?? fillOf(poly.cadType ?? poly.kind);
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
      <Line key={poly.id} points={poly.points.flatMap((p) => [sx(p.x), sy(p.y)])} stroke="#7a5a2b" dash={[8, 5]} strokeWidth={1.2} listening={false} />
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
        fill={fill}
        opacity={0.72}
        stroke={selected ? "#2b6f9a" : "#1b1f24"}
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
        fill={fill}
        opacity={0.72}
        stroke={selected ? "#2b6f9a" : "#1b1f24"}
        strokeWidth={selected ? 2.5 : 1.5}
        {...hold}
      />
    );
  }
  return (
    <Line
      key={poly.id}
      id={`face-${poly.id}`}
      x={0}
      y={0}
      points={poly.points.flatMap((p) => [sx(p.x), sy(p.y)])}
      closed={poly.closed}
      fill={poly.closed ? fill : undefined}
      opacity={poly.closed ? 0.72 : 0.5}
      stroke={selected ? "#2b6f9a" : poly.type === "line" ? "#3a4148" : "#1b1f24"}
      strokeWidth={selected ? 2.5 : 2}
      {...hold}
    />
  );
}

function stripLocal(s: { w: number; l: number; ox: number; oy: number }, start: number, pxPerM: number) {
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
