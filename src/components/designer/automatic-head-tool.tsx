import {computeFlow} from '@/lib/flow';
import {useEffect,useMemo,useRef,useState,type PointerEvent as Pointer} from 'react';
import {createPortal} from 'react-dom';
import {Check,X,Undo2} from 'lucide-react';
import {useProject} from '@/lib/project-store';
import {automaticHeadCatalog,automaticZonePeers,selectAutomaticHead,selectAutomaticRadius,automaticSectorEdgeHit,sectorAngle,traceSector,snapAutomaticSector,editAutomaticSector,automaticSectorTargetAngle,type AutomaticHead,type RequestedSector,type AutomaticSectorDraft} from '@/lib/automatic-head';
import {drawingOrMigrate} from '@/lib/cad/engine';
import {snapSprinklerPoint} from '@/lib/head-snapping';
import {visibleProjectHeads} from '@/lib/head-visibility';
import {itemById,catalogPressureLabel} from '@/lib/equipment-catalog';
import {equipmentGroup} from '@/lib/equipment-groups';
import {catalogName} from '@/lib/catalog-localization';
import {text as t,formatNumber} from '@/lib/i18n';
import {formatLenU,formatPressureU,fromBar,toBar,pressureLabel,fromMeters,toMetersLen,lenLabel,type UnitPrefs} from '@/lib/units';
import type {Pt} from '@/lib/geometry';
import {LocalizedNumberInput} from './localized-number-input';
import './automatic-head.css';
import {SprinklerTarget} from './sprinkler-target';
import {headSymbolScale} from '@/lib/head-presentation';

