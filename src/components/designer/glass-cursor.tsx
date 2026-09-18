import { useEffect, useRef, type RefObject } from "react";
import type Konva from "konva";
import { MagnifierRenderer } from "./magnifier-renderer";

/** Pixel-density-aware vector lens clipped to the toolbar pointer silhouette. */
export function GlassCursor({stageRef,wrapRef,enabled,background}: {
  stageRef:RefObject<Konva.Stage|null>;wrapRef:RefObject<HTMLDivElement|null>;enabled:boolean;background:string;
}) {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const wrap=wrapRef.current,canvas=canvasRef.current;
    if(!wrap || !canvas || !enabled) return;
    const ctx=canvas.getContext("2d");if(!ctx)return;
    const renderer=new MagnifierRenderer();
    const path=new Path2D("M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z");
    const size=22,hotspot=4;
    let raf=0,point:{x:number;y:number}|null=null;
    const paint=()=>{
      raf=0;const stage=stageRef.current;if(!point||!stage)return;
      const rect=wrap.getBoundingClientRect(),x=point.x-rect.left,y=point.y-rect.top;
      if(x<0||y<0||x>rect.width||y>rect.height){canvas.style.visibility="hidden";return;}
      const dpr=window.devicePixelRatio||1;
      canvas.width=Math.ceil(size*dpr);canvas.height=Math.ceil(size*dpr);
      const image=renderer.render(stage,{x:x+size/2-hotspot,y:y+size/2-hotspot},rect.width,rect.height,size,dpr,background,1.35);
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,size,size);
      ctx.save();ctx.scale(size/24,size/24);ctx.clip(path);ctx.scale(24/size,24/size);
      ctx.drawImage(image,0,0,size,size);ctx.fillStyle="rgba(255,255,255,.10)";ctx.fillRect(0,0,size,size);ctx.restore();
      ctx.save();ctx.scale(size/24,size/24);ctx.strokeStyle="#000000";ctx.lineWidth=.65;ctx.lineJoin="round";ctx.stroke(path);ctx.restore();
      canvas.style.transform=`translate(${x-hotspot}px,${y-hotspot}px)`;canvas.style.visibility="visible";
    };
    const move=(e:PointerEvent)=>{
      if(e.pointerType!=="mouse" || (!(e.target instanceof HTMLCanvasElement)&&!e.buttons)){hide();return;}
      point={x:e.clientX,y:e.clientY};if(!raf)raf=requestAnimationFrame(paint);
    };
    const hide=()=>{point=null;canvas.style.visibility="hidden";cancelAnimationFrame(raf);raf=0;};
    wrap.addEventListener("pointermove",move);wrap.addEventListener("pointerleave",hide);
    return()=>{wrap.removeEventListener("pointermove",move);wrap.removeEventListener("pointerleave",hide);hide();renderer.dispose();};
  },[enabled,background,stageRef,wrapRef]);
  return enabled?<canvas ref={canvasRef} aria-hidden style={{position:"absolute",left:0,top:0,width:22,height:22,zIndex:35,pointerEvents:"none",visibility:"hidden"}}/>:null;
}
