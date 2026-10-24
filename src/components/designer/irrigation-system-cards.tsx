import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useProject} from '@/lib/project-store';
import {tr} from '@/lib/i18n';
import {InspectorCard} from './inspector-card';
import {ZoneGroupActions} from './inspector-group-actions';
import {HydraulicPanel,TankRecommendationPanel} from './engineering-hydraulic-panel';
import {ZoneList} from './zone-list';

type Section='selection'|'zones'|'pump'|'tank'|null;
/** The same recommendations and one-open-card behaviour on phone and desktop. */
export function IrrigationSystemCards({selection,showZones=true,initialSection}: {
 selection?:{key:string;title:ReactNode;content:ReactNode};showZones?:boolean;initialSection?:Section;
}){
 const project=useProject(s=>s.project),locale=useProject(s=>s.locale);
 const headSelection=useProject(s=>s.selectedIds),selectionEvent=selection?.key.startsWith('head:')?headSelection:null;
 const suppressedSelectionOpen=useRef<string|null>(null);
 const [open,setOpen]=useState<Section>(initialSection??(selection?'selection':showZones?'zones':null));
 useEffect(()=>{if(suppressedSelectionOpen.current===project.id){suppressedSelectionOpen.current=null;setOpen(current=>current==='selection'&&!selection?null:current);return;}suppressedSelectionOpen.current=null;setOpen(initialSection??(selection?'selection':showZones?'zones':null));},[project.id,selection?.key,selectionEvent,showZones,initialSection]);
 const toggle=(key:Section)=>setOpen(current=>current===key?null:key);
 return <div className="irrigation-system-cards p-1.5 sm:p-2" data-irrigation-system-cards>
  {selection&&<InspectorCard id="selection" title={selection.title} open={open==='selection'} onToggle={()=>toggle('selection')} tint="#398ed1">{selection.content}</InspectorCard>}
  {showZones&&<InspectorCard id="irrigationZones" title={tr(locale,'irrigationZones')} open={open==='zones'} onToggle={()=>toggle('zones')} tint="#54ad45" actions={<ZoneGroupActions project={project} locale={locale} onSelectionClear={()=>{if(selection?.key.startsWith('head:'))suppressedSelectionOpen.current=project.id;}}/>}><ZoneList/></InspectorCard>}
  <InspectorCard id="pump" title={tr(locale,'engineering.pumpRecommendation')} open={open==='pump'} onToggle={()=>toggle('pump')} tint="#249a80"><HydraulicPanel project={project} embedded/></InspectorCard>
  <InspectorCard id="tank" title={tr(locale,'engineering.tankRecommendation')} open={open==='tank'} onToggle={()=>toggle('tank')} tint="#428caf"><TankRecommendationPanel project={project} embedded/></InspectorCard>
 </div>;
}
