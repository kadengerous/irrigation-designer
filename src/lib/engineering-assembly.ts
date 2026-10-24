import type {EquipmentKind} from './engineering';
export const ASSEMBLY_KINDS=['inlet','well','tank','pump','pumpStation','filter','filterAssembly','treatment','ballValve','checkValve','manifold','reducer','regulator','valve','controller','relay','rainSensor','weatherSensor'] as const;
export const ASSEMBLY_COMPONENTS=ASSEMBLY_KINDS.filter(type=>!['pumpStation','ballValve','checkValve','reducer','regulator','relay'].includes(type));
export type AssemblyKind=typeof ASSEMBLY_KINDS[number];
export type AssemblyNode={id:string;type:AssemblyKind;u:number;v:number;name?:string;model?:string;volumeL?:number;flowLpm?:number;headM?:number;pressureBar?:number;outlets?:number;zones?:number;manufacturer?:string;inletDnMm?:number;outletDnMm?:number;capacityLpm?:number;controllerManual?:boolean;manifoldId?:string;outletIndex?:number;zoneId?:number;wellId?:string;depthM?:number;dynamicLevelM?:number;wellLossM?:number;wellPreliminary?:boolean};
export type AssemblyLink={id:string;from:string;to:string;kind:'water'|'control'};
export type EngineeringAssembly={version:1;nodes:AssemblyNode[];links:AssemblyLink[]};
export const isAssemblyControl=(type:EquipmentKind)=>['controller','relay','rainSensor','weatherSensor'].includes(type);
export function newAssemblyNode(type:AssemblyKind,u=.5,v=.5):AssemblyNode{
 return {id:crypto.randomUUID(),type,u,v,...(type==='tank'?{volumeL:2000}:{}),...(['pump','pumpStation'].includes(type)?{flowLpm:60,headM:40}:{}),...(type==='controller'?{zones:8}:{}),...(['reducer','regulator'].includes(type)?{pressureBar:3}:{})};
}
export function connectAssembly(assembly:EngineeringAssembly,from:string,to:string,kind:AssemblyLink['kind']):EngineeringAssembly{
 if(from===to||!assembly.nodes.some(n=>n.id===from)||!assembly.nodes.some(n=>n.id===to)||assembly.links.some(l=>l.kind===kind&&(l.from===from&&l.to===to||l.from===to&&l.to===from)))return assembly;
 return {...assembly,links:[...assembly.links,{id:crypto.randomUUID(),from,to,kind}]};
}
export function removeAssemblyNode(assembly:EngineeringAssembly,id:string):EngineeringAssembly{
 return {...assembly,nodes:assembly.nodes.filter(n=>n.id!==id),links:assembly.links.filter(l=>l.from!==id&&l.to!==id)};
}
export function defaultAssembly():EngineeringAssembly{
 const nodes=[newAssemblyNode('inlet',.09,.26),newAssemblyNode('treatment',.29,.26),newAssemblyNode('tank',.49,.26),newAssemblyNode('pump',.69,.26),newAssemblyNode('filter',.89,.26),newAssemblyNode('manifold',.5,.53),newAssemblyNode('controller',.29,.7)];
 let assembly:EngineeringAssembly={version:1,nodes,links:[]};for(const[a,b]of [[0,1],[1,2],[2,3],[3,4],[4,5]])assembly=connectAssembly(assembly,nodes[a]!.id,nodes[b]!.id,'water');
 return assembly;
}
/** Layout coordinates belong to the diagram, independently of SI plan geometry. */
export function validEngineeringAssembly(value:unknown):value is EngineeringAssembly{
 if(!value||typeof value!=='object')return false;
 const a=value as EngineeringAssembly;
 if(a.version!==1||!Array.isArray(a.nodes)||!Array.isArray(a.links))return false;
 const ids=new Set<string>();
 for(const n of a.nodes){
  if(!n||typeof n.id!=='string'||!n.id||ids.has(n.id)||!ASSEMBLY_KINDS.includes(n.type)||!Number.isFinite(n.u)||!Number.isFinite(n.v)||n.u<0||n.u>1||n.v<0||n.v>1)return false;
  for(const key of ['volumeL','flowLpm','headM','pressureBar','outlets','zones','inletDnMm','outletDnMm','capacityLpm','outletIndex','zoneId','depthM','dynamicLevelM','wellLossM'] as const)if(n[key]!=null&&(!Number.isFinite(n[key])||n[key]!<0))return false;
  if(n.outlets!=null&&(!Number.isInteger(n.outlets)||n.outlets<1||n.outlets>128)||n.zones!=null&&(!Number.isInteger(n.zones)||n.zones<1||n.zones>256))return false;
  if(n.manifoldId!=null&&(typeof n.manifoldId!=='string'||n.type!=='valve')||n.outletIndex!=null&&(!Number.isInteger(n.outletIndex)||n.outletIndex<0||n.outletIndex>127)||n.controllerManual!=null&&typeof n.controllerManual!=='boolean'||n.manufacturer!=null&&typeof n.manufacturer!=='string')return false;
  if(n.wellId!=null&&typeof n.wellId!=='string'||n.wellPreliminary!=null&&typeof n.wellPreliminary!=='boolean')return false;
  if(n.dynamicLevelM!=null&&n.depthM!=null&&n.dynamicLevelM>n.depthM)return false;
  if(n.name!=null&&typeof n.name!=='string'||n.model!=null&&typeof n.model!=='string')return false;
  ids.add(n.id);
 }
 const links=new Set<string>();for(const l of a.links){if(!l||typeof l.id!=='string'||links.has(l.id)||!ids.has(l.from)||!ids.has(l.to)||l.from===l.to||!['water','control'].includes(l.kind))return false;links.add(l.id);}
 return true;
}
