import {closestOnSegment, dist, type Pt} from "@/lib/geometry";
import {faceHoles, facePoints, resolveDim} from "./engine";
import type {CadDim, CadDrawing} from "./types";

const EPS=1e-6;
/** Join dimension chains on a shared side, preserving dimensions in other directions. */
export function fuseDimensions(before:CadDrawing,after:CadDrawing,faceIds:string[]) {
  const boundaries=faceIds.map(id=>[facePoints(before,id),...faceHoles(before,id)]);
  const onBoundary=(p:Pt,rings:Pt[][])=>rings.some(r=>r.some((a,i)=>dist(p,closestOnSegment(p,a,r[(i+1)%r.length]!))<EPS));
  const entries=Object.values(before.dims ?? {}).map(dim=>{
    const {a,b}=resolveDim(before,dim);
    return {dim,a,b,owned:boundaries.some(r=>onBoundary(a,r)&&onBoundary(b,r))};
  });
  const used=new Set<string>();
  const vertex=(p:Pt)=>Object.values(after.vertices).find(v=>dist(v,p)<EPS)?.id;
  for(const entry of entries) {
    if(used.has(entry.dim.id)) continue;
    if(!entry.owned) {
      // Preserve the actual endpoints if union removed their old vertex IDs.
      if((entry.dim.aId&&!after.vertices[entry.dim.aId])||(entry.dim.bId&&!after.vertices[entry.dim.bId]))
        after.dims![entry.dim.id]={...entry.dim,a:entry.a,b:entry.b,aId:vertex(entry.a),bId:vertex(entry.b)};
      continue;
    }
    const length=dist(entry.a,entry.b);
    if(length<EPS) continue;
    const ux=(entry.b.x-entry.a.x)/length,uy=(entry.b.y-entry.a.y)/length;
    const projection=(p:Pt)=>(p.x-entry.a.x)*ux+(p.y-entry.a.y)*uy;
    const sameLine=(p:Pt)=>Math.abs((p.x-entry.a.x)*uy-(p.y-entry.a.y)*ux)<EPS;
    let min=0,max=length,changed=true;
    const chain=[entry];used.add(entry.dim.id);
    while(changed) {
      changed=false;
      for(const other of entries) {
        if(!other.owned||used.has(other.dim.id)||!sameLine(other.a)||!sameLine(other.b)) continue;
        const lo=Math.min(projection(other.a),projection(other.b)),hi=Math.max(projection(other.a),projection(other.b));
        if(hi<min-EPS||lo>max+EPS) continue;
        min=Math.min(min,lo);max=Math.max(max,hi);chain.push(other);used.add(other.dim.id);changed=true;
      }
    }
    const a={x:entry.a.x+ux*min,y:entry.a.y+uy*min},b={x:entry.a.x+ux*max,y:entry.a.y+uy*max};
    const labels=new Set(chain.map(e=>e.dim.label));
    const result:CadDim={...entry.dim,a,b,aId:vertex(a),bId:vertex(b),
      label:labels.size===1 ? entry.dim.label:undefined};
    after.dims![entry.dim.id]=result;
    for(const other of chain.slice(1)) delete after.dims![other.dim.id];
  }
}
