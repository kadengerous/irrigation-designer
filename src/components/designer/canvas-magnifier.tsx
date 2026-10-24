import { useEffect, useRef, type RefObject } from "react";
import type Konva from "konva";
import type { Pt } from "@/lib/geometry";
import { useProject } from "@/lib/project-store";
import { canvasTheme } from "@/lib/theme";
import { canShowMagnifier, magnifierLayout, constructionMagnifierFocus } from "./canvas-magnifier-model";
import { TAPE_MEASURE_TIP, TAPE_MEASURE_BODY, TAPE_MEASURE_TICKS } from "./tape-measure-icon";
import { MagnifierRenderer } from "./magnifier-renderer";
import { placeFloating, workspaceBounds, floatingObstacles } from "./floating-layout";
import {usePlacementFocus} from './placement-focus';
import {drawPlacementSnapMarker} from './placement-snap-marker';
import {SPRINKLER_TARGET_COLOR,SPRINKLER_TARGET_CIRCLE,SPRINKLER_TARGET_CROSS} from './sprinkler-target';

/** A live detail view of the existing scene, independent of the main canvas's input and exports. */
export function CanvasMagnifier({ stageRef, wrapRef, editDrag, gestureBlocked, drawingFocus }: {
  stageRef: RefObject<Konva.Stage | null>;
  wrapRef: RefObject<HTMLDivElement | null>;
  editDrag: RefObject<boolean>;
  gestureBlocked: RefObject<boolean>;
  drawingFocus: Pt | null;
}) {
  const lensRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const drawingFocusRef = useRef(drawingFocus);
  drawingFocusRef.current = drawingFocus;
  useEffect(() => {
    const lens = lensRef.current, frameElement = frameRef.current, wrap = wrapRef.current;
    if (!lens || !frameElement || !wrap) return;
    const ctx = lens.getContext("2d");
    if (!ctx) return;
    const renderer = new MagnifierRenderer();
    const contacts = new Set<number>();
    let contact: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean; handle: Konva.Node | null; landscapeTransform:boolean } | null = null;
    let raf = 0;
    const hide = () => { frameElement.style.visibility = "hidden"; };
    const stop = () => {
      contact = null;
      cancelAnimationFrame(raf);
      raf = 0;
      hide();
    };
    const reset = () => { stop(); contacts.clear(); usePlacementFocus.setState({focus:null}); };
    const frame = () => {
      raf = 0;
      const placement=usePlacementFocus.getState().focus;
      if ((!contact&&!placement)||(placement?.owner==='catalog-head'&&!contact)) {hide();return;}
      const stage = stageRef.current;
      const state = useProject.getState();
      const eligible = canShowMagnifier({ blocked: gestureBlocked.current || contacts.size > 1,
        catalogOpen: state.catalogOpen, editDrag: editDrag.current, tool: state.tool, drawSub: state.drawSub,
        cadEditId: state.cadEditId, selectedEdgeId: state.selectedEdgeId, draftPointCount: state.draft.points.length,
        sectorEditId: state.sectorEditId, measureSub: state.measureSub,
        placementActive:!!placement,landscapeTransform:contact?.landscapeTransform });
      if (!stage || (!placement&&!contact?.moved) || !eligible) {
        hide();
        raf = requestAnimationFrame(frame);
        return;
      }
      const rect = wrap.getBoundingClientRect();
      const finger = contact?{ x: contact.x - rect.left, y: contact.y - rect.top }:
        {x:(placement!.point.x*state.pxPerMeter+state.panX)*rect.width/stage.width(),y:(placement!.point.y*state.pxPerMeter+state.panY)*rect.height/stage.height()};
      let focus = finger;
      if(placement){
        focus={x:(placement.point.x*state.pxPerMeter+state.panX)*rect.width/stage.width(),y:(placement.point.y*state.pxPerMeter+state.panY)*rect.height/stage.height()};
      } else if (editDrag.current && contact?.handle?.getStage() === stage && contact.handle.isVisible()) {
        const position = contact.handle.getAbsolutePosition();
        focus = { x: position.x * rect.width / stage.width(), y: position.y * rect.height / stage.height() };
      } else if (!editDrag.current && drawingFocusRef.current) {
        const point = constructionMagnifierFocus(state.tool === "draw" ? state.drawSub : null,
          state.draft.points.at(-1) ?? null, drawingFocusRef.current);
        focus = { x: (point.x * state.pxPerMeter + state.panX) * rect.width / stage.width(),
          y: (point.y * state.pxPerMeter + state.panY) * rect.height / stage.height() };
      }
      // Phone tool/layer strips overlay the stage; tablet toolbars are already above it in flow.
      // Measure the current strip so opening, closing or resizing it cannot cover the lens.
      const topPanel = wrap.closest(".mobile-canvas-stage")?.querySelector<HTMLElement>("[data-magnifier-top-panel]");
      const topInset = topPanel ? Math.max(0, topPanel.getBoundingClientRect().bottom - rect.top) : 0;
      let layout = magnifierLayout(rect.width, rect.height, topInset);
      const phone = !!document.querySelector('.app-shell[data-mobile="true"]');
      if (!phone || state.sectorEditId) {
        const bounds = phone ? { x: rect.left + 4, y: rect.top + topInset + 4, width: rect.width - 8, height: rect.height - topInset - 8 } : workspaceBounds();
        const obstacles = [...floatingObstacles(frameElement,30),
          {x:rect.left+finger.x-44,y:rect.top+finger.y-44,width:88,height:88},
          {x:rect.left+focus.x-32,y:rect.top+focus.y-32,width:64,height:64}];
        const lensSize = phone ? 100 : 120;
        const wanted={x:bounds.x+bounds.width-lensSize,y:bounds.y};
        const first=placeFloating(bounds,{width:lensSize,height:lensSize},wanted,obstacles);
        const size=Math.min(first.width,first.height);
        const placed=placeFloating(bounds,{width:size,height:size},wanted,obstacles);
        layout=size>=60?{size,left:placed.x-rect.left,top:placed.y-rect.top}:null;
      }
      if (!layout || finger.x < 0 || finger.y < 0 || finger.x > rect.width || finger.y > rect.height) {
        hide();
        raf = requestAnimationFrame(frame);
        return;
      }
      const theme = canvasTheme(state.themeId);
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const contentSize = layout.size - 2; // The outer frame includes its 1px border on both sides.
      const bitmapSize = Math.round(contentSize * dpr);
      if (lens.width !== bitmapSize || lens.height !== bitmapSize) {
        lens.width = bitmapSize;
        lens.height = bitmapSize;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, contentSize, contentSize);
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, contentSize, contentSize);
      const source = renderer.render(stage, focus, rect.width, rect.height, contentSize, dpr, theme.bg,undefined,placement?.objectId,!!placement);
      ctx.drawImage(source, 0, 0, contentSize, contentSize);
      if(placement)drawPlacementSnapMarker(ctx,contentSize,placement.snapKind);
      if (state.tool === "measure" && state.measureSub === "measure") {
        ctx.save();
        ctx.translate(contentSize/2 - TAPE_MEASURE_TIP.x, contentSize/2 - TAPE_MEASURE_TIP.y);
        ctx.strokeStyle = theme.ink; ctx.fillStyle = theme.bg; ctx.lineWidth = 0.8;
        ctx.lineJoin = "round"; ctx.lineCap = "round";
        const body = new Path2D(TAPE_MEASURE_BODY);
        ctx.fill(body); ctx.stroke(body); ctx.stroke(new Path2D(TAPE_MEASURE_TICKS));
        ctx.beginPath(); ctx.arc(17.25,11,2.6,0,Math.PI*2); ctx.stroke();
        ctx.restore();
      }
      // A fine, open-centre sight leaves the actual join visible.
      const centre = contentSize / 2;
      ctx.beginPath();
      if(placement?.owner==='catalog-head'){
        ctx.save();ctx.translate(centre,centre);ctx.lineCap='round';
        const cross=new Path2D(SPRINKLER_TARGET_CROSS);
        ctx.beginPath();ctx.arc(0,0,SPRINKLER_TARGET_CIRCLE,0,Math.PI*2);
        ctx.fillStyle='#0f9f8233';ctx.fill();ctx.strokeStyle='white';ctx.lineWidth=2.5;ctx.stroke();
        ctx.lineWidth=3;ctx.stroke(cross);ctx.strokeStyle=SPRINKLER_TARGET_COLOR;ctx.lineWidth=1.25;ctx.stroke();ctx.stroke(cross);
        ctx.restore();ctx.beginPath();
      }else for (const sign of [-1, 1]) {
        ctx.moveTo(centre + sign * 8, centre); ctx.lineTo(centre + sign * 14, centre);
        ctx.moveTo(centre, centre + sign * 8); ctx.lineTo(centre, centre + sign * 14);
      }
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 0.65;
      ctx.stroke();
      frameElement.style.width = `${layout.size}px`;
      frameElement.style.height = `${layout.size}px`;
      frameElement.style.transform = `translate(${layout.left}px, ${layout.top}px)`;
      frameElement.style.visibility = "visible";
      raf = requestAnimationFrame(frame);
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      contacts.add(event.pointerId);
      if (contacts.size !== 1 || gestureBlocked.current) { stop(); return; }
      const stage = stageRef.current;
      if (!stage || !(event.target instanceof HTMLCanvasElement) || !stage.container().contains(event.target)) return;
      const rect = wrap.getBoundingClientRect();
      const hit = stage.getIntersection({ x: (event.clientX - rect.left) * stage.width() / rect.width,
        y: (event.clientY - rect.top) * stage.height() / rect.height });
      let handle: Konva.Node | null = null;
      let landscapeTransform=false;
      for(let node:Konva.Node|null=hit;node&&node!==stage;node=node.getParent()){
        if(node.hasName('plant-controls')||node.hasName('landscape-controls'))landscapeTransform=true;
      }
      for (let parent = hit?.getParent(); parent && parent !== stage; parent = parent.getParent()) {
        if (parent.getClassName() === "Layer") break;
        if (parent.hasName("magnifier-symbol") || parent.getChildren().some(child => child.hasName("edit-point-glyph"))) { handle = parent; break; }
      }
      // Desktop magnification is reserved for the small irrigation editing handles.
      if (event.pointerType === "mouse" && !handle?.hasName("sector-edit-handle")) return;
      contact = { id: event.pointerId, x: event.clientX, y: event.clientY,
        startX: event.clientX, startY: event.clientY, moved: false, handle,landscapeTransform };
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const move = (event: PointerEvent) => {
      if (!contact || contact.id !== event.pointerId) return;
      contact.x = event.clientX; contact.y = event.clientY;
      contact.moved ||= Math.hypot(contact.x - contact.startX, contact.y - contact.startY) > 3;
    };
    const up = (event: PointerEvent) => {
      contacts.delete(event.pointerId);
      if (contact?.id === event.pointerId) stop();
    };
    const visibility = () => { if (document.hidden) reset(); };
    const options = { capture: true, passive: true };
    const unsubscribe=usePlacementFocus.subscribe(()=>{if(!raf)raf=requestAnimationFrame(frame);});
    // Observe only. Existing drawing, snapping, pointer capture and touch navigation own input.
    window.addEventListener("pointerdown", down, options);
    window.addEventListener("pointermove", move, options);
    window.addEventListener("pointerup", up, options);
    window.addEventListener("pointercancel", up, options);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      unsubscribe();
      reset();
      renderer.dispose();
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [stageRef, wrapRef, editDrag, gestureBlocked]);
  return <div ref={frameRef} aria-hidden="true" data-canvas-magnifier="1" data-floating-priority="30" style={{
    position: "absolute", left: 0, top: 0, visibility: "hidden", pointerEvents: "none", zIndex: 20,
    borderRadius: "var(--radius-md, 10px)", border: "1px solid var(--color-line)", overflow: "hidden",
    background: "var(--color-surface)", boxShadow: "0 5px 18px #0003, 0 0 0 2px #ffffff25", boxSizing: "border-box",
  }}>
    <canvas ref={lensRef} style={{ display: "block", width: "100%", height: "100%" }}/>
    <div style={{ position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none",
      background: "linear-gradient(135deg, #ffffff75 0%, #ffffff00 25%, #ffffff00 76%, #ffffff14 100%), radial-gradient(ellipse at center, transparent 56%, #ffffff18 100%)",
      boxShadow: "inset 0 0 0 1px #ffffff55, inset 0 2px 5px #ffffff45, inset 0 -3px 8px #00000024",
    }}/>
  </div>;
}
