import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {createServer} from 'vite';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

let server,engine,emptyDrawing,emptyProject,useProject,canvasWorkspace,canvasSnapDrawing,snapPointDraft,segmentAlignmentGuides;
before(async()=>{
  server=await createServer({server:{middlewareMode:true,hmr:false}});
  const load=path=>server.ssrLoadModule('/src/lib/'+path);
  engine=await load('cad/engine.ts');
  ({emptyDrawing}=await load('cad/types.ts'));
  ({emptyProject}=await load('project-types.ts'));
  ({useProject}=await load('project-store.ts'));
  ({canvasWorkspace,canvasSnapDrawing}=await load('workspace-canvas.ts'));
  ({snapPointDraft}=await load('cad/point-draft-snap.ts'));
  ({segmentAlignmentGuides}=await load('cad/segment-alignment.ts'));
});
after(async()=>{await server?.close();});

const reset=()=>{
  useProject.setState({...useProject.getInitialState(),project:emptyProject(),projects:[],past:[],future:[],pastOps:[],futureOps:[]});
};

test('workspace visibility is view-only and previews retain the whole project',()=>{
  assert.equal(canvasWorkspace('irrigation',false,true).showLandscape,false);
  assert.equal(canvasWorkspace('landscape',false,true).showLandscape,true);
  assert.equal(canvasWorkspace('irrigation',true,true).showLandscape,true);
  assert.equal(canvasWorkspace('irrigation',false,false).showLandscape,true);
  assert.deepEqual(canvasWorkspace('plan'),{editPlan:true,showLandscape:false,showIrrigation:false});
  for(const mode of ['landscape','irrigation'])assert.deepEqual(canvasWorkspace(mode),{editPlan:false,showLandscape:true,showIrrigation:true});
  assert.deepEqual(canvasWorkspace('plan',true),{editPlan:false,showLandscape:true,showIrrigation:true});
  const drawing=emptyDrawing();
  drawing.plants={plant:{id:'plant',x:3,y:4,r:1}};
  drawing.landscapeObjects={object:{id:'object',x:5,y:6}};
  const before=JSON.stringify(drawing),visible=canvasSnapDrawing(drawing,'plan');
  assert.deepEqual(visible.plants,{});assert.deepEqual(visible.landscapeObjects,{});
  assert.equal(visible.faces,drawing.faces);assert.equal(JSON.stringify(drawing),before);
  assert.equal(canvasSnapDrawing(drawing,'landscape'),drawing);
  assert.equal(canvasSnapDrawing(drawing,'irrigation'),drawing);
});

test('plan faces and edges cannot be selected or edited from Landscape or Irrigation',()=>{
  reset();
  const drawing=engine.addRect(emptyDrawing(),{x:0,y:0},{x:5,y:5},'lawn');
  const faceId=Object.keys(drawing.faces)[0],edgeId=Object.keys(drawing.edges)[0];
  const project={...emptyProject(),drawing,polygons:engine.toPolygons(drawing)};
  for(const mode of ['landscape','irrigation']){
    useProject.setState({project,workspaceSection:mode,tool:null,selectedId:'head',selectedIds:['head']});
    useProject.getState().selectPoly(faceId);
    useProject.getState().selectPoly(faceId,true);
    useProject.getState().selectEdge(edgeId);
    useProject.getState().setCadEdit(faceId);
    const state=useProject.getState();
    assert.equal(state.selectedPolyId,null);assert.deepEqual(state.selectedPolyIds,[]);
    assert.equal(state.selectedEdgeId,null);assert.equal(state.cadEditId,null);
    assert.equal(state.selectedId,'head');assert.equal(state.tool,null);assert.equal(state.project,project);
  }
  useProject.getState().setTool('draw');
  assert.equal(useProject.getState().selectedId,null);assert.deepEqual(useProject.getState().selectedIds,[]);
  useProject.getState().selectPoly(faceId);useProject.getState().setCadEdit(faceId);
  assert.equal(useProject.getState().cadEditId,faceId);
  useProject.getState().setCatalogOpen(true);
  assert.equal(useProject.getState().workspaceSection,'irrigation');assert.equal(useProject.getState().cadEditId,null);
  assert.equal(useProject.getState().selectedPolyId,null);assert.deepEqual(useProject.getState().selectedPolyIds,[]);
  useProject.getState().setDrawSub('polygon');
  assert.equal(useProject.getState().workspaceSection,'plan');
});

test('tapping a previous numbered point appends an exact copy, with undo and redo',()=>{
  reset();useProject.getState().setDrawSub('polygon');
  const points=[{x:0,y:0},{x:5,y:0},{x:5,y:5}];
  points.forEach(p=>useProject.getState().addDraftPoint(p));
  useProject.getState().tapPolygonDraftPoint(1);
  const revisited=[...points,points[1]];
  assert.deepEqual(useProject.getState().draft.points,revisited);
  assert.notEqual(useProject.getState().draft.points[3],useProject.getState().draft.points[1]);
  useProject.getState().undo();assert.deepEqual(useProject.getState().draft.points,points);
  useProject.getState().redo();assert.deepEqual(useProject.getState().draft.points,revisited);
  useProject.getState().tapPolygonDraftPoint(3);
  assert.deepEqual(useProject.getState().draft.points,[...revisited,points[1]],'same consecutive coordinate is accepted too');
  useProject.getState().undo();
  useProject.getState().addDraftPoint({x:-3,y:3});
  const finalPoints=useProject.getState().draft.points;
  useProject.getState().tapPolygonDraftPoint(0);
  const state=useProject.getState(),vertices=engine.faceVertices(state.project.drawing,state.selectedPolyId);
  assert.equal(vertices.filter(p=>p.x===5&&p.y===0).length,2,'nonconsecutive repeated vertex survives closure');
  state.undo();assert.deepEqual(useProject.getState().draft.points,finalPoints,'reopening preserves the repeated point');
});

