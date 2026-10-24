import {CATALOG,bodiesFor,defaultBodyFor,defaultPopUpMm,supportsArc,nozzleTablePressure,type CatalogItem} from './equipment-catalog';
import {computeFlow,geometryAt,operatingGeometryAvailable,performanceAt,radiusRange} from './flow';
import type {EquipmentFilters} from './equipment-library';
import {equipmentGroupCatalog,headInEquipmentGroup,type GroupCatalogItem} from './equipment-groups';
import {hydroKey} from './hydro';
import type {Head,Pt} from './project-types';

export type RequestedSector={center:Pt;radius:number;start:number;arc:number};
/** Pointer history is temporary; saved geometry always has a positive clockwise arc. */
export type AutomaticSectorDraft=RequestedSector&{trace?:{anchor:number;sweep:number;angle:number;clockwise:boolean}};
export type AutomaticHead=Pick<Head,'catalogId'|'nozzleId'|'bodyId'|'popUpMm'|'designPressure'|'r'|'arc'|'start'|'needsReview'>;

/** Inner series are browsing filters; selection stays within the selected compatibility group. */
export function automaticHeadCatalog(manufacturerId:EquipmentFilters['manufacturerId'],groupId:string){
 return equipmentGroupCatalog(CATALOG,manufacturerId??'hunter',groupId);
}
export function automaticZonePeers(heads:Head[],activeZoneId:number,catalog:CatalogItem[]){
 return heads.filter(head=>head.zone===activeZoneId&&headInEquipmentGroup(head,catalog));
}
export function automaticCandidateSupported(item:CatalogItem){
 return !((item.verificationStatus==='Needs Review'&&item.performanceReview!=='per-row')||item.geometryVerificationStatus==='Needs Review'||item.placementSupported===false||item.discontinued||item.type==='body'||item.type==='bubbler'||item.strip||item.coverageKind==='point'||item.coverageKind==='square'||item.coverageKind==='streams');
}
function zoneFitPredicate(peers:Head[]){
 // Read peer hydraulics once per pointer update, not once per candidate/body.
 const keys=new Set(peers.map(hydroKey));
 if(!keys.size)return (_head:AutomaticHead)=>true;
 if(keys.size!==1)return (_head:AutomaticHead)=>false;
 const key=[...keys][0];
 return (head:AutomaticHead)=>!head.needsReview&&hydroKey({...head,id:'automatic-candidate',x:0,y:0,zone:0,locked:false})===key;
}
/** RPS Select's four outlets are assigned to published quarter-circle arc bands. */
function supportedNozzleArc(item:CatalogItem,nozzleId:string,arc:number){
 const nozzle=item.nozzles.find(n=>n.id===nozzleId);
 if((item as GroupCatalogItem).automaticDesignArcOnly&&nozzle?.designArcDeg!==arc)return false;
 if(item.id==='k-rain:RPS-Select'){
  const number=Number(nozzleId.match(/standard-(\d+)/)?.[1]);
  const ranges:Record<number,[number,number]>={1:[40,135],2:[136,225],3:[226,315],4:[316,360]};
  const range=ranges[number];return !!range&&arc>=range[0]&&arc<=range[1];
 }
 return true;
}

/** Rain Bird publishes the same PRS30 setting as 2.1 bar, while these
 * nozzle charts print 2.07 bar or retain the exact conversion of 30 psi.
 * This equivalence applies only to nominal 30 psi, supplied directly or by a
 * documented PRS30 body; arbitrary nearby available pressures are not clamped.
 * Sources: rainbird.com/products/1800-series-spray-sprinkler-bodies;
 * chart_HE-VAN.pdf and MPR charts (see docs/equipment-sources/automatic-selection-2026-10-07.md). */
function regulatedTablePressure(item:CatalogItem,body:CatalogItem|null,availableBar:number){
 const nominal=nozzleTablePressure(item,body?.regulatedPressureBar??availableBar);
 if(item.manufacturerId!=='rain-bird'||nominal!==2.1||
    body?.regulatedPressureBar!=null&&!['rain-bird:1800-PRS30','rain-bird:1800-SAM-PRS30'].includes(body.bodyFamilyId??''))return nominal;
 if(['HE-VAN-8','HE-VAN-10'].includes(item.modelId??''))return 2.07;
 if(['5H','5Q','10H','10Q'].includes(item.modelId??''))return 2.068427187953493;
 return nominal;
}

/** Published performance tables and interpolation within their supported range.
 * A regulated body can reduce available pressure; an ordinary body cannot.
 * The input is pressure available at this head, not a hydraulic network calculation. */
