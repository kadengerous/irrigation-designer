import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';

test('sector edges and head-to-head edits share finite geometry on mouse, pen and touch',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false}});
 try{
  const {snapSprinklerPoint}=await server.ssrLoadModule('/src/lib/head-snapping.ts');
  const {sectorSnapPatch,sectorPoint}=await server.ssrLoadModule('/src/lib/head-sector-edit.ts');
  const {emptyDrawing}=await server.ssrLoadModule('/src/lib/cad/types.ts');
  const {addRect}=await server.ssrLoadModule('/src/lib/cad/engine.ts');
  const d=emptyDrawing(), h={id:'a',x:0,y:0,r:5,start:0,arc:90};
  const close=(a,b)=>assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-7,JSON.stringify({a,b}));
  const item={arcMin:40,arcMax:360,rMin:1,rMax:12};
  for(const pointerType of ['mouse','touch','pen']){
   const options={snapOn:true,pxPerMeter:40,pointerType,heads:[h]};
   close(snapSprinklerPoint({x:3.6,y:3.6},d,options).pt,sectorPoint(h,5,45));
   close(snapSprinklerPoint({x:2.1,y:.1},d,options).pt,{x:2.1,y:0});
   close(snapSprinklerPoint({x:.1,y:2.1},d,options).pt,{x:0,y:2.1});
   assert.equal(snapSprinklerPoint({x:-3.6,y:-3.6},d,options).kind,'none');
   assert.equal(snapSprinklerPoint({x:3.6,y:3.6},d,{...options,excludeHead:'a'}).kind,'none');
   assert.equal(snapSprinklerPoint({x:3.6,y:3.6},d,{...options,snapOn:false}).kind,'none');
   const neighbor={id:'b',x:4.8,y:.2,r:3,start:180,arc:90};
   const target=snapSprinklerPoint({x:4.85,y:.22},d,{...options,heads:[h,neighbor],excludeHead:'a',sectorEdit:true});
   close(target.pt,neighbor);assert.deepEqual(Object.keys(target.pt).sort(),['x','y']);
   const start=sectorSnapPatch(h,'start',{},target.pt,item);
   close(sectorPoint({...h,...start},start.r,start.start),neighbor);
   assert.ok(Math.abs(start.start+start.arc-90)<1e-7);
   const top={x:.2,y:4.8};
   const end=sectorSnapPatch(h,'end',{},top,item);
   close(sectorPoint({...h,...end},end.r,h.start+end.arc),top);
   const radius=sectorSnapPatch(h,'radius',{},neighbor,item);
   assert.ok(Math.abs(radius.r-Math.hypot(neighbor.x,neighbor.y))<1e-7);
   assert.equal(sectorSnapPatch(h,'end',{}, {x:100,y:100},item),null);
   assert.equal(sectorSnapPatch(h,'end',{}, {x:5,y:.1},item),null);
   const figure=addRect(d,{x:8,y:8},{x:14,y:14},'lawn');
   close(snapSprinklerPoint({x:10,y:8.1},figure,{...options,sectorEdit:true}).pt,{x:10,y:8});
   const other=snapSprinklerPoint({x:3.6,y:3.6},d,{...options,sectorEdit:true});
   assert.equal(other.kind,'edge');
   close(other.pt,sectorPoint(h,5,45));
  }
 }finally{await server.close();}
});
