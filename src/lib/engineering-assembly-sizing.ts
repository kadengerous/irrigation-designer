import type {Project} from './project-types';
import {irrigationWaterRecommendations} from './irrigation-water-recommendations';
import {calculateEngineering} from './engineering-hydraulics';
import type {AssemblyNode,EngineeringAssembly} from './engineering-assembly';

export const ASSEMBLY_WIDTH=1500,ASSEMBLY_HEIGHT=1250;
export const FILTER_FLOW_RESERVE=1.2;
/** Required clear connection bore at the same 1.5 m/s design velocity used by
 * the pipe calculation. These are selection requirements, not manufacturer curves. */
export function requiredFilterDn(flowLpm:number|null):number|undefined{
 if(flowLpm==null||!Number.isFinite(flowLpm)||flowLpm<=0)return undefined;
 return [15,20,25,32,40,50,65,80,100,125,150,200].find(d=>flowLpm*FILTER_FLOW_RESERVE/60000/(Math.PI*(d/1000)**2/4)<=1.5);
}
export function assemblyRequirements(project:Project){
 const water=irrigationWaterRecommendations(project),hydraulic=calculateEngineering(project);
 const flowLpm=hydraulic.ready?hydraulic.flow:water.flowLpm,headM=hydraulic.ready?hydraulic.headM:null;
 return {water,hydraulic,flowLpm,headM,pressureBar:water.pressureBar,filterDn:requiredFilterDn(flowLpm),filterCapacityLpm:flowLpm==null?null:flowLpm*FILTER_FLOW_RESERVE,zones:project.zones.slice().sort((a,b)=>a.id-b.id)};
}
export function assemblyPumpHead(node:AssemblyNode,assembly:EngineeringAssembly,baseHead:number|null){
 const well=node.wellId?assembly.nodes.find(n=>n.id===node.wellId&&n.type==='well'):undefined;
 if(!node.wellId)return {headM:baseHead??undefined,wellPreliminary:false};
 const lift=well?.dynamicLevelM??well?.depthM;
 return {headM:baseHead==null||lift==null?undefined:baseHead+lift+(well?.wellLossM??0),wellPreliminary:well?.dynamicLevelM==null||well?.wellLossM==null};
}
/** Recalculate whenever the project changes. No stale cached tank/pump values
 * are used in the diagram or BOM. Manifold children are deterministic real BOM items. */
export function resolveAssembly(assembly:EngineeringAssembly,project:Project,requirements=assemblyRequirements(project)):EngineeringAssembly{
 const nodes=assembly.nodes.filter(n=>!n.manifoldId).map(n=>{
  if(n.type==='tank')return {...n,volumeL:requirements.water.capacityL==null?undefined:Math.ceil(requirements.water.capacityL),flowLpm:undefined,pressureBar:undefined};
  if(n.type==='pump')return {...n,flowLpm:requirements.flowLpm??undefined,...assemblyPumpHead(n,assembly,requirements.headM),pressureBar:requirements.pressureBar??undefined};
  if(n.type==='filter')return {...n,flowLpm:requirements.flowLpm??undefined,capacityLpm:requirements.filterCapacityLpm??undefined,inletDnMm:requirements.filterDn,outletDnMm:requirements.filterDn,pressureBar:undefined};
  if(n.type==='controller'&&!n.controllerManual)return {...n,zones:Math.max(1,requirements.zones.length)};
  if(n.type==='manifold')return {...n,outlets:Math.max(1,Math.min(128,Math.round(n.outlets??(requirements.zones.length||1))))};
  return {...n};
 });
 const links:EngineeringAssembly['links']=[];
 for(const parent of nodes.filter(n=>n.type==='manifold'))for(let i=0;i<parent.outlets!;i++){
  const id=`${parent.id}:valve:${i}`,previous=assembly.nodes.find(n=>n.manifoldId===parent.id&&n.outletIndex===i);
  nodes.push({...previous,id,type:'valve',u:parent.u,v:parent.v,manifoldId:parent.id,outletIndex:i,zoneId:requirements.zones[i]?.id});
  links.push({id:`${parent.id}:branch:${i}`,from:parent.id,to:id,kind:'water'});
 }
 const controllers=nodes.filter(n=>n.type==='controller');
 const oldControls=assembly.links.filter(l=>l.kind==='control'&&!l.id.includes(':wire:'));
 for(const valve of nodes.filter(n=>n.type==='valve')){
  const explicit=oldControls.some(l=>l.to===valve.id&&controllers.some(c=>c.id===l.from));
  const owner=controllers[0];
  if(owner&&!explicit)links.push({id:`${owner.id}:wire:${valve.id}`,from:owner.id,to:valve.id,kind:'control'});
 }
 const ids=new Set(nodes.map(n=>n.id));return {...assembly,nodes,links:[...assembly.links.filter(l=>!l.id.includes(':branch:')&&!l.id.includes(':wire:')&&!(l.kind==='control'&&nodes.find(n=>n.id===l.to)?.type==='manifold')&&ids.has(l.from)&&ids.has(l.to)),...links]};
}
export function assemblyNodePosition(node:AssemblyNode,assembly:EngineeringAssembly):{x:number;y:number}{
 const parent=node.manifoldId?assembly.nodes.find(n=>n.id===node.manifoldId):undefined;
 if(node.type==='controller'){
  const valves=assembly.nodes.filter(n=>n.manifoldId);
  if(valves.length){const maxY=Math.max(...valves.map(n=>assemblyNodePosition(n,assembly).y));return {x:ASSEMBLY_WIDTH/2+(assembly.nodes.filter(n=>n.type==='controller').findIndex(n=>n.id===node.id))*270,y:maxY+270};}
 }
 if(!parent){const half=node.type==='manifold'?Math.max(120,Math.min(node.outlets??1,8)*62):120;return {x:Math.max(half+10,Math.min(ASSEMBLY_WIDTH-half-10,node.u*ASSEMBLY_WIDTH)),y:node.v*ASSEMBLY_HEIGHT};}
 const count=parent.outlets??1,columns=Math.min(8,count),column=(node.outletIndex??0)%8,row=Math.floor((node.outletIndex??0)/8),half=(columns-1)*62;
 const center=Math.max(half+70,Math.min(ASSEMBLY_WIDTH-half-70,parent.u*ASSEMBLY_WIDTH));
 return {x:center-half+column*124,y:parent.v*ASSEMBLY_HEIGHT+250+row*140};
}
export const assemblyDiagramHeight=(assembly:EngineeringAssembly)=>Math.max(ASSEMBLY_HEIGHT,...assembly.nodes.map(n=>assemblyNodePosition(n,assembly).y+(n.manifoldId?85:220)));