export function AutomaticHeadTool({panelHost=null}:{panelHost?:HTMLElement|null}){
 const project=useProject(s=>s.project),px=useProject(s=>s.pxPerMeter),panX=useProject(s=>s.panX),panY=useProject(s=>s.panY),units=useProject(s=>s.units);
 useProject(s=>s.locale);useProject(s=>s.numberFormat);
 const [center,setCenter]=useState<Pt|null>(null),[sector,setSector]=useState<AutomaticSectorDraft|null>(null),[hover,setHover]=useState<Pt|null>(null);
 const [pressure,setPressure]=useState<number|null>(project.water.dynamicBar),[failed,setFailed]=useState(false);
 const [panning,setPanning]=useState(false);
 const svg=useRef<SVGSVGElement>(null),pointers=useRef(new Map<number,Pt>()),blocked=useRef(false),pan=useRef<{client:Pt;pan:Pt}|null>(null);
 const pinch=useRef<{distance:number;mid:Pt;px:number;pan:Pt}|null>(null);
 const resumePointer=useRef<Pt|null>(null);
 const gestureStart=useRef<{sector:AutomaticSectorDraft|null;hover:Pt|null}|null>(null);
 const draft=useRef(sector);draft.current=sector;
 useEffect(()=>{
  const element=svg.current;if(!element)return;
  const wheel=(e:WheelEvent)=>{
   e.preventDefault();const s=useProject.getState(),rect=element.getBoundingClientRect();
   const x=e.clientX-rect.left,y=e.clientY-rect.top,old=s.pxPerMeter;
   s.setZoom(old*Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.002));const next=useProject.getState().pxPerMeter;
   s.setPan(x-(x-s.panX)*next/old,y-(y-s.panY)*next/old);
  };
  element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);
 },[]);
 const closeDistance=Math.min(14/px,(sector?.radius??1)*.25);
 const manufacturerId=useProject(s=>s.equipmentFilters.manufacturerId),familyFilter=useProject(s=>s.familyFilter),activeZoneId=useProject(s=>s.activeZoneId);
 const group=equipmentGroup(manufacturerId,familyFilter);
 const catalog=useMemo(()=>automaticHeadCatalog(manufacturerId,familyFilter),[manufacturerId,familyFilter]);
 const peers=useMemo(()=>automaticZonePeers(project.heads,activeZoneId,catalog),[project.heads,activeZoneId,catalog]);
 const radius=sector?.radius??(center&&hover?Math.hypot(hover.x-center.x,hover.y-center.y):0);
 const arc=sector?.arc??0;
 const fit=useMemo(()=>pressure==null||radius<=0?null:arc>0?selectAutomaticHead(radius,arc,pressure,catalog,peers):selectAutomaticRadius(radius,pressure,catalog,peers),[radius,arc,pressure,catalog,peers]);
 const editSector=(patch:Partial<Pick<RequestedSector,'radius'|'arc'>>)=>{if(!draft.current)return;const next=editAutomaticSector(draft.current,patch);draft.current=next;setSector(next);setFailed(false);};
 const cancel=()=>{pointers.current.clear();blocked.current=true;pinch.current=null;pan.current=null;resumePointer.current=null;gestureStart.current=null;setPanning(false);useProject.setState({tool:'place'});};
 const finish=()=>{const value=draft.current;if(!value||value.arc<=0||pressure==null||!useProject.getState().placeAutomaticHead(value,pressure))setFailed(true);};
 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{if((e.target as HTMLElement).closest('input,textarea,select'))return;if(e.key==='Enter'){e.preventDefault();finish();}if(e.key==='Escape'){e.preventDefault();cancel();}};
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
 });
 const point=(x:number,y:number)=>{const s=useProject.getState(),r=svg.current!.getBoundingClientRect();return{x:(x-r.left-s.panX)/s.pxPerMeter,y:(y-r.top-s.panY)/s.pxPerMeter};};
 const track=(x:number,y:number,pointerType='mouse',preserveStationary=false)=>{
  const raw=point(x,y),s=useProject.getState(),resume=resumePointer.current;
  if(preserveStationary&&resume&&Math.hypot(x-resume.x,y-resume.y)<.01)return hover??raw;
  resumePointer.current=null;
  const drawing=drawingOrMigrate(s.project);
  // Grid and existing-head guides help place the centre only. From then on,
  // reference visible figure contours, including their corners and midpoints.
  const options={snapOn:s.snapOn,snapGridOn:!center&&s.snapGridOn,gridStep:s.gridStep,pxPerMeter:s.pxPerMeter,pointerType,heads:center?[]:visibleProjectHeads(s.project)};
  const hit=draft.current?raw:snapSprinklerPoint(raw,drawing,options).pt;
  const p={x:hit.x,y:hit.y};setHover(p);setFailed(false);
  if(draft.current){
   let prior=draft.current;
   if(resume){
    const reference=point(resume.x,resume.y),c=prior.center;
    const angle=sectorAngle(c,Math.hypot(reference.x-c.x,reference.y-c.y)>closeDistance?reference:p);
    // Moving the viewport does not sweep the sector. Resume from the release
    // position, retaining its anchor, winding, radius and visible geometry.
    prior={...prior,trace:{...(prior.trace??{anchor:prior.start,sweep:prior.arc,clockwise:true}),angle}};
   }
   let next=traceSector(prior,p,closeDistance);
   // Snap the attached target, not distant geometry under the physical pointer.
   const endpoint=automaticHeadTarget(center,p,next);
   if(endpoint){
    const target=snapSprinklerPoint(endpoint,drawing,options);
    if(target.kind!=='none')next=snapAutomaticSector(next,target.pt);
   }
   draft.current=next;setSector(next);
  }
  return p;
 };
 const tap=(p:Pt,touch=false)=>{
  setFailed(false);
  if(!center){setCenter(p);return;}
  if(!draft.current){
   const radius=Math.hypot(p.x-center.x,p.y-center.y),s=useProject.getState();if(radius*s.pxPerMeter<18)return;
   const scope=automaticHeadCatalog(s.equipmentFilters.manufacturerId,s.familyFilter),members=automaticZonePeers(s.project.heads,s.activeZoneId,scope);
   // Recheck this exact release point and current group/zone, not the last render's fit.
   if(pressure==null||!selectAutomaticRadius(radius,pressure,scope,members)){setFailed(true);return;}
   const value={center,radius,start:sectorAngle(center,p),arc:0};draft.current=value;setSector(value);return;
  }
  // The visible target is constrained to the sector edge. Commit that same
  // endpoint, while keeping a click at the sprinkler centre from closing it.
  if(Math.hypot(p.x-center.x,p.y-center.y)<=closeDistance){setFailed(true);return;}
  const target=automaticHeadTarget(center,p,draft.current);
  if(!target||!automaticSectorEdgeHit(draft.current,target,px,touch)){setFailed(true);return;}
  // A repeated click at the first boundary has not drawn any coverage.
  // Full circles require the 360° control or an actual sweep around the centre.
  if(draft.current.arc===0){setFailed(true);return;}
  finish();
 };
 const down=(e:Pointer<SVGSVGElement>)=>{
  const right=e.button===2||(e.button===0&&e.ctrlKey&&e.pointerType==='mouse');
  if(right){e.preventDefault();e.stopPropagation();}
  if(!pointers.current.size)gestureStart.current={sector:draft.current,hover};
  e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const s=useProject.getState();
  if(pointers.current.size===2){restoreGesture();pan.current=null;setPanning(false);const [a,b]=[...pointers.current.values()] as [Pt,Pt];pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y),mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},px:s.pxPerMeter,pan:{x:s.panX,y:s.panY}};blocked.current=true;return;}
  if(right||e.button===1||s.spaceDown){blocked.current=true;pan.current={client:{x:e.clientX,y:e.clientY},pan:{x:s.panX,y:s.panY}};setPanning(true);return;}
  track(e.clientX,e.clientY,e.pointerType);
 };
 const move=(e:Pointer<SVGSVGElement>)=>{
  if(pointers.current.has(e.pointerId))pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const s=useProject.getState(),g=pinch.current;
  if(g&&pointers.current.size>=2){const [a,b]=[...pointers.current.values()] as [Pt,Pt],r=svg.current!.getBoundingClientRect();s.setZoom(g.px*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,g.distance));const z=useProject.getState().pxPerMeter;s.setPan((a.x+b.x)/2-r.left-(g.mid.x-r.left-g.pan.x)*z/g.px,(a.y+b.y)/2-r.top-(g.mid.y-r.top-g.pan.y)*z/g.px);return;}
  if(pan.current){const g=pan.current;s.setPan(g.pan.x+e.clientX-g.client.x,g.pan.y+e.clientY-g.client.y);return;}
  if((e.buttons&2)||(e.ctrlKey&&e.pointerType==='mouse'&&e.buttons))return;
  if(!blocked.current)track(e.clientX,e.clientY,e.pointerType,true);
 };
 const up=(e:Pointer<SVGSVGElement>)=>{
  const tracked=pointers.current.has(e.pointerId),wasBlocked=blocked.current;
  if(tracked&&pan.current){const g=pan.current;useProject.getState().setPan(g.pan.x+e.clientX-g.client.x,g.pan.y+e.clientY-g.client.y);}
  pointers.current.delete(e.pointerId);
  if(!pointers.current.size){if(tracked&&wasBlocked)resumePointer.current={x:e.clientX,y:e.clientY};blocked.current=false;pinch.current=null;pan.current=null;gestureStart.current=null;setPanning(false);}
  if(tracked&&!wasBlocked&&e.button===0)tap(track(e.clientX,e.clientY,e.pointerType),e.pointerType==='touch');
 };
 const restoreGesture=()=>{const initial=gestureStart.current;if(initial){draft.current=initial.sector;setSector(initial.sector);setHover(initial.hover);}};
 const cancelPointer=(e:Pointer<SVGSVGElement>)=>{if(!pointers.current.has(e.pointerId))return;const wasViewport=blocked.current;restoreGesture();pointers.current.delete(e.pointerId);blocked.current=pointers.current.size>0;pinch.current=null;pan.current=null;setPanning(false);if(wasViewport)resumePointer.current={x:e.clientX,y:e.clientY};if(!pointers.current.size)gestureStart.current=null;};
 const contextMenu=(e:{preventDefault:()=>void;stopPropagation:()=>void})=>{e.preventDefault();e.stopPropagation();};
 return <div className="automatic-head-tool" data-auto-head-tool>
  <svg ref={svg} className="automatic-head-field" data-panning={panning} aria-label={t('autoHead.title')} onContextMenu={contextMenu} onPointerDown={down} onPointerMove={move} onPointerLeave={()=>{if(!center&&!pointers.current.size)setHover(null);}} onPointerUp={up} onPointerCancel={cancelPointer}>
   <AutomaticHeadPreview center={center} hover={hover} sector={sector} px={px} panX={panX} panY={panY} matches={!!fit}/>
  </svg>
  {panelHost&&createPortal(<AutomaticHeadPanel center={center} sector={sector} radius={radius} fit={fit} pressure={pressure} failed={failed} units={units} groupLabel={group.label}
   cancel={cancel} finish={finish} editSector={editSector} setPressure={value=>{setPressure(value);setFailed(false);}}
   restart={()=>{setSector(null);draft.current=null;resumePointer.current=null;setCenter(null);setHover(null);setFailed(false);}}/>,panelHost)}
 </div>;
}

