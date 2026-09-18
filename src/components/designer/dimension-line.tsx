import { Circle, Group, Line, Text } from "react-konva";
import type { Pt } from "@/lib/geometry";
import {dimensionLabelLayout} from "@/lib/cad/dimension-label-layout";

/** Screen-space ticks and label keep a constant readable size at every zoom. */
export function DimensionLine({a,b,label,color,selected=false,onEdit,offset=-1,hideLabel=false}:{a:Pt;b:Pt;label:string;color:string;selected?:boolean;onEdit?:()=>void;offset?:number;hideLabel?:boolean}) {
  const placement=dimensionLabelLayout(a,b,offset);
  let angle = Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  const radians = angle*Math.PI/180;
  const nx = -Math.sin(radians), ny = Math.cos(radians);
  const length = Math.hypot(b.x-a.x,b.y-a.y) || 1;
  const ux = (b.x-a.x)/length, uy = (b.y-a.y)/length;
  return <Group>
    <Line points={[a.x,a.y,b.x,b.y]} stroke={color} strokeWidth={1} hitStrokeWidth={18}/>
    {[a,b].map((p,i) => <Group key={i}>
      <Line points={[p.x-nx*7,p.y-ny*7,p.x+nx*7,p.y+ny*7]} stroke={color} strokeWidth={0.8}/>
      <Line points={[p.x,p.y,p.x+(i ? -1:1)*ux*7+nx*2.3,p.y+(i ? -1:1)*uy*7+ny*2.3,p.x+(i ? -1:1)*ux*7-nx*2.3,p.y+(i ? -1:1)*uy*7-ny*2.3]} closed fill={color}/>
      {selected && <Circle x={p.x} y={p.y} radius={4} fill={color} hitStrokeWidth={18}/>}
    </Group>)}
    <Text x={placement.x} y={placement.y} visible={!hideLabel}
      offsetX={Math.max(96,label.length*9)/2} offsetY={7} width={Math.max(96,label.length*9)}
      align="center" rotation={angle} text={label} fontSize={14}
      fontFamily="IBM Plex Sans, sans-serif" fill={color}
      onClick={onEdit ? e=>{e.cancelBubble=true;onEdit();}:undefined}
      onTap={onEdit ? e=>{e.cancelBubble=true;onEdit();}:undefined}/>
  </Group>;
}
