import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createCanvas} from '@napi-rs/canvas';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
let server,load;
before(async()=>{server=await createServer({server:{middlewareMode:true,hmr:false}});load=p=>server.ssrLoadModule('/src/'+p);});
after(async()=>server.close());

test('text interaction is enabled in all editing workspaces, but not preview, simulation or placement',async()=>{
 const source=await readFile(new URL('../src/components/designer/design-canvas.tsx',import.meta.url),'utf8');
 const expression=source.match(/const noteEnabled = ([\s\S]*?);/)[1];
 const enabled=new Function('workspaceSection','readOnly','simulationActive','spaceDown','pendingPlacement','tool','drawSub','cadDrawing',`return ${expression}`);
 for(const workspace of ['plan','landscape','irrigation']){
  for(const tool of [null,'move','draw']) assert.equal(enabled(workspace,false,false,false,false,tool,'none',{}),true);
  assert.equal(enabled(workspace,true,false,false,false,null,'none',{}),false);
  assert.equal(enabled(workspace,false,true,false,false,null,'none',{}),false);
  assert.equal(enabled(workspace,false,false,true,false,null,'none',{}),false);
  assert.equal(enabled(workspace,false,false,false,true,null,'none',{}),false);
  assert.equal(enabled(workspace,false,false,false,false,'draw','rectangle',{}),false);
  assert.equal(enabled(workspace,false,false,false,false,null,'none',{layers:{annotations:{locked:true}}}),false);
 }
 assert.equal(enabled('reference',false,false,false,false,null,'none',{}),false);
 assert.match(source,/if\(st.workspaceSection === 'plan'\) st.setCadMode\("select"\)/);
});

test('deleting plan figures removes their linked dimensions and leaves other figures and free dimensions intact',async()=>{
 const e=await load('lib/cad/engine.ts'),{emptyDrawing}=await load('lib/cad/types.ts'),{emptyProject}=await load('lib/project-types.ts');
 const {automaticDimensions}=await load('lib/cad/auto-dimensions.ts');
 let drawing=e.addRect(emptyDrawing(),{x:0,y:0},{x:10,y:6},'lawn');
 const rectangle=Object.keys(drawing.faces)[0];
 drawing=e.addRect(drawing,{x:20,y:0},{x:30,y:6},'lawn');
 drawing=e.addCircle(drawing,{x:40,y:0},2,'lawn');
 const circle=Object.values(drawing.faces).find(f=>f.circle).id;
 drawing=automaticDimensions({...emptyProject(),drawing},'plan');
 drawing=e.addDim(drawing,{x:0,y:0},{x:10,y:0});
 drawing.dims.free={id:'free',a:{x:70,y:0},b:{x:80,y:0},offset:1};
 const otherDimensions=Object.values(drawing.dims).filter(dim=>dim.id==='free'||dim.faceAxis?.id===circle||dim.a.x>=20);
 const after=e.deleteFace(drawing,rectangle);
 assert.deepEqual(Object.values(after.dims),otherDimensions);
 const afterCircle=e.deleteFace(after,circle);
 assert.equal(Object.values(afterCircle.dims).length,5);
 assert.deepEqual(afterCircle.dims.free,drawing.dims.free);
 assert.equal(Object.values(drawing.dims).length,11,'input is immutable');
});

test('single and bulk sprinkler deletion reconnects surviving neighbours, removes head anchors, and supports undo/reopen',async()=>{
 const e=await load('lib/cad/engine.ts'),{emptyDrawing}=await load('lib/cad/types.ts'),{emptyProject}=await load('lib/project-types.ts');
 const {automaticDimensions}=await load('lib/cad/auto-dimensions.ts'),{useProject:s}=await load('lib/project-store.ts');
 const head=(id,x)=>({id,x,y:0,catalogId:'MP1000-360',zone:1,r:3,start:0,arc:360});
 const heads=[head('a',0),head('b',4),head('c',8),head('d',12)];
 let project={...emptyProject(),drawing:e.addRect(emptyDrawing(),{x:0,y:0},{x:12,y:8},'lawn'),heads};
 project.drawing=automaticDimensions(project,'irrigation');project.polygons=e.toPolygons(project.drawing);
 for(const bulk of [false,true]){
  s.setState({project,workspaceSection:'irrigation',selectedId:null,selectedIds:[],selectedPolyId:null,selectedPolyIds:[],selectedEdgeId:null,
   selectedLandscapeId:null,selectedPlantId:null,groupMemberId:null,cadEditId:null,past:[],future:[],pastOps:[],futureOps:[]});
  // A manually placed dimension with only one sprinkler endpoint also follows it.
  s.getState().addDimension({x:4,y:0},{x:4,y:-4});
  const manual=Object.values(s.getState().project.drawing.dims).find(dim=>!dim.autoKey);
  assert.equal(manual.aHeadId,'b');assert.ok(e.drawingOrMigrate(s.getState().project).dims[manual.id]);
  const previous=s.getState().project;
  if(bulk){s.setState({selectedId:'b',selectedIds:['b','c']});s.getState().deleteSelected();}
  else s.getState().removeHead('b');
  const next=s.getState().project,dims=Object.values(next.drawing.dims);
  assert.ok(!next.drawing.dims[manual.id]);
  const pairs=dims.filter(d=>d.autoKey?.includes(':side:')).map(d=>[d.a.x,d.b.x]);
  assert.deepEqual(pairs,bulk?[[0,12]]:[[0,8],[8,12]]);
  assert.deepEqual(e.drawingOrMigrate(JSON.parse(JSON.stringify(next))).dims,next.drawing.dims);
  s.getState().undo();assert.deepEqual(s.getState().project.drawing.dims,JSON.parse(JSON.stringify(previous.drawing.dims)));
  s.getState().redo();assert.deepEqual(s.getState().project.drawing.dims,next.drawing.dims);
 }
});

