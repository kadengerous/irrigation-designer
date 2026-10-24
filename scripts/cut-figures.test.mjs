import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true,hmr:false}});
const e=await server.ssrLoadModule('/src/lib/cad/engine.ts');
const {cutFigures,snapCutPoint}=await server.ssrLoadModule('/src/lib/cad/cut-figures.ts');
const {emptyDrawing}=await server.ssrLoadModule('/src/lib/cad/types.ts');
const {useProject}=await server.ssrLoadModule('/src/lib/project-store.ts');
const {emptyProject}=await server.ssrLoadModule('/src/lib/project-types.ts');
await server.close();
const rect=()=>e.addPointShape(emptyDrawing(),[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}],'lawn');
const area=d=>Object.keys(d.faces).reduce((sum,id)=>sum+e.faceArea(d,id),0);
const assertSplit=(d,path,count,total=area(d))=>{const r=cutFigures(d,path);assert.ok(r,'cut splits the figure');assert.equal(r.faceIds.length,count);assert.ok(Math.abs(area(r.drawing)-total)<1e-5);return r;};
test('edge-to-edge and outside-to-outside cuts create independent figures',()=>{
 for(const path of [[{x:0,y:4},{x:10,y:4}],[{x:-2,y:4},{x:12,y:4}],[{x:0,y:3},{x:5,y:6},{x:10,y:3}]]) {
  const d=rect(),original=JSON.stringify(d),r=assertSplit(d,path,2);
  assert.equal(JSON.stringify(d),original);
  const before=e.facePoints(r.drawing,r.faceIds[0]);
  const moved=e.moveFace(r.drawing,r.faceIds[1],2,3);
  assert.deepEqual(e.facePoints(moved,r.faceIds[0]),before);
 }
});
test('closed internal cut preserves the hole and the detached piece without overlap',()=>{
 const d=rect();const r=assertSplit(d,[{x:2,y:2},{x:4,y:2},{x:4,y:4},{x:2,y:4},{x:2,y:2}],2);
 assert.deepEqual(r.faceIds.map(id=>e.faceArea(r.drawing,id)).sort((a,b)=>a-b),[4,96]);
 assert.equal(r.drawing.faces[r.faceIds[0]].holes.length,1);
});
test('unfinished, tangent, outside and locked cuts leave the drawing unchanged',()=>{
 const d=rect();for(const path of [[{x:0,y:4},{x:5,y:4}],[{x:-1,y:0},{x:11,y:0}],[{x:-1,y:-1},{x:11,y:-1}]])assert.equal(cutFigures(d,path),null);
 d.faces[Object.keys(d.faces)[0]].locked=true;assert.equal(cutFigures(d,[{x:0,y:4},{x:10,y:4}]),null);
});
test('cut keeps materials, unrelated figures, dimensions, and undo',()=>{
 let d=rect();const id=Object.keys(d.faces)[0];d.faces[id].fill='#125678';d.faces[id].name='Plot';
 d=e.addPointShape(d,[{x:20,y:0},{x:22,y:0},{x:22,y:2},{x:20,y:2}],'bed');
 const verts=e.faceVertices(d,id);d.dims={label:{id:'label',aId:verts[0].id,bId:verts[1].id,offset:1,kind:'aligned'}};
 const other=Object.keys(d.faces).find(k=>k!==id),before=JSON.stringify(d.faces[other]);
 const r=assertSplit(d,[{x:-1,y:5},{x:11,y:5}],2);
 assert.deepEqual(e.resolveDim(r.drawing,r.drawing.dims.label),e.resolveDim(d,d.dims.label));
 assert.equal(JSON.stringify(r.drawing.faces[other]),before);for(const id of r.faceIds)assert.equal(r.drawing.faces[id].fill,'#125678');
 const project=emptyProject();project.drawing=d;project.polygons=e.toPolygons(d);
 useProject.setState({project,past:[],future:[],pastOps:[],futureOps:[],groupMemberId:null,cadEditId:null,tool:'draw',drawSub:'cut',draft:{points:[{x:0,y:5},{x:10,y:5}],scaleA:null,scaleB:null,measureA:null}});
 useProject.getState().finishOpenDraw();assert.deepEqual(useProject.getState().project.drawing,d,'generic finish cannot commit scissors');
 useProject.getState().confirmCut();assert.equal(Object.keys(useProject.getState().project.drawing.faces).length,3);
 const divided=useProject.getState().project.drawing;
 assert.equal(e.layerRepresentatives(divided).length,3);
 for(const id of Object.keys(divided.faces))assert.equal(e.layerFaceIds(divided,id).length,1);
 useProject.getState().undo();assert.deepEqual(useProject.getState().project.drawing,d);
});

