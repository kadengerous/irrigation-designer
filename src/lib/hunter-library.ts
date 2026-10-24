import {equipmentAppearance,type CatalogItem} from './equipment-catalog';

export type HunterLibrarySubgroup={id:string;label:string;catalog:CatalogItem[];color?:string;colorName?:string};

/** Browsing subdivisions only; automatic selection retains the parent compatibility group. */
export function hunterLibrarySubgroups(catalog:CatalogItem[],groupId:string):HunterLibrarySubgroup[]{
 if(!catalog.length||catalog.some(item=>item.manufacturerId!=='hunter'))return [];
 const subgroup=(id:string,label:string,items:CatalogItem[]):HunterLibrarySubgroup=>({id,label,catalog:items});
 if(groupId==='mp')return [
  subgroup('mp','MP Rotator',catalog.filter(item=>!item.strip)),
  subgroup('strip','MP Strip',catalog.filter(item=>!!item.strip)),
 ].filter(group=>group.catalog.length);
 if(groupId==='fixed')return ['5','8','10','12','15','17'].map(size=>{
  const items=catalog.filter(item=>(item.modelId??item.id).match(/^\d+/)?.[0]===size);
  return {...subgroup(size,size,items),...equipmentAppearance(items[0])};
 }).filter(group=>group.catalog.length);
 if(groupId==='bubbler')return ['MSBN','PCN','PCB','AFB','CST'].map(series=>
  subgroup(series,series,catalog.filter(item=>series==='CST'?item.series==='CST':(item.modelId??item.id).startsWith(series)))
 ).filter(group=>group.catalog.length);
 return [];
}
