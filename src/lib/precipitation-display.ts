import type {CatalogItem} from './equipment-catalog';
import {computeFlow,performanceAt,type FlowResult} from './flow';

type OperatingPoint=Parameters<typeof computeFlow>[1];
export type DisplayPrecipitation={
  basis:'square'|'single'|'strip'|'strip-layout'|'flow-only';
  rate:number|null;triangle:number|null;calculated:boolean;interpolated?:boolean;noteKey?:string;
};
const rvanStrips=new Set(['rain-bird:R-VAN-LCS','rain-bird:R-VAN-RCS','rain-bird:R-VAN-SST']);
const verifiedSq=new Set(['rain-bird:SQ-QTR','rain-bird:SQ-FUL','rain-bird:SQ-3QTR']);

/** Presentation-only rates: keep source tables, saved snapshots and zone grouping intact. */
export function displayPrecipitation(item:CatalogItem,point:OperatingPoint,flow:FlowResult=computeFlow(item,point)):DisplayPrecipitation {
  if(item.coverageKind==='point'||item.coverageKind==='streams'||item.type==='bubbler')
    return {basis:'flow-only',rate:null,triangle:null,calculated:false,noteKey:'precipFlowOnly'};
  const row=performanceAt(item,point.nozzleId,point.pressureBar,point.arc)?.row;
  const nominal=!!row&&Math.abs(point.radius-row.radiusM)<=.01;
  const interpolated=flow.kind==='interpolated';
  if(item.strip||item.precipBasis==='strip'){
    // Toro publishes both strip-layout columns without specifying overlap distances.
    // These are reference chart values, not a measured rate for the user's layout.
    if(item.manufacturerId==='toro')return {basis:'strip-layout',rate:flow.lpm!=null?row?.precipSquareMmH??null:null,
      triangle:flow.lpm!=null?row?.precipTriangleMmH??null:null,calculated:false,interpolated,noteKey:'precipStripPublished'};
    // D42102: these columns refer to one straight row with 50% overlap.
    const rate=rvanStrips.has(item.id)&&flow.lpm!=null?row?.precipSquareMmH??null:null;
    return {basis:'strip',rate,triangle:null,calculated:false,interpolated,noteKey:rate!=null?'precipStripOverlap':'precipLayoutRequired'};
  }
  if(item.coverageKind==='square'){
    // SQ-HLF's printed precipitation remains disputed even for its usable large setting.
    const rate=verifiedSq.has(item.id)&&flow.lpm!=null&&nominal?row?.precipNoOverlapMmH??null:null;
    return {basis:'single',rate,triangle:null,calculated:false,interpolated,noteKey:'precipNoOverlap'};
  }
  if(item.precipBasis==='single')return {basis:'single',rate:flow.precipMmHr,triangle:null,calculated:false,interpolated,noteKey:'precipNoOverlap'};
  let rate=flow.precipMmHr,triangle=flow.precipTriangleMmHr,calculated=false;
  // Head-to-head spacing and the actual sweep angle; K-Rain also publishes
  // square/triangular design formulas. Never replace the raw manufacturer rows.
  // Only a verified full-radius circular rotor may use this clearly labelled estimate.
  if((item.manufacturerId==='rain-bird'||item.manufacturerId==='k-rain')&&item.type==='rotor'&&item.precipBasis==='square'&&nominal&&
    flow.lpm!=null&&flow.lpm>0&&point.radius>0&&point.arc>0&&(rate==null||triangle==null)){
    const square=60*flow.lpm*360/(point.arc*point.radius**2);
    rate??=square;triangle??=square/(Math.sqrt(3)/2);calculated=true;
  }
  return {basis:'square',rate,triangle,calculated:calculated||!!flow.sectorEstimated,interpolated,...(flow.sectorEstimated?{noteKey:'flowSectorEstimate'}:calculated?{noteKey:'precipCalculated'}:{})};
}
