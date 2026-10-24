import type {AssemblyKind} from './engineering-assembly';
/** Generic product illustrations: appearance is independent of entered model/specifications. */
export const assemblyImageSrc=(type:AssemblyKind)=>`/engineering/assembly/${type}.webp`;
/** Embed local artwork so exported diagrams remain complete away from the site. */
export async function embedAssemblyImages(svg:SVGSVGElement,readDataUrl:(src:string)=>Promise<string>=imageDataUrl):Promise<void>{
 const images=Array.from(svg.querySelectorAll('image')),cache=new Map<string,Promise<string>>();
 await Promise.all(images.map(async image=>{const src=image.getAttribute('href');if(!src||src.startsWith('data:'))return;let pending=cache.get(src);if(!pending){pending=readDataUrl(src);cache.set(src,pending);}const data=await pending;image.setAttribute('href',data);image.setAttributeNS('http://www.w3.org/1999/xlink','xlink:href',data);}));
}
async function imageDataUrl(src:string):Promise<string>{
 const response=await fetch(new URL(src,window.location.href));if(!response.ok)throw new Error(`Image ${response.status}`);
 const blob=await response.blob();return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
}
