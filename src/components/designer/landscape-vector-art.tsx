import {Group,Path} from 'react-konva';
import {useMemo} from 'react';
import type {LandscapeVectorArtwork} from '@/lib/landscape-vector';

export function LandscapeVectorArt({art,scale=1,name}:{art:LandscapeVectorArtwork;scale?:number;name?:string}) {
  const paths=useMemo(()=>art.paths.map((path,i)=><Path key={i} data={path.d} fill={path.fill==='none'?undefined:path.fill} fillEnabled={path.fill!=='none'} stroke={path.stroke==='none'?undefined:path.stroke} strokeEnabled={path.stroke!=='none'} strokeWidth={path.strokeWidth} opacity={path.opacity} lineJoin="round" lineCap="round" listening={false}/>),[art]);
  return <Group name={name} scaleX={scale} scaleY={scale} listening={false}>
    {paths}
  </Group>;
}
