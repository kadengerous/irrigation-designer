import { text } from "./i18n";
import { catalogName, popUpHeight } from "./catalog-localization";
import { bundledPhoto } from "@/lib/catalog-photos";
import {staticImageSrc} from './static-image-src';

export type FlowKind = "table" | "pressure-compensated" | "interpolated" | "matched-precip" | "none";
export type Family =
  | "mp"
  | "mp800"
  | "strip"
  | "spray"
  | "prostrip"
  | "he"
  | "fixed"
  | "short"
  | "stream"
  | "rotor"
  | "golf"
  | "st"
  | "bubbler"
  | "body";

export type PerfRow = {
  verificationStatus?: 'Verified'|'Needs Review';
  pressureBar: number;
  pressureMaxBar?: number;
  pressureRangeIsConstant?: boolean;
  pressureKPa: number;
  radiusM: number;
  flowLMin: number;
  flowM3H: number;
  precipSquareMmH: number | null;
  precipTriangleMmH: number | null;
  precipNoOverlapMmH?: number | null;
  arcDeg: number;
  radiusMinM?: number;
  flowAtMinRadiusLMin?: number;
};

import { modelCoveragePolicy, type CoverageRule } from './coverage-rules';
export type CatalogNozzle = {
  hydraulicVerificationStatus?: 'Verified' | 'Needs Review';
  dataNote?: string;
  colorSourceUrl?: string;
  colorVerifiedOn?: string;
  coverageRule?: CoverageRule;
  id: string;
  name: string;
  color: string;
  colorName: string;
  type: string;
  trajectoryDeg: number | null;
  performance: PerfRow[];
  sourceUrl?: string;
  recommendedBar?: number;
  /** Published MPR nozzle design sector; discharge stays fixed when the rotor arc changes. */
  designArcDeg?: number;
  flowArcPolicy?: 'unchanged' | 'proportional';
  size?: string;
};

import { MANUFACTURERS, type CatalogProvenance } from "./equipment-model";
export type CatalogItem = Partial<CatalogProvenance> & {
  colorSourceUrl?: string;
  colorVerifiedOn?: string;
  colorSourceKind?: 'nozzle'|'cap';
  unverifiedBodyFeatures?: string[];
  allowedArcRanges?: [number,number][];
  geometryVerificationStatus?: 'Verified'|'Needs Review';
  performanceReview?: 'per-row';
  fullCircleRotation?: 'continuous'|'reversing'|'unknown';
  placementSupported?: boolean;
  mountingKind?: 'spray'|'integrated'|'riser';
  compensatedFlowLMin?: number;
  /** Discrete published mounting-height exceptions; never interpolate between heights. */
  radiusByPopUpMm?: {popUpMm:number;radiusM:number}[];
  squarePatternFraction?: number;

  recommendedPressureIsDefault?: boolean;
  reductionPerformance?: Array<{pressureBar:number;nozzleId:string;arcDeg:number;radiusM:number;flowLMin:number;precipSquareMmH?:number|null;precipTriangleMmH?:number|null;verificationStatus?:string}>;
  nozzleThread?: string;
  compatibleBodyFamilyIds?: string[];
  excludedBodySkus?: string[];
  coverageRule?: CoverageRule;
  coverageRuleId?: string;
  coverageRuleSource?: string;
  id: string;
  sku: string;
  name: string;
  family: Family | "all";
  series: string;
  type: "nozzle" | "rotor" | "bubbler" | "body";
  colorName: string;
  color: string;
  arcMin: number;
  arcMax: number;
  rMin: number;
  rMax: number;
  rNom: number;
  precipClass: string;
  precipMmHr: number | null;
  thread: string;
  body: string;
  recommendedPressureBar: number;
  recommendedPressureMin: number;
  recommendedPressureMax: number;
  inlet: string;
  popUpMm: number | null;
  use: string;
  sourceDocument: string;
  sourceUrl: string;
  nozzles: CatalogNozzle[];
  strip?: { w: number; l: number; ox: number; oy: number };
  discontinued?: boolean;
  defaultNozzleId?: string;
  verifiedOn?: string;
  dataNote?: string;
  trajectoryNote?: string;
  coverageKind?: "sector" | "strip" | "point" | "square" | "streams";
  precipBasis?: "square" | "single" | "strip" | "none";
  pressureCompensating?: boolean;
  bodyFamilyId?: string;
  bodyFeatures?: string[];
  regulatedPressureBar?: number | null;
  /** Minimum inlet pressure at which the manufacturer guarantees nominal regulation. */
  nominalRegulationMinInletBar?: number;
  nominalRegulationMaxInletBar?: number;
  /** Integrated PRS rotor charts use inlet pressure, unlike spray nozzle charts. */
  pressureBasis?: 'inlet';
  bodyVerifiedOn?: string;
  mountingSourceUrl?: string;
  popUpOptions?: { mm: number; sku: string }[];
  stripPerformance?: { pressureBar: number; w: number; l: number }[];
};

