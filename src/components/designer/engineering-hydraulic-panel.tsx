import {useId,useMemo,type ReactNode} from 'react';
import {useProject} from '@/lib/project-store';
import {text as t,formatNumber} from '@/lib/i18n';
import {zoneLabel,type Project} from '@/lib/project-types';
import {emptyEngineering,engineeringKey,type HydraulicSettings} from '@/lib/engineering';
import {calculateEngineering,isConsumer,type HydraulicResult} from '@/lib/engineering-hydraulics';
import {formatFlowU,formatLenU,formatPressureU,precipitationUnit,fromMeters,toMetersLen,fromBar,toBar,lenLabel,pressureLabel} from '@/lib/units';
import {irrigationWaterRecommendations} from '@/lib/irrigation-water-recommendations';
import {LocalizedNumberInput} from './localized-number-input';
import './engineering-operation-panel.css';

export function circuitName(project:Project,circuit:string){
 if(circuit==='main')return t('engineering.main');
 if(circuit==='all')return t('engineering.simultaneous');
 if(circuit==='selected')return t('engineering.selectedSimultaneous');
 if(circuit==='auto')return t('engineering.detectZone');
 if(circuit.startsWith('drip:')){const line=project.engineering?.elements[circuit.slice(5)];return line?.name||`${t('engineering.dripLine')} ${line?.number??''}`;}
 if(circuit.startsWith('zone:')){const zone=project.zones.find(z=>z.id===Number(circuit.slice(5)));return zone?zoneLabel(zone):`${t('zone')} ${circuit.slice(5)}`;}
 const e=project.engineering?.elements[circuit.slice(10)];return e?(e.name||`${t('engineering.'+engineeringKey(e))} ${formatNumber(e.number,0)}`):t('engineering.consumer');
}
export function CircuitSelect({project,value,onChange,automatic=false}:{project:Project;value:string;onChange:(v:string)=>void;automatic?:boolean}){
 return <label>{t('engineering.connectTo')}<select value={value} onChange={e=>onChange(e.target.value)}>
  {automatic&&<option value="auto">{t('engineering.detectZone')}</option>}
  <option value="main">{t('engineering.main')}</option>
  {project.zones.map(z=><option key={z.id} value={`zone:${z.id}`}>{zoneLabel(z)}</option>)}
  {Object.values(project.engineering?.elements??{}).filter(e=>e.kind==='equipment'&&isConsumer(e)&&!e.zoneId).map(e=><option key={e.id} value={`equipment:${e.id}`}>{circuitName(project,`equipment:${e.id}`)}</option>)}
 </select></label>;
}
function patchHydraulics(p:Partial<HydraulicSettings>){const d=useProject.getState().project.engineering??emptyEngineering();useProject.getState().commitEngineering({...d,hydraulics:{...d.hydraulics,...p}});}
function RecommendationShell({title,embedded,kind,children}:{title:string;embedded?:boolean;kind:string;children:ReactNode}){
 return embedded?<div className="engineering-properties recommendation-content" data-recommendation={kind}>{children}</div>:<section className="engineering-hydraulics engineering-properties" aria-label={title} data-recommendation={kind}><h3>{title}</h3>{children}</section>;
}
export function HydraulicPanel({project,result:provided,embedded=false}:{project:Project;result?:HydraulicResult;embedded?:boolean}){
 const units=useProject(s=>s.units),settings=project.engineering?.hydraulics??{},result=useMemo(()=>provided??calculateEngineering(project),[provided,project]);
 const detailGroup=useId();
 const demand=useMemo(()=>irrigationWaterRecommendations(project),[project]),hasRoutes=Object.values(project.engineering?.elements??{}).some(e=>e.kind==='pipe');
 return <RecommendationShell title={t('engineering.pumpRecommendation')} embedded={embedded} kind="pump">
  {!demand.zones.length?<p className="engineering-help">{t('engineering.recommendationEmpty')}</p>:!result.ready&&<div className="engineering-pump-result" data-pump-basis="emitters">
   <strong>{t('engineering.pumpDemand')}: {demand.flowLpm!=null?formatFlowU(demand.flowLpm,units.flow):t('noData')}</strong>
   <strong>{t('engineering.emitterPressure')}: {demand.pressureBar!=null?formatPressureU(demand.pressureBar,units.pressure):t('noData')}</strong>
   <p className="engineering-help">{t('engineering.pumpPending')}</p>
  </div>}
  <p className="engineering-help">{t('engineering.autoSourceHint')}</p>
  <label>{t('engineering.operation')}<select data-pump-operation value={settings.operation??'sequential'} onChange={e=>patchHydraulics({operation:e.target.value as HydraulicSettings['operation']})}><option value="sequential">{t('engineering.sequential')}</option><option value="simultaneous">{t('engineering.simultaneous')}</option><option value="selected">{t('engineering.selectedSimultaneous')}</option></select></label>
  {settings.operation==='selected'&&<fieldset className="engineering-operation-zones">
   <legend>{t('engineering.selectConcurrentZones')}</legend>
   <p className="engineering-help">{t('engineering.selectedZonesHint')}</p>
   {project.zones.map(zone=><label className="pump-zone-choice" key={zone.id}><input type="checkbox" data-pump-zone={zone.id} checked={settings.simultaneousZoneIds?.includes(zone.id)??false} onChange={e=>{const current=useProject.getState().project,valid=new Set(current.zones.map(z=>z.id)),ids=new Set((current.engineering?.hydraulics?.simultaneousZoneIds??[]).filter(id=>valid.has(id)));if(e.target.checked)ids.add(zone.id);else ids.delete(zone.id);patchHydraulics({simultaneousZoneIds:[...ids]});}}/><span>{zoneLabel(zone)}</span></label>)}
   {!demand.selectionValid&&<p className="engineering-help" role="status">{t('engineering.selectZones')}</p>}
  </fieldset>}
  <details name={detailGroup} open={hasRoutes&&!result.ready}>
   <summary>{t('engineering.calculationInputs')}</summary>
   <p className="engineering-help">{t('engineering.lossHint')}</p>
   <label>{t('engineering.staticLift')}<span className="engineering-number"><LocalizedNumberInput value={settings.staticLiftM==null?null:fromMeters(settings.staticLiftM,units.length)} onCommit={v=>patchHydraulics({staticLiftM:v==null?undefined:toMetersLen(v,units.length)})}/><span>{lenLabel(units.length)}</span></span></label>
   <label>{t('engineering.additionalLoss')}<span className="engineering-number"><LocalizedNumberInput min={0} value={settings.additionalLossBar==null?null:fromBar(settings.additionalLossBar,units.pressure)} onCommit={v=>patchHydraulics({additionalLossBar:v==null?undefined:toBar(v,units.pressure)})}/><span>{pressureLabel(units.pressure)}</span></span></label>
   <label>{t('engineering.inletPressure')}<span className="engineering-number"><LocalizedNumberInput min={0} value={settings.inletPressureBar==null?null:fromBar(settings.inletPressureBar,units.pressure)} onCommit={v=>patchHydraulics({inletPressureBar:v==null?undefined:toBar(v,units.pressure)})}/><span>{pressureLabel(units.pressure)}</span></span></label>
   <p className="engineering-help">{t('engineering.pipeBasis',{velocity:`${formatNumber(fromMeters(1.5,units.length),2)} ${lenLabel(units.length)}/s`})}</p>
   <p className="engineering-help">{t('engineering.pipeFlowReserve')}</p>
  </details>
  {hasRoutes&&<><p>{t('engineering.connected')}: {formatNumber(result.connected.length,0)} / {formatNumber(result.connected.length+result.unconnected.length,0)}</p>
   {result.issues.some(key=>key!=='zoneSelection')&&<ul className="engineering-calculation-issues">{result.issues.filter(key=>key!=='zoneSelection').map(key=><li key={key}>{t('engineering.hydroIssue.'+key)}</li>)}</ul>}</>}
  {result.ready&&<div className="engineering-pump-result" role="status" data-pump-basis="hydraulic">
   <strong>Q ≥ {formatFlowU(result.flow!,units.flow)}</strong><strong>H ≥ {formatLenU(result.headM!,units.length)}</strong>
   <p className="engineering-help">{t('engineering.pumpCurve')}</p>
  </div>}
  {(result.estimated||demand.estimatedFlow)&&<p className="engineering-help">{t('engineering.estimatedFlow')}</p>}
  {result.duties.length>0&&<details name={detailGroup}><summary>{t('engineering.zoneDuties')}</summary><div className="engineering-duty-scroll"><table><thead><tr><th>{t('zone')}</th><th>Q</th><th>H</th></tr></thead><tbody>{result.duties.map(d=><tr key={d.circuit}><td>{circuitName(project,d.circuit)}</td><td>{d.flow!=null?formatFlowU(d.flow,units.flow):'—'}</td><td>{result.ready&&d.headM!=null?formatLenU(d.headM,units.length):'—'}</td></tr>)}</tbody></table></div></details>}
 </RecommendationShell>;
}

