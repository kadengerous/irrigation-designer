import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as icons from 'lucide-react';
import {createServer,transformWithEsbuild} from 'vite';
let server,load,m,c,h,v,route,draft,bind,interaction,store,types,cad,emptyDrawing,file,units,i18n,symbols,panel,source,handlersCode,propertiesCode,libraryCode,keyCode,deleteCode,finishCode,extendCode,canvasCode,AutoPipeDrawing,EngineeringSprinklers;
before(async()=>{
 server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});load=p=>server.ssrLoadModule('/src/'+p);
 [m,c,h,v,route,draft,bind,interaction,{useProject:store},types,cad,{emptyDrawing},file,units,i18n,symbols,panel]=await Promise.all(['lib/engineering.ts','lib/engineering-connections.ts','lib/engineering-hydraulics.ts','lib/engineering-pipe-display.ts','lib/engineering-head-route.ts','lib/engineering-auto-route-draft.ts','lib/engineering-zone-route.ts','components/designer/engineering-route-interaction.ts','lib/project-store.ts','lib/project-types.ts','lib/cad/engine.ts','lib/cad/types.ts','lib/project-file.ts','lib/units.ts','lib/i18n.ts','components/designer/engineering-symbol.tsx','components/designer/engineering-hydraulic-panel.tsx'].map(load));
 ({AutoPipeDrawing}=await load('components/designer/engineering-auto-pipe.tsx'));({EngineeringSprinklers}=await load('components/designer/engineering-zones.tsx'));
 source=await readFile('src/components/designer/engineering-workspace.tsx','utf8');
 const transform=async text=>(await transformWithEsbuild(text,'engineering-fixture.tsx',{loader:'tsx',jsx:'transform',jsxFactory:'React.createElement',jsxFragment:'React.Fragment'})).code;
 extendCode=await transform(source.slice(source.indexOf(' const extend='),source.indexOf(' const properties=')));
 finishCode=await transform(source.slice(source.indexOf(' const finish='),source.indexOf(' const place=')));
 const canvasStart=source.indexOf('<svg ref={stage}');canvasCode=await transform('const canvasView='+source.slice(canvasStart,source.indexOf('</svg>',canvasStart)+6)+';');
 handlersCode=await transform(source.slice(source.indexOf(' const onDown='),source.indexOf(' const displayed=')));
 propertiesCode=await transform(source.slice(source.indexOf(' const properties='),source.indexOf(' const controls=')));
 const start=source.indexOf('{library&&<aside');libraryCode=await transform('const libraryView='+source.slice(start+1,source.indexOf('</aside>}',start)+8)+';');
 keyCode=await transform(source.slice(source.indexOf('  const onKey='),source.indexOf("  window.addEventListener('keydown'")));
 deleteCode=await transform(source.slice(source.indexOf(' const deleteNode='),source.indexOf(' const insertion=')));
});
after(async()=>{await server?.close();});
const xy=points=>points.map(([x,y])=>({x,y}));
const pipe=(points=[[0,0],[10,0]],patch={})=>({id:'pipe',kind:'pipe',type:'main',number:1,label:true,diameterMm:32,color:'#ab3456',points:xy(points),...patch});
function project(points=[[0,0],[5,0],[10,0]],bounds=[[0,0],[10,0],[10,10],[0,10]]){
 const drawing=cad.addPointShape(emptyDrawing(),xy(bounds),'lawn'),figureId=Object.keys(drawing.faces)[0];
 return {...types.emptyProject(),drawing,heads:points.map(([x,y],i)=>({id:'h'+i,x,y,zone:1,figureId,catalogId:'MP1000-90',nozzleId:'MP1000-90',r:4,arc:180,start:0,bodyId:'PRS40',designPressure:2.8,popUpMm:100,locked:false,needsReview:false})),zones:[{id:1,name:'West',nameKind:'custom',hidden:false,locked:false},{id:2,name:'East',nameKind:'custom',hidden:false,locked:false}],engineering:m.emptyEngineering()};
}
function save(p,e){return {...p,engineering:c.commitAutoConnections(p,{...p.engineering,elements:{...p.engineering.elements,[e.id]:e}})};}
function reset(p){store.setState({project:p,projects:[],past:[],future:[],pastOps:[],futureOps:[],workspaceSection:'engineering',tool:null,drawSub:'none',groupMemberId:null});}
const walk=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(walk):[node,...walk(node.props?.children)];
const evaluate=(code,env,expression)=>{const keys=Object.keys(env).filter(k=>k!=='default'&&/^[$A-Z_a-z][$\w]*$/.test(k));return new Function(...keys,code+';return '+expression+';')(...keys.map(k=>env[k]));};