type AutomaticCandidate={head:AutomaticHead;score:number[]};
const compareAutomaticCandidates=(a:AutomaticCandidate,b:AutomaticCandidate)=>{
 for(let i=0;i<a.score.length;i++){const d=a.score[i]!-b.score[i]!;if(Math.abs(d)>1e-8)return d;}
 return a.head.catalogId.localeCompare(b.head.catalogId)||String(a.head.bodyId).localeCompare(String(b.head.bodyId));
};
/** Same candidate calculation shared by final selection and radius-only preview. */
function automaticItemCandidates(radius:number,arc:number,availableBar:number,item:CatalogItem):AutomaticCandidate[]{
 const candidates:AutomaticCandidate[]=[];
  if(!automaticCandidateSupported(item)||!supportsArc(item,arc))return candidates;
  // Bounded pressure/sector interpolation and radius reduction cannot exceed
  // the largest published nozzle throw. Keep source rows, not nominal marketing rMax.
  if(!item.nozzles.some(nozzle=>nozzle.performance.some(row=>row.radiusM>=radius-1e-7)))return candidates;
  const preferredBody=defaultBodyFor(item);
  const bodies=item.type==='rotor'?[null]:bodiesFor(item);
  for(const body of bodies){
   if(body&&(nozzleTablePressure(item,availableBar)<nozzleTablePressure(item,body.recommendedPressureMin)||nozzleTablePressure(item,availableBar)>nozzleTablePressure(item,body.recommendedPressureMax)))continue;
   if(nozzleTablePressure(item,body?.regulatedPressureBar??availableBar)>nozzleTablePressure(item,availableBar)+1e-7)continue;
   if(body?.nominalRegulationMinInletBar!=null&&availableBar<body.nominalRegulationMinInletBar-1e-7)continue;
   if(body?.nominalRegulationMaxInletBar!=null&&availableBar>body.nominalRegulationMaxInletBar+1e-7)continue;
   const pressure=regulatedTablePressure(item,body,availableBar);
   for(const nozzle of item.nozzles){
    if(!supportedNozzleArc(item,nozzle.id,arc))continue;
    if(nozzle.hydraulicVerificationStatus==='Needs Review')continue;
    const performance=performanceAt(item,nozzle.id,pressure,arc);
    const geometry=performance?.row??geometryAt(item,nozzle.id,pressure,arc);
    if(!geometry||performance&&performance.row.flowLMin<=0)continue;
    const range=radiusRange(item,nozzle.id,pressure,arc);
    if(!range||radius<range.min-1e-7||radius>range.max+1e-7)continue;
    const flow=computeFlow(item,{arc,radius,pressureBar:pressure,nozzleId:nozzle.id});
    const needsReview=flow.lpm==null;
    // A documented screw adjustment supports placement even when the reduced
    // discharge is unpublished. Do not confuse it with a disputed base row.
    if(needsReview&&performance&&!(item.radiusAdjustment?.flowPolicy==='unknown'&&radius<performance.row.radiusM-.01))continue;
    const head:AutomaticHead={catalogId:item.id,nozzleId:nozzle.id,bodyId:body?.id??item.id,
     popUpMm:body?.popUpMm??defaultPopUpMm(item),designPressure:pressure,r:radius,arc,start:0,needsReview};
    if(!operatingGeometryAvailable(item,head))continue;
    candidates.push({head,
     score:[needsReview?1:0,item.family==='mp'||item.family==='mp800'?0:1,
      Math.abs(pressure-(nozzle.recommendedBar??item.recommendedPressureBar)),(range.max-radius)/range.max,
      body?.id===preferredBody||body?.bodyFamilyId===preferredBody?0:1]});
   }
  }
 return candidates;
}
export function selectAutomaticHead(radius:number,arc:number,availableBar:number,catalog:CatalogItem[]=CATALOG,compatibleHeads:Head[]=[]):AutomaticHead|null{
 if(![radius,arc,availableBar].every(Number.isFinite)||radius<=0||arc<=0||arc>360||availableBar<=0)return null;
 const fitsZone=zoneFitPredicate(compatibleHeads);
 const candidates=catalog.flatMap(item=>automaticItemCandidates(radius,arc,availableBar,item)).filter(candidate=>fitsZone(candidate.head));
 candidates.sort(compareAutomaticCandidates);
 return candidates[0]?.head??null;
}

