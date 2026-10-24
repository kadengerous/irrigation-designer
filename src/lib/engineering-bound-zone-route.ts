import clipping,{type MultiPolygon,type Polygon} from 'polygon-clipping';
import {drawingOrMigrate} from './cad/engine';
import {polygonHipRoof} from './cad/hip-roof';
import {layerPurpose} from './cad/types';
import {dist,type Pt} from './geometry';
import type {Head,Project} from './project-types';
import type {EngineeringPipe} from './engineering';
import {autoConnections,materializePipeJunctions,projectToSegment} from './engineering-connections';
import {AUTO_ROUTE_INSET_M,type HeadRouteResult} from './engineering-head-route';
import {closedDrawingFigures,figureAtPoint,irrigationFigures,type IrrigationFigure} from './irrigation-figures';
import {lineInSurface,surfaceArea} from './irrigation-geometry';
import {landscapeExclusions} from './landscape-objects';

const EPS=1e-7;
const copy=(p:Pt):Pt=>({x:p.x,y:p.y});
const ring=(ps:Pt[])=>ps.map(p=>[p.x,p.y] as [number,number]);
const polygon=(f:IrrigationFigure):Polygon=>[ring(f.points),...f.holes.map(ring)];
const pathLength=(ps:Pt[])=>ps.slice(1).reduce((sum,p,i)=>sum+dist(ps[i]!,p),0);
const interpolate=(a:Pt,b:Pt,t:number):Pt=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
type Station={point:Pt;station:number;distance:number};
type AssignedHead={head:Head;station:number};
type Section={points:Pt[];consumerNodes:Record<string,number>};
export type BoundZoneRouteResult=HeadRouteResult&{consumerNodes?:Record<string,number>};

function stationOnPath(p:Pt,ps:Pt[],closed=false):Station{
 let best:Station={point:copy(ps[0]!),station:0,distance:dist(p,ps[0]!)},offset=0;
 const count=closed?ps.length:ps.length-1;
 for(let i=0;i<count;i++){
  const a=ps[i]!,b=ps[(i+1)%ps.length]!,hit=projectToSegment(p,a,b),length=dist(a,b);
  if(hit.distance<best.distance-EPS)best={point:hit.point,station:offset+hit.t*length,distance:hit.distance};offset+=length;
 }
 return best;
}
function pointAtStation(ps:Pt[],station:number){
 let offset=0;for(let i=1;i<ps.length;i++){const a=ps[i-1]!,b=ps[i]!,length=dist(a,b);if(station<=offset+length+EPS)return interpolate(a,b,length?Math.max(0,Math.min(1,(station-offset)/length)):0);offset+=length;}
 return copy(ps.at(-1)!);
}
function pathInterval(ps:Pt[],from:number,to:number):Pt[]{
 const result=[pointAtStation(ps,from)];let offset=0;
 for(let i=1;i<ps.length;i++){offset+=dist(ps[i-1]!,ps[i]!);if(offset>from+EPS&&offset<to-EPS)result.push(copy(ps[i]!));}
 const end=pointAtStation(ps,to);if(dist(result.at(-1)!,end)>EPS)result.push(end);return result;
}
function blockedSurface(project:Project,physicalOnly=false):MultiPolygon{
 const d=drawingOrMigrate(project),polygons=[...closedDrawingFigures(d).filter(f=>physicalOnly?['building','pool','water'].includes(d.faces[f.id]!.type):layerPurpose(d.faces[f.id]!)==='none').map(polygon),...landscapeExclusions(d).map(ps=>[ring(ps)])];
 return polygons.length?clipping.union(polygons[0]!,...polygons.slice(1)):[];
}
/** Tests only a newly generated segment. Existing hand-drawn supply segments
 * are intentionally never reinterpreted as lawn or obstacle violations. */
function clearSegment(a:Pt,b:Pt,blocked:MultiPolygon){
 if(dist(a,b)<EPS)return true;
 // Subtract obstacles from a generous local rectangle; boundary contact is allowed.
 const coordinates=[a,b,...blocked.flatMap(p=>p.flat().map(([x,y])=>({x:x!,y:y!})))];
 const x0=Math.min(...coordinates.map(p=>p.x))-1,y0=Math.min(...coordinates.map(p=>p.y))-1,x1=Math.max(...coordinates.map(p=>p.x))+1,y1=Math.max(...coordinates.map(p=>p.y))+1;
 const world:MultiPolygon=[[[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]]];
 return lineInSurface(a,b,blocked.length?clipping.difference(world,blocked):world);
}