function events(p,e,{pointerType='mouse',nodeMode=null,locked=false,tool=null}={}){
 let preview=null,hover=null,node=null,selection=e.id,committed=null,commits=0,panCount=0,mode=nodeMode,panning=false;
 const data={...p.engineering,categories:locked?{pipelines:{locked:true}}:p.engineering.categories,elements:{...p.engineering.elements,[e.id]:e}};
 const state={project:{...p,engineering:data},spaceDown:false,snapOn:true,panX:0,panY:0,pxPerMeter:40,setPan(x,y){panCount++;this.panX=x;this.panY=y;}};
 const svg={setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(){},getBoundingClientRect(){return{left:0,top:0}}};
 const empty={closest:()=>null,getAttribute:()=>null};
 const target=index=>({closest:selector=>selector==='[data-engineering-id]'?{getAttribute:()=>e.id}:selector==='[data-node]'&&index!=null?{getAttribute:()=>String(index)}:null,getAttribute:()=>null});
 const env={...symbols,...m,...c,...route,...draft,...interaction,React,useProject:{getState:()=>state,setState:patch=>Object.assign(state,patch)},px:40,panX:0,panY:0,data,editableData:data,pinnedData:data,project:state.project,item:e,selected:e.id,tool,editing:null,extending:null,locked,pointers:{current:new Map()},pinch:{current:null},drag:{current:null},stage:{current:svg},autoDraft:{current:draft.emptyAutoRouteDraft()},point:(x,y)=>({x:x/40,y:y/40}),snapped:p=>p,choose:id=>selection=id,focusHeads(){},setNode:n=>node=n,setHover:p=>hover=p,setSnap(){},setPreview:p=>preview=p,setPanning:p=>panning=p,setNodeMode:v=>mode=v,setLibrary(){},setAutoError(){},setDraft(){},commit:value=>{committed=value;commits++;},finish(){throw new Error('unexpected finish');}};
 const handlers=()=>evaluate(handlersCode,{...env,nodeMode:mode,preview},'({onDown,onMove,onUp,onDoubleClick})');
 const event=(x,y,opts={})=>({button:0,pointerId:1,pointerType,clientX:x*40,clientY:y*40,target:empty,currentTarget:svg,preventDefault(){},timeStamp:1000,...opts});
 return {env,svg,state,target,event,handlers,get preview(){return preview;},get hover(){return hover;},get node(){return node;},get selection(){return selection;},get committed(){return committed;},get commits(){return commits;},get panCount(){return panCount;},get mode(){return mode;},get panning(){return panning;}};
}

function propertiesEnv(p,e,patch={}){
 const commit=value=>store.getState().commitEngineering({...store.getState().project.engineering,elements:{...store.getState().project.engineering.elements,[value.id]:value}});
 return {...icons,...m,...c,...units,...i18n,...symbols,...panel,...bind,React,t:i18n.text,item:e,project:p,locked:false,preview:null,units:units.METRIC_UNITS,tool:null,editing:null,node:null,nodeMode:null,bindZone:1,bindError:null,hydraulic:e.auto?h.calculateEngineering(p):null,AUTO_ROUTE_INSET_M:.5,ink:v.engineeringInk,zoneLabel:types.zoneLabel,itemTitle:()=>e.name??'Pipe',useProject:store,commit,patch:values=>commit({...e,...values}),cancel(){},deleteNode(){},setNodeMode(){},setNode(){},setHover(){},setBindZone(){},setBindError(){},setTool(){},setExtending(){},setDraft(){},setLibrary(){},setScheme(){},setEditing(){},duplicate(){},remove(){},autoDraft:{current:{}},...patch};
}

test('central-head binding preserves the entire drawn route, includes every zone consumer and preserves its diameter and data',()=>{
 const p=project([[2,3],[5,3],[8,3],[5,5]]);p.heads[3].hidden=true;p.heads.push({...p.heads[1],id:'other-zone',zone:2});
 const e=pipe(),snapshot=JSON.stringify({p,e}),result=bind.bindPipeToZone(p,e,1);assert.ok(result.pipe,result.error);const bound=result.pipe;
 assert.equal(bound.auto.sizing,'manual');assert.equal(bound.diameterMm,32);assert.equal(bound.auto.insetM,0);assert.equal(bound.auto.circuit,'zone:1');
 assert.deepEqual([...bound.auto.consumerIds].sort(),['head:h0','head:h1','head:h2','head:h3']);
 assert.deepEqual(bound.points[0],e.points[0],'manual supply start remains unchanged');assert.equal(bound.auto.headStartIndex,0);assert.ok(bound.points.every(p=>p.y===0&&p.x>=0&&p.x<=10));assert.equal(bound.type,e.type);assert.equal(bound.auto.networkCircuit,'main');assert.equal(JSON.stringify({p,e}),snapshot);
 const saved=save(p,bound),links=c.autoConnections(saved);assert.equal(links.size,4);assert.equal(links.get('head:h3').distance,5);assert.equal(v.engineeringInk(bound),types.zoneColor(1));assert.equal(v.engineeringInk(e),'#ab3456');
 assert.ok(Object.values(bound.auto.consumerNodes).every(index=>Number.isInteger(index)&&index>=0&&index<bound.points.length));
 const sized=h.calculateEngineering(saved).edges.filter(e=>!e.branch&&e.flow>0);assert.ok(sized.length>0);assert.ok(sized.every(e=>e.diameter===32));
 const hundred={...bound,diameterMm:100},hyd=h.calculateEngineering(save(p,hundred)),unsupported=hyd.edges.filter(e=>!e.branch&&e.flow>0);assert.ok(unsupported.length>0);assert.ok(unsupported.every(e=>e.diameter===100&&e.lossM===null));assert.ok(hyd.issues.includes('pipeData'),'unverified pipe bore must not silently substitute another diameter');
 const blocked=bind.bindPipeToZone(saved,{...e,id:'competing'},1);assert.equal(blocked.error,'occupiedHead');
});

