import {drawingOrMigrate} from './cad/engine';
import {engineeringNetworkCircuit,equipmentPorts,type EngineeringPipe} from './engineering';
import {insetSurface} from './engineering-bound-zone-route';
import {projectToSegment} from './engineering-connections';
import {AUTO_ROUTE_INSET_M} from './engineering-head-route';
import {closedDrawingFigures,figureAtPoint,irrigationFigures,onContour,type IrrigationFigure} from './irrigation-figures';
import {landscapeExclusions} from './landscape-objects';
import {lineInSurface} from './irrigation-geometry';
import clipping,{type MultiPolygon,type Polygon} from 'polygon-clipping';
import {dist,type Pt} from './geometry';
import type {Head,Project} from './project-types';

const EPS=1e-7;
// This is a placement tolerance, not a capture radius for attaching consumers.
const BOUNDARY_TOLERANCE_M=.01;
const copy=(p:Pt)=>({x:p.x,y:p.y});
const length=(ps:Pt[])=>ps.slice(1).reduce((s,p,i)=>s+dist(ps[i]!,p),0);
function nearest(p:Pt,ps:Pt[]){
 let best={point:ps[0]!,distance:dist(p,ps[0]!),station:0},station=0;
 for(let i=1;i<ps.length;i++){const hit=projectToSegment(p,ps[i-1]!,ps[i]!),l=dist(ps[i-1]!,ps[i]!);if(hit.distance<best.distance-EPS)best={...hit,station:station+hit.t*l};station+=l;}return best;
}
function pointAt(ps:Pt[],station:number){let offset=0;for(let i=1;i<ps.length;i++){const a=ps[i-1]!,b=ps[i]!,l=dist(a,b);if(station<=offset+l+EPS){const t=l?Math.max(0,Math.min(1,(station-offset)/l)):0;return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}offset+=l;}return copy(ps.at(-1)!);}
function interval(ps:Pt[],from:number,to:number){
 const result=[pointAt(ps,from)];let station=0,seenStart=from<EPS;
 for(let i=1;i<ps.length;i++){
  station+=dist(ps[i-1]!,ps[i]!);
  if(station<from-EPS||station>to+EPS)continue;
  if(Math.abs(station-from)<EPS&&!seenStart){seenStart=true;continue;}
  result.push(copy(ps[i]!));
 }
 const end=pointAt(ps,to);if(dist(result.at(-1)!,end)>EPS)result.push(end);return result;
}
// Only coalesce the join between parts. Duplicates inside a retained manual
// prefix or suffix are intentional saved vertices and must survive unchanged.
function join(parts:Pt[][]){const result:Pt[]=[];for(const part of parts)part.forEach((p,i)=>{if(i||!result.length||dist(result.at(-1)!,p)>EPS)result.push(copy(p));});return result;}
function protectedConnections(project:Project,pipe:EngineeringPipe,preserveStart=true){
 const protectedPoints:Pt[]=preserveStart?[copy(pipe.points[0]!)]:[],channel=engineeringNetworkCircuit(pipe);
 for(const e of Object.values(project.engineering?.elements??{})){
  if(e.id===pipe.id||e.kind==='cable')continue;
  if(e.kind==='pipe'){
   const other=engineeringNetworkCircuit(e);
   e.points.forEach((p,i)=>{if((channel===other||channel==='main'&&other!=='main'&&i===0)&&nearest(p,pipe.points).distance<.005)protectedPoints.push(copy(nearest(p,pipe.points).point));});
   pipe.points.forEach((p,i)=>{if((channel===other||channel!=='main'&&other==='main'&&i===0)&&nearest(p,e.points).distance<.005)protectedPoints.push(copy(p));});
  }else if(!['controller','rainSensor','weatherSensor','relay'].includes(e.type)){
   for(const p of [{x:e.x,y:e.y},...equipmentPorts(e)]){const hit=nearest(p,pipe.points);if(hit.distance<.005)protectedPoints.push(copy(hit.point));}
  }
 }
 return protectedPoints;
}
function physicalSurface(project:Project):MultiPolygon{
 const d=drawingOrMigrate(project),polygons:Polygon[]=[...closedDrawingFigures(d).filter(f=>['building','pool','water'].includes(d.faces[f.id]!.type)).map(f=>[f.points.map(p=>[p.x,p.y] as [number,number]),...f.holes.map(ps=>ps.map(p=>[p.x,p.y] as [number,number]))]),...landscapeExclusions(d).map(ps=>[ps.map(p=>[p.x,p.y] as [number,number])])];
 return polygons.length?clipping.union(polygons[0]!,...polygons.slice(1)):[];
}
function clear(a:Pt,b:Pt,blocked:MultiPolygon){
 if(!blocked.length||dist(a,b)<EPS)return true;
 const coords=[a,b,...blocked.flatMap(p=>p.flat().map(([x,y])=>({x:x!,y:y!})))],x0=Math.min(...coords.map(p=>p.x))-1,x1=Math.max(...coords.map(p=>p.x))+1,y0=Math.min(...coords.map(p=>p.y))-1,y1=Math.max(...coords.map(p=>p.y))+1;
 return lineInSurface(a,b,clipping.difference([[[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]]],blocked));
}
type Segment={a:Pt;b:Pt};
const segments=(ps:Pt[])=>ps.slice(1).map((b,i)=>({a:ps[i]!,b})).filter(s=>dist(s.a,s.b)>EPS);
// Return a crossing/touch or an overlapping interval, including endpoint hits.
function contact({a,b}:Segment,{a:c,b:d}:Segment):{point:Pt;overlap:boolean}|undefined{
 const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,den=rx*sy-ry*sx;
 if(Math.abs(den)>EPS){const t=((c.x-a.x)*sy-(c.y-a.y)*sx)/den,u=((c.x-a.x)*ry-(c.y-a.y)*rx)/den;if(t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS)return {point:{x:a.x+rx*t,y:a.y+ry*t},overlap:false};return;}
 const l=dist(a,b);if(l<EPS||Math.abs((c.x-a.x)*ry-(c.y-a.y)*rx)/l>EPS)return;
 const t0=((c.x-a.x)*rx+(c.y-a.y)*ry)/(l*l),t1=((d.x-a.x)*rx+(d.y-a.y)*ry)/(l*l),lo=Math.max(0,Math.min(t0,t1)),hi=Math.min(1,Math.max(t0,t1));
 if(hi>=lo-EPS)return {point:{x:a.x+rx*lo,y:a.y+ry*lo},overlap:(hi-lo)*l>EPS};
}
function simpleNewJoin(added:Pt[],kept:Pt[][]){
 const fresh=segments(added);
 for(let i=0;i<fresh.length;i++){
  for(let k=0;k<kept.length;k++)for(const old of segments(kept[k]!)){
   const hit=contact(fresh[i]!,old);if(!hit)continue;
   const joinPoint=k===0?added[0]!:added.at(-1)!;
   const sharedEnd=(k===0&&i===0||k===1&&i===fresh.length-1)&&dist(hit.point,joinPoint)<EPS&&(dist(old.a,joinPoint)<EPS||dist(old.b,joinPoint)<EPS);
   if(hit.overlap||!sharedEnd)return false;
  }
  for(let j=0;j<i;j++){const hit=contact(fresh[i]!,fresh[j]!);if(hit&&(hit.overlap||j!==i-1||dist(hit.point,fresh[i]!.a)>EPS))return false;}
 }
 return true;
}
function noNewNetworkContacts(project:Project,pipe:EngineeringPipe,added:Pt[]){
 for(const other of Object.values(project.engineering?.elements??{})){
  if(other.id===pipe.id||other.kind!=='pipe')continue;
  for(const a of segments(added))for(const b of segments(other.points)){
   const hit=contact(a,b);if(!hit)continue;
   const channel=engineeringNetworkCircuit(pipe),otherChannel=engineeringNetworkCircuit(other);
   // A geometric crossing with no existing vertex is not a saved hydraulic
   // junction. Turning that crossing into a new splice could create a loop.
   const wasJunction=other.points.some((p,i)=>dist(p,hit.point)<.005&&(channel===otherChannel||channel==='main'&&otherChannel!=='main'&&i===0))||pipe.points.some((p,i)=>dist(p,hit.point)<.005&&(channel===otherChannel||channel!=='main'&&otherChannel==='main'&&i===0));
   if(hit.overlap||!wasJunction)return false;
  }
 }
 return true;
}
type ContourSection={points:Pt[];targets:Record<string,Pt>;branchLength:number;disorder:number;length:number;settled:boolean};
/** Project consumers onto complete inset loops, then take an open arc containing
 * their taps. In particular, a hole corner has two equally near sides: use the
 * side near the manual span instead of an arbitrary ring enumeration order. */
