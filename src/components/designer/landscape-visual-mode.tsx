import {useProject} from '@/lib/project-store';
import {tr} from '@/lib/i18n';
import type {LandscapeVisualMode} from '@/lib/landscape-types';

export function LandscapeVisualModeControl({value,onChange,scope='new',disabled=false}:{value:LandscapeVisualMode;onChange:(mode:LandscapeVisualMode)=>void;scope?:'new'|'selected';disabled?:boolean}) {
  const locale=useProject(s=>s.locale),t=(key:string)=>tr(locale,key);
  return <fieldset className="landscape-visual-mode" disabled={disabled}>
    <legend>{t(scope==='selected'?'landscapeSelectedAppearance':'landscapeNewAppearance')}</legend>
    <div>{(['image','vector'] as const).map(mode=><button key={mode} type="button" aria-pressed={value===mode} disabled={disabled} onClick={()=>onChange(mode)}>{t(mode==='image'?'landscapeImages':'landscapeVector')}</button>)}</div>
  </fieldset>;
}
