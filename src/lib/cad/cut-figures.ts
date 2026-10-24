import clipping, { type Polygon, type Ring } from 'polygon-clipping';
import { closestOnSegment, dist, polygonArea, type Pt } from '@/lib/geometry';
import { addChain, cloneDrawing, faceHoles, facePoints, resolveDim } from './engine';
import { emptyDrawing, layerForType, type CadDrawing, type CadFace, type LayerGrouping, type SnapHit } from './types';

const polygon = (d: CadDrawing, id: string): Polygon => [facePoints(d,id),...faceHoles(d,id)].map(r=>r.map(p=>[p.x,p.y]));
const area = (p: Polygon) => p.reduce((sum,r,i)=>sum+(i ? -1:1)*polygonArea(r.map(([x,y])=>({x,y}))),0);
const editable = (d:CadDrawing,f:CadFace) => !f.segment && !f.hidden && !f.locked &&
  d.layers?.[layerForType(f.type)]?.visible!==false && !d.layers?.[layerForType(f.type)]?.locked &&
  !(f.spline&&!f.spline.closed) && !(f.freehand&&!f.freehand.closed);

type Segment=[Pt,Pt];
/** The interval on ab shared with cd, excluding isolated point contacts. */
function overlap([a,b]:Segment,[c,d]:Segment):[number,number]|null {
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
  if(len<1e-8 || Math.abs(dx*(c.y-a.y)-dy*(c.x-a.x))/len>1e-6 || Math.abs(dx*(d.y-a.y)-dy*(d.x-a.x))/len>1e-6)return null;
  const project=(p:Pt)=>((p.x-a.x)*dx+(p.y-a.y)*dy)/(len*len);
  const t=project(c),u=project(d),lo=Math.max(0,Math.min(t,u)),hi=Math.min(1,Math.max(t,u));
  return (hi-lo)*len>1e-7?[lo,hi]:null;
}
function splitAlongGroupBoundary(d0:CadDrawing,path:Pt[]) {
  const groups=new Map<string,CadFace[]>();
  for(const f of Object.values(d0.faces))if(f.layerId){const members=groups.get(f.layerId)??[];members.push(f);groups.set(f.layerId,members);}
  const cuts:Segment[]=path.slice(1).map((p,i)=>[path[i]!,p]);
  const covered=(segment:Segment)=>{
    const intervals=cuts.map(c=>overlap(segment,c)).filter((v):v is [number,number]=>!!v).sort((a,b)=>a[0]-b[0]);
    let end=0;for(const [a,b] of intervals){if(a>end+1e-7)return false;end=Math.max(end,b);}return end>=1-1e-7;
  };
  let drawing:CadDrawing|null=null;const faceIds:string[]=[];
  for(const [layerId,members] of groups) {
    if(members.length<2 || members.some(f=>!editable(d0,f)))continue;
    const polygons=members.map(f=>polygon(d0,f.id));
    const segments=polygons.map(p=>p.flatMap(r=>r.map(([x,y],i):Segment=>[{x,y},{x:r[(i+1)%r.length]![0],y:r[(i+1)%r.length]![1]}])));
    const before=members.map(()=>new Set<number>()),after=members.map(()=>new Set<number>());
    let removed=false;
    for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++) {
      const contacts:Segment[]=[];
      for(const ab of segments[i]!)for(const cd of segments[j]!) {
        const interval=overlap(ab,cd);if(!interval)continue;
        contacts.push(interval.map(t=>({x:ab[0].x+(ab[1].x-ab[0].x)*t,y:ab[0].y+(ab[1].y-ab[0].y)*t})) as Segment);
      }
      const intersects=clipping.intersection(polygons[i]!,polygons[j]!).some(p=>area(p)>1e-8);
      if(!contacts.length&&!intersects)continue;
      before[i]!.add(j);before[j]!.add(i);
      if(!intersects&&contacts.every(covered)){removed=true;continue;}
      after[i]!.add(j);after[j]!.add(i);
    }
    if(!removed)continue;
    const components=(graph:Set<number>[])=>{
      const seen=new Set<number>(),parts:number[][]=[];
      for(let i=0;i<members.length;i++)if(!seen.has(i)){
        const part=[i];seen.add(i);for(const v of part)for(const next of graph[v]!)if(!seen.has(next)){seen.add(next);part.push(next);}parts.push(part);
      }
      return parts;
    };
    const oldParts=components(before),newParts=components(after),detached:number[][]=[],remaining:number[]=[];
    for(const old of oldParts){const parts=newParts.filter(p=>old.includes(p[0]!));remaining.push(...parts[0]!);detached.push(...parts.slice(1));}
    if(!detached.length)continue;
    drawing??=cloneDrawing(d0);
    [remaining,...detached].forEach((part,index)=>{
      let nextLayer=layerId;
      if(index){let serial=index;do{nextLayer=`${layerId}-cut-${serial++}`;}while(Object.values(drawing!.faces).some(f=>f.layerId===nextLayer));}
      for(const member of part){
        const f=drawing!.faces[members[member]!.id]!;
        f.layerId=part.length>1?nextLayer:undefined;
        f.layerPivot=undefined;f.layerAngle=undefined;
        if(part.length===1){f.name=f.layerParent?.name??f.name;f.layerParent=undefined;}
        else if(index){
          // Keep earlier merges within each piece, without reconnecting across the cut.
          const remap=(parent:LayerGrouping|undefined):LayerGrouping|undefined=>parent?{
            ...parent,layerId:parent.layerId?`${nextLayer}-parent-${parent.layerId}`:undefined,parent:remap(parent.parent),
          }:undefined;
          f.layerParent=remap(f.layerParent);
        }
        faceIds.push(f.id);
      }
    });
  }
  return drawing?{drawing,faceIds}:null;
}

