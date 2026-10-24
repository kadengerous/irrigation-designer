import {geometryAt,operatingGeometryAvailable,radiusRange} from "./flow";
import {CATEGORIES,type CatalogItem} from './equipment-catalog';
import type {EquipmentCategory,ManufacturerId} from './equipment-model';
import {RAIN_BIRD_CATEGORIES,rainBirdLibraryCategory} from './rain-bird-library';
import {TORO_CATEGORIES,toroLibraryCategory} from './toro-library';
import {KRAIN_CATEGORIES,krainLibraryCategory} from './krain-library';
export const EQUIPMENT_CATEGORIES = [
 {id:'rotary',label:'Rotary Nozzles'},
 {id:'spray',label:'Spray Nozzles'},{id:'fixed',label:'Fixed Nozzles'},
 {id:'strips',label:'Strip Nozzles'},{id:'specialty',label:'Specialty Nozzles'},{id:'rotor',label:'Rotors'},
 {id:'bubbler',label:'Bubblers'},
] as const;
const HUNTER_CATEGORIES=CATEGORIES.filter(category=>category.id!=='all');
export type EquipmentFilters={manufacturerId:ManufacturerId|'all';category?:string;radius?:number;arc?:number;pressure?:number};
export function equipmentCategory(item:CatalogItem):EquipmentCategory{
 // Rotary strip patterns belong to the rotary family, regardless of footprint.
 if(item.family==='strip')return 'rotary';
 if(item.category)return item.category;
 if(item.type==='body'||item.type==='rotor'||item.type==='bubbler')return item.type;
 if(item.strip||item.family==='stream')return 'specialty';
 if(['mp','mp800'].includes(item.family))return 'rotary';
 if(item.arcMin===item.arcMax)return 'fixed';
 return 'spray';
}
export function equipmentCategoriesFor(manufacturerId:ManufacturerId|'all'){
 return manufacturerId==='hunter'?HUNTER_CATEGORIES:manufacturerId==='rain-bird'?RAIN_BIRD_CATEGORIES:manufacturerId==='toro'?TORO_CATEGORIES:manufacturerId==='k-rain'?KRAIN_CATEGORIES:EQUIPMENT_CATEGORIES;
}
export function equipmentCategorySelection(manufacturerId:ManufacturerId|'all',category?:string):string{
 const categories=equipmentCategoriesFor(manufacturerId);
 if(categories.some(c=>c.id===category))return category!;
 const aliases:Record<string,string>=manufacturerId==='hunter'
  ?{rotary:'mp',strips:'prostrip',specialty:'prostrip'}
  :manufacturerId==='rain-bird'
  ?{rotary:'rvan',mp:'rvan',mp800:'rvan',strip:'rvan',spray:'van',he:'hevan',fixed:'mpr',short:'mpr',specialty:'sq',prostrip:'strips',golf:'rotor',st:'rotor'}
  :manufacturerId==='toro'
  ?{fixed:'precision-plus',spray:'precision-plus',specialty:'strips',prostrip:'strips',strip:'strips',golf:'rotor',st:'rotor'}
  :manufacturerId==='k-rain'
  ?{mp:'rotary',mp800:'rotary',strip:'rotary',spray:'kvf',he:'kvf',short:'fixed',specialty:'strips',prostrip:'strips',golf:'rotor',st:'rotor',rvan:'rotary',hevan:'kvf',van:'kvf','u-series':'fixed',mpr:'fixed',sq:'strips','precision-plus':'fixed',precision:'fixed'}
  :{mp:'rotary',mp800:'rotary',strip:'rotary',he:'spray',short:'fixed',prostrip:'strips',golf:'rotor',st:'rotor',rvan:'rotary',hevan:'spray',van:'spray','u-series':'fixed',mpr:'fixed',sq:'specialty'};
 return aliases[category??'']??categories[0]!.id;
}
export function equipmentTechnology(item:CatalogItem):'rotary'|'spray'|'rotor'|'bubbler'|'unknown'{
 if(['mp','mp800','strip'].includes(item.family))return 'rotary';
 if(['spray','he','fixed','short','prostrip'].includes(item.family))return 'spray';
 if(item.type==='rotor'||item.type==='bubbler')return item.type;
 const category=equipmentCategory(item);
 return category==='fixed'?'spray':['rotary','spray'].includes(category)?category as 'rotary'|'spray':'unknown';
}
export function filterEquipment(catalog:CatalogItem[],filter:EquipmentFilters):CatalogItem[]{
 const hunterFamily=filter.manufacturerId==='hunter'&&HUNTER_CATEGORIES.some(c=>c.id===filter.category);
 const rainBirdFamily=filter.manufacturerId==='rain-bird'&&RAIN_BIRD_CATEGORIES.some(c=>c.id===filter.category);
 const toroFamily=filter.manufacturerId==='toro'&&TORO_CATEGORIES.some(c=>c.id===filter.category);
 const krainFamily=filter.manufacturerId==='k-rain'&&KRAIN_CATEGORIES.some(c=>c.id===filter.category);
 const matchesCategory=(item:CatalogItem)=>{
  if(!filter.category||filter.category==='all')return true;
  if(hunterFamily)return item.family===filter.category;
  if(rainBirdFamily)return rainBirdLibraryCategory(item)===filter.category;
  if(toroFamily)return toroLibraryCategory(item)===filter.category;
  if(krainFamily)return krainLibraryCategory(item)===filter.category;
  if(item.manufacturerId==='rain-bird'||item.manufacturerId==='toro'||item.manufacturerId==='k-rain'){
   const category=item.strip&&equipmentTechnology(item)!=='rotary'?'strips':equipmentCategory(item);
   return category===filter.category;
  }
  return filter.category==='strips'&&!!item.strip&&equipmentTechnology(item)!=='rotary'||equipmentCategory(item)===filter.category||item.family===filter.category;
 };
 return catalog.filter(item=>item.type!=='body'&&!item.discontinued&&item.placementSupported!==false&&
  (filter.manufacturerId==='all'||(item.manufacturerId??'hunter')===filter.manufacturerId)&&
  matchesCategory(item)&&
  (filter.radius==null||['k-rain','toro'].includes(item.manufacturerId??'')||filter.radius>=item.rMin&&filter.radius<=item.rMax)&&
  (filter.arc==null||filter.arc>=item.arcMin&&filter.arc<=item.arcMax)&&
  ((filter.radius==null&&filter.arc==null&&filter.pressure==null)||item.nozzles.some(nozzle=>{
    const arc=filter.arc??Math.max(item.arcMin,Math.min(180,item.arcMax));
    const pressures=filter.pressure==null?[...new Set(nozzle.performance.map(r=>r.pressureBar)),item.recommendedPressureBar]:[filter.pressure];
    return pressures.some(pressure=>{
      if(item.manufacturerId==='k-rain'&&item.coverageKind==='point')return (filter.radius==null||filter.radius===0)&&
        operatingGeometryAvailable(item,{nozzleId:nozzle.id,bodyId:item.id,designPressure:pressure,arc,r:0});
      if(!geometryAt(item,nozzle.id,pressure,arc))return false;
      if(filter.radius==null)return true;
      const range=radiusRange(item,nozzle.id,pressure,arc);
      return !!range&&filter.radius!>=range.min&&filter.radius!<=range.max;
    });
  })));
}