export function sectorAngle(center:Pt,point:Pt){return (Math.atan2(point.y-center.y,point.x-center.x)*180/Math.PI+360)%360;}
/** Before the sector is drawn, availability means a supported arc exists. */
export function selectAutomaticRadius(radius:number,availableBar:number,catalog:CatalogItem[]=CATALOG,compatibleHeads:Head[]=[]):AutomaticHead|null{
 if(![radius,availableBar].every(Number.isFinite)||radius<=0||availableBar<=0)return null;
 // Try familiar sectors first. With zone constraints, also examine every integer
 // sector the drawing tool can produce: another nozzle may match at a different sweep.
 const fitsZone=zoneFitPredicate(compatibleHeads);
 const arcs=[...new Set([180,360,90,270,...catalog.flatMap(item=>[item.arcMin,item.arcMax,...item.nozzles.flatMap(n=>n.designArcDeg?[n.designArcDeg]:[]),...(item.allowedArcRanges??[]).flat()]),...compatibleHeads.map(h=>h.arc),...(compatibleHeads.length?Array.from({length:360},(_,i)=>i+1):[])])];
 const independent=new Set(catalog.filter(item=>!(item as GroupCatalogItem).automaticDesignArcOnly&&item.id!=='k-rain:RPS-Select'&&(item.type==='rotor'||item.nozzles.every(nozzle=>new Set(nozzle.performance.map(row=>row.arcDeg)).size<=1))));
 const cache=new Map<CatalogItem,AutomaticCandidate[]>();
 let fallback:AutomaticHead|null=null;
 for(const arc of arcs){
  if(arc<=0||arc>360)continue;
  const candidates:AutomaticCandidate[]=[];
  for(const item of catalog){
   // An unsupported sector must never populate the shared cache with an empty result.
   if(!supportsArc(item,arc))continue;
   let found=cache.get(item);
   if(!found){
    found=automaticItemCandidates(radius,arc,availableBar,item);
    // For rotors and a single published arc, lookupPerformance makes geometry and
    // flow independent of the chosen supported sweep; only precipitation changes.
    // Selection does not rank precipitation. Reuse within this call only.
    if(independent.has(item))cache.set(item,found);
   }
   candidates.push(...found.map(candidate=>({...candidate,head:{...candidate.head,arc}})).filter(candidate=>fitsZone(candidate.head)));
  }
  candidates.sort(compareAutomaticCandidates);
  const winner=candidates[0]?.head;
  const fit=winner?{...winner,arc}:null;
  if(fit&&!fit.needsReview)return fit;
  fallback??=fit;
 }
 return fallback;
}

/** Hit the outer arc in screen space; the centre is never a closing point. */
export function automaticSectorEdgeHit(sector:RequestedSector,point:Pt,px:number,touch=false){
 const distance=Math.hypot(point.x-sector.center.x,point.y-sector.center.y);
 const tolerance=Math.min((touch?20:12)/px,sector.radius*.25);
 return sector.radius>0&&distance>sector.radius*.5&&Math.abs(distance-sector.radius)<=tolerance;
}
const normalizeAngle=(angle:number)=>(angle%360+360)%360;
function sectorTrace(sector:AutomaticSectorDraft){
 return sector.trace??{anchor:sector.start,sweep:sector.arc,angle:normalizeAngle(sector.start+sector.arc),clockwise:true};
}
function sweptSector(sector:AutomaticSectorDraft,trace:NonNullable<AutomaticSectorDraft['trace']>,sweep:number):AutomaticSectorDraft{
 const arc=Math.min(360,Math.round(Math.abs(sweep))),clockwise=sweep===0?(trace.sweep===0?trace.clockwise:trace.sweep>0):sweep>0;
 return {...sector,start:normalizeAngle(trace.anchor-(clockwise?0:arc)),arc,trace:{...trace,clockwise}};
}
/** Accumulate signed movement, so either direction can cross 180° or complete a full turn. */
export function traceSector(sector:AutomaticSectorDraft,point:Pt,closeDistance:number):AutomaticSectorDraft{
 if(Math.hypot(point.x-sector.center.x,point.y-sector.center.y)<=closeDistance)return sector;
 const prior=sectorTrace(sector),angle=sectorAngle(sector.center,point);
 let delta=normalizeAngle(angle-prior.angle+180)-180;
 if(delta===-180&&prior.sweep>=0)delta=180;
 const sweep=Math.max(-360,Math.min(360,prior.sweep+delta));
 return sweptSector(sector,{...prior,sweep,angle},sweep);
}
/** A contour changes the visible endpoint, never the raw pointer's winding history. */
export function snapAutomaticSector(sector:AutomaticSectorDraft,point:Pt):AutomaticSectorDraft{
 const trace=sectorTrace(sector),angle=normalizeAngle(sectorAngle(sector.center,point)-trace.anchor);
 const sweep=angle+360*Math.round((trace.sweep-angle)/360);
 return sweptSector(sector,trace,sweep);
}
/** Numeric changes retain the last physical pointer angle, so the next move adds only its delta. */
export function editAutomaticSector(sector:AutomaticSectorDraft,patch:Partial<Pick<RequestedSector,'radius'|'arc'>>):AutomaticSectorDraft{
 if(patch.arc==null)return {...sector,...patch};
 const prior=sectorTrace(sector),sweep=Math.max(0,Math.min(360,patch.arc))*(prior.clockwise?1:-1);
 return sweptSector({...sector,...patch},{...prior,sweep},sweep);
}
export function automaticSectorTargetAngle(sector:AutomaticSectorDraft){
 return sector.trace?.clockwise===false?sector.start:sector.start+sector.arc;
}