// Verified Hunter tables, with explicit provenance and nullable missing values.
import rainbirdData from "@/data/equipment/rain-bird.json";
import rvanData from "@/data/equipment/rain-bird-rvan.json";
import toroData from "@/data/equipment/toro.json";
import krainData from "@/data/equipment/k-rain.json";
import catalogData from "@/data/hunter-catalog.json";
import bodyData from "@/data/hunter-body-models.json";
import rotorBodyData from "@/data/hunter-rotor-bodies.json";

const originalCatalog = catalogData as CatalogItem[];
const legacyBodySkus: Record<string, string> = {
  "PSU-04": "PS-ULTRA", "PROS-04": "PRO-SPRAY",
  "PROS-04-PRS30": "PRS30", "PROS-04-PRS40": "PRS40",
};
const bodyModels: CatalogItem[] = bodyData.series.flatMap(series => {
  const base = originalCatalog.find(item => item.id === series.id)!;
  return series.models.map(model => {
    const features = [
      "checkValve" in model && model.checkValve ? "CV" : "",
      "sideInlet" in model && model.sideInlet ? "SI" : "",
      "floGuard" in model && model.floGuard ? "FloGuard" : "",
      "reclaimed" in model && model.reclaimed ? "R" : "",
    ].filter(Boolean);
    return {
      ...base,
      id: legacyBodySkus[model.sku] ?? model.sku,
      sku: model.sku,
      name: model.sku,
      series: series.name,
      body: series.name,
      bodyFamilyId: series.id,
      bodyFeatures: features,
      regulatedPressureBar: series.regulatedPressureBar,
      recommendedPressureMin: series.operatingPressureMin,
      recommendedPressureMax: series.operatingPressureMax,
      popUpMm: model.popUpMm,
      sourceUrl: ("sourceUrl" in model ? model.sourceUrl : undefined) ?? series.sourceUrl,
      sourceDocument: "Hunter spray body model specifications",
      verifiedOn: bodyData.verifiedOn,
      bodyVerifiedOn: bodyData.verifiedOn,
    };
  });
});
const HUNTER_CATALOG: CatalogItem[] = [
  ...originalCatalog.filter(item => item.type !== "body").map(item => {
    const body = rotorBodyData.models.find(model => model.ids.includes(item.id));
    return body ? { ...item, popUpMm: body.defaultMm, popUpOptions: body.options,
      mountingSourceUrl: body.sourceUrl, bodyVerifiedOn: rotorBodyData.verifiedOn } : item;
  }),
  ...bodyModels,
].map(item=>({...item,manufacturerId:"hunter",modelId:item.id,catalogVersion:item.verifiedOn??"legacy",verificationStatus:item.discontinued?"Deprecated":"Verified",radiusAdjustment:hunterRadiusAdjustment(item),...modelCoveragePolicy(item)}));

/** Model-specific adjustment limits, audited against Hunter instructions.
 * I-80 explicitly forbids nozzle-radius reduction. Other large rotors without
 * a published quantitative limit retain only their pressure/nozzle table throw.
 * docs/equipment-sources/hunter-audit-2026-10-10/ */
function hunterRadiusAdjustment(item:Pick<CatalogItem,'id'|'family'>):NonNullable<CatalogItem['radiusAdjustment']>{
  const adjustable=['mp','mp800','spray','he','fixed','short'].includes(item.family)||
    ['PGJ','SRM','PGP-ADJ','PGP-ULTRA','I-20','I-20-SS'].includes(item.id);
  return {minimumRatio:adjustable?.75:1,flowPolicy:['mp','mp800'].includes(item.family)?'matched-precipitation':'unchanged'};
}

export const CATALOG: CatalogItem[] = [...HUNTER_CATALOG,...rainbirdData as unknown as CatalogItem[],...rvanData as unknown as CatalogItem[],...toroData as unknown as CatalogItem[],...krainData as unknown as CatalogItem[]].map(item=>({...item,...modelCoveragePolicy(item)}));

