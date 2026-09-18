import { defaultNozzle, itemById, workingPressureBar, type CatalogItem, type FlowKind, type PerfRow } from "@/lib/hunter-catalog";
import type { Head } from "@/lib/project-types";

export type FlowResult = {
  lpm: number | null;
  m3h: number | null;
  radiusM: number | null;
  precipMmHr: number | null;
  precipTriangleMmHr: number | null;
  kind: FlowKind;
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
    ...(a.radiusMinM != null && b.radiusMinM != null ? { radiusMinM:lerp(a.radiusMinM,b.radiusMinM,t) } : {}),
    ...(a.flowAtMinRadiusLMin != null && b.flowAtMinRadiusLMin != null ? { flowAtMinRadiusLMin:lerp(a.flowAtMinRadiusLMin,b.flowAtMinRadiusLMin,t) } : {}),
  };
}
function atPressure(rows: PerfRow[], bar: number): {row:PerfRow;kind:FlowKind} | null {
  const sorted=[...rows].sort((a,b)=>a.pressureBar-b.pressureBar);
  if (!sorted.length || !Number.isFinite(bar) || bar<sorted[0]!.pressureBar-.001 || bar>sorted.at(-1)!.pressureBar+.001) return null;
  for (let i=0;i<sorted.length;i++) {
    const a=sorted[i]!; if (Math.abs(a.pressureBar-bar)<.001) return {row:a,kind:"table"};
    const b=sorted[i+1]; if (b && bar>a.pressureBar && bar<b.pressureBar) return {row:lerpRow(a,b,(bar-a.pressureBar)/(b.pressureBar-a.pressureBar)),kind:"interpolated"};
  }
  return null;
}
export function performanceAt(item:CatalogItem, nozzleId:string|null|undefined, pressureBar:number, arc:number): {row:PerfRow;kind:FlowKind}|null {
  const nozzle=nozzleId ? item.nozzles.find(n=>n.id===nozzleId) : defaultNozzle(item);
  const rows=nozzle?.performance ?? [];
  const arcs=[...new Set(rows.map(r=>r.arcDeg))].sort((a,b)=>a-b);
  if (!arcs.length) return null;
  // Rotor charts declare the precipitation reference sector; flow is independent of sweep.
  if (item.type==="rotor" || arcs.length===1) return atPressure(rows.filter(r=>r.arcDeg===arcs[0]),pressureBar);
  const exact=arcs.find(a=>a===arc);
  if (exact!=null) return atPressure(rows.filter(r=>r.arcDeg===exact),pressureBar);
  const lo=arcs.filter(a=>a<arc).at(-1),hi=arcs.find(a=>a>arc);
  if (lo==null || hi==null) return null;
  const a=atPressure(rows.filter(r=>r.arcDeg===lo),pressureBar), b=atPressure(rows.filter(r=>r.arcDeg===hi),pressureBar);
  return a&&b ? {row:lerpRow(a.row,b.row,(arc-lo)/(hi-lo),arc),kind:"interpolated"} : null;
}

/** Intersection of the model's range and published rows for the selected nozzle/sector. */
export function pressureRange(item: CatalogItem, nozzleId: string | null | undefined, arc: number) {
  const nozzle = nozzleId ? item.nozzles.find(n => n.id === nozzleId) : defaultNozzle(item);
  const rows = nozzle?.performance ?? [];
  const arcs = [...new Set(rows.map(r => r.arcDeg))].sort((a, b) => a - b);
  if (!arcs.length) return null;
  const exact = arcs.find(a => a === arc);
  const useArcs = item.type === "rotor" || arcs.length === 1 ? [arcs[0]!] : exact != null ? [exact]
    : [arcs.filter(a => a < arc).at(-1), arcs.find(a => a > arc)];
  if (useArcs.some(a => a == null)) return null;
  const ranges = useArcs.map(a => rows.filter(r => r.arcDeg === a).map(r => r.pressureBar));
  const min = Math.max(item.recommendedPressureMin, ...ranges.map(r => Math.min(...r)));
  const max = Math.min(item.recommendedPressureMax, ...ranges.map(r => Math.max(...r)));
  return min <= max ? { min, max } : null;
}

/** Physical adjustment limits at the selected pressure, shared by the control and the store. */
export function radiusRange(item: CatalogItem, nozzleId: string | null | undefined, pressureBar: number, arc: number) {
  if (item.strip || item.coverageKind === "point") return null;
  const row = performanceAt(item, nozzleId, pressureBar, arc)?.row;
  if (!row || row.radiusM <= 0) return null;
  return { min: Math.min(row.radiusM, row.radiusMinM ?? Math.max(item.rMin, row.radiusM * .75)), max: row.radiusM };
}

export function catalogHeadDefaults(item:CatalogItem) {
  const nozzle=defaultNozzle(item), bodyId=item.type==="rotor"?item.id:item.family==="mp"||item.family==="mp800"||item.family==="strip"?"PRS40":"PRS30";
  const pressureBar=workingPressureBar(item,bodyId,nozzle?.id);
  const arc=Math.max(item.arcMin,Math.min(180,item.arcMax));
  const row=performanceAt(item,nozzle?.id,pressureBar,arc)?.row;
  return {nozzleId:nozzle?.id??null,bodyId,designPressure:pressureBar,arc,r:row?.radiusM??item.rNom};
}

