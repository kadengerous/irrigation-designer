import {defaultAssembly,type EngineeringAssembly} from './engineering-assembly';
import {headSymbolScale,HEAD_SYMBOL_RADIUS} from './head-presentation';
import type {Pt} from './geometry';
import type {CadDrawing} from './cad/types';
import {cadSnap} from './cad/snap';

export const EQUIPMENT = [
 ['assembly','waterSupply'],['well','waterSupply'],['inlet','waterSupply'],['tank','waterSupply'],['pump','waterSupply'],['pumpStation','waterSupply'],['filter','waterSupply'],['filterAssembly','waterSupply'],['treatment','waterSupply'],
 ['valve','valves'],['ballValve','valves'],['checkValve','valves'],['manifold','valves'],['reducer','valves'],['regulator','valves'],
 ['controller','automation'],['rainSensor','automation'],['weatherSensor','automation'],['relay','automation'],
 ['waterOutlet','waterSupply'],['dripStart','waterSupply'],['consumer','waterSupply'],['gardenHydrant','waterSupply'],['valveBox','valves'],['roundValveBox','valves'],
] as const;
export type EquipmentKind=typeof EQUIPMENT[number][0];
export type EngineeringCategory='waterSupply'|'valves'|'automation'|'pipelines'|'electric';
export type PipeKind='main'|'zonePipe'|'otherPipe'|'dripLine';
export const FIELD_CONNECTIONS=['waterOutlet','dripStart','gardenHydrant','valveBox','roundValveBox'] as const;
export const EQUIPMENT_LIBRARY=[...FIELD_CONNECTIONS,'assembly'] as const;
export const PIPE_DIAMETERS_MM=[16,20,25,32,40,50,63,75,90,100] as const;
type Base={id:string;name?:string;number:number;label:boolean};
export type EngineeringEquipment=Base & {kind:'equipment';type:EquipmentKind;x:number;y:number;rotation:number;size:number;volumeL?:number;flowLpm?:number;headM?:number;pressureBar?:number;outlets?:number;zones?:number;zoneId?:number;assembly?:EngineeringAssembly;boxLengthM?:number;boxWidthM?:number;boxDepthM?:number;leaderOffset?:Pt;labelWidthRem?:number};
export type AutoPipe={circuit:string;networkCircuit?:string;captureM:number;consumerIds?:string[];selection?:'heads';pathMode?:'waypoints';insetM?:number;figureId?:string;headStartIndex?:number;sizing?:'manual'|'auto';consumerNodes?:Record<string,number>};
export type HydraulicSettings={sourceId?:string;staticLiftM?:number;additionalLossBar?:number;inletPressureBar?:number;operation?:'sequential'|'simultaneous'|'selected';simultaneousZoneIds?:number[];tankRuntimeMin?:number;tankReservePct?:number};
export type EngineeringPipe=Base & {kind:'pipe';type:PipeKind;points:Pt[];diameterMm:number;color?:string;flowLpm?:number;pressureBar?:number;zoneId?:number;dripStartId?:string;networkCircuit?:string;auto?:AutoPipe};
/** A direct zone binding selects consumers without changing the pipe's existing supply network. */
export const engineeringNetworkCircuit=(pipe:EngineeringPipe)=>pipe.auto?.networkCircuit??pipe.auto?.circuit??pipe.networkCircuit??'main';
export type EngineeringCable=Base & {kind:'cable';points:Pt[];cableType:string};
export type EngineeringElement=EngineeringEquipment|EngineeringPipe|EngineeringCable;
export type EngineeringData={version:1;elements:Record<string,EngineeringElement>;categories:Partial<Record<EngineeringCategory,{hidden?:boolean;locked?:boolean}>>;hydraulics?:HydraulicSettings};
export const emptyEngineering=():EngineeringData=>({version:1,elements:{},categories:{}});
export const engineeringKey=(e:EngineeringElement)=>e.kind==='cable'?'cable':e.type;
export const engineeringCategory=(e:EngineeringElement):EngineeringCategory=>e.kind==='pipe'?'pipelines':e.kind==='cable'?'electric':EQUIPMENT.find(r=>r[0]===e.type)![1];
export const routeLength=(points:Pt[])=>points.reduce((sum,p,i)=>sum+(i?Math.hypot(p.x-points[i-1]!.x,p.y-points[i-1]!.y):0),0);
export function newEquipment(data:EngineeringData,type:EquipmentKind,p:Pt):EngineeringEquipment {
 return {id:crypto.randomUUID(),kind:'equipment',type,...p,rotation:0,size:type==='tank'?1.5:1,number:nextNumber(data,type),label:true,
 ...(type==='assembly'?{assembly:defaultAssembly(),size:2}:{}),...(type==='valveBox'?{boxLengthM:.5,boxWidthM:.35,boxDepthM:.3,size:.5}:{}),...(type==='roundValveBox'?{size:.3,boxDepthM:.25}:{}),...(type==='tank'?{volumeL:2000}:{}),...(['pump','pumpStation'].includes(type)?{flowLpm:60,headM:40}:{}),
 ...(type==='manifold'?{outlets:4}:{}),...(type==='controller'?{zones:8}:{}),...(['reducer','regulator'].includes(type)?{pressureBar:3}:{} )};
}
export function nextNumber(data:EngineeringData,key:string){return 1+Math.max(0,...Object.values(data.elements).filter(e=>engineeringKey(e)===key).map(e=>e.number));}
/** Ports are world geometry, independent of minimum on-screen symbol size. */
export function equipmentPorts(e:EngineeringEquipment):Pt[]{
 let local:Pt[];
 if(e.type==='valveBox'||e.type==='roundValveBox')return [];
 if(e.type==='manifold')local=[{x:-.5,y:0},...Array.from({length:e.outlets??4},(_,i)=>({x:-.35+.7*i/Math.max(1,(e.outlets??4)-1),y:.5}))];
 else if(['waterOutlet','dripStart','consumer','gardenHydrant'].includes(e.type))local=[{x:-.5,y:0}];
 else if(['well','inlet','rainSensor','weatherSensor'].includes(e.type))local=[{x:.5,y:0}];
 else local=[{x:-.5,y:0},{x:.5,y:0}];
 const a=e.rotation*Math.PI/180;
 return local.map(p=>({x:e.x+e.size*(p.x*Math.cos(a)-p.y*Math.sin(a)),y:e.y+e.size*(p.x*Math.sin(a)+p.y*Math.cos(a))}));
}
export function moveEngineering(e:EngineeringElement,dx:number,dy:number):EngineeringElement {
 return e.kind==='equipment'?{...e,x:e.x+dx,y:e.y+dy}:{...e,points:e.points.map(p=>({x:p.x+dx,y:p.y+dy}))};
}
/** Edit the symbol around its installation point; hydraulic parameters stay intact. */
export function transformEngineeringEquipment(e:EngineeringEquipment,start:Pt,point:Pt,handle:'resize'|'rotate',px:number):EngineeringEquipment {
 if(handle==='rotate'){
  const delta=(Math.atan2(point.y-e.y,point.x-e.x)-Math.atan2(start.y-e.y,start.x-e.x))*180/Math.PI;
  return {...e,rotation:((e.rotation+delta)%360+360)%360};
 }
 const initial=Math.hypot(start.x-e.x,start.y-e.y);
 if(initial<1e-9)return e;
 const size=Math.max(.1,Math.min(50,(EQUIPMENT_LIBRARY.some(type=>type===e.type)?e.size:Math.max(e.size,32/px))*Math.hypot(point.x-e.x,point.y-e.y)/initial));
 return {...e,size,...(e.type==='valveBox'?{boxLengthM:size,boxWidthM:(e.boxWidthM??.35)*size/(e.boxLengthM??.5)}:{})};
}
/** Display-only dimensions: roughly 2.5 sprinkler diameters, with bounded zoom. */
export function equipmentSymbolDimensions(item:Pick<EngineeringEquipment,'type'> & Partial<Pick<EngineeringEquipment,'size'|'boxLengthM'|'boxWidthM'>>,px:number){
 const base=item.type==='assembly'?2:item.type==='valveBox'?.5:item.type==='roundValveBox'?.3:1;
 if(!EQUIPMENT_LIBRARY.some(type=>type===item.type)){const size=Math.max(item.size??base,32/px);return {width:size,height:size};}
 const width=item.type==='valveBox'?(item.boxLengthM??.5):(item.size??base),height=item.type==='valveBox'?(item.boxWidthM??.35):width;
 const adjustment=Math.max(.8,Math.min(1.2,Math.sqrt(Math.max(width,height)/base)));
 const display=HEAD_SYMBOL_RADIUS*2*2.5*Math.max(.25,headSymbolScale(px))*adjustment/px;
 return {width:display*width/Math.max(width,height),height:display*height/Math.max(width,height)};
}
export function snapEngineering(p:Pt,data:EngineeringData,drawing:CadDrawing,px:number,on:boolean,grid:boolean,step:number,exclude?:string){
 if(!on)return {point:p,hit:false};
 let nearest:Pt|undefined,distance=14/px;
 for(const e of Object.values(data.elements)){
  if(e.id===exclude||data.categories[engineeringCategory(e)]?.hidden)continue;
  const points=e.kind==='equipment'?[{x:e.x,y:e.y},...equipmentPorts(e)]:e.points;
  for(const q of points){const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<distance){nearest=q;distance=d;}}
 }
 if(nearest)return {point:{...nearest},hit:true};
 const hit=cadSnap(p,drawing,{pxPerMeter:px,snapOn:on,snapGridOn:grid,gridStep:step,heads:[]});
 return {point:hit.pt,hit:hit.kind!=='none'};
}

