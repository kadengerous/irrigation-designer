import type {CatalogItem} from './equipment-catalog';

/** Mutually exclusive product families; rotary strips remain part of R-VAN. */
export const RAIN_BIRD_CATEGORIES = [
  {id:'rvan',label:'R-VAN Rotary Nozzles'},
  {id:'hevan',label:'HE-VAN Spray Nozzles'},
  {id:'van',label:'VAN Spray Nozzles'},
  {id:'u-series',label:'U-Series Spray Nozzles'},
  {id:'mpr',label:'MPR Fixed Nozzles'},
  {id:'strips',label:'Strip Nozzles'},
  {id:'sq',label:'SQ Series Square Nozzles'},
  {id:'rotor',label:'Rotors'},
  {id:'bubbler',label:'Bubblers'},
] as const;

export function rainBirdLibraryCategory(item:CatalogItem):string|null {
  if(item.manufacturerId!=='rain-bird')return null;
  if(item.type==='body'||item.type==='rotor'||item.type==='bubbler')return item.type;
  const model=item.modelId??item.sku;
  if(model.startsWith('R-VAN'))return 'rvan';
  if(model.startsWith('HE-VAN'))return 'hevan';
  if(/^\d+-VAN$/.test(model))return 'van';
  if(model.startsWith('U-'))return 'u-series';
  if(model.startsWith('SQ-'))return 'sq';
  if(item.strip)return 'strips';
  if(item.family==='fixed')return 'mpr';
  return null;
}
