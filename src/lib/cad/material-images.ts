import {faceTexture} from './types';
import {seamlessPattern} from './seamless-pattern';

const images=new Map<string,Promise<HTMLImageElement>>();

/** Decode only materials actually used by the canvas, sharing editor/preview work.
 * Preparing the entire catalog at once needlessly exhausts tablet canvas memory. */
export function loadMaterialImage(fill:string):Promise<HTMLImageElement> {
 const cached=images.get(fill);if(cached)return cached;
 const texture=faceTexture(fill==='texture:lawn-striped'?'texture:lawn-parterre':fill);
 if(!texture)return Promise.reject(new Error('Unknown material'));
 const ready=new Promise<HTMLImageElement>((resolve,reject)=>{
  const image=new Image();
  image.onload=()=>{seamlessPattern(image,fill).then(resolve,reject);};
  image.onerror=()=>{images.delete(fill);reject(new Error('Material image unavailable'));};
  image.src=texture.src;
 });
 images.set(fill,ready);return ready;
}