test('boundary binding follows inward corners in either direction and falls back safely on impossible insets',()=>{
 const p=project([[2,0],[8,0]]),a=bind.bindPipeToZone(p,pipe(),1),b=bind.bindPipeToZone(p,pipe([[10,0],[0,0]]),1);assert.ok(a.pipe&&b.pipe);assert.deepEqual(a.pipe.points[0],{x:0,y:0});assert.deepEqual(b.pipe.points[0],{x:10,y:0});for(const bound of [a.pipe,b.pipe]){assert.equal(bound.auto.insetM,.5);for(const link of c.autoConnections(save(p,bound)).values())assert.ok(Math.abs(link.point.y-.5)<1e-6);}
 const concave=project([[10,0],[10,4],[4,4],[4,10]],[[0,0],[10,0],[10,4],[4,4],[4,10],[0,10]]),result=bind.bindPipeToZone(concave,pipe([[10,0],[10,4],[4,4],[4,10]]),1);assert.ok(result.pipe,result.error);assert.deepEqual(result.pipe.points[0],{x:10,y:0});assert.equal(result.pipe.auto.insetM,.5);for(const [x,y] of [[9.5,3.5],[3.5,3.5]])assert.ok(result.pipe.points.some(p=>Math.hypot(p.x-x,p.y-y)<1e-6),`inset contour corner ${x},${y}`);assert.ok(!h.calculateEngineering(save(concave,result.pipe)).issues.includes('loop'));
 const narrow=project([[0,0],[10,0]],[[0,0],[10,0],[10,.4],[0,.4]]);assert.deepEqual(bind.bindPipeToZone(narrow,pipe(),1).pipe.points,pipe().points);
 const hole=project([[0,0],[10,0]]);hole.drawing=cad.addPointShape(hole.drawing,xy([[4,.499],[6,.499],[6,.501],[4,.501]]),'lawn');const faces=Object.values(hole.drawing.faces);faces[0].holes=[faces[1].outer];delete hole.drawing.faces[faces[1].id];assert.deepEqual(bind.bindPipeToZone(hole,pipe(),1).pipe.points,pipe().points);
});

test('materialized tees move with their saved route nodes, survive insert/delete and never slide to a nearer segment',()=>{
 const p=project([[3,0],[7,0]]),e=pipe([[0,.5],[10,.5]],{type:'zonePipe',auto:{circuit:'zone:1',captureM:1,selection:'heads',consumerIds:['head:h0','head:h1'],insetM:.5}});
 const materialized=c.materializePipeJunctions({...p,engineering:{...p.engineering,elements:{pipe:e}}},e);assert.deepEqual(materialized.points,xy([[0,.5],[3,.5],[7,.5],[10,.5]]));assert.deepEqual(materialized.auto.consumerNodes,{'head:h0':1,'head:h1':2});
 const moved={...materialized,points:materialized.points.map((p,i)=>i===1?{x:2,y:3}:p)},saved=save(p,moved),first=c.autoConnections(saved).get('head:h0');assert.deepEqual(first.point,{x:2,y:3});assert.equal(first.distance,Math.sqrt(10));
 const inserted=m.insertEngineeringNode(moved,1,{x:1,y:1});assert.deepEqual(inserted.auto.consumerNodes,{'head:h0':2,'head:h1':3});
 assert.deepEqual(c.autoConnections(save(p,inserted)).get('head:h0').point,{x:2,y:3});
 const removed=m.removeEngineeringNode(inserted,2);assert.equal(removed.points.length,4);const persisted=save(p,removed).engineering.elements.pipe;assert.equal(persisted.points.length,4,'deleted tee must not silently reappear');assert.deepEqual(c.autoConnections(save(p,removed)).get('head:h0').point,removed.points[removed.auto.consumerNodes['head:h0']]);
 const end=m.removeEngineeringNode(materialized,0);assert.equal(end.points.length,3);assert.equal(end.auto.consumerNodes['head:h0'],0);assert.deepEqual(m.removeEngineeringNode(pipe(),0),pipe(),'a route always retains at least two nodes');
});

test('bound pipes and fixed tees survive undo, file reopen, zone renumbering and zone removal',()=>{
 const base=project(),e=bind.bindPipeToZone(base,pipe(),1).pipe;assert.ok(e);reset(base);store.getState().commitEngineering({...base.engineering,elements:{pipe:e}});const saved=store.getState().project,expected=structuredClone(saved.engineering);
 store.getState().undo();assert.deepEqual(store.getState().project.engineering,base.engineering);store.getState().redo();assert.deepEqual(store.getState().project.engineering,expected);
 const reopened=file.parseProjectFile(JSON.stringify(file.toProjectFile({project:saved}))).project;assert.deepEqual(reopened.engineering,expected);
 const sparse={...saved,zones:saved.zones.map(z=>({...z,id:z.id===1?7:12})),heads:saved.heads.map(h=>({...h,zone:7})),engineering:{...expected,elements:{pipe:{...e,auto:{...e.auto,circuit:'zone:7'}}}}};
 const normalized=file.parseProjectFile(JSON.stringify(file.toProjectFile({project:sparse}))).project;assert.equal(normalized.engineering.elements.pipe.auto.circuit,`zone:${normalized.heads[0].zone}`);assert.deepEqual(normalized.engineering.elements.pipe.auto.consumerNodes,e.auto.consumerNodes);
 reset(saved);store.getState().removeZone(1);const transferred=store.getState().project;assert.equal(transferred.engineering.elements.pipe.auto.circuit,`zone:${transferred.heads[0].zone}`);assert.deepEqual(transferred.engineering.elements.pipe.auto.consumerNodes,e.auto.consumerNodes);store.getState().undo();assert.deepEqual(store.getState().project.engineering,expected);
});