const cutCache=new WeakMap<CadDrawing,Map<string,ReturnType<typeof computeCutFigures>>>();
export function cutFigures(d:CadDrawing,path:Pt[]) {
  const key=JSON.stringify(path);
  let entries=cutCache.get(d);if(!entries){entries=new Map();cutCache.set(d,entries);}
  if(entries.has(key))return entries.get(key)!;
  const result=computeCutFigures(d,path);if(entries.size>=16)entries.clear();entries.set(key,result);return result;
}

/** Split only crossed figures in an isolated graph; never join neighbouring contours. */
function computeCutFigures(d0: CadDrawing, path: Pt[]) {
  if(path.length<2 || path.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))) return null;
  const changes: {source:CadFace;pieces:Polygon[]}[]=[];
  for(const source of Object.values(d0.faces)) {
    if(!editable(d0,source)) continue;
    const original=polygon(d0,source.id);
    if(original[0]!.length<3) continue;
    let graph=emptyDrawing();
    for(const ring of original) graph=addChain(graph,ring.map(([x,y])=>({x,y})),true,source.type,false);
    graph=addChain(graph,path,false,source.type,false);
    let pieces:Polygon[]=[];
    try {
      // Nested rings are holes only when their entire area is inside a ring.
      // A concave neighbour can contain its vertex average without containing the face.
      const rings:Polygon[]=Object.keys(graph.faces).map(id=>[facePoints(graph,id).map(p=>[p.x,p.y])]);
      pieces=rings.flatMap(ring=>{
        const nested=rings.filter(other=>area(other)<area(ring)-1e-8 && clipping.difference(other,ring).length===0);
        const cell=nested.length?clipping.difference(ring,...nested):[ring];
        return clipping.intersection(original,cell);
      }).filter(p=>area(p)>1e-8);
    } catch { continue; }
    if(pieces.length<2) continue;
    // Reject numerical slivers, overlaps and gaps instead of modifying a valid figure.
    const total=area(original),sum=pieces.reduce((n,p)=>n+area(p),0);
    if(Math.abs(sum-total)>Math.max(1e-6,total*1e-7)) continue;
    pieces.sort((a,b)=>area(b)-area(a));
    changes.push({source,pieces});
  }
  if(!changes.length) return splitAlongGroupBoundary(d0,path);
  const drawing=cloneDrawing(d0), faceIds:string[]=[];
  const dimensions=Object.values(d0.dims??{}).map(dim=>({dim,...resolveDim(d0,dim)}));
  let serial=0;
  const uid=(prefix:string)=>{let id:string;do{id=`cut-${prefix}-${++serial}`;}while(drawing.faces[id]||drawing.edges[id]||drawing.vertices[id]);return id;};
  for(const {source,pieces} of changes) {
    const oldEdges=new Set([...source.outer,...source.holes.flat()].map(h=>h.e));
    delete drawing.faces[source.id];
    for(const id of oldEdges) {
      const edge=drawing.edges[id];if(!edge)continue;
      if(edge.faceL===source.id)edge.faceL=null;
      if(edge.faceR===source.id)edge.faceR=null;
      if(!edge.faceL&&!edge.faceR)delete drawing.edges[id];
    }
    pieces.forEach((piece,index)=>{
      const id=index===0?source.id:uid('f');
      const loop=(ring:Ring):CadFace['outer']=>{
        const points=ring.map(([x,y])=>({x,y}));
        if(points.length>1&&dist(points[0]!,points.at(-1)!)<1e-8)points.pop();
        const vertices=points.map(p=>{const id=uid('v');drawing.vertices[id]={id,...p};return id;});
        return vertices.map((a,i)=>{const eid=uid('e');drawing.edges[eid]={id:eid,a,b:vertices[(i+1)%vertices.length]!,bulge:0,faceL:id,faceR:null};return {e:eid,dir:1};});
      };
      drawing.faces[id]={id,type:source.type,name:source.name,fill:source.fill,hydro:source.hydro,
        textureRotation:source.textureRotation,textureSize:source.textureSize,locked:false,hidden:false,
        outer:loop(piece[0]!),holes:piece.slice(1).map(loop),pointShape:true};
      faceIds.push(id);
    });
  }
  const used=new Set(Object.values(drawing.edges).flatMap(e=>[e.a,e.b]));
  const ownedVertices=new Set(changes.flatMap(({source})=>[...source.outer,...source.holes.flat()].flatMap(h=>{
    const e=d0.edges[h.e];return e?[e.a,e.b]:[];
  })));
  for(const id of ownedVertices)if(!used.has(id))delete drawing.vertices[id];
  for(const [id,c] of Object.entries(drawing.constraints??{}))
    if((d0.vertices[c.a]&&!drawing.vertices[c.a])||(d0.edges[c.a]&&!drawing.edges[c.a]) ||
      (c.b&&((d0.vertices[c.b]&&!drawing.vertices[c.b])||(d0.edges[c.b]&&!drawing.edges[c.b]))))delete drawing.constraints![id];
  for(const {dim,a,b} of dimensions) {
    if((dim.aId&&!drawing.vertices[dim.aId])||(dim.bId&&!drawing.vertices[dim.bId]))
      drawing.dims![dim.id]={...dim,a,b,aId:undefined,bId:undefined};
  }
  if(drawing.faceOrder) drawing.faceOrder=[...drawing.faceOrder.filter(id=>drawing.faces[id]),...faceIds.filter(id=>!drawing.faceOrder!.includes(id))];
  return {drawing,faceIds};
}

