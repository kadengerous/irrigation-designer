export type LibraryPointer = {pointerId:number;pointerType:string;button:number;isPrimary:boolean;clientX:number;clientY:number};

/** A deliberate hold starts touch dragging; a normal swipe still scrolls the library. */
export function libraryPointerDrag(host:Window, start:LibraryPointer, handlers:{preview:(x:number,y:number)=>void;drop:(x:number,y:number)=>void;end:()=>void}) {
  if(start.button!==0||!start.isPrimary)return ()=>{};
  let x=start.clientX,y=start.clientY,active=false,done=false;
  const begin=()=>{if(!done){active=true;handlers.preview(x,y);}};
  const timer=host.setTimeout(begin,start.pointerType==='touch'?360:500);
  const finish=(commit:boolean)=>{
    if(done)return;done=true;host.clearTimeout(timer);
    host.removeEventListener('pointermove',move,true);host.removeEventListener('pointerup',up,true);
    host.removeEventListener('pointercancel',cancel,true);host.removeEventListener('touchmove',touchMove,true);
    host.removeEventListener('touchend',touchEnd,true);host.removeEventListener('touchcancel',cancel,true);
    host.removeEventListener('blur',cancel);host.removeEventListener('keydown',key,true);
    const shouldDrop=commit&&active&&Math.hypot(x-start.clientX,y-start.clientY)>=8;
    // Keep the drag surface transparent to hit-testing until after the drop.
    try{if(shouldDrop)handlers.drop(x,y);}finally{handlers.end();}
  };
  const move=(e:PointerEvent)=>{
    if(e.pointerId!==start.pointerId)return;x=e.clientX;y=e.clientY;
    if(!active&&Math.hypot(x-start.clientX,y-start.clientY)>8){
      if(start.pointerType==='touch'){finish(false);return;}
      begin();
    }
    if(active){e.preventDefault();e.stopPropagation();handlers.preview(x,y);}
  };
  const up=(e:PointerEvent)=>{if(e.pointerId!==start.pointerId)return;x=e.clientX;y=e.clientY;if(active){e.preventDefault();e.stopPropagation();}finish(true);};
  const cancel=()=>finish(false);
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false);}};
  const touchMove=(e:TouchEvent)=>{if(!active)return;const t=e.touches[0];if(t){x=t.clientX;y=t.clientY;e.preventDefault();e.stopPropagation();handlers.preview(x,y);}};
  const touchEnd=(e:TouchEvent)=>{if(!active){finish(false);return;}const t=e.changedTouches[0];if(t){x=t.clientX;y=t.clientY;}e.preventDefault();e.stopPropagation();finish(true);};
  host.addEventListener('pointermove',move,{capture:true,passive:false});host.addEventListener('pointerup',up,true);
  host.addEventListener('pointercancel',cancel,true);host.addEventListener('touchmove',touchMove,{capture:true,passive:false});
  host.addEventListener('touchend',touchEnd,{capture:true,passive:false});host.addEventListener('touchcancel',cancel,true);
  host.addEventListener('blur',cancel);host.addEventListener('keydown',key,true);
  return cancel;
}

export function libraryDropPoint(x:number,y:number,rect:{left:number;top:number;width:number;height:number},view:{panX:number;panY:number;pxPerMeter:number}) {
  if(![x,y,rect.left,rect.top,rect.width,rect.height,view.panX,view.panY,view.pxPerMeter].every(Number.isFinite))return null;
  if(rect.width<8||rect.height<8||view.pxPerMeter<=0||x<rect.left||y<rect.top||x>rect.left+rect.width||y>rect.top+rect.height)return null;
  return {x:(x-rect.left-view.panX)/view.pxPerMeter,y:(y-rect.top-view.panY)/view.pxPerMeter};
}
