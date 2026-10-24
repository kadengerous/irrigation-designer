import {Group,Rect,Circle,Line,Text,Image as CanvasImage} from 'react-konva';
import {useMemo} from 'react';
import type Konva from 'konva';
import {landscapeArtworkBox,type LandscapeObject} from '@/lib/landscape-objects';
import {useLandscapeImage} from '@/lib/landscape-object-images';
import {useProject} from '@/lib/project-store';
import {formatLenU} from '@/lib/units';
import {landscapeRecord} from '@/lib/landscape-objects';
import {landscapeVectorArtwork} from '@/lib/landscape-vector';
import {LandscapeVectorArt} from './landscape-vector-art';
type Handler=(e:Konva.KonvaEventObject<PointerEvent|TouchEvent>)=>void;
export function LandscapeObjectGlyph({object:o,x,y,px,selected,interactive,locked,uiScale=1,onBegin,onResize,onRotate}:{object:LandscapeObject;x:number;y:number;px:number;selected:boolean;interactive:boolean;locked:boolean;uiScale?:number;onBegin:Handler;onResize:(axis:'both'|'length'|'width',e:Konva.KonvaEventObject<PointerEvent|TouchEvent>)=>void;onRotate:Handler}) {
  const image=useLandscapeImage(o),box=landscapeArtworkBox(o,px),w=o.length*px,h=o.width*px,u=uiScale;
  const units=useProject(s=>s.units),round=landscapeRecord(o.catalogId)?.shape==='circle';
  const vector=useMemo(()=>landscapeVectorArtwork(o),[o.catalogId,o.category,o.length,o.width]);
  const dimensionColor='#234638',gap=22*u;
  return <Group x={x} y={y} rotation={o.rotation} listening={interactive} name={`landscape-${o.id}`} placementId={o.id}>
    <Group onPointerDown={onBegin} onTouchStart={onBegin} onClick={e=>{e.cancelBubble=true;}} onTap={e=>{e.cancelBubble=true;}}>
      <Rect x={-Math.max(w,20*u)/2} y={-Math.max(h,20*u)/2} width={Math.max(w,20*u)} height={Math.max(h,20*u)} fill="rgba(0,0,0,0.001)"/>
      {!image&&<LandscapeVectorArt name="landscape-vector" art={vector} scale={px}/>}
      {image&&<CanvasImage name="landscape-artwork" image={image} x={-box.width/2} y={-box.height/2} width={box.width} height={box.height} crop={box.crop} listening={false}/>}
      {selected&&<Rect name="landscape-selection" x={-w/2-3*u} y={-h/2-3*u} width={w+6*u} height={h+6*u} stroke="#54b4ef" strokeWidth={1.5*u} dash={[5*u,4*u]} listening={false}/>}
    </Group>
    {selected&&<Group name="landscape-dimensions" listening={false}>
      {round?<Group y={h/2+gap} rotation={-o.rotation}><Text x={-100*u} width={200*u} align="center" text={`⌀ ${formatLenU(o.length,units.length)}`} fontSize={13*u} fill={dimensionColor} stroke="white" strokeWidth={3*u} fillAfterStrokeEnabled/></Group>:<>
        <Group y={h/2+gap} rotation={-o.rotation}><Text name="landscape-length" x={-100*u} width={200*u} align="center" text={formatLenU(o.length,units.length)} fontSize={13*u} fill={dimensionColor} stroke="white" strokeWidth={3*u} fillAfterStrokeEnabled/></Group>
        <Group x={w/2+gap} rotation={-o.rotation}><Text name="landscape-width" y={-7*u} width={100*u} align="left" text={formatLenU(o.width,units.length)} fontSize={13*u} fill={dimensionColor} stroke="white" strokeWidth={3*u} fillAfterStrokeEnabled/></Group>
      </>}
    </Group>}
    {selected&&!locked&&!o.locked&&<Group name="landscape-controls">
      <Circle name="landscape-resize" x={w/2} y={h/2} radius={7*u} hitStrokeWidth={30*u} fill="white" stroke="#54b4ef" strokeWidth={2*u} onPointerDown={e=>onResize('both',e)} onTouchStart={e=>onResize('both',e)}/>
      {!o.keepRatio&&(['length','width'] as const).map(axis=><Circle key={axis} name={`landscape-resize-${axis}`} x={axis==='length'?w/2:0} y={axis==='width'?h/2:0} radius={6*u} hitStrokeWidth={32*u} fill="white" stroke="#54b4ef" strokeWidth={2*u} onPointerDown={e=>onResize(axis,e)} onTouchStart={e=>onResize(axis,e)}/>)}
      <Line points={[0,-h/2-3*u,0,-h/2-30*u]} stroke="#54b4ef" strokeWidth={1.5*u} listening={false}/>
      <Group y={-h/2-30*u} onPointerDown={onRotate} onTouchStart={onRotate} name="landscape-rotate"><Circle radius={9*u} hitStrokeWidth={26*u} fill="white" stroke="#54b4ef" strokeWidth={2*u}/><Text text="↻" x={-7*u} y={-8*u} width={14*u} align="center" fontSize={15*u} fill="#245b7f" listening={false}/></Group>
    </Group>}
  </Group>;
}
