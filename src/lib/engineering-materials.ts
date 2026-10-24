import {FIELD_CONNECTIONS,routeLength} from './engineering';
import {assemblyMaterials} from './engineering-assembly-materials';
import type {Project} from './project-types';
import { catalogForHead, bodyForHead,itemById} from './equipment-catalog';
import {calculateEngineering} from './engineering-hydraulics';
import {pipeTotals} from './engineering-pipe-display';
import {text as t,formatNumber} from './i18n';
import {currentUnits,fromMeters,fromMmPipe,pipeLabel,lenLabel,formatLenU,type UnitPrefs} from './units';
export const PIPE_ALLOWANCE=1.15;
export const MIN_FLEX_LENGTH_M=.4;
export type EngineeringMaterial={key:string;name:string;qty:number;unit:string;digits:number;note?:string};
/** Pipe inlet notation varies by manufacturer; never infer it from nozzle threads. */
export function inletThread(inlet:string):string|undefined {
 if(/ACME/i.test(inlet))return undefined;
 const fraction=inlet.match(/^(\d+\/\d+|\d+(?:\.\d+)?)[ -]*(?:inch(?:es)?|in\b|[″"])/i)?.[1];
 const size=fraction?`${({'1/2':'½','3/4':'¾','1/4':'¼'} as Record<string,string>)[fraction]??fraction}″`:inlet.match(/^(?:\d+[½¼¾]?|[½¼¾])\s*[″"]/u)?.[0]?.replace('"','″');
 if(!size)return undefined;
 const standard=inlet.match(/\b(NPT|BSPT|BSPP|BSP)\b/i)?.[1]?.toUpperCase();
 return standard?`${size} ${standard}`:size;
}
const roundUp=(n:number)=>Math.ceil((n-1e-9)*100)/100;
/** Quantities only, without invented prices or proprietary part numbers. */
export function engineeringMaterials(project:Project,units:UnitPrefs=currentUnits()):{rows:EngineeringMaterial[];incomplete:boolean}{
 const auto=Object.values(project.engineering?.elements??{}).some(e=>e.kind==='pipe'&&e.auto),result=auto?calculateEngineering(project):null,totals=pipeTotals(project,result?.edges??[]),rows:EngineeringMaterial[]=[];
 const diameter=(d:number)=>`Ø${formatNumber(fromMmPipe(d,units.pipe),units.pipe==='mm'?0:2)} ${pipeLabel(units.pipe)}`;
 const reserve=t('engineering.allowanceNote',{percent:formatNumber(15,0)});
 for(const row of totals.byDiameter)rows.push({key:`pipe:${row.diameter}`,name:t('engineering.pipeMaterial',{diameter:diameter(row.diameter)}),qty:roundUp(fromMeters(row.length*PIPE_ALLOWANCE,units.length)),unit:lenLabel(units.length),digits:2,note:reserve});
 const saddles=new Map<string,{diameter:number;thread:string;qty:number}>(),flex=new Map<string,number>();let incomplete=totals.unknownM>1e-7;
 const heads=new Map(project.heads.map(h=>[`head:${h.id}`,h]));
 for(const connection of result?.connections??[]){const head=heads.get(connection.consumerId);if(!head)continue;
  const item=catalogForHead(head),body=item?bodyForHead(item,head.bodyId,head.popUpMm,head.bodySnapshot):undefined,inlet=body?.inlet??item?.inlet??'';
  // Thread size belongs to the body inlet, never to the nozzle's mounting thread.
  const thread=inletThread(inlet);
  if(!connection.diameter||!thread||/ACME/i.test(inlet)){incomplete=true;continue;}
  const key=`${connection.diameter}:${thread}`,entry=saddles.get(key)??{diameter:connection.diameter,thread,qty:0};entry.qty++;saddles.set(key,entry);
  flex.set(thread,(flex.get(thread)??0)+Math.max(MIN_FLEX_LENGTH_M,connection.distance));
 }
 for(const [key,row] of [...saddles].sort(([a],[b])=>a.localeCompare(b)))rows.push({key:`saddle:${key}`,name:t('engineering.saddleMaterial',{diameter:diameter(row.diameter),thread:row.thread}),qty:row.qty,unit:t('pcs'),digits:0});
 for(const [thread,length] of [...flex].sort(([a],[b])=>a.localeCompare(b)))rows.push({key:`flex:${thread}`,name:t('engineering.flexMaterial',{thread}),qty:roundUp(fromMeters(length*PIPE_ALLOWANCE,units.length)),unit:lenLabel(units.length),digits:2,note:t('engineering.flexNote',{length:formatLenU(MIN_FLEX_LENGTH_M,units.length),percent:formatNumber(15,0)})});
 for(const e of Object.values(project.engineering?.elements??{})){
  if(e.kind==='pipe'&&e.type==='dripLine')rows.push({key:`drip:${e.id}`,name:`${e.name||t('engineering.dripLine')} · ${diameter(e.diameterMm)}`,qty:roundUp(fromMeters(routeLength(e.points)*PIPE_ALLOWANCE,units.length)),unit:lenLabel(units.length),digits:2,note:reserve});
  if(e.kind==='equipment'&&FIELD_CONNECTIONS.some(type=>type===e.type))rows.push({key:`field:${e.id}`,name:e.name||t('engineering.'+e.type),qty:1,unit:t('pcs'),digits:0,...(e.type==='roundValveBox'?{note:[e.size,e.boxDepthM??.25].map(v=>formatLenU(v,units.length)).join(' × ')}:e.type==='valveBox'?{note:[e.boxLengthM??.5,e.boxWidthM??.35,e.boxDepthM??.3].map(v=>formatLenU(v,units.length)).join(' × ')}:{})});
 }
 rows.push(...assemblyMaterials(project,units));
 return {rows,incomplete};
}
