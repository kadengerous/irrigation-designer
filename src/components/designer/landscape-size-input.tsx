import {useEffect,useState} from 'react';
import {text as t,formatNumber,parseLocalizedNumber} from '@/lib/i18n';
import {useProject} from '@/lib/project-store';
import {fromMeters,toMetersLen,lenLabel} from '@/lib/units';
export type LandscapeDimension={key:string;label:string;value:number};
/** A single submit commits the complete size, not one axis at a time. */
export function LandscapeSizeInput({dimensions,disabled,proportional=false,onApply}:{dimensions:LandscapeDimension[];disabled:boolean;proportional?:boolean;onApply:(values:Record<string,number>)=>void}){
 const units=useProject(s=>s.units),locale=useProject(s=>s.locale);
 const signature=JSON.stringify(dimensions.map(d=>[d.key,d.value]));
 const initial=()=>Object.fromEntries(dimensions.map(d=>[d.key,formatNumber(fromMeters(d.value,units.length),2)]));
 const [draft,setDraft]=useState<Record<string,string>>(initial);
 useEffect(()=>setDraft(initial()),[signature,units.length,locale]);
 const edit=(key:string,value:string)=>{
  const next={...draft,[key]:value},source=dimensions.find(d=>d.key===key)!,n=toMetersLen(parseLocalizedNumber(value),units.length);
  if(proportional&&Number.isFinite(n)&&n>0)for(const d of dimensions)if(d.key!==key)next[d.key]=formatNumber(fromMeters(d.value*n/source.value,units.length),4);
  setDraft(next);
 };
 const values=Object.fromEntries(dimensions.map(d=>[d.key,toMetersLen(parseLocalizedNumber(draft[d.key]??''),units.length)]));
 const valid=Object.values(values).every(n=>Number.isFinite(n)&&n>=.05&&n<=100);
 return <form className="landscape-size-form" onSubmit={e=>{e.preventDefault();if(!disabled&&valid)onApply(values);}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')setDraft(initial());}}>
 <div className="landscape-size-fields">{dimensions.map(d=><label key={d.key} className="landscape-size-input"><span>{d.label}</span><input name={d.key} aria-label={d.label} aria-invalid={!valid} inputMode="decimal" disabled={disabled} value={draft[d.key]??''} onChange={e=>edit(d.key,e.target.value)}/><span>{lenLabel(units.length)}</span></label>)}</div>
 <button type="submit" className="landscape-apply-action" disabled={disabled||!valid}>{t('apply')}</button>
 </form>;
}