test('preview native pinch, wheel and Safari gestures zoom both ways without doubling a touch pinch',async()=>{
 const {installPreviewNavigation,previewZoomAt}=await load('components/designer/preview-navigation.ts');
 class Surface extends EventTarget {
  clientWidth=1000;clientHeight=600;captures=new Set();
  getBoundingClientRect(){return {left:20,top:30,width:1000,height:600};}
  setPointerCapture(id){this.captures.add(id);}hasPointerCapture(id){return this.captures.has(id);}releasePointerCapture(id){this.captures.delete(id);}
 }
 const element=new Surface();let view={px:40,panX:0,panY:0};
 const stop=installPreviewNavigation(element,()=>view,v=>{view=v;});
 const send=(type,props)=>{const event=Object.assign(new Event(type,{cancelable:true}),props);element.dispatchEvent(event);return event;};
 const touches=(x1,x2)=>[{identifier:1,clientX:x1+20,clientY:130},{identifier:2,clientX:x2+20,clientY:130}];
 send('touchstart',{touches:touches(100,300)});
 send('touchmove',{touches:touches(150,250)});assert.equal(view.px,20);
 const current={...view};send('gesturestart',{scale:1});send('gesturechange',{scale:.5});assert.deepEqual(view,current);
 send('touchmove',{touches:touches(100,300)});assert.equal(view.px,40);
 assert.deepEqual(view,{px:40,panX:0,panY:0});
 send('touchend',{touches:[]});
 send('wheel',{clientX:220,clientY:130,deltaY:100,deltaMode:0,ctrlKey:false,metaKey:false});assert.ok(view.px<40);
 send('wheel',{clientX:220,clientY:130,deltaY:-100,deltaMode:0,ctrlKey:false,metaKey:false});assert.ok(Math.abs(view.px-40)<1e-10);
 send('gesturestart',{clientX:220,clientY:130,scale:1});send('gesturechange',{scale:.5});assert.ok(Math.abs(view.px-20)<1e-10);
 send('gesturechange',{scale:2});assert.ok(Math.abs(view.px-80)<1e-10);send('gestureend',{});
 assert.equal(previewZoomAt({px:.5,panX:0,panY:0},{x:200,y:100},.25).px,.25,'zoom out below the former preview floor');
 stop();const last=view;send('wheel',{deltaY:100});assert.equal(view,last);
});

test('rendered text has a selectable hit area, orange frame and four resize handles',async()=>{
 const React=await import('react'),{act}=React;
 const {default:Konva}=await import('konva'),{KonvaRenderer}=await import('react-konva/lib/ReactKonvaCore.js');
 const {CanvasNote,canvasNoteHit}=await load('components/designer/canvas-note.tsx');
 const create=Konva.Util.createCanvasElement,doc=globalThis.document;
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.document={};
 Konva.Util.createCanvasElement=()=>{const c=createCanvas(1,1);c.style={};return c;};
 const stage=new Konva.Stage({width:500,height:240}),errors=[],error=e=>errors.push(e);
 const root=KonvaRenderer.createContainer(stage,1,null,false,null,'',error,error,error,null),resizes=[];
 const note={id:'garden-note',text:'Сад • Garden',x:1,y:1,size:.5,fontFamily:'Arial'};let begins=0;
 const render=selected=>act(async()=>KonvaRenderer.updateContainer(React.createElement('Layer',null,
  React.createElement('Rect',{width:500,height:240,fill:'#fff'}),
  React.createElement(CanvasNote,{note,x:40,y:40,px:60,ink:'#202b24',enabled:true,selected,
   onBegin:()=>begins++,onSelect:()=>{},onResize:(corner,bounds,event)=>{event.cancelBubble=true;resizes.push({corner,bounds});}})),root,null));
 try{
  await render(false);stage.draw();
  const hit=canvasNoteHit(stage,{x:70,y:50});assert.equal(hit?.id,note.id);assert.equal(hit?.resize,false);
  hit.node.fire('pointerdown',{evt:{preventDefault(){},stopPropagation(){}}},true);assert.equal(begins,1);
  await render(true);stage.draw();
  const group=canvasNoteHit(stage,{x:70,y:50}).node;
  const rects=group.find('Rect');assert.equal(rects.length,5);assert.equal(rects[0].stroke(),'#e8892f');
  for(const handle of rects.slice(1)){
   assert.equal(handle.width(),10);assert.equal(handle.height(),10);
   handle.fire('pointerdown',{evt:{}},true);
  }
  assert.equal(resizes.length,4);assert.ok(resizes.every(r=>r.bounds.width>100&&r.bounds.height>=30));
  const corner=canvasNoteHit(stage,{x:35,y:35});assert.equal(corner.resize,true);
  await mkdir('/workspace/screenshots',{recursive:true});await writeFile('/workspace/screenshots/text-selection-v386.png',stage.toCanvas().toBuffer('image/png'));
  assert.deepEqual(errors,[]);
 }finally{await act(async()=>KonvaRenderer.updateContainer(null,root,null));stage.destroy();Konva.Util.createCanvasElement=create;globalThis.document=doc;}
});
