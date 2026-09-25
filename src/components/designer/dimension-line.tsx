import { Circle, Group, Line, Text } from "react-konva";
import type { Pt } from "@/lib/geometry";
import {dimensionLabelLayout} from "@/lib/cad/dimension-label-layout";

/** Annotations scale with the drawing; pointer hit targets remain usable. */
export function DimensionLine({a,b,label,color,selected=false,onEdit,offset=-1,hideLabel=false,textPlacement,visualScale=1}:{a:Pt;b:Pt;label:string;color:string;selected?:boolean;onEdit?:(event:{shiftKey?:boolean;ctrlKey?:boolean;metaKey?:boolean})=>void;offset?:number;hideLabel?:boolean;textPlacement?:Pt&{angle:number};visualScale?:number}) {
  const placement=textPlacement??dimensionLabelLayout(a,b,offset);
  let angle = Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  const radians = angle*Math.PI/180;
  const nx = -Math.sin(radians), ny = Math.cos(radians);
  const length = Math.hypot(b.x-a.x,b.y-a.y) || 1;
  const ux = (b.x-a.x)/length, uy = (b.y-a.y)/length;
  const tick=7*visualScale,arrow=2.3*visualScale;
  return <Group>
    <Line points={[a.x,a.y,b.x,b.y]} stroke={color} strokeWidth={1} hitStrokeWidth={18}/>
    {[a,b].map((p,i) => <Group key={i}>
      <Line points={[p.x-nx*tick,p.y-ny*tick,p.x+nx*tick,p.y+ny*tick]} stroke={color} strokeWidth={0.8}/>
      <Line points={[p.x,p.y,p.x+(i ? -1:1)*ux*tick+nx*arrow,p.y+(i ? -1:1)*uy*tick+ny*arrow,p.x+(i ? -1:1)*ux*tick-nx*arrow,p.y+(i ? -1:1)*uy*tick-ny*arrow]} closed fill={color}/>
      {selected && <Circle x={p.x} y={p.y} radius={4*visualScale} fill={color} hitStrokeWidth={18}/>}
    </Group>)}
    <Text x={placement.x} y={placement.y} visible={!hideLabel}
      offsetX={Math.max(96,label.length*9)*visualScale/2} offsetY={7*visualScale} width={Math.max(96,label.length*9)*visualScale}
      align="center" rotation={angle} text={label} fontSize={14*visualScale}
      fontFamily="IBM Plex Sans, sans-serif" fill={color}
      onClick={onEdit ? e=>{e.cancelBubble=true;onEdit(e.evt);}:undefined}
      onTap={onEdit ? e=>{e.cancelBubble=true;onEdit(e.evt);}:undefined}/>
  </Group>;
}
