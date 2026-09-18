import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("crossing selection and dimension snapping", async () => {
  const server = await createServer({server:{middlewareMode:true,hmr:false}});
  try {
    const {pathTouchesBox} = await server.ssrLoadModule("/src/lib/cad/workspace-selection.ts");
    const {snapDimension} = await server.ssrLoadModule("/src/lib/cad/dimension-snap.ts");
    const {emptyDrawing} = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const {addRect} = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const square = [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];
    assert.equal(pathTouchesBox(square,true,{x:9,y:4},{x:11,y:6}),true,"edge crossing without enclosed vertices");
    assert.equal(pathTouchesBox(square,true,{x:11,y:6},{x:9,y:4}),true,"reverse drag");
    assert.equal(pathTouchesBox(square,true,{x:3,y:3},{x:4,y:4}),true,"box inside face");
    assert.equal(pathTouchesBox(square,true,{x:10,y:4},{x:11,y:6}),true,"touching boundary");
    assert.equal(pathTouchesBox(square,true,{x:11,y:4},{x:12,y:6}),false,"outside face");
    assert.equal(pathTouchesBox([{x:-2,y:0},{x:2,y:0}],false,{x:-1,y:-1},{x:1,y:1}),true,"line crossing box");
    assert.equal(pathTouchesBox(square,true,{x:3,y:3},{x:4,y:4},[[{x:2,y:2},{x:6,y:2},{x:6,y:6},{x:2,y:6}]]),false,"box inside a hole");
    const options={pxPerMeter:100,snapOn:true,snapGridOn:true,gridStep:1};
    const d = emptyDrawing();
    assert.deepEqual(snapDimension({x:0.03,y:-0.02},d,options).pt,{x:0,y:0});
    assert.deepEqual(snapDimension({x:0.53,y:0.47},d,options).pt,{x:0.5,y:0.5});
    assert.deepEqual(snapDimension({x:-0.47,y:-0.53},d,options).pt,{x:-0.5,y:-0.5});
    assert.equal(snapDimension({x:0.53,y:0.47},d,{...options,snapOn:false}).kind,"none");
    assert.equal(snapDimension({x:0.53,y:0.47},d,{...options,snapGridOn:false}).kind,"none");
    const drawing=addRect(d,{x:0,y:0},{x:10,y:10},"lawn");
    const edge = snapDimension({x:3.2,y:0.05},drawing,options);
    assert.equal(edge.kind,"edge"); assert.ok(Math.abs(edge.pt.y)<1e-8);
    assert.equal(snapDimension({x:0.04,y:0.03},drawing,options).kind,"end");
  } finally {await server.close();}
});
