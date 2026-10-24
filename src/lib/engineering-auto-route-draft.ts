import {engineeringNetworkCircuit} from './engineering';
import {dist,type Pt} from './geometry';
import {drawingOrMigrate} from './cad/engine';
import {irrigationFigures,figureAtPoint,onFigureBoundary} from './irrigation-figures';
import type {Project} from './project-types';
import {autoConnections,projectToSegment,materializePipeJunctions} from './engineering-connections';
import {isHeadVisible} from './head-visibility';
import {buildHeadRoute,buildInsetRoute,type HeadRouteError,type HeadRouteResult} from './engineering-head-route';
import {extendBoundZoneRoute} from './engineering-bound-zone-route';
import {bindPipeToHeads,extendDirectBoundZoneRoute} from './engineering-zone-route';

export const AUTO_ROUTE_CAPTURE_M=1;
export type AutoRouteStep={point:Pt;headId?:string};
export type AutoRouteDraft={steps:AutoRouteStep[];waypoints?:boolean;established?:boolean;fromStart?:boolean;baseHeadIds?:string[];lastTap?:{point:Pt;headId?:string;at:number;pointerPoint?:Pt}};
export const emptyAutoRouteDraft=():AutoRouteDraft=>({steps:[]});

/** Consumer capture follows the drawn path. New paths receive their inset only
 * when built; established extensions retain their already inset prefix. */
export function describeAutoRoute(project:Project,draft:AutoRouteDraft,excludePipeId?:string){
 const points=draft.steps.map(s=>s.point),first=draft.steps.findIndex(s=>!!s.headId);
 const explicitChain=!draft.waypoints&&first>=0&&draft.steps.slice(first).every(s=>!!s.headId);
 const explicit=[...new Set([...(draft.baseHeadIds??[]),...draft.steps.flatMap(s=>s.headId?[s.headId]:[])])];
 if(!points.length&&!explicit.length)return {points,headIds:[],zone:undefined,headChain:false,lead:[],branches:[]};
 const owners=autoConnections(project);
 const nearby=project.heads.filter(h=>isHeadVisible(h,project.zones)&&(!owners.has(`head:${h.id}`)||owners.get(`head:${h.id}`)!.pipeId===excludePipeId)).flatMap(h=>{
  let best:{point:Pt;distance:number;position:number}|undefined,position=0;
  if(points.length===1)best={point:points[0]!,distance:dist(h,points[0]!),position:0};
  for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,hit=projectToSegment(h,a,b),length=dist(a,b);if(!best||hit.distance<best.distance)best={...hit,position:position+hit.t*length};position+=length;}
  return best&&best.distance<AUTO_ROUTE_CAPTURE_M?[{head:h,...best}]:[];
 }).sort((a,b)=>a.position-b.position||a.distance-b.distance||a.head.id.localeCompare(b.head.id));
 // Count each available sprinkler once, including explicit clicks. Ties keep
 // the first encountered zone; an established route keeps its saved binding.
 const candidates=[...new Set([...nearby.map(c=>c.head.id),...explicit])].flatMap(id=>{const h=project.heads.find(h=>h.id===id);return h&&(isHeadVisible(h,project.zones)||draft.established&&draft.baseHeadIds?.includes(id))&&(!owners.has(`head:${id}`)||owners.get(`head:${id}`)!.pipeId===excludePipeId)?[h]:[];});
 const counts=new Map<number,number>();for(const h of candidates)counts.set(h.zone,(counts.get(h.zone)??0)+1);
 const previous=excludePipeId?project.engineering?.elements[excludePipeId]:undefined;
 const fixedZone=draft.established?(previous?.kind==='pipe'&&previous.auto?.circuit.startsWith('zone:')?Number(previous.auto.circuit.slice(5)):project.heads.find(h=>h.id===draft.baseHeadIds?.[0])?.zone):undefined;
 const zone=fixedZone??[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0];
 const headIds=candidates.filter(h=>h.zone===zone).map(h=>h.id);
 const headChain=explicitChain&&explicit.length===headIds.length&&explicit.every(id=>headIds.includes(id));
 if(headChain)headIds.splice(0,headIds.length,...explicit);
 const branches=headIds.flatMap(id=>{const h=project.heads.find(h=>h.id===id);if(!h||!points.length)return [];let point=points[0]!,distance=dist(h,point);for(let i=1;i<points.length;i++){const hit=projectToSegment(h,points[i-1]!,points[i]!);if(hit.distance<distance){point=hit.point;distance=hit.distance;}}return [{head:h,point}];});
 return {points,headIds,zone,headChain,lead:headChain?points.slice(0,first):[],branches};
}

