import {InspectorCard} from './inspector-card';
import {ZoneGroupActions} from './inspector-group-actions';
import {text as t,type Locale} from '@/lib/i18n';
import type {UnitPrefs} from '@/lib/units';
import {ZoneLayerRow} from './zone-list';
import {ZoneDragProvider,ZoneDropTarget} from './zone-drag';
import {zoneLabel,type Project} from '@/lib/project-types';
import { catalogForHead, itemById} from '@/lib/equipment-catalog';
import {catalogName} from '@/lib/catalog-localization';
import {headSymbolScale} from '@/lib/head-presentation';
import {isHeadVisible} from '@/lib/head-visibility';
import {engineeringHeadEmphasis,engineeringFocusZone,engineeringZoneColor as zoneColor,type EngineeringFocus} from '@/lib/engineering-view';

type Props={project:Project;focus:EngineeringFocus;onFocus:(value:EngineeringFocus)=>void};
export function EngineeringZones({project,focus,onFocus,expanded,onToggle,units,locale}:Props&{expanded:string[];onToggle:(key:string)=>void;units:UnitPrefs;locale:Locale}){
 const related=engineeringFocusZone(project.heads,focus);
 return <InspectorCard id="irrigationZones" className="engineering-group-card" title={t('irrigationZones')} tint="#54ad45" open={expanded.includes('irrigationZones')} onToggle={()=>onToggle('irrigationZones')} actions={<ZoneGroupActions project={project} locale={locale}/>}>
  <ZoneDragProvider><div className="engineering-group-content zone-list"><div className="mobile-layers-list zone-layer-list">
   {!project.zones.length&&<p className="engineering-help">{t('noZones')}</p>}
   {project.zones.map(zone=>{
    const key=`zone:${zone.id}`,active=focus?.kind==='zone'&&focus.id===zone.id;
    return <ZoneDropTarget key={zone.id} id={zone.id}>
     <ZoneLayerRow project={project} zone={zone} open={expanded.includes(key)} active={related===zone.id}
      selectedIds={focus?.kind==='head'?[focus.id]:[]} units={units} locale={locale} readOnly editableHeads
      onToggle={()=>onToggle(key)} onDelete={()=>{}}
      onSelect={()=>onFocus(active?null:{kind:'zone',id:zone.id})}
      onSelectHead={id=>onFocus({kind:'head',id})}/>
    </ZoneDropTarget>;
   })}
  </div></div></ZoneDragProvider>
 </InspectorCard>;
}

/** Sprinklers share the project's visibility flags in both workspaces. */
export function EngineeringSprinklers({project,focus,onFocus,px,selectable}:Props&{px:number;selectable:boolean}){
 return <g data-engineering-sprinklers>
  {project.heads.filter(head=>isHeadVisible(head,project.zones)).map(head=>{
   const {active,opacity}=engineeringHeadEmphasis(head,focus),item=catalogForHead(head),zone=project.zones.find(z=>z.id===head.zone);
   const color=zoneColor(head.zone);
   const symbolScale=headSymbolScale(px),symbolRadius=(active?13:11)*symbolScale;
   return <g key={head.id} data-engineering-head-id={head.id} transform={`translate(${head.x} ${head.y})`} opacity={opacity}
    role="button" tabIndex={selectable?0:-1} aria-pressed={active} aria-label={`${item?catalogName(item):head.catalogId}${zone?' · '+zoneLabel(zone):''}`}
    onKeyDown={e=>{if(selectable&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();onFocus({kind:'head',id:head.id});}}}>
    <circle r={18/px} fill="transparent"/>
    <circle r={symbolRadius/px} fill="white" stroke={color} strokeWidth={(active?3.2:2.6)*symbolScale/px} pointerEvents="none"/>
    <circle r={4*symbolScale/px} fill={color} pointerEvents="none"/>
   </g>;
  })}
 </g>;
}
