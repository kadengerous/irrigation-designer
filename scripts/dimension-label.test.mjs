import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "vite";

test("custom dimension text preserves geometry and layout; next dimensions reuse the offset",async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false}});
 try {
  const {emptyDrawing}=await server.ssrLoadModule("/src/lib/cad/types.ts");
  const {addRect,addDim,setDimensionLabel,outsideDimensionOffset}=await server.ssrLoadModule("/src/lib/cad/engine.ts");
  const {dimensionLabelLayout}=await server.ssrLoadModule("/src/lib/cad/dimension-label-layout.ts");
  let d=addRect(emptyDrawing(),{x:0,y:0},{x:6,y:3},"lawn");
  assert.equal(outsideDimensionOffset(d,{x:0,y:0},{x:6,y:0},0.8),-0.8);
  assert.equal(outsideDimensionOffset(d,{x:6,y:0},{x:0,y:0},0.8),0.8);
  d=addDim(d,{x:0,y:0},{x:6,y:0},-0.8);
  const id=Object.keys(d.dims)[0];
  const next=setDimensionLabel(d,id,"12,50 м");
  assert.deepEqual(next.vertices,d.vertices);assert.deepEqual(next.faces,d.faces);
  assert.deepEqual(next.dims[id],{...d.dims[id],label:"12,50 м"});
  assert.equal(setDimensionLabel(next,id,"").dims[id].label,undefined);
  assert.equal(dimensionLabelLayout({x:0,y:0},{x:60,y:0},1).y,18);
  assert.equal(dimensionLabelLayout({x:0,y:0},{x:60,y:0},-1).y,-18);
  assert.equal(dimensionLabelLayout({x:60,y:0},{x:0,y:0},1).y,-18);
  assert.equal(dimensionLabelLayout({x:0,y:0},{x:0,y:60},1).x,-18);
  const {useProject}=await server.ssrLoadModule("/src/lib/project-store.ts");
  useProject.setState({project:{...useProject.getState().project,drawing:d},dimensionOffset:0.8});
  useProject.getState().setDimOffset(id,-1.75);
  assert.equal(useProject.getState().dimensionOffset,1.75);
  useProject.getState().addDimension({x:6,y:0},{x:6,y:3});
  const dims=Object.values(useProject.getState().project.drawing.dims);
  assert.equal(Math.abs(dims.find(dim=>dim.id!==id).offset),1.75);
 } finally {await server.close();}
});
