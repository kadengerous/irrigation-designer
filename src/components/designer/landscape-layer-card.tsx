import {useState,useEffect,useId,type ReactNode} from 'react';
import {Eye,Lock,Unlock,Trash2,Copy,ChevronDown,ChevronUp,Box} from 'lucide-react';
import {text as t} from '@/lib/i18n';
import {useProject} from '@/lib/project-store';
import {LayerDeleteDialog} from './layer-delete-dialog';
export function LandscapeLayerCard({category,name,image,thumbnail,count,selected,visible,locked,onSelect,onVisibility,onLock,onDelete,onDuplicate,children}:{category:string;name:string;image:string;thumbnail?:ReactNode;count:number;selected:boolean;visible:boolean;locked:boolean;onSelect:()=>void;onVisibility:()=>void;onLock:()=>void;onDelete:()=>void;onDuplicate:()=>void;children?:ReactNode}){
 const [imageFailed,setImageFailed]=useState(false);
 useEffect(()=>setImageFailed(false),[image]);
 const [deleting,setDeleting]=useState(false),locale=useProject(s=>s.locale);
 const [expanded,setExpanded]=useState(false),detailsId=useId(),group=count>1;
 useEffect(()=>{setDeleting(false);if(!group)setExpanded(false);},[group]);
 return <div className="landscape-layer-entry"><div className="mobile-layer landscape-layer-card" data-category={category} data-selected={selected} data-group={group}>
 <button type="button" className="landscape-layer-select" aria-label={name} title={name} aria-pressed={selected} onClick={onSelect}>{thumbnail??(imageFailed?<Box aria-hidden="true"/>:<img src={image} alt="" loading="lazy" onError={()=>setImageFailed(true)}/>)}<span className="landscape-layer-count">{count} {t('pcs')}</span></button>
 <button type="button" title={t(visible?'hideLayer':'showLayer')} aria-label={t(visible?'hideLayer':'showLayer')} onClick={onVisibility}><span className="layer-eye" data-hidden={!visible}><Eye/></span></button>
 <button type="button" title={t(locked?'unlockLayer':'lockLayer')} aria-label={t(locked?'unlockLayer':'lockLayer')} aria-pressed={locked} onClick={onLock}>{locked?<Lock/>:<Unlock/>}</button>
 <button type="button" title={t('drawCopy')} aria-label={t('drawCopy')} disabled={locked} onClick={onDuplicate}><Copy/></button>
 {group&&<button type="button" title={t(expanded?'layerDetailsClose':'details')} aria-label={t(expanded?'layerDetailsClose':'details')} aria-expanded={expanded} aria-controls={detailsId} onClick={()=>setExpanded(v=>!v)}>{expanded?<ChevronUp/>:<ChevronDown/>}</button>}<button type="button" className="text-danger" title={t('delete')} aria-label={t('delete')} disabled={locked} onClick={()=>setDeleting(true)}><Trash2/></button>
 </div>{group&&expanded&&<div id={detailsId} className="landscape-group-members" role="group" aria-label={name}>{children}</div>}
 {deleting&&<LayerDeleteDialog name={`${name} — ${count} ${t('pcs')}`} locale={locale} disabled={locked} onCancel={()=>setDeleting(false)} onDelete={()=>{onDelete();setDeleting(false);}}/>}</div>;
}