export function buildAutoRoute(project:Project,draft:AutoRouteDraft,excludePipeId?:string):HeadRouteResult&{waypoints?:boolean;consumerNodes?:Record<string,number>}{
 const previous=excludePipeId?project.engineering?.elements[excludePipeId]:undefined;
 // Work from the chosen end without mutating the saved route. Restore its
 // original orientation and remap all fixed tees before committing a prepend.
 if(draft.fromStart&&draft.established&&previous?.kind==='pipe'&&previous.auto){
  const prepared=materializePipeJunctions(project,previous),last=prepared.points.length-1,oriented={...prepared,points:[...prepared.points].reverse(),auto:{...prepared.auto!,networkCircuit:engineeringNetworkCircuit(prepared),headStartIndex:0,consumerNodes:Object.fromEntries(Object.entries(prepared.auto?.consumerNodes??{}).map(([id,index])=>[id,last-index]))}};
  const context={...project,engineering:{...project.engineering!,elements:{...project.engineering!.elements,[previous.id]:oriented}}};
  const result=buildAutoRoute(context,{...draft,fromStart:false},excludePipeId);
  if('error' in result)return result;
  return {...result,points:[...result.points].reverse(),headStartIndex:0,consumerNodes:Object.fromEntries(Object.entries(result.consumerNodes??{}).map(([id,index])=>[id,result.points.length-1-index]))};
 }
 const info=describeAutoRoute(project,draft,excludePipeId);
 // Failure to offset the entire polyline must not reject a user-drawn
 // supply route. Align eligible boundary spans and retain everything else.
 const alignDrawnRoute=()=>{
  if(draft.established&&previous?.kind==='pipe'){
   const extended=extendDirectBoundZoneRoute(project,previous,info.points,info.headIds);
   return 'error' in extended?extended:{...extended,waypoints:true};
  }
  const pipe={id:excludePipeId??'',kind:'pipe' as const,type:'zonePipe' as const,number:0,label:true,diameterMm:32,points:info.points,auto:{circuit:`zone:${info.zone}`,captureM:AUTO_ROUTE_CAPTURE_M,selection:'heads' as const,sizing:'auto' as const}};
  const bound=bindPipeToHeads(project,pipe,info.headIds,true);
  if('error' in bound)return bound;
  return {points:bound.pipe.points,headIds:info.headIds,zone:info.zone!,headStartIndex:0,insetM:bound.pipe.auto?.insetM??0,consumerNodes:bound.pipe.auto?.consumerNodes,waypoints:true};
 };
 const complete=(result:HeadRouteResult&{waypoints?:boolean;consumerNodes?:Record<string,number>})=>'error' in result&&result.error==='routeOutside'?alignDrawnRoute():result;
 // A freehand path is an approach plus local sprinkler spans. Measure the
 // inset from the figure, never by shifting the already offset drawn line.
 if(!draft.established&&!info.headChain&&irrigationFigures(drawingOrMigrate(project)).length)return alignDrawnRoute();
 if(info.headChain&&!draft.established)return complete(buildHeadRoute(project,info.headIds,excludePipeId,info.lead));
 const directBound=draft.established&&previous?.kind==='pipe'&&previous.auto?.networkCircuit!=null;
 const points=(directBound?info.points:info.points.filter((p,i)=>!i||dist(p,info.points[i-1]!)>1e-7)).map(p=>({...p}));
 if(points.length<2||!info.headIds.length)return {error:'selectHeads'};
 const heads=info.headIds.map(id=>project.heads.find(h=>h.id===id));
 if(heads.some(h=>!h))return {error:'selectHeads'};
 if(heads.some(h=>h!.zone!==info.zone))return {error:'sameZone'};
 const owners=autoConnections(project);
 if(info.headIds.some(id=>owners.has(`head:${id}`)&&owners.get(`head:${id}`)!.pipeId!==excludePipeId))return {error:'occupiedHead'};
 if(draft.established&&previous?.kind==='pipe'&&previous.auto?.networkCircuit!=null){
  const extended=extendDirectBoundZoneRoute(project,previous,points,info.headIds);
  return 'error' in extended?extended:{...extended,waypoints:true};
 }
 if(draft.established&&previous?.kind==='pipe'&&previous.auto?.sizing==='manual'){
  const extended=extendBoundZoneRoute(project,previous,points,info.headIds);
  return complete('error' in extended?extended:{...extended,waypoints:true});
 }
 // A new route may approach the winning zone through another lawn. Preserve
 // that supply prefix; only the part serving this zone receives the inset.
 if(!draft.established){
  const figure=irrigationFigures(drawingOrMigrate(project)).find(f=>heads.every(h=>!!figureAtPoint(h!,[f])||onFigureBoundary(h!,f)));
  if(figure&&!figureAtPoint(points[0]!,[figure])&&!onFigureBoundary(points[0]!,figure)){
   const entries=heads.map(h=>{let best:{point:Pt;distance:number;segment:number;t:number}|undefined;for(let i=1;i<points.length;i++){const hit=projectToSegment(h!,points[i-1]!,points[i]!);if(!best||hit.distance<best.distance)best={...hit,segment:i-1};}return best!;}).sort((a,b)=>a.segment-b.segment||a.t-b.t);
   const entry=entries[0]!;
   const result=buildInsetRoute(project,[entry.point,...points.slice(entry.segment+1)],info.headIds,excludePipeId,points.slice(0,entry.segment+1));
   return complete('error' in result?result:{...result,waypoints:true});
  }
 }
 const leadCount=draft.established&&previous?.kind==='pipe'?Math.max(0,Math.min(points.length-1,previous.auto?.headStartIndex??0)):0;
 const result=buildInsetRoute(project,points.slice(leadCount),info.headIds,excludePipeId,points.slice(0,leadCount),!!draft.established);
 return complete('error' in result?result:{...result,waypoints:true});
}