test('scissors divide a fused shape through its narrow bridge',()=>{
 const d=e.addPointShape(emptyDrawing(),[[0,0],[3,0],[3,4],[10,4],[10,0],[14,0],[14,10],[10,10],[10,6],[3,6],[3,10],[0,10]].map(([x,y])=>({x,y})),'lawn');
 const r=assertSplit(d,[{x:6,y:4},{x:6,y:6}],2,84);
 assert.deepEqual(r.faceIds.map(id=>e.faceArea(r.drawing,id)).sort((a,b)=>a-b),[36,48]);
 assertSplit(r.drawing,[{x:-1,y:2},{x:4,y:2}],2,84);
});
test('concave neighbouring cells are not mistaken for nested holes',()=>{
 const r=assertSplit(rect(),[{x:0,y:8},{x:8,y:8},{x:8,y:0}],2);
 assert.deepEqual(r.faceIds.map(id=>e.faceArea(r.drawing,id)).sort((a,b)=>a-b),[36,64]);
});
test('cut along the shared boundary separates a merged layer without changing materials',()=>{
 let d=rect();d=e.addPointShape(d,[{x:10,y:0},{x:14,y:0},{x:14,y:10},{x:10,y:10}],'bed');
 const ids=Object.keys(d.faces);d.faces[ids[0]].fill='#abcdef';d.faces[ids[1]].fill='#123456';
 d=e.mergeLayers(d,ids);const original=JSON.stringify(d);
 assert.equal(cutFigures(d,[{x:10,y:0},{x:10,y:5}]),null,'partial shared edge is unfinished');
 const r=assertSplit(d,[{x:10,y:0},{x:10,y:10}],2);
 assert.equal(e.layerRepresentatives(r.drawing).length,2);assert.equal(JSON.stringify(d),original);
 for(const id of ids){assert.deepEqual(e.facePoints(r.drawing,id),e.facePoints(d,id));assert.equal(r.drawing.faces[id].fill,d.faces[id].fill);}
 let chain=e.addPointShape(d,[{x:14,y:0},{x:18,y:0},{x:18,y:10},{x:14,y:10}],'bed');
 chain=e.mergeLayers(chain,Object.keys(chain.faces));
 const divided=cutFigures(chain,[{x:10,y:0},{x:10,y:10}]);assert.ok(divided);
 assert.deepEqual(e.layerRepresentatives(divided.drawing).map(f=>e.layerFaceIds(divided.drawing,f.id).length).sort(),[1,2]);
});
test('cut preview freezes until confirmation, and its points support undo and redo',()=>{
 const d=rect(),project=emptyProject();project.drawing=d;project.polygons=e.toPolygons(d);
 useProject.setState({project,past:[],future:[],pastOps:[],futureOps:[],groupMemberId:null,cadEditId:null,tool:'draw',drawSub:'cut',draft:{points:[],scaleA:null,scaleB:null,measureA:null}});
 const a={x:0,y:5},b={x:10,y:5};
 useProject.getState().addDraftPoint(a);useProject.getState().addDraftPoint(b);
 useProject.getState().addDraftPoint({x:20,y:20});assert.deepEqual(useProject.getState().draft.points,[a,b]);
 assert.deepEqual(useProject.getState().project.drawing,d,'preview never commits the cut');
 useProject.getState().undo();assert.deepEqual(useProject.getState().draft.points,[a]);
 useProject.getState().undo();assert.deepEqual(useProject.getState().draft.points,[]);
 useProject.getState().redo();useProject.getState().redo();assert.deepEqual(useProject.getState().draft.points,[a,b]);
 useProject.getState().confirmCut();assert.equal(e.layerRepresentatives(useProject.getState().project.drawing).length,2);
 useProject.getState().undo();assert.deepEqual(useProject.getState().project.drawing,d);
 useProject.getState().redo();assert.equal(e.layerRepresentatives(useProject.getState().project.drawing).length,2);
});
test('visibility and locking changes can be undone and redone',()=>{
 const d=rect(),id=Object.keys(d.faces)[0],project=emptyProject();project.drawing=d;project.polygons=e.toPolygons(d);
 useProject.setState({project,past:[],future:[],pastOps:[],futureOps:[],groupMemberId:null,cadEditId:null,tool:null,drawSub:'none',selectedPolyId:id,selectedPolyIds:[id]});
 useProject.getState().hideSelected(true);assert.equal(useProject.getState().project.drawing.faces[id].hidden,true);
 useProject.getState().undo();assert.ok(!useProject.getState().project.drawing.faces[id].hidden);
 useProject.getState().redo();assert.equal(useProject.getState().project.drawing.faces[id].hidden,true);
 useProject.getState().selectPoly(id);useProject.getState().lockSelected(true);assert.equal(useProject.getState().project.drawing.faces[id].locked,true);
 useProject.getState().undo();assert.ok(!useProject.getState().project.drawing.faces[id].locked);
 useProject.getState().redo();assert.equal(useProject.getState().project.drawing.faces[id].locked,true);
});
test('existing holes stay empty when the cut passes through them',()=>{
 const r=assertSplit(rect(),[{x:2,y:2},{x:4,y:2},{x:4,y:4},{x:2,y:4},{x:2,y:2}],2);
 delete r.drawing.faces[r.faceIds[1]];
 assertSplit(r.drawing,[{x:-1,y:3},{x:11,y:3}],2,96);
});

