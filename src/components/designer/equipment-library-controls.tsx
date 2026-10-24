import type {CatalogItem} from '@/lib/equipment-catalog';
import {useProject} from '@/lib/project-store';
import {MANUFACTURERS} from '@/lib/equipment-model';
import {text as t} from '@/lib/i18n';
import type {EquipmentGroup} from '@/lib/equipment-groups';
import type {HunterLibrarySubgroup} from '@/lib/hunter-library';
import {catalogColor} from '@/lib/catalog-localization';
import {automaticCandidateSupported} from '@/lib/automatic-head';
import './equipment-library.css';
export function EquipmentLibraryControls(){
 const filters=useProject(s=>s.equipmentFilters),update=useProject(s=>s.setEquipmentFilters);
 useProject(s=>s.locale);
 return <div className="equipment-library-controls equipment-manufacturer-controls" data-manufacturer={filters.manufacturerId}>
  <label>{t('equipment.manufacturer')}<select value={filters.manufacturerId} onChange={e=>update({manufacturerId:e.target.value as typeof filters.manufacturerId})}>
   {MANUFACTURERS.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
  </select></label>

 </div>;
}

export function EquipmentSeriesSelector({value,onChange,series}:{value:string;onChange:(series:string)=>void;series:readonly string[]}){
 useProject(s=>s.locale);
 if(series.length<2)return null;
 return <div className="equipment-library-controls equipment-series-controls">
  <label>{t('series')}<select value={value} onChange={event=>onChange(event.target.value)}>
   {series.map(id=><option key={id} value={id}>{id}</option>)}
  </select></label>
 </div>;
}

export function EquipmentGroupNote({group,catalog}:{group:EquipmentGroup;catalog:CatalogItem[]}){
 useProject(s=>s.locale);
 if(!catalog.some(automaticCandidateSupported))return null;
 const key={
  matched:'equipment.groupMatched',configured:'equipment.groupConfigured',layout:'equipment.groupLayout',localized:'equipment.groupLocalized',
 }[group.mode];
 return <div className="equipment-group-note"><strong><bdi dir="ltr">{group.label}</bdi></strong><p>{t(key)}</p>
  {group.mode==='matched'&&catalog.some(item=>!!item.strip)&&<p>{t('equipment.groupLayout')}</p>}
 </div>;
}

export function EquipmentSubgroupButtons({groups,value,onChange}:{groups:HunterLibrarySubgroup[];value:string;onChange:(id:string)=>void}){
 useProject(s=>s.locale);
 if(groups.length<2)return null;
 return <div className="equipment-subgroups" role="group" aria-label={t('series')} data-no-tooltip>
  {groups.map(group=>{
   const label=group.colorName?`${group.label} · ${catalogColor(group.colorName)}`:group.label;
   return <button key={group.id} type="button" aria-pressed={value===group.id} aria-label={label} onClick={()=>onChange(group.id)}>
    {group.color&&<span className="equipment-subgroup-color" aria-hidden="true" style={{backgroundColor:group.color}}/>}
    <bdi dir="ltr">{group.label}</bdi>
   </button>;
  })}
 </div>;
}

export function EquipmentDataStatus({item}:{item:CatalogItem}){
 useProject(s=>s.locale);
 return item.verificationStatus==='Needs Review'?<span className="equipment-data-status" title={t(item.performanceReview==='per-row'?'equipment.rowReviewHint':'equipment.sourceConflictHint')}>{t('equipment.sourceConflict')}</span>:null;
}
