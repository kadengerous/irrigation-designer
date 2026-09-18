import { useEffect, useRef, type RefObject } from "react";
import { Line } from "react-konva";
import type Konva from "konva";
import { useProject } from "@/lib/project-store";
import { tr, type Locale } from "@/lib/i18n";
import { dist, type Pt } from "@/lib/geometry";

import { guidanceCopy as copy, closureTarget } from "./drawing-guidance-model";
import { useFloatingPlacement } from "./floating-workspace";
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
 const hintRef=useRef<HTMLDivElement>(null);
 const box=useFloatingPlacement(hintRef,b=>({
  x:b.x+b.width-(hintRef.current?.offsetWidth??0),
  y:b.y+b.height-(hintRef.current?.offsetHeight??40),
 }),10,enabled&&!catalog);
 const wrap=wrapRef.current?.getBoundingClientRect();
 if(!enabled||catalog)return null;
 const row=copy[locale];
 const pointTool=["polygon","spline","line","polyline"].includes(sub);
 const text=editing?row[4]:closureTarget(points,sub,hover,px)?row[3]:tool==="draw"&&sub!=="none"?(pointTool?(points.length?row[2]:row[1]):(locale === "ru" || locale === "en" ? tr(locale,`hint_${sub}`) : row[6])):tool?row[6]:row[5];
 // Existing tool translations are retained; untranslated tools use the localized general instruction.
 const translated=text.startsWith("hint_")?row[6]:text;
 return <div ref={hintRef} className="drawing-guidance" data-floating-priority="10" style={{left:(box?.x??0)-(wrap?.left??0),top:(box?.y??0)-(wrap?.top??0),maxWidth:box?.width,maxHeight:box?.height,visibility:box?"visible":"hidden"}} role="status" tabIndex={0} onPointerDown={event=>event.stopPropagation()} onTouchStart={event=>event.stopPropagation()} onWheel={event=>event.stopPropagation()}>{translated}</div>;
}
