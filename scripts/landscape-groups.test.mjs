import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
test('plant groups preserve variants, inherited flags and independent geometry; return drop requires a deliberate completed drag',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false}});
 try{
  const {plantGroups,changeLandscapeGroup}=await server.ssrLoadModule('/src/lib/landscape-groups.ts');
  const {landscapeReturnDrop}=await server.ssrLoadModule('/src/lib/landscape-return-drop.ts');
  const {emptyDrawing}=await server.ssrLoadModule('/src/lib/cad/types.ts');
  const p={id:'a',kind:'tree',catalogId:'tree-one',x:0,y:0,r:2};
  const d={...emptyDrawing(),plants:{a:p,b:{...p,id:'b',r:3,rotation:90},c:{...p,id:'c',catalogId:'tree-two'}}};
  assert.deepEqual(plantGroups(d).map(g=>g.length),[2,1]);
  d.layers.plants={visible:false,locked:true};
  const shown=changeLandscapeGroup(d,'plant','a','visibility');
  assert.equal(shown.plants.a.hidden,false);assert.equal(shown.plants.b.hidden,false);assert.equal(shown.plants.c.hidden,true);
  assert.equal(shown.plants.a.locked,true);assert.equal(shown.plants.c.locked,true);
  const unlocked=changeLandscapeGroup(shown,'plant','a','lock');
  assert.equal(unlocked.plants.a.locked,false);assert.equal(unlocked.plants.b.r,3);assert.equal(unlocked.plants.c.locked,true);
  const deleted=changeLandscapeGroup(unlocked,'plant','a','delete');assert.deepEqual(Object.keys(deleted.plants),['c']);assert.equal(Object.keys(d.plants).length,3);
  let highlighted=false;const target={};const library={getBoundingClientRect:()=>({left:100,right:300,top:0,bottom:300,width:200,height:300}),contains:el=>el===target,toggleAttribute:(_,value)=>{highlighted=value;}};
  globalThis.document={querySelector:()=>library,elementFromPoint:()=>target};
  const start={clientX:0,clientY:50};
  assert.equal(landscapeReturnDrop(start,150,0,false),false);assert.equal(highlighted,true);
  assert.equal(landscapeReturnDrop(start,150,0,true),true);assert.equal(highlighted,false);
  assert.equal(landscapeReturnDrop(start,0,0,false),false);assert.equal(highlighted,false);
  assert.equal(landscapeReturnDrop(start,400,0,true),false);
  assert.equal(landscapeReturnDrop({clientX:150,clientY:50},5,0,true),false);
 }finally{delete globalThis.document;await server.close();}
});
