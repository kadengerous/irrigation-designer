import type { ButtonHTMLAttributes } from 'react';

/** Touch activates on release; its later compatibility click must not toggle twice. */
export function canvasTapActivation(activate:()=>void): ButtonHTMLAttributes<HTMLButtonElement> {
  let touch:{id:number;x:number;y:number}|null=null,handled=0;
  return {
    onPointerDown:e=>{touch=e.pointerType==='touch'&&e.isPrimary?{id:e.pointerId,x:e.clientX,y:e.clientY}:null;},
    onPointerMove:e=>{if(touch&&Math.hypot(e.clientX-touch.x,e.clientY-touch.y)>8)touch=null;},
    onPointerCancel:()=>{touch=null;},
    onPointerUp:e=>{const p=touch;touch=null;
      if(p?.id===e.pointerId&&Math.hypot(e.clientX-p.x,e.clientY-p.y)<=8){e.preventDefault();handled=Date.now();activate();}
    },
    onKeyDown:e=>{if(e.key==='Enter'||e.key===' ')handled=0;},
    onClick:e=>{if(Date.now()-handled<650){e.preventDefault();return;}activate();},
  };
}
