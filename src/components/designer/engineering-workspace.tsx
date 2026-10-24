import {EngineeringAssemblyEditor} from './engineering-assembly';
import {AUTO_ROUTE_CAPTURE_M,emptyAutoRouteDraft,describeAutoRoute,buildAutoRoute,tapAutoRoute,undoAutoRoute,type AutoRouteDraft} from '@/lib/engineering-auto-route-draft';
import {AUTO_ROUTE_INSET_M,hitRouteHead,type HeadRouteError} from '@/lib/engineering-head-route';
import {pinAutoConnections,materializePipeJunctions} from '@/lib/engineering-connections';
import {bindPipeToZone,unbindPipeFromZone} from '@/lib/engineering-zone-route';
import {routeNodeInsertion,snapRouteNodeToNeighbors} from './engineering-route-interaction';
import {engineeringInk as ink,pipeStrokeWidth,pipeOutlineWidth,pipeTotals} from '@/lib/engineering-pipe-display';
import {useEffect,useMemo,useRef,useState,type PointerEvent as Pointer,type MouseEvent as Mouse} from 'react';
import {Copy,Trash2,Pencil,RotateCcw,RotateCw,MousePointer2,Magnet,Grid3x3,Plus,Minus,Check,X,ChevronLeft,ChevronRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useProject} from '@/lib/project-store';
import {text as t,formatNumber} from '@/lib/i18n';
import {drawingOrMigrate} from '@/lib/cad/engine';
import type {Pt} from '@/lib/geometry';
import {equipmentSymbolDimensions,EQUIPMENT_LIBRARY,FIELD_CONNECTIONS,EQUIPMENT,PIPE_DIAMETERS_MM,emptyEngineering,engineeringCategory,engineeringKey,equipmentPorts,moveEngineering,transformEngineeringEquipment,insertEngineeringNode,removeEngineeringNode,newEquipment,nextNumber,routeLength,snapEngineering,type EngineeringElement,type EngineeringEquipment,type EquipmentKind,type PipeKind} from '@/lib/engineering';
import {fromMeters,toMetersLen,formatLenU,fromLpm,toLpm,flowLabel,lenLabel,fromMmPipe,pipeLabel,fromBar,toBar,pressureLabel} from '@/lib/units';
import {moveEquipmentLeader,EngineeringLeader,EngineeringGlyph,EngineeringIcon,EngineeringThumb,AutoRouteIcon} from './engineering-symbol';
import {DesignCanvas} from './design-canvas';
import type {DesignCanvasProps} from './canvas-types';
import {LocalizedNumberInput} from './localized-number-input';
import {EngineeringZones,EngineeringSprinklers} from './engineering-zones';
import {engineeringFocusZone,sortEngineeringNetworks,ENGINEERING_NETWORK_COLORS,type EngineeringFocus} from '@/lib/engineering-view';
import {calculateEngineering,isConsumer} from '@/lib/engineering-hydraulics';
import {HydraulicPanel,TankRecommendationPanel,CircuitSelect,circuitName} from './engineering-hydraulic-panel';
import {AutoPipeDrawing} from './engineering-auto-pipe';
import {zoneLabel} from '@/lib/project-types';
import {InspectorCard,normalizeInspectorPath,toggleInspectorPath} from './inspector-card';
import {EngineeringGroupActions} from './inspector-group-actions';
import './engineering.css';

type Tool=EquipmentKind|PipeKind|'cable'|'autoPipe'|null;
type UI={tab:'equipment'|'networks'|'assembly';selected:string|null;expanded:string[];scroll:number;focus?:EngineeringFocus};
const memory=new Map<string,UI>();
const pipeTypes:PipeKind[]=['main','zonePipe','otherPipe','dripLine'];
const isRoute=(tool:Tool)=>tool==='autoPipe'||tool==='cable'||pipeTypes.includes(tool as PipeKind);
const dash=(e:EngineeringElement)=>e.kind==='cable'?'9 5 2 5':e.kind==='pipe'&&e.type==='dripLine'?'2 4':e.kind==='pipe'&&e.type==='otherPipe'?'8 5':undefined;
const title=(e:EngineeringElement)=>e.name||`${t('engineering.'+(e.kind==='equipment'&&e.type==='valve'?'valveName':engineeringKey(e)))} ${formatNumber(e.number,0)}`;
type Drag={leader?:boolean;start:Pt;client:Pt;pan:Pt;id?:string;headId?:string;node?:number;transform?:'resize'|'rotate';original?:EngineeringElement;nodeAction?:'add'|'remove';panning?:boolean;moved:boolean};