/** Drawing and clicking use the same outer endpoint once the radius is fixed. */
export function automaticHeadTarget(center:Pt|null,hover:Pt|null,sector:AutomaticSectorDraft|null):Pt|null{
 if(!center||!sector)return hover;
 const angle=automaticSectorTargetAngle(sector)*Math.PI/180;
 return{x:center.x+sector.radius*Math.cos(angle),y:center.y+sector.radius*Math.sin(angle)};
}

export function AutomaticHeadPreview({center,hover,sector,px,panX,panY,matches}:{center:Pt|null;hover:Pt|null;sector:AutomaticSectorDraft|null;px:number;panX:number;panY:number;matches:boolean}){
 const screen=(p:Pt)=>({x:p.x*px+panX,y:p.y*px+panY});
 const c=center?screen(center):null,target=automaticHeadTarget(center,hover,sector);
 const radius=sector?.radius??(center&&hover?Math.hypot(hover.x-center.x,hover.y-center.y):0),r=radius*px;
 const start=(sector?.start??0)*Math.PI/180,arc=sector?.arc??0;
 const end=target?screen(target):null;
 const pathEnd=(sector?sector.start+sector.arc:0)*Math.PI/180;
 const color=!center||matches?'#0f9f82':'#dc2626';
 const path=c&&sector&&arc>0&&arc<360?`M${c.x},${c.y} L${c.x+r*Math.cos(start)},${c.y+r*Math.sin(start)} A${r},${r} 0 ${arc>180?1:0} 1 ${c.x+r*Math.cos(pathEnd)},${c.y+r*Math.sin(pathEnd)} Z`:null;
 return <g pointerEvents="none" stroke={color} strokeWidth="1.5" fill="none" data-auto-head-status={matches?'match':'no-match'}>
  {c&&sector&&arc>0&&(path?<path data-auto-head-coverage d={path} fill={`${color}26`}/>:<circle data-auto-head-coverage cx={c.x} cy={c.y} r={r} fill={`${color}26`}/>)}
  {c&&end&&(!sector||arc===0)&&<path data-auto-head-radius d={`M${c.x},${c.y} L${end.x},${end.y}`} strokeDasharray="5 4"/>}
  {c&&<circle cx={c.x} cy={c.y} r={6*headSymbolScale(px)} fill={`${color}33`} strokeWidth={1.25*headSymbolScale(px)}/>}
  {end&&<SprinklerTarget x={end.x} y={end.y} px={px} color={color}/>}
 </g>;
}

