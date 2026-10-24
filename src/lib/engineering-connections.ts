import type {Pt} from './geometry';
import type {Project} from './project-types';
import {equipmentPorts,dripLines,linkedDripStarts,dripSupplyPoint,type EngineeringData,type EngineeringPipe} from './engineering';

export const CONSUMER_TYPES=['waterOutlet','dripStart','consumer','gardenHydrant'];
export type ConsumerPoint={id:string;point:Pt;circuit:string};
export type RouteConnection={consumer:ConsumerPoint;pipeId:string;segmentIndex:number;t:number;point:Pt;distance:number};
export function consumerPoints(project:Project):ConsumerPoint[]{
 return [...project.heads.map(h=>({id:`head:${h.id}`,point:{x:h.x,y:h.y},circuit:`zone:${h.zone}`})),...Object.values(project.engineering?.elements??{}).flatMap(e=>e.kind==='equipment'&&CONSUMER_TYPES.includes(e.type)&&!linkedDripStarts(project.engineering).has(e.id)?[{id:`equipment:${e.id}`,point:equipmentPorts(e)[0]!,circuit:e.zoneId?`zone:${e.zoneId}`:`equipment:${e.id}`}]:[]),...dripLines(project.engineering).map(e=>({id:`drip:${e.id}`,point:dripSupplyPoint(e,project.engineering),circuit:e.zoneId?`zone:${e.zoneId}`:`drip:${e.id}`}))];
}
export function projectToSegment(p:Pt,a:Pt,b:Pt){
 const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy,t=len2?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len2)):0;
 const point={x:a.x+t*dx,y:a.y+t*dy};return {point,t,distance:Math.hypot(p.x-point.x,p.y-point.y)};
}
function nearest(pipe:EngineeringPipe,c:ConsumerPoint):RouteConnection|undefined{
 let best:RouteConnection|undefined;
 const fixed=pipe.auto?.consumerNodes?.[c.id];
 if(Number.isInteger(fixed)&&fixed!>=0&&fixed!<pipe.points.length){
  const point=pipe.points[fixed!]!;
  if(pipe.auto?.networkCircuit!=null){
   // Preserved duplicate vertices represent the same junction. Find the
   // nonzero segment beside that run instead of attaching to an omitted edge.
   for(const direction of [-1,1])for(let i=direction<0?fixed!-1:fixed!;i>=0&&i<pipe.points.length-1;i+=direction){
    const end=pipe.points[direction<0?i+1:i]!;
    if(Math.hypot(end.x-point.x,end.y-point.y)>1e-7)break;
    if(Math.hypot(pipe.points[i+1]!.x-pipe.points[i]!.x,pipe.points[i+1]!.y-pipe.points[i]!.y)>1e-7)return {consumer:c,pipeId:pipe.id,segmentIndex:i,t:direction<0?1:0,point,distance:Math.hypot(c.point.x-point.x,c.point.y-point.y)};
   }
  }
  // Prefer the segment ending at the saved tee, retaining a genuine vertex attachment.
  for(const i of [fixed!-1,fixed!])if(i>=0&&i<pipe.points.length-1&&Math.hypot(pipe.points[i+1]!.x-pipe.points[i]!.x,pipe.points[i+1]!.y-pipe.points[i]!.y)>1e-7)return {consumer:c,pipeId:pipe.id,segmentIndex:i,t:i===fixed!?0:1,point,distance:Math.hypot(c.point.x-point.x,c.point.y-point.y)};
 }
 // A head already at the supply junction is connected there; drawing a second
 // identical lead back from the lateral would create a false hydraulic loop.
 if(pipe.points.length>1&&Math.hypot(c.point.x-pipe.points[0]!.x,c.point.y-pipe.points[0]!.y)<1e-7)return {consumer:c,pipeId:pipe.id,segmentIndex:0,t:0,point:pipe.points[0]!,distance:0};
 const start=pipe.auto?.selection==='heads'?Math.max(0,Math.min(pipe.points.length-1,pipe.auto.headStartIndex??0)):0;
 // A single-head lateral is an end connection, not a tap on the free lead.
 if(start===pipe.points.length-1&&start>0){const point=pipe.points[start]!;return {consumer:c,pipeId:pipe.id,segmentIndex:start-1,t:1,point,distance:Math.hypot(c.point.x-point.x,c.point.y-point.y)};}
 for(let i=start+1;i<pipe.points.length;i++){const a=pipe.points[i-1]!,b=pipe.points[i]!;if(Math.hypot(b.x-a.x,b.y-a.y)<1e-7)continue;const hit=projectToSegment(c.point,a,b);if(!best||hit.distance<best.distance)best={consumer:c,pipeId:pipe.id,segmentIndex:i-1,...hit};}
 return best;
}
/** Saved owners win, even while moving their route outside the capture radius.
 * Unowned consumers are claimed in creation order; a newer/closer route cannot steal them.
 */