test('real pointer handlers insert on the existing route for mouse, touch and pen without grid displacement',()=>{
 for(const pointerType of ['mouse','touch','pen']){
  const p=project(),e=pipe([[0,0],[5,0],[10,0]]),ui=events(p,e,{pointerType,nodeMode:'add'});
  ui.handlers().onMove(ui.event(2,3));assert.deepEqual(ui.hover,{x:2,y:3});assert.equal(ui.commits,0);
  ui.env.snapped=()=>{throw new Error('node insertion must not use grid/object snapping');};const candidate=interaction.routeNodeInsertion(e.points,ui.hover);assert.deepEqual(candidate,{index:1,point:{x:2,y:0}});
  ui.handlers().onDown(ui.event(2,3));ui.handlers().onUp(ui.event(2,3));assert.deepEqual(ui.committed.points,xy([[0,0],[2,0],[5,0],[10,0]]));assert.equal(ui.commits,1);assert.equal(ui.mode,null);assert.equal(ui.node,1);
  const held=events(p,e,{pointerType,nodeMode:'add'});held.handlers().onDown(held.event(2,0));held.handlers().onMove(held.event(2,3));assert.equal(held.commits,0);assert.deepEqual(held.hover,{x:2,y:3});held.handlers().onUp(held.event(2,3));assert.deepEqual(held.committed.points,xy([[0,0],[2,0],[5,0],[10,0]]));assert.equal(held.commits,1);
  const remove=events(p,e,{pointerType,nodeMode:'remove'});remove.handlers().onDown(remove.event(0,0,{target:remove.target(0)}));remove.handlers().onUp(remove.event(0,0));assert.equal(remove.node,0);assert.equal(remove.commits,0,'selection alone must not delete');
  const deletion=evaluate(deleteCode,{item:e,locked:false,node:0,...m,commit:v=>{assert.equal(v.points.length,2);assert.deepEqual(v.points[0],{x:5,y:0});},setNode(){},setHover(){}},'deleteNode');deletion();
  const key=evaluate(keyCode,{draft:[],tool:null,node:0,nodeMode:'remove',deleteNode:deletion,cancel(){},choose(){},finish(){},undoDraft(){},remove(){throw new Error('must delete selected node, not whole pipe');}},'onKey');key({key:'Delete',target:{closest:()=>null},preventDefault(){}});
 }
});

test('actual node dragging straightens horizontal, vertical and diagonal routes before grid snapping and respects the magnet',()=>{
 for(const pointerType of ['mouse','touch','pen'])for(const [points,target,expected] of [
  [[[0,0],[4,3],[10,0]],[5,.15],[5,0]],
  [[[0,0],[3,4],[0,10]],[.15,5],[0,5]],
  [[[0,0],[4,7],[10,10]],[5.1,4.9],[5,5]],
 ])for(const enabled of [true,false]){
  const p=project(),e=pipe(points),ui=events(p,e,{pointerType});ui.state.snapOn=enabled;let fallback=0;ui.env.snapped=p=>{fallback++;return p;};
  ui.handlers().onDown(ui.event(...points[1],{target:ui.target(1)}));ui.handlers().onMove(ui.event(...target));assert.ok(ui.preview);
  const expectedPoint=enabled?{x:expected[0],y:expected[1]}:{x:target[0],y:target[1]};assert.ok(Math.hypot(ui.preview.points[1].x-expectedPoint.x,ui.preview.points[1].y-expectedPoint.y)<1e-9);assert.equal(fallback,enabled?0:1);
  ui.handlers().onUp(ui.event(...target));assert.equal(ui.commits,1);assert.deepEqual(ui.committed.points[0],e.points[0]);assert.deepEqual(ui.committed.points[2],e.points[2]);
 }
});

test('right/middle button, space pan, pinch and locked nodes cannot accidentally insert or delete',()=>{
 const p=project(),e=pipe([[0,0],[5,0],[10,0]]);
 for(const pointerType of ['mouse','touch','pen'])for(const scenario of ['right','middle','space','pinch','locked']){
  const ui=events(p,e,{pointerType,nodeMode:'add',locked:scenario==='locked'});if(scenario==='space')ui.state.spaceDown=true;
  const button=scenario==='right'?2:scenario==='middle'?1:0;ui.handlers().onDown(ui.event(2,2,{button}));
  if(scenario==='pinch'){ui.handlers().onDown(ui.event(3,2,{pointerId:2}));assert.equal(ui.env.drag.current,null);ui.handlers().onMove(ui.event(4,2,{pointerId:2}));ui.handlers().onUp(ui.event(4,2,{pointerId:2}));}
  else if(scenario!=='locked')ui.handlers().onMove(ui.event(3,2,{button}));
  ui.handlers().onUp(ui.event(3,2,{button}));assert.equal(ui.commits,0,`${pointerType} ${scenario}`);if(['right','middle','space'].includes(scenario))assert.ok(ui.panCount>0,`${scenario}: field remains pannable`);
 }
});

