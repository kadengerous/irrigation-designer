import test,{before,after} from 'node:test';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createCanvas,Image,loadImage} from '@napi-rs/canvas';
import {Line} from 'konva/lib/shapes/Line.js';
import {Circle} from 'konva/lib/shapes/Circle.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
let server,load;
before(async()=>{server=await createServer({server:{middlewareMode:true,hmr:false}});load=p=>server.ssrLoadModule('/src/'+p);});
after(async()=>await server.close());

test('snap results contain only coordinates; sprinkler models cannot corrupt placed or moved landscape objects',async()=>{
 const {cadSnap}=await load('lib/cad/snap.ts'),{useProject:s,migrateProject}=await load('lib/project-store.ts');
 const {emptyProject}=await load('lib/project-types.ts'),{emptyDrawing}=await load('lib/cad/types.ts');
 const head={id:'head-a',catalogId:'MP1000-360',x:5,y:5,r:3,start:0,arc:360,zone:1};
 const options={pxPerMeter:100,snapOn:true,snapGridOn:false,gridStep:.5,heads:[head]};
 const hit=cadSnap({x:5.01,y:5.01},emptyDrawing(),options);
 assert.equal(hit.kind,'head');assert.deepEqual(hit.pt,{x:5,y:5});
 s.setState({project:{...emptyProject(),drawing:emptyDrawing(),heads:[head]},past:[],future:[],snapOn:true,snapGridOn:false,pxPerMeter:100});
 s.getState().prepareLandscape('bench-wood',{width:1,length:2,rotation:0,keepRatio:true});s.getState().placeLandscape({x:5.01,y:5.01},'touch');
 const id=s.getState().selectedLandscapeId;
 assert.equal(s.getState().project.drawing.landscapeObjects[id].catalogId,'bench-wood');
 s.getState().updateLandscape(id,{...head,x:8,y:8});
 assert.equal(s.getState().project.drawing.landscapeObjects[id].id,id);
 assert.equal(s.getState().project.drawing.landscapeObjects[id].catalogId,'bench-wood');
 // Reproduce the already-saved corruption: map key and entity id used to differ.
 const bad=structuredClone(s.getState().project);
 bad.drawing.landscapeObjects[id]={...bad.drawing.landscapeObjects[id],id:'head-a',catalogId:'MP1000-360'};
 bad.drawing.landscapeObjects.second={...bad.drawing.landscapeObjects[id]};
 const repaired=migrateProject(bad);assert.equal(repaired.drawing.landscapeObjects[id].id,id);
 assert.equal(repaired.drawing.landscapeObjects.second.id,'second');
 s.setState({project:repaired,past:[],future:[]});
 s.getState().changeLandscapeGroup('object',id,'delete');
 assert.equal(Object.keys(s.getState().project.drawing.landscapeObjects).length,0);
 assert.deepEqual(s.getState().project.heads,repaired.heads);
 s.getState().undo();assert.equal(Object.keys(s.getState().project.drawing.landscapeObjects).length,2);
 s.getState().redo();assert.equal(Object.keys(s.getState().project.drawing.landscapeObjects).length,0);
});

