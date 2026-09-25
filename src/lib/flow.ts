import { text as uiText } from "@/lib/i18n";
import { defaultBodyFor, defaultNozzle, itemById, workingPressureBar, type CatalogItem, type FlowKind, type PerfRow } from "@/lib/hunter-catalog";
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
  const row = rows.find(r => Number.isFinite(bar) && Math.abs(r.pressureBar - bar) < 1e-7);
  return row ? { row, kind: "table" } : null;
}
export function performanceAt(item:CatalogItem, nozzleId:string|null|undefined, pressureBar:number, arc:number): {row:PerfRow;kind:FlowKind}|null {
  const nozzle=nozzleId ? item.nozzles.find(n=>n.id===nozzleId) : defaultNozzle(item);
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
  // Rotor charts declare the precipitation reference sector; flow is independent of sweep.
  if (item.type==="rotor" || arcs.length===1) return atPressure(rows.filter(r=>r.arcDeg===arcs[0]),pressureBar);
  const exact=arcs.find(a=>a===arc);
  if (exact!=null) return atPressure(rows.filter(r=>r.arcDeg===exact),pressureBar);
  const lo=arcs.filter(a=>a<arc).at(-1),hi=arcs.find(a=>a>arc);
  if (lo==null || hi==null) return null;
  const a=atPressure(rows.filter(r=>r.arcDeg===lo),pressureBar), b=atPressure(rows.filter(r=>r.arcDeg===hi),pressureBar);
  return a&&b ? {row:lerpRow(a.row,b.row,(arc-lo)/(hi-lo),arc),kind:"interpolated"} : null;
}

/** Only published pressure points common to the sector rows. Never interpolate pressure. */
export function pressureSteps(item: CatalogItem, nozzleId: string | null | undefined, arc: number): number[] {
  const nozzle = nozzleId ? item.nozzles.find(n => n.id === nozzleId) : defaultNozzle(item);
  const rows = nozzle?.performance ?? [];
  const arcs = [...new Set(rows.map(r => r.arcDeg))].sort((a, b) => a - b);
  if (!arcs.length) return [];
  const exact = arcs.find(a => a === arc);
  const useArcs = item.type === "rotor" || arcs.length === 1 ? [arcs[0]!] : exact != null ? [exact]
    : [arcs.filter(a => a < arc).at(-1), arcs.find(a => a > arc)];
  if (useArcs.some(a => a == null)) return [];
  const ranges = useArcs.map(a => rows.filter(r => r.arcDeg === a).map(r => r.pressureBar));
  const regulated = item.pressureCompensating && performanceAt(item, nozzleId, 2.8, arc) ? [2.8] : [];
  return [...new Set([...ranges[0]!, ...regulated])].filter(p => p >= item.recommendedPressureMin && p <= item.recommendedPressureMax &&
    (regulated.includes(p) || ranges.every(values => values.includes(p)))).sort((a, b) => a - b);
}

export function nearestPressure(steps: number[], requested: number): number | null {
  return steps.length ? steps.reduce((a, b) => Math.abs(b - requested) < Math.abs(a - requested) - 1e-9 ? b : a) : null;
}

export function pressureRange(item: CatalogItem, nozzleId: string | null | undefined, arc: number) {
  const steps = pressureSteps(item, nozzleId, arc);
  return steps.length ? { min: steps[0]!, max: steps.at(-1)! } : null;
}

/** Physical adjustment limits at the selected pressure, shared by the control and the store. */
export function radiusRange(item: CatalogItem, nozzleId: string | null | undefined, pressureBar: number, arc: number) {
  if (item.strip || item.coverageKind === "point") return null;
  const row = performanceAt(item, nozzleId, pressureBar, arc)?.row;
  if (!row || row.radiusM <= 0) return null;
  return { min: Math.min(row.radiusM, row.radiusMinM ?? Math.max(item.rMin, row.radiusM * .75)), max: row.radiusM };
}

export function catalogHeadDefaults(item:CatalogItem) {
  const nozzle=defaultNozzle(item), bodyId=defaultBodyFor(item);
  const arc=Math.max(item.arcMin,Math.min(180,item.arcMax));
  const recommended = workingPressureBar(item,bodyId,nozzle?.id);
  const pressureBar=nearestPressure(pressureSteps(item,nozzle?.id,arc),recommended) ?? recommended;
  const row=performanceAt(item,nozzle?.id,pressureBar,arc)?.row;
  return {nozzleId:nozzle?.id??null,bodyId,designPressure:pressureBar,arc,r:row?.radiusM??item.rNom};
}

