import type {Project} from './project-types';
import {catalogForHead} from './equipment-catalog';
import {headFlow,runTimeMin} from './flow';
import {headWorkingBar} from './hydro';
import {displayPrecipitation} from './precipitation-display';
import {waterConsumers} from './engineering-hydraulics';
import {engineeringOperatingPlan} from './engineering-operation';

export type WaterCycleZone={circuit:string;count:number;flowLpm:number|null;pressureBar:number|null;rateMmHr:number|null;runtimeMin:number|null;manualRuntime:boolean;volumeL:number|null};
export type WaterRecommendations={zones:WaterCycleZone[];flowLpm:number|null;pressureBar:number|null;estimatedFlow:boolean;estimatedCycleFlow:boolean;selectionValid:boolean;targetMm:number|null;reservePct:number|null;fallbackRuntimeMin:number|null;cycleVolumeL:number|null;capacityL:number|null};
const positive=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const sumKnown=(values:(number|null)[])=>values.length&&values.every(positive)?values.reduce<number>((sum,n)=>sum+n!,0):null;

/** Preliminary demand uses every installed consumer, including hidden heads.
 * Pump head itself remains the hydraulic network calculation's responsibility.
 * Cycle volume = sum(Q_zone × minutes_zone), independent of sequential/simultaneous operation.
 * Runtime = depth × 60 / application rate: Rain Bird Design Manual, pp58–60:
 * https://www.rainbird.com/media/4214
 * Reference spacing rates are estimates for planning, never measured uniformity.
 */
export function irrigationWaterRecommendations(project:Project):WaterRecommendations {
 const consumers=waterConsumers(project),settings=project.engineering?.hydraulics??{},byCircuit=new Map<string,typeof consumers>();
 for(const consumer of consumers){const group=byCircuit.get(consumer.circuit)??[];group.push(consumer);byCircuit.set(consumer.circuit,group);}
 const targetMm=positive(project.meta.targetMm)?project.meta.targetMm:null;
 const fallbackRuntimeMin=positive(settings.tankRuntimeMin)?settings.tankRuntimeMin:null;
 const rawReserve=settings.tankReservePct??20,reservePct=Number.isFinite(rawReserve)&&rawReserve>=0&&rawReserve<=100?rawReserve:null;
 const rates=new Map<string,number|null>(project.heads.map(head=>{
  const item=catalogForHead(head),flow=headFlow(head),rate=item?displayPrecipitation(item,{arc:head.arc,radius:head.r,pressureBar:headWorkingBar(head),nozzleId:head.nozzleId},flow).rate:null;
  return [`head:${head.id}`,positive(rate)?rate:null] as const;
 }));
 const zones:WaterCycleZone[]=[...byCircuit].map(([circuit,members])=>{
  const flowLpm=sumKnown(members.map(c=>c.flow)),pressureBar=members.every(c=>positive(c.pressure))?Math.max(...members.map(c=>c.pressure!)):null;
  const referenceRates=members.map(c=>rates.get(c.id)??null),rateMmHr=referenceRates.every(positive)?Math.min(...referenceRates as number[]):null;
  // A zone runs as one circuit: the slowest reference rate governs its runtime.
  // Local emitters and equipment with no area rate require explicitly entered time.
  const manualRuntime=rateMmHr==null,runtimeMin=manualRuntime?fallbackRuntimeMin:targetMm==null?null:runTimeMin(targetMm,rateMmHr);
  return {circuit,count:members.length,flowLpm,pressureBar,rateMmHr,runtimeMin,manualRuntime,volumeL:flowLpm!=null&&runtimeMin!=null?flowLpm*runtimeMin:null};
 });
 const plan=engineeringOperatingPlan(project,consumers),scenarioFlows=plan.scenarios.map(s=>sumKnown(s.consumers.map(c=>c.flow)));
 const flowLpm=plan.selectionValid&&scenarioFlows.length&&scenarioFlows.every(positive)?Math.max(...scenarioFlows as number[]):null;
 const pressureBar=plan.selectionValid&&plan.consumers.length&&plan.consumers.every(c=>positive(c.pressure))?Math.max(...plan.consumers.map(c=>c.pressure!)):null;
 const cycleVolumeL=sumKnown(zones.map(z=>z.volumeL));
 return {zones,flowLpm,pressureBar,estimatedFlow:plan.consumers.some(c=>c.estimated),estimatedCycleFlow:consumers.some(c=>c.estimated),selectionValid:plan.selectionValid,targetMm,reservePct,fallbackRuntimeMin,cycleVolumeL,capacityL:cycleVolumeL!=null&&reservePct!=null?cycleVolumeL*(1+reservePct/100):null};
}