export function EngineeringWorkspace({onExportReady}:Pick<DesignCanvasProps,'onExportReady'>){
 const project=useProject(s=>s.project),px=useProject(s=>s.pxPerMeter),panX=useProject(s=>s.panX),panY=useProject(s=>s.panY);
 const spaceDown=useProject(s=>s.spaceDown);
 const units=useProject(s=>s.units),locale=useProject(s=>s.locale);useProject(s=>s.numberFormat);
 const snapOn=useProject(s=>s.snapOn),grid=useProject(s=>s.showGrid),gridSnap=useProject(s=>s.snapGridOn),step=useProject(s=>s.gridStep);
 const data=project.engineering??emptyEngineering(),drawing=useMemo(()=>drawingOrMigrate(project),[project.drawing,project.polygons]);
 const initial=memory.get(project.id)??{tab:'equipment',selected:null,expanded:['irrigationZones'],scroll:0};
 const [focus,setFocus]=useState<EngineeringFocus>(initial.focus??null);
 const [tab,setTab]=useState<UI['tab']>(initial.tab==='assembly'?'equipment':initial.tab),[selected,setSelected]=useState<string|null>(initial.selected),[expanded,setExpanded]=useState<string[]>(()=>normalizeInspectorPath(initial.expanded));
 const [library,setLibrary]=useState(true),[scheme,setScheme]=useState(false),[tool,setTool]=useState<Tool>(null),[draft,setDraft]=useState<Pt[]>([]),[extending,setExtending]=useState<string|null>(null);
 const [hover,setHover]=useState<Pt|null>(null),[snap,setSnap]=useState<Pt|null>(null),[preview,setPreview]=useState<EngineeringElement|null>(null),[node,setNode]=useState<number|null>(null);
 const stage=useRef<SVGSVGElement>(null),list=useRef<HTMLDivElement>(null),drag=useRef<Drag|null>(null),catalogPlaced=useRef(false),pointers=useRef(new Map<number,Pt>()),pinch=useRef<{distance:number;center:Pt;px:number;pan:Pt}|null>(null);
 const [diameter,setDiameter]=useState(32);
 const [nodeMode,setNodeMode]=useState<'add'|'remove'|null>(null),[panning,setPanning]=useState(false);
 const [bindZone,setBindZone]=useState<number|''>(''),[bindError,setBindError]=useState<HeadRouteError|null>(null);
 const [assemblyEditor,setAssemblyEditor]=useState<string|null>(null);
 const [editing,setEditing]=useState<string|null>(null);
 const autoDraft=useRef<AutoRouteDraft>(emptyAutoRouteDraft());
 const [autoError,setAutoError]=useState<HeadRouteError|null>(null);
 const hasAuto=Object.values(data.elements).some(e=>e.kind==='pipe'&&e.auto);
 const pinnedData=useMemo(()=>pinAutoConnections(project,data),[project.engineering,project.heads]);
 const editableData=useMemo(()=>{const e=selected?pinnedData.elements[selected]:undefined;if(e?.kind!=='pipe'||!e.auto)return pinnedData;const materialized=materializePipeJunctions({...project,engineering:pinnedData},e);return materialized===e?pinnedData:{...pinnedData,elements:{...pinnedData.elements,[e.id]:materialized}};},[project,pinnedData,selected]);
 const displayProject=useMemo(()=>{if(!preview)return {...project,engineering:editableData};const original=pinnedData.elements[preview.id],element=preview.kind==='pipe'&&preview.auto&&original?.kind==='pipe'?{...preview,auto:{...preview.auto,consumerIds:original.auto?.consumerIds}}:preview;return {...project,engineering:{...editableData,elements:{...editableData.elements,[preview.id]:element}}};},[project,pinnedData,editableData,preview]);
 const hydraulic=useMemo(()=>hasAuto?calculateEngineering(displayProject):null,[displayProject.engineering,displayProject.heads,displayProject.zones,hasAuto]);
 const totals=useMemo(()=>pipeTotals(displayProject,hydraulic?.edges??[]),[displayProject.engineering,hydraulic]);
 const autoInfo=useMemo(()=>describeAutoRoute(project,autoDraft.current,extending??undefined),[project.engineering,project.heads,project.zones,draft,extending]);
 const autoPreview=useMemo(()=>tool==='autoPipe'&&hover?describeAutoRoute(project,{...autoDraft.current,waypoints:true,steps:[...autoDraft.current.steps,{point:hover}]},extending??undefined):autoInfo,[tool,hover,autoInfo,project]);
 const itemTitle=(e:EngineeringElement)=>e.name||(e.kind==='pipe'&&e.auto?.circuit.startsWith('zone:')?t('engineering.zonePipeline',{zone:circuitName(project,e.auto.circuit)}):title(e));
 const item=selected?editableData.elements[selected]:undefined,locked=!!item&&!!data.categories[engineeringCategory(item)]?.locked;
 const current=()=>useProject.getState().project.engineering??emptyEngineering();
 const commit=(e:EngineeringElement)=>{const d=current();useProject.getState().commitEngineering({...d,elements:{...d.elements,[e.id]:e}});};
 const choose=(id:string|null)=>{if(id!==selected){setNodeMode(null);setHover(null);setBindZone('');setBindError(null);}setSelected(id);setEditing(v=>v===id?v:null);setNode(null);setFocus(null);if(id){setScheme(true);const e=current().elements[id];if(e)setExpanded([e.kind==='equipment'?'equipment':'networks']);}};
 const toggleExpanded=(key:string)=>setExpanded(v=>toggleInspectorPath(v,key));
 const focusHeads=(value:EngineeringFocus)=>{
  setFocus(value);setSelected(null);setEditing(null);setNode(null);setNodeMode(null);setHover(null);setBindError(null);setScheme(true);
  const zone=engineeringFocusZone(project.heads,value);
  if(value)setExpanded(['irrigationZones',...(zone!=null?[`zone:${zone}`]:[])]);
 };
 const remove=()=>{if(!item||locked)return;const d=current(),elements={...d.elements};delete elements[item.id];useProject.getState().commitEngineering({...d,elements});choose(null);};
 const patch=(value:Partial<EngineeringElement>)=>{if(item&&!locked)commit({...item,...value} as EngineeringElement);};
 const point=(clientX:number,clientY:number)=>{const r=stage.current!.getBoundingClientRect(),s=useProject.getState();return {x:(clientX-r.left-s.panX)/s.pxPerMeter,y:(clientY-r.top-s.panY)/s.pxPerMeter};};
 const snapped=(p:Pt,exclude?:string)=>{const s=useProject.getState(),hit=snapEngineering(p,current(),drawing,s.pxPerMeter,s.snapOn,s.snapGridOn,s.gridStep,exclude);setSnap(hit.hit?hit.point:null);return hit.point;};
 const cancel=()=>{for(const id of pointers.current.keys())if(stage.current?.hasPointerCapture(id))stage.current.releasePointerCapture(id);pointers.current.clear();pinch.current=null;drag.current=null;setPanning(false);setNodeMode(null);setPreview(null);setTool(null);setDraft([]);setExtending(null);setHover(null);setSnap(null);setAutoError(null);autoDraft.current=emptyAutoRouteDraft();};
 const deleteNode=()=>{if(!item||item.kind==='equipment'||locked||node==null||item.points.length<=2)return;commit(removeEngineeringNode(item,node));setNode(null);setHover(null);};
 const insertion=nodeMode==='add'&&hover&&item&&item.kind!=='equipment'&&!locked?routeNodeInsertion(item.points,hover):null;
 useEffect(()=>{if(!item||locked||data.categories[engineeringCategory(item)]?.hidden){setNodeMode(null);setNode(null);setHover(null);}},[selected,locked,item?.id,data.categories]);
 const extensionBase=extending?editableData.elements[extending]:undefined;
 const canUndoDraft=draft.length>(extensionBase&&extensionBase.kind!=='equipment'?extensionBase.points.length:0);
 const undoDraft=()=>{if(!canUndoDraft)return;if(tool==='autoPipe'){autoDraft.current=undoAutoRoute(autoDraft.current);setDraft(autoDraft.current.steps.map(s=>s.point));}else setDraft(p=>p.slice(0,-1));setHover(null);setSnap(null);setAutoError(null);};
 const finish=()=>{
  if(tool!=='autoPipe'&&draft.length<2)return;
  const d=current(),existing=extending?d.elements[extending]:null;
  let result:EngineeringElement|undefined;
  if(tool==='autoPipe'){
   const route=buildAutoRoute(useProject.getState().project,autoDraft.current,extending??undefined);
   if('error' in route){setAutoError(route.error);return;}
   const auto={...(existing?.kind==='pipe'?existing.auto:{}),circuit:`zone:${route.zone}`,captureM:route.waypoints?AUTO_ROUTE_CAPTURE_M:AUTO_ROUTE_INSET_M,consumerIds:route.headIds.map(id=>`head:${id}`),selection:'heads' as const,...(route.waypoints?{pathMode:'waypoints' as const}:{}),insetM:route.insetM??(existing?.kind==='pipe'?existing.auto?.insetM:undefined)??AUTO_ROUTE_INSET_M,...(route.figureId?{figureId:route.figureId}:{}),headStartIndex:route.headStartIndex,...(route.consumerNodes?{consumerNodes:route.consumerNodes}:{})};
   result=existing?.kind==='pipe'?{...existing,points:route.points,auto}:{id:crypto.randomUUID(),kind:'pipe',type:'zonePipe',number:nextNumber(d,'zonePipe'),points:route.points,diameterMm:32,label:true,auto};
  }
  else if(existing&&existing.kind!=='equipment'){
   const base=existing.kind==='pipe'&&existing.auto?materializePipeJunctions(useProject.getState().project,existing):existing;
   const points=autoDraft.current.fromStart?[...draft].reverse():draft,shift=points.length-base.points.length;
   result={...base,points,...(autoDraft.current.fromStart&&base.kind==='pipe'&&base.auto?{auto:{...base.auto,headStartIndex:(base.auto.headStartIndex??0)+shift,consumerNodes:Object.fromEntries(Object.entries(base.auto.consumerNodes??{}).map(([id,index])=>[id,index+shift]))}}:{})};
  }
  else if(tool==='cable')result={id:crypto.randomUUID(),kind:'cable',number:nextNumber(d,'cable'),points:draft,cableType:'',label:true};
  else if(pipeTypes.includes(tool as PipeKind))result={id:crypto.randomUUID(),kind:'pipe',type:tool as PipeKind,number:nextNumber(d,tool!),points:draft,diameterMm:tool==='dripLine'?16:diameter,label:true};
  if(result){commit(result);choose(result.id);}
  cancel();
 };
 const place=(type:EquipmentKind,p:Pt)=>{const e=newEquipment(current(),type,p);commit(e);choose(e.id);setTool(null);setSnap(null);setLibrary(false);if(type==='assembly')setAssemblyEditor(e.id);};
 useEffect(()=>{memory.set(project.id,{tab,selected,expanded,focus,scroll:list.current?.scrollTop??initial.scroll});},[project.id,tab,selected,expanded,focus]);
 useEffect(()=>{if(focus&&(focus.kind==='head'?!project.heads.some(h=>h.id===focus.id):!project.zones.some(z=>z.id===focus.id)))setFocus(null);},[project.heads,project.zones,focus]);
 useEffect(()=>{if(list.current)list.current.scrollTop=initial.scroll;},[]);
 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{
   if((event.target as HTMLElement).closest('input,textarea,select,[role="dialog"]'))return;
   if(event.key==='Escape'){event.preventDefault();cancel();choose(null);}
   if(event.key==='Enter'&&draft.length){event.preventDefault();finish();}
   if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();if(draft.length)undoDraft();else if(!tool){if(node!=null)deleteNode();else if(!nodeMode)remove();}}
  };
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
 });
 const zoom=(factor:number,center?:Pt)=>{const s=useProject.getState(),r=stage.current?.getBoundingClientRect();if(!r)return;const c=center??{x:r.width/2,y:r.height/2},next=Math.max(.1,Math.min(5000,s.pxPerMeter*factor));useProject.setState({pxPerMeter:next,panX:c.x-(c.x-s.panX)*next/s.pxPerMeter,panY:c.y-(c.y-s.panY)*next/s.pxPerMeter});};
 useEffect(()=>{const el=stage.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();const r=el.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),{x:e.clientX-r.left,y:e.clientY-r.top});};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[]);
 const onDown=(event:Pointer<SVGSVGElement>)=>{
  if(event.button!==0&&event.button!==1&&event.button!==2)return;
  event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
  pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pointers.current.size===2){if(tool==='autoPipe')autoDraft.current.lastTap=undefined;const [a,b]=[...pointers.current.values()],r=stage.current!.getBoundingClientRect();pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y),center:{x:(a.x+b.x)/2-r.left,y:(a.y+b.y)/2-r.top},px,pan:{x:panX,y:panY}};drag.current=null;setPreview(null);setHover(null);setSnap(null);setPanning(true);return;}
  const target=event.target as SVGElement,id=target.closest('[data-engineering-id]')?.getAttribute('data-engineering-id')??undefined;
  const headId=target.closest('[data-engineering-head-id]')?.getAttribute('data-engineering-head-id')??undefined;
  const rawHit=id?editableData.elements[id]:undefined,hit=rawHit?.kind==='pipe'&&rawHit.auto?materializePipeJunctions({...project,engineering:pinnedData},rawHit):rawHit,n=target.closest('[data-node]')?.getAttribute('data-node')??null;
  const handle=target.closest('[data-transform]')?.getAttribute('data-transform') as 'resize'|'rotate'|undefined;
  const panOnly=event.button!==0||useProject.getState().spaceDown;
  setPanning(panOnly);if(panOnly){setHover(null);setSnap(null);}
  drag.current={start:point(event.clientX,event.clientY),client:{x:event.clientX,y:event.clientY},pan:{x:panX,y:panY},moved:false,panning:panOnly,
   ...(!panOnly&&nodeMode?{nodeAction:nodeMode}:{}),
   ...((!tool||tool==='autoPipe')&&!panOnly&&headId?{headId}:{}),
   ...(!tool&&!panOnly&&!nodeMode&&hit?{id,...(!data.categories[engineeringCategory(hit)]?.locked?{original:hit,leader:!!target.closest('[data-equipment-leader]'),node:n==null?undefined:Number(n),transform:editing===hit.id?handle:undefined}:{})}:{})};
  if(!tool&&!panOnly&&nodeMode){if(nodeMode==='remove'&&id===selected)setNode(n==null?null:Number(n));}
  else if(!tool&&!panOnly&&hit){choose(hit.id);if(n!==null)setNode(Number(n));}
  else if(!tool&&!panOnly&&headId)focusHeads({kind:'head',id:headId});
 };
 const onMove=(event:Pointer<SVGSVGElement>)=>{
  if(pointers.current.has(event.pointerId))pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pinch.current&&pointers.current.size>=2){const [a,b]=[...pointers.current.values()],start=pinch.current,r=stage.current!.getBoundingClientRect(),next=Math.max(.1,Math.min(5000,start.px*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,start.distance)));useProject.setState({pxPerMeter:next,panX:(a.x+b.x)/2-r.left-(start.center.x-start.pan.x)*next/start.px,panY:(a.y+b.y)/2-r.top-(start.center.y-start.pan.y)*next/start.px});return;}
  const d=drag.current,p=point(event.clientX,event.clientY);
  if(!d){if(useProject.getState().spaceDown){setHover(null);setSnap(null);return;}if(nodeMode==='add'&&item&&item.kind!=='equipment'&&!locked){setHover(p);setSnap(null);return;}if(nodeMode==='remove'){setHover(p);setSnap(null);return;}if(tool==='autoPipe'){const head=hitRouteHead(project,p,px,.25);if(head){const next={x:head.x,y:head.y};setHover(next);setSnap(next);}else setHover(snapped(p,extending??undefined));}else if(tool)setHover(snapped(p));else setSnap(null);return;}
  if(Math.hypot(event.clientX-d.client.x,event.clientY-d.client.y)>(tool==='autoPipe'&&event.pointerType!=='mouse'?10:4))d.moved=true;
  if(!d.moved)return;
  if(d.nodeAction){if(d.nodeAction==='add'&&item&&item.kind!=='equipment'&&!locked){setHover(p);setSnap(null);}return;}
  if(d.original){
   if(d.leader&&d.original.kind==='equipment'){setSnap(null);setPreview(moveEquipmentLeader(d.original,d.start,p,px));}
   else if(d.transform&&d.original.kind==='equipment'){setSnap(null);setPreview(transformEngineeringEquipment(d.original,d.start,p,d.transform,px));}
   else if(d.node!==undefined&&d.original.kind!=='equipment'){const pts=[...d.original.points],straight=snapRouteNodeToNeighbors(pts,d.node,p,px,useProject.getState().snapOn);pts[d.node]=straight.hit?straight.point:snapped(p,d.id);if(straight.hit)setSnap(straight.point);setPreview({...d.original,points:pts});}
   else {const base=d.original.kind==='equipment'?d.original:d.original.points[0],next=snapped({x:base.x+p.x-d.start.x,y:base.y+p.y-d.start.y},d.id);setPreview(moveEngineering(d.original,next.x-base.x,next.y-base.y));}
  }else {setPanning(true);setHover(null);setSnap(null);useProject.getState().setPan(d.pan.x+event.clientX-d.client.x,d.pan.y+event.clientY-d.client.y);}
 };
 const onUp=(event:Pointer<SVGSVGElement>)=>{
  pointers.current.delete(event.pointerId);setPanning(false);
  if(pinch.current){if(!pointers.current.size)pinch.current=null;drag.current=null;return;}
  const d=drag.current;drag.current=null;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  if(!d)return;
  if(event.button!==0||d.panning||useProject.getState().spaceDown){if(tool==='autoPipe')autoDraft.current.lastTap=undefined;setPreview(null);setSnap(null);return;}
  if(d.nodeAction){if(d.nodeAction==='add'&&item&&item.kind!=='equipment'&&!locked){const at=routeNodeInsertion(item.points,point(event.clientX,event.clientY));if(at){commit(insertEngineeringNode(item,at.index,at.point));setNode(at.index);setNodeMode(null);setHover(null);setSnap(null);}}return;}
  if(d.moved){if(tool==='autoPipe')autoDraft.current.lastTap=undefined;if(preview)commit(preview);setPreview(null);setSnap(null);return;}
  if(tool==='autoPipe'){
   const raw=point(event.clientX,event.clientY),targetHead=d.headId?project.heads.find(h=>h.id===d.headId):undefined;
   const head=targetHead&&Math.hypot(d.start.x-targetHead.x,d.start.y-targetHead.y)<=Math.min(22/px,.25)?targetHead:hitRouteHead(project,raw,px,.25);
   const p=head?{x:head.x,y:head.y}:snapped(raw,extending??undefined);
   const next=tapAutoRoute(project,autoDraft.current,p,head?.id,event.timeStamp,px,extending??undefined,raw);
   autoDraft.current=next.draft;setAutoError(next.error??null);
   setDraft(next.draft.steps.map(s=>s.point));setHover(null);setSnap(null);setLibrary(false);
   if(next.finish)finish();return;
  }
  const p=tool?snapped(point(event.clientX,event.clientY)):point(event.clientX,event.clientY);
  if(!tool)setSnap(null);
  if(tool&&isRoute(tool)){setDraft(points=>points.length&&Math.hypot(p.x-points.at(-1)!.x,p.y-points.at(-1)!.y)*px<3?points:[...points,p]);setLibrary(false);}
  else if(tool)place(tool as EquipmentKind,p);
  else if(d.id&&editableData.elements[d.id]?.kind==='equipment'&&(editableData.elements[d.id] as EngineeringEquipment).type==='assembly')setAssemblyEditor(d.id);
  else if(!d.id&&!d.headId)choose(null);
 };
 const onDoubleClick=(event:Mouse<SVGSVGElement>)=>{
  event.preventDefault();
  if(tool==='autoPipe'){
   // Native mouse double-click is a fallback for the OS's configured interval.
   // Pointer/touch completion clears the refs, so this cannot create a duplicate.
   const last=autoDraft.current.lastTap,p=point(event.clientX,event.clientY);
   if(last&&autoDraft.current.lastTap&&autoDraft.current.steps.length>1&&Math.hypot(p.x-(last.pointerPoint??last.point).x,p.y-(last.pointerPoint??last.point).y)*px<=22)finish();
  }else if(tool&&isRoute(tool))finish();
 };
 const displayed=Object.values(editableData.elements).filter(e=>!data.categories[engineeringCategory(e)]?.hidden).map(e=>preview?.id===e.id?preview:e);
 const label=(e:EngineeringElement)=>e.kind==='pipe'?`${e.type==='dripLine'?t('engineering.dripLine')+' · ':''}Ø${formatNumber(fromMmPipe(e.diameterMm,units.pipe),units.pipe==='mm'?0:2)} ${pipeLabel(units.pipe)}`:e.kind==='cable'?(e.name||e.cableType||title(e)):title(e);
 const duplicate=()=>{if(!item||locked)return;const copy={...moveEngineering(item,24/px,24/px),id:crypto.randomUUID(),number:nextNumber(data,engineeringKey(item)),name:undefined};commit(copy);choose(copy.id);};
 const extend=(fromStart:boolean)=>{
  if(!item||item.kind==='equipment'||locked)return;
  cancel();setExtending(item.id);setNode(null);setEditing(null);
  const points=(fromStart?[...item.points].reverse():item.points).map(point=>({...point}));
  autoDraft.current={steps:points.map(point=>({point})),fromStart};
  if(item.kind==='pipe'&&item.auto?.selection==='heads'){
   const headIds=(item.auto.consumerIds??[]).filter(id=>id.startsWith('head:')).map(id=>id.slice(5)).filter(id=>project.heads.some(h=>h.id===id));
   autoDraft.current={...autoDraft.current,baseHeadIds:headIds,waypoints:true,established:true};setTool('autoPipe');
  }else setTool(item.kind==='pipe'?item.type:'cable');
  setDraft(points);setHover(points.at(-1)??null);setLibrary(false);setScheme(false);
 };
 const properties=item&&<section className="engineering-properties"><fieldset disabled={locked}>
     {item.kind==='pipe'&&item.auto&&item.auto.sizing!=='manual'&&<p>{t('engineering.autoPipe')}: {[...new Set(hydraulic?.edges.filter(e=>e.pipeId===item.id&&e.flow&&e.diameter).map(e=>e.diameter!)??[])].map(d=>`Ø${formatNumber(fromMmPipe(d,units.pipe),units.pipe==='mm'?0:2)}`).join(' / ')||'—'} {pipeLabel(units.pipe)}</p>}
     <label>{t('engineering.name')}<input key={item.id+':'+(item.name??'')} defaultValue={item.name??''} placeholder={itemTitle(item)} onBlur={e=>{if(e.target.value!== (item.name??''))patch({name:e.target.value.trim()||undefined});}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>
     {item.kind==='pipe'&&(!item.auto||item.auto.sizing==='manual')&&<label>{t('engineering.diameter')}<select data-pipe-diameter="true" value={item.diameterMm} onChange={e=>patch({diameterMm:Number(e.target.value)})}>{!PIPE_DIAMETERS_MM.includes(item.diameterMm as typeof PIPE_DIAMETERS_MM[number])&&<option value={item.diameterMm}>{formatNumber(fromMmPipe(item.diameterMm,units.pipe),units.pipe==='mm'?0:2)} {pipeLabel(units.pipe)}</option>}{PIPE_DIAMETERS_MM.map(d=><option key={d} value={d}>{formatNumber(fromMmPipe(d,units.pipe),units.pipe==='mm'?0:2)} {pipeLabel(units.pipe)}</option>)}</select></label>}
     {<label className="engineering-checkbox"><input type="checkbox" checked={item.label} onChange={e=>patch({label:e.target.checked})}/>{t('engineering.label')}</label>}
     {item.kind==='equipment'?<>
      {FIELD_CONNECTIONS.some(type=>type===item.type)&&<>{item.type!=='valveBox'&&<Numeric label={t(item.type==='roundValveBox'?'engineering.diameter':'engineering.symbolSize')} value={fromMeters(item.size,units.length)} min={fromMeters(.1,units.length)} max={fromMeters(50,units.length)} suffix={lenLabel(units.length)} onChange={v=>patch({size:toMetersLen(v,units.length)} as Partial<EngineeringEquipment>)}/>}</>}
      {item.type==='valveBox'&&(['boxLengthM','boxWidthM','boxDepthM'] as const).map(key=><Numeric key={key} label={t('engineering.'+key)} value={fromMeters(item[key]??.3,units.length)} min={fromMeters(.05,units.length)} max={fromMeters(5,units.length)} suffix={lenLabel(units.length)} onChange={v=>patch({[key]:toMetersLen(v,units.length),...(key==='boxLengthM'?{size:toMetersLen(v,units.length)}:{})} as Partial<EngineeringEquipment>)}/>)}
      {item.type==='roundValveBox'&&<Numeric label={t('engineering.boxDepthM')} value={fromMeters(item.boxDepthM??.25,units.length)} min={fromMeters(.05,units.length)} max={fromMeters(5,units.length)} suffix={lenLabel(units.length)} onChange={v=>patch({boxDepthM:toMetersLen(v,units.length)} as Partial<EngineeringEquipment>)}/>}
      {item.type==='assembly'&&<button type="button" onClick={()=>setAssemblyEditor(item.id)}>{t('assembly.open')}</button>}
      {isConsumer(item)&&<><Numeric label={t('engineering.flow')} value={item.flowLpm==null?null:fromLpm(item.flowLpm,units.flow)} min={0} suffix={flowLabel(units.flow)} onChange={v=>patch({flowLpm:toLpm(v,units.flow)})}/><Numeric label={t('engineering.pressure')} value={item.pressureBar==null?null:fromBar(item.pressureBar,units.pressure)} min={0} suffix={pressureLabel(units.pressure)} onChange={v=>patch({pressureBar:toBar(v,units.pressure)})}/><label>{t('zone')}<select value={item.zoneId??''} onChange={e=>patch({zoneId:e.target.value?Number(e.target.value):undefined})}><option value="">{t('engineering.independent')}</option>{project.zones.map(z=><option key={z.id} value={z.id}>{zoneLabel(z)}</option>)}</select></label></>}
      {item.type==='tank'&&<Numeric label={t('engineering.volume')} value={(item.volumeL??0)/(units.pipe==='in'?3.785411784:1)} min={0} suffix={t(units.pipe==='in'?'engineering.gallons':'engineering.litres')} onChange={v=>patch({volumeL:v*(units.pipe==='in'?3.785411784:1)} as Partial<EngineeringEquipment>)}/>}
      {['pump','pumpStation'].includes(item.type)&&<><Numeric label={t('engineering.flow')} value={fromLpm(item.flowLpm??0,units.flow)} min={0} suffix={flowLabel(units.flow)} onChange={v=>patch({flowLpm:toLpm(v,units.flow)} as Partial<EngineeringEquipment>)}/><Numeric label={t('engineering.head')} value={fromMeters(item.headM??0,units.length)} min={0} suffix={lenLabel(units.length)} onChange={v=>patch({headM:toMetersLen(v,units.length)} as Partial<EngineeringEquipment>)}/></>}
      {['reducer','regulator'].includes(item.type)&&<Numeric label={t('engineering.pressure')} value={fromBar(item.pressureBar??0,units.pressure)} min={0} suffix={pressureLabel(units.pressure)} onChange={v=>patch({pressureBar:toBar(v,units.pressure)} as Partial<EngineeringEquipment>)}/>}
      {item.type==='manifold'&&<Numeric label={t('engineering.outlets')} value={item.outlets??4} min={1} max={32} digits={0} onChange={v=>patch({outlets:Math.round(v)} as Partial<EngineeringEquipment>)}/>}
      {item.type==='controller'&&<Numeric label={t('engineering.zones')} value={item.zones??8} min={1} max={256} digits={0} onChange={v=>patch({zones:Math.round(v)} as Partial<EngineeringEquipment>)}/>}
     </>:<>
      <p><strong>{t('engineering.length')}</strong> <output>{formatLenU(routeLength((preview?.id===item.id&&preview.kind!=='equipment'?preview:item).points),units.length)}</output></p>
      {item.kind==='pipe'?<>
       {item.type==='dripLine'&&<><Numeric label={t('engineering.dripFlow')} value={item.flowLpm==null?null:fromLpm(item.flowLpm,units.flow)} min={0} suffix={flowLabel(units.flow)} onChange={v=>patch({flowLpm:toLpm(v,units.flow)})}/><Numeric label={t('engineering.dripPressure')} value={item.pressureBar==null?null:fromBar(item.pressureBar,units.pressure)} min={0} suffix={pressureLabel(units.pressure)} onChange={v=>patch({pressureBar:toBar(v,units.pressure)})}/><label>{t('zone')}<select value={item.zoneId??''} onChange={e=>patch({zoneId:e.target.value?Number(e.target.value):undefined})}><option value="">{t('engineering.independent')}</option>{project.zones.map(z=><option key={z.id} value={z.id}>{zoneLabel(z)}</option>)}</select></label><label>{t('engineering.dripStart')}<select value={item.dripStartId??''} onChange={e=>{const start=data.elements[e.target.value];patch({dripStartId:e.target.value||undefined,...(start?.kind==='equipment'?{points:[equipmentPorts(start)[0]!,...item.points.slice(1)]}:{})});}}><option value="">{t('engineering.lineBeginning')}</option>{Object.values(data.elements).filter(e=>e.kind==='equipment'&&e.type==='dripStart').map(e=><option key={e.id} value={e.id}>{itemTitle(e)}</option>)}</select></label><p className="engineering-help">{t('engineering.dripDataHint')}</p></>}
       {item.auto?<>
        {item.auto.selection!=='heads'&&<><CircuitSelect project={project} value={item.auto.circuit} onChange={circuit=>patch({auto:{...item.auto!,circuit},type:circuit==='main'?'main':'zonePipe'})}/><Numeric label={t('engineering.captureDistance')} value={fromMeters(item.auto.captureM,units.length)} min={fromMeters(.05,units.length)} max={fromMeters(10,units.length)} suffix={lenLabel(units.length)} onChange={v=>patch({auto:{...item.auto!,captureM:toMetersLen(v,units.length)}})}/></>}
       </>:<>
        <label>{t('engineering.pipeColor')}<input type="color" value={ink(item)} onChange={e=>patch({color:e.target.value})}/></label>
       </>}
       {item.type!=='dripLine'&&(!item.auto||item.auto.circuit.startsWith('zone:'))&&<div className="engineering-bind-zone">
        {!item.auto&&<label>{t('engineering.bindToZone')}<select data-bind-zone="true" value={bindZone} onChange={e=>{setBindZone(e.target.value===''?'':Number(e.target.value));setBindError(null);}}><option value="">{t('engineering.independentPipe')}</option>{project.zones.map(z=><option key={z.id} value={z.id}>{zoneLabel(z)}</option>)}</select></label>}
        {item.auto?<button type="button" data-unbind-zone="true" onClick={()=>{if(locked)return;commit(unbindPipeFromZone(item));setBindZone('');setBindError(null);setNode(null);setNodeMode(null);setHover(null);}}>{t('engineering.unbindFromZone')}</button>:<button type="button" disabled={bindZone===''} onClick={()=>{if(locked||bindZone==='')return;const result=bindPipeToZone(useProject.getState().project,item,bindZone);if('error' in result)setBindError(result.error);else{commit(result.pipe);setBindError(null);setNode(null);setNodeMode(null);setHover(null);}}}>{t('engineering.bindToZone')}</button>}
        {bindError&&<p role="alert">{t('engineering.'+bindError)}</p>}
       </div>}
      </>:<label>{t('engineering.cableType')}<input key={item.id+item.cableType} defaultValue={item.cableType} onBlur={e=>{if(item.cableType!==e.target.value)patch({cableType:e.target.value});}}/></label>}
      <p className="engineering-help" role={nodeMode?'status':undefined}>{t(nodeMode==='add'?'engineering.addNodeHint':nodeMode==='remove'?'engineering.removeNodeHint':'engineering.nodesHint')}</p><div className="engineering-actions">
       <button className="engineering-add-node" data-node-action="add" aria-pressed={nodeMode==='add'} onClick={()=>{cancel();setNodeMode(nodeMode==='add'?null:'add');setNode(null);}}><Plus/>{t('engineering.addNode')}</button>
       <button className="engineering-remove-node" data-node-selected={node!=null} data-node-action="remove" aria-pressed={nodeMode==='remove'} disabled={item.points.length<=2} onClick={()=>{if(node!=null){deleteNode();setNodeMode(null);}else{cancel();setNodeMode(nodeMode==='remove'?null:'remove');}}}><Minus/>{t('engineering.removeNode')}</button>
       <details key={item.id} className="engineering-extend"><summary>{t('engineering.extend')}</summary><div role="group" aria-label={t('engineering.extend')}><button type="button" data-extend-from="start" onClick={()=>extend(true)}>{t('engineering.extendFromStart')}</button><button type="button" data-extend-from="end" onClick={()=>extend(false)}>{t('engineering.extendFromEnd')}</button></div></details>
      </div>
     </>}
     <div className="engineering-actions">{item.kind==='equipment'&&<button aria-pressed={editing===item.id} onClick={()=>{cancel();setEditing(editing===item.id?null:item.id);}}><Pencil/>{t(editing===item.id?'engineering.finish':'edit')}</button>}{item.kind==='equipment'&&<button onClick={duplicate}><Copy/>{t('duplicate')}</button>}<button className="engineering-delete" onClick={remove}><Trash2/>{t('delete')}</button></div>
    </fieldset>{locked&&<p>{t('engineering.locked')}</p>}</section>;
 const controls=<><button aria-label={t('engineering.select')} aria-pressed={!tool} onClick={cancel}><MousePointer2/></button><button aria-pressed={snapOn} onClick={()=>useProject.setState({snapOn:!snapOn})}><Magnet/>{t('magnet')}</button><button aria-pressed={grid} onClick={()=>useProject.setState({showGrid:!grid})}><Grid3x3/>{t('grid')}</button><button onClick={()=>zoom(1/1.25)} aria-label={t('engineering.zoomOut')}><Minus/></button><button onClick={()=>zoom(1.25)} aria-label={t('engineering.zoomIn')}><Plus/></button></>;
 const assemblyItem=assemblyEditor?data.elements[assemblyEditor]:undefined;
 return <section className="engineering-workspace" aria-label={t('engineering.title')}>
  {assemblyItem?.kind==='equipment'&&assemblyItem.type==='assembly'&&<EngineeringAssemblyEditor key={assemblyItem.id} item={assemblyItem} locked={!!data.categories[engineeringCategory(assemblyItem)]?.locked} onSave={assembly=>{const latest=current().elements[assemblyItem.id];if(latest?.kind==='equipment'&&!current().categories[engineeringCategory(latest)]?.locked)commit({...latest,assembly});}} onClose={()=>setAssemblyEditor(null)}/>}
  <div className="engineering-modebar">{(['equipment','networks'] as const).map(value=><button key={value} aria-pressed={tab===value} onClick={()=>{setTab(value);setLibrary(true);}}>{t('engineering.'+value)}</button>)}</div>
  <div className="engineering-field">
   <div className="engineering-base"><DesignCanvas engineeringBase previewView={{px,panX,panY}} onScalePair={()=>{}} onMeasure={()=>{}} onExportReady={onExportReady}/></div>
   <svg ref={stage} className="engineering-canvas" data-cursor={panning?'grabbing':spaceDown?'grab':(hover&&tool&&isRoute(tool)||insertion)?'target':undefined} onPointerLeave={()=>{if(!drag.current){setHover(null);setSnap(null);}}} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={()=>{autoDraft.current.lastTap=undefined;pointers.current.clear();pinch.current=null;drag.current=null;setPanning(false);setPreview(null);setHover(null);setSnap(null);}} onDoubleClick={onDoubleClick} onContextMenu={e=>e.preventDefault()} aria-label={t('engineering.scheme')}>
    {grid&&step*px>=6&&<><defs><pattern id="engineering-grid" width={step*px} height={step*px} patternUnits="userSpaceOnUse" x={panX} y={panY}><path d={`M ${step*px} 0 H0 V${step*px}`} fill="none" stroke="#7b8791" strokeOpacity=".2" strokeWidth=".5"/></pattern></defs><rect width="100%" height="100%" fill="url(#engineering-grid)" pointerEvents="none"/></>}
    <g transform={`translate(${panX} ${panY}) scale(${px})`}>
     <EngineeringSprinklers project={project} focus={focus} onFocus={focusHeads} px={px} selectable={!tool&&!nodeMode}/>
     {displayed.map(e=><g key={e.id} data-engineering-id={e.id}>
      {e.kind==='equipment'?<>
       <g transform={`translate(${e.x} ${e.y}) rotate(${e.rotation}) scale(${equipmentSymbolDimensions(e,px).width/100} ${equipmentSymbolDimensions(e,px).height/100})`} strokeLinecap="round" strokeLinejoin="round">
        <rect x="-52" y="-52" width="104" height="104" rx="6" fill="transparent" stroke="none"/>
        <g fill="none" stroke={ink(e)} strokeWidth="4"><EngineeringGlyph type={e.type} outlets={e.outlets}/></g>
       </g>
       {(tool&&isRoute(tool)||selected===e.id)&&equipmentPorts(e).map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={4/px} fill="white" stroke="#269651" strokeWidth={1.5/px} pointerEvents="none"/>)}
       {e.label&&(EQUIPMENT_LIBRARY.some(type=>type===e.type)?<EngineeringLeader item={e} selected={selected===e.id} px={px} text={label(e)}/>:<text className="engineering-label" x={e.x} y={e.y+Math.max(e.size,32/px)*.65+10/px} fontSize={12/px} textAnchor="middle" pointerEvents="none">{label(e)}{e.type==='manifold'?` · ${formatNumber(e.outlets??4,0)}`:''}{e.type==='controller'?` · ${formatNumber(e.zones??8,0)}`:''}</text>)}
       {editing===e.id&&selected===e.id&&!locked&&!tool&&<EquipmentHandles item={e} px={px}/>}
      </>:<>
       {e.kind==='pipe'&&e.auto?<AutoPipeDrawing edges={hydraulic?.edges.filter(edge=>edge.pipeId===e.id)??[]} px={px} selected={selected===e.id} color={ink(e)} units={units} label={e.label}/>:<>
       <polyline points={e.points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="transparent" strokeWidth={22/px}/>
       <polyline points={e.points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={selected===e.id?'#e8892f':'white'} strokeWidth={(e.kind==='pipe'?pipeOutlineWidth(e.diameterMm,false,px):7)/px} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none"/>
       <polyline points={e.points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={ink(e)} strokeWidth={(e.kind==='pipe'?pipeStrokeWidth(e.diameterMm,false,px):4.5)/px} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={dash(e)?.split(' ').map(n=>Number(n)/px).join(' ')} pointerEvents="none"/>
       {e.label&&e.points.length>1&&<text className="engineering-label" x={(e.points[0].x+e.points[1].x)/2} y={(e.points[0].y+e.points[1].y)/2-9/px} fontSize={12/px} textAnchor="middle" pointerEvents="none">{label(e)}</text>}
       </>}
       {selected===e.id&&!locked&&!tool&&e.points.map((p,i)=><g key={i} data-route-node={i} data-node-selected={node===i}><circle data-node={i} cx={p.x} cy={p.y} r={16/px} fill="transparent"/><circle data-node={i} cx={p.x} cy={p.y} r={5/px} fill={node===i?'#d0443c':'white'} stroke={node===i||nodeMode==='remove'?'#d0443c':'#e8892f'} strokeWidth={1.5/px}/></g>)}
      </>}
     </g>)}
     {tool==='autoPipe'&&<g pointerEvents="none">{autoPreview.branches.map(({head,point})=><g key={head.id}><line x1={head.x} y1={head.y} x2={point.x} y2={point.y} stroke="white" strokeWidth={3/px}/><line x1={head.x} y1={head.y} x2={point.x} y2={point.y} stroke="#e8892f" strokeWidth={1.1/px} strokeDasharray={`${4/px} ${3/px}`}/><circle cx={head.x} cy={head.y} r={13/px} fill="none" stroke="#e8892f" strokeWidth={1.5/px}/></g>)}</g>}
     {draft.length>0&&<g pointerEvents="none"><polyline points={[...draft,...(hover?[hover]:[])].map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#e8892f" strokeWidth={2/px} strokeDasharray={`${6/px} ${4/px}`}/>{draft.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={4/px} fill="white" stroke="#e8892f" strokeWidth={1.5/px}/>)}</g>}
     {hover&&tool&&!isRoute(tool)&&<g transform={`translate(${hover.x} ${hover.y}) scale(${equipmentSymbolDimensions({type:tool as EquipmentKind},px).width/100} ${equipmentSymbolDimensions({type:tool as EquipmentKind},px).height/100})`} pointerEvents="none" opacity=".65" fill="none" stroke="#187c85" strokeWidth="4"><EngineeringGlyph type={tool as EquipmentKind}/></g>}
     {insertion&&!panning&&!spaceDown&&<g data-node-preview="true" pointerEvents="none"><circle cx={insertion.point.x} cy={insertion.point.y} r={6/px} fill="white" stroke="#e8892f" strokeWidth={2/px}/></g>}
     {hover&&tool&&isRoute(tool)&&!panning&&!spaceDown&&<g data-route-target="true" transform={`translate(${hover.x} ${hover.y})`} pointerEvents="none" fill="none" stroke="#21895d" strokeWidth={1.5/px}><circle r={8/px} fill="#ffffffb3"/><path d={`M${-11/px} 0H${11/px}M0 ${-11/px}V${11/px}`}/><circle r={1.8/px} fill="#21895d" stroke="none"/></g>}
     {snap&&(tool||preview)&&<circle pointerEvents="none" cx={snap.x} cy={snap.y} r={5/px} stroke="#249a4e" fill="none" strokeWidth={1.5/px}/>}
    </g>
   </svg>
   {!library&&<button type="button" className="tablet-panel-handle" data-side="left" onClick={()=>setLibrary(true)} aria-label={t('library')}><ChevronRight className="size-5"/></button>}
   {!scheme&&<button type="button" className="tablet-panel-handle" data-side="right" onClick={()=>setScheme(true)} aria-label={t('showPanel')}><ChevronLeft className="size-5"/></button>}
   {library&&<aside className="engineering-library library-panel"><header className="workspace-panel-heading"><Button size="xs" variant="solid" className="workspace-panel-hide shrink-0 border-line bg-surface text-ink hover:bg-btn-soft" onClick={()=>setLibrary(false)}><ChevronLeft/>{t('hide')}</Button><strong>{t('engineering.'+tab)}</strong></header><div className="engineering-library-scroll">
    {(tab==='equipment'?['equipment']:['pipelines','electric']).map(category=><section key={category}><h3>{t('engineering.'+category)}</h3><div className="engineering-cards">{category==='pipelines'&&<button className="engineering-auto-button" aria-pressed={tool==='autoPipe'} onClick={()=>{cancel();setTool('autoPipe');setEditing(null);setLibrary(false);setScheme(false);}}><AutoRouteIcon/><span>{t('engineering.autoPipe')}</span></button>}{(tab==='equipment'?EQUIPMENT_LIBRARY:category==='pipelines'?['main']:['cable']).map(type=><button key={type} aria-pressed={tool===type} onClick={()=>{if(catalogPlaced.current){catalogPlaced.current=false;return;}cancel();setTool(type as Tool);}}
     onPointerDown={e=>{catalogPlaced.current=false;if(tab==='networks')return;e.currentTarget.setPointerCapture(e.pointerId);}}
     onPointerMove={e=>{if(tab!=='networks'&&e.buttons===1&&e.currentTarget.hasPointerCapture(e.pointerId)&&stage.current&&!document.elementFromPoint(e.clientX,e.clientY)?.closest('.engineering-library,.engineering-inspector')){setTool(type as Tool);setHover(snapped(point(e.clientX,e.clientY)));}}}
     onPointerUp={e=>{if(tab==='networks'||!stage.current)return;const r=stage.current.getBoundingClientRect();if(e.clientX>r.left&&e.clientX<r.right&&e.clientY>r.top&&e.clientY<r.bottom&&!(document.elementFromPoint(e.clientX,e.clientY)?.closest('.engineering-library,.engineering-inspector'))){catalogPlaced.current=true;place(type as EquipmentKind,snapped(point(e.clientX,e.clientY)));e.preventDefault();}}}>
     {tab!=='networks'?<EngineeringThumb type={type as EquipmentKind}/>:<svg viewBox="0 0 60 40" aria-hidden="true"><path d="M5 32H22V10H55" fill="none" stroke={ENGINEERING_NETWORK_COLORS[type as PipeKind|'cable']} strokeWidth="4" strokeDasharray={type==='cable'?'6 3 1 3':type==='otherPipe'?'6 3':undefined}/></svg>}<span>{t('engineering.'+type)}</span></button>)}</div></section>)}
   </div></aside>}
   {scheme&&<aside className="engineering-inspector info-panel"><header className="workspace-panel-heading"><Button size="xs" variant="solid" className="workspace-panel-hide shrink-0 border-line bg-surface text-ink hover:bg-btn-soft" onClick={()=>setScheme(false)}>{t('hide')}<ChevronRight/></Button><strong><EngineeringIcon/>{t('engineering.scheme')}</strong></header><div className="engineering-inspector-scroll" ref={list} onScroll={e=>{memory.set(project.id,{tab,selected,expanded,focus,scroll:e.currentTarget.scrollTop});}}>
    <EngineeringZones project={project} focus={focus} onFocus={focusHeads} expanded={expanded} onToggle={toggleExpanded} units={units} locale={locale}/>
    {(['equipment','networks'] as const).map(group=><InspectorCard key={group} id={group} className="engineering-group-card" title={t('engineering.'+group)} tint={group==='equipment'?'#9966cc':'#398ed1'} open={expanded.includes(group)} onToggle={()=>toggleExpanded(group)} actions={<EngineeringGroupActions group={group} project={project} locale={locale}/>}>
      {!Object.values(data.elements).some(e=>(e.kind==='equipment')===(group==='equipment'))&&<p className="engineering-help">{t('engineering.empty')}</p>}
      {sortEngineeringNetworks(Object.values(editableData.elements).filter(e=>(e.kind==='equipment')===(group==='equipment'))).map(e=><InspectorCard key={e.id} id={`element:${e.id}`} className={`engineering-item-card${e.kind!=='equipment'?' engineering-network-card':''}`} title={e.kind==='equipment'?itemTitle(e):<span className="engineering-network-title"><span className="engineering-zone-dot" style={{background:ink(e)}} aria-hidden="true"/><span>{itemTitle(e)}</span></span>} tint={e.kind==='equipment'?'#9966cc':ink(e)} summary={e.kind!=='equipment'?formatLenU(routeLength((preview?.id===e.id&&preview.kind!=='equipment'?preview:e).points),units.length):undefined} open={selected===e.id} onToggle={()=>choose(selected===e.id?null:e.id)}>{selected===e.id&&properties}</InspectorCard>)}
     {group==='networks'&&(totals.byDiameter.length>0||totals.unknownM>0)&&<div className="engineering-network-totals"><strong>{t('engineering.totalPipe')}</strong>{totals.byDiameter.map(row=><div key={row.diameter}><span>Ø{formatNumber(fromMmPipe(row.diameter,units.pipe),units.pipe==='mm'?0:2)} {pipeLabel(units.pipe)}</span><span>{formatLenU(row.length,units.length)}</span></div>)}{totals.unknownM>0&&<p>{t('engineering.unsizedPipe')}: {formatLenU(totals.unknownM,units.length)}</p>}</div>}
    </InspectorCard>)}
    <InspectorCard id="pump" title={t('engineering.pumpRecommendation')} tint="#249a80" open={expanded.includes('pump')} onToggle={()=>toggleExpanded('pump')}><HydraulicPanel project={project} result={hydraulic??undefined} embedded/></InspectorCard>
    <InspectorCard id="tank" title={t('engineering.tankRecommendation')} tint="#4b8fbd" open={expanded.includes('tank')} onToggle={()=>toggleExpanded('tank')}><TankRecommendationPanel project={project} embedded/></InspectorCard>
   </div></aside>}
   {tool==='autoPipe'&&<div className="engineering-auto-guidance engineering-properties" data-scheme={scheme}>
    <p>{t('engineering.autoPipeHint',{distance:formatLenU(AUTO_ROUTE_INSET_M,units.length),capture:formatLenU(AUTO_ROUTE_CAPTURE_M,units.length)})}</p>
    {!!autoPreview.headIds.length&&<p role="status">{circuitName(project,`zone:${autoPreview.zone}`)} · {formatNumber(autoPreview.headIds.length,0)}</p>}
    {autoError&&<p role="alert">{t('engineering.'+autoError)}</p>}
   </div>}
   {tool&&<div className="engineering-draft-bar" role="status"><span>{t(tool==='autoPipe'?'engineering.headRouteFinish':isRoute(tool)?'engineering.routeHint':'engineering.placeHint')} {draft.length>1&&formatLenU(routeLength(draft),units.length)}</span>{isRoute(tool)&&<><button disabled={draft.length<2} onClick={finish}><Check/>{t('engineering.finish')}</button><button disabled={!canUndoDraft} onClick={undoDraft} aria-label={t('undo')}><Minus/></button></>}<button onClick={cancel} aria-label={t('cancel')}><X/></button></div>}
  </div>
  <footer className="engineering-footer">{controls}{editing===item?.id&&item?.kind==='equipment'&&!locked&&!tool&&<div className="engineering-edit-tools" role="group" aria-label={t('edit')}>
   <button onClick={()=>patch({size:Math.max(.1,item.size*.9)})} aria-label={`${t('engineering.symbolSize')} −10%`} title={`${t('engineering.symbolSize')} −10%`}><Minus/></button>
   <button onClick={()=>patch({size:Math.min(50,item.size*1.1)})} aria-label={`${t('engineering.symbolSize')} +10%`} title={`${t('engineering.symbolSize')} +10%`}><Plus/></button>
   <button onClick={()=>patch({rotation:(item.rotation+345)%360})} aria-label={`${t('engineering.rotation')} −15°`} title={`${t('engineering.rotation')} −15°`}><RotateCcw/></button>
   <button onClick={()=>patch({rotation:(item.rotation+15)%360})} aria-label={`${t('engineering.rotation')} +15°`} title={`${t('engineering.rotation')} +15°`}><RotateCw/></button>
   <button onClick={()=>setEditing(null)}><Check/>{t('engineering.finish')}</button>
  </div>}{tool&&pipeTypes.includes(tool as PipeKind)&&<label>Ø<select value={diameter} onChange={e=>setDiameter(Number(e.target.value))}>{PIPE_DIAMETERS_MM.map(d=><option key={d} value={d}>{formatNumber(fromMmPipe(d,units.pipe),units.pipe==='mm'?0:2)} {pipeLabel(units.pipe)}</option>)}</select></label>}</footer>
 </section>;
}

function EquipmentHandles({item,px}:{item:EngineeringEquipment;px:number}){
 const dimensions=equipmentSymbolDimensions(item,px),half=Math.max(dimensions.width,dimensions.height)*.52,rotationY=-half-28/px;
 return <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
  <path d={`M0 ${-half}V${rotationY}`} stroke="#e8892f" strokeWidth={1.5/px} pointerEvents="none"/>
  {[[-half,-half],[half,-half],[half,half],[-half,half],[0,rotationY]].map(([x,y],i)=><g key={i} data-transform={i===4?'rotate':'resize'} style={{cursor:i===4?'grab':'nwse-resize'}}>
   <title>{t(i===4?'engineering.rotation':'engineering.symbolSize')}</title>
   <circle cx={x} cy={y} r={18/px} fill="transparent"/>
   <circle cx={x} cy={y} r={6/px} fill="white" stroke="#e8892f" strokeWidth={2/px}/>
  </g>)}
 </g>;
}

function Numeric({label,value,onChange,suffix,min,max,digits=2}:{label:string;value:number|null;onChange:(value:number)=>void;suffix?:string;min?:number;max?:number;digits?:number}){
 return <label>{label}<span className="engineering-number"><LocalizedNumberInput value={value} min={min} max={max} digits={digits} onCommit={v=>{if(v!=null&&v!==value)onChange(v);}}/>{suffix&&<span>{suffix}</span>}</span></label>;
}
