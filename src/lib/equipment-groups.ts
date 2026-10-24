import {CATALOG,catalogForHead,defaultNozzle,nozzleRange,type CatalogItem} from './equipment-catalog';
import type {ManufacturerId} from './equipment-model';
import type {Head} from './project-types';
import {rainBirdLibraryCategory} from './rain-bird-library';
import {toroSpraySeries} from './toro-library';
import {krainLibraryCategory} from './krain-library';

export type EquipmentGroup={id:string;label:string;mode:'matched'|'configured'|'layout'|'localized';nominalRate?:number;browseBySeries?:boolean};
export type GroupCatalogItem=CatalogItem&{automaticDesignArcOnly?:boolean};
type EquipmentBrand=ManufacturerId|'all'|undefined;
const HUNTER:EquipmentGroup[]=[
 {id:'mp',label:'MP Standard',mode:'matched',nominalRate:10},
 {id:'mp800',label:'MP800',mode:'matched',nominalRate:20},
 {id:'he',label:'Pro High-Efficiency',mode:'matched',nominalRate:40},
 {id:'spray',label:'Pro Adjustable',mode:'configured'},
 {id:'fixed',label:'Pro Fixed',mode:'configured'},
 {id:'prostrip',label:'Strip Nozzles',mode:'layout'},
 {id:'short',label:'Short Radius',mode:'configured'},
 {id:'bubbler',label:'Bubblers & Streams',mode:'localized'},
 {id:'rotor',label:'Rotors',mode:'configured'},
 {id:'golf',label:'Golf Rotors',mode:'configured'},
 {id:'st',label:'ST System',mode:'configured'},
];
const RAIN_BIRD:EquipmentGroup[]=[
 {id:'rvan',label:'Rotary MPR',mode:'matched',nominalRate:15.24},
 {id:'spray-mpr',label:'Spray MPR',mode:'matched',nominalRate:40},
 {id:'van',label:'VAN 4–10',mode:'configured'},
 {id:'sq',label:'SQ Series',mode:'layout'},
 {id:'rotor',label:'Rotors',mode:'configured'},
 {id:'bubbler',label:'Bubblers',mode:'localized'},
];
const TORO:EquipmentGroup[]=[
 {id:'precision',label:'Precision Spray / PSN+',mode:'matched',nominalRate:25.4,browseBySeries:true},
 {id:'rotor',label:'T5 RapidSet',mode:'configured'},
];
const KRAIN:EquipmentGroup[]=[
 {id:'rotary',label:'RN Rotary Nozzles',mode:'matched',nominalRate:12.7},
 {id:'kvf6',label:'KVF6',mode:'configured'},
 {id:'kvf',label:'KVF 8–17',mode:'configured'},
 {id:'kv',label:'KV Nozzles',mode:'configured'},
 {id:'fixed',label:'Fixed Pattern Nozzles',mode:'configured'},
 {id:'strips',label:'Strip Nozzles',mode:'layout'},
 {id:'rotor',label:'Rotors',mode:'configured'},
 {id:'bubbler',label:'Bubblers',mode:'localized'},
];
export function equipmentGroupsFor(brand:EquipmentBrand):EquipmentGroup[]{return brand==='rain-bird'?RAIN_BIRD:brand==='toro'?TORO:brand==='k-rain'?KRAIN:HUNTER;}
export function equipmentGroupSelection(brand:EquipmentBrand,old?:string):string{
 brand=!brand||brand==='all'?'hunter':brand;
 const groups=equipmentGroupsFor(brand);
 if(groups.some(g=>g.id===old))return old!;
 const aliases:Record<string,string>=brand==='hunter'?{strip:'mp',rotary:'mp',strips:'prostrip',specialty:'prostrip',stream:'bubbler'}:
 brand==='rain-bird'?{hevan:'spray-mpr',he:'spray-mpr','u-series':'spray-mpr',mpr:'spray-mpr',strips:'spray-mpr',prostrip:'spray-mpr',spray:'spray-mpr',fixed:'spray-mpr',short:'spray-mpr',mp:'rvan',mp800:'rvan',strip:'rvan',rotary:'rvan',specialty:'sq',golf:'rotor',st:'rotor',stream:'bubbler'}:
 brand==='toro'?{'precision-plus':'precision',strips:'precision',specialty:'precision',spray:'precision',fixed:'precision',prostrip:'precision',strip:'precision',golf:'rotor',st:'rotor'}:
 {mp:'rotary',mp800:'rotary',strip:'rotary',spray:'kvf',he:'kvf',short:'fixed',prostrip:'strips',specialty:'strips',rvan:'rotary',hevan:'kvf',van:'kvf','u-series':'fixed',mpr:'fixed',sq:'strips','precision-plus':'fixed',precision:'fixed',golf:'rotor',st:'rotor'};
 return aliases[old??'']??groups[0]!.id;
}
export function equipmentGroup(brand:EquipmentBrand,id?:string){return equipmentGroupsFor(brand).find(g=>g.id===equipmentGroupSelection(brand,id))!;}