/** Official lookup first; interpolation and radius/sector adjustments are explicitly estimates. */
export function computeFlow(item:CatalogItem, opts:{arc:number;radius:number;pressureBar:number;nozzleId?:string|null}):FlowResult {
  const empty:FlowResult={lpm:null,m3h:null,radiusM:null,precipMmHr:null,precipTriangleMmHr:null,kind:"none",note:"Нет данных производителя для этих настроек"};
  if (![opts.arc,opts.radius,opts.pressureBar].every(Number.isFinite) || opts.arc<=0 || opts.radius<0) return empty;
  const found=performanceAt(item,opts.nozzleId,opts.pressureBar,opts.arc);
  if (!found) return empty;
  const row=found.row;
  let lpm=row.flowLMin,kind=found.kind;
  const notes:string[]=[];
  if (kind==="interpolated" && !item.pressureCompensating) notes.push("Интерполяция между табличными значениями Hunter");
  let precip=row.precipSquareMmH,triangle=row.precipTriangleMmH;
  if (item.type==="rotor" && opts.arc!==row.arcDeg) {
    if (precip!=null) precip*=row.arcDeg/opts.arc;
    if (triangle!=null) triangle*=row.arcDeg/opts.arc;
    notes.push(`Осаждение пересчитано с ${row.arcDeg}° на ${Math.round(opts.arc)}°; расход не меняется`);
  }
  const changedRadius=item.coverageKind!=="point" && !item.strip && row.radiusM>0 && Math.abs(opts.radius-row.radiusM)>.01;
  if (changedRadius) {
    const min=row.radiusMinM??Math.max(item.rMin,row.radiusM*.75);
    if (opts.radius<min-.02 || opts.radius>row.radiusM+.02) return {...empty,radiusM:row.radiusM,note:"Радиус вне диапазона выбранного сопла при этом давлении"};
    const factor=(row.radiusM/opts.radius)**2;
    if (item.family==="mp" || item.family==="mp800") {
      if (row.radiusMinM!=null && row.flowAtMinRadiusLMin!=null) {
        const t=(opts.radius**2-row.radiusMinM**2)/(row.radiusM**2-row.radiusMinM**2);
        lpm=lerp(row.flowAtMinRadiusLMin,row.flowLMin,Math.max(0,Math.min(1,t)));
        if(precip!=null)precip*=lpm/row.flowLMin*factor;
        if(triangle!=null)triangle*=lpm/row.flowLMin*factor;
      } else lpm/=factor;
      kind="matched-precip";notes.push("Расчётная оценка для уменьшенного радиуса");
    } else {
      if(precip!=null)precip*=factor;
      if(triangle!=null)triangle*=factor;
      kind="interpolated";notes.push("Осаждение оценено для уменьшенного радиуса; расход по таблице сопла");
    }
  }
  // Strip charts describe a different spacing geometry; they must never be labelled square/triangle.
  if (item.precipBasis==="strip" || item.precipBasis==="none") {precip=null;triangle=null;}
  if (item.precipBasis==="single") {triangle=null;notes.push("Осаждение без перекрытия соседними дождевателями");}
  return {lpm,m3h:lpm*.06,radiusM:item.coverageKind==="point"?null:row.radiusM,precipMmHr:precip,precipTriangleMmHr:triangle,kind,note:notes.join(". ")||null};
}
export function flowLpm(item:CatalogItem,arc:number,pressureBar=2.8,nozzleId?:string|null,radius?:number):number|null {
  return computeFlow(item,{arc,pressureBar,nozzleId,radius:radius??performanceAt(item,nozzleId,pressureBar,arc)?.row.radiusM??item.rNom}).lpm;
}
export function headFlow(h:Head):FlowResult {
  const item=itemById(h.catalogId);
  if (!item) return {lpm:null,m3h:null,radiusM:null,precipMmHr:null,precipTriangleMmHr:null,kind:"none",note:"Требуется проверка модели"};
  return computeFlow(item,{arc:h.arc,radius:h.r,pressureBar:h.designPressure??workingPressureBar(item,h.bodyId,h.nozzleId),nozzleId:h.nozzleId});
}
export function squarePrecipMmHr(qM3h:number,spacing:number,row:number) { return spacing>0&&row>0 ? 1000*qM3h/(spacing*row) : 0; }
export function trianglePrecipMmHr(qM3h:number,spacing:number) { return spacing>0 ? 1000*qM3h/(Math.sqrt(3)/2*spacing*spacing) : 0; }
export function totalAreaPrecip(sumLpm:number,area:number) { return area>0 ? 60*sumLpm/area : 0; }
export function runTimeMin(targetMm:number,precipMmHr:number):number|null {
  return Number.isFinite(targetMm)&&Number.isFinite(precipMmHr)&&targetMm>=0&&precipMmHr>0 ? 60*targetMm/precipMmHr : null;
}
