import {useEffect,useState} from 'react';
import {loadPlantImage} from './plant-images';
import {landscapeImageSrc,landscapeLayerVisible,type LandscapeObject} from './landscape-objects';
import type {CadDrawing} from './cad/types';
export function useLandscapeImage(object:LandscapeObject) {
  const src=landscapeImageSrc(object),enabled=object.visualMode!=='vector',[image,setImage]=useState<HTMLImageElement>();
  useEffect(()=>{let live=true;setImage(undefined);if(!enabled)return;loadPlantImage(src).then(img=>{if(live)setImage(img);}).catch(()=>{});return()=>{live=false;};},[src,enabled]);
  return enabled?image:undefined;
}
export async function ensureLandscapeImages(d:CadDrawing) {
  await Promise.all(Object.values(d.landscapeObjects??{}).filter(o=>o.visualMode!=='vector'&&landscapeLayerVisible(d,o.category,o)).map(o=>loadPlantImage(landscapeImageSrc(o)).catch(()=>undefined)));
}