export const CATEGORIES: { id: Family | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mp", label: "MP Standard" },
  { id: "mp800", label: "MP800" },
  { id: "strip", label: "MP Strip" },
  { id: "he", label: "Pro High-Efficiency" },
  { id: "spray", label: "Pro Adjustable" },
  { id: "fixed", label: "Pro Fixed" },
  { id: "prostrip", label: "Strip Nozzles" },
  { id: "short", label: "Short Radius" },
  { id: "bubbler", label: "Bubblers" },
  { id: "rotor", label: "Rotors" },
  { id: "golf", label: "Golf Rotors" },
  { id: "st", label: "ST System" },
];
export const FAMILIES = CATEGORIES;

export function itemById(id: string): CatalogItem | undefined {
  return CATALOG.find((c) => c.id === id || c.type === "body" && c.sku === id);
}
export function placeableCatalog(): CatalogItem[] {
  return CATALOG.filter((c) => c.family !== "body" && !c.discontinued && c.placementSupported!==false)
    .sort((a, b) => b.rMax - a.rMax || a.id.localeCompare(b.id, "ru", { numeric: true }));
}
export function pickSkuForArc(seriesItems: CatalogItem[], arc: number): CatalogItem {
  const exact = seriesItems.find((c) => arc >= c.arcMin && arc <= c.arcMax);
  if (exact) return exact;
  return seriesItems.reduce((a, b) => (Math.abs(a.arcMin - arc) < Math.abs(b.arcMin - arc) ? a : b));
}
export function clampRadius(item: CatalogItem, r: number) {
  return Math.min(item.rMax, Math.max(item.rMin, r));
}
export function supportsArc(item:CatalogItem,arc:number){
  return Number.isFinite(arc)&&arc>=item.arcMin&&arc<=item.arcMax&&(!item.allowedArcRanges||item.allowedArcRanges.some(([min,max])=>arc>=min&&arc<=max));
}
export function clampArc(item: CatalogItem, a: number) {
  const value=Math.min(item.arcMax,Math.max(item.arcMin,Math.round(a)));
  if(supportsArc(item,value))return value;
  return (item.allowedArcRanges??[[item.arcMin,item.arcMax]]).flat().reduce((best,n)=>Math.abs(n-value)<Math.abs(best-value)?n:best);
}
export function defaultBodyFor(item: CatalogItem) {
  if (mountingKind(item) !== "spray") return item.id;
  if(item.manufacturerId && item.manufacturerId!=='hunter') {
    const compatible=compatibleBodies(item);
    return compatible.find(b=>b.regulatedPressureBar!=null&&Math.abs(b.regulatedPressureBar-item.recommendedPressureBar)<.12)?.id ?? compatible.find(b=>b.regulatedPressureBar==null)?.id ?? '';
  }
  if (item.family === "mp" || item.family === "mp800" || item.family === "strip") return "PRS40";
  if (item.type === "bubbler" && item.pressureCompensating) return "PRO-SPRAY";
  return "PRS30";
}

/** Nozzle threads are different from the body's 1/2-inch pipe inlet. */
export function mountingKind(item: CatalogItem): "spray" | "integrated" | "riser" {
  if (item.mountingKind)return item.mountingKind;
  if (item.type === "rotor") return "integrated";
  if (/^PCB-/.test(item.id) || item.id === "AFB") return "riser";
  return "spray";
}

export function isMp(item: CatalogItem): boolean {
  return ["mp", "mp800", "strip"].includes(item.family);
}

/** Official takeoff name: nozzle / rotator / rotor / body. */
export function bomLineName(item: CatalogItem, popUpMm?: number | null): string {
  const variant = item.type==='rotor'?item.popUpOptions?.find(option=>option.mm===(popUpMm??item.popUpMm)):undefined;
  return `${manufacturerName(item)} ${variant?.sku??catalogName(item)}`;
}

function compatibleBodies(item: CatalogItem): CatalogItem[] {
  const all=CATALOG.filter(b=>b.type==='body');
  if(!item.manufacturerId||item.manufacturerId==='hunter')return all.filter(b=>b.manufacturerId==='hunter');
  const ids=item.compatibleBodyFamilyIds??[];
  return all.filter(b=>!item.excludedBodySkus?.includes(b.sku)&&(ids.includes(b.id)||ids.includes(b.bodyFamilyId??'')||ids.includes(b.sku))).sort((a,b)=>Math.abs((a.popUpMm??0)-100)-Math.abs((b.popUpMm??0)-100));
}
export function bodiesFor(item: CatalogItem): CatalogItem[] {
  if (mountingKind(item) !== "spray" || item.type === "body" || /-HT(?:-|$)/.test(item.id)) return [];
  const preferred = defaultBodyFor(item);
  return compatibleBodies(item).sort((a,b)=>Number(b.id===preferred)-Number(a.id===preferred)||
    Math.abs((a.popUpMm??0)-100)-Math.abs((b.popUpMm??0)-100)||a.sku.localeCompare(b.sku));
}