test('actual properties and network library render in all 20 languages with main/automatic/drip pipes and complete diameters',()=>{
 const p=project(),e=pipe();reset(p);let clicks=0;
 for(const {id:locale} of i18n.LOCALES){
  i18n.setActiveLocale(locale);const env=propertiesEnv(p,e),tree=evaluate(propertiesCode,env,'properties'),markup=renderToStaticMarkup(tree);assert.doesNotMatch(markup,/engineering\.[A-Za-z]/,locale);assert.match(markup,/type="color"/);assert.match(markup,/data-bind-zone="true"/);
  const diameter=walk(tree).find(n=>n.type==='select'&&n.props['data-pipe-diameter']);assert.ok(diameter);assert.deepEqual(walk(diameter.props.children).filter(n=>n.type==='option').map(n=>n.props.value),[16,20,25,32,40,50,63,75,90,100]);
  const view=evaluate(libraryCode,{...env,...symbols,library:true,tab:'networks',tool:null,ENGINEERING_NETWORK_COLORS:{main:'#087cff',cable:'#ffaa00'},catalogPlaced:{current:false},Button:({children})=>React.createElement('button',null,children)},'libraryView');const text=renderToStaticMarkup(view);assert.doesNotMatch(text,/engineering\.[A-Za-z]/,locale);const cards=walk(view).filter(n=>n.type==='button'&&walk(n.props.children).some(c=>c.type==='span'));assert.equal(cards.length,3,`${locale}: auto, main, cable`);
 }
 i18n.setActiveLocale('en');const env=propertiesEnv(p,e,{patch:values=>{clicks++;assert.deepEqual(values,{diameterMm:100});}}),tree=evaluate(propertiesCode,env,'properties');walk(tree).find(n=>n.type==='select'&&n.props['data-pipe-diameter']).props.onChange({target:{value:'100'}});assert.equal(clicks,1);
 const bound=bind.bindPipeToZone(p,e,1).pipe,boundTree=evaluate(propertiesCode,propertiesEnv(save(p,bound),bound),'properties');assert.ok(walk(boundTree).some(n=>n.type==='select'&&n.props['data-pipe-diameter']));assert.ok(!walk(boundTree).some(n=>n.type==='input'&&n.props.type==='color'),'bound pipe uses its zone color');
 const automatic={...bound,auto:{...bound.auto,sizing:'auto'}},autoTree=evaluate(propertiesCode,propertiesEnv(save(p,automatic),automatic),'properties');assert.ok(!walk(autoTree).some(n=>n.type==='select'&&n.props['data-pipe-diameter']));
});

test('the actual extension finish preserves fixed tee edits, manual sizing and the complete drawn prefix',()=>{
 const p=project([[3,0],[7,0]]),bound=bind.bindPipeToZone(p,pipe(),1).pipe;assert.ok(bound);const moved={...bound,points:bound.points.map((p,i)=>i===bound.auto.consumerNodes['head:h0']?{x:2,y:3}:p)},saved=save(p,moved);reset(saved);
 let committed=null;const steps=[...moved.points,{x:10,y:4}].map(point=>({point:{...point}})),state={current:{steps,baseHeadIds:['h0','h1'],waypoints:true,established:true}};
 const finish=evaluate(finishCode,{...m,...route,...draft,tool:'autoPipe',draft:steps.map(s=>s.point),extending:'pipe',current:()=>saved.engineering,useProject:store,autoDraft:state,setAutoError:error=>assert.fail(error),commit:e=>{committed=e;store.getState().commitEngineering({...saved.engineering,elements:{pipe:e}});},choose(){},cancel(){},AUTO_ROUTE_CAPTURE_M:1},'finish');finish();assert.ok(committed);assert.deepEqual(committed.points.slice(0,moved.points.length),moved.points);assert.equal(committed.auto.sizing,'manual');assert.equal(committed.diameterMm,32);assert.deepEqual(committed.auto.consumerNodes,moved.auto.consumerNodes);assert.deepEqual(c.autoConnections(store.getState().project).get('head:h0').point,{x:2,y:3});
 // A new consumer projects inside the edited segment before h1's fixed tee.
 // The actual finish must use remapped indices, not stale metadata. Its old
 // (4,0) position now lands on an existing splice and cannot exercise insertion.
 const added={...saved,heads:[...saved.heads,{...saved.heads[0],id:'new-head',x:5,y:2}]};reset(added);const extended={current:{steps,baseHeadIds:['h0','h1','new-head'],waypoints:true,established:true}};
 const finishNew=evaluate(finishCode,{...m,...route,...draft,tool:'autoPipe',draft:steps.map(s=>s.point),extending:'pipe',current:()=>added.engineering,useProject:store,autoDraft:extended,setAutoError:error=>assert.fail(error),commit:e=>{committed=e;store.getState().commitEngineering({...added.engineering,elements:{pipe:e}});},choose(){},cancel(){},AUTO_ROUTE_CAPTURE_M:1},'finish');finishNew();const links=c.autoConnections(store.getState().project);assert.ok(links.has('head:new-head'));assert.deepEqual(links.get('head:h0').point,{x:2,y:3});assert.deepEqual(links.get('head:h1').point,moved.points[moved.auto.consumerNodes['head:h1']]);assert.ok(committed.auto.consumerNodes['head:h1']>moved.auto.consumerNodes['head:h1']);assert.deepEqual(links.get('head:new-head').point,committed.points[committed.auto.consumerNodes['head:new-head']]);
 const duplicateProject=project([[0,0],[7,0]]),duplicateBound=bind.bindPipeToZone(duplicateProject,pipe([[0,0],[0,0],[10,0]]),1).pipe;assert.ok(duplicateBound);const duplicateSaved=save(duplicateProject,duplicateBound);assert.deepEqual(duplicateSaved.engineering.elements.pipe.points.slice(0,2),xy([[0,0],[0,0]]));reset(duplicateSaved);const duplicateSteps=[...duplicateSaved.engineering.elements.pipe.points,{x:10,y:4}].map(point=>({point}));
 const finishDuplicate=evaluate(finishCode,{...m,...route,...draft,tool:'autoPipe',draft:duplicateSteps.map(s=>s.point),extending:'pipe',current:()=>duplicateSaved.engineering,useProject:store,autoDraft:{current:{steps:duplicateSteps,baseHeadIds:['h0','h1'],waypoints:true,established:true}},setAutoError:error=>assert.fail(error),commit:e=>{committed=e;store.getState().commitEngineering({...duplicateSaved.engineering,elements:{pipe:e}});},choose(){},cancel(){},AUTO_ROUTE_CAPTURE_M:1},'finish');finishDuplicate();assert.deepEqual(committed.points,duplicateSteps.map(s=>s.point));assert.equal(c.autoConnections(store.getState().project).get('head:h0').distance,0);const duplicateHyd=h.calculateEngineering(store.getState().project);assert.ok(!duplicateHyd.issues.includes('loop'));assert.deepEqual(duplicateHyd.connected.slice().sort(),['head:h0','head:h1']);
});

