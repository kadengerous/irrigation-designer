import { dist, snapShapeTranslationToGrid, type Pt } from '@/lib/geometry';
import { faceVertices, layerFaceIds } from './engine';
import { segmentAlignmentAnchors, snapSegmentAlignment } from './segment-alignment';
import { cadSnap } from './snap';
import type { CadDrawing } from './types';

export function figureSnapTargets(d: CadDrawing, editing: string | null): CadDrawing {
  const excluded=new Set(editing ? layerFaceIds(d,editing) : []);
  const faces=Object.fromEntries(Object.entries(d.faces).filter(([id,f])=>!excluded.has(id) && !f.hidden));
  const blocked=new Set(Object.values(d.faces).filter(f=>excluded.has(f.id)||f.hidden).flatMap(f=>[...f.outer,...f.holes.flat()].map(h=>h.e)));
  const allowed=new Set(Object.values(faces).flatMap(f=>[...f.outer,...f.holes.flat()].map(h=>h.e)));
  const edges=Object.fromEntries(Object.entries(d.edges).filter(([id])=>!blocked.has(id)||allowed.has(id)));
  const verticesUsed=new Set(Object.values(edges).flatMap(e=>[e.a,e.b]));
  return {...d,faces,edges,vertices:Object.fromEntries(Object.entries(d.vertices).filter(([id])=>verticesUsed.has(id)))};
}
export function snapFigurePoint(d: CadDrawing,p: Pt,editing: string | null,px: number,gridStep: number,gridOn: boolean,fixed?: Pt) {
  const hit = cadSnap(p,figureSnapTargets(d,editing),{pxPerMeter:px,pointerType:'touch',snapOn:true,snapGridOn:gridOn,gridStep});
  // Direct corner/edge connections retain priority over alignment and the grid.
  return fixed && ['none','grid','horiz','vert','parallel','perp','extend'].includes(hit.kind)
    ? snapSegmentAlignment(p,hit.pt,segmentAlignmentAnchors(d,fixed,editing ?? undefined),px) : hit.pt;
}
export function snapFigureTranslation(d: CadDrawing,editing: string | null,anchors: Pt[],dx: number,dy: number,step: number,px: number,gridOn: boolean) {
  const target=figureSnapTargets(d,editing);
  const corners=editing ? layerFaceIds(d,editing).flatMap(id=>{
    const f=d.faces[id]!;
    return f.circle||f.ellipse ? [] : f.spline?.pts ?? f.freehand?.pts ?? faceVertices(d,id);
  }) : anchors;
  let best: {dx:number;dy:number;distance:number;rank:number} | null=null;
  for(const [list,corner] of [[corners,true],[anchors,false]] as [Pt[],boolean][]) for(const a of list) {
    const moved={x:a.x+dx,y:a.y+dy};
    const hit=cadSnap(moved,target,{pxPerMeter:px,pointerType:'touch',snapOn:true,snapGridOn:false,gridStep:step});
    if(hit.kind==='none') continue;
    const rank=corner && hit.kind==='end' ? 0 : 1;
    const distance=dist(moved,hit.pt);
    if(!best || rank<best.rank || rank===best.rank && distance<best.distance) best={dx:dx+hit.pt.x-moved.x,dy:dy+hit.pt.y-moved.y,distance,rank};
  }
  if(best) return {dx:best.dx,dy:best.dy};
  return gridOn ? snapShapeTranslationToGrid(anchors,dx,dy,step,px) : {dx,dy};
}
