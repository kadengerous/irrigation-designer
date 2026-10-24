import {useProject} from '@/lib/project-store';
import {plantImageSrc,plantLayerVisible,plantLayerLocked} from '@/lib/plant-visuals';
import {plantName} from '@/lib/catalog-localization';
import {PLANT_CATEGORIES} from '@/lib/landscape-types';
import {text as t} from '@/lib/i18n';
import type {CadDrawing} from '@/lib/cad/types';
import {LandscapeLayerCard} from './landscape-layer-card';
import {plantGroups} from '@/lib/landscape-groups';
import {PlantThumbnail} from './landscape-thumbnail';
export function PlantLayers({drawing:d}:{drawing:CadDrawing}){
 const selected=useProject(s=>s.selectedPlantId);
 return <>{plantGroups(d).map(group=>{
 const p=group.find(p=>p.id===selected)??group[0];
 return <LandscapeLayerCard key={`${p.kind}:${p.catalog?.id??p.catalogId??plantImageSrc(p)}`} count={group.length} category={p.kind} name={`${PLANT_CATEGORIES[p.kind]}: ${p.catalog?plantName(p.catalog):t('plant')}`} image={plantImageSrc(p)} thumbnail={<PlantThumbnail plant={p} alt=""/>} selected={group.some(p=>selected===p.id)} visible={group.some(p=>plantLayerVisible(d,p.kind,p))} locked={group.some(p=>plantLayerLocked(d,p.kind)||!!p.locked)}
 onSelect={()=>useProject.getState().selectPlant(p.id)}
 onVisibility={()=>useProject.getState().changeLandscapeGroup('plant',p.id,'visibility')}
 onLock={()=>useProject.getState().changeLandscapeGroup('plant',p.id,'lock')}
 onDuplicate={()=>useProject.getState().duplicatePlant(p.id)}
 onDelete={()=>useProject.getState().changeLandscapeGroup('plant',p.id,'delete')}>
 {group.map((member,index)=><LandscapeLayerCard key={member.id} count={1} category={member.kind} name={`${member.catalog?plantName(member.catalog):t('plant')} · ${index+1}`} image={plantImageSrc(member)} thumbnail={<PlantThumbnail plant={member} alt=""/>} selected={selected===member.id} visible={plantLayerVisible(d,member.kind,member)} locked={plantLayerLocked(d,member.kind)||!!member.locked}
 onSelect={()=>useProject.getState().selectPlant(member.id)}
 onVisibility={()=>useProject.getState().updatePlant(member.id,{hidden:!member.hidden})}
 onLock={()=>useProject.getState().updatePlant(member.id,{locked:!member.locked})}
 onDuplicate={()=>useProject.getState().duplicatePlant(member.id)}
 onDelete={()=>useProject.getState().removePlant(member.id)}/>)}
 </LandscapeLayerCard>;
 })}</>;
}
