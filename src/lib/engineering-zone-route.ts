import type {Project} from './project-types';
import {engineeringNetworkCircuit,type EngineeringPipe} from './engineering';
import {dist,type Pt} from './geometry';
import type {HeadRouteError,HeadRouteResult} from './engineering-head-route';
import {autoConnections,projectToSegment} from './engineering-connections';
import {alignZoneBoundarySpans} from './engineering-zone-alignment';

const EPS=1e-7;
type BindingResult={pipe:EngineeringPipe}|{error:HeadRouteError};
export type DirectBoundRouteResult=HeadRouteResult&{consumerNodes?:Record<string,number>};

/** Disconnect automatic consumers while keeping the physical supply network,
 * every saved route vertex and all manually chosen pipe properties intact. */
export function unbindPipeFromZone(pipe:EngineeringPipe):EngineeringPipe{
 if(!pipe.auto?.circuit.startsWith('zone:'))return pipe;
 const {auto,...manual}=pipe;
 return {...manual,networkCircuit:engineeringNetworkCircuit(pipe)};
}

/** Bind consumers without rerouting their supply. Original vertices, endpoints,
 * type and diameter remain unchanged; only collinear tee vertices are inserted. */
function attachHeads(project:Project,pipe:EngineeringPipe,headIds:string[],insetM=0):BindingResult{
 if(pipe.points.length<2||pipe.points.some(p=>!Number.isFinite(p.x+p.y))||!pipe.points.slice(1).some((p,i)=>dist(p,pipe.points[i]!)>EPS))return {error:'selectHeads'};
 const heads=headIds.map(id=>project.heads.find(h=>h.id===id));
 if(!heads.length||heads.some(h=>!h||!Number.isFinite(h.x+h.y))||new Set(headIds).size!==headIds.length)return {error:'selectHeads'};
 const zone=heads[0]!.zone;if(heads.some(h=>h!.zone!==zone))return {error:'sameZone'};
 const owners=autoConnections(project);
 if(headIds.some(id=>owners.has(`head:${id}`)&&owners.get(`head:${id}`)!.pipeId!==pipe.id))return {error:'occupiedHead'};
 const targets:{id:string;segment:number;point:Pt;t:number}[]=[],fixed:Record<string,number>={};
 for(const head of heads){
  const id=`head:${head!.id}`,saved=pipe.auto?.circuit===`zone:${zone}`&&pipe.auto.consumerIds?.includes(id)?pipe.auto.consumerNodes?.[id]:undefined;
  // An explicitly edited tee remains authoritative on repeat binding/extension.
  if(Number.isInteger(saved)&&saved!>=0&&saved!<pipe.points.length){fixed[id]=saved!;continue;}
  let best:{segment:number;point:Pt;t:number;distance:number}|undefined;
  for(let i=1;i<pipe.points.length;i++){
   const a=pipe.points[i-1]!,b=pipe.points[i]!;if(dist(a,b)<=EPS)continue;
   const hit=projectToSegment(head!,a,b);if(!best||hit.distance<best.distance-EPS)best={segment:i-1,...hit};
  }
  if(!best)return {error:'selectHeads'};targets.push({id,...best});
 }
 const points:Pt[]=[{...pipe.points[0]!}],oldIndices=[0],consumerNodes:Record<string,number>={};
 for(let i=0;i<pipe.points.length-1;i++){
  const a=pipe.points[i]!,b=pipe.points[i+1]!,startIndex=points.length-1,onSegment=targets.filter(t=>t.segment===i).sort((a,b)=>a.t-b.t||a.id.localeCompare(b.id));
  for(const target of onSegment){
   if(dist(target.point,a)<=EPS){consumerNodes[target.id]=startIndex;continue;}
   if(dist(target.point,b)<=EPS)continue;
   if(dist(points.at(-1)!,target.point)>EPS)points.push({...target.point});consumerNodes[target.id]=points.length-1;
  }
  // Keep every existing vertex, including duplicate vertices, exactly as drawn.
  points.push({...b});oldIndices[i+1]=points.length-1;
  for(const target of onSegment)if(dist(target.point,b)<=EPS)consumerNodes[target.id]=points.length-1;
 }
 for(const [id,index] of Object.entries(fixed))consumerNodes[id]=oldIndices[index]!;
 const consumerIds=headIds.map(id=>`head:${id}`);
 return {pipe:{...pipe,points,auto:{circuit:`zone:${zone}`,networkCircuit:engineeringNetworkCircuit(pipe),captureM:.5,selection:'heads',pathMode:'waypoints',sizing:'manual',insetM,headStartIndex:0,consumerIds,consumerNodes}}};
}

/** The complete selected zone is explicit; other crossed zones are never captured. */
export function bindPipeToZone(project:Project,pipe:EngineeringPipe,zone:number):BindingResult{
 if(!project.zones.some(z=>z.id===zone))return {error:'selectHeads'};
 return bindPipeToHeads(project,pipe,project.heads.filter(h=>h.zone===zone).map(h=>h.id));
}

/** Attach only the consumers captured by an automatic route, using the same
 * local boundary alignment as a manually bound main. */
export function bindPipeToHeads(project:Project,pipe:EngineeringPipe,headIds:string[],automatic=false):BindingResult{
 const direct=attachHeads(project,pipe,headIds);if('error' in direct)return direct;
 const heads=headIds.map(id=>project.heads.find(h=>h.id===id)!);
 const aligned=alignZoneBoundarySpans(project,pipe,heads,automatic);
 return aligned.aligned?attachHeads(project,aligned.pipe,heads.map(h=>h.id),.5):{pipe:{...direct.pipe,auto:{...direct.pipe.auto!,insetM:pipe.auto?.networkCircuit!=null?pipe.auto.insetM??0:0}}};
}

/** User-drawn extension of a directly bound main. Its saved prefix is immutable;
 * geometry/figures do not impose restrictions on a manually chosen pipe path. */
export function extendDirectBoundZoneRoute(project:Project,pipe:EngineeringPipe,points:Pt[],headIds:string[]):DirectBoundRouteResult{
 if(points.length<pipe.points.length||pipe.points.some((p,i)=>!points[i]||dist(p,points[i]!)>EPS))return {error:'routeOutside'};
 const result=attachHeads(project,{...pipe,points},headIds,pipe.auto?.insetM??0);if('error' in result)return result;
 return {points:result.pipe.points,headIds:[...headIds],zone:project.heads.find(h=>h.id===headIds[0])!.zone,headStartIndex:0,insetM:result.pipe.auto!.insetM,consumerNodes:result.pipe.auto!.consumerNodes};
}