test('scissors snap to the cutting boundary only while the magnet is enabled',()=>{
 const d=rect(),options={snapOn:true,snapGridOn:true,gridStep:1,pxPerMeter:40,pointerType:'touch'};
 const a=snapCutPoint(d,{x:-.1,y:4.1},options),b=snapCutPoint(d,{x:10.12,y:4.13},options);
 assert.equal(a.kind,'edge');assert.equal(b.kind,'edge');assert.equal(a.pt.x,0);assert.equal(b.pt.x,10);
 assertSplit(d,[a.pt,b.pt],2);
 const raw={x:.07,y:.09};assert.deepEqual(snapCutPoint(d,raw,{...options,snapOn:false}),{pt:raw,kind:'none'});
 assert.deepEqual(snapCutPoint(d,raw,options).pt,{x:0,y:0});
 const start={x:2,y:2};assert.equal(snapCutPoint(d,{x:2.1,y:2.1},{...options,closeTo:start}).kind,'close');
 const circle=e.addCircle(emptyDrawing(),{x:0,y:0},5,'lawn');
 const left=snapCutPoint(circle,{x:-4.9,y:1.2},options).pt,right=snapCutPoint(circle,{x:4.9,y:1.2},options).pt;
 assert.ok(cutFigures(circle,[left,right]),'snapping and cutting use the same curved boundary');
});
test('second tape button activation clears the draft and disables the tool',()=>{
 useProject.setState({tool:null,drawSub:'none',measureSub:'measure',groupMemberId:null});
 useProject.getState().setMeasureSub('measure');assert.equal(useProject.getState().tool,'measure');
 useProject.setState({draft:{points:[],scaleA:null,scaleB:null,measureA:{x:1,y:2}}});
 useProject.getState().setMeasureSub('measure');assert.equal(useProject.getState().tool,null);assert.equal(useProject.getState().draft.measureA,null);
 useProject.getState().setMeasureSub('measure');assert.equal(useProject.getState().tool,'measure');
});
