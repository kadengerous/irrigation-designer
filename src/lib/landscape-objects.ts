import records from '@/data/landscape-objects.json';
import bounds from './landscape-object-bounds.json';
import {text} from './i18n';
import type {CadDrawing} from './cad/types';
import type {Pt} from './geometry';
import type {LandscapeVisualMode} from './landscape-types';

export const LANDSCAPE_CATEGORIES = ['furniture','lighting','decor','equipment'] as const;
export type LandscapeCategory = typeof LANDSCAPE_CATEGORIES[number];
export type LandscapeRecord = {id:string;category:LandscapeCategory;subcategory:string;width:number;length:number;shape:string;stretch:boolean;sizeFromCatalog?:boolean;defaultKeepRatio?:boolean};
export type LandscapeObject = {id:string;catalogId:string;category:LandscapeCategory;x:number;y:number;width:number;length:number;rotation:number;keepRatio:boolean;noIrrigation:boolean;hidden?:boolean;locked?:boolean;visualMode?:LandscapeVisualMode};
export const LANDSCAPE_OBJECTS=records as LandscapeRecord[];
export const landscapeRecord=(id:string)=>LANDSCAPE_OBJECTS.find(r=>r.id===id);
export const landscapeName=(item:LandscapeRecord|LandscapeObject)=>{const id='catalogId' in item?item.catalogId:item.id;return landscapeRecord(id)?text(`landscapeObject_${id}`):landscapeCategoryName(item.category);};
export const landscapeCategoryName=(id:LandscapeCategory)=>text(`landscapeCategory_${id}`);
export const landscapeSubcategoryName=(id:string)=>text(`landscapeSubcategory_${id}`);
export const landscapeImageSrc=(item:LandscapeRecord|LandscapeObject)=>`/landscape/${'catalogId' in item?item.catalogId:item.id}.webp`;
export const landscapeLayerVisible=(d:CadDrawing,category:LandscapeCategory,instance?:{hidden?:boolean})=>!instance?.hidden&&d.layers?.[category]?.visible!==false;
export const landscapeLayerLocked=(d:CadDrawing,category:LandscapeCategory)=>d.layers?.[category]?.locked===true;
export const landscapeLayerName=(d:CadDrawing,category:LandscapeCategory)=>d.layers?.[category]?.name||landscapeCategoryName(category);
export const rotationDegrees=(v:number)=>((v%360)+360)%360;
export const defaultLandscapeKeepRatio=(record:LandscapeRecord)=>record.shape==='square'||record.shape==='circle'?true:record.defaultKeepRatio??true;
export function defaultLandscapeSize(record:LandscapeRecord) {
  if(record.sizeFromCatalog)return {length:record.length,width:record.shape==='square'||record.shape==='circle'?record.length:record.width};
  const crop=(bounds as Record<string,{width:number;height:number}>)[record.id];
  return {length:record.length,width:record.shape==='circle'?record.length:crop?record.length*crop.height/crop.width:record.width};
}
export function objectToWorld(o:LandscapeObject,p:Pt):Pt {
  const a=o.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return {x:o.x+p.x*c-p.y*s,y:o.y+p.x*s+p.y*c};
}
export function objectToLocal(o:LandscapeObject,p:Pt):Pt {
  const a=o.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=p.x-o.x,y=p.y-o.y;
  return {x:x*c+y*s,y:-x*s+y*c};
}
/** Physical occupied footprint, independent of layer visibility and water-jet obstruction. */
export function landscapeFootprint(o:LandscapeObject):Pt[] {
  const shape=landscapeRecord(o.catalogId)?.shape,w=o.length/2,h=o.width/2;
  const outline=(bounds as Record<string,{footprint?:Pt[]}>)[o.catalogId]?.footprint;
  let points:Pt[];
  if(outline?.length)points=outline.map(p=>({x:p.x*o.length,y:p.y*o.width}));
  else if(shape==='circle'||shape==='hexagon') {
    const n=shape==='hexagon'?6:Math.min(720,Math.max(48,Math.ceil(Math.PI*Math.sqrt(Math.max(w,h)/.001))));
    points=Array.from({length:n},(_,i)=>({x:w*Math.cos(i*Math.PI*2/n-Math.PI/2)/(shape==='hexagon'?Math.cos(Math.PI/6):1),y:h*Math.sin(i*Math.PI*2/n-Math.PI/2)}));
  } else if(shape==='lshape') {
    points=[{x:-w,y:-h},{x:w,y:-h},{x:w,y:-h+o.width/3},{x:-w+o.length*.27,y:-h+o.width/3},{x:-w+o.length*.27,y:h},{x:-w,y:h}];
  }
  else points=[{x:-w,y:-h},{x:w,y:-h},{x:w,y:h},{x:-w,y:h}];
  return points.map(p=>objectToWorld(o,p));
}
export function landscapeExclusions(d:CadDrawing):Pt[][] {
  return Object.values(d.landscapeObjects??{}).filter(o=>o.noIrrigation).map(landscapeFootprint);
}
export function landscapeArtworkBox(o:Pick<LandscapeObject,'catalogId'|'length'|'width'>,scale=1) {
  const crop=(bounds as Record<string,{x:number;y:number;width:number;height:number;imageWidth:number;imageHeight:number}>)[o.catalogId]??{x:0,y:0,width:1254,height:1254,imageWidth:1254,imageHeight:1254};
  if(landscapeRecord(o.catalogId)?.shape==='circle') {
    const factor=Math.min(o.length*scale/crop.width,o.width*scale/crop.height);
    return {width:crop.width*factor,height:crop.height*factor,crop};
  }
  return {width:o.length*scale,height:o.width*scale,crop};
}
/** Uniform by default; axis handles work only after explicitly unlocking supported objects. */
export function resizeLandscapeObject(o:LandscapeObject,dx:number,dy:number,px:number,axis:'both'|'length'|'width'='both') {
  const local=objectToLocal(o,{x:o.x+dx/px,y:o.y+dy/px});
  const shape=landscapeRecord(o.catalogId)?.shape;
  if(o.keepRatio||shape==='square'||shape==='circle'||axis==='both') {
    const a=o.length/2,b=o.width/2;
    const f=Math.max(.03/Math.min(o.length,o.width),Math.min(100/Math.max(o.length,o.width),1+(local.x*a+local.y*b)/(a*a+b*b)));
    return {length:o.length*f,width:o.width*f};
  }
  return {length:axis==='length'?Math.min(100,Math.max(.03,o.length+local.x*2)):o.length,width:axis==='width'?Math.min(100,Math.max(.03,o.width+local.y*2)):o.width};
}
