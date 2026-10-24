import {autoConnections,projectToSegment} from './engineering-connections';
export {projectToSegment} from './engineering-connections';
import type {Pt} from './geometry';
import type {Project} from './project-types';
import {headFlow} from './flow';
import {headWorkingBar} from './hydro';
import {engineeringOperatingPlan} from './engineering-operation';
import {emptyEngineering,equipmentPorts,dripLines,linkedDripStarts,dripSupplyPoint,engineeringNetworkCircuit,type EngineeringPipe,type EngineeringEquipment} from './engineering';

// PE100 SDR11: external diameter / minimum wall thickness, mm.
// FIRAT PE100 catalogue; hydraulic design C=140: Hunter technical handbook p125.
export const PE_PIPE_SIZES=[[20,2],[25,2.3],[32,3],[40,3.7],[50,4.6],[63,5.8],[75,6.8],[90,8.2],[110,10]] as const;
export const MAX_PIPE_VELOCITY=1.5;
export const AUTO_PIPE_FLOW_RESERVE=0.20;
export const BAR_TO_HEAD=100000/(1000*9.80665);
export const isConsumer=(e:EngineeringEquipment)=>['waterOutlet','dripStart','consumer','gardenHydrant'].includes(e.type);
export const isSource=(e:EngineeringEquipment)=>['well','inlet','tank','pump','pumpStation'].includes(e.type);
export type WaterConsumer={id:string;point:Pt;circuit:string;flow:number|null;pressure:number|null;estimated:boolean};
export function waterConsumers(project:Project):WaterConsumer[]{
 return [...project.heads.map(h=>{const f=headFlow(h);return {id:`head:${h.id}`,point:{x:h.x,y:h.y},circuit:`zone:${h.zone}`,flow:f.lpm,pressure:headWorkingBar(h),estimated:!['table','pressure-compensated'].includes(f.kind)};}),
 ...Object.values(project.engineering?.elements??{}).filter((e):e is EngineeringEquipment=>e.kind==='equipment'&&isConsumer(e)&&!linkedDripStarts(project.engineering).has(e.id)).map(e=>({id:`equipment:${e.id}`,point:equipmentPorts(e)[0]!,circuit:e.zoneId?`zone:${e.zoneId}`:`equipment:${e.id}`,flow:e.flowLpm??null,pressure:e.pressureBar??null,estimated:false})),...dripLines(project.engineering).map(e=>({id:`drip:${e.id}`,point:dripSupplyPoint(e,project.engineering),circuit:e.zoneId?`zone:${e.zoneId}`:`drip:${e.id}`,flow:e.flowLpm??null,pressure:e.pressureBar??null,estimated:false}))];
}
export function inferAutoCircuit(project:Project,points:Pt[],captureM:number):string|null{
 let first:{circuit:string;at:number;distance:number}|undefined,offset=0;
 const owned=autoConnections(project),consumers=waterConsumers(project).filter(c=>!owned.has(c.id));
 for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,length=Math.hypot(b.x-a.x,b.y-a.y);
  for(const c of consumers){const p=projectToSegment(c.point,a,b),at=offset+p.t*length;
   if(p.distance<=captureM&&(!first||at<first.at-1e-6||Math.abs(at-first.at)<1e-6&&p.distance<first.distance))first={circuit:c.circuit,at,distance:p.distance};
  }offset+=length;
 }return first?.circuit??null;
}
export function pipeInsideMm(outside:number){
 // GF Pipe PE100 S5/SDR11, datasheet valid 2025-01-24: d16 / s1 1.8 / Di12.4.
 // https://assets.georgfischer.com/is/content/georgfischerag/o2VKvD1Dvpdf?filename=gfps-datasheet-Pipe+PE100+S5%2FSDR11-106497
 // Manual d100 is drawable, but is not a published size in this pipe series.
 if(outside===16)return 12.4;
 const row=PE_PIPE_SIZES.find(r=>r[0]===outside);return row?row[0]-2*row[1]:null;
}
export function waterVelocity(flowLpm:number,insideMm:number){return flowLpm/60000/(Math.PI*(insideMm/1000)**2/4);}
export function choosePipeDiameter(flowLpm:number):number|null{
 if(!Number.isFinite(flowLpm)||flowLpm<0)return null;
 return PE_PIPE_SIZES.find(([d])=>waterVelocity(flowLpm,pipeInsideMm(d)!)<=MAX_PIPE_VELOCITY)?.[0]??null;
}
/** Hazen–Williams in SI: Q m³/s, D m, L m; result metres water head. */
export function pipeLossM(lengthM:number,flowLpm:number,insideMm:number,c=140){
 return 10.67*lengthM*(flowLpm/60000)**1.852/(c**1.852*(insideMm/1000)**4.8704);
}
export type HydraulicEdge={id:string;pipeId:string;a:Pt;b:Pt;length:number;diameter:number|null;flow:number|null;lossM:number|null;branch?:string};
export type HydraulicDuty={circuit:string;flow:number|null;headM:number|null;pipeLossM:number;requiredBar:number};
export type HydraulicConnection={consumerId:string;pipeId:string;point:Pt;diameter:number|null;distance:number};
export type HydraulicResult={edges:HydraulicEdge[];connections:HydraulicConnection[];connected:string[];unconnected:string[];issues:string[];duties:HydraulicDuty[];ready:boolean;estimated:boolean;flow:number|null;headM:number|null;source:Pt|null};
type Segment={pipe:EngineeringPipe;index:number;a:Pt;b:Pt;channel:string;cuts:number[]};
type Node={p:Pt;channel:string};
type Edge={u:number;v:number;segment?:Segment;branch?:string;length:number;pipeId:string;auto:boolean;diameter:number};
const distance=(a:Pt,b:Pt)=>Math.hypot(a.x-b.x,a.y-b.y);
const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);