export function recommendedBodyFor(item: CatalogItem, popUpMm?: number | null): CatalogItem | undefined {
  const preferred = itemById(defaultBodyFor(item));
  return bodiesFor(item).find(body => body.bodyFamilyId === preferred?.bodyFamilyId && body.regulatedPressureBar === preferred?.regulatedPressureBar && body.popUpMm === popUpMm) ?? preferred;
}

export function popUpHeights(item: CatalogItem): number[] {
  if (item.type === "body") return item.popUpMm == null ? [] : [item.popUpMm];
  if (mountingKind(item) === "riser") return [0];
  if (item.type === "rotor") return item.popUpOptions?.map(option => option.mm) ?? [];
  return [...new Set(bodiesFor(item).map(body => body.popUpMm!).filter(mm => mm != null))].sort((a, b) => a - b);
}

/** Resolve older family IDs + separately saved riser heights without losing the chosen height. */
export function bodyForHead(item: CatalogItem, bodyId?: string | null, popUpMm?: number | null, snapshot?: CatalogItem): CatalogItem | undefined {
  if(snapshot&&snapshot.id===bodyId&&snapshot.type==='body')return snapshot;
  if (mountingKind(item) !== "spray") return undefined;
  const body = itemById(bodyId ?? defaultBodyFor(item));
  if (body?.type !== "body" || !bodiesFor(item).some(b=>b.id===body.id)) return undefined;
  if (body.id === body.bodyFamilyId && popUpMm != null && popUpMm !== body.popUpMm) {
    return CATALOG.find(option => option.bodyFamilyId === body.bodyFamilyId && option.popUpMm === popUpMm &&
      !option.sku.endsWith("-R") && !option.sku.includes("-CV") && !option.sku.includes("-SI"));
  }
  return body;
}

export function defaultPopUpMm(item: CatalogItem, bodyId = defaultBodyFor(item)): number | null {
  if (mountingKind(item) === "riser") return 0;
  return item.type === "rotor" ? item.popUpMm : itemById(bodyId)?.popUpMm ?? null;
}
export function bodySelectionPatch(item: CatalogItem, bodyId: string, current: {
  bodyId?: string | null; designPressure?: number;
}): { bodyId: string; popUpMm: number | null; designPressure: number } | null {
  const body = bodiesFor(item).find(option => option.id === bodyId || option.sku === bodyId);
  if (!body) return null;
  const prior = current.bodyId ? itemById(current.bodyId) : undefined;
  const sameFamily = prior?.bodyFamilyId === body.bodyFamilyId && prior?.regulatedPressureBar === body.regulatedPressureBar;
  return { bodyId: body.id, popUpMm: body.popUpMm,
    designPressure: sameFamily && current.designPressure != null ? current.designPressure : workingPressureBar(item, body.id) };
}
export function workingPressureBar(item: CatalogItem, bodyId?: string | null, _nozzleId?: string | null) {
  const body = bodyId ? itemById(bodyId) : undefined;
  if (mountingKind(item) === "spray" && body?.regulatedPressureBar != null) return nozzleTablePressure(item,body.regulatedPressureBar);
  return nozzleTablePressure(item,item.nozzles.find(n => n.id === _nozzleId)?.recommendedBar ?? item.recommendedPressureBar);
}
/** Reconcile specific manufacturer labels for the same nominal psi checkpoint.
 * Other pressures remain interpolated; raw saved heads are never rewritten.
 * Evidence: docs/equipment-sources/{toro,krain}-audit-2026-10-10. */