test('simulation lawn uses complete irrigation regions with exclusions and does not change saved fills',async()=>{
 const {simulationLawnSurface}=await load('lib/simulation-lawn.ts');
 const {addRect,toPolygons}=await load('lib/cad/engine.ts'),{emptyDrawing}=await load('lib/cad/types.ts'),{emptyProject}=await load('lib/project-types.ts');
 const {surfaceArea,pointInSurface}=await load('lib/irrigation-geometry.ts');
 let d=addRect(emptyDrawing(),{x:0,y:0},{x:10,y:10},'lawn');
 d=addRect(d,{x:4,y:0},{x:6,y:10},'path');
 d.landscapeObjects={bench:{id:'bench',catalogId:'bench-wood',category:'furniture',x:2,y:2,length:2,width:1,rotation:0,noIrrigation:true,keepRatio:true}};
 const project={...emptyProject(),drawing:d,polygons:toPolygons(d),heads:[{id:'h',catalogId:'MP1000-360',x:1,y:1,r:2,arc:360,start:0,zone:1}]};
 const before=JSON.stringify(project),surface=simulationLawnSurface(project);
 assert.equal(surfaceArea(surface),78);assert.equal(pointInSurface({x:5,y:5},surface),false);assert.equal(pointInSurface({x:2,y:2},surface),false);
 assert.equal(pointInSurface({x:9,y:9},surface),true,'uncovered lawn is still lawn');assert.equal(JSON.stringify(project),before);
 const bare={...project,drawing:emptyDrawing(),polygons:[]};
 assert.deepEqual(simulationLawnSurface(bare),[],'sprinkler sectors never become lawn');
 assert.deepEqual(simulationLawnSurface({...project,heads:[]}),surface,'drawn lawn does not require sprinklers');
 assert.deepEqual(simulationLawnSurface({...project,heads:project.heads.map(h=>({...h,x:90,y:90,r:20,arc:90}))}),surface,'sprinkler placement and sector size never affect the lawn');
 assert.deepEqual(simulationLawnSurface({...bare,heads:[]}),[]);
});

test('lawn size and alignment stay fixed across adjacent shapes, pan and zoom',async()=>{
 const {bindMaterialPattern}=await load('components/designer/material-pattern.ts');
 const {lawnPeriodMeters,LAWN_PATTERN_PIXELS}=await load('lib/cad/lawn-pattern.ts');
 for(const fill of ['texture:lawn-parterre','texture:lawn-sport','texture:lawn-meadow','texture:lawn-striped'])for(const px of [18,36,144]){
  const shape=new Line({points:[300,200,900,200,900,600,300,600],closed:true}),circle=new Circle({x:650,y:420,radius:80});
  const origin={x:105,y:-33},reference={width:20,height:10};
  const stop=bindMaterialPattern(shape,fill,reference,px,0,origin),stop2=bindMaterialPattern(circle,fill,reference,px,0,origin);
  assert.ok(Math.abs(shape.fillPatternScaleX()*LAWN_PATTERN_PIXELS/px-lawnPeriodMeters(fill))<1e-9);
  for(const node of [shape,circle]){
   const p=node.getTransform().point({x:node.fillPatternX(),y:node.fillPatternY()});assert.deepEqual(p,origin);
  }
  circle.position({x:900,y:-10});
  assert.deepEqual(circle.getTransform().point({x:circle.fillPatternX(),y:circle.fillPatternY()}),origin);
  stop();stop2();shape.destroy();circle.destroy();
 }
});

