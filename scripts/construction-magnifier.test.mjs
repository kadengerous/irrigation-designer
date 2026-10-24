import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true,hmr:false}});
const {constructionMagnifierFocus:focus,canShowMagnifier}=await server.ssrLoadModule('/src/components/designer/canvas-magnifier-model.ts');
const {hexagonFromBounds}=await server.ssrLoadModule('/src/lib/cad/engine.ts');
const {useProject}=await server.ssrLoadModule('/src/lib/project-store.ts');
const {emptyProject}=await server.ssrLoadModule('/src/lib/project-types.ts');
await server.close();
test('placement magnifies with the library open, but transforms and pinch never do',()=>{
 const state={blocked:false,catalogOpen:true,editDrag:true,tool:null,drawSub:null,cadEditId:null,selectedEdgeId:null,draftPointCount:0,placementActive:true};
 assert.equal(canShowMagnifier(state),true);
 assert.equal(canShowMagnifier({...state,blocked:true}),false);
 assert.equal(canShowMagnifier({...state,landscapeTransform:true}),false);
 assert.equal(canShowMagnifier({...state,placementActive:false,landscapeTransform:true,catalogOpen:false}),false);
});
test('hexagon lens follows its closest vertex in every construction direction',()=>{
 for(const pointer of [{x:10,y:6},{x:-10,y:6},{x:10,y:-6},{x:-10,y:-6},{x:2,y:20}]) {
  const origin={x:0,y:0},corners=hexagonFromBounds(origin,pointer),point=focus('hexagon',origin,pointer);
  const distance=p=>Math.hypot(p.x-pointer.x,p.y-pointer.y);
  assert.ok(corners.some(p=>p.x===point.x&&p.y===point.y));
  assert.equal(distance(point),Math.min(...corners.map(distance)));
 }
});
test('ellipse lens stays on the closest outline, including flat ellipses',()=>{
 for(const pointer of [{x:10,y:6},{x:-10,y:6},{x:10,y:-6},{x:0,y:6},{x:80,y:0.1}]) {
  const origin={x:0,y:0},point=focus('ellipse',origin,pointer),rx=Math.max(.02,Math.abs(pointer.x)),ry=Math.max(.02,Math.abs(pointer.y));
  assert.ok(Math.abs((point.x/rx)**2+(point.y/ry)**2-1)<1e-10);
  const distance=p=>Math.hypot(p.x-pointer.x,p.y-pointer.y);
  for(let i=0;i<360;i++){const t=i*Math.PI/180;assert.ok(distance(point)<=distance({x:rx*Math.cos(t),y:ry*Math.sin(t)})+1e-7);}
 }
 const p={x:2,y:3};assert.equal(focus('circle',{x:0,y:0},p),p);assert.equal(focus('freehand',{x:0,y:0},p),p);
});
test('dimensions and tape magnify before placing the first point and respect pinch blocking',()=>{
 const state={blocked:false,catalogOpen:false,editDrag:false,tool:'draw',drawSub:'dim',cadEditId:null,selectedEdgeId:null,draftPointCount:0};
 for(const s of [state,{...state,tool:'measure',measureSub:'measure'},{...state,drawSub:'freehand',draftPointCount:1}]) {
  assert.equal(canShowMagnifier(s),true);assert.equal(canShowMagnifier({...s,blocked:true}),false);
 }
 assert.equal(canShowMagnifier({...state,tool:'measure',measureSub:'guide'}),false);
});
test('finished freehand keeps its geometry and leaves the blue selection outline',()=>{
 useProject.setState({project:emptyProject(),past:[],future:[],pastOps:[],futureOps:[],groupMemberId:null,cadEditId:null,selectedPolyId:null,selectedPolyIds:[],tool:'draw',drawSub:'freehand',pxPerMeter:50,draft:{points:[{x:0,y:0},{x:4,y:0},{x:4,y:4},{x:0,y:4},{x:0,y:0}],scaleA:null,scaleB:null,measureA:null}});
 useProject.getState().finishOpenDraw();
 const s=useProject.getState();assert.equal(Object.values(s.project.drawing.faces).filter(f=>f.freehand?.closed).length,1);
 assert.equal(s.selectedPolyId,null);assert.deepEqual(s.selectedPolyIds,[]);assert.equal(s.draft.points.length,0);
 useProject.getState().undo();assert.equal(Object.keys(useProject.getState().project.drawing?.faces??{}).length,0);
});