/** Keep the boundary between the free lead and the sprinkler lateral stable when editing nodes. */
export function insertEngineeringNode<T extends EngineeringPipe|EngineeringCable>(e:T,index:number,point:Pt):T {
 const at=Math.max(0,Math.min(e.points.length,index)),points=[...e.points];points.splice(at,0,point);
 const auto=e.kind==='pipe'?e.auto:undefined;
 return {...e,points,...(auto?{auto:{...auto,...(auto.consumerNodes?{consumerNodes:Object.fromEntries(Object.entries(auto.consumerNodes).map(([id,i])=>[id,i>=at?i+1:i]))}:{}),...(auto.headStartIndex!=null?{headStartIndex:auto.headStartIndex+(at<=auto.headStartIndex?1:0)}:{})}}:{})};
}
export function removeEngineeringNode<T extends EngineeringPipe|EngineeringCable>(e:T,index:number):T {
 if(e.points.length<=2||index<0||index>=e.points.length)return e;
 const points=e.points.filter((_,i)=>i!==index);
 const removed=e.points[index]!,nearest=points.reduce((best,p,i)=>Math.hypot(p.x-removed.x,p.y-removed.y)<Math.hypot(points[best]!.x-removed.x,points[best]!.y-removed.y)?i:best,0),auto=e.kind==='pipe'?e.auto:undefined;
 return {...e,points,...(auto?{auto:{...auto,...(auto.consumerNodes?{consumerNodes:Object.fromEntries(Object.entries(auto.consumerNodes).map(([id,i])=>[id,i===index?nearest:i>index?i-1:i]))}:{}),...(auto.headStartIndex!=null?{headStartIndex:Math.max(0,Math.min(points.length-1,auto.headStartIndex-(index<auto.headStartIndex?1:0)))}:{})}}:{})};
}

export function dripLines(data:EngineeringData|undefined):EngineeringPipe[]{return Object.values(data?.elements??{}).filter((e):e is EngineeringPipe=>e.kind==='pipe'&&e.type==='dripLine');}
export function linkedDripStarts(data:EngineeringData|undefined){return new Set(dripLines(data).map(e=>e.dripStartId).filter(Boolean));}
export function dripSupplyPoint(line:EngineeringPipe,data:EngineeringData|undefined):Pt{
 const start=line.dripStartId?data?.elements[line.dripStartId]:undefined;
 return start?.kind==='equipment'&&start.type==='dripStart'?equipmentPorts(start)[0]!:(line.points[0]??{x:0,y:0});
}
