import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Line } from "react-konva";
import type Konva from "konva";
import { useProject } from "@/lib/project-store";
import { tr } from "@/lib/i18n";
import { localeDirection } from "@/lib/locale-config";
import { uiPixels } from "@/lib/ui-scale";
import { dist, type Pt } from "@/lib/geometry";

import { guidanceCopy as copy, closureTarget } from "./drawing-guidance-model";
import { floatingObstacles, guidanceBounds, placeGuidance, workspaceBounds, type Box } from "./floating-layout";
export function ClosureGuide({points,drawSub,hover,px,sx,sy}:{points:Pt[];drawSub:string;hover:Pt|null;px:number;sx:(v:number)=>number;sy:(v:number)=>number}) {
 const target=closureTarget(points,drawSub,hover,px);
 const ref=useRef<Konva.Line>(null);
 useEffect(()=>{
  if (!target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let frame=0;
  const tick=(time:number)=>{ref.current?.dashOffset(-time/70);ref.current?.getLayer()?.batchDraw();frame=requestAnimationFrame(tick);};
  frame=requestAnimationFrame(tick);return ()=>cancelAnimationFrame(frame);
 },[!!target]);
 if(!target)return null;
 const last=points[points.length-1]!;
 return <Line ref={ref} points={[sx(last.x),sy(last.y),sx(target.x),sy(target.y)]} stroke="#9be84d" strokeWidth={1} dash={[5,4]} listening={false}/>;
}
export function DrawingGuidance({wrapRef,hover}:{wrapRef:RefObject<HTMLDivElement|null>;hover:Pt|null}) {
 const enabled=useProject(s=>s.showHints),locale=useProject(s=>s.locale),tool=useProject(s=>s.tool),sub=useProject(s=>s.drawSub);
 const editing=useProject(s=>s.cadEditId),points=useProject(s=>s.draft.points),px=useProject(s=>s.pxPerMeter),catalog=useProject(s=>s.catalogOpen);
 const hintRef=useRef<HTMLDivElement>(null),measureRef=useRef<HTMLSpanElement>(null);
 const [box,setBox]=useState<Box|null>(null);
 const row=copy[locale];
 const pointTool=["polygon","spline","line","polyline"].includes(sub);
 const text=editing?row[4]:closureTarget(points,sub,hover,px)?row[3]:tool==="draw"&&sub!=="none"?(pointTool?(points.length?row[2]:row[1]):tr(locale,`hint_${sub}`)):tool?row[6]:row[5];
 // Every supported language has tool-specific copy; unknown tools retain general guidance.
 const translated=text.startsWith("hint_")?row[6]:text;
 useLayoutEffect(()=>{
  if(!enabled||catalog){setBox(null);return;}
  let frame=0,measurementKey='';
  const sizes=new Map<number,{width:number;height:number}>();
  const update=()=>{
   const el=hintRef.current,measurer=measureRef.current;
   if(el&&measurer){
    const workspace=workspaceBounds(),rtl=localeDirection(locale)==='rtl',gap=uiPixels(8),minimum=uiPixels(192),maximum=uiPixels(480);
    const toolbar=Array.from(document.querySelectorAll<HTMLElement>('.adaptive-toolbar,.mobile-tool-strip-panel')).find(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;});
    const r=toolbar?.getBoundingClientRect(),tools=r?{x:r.left,y:r.top,width:r.width,height:r.height}:null;
    const css=getComputedStyle(el),chromeX=parseFloat(css.paddingLeft)+parseFloat(css.paddingRight)+parseFloat(css.borderLeftWidth)+parseFloat(css.borderRightWidth),chromeY=parseFloat(css.paddingTop)+parseFloat(css.paddingBottom)+parseFloat(css.borderTopWidth)+parseFloat(css.borderBottomWidth);
    const key=[css.font,css.lineHeight,css.letterSpacing,chromeX,chromeY,uiPixels(36)].join('|');if(key!==measurementKey){measurementKey=key;sizes.clear();}
    const measure=(width:number)=>{const cached=sizes.get(width);if(cached)return cached;measurer.style.maxWidth=`${Math.max(1,width-chromeX-2)}px`;const r=measurer.getBoundingClientRect(),size={width:Math.min(width,Math.ceil(r.width+chromeX+2)),height:Math.max(uiPixels(36),Math.ceil(r.height+chromeY))};if(sizes.size>64)sizes.clear();sizes.set(width,size);return size;};
    const natural=measure(maximum),preferred=(b:Box)=>({x:rtl?b.x+b.width-Math.min(b.width,natural.width):b.x,y:b.y});
    const obstacles=[...floatingObstacles(el,10),...(tools?[tools]:[])],bounds=guidanceBounds(workspace,tools,rtl,gap,minimum);
    let next=placeGuidance(bounds,measure,preferred(bounds),obstacles,minimum,maximum,gap);
    if(!next.width)next=placeGuidance(workspace,measure,preferred(workspace),obstacles,minimum,maximum,gap);
    setBox(old=>old&&Object.keys(next).every(k=>Math.abs(old[k as keyof Box]-next[k as keyof Box])<.5)?old:next);
   }
   frame=requestAnimationFrame(update);
  };
  update();return()=>cancelAnimationFrame(frame);
 },[enabled,catalog,locale,translated]);
 const wrap=wrapRef.current?.getBoundingClientRect();
 if(!enabled||catalog)return null;
 return <div ref={hintRef} className="drawing-guidance" data-floating-priority="10" style={{left:(box?.x??0)-(wrap?.left??0),top:(box?.y??0)-(wrap?.top??0),width:box?.width,maxWidth:box?.width,visibility:box&&box.width>0?"visible":"hidden"}} role="status" onPointerDown={event=>event.stopPropagation()} onTouchStart={event=>event.stopPropagation()} onWheel={event=>event.stopPropagation()}><span>{translated}</span><span ref={measureRef} className="drawing-guidance-measure" aria-hidden="true">{translated}</span></div>;
}