export type AutomaticHeadPanelProps={center:Pt|null;sector:RequestedSector|null;radius:number;fit:AutomaticHead|null;pressure:number|null;failed:boolean;units:UnitPrefs;groupLabel:string;
 cancel:()=>void;finish:()=>void;restart:()=>void;setPressure:(value:number|null)=>void;editSector:(patch:Partial<Pick<RequestedSector,'radius'|'arc'>>)=>void};
export function AutomaticHeadPanel({center,sector,radius,fit,pressure,failed,units,groupLabel,cancel,finish,restart,setPressure,editSector}:AutomaticHeadPanelProps){
 const model=fit&&itemById(fit.catalogId),body=fit?.bodyId&&itemById(fit.bodyId);
 const sectorEstimated=!!(fit&&model&&computeFlow(model,{arc:fit.arc,radius:fit.r,pressureBar:fit.designPressure,nozzleId:fit.nozzleId}).sectorEstimated);
 const nozzle=model?.type==='rotor'?model.nozzles.find(n=>n.id===fit?.nozzleId):null;
 const pressureRegulated=!!(fit&&model&&body&&body.id!==model.id&&body.regulatedPressureBar!=null&&pressure!=null&&body.regulatedPressureBar<pressure-1e-7&&fit.designPressure<pressure-1e-7);
 return <section className="automatic-head-panel" aria-label={t('autoHead.title')}
  onClick={e=>e.stopPropagation()} onContextMenu={e=>{e.preventDefault();e.stopPropagation();}} onPointerDown={e=>e.stopPropagation()} onPointerMove={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onTouchMove={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();cancel();}}}>
   <header><strong>{t('autoHead.title')}</strong><button type="button" onClick={cancel} aria-label={t('cancel')}><X size={18}/></button></header>
   <p>{t('autoHead.scope',{group:groupLabel})}</p>
   <p className="automatic-head-cancel-hint">{t('autoHead.cancelHint')}</p>
   <p aria-live="polite">{t(!center?'autoHead.center':!sector?'autoHead.radius':'autoHead.sector')}</p>
   <label>{t('autoHead.pressure')} ({pressureLabel(units.pressure)})<LocalizedNumberInput value={pressure==null?null:fromBar(pressure,units.pressure)} min={0.01} onCommit={v=>setPressure(v==null?null:toBar(v,units.pressure))}/></label>
   {radius>0&&<div className="automatic-head-values">{formatLenU(radius,units.length)}{sector&&sector.arc>0?` · ${formatNumber(sector.arc,0)}°`:null}</div>}
   {center&&!sector&&<p>{t('autoHead.radiusPreview')}</p>}
   {sector&&<div className="automatic-head-inputs">
    <label>{t('radius')} ({lenLabel(units.length)})<LocalizedNumberInput value={fromMeters(sector.radius,units.length)} min={.001} onCommit={v=>{if(v!=null)editSector({radius:toMetersLen(v,units.length)});}}/></label>
    <label>{t('sector')} (°)<LocalizedNumberInput value={sector.arc} min={1} max={360} digits={0} onCommit={v=>{if(v!=null)editSector({arc:v});}}/></label>
   </div>}
   {radius>0&&<div className="automatic-head-result" data-match={!!fit} role="status" aria-atomic="true">{pressure==null?t('autoHead.needPressure'):fit&&model?<>
    <div className="automatic-head-result-model">{t('headTab')}: <bdi>{catalogName(model)}{nozzle?` · ${nozzle.name}`:''}</bdi></div>
    {body&&body.id!==model.id&&<div>{t('body')}: <bdi>{catalogName(body)}</bdi></div>}
    <div>{t(catalogPressureLabel(model))}: <bdi>{formatPressureU(fit.designPressure,units.pressure)}</bdi></div>
   </>:t('autoHead.noMatch')}</div>}
   {pressureRegulated&&body&&<p role="note" data-auto-head-regulated>{t('autoHead.regulatedPressure',{body:`\u2068${catalogName(body)}\u2069`})}</p>}
   {sectorEstimated&&<p role="note">{t('flowSectorEstimate')}</p>}
   {fit?.needsReview&&<p role="note">{t('autoHead.flowUnknown')}</p>}
   {failed&&(!sector||fit)&&<p role="alert">{t(sector?'autoHead.edgeRequired':'autoHead.radius')}</p>}
   <footer>{center&&<button type="button" onClick={restart}><Undo2 size={16}/>{t('autoHead.restart')}</button>}{sector&&<><button type="button" onClick={()=>editSector({arc:360})}>360°</button><button type="button" disabled={!fit||sector.arc<=0} onClick={finish}><Check size={16}/>{t('autoHead.place')}</button></>}</footer>
  </section>;
}
