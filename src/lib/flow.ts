import { text as uiText } from "@/lib/i18n";
import { catalogForHead, bodyForHead, supportsArc, defaultBodyFor, defaultNozzle, itemById, workingPressureBar, nozzleTablePressure, type CatalogItem, type FlowKind, type PerfRow } from "@/lib/equipment-catalog";
import type { Head } from "@/lib/project-types";

export type FlowResult = {
  lpm: number | null;
  m3h: number | null;
  radiusM: number | null;
  precipMmHr: number | null;
  precipTriangleMmHr: number | null;
  kind: FlowKind;
  sectorEstimated?: boolean;
  note: string | null;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const nullableLerp = (a: number | null, b: number | null, t: number) => a == null || b == null ? null : lerp(a, b, t);
function lerpRow(a: PerfRow, b: PerfRow, t: number, arcDeg = a.arcDeg): PerfRow {
  return {
    pressureBar: lerp(a.pressureBar,b.pressureBar,t), pressureKPa: lerp(a.pressureKPa,b.pressureKPa,t),
    radiusM: lerp(a.radiusM,b.radiusM,t), flowLMin: lerp(a.flowLMin,b.flowLMin,t), flowM3H: lerp(a.flowM3H,b.flowM3H,t),
    precipSquareMmH: nullableLerp(a.precipSquareMmH,b.precipSquareMmH,t),
    precipTriangleMmH: nullableLerp(a.precipTriangleMmH,b.precipTriangleMmH,t), arcDeg,
    ...(a.precipNoOverlapMmH !== undefined || b.precipNoOverlapMmH !== undefined
      ? {precipNoOverlapMmH:nullableLerp(a.precipNoOverlapMmH??null,b.precipNoOverlapMmH??null,t)} : {}),
    ...(a.radiusMinM != null && b.radiusMinM != null ? { radiusMinM:lerp(a.radiusMinM,b.radiusMinM,t) } : {}),
    ...(a.flowAtMinRadiusLMin != null && b.flowAtMinRadiusLMin != null ? { flowAtMinRadiusLMin:lerp(a.flowAtMinRadiusLMin,b.flowAtMinRadiusLMin,t) } : {}),
  };
}
function atPressure(rows: PerfRow[], bar: number, reviewRows=false): {row:PerfRow;kind:FlowKind} | null {
  if (!Number.isFinite(bar)) return null;
  const row = rows.find(r => Number.isFinite(bar) && Math.abs(r.pressureBar - bar) < 1e-7);
  if (row) return reviewRows&&row.verificationStatus==='Needs Review'?null:{ row, kind: "table" };
  const constant=rows.find(r=>r.pressureRangeIsConstant&&r.pressureMaxBar!=null&&bar>=r.pressureBar&&bar<=r.pressureMaxBar);
  if(constant)return reviewRows&&constant.verificationStatus==='Needs Review'?null:{row:{...constant,pressureBar:bar,pressureKPa:bar*100},kind:'pressure-compensated'};
  const sorted = rows.slice().sort((a,b)=>a.pressureBar-b.pressureBar);
  const lo = sorted.filter(r=>r.pressureBar<bar).at(-1), hi = sorted.find(r=>r.pressureBar>bar);
  if (!lo || !hi || reviewRows&&(lo.verificationStatus==='Needs Review' || hi.verificationStatus==='Needs Review')) return null;
  return {row:lerpRow(lo,hi,(bar-lo.pressureBar)/(hi.pressureBar-lo.pressureBar)),kind:'interpolated'};
}
/** Geometry can be verified even when the manufacturer conflicts on discharge. */
export function geometryAt(item:CatalogItem, nozzleId:string|null|undefined, pressureBar:number, arc:number): Pick<PerfRow, 'radiusM' | 'radiusMinM'> | null {
  pressureBar=nozzleTablePressure(item,pressureBar);
  const row = lookupPerformance(item,nozzleId,pressureBar,arc)?.row;
  if(row)return {radiusM:row.radiusM,radiusMinM:row.radiusMinM};
  // Mechanically supported small VAN/KV/KVF arcs can use the common throw only
  // when every published sector at this pressure agrees. Extend geometry,
  // never flow; some KV/KVF points have different throws and must stay unknown.
  if(!supportsArc(item,arc)||pressureBar<item.recommendedPressureMin||pressureBar>item.recommendedPressureMax)return null;
  const nozzle=nozzleId?item.nozzles.find(n=>n.id===nozzleId):defaultNozzle(item);
  const rows=nozzle?.performance??[],arcs=[...new Set(rows.map(r=>r.arcDeg))].sort((a,b)=>a-b);
  if(!geometryOnlySectorReference(item,arcs,arc))return null;
  const points=arcs.map(a=>atPressure(rows.filter(r=>r.arcDeg===a),pressureBar)?.row);
  const first=points[0];
  if(!first||!points.every(p=>p&&Math.abs(p.radiusM-first.radiusM)<1e-7))return null;
  // Equal interpolated throws could be an accidental crossing of different
  // sector curves. Both surrounding measured pressures must also agree.
  const pressures=[...new Set(rows.map(r=>r.pressureBar))].sort((a,b)=>a-b);
  const bounds=pressures.includes(pressureBar)?[pressureBar]:[pressures.filter(p=>p<pressureBar).at(-1),pressures.find(p=>p>pressureBar)];
  for(const pressure of bounds){
    if(pressure==null)return null;
    const endpoints=arcs.map(a=>atPressure(rows.filter(r=>r.arcDeg===a),pressure)?.row);
    if(!endpoints[0]||!endpoints.every(p=>p&&Math.abs(p.radiusM-endpoints[0]!.radiusM)<1e-7))return null;
  }
  return {radiusM:first.radiusM};
}
/** Audited footprints require a supported nozzle/pressure point; unknown geometry never implies coverage. */
export function operatingGeometryAvailable(item:CatalogItem, head:Pick<Head,'nozzleId'|'bodyId'|'designPressure'|'arc'|'r'>&Partial<Pick<Head,'bodySnapshot'|'popUpMm'>>):boolean {
  const hunter=(item.manufacturerId??'hunter')==='hunter';
  if(!hunter&&!['rain-bird','toro','k-rain'].includes(item.manufacturerId??''))return true;
  const pressure=head.designPressure??workingPressureBar(item,head.bodyId,head.nozzleId);
  if(!headPressureAvailable(item,head))return false;
  if(item.manufacturerId==='k-rain'&&item.coverageKind==='point')return item.geometryVerificationStatus==='Verified'&&
    Number.isFinite(pressure)&&pressure>=item.recommendedPressureMin&&pressure<=item.recommendedPressureMax&&
    supportsArc(item,head.arc)&&head.r===0&&!!(head.nozzleId?item.nozzles.find(n=>n.id===head.nozzleId):defaultNozzle(item));
  if(!geometryAt(item,head.nozzleId,pressure,head.arc))return false;
  if(hunter||item.manufacturerId==='rain-bird'||item.manufacturerId==='toro'||item.manufacturerId==='k-rain'){
    const legacyVerifiedSquare=item.id==='rain-bird:SQ-HLF'&&item.coverageKind==='square'&&item.hydraulicVerificationStatus==='Verified';
    if(item.placementSupported===false||item.geometryVerificationStatus==='Needs Review'||(item.verificationStatus==='Needs Review'&&item.geometryVerificationStatus!=='Verified'&&!legacyVerifiedSquare&&item.performanceReview!=='per-row'))return false;
    if(!item.strip&&item.coverageKind!=='point'){
      const range=radiusRange(item,head.nozzleId,pressure,head.arc);
      if(!range||!Number.isFinite(head.r)||head.r<=0||head.r<range.min-.01||head.r>range.max+.01)return false;
    }
  }
  return true;
}
type PerformancePoint={row:PerfRow;kind:FlowKind;sectorEstimated?:boolean;pressureInterpolated?:boolean};
/** Matched-precipitation adjustable sprays support sectors below the first chart row.
 * Their specification supports a proportional sector estimate;
 * this is not a separately measured manufacturer row. 0° is shutoff, not coverage.
 * hunterirrigation.com/irrigation-product/nozzles/pro-high-efficiency-nozzles
 * rainbird.com/products/he-van-high-efficiency-variable-arc-nozzles
 * rainbird.com/products/van-series-variable-arc-nozzles (12/15/18-VAN only);
 * krain.com/fully-adjustable-rotary-nozzles (80–89° below its first chart row). */
function matchedSectorReference(item:CatalogItem,arcs:number[],arc:number):number|null{
 const matched=(item.manufacturerId??'hunter')==='hunter'&&item.family==='he'||
  item.manufacturerId==='rain-bird'&&(item.series==='HE-VAN'||['12-VAN','15-VAN','18-VAN'].includes(item.modelId??''))||
  item.manufacturerId==='k-rain'&&item.series==='Fully Adjustable Rotary Nozzles';
 return matched&&arc>0&&arc<(arcs[0]??0)?arcs[0]!:null;
}
function geometryOnlySectorReference(item:CatalogItem,arcs:number[],arc:number):number|null{
 const supported=item.manufacturerId==='rain-bird'&&['4-VAN','6-VAN','8-VAN','10-VAN'].includes(item.modelId??'')||
  item.manufacturerId==='k-rain'&&['KV','KVF'].includes(item.series);
 return supported&&arc>0&&arc<(arcs[0]??0)?arcs[0]!:null;
}
export function performanceAt(item:CatalogItem, nozzleId:string|null|undefined, pressureBar:number, arc:number): PerformancePoint|null {
  const nozzle = nozzleId ? item.nozzles.find(n=>n.id===nozzleId) : defaultNozzle(item);
  if(nozzle?.hydraulicVerificationStatus==='Needs Review')return null;
  return lookupPerformance(item,nozzleId,pressureBar,arc);
}
function lookupPerformance(item:CatalogItem, nozzleId:string|null|undefined, pressureBar:number, arc:number): PerformancePoint|null {
  pressureBar=nozzleTablePressure(item,pressureBar);
  if (!supportsArc(item,arc) ||
      pressureBar<item.recommendedPressureMin || pressureBar>item.recommendedPressureMax) return null;
  const nozzle=nozzleId ? item.nozzles.find(n=>n.id===nozzleId) : defaultNozzle(item);
  if(!nozzle)return null;
  if(item.pressureCompensating&&item.compensatedFlowLMin!=null&&Number.isFinite(pressureBar))return {kind:'pressure-compensated',row:{pressureBar,pressureKPa:pressureBar*100,radiusM:0,flowLMin:item.compensatedFlowLMin,flowM3H:item.compensatedFlowLMin*.06,arcDeg:arc,precipSquareMmH:null,precipTriangleMmH:null}};
  const rows=nozzle?.performance ?? [];
  // Hunter specifies constant discharge over 1.0–4.8 bar for PCN/PCB/MSBN.
  // This is a published operating range, not pressure-table interpolation.
  if (item.pressureCompensating && rows.length && Number.isFinite(pressureBar)) {
    const min = Math.min(...rows.map(row => row.pressureBar));
    const max = Math.max(...rows.map(row => row.pressureBar));
    if (pressureBar >= min && pressureBar <= max && rows.every(row => row.flowLMin === rows[0]!.flowLMin && row.radiusM === rows[0]!.radiusM)) {
      return { row: { ...rows[0]!, pressureBar, pressureKPa: pressureBar * 100 }, kind: "pressure-compensated" };
    }
  }
  const arcs=[...new Set(rows.map(r=>r.arcDeg))].sort((a,b)=>a-b);
  if (!arcs.length) return null;
  const reviewRows=item.performanceReview==='per-row';
  const reference=matchedSectorReference(item,arcs,arc);
  // Rotor charts declare the precipitation reference sector; flow is independent of sweep.
  if (item.type==="rotor" || arcs.length===1&&reference==null) return atPressure(rows.filter(r=>r.arcDeg===arcs[0]),pressureBar,reviewRows);
  const exact=arcs.find(a=>a===arc);
  if (exact!=null) return atPressure(rows.filter(r=>r.arcDeg===exact),pressureBar,reviewRows);
  if(reference!=null){
    const source=atPressure(rows.filter(row=>row.arcDeg===reference),pressureBar,reviewRows);
    if(!source)return null;
    const ratio=arc/reference;
    return {row:{...source.row,arcDeg:arc,flowLMin:source.row.flowLMin*ratio,flowM3H:source.row.flowM3H*ratio,
      ...(source.row.flowAtMinRadiusLMin!=null?{flowAtMinRadiusLMin:source.row.flowAtMinRadiusLMin*ratio}:{})},
      kind:'matched-precip',sectorEstimated:true,pressureInterpolated:source.kind==='interpolated'};
  }
  const lo=arcs.filter(a=>a<arc).at(-1),hi=arcs.find(a=>a>arc);
  if (lo==null || hi==null) return null;
  const a=atPressure(rows.filter(r=>r.arcDeg===lo),pressureBar,reviewRows), b=atPressure(rows.filter(r=>r.arcDeg===hi),pressureBar,reviewRows);
  return a&&b ? {row:lerpRow(a.row,b.row,(arc-lo)/(hi-lo),arc),kind:"interpolated"} : null;
}

/** Published points common to sector rows; intermediate pressures use bounded interpolation. */
export function pressureSteps(item: CatalogItem, nozzleId: string | null | undefined, arc: number): number[] {
  if(item.compensatedFlowLMin!=null)return [item.recommendedPressureMin,item.recommendedPressureMax];
  const nozzle = nozzleId ? item.nozzles.find(n => n.id === nozzleId) : defaultNozzle(item);
  if(item.manufacturerId==='k-rain'&&item.coverageKind==='point'&&item.geometryVerificationStatus==='Verified'&&nozzle?.performance.length===0)
    return [item.recommendedPressureMin,item.recommendedPressureMax];
  const rows = nozzle?.performance ?? [];
  const arcs = [...new Set(rows.map(r => r.arcDeg))].sort((a, b) => a - b);
  if (!arcs.length) return [];
  const exact = arcs.find(a => a === arc);
  const reference=matchedSectorReference(item,arcs,arc)??geometryOnlySectorReference(item,arcs,arc);
  const useArcs = item.type === "rotor" || arcs.length === 1 ? [arcs[0]!] : reference!=null?[reference]:exact != null ? [exact]
    : [arcs.filter(a => a < arc).at(-1), arcs.find(a => a > arc)];
  if (useArcs.some(a => a == null)) return [];
  const ranges = useArcs.map(a => rows.filter(r => r.arcDeg === a).flatMap(r => r.pressureRangeIsConstant&&r.pressureMaxBar!=null?[r.pressureBar,r.pressureMaxBar]:[r.pressureBar]));
  const regulated = item.pressureCompensating && performanceAt(item, nozzleId, 2.8, arc) ? [2.8] : [];
  return [...new Set([...ranges[0]!, ...regulated])].filter(p => p >= item.recommendedPressureMin && p <= item.recommendedPressureMax &&
    (regulated.includes(p) || ranges.every(values => values.includes(p)))).sort((a, b) => a - b);
}

export function nearestPressure(steps: number[], requested: number): number | null {
  return steps.length ? steps.reduce((a, b) => Math.abs(b - requested) < Math.abs(a - requested) - 1e-9 ? b : a) : null;
}

/** Preserve an intermediate working pressure instead of snapping it to a catalog row. */
export function boundedPressure(steps: number[], requested: number): number | null {
  return steps.length && Number.isFinite(requested) ? Math.max(steps[0]!,Math.min(steps.at(-1)!,requested)) : null;
}

export function pressureRange(item: CatalogItem, nozzleId: string | null | undefined, arc: number) {
  const steps = pressureSteps(item, nozzleId, arc);
  return steps.length ? { min: steps[0]!, max: steps.at(-1)! } : null;
}

/** Nozzle working pressure cannot exceed the selected audited body's regulator.
 * Keep the raw performance table available for other compatible bodies. */
export function headPressureSteps(item:CatalogItem, head:Pick<Head,'nozzleId'|'arc'>&Partial<Pick<Head,'bodyId'|'bodySnapshot'|'popUpMm'>>) {
  const steps=pressureSteps(item,head.nozzleId,head.arc);
  if(!['hunter','rain-bird','toro','k-rain'].includes(item.manufacturerId??'hunter')||!steps.length)return steps;
  const body=bodyForHead(item,head.bodyId,head.popUpMm,head.bodySnapshot);
  if(!body)return steps;
  const min=Math.max(steps[0]!,nozzleTablePressure(item,body.recommendedPressureMin));
  const max=Math.min(steps.at(-1)!,nozzleTablePressure(item,body.recommendedPressureMax),nozzleTablePressure(item,body.regulatedPressureBar??Infinity));
  return min>max?[]:[...new Set([min,...steps.filter(bar=>bar>=min&&bar<=max),max])];
}

/** Saved overpressure stays visible for review, but cannot produce valid flow or coverage. */
export function headPressureAvailable(item:CatalogItem,head:Partial<Pick<Head,'designPressure'|'nozzleId'|'bodyId'|'bodySnapshot'|'popUpMm'>>){
  if(!['hunter','rain-bird','toro','k-rain'].includes(item.manufacturerId??'hunter'))return true;
  const body=bodyForHead(item,head.bodyId,head.popUpMm,head.bodySnapshot);
  if(!body)return true;
  const pressure=nozzleTablePressure(item,head.designPressure??workingPressureBar(item,head.bodyId,head.nozzleId));
  return Number.isFinite(pressure)&&pressure>=nozzleTablePressure(item,body.recommendedPressureMin)-1e-7&&
    pressure<=Math.min(nozzleTablePressure(item,body.recommendedPressureMax),nozzleTablePressure(item,body.regulatedPressureBar??Infinity))+1e-7;
}

/** Physical adjustment limits at the selected pressure, shared by the control and the store. */
export function radiusRange(item: CatalogItem, nozzleId: string | null | undefined, pressureBar: number, arc: number) {
  if (item.strip || item.coverageKind === "point") return null;
  const row = geometryAt(item, nozzleId, pressureBar, arc);
  if (!row || row.radiusM <= 0) return null;
  // Audited screw adjustment is relative to the selected
  // pressure/nozzle throw. The smallest full-throw row is not an adjustment floor.
  // Hunter: /en-metric/support/spray-nozzle-radius-adjustment (up to 25%).
  const ratioMinimum=item.radiusAdjustment?row.radiusM*item.radiusAdjustment.minimumRatio:row.radiusM;
  // R-VAN snapshots used minimumRatio=0 plus rMin for the published absolute
  // limit. Preserve that meaning for saved projects predating minimumRadiusM.
  const pressureRelative=['hunter','k-rain','rain-bird','toro'].includes(item.manufacturerId??'hunter')&&item.radiusAdjustment?.minimumRatio!==0;
  // Older O-series snapshots stored the designated-radius screw stop in rMin.
  const legacyToroFloor=item.manufacturerId==='toro'&&/^O-/.test(item.modelId??item.sku)&&item.radiusAdjustment?.minimumRatio===.75?item.rMin:undefined;
  const minimum=row.radiusMinM??item.radiusAdjustment?.minimumRadiusM??legacyToroFloor??(item.radiusAdjustment?(pressureRelative?ratioMinimum:Math.max(item.rMin,ratioMinimum)):row.radiusM);
  return { min: Math.min(row.radiusM, minimum), max: row.radiusM };
}

export function catalogHeadDefaults(item:CatalogItem) {
  const nozzle=defaultNozzle(item), bodyId=defaultBodyFor(item);
  const arc=Math.max(item.arcMin,Math.min(180,item.arcMax));
  const recommended = workingPressureBar(item,bodyId,nozzle?.id);
  const pressureBar=boundedPressure(pressureSteps(item,nozzle?.id,arc),recommended) ?? recommended;
  const row=geometryAt(item,nozzle?.id,pressureBar,arc);
  return {nozzleId:nozzle?.id??null,bodyId,designPressure:pressureBar,arc,r:row?.radiusM??item.rNom};
}

/** Official lookup first; interpolation and radius/sector adjustments are explicitly estimates. */
export function computeFlow(item:CatalogItem, opts:{arc:number;radius:number;pressureBar:number;nozzleId?:string|null}):FlowResult {
  const empty:FlowResult={lpm:null,m3h:null,radiusM:null,precipMmHr:null,precipTriangleMmHr:null,kind:"none",note:uiText("flowNoPerformance")};
  if (![opts.arc,opts.radius,opts.pressureBar].every(Number.isFinite) || (opts.arc<=0&&item.coverageKind!=="point") || opts.radius<0) return empty;
  if (item.verificationStatus==='Needs Review'&&item.hydraulicVerificationStatus!=='Verified'&&item.performanceReview!=='per-row') return empty;
  const found=performanceAt(item,opts.nozzleId,opts.pressureBar,opts.arc);
  if (!found) return empty;
  const row=found.row;
  let lpm=row.flowLMin,kind=found.kind;
  const notes:string[]=[];
  if (kind === "pressure-compensated") notes.push(uiText("flowCompensated"));
  if ((kind==="interpolated"||found.pressureInterpolated) && !item.pressureCompensating) notes.push(uiText("flowInterpolated"));
  if (found.sectorEstimated) notes.push(uiText("flowSectorEstimate"));
  let precip=row.precipSquareMmH,triangle=row.precipTriangleMmH;
  if (item.type==="rotor" && opts.arc!==row.arcDeg) {
    if (precip!=null) precip*=row.arcDeg/opts.arc;
    if (triangle!=null) triangle*=row.arcDeg/opts.arc;
    notes.push(uiText("flowArcAdjusted", { from: row.arcDeg, to: Math.round(opts.arc) }));
  }
  const changedRadius=item.coverageKind!=="point" && !item.strip && row.radiusM>0 && Math.abs(opts.radius-row.radiusM)>.01;
  if (changedRadius) {
    const min=radiusRange(item,opts.nozzleId,opts.pressureBar,opts.arc)?.min??row.radiusM;
    if (opts.radius<min-.02 || opts.radius>row.radiusM+.02) return {...empty,radiusM:row.radiusM,note:uiText("radiusOutOfNozzleRange")};
    const reduced=item.reductionPerformance?.find(r=>r.nozzleId===(opts.nozzleId??defaultNozzle(item)?.id)&&r.verificationStatus!=='Needs Review'&&Math.abs(r.pressureBar-opts.pressureBar)<1e-7&&Math.abs(r.radiusM-opts.radius)<1e-5);
    const factor=(row.radiusM/opts.radius)**2;
    if(reduced){
      lpm=reduced.flowLMin;precip=reduced.precipSquareMmH??null;triangle=reduced.precipTriangleMmH??null;
      if(item.type==='rotor'){if(precip!=null)precip*=reduced.arcDeg/opts.arc;if(triangle!=null)triangle*=reduced.arcDeg/opts.arc;}
      kind='table';
    } else if(row.radiusMinM!=null&&row.flowAtMinRadiusLMin!=null){
      const t=(opts.radius**2-row.radiusMinM**2)/(row.radiusM**2-row.radiusMinM**2);
      lpm=lerp(row.flowAtMinRadiusLMin,row.flowLMin,Math.max(0,Math.min(1,t)));
      if(precip!=null)precip*=lpm/row.flowLMin*factor;
      if(triangle!=null)triangle*=lpm/row.flowLMin*factor;
      kind='interpolated';notes.push(uiText('reducedRadiusEstimate'));
    } else if(item.radiusAdjustment?.flowPolicy==='matched-precipitation'){
      lpm/=factor;kind='matched-precip';notes.push(uiText('reducedRadiusEstimate'));
    } else if(item.radiusAdjustment?.flowPolicy==='unchanged'){
      if(precip!=null)precip*=factor;if(triangle!=null)triangle*=factor;
      kind='interpolated';notes.push(uiText('reducedRadiusPrecip'));
    } else return {...empty,radiusM:row.radiusM};
  }

  // Strip charts describe a different spacing geometry; they must never be labelled square/triangle.
  if (item.precipBasis==="strip" || item.precipBasis==="none") {precip=null;triangle=null;}
  if (item.precipBasis==="single") {triangle=null;notes.push(uiText("precipNoOverlap"));}
  return {lpm,m3h:lpm*.06,radiusM:item.coverageKind==="point"?null:row.radiusM,precipMmHr:precip,precipTriangleMmHr:triangle,kind,...(found.sectorEstimated?{sectorEstimated:true}:{}),note:notes.join(". ")||null};
}
export function flowLpm(item:CatalogItem,arc:number,pressureBar=2.8,nozzleId?:string|null,radius?:number):number|null {
  return computeFlow(item,{arc,pressureBar,nozzleId,radius:radius??performanceAt(item,nozzleId,pressureBar,arc)?.row.radiusM??item.rNom}).lpm;
}
export function headFlow(h:Head):FlowResult {
  const item=catalogForHead(h);
  if (!item||!headPressureAvailable(item,h)) return {lpm:null,m3h:null,radiusM:null,precipMmHr:null,precipTriangleMmHr:null,kind:"none",note:uiText(item?"flowNoPerformance":"verifyModel")};
  return computeFlow(item,{arc:h.arc,radius:h.r,pressureBar:h.designPressure??workingPressureBar(item,h.bodyId,h.nozzleId),nozzleId:h.nozzleId});
}
export function squarePrecipMmHr(qM3h:number,spacing:number,row:number) { return spacing>0&&row>0 ? 1000*qM3h/(spacing*row) : 0; }
export function trianglePrecipMmHr(qM3h:number,spacing:number) { return spacing>0 ? 1000*qM3h/(Math.sqrt(3)/2*spacing*spacing) : 0; }
export function totalAreaPrecip(sumLpm:number,area:number) { return area>0 ? 60*sumLpm/area : 0; }
export function runTimeMin(targetMm:number,precipMmHr:number):number|null {
  return Number.isFinite(targetMm)&&Number.isFinite(precipMmHr)&&targetMm>=0&&precipMmHr>0 ? 60*targetMm/precipMmHr : null;
}
