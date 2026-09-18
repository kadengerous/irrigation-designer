import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "vite";

test("dimension arrows snap together; deleting one dimension preserves geometry and supports undo",async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false}});
 try {
  const {emptyDrawing}=await server.ssrLoadModule("/src/lib/cad/types.ts");
  const {addDim,deleteDimension}=await server.ssrLoadModule("/src/lib/cad/engine.ts");
  const {snapDimensionOffset}=await server.ssrLoadModule("/src/lib/cad/dimension-offset-snap.ts");
  let d=addDim(emptyDrawing(),{x:0,y:0},{x:4,y:0},-2);
  const first=Object.keys(d.dims)[0];
  d=addDim(d,{x:4,y:0},{x:8,y:0},-1);
  const second=Object.keys(d.dims).find(id=>id!==first);
  assert.equal(snapDimensionOffset(d,second,-1.9,100),-2);
  assert.equal(snapDimensionOffset(d,second,-1.7,100),-1.7);
  assert.equal(snapDimensionOffset(d,second,-1.9,200),-1.9);
  const next=deleteDimension(d,second);
  assert.deepEqual(Object.keys(next.dims),[first]);
  assert.deepEqual(next.vertices,d.vertices);assert.deepEqual(next.faces,d.faces);
  assert.ok(d.dims[second]);
  const {useProject}=await server.ssrLoadModule("/src/lib/project-store.ts");
  useProject.setState({project:{...useProject.getState().project,drawing:d},past:[],future:[]});
  useProject.getState().commitDrawing(next,null,true);
  assert.equal(useProject.getState().project.drawing.dims[second],undefined);
  useProject.getState().undo();
  assert.ok(useProject.getState().project.drawing.dims[second]);
 } finally {await server.close();}
});