/** Infer the beginning of the connected supply from saved route direction.
 * A downstream start on another pipe is not a supply origin. Physical main
 * identity takes precedence over its attached irrigation-zone label. */
function automaticSource(pipes:EngineeringPipe[],nodes:Node[],edges:Edge[],consumerNodes:Map<string,number>,activeIds:string[]){
 const component=nodes.map((_,i)=>i),junction=nodes.map((_,i)=>i);
 const find=(parents:number[],i:number):number=>{while(parents[i]!==i){parents[i]=parents[parents[i]!]!;i=parents[i]!;}return i;};
 const union=(parents:number[],a:number,b:number)=>{parents[find(parents,a)]=find(parents,b);};
 for(const edge of edges){union(component,edge.u,edge.v);if(edge.length<.005)union(junction,edge.u,edge.v);}
 const starts=new Map<string,number>();
 for(const pipe of pipes){const p=pipe.points[0];if(!p)continue;const index=nodes.findIndex(n=>n.channel===engineeringNetworkCircuit(pipe)&&distance(n.p,p)<.005);if(index>=0)starts.set(pipe.id,index);}
 const activeCounts=new Map<number,number>(),allCounts=new Map<number,number>();
 for(const [id,index] of consumerNodes){const key=find(component,index);allCounts.set(key,(allCounts.get(key)??0)+1);if(activeIds.includes(id))activeCounts.set(key,(activeCounts.get(key)??0)+1);}
 const candidates=pipes.flatMap(pipe=>{const root=starts.get(pipe.id);if(root==null)return [];const key=find(component,root),j=find(junction,root);
  const upstream=edges.some(e=>e.segment&&e.pipeId!==pipe.id&&(find(junction,e.u)===j||find(junction,e.v)===j)&&starts.has(e.pipeId)&&find(junction,starts.get(e.pipeId)!)!==j);
  return [{pipe,root,active:activeCounts.get(key)??0,total:allCounts.get(key)??0,upstream,main:engineeringNetworkCircuit(pipe)==='main',manual:!pipe.auto||pipe.auto.sizing==='manual'}];
 });
 candidates.sort((a,b)=>b.active-a.active||b.total-a.total||Number(a.upstream)-Number(b.upstream)||Number(b.main)-Number(a.main)||Number(b.manual)-Number(a.manual)||a.pipe.number-b.pipe.number||a.pipe.id.localeCompare(b.pipe.id));
 const selected=candidates[0];return selected?{source:{...selected.pipe.points[0]!},root:selected.root}:null;
}

/** Acyclic, one-source networks only. Crossings do not create connections.
 * Different zone laterals stay isolated; they join a shared main at their start.
 * Data is derived without writing to sprinklers/zones or modifying manual pipes.
 */