/** A horizontal cut through the existing straight-skeleton roof gives the
 * parallel inset, including reflex/sloping corners and split narrow necks.
 * Each roof face has a constant slope from its eave; no bisector guess is used. */
export function insetSurface(surface:MultiPolygon):MultiPolygon{
 const pieces:MultiPolygon[]=[];
 for(const p of surface){
  const ps=p.map(r=>r.map(([x,y])=>({x:x!,y:y!}))),roof=polygonHipRoof(ps[0]!,ps.slice(1));if(!roof)return [];
  const outer=ps[0]!,extent=Math.max(...outer.map(p=>p.x))-Math.min(...outer.map(p=>p.x))+Math.max(...outer.map(p=>p.y))-Math.min(...outer.map(p=>p.y))+2;
  for(let i=0;i<roof.planes.length;i++){
   const face=roof.planes[i]!,[a,b]=roof.eaves[i]!,length=dist(a,b);if(length<EPS)continue;
   const ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
   const side=face.reduce((best,p)=>{const s=ux*(p.y-a.y)-uy*(p.x-a.x);return Math.abs(s)>Math.abs(best)?s:best;},0)>=0?1:-1;
   const nx=-uy*side,ny=ux*side,c={x:a.x+nx*AUTO_ROUTE_INSET_M,y:a.y+ny*AUTO_ROUTE_INSET_M};
   const half:Polygon=[ring([{x:c.x-ux*extent,y:c.y-uy*extent},{x:c.x+ux*extent,y:c.y+uy*extent},{x:c.x+ux*extent+nx*extent*2,y:c.y+uy*extent+ny*extent*2},{x:c.x-ux*extent+nx*extent*2,y:c.y-uy*extent+ny*extent*2}])];
   const piece=clipping.intersection([ring(face)],half);if(piece.length)pieces.push(piece);
  }
 }
 return pieces.length?clipping.union(pieces[0]!,...pieces.slice(1)).filter(p=>surfaceArea([p])>EPS):[];
}
function closedPoints(r:number[][]){const ps=r.map(([x,y])=>({x:x!,y:y!}));if(ps.length>1&&dist(ps[0]!,ps.at(-1)!)<EPS)ps.pop();return ps;}
function visibleProjection(p:Pt,ps:Pt[],valid:(a:Pt,b:Pt)=>boolean):Station|undefined{
 let best:Station|undefined,offset=0;
 for(let i=0;i<ps.length;i++){
  const a=ps[i]!,b=ps[(i+1)%ps.length]!,length=dist(a,b),hit=projectToSegment(p,a,b);
  for(const target of [{point:hit.point,t:hit.t},{point:a,t:0},{point:b,t:1}]){
   const distance=dist(p,target.point);if((!best||distance<best.distance-EPS)&&valid(p,target.point))best={point:copy(target.point),station:offset+target.t*length,distance};
  }offset+=length;
 }
 return best;
}
function contourSection(heads:AssignedHead[],entry:Pt,figure:IrrigationFigure,blocked:MultiPolygon,physical:MultiPolygon):Section|null{
 const allowed=blocked.length?clipping.difference(polygon(figure),blocked):[polygon(figure)],inset=insetSurface(allowed);
 const candidates:{section:Section;branchLength:number;disorder:number;length:number}[]=[];
 for(const poly of inset)for(const r of poly){
  const ps=closedPoints(r),perimeter=pathLength([...ps,ps[0]!]);if(ps.length<3||perimeter<EPS)continue;
  const targets=heads.map(({head})=>visibleProjection(head,ps,(a,b)=>lineInSurface(a,b,allowed)));if(targets.some(p=>!p))continue;
  const start=visibleProjection(entry,ps,(a,b)=>clearSegment(a,b,physical));if(!start)continue;
  for(const direction of [1,-1]){
   const delta=(station:number)=>{const value=((station-start.station)*direction%perimeter+perimeter)%perimeter;return Math.min(value,perimeter-value)<EPS?0:value;};
   const positions=targets.map(p=>delta(p!.station)),end=Math.max(...positions),events:{at:number;point:Pt;headId?:string}[]=[{at:0,point:start.point}];
   let station=0;for(let i=0;i<ps.length;i++){const at=delta(station);if(at>EPS&&at<end-EPS)events.push({at,point:ps[i]!});station+=dist(ps[i]!,ps[(i+1)%ps.length]!);}
   targets.forEach((p,i)=>events.push({at:positions[i]!,point:p!.point,headId:heads[i]!.head.id}));events.sort((a,b)=>a.at-b.at||(a.headId??'').localeCompare(b.headId??''));
   const points:Pt[]=[],consumerNodes:Record<string,number>={};for(const event of events){if(!points.length||dist(points.at(-1)!,event.point)>EPS)points.push(copy(event.point));if(event.headId)consumerNodes[`head:${event.headId}`]=points.length-1;}
   if(!points.slice(1).every((p,i)=>lineInSurface(points[i]!,p,allowed)))continue;
   const disorder=positions.slice(1).filter((p,i)=>p<positions[i]!-EPS).length;
   candidates.push({section:{points,consumerNodes},branchLength:targets.reduce((sum,p)=>sum+p!.distance,0),disorder,length:pathLength(points)+dist(entry,points[0]!)});
  }
 }
 candidates.sort((a,b)=>a.branchLength-b.branchLength||a.disorder-b.disorder||a.length-b.length);return candidates[0]?.section??null;
}
function offsetChain(ps:Pt[],side:number){
 if(ps.length===1)return [{x:ps[0]!.x+AUTO_ROUTE_INSET_M*side,y:ps[0]!.y}];
 const edges=ps.slice(1).map((b,i)=>{const a=ps[i]!,length=dist(a,b),dx=(b.x-a.x)/length,dy=(b.y-a.y)/length;return {a:{x:a.x-dy*.5*side,y:a.y+dx*.5*side},b:{x:b.x-dy*.5*side,y:b.y+dx*.5*side},dx,dy};});
 const result=[edges[0]!.a];for(let i=1;i<edges.length;i++){const a=edges[i-1]!,b=edges[i]!,den=a.dx*b.dy-a.dy*b.dx;
  if(Math.abs(den)>EPS){const t=((b.a.x-a.a.x)*b.dy-(b.a.y-a.a.y)*b.dx)/den,p={x:a.a.x+a.dx*t,y:a.a.y+a.dy*t};if(dist(p,ps[i]!)<=2){result.push(p);continue;}}
  result.push(a.b);if(dist(a.b,b.a)>EPS)result.push(b.a);
 }result.push(edges.at(-1)!.b);return result.filter((p,i)=>!i||dist(p,result[i-1]!)>EPS);
}
function freeSection(heads:AssignedHead[],entry:Pt,blocked:MultiPolygon,physical:MultiPolygon):Section|null{
 const centres=heads.map(({head})=>copy(head)).filter((p,i,ps)=>!i||dist(p,ps[i-1]!)>EPS),paths=[offsetChain(centres,1),offsetChain(centres,-1)];
 for(const ps of paths.sort((a,b)=>dist(entry,a[0]!)-dist(entry,b[0]!))){
  if(!clearSegment(entry,ps[0]!,physical)||!ps.slice(1).every((p,i)=>clearSegment(ps[i]!,p,blocked)))continue;
  const targets=heads.map(({head})=>stationOnPath(head,ps));if(targets.some((p,i)=>!clearSegment(heads[i]!.head,p.point,blocked)))continue;
  const events:{station:number;point:Pt;headId?:string}[]=targets.map((p,i)=>({...p,headId:heads[i]!.head.id}));let station=0;ps.forEach((p,i)=>{if(i)station+=dist(ps[i-1]!,p);events.push({station,point:p});});events.sort((a,b)=>a.station-b.station);
  const points:Pt[]=[],consumerNodes:Record<string,number>={};for(const event of events){if(!points.length||dist(points.at(-1)!,event.point)>EPS)points.push(copy(event.point));if(event.headId)consumerNodes[`head:${event.headId}`]=points.length-1;}return {points,consumerNodes};
 }return null;
}

