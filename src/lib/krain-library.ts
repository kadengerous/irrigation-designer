import type {CatalogItem} from './equipment-catalog';

/** Keep product families and fixed strip patterns in one destination each. */
export const KRAIN_CATEGORIES=[
  {id:'rotary',label:'Rotary Nozzles'},
  {id:'kvf',label:'KVF Nozzles'},
  {id:'kv',label:'KV Nozzles'},
  {id:'fixed',label:'Fixed Pattern Nozzles'},
  {id:'strips',label:'Strip Nozzles'},
  {id:'rotor',label:'Rotors'},
  {id:'bubbler',label:'Bubblers'},
] as const;

export function krainLibraryCategory(item:CatalogItem):string|null {
  if(item.manufacturerId!=='k-rain')return null;
  if(item.type==='body'||item.type==='rotor'||item.type==='bubbler')return item.type;
  if(['mp','mp800','strip'].includes(item.family))return 'rotary';
  if(item.strip)return 'strips';
  if(item.series==='KVF')return 'kvf';
  if(item.series==='KV')return 'kv';
  if(item.series==='Fixed Pattern Nozzles')return 'fixed';
  return null;
}