/** A rack view must not advertise the radius of a nozzle that it excludes. */
function withNozzleBounds(item:GroupCatalogItem):GroupCatalogItem{
 const rows=item.nozzles.flatMap(nozzle=>nozzle.performance).filter(row=>Number.isFinite(row.radiusM)&&row.radiusM>0);
 if(!rows.length)return item;
 const minimum=(row:typeof rows[number])=>Math.min(row.radiusM,row.radiusMinM??item.radiusAdjustment?.minimumRadiusM??
  (item.radiusAdjustment?Math.max(item.rMin,row.radiusM*item.radiusAdjustment.minimumRatio):row.radiusM));
 const rMin=Math.min(...rows.map(minimum)),rMax=Math.max(...rows.map(row=>row.radiusM));
 const preferred=defaultNozzle(item),rNom=preferred?nozzleRange(preferred).recR:item.rNom;
 return {...item,rMin,rMax,rNom:Math.max(rMin,Math.min(rMax,rNom))};
}

/** Every ordinary model has one destination. 5000 MPR and standard/LA are disjoint nozzle configurations. */
export function equipmentGroupCatalog(catalog:CatalogItem[],brand:EquipmentBrand,groupId?:string):GroupCatalogItem[]{
 const selectedBrand=!brand||brand==='all'?'hunter':brand,group=equipmentGroupSelection(selectedBrand,groupId);
 const result:GroupCatalogItem[]=[];
 for(const item of catalog){
  if((item.manufacturerId??'hunter')!==selectedBrand||item.type==='body'||item.discontinued||item.placementSupported===false)continue;
  const model=item.modelId??item.id;
  if(selectedBrand==='hunter'){
   const destination=item.family==='strip'?'mp':item.family==='stream'?'bubbler':item.family;
   if(destination===group)result.push(item);
  }else if(selectedBrand==='toro'){
   if(group===(item.type==='rotor'?'rotor':'precision'))result.push(item);
  }else if(selectedBrand==='k-rain'){
   const destination=model==='KVF6'?'kvf6':krainLibraryCategory(item);
   if(destination===group)result.push(item);
  }else{
   const category=rainBirdLibraryCategory(item);
   if(item.type==='rotor'){
    const mpr=item.nozzles.filter(n=>n.type==='MPR'),standard=item.nozzles.filter(n=>n.type!=='MPR');
    if(group==='rvan'&&mpr.length){
     const arcs=[...new Set(mpr.flatMap(nozzle=>nozzle.designArcDeg==null?[]:[nozzle.designArcDeg]))].sort((a,b)=>a-b);
     result.push(withNozzleBounds({...item,modelId:`${model} MPR`,nozzles:mpr,defaultNozzleId:mpr.find(n=>n.designArcDeg===180)?.id??mpr[0]!.id,automaticDesignArcOnly:true,
      ...(arcs.length?{arcMin:arcs[0]!,arcMax:arcs.at(-1)!,allowedArcRanges:arcs.map(arc=>[arc,arc] as [number,number])}:{})}));
    }
    if(group==='rotor'&&standard.length)result.push(mpr.length?withNozzleBounds({...item,modelId:`${model} Standard / LA`,nozzles:standard,defaultNozzleId:defaultNozzle({...item,nozzles:standard})?.id}):item);
    continue;
   }
   const destination=category==='van'?(/^(12|15|18)-VAN$/.test(model)?'spray-mpr':'van'):['hevan','u-series','mpr','strips'].includes(category??'')?'spray-mpr':category;
   if(destination===group)result.push(item);
  }
 }
 return result;
}
export function equipmentGroupItem(id:string,brand:EquipmentBrand,groupId?:string){return equipmentGroupCatalog(CATALOG,brand,groupId).find(item=>item.id===id);}

