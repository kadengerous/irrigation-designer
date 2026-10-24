import {Copy,Trash2} from 'lucide-react';
import {useProject} from '@/lib/project-store';
import {text as t} from '@/lib/i18n';
import {plantLayerLocked} from '@/lib/plant-visuals';
import {landscapeLayerLocked,landscapeRecord} from '@/lib/landscape-objects';
import {LandscapeSizeInput} from './landscape-size-input';
import {LandscapeVisualModeControl} from './landscape-visual-mode';
export function LandscapeSelectionActions(){
 const s=useProject(),d=s.project.drawing;
 if(s.workspaceSection!=='landscape'||!d)return null;
 const p=s.selectedPlantId?d.plants?.[s.selectedPlantId]:null,o=s.selectedLandscapeId?d.landscapeObjects?.[s.selectedLandscapeId]:null;
 const pendingPlant=s.pendingCatalogPlant,pendingObject=s.pendingLandscapeObject,obj=pendingObject??o;
 if(!p&&!obj&&!pendingPlant)return null;
 const locked=p?!!p.locked||plantLayerLocked(d,p.kind):obj?!!obj.locked||landscapeLayerLocked(d,obj.category):false;
 const plant=!!(p||pendingPlant),shape=obj?landscapeRecord(obj.catalogId)?.shape:undefined,circle=shape==='circle',square=shape==='square',equalSides=circle||square;
 const dimensions=plant?[{key:'diameter',label:t('plantDiameter'),value:pendingPlant?.diameterM??p!.r*2}]:[
  {key:'length',label:t(circle?'drawDiameter':square?'landscapeSide':'drawLength'),value:obj!.length},
  ...equalSides?[]:[{key:'width',label:t('referenceWidth'),value:obj!.width}]
 ];
 const apply=(values:Record<string,number>)=>{
  if(plant){if(pendingPlant)useProject.setState({pendingCatalogPlant:{...pendingPlant,diameterM:values.diameter}});else s.updatePlant(p!.id,{r:values.diameter/2});return;}
  const patch={length:values.length,width:equalSides?values.length:values.width};
  if(pendingObject)useProject.setState({pendingLandscapeObject:{...pendingObject,...patch}});else if(o)s.updateLandscape(o.id,patch);
 };
 return <div className="desktop-bottom-actions landscape-selection-actions" onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
 <div className="figure-actions-surface"><section className="figure-fusion-actions">
 <LandscapeSizeInput key={pendingPlant?.record.id??pendingObject?.catalogId??p?.id??o?.id} dimensions={dimensions} disabled={locked} proportional={equalSides||!!obj?.keepRatio} onApply={apply}/>
 {(p||o)&&<>
 <LandscapeVisualModeControl scope="selected" value={(p??o)?.visualMode??'image'} disabled={locked} onChange={mode=>p?s.updatePlant(p.id,{visualMode:mode}):s.updateLandscape(o!.id,{visualMode:mode})}/>
 <button type="button" disabled={locked} onClick={()=>p?s.duplicatePlant(p.id):s.duplicateLandscape(o!.id)}><Copy/>{t('drawCopy')}</button>
 <button type="button" className="landscape-delete-action" disabled={locked} onClick={()=>p?s.removePlant(p.id):s.removeLandscape(o!.id)}><Trash2/>{t('delete')}</button>
 </>}
 </section></div></div>;
}