function localContour(figure:IrrigationFigure,heads:Head[],manual:Pt[],physical:MultiPolygon,savedTargets:Record<string,Pt>={},protectedPoints:Pt[]=[]):ContourSection|undefined{
 const rings=[figure.points,...figure.holes].map(ps=>ps.map(p=>[p.x,p.y] as [number,number])),allowed=physical.length?clipping.difference(rings,physical):[rings],inset=insetSurface(allowed),candidates:ContourSection[]=[];
 const settled=heads.every(head=>{const p=savedTargets[`head:${head.id}`];return p&&((dist(p,head)<EPS&&protectedPoints.some(q=>dist(p,q)<EPS))||lineInSurface(head,p,allowed)&&inset.some(polygon=>polygon.some(ring=>nearest(p,ring.map(([x,y])=>({x:x!,y:y!}))).distance<EPS)));});
 for(const polygon of inset)for(const ring of polygon){
  const ps=ring.map(([x,y])=>({x:x!,y:y!}));if(dist(ps[0]!,ps.at(-1)!)<EPS)ps.pop();if(ps.length<3)continue;
  const perimeter=length([...ps,ps[0]!]);
  const targets=heads.map(head=>{
   let best:{point:Pt;station:number;distance:number;manualDistance:number}|undefined,station=0;
   for(let i=0;i<ps.length;i++){
    const a=ps[i]!,b=ps[(i+1)%ps.length]!,l=dist(a,b),projection=projectToSegment(head,a,b);
    for(const p of [{point:projection.point,t:projection.t},{point:a,t:0},{point:b,t:1}]){
     const distance=dist(head,p.point),manualDistance=nearest(p.point,manual).distance;
     if((!best||distance<best.distance-EPS||Math.abs(distance-best.distance)<EPS&&manualDistance<best.manualDistance-EPS)&&lineInSurface(head,p.point,allowed))best={point:copy(p.point),station:station+p.t*l,distance,manualDistance};
    }station+=l;
   }return best;
  });
  if(targets.some(p=>!p))continue;
  for(const direction of [1,-1]){
   const start=targets[0]!,delta=(station:number)=>{const v=((station-start.station)*direction%perimeter+perimeter)%perimeter;return Math.min(v,perimeter-v)<EPS?0:v;};
   const positions=targets.map(p=>delta(p!.station)),end=Math.max(...positions),events:{at:number;point:Pt}[]=[];let station=0;
   ps.forEach((p,i)=>{const at=delta(station);if(at>EPS&&at<end-EPS)events.push({at,point:p});station+=dist(p,ps[(i+1)%ps.length]!);});
   targets.forEach((p,i)=>events.push({at:positions[i]!,point:p!.point}));events.sort((a,b)=>a.at-b.at);
   const points=events.map(e=>e.point).filter((p,i,all)=>!i||dist(p,all[i-1]!)>EPS);
   if(!points.slice(1).every((p,i)=>lineInSurface(points[i]!,p,allowed)))continue;
   candidates.push({points,settled,targets:Object.fromEntries(heads.map((head,i)=>[`head:${head.id}`,targets[i]!.point])),branchLength:targets.reduce((sum,p)=>sum+p!.distance,0),disorder:positions.slice(1).filter((p,i)=>p<positions[i]!-EPS).length,length:length(points)+dist(manual[0]!,points[0]!)+dist(manual.at(-1)!,points.at(-1)!)});
  }
 }
 candidates.sort((a,b)=>Math.abs(a.branchLength-b.branchLength)>EPS?a.branchLength-b.branchLength:a.disorder-b.disorder||a.length-b.length);return candidates[0];
}
function insertPoint(ps:Pt[],p:Pt){const found=ps.findIndex(q=>dist(p,q)<EPS);if(found>=0)return found;for(let i=1;i<ps.length;i++)if(projectToSegment(p,ps[i-1]!,ps[i]!).distance<EPS){ps.splice(i,0,copy(p));return i;}return -1;}