function canvasEnv(p,e,patch={}){
 const px=30,hydraulic=h.calculateEngineering(p);
 return {...propertiesEnv(p,e??pipe()),item:e,...v,AutoPipeDrawing,EngineeringSprinklers,stage:{current:null},panning:false,spaceDown:false,hover:null,tool:null,insertion:null,drag:{current:null},grid:false,step:.5,px,panX:35,panY:55,focus:null,focusHeads(){},displayed:e?[e]:[],selected:e?.id,node:null,nodeMode:null,hydraulic,autoPreview:{branches:[],headIds:[]},draft:[],snap:null,autoDraft:{current:{}},pointers:{current:new Map()},pinch:{current:null},onDown(){},onMove(){},onUp(){},onDoubleClick(){},setPanning(){},setPreview(){},setSnap(){},isRoute:t=>['main','autoPipe','cable'].includes(t),dash:()=>undefined,label:()=>'',...patch};
}
test('actual SVG renders fixed tees, node ghost and route target at screen size; native visual sheets are optional',async()=>{
 const p=project([[2,0],[8,0]]),bound=bind.bindPipeToZone(p,pipe(),1).pipe,saved=save(p,bound);let env=canvasEnv(saved,bound,{node:1}),tree=evaluate(canvasCode,env,'canvasView'),markup=renderToStaticMarkup(tree);assert.equal((markup.match(/data-route-node=/g)||[]).length,bound.points.length);assert.match(markup,/data-node-selected="true"/);
 env=canvasEnv(saved,bound,{nodeMode:'add',hover:{x:4,y:3},insertion:interaction.routeNodeInsertion(bound.points,{x:4,y:3})});const ghostTree=evaluate(canvasCode,env,'canvasView'),ghost=renderToStaticMarkup(ghostTree);assert.match(ghost,/data-node-preview="true"/);assert.match(ghost,/data-cursor="target"/);assert.match(ghost,/cx="4" cy="0.5"/);const previewNode=walk(ghostTree).find(n=>n.props?.['data-node-preview']);assert.ok(!walk(previewNode).some(n=>n.type==='polyline'||n.type==='path'),'insertion preview only marks the projected node, with no dashed ghost route');assert.ok(!ghost.includes('data-route-target='));
 const targetAtScale=[];for(const px of [20,80]){const targetEnv=canvasEnv(p,null,{px,tool:'autoPipe',hover:{x:3,y:2}}),node=evaluate(canvasCode,targetEnv,'canvasView'),g=walk(node).find(n=>n.props?.['data-route-target']);assert.ok(g);const circle=walk(g).find(n=>n.type==='circle');targetAtScale.push(circle.props.r*px);assert.equal(walk(node).find(n=>n.type==='svg').props['data-cursor'],'target');}
 assert.deepEqual(targetAtScale,[8,8],'zoom changes world radius, not the visual target size');
 for(const patch of [{panning:true},{spaceDown:true}]){const hidden=renderToStaticMarkup(evaluate(canvasCode,canvasEnv(p,null,{tool:'main',hover:{x:3,y:2},...patch}),'canvasView'));assert.ok(!hidden.includes('data-route-target='));}
 const directory=process.env.ENGINEERING_EDIT_QA_DIR;if(!directory)return;await mkdir(directory,{recursive:true});
 const concave=project([[10,0],[10,4],[4,4],[4,10]],[[0,0],[10,0],[10,4],[4,4],[4,10],[0,10]]),cp=bind.bindPipeToZone(concave,pipe([[10,0],[10,4],[4,4],[4,10]]),1).pipe;
 const all=project([[0,0],[5,0],[10,0],[5,5]]),ap=bind.bindPipeToZone(all,pipe(),1).pipe;
 const samples=[['Rectangle · fixed tees',saved,bound,{}],['Concave route · inward corners',save(concave,cp),cp,{}],['Manual 32 mm · all zone heads',save(all,ap),ap,{}],['Add node · pointer preview',saved,bound,{nodeMode:'add',hover:{x:4,y:3},insertion:interaction.routeNodeInsertion(bound.points,{x:4,y:3})}],['Route target · screen size',p,null,{tool:'autoPipe',hover:{x:4,y:3},draft:xy([[1,1],[4,1]])}]];
 const canvas=createCanvas(1080,1260),ctx=canvas.getContext('2d');ctx.fillStyle='#f5f8fa';ctx.fillRect(0,0,canvas.width,canvas.height);
 for(let i=0;i<samples.length;i++){const [title,pr,item,patch]=samples[i],x=i%2*540,y=Math.floor(i/2)*420,view=evaluate(canvasCode,canvasEnv(pr,item,patch),'canvasView');let svg=renderToStaticMarkup(view).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" width="540" height="420" ');ctx.save();ctx.translate(x,y);ctx.strokeStyle='#e4e9ee';for(let n=0;n<540;n+=30){ctx.beginPath();ctx.moveTo(n,35);ctx.lineTo(n,420);ctx.stroke();}for(let n=35;n<420;n+=30){ctx.beginPath();ctx.moveTo(0,n);ctx.lineTo(540,n);ctx.stroke();}const figures=(await load('lib/irrigation-figures.ts')).irrigationFigures(pr.drawing);ctx.fillStyle='#e8f1e9';ctx.strokeStyle='#8b9d8f';for(const figure of figures){ctx.beginPath();figure.points.forEach((p,j)=>{const x=35+p.x*30,y=55+p.y*30;if(j)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();ctx.fill();ctx.stroke();}// Native SVG parser lacks the CSS transparent keyword; explicit zero-alpha paint is equivalent.
 const rasterSvg=svg.replaceAll('fill="transparent"','fill="#000000" fill-opacity="0"').replaceAll('stroke="transparent"','stroke="#000000" stroke-opacity="0"');ctx.drawImage(await loadImage(Buffer.from(rasterSvg)),0,0);ctx.fillStyle='#33484b';ctx.font='17px sans-serif';ctx.fillText(title,15,25);ctx.restore();await writeFile(resolve(directory,`engineering-${i+1}.svg`),svg);}
 await writeFile(resolve(directory,'engineering-editing.png'),canvas.toBuffer('image/png'));
});

