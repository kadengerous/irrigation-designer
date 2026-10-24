import type {CadDrawing} from '@/lib/cad/types';
import {layerForType} from '@/lib/cad/types';
import {closedDrawingFigures,figureAtPoint} from '@/lib/irrigation-figures';
import {headCovers} from '@/lib/coverage';
import {pointInSurface,type Surface} from '@/lib/irrigation-geometry';
import type {Head} from '@/lib/project-types';
import type {Pt} from '@/lib/geometry';
export type InkRequest={id:string;x:number;y:number;dark:string};
/** Explicit paint rule: visible fill/sector is white, empty canvas is grey. */
export function annotationPaintInk(point:Pt,drawing:CadDrawing,heads:Head[],showSectors:boolean,mask:Surface=[]):string {
 if(pointInSurface(point,mask))return '#626b75';
 const filled=closedDrawingFigures(drawing).filter(f=>{
  const face=drawing.faces[f.id]!;
  return !face.hidden&&drawing.layers?.[layerForType(face.type)]?.visible!==false&&!!face.fill&&
    !['none','transparent','rgba(0,0,0,0)'].includes(face.fill.replace(/\s/g,''));
 });
 if(figureAtPoint(point,filled)||showSectors&&heads.some(h=>headCovers(h,point)))return '#ffffff';
 return '#626b75';
}