test('all four lawn materials render continuous opaque fields at their world scale',async()=>{
 const {seamlessPattern}=await load('lib/cad/seamless-pattern.ts');
 const {lawnPeriodMeters}=await load('lib/cad/lawn-pattern.ts');
 const oldImage=globalThis.Image,oldDoc=globalThis.document;
 globalThis.Image=Image;globalThis.document={createElement:()=>createCanvas(1,1)};
 try{
  const preview=createCanvas(1000,760),ctx=preview.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1000,760);
  for(const [index,id] of ['parterre','sport','meadow','striped'].entries()){
   const img=await loadImage(`public/materials/lawn-${id==='striped'?'parterre':id}.png`);
   const tile=await seamlessPattern(img,'texture:lawn-'+id);
   assert.equal(tile.width,1024);assert.equal(tile.height,1024);
   const one=createCanvas(1024,1024),c=one.getContext('2d');c.drawImage(tile,0,0);
   const data=c.getImageData(0,0,1024,1024).data;
   // The repeat edge should be no more conspicuous than an interior grass pixel.
   let seam=0,inside=0;
   for(let y=0;y<1024;y++)for(let ch=0;ch<3;ch++){
    seam+=Math.abs(data[(y*1024)*4+ch]-data[(y*1024+1023)*4+ch]);
    inside+=Math.abs(data[(y*1024+510)*4+ch]-data[(y*1024+511)*4+ch]);
   }
   assert.ok(seam<=inside*2.5+3072,`${id}: edge contrast ${seam/3072} vs interior ${inside/3072}`);
   if(id!=='striped'){
    const means=[],contrasts=[];
    for(let by=0;by<1024;by+=128)for(let bx=0;bx<1024;bx+=128){
     let sum=0,square=0;
     for(let yy=by;yy<by+128;yy++)for(let xx=bx;xx<bx+128;xx++){
      const p=(yy*1024+xx)*4,l=(data[p]+2*data[p+1]+data[p+2])/4;sum+=l;square+=l*l;
     }
     const mean=sum/16384;means.push(mean);contrasts.push(Math.sqrt(square/16384-mean*mean));
    }
    assert.ok(Math.max(...means)-Math.min(...means)<6,`${id}: uneven square lighting ${Math.max(...means)-Math.min(...means)}`);
    assert.ok(Math.max(...contrasts)/Math.min(...contrasts)<1.35,`${id}: square contrast patches ${Math.max(...contrasts)/Math.min(...contrasts)}`);
   }
   const x=index%2*500,y=Math.floor(index/2)*380,size=lawnPeriodMeters('texture:lawn-'+id)*55;
   ctx.save();ctx.beginPath();ctx.rect(x+8,y+30,484,340);ctx.clip();
   ctx.translate(x+8,y+30);ctx.scale(size/1024,size/1024);ctx.fillStyle=ctx.createPattern(tile,'repeat');ctx.fillRect(0,0,484*1024/size,340*1024/size);
   ctx.restore();ctx.fillStyle='#202e22';ctx.font='18px sans-serif';ctx.fillText(id+' · 55 px/m',x+8,y+23);
  }
  await mkdir('/workspace/screenshots',{recursive:true});await writeFile('/workspace/screenshots/lawn-v385.png',preview.toBuffer('image/png'));
 }finally{globalThis.Image=oldImage;globalThis.document=oldDoc;}
});

test('simulation ground renders holes and disappears when simulation stops',async()=>{
 const React=await import('react'),{act}=React;
 const {default:Konva}=await import('konva');
 const {KonvaRenderer}=await import('react-konva/lib/ReactKonvaCore.js');
 const {SimulationLawn}=await load('components/designer/simulation-lawn.tsx');
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const create=Konva.Util.createCanvasElement,pixelRatio=Konva.pixelRatio;
 Konva.pixelRatio=2;
 Konva.Util.createCanvasElement=()=>{const c=createCanvas(1,1);c.style={};return c;};
 const stage=new Konva.Stage({width:400,height:300}),errors=[],error=e=>errors.push(e);
 const root=KonvaRenderer.createContainer(stage,1,null,false,null,'',error,error,error,null);
 try{
  const surface=[[[[0,0],[8,0],[8,6],[0,6],[0,0]],[[3,2],[5,2],[5,4],[3,4],[3,2]]]];
  const render=(active,image)=>act(async()=>KonvaRenderer.updateContainer(React.createElement('Layer',null,
   React.createElement('Rect',{width:400,height:300,fill:'#ffffff'}),
   active&&React.createElement(SimulationLawn,{surface,image,px:40,panX:20,panY:20})),root,null));
  await render(true);stage.draw();const canvas=stage.toCanvas(),ctx=canvas.getContext('2d');
  assert.deepEqual([...ctx.getImageData(180,140,1,1).data],[255,255,255,255],'hole stays clear');
  assert.deepEqual([...ctx.getImageData(60,60,1,1).data],[68,132,45,255],'ground is painted');
  assert.equal(stage.findOne('.simulation-lawn').listening(),false);
  const oldImage=globalThis.Image,oldDoc=globalThis.document;
  globalThis.Image=Image;globalThis.document={createElement:()=>createCanvas(1,1)};
  let image;
  try{
   const {seamlessPattern}=await load('lib/cad/seamless-pattern.ts');
   image=await seamlessPattern(await loadImage('public/materials/lawn-parterre.png'),'texture:lawn-parterre');
  }finally{globalThis.Image=oldImage;globalThis.document=oldDoc;}
  await render(true,image);stage.draw();
  const textured=stage.toCanvas().getContext('2d');
  const grass=[...textured.getImageData(60,60,1,1).data];
  assert.ok(grass[1]>grass[0] && grass[1]>grass[2] && grass[3]===255,`loaded grass visible: ${grass}`);
  assert.deepEqual([...textured.getImageData(180,140,1,1).data],[255,255,255,255],'textured hole stays clear');
  await writeFile('/workspace/screenshots/simulation-v385.png',stage.toCanvas().toBuffer('image/png'));
  await render(false);assert.equal(stage.find('.simulation-lawn').length,0);assert.deepEqual(errors,[]);
 }finally{await act(async()=>KonvaRenderer.updateContainer(null,root,null));stage.destroy();Konva.Util.createCanvasElement=create;Konva.pixelRatio=pixelRatio;}
});

