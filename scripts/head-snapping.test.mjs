import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("sprinklers snap to visible figure corners before contours, without the grid", async () => {
  const server = await createServer({server:{middlewareMode:true,hmr:false}});
  try {
    const {snapSprinklerPoint} = await server.ssrLoadModule("/src/lib/head-snapping.ts");
    const {emptyDrawing} = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const {addRect,addCircle,addDrawingLines} = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const snap = (p,d,more={}) => snapSprinklerPoint(p,d,{snapOn:true,pxPerMeter:40,pointerType:"mouse",...more});
    const close = (p,q) => assert.ok(Math.hypot(p.x-q.x,p.y-q.y)<1e-8,`${JSON.stringify(p)} != ${JSON.stringify(q)}`);
    const d = addRect(emptyDrawing(),{x:.17,y:.23},{x:6.17,y:4.23},"lawn");
    for (const pointerType of ["mouse","touch","pen"]) {
      const corner=snap({x:.26,y:.25},d,{pointerType});
      assert.equal(corner.kind,"end"); close(corner.pt,{x:.17,y:.23});
      const edge=snap({x:4.01,y:.29},d,{pointerType});
      assert.equal(edge.kind,"edge"); close(edge.pt,{x:4.01,y:.23});
    }
    const free={x:10.04,y:10.01};
    assert.deepEqual(snap(free,d),{pt:free,kind:"none"},"empty space is not rounded to grid lines");
    assert.equal(snap({x:.2,y:.25},d,{snapOn:false}).kind,"none");
    const hidden={...d,faces:Object.fromEntries(Object.entries(d.faces).map(([id,f])=>[id,{...f,hidden:true}]))};
    assert.equal(snap({x:.2,y:.25},hidden).kind,"none","hidden face edges do not leak into loose-edge snapping");
    const hiddenLayer={...d,layers:{...d.layers,landscape:{visible:false,locked:false}}};
    assert.equal(snap({x:.2,y:.25},hiddenLayer).kind,"none");
    const locked={...d,faces:Object.fromEntries(Object.entries(d.faces).map(([id,f])=>[id,{...f,locked:true}]))};
    assert.equal(snap({x:.2,y:.25},locked).kind,"end","locked visible figures still offer reference geometry");
    const circle=addCircle(emptyDrawing(),{x:20,y:20},3,"lawn");
    const circleHit=snap({x:23.1,y:20.14},circle);
    assert.equal(circleHit.kind,"edge");
    assert.ok(Math.abs(Math.hypot(circleHit.pt.x-20,circleHit.pt.y-20)-3)<1e-9,"circle contact is on the exact radius");
    assert.equal(snap({x:20,y:20},circle).kind,"none","circle centre is not its outline");
    const line=addDrawingLines(emptyDrawing(),[{x:1.13,y:2.23},{x:6.13,y:2.23}],"lawn");
    close(snap({x:4.3,y:2.29},line).pt,{x:4.3,y:2.23});
    const arc={...emptyDrawing(),vertices:{a:{id:"a",x:0,y:0},b:{id:"b",x:2,y:0}},
      edges:{arc:{id:"arc",a:"a",b:"b",bulge:1,faceL:null,faceR:null}}};
    close(snap({x:1,y:-1.07},arc).pt,{x:1,y:-1});
    assert.equal(snap({x:1,y:0},arc).kind,"none","an arc does not snap to its chord");
    const withHole=addRect(d,{x:2,y:1},{x:4,y:3},"lawn");
    const [outer,inner]=Object.values(withHole.faces);
    const hole={...withHole,faces:{[outer.id]:{...outer,holes:[inner.outer]}}};
    close(snap({x:3,y:1.08},hole).pt,{x:3,y:1});
    const plants={...emptyDrawing(),plants:{sample:{x:.2,y:.25,r:1}}};
    assert.equal(snap({x:.2,y:.25},plants).kind,"none","plant symbols are not figure corners");
  } finally { await server.close(); }
});