/** Scissors follow the same visible rings that are used for cutting, including holes. */
export function snapCutPoint(d: CadDrawing, point: Pt, options: {
  snapOn:boolean; snapGridOn:boolean; gridStep:number; pxPerMeter:number; pointerType?:string; closeTo?:Pt|null;
}): SnapHit {
  if(!options.snapOn) return {pt:point,kind:"none"};
  const tolerance=(options.pointerType==="touch"?22:options.pointerType==="pen"?14:12)/Math.max(options.pxPerMeter,1e-6);
  if(options.closeTo && dist(point,options.closeTo)<=tolerance) return {pt:options.closeTo,kind:"close"};
  let best:SnapHit={pt:point,kind:"none"},distance=tolerance;
  const consider=(pt:Pt,kind:"end"|"edge",faceId:string)=>{
    const length=dist(point,pt);
    if(length>tolerance || (best.kind==="end" && kind!=="end"))return;
    if(kind==="end" && best.kind!=="end" || length<=distance) {best={pt,kind,faceId};distance=length;}
  };
  for(const face of Object.values(d.faces)) {
    if(face.segment || face.hidden || face.locked || d.layers?.[layerForType(face.type)]?.visible===false ||
      d.layers?.[layerForType(face.type)]?.locked || (face.spline&&!face.spline.closed) || (face.freehand&&!face.freehand.closed)) continue;
    for(const ring of [facePoints(d,face.id),...faceHoles(d,face.id)]) {
      for(let i=0;i<ring.length;i++) {
        const a=ring[i]!,b=ring[(i+1)%ring.length]!;
        if(!face.circle&&!face.ellipse&&!face.spline&&!face.freehand) consider(a,"end",face.id);
        consider(closestOnSegment(point,a,b),"edge",face.id);
      }
    }
  }
  if(best.kind!=="none")return best;
  if(options.snapGridOn && options.gridStep>0) return {pt:{x:Math.round(point.x/options.gridStep)*options.gridStep,y:Math.round(point.y/options.gridStep)*options.gridStep},kind:"grid"};
  return best;
}
