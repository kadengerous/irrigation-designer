import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {createServer} from 'vite';
let server,load;
before(async()=>{server=await createServer({server:{middlewareMode:true,hmr:false}});load=p=>server.ssrLoadModule('/src/'+p);});
after(async()=>{await server?.close();});

test('tablet taps activate coverage and dimensions exactly once; scrolling does not activate',async()=>{
  const {canvasTapActivation}=await load('components/designer/canvas-tap-activation.ts');
  const {useCoverageDisplay}=await load('lib/coverage-display.ts');
  let dimensions=0;
  const event={pointerType:'touch',isPrimary:true,pointerId:1,clientX:10,clientY:10,preventDefault(){}};
  for(const activate of [()=>useCoverageDisplay.getState().toggle('tablet'),()=>dimensions++]) {
    const handlers=canvasTapActivation(activate);
    handlers.onPointerDown(event);handlers.onPointerUp(event);handlers.onClick({...event,detail:0});handlers.onClick({...event,detail:1});
    handlers.onPointerDown(event);handlers.onPointerMove({...event,clientX:35});handlers.onPointerUp({...event,clientX:35});
    handlers.onPointerDown(event);handlers.onPointerCancel(event);handlers.onPointerUp(event);
  }
  assert.equal(useCoverageDisplay.getState().projectId,'tablet');assert.equal(dimensions,1);
  const keyboard=canvasTapActivation(()=>dimensions++);
  keyboard.onKeyDown({key:'Enter'});keyboard.onClick(event);assert.equal(dimensions,2);
});

test('canvas wheel and Safari pinch own browser zoom without changing other UI',async()=>{
  const {installCanvasZoom}=await load('components/designer/canvas-zoom-events.ts');
  const element=new EventTarget();element.getBoundingClientRect=()=>({left:10,top:20,width:800,height:600});
  let view={pxPerMeter:36,panX:0,panY:0},writes=0;
  const cleanup=installCanvasZoom(element,()=>view,next=>{view=next;writes++;},()=>false);
  const emit=(type,fields={})=>{
    const event=new Event(type,{cancelable:true});
    Object.defineProperty(event,'target',{value:{tagName:fields.tagName??'CANVAS'}});
    Object.assign(event,{clientX:210,clientY:220,deltaY:-10,deltaMode:0,ctrlKey:true,metaKey:false,...fields});
    element.dispatchEvent(event);return event;
  };
  const worldX=200/view.pxPerMeter;
  assert.equal(emit('wheel').defaultPrevented,true);assert.equal(writes,1);
  assert.ok(Math.abs((200-view.panX)/view.pxPerMeter-worldX)<1e-9);
  assert.equal(emit('wheel',{tagName:'INPUT'}).defaultPrevented,false);assert.equal(writes,1);
  const start=view.pxPerMeter;
  assert.equal(emit('gesturestart',{scale:1}).defaultPrevented,true);
  emit('wheel');assert.equal(writes,1,'Safari gesture does not also apply a wheel zoom');
  emit('gesturechange',{scale:1.5});assert.equal(view.pxPerMeter,start*1.5);
  emit('gestureend',{scale:1.5});
  cleanup();assert.equal(emit('wheel').defaultPrevented,false);
});

test('deleted dimensions stay absent during live updates but explicit generation restores both figures',async()=>{
  const engine=await load('lib/cad/engine.ts'),{emptyDrawing}=await load('lib/cad/types.ts');
  const {automaticDimensions}=await load('lib/cad/auto-dimensions.ts');
  for(const mode of ['plan','irrigation']) {
    const first=engine.addRect(emptyDrawing(),{x:0,y:0},{x:10,y:10},'lawn');
    let project={polygons:[],heads:[{id:'a',x:0,y:0},{id:'b',x:5,y:0},{id:'c',x:20,y:0},{id:'d',x:25,y:0}],drawing:engine.addRect(first,{x:20,y:0},{x:30,y:10},'lawn')};
    project.drawing=automaticDimensions(project,mode);
    const originalCount=Object.keys(project.drawing.dims).length;
    const kept=Object.values(project.drawing.dims).find(d=>d.a.x<10);
    project.drawing.dims[kept.id]={...kept,label:'Edited',offset:2.75};
    const removed=Object.values(project.drawing.dims).filter(d=>d.a.x>=20);assert.ok(removed.length);
    for(const dim of removed)project.drawing=engine.deleteDimension(project.drawing,dim.id);
    for(let i=0;i<3;i++) {
      project=JSON.parse(JSON.stringify(project));
      for(const dim of removed)assert.ok(!engine.drawingOrMigrate(project).dims[dim.id]);
    }
    project.drawing=automaticDimensions(project,mode);
    for(const dim of removed)assert.ok(project.drawing.dims[dim.id]);
    assert.equal(Object.keys(project.drawing.dims).length,originalCount);
    assert.equal(project.drawing.dims[kept.id].label,'Edited');assert.equal(project.drawing.dims[kept.id].offset,2.75);
    assert.deepEqual(automaticDimensions(project,mode).dims,project.drawing.dims,'no duplicates on repeated presses');
  }
});

test('coverage of CAD figures works with an uncalibrated optional reference image',async()=>{
  const {emptyProject}=await load('lib/project-types.ts'),{emptyDrawing}=await load('lib/cad/types.ts');
  const engine=await load('lib/cad/engine.ts'),{diagnosticCoverage}=await load('lib/diagnostic-coverage.ts');
  const {surfaceArea}=await load('lib/irrigation-geometry.ts');
  const project={...emptyProject(),drawing:engine.addRect(emptyDrawing(),{x:0,y:0},{x:10,y:10},'lawn'),heads:[]};
  const before=diagnosticCoverage(project);
  const withReference=diagnosticCoverage({...project,underlay:{id:'image',src:'data:image/png;base64,',opacity:.5},scaleCalibrated:false});
  assert.ok(withReference);assert.equal(surfaceArea(withReference.dry),100);assert.deepEqual(withReference,before);
});