test('plan assignments alone define simulation lawn, including non-sprinkler irrigation',async()=>{
 const {simulationLawnSurface}=await load('lib/simulation-lawn.ts');
 const {addRect,addCircle,setFaceHydro,toPolygons}=await load('lib/cad/engine.ts');
 const {emptyDrawing}=await load('lib/cad/types.ts'),{emptyProject}=await load('lib/project-types.ts');
 const {surfaceArea,pointInSurface}=await load('lib/irrigation-geometry.ts');
 let drawing=addRect(emptyDrawing(),{x:0,y:0},{x:5,y:3.5},'lawn');
 const rectangle=Object.keys(drawing.faces)[0];
 drawing=setFaceHydro(drawing,rectangle,{purpose:'irrigation',method:'drip'});
 drawing=addCircle(drawing,{x:10,y:0},2,'lawn');
 const circle=Object.keys(drawing.faces).find(id=>id!==rectangle);
 drawing=setFaceHydro(drawing,circle,{purpose:'none'});
 const project={...emptyProject(),drawing,polygons:toPolygons(drawing),heads:[]};
 const surface=simulationLawnSurface(project);
 assert.equal(surfaceArea(surface),17.5);
 assert.equal(pointInSurface({x:4.9,y:3.4},surface),true);
 assert.equal(pointInSurface({x:10,y:0},surface),false);
 const none=setFaceHydro(drawing,rectangle,{purpose:'none'});
 assert.deepEqual(simulationLawnSurface({...project,drawing:none,polygons:toPolygons(none)}),[]);
 const round=setFaceHydro(none,circle,{purpose:'irrigation',method:'bubbler'});
 assert.ok(Math.abs(surfaceArea(simulationLawnSurface({...project,drawing:round,polygons:toPolygons(round)}))-Math.PI*4)<.02);
});

test('simulation follows the displayed watering assignment of default site figures',async()=>{
 const {simulationLawnSurface}=await load('lib/simulation-lawn.ts');
 const {addRect,toPolygons,setFaceHydro}=await load('lib/cad/engine.ts');
 const {emptyDrawing,layerPurpose}=await load('lib/cad/types.ts'),{emptyProject}=await load('lib/project-types.ts');
 const {surfaceArea}=await load('lib/irrigation-geometry.ts');
 const drawing=addRect(emptyDrawing(),{x:0,y:0},{x:5,y:4},'site');
 const face=Object.values(drawing.faces)[0];
 assert.equal(layerPurpose(face),'irrigation');
 const project={...emptyProject(),drawing,polygons:toPolygons(drawing)};
 assert.equal(surfaceArea(simulationLawnSurface(project)),20);
 assert.equal(surfaceArea(simulationLawnSurface({...project,drawing:undefined})),20,'legacy plans remain visible');
 const dry=setFaceHydro(drawing,face.id,{purpose:'none'});
 assert.deepEqual(simulationLawnSurface({...project,drawing:dry,polygons:toPolygons(dry)}),[]);
});

