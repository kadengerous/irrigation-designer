import { useEffect, useState } from 'react';
import type { CadPlant, CadDrawing } from './cad/types';
import { plantImageSrc, plantLayerVisible } from './plant-visuals';

const images = new Map<string, Promise<HTMLImageElement>>();
const ready = new Map<string, HTMLImageElement>();
export function loadPlantImage(src: string): Promise<HTMLImageElement> {
  let pending = images.get(src);
  if (!pending) {
    pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => { ready.set(src, image); resolve(image); };
      image.onerror = () => { images.delete(src); reject(new Error(`Plant image unavailable: ${src}`)); };
      image.src = src;
    });
    images.set(src, pending);
  }
  return pending;
}
export function usePlantImage(plant: Pick<CadPlant,'kind'|'catalog'|'visualMode'>) {
  const enabled=plant.visualMode!=='vector';
  const src = plantImageSrc(plant);
  const [image,setImage] = useState(() => ready.get(src));
  useEffect(() => {
    let active = true;
    setImage(enabled?ready.get(src):undefined);
    if(!enabled)return;
    loadPlantImage(src).then(value => {if(active)setImage(value);}).catch(() => {if(active)setImage(undefined);});
    return () => { active = false; };
  },[src,enabled]);
  return enabled?image:undefined;
}
export async function ensurePlantImages(d: CadDrawing) {
  await Promise.all(Object.values(d.plants ?? {}).filter(p=>p.visualMode!=='vector'&&plantLayerVisible(d,p.kind,p)).map(p=>loadPlantImage(plantImageSrc(p)).catch(()=>undefined)));
}