test('tablet dimension action operates on the whole project even with an inspected group member',async()=>{
  const {emptyProject}=await load('lib/project-types.ts'),{emptyDrawing}=await load('lib/cad/types.ts');
  const engine=await load('lib/cad/engine.ts'),{useProject}=await load('lib/project-store.ts');
  const {applyAutomaticDimensions}=await load('lib/automatic-dimension-action.ts');
  const {canvasTapActivation}=await load('components/designer/canvas-tap-activation.ts');
  const drawing=engine.addRect(engine.addRect(emptyDrawing(),{x:0,y:0},{x:10,y:10},'lawn'),{x:20,y:0},{x:30,y:10},'lawn');
  const ids=Object.keys(drawing.faces);
  const project={...emptyProject(),drawing};
  useProject.setState({project,workspaceSection:'plan',groupMemberId:ids[0],selectedPolyId:ids[1],past:[],future:[],pastOps:[],futureOps:[]});
  const handlers=canvasTapActivation(applyAutomaticDimensions);
  const event={pointerType:'touch',isPrimary:true,pointerId:1,clientX:10,clientY:10,preventDefault(){}};
  handlers.onPointerDown(event);handlers.onPointerUp(event);handlers.onClick(event);
  const current=useProject.getState().project;
  assert.equal(Object.keys(current.drawing.dims).length,8);
  assert.equal(current.drawing.layers.dims.visible,true);
  assert.equal(current.id,project.id);assert.deepEqual(Object.keys(current.drawing.faces),ids);
  useProject.setState({groupMemberId:null});
});

test('irrigation auto-dimension button works on site outlines with mouse and touch, undo and redo',async()=>{
  const {emptyProject}=await load('lib/project-types.ts'),{emptyDrawing}=await load('lib/cad/types.ts');
  const engine=await load('lib/cad/engine.ts'),{useProject}=await load('lib/project-store.ts');
  const {applyAutomaticDimensions}=await load('lib/automatic-dimension-action.ts');
  const {displayedDimensions}=await load('lib/cad/sprinkler-dimensions.ts');
  const {canvasTapActivation}=await load('components/designer/canvas-tap-activation.ts');
  for(const input of ['mouse','touch']){
    const drawing=engine.addRect(emptyDrawing(),{x:0,y:0},{x:12,y:8},'site');
    const project={...emptyProject(),drawing,heads:[0,6,12].map((x,i)=>({id:`h${i}`,x,y:0}))};
    useProject.setState({project,workspaceSection:'irrigation',tool:null,drawSub:'none',groupMemberId:null,
      selectedPolyId:null,selectedPolyIds:[],past:[],future:[],pastOps:[],futureOps:[]});
    const handlers=canvasTapActivation(applyAutomaticDimensions);
    const event={pointerType:input,isPrimary:true,pointerId:1,clientX:10,clientY:10,detail:1,preventDefault(){}};
    if(input==='touch'){handlers.onPointerDown(event);handlers.onPointerUp(event);}
    handlers.onClick(event);
    const current=useProject.getState().project;
    assert.equal(displayedDimensions(current.drawing,'irrigation').length,2);
    assert.equal(current.drawing.layers.dims.visible,true);
    assert.deepEqual(current.heads,project.heads);
    assert.equal(useProject.getState().past.length,1,'one tap is one history entry');
    useProject.getState().undo();assert.equal(Object.keys(useProject.getState().project.drawing.dims).length,0);
    useProject.getState().redo();assert.deepEqual(useProject.getState().project.drawing.dims,JSON.parse(JSON.stringify(current.drawing.dims)));
  }
});

test('nearby sprinkler labels avoid one another and symbols at different zooms',async()=>{
  const engine=await load('lib/cad/engine.ts'),{emptyDrawing}=await load('lib/cad/types.ts');
  const {layoutHeadLabels,headSymbolScale,labelBoxesOverlap}=await load('lib/head-presentation.ts');
  const drawing=engine.addRect(emptyDrawing(),{x:0,y:0},{x:10,y:10},'lawn');
  for(const px of [9,18,36,120]) {
    const s=headSymbolScale(px);
    const heads=[{id:'a',x:0,y:3},{id:'b',x:0,y:3.1},{id:'c',x:4,y:4},{id:'d',x:4.1,y:4},
      {id:'top-a',x:3,y:0},{id:'top-b',x:3.1,y:0}].map(h=>({...h,width:120*s,height:12*s,radius:13*s}));
    const labels=layoutHeadLabels(heads,drawing,px);assert.equal(labels.size,heads.length);
    const boxes=heads.map(h=>({x:h.x*px+labels.get(h.id).x,y:h.y*px+labels.get(h.id).y,width:h.width,height:h.height}));
    for(let i=0;i<boxes.length;i++) {
      for(let j=i+1;j<boxes.length;j++)assert.ok(!labelBoxesOverlap(boxes[i],boxes[j]));
      for(const h of heads)assert.ok(!labelBoxesOverlap(boxes[i],{x:h.x*px-h.radius,y:h.y*px-h.radius,width:h.radius*2,height:h.radius*2}));
    }
    assert.ok(boxes[0].x+boxes[0].width<0);assert.ok(boxes[1].x+boxes[1].width<0);
    assert.ok(boxes[4].y+boxes[4].height<0);assert.ok(boxes[5].y+boxes[5].height<0);
  }
});