test('boundary binding preserves the main source and head at that anchor; automatic construction still offsets once',()=>{
 const p=project([[0,0],[3,0],[7,0]]),main=pipe([[0,-3],[0,0]],{id:'main',type:'main'});p.engineering.elements.main=main;const inlet=m.newEquipment(p.engineering,'inlet',{x:0,y:-3});p.engineering.elements[inlet.id]=inlet;p.engineering.hydraulics={sourceId:inlet.id,inletPressureBar:3};
 const result=bind.bindPipeToZone(p,pipe(),1);assert.ok(result.pipe,result.error);const bound=result.pipe;assert.deepEqual(bound.points[0],{x:0,y:0});assert.equal(bound.auto.headStartIndex,0);assert.equal(bound.auto.insetM,.5);
 const saved=save(p,bound),links=c.autoConnections(saved);assert.equal(links.get('head:h0').distance,0);assert.deepEqual(links.get('head:h0').point,{x:0,y:0});const hyd=h.calculateEngineering(saved);assert.ok(!hyd.issues.includes('loop'));assert.equal(hyd.connected.length,3);assert.ok(hyd.edges.some(e=>e.pipeId==='main'&&e.flow>0));assert.deepEqual(hyd.source,{x:0,y:-3});
 const free=draft.buildAutoRoute(p,{steps:xy([[0,0],[10,0]]).map(point=>({point})),waypoints:true});assert.ok(!free.error,free.error);assert.deepEqual(free.points[0],{x:0,y:0});assert.deepEqual(free.points.at(-1),{x:10,y:0});for(const id of ['h1','h2'])assert.equal(free.points[free.consumerNodes['head:'+id]].y,.5);
});

test('direct binding retains existing main and zone junctions; route indices survive edits',()=>{
 for(const [circuit,points] of [['zone:2',[[0,0],[0,-2]]],['main',[[10,-2],[10,0]]],['zone:1',[[10,0],[10,-2]]]]){
  const p=project([[3,0],[7,0]]),existing=pipe(points,{id:'existing',...(circuit==='main'?{}:{auto:{circuit,captureM:.1,consumerIds:[],selection:'heads'}})});p.engineering.elements.existing=existing;const snapshot=JSON.stringify(p);const bound=bind.bindPipeToZone(p,pipe(),1).pipe;assert.ok(bound,circuit);assert.equal(bound.auto.networkCircuit,'main');assert.deepEqual(bound.points[0],{x:0,y:0});assert.deepEqual(bound.points.at(-1),{x:10,y:0});assert.equal(JSON.stringify(p),snapshot);
 }
 const p=project([[3,0],[7,0]]);p.engineering.elements.main=pipe([[0,-2],[0,0]],{id:'main'});const bound=bind.bindPipeToZone(p,pipe(),1).pipe;assert.ok(bound);assert.equal(bound.auto.pathMode,'waypoints');assert.equal(bound.auto.headStartIndex,0);assert.deepEqual(bound.points[0],{x:0,y:0});assert.deepEqual(bound.points.at(-1),{x:10,y:0});assert.equal(bound.auto.insetM,.5);for(const link of c.autoConnections(save(p,bound)).values())assert.ok(Math.abs(link.point.y-.5)<1e-6);
 const inserted=m.insertEngineeringNode(bound,1,{x:0,y:.25});assert.equal(inserted.auto.headStartIndex,0);const restored=m.removeEngineeringNode(inserted,1);assert.equal(restored.auto.headStartIndex,bound.auto.headStartIndex);assert.deepEqual(restored.points,bound.points);assert.deepEqual(restored.auto.consumerNodes,bound.auto.consumerNodes);
 const sourceRemoved=m.removeEngineeringNode(bound,0);assert.equal(sourceRemoved.auto.headStartIndex,0);assert.deepEqual(sourceRemoved.points[0],bound.points[1]);
});