test('first point still closes the contour and dragging a vertex still updates it',()=>{
  reset();useProject.getState().setDrawSub('polygon');
  [{x:0,y:0},{x:5,y:0},{x:5,y:5},{x:0,y:5}].forEach(p=>useProject.getState().addDraftPoint(p));
  useProject.getState().setDraftPoints([{x:0,y:0},{x:6,y:0},{x:6,y:5},{x:0,y:5}]);
  useProject.getState().tapPolygonDraftPoint(0);
  const state=useProject.getState();
  assert.equal(engine.faceArea(state.project.drawing,state.selectedPolyId),30);
  assert.equal(state.drawSub,'none');assert.equal(state.draft.points.length,0);
});

test('point construction snaps both axes to previous vertices before grid rounding at every zoom',()=>{
  const points=[{x:.3,y:.7},{x:10.3,y:10.7}];
  for(const pxPerMeter of [10,50,200])for(const pointerType of ['mouse','touch','pen'])for(const snapGridOn of [false,true]){
    const options={pxPerMeter,pointerType,snapOn:true,snapGridOn,gridStep:1,angleFrom:points[1]};
    const raw={x:.3+2/pxPerMeter,y:10.7-1/pxPerMeter};
    const result=snapPointDraft(raw,emptyDrawing(),points,options);
    assert.deepEqual(result.pt,{x:.3,y:10.7});
    const guides=segmentAlignmentGuides(result.pt,points,pxPerMeter);
    assert.equal(guides.length,2);assert.ok(guides.every(g=>g.aligned));
    assert.deepEqual(snapPointDraft({x:.3+1/pxPerMeter,y:.7-1/pxPerMeter},emptyDrawing(),points,options).pt,points[0]);
    assert.deepEqual(snapPointDraft(raw,emptyDrawing(),points,{...options,snapOn:false,snapGridOn:false}).pt,raw);
  }
});

test('point snapping preserves geometric targets and explicit axis locks',()=>{
  const drawing=engine.addRect(emptyDrawing(),{x:0,y:0},{x:10,y:10},'lawn');
  const points=[{x:2.3,y:2.7},{x:8.3,y:5.7}];
  const options={pxPerMeter:100,snapOn:true,snapGridOn:true,gridStep:1,angleFrom:points[1]};
  const endpoint=snapPointDraft({x:.04,y:.02},drawing,points,options);
  assert.equal(endpoint.kind,'end');assert.deepEqual(endpoint.pt,{x:0,y:0});
  const edge=snapPointDraft({x:2.3,y:.02},drawing,points,options);
  assert.equal(edge.kind,'edge');assert.equal(edge.pt.y,0);
  const locked=snapPointDraft({x:2.31,y:2.71},drawing,points,{...options,lock:'horiz'});
  assert.deepEqual(locked.pt,{x:2.31,y:5.7});
});

test('numbered-vertex gesture distinguishes taps, real drags and cancelled pointer/touch input',()=>{
  const source=readFileSync(new URL('../src/components/designer/design-canvas.tsx',import.meta.url),'utf8');
  const ast=ts.createSourceFile('canvas.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const declaration=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='bindPointerDrag');
  assert.ok(declaration);
  const code=ts.transpileModule(declaration.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  for(const input of ['pointer','touch'])for(const action of ['tap','drag','cancel','return-drag']){
    const listeners=new Map(),window={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),setTimeout:()=>1,clearTimeout(){}};
    const bind=new Function('window','clientXY','worldFromClient',code+';return bindPointerDrag;')(window,e=>e,e=>({x:e.clientX,y:e.clientY}));
    let taps=0,ends=0,cancels=0;
    const active={current:false},blocked={current:false};
    const event=(type,x=10)=>({type,clientX:x,clientY:10,preventDefault(){},stopPropagation(){}});
    bind({evt:event(input+'down'),target:{getStage(){return {};}}},active,0,0,1,()=>{},()=>{},()=>ends++,{current:false},blocked,()=>cancels++,()=>taps++);
    if(action.includes('drag'))listeners.get(input+'move')(event(input+'move',30));
    const ending=input+(action==='cancel'?'cancel':input==='touch'?'end':'up');
    listeners.get(ending)(event(ending,action==='drag'?30:10));
    assert.equal(taps,action==='tap'?1:0,`${input} ${action}`);
    assert.equal(ends,action.includes('drag')?1:0);
    assert.equal(cancels,action==='cancel'?1:0);
    assert.equal(active.current,false);assert.equal(listeners.size,0);
  }
});