export function calculateEngineering(project:Project):HydraulicResult{
 const data=project.engineering??emptyEngineering(),settings=data.hydraulics??{};
 const pipes=Object.values(data.elements).filter((e):e is EngineeringPipe=>e.kind==='pipe'&&e.type!=='dripLine');
 const allConsumers=waterConsumers(project),plan=engineeringOperatingPlan(project,allConsumers),consumers=plan.consumers,issues=new Set<string>(),segments:Segment[]=[];
 if(!plan.selectionValid)issues.add('zoneSelection');
 const nodes:Node[]=[],edges:Edge[]=[],nodeBuckets=new Map<string,number[]>();
 const node=(p:Pt,channel:string)=>{const key=`${Math.floor(p.x/.02)},${Math.floor(p.y/.02)}:${channel}`;
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(const i of nodeBuckets.get(`${Math.floor(p.x/.02)+x},${Math.floor(p.y/.02)+y}:${channel}`)??[])if(distance(nodes[i]!.p,p)<.005)return i;
  const id=nodes.push({p,channel})-1;nodeBuckets.set(key,[...(nodeBuckets.get(key)??[]),id]);return id;
 };
 const add=(u:number,v:number,pipeId:string,auto:boolean,diameter:number,segment?:Segment,branch?:string)=>{
  if(u===v)return;edges.push({u,v,pipeId,auto,diameter,segment,branch,length:distance(nodes[u]!.p,nodes[v]!.p)});
 };
 for(const pipe of pipes)for(let i=1;i<pipe.points.length;i++)if(distance(pipe.points[i-1]!,pipe.points[i]!)>1e-7)segments.push({pipe,index:i-1,a:pipe.points[i-1]!,b:pipe.points[i]!,channel:engineeringNetworkCircuit(pipe),cuts:[0,1]});
 const joins:{p:Pt;channel:string;other:Segment}[]=[];
 // Only actual vertices / pipe ends create tees. Unmarked crossings are separate.
 for(const pipe of pipes){const channel=engineeringNetworkCircuit(pipe);
  for(let i=0;i<pipe.points.length;i++)for(const s of segments){if(s.pipe.id===pipe.id)continue;
   if(channel!==s.channel&&!(channel!=='main'&&s.channel==='main'&&i===0))continue;
   const p=projectToSegment(pipe.points[i]!,s.a,s.b);if(p.distance<.005){s.cuts.push(p.t);joins.push({p:pipe.points[i]!,channel,other:s});}
  }
 }
 const attachments=new Map<string,{consumer:WaterConsumer;s:Segment;t:number;p:Pt;distance:number}>();
 const consumerById=new Map(allConsumers.map(c=>[c.id,c]));
 for(const [id,a] of autoConnections(project)){const s=segments.find(s=>s.pipe.id===a.pipeId&&s.index===a.segmentIndex),consumer=consumerById.get(id);if(s&&consumer)attachments.set(id,{consumer,s,t:a.t,p:a.point,distance:a.distance});}
 // A drawn dripline inlet is an explicit physical junction, not a capture radius.
 for(const consumer of allConsumers.filter(c=>c.id.startsWith('drip:')&&!attachments.has(c.id))){
  const candidates=segments.filter(s=>s.channel===consumer.circuit||s.channel==='main').map(s=>({s,...projectToSegment(consumer.point,s.a,s.b)})).filter(a=>a.distance<.005).sort((a,b)=>Number(b.s.channel===consumer.circuit)-Number(a.s.channel===consumer.circuit));
  const hit=candidates[0];if(hit)attachments.set(consumer.id,{consumer,s:hit.s,t:hit.t,p:hit.point,distance:hit.distance});
 }
 for(const a of attachments.values())a.s.cuts.push(a.t);
 // Legacy sourceId is deliberately ignored: the source is the saved beginning
 // of the upstream supply route, not an equipment selector or stale reference.
 const at=(s:Segment,t:number)=>({x:s.a.x+t*(s.b.x-s.a.x),y:s.a.y+t*(s.b.y-s.a.y)});
 for(const s of segments){const cuts=[...new Set(s.cuts.map(t=>Math.round(t*1e9)/1e9))].sort((a,b)=>a-b);
  for(let i=1;i<cuts.length;i++)add(node(at(s,cuts[i-1]!),s.channel),node(at(s,cuts[i]!),s.channel),s.pipe.id,!!s.pipe.auto&&s.pipe.auto.sizing!=='manual',s.pipe.diameterMm,s);
 }
 // Join channel boundaries with a zero-length junction; never merge separate zones directly.
 for(const j of joins){const p=projectToSegment(j.p,j.other.a,j.other.b).point;const u=node(j.p,j.channel),v=node(p,j.other.channel);if(!edges.some(e=>e.u===u&&e.v===v||e.u===v&&e.v===u))add(u,v,j.other.pipe.id,false,110);}
 // Hydraulic equipment ports belong to the same junction; explicit loss allowance is entered below.
 for(const e of Object.values(data.elements)){if(e.kind!=='equipment'||isConsumer(e)||['controller','rainSensor','weatherSensor','relay','valveBox','roundValveBox'].includes(e.type))continue;
  const ports=[{x:e.x,y:e.y},...equipmentPorts(e)],matches=nodes.map((n,i)=>ports.some(p=>distance(p,n.p)<.005)?i:-1).filter(i=>i>=0);
  for(let i=1;i<matches.length;i++){const u=matches[0]!,v=matches[i]!;if(!edges.some(e=>e.u===u&&e.v===v||e.u===v&&e.v===u))edges.push({u,v,pipeId:'',auto:false,diameter:110,length:0});}
 }
 const consumerNodes=new Map<string,number>();
 for(const a of attachments.values()){const u=node(a.p,a.s.channel),v=node(a.consumer.point,a.s.channel);consumerNodes.set(a.consumer.id,v);add(u,v,a.s.pipe.id,true,20,undefined,a.consumer.id);}
 const inferred=automaticSource(pipes,nodes,edges,consumerNodes,consumers.map(c=>c.id)),source=inferred?.source??null,root=inferred?.root??-1;
 if(root<0)issues.add('source');
 const adjacency=nodes.map(()=>[] as number[]);edges.forEach((e,i)=>{adjacency[e.u]!.push(i);adjacency[e.v]!.push(i);});
 // Deduplicate virtual connections at the same tee.
 const parent=new Array<number>(nodes.length).fill(-1),parentEdge=new Array<number>(nodes.length).fill(-1),order:number[]=[];
 const visited=new Set<number>(),cycleEdges=new Set<number>();
 const visit=(start:number,collect:boolean)=>{const stack=[start];visited.add(start);while(stack.length){const u=stack.pop()!;if(collect)order.push(u);for(const ei of adjacency[u]!){if(ei===parentEdge[u])continue;const e=edges[ei]!,v=e.u===u?e.v:e.u;if(visited.has(v)){cycleEdges.add(ei);continue;}visited.add(v);parent[v]=u;parentEdge[v]=ei;stack.push(v);}}};
 if(root>=0)visit(root,true);
 const reachable=new Set(order);
 for(const pipe of pipes){const first=pipe.points[0];if(!first)continue;const start=nodes.findIndex(n=>n.channel===engineeringNetworkCircuit(pipe)&&distance(n.p,first)<.005);if(start>=0&&!visited.has(start))visit(start,false);}
 for(let i=0;i<nodes.length;i++)if(!visited.has(i))visit(i,false);
 if(cycleEdges.size)issues.add('loop');
 const connected=consumers.filter(c=>consumerNodes.has(c.id)&&reachable.has(consumerNodes.get(c.id)!));
 const unconnected=consumers.filter(c=>!connected.includes(c)).map(c=>c.id);
 if(unconnected.length)issues.add('unconnected');
 if(connected.some(c=>!valid(c.flow)||c.flow<=0||!valid(c.pressure)||c.pressure<=0))issues.add('consumerData');
 const connectedIds=new Set(connected.map(c=>c.id)),scenarios=plan.scenarios.filter(s=>s.consumers.some(c=>connectedIds.has(c.id)));
 const scenarioById=new Map(plan.scenarios.flatMap(s=>s.consumers.map(c=>[c.id,s.circuit] as const)));
 const flows=edges.map(()=>new Map<string,number>()),nominalFlows=edges.map(()=>new Map<string,number>()),unknownEdges=new Set<number>(),nominalUnknownEdges=new Set<number>();
 for(const c of allConsumers.filter(c=>consumerNodes.has(c.id))){let n=consumerNodes.get(c.id)!;const scenario=scenarioById.get(c.id);
  while(n!==root&&parentEdge[n]!>=0){const ei=parentEdge[n]!;
   if(!valid(c.flow)||c.flow<=0){nominalUnknownEdges.add(ei);if(scenario)unknownEdges.add(ei);}
   else{nominalFlows[ei]!.set(c.circuit,(nominalFlows[ei]!.get(c.circuit)??0)+c.flow);if(scenario)flows[ei]!.set(scenario,(flows[ei]!.get(scenario)??0)+c.flow);}
   n=parent[n]!;
  }
 }
 const diameters=edges.map((e,i)=>{
  if(!e.auto)return e.diameter;
  const q=Math.max(0,...flows[i]!.values()),inactive=q===0&&!unknownEdges.has(i);
  // Inactive pipes keep an independent nominal-zone design instead of silently
  // shrinking to the minimum size. Their real operating flow remains zero.
  const designQ=inactive?Math.max(0,...nominalFlows[i]!.values()):q,unknown=inactive?nominalUnknownEdges.has(i):unknownEdges.has(i);
  return unknown||cycleEdges.size?null:choosePipeDiameter(designQ*(1+AUTO_PIPE_FLOW_RESERVE));
 });
 const resultEdges=edges.map((e,i):HydraulicEdge=>{const q=unknownEdges.has(i)?null:Math.max(0,...flows[i]!.values()),d=diameters[i],inside=d?pipeInsideMm(d):null;
  if((q==null||q>0)&&d&&!inside)issues.add('pipeData');
  if(q&&inside&&waterVelocity(q,inside)>MAX_PIPE_VELOCITY+1e-8)issues.add('capacity');
  if(q&&!d)issues.add('capacity');
  return {id:`${e.pipeId}:${i}`,pipeId:e.pipeId,a:nodes[e.u]!.p,b:nodes[e.v]!.p,length:e.length,diameter:d??null,flow:q,lossM:q!=null&&inside?pipeLossM(e.length,q,inside):null,branch:e.branch};});
 const connections=[...attachments.values()].map(a=>{
  const adjacent=resultEdges.filter(e=>e.pipeId===a.s.pipe.id&&!e.branch&&(distance(e.a,a.p)<.005||distance(e.b,a.p)<.005));
  const diameter=adjacent.length&&adjacent.every(e=>e.diameter!=null)?Math.max(...adjacent.map(e=>e.diameter!)):null;
  return {consumerId:a.consumer.id,pipeId:a.s.pipe.id,point:a.p,diameter,distance:a.distance};
 });
 const inputsReady=valid(settings.staticLiftM)&&valid(settings.additionalLossBar)&&settings.additionalLossBar>=0&&valid(settings.inletPressureBar)&&settings.inletPressureBar>=0;
 if(!inputsReady)issues.add('inputs');
 const duties:HydraulicDuty[]=scenarios.map(scenario=>{const circuit=scenario.circuit,cs=scenario.consumers.filter(c=>connectedIds.has(c.id));let pipeLoss=0,required=0,requiredBar=0;
  for(const c of cs){let loss=0,n=consumerNodes.get(c.id)!,velocityHead=0;while(n!==root&&parentEdge[n]!>=0){const ei=parentEdge[n]!,inside=diameters[ei]?pipeInsideMm(diameters[ei]!):null,q=flows[ei]!.get(circuit)??0;if(!velocityHead&&inside&&edges[ei]!.length>0)velocityHead=waterVelocity(q,inside)**2/(2*9.80665);loss+=inside?pipeLossM(edges[ei]!.length,q,inside):Infinity;n=parent[n]!;}
   pipeLoss=Math.max(pipeLoss,loss);requiredBar=Math.max(requiredBar,c.pressure??0);required=Math.max(required,(c.pressure??0)*BAR_TO_HEAD+loss+velocityHead);
  }
  const flow=cs.some(c=>c.flow==null)?null:cs.reduce((q,c)=>q+c.flow!,0);
  // Operational pressure is required at the emitter inlet; include manufacturer inlet losses in additionalLossBar.
  const head=inputsReady?Math.max(0,required+settings.staticLiftM!+(settings.additionalLossBar!-settings.inletPressureBar!)*BAR_TO_HEAD):null;
  return {circuit,flow,headM:flow!=null&&head!=null&&Number.isFinite(head)?head:null,pipeLossM:pipeLoss,requiredBar};
 });
 if(!connected.length)issues.add('empty');
 const ready=issues.size===0;
 return {connections,edges:resultEdges.filter(e=>e.pipeId&&e.length>1e-7),connected:connected.map(c=>c.id),unconnected,issues:[...issues],duties,ready,estimated:connected.some(c=>c.estimated),flow:ready?Math.max(0,...duties.map(d=>d.flow!)):null,headM:ready?Math.max(0,...duties.map(d=>d.headM??0)):null,source:source??null};
}
