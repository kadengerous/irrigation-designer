import type {EngineeringElement} from './engineering';
import type {Head} from './project-types';
import type {CadDrawing} from './cad/types';

export type EngineeringFocus={kind:'zone';id:number}|{kind:'head';id:string}|null;
export const ENGINEERING_BACKGROUND={plants:.42,furniture:.85,decoration:.55,materials:.35} as const;
export {zoneColor as engineeringZoneColor} from './project-types';
export const ENGINEERING_NETWORK_COLORS={main:'#087cff',zonePipe:'#00bf32',otherPipe:'#ff7900',dripLine:'#85512c',cable:'#d900ed'} as const;

/** A derived display-only drawing. Never replace the project's saved dimensions. */
export function engineeringPlanDrawing(drawing:CadDrawing):CadDrawing{
 return {...drawing,dims:Object.fromEntries(Object.entries(drawing.dims??{}).filter(([,dim])=>{
  const key=dim.autoKey??(dim.id.startsWith('auto:')?dim.id.slice(5):'');
  return !dim.aHeadId&&!dim.bHeadId&&!key.startsWith('heads:')&&!key.startsWith('irrigation:');
 }))};
}
export function engineeringHeadEmphasis(head:Head,focus:EngineeringFocus){
 const active=focus?.kind==='head'?focus.id===head.id:focus?.kind==='zone'?focus.id===head.zone:false;
 return {active,opacity:focus && !active ? .45 : 1};
}
export function engineeringFocusZone(heads:Head[],focus:EngineeringFocus){
 return focus?.kind==='zone'?focus.id:focus?.kind==='head'?heads.find(h=>h.id===focus.id)?.zone:null;
}

/** Bound networks follow numeric zone order; independent routes retain their
 * relative creation order after the zone routes. Never sort the saved data. */
export function sortEngineeringNetworks(elements:EngineeringElement[]):EngineeringElement[]{
 const zone=(e:EngineeringElement)=>e.kind==='pipe'&&e.auto?.circuit.startsWith('zone:')?Number(e.auto.circuit.slice(5)):Infinity;
 return [...elements].sort((a,b)=>{const za=zone(a),zb=zone(b);return za===zb?0:za-zb;});
}
