import {useEffect,useRef} from "react";
import {Circle,Group,Line,Text} from "react-konva";
import type Konva from "konva";
import type {CadDrawing} from "@/lib/cad/types";
import type {Pt} from "@/lib/geometry";
import {useProject,drawingForEditing} from "@/lib/project-store";
import {roundingBase,setFaceCornerRadii} from "@/lib/cad/rounding-engine";
import {roundedBounds,roundingCorners} from "@/lib/cad/corner-rounding";
import {faceCentroid,moveFace,moveVertex,rotateFace,setRectFromDiag} from "@/lib/cad/engine";
import {commitCornerGeometry,previewCornerGeometry,roundingSelection,selectRoundingCorner,useCornerRounding} from "@/lib/corner-rounding-store";
import {UI_SCALE} from "@/lib/ui-scale";
import {formatLenU} from "@/lib/units";
import {EditPointGlyph,EDIT_HANDLE_COLOR,RotationHandleGlyph} from "./edit-handle-glyphs";
import {DimensionLine} from "./dimension-line";

type Props={px:number;panX:number;panY:number;editDrag:{current:boolean};skipClick:{current:boolean};gestureBlocked:{current:boolean}};
type Event=Konva.KonvaEventObject<MouseEvent|TouchEvent>;

export function CornerRoundingHandles({px,panX,panY,editDrag,skipClick,gestureBlocked}:Props) {
  const project=useProject(s=>s.project),unit=useProject(s=>s.units.length),ui=useProject(s=>UI_SCALE[s.uiSize]);
  const state=useCornerRounding(),drag=useRef<{drawing:CadDrawing;indices:number[];index:number}|null>(null);
  useEffect(()=>()=>{editDrag.current=false;},[editDrag]);
  const id=state.faceId;if(!id)return null;
  const drawing=state.preview?.base===project?state.preview.drawing:drawingForEditing(project),face=drawing.faces[id],points=roundingBase(drawing,id);
  if(!face||!points)return null;
  const corners=roundingCorners(points),selected=roundingSelection(drawing,id),offset=24*ui/px;
  const screen=(p:Pt)=>({x:panX+p.x*px,y:panY+p.y*px});
  const position=(i:number,r:number)=>{const c=corners[i]!;return screen({x:c.point.x+c.direction.x*(offset+r*c.centerFactor),y:c.point.y+c.direction.y*(offset+r*c.centerFactor)});};
  const stop=(e:Event)=>{e.cancelBubble=true;};
  const update=(e:Event)=>{
    e.cancelBubble=true;const start=drag.current;if(!start||gestureBlocked.current)return;
    const corner=roundingCorners(roundingBase(start.drawing,id)!) [start.index]!;
    const pos=e.target.getAbsolutePosition(),p={x:(pos.x-panX)/px,y:(pos.y-panY)/px};
    const requested=Math.max(0,((p.x-corner.point.x)*corner.direction.x+(p.y-corner.point.y)*corner.direction.y-offset)/corner.centerFactor);
    const next=setFaceCornerRadii(start.drawing,id,start.indices,requested);
    previewCornerGeometry(next.drawing);
    e.target.position(position(start.index,next.radius));
  };
  const radii=selected.map(i=>face.rounding?.radii[i]??0),same=radii.every(r=>Math.abs(r-(radii[0]??0))<1e-7);
  const active=drag.current?.index??(selected.length===1?selected[0]:undefined);
  return <Group>
    {corners.map((corner,i)=>{
      if(!corner)return null;const radius=face.rounding?.radii[i]??0,p=position(i,radius),on=selected.includes(i);
      return <Group key={points[i]!.id}>
        <Line points={[...Object.values(screen(corner.point)),p.x,p.y]} stroke={EDIT_HANDLE_COLOR} strokeWidth={ui} dash={[3*ui,4*ui]} opacity={on ? .7 : .3} listening={false}/>
        <Group name={`round-corner-${i}`} x={p.x} y={p.y} draggable dragDistance={4*ui}
          onMouseDown={stop} onTouchStart={stop} onClick={e=>{stop(e);selectRoundingCorner(i,e.evt.shiftKey);}} onTap={e=>{stop(e);selectRoundingCorner(i);}}
          onDragStart={e=>{stop(e);if(gestureBlocked.current){e.target.stopDrag();return;}editDrag.current=true;
            const base=drawingForEditing(useProject.getState().project);let indices=roundingSelection(base,id);
            if(!indices.includes(i)){useCornerRounding.setState({selected:[i]});indices=[i];}drag.current={drawing:base,indices,index:i};}}
          onDragMove={update} onDragEnd={e=>{update(e);editDrag.current=false;skipClick.current=true;drag.current=null;commitCornerGeometry(id);}}
          onTouchCancel={(e:Event)=>{stop(e);drag.current=null;editDrag.current=false;useCornerRounding.setState({preview:null});}}>
          <Circle radius={22*ui} fill="rgba(255,255,255,.001)"/>
          <Circle radius={6*ui} fill={on?EDIT_HANDLE_COLOR:"#fff"} stroke={EDIT_HANDLE_COLOR} strokeWidth={1.5*ui}/>
          {on&&<Circle radius={2*ui} fill="#fff" listening={false}/>}
        </Group>
      </Group>;
    })}
    {selected.length>0&&<Text x={position(active??selected[0]!,face.rounding?.radii[active??selected[0]!]??0).x+13*ui}
      y={position(active??selected[0]!,face.rounding?.radii[active??selected[0]!]??0).y-21*ui}
      text={active!==undefined||same?`R ${formatLenU(active!==undefined?face.rounding?.radii[active]??0:radii[0]??0,unit)}`:""}
      fontSize={14*ui} fill={EDIT_HANDLE_COLOR} stroke="#fff" strokeWidth={3*ui} fillAfterStrokeEnabled listening={false}/>}
  </Group>;
}