/** A best-effort local edit, never a prerequisite for binding. Supply geometry,
 * central-head taps and physical junctions are retained; ambiguity falls back
 * to the drawn route. Automatic placement may also move an unconnected start. */
export function alignZoneBoundarySpans(project:Project,pipe:EngineeringPipe,heads:Head[],automatic=false):{pipe:EngineeringPipe;aligned:boolean}{
 if(pipe.points.length<2||!heads.length)return {pipe,aligned:false};
 try{
  const figures=irrigationFigures(drawingOrMigrate(project)),total=length(pipe.points);
  const boundary=(head:Head)=>figures.find(f=>f.id===head.figureId&&[f.points,...f.holes].some(ps=>onContour(head,ps,BOUNDARY_TOLERANCE_M)))??figures.find(f=>[f.points,...f.holes].some(ps=>onContour(head,ps,BOUNDARY_TOLERANCE_M)));
  const rows=heads.map(head=>({head,figure:boundary(head),station:nearest(head,pipe.points).station})).sort((a,b)=>a.station-b.station||a.head.id.localeCompare(b.head.id));
  const groups:{figure:IrrigationFigure;heads:Head[];from:number;to:number}[]=[];let active:typeof groups[number]|undefined;
  for(const row of rows){if(!row.figure){active=undefined;continue;}if(active?.figure.id===row.figure.id){active.heads.push(row.head);active.to=row.station;}else{active={figure:row.figure,heads:[row.head],from:row.station,to:row.station};groups.push(active);}}
  const central=rows.filter(r=>!r.figure),protectedPoints=protectedConnections(project,pipe,!automatic||!rows.some(r=>r.figure&&dist(r.head,pipe.points[0]!)<.005)),fixedPoints:Record<string,Pt>={};
  if(pipe.auto?.circuit===`zone:${heads[0]!.zone}`)for(const [id,index] of Object.entries(pipe.auto.consumerNodes??{}))if(pipe.points[index])fixedPoints[id]=copy(pipe.points[index]!);
  for(const row of central){protectedPoints.push(copy(nearest(row.head,pipe.points).point));const fixed=fixedPoints[`head:${row.head.id}`];if(fixed)protectedPoints.push(fixed);}
  const physical=physicalSurface(project);let current=pipe.points.map(copy),aligned=false;
  for(const group of groups.reverse()){
   let from=group.from,to=group.to;
   const single=group.heads.length===1,atFreeEnd=total-to<EPS&&!protectedPoints.some(p=>dist(p,pipe.points.at(-1)!)<.005);
   if(single){if(!atFreeEnd){if(!automatic)continue;from=Math.max(0,from-AUTO_ROUTE_INSET_M);to=Math.min(total,to+AUTO_ROUTE_INSET_M);}else if(figureAtPoint(pipe.points.at(-1)!,[group.figure]))from=total-dist(pipe.points.at(-2)!,pipe.points.at(-1)!);}
   const endpointOnly=to-from<EPS;if(endpointOnly&&!atFreeEnd)continue;
   // Move a free splice just upstream/downstream of an exact boundary head;
   // otherwise the old lead itself would keep supplying that head at zero offset.
   const protectedAt=(p:Pt)=>protectedPoints.some(q=>dist(p,q)<.005);
   if(!endpointOnly&&from>EPS&&group.heads.some(h=>dist(h,pointAt(current,from))<EPS)&&!protectedAt(pointAt(current,from)))from=Math.max(0,from-AUTO_ROUTE_INSET_M);
   if(!endpointOnly&&to<total-EPS&&group.heads.some(h=>dist(h,pointAt(current,to))<EPS)&&!protectedAt(pointAt(current,to)))to=Math.min(total,to+AUTO_ROUTE_INSET_M);
   const local=endpointOnly?current:interval(current,from,to),section=localContour(group.figure,group.heads,local,physical,pipe.auto?.insetM===AUTO_ROUTE_INSET_M?fixedPoints:{},protectedPoints);
   if(!section)continue;
   const contour=section.points;if(!contour.length)continue;
   // An existing aligned tap remains authoritative. Rebinding must not insert
   // a new projection into a sloping connector or creep the contour inward.
   if(section.settled)continue;
   const prefix=automatic&&from<EPS&&!protectedAt(current[0]!)?[]:interval(current,0,from),freeEnd=total-to<EPS&&!protectedPoints.some(p=>dist(p,pipe.points.at(-1)!)<.005),suffix=freeEnd?[]:interval(current,to,length(current));
   const added=join([prefix.length?[prefix.at(-1)!]:[],contour,suffix.length?[suffix[0]!]:[]]);
   if(!added.slice(1).every((p,i)=>clear(added[i]!,p,physical))||!simpleNewJoin(added,[prefix,suffix])||!noNewNetworkContacts(project,pipe,added))continue;
   const candidate=join([prefix,contour,suffix]);
   if(protectedPoints.some(p=>nearest(p,candidate).distance>EPS))continue;
   // Preserve real junction vertices, not just a coincident crossing of lines.
   for(const p of protectedPoints)insertPoint(candidate,p);
   const changedBoundary=new Set(group.heads.map(h=>`head:${h.id}`));
   for(const [id,p] of Object.entries(fixedPoints))if(changedBoundary.has(id)||nearest(p,candidate).distance>EPS)delete fixedPoints[id];
   for(const head of group.heads){const source=protectedPoints.find(p=>dist(p,head)<EPS);fixedPoints[`head:${head.id}`]=copy(source??section.targets[`head:${head.id}`]!);}
   current=candidate;aligned=true;
  }
  if(!aligned)return {pipe,aligned:false};
  for(const p of Object.values(fixedPoints))insertPoint(current,p);
  const consumerNodes:Record<string,number>={};for(const [id,p] of Object.entries(fixedPoints)){const i=current.findIndex(q=>dist(p,q)<EPS);if(i>=0)consumerNodes[id]=i;}
  return {aligned:true,pipe:{...pipe,points:current,auto:{circuit:`zone:${heads[0]!.zone}`,networkCircuit:engineeringNetworkCircuit(pipe),selection:'heads',sizing:'manual',pathMode:'waypoints',headStartIndex:0,captureM:.5,insetM:AUTO_ROUTE_INSET_M,consumerIds:heads.map(h=>`head:${h.id}`),consumerNodes}}};
 }catch{return {pipe,aligned:false};}
}
