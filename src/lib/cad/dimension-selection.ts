import type {Pt} from '../geometry';
import type {CadDrawing} from './types';
import {layoutDimensions} from './dimension-layout';
import {segmentTouchesLabel,labelBoxesOverlap} from '../head-presentation';

/** Resolve one gesture to one object type. Heads win over their dimension extensions. */
export function irrigationSelectionTarget(heads:(Pt&{id:string})[],dimensionIds:string[],a:Pt,b:Pt,px:number,tap:boolean) {
  const hits=tap ? heads.filter(h=>Math.hypot(h.x-b.x,h.y-b.y)*px<18)
    .sort((h,k)=>Math.hypot(h.x-b.x,h.y-b.y)-Math.hypot(k.x-b.x,k.y-b.y)).slice(0,1)
    : heads.filter(h=>h.x>=Math.min(a.x,b.x)&&h.x<=Math.max(a.x,b.x)&&h.y>=Math.min(a.y,b.y)&&h.y<=Math.max(a.y,b.y));
  return hits.length ? {kind:'heads' as const,ids:hits.map(h=>h.id)}
    : dimensionIds.length ? {kind:'dimensions' as const,ids:dimensionIds} : null;
}

/** Hit-test what is painted, including offset lines and text, not the measured objects. */
export function dimensionsInBox(d:CadDrawing,a:Pt,b:Pt,px:number,mode:'plan'|'irrigation',label:(length:number)=>string,tap=false) {
  if(d.layers?.dims?.visible===false||d.layers?.dims?.locked)return [];
  const pad=tap?10:0;
  const box={x:Math.min(a.x,b.x)*px-pad,y:Math.min(a.y,b.y)*px-pad,width:Math.abs(a.x-b.x)*px+pad*2,height:Math.abs(a.y-b.y)*px+pad*2};
  const hits=[...layoutDimensions(d,px,mode,label).values()].filter(o=>{
    return labelBoxesOverlap(box,o.box)||o.segments.some(({a,b})=>segmentTouchesLabel(a,b,box,0));
  });
  if(tap){
    // Prefer the number under the pointer over neighbouring enlarged touch targets.
    const x=b.x*px,y=b.y*px;
    const textHit=hits.find(o=>x>=o.box.x&&x<=o.box.x+o.box.width&&y>=o.box.y&&y<=o.box.y+o.box.height);
    if(textHit)return [textHit.id];
  }
  return (tap?hits.slice(-1):hits).map(d=>d.id);
}
export function updateDimensionSelection(previous:string[],incoming:string[],additive:boolean,toggle=false) {
  if(!additive)return [...new Set(incoming)];
  const next=new Set(previous);
  for(const id of incoming)if(toggle&&next.has(id))next.delete(id);else next.add(id);
  return [...next];
}
