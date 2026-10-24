import { Circle, Group, Line, Text } from "react-konva";
import type { Pt } from "@/lib/geometry";
import {dimensionLabelLayout} from "@/lib/cad/dimension-label-layout";
import {dimensionEndMarkers,dimensionTextScale} from "@/lib/cad/dimension-appearance";

/** Annotations scale with the drawing; pointer hit targets remain usable. */
export function DimensionLine({a,b,label,color,selected=false,onEdit,offset=-1,hideLabel=false,textPlacement,visualScale=1}:{a:Pt;b:Pt;label:string;color:string;selected?:boolean;onEdit?:(event:{shiftKey?:boolean;ctrlKey?:boolean;metaKey?:boolean})=>void;offset?:number;hideLabel?:boolean;textPlacement?:Pt&{angle:number};visualScale?:number}) {
  const textScale=dimensionTextScale(visualScale);
  const placement=textPlacement??dimensionLabelLayout(a,b,offset,textScale);
  let angle = Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  const {markers}=dimensionEndMarkers(a,b,visualScale);
  return <Group>
    <Line points={[a.x,a.y,b.x,b.y]} stroke={color} strokeWidth={1} hitStrokeWidth={18}/>
    {[a,b].map((p,i) => <Group key={i}>
      <Line points={markers[i]!.tick} stroke={color} strokeWidth={0.8}/>
      {markers[i]!.extension&&<Line points={markers[i]!.extension!} stroke={color} strokeWidth={0.8}/>}
      <Line points={markers[i]!.arrow} closed fill={color}/>
      {selected && <Circle x={p.x} y={p.y} radius={4*visualScale} fill={color} hitStrokeWidth={18}/>}
    </Group>)}
    <Text x={placement.x} y={placement.y} visible={!hideLabel}
      offsetX={Math.max(96,label.length*9)*textScale/2} offsetY={6*textScale} width={Math.max(96,label.length*9)*textScale}
      align="center" rotation={angle} text={label} fontSize={12*textScale}
      fontFamily="IBM Plex Sans, sans-serif" fill={color}
      onClick={onEdit ? e=>{e.cancelBubble=true;onEdit(e.evt);}:undefined}
      onTap={onEdit ? e=>{e.cancelBubble=true;onEdit(e.evt);}:undefined}/>
  </Group>;
}
