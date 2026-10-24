import {zoneColor,type Project} from './project-types';
import {routeLength,type EngineeringElement} from './engineering';
import type {HydraulicEdge} from './engineering-hydraulics';
import {ENGINEERING_NETWORK_COLORS} from './engineering-view';
/** Below the default plan scale, pipe ink and its casing shrink with the plan.
 * No fixed pixel minimum: it would make a distant pipe grow relative to a lawn.
 * At closer zooms the familiar bounded screen widths remain comfortable. */
export const pipeDisplayScale=(pxPerMeter=36)=>Number.isFinite(pxPerMeter)?Math.min(1,Math.max(0,pxPerMeter)/36):1;
/** Screen pixels; 20, 25 and 32 mm remain clearly distinguishable. */
export const pipeStrokeWidth=(diameter:number|null,branch=false,pxPerMeter=36)=>(branch?1.1:diameter==null?3:Math.min(8,2.4+Math.max(0,diameter-20)*.2))*pipeDisplayScale(pxPerMeter);
/** Complete white/selection casing width, scaled together with the pipe ink. */
export const pipeOutlineWidth=(diameter:number|null,branch=false,pxPerMeter=36)=>pipeStrokeWidth(diameter,branch,pxPerMeter)+(branch?1:2)*pipeDisplayScale(pxPerMeter);
export function engineeringInk(e:EngineeringElement){
 if(e.kind==='equipment')return '#187c85';
 if(e.kind==='pipe'&&e.type==='dripLine'&&e.zoneId!=null)return zoneColor(e.zoneId);
 if(e.kind==='pipe'&&e.auto?.circuit.startsWith('zone:')){
  return zoneColor(Number(e.auto.circuit.slice(5)));
 }
 if(e.kind==='pipe'&&e.color&&/^#[0-9a-f]{6}$/i.test(e.color))return e.color;
 return ENGINEERING_NETWORK_COLORS[e.kind==='cable'?'cable':e.type];
}
export function pipeTransitions(edges:HydraulicEdge[]){
 const nodes=new Map<string,{point:{x:number;y:number};diameters:Set<number>}>();
 for(const e of edges){if(e.branch||!e.diameter)continue;for(const point of [e.a,e.b]){const key=`${e.pipeId}:${Math.round(point.x*1000)},${Math.round(point.y*1000)}`,entry=nodes.get(key)??{point,diameters:new Set<number>()};entry.diameters.add(e.diameter);nodes.set(key,entry);}}
 return [...nodes].filter(([,n])=>n.diameters.size>1).map(([id,n])=>({id,point:n.point,diameters:[...n.diameters].sort((a,b)=>b-a)}));
}
export function pipeTotals(project:Project,edges:HydraulicEdge[]){
 const totals=new Map<number,number>();let unknownM=0;
 for(const e of Object.values(project.engineering?.elements??{})){
  if(e.kind!=='pipe'||e.type==='dripLine')continue;
  if(!e.auto){totals.set(e.diameterMm,(totals.get(e.diameterMm)??0)+routeLength(e.points));continue;}
  for(const edge of edges.filter(a=>a.pipeId===e.id&&!a.branch?.startsWith('head:'))){if(edge.diameter)totals.set(edge.diameter,(totals.get(edge.diameter)??0)+edge.length);else unknownM+=edge.length;}
 }
 return {byDiameter:[...totals].sort((a,b)=>b[0]-a[0]).map(([diameter,length])=>({diameter,length})),unknownM};
}
