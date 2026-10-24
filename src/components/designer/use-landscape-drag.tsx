import {useEffect,useLayoutEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {useProject} from '@/lib/project-store';
import {defaultLandscapeSize,defaultLandscapeKeepRatio,landscapeName,type LandscapeRecord} from '@/lib/landscape-objects';
import {plantName} from '@/lib/catalog-localization';
import type {PlantRecord} from '@/lib/landscape-types';
import {libraryPointerDrag,libraryDropPoint} from './library-pointer-drag';
import {formatLenU} from '@/lib/units';
import {drawingOrMigrate} from '@/lib/cad/engine';
import {visibleProjectHeads} from '@/lib/head-visibility';
import {snapLandscapePoint,landscapeAlignmentGuides} from '@/lib/landscape-snapping';
import {cadSnap} from '@/lib/cad/snap';
import {setPlacementFocus} from './placement-focus';
import {PlantThumbnail,LandscapeObjectThumbnail} from './landscape-thumbnail';

export type LandscapeLibraryItem={kind:'plant';record:PlantRecord}|{kind:'object';record:LandscapeRecord};
type Ghost={item:LandscapeLibraryItem;x:number;y:number;pointerType:string};

function LandscapeDragPreview({ghost}:{ghost:Ghost}){
  const state=useProject(),canvas=document.querySelector<HTMLElement>('[data-design-canvas]'),rect=canvas?.getBoundingClientRect();
  const target=document.elementFromPoint(ghost.x,ghost.y);
  const raw=rect&&target&&canvas?.contains(target)&&!target.closest('button,input,aside,[role=dialog],[data-mobile-sheet],.floating-toolbar,.workspace-tool-strip')
    ?libraryDropPoint(ghost.x,ghost.y,rect,state):null;
  const object=ghost.item.kind==='object'?{id:'pending-landscape',catalogId:ghost.item.record.id,category:ghost.item.record.category,...defaultLandscapeSize(ghost.item.record),x:0,y:0,rotation:0,keepRatio:defaultLandscapeKeepRatio(ghost.item.record),noIrrigation:ghost.item.record.category!=='lighting',visualMode:state.landscapeVisualMode}:null;
  const drawing=drawingOrMigrate(state.project);
  const hit=raw?(object?snapLandscapePoint(raw,object,drawing,{pxPerMeter:state.pxPerMeter,snapOn:state.snapOn,snapGridOn:state.snapOn&&state.snapGridOn,gridStep:state.gridStep,heads:visibleProjectHeads(state.project),pointerType:ghost.pointerType}):
    cadSnap(raw,drawing,{pxPerMeter:state.pxPerMeter,snapOn:state.snapOn,snapGridOn:state.snapOn&&state.snapGridOn,gridStep:state.gridStep,heads:visibleProjectHeads(state.project)})):null;
  const point=hit?.pt??null;
  useLayoutEffect(()=>{setPlacementFocus('catalog-landscape',point,undefined,hit?.kind);return()=>setPlacementFocus('catalog-landscape',null);},[point?.x,point?.y,hit?.kind]);
  const guides=point&&object&&state.snapOn?landscapeAlignmentGuides(point,object,drawing,state.pxPerMeter):[];
  const x=(v:number)=>(rect?.left??0)+state.panX+v*state.pxPerMeter,y=(v:number)=>(rect?.top??0)+state.panY+v*state.pxPerMeter;
  return <>
    {rect&&point&&<svg aria-hidden="true" style={{position:'fixed',inset:0,width:'100vw',height:'100dvh',zIndex:10001,pointerEvents:'none'}}>
      <defs><clipPath id="landscape-preview-clip"><rect x={rect.left} y={rect.top} width={rect.width} height={rect.height}/></clipPath></defs>
      <g clipPath="url(#landscape-preview-clip)">{guides.map(g=><line key={g.axis} x1={x(g.anchor.x)} y1={y(g.anchor.y)} x2={x(g.axis==='x'?g.anchor.x:g.point.x)} y2={y(g.axis==='y'?g.anchor.y:g.point.y)} stroke={g.aligned?'#12a647':'#ed4242'} strokeWidth="1.25" strokeDasharray="6 5"/>)}</g>
      <g transform={`translate(${x(point.x)} ${y(point.y)})`} fill="none"><path d="M-12 0H-3M3 0H12M0-12V-3M0 3V12" stroke="white" strokeWidth="3"/><path d="M-12 0H-3M3 0H12M0-12V-3M0 3V12" stroke="#244137" strokeWidth="1"/></g>
    </svg>}
    <div className="landscape-drag-preview" aria-hidden="true" style={{left:point?x(point.x):ghost.x,top:point?y(point.y):ghost.y}}>
      {ghost.item.kind==='plant'?<PlantThumbnail plant={{kind:ghost.item.record.category??'tree',catalog:ghost.item.record}} mode={state.landscapeVisualMode} draggable={false} alt=""/>:<LandscapeObjectThumbnail object={ghost.item.record} mode={state.landscapeVisualMode} draggable={false} alt=""/>}
      {ghost.item.kind==='object'&&<span>{landscapeName(ghost.item.record)}</span>}
      <span>{ghost.item.kind==='plant'?`⌀ ${formatLenU(ghost.item.record.defaultDiameterM??ghost.item.record.matureWidthM?.max??1,state.units.length)}`:ghost.item.record.shape==='circle'?`⌀ ${formatLenU(defaultLandscapeSize(ghost.item.record).length,state.units.length)}`:`${formatLenU(defaultLandscapeSize(ghost.item.record).length,state.units.length)} × ${formatLenU(defaultLandscapeSize(ghost.item.record).width,state.units.length)}`}</span>
    </div>
  </>;
}
export function prepareLibraryItem(item:LandscapeLibraryItem) {
  useProject.setState({pendingCatalogPlant:null,pendingLandscapeObject:null});
  const state=useProject.getState();
  if(item.kind==='plant')state.preparePlant(item.record,item.record.category??'tree',item.record.defaultDiameterM??item.record.matureWidthM?.max??1,state.landscapeVisualMode);
  else state.prepareLandscape(item.record.id,{...defaultLandscapeSize(item.record),rotation:0,keepRatio:defaultLandscapeKeepRatio(item.record),visualMode:state.landscapeVisualMode});
}
export function placeLibraryItem(item:LandscapeLibraryItem,point:{x:number;y:number},pointerType?:string) {
  prepareLibraryItem(item);
  const state=useProject.getState();
  const before=state.project;
  if(item.kind==='plant')state.placeCatalogPlant(point);else state.placeLandscape(point,pointerType);
  useProject.setState({pendingCatalogPlant:null,pendingLandscapeObject:null});
  return useProject.getState().project!==before;
}
export function useLandscapeDrag(mobile:boolean) {
  const cleanup=useRef<()=>void>(()=>{});
  const [ghost,setGhost]=useState<Ghost|null>(null);
  useEffect(()=>()=>cleanup.current(),[]);
  const begin=(e:ReactPointerEvent<HTMLButtonElement>,item:LandscapeLibraryItem)=>{
    if(e.button!==0||!e.isPrimary)return;
    e.stopPropagation();cleanup.current();
    const pointerType=e.pointerType;
    cleanup.current=libraryPointerDrag(window,e,{
      preview:(x,y)=>{document.documentElement.dataset.landscapeDrag='true';setGhost({item,x,y,pointerType});},
      drop:(x,y)=>{
        if(!mobile&&Array.from(document.querySelectorAll<HTMLElement>('.landscape-object-library,.info-panel')).some(panel=>{
          const r=panel.getBoundingClientRect();return r.width>0&&r.height>0&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;
        }))return;
        const canvas=document.querySelector<HTMLElement>('[data-design-canvas]'),target=document.elementFromPoint(x,y);
        if(!canvas||!target||!canvas.contains(target)||target.closest('button,input,aside,[role=dialog],[data-mobile-sheet],.floating-toolbar,.workspace-tool-strip'))return;
        const state=useProject.getState();if(state.workspaceSection!=='landscape')return;
        const point=libraryDropPoint(x,y,canvas.getBoundingClientRect(),state);if(!point)return;
        if(placeLibraryItem(item,point,pointerType)&&mobile)useProject.setState({landscapeOpen:false});
      },
      end:()=>{delete document.documentElement.dataset.landscapeDrag;setGhost(null);},
    });
  };
  const keyboard=(item:LandscapeLibraryItem)=>{prepareLibraryItem(item);if(mobile)useProject.setState({landscapeOpen:false,rightOpen:false});};
  const preview=ghost&&createPortal(<LandscapeDragPreview ghost={ghost}/>,document.body);
  return {begin,keyboard,preview};
}