/** Binding uses the hand-drawn line for supply and ordering, not for capture.
 * Every zone head gets an explicit tee on an open, inset contour section. */
export function buildBoundZoneRoute(project:Project,pipe:EngineeringPipe,headIds:string[]):BoundZoneRouteResult{
 if(pipe.points.length<2||pipe.points.some(p=>!Number.isFinite(p.x+p.y)))return {error:'selectHeads'};
 const selected=headIds.map(id=>project.heads.find(h=>h.id===id));if(!selected.length||selected.some(h=>!h)||new Set(headIds).size!==headIds.length)return {error:'selectHeads'};
 const heads=selected as Head[],zone=heads[0]!.zone;if(heads.some(h=>h.zone!==zone))return {error:'sameZone'};
 const owners=autoConnections(project);if(heads.some(h=>owners.has(`head:${h.id}`)&&owners.get(`head:${h.id}`)!.pipeId!==pipe.id))return {error:'occupiedHead'};
 const ordered=heads.map(head=>({head,station:stationOnPath(head,pipe.points).station})).sort((a,b)=>a.station-b.station||a.head.id.localeCompare(b.head.id));
 const d=drawingOrMigrate(project),figures=irrigationFigures(d),blocked=blockedSurface(project),physical=blockedSurface(project,true),groups:{figure?:IrrigationFigure;heads:AssignedHead[]}[]=[];
 for(const assigned of ordered){const figure=figures.find(f=>f.id===assigned.head.figureId&&figureAtPoint(assigned.head,[f]))??figureAtPoint(assigned.head,figures),group=groups.find(g=>g.figure?.id===figure?.id);if(group)group.heads.push(assigned);else groups.push({figure,heads:[assigned]});}
 const points=pathInterval(pipe.points,0,ordered[0]!.station),consumerNodes:Record<string,number>={};let headStartIndex=0,previousStation=ordered[0]!.station;
 const append=(p:Pt)=>{if(!points.length||dist(points.at(-1)!,p)>EPS)points.push(copy(p));return points.length-1;};
 for(let i=0;i<groups.length;i++){
  const group=groups[i]!,first=group.heads[0]!.station,last=group.heads.at(-1)!.station;
  if(i&&first>=previousStation-EPS){const transit=pathInterval(pipe.points,previousStation,first);if(!clearSegment(points.at(-1)!,transit[0]!,physical))return {error:'routeOutside'};transit.forEach(append);}
  const entry=points.at(-1)!,section=group.figure?contourSection(group.heads,entry,group.figure,blocked,physical):freeSection(group.heads,entry,blocked,physical);if(!section)return {error:'routeOutside'};
  const indices=section.points.map(append);if(!i)headStartIndex=indices[0]!;
  for(const [id,index] of Object.entries(section.consumerNodes))consumerNodes[id]=indices[index]!;
  previousStation=Math.max(previousStation,last);
 }
 if(points.length<2||!heads.every(h=>Number.isInteger(consumerNodes[`head:${h.id}`])))return {error:'routeOutside'};
 // A head already on a saved supply vertex is supplied at that vertex. Adding
 // a branch back along the entry connector would duplicate the same pipe edge.
 for(const head of heads){const at=points.findIndex(p=>dist(head,p)<EPS);if(at>=0)consumerNodes[`head:${head.id}`]=at;}
 // A saved route is a tree, never a closed tour. Repeated vertices would create
 // a hydraulic cycle even if they came from separate figure sections.
 for(let i=headStartIndex;i<points.length;i++)for(let j=0;j<i-1;j++)if(dist(points[i]!,points[j]!)<EPS)return {error:'routeOutside'};
 return {points,headIds:[...headIds],zone,headStartIndex,insetM:AUTO_ROUTE_INSET_M,consumerNodes,...(groups.length===1&&groups[0]!.figure?{figureId:groups[0]!.figure.id}:{})};
}

