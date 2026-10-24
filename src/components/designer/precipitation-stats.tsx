import type {DisplayPrecipitation} from '@/lib/precipitation-display';
import {runTimeMin} from '@/lib/flow';
import {formatDepth,formatPrecipitation} from '@/lib/units';
import {formatNumber,tr} from '@/lib/i18n';
import {useProject} from '@/lib/project-store';

/** The library and placed-head inspector use the same application basis. */
export function PrecipitationStats({value,targetMm}:{value:DisplayPrecipitation;targetMm:number}) {
  const units=useProject(s=>s.units),locale=useProject(s=>s.locale);
  const t=(key:string,vars?:Record<string,string|number>)=>tr(locale,key,vars);
  const label=t(value.basis==='single'?'precipSingle':value.basis==='strip'?'precipStrip':value.basis==='strip-layout'?'precipStripSquare':value.basis==='flow-only'?'flow':'precipSquare');
  const minutes=value.rate==null?null:runTimeMin(targetMm,value.rate);
  const approximate=value.calculated?'≈ ':'';
  const stat=(key:string,text:string)=><div className="info-stat rounded-sm bg-bg-2 px-1.5 py-1 sm:rounded-md sm:px-2.5 sm:py-2">
    <dt className="text-[0.5rem] font-semibold text-faint uppercase sm:text-[0.625rem]">{key}</dt>
    <dd className="mt-0.5 text-[0.6875rem] font-medium leading-tight tabular sm:text-sm">{text}</dd>
  </div>;
  return <>
    {value.basis!=='flow-only'&&<>
      {stat(label,value.rate==null?t('noData'):approximate+formatPrecipitation(value.rate,units))}
      {(value.basis==='square'||value.basis==='strip-layout')&&stat(t(value.basis==='strip-layout'?'precipStripTriangle':'precipTriangle'),value.triangle==null?t('noData'):approximate+formatPrecipitation(value.triangle,units))}
      {stat(`${t('runTimeDepth',{depth:formatDepth(targetMm,units)})} · ${label}`,minutes==null?t('noData'):`${approximate}${formatNumber(minutes,1)} ${t('min')}`)}
    </>}
    {(value.noteKey||value.interpolated)&&<div className="col-span-2 text-xs leading-relaxed text-muted" data-precipitation-note={value.noteKey}>
      <dt className="sr-only">{label}</dt><dd>{value.noteKey&&t(value.noteKey)}{value.interpolated&&` ${t('flowInterpolated')}`}</dd>
    </div>}
  </>;
}