/** Source-vertex handles keep rounded figures editable without replacing arcs by straight sides. */
export function RoundedFigureHandles({faceId,px,panX,panY,editDrag,skipClick,gestureBlocked}:Props&{faceId:string}) {
  const project=useProject(s=>s.project),ui=useProject(s=>UI_SCALE[s.uiSize]),unit=useProject(s=>s.units.length),preview=useCornerRounding(s=>s.preview);
  const drawing=preview?.base===project?preview.drawing:drawingForEditing(project),face=drawing.faces[faceId];
  const drag=useRef<{drawing:CadDrawing;center:Pt;startAngle:number}|null>(null);
  useEffect(()=>()=>{editDrag.current=false;},[editDrag]);
  if(!face?.rounding||face.locked)return null;
  const corners=face.rounding.corners,center=faceCentroid(drawing,faceId),screen=(p:Pt)=>({x:p.x*px+panX,y:p.y*px+panY});
  const world=(node:Konva.Node)=>{const p=node.getAbsolutePosition();return {x:(p.x-panX)/px,y:(p.y-panY)/px};};
  const begin=(e:Event)=>{e.cancelBubble=true;if(gestureBlocked.current){e.target.stopDrag();return;}editDrag.current=true;
    const d=drawingForEditing(useProject.getState().project),center=faceCentroid(d,faceId),p=world(e.target);
    drag.current={drawing:d,center,startAngle:Math.atan2(p.y-center.y,p.x-center.x)};};
  const update=(e:Event,mode:"move"|"rotate"|number)=>{
    e.cancelBubble=true;const start=drag.current;if(!start||gestureBlocked.current)return;
    const p=world(e.target),f=start.drawing.faces[faceId]!;
    const next=mode==="move"?moveFace(start.drawing,faceId,p.x-start.center.x,p.y-start.center.y)
      :mode==="rotate"?rotateFace(start.drawing,faceId,(Math.atan2(p.y-start.center.y,p.x-start.center.x)-start.startAngle)*180/Math.PI,start.center)
      :f.rect?setRectFromDiag(start.drawing,faceId,f.rounding!.corners[(mode+2)%4]!,p)
      :moveVertex(start.drawing,f.rounding!.corners[mode]!.id,p);
    previewCornerGeometry(next);
  };
  const events=(mode:"move"|"rotate"|number)=>({onMouseDown:(e:Event)=>{e.cancelBubble=true;},onTouchStart:(e:Event)=>{e.cancelBubble=true;},onDragStart:begin,
    onDragMove:(e:Event)=>update(e,mode),onDragEnd:(e:Event)=>{update(e,mode);drag.current=null;editDrag.current=false;skipClick.current=true;commitCornerGeometry(faceId);},
    onTouchCancel:(e:Event)=>{e.cancelBubble=true;drag.current=null;editDrag.current=false;useCornerRounding.setState({preview:null});}});
  const rotation={x:center.x,y:Math.min(...corners.map(p=>p.y))-40*ui/px};
  const bounds=roundedBounds(corners,face.rounding.radii),lo=screen({x:bounds.minX,y:bounds.minY}),hi=screen({x:bounds.maxX,y:bounds.maxY});
  return <Group>
    {drawing.layers?.dims?.visible!==false&&<Group listening={false}>
      <DimensionLine a={{x:lo.x,y:hi.y+30*ui}} b={{x:hi.x,y:hi.y+30*ui}} label={formatLenU(bounds.width,unit)} color={EDIT_HANDLE_COLOR} visualScale={ui}/>
      <DimensionLine a={{x:hi.x+30*ui,y:lo.y}} b={{x:hi.x+30*ui,y:hi.y}} label={formatLenU(bounds.height,unit)} color={EDIT_HANDLE_COLOR} visualScale={ui}/>
    </Group>}
    {corners.map((p,i)=><Group key={p.id} {...screen(p)} draggable {...events(i)}><Circle radius={22*ui} fill="rgba(255,255,255,.001)"/><Group scaleX={ui} scaleY={ui}><EditPointGlyph corner/></Group></Group>)}
    <Group {...screen(center)} draggable {...events("move")}><Circle radius={22*ui} fill="rgba(255,255,255,.001)"/><Line points={[-9*ui,0,9*ui,0]} stroke={EDIT_HANDLE_COLOR} strokeWidth={2*ui}/><Line points={[0,-9*ui,0,9*ui]} stroke={EDIT_HANDLE_COLOR} strokeWidth={2*ui}/></Group>
    <Line points={[screen(center).x,screen(center).y,screen(rotation).x,screen(rotation).y]} stroke={EDIT_HANDLE_COLOR} dash={[3*ui,4*ui]} opacity={.4} listening={false}/>
    <Group {...screen(rotation)} draggable {...events("rotate")}><Circle radius={22*ui} fill="rgba(255,255,255,.001)"/><Group scaleX={ui} scaleY={ui}><RotationHandleGlyph/></Group></Group>
  </Group>;
}
