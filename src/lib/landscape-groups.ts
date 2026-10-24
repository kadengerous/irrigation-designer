import type {CadDrawing,CadPlant} from './cad/types';
import {plantVisualId,plantLayerId,plantLayerVisible,plantLayerLocked} from './plant-visuals';
import {landscapeLayerVisible,landscapeLayerLocked} from './landscape-objects';
export type LandscapeGroupAction='visibility'|'lock'|'delete';
export const plantGroupKey=(p:CadPlant)=>`${p.kind}:${p.catalog?.id??p.catalogId??plantVisualId(p)}`;
export function groupInstances<T>(items:T[],key:(item:T)=>string):T[][]{
 const groups=new Map<string,T[]>();
 for(const item of items){const k=key(item);if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(item);}
 return [...groups.values()];
}
/** Map keys are authoritative: old snap hits could overwrite an instance's id. */
export function repairLandscapeIdentity(d:CadDrawing):CadDrawing {
 let changed=false;
 const repair=<T extends {id:string}>(items:Record<string,T>|undefined)=>Object.fromEntries(Object.entries(items??{}).map(([id,item])=>{
  if(item.id===id)return [id,item];changed=true;return [id,{...item,id}];
 }));
 const plants=repair(d.plants),landscapeObjects=repair(d.landscapeObjects);
 return changed?{...d,plants,landscapeObjects}:d;
}
export const plantGroups=(d:CadDrawing)=>groupInstances(Object.entries(d.plants??{}).map(([id,p])=>p.id===id?p:{...p,id}),plantGroupKey);
export const objectGroups=(d:CadDrawing)=>groupInstances(Object.entries(d.landscapeObjects??{}).map(([id,o])=>o.id===id?o:{...o,id}),o=>`${o.category}:${o.catalogId}`);
/** Change a derived card atomically, preserving independent instances and inherited flags. */
export function changeLandscapeGroup(d:CadDrawing,kind:'plant'|'object',id:string,action:LandscapeGroupAction):CadDrawing{
 d=repairLandscapeIdentity(d);
 if(kind==='plant'){
  const group=plantGroups(d).find(g=>g.some(p=>p.id===id));if(!group)return d;
  const ids=new Set(group.map(p=>p.id)),locked=group.some(p=>p.locked||plantLayerLocked(d,p.kind));
  if(action==='delete'&&locked)return d;
  const visible=group.some(p=>plantLayerVisible(d,p.kind,p)),plants={...d.plants},layers={...d.layers};
  if(action==='visibility'||action==='lock'){
   for(const p of Object.values(plants))plants[p.id]={...p,hidden:!plantLayerVisible(d,p.kind,p),locked:!!p.locked||plantLayerLocked(d,p.kind)};
   layers.plants={...layers.plants,visible:true,locked:false};
   for(const p of Object.values(plants)){const k=plantLayerId(p.kind);layers[k]={...layers[k],visible:true,locked:false};}
  }
  for(const key of ids){if(action==='delete')delete plants[key];else plants[key]={...plants[key],...(action==='visibility'?{hidden:visible}:{locked:!locked})};}
  return {...d,plants,layers:layers as CadDrawing['layers']};
 }
 const group=objectGroups(d).find(g=>g.some(o=>o.id===id));if(!group)return d;
 const locked=group.some(o=>o.locked||landscapeLayerLocked(d,o.category));if(action==='delete'&&locked)return d;
 const visible=group.some(o=>landscapeLayerVisible(d,o.category,o)),landscapeObjects={...d.landscapeObjects},layers={...d.layers};
 if(action==='visibility'||action==='lock')for(const o of Object.values(landscapeObjects)){
  landscapeObjects[o.id]={...o,hidden:!landscapeLayerVisible(d,o.category,o),locked:!!o.locked||landscapeLayerLocked(d,o.category)};
  layers[o.category]={...layers[o.category],visible:true,locked:false};
 }
 for(const o of group){if(action==='delete')delete landscapeObjects[o.id];else landscapeObjects[o.id]={...landscapeObjects[o.id],...(action==='visibility'?{hidden:visible}:{locked:!locked})};}
 return {...d,landscapeObjects,layers:layers as CadDrawing['layers']};
}