/** Official lookup first; interpolation and radius/sector adjustments are explicitly estimates. */
export function computeFlow(item:CatalogItem, opts:{arc:number;radius:number;pressureBar:number;nozzleId?:string|null}):FlowResult {
  const empty:FlowResult={lpm:null,m3h:null,radiusM:null,precipMmHr:null,precipTriangleMmHr:null,kind:"none",note:uiText("flowNoPerformance")};
  if (![opts.arc,opts.radius,opts.pressureBar].every(Number.isFinite) || opts.arc<=0 || opts.radius<0) return empty;
  const found=performanceAt(item,opts.nozzleId,opts.pressureBar,opts.arc);
  if (!found) return empty;
  const row=found.row;
  let lpm=row.flowLMin,kind=found.kind;
  const notes:string[]=[];
  if (kind === "pressure-compensated") notes.push(uiText("flowCompensated"));
  if (kind==="interpolated" && !item.pressureCompensating) notes.push(uiText("flowInterpolated"));
  let precip=row.precipSquareMmH,triangle=row.precipTriangleMmH;
  if (item.type==="rotor" && opts.arc!==row.arcDeg) {
    if (precip!=null) precip*=row.arcDeg/opts.arc;
    if (triangle!=null) triangle*=row.arcDeg/opts.arc;
    notes.push(uiText("flowArcAdjusted", { from: row.arcDeg, to: Math.round(opts.arc) }));
  }
  const changedRadius=item.coverageKind!=="point" && !item.strip && row.radiusM>0 && Math.abs(opts.radius-row.radiusM)>.01;
  if (changedRadius) {
    const min=row.radiusMinM??Math.max(item.rMin,row.radiusM*.75);
    if (opts.radius<min-.02 || opts.radius>row.radiusM+.02) return {...empty,radiusM:row.radiusM,note:uiText("radiusOutOfNozzleRange")};
    const factor=(row.radiusM/opts.radius)**2;
    if (item.family==="mp" || item.family==="mp800") {
      if (row.radiusMinM!=null && row.flowAtMinRadiusLMin!=null) {
        const t=(opts.radius**2-row.radiusMinM**2)/(row.radiusM**2-row.radiusMinM**2);
        lpm=lerp(row.flowAtMinRadiusLMin,row.flowLMin,Math.max(0,Math.min(1,t)));
        if(precip!=null)precip*=lpm/row.flowLMin*factor;
        if(triangle!=null)triangle*=lpm/row.flowLMin*factor;
      } else lpm/=factor;
      kind="matched-precip";notes.push(uiText("reducedRadiusEstimate"));
    } else {
      if(precip!=null)precip*=factor;
      if(triangle!=null)triangle*=factor;
      kind="interpolated";notes.push(uiText("reducedRadiusPrecip"));
    }
  }
  // Strip charts describe a different spacing geometry; they must never be labelled square/triangle.
  if (item.precipBasis==="strip" || item.precipBasis==="none") {precip=null;triangle=null;}
  if (item.precipBasis==="single") {triangle=null;notes.push(uiText("precipNoOverlap"));}
  return {lpm,m3h:lpm*.06,radiusM:item.coverageKind==="point"?null:row.radiusM,precipMmHr:precip,precipTriangleMmHr:triangle,kind,note:notes.join(". ")||null};
}
export function flowLpm(item:CatalogItem,arc:number,pressureBar=2.8,nozzleId?:string|null,radius?:number):number|null {
  return computeFlow(item,{arc,pressureBar,nozzleId,radius:radius??performanceAt(item,nozzleId,pressureBar,arc)?.row.radiusM??item.rNom}).lpm;
}
export function headFlow(h:Head):FlowResult {
  const item=itemById(h.catalogId);
  if (!item) return {lpm:null,m3h:null,radiusM:null,precipMmHr:null,precipTriangleMmHr:null,kind:"none",note:uiText("verifyModel")};
  return computeFlow(item,{arc:h.arc,radius:h.r,pressureBar:h.designPressure??workingPressureBar(item,h.bodyId,h.nozzleId),nozzleId:h.nozzleId});
}
export function squarePrecipMmHr(qM3h:number,spacing:number,row:number) { return spacing>0&&row>0 ? 1000*qM3h/(spacing*row) : 0; }
export function trianglePrecipMmHr(qM3h:number,spacing:number) { return spacing>0 ? 1000*qM3h/(Math.sqrt(3)/2*spacing*spacing) : 0; }
export function totalAreaPrecip(sumLpm:number,area:number) { return area>0 ? 60*sumLpm/area : 0; }
export function runTimeMin(targetMm:number,precipMmHr:number):number|null {
  return Number.isFinite(targetMm)&&Number.isFinite(precipMmHr)&&targetMm>=0&&precipMmHr>0 ? 60*targetMm/precipMmHr : null;
}