export function nozzleTablePressure(item:CatalogItem,bar:number){
  // K-Rain KV/KVF charts print 20/30/40/50 psi as 1.38/2.07/2.76/3.45,
  // while body limits and recommendations use one-decimal nominal labels.
  // Normalize only those exact labels; intermediate real settings are retained.
  if(item.manufacturerId==='k-rain'&&['KV','KVF'].includes(item.series))
    return ({1.4:1.38,2.1:2.07,2.8:2.76,3.5:3.45} as Record<number,number>)[bar]??bar;
  // Toro's 30 psi rows and compatible Hunter PRS30's 2.1 bar label.
  return item.manufacturerId==='toro'&&item.type==='nozzle'&&
    ['PSN+ / Precision Series Spray','Precision Series Spray (O models)'].includes(item.series??'')&&
    Math.abs(item.recommendedPressureBar-2.068427)<1e-7&&bar===2.1?2.068427:bar;
}
export function catalogPressureLabel(item:CatalogItem){
  return item.pressureBasis==='inlet'?'equipment.pressureAtInlet':'workingPressure';
}

/** Strip dimensions at the head's pressure; preserve the manufacturer's nozzle origin. */
export function stripAtPressure(item: CatalogItem, pressureBar = item.recommendedPressureBar) {
  pressureBar=nozzleTablePressure(item,pressureBar);
  const base = item.strip;
  if (!base) return undefined;
  const rows = [...(item.stripPerformance ?? [])].sort((a, b) => a.pressureBar - b.pressureBar);
  if (!rows.length) return base;
  if (pressureBar < rows[0]!.pressureBar - .001 || pressureBar > rows.at(-1)!.pressureBar + .001) return undefined;
  let row = rows.find(r => Math.abs(r.pressureBar - pressureBar) < 1e-7);
  if (!row) {
    const lo=rows.filter(r=>r.pressureBar<pressureBar).at(-1), hi=rows.find(r=>r.pressureBar>pressureBar);
    if (lo && hi) {
      const t=(pressureBar-lo.pressureBar)/(hi.pressureBar-lo.pressureBar);
      row={pressureBar,w:lo.w+(hi.w-lo.w)*t,l:lo.l+(hi.l-lo.l)*t};
    }
  }
  if (!row) return undefined;
  const { w, l } = row;
  return { w, l, ox: base.ox * l / base.l, oy: base.oy * w / base.w };
}
export function nozzleRange(n: CatalogNozzle) {
  const rows = n.performance;
  if (!rows.length) return { rMin: 0, rMax: 0, recR: 0, recBar: 2.8, recLpm: 0 };
  const rs = rows.map((r) => r.radiusM);
  const mid = rows.reduce((a,b) => Math.abs(a.pressureBar-(n.recommendedBar ?? 2.8)) <= Math.abs(b.pressureBar-(n.recommendedBar ?? 2.8)) ? a : b);
  return { rMin: Math.min(...rs), rMax: Math.max(...rs), recR: mid.radiusM, recBar: mid.pressureBar, recLpm: mid.flowLMin };
}
export function defaultNozzle(item: CatalogItem) {
  if (!item.nozzles.length) return null;
  const preferred = item.nozzles.find(n => n.id === item.defaultNozzleId);
  if (preferred) return preferred;
  if (item.nozzles.length === 1) return item.nozzles[0]!;
  return pickNozzleForRadius(item, item.rNom);
}
export function pickNozzleForRadius(item: CatalogItem, r: number) {
  if (item.nozzles.length < 2) return item.nozzles[0] ?? null;
  let best = item.nozzles[0]!;
  let score = Infinity;
  for (const n of item.nozzles) {
    const st = nozzleRange(n);
    const rec = st.recR || (st.rMin + st.rMax) / 2;
    const s = Math.abs(rec - r);
    if (s < score) {
      score = s;
      best = n;
    }
  }
  return best;
}
export function pickSeriesForRadius(r: number, family: Family = "mp",catalog:CatalogItem[]=CATALOG): CatalogItem[] {
  const eligible=catalog.filter(c=>!c.strip&&!c.discontinued&&c.type!=='body'&&c.verificationStatus!=='Needs Review'&&c.series!=='MP Corner');
  const matching=eligible.filter(c=>c.family===family);
  const list=matching.length?matching:eligible;
  const groups = new Map<string, CatalogItem[]>();
  for (const c of list) {
    const key=`${c.manufacturerId}:${c.series}`;
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }
  let best: CatalogItem[] = list.filter((c) => c.series === "MP2000");
  let bestScore = Infinity;
  for (const [, items] of groups) {
    const first = items[0]!;
    const score = r > first.rMax ? r - first.rMax + 20 : r < first.rMin ? first.rMin - r + 20 : Math.abs(first.rNom - r);
    if (score < bestScore) {
      bestScore = score;
      best = items;
    }
  }
  return best.length ? best : list;
}