/** An established bound line may contain an intentionally hand-drawn supply
 * lead outside the lawn. Keep that prefix and its fixed tees byte-for-byte;
 * validate only the newly appended geometry and newly attached consumers. */
export function extendBoundZoneRoute(project:Project,pipe:EngineeringPipe,points:Pt[],headIds:string[]):BoundZoneRouteResult{
 if(!pipe.auto||points.length<pipe.points.length||pipe.points.some((p,i)=>dist(p,points[i]!)>EPS)||points.some(p=>!Number.isFinite(p.x+p.y)))return {error:'routeOutside'};
 const selected=headIds.map(id=>project.heads.find(h=>h.id===id));if(!selected.length||selected.some(h=>!h)||new Set(headIds).size!==headIds.length)return {error:'selectHeads'};
 const heads=selected as Head[],zone=heads[0]!.zone;if(heads.some(h=>h.zone!==zone))return {error:'sameZone'};
 const owners=autoConnections(project);if(heads.some(h=>owners.has(`head:${h.id}`)&&owners.get(`head:${h.id}`)!.pipeId!==pipe.id))return {error:'occupiedHead'};
 const blocked=blockedSurface(project),figures=irrigationFigures(drawingOrMigrate(project)),common=figures.find(f=>heads.every(h=>figureAtPoint(h,[f]))),allowed=common?(blocked.length?clipping.difference(polygon(common),blocked):[polygon(common)]):null;
 for(let i=pipe.points.length;i<points.length;i++){
  const a=points[i-1]!,b=points[i]!;
  if(!(allowed?lineInSurface(a,b,allowed):clearSegment(a,b,blocked)))return {error:'routeOutside'};
  // Do not retest the trusted prefix, but reject a new closed loop, crossing or
  // doubled-back segment. The adjacent segment may share only the join point.
  for(let j=1;j<i;j++){
   const c=points[j-1]!,d=points[j]!,rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,den=rx*sy-ry*sx;
   if(Math.abs(den)>EPS){const t=((c.x-a.x)*sy-(c.y-a.y)*sx)/den,u=((c.x-a.x)*ry-(c.y-a.y)*rx)/den;if(t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS&&!(j===i-1&&t<EPS&&u>1-EPS))return {error:'routeOutside'};}
   else{const length=dist(a,b),len2=length*length;if(length>EPS&&Math.abs((c.x-a.x)*ry-(c.y-a.y)*rx)/length<EPS){const t0=((c.x-a.x)*rx+(c.y-a.y)*ry)/len2,t1=((d.x-a.x)*rx+(d.y-a.y)*ry)/len2;if((Math.min(1,Math.max(t0,t1))-Math.max(0,Math.min(t0,t1)))*length>EPS)return {error:'routeOutside'};}
    if(j<i-1&&(projectToSegment(b,c,d).distance<EPS||projectToSegment(a,c,d).distance<EPS))return {error:'routeOutside'};
   }
  }
 }
 const consumerIds=headIds.map(id=>`head:${id}`),savedNodes=Object.fromEntries(Object.entries(pipe.auto.consumerNodes??{}).filter(([id])=>consumerIds.includes(id)));
 const next=materializePipeJunctions(project,{...pipe,points:points.map(copy),auto:{...pipe.auto,circuit:`zone:${zone}`,selection:'heads',consumerIds,consumerNodes:savedNodes}});
 const consumerNodes=next.auto?.consumerNodes??{};
 for(const head of heads){
  const id=`head:${head.id}`,index=consumerNodes[id];if(index==null||!next.points[index])return {error:'routeOutside'};
  if(pipe.auto.consumerIds?.includes(id))continue;
  const figure=figures.find(f=>f.id===head.figureId&&figureAtPoint(head,[f]))??figureAtPoint(head,figures),surface=figure?(blocked.length?clipping.difference(polygon(figure),blocked):[polygon(figure)]):null;
  if(!(surface?lineInSurface(head,next.points[index]!,surface):clearSegment(head,next.points[index]!,blocked)))return {error:'routeOutside'};
 }
 return {points:next.points,headIds:[...headIds],zone,headStartIndex:next.auto?.headStartIndex??0,insetM:pipe.auto.insetM??AUTO_ROUTE_INSET_M,consumerNodes,...(pipe.auto.figureId?{figureId:pipe.auto.figureId}:{})};
}
