import type {CatalogItem} from './equipment-catalog';

/** Product families in the current Toro catalog; every model has one destination. */
export const TORO_CATEGORIES=[
  {id:'precision-plus',label:'Precision+ Spray Nozzles'},
  {id:'precision',label:'Precision Spray Nozzles'},
  {id:'strips',label:'Strip Nozzles'},
  {id:'rotor',label:'T5 RapidSet Rotors'},
] as const;

/** PSN and PSNT are the two thread variants of each nominal throw series. */
export const TORO_PRECISION_PLUS_SERIES=['PSN5','PSN8','PSN10','PSN12','PSN15'] as const;
export type ToroPrecisionPlusSeries=typeof TORO_PRECISION_PLUS_SERIES[number];
export const TORO_PRECISION_SERIES=['O-5','O-8','O-10','O-12','O-15'] as const;
export type ToroSprayCategory='precision-plus'|'precision';
export type ToroSpraySeries=ToroPrecisionPlusSeries|typeof TORO_PRECISION_SERIES[number];
export function toroPrecisionPlusSeries(item:CatalogItem):ToroPrecisionPlusSeries|null {
  if(toroLibraryCategory(item)!=='precision-plus')return null;
  const match=/^PSN(5|8|10|12|15)T?-/.exec(item.modelId??item.sku);
  return match?`PSN${match[1]}` as ToroPrecisionPlusSeries:null;
}

/** Keep both thread variants together; strip patterns retain their own tab. */
export function toroSpraySeries(item:CatalogItem):ToroSpraySeries|null {
  const category=toroLibraryCategory(item);
  if(category==='precision-plus')return toroPrecisionPlusSeries(item);
  if(category!=='precision')return null;
  const match=/^O-(?:T-)?(5|8|10|12|15)-/.exec(item.modelId??item.sku);
  return match?`O-${match[1]}` as ToroSpraySeries:null;
}

export function toroLibraryCategory(item:CatalogItem):string|null {
  if(item.manufacturerId!=='toro')return null;
  if(item.type==='body'||item.type==='rotor')return item.type;
  if(item.strip)return 'strips';
  const model=item.modelId??item.sku;
  if(model.startsWith('PSN'))return 'precision-plus';
  if(model.startsWith('O-'))return 'precision';
  return null;
}
