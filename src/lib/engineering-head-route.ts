import {drawingOrMigrate} from './cad/engine';
import {layerPurpose} from './cad/types';
import {closedDrawingFigures,irrigationFigures,figureAtPoint,onFigureBoundary,type IrrigationFigure} from './irrigation-figures';
import {dist,type Pt} from './geometry';
import type {Project} from './project-types';
import {autoConnections,projectToSegment} from './engineering-connections';
import {isHeadVisible} from './head-visibility';
import {landscapeExclusions} from './landscape-objects';
import {equipmentPorts,engineeringNetworkCircuit} from './engineering';

export const AUTO_ROUTE_INSET_M=.5;
export type HeadRouteError='selectHeads'|'sameZone'|'occupiedHead'|'routeOutside'|'routeConnectionConflict';
export type HeadRouteResult={points:Pt[];headIds:string[];zone:number;figureId?:string;headStartIndex:number;insetM?:number}|{error:HeadRouteError};
const cross=(a:Pt,b:Pt)=>a.x*b.y-a.y*b.x;
const sub=(a:Pt,b:Pt)=>({x:a.x-b.x,y:a.y-b.y});
const add=(a:Pt,b:Pt)=>({x:a.x+b.x,y:a.y+b.y});
function intersection(a:Pt,b:Pt,c:Pt,d:Pt){
 const r=sub(b,a),s=sub(d,c),den=cross(r,s);if(Math.abs(den)<1e-10)return null;
 return {t:cross(sub(c,a),s)/den,u:cross(sub(c,a),r)/den};
}
function contours(f:IrrigationFigure){return [f.points,...f.holes];}
function clearance(p:Pt,f:IrrigationFigure){return Math.min(...contours(f).flatMap(loop=>loop.map((a,i)=>projectToSegment(p,a,loop[(i+1)%loop.length]!).distance)));}
function nearFigure(p:Pt,f:IrrigationFigure){return !!figureAtPoint(p,[f])||clearance(p,f)<.01;}
/** Parallel offset with miter joins. Acute corners use a bounded bevel. */
function offsetPath(points:Pt[],side:number){
 const segments=points.slice(1).map((b,i)=>{const a=points[i]!,v=sub(b,a),l=dist(a,b),n={x:-v.y/l*AUTO_ROUTE_INSET_M*side,y:v.x/l*AUTO_ROUTE_INSET_M*side};return {a:add(a,n),b:add(b,n),v};});
 const result:Pt[]=[segments[0]!.a];
 for(let i=1;i<segments.length;i++){const a=segments[i-1]!,b=segments[i]!,hit=intersection(a.a,a.b,b.a,b.b);
  if(hit){const p=add(a.a,{x:a.v.x*hit.t,y:a.v.y*hit.t});if(dist(p,points[i]!)<=AUTO_ROUTE_INSET_M*4){result.push(p);continue;}}
  result.push(a.b);if(dist(a.b,b.a)>1e-8)result.push(b.a);
 }
 result.push(segments.at(-1)!.b);return result.filter((p,i)=>!i||dist(p,result[i-1]!)>1e-7);
}
/** Exact contour crossings, including small holes. */
function segmentCuts(a:Pt,b:Pt,figures:IrrigationFigure[]){
 const cuts=[0,1];for(const f of figures)for(const loop of contours(f))for(let i=0;i<loop.length;i++){const hit=intersection(a,b,loop[i]!,loop[(i+1)%loop.length]!);if(hit&&hit.t>0&&hit.t<1&&hit.u>=0&&hit.u<=1)cuts.push(hit.t);}
 return [...new Set(cuts)].sort((x,y)=>x-y);
}
const along=(a:Pt,b:Pt,t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
function segmentInside(a:Pt,b:Pt,figures:IrrigationFigure[],allowed:(p:Pt)=>boolean){
 if(!allowed(a)||!allowed(b))return false;
 const cuts=segmentCuts(a,b,figures);
 for(let i=1;i<cuts.length;i++)if(!allowed(along(a,b,(cuts[i-1]!+cuts[i]!)/2)))return false;return true;
}
/** A parallel offset at a sloped corner can overhang the lawn. Trim the open
 * ends along that same parallel line; don't reject an otherwise valid route. */
function trimOpenEnds(points:Pt[],figures:IrrigationFigure[],allowed:(p:Pt)=>boolean){
 const result=points.map(p=>({...p}));
 for(let end=0;end<2;end++){
  if(end)result.reverse();
  const [a,b]=result;if(a&&!allowed(a)){
   if(!b)return null;
   const cuts=segmentCuts(a,b,figures);let entry:Pt|undefined;
   for(let i=1;i<cuts.length;i++)if(allowed(along(a,b,(cuts[i-1]!+cuts[i]!)/2))){entry=along(a,b,cuts[i-1]!);break;}
   if(!entry||!allowed(entry))return null;result[0]=entry;
  }
 }
 return result.reverse().filter((p,i,ps)=>!i||dist(p,ps[i-1]!)>1e-7);
}
function selfIntersects(points:Pt[]){
 for(let i=1;i<points.length;i++)for(let j=i+2;j<points.length;j++){const hit=intersection(points[i-1]!,points[i]!,points[j-1]!,points[j]!);if(hit&&hit.t>=-1e-8&&hit.t<=1+1e-8&&hit.u>=-1e-8&&hit.u<=1+1e-8)return true;}return false;
}
/** A shared geometry operation for head chains and manually drawn zone laterals.
 * New lines receive one parallel inset. Established routes keep their vertices. */
export function buildInsetRoute(project:Project,input:Pt[],headIds:string[],excludePipeId?:string,leadPoints:Pt[]=[],established=false):HeadRouteResult{
 const heads=headIds.map(id=>project.heads.find(h=>h.id===id));
 if(!heads.length||heads.some(h=>!h)||new Set(headIds).size!==headIds.length)return {error:'selectHeads'};
 const selected=heads.filter(h=>!!h),zone=selected[0]!.zone;
 if(selected.some(h=>h.zone!==zone))return {error:'sameZone'};
 const owned=autoConnections(project);if(selected.some(h=>owned.has(`head:${h.id}`)&&owned.get(`head:${h.id}`)!.pipeId!==excludePipeId))return {error:'occupiedHead'};
 const points=input.filter((p,i)=>!i||dist(p,input[i-1]!)>1e-7).map(p=>({...p}));
 if(!points.length||points.some(p=>!Number.isFinite(p.x+p.y))||(points.length===1&&!leadPoints.length))return {error:'selectHeads'};
 const drawing=drawingOrMigrate(project),figures=irrigationFigures(drawing),blocked:IrrigationFigure[]=[...closedDrawingFigures(drawing).filter(f=>layerPurpose(drawing.faces[f.id]!)==='none'),...landscapeExclusions(drawing).map((points,i)=>({id:`landscape:${i}`,points,holes:[]})),...figures.flatMap(f=>f.holes.map((points,i)=>({id:`hole:${f.id}:${i}`,points,holes:[]}))) ];
 const paths=established?[points]:points.length===1?Array.from({length:72},(_,i)=>[{x:points[0]!.x+AUTO_ROUTE_INSET_M*Math.cos(i*Math.PI/36),y:points[0]!.y+AUTO_ROUTE_INSET_M*Math.sin(i*Math.PI/36)}]):[1,-1].map(side=>offsetPath(points,side));
 const first=points[0]!,anchored=!established&&!leadPoints.length&&Object.values(project.engineering?.elements??{}).some(e=>{
  if(e.id===excludePipeId||e.kind==='cable')return false;
  if(e.kind==='equipment')return !['controller','rainSensor','weatherSensor','relay'].includes(e.type)&&[{x:e.x,y:e.y},...equipmentPorts(e)].some(p=>dist(first,p)<.005);
  const circuit=engineeringNetworkCircuit(e);if(circuit!=='main'&&circuit!==`zone:${zone}`)return false;
  return e.points.slice(1).some((b,i)=>projectToSegment(first,e.points[i]!,b).distance<.005);
 });
 const supplyLead=anchored?[first]:leadPoints;
 const prior=excludePipeId?project.engineering?.elements[excludePipeId]:undefined;
 const insetM=established&&prior?.kind==='pipe'?prior.auto?.insetM??AUTO_ROUTE_INSET_M:AUTO_ROUTE_INSET_M;
 const outsideObstacles=(p:Pt)=>!blocked.some(f=>!!figureAtPoint(p,[f])&&!onFigureBoundary(p,f));
 const assemble=(inset:Pt[],figureId?:string):HeadRouteResult=>{
  const lead=supplyLead.filter((p,i)=>!i||dist(p,supplyLead[i-1]!)>1e-7).map(p=>({...p}));
  if(lead.length&&dist(lead.at(-1)!,inset[0]!)<1e-7)lead.pop();
  const route=[...lead,...inset];if(route.length<2)return {error:'selectHeads'};
  // The supply lead can lie outside the lawn, but cannot cross buildings, holes or pools.
  if(!route.slice(1,lead.length+1).every((b,i)=>segmentInside(route[i]!,b,blocked,outsideObstacles)))return {error:'routeOutside'};
  return {points:route,headIds:[...headIds],zone,...(figureId?{figureId}:{}),headStartIndex:lead.length,insetM};
 };
 const explicit=figures.find(f=>selected.every(h=>h.figureId===f.id));
 const figure=(explicit&&selected.every(h=>nearFigure(h,explicit))?explicit:undefined)??figures.find(f=>selected.every(h=>nearFigure(h,f)));
 if(figure){
  const allowed=(p:Pt)=>!!figureAtPoint(p,[figure])&&outsideObstacles(p);
  const candidates=paths.map(ps=>established?ps:trimOpenEnds(ps,[figure,...blocked],allowed)).filter((ps):ps is Pt[]=>!!ps&&!!ps.length).filter(ps=>{
   if(selfIntersects(ps)||!ps.slice(1).every((b,i)=>segmentInside(ps[i]!,b,[figure,...blocked],allowed))||!ps.every(allowed))return false;
   return selected.every(h=>{const nearest=nearestPathPoint(h,ps);return segmentInside(h,nearest,[figure,...blocked],q=>allowed(q)||(dist(q,h)<.01&&nearFigure(q,figure)));});
  });
  const score=(ps:Pt[])=>ps.length===1?clearance(ps[0]!,figure):ps.slice(1).reduce((sum,b,i)=>sum+clearance(along(ps[i]!,b,.5),figure)*dist(ps[i]!,b),0);
  candidates.sort((a,b)=>score(b)-score(a));
  for(const candidate of candidates){const route=assemble(candidate,figure.id);if(!('error' in route))return route;}
  return {error:'routeOutside'};
 }
 // With plan geometry present, do not silently draw through gaps between figures.
 if(figures.length)return {error:'routeOutside'};
 const safe=paths.filter(ps=>!selfIntersects(ps)&&ps.every(outsideObstacles)&&ps.slice(1).every((b,i)=>segmentInside(ps[i]!,b,blocked,outsideObstacles))&&selected.every(h=>segmentInside(h,nearestPathPoint(h,ps),blocked,outsideObstacles)));
 const sectorScore=(ps:Pt[])=>selected.reduce((sum,h)=>{
  if(h.arc>=359.9||!Number.isFinite(h.start)||!Number.isFinite(h.arc))return sum;
  const p=nearestPathPoint(h,ps),d=dist(h,p);if(d<1e-8)return sum;
  const a=(h.start+h.arc/2)*Math.PI/180;return sum+((p.x-h.x)*Math.cos(a)+(p.y-h.y)*Math.sin(a))/d;
 },0);
 const centre=(ps:Pt[],axis:'x'|'y')=>ps.reduce((n,p)=>n+p[axis],0)/ps.length;
 safe.sort((a,b)=>sectorScore(b)-sectorScore(a)||centre(b,'y')-centre(a,'y')||centre(a,'x')-centre(b,'x'));
 for(const candidate of safe){const route=assemble(candidate);if(!('error' in route))return route;}
 return {error:'routeOutside'};
}
export function buildHeadRoute(project:Project,headIds:string[],excludePipeId?:string,leadPoints:Pt[]=[]):HeadRouteResult{
 const heads=headIds.map(id=>project.heads.find(h=>h.id===id));
 if(heads.some(h=>!h)||!heads.length||heads.slice(1).some((h,i)=>dist(h!,heads[i]!)<1e-5))return {error:'selectHeads'};
 return buildInsetRoute(project,heads.map(h=>({x:h!.x,y:h!.y})),headIds,excludePipeId,leadPoints);
}
function nearestPathPoint(p:Pt,ps:Pt[]){return ps.length===1?ps[0]!:ps.slice(1).map((b,i)=>projectToSegment(p,ps[i]!,b)).sort((a,b)=>a.distance-b.distance)[0]!.point;}

export function hitRouteHead(project:Project,p:Pt,px:number,maxDistanceM=Infinity){
 let best:Project['heads'][number]|undefined,distance=Math.min(22/px,maxDistanceM);
 for(const head of project.heads){if(!isHeadVisible(head,project.zones))continue;const d=dist(p,head);if(d<distance){distance=d;best=head;}}return best;
}
/** Last-point double tap is a finish action, never an extra point. Shared by mouse, pen and touch. */
export function headRouteTap(ids:string[],id:string,last:{id:string;at:number}|null,at:number,hasLead=false){
 const finish=(ids.length>=2||hasLead&&ids.length>=1)&&ids.at(-1)===id&&last?.id===id&&at-last.at<=600&&at>=last.at;
 return {ids:ids.includes(id)?ids:[...ids,id],last:{id,at},finish};
}
