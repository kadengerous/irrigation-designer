import { Circle, Group, Line, Text, Image as CanvasImage } from 'react-konva';
import {useMemo} from 'react';
import type Konva from 'konva';
import type { CadPlant } from '@/lib/cad/types';
import { usePlantImage } from '@/lib/plant-images';
import { plantArtworkBox } from '@/lib/plant-visuals';
import {useProject} from '@/lib/project-store';
import {formatLenU} from '@/lib/units';
import {plantVectorArtwork} from '@/lib/landscape-vector';
import {LandscapeVectorArt} from './landscape-vector-art';

export function PlantGlyph({plant,x,y,px,selected,interactive,onBegin,onResize,onRotate,showLabel,uiScale=1,locked=false}: {
  plant:CadPlant;x:number;y:number;px:number;selected:boolean;interactive:boolean;showLabel:boolean;uiScale?:number;locked?:boolean;
  onBegin:(e:Konva.KonvaEventObject<PointerEvent|TouchEvent>)=>void;
  onResize:(e:Konva.KonvaEventObject<PointerEvent|TouchEvent>)=>void;
  onRotate:(e:Konva.KonvaEventObject<PointerEvent|TouchEvent>)=>void;
}) {
  const image=usePlantImage(plant),r=plant.r*px,box=plantArtworkBox(plant,r*2),u=uiScale;
  const units=useProject(s=>s.units);
  const vector=useMemo(()=>plantVectorArtwork(plant,plant.r*2),[plant.kind,plant.catalog,plant.r]);
  return <Group x={x} y={y} listening={interactive} name={`plant-${plant.id}`} placementId={plant.id}>
    <Group onPointerDown={onBegin} onTouchStart={onBegin} onClick={e=>{e.cancelBubble=true;}} onTap={e=>{e.cancelBubble=true;}}>
      <Circle radius={Math.max(r,12*u)} fill="rgba(0,0,0,0.001)"/>
      <Group rotation={plant.rotation??0} listening={false}>{image?<CanvasImage name="plant-artwork" image={image} x={-box.width/2} y={-box.height/2} width={box.width} height={box.height} crop={box.crop}/>:<LandscapeVectorArt name="plant-vector" art={vector} scale={px}/>}</Group>
      {selected&&<Circle radius={r+4*u} stroke="#54b4ef" strokeWidth={1.5*u} dash={[5*u,4*u]} listening={false}/>}
    </Group>
    {selected&&<Text x={-110*u} y={r+10*u} width={220*u} align="center" text={`⌀ ${formatLenU(plant.r*2,units.length)}`} fontSize={13*u} fill="#234638" stroke="white" strokeWidth={3*u} fillAfterStrokeEnabled listening={false}/>}
    {selected&&!locked&&!plant.locked&&<Group name="plant-controls">
      <Circle name="plant-resize" x={r} radius={7*u} hitStrokeWidth={30*u} fill="white" stroke="#54b4ef" strokeWidth={2*u} onPointerDown={onResize} onTouchStart={onResize}/>
      <Line points={[0,-r-4*u,0,-r-30*u]} stroke="#54b4ef" strokeWidth={1.5*u} listening={false}/>
      <Group y={-r-30*u} onPointerDown={onRotate} onTouchStart={onRotate} name="plant-rotate">
        <Circle radius={9*u} hitStrokeWidth={26*u} fill="white" stroke="#54b4ef" strokeWidth={2*u}/>
        <Text text="↻" x={-7*u} y={-8*u} width={14*u} align="center" fontSize={15*u} fill="#245b7f" listening={false}/>
      </Group>
    </Group>}
  </Group>;
}