export function equipmentInnerSeries(item:CatalogItem):string{
 const model=item.modelId??item.id;
 if(item.manufacturerId==='toro')return item.strip?(model.startsWith('PSN')?'PSN+ Strip':'Precision Strip'):(toroSpraySeries(item)??item.series);
 if(item.manufacturerId==='rain-bird'){
  if(item.type==='rotor')return model.includes(' MPR')?'5000 MPR':item.series;
  if(model.startsWith('R-VAN'))return item.strip?'R-VAN Strip':model.endsWith('360')?'R-VAN 360°':'R-VAN Adjustable';
  if(/^\d+-VAN$/.test(model))return /^(12|15|18)-VAN$/.test(model)?'VAN 12–18':model;
  return ({hevan:'HE-VAN','u-series':'U-Series',mpr:'MPR Fixed',strips:'MPR Strip'} as Record<string,string>)[rainBirdLibraryCategory(item)??'']??item.series;
 }
 if(item.manufacturerId==='k-rain'){
  if(item.strip)return item.family==='strip'?'Rotary Nozzle Series — Strip':model.startsWith('FN')?'FN Strip':'P Strip';
  if(item.family==='mp')return item.series;
  if(item.family==='fixed')return model.startsWith('FN')?'FN':'P';
  if(item.family==='spray')return model;
 }
 if(item.manufacturerId==='hunter'&&(item.family==='fixed'||item.family==='short'))return `${model.match(/^\d+/)?.[0]??model} ft`;
 return item.series;
}
export function equipmentSeriesOptions(catalog:CatalogItem[]){return [...new Set(catalog.map(equipmentInnerSeries))].sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));}

/** Declared matched-precipitation families; this is not a body-thread compatibility test. */
export function matchedPrecipitationClass(item:CatalogItem,nozzleId?:string|null,arc?:number):string|null{
 if(item.strip||item.coverageKind==='point'||item.coverageKind==='square'||item.coverageKind==='streams')return null;
 const brand=item.manufacturerId??'hunter',model=item.modelId??item.id;
 if(brand==='hunter')return item.family==='mp'?'hunter:mp':item.family==='mp800'?'hunter:mp800':item.family==='he'?'hunter:he':null;
 if(brand==='toro'&&item.type!=='rotor'&&item.type!=='body')return 'toro:precision';
 if(brand==='k-rain'&&item.family==='mp')return 'k-rain:rn';
 if(brand==='rain-bird'){
  if(model.startsWith('R-VAN'))return 'rain-bird:rotary-mpr';
  const nozzle=item.nozzles.find(n=>n.id===nozzleId);
  if(item.type==='rotor'&&nozzle?.type==='MPR'&&arc===nozzle.designArcDeg)return 'rain-bird:rotary-mpr';
  const category=rainBirdLibraryCategory(item);
  if(['hevan','u-series','mpr'].includes(category??'')||/^(12|15|18)-VAN$/.test(model))return 'rain-bird:spray-mpr';
 }
 return null;
}
export function headInEquipmentGroup(head:Head,catalog:CatalogItem[]){
 const source=catalogForHead(head),nozzleId=head.nozzleId??(source&&defaultNozzle(source)?.id);
 return catalog.some(item=>item.id===head.catalogId&&(!nozzleId||item.nozzles.some(nozzle=>nozzle.id===nozzleId&&
  (!(item as GroupCatalogItem).automaticDesignArcOnly||head.arc===nozzle.designArcDeg))));
}
