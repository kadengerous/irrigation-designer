import clipping, { type Polygon, type MultiPolygon, type Ring } from "polygon-clipping";
import { closestOnSegment, dist } from "@/lib/geometry";
import { cloneDrawing, faceHoles, facePoints } from "./engine";
import { layerForType, type CadDrawing, type CadFace } from "./types";
import {fuseDimensions} from "./fuse-dimensions";

const EPS = 1e-7;
function eligible(d: CadDrawing, id: string) {
  const f = d.faces[id];
  return !!f && !f.segment && !f.layerId && !f.hidden && !f.locked &&
    d.layers?.[layerForType(f.type)]?.visible !== false && !d.layers?.[layerForType(f.type)]?.locked &&
    (!f.spline || f.spline.closed) && (!f.freehand || f.freehand.closed) && facePoints(d,id).length >= 3;
}
function polygon(d: CadDrawing, id: string): Polygon {
  return [facePoints(d,id), ...faceHoles(d,id)].map(ring => ring.map(p => [p.x,p.y]));
}
function touching(d: CadDrawing, a: string, b: string) {
  const pa=polygon(d,a), pb=polygon(d,b);
  const points=(ring: Ring)=>ring.map(([x,y])=>({x,y}));
  for(const ra of pa) for(const rb of pb) {
    const aa=points(ra), bb=points(rb);
    for(const p of aa) for(let j=0;j<bb.length;j++)
      if(dist(p,closestOnSegment(p,bb[j]!,bb[(j+1)%bb.length]!))<=EPS) return true;
    for(const p of bb) for(let j=0;j<aa.length;j++)
      if(dist(p,closestOnSegment(p,aa[j]!,aa[(j+1)%aa.length]!))<=EPS) return true;
  }
  try { return clipping.intersection(pa,pb).length>0; } catch { return false; }
}

/** Explicit selection may fuse a connected set. Automatic discovery offers only a pair. */
export function fusionCandidates(d: CadDrawing, selected: string[]): string[] {
  const ids=[...new Set(selected)];
  if(!ids.length || ids.some(id=>!eligible(d,id))) return [];
  if(ids.length===1) {
    // Prefer the last added direct neighbour. Never follow its contacts onward:
    // snapping another figure to that neighbour is not consent to merge it too.
    const neighbour=Object.keys(d.faces).reverse().find(id=>
      id!==ids[0] && eligible(d,id) && touching(d,ids[0]!,id));
    return neighbour ? [ids[0]!,neighbour] : [];
  }
  const pool=ids;
  const connected=[ids[0]!];
  for(let i=0;i<connected.length;i++) for(const id of pool)
    if(!connected.includes(id) && touching(d,connected[i]!,id)) connected.push(id);
  if(connected.length<2 || (ids.length>1 && connected.length!==ids.length)) return [];
  return connected;
}

/** Explicit union, isolated from unrelated CAD topology. Never rebuild the whole drawing. */
export function fuseFigures(d0: CadDrawing, ids: string[]): CadDrawing {
  if(ids.length<2 || fusionCandidates(d0,ids).length!==new Set(ids).size) return d0;
  let result: MultiPolygon;
  try { result=clipping.union(polygon(d0,ids[0]!),...ids.slice(1).map(id=>polygon(d0,id))); }
  catch { return d0; }
  if(!result.length) return d0;
  // Point-only contacts remain one editable face, joined at the common vertex.
  let outer=result[0]![0]!.slice(0,-1);
  const pending=result.slice(1).map(p=>p[0]!.slice(0,-1));
  while(pending.length) {
    let joined=false;
    for(let k=0;k<pending.length && !joined;k++) {
      const ring=pending[k]!;
      for(let i=0;i<outer.length && !joined;i++) {
        const j=ring.findIndex(p=>Math.hypot(p[0]-outer[i]![0],p[1]-outer[i]![1])<=EPS);
        if(j<0) continue;
        const walk=[...ring.slice(j),...ring.slice(0,j)];
        outer=[...outer.slice(0,i),...walk,...outer.slice(i)];
        pending.splice(k,1); joined=true;
      }
    }
    if(!joined) return d0;
  }
  const d=cloneDrawing(d0), removed=new Set(ids), keepId=ids[0]!;
  const source=d.faces[keepId]!;
  const ownedEdges=new Set(ids.flatMap(id=>[...d.faces[id]!.outer,...d.faces[id]!.holes.flat()].map(h=>h.e)));
  const candidateVertices=new Set([...ownedEdges].flatMap(id=>d.edges[id] ? [d.edges[id]!.a,d.edges[id]!.b] : []));
  for(const id of ids) delete d.faces[id];
  for(const eid of ownedEdges) {
    const edge=d.edges[eid]; if(!edge) continue;
    if(edge.faceL && removed.has(edge.faceL)) edge.faceL=null;
    if(edge.faceR && removed.has(edge.faceR)) edge.faceR=null;
    if(!edge.faceL && !edge.faceR) delete d.edges[eid];
  }
  const used=new Set(Object.values(d.edges).flatMap(e=>[e.a,e.b]));
  const removedVertices=new Set([...candidateVertices].filter(id=>!used.has(id)));
  for(const id of removedVertices) delete d.vertices[id];
  for(const [id,c] of Object.entries(d.constraints ?? {}))
    if(removedVertices.has(c.a) || (c.b && removedVertices.has(c.b)) || (ownedEdges.has(c.a) && !d.edges[c.a]) || (c.b && ownedEdges.has(c.b) && !d.edges[c.b])) delete d.constraints![id];
  let serial=0;
  const uid=(prefix:string)=>{let id:string;do{id=`${prefix}-${keepId}-${++serial}`;}while(d.vertices[id]||d.edges[id]);return id;};
  const loop=(ring:Ring):CadFace["outer"]=>{
    const vertices=ring.map(([x,y])=>{const id=uid("v");d.vertices[id]={id,x,y};return id;});
    return vertices.map((a,i)=>{const id=uid("e");d.edges[id]={id,a,b:vertices[(i+1)%vertices.length]!,bulge:0,faceL:keepId,faceR:null};return {e:id,dir:1};});
  };
  d.faces[keepId]={id:keepId,type:source.type,name:source.name,fill:source.fill ?? "theme",hydro:source.hydro,
    locked:false,hidden:false,outer:loop(outer),holes:result.flatMap(p=>p.slice(1)).map(r=>loop(r.slice(0,-1))),pointShape:true};
  if(d.faceOrder) d.faceOrder=d.faceOrder.filter(id=>id===keepId || !removed.has(id));
  fuseDimensions(d0,d,ids);
  return d;
}
