export type PreviewPoint = {x:number;y:number};
export type PreviewView = {px:number;panX:number;panY:number};
const clampScale=(px:number)=>Math.max(.01,Math.min(5000,px));

export function previewGesture(view:PreviewView,before:PreviewPoint[],after:PreviewPoint[]):PreviewView {
 if(!before.length||before.length!==after.length)return view;
 const middle=(points:PreviewPoint[])=>points.length>1?{x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2}:points[0];
 const a=middle(before),b=middle(after);
 const distance=(points:PreviewPoint[])=>Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y);
 const ratio=before.length>1&&distance(before)>2?distance(after)/distance(before):1;
 return previewZoomAt(view,a,view.px*ratio,b);
}

export function previewZoomAt(view:PreviewView,anchor:PreviewPoint,scale:number,target=anchor):PreviewView {
 if(!Number.isFinite(scale)||scale<=0)return view;
 const px=clampScale(scale);
 return {px,panX:target.x-(anchor.x-view.panX)*px/view.px,panY:target.y-(anchor.y-view.panY)*px/view.px};
}

/** Native touch events carry both fingers together on iPad. Do not also apply
 * compatibility pointer/Safari gesture events to that same pinch. */
export function installPreviewNavigation(element:HTMLElement,read:()=>PreviewView,write:(view:PreviewView)=>void) {
 let touches:PreviewPoint[]=[],pointer:{id:number;point:PreviewPoint}|null=null;
 let gesture:{view:PreviewView;anchor:PreviewPoint}|null=null;
 const point=(event:{clientX:number;clientY:number})=>{
  const rect=element.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};
 };
 const consume=(event:Event)=>{if(event.cancelable)event.preventDefault();event.stopPropagation();};
 const touchPoints=(event:TouchEvent)=>Array.from(event.touches).sort((a,b)=>a.identifier-b.identifier).map(point);
 const touchStart=(event:TouchEvent)=>{consume(event);pointer=null;gesture=null;touches=touchPoints(event);};
 const touchMove=(event:TouchEvent)=>{
  consume(event);const next=touchPoints(event);write(previewGesture(read(),touches,next));touches=next;
 };
 const touchEnd=(event:TouchEvent)=>{consume(event);touches=touchPoints(event);};
 const down=(event:PointerEvent)=>{
  if(event.pointerType==='touch'||event.button!==0)return;
  consume(event);element.setPointerCapture(event.pointerId);pointer={id:event.pointerId,point:point(event)};
 };
 const move=(event:PointerEvent)=>{
  if(!pointer||event.pointerId!==pointer.id)return;
  consume(event);const next=point(event);write(previewGesture(read(),[pointer.point],[next]));pointer.point=next;
 };
 const end=(event:PointerEvent)=>{
  if(pointer?.id!==event.pointerId)return;pointer=null;
  if(element.hasPointerCapture(event.pointerId))element.releasePointerCapture(event.pointerId);
 };
 const wheel=(event:WheelEvent)=>{
  consume(event);if(touches.length>1||gesture)return;
  const unit=event.deltaMode===1?16:event.deltaMode===2?element.clientHeight:1;
  const exponent=Math.max(-1,Math.min(1,-event.deltaY*unit*(event.ctrlKey||event.metaKey? .01:.002)));
  write(previewZoomAt(read(),point(event),read().px*Math.exp(exponent)));
 };
 const safari=(event:Event)=>{
  consume(event);if(touches.length>1)return;
  const e=event as Event & {scale:number;clientX:number;clientY:number};
  if(e.type==='gestureend'){gesture=null;return;}
  if(e.type==='gesturestart')gesture={view:read(),anchor:Number.isFinite(e.clientX)&&Number.isFinite(e.clientY)?point(e):{x:element.clientWidth/2,y:element.clientHeight/2}};
  else if(gesture)write(previewZoomAt(gesture.view,gesture.anchor,gesture.view.px*e.scale));
 };
 const handlers:Record<string,EventListener>={touchstart:touchStart as EventListener,touchmove:touchMove as EventListener,
  touchend:touchEnd as EventListener,touchcancel:touchEnd as EventListener,pointerdown:down as EventListener,
  pointermove:move as EventListener,pointerup:end as EventListener,pointercancel:end as EventListener,
  lostpointercapture:end as EventListener,wheel:wheel as EventListener,gesturestart:safari,gesturechange:safari,gestureend:safari};
 for(const [type,handler] of Object.entries(handlers))element.addEventListener(type,handler,{passive:false});
 return ()=>{for(const [type,handler] of Object.entries(handlers))element.removeEventListener(type,handler);};
}
