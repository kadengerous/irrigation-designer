import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
const server=await createServer({server:{middlewareMode:true,hmr:false}});
const e=await server.ssrLoadModule('/src/lib/cad/engine.ts');
const {emptyDrawing}=await server.ssrLoadModule('/src/lib/cad/types.ts');
const {fusionCandidates,fuseFigures}=await server.ssrLoadModule('/src/lib/cad/fuse-figures.ts');
const {themeFigureFill}=await server.ssrLoadModule('/src/lib/theme.ts');
const {useProject}=await server.ssrLoadModule('/src/lib/project-store.ts');
const {emptyProject}=await server.ssrLoadModule('/src/lib/project-types.ts');
await server.close();
const rect=(d,x,y,w,h)=>e.addRect(d,{x,y},{x:x+w,y:y+h},'lawn');
const area=d=>Object.keys(d.faces).reduce((sum,id)=>sum+e.faceArea(d,id),0);
test('shared edge fuses to one editable face and preserves unrelated layer',()=>{
 let d=rect(emptyDrawing(),0,0,4,3); d=rect(d,4,0,2,3); d=rect(d,30,0,1,1);
 const ids=Object.keys(d.faces),before=structuredClone(d),next=fuseFigures(d,ids.slice(0,2));
 assert.equal(Object.keys(next.faces).length,2);assert.equal(e.faceArea(next,ids[0]),18);
 assert.equal(e.faceEdges(next,ids[0]).length,4);assert.ok(next.faces[ids[0]].pointShape);
 assert.deepEqual(next.faces[ids[2]],d.faces[ids[2]]);assert.deepEqual(d,before);
 assert.equal(e.toPolygons(next).length,2);
});
test('fusion joins neighbouring dimensions into one and reattaches the new endpoints',()=>{
 let d=rect(emptyDrawing(),0,0,4,3);d=rect(d,4,0,2,3);d=rect(d,20,0,3,3);
 const ids=Object.keys(d.faces);
 d=e.addDim(d,{x:0,y:0},{x:4,y:0},-1);
 d=e.addDim(d,{x:6,y:0},{x:4,y:0},1);
 d=e.addDim(d,{x:0,y:0},{x:0,y:3},1);
 d=e.addDim(d,{x:20,y:0},{x:23,y:0},-1);
 const dimIds=Object.keys(d.dims),original=structuredClone(d);
 const next=fuseFigures(d,ids.slice(0,2));
 assert.equal(Object.keys(next.dims).length,3);
 assert.deepEqual(e.resolveDim(next,next.dims[dimIds[0]]),{a:{x:0,y:0},b:{x:6,y:0}});
 assert.ok(next.vertices[next.dims[dimIds[0]].aId]);assert.ok(next.vertices[next.dims[dimIds[0]].bId]);
 assert.equal(next.dims[dimIds[1]],undefined);
 assert.deepEqual(next.dims[dimIds[3]],d.dims[dimIds[3]]);
 assert.deepEqual(d,original);
 useProject.setState({project:{...emptyProject(),drawing:d},past:[],future:[],tool:null});
 useProject.getState().commitDrawing(next,ids[0],true);
 useProject.getState().undo();assert.equal(Object.keys(useProject.getState().project.drawing.dims).length,4);
});
test('new dimensions use two grid cells until their offset is manually adjusted',()=>{
 useProject.setState({project:emptyProject(),past:[],future:[],dimensionOffset:1,dimensionOffsetCustomized:false,gridStep:0.5});
 useProject.getState().addDimension({x:0,y:0},{x:2,y:0});
 let d=useProject.getState().project.drawing;
 const first=Object.keys(d.dims)[0];assert.equal(d.dims[first].offset,1);
 useProject.getState().setGridStep(0.25);
 useProject.getState().addDimension({x:0,y:3},{x:2,y:3});
 d=useProject.getState().project.drawing;
 assert.equal(Object.values(d.dims).find(dim=>dim.id!==first).offset,0.5);
 useProject.getState().setDimOffset(first,1.75);
 useProject.getState().addDimension({x:0,y:6},{x:2,y:6});
 d=useProject.getState().project.drawing;
 assert.equal(Object.values(d.dims).find(dim=>dim.a.y===6).offset,1.75);
 const snapshot=JSON.parse(JSON.stringify(d.dims));
 useProject.getState().setCadLayer('dims',{visible:false});
 assert.deepEqual(useProject.getState().project.drawing.dims,snapshot);
 assert.equal(useProject.getState().project.drawing.layers.dims.visible,false);
 useProject.getState().setCadLayer('dims',{visible:true});
 assert.deepEqual(useProject.getState().project.drawing.dims,snapshot);
});
test('overlap subtracts double counted area; separated selection is not offered',()=>{
 let d=rect(emptyDrawing(),0,0,4,4);d=rect(d,2,0,4,4);
 const ids=Object.keys(d.faces);assert.equal(area(fuseFigures(d,ids)),24);
 d=rect(d,50,0,2,2);assert.deepEqual(fusionCandidates(d,Object.keys(d.faces)),[]);
 assert.equal(fuseFigures(d,Object.keys(d.faces)),d);
});
test('corner contact remains a single face without filling space between lobes',()=>{
 let d=rect(emptyDrawing(),0,0,2,2);d=rect(d,2,2,2,2);
 const next=fuseFigures(d,Object.keys(d.faces));assert.equal(Object.keys(next.faces).length,1);assert.equal(area(next),8);
});
test('single selected figure discovers its touching neighbour; groups and locked figures excluded',()=>{
 let d=rect(emptyDrawing(),0,0,2,2);d=rect(d,2,0,2,2);const ids=Object.keys(d.faces);
 assert.equal(fusionCandidates(d,[ids[0]]).length,2);
 assert.deepEqual(fusionCandidates(e.mergeLayers(d,ids),ids),[]);
 d.faces[ids[1]].locked=true;assert.deepEqual(fusionCandidates(d,[ids[0]]),[]);
});
test('fusion keeps an enclosed hole and exports its contour to rendering',()=>{
 let d=rect(emptyDrawing(),0,0,4,1);d=rect(d,0,3,4,1);d=rect(d,0,1,1,2);d=rect(d,3,1,1,2);
 const next=fuseFigures(d,Object.keys(d.faces)),id=Object.keys(next.faces)[0];
 assert.equal(Object.keys(next.faces).length,1);assert.equal(area(next),12);
 assert.equal(next.faces[id].holes.length,1);assert.equal(e.toPolygons(next)[0].holes.length,1);
});
test('automatic fusion stops at the direct neighbour and preserves the earlier attached figure',()=>{
 let d=rect(emptyDrawing(),0,0,4,2);d=rect(d,1,2,2,2);d=rect(d,3,3,2,1);
 const [base,middle,last]=Object.keys(d.faces),before=e.facePoints(d,base);
 const ids=fusionCandidates(d,[last]);assert.deepEqual(ids,[last,middle]);
 const next=fuseFigures(d,ids);
 assert.equal(Object.keys(next.faces).length,2);
 assert.deepEqual(next.faces[base],d.faces[base]);assert.deepEqual(e.facePoints(next,base),before);
 assert.equal(e.faceArea(next,last),6);
 // More than two figures still require explicit selection.
 assert.equal(Object.keys(fuseFigures(d,[base,middle,last]).faces).length,1);
});
test('automatic fusion chooses only the last added direct contact',()=>{
 let d=rect(emptyDrawing(),0,0,2,2);d=rect(d,2,0,2,2);d=rect(d,4,0,2,2);
 const [first,middle,last]=Object.keys(d.faces);
 assert.deepEqual(fusionCandidates(d,[middle]),[middle,last]);
 assert.deepEqual(fusionCandidates(d,[first]),[first,middle]);
});
test('default figure glass is light blue in light and dark themes',()=>{
 assert.equal(themeFigureFill('pearl'),'rgba(125,202,242,0.30)');
 assert.equal(themeFigureFill('graphite'),'rgba(125,202,242,0.30)');
});
test('new figures use theme fill and fusion is a single reversible action',()=>{
 const pr=emptyProject();
 useProject.setState({project:pr,past:[],future:[],pastOps:[],futureOps:[],cadEditId:null,groupMemberId:null,draft:{points:[]}});
 useProject.getState().commitDrawing(rect(emptyDrawing(),0,0,2,2));
 let d=useProject.getState().project.drawing;
 assert.equal(Object.values(d.faces)[0].fill,'theme');
 useProject.getState().commitDrawing(rect(d,2,0,2,2));
 d=useProject.getState().project.drawing;const ids=Object.keys(d.faces);
 useProject.getState().commitDrawing(fuseFigures(d,ids),ids[0],true);
 assert.equal(Object.keys(useProject.getState().project.drawing.faces).length,1);
 useProject.getState().undo();assert.equal(Object.keys(useProject.getState().project.drawing.faces).length,2);
 useProject.getState().redo();assert.equal(Object.keys(useProject.getState().project.drawing.faces).length,1);
});
test('fused semicircle has one span handle and deforms smoothly with fixed junctions',()=>{
 let d=rect(emptyDrawing(),0,0,4,4);d=e.addCircle(d,{x:4,y:2},2,'lawn');
 d=fuseFigures(d,Object.keys(d.faces));const id=Object.keys(d.faces)[0];
 const before=e.facePoints(d,id);
 d=e.prepareFusionControls(d,id);
 assert.deepEqual(e.facePoints(d,id),before);
 const runs=d.faces[id].nodeEdit.curveRuns;assert.equal(runs.length,1);
 const run=runs[0],mid=run[Math.floor(run.length/2)],p=d.vertices[mid];
 const next=e.moveNodeEditVertex(d,id,mid,{x:p.x+1,y:p.y});
 assert.deepEqual(next.vertices[run[0]],d.vertices[run[0]]);
 assert.deepEqual(next.vertices[run.at(-1)],d.vertices[run.at(-1)]);
 assert.equal(next.vertices[mid].x,p.x+1);
 assert.ok(run.slice(1,-1).every(v=>next.vertices[v].x>d.vertices[v].x));
 assert.equal(Object.keys(next.faces).length,1);
});
