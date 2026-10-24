import {memo,useMemo,useState} from 'react';
import type {CadPlant} from '@/lib/cad/types';
import {plantImageSrc} from '@/lib/plant-visuals';
import {landscapeImageSrc,type LandscapeObject,type LandscapeRecord} from '@/lib/landscape-objects';
import {landscapeVisualMode,plantVectorArtwork,landscapeVectorArtwork,type LandscapeVectorArtwork,type LandscapeVisualMode} from '@/lib/landscape-vector';

type Options={mode?:LandscapeVisualMode;className?:string;alt?:string;draggable?:boolean};
const Thumbnail=memo(function Thumbnail({src,art,mode,className,alt='',draggable=false}:{src:string;art:LandscapeVectorArtwork;mode:LandscapeVisualMode;className?:string;alt?:string;draggable?:boolean}) {
  const [failedSource,setFailedSource]=useState<string|null>(null);
  if(mode==='image'&&failedSource!==src)return <img className={className} src={src} alt={alt} loading="lazy" draggable={draggable} onError={()=>setFailedSource(src)}/>;
  const pad=Math.max(art.width,art.height)*.035;
  return <svg className={className} data-landscape-visual="vector" viewBox={`${-art.width/2-pad} ${-art.height/2-pad} ${art.width+pad*2} ${art.height+pad*2}`} preserveAspectRatio="xMidYMid meet" role={alt?'img':undefined} aria-label={alt||undefined} aria-hidden={alt?undefined:true} onDragStart={e=>{if(!draggable)e.preventDefault();}}>
    {art.paths.map((p,i)=><path key={i} d={p.d} fill={p.fill} stroke={p.stroke} strokeWidth={p.strokeWidth} opacity={p.opacity} strokeLinejoin="round" strokeLinecap="round"/>)}
  </svg>;
});
export function PlantThumbnail({plant,mode,...props}:Options&{plant:Pick<CadPlant,'kind'|'catalog'|'visualMode'>}) {
  const art=useMemo(()=>plantVectorArtwork(plant),[plant.kind,plant.catalog]);
  return <Thumbnail {...props} src={plantImageSrc(plant)} art={art} mode={landscapeVisualMode(plant,mode)}/>;
}
export function LandscapeObjectThumbnail({object,mode,...props}:Options&{object:LandscapeRecord|LandscapeObject}) {
  const instance='catalogId' in object;
  const id='catalogId' in object?object.catalogId:object.id;
  const art=useMemo(()=>landscapeVectorArtwork(object),[instance,id,object.category,object.length,object.width]);
  return <Thumbnail {...props} src={landscapeImageSrc(object)} art={art} mode={landscapeVisualMode('catalogId' in object?object:{},mode)}/>;
}
