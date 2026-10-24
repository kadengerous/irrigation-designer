import {useLayoutEffect,useRef,useState} from 'react';
import type Konva from 'konva';
import {Group,Rect,Text} from 'react-konva';
import type {CadText} from '@/lib/cad/types';
import {EDIT_HANDLE_COLOR} from './edit-handle-glyphs';

/** Hit-test the rendered annotation, including its resize handles. */
export function canvasNoteHit(stage:Konva.Stage|null,point:{x:number;y:number}) {
 const hit=stage?.getIntersection(point);
 let node:Konva.Node|null=hit??null;
 while(node){
  const id=node.getAttr('noteId');
  if(typeof id==='string')return {id,node,resize:hit?.getAttr('noteCorner')!==undefined};
  node=node.getParent();
 }
 return null;
}

export function CanvasNote({note,x,y,px,ink,enabled,selected,onBegin,onSelect,onResize}:{
  note:CadText;x:number;y:number;px:number;ink:string;enabled:boolean;selected:boolean;
  onBegin:(e:Konva.KonvaEventObject<PointerEvent|TouchEvent>)=>void;onSelect:()=>void;
  onResize:(corner:number,bounds:{width:number;height:number},e:Konva.KonvaEventObject<PointerEvent|TouchEvent>)=>void;
}) {
  const ref=useRef<Konva.Text>(null);
  const [bounds,setBounds]=useState({width:1,height:1});
  const font=note.fontFamily ?? "IBM Plex Sans";
  const fontSize=Math.max(1,note.size*px);
  const fontStyle=[note.bold?"bold":"",note.italic?"italic":""].filter(Boolean).join(" ") || "normal";
  useLayoutEffect(()=>{
    let alive=true;
    const measure=()=>{if(alive && ref.current) setBounds({width:Math.max(1,ref.current.width()),height:Math.max(1,ref.current.height())});};
    measure();
    document.fonts?.load(`${fontStyle} ${fontSize}px "${font}"`,note.text).then(()=>{
      if(!alive || !ref.current) return;
      // Refresh Konva's cached text metrics after the web font becomes available.
      ref.current.fontFamily("sans-serif");ref.current.fontFamily(font);measure();ref.current.getLayer()?.batchDraw();
    }).catch(()=>{});
    return ()=>{alive=false;};
  },[font,fontSize,fontStyle,note.text]);
  const select=(e:Konva.KonvaEventObject<MouseEvent|TouchEvent>)=>{e.cancelBubble=true;onSelect();};
  return <Group x={x} y={y} name="drawing-annotation" noteId={note.id} listening={enabled}
    onPointerDown={onBegin} onTouchStart={onBegin} onClick={select} onTap={select} onDblClick={select} onDblTap={select}>
    <Rect name="drawing-annotation" x={-5} y={-5} width={bounds.width+10} height={bounds.height+10}
      fill="rgba(0,0,0,0.001)" stroke={selected?EDIT_HANDLE_COLOR:undefined} strokeWidth={1.2} dash={[5,4]} />
    <Text ref={ref} name="drawing-annotation" text={note.text} fontSize={fontSize} fontFamily={font}
      fontStyle={fontStyle} textDecoration={note.underline?"underline":""} fill={note.color ?? ink} listening={false}/>
    {selected && [[-5,-5],[bounds.width+5,-5],[bounds.width+5,bounds.height+5],[-5,bounds.height+5]].map(([hx,hy],i)=><Rect
      key={i} noteCorner={i} x={hx!-5} y={hy!-5} width={10} height={10} cornerRadius={1} fill="#fff" stroke={EDIT_HANDLE_COLOR} strokeWidth={1.5} hitStrokeWidth={22}
      onPointerDown={e=>onResize(i,bounds,e)} onTouchStart={e=>onResize(i,bounds,e)}/>)}
  </Group>;
}