export function autoConnections(project:Project):Map<string,RouteConnection>{
 const pipes=Object.values(project.engineering?.elements??{}).filter((e):e is EngineeringPipe=>e.kind==='pipe'&&!!e.auto),consumers=consumerPoints(project),byId=new Map(consumers.map(c=>[c.id,c])),result=new Map<string,RouteConnection>();
 for(const p of pipes)for(const id of p.auto!.consumerIds??[]){const c=byId.get(id);if(!c||c.circuit!==p.auto!.circuit||result.has(id))continue;const hit=nearest(p,c);if(hit)result.set(id,hit);}
 for(const p of pipes)for(const c of consumers){if(p.auto!.selection==='heads'||result.has(c.id)||c.circuit!==p.auto!.circuit)continue;const hit=nearest(p,c);if(hit&&hit.distance<=p.auto!.captureM)result.set(c.id,hit);}
 return result;
}
export function pinAutoConnections(project:Project,data:EngineeringData):EngineeringData{
 const connections=autoConnections({...project,engineering:data});let changed=false;const elements={...data.elements};
 for(const e of Object.values(elements)){if(e.kind!=='pipe'||!e.auto)continue;const consumerIds=[...connections].filter(([,c])=>c.pipeId===e.id).map(([id])=>id);
  if(JSON.stringify(consumerIds)!==JSON.stringify(e.auto.consumerIds)){elements[e.id]={...e,auto:{...e.auto,consumerIds}};changed=true;}
 }return changed?{...data,elements}:data;
}
/** Persist each tee as an ordinary editable route vertex. Existing saved tees
 * are authoritative: moving a head or deleting a tee must not reproject it. */
export function materializePipeJunctions(project:Project,pipe:EngineeringPipe):EngineeringPipe{
 if(!pipe.auto||pipe.points.length<2)return pipe;
 const engineering=project.engineering??{version:1 as const,elements:{},categories:{}},context={...project,engineering:{...engineering,elements:{...engineering.elements,[pipe.id]:pipe}}};
 const connections=[...autoConnections(context)].filter(([,c])=>c.pipeId===pipe.id);
 if(!connections.length)return pipe;
 const points:Pt[]=[],oldIndices=new Map<number,number>(),consumerNodes:Record<string,number>={};
 const append=(p:Pt,preserveDuplicate=false)=>{const last=points.at(-1);if(preserveDuplicate||!last||Math.hypot(last.x-p.x,last.y-p.y)>1e-7)points.push({...p});return points.length-1;};
 oldIndices.set(0,append(pipe.points[0]!));
 for(let i=0;i<pipe.points.length-1;i++){
  const onSegment=connections.filter(([,c])=>c.segmentIndex===i).sort((a,b)=>a[1].t-b[1].t||a[0].localeCompare(b[0]));
  for(const [id,c] of onSegment)consumerNodes[id]=append(c.point);
  // Direct bindings preserve every user-drawn vertex, including zero-length
  // segments. New projected tees can still share an existing endpoint.
  const preserveDuplicate=pipe.auto.networkCircuit!=null&&Math.hypot(pipe.points[i+1]!.x-pipe.points[i]!.x,pipe.points[i+1]!.y-pipe.points[i]!.y)<=1e-7;
  oldIndices.set(i+1,append(pipe.points[i+1]!,preserveDuplicate));
 }
 const headStartIndex=oldIndices.get(pipe.auto.headStartIndex??0)??0;
 const auto={...pipe.auto,consumerIds:connections.map(([id])=>id),consumerNodes,headStartIndex};
 return JSON.stringify(points)===JSON.stringify(pipe.points)&&JSON.stringify(auto)===JSON.stringify(pipe.auto)?pipe:{...pipe,points,auto};
}
/** Lock legacy owners before accepting a new route or geometry update. */
export function commitAutoConnections(project:Project,next:EngineeringData):EngineeringData{
 const previous=project.engineering?pinAutoConnections(project,project.engineering):undefined,elements={...next.elements};let changed=false;
 for(const e of Object.values(elements)){if(e.kind!=='pipe'||!e.auto)continue;const old=previous?.elements[e.id];if(e.auto.selection!=='heads'&&old?.kind==='pipe'&&old.auto&&old.auto.circuit===e.auto.circuit&&JSON.stringify(old.auto.consumerIds)!==JSON.stringify(e.auto.consumerIds)){elements[e.id]={...e,auto:{...e.auto,consumerIds:old.auto.consumerIds}};changed=true;}}
 const pinned=pinAutoConnections(project,changed?{...next,elements}:next),materialized={...pinned.elements};let inserted=false;
 for(const e of Object.values(pinned.elements))if(e.kind==='pipe'&&e.auto){const prepared=materializePipeJunctions({...project,engineering:pinned},e);if(prepared!==e){materialized[e.id]=prepared;inserted=true;}}
 return inserted?{...pinned,elements:materialized}:pinned;
}
