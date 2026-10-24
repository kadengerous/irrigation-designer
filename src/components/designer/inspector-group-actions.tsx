import {Eye,Lock,Unlock} from 'lucide-react';
import {tr,type Locale} from '@/lib/i18n';
import {useProject} from '@/lib/project-store';
import {emptyEngineering,type EngineeringCategory} from '@/lib/engineering';
import type {Project} from '@/lib/project-types';

/** Actions are siblings of the accordion trigger, so visibility and locking
 * never toggle its open state. Labels identify the group in every language. */
export function InspectorGroupActions({name,hidden,locked,disabled=false,onVisibility,onLock,locale}: {
 name:string;hidden:boolean;locked:boolean;disabled?:boolean;onVisibility:()=>void;onLock:()=>void;locale:Locale;
}){
 const visibility=`${tr(locale,hidden?'show':'hide')}: ${name}`,lock=`${tr(locale,locked?'referenceUnlockAction':'referenceLockAction')}: ${name}`;
 return <span className="inspector-group-actions" role="group" aria-label={name}>
  <button type="button" className="inspector-header-action" data-group-action="hidden" aria-label={visibility} title={visibility} aria-pressed={hidden} disabled={disabled} onClick={event=>{event.stopPropagation();onVisibility();}}><span className="inspector-eye" data-hidden={hidden} aria-hidden="true"><Eye/></span></button>
  <button type="button" className="inspector-header-action" data-group-action="locked" data-locked={locked} aria-label={lock} title={lock} aria-pressed={locked} disabled={disabled} onClick={event=>{event.stopPropagation();onLock();}}>{locked?<Lock aria-hidden="true"/>:<Unlock aria-hidden="true"/>}</button>
 </span>;
}

export function ZoneGroupActions({project,locale,onSelectionClear}: {project:Project;locale:Locale;onSelectionClear?:()=>void}){
 const zones=project.zones,hidden=zones.length>0&&zones.every(zone=>zone.hidden),locked=zones.length>0&&zones.every(zone=>zone.locked);
 const toggle=(flag:'hidden'|'locked')=>{
  const state=useProject.getState();if(!state.project.zones.length)return;
  state.endHeadEdit();
  const current=useProject.getState(),zones=current.project.zones,value=!zones.every(zone=>zone[flag]);
  const affected=new Set(zones.map(zone=>zone.id));
  const selected=flag==='hidden'&&value?current.selectedIds.filter(id=>!current.project.heads.some(head=>head.id===id&&affected.has(head.zone))):current.selectedIds;
  if(selected.length!==current.selectedIds.length)onSelectionClear?.();
  current.patchProject({zones:zones.map(zone=>({...zone,[flag]:value}))});
  if(selected.length!==current.selectedIds.length)useProject.getState().selectHeads(selected);
  if(flag==='locked'&&value&&current.project.heads.some(head=>head.id===current.sectorEditId&&affected.has(head.zone)))useProject.setState({sectorEditId:null});
 };
 return <InspectorGroupActions name={tr(locale,'irrigationZones')} hidden={hidden} locked={locked} disabled={!zones.length} locale={locale} onVisibility={()=>toggle('hidden')} onLock={()=>toggle('locked')}/>;
}

const groupCategories:Record<'equipment'|'networks',EngineeringCategory[]>={equipment:['waterSupply','valves','automation'],networks:['pipelines','electric']};
export function EngineeringGroupActions({group,project,locale}: {group:'equipment'|'networks';project:Project;locale:Locale}){
 const keys=groupCategories[group],categories=project.engineering?.categories??{};
 const toggle=(flag:'hidden'|'locked')=>{
  const state=useProject.getState(),data=state.project.engineering??emptyEngineering(),value=!keys.every(key=>data.categories[key]?.[flag]),categories={...data.categories};
  for(const key of keys)categories[key]={...categories[key],[flag]:value};
  state.commitEngineering({...data,categories});
 };
 return <InspectorGroupActions name={tr(locale,'engineering.'+group)} hidden={keys.every(key=>categories[key]?.hidden)} locked={keys.every(key=>categories[key]?.locked)} locale={locale} onVisibility={()=>toggle('hidden')} onLock={()=>toggle('locked')}/>;
}
