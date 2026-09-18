import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "vite";

test("dimension value edits geometry; offset does not; locked shapes stay intact",async()=>{
  const server=await createServer({server:{middlewareMode:true,hmr:false}});
  try {
    const {emptyDrawing}=await server.ssrLoadModule("/src/lib/cad/types.ts");
    const {addRect,addDim,resolveDim,setDimensionLength,setDimOffset,facePoints}=await server.ssrLoadModule("/src/lib/cad/engine.ts");
    let d=addRect(emptyDrawing(),{x:0,y:0},{x:6,y:3},"lawn");
    const faceId=Object.keys(d.faces)[0];
    d=addDim(d,{x:0,y:0},{x:6,y:0},-0.5);
    const id=Object.keys(d.dims)[0];
    const changed=setDimensionLength(d,id,8);
    const {a,b}=resolveDim(changed,changed.dims[id]);
    assert.ok(Math.abs(Math.hypot(b.x-a.x,b.y-a.y)-8)<1e-8);
    const pts=facePoints(changed,faceId);
    assert.equal(Math.max(...pts.map(p=>p.x))-Math.min(...pts.map(p=>p.x)),8);
    assert.equal(Math.max(...pts.map(p=>p.y))-Math.min(...pts.map(p=>p.y)),3);
    const moved=setDimOffset(changed,id,-2);
    assert.deepEqual(moved.vertices,changed.vertices);
    assert.equal(moved.dims[id].offset,-2);
    assert.equal(d.dims[id].offset,-0.5);
    d.faces[faceId].locked=true;
    assert.equal(setDimensionLength(d,id,9),d);
    assert.equal(setDimensionLength(d,id,-1),d);
    let free=addDim(emptyDrawing(),{x:1,y:1},{x:4,y:5},1);
    const freeId=Object.keys(free.dims)[0];
    free=setDimensionLength(free,freeId,10);
    assert.deepEqual(resolveDim(free,free.dims[freeId]),{a:{x:1,y:1},b:{x:7,y:9}});
  } finally {await server.close();}
});