export function TankRecommendationPanel({project,embedded=false}:{project:Project;embedded?:boolean}){
 const units=useProject(s=>s.units),value=useMemo(()=>irrigationWaterRecommendations(project),[project]),depthUnit=precipitationUnit(units),gallons=units.pipe==='in';
 const volume=(litres:number,minimum=false)=>{const amount=litres/(gallons?3.785411784:1),digits=minimum?(gallons?1:0):amount<10?2:1,factor=10**digits;return `${formatNumber(minimum?Math.ceil(amount*factor)/factor:amount,digits)} ${t(gallons?'volumeGal':'volumeL')}`;};
 const patchDepth=(v:number|null)=>{if(v==null)return;const current=useProject.getState().project;useProject.getState().patchProject({meta:{...current.meta,targetMm:v*(depthUnit==='in'?25.4:1)}});};
 const needsTime=value.zones.some(z=>z.manualRuntime);
 return <RecommendationShell title={t('engineering.tankRecommendation')} embedded={embedded} kind="tank">
  <p className="engineering-help">{t('engineering.tankCycleHint')}</p>
  <label>{t('engineering.tankDepth')}<span className="engineering-number"><LocalizedNumberInput data-tank-input="depth" value={value.targetMm==null?null:value.targetMm/(depthUnit==='in'?25.4:1)} min={.001} onCommit={patchDepth}/><span>{lenLabel(depthUnit)}</span></span></label>
  <label>{t('engineering.tankReserve')}<span className="engineering-number"><LocalizedNumberInput data-tank-input="reserve" value={value.reservePct} min={0} max={100} onCommit={v=>patchHydraulics({tankReservePct:v??undefined})}/><span>%</span></span></label>
  {needsTime&&<><label>{t('engineering.tankRuntime')}<span className="engineering-number"><LocalizedNumberInput data-tank-input="runtime" value={value.fallbackRuntimeMin} min={.01} onCommit={v=>patchHydraulics({tankRuntimeMin:v??undefined})}/><span>{t('min')}</span></span></label><p className="engineering-help">{t('engineering.tankRuntimeHint')}</p></>}
  {value.zones.some(z=>!z.manualRuntime)&&<p className="engineering-help">{t('engineering.tankRateHint')}</p>}
  {value.estimatedCycleFlow&&<p className="engineering-help">{t('engineering.estimatedFlow')}</p>}
  {!value.zones.length?<p className="engineering-help">{t('engineering.recommendationEmpty')}</p>:value.capacityL==null?<p className="engineering-help" role="status">{t('engineering.tankIncomplete')}</p>:<div className="engineering-pump-result" role="status" data-tank-result="complete">
   <span>{t('engineering.tankCycleVolume')}: {volume(value.cycleVolumeL!)}</span>
   <strong>{t('engineering.tankCapacity')}: ≥ {volume(value.capacityL,true)}</strong>
  </div>}
  {value.zones.length>0&&<details><summary>{t('engineering.tankByZone')}</summary><div className="engineering-duty-scroll"><table><thead><tr><th>{t('zone')}</th><th>{t('engineering.tankTime')}</th><th>{t('engineering.volume')}</th></tr></thead><tbody>{value.zones.map(z=><tr key={z.circuit} data-runtime-basis={z.manualRuntime?'manual':'reference'}><td>{circuitName(project,z.circuit)}</td><td>{z.runtimeMin==null?'—':`${formatNumber(z.runtimeMin,1)} ${t('min')}`}<small>{t(z.manualRuntime?'engineering.tankRuntimeManual':'engineering.tankRuntimeReference')}</small></td><td>{z.volumeL==null?'—':volume(z.volumeL)}</td></tr>)}</tbody></table></div></details>}
 </RecommendationShell>;
}