test('simulation hides dimensions and head labels without changing saved settings',async()=>{
 const {useProject:s}=await load('lib/project-store.ts');
 const {emptyProject}=await load('lib/project-types.ts'),{emptyDrawing}=await load('lib/cad/types.ts');
 const {canvasDimensionsVisible,equipmentLabelsVisible}=await load('lib/simulation-presentation.ts');
 for(const visible of [true,false]){
  const drawing=emptyDrawing();drawing.layers.dims.visible=visible;
  const project={...emptyProject(),drawing};
  s.setState({project,showLabels:visible,workspaceSection:'irrigation',simulationProjectId:null,sectorEditId:null});
  const before=JSON.stringify(project);
  assert.equal(canvasDimensionsVisible(s.getState()),visible);assert.equal(equipmentLabelsVisible(s.getState()),visible);
  s.getState().toggleSimulation();
  assert.equal(canvasDimensionsVisible(s.getState()),false);assert.equal(equipmentLabelsVisible(s.getState()),false);
  assert.equal(JSON.stringify(s.getState().project),before);assert.equal(s.getState().showLabels,visible);
  s.getState().toggleSimulation();
  assert.equal(canvasDimensionsVisible(s.getState()),visible);assert.equal(equipmentLabelsVisible(s.getState()),visible);
 }
});

test('short mouse and touch taps select notes; the editor opens only from its action',async()=>{
 // Exercise the actual canvas handlers with native event sequences, without a DOM renderer.
 const source=await readFile('src/components/designer/design-canvas.tsx','utf8');
 const helpers=source.slice(source.indexOf('function clientXY('),source.indexOf('function bindClientDeltaDrag('));
 const handler=source.slice(source.indexOf('  const beginNote ='),source.indexOf('  const beginNoteResize ='));
 const js=ts.transpileModule(helpers+handler,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const create=new Function('env',`const {window,noteEnabled,editDrag,panX,panY,px,setSelectedNote,setNotePreview,setTextEditor,setSelectedDimension,setDimensionEditor,dimensionInteraction,useProject,skipClick,pinchGestureActive,onSelectionClear}=env;${js};return beginNote;`);
 for(const input of ['pointer','touch'])for(const mode of ['tap','drag','cancel','pinch','disabled']){
  const listeners=new Map(),edited=[],moved=[],selected=[],previews=[];
  const window={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),setTimeout:()=>0,clearTimeout:()=>{}};
  const env={window,noteEnabled:mode!=='disabled',editDrag:{current:false},panX:20,panY:30,px:40,
   setSelectedDimension:()=>{},setDimensionEditor:()=>{},dimensionInteraction:{current:false},
   setSelectedNote:id=>selected.push(id),setNotePreview:p=>previews.push(p),setTextEditor:tx=>edited.push(tx),
   useProject:{getState:()=>({setCadEdit:()=>{},selectPoly:()=>{},selectEdge:()=>{},moveNote:(id,p)=>moved.push({id,...p})})},
   skipClick:{current:false},pinchGestureActive:{current:false}};
  const note={id:'note',x:1,y:2,text:'Текст сада',size:.35};
  const event=(type,x,y)=>{
   const point={clientX:x,clientY:y},touches={length:type==='touchend'?0:1,item:()=>type==='touchend'?null:point};
   return {type,preventDefault:()=>{},stopPropagation:()=>{},...(input==='pointer'?point:{touches,changedTouches:{length:1,item:()=>point}})};
  };
  const start={evt:event(input==='pointer'?'pointerdown':'touchstart',100,150),target:{getStage:()=>({container:()=>({getBoundingClientRect:()=>({left:0,top:0})})})}};
  create(env)(note,start);
  if(mode==='disabled'){assert.equal(listeners.size,0);continue;}
  // Safari can send pointerdown followed by touchstart for the same contact.
  create(env)(note,start);assert.equal(selected.length,1);
  if(mode==='pinch')env.pinchGestureActive.current=true;
  const x=mode==='drag'?140:102,y=mode==='drag'?230:151;
  listeners.get(input+'move')?.(event(input+'move',x,y));
  listeners.get(input+(mode==='cancel'?'cancel':input==='pointer'?'up':'end'))?.(event(input+(mode==='cancel'?'cancel':input==='pointer'?'up':'end'),x,y));
  assert.equal(edited.length,0,`${input}/${mode}: tap selects without opening a dialog`);
  assert.equal(selected.at(-1),note.id);
  assert.equal(moved.length,mode==='drag'?1:0);
  if(mode==='drag')assert.deepEqual(moved[0],{id:'note',x:2,y:4});
  assert.equal(env.editDrag.current,false);assert.equal(listeners.size,0);
 }
});
