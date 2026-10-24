import {Shape} from 'react-konva';
import type {Surface} from '@/lib/irrigation-geometry';
import {LAWN_PATTERN_PIXELS,lawnPeriodMeters} from '@/lib/cad/lawn-pattern';

export function SimulationLawn({surface,image,px,panX,panY}:{surface:Surface;image?:HTMLImageElement;px:number;panX:number;panY:number}) {
 if(!surface.length)return null;
 const scale=px*lawnPeriodMeters('texture:lawn-parterre')/LAWN_PATTERN_PIXELS;
 return <Shape name="simulation-lawn" x={panX} y={panY} listening={false} perfectDrawEnabled={false}
  fill="#44842d" fillPriority={image?'pattern':'color'} fillPatternImage={image} fillPatternRepeat="repeat"
  fillPatternScaleX={scale} fillPatternScaleY={scale} fillRule="evenodd" strokeEnabled={false}
  sceneFunc={(ctx,shape)=>{
   ctx.beginPath();
   for(const polygon of surface)for(const ring of polygon){
    ring.forEach(([x,y],i)=>i?ctx.lineTo(x*px,y*px):ctx.moveTo(x*px,y*px));ctx.closePath();
   }
   // Paint an opaque base even if the browser has not yet decoded the pattern.
   ctx.fillStyle='#44842d';ctx.fill('evenodd');
   if(image)ctx.fillStrokeShape(shape);
  }}/>;
}