test('network properties keep the requested order, omit duplication and redundant zone text, and offer both extension ends in every locale',()=>{
 const p=project([[3,0],[7,0]]),manual=pipe(),bound=bind.bindPipeToZone(p,manual,1).pipe,automatic={...bound,auto:{...bound.auto,sizing:'auto'}};
 for(const{id:locale}of i18n.LOCALES){
  i18n.setActiveLocale(locale);
  for(const item of [manual,bound,automatic]){
   const calls=[],tree=evaluate(propertiesCode,propertiesEnv(save(p,item),item,{node:1,extend:fromStart=>calls.push(fromStart)}),'properties'),nodes=walk(tree),markup=renderToStaticMarkup(tree),fieldset=nodes.find(n=>n.type==='fieldset'),direct=React.Children.toArray(fieldset.props.children);
   const nameIndex=direct.findIndex(n=>n.type==='label'&&walk(n).some(x=>x.type==='input'&&x.props.defaultValue=== (item.name??'')));
   if(item===automatic){assert.equal(direct[0].type,'p');assert.match(renderToStaticMarkup(direct[0]),new RegExp(i18n.text('engineering.autoPipe')));assert.equal(nameIndex,1);}else{assert.equal(nameIndex,0);assert.ok(walk(direct[1]).some(n=>n.props?.['data-pipe-diameter']));}
   assert.ok(!nodes.some(n=>n.type==='button'&&n.props.children===i18n.text('duplicate')));assert.ok(!markup.includes('>'+i18n.text('duplicate')+'<'));
   assert.equal(nodes.find(n=>n.props?.['data-node-action']==='remove').props['data-node-selected'],true);
   const endButtons=nodes.filter(n=>n.props?.['data-extend-from']);assert.deepEqual(endButtons.map(n=>n.props['data-extend-from']),['start','end']);endButtons.forEach(n=>n.props.onClick());assert.deepEqual(calls,[true,false]);
   if(item.auto)assert.ok(!markup.includes(i18n.text('engineering.routeInset',{distance:units.formatLenU(.5,units.METRIC_UNITS.length)})));
   const buttons=nodes.filter(n=>n.type==='button');assert.ok(buttons.at(-1).props.className.includes('engineering-delete'));
  }
 }i18n.setActiveLocale('en');
});
test('actual extension selection and finish support both ends of manual, cable and zone-bound routes',()=>{
 const p=project([[3,0],[7,0]]),bound=bind.bindPipeToZone(p,pipe(),1).pipe;
 for(const item of [pipe(),{...pipe(),kind:'cable',cableType:'signal'},bound,{...bound,auto:{...bound.auto,selection:undefined}}])for(const fromStart of [false,true]){
  const saved=save(p,item);reset(saved);let points,tool,committed,chosen;const ref={current:draft.emptyAutoRouteDraft()},noop=()=>{};
  const extend=evaluate(extendCode,{item,locked:false,project:saved,cancel:noop,setExtending:id=>chosen=id,setNode:noop,setEditing:noop,autoDraft:ref,setTool:v=>tool=v,setDraft:v=>points=v,setHover:noop,setLibrary:noop,setScheme:noop},'extend');extend(fromStart);
  assert.equal(chosen,item.id);assert.deepEqual(points,fromStart?[...item.points].reverse():item.points);assert.equal(ref.current.fromStart,fromStart);
  const addition={x:fromStart?-3:13,y:2};points=[...points,addition];ref.current={...ref.current,steps:points.map(point=>({point}))};
  const finish=evaluate(finishCode,{...m,...c,...route,...draft,tool,draft:points,extending:item.id,current:()=>saved.engineering,useProject:store,autoDraft:ref,setAutoError:error=>assert.fail(error),commit:value=>committed=value,choose:noop,cancel:noop,AUTO_ROUTE_CAPTURE_M:1},'finish');finish();assert.ok(committed);assert.deepEqual(fromStart?committed.points[0]:committed.points.at(-1),addition);
  assert.deepEqual(fromStart?committed.points.slice(-item.points.length):committed.points.slice(0,item.points.length),item.points);assert.equal(committed.diameterMm,item.diameterMm);
  if(item.auto){const after=c.autoConnections(save(p,committed)),before=c.autoConnections(saved);for(const[id,link]of before)assert.deepEqual(after.get(id).point,link.point);}
 }
});
test('network display sorts numeric zones first and retains stable order within each zone without mutating saved elements',async()=>{
 const {sortEngineeringNetworks}=await load('lib/engineering-view.ts');const rows=[pipe([[0,0],[1,0]],{id:'independent'}),...[[10,'ten'],[2,'two-a'],[1,'one'],[2,'two-b']].map(([zone,id])=>pipe([[0,0],[1,0]],{id,auto:{circuit:'zone:'+zone}}))];const snapshot=JSON.stringify(rows);
 assert.deepEqual(sortEngineeringNetworks(rows).map(e=>e.id),['one','two-a','two-b','ten','independent']);assert.equal(JSON.stringify(rows),snapshot);
});

test('dragging a leader with mouse or touch moves only the callout and commits once',()=>{for(const pointerType of ['mouse','touch']){const p=project(),item=m.newEquipment(m.emptyEngineering(),'roundValveBox',{x:2,y:3}),f=events(p,item,{pointerType}),target={closest:selector=>['[data-engineering-id]','[data-equipment-leader]'].includes(selector)?{getAttribute:()=>item.id}:null};f.handlers().onDown(f.event(3,2,{target}));f.handlers().onMove(f.event(-2,7));assert.deepEqual([f.preview.x,f.preview.y],[2,3]);assert.ok(f.preview.leaderOffset.x<0);assert.ok(f.preview.leaderOffset.y>0);f.handlers().onUp(f.event(-2,7));assert.equal(f.commits,1);assert.ok(f.committed.leaderOffset.x<0);}});