export function tapAutoRoute(project:Project,draft:AutoRouteDraft,point:Pt,headId:string|undefined,at:number,px:number,excludePipeId?:string,pointerPoint:Pt=point):{draft:AutoRouteDraft;finish:boolean;error?:HeadRouteError}{
 const current=describeAutoRoute(project,draft,excludePipeId),head=headId?project.heads.find(h=>h.id===headId):undefined;
 const tap=draft.lastTap;
 // Compare the physical taps before snapping/target checks. A snap target may
 // change between taps even though the user double-tapped the same endpoint.
 if(tap&&dist(pointerPoint,tap.pointerPoint??tap.point)*px<=12&&at>=tap.at&&at-tap.at<=600&&draft.steps.length>=2&&current.headIds.length)return {draft,finish:true};
 if(head){
  const owner=autoConnections(project).get(`head:${head.id}`);
  if(owner&&owner.pipeId!==excludePipeId)return {draft:{...draft,lastTap:undefined},finish:false,error:'occupiedHead'};
  if(draft.established&&current.zone!=null&&head.zone!==current.zone)return {draft:{...draft,lastTap:undefined},finish:false,error:'sameZone'};
 }
 const last=draft.steps.at(-1);
 const duplicate=!!headId&&draft.steps.some(s=>s.headId===headId);
 const steps=duplicate||last&&dist(last.point,point)*px<3?draft.steps:[...draft.steps,{point:{...point},...(headId?{headId}:{})}];
 // Once a free waypoint follows a connected sprinkler, keep the user's path.
 const waypoints=draft.waypoints||(!headId&&current.headIds.length>0)||(current.headIds.length>0&&!draft.steps.some(s=>s.headId));
 return {draft:{...draft,steps,waypoints,lastTap:duplicate&&last?.headId!==headId?undefined:{point:{...point},pointerPoint:{...pointerPoint},headId,at}},finish:false};
}

export function undoAutoRoute(draft:AutoRouteDraft):AutoRouteDraft{
 const steps=draft.steps.slice(0,-1);
 return {...draft,steps,lastTap:undefined,waypoints:draft.baseHeadIds?.length?true:steps.some((s,i)=>!s.headId&&steps.slice(0,i).some(p=>p.headId))};
}