export function categoryPhoto(id: Family | "all"): string | null {
  if (id === "all") return null;
  const map: Record<string, string> = {
    mp: "group-mp",
    mp800: "group-mp800",
    strip: "group-strip",
    rotor: "rotors",
    golf: "group-golf",
    st: "group-st",
    bubbler: "group-bubbler",
    he: "group-he",
    fixed: "group-fixed",
    short: "group-short",
    stream: "8A",
    spray: "group-spray",
    prostrip: "group-prostrip",
  };
  return bundledPhoto(map[id]) ?? staticImageSrc(`/catalog/${map[id] ?? "MP2000"}.png?v=10`);
}

export function catalogPhoto(item: CatalogItem): string {
  return (
    bundledPhoto(item.id, item.sku, item.bodyFamilyId ?? "", item.series.replace(/\s+/g, ""), item.series.replace(/\s+/g, "-")) ??
    staticImageSrc(`/catalog/${item.id}.png?v=10`)
  );
}


export function manufacturerName(item: Pick<CatalogItem,'manufacturerId'>): string {
  return MANUFACTURERS.find(m => m.id === (item.manufacturerId ?? 'hunter'))?.name ?? '';
}

/** A saved product definition is authoritative until the user explicitly replaces it. */
export function catalogForHead(head: {catalogId?: string; equipmentSnapshot?: CatalogItem; popUpMm?:number|null;bodyId?:string|null}): CatalogItem | undefined {
  const snapshot = head.equipmentSnapshot;
  if (snapshot) {
    if (snapshot.id !== head.catalogId || !Array.isArray(snapshot.nozzles) || snapshot.nozzles.some(n=>!n||!Array.isArray(n.performance)||n.performance.some(r=>!r||![r.pressureBar,r.radiusM,r.flowLMin,r.arcDeg].every(Number.isFinite)||r.flowLMin<0)) ||
        ![snapshot.arcMin,snapshot.arcMax,snapshot.rMin,snapshot.rMax].every(Number.isFinite)||
        snapshot.radiusByPopUpMm!=null&&(!Array.isArray(snapshot.radiusByPopUpMm)||snapshot.radiusByPopUpMm.some(row=>!row||!Number.isFinite(row.popUpMm)||!Number.isFinite(row.radiusM)||row.popUpMm<0||row.radiusM<=0))) return undefined;
    return catalogAtPopUp(snapshot,head.popUpMm??itemById(head.bodyId??'')?.popUpMm);
  }
  const item=head.catalogId?itemById(head.catalogId):undefined;
  return item?catalogAtPopUp(item,head.popUpMm??itemById(head.bodyId??'')?.popUpMm):undefined;
}

function catalogAtPopUp(item:CatalogItem,popUpMm?:number|null):CatalogItem{
  const variant=item.radiusByPopUpMm?.find(row=>row.popUpMm===popUpMm);
  return variant?{...item,rMin:variant.radiusM,rMax:variant.radiusM,rNom:variant.radiusM,
    nozzles:item.nozzles.map(nozzle=>({...nozzle,performance:nozzle.performance.map(row=>({...row,radiusM:variant.radiusM}))}))}:item;
}
export function equipmentSnapshot(item: CatalogItem): CatalogItem {
  return JSON.parse(JSON.stringify(item)) as CatalogItem;
}

/** Updated identification colors are presentation metadata, never a hydraulic migration. */
export function equipmentAppearance(item:CatalogItem|undefined,nozzleId?:string|null,part:'equipment'|'nozzle'='equipment'):{color:string;colorName:string} {
  if(!item)return {color:'#6b7280',colorName:'Unknown'};
  const nozzle=nozzleId?item.nozzles.find(n=>n.id===nozzleId):defaultNozzle(item);
  const current=item.manufacturerId==='rain-bird'||item.manufacturerId==='toro'||item.manufacturerId==='k-rain'?itemById(item.id):undefined;
  const liveNozzle=current?.nozzles.find(n=>n.id===nozzle?.id);
  const known=(value:{color:string;colorName:string;colorSourceUrl?:string;colorVerifiedOn?:string}|undefined)=>value&&value.colorSourceUrl&&value.colorVerifiedOn&&!['unknown','not specified'].includes(value.colorName.toLowerCase());
  const cap=part==='equipment'&&current?.colorSourceKind==='cap'&&known(current)&&(liveNozzle||!nozzle)?current:undefined;
  const appearance=known(liveNozzle)?liveNozzle!:cap??(!nozzle&&known(current)?current!:nozzle??item);
  return {color:appearance.color,colorName:appearance.colorName};
}
