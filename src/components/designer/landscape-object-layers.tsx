import {useProject} from '@/lib/project-store';
import {landscapeLayerLocked,landscapeLayerVisible,landscapeName,landscapeImageSrc,landscapeCategoryName} from '@/lib/landscape-objects';
import type {CadDrawing} from '@/lib/cad/types';
import {LandscapeLayerCard} from './landscape-layer-card';
import {objectGroups} from '@/lib/landscape-groups';
import {LandscapeObjectThumbnail} from './landscape-thumbnail';
export function LandscapeObjectLayers({drawing:d}:{drawing:CadDrawing}){
 const selected=useProject(s=>s.selectedLandscapeId);
 return <>{objectGroups(d).map(group=>{
 const o=group.find(o=>o.id===selected)??group[0];
 return <LandscapeLayerCard key={`${o.category}:${o.catalogId}`} count={group.length} category={o.category} name={`${landscapeCategoryName(o.category)}: ${landscapeName(o)}`} image={landscapeImageSrc(o)} thumbnail={<LandscapeObjectThumbnail object={o} alt=""/>} selected={group.some(o=>selected===o.id)} visible={group.some(o=>landscapeLayerVisible(d,o.category,o))} locked={group.some(o=>landscapeLayerLocked(d,o.category)||!!o.locked)}
 onSelect={()=>useProject.getState().selectLandscape(o.id)}
 onVisibility={()=>useProject.getState().changeLandscapeGroup('object',o.id,'visibility')}
 onLock={()=>useProject.getState().changeLandscapeGroup('object',o.id,'lock')}
 onDuplicate={()=>useProject.getState().duplicateLandscape(o.id)}
 onDelete={()=>useProject.getState().changeLandscapeGroup('object',o.id,'delete')}>
 {group.map((member,index)=><LandscapeLayerCard key={member.id} count={1} category={member.category} name={`${landscapeName(member)} · ${index+1}`} image={landscapeImageSrc(member)} thumbnail={<LandscapeObjectThumbnail object={member} alt=""/>} selected={selected===member.id} visible={landscapeLayerVisible(d,member.category,member)} locked={landscapeLayerLocked(d,member.category)||!!member.locked}
 onSelect={()=>useProject.getState().selectLandscape(member.id)}
 onVisibility={()=>useProject.getState().updateLandscape(member.id,{hidden:!member.hidden})}
 onLock={()=>useProject.getState().updateLandscape(member.id,{locked:!member.locked})}
 onDuplicate={()=>useProject.getState().duplicateLandscape(member.id)}
 onDelete={()=>useProject.getState().removeLandscape(member.id)}/>)}
 </LandscapeLayerCard>;
 })}</>;
}
