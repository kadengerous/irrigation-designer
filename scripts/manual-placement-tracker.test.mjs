import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';

test('placement coalesces mouse input, follows stationary-pointer zoom/pan, and cancels stale frames',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false}});
 try{
  const {createManualPlacementTracker}=await server.ssrLoadModule('/src/lib/manual-placement-tracker.ts');
  const {emptyProject}=await server.ssrLoadModule('/src/lib/project-types.ts');
  const {drawingOrMigrate}=await server.ssrLoadModule('/src/lib/cad/engine.ts');
  const {ManualSprinklerPlacement}=await server.ssrLoadModule('/src/components/designer/manual-sprinkler-placement.tsx');
  const markup=renderToStaticMarkup(createElement(ManualSprinklerPlacement,{trackerRef:{current:null}}));
  assert.equal((markup.match(/<circle/g)??[]).length,2);assert.equal((markup.match(/<path/g)??[]).length,2,'one white-backed green cross');
  const {SprinklerTarget}=await server.ssrLoadModule('/src/components/designer/sprinkler-target.tsx');
  const {headSymbolScale,HEAD_SYMBOL_RADIUS}=await server.ssrLoadModule('/src/lib/head-presentation.ts');
  for(const px of [4.5,9,18,36,72,144]){
   const target=renderToStaticMarkup(createElement(SprinklerTarget,{x:20,y:30,px}));
   assert.ok(target.includes(`translate(20 30) scale(${headSymbolScale(px)})`));
   assert.ok(target.includes(`M-${HEAD_SYMBOL_RADIUS} 0H${HEAD_SYMBOL_RADIUS}`),'cross extent matches the installed head');
  }
  let scene={drawing:drawingOrMigrate(emptyProject()),heads:[],px:40,panX:0,panY:0,snapOn:false,snapGridOn:true,gridStep:.5};
  let reads=0,output=null,next=0;
  const frames=new Map();
  const tracker=createManualPlacementTracker(()=>{reads++;return scene;},v=>output=v,
    fn=>{frames.set(++next,fn);return next;},id=>frames.delete(id));
  const tick=()=>{const ready=[...frames.values()];frames.clear();ready.forEach(fn=>fn());};
  for(let i=1;i<=100;i++)tracker.move({x:i*2,y:100});
  assert.equal(reads,0);assert.equal(frames.size,1);tick();assert.equal(reads,1);
  assert.deepEqual(output.hit.pt,{x:5,y:2.5});assert.deepEqual(output.screen,{x:200,y:100});
  scene={...scene,px:80,panX:40,panY:20};tracker.refresh();tick();
  assert.deepEqual(output.hit.pt,{x:2,y:1});assert.deepEqual(output.screen,{x:200,y:100});
  scene={...scene,snapOn:true};tracker.move({x:213,y:111});tick();
  assert.deepEqual(output.hit.pt,{x:2,y:1});assert.equal(output.hit.kind,'grid');
  tracker.move({x:500,y:500});tracker.clear();assert.equal(frames.size,0);assert.equal(output,null);tick();assert.equal(output,null);
  tracker.move({x:200,y:100},true);assert.deepEqual(output.hit.pt,{x:2,y:1});assert.equal(frames.size,0,'touch receives immediate feedback');
  tracker.clear();tracker.refresh();assert.equal(frames.size,0,'hidden pointer stays hidden during later zoom');
 }finally{await server.close();}
});
