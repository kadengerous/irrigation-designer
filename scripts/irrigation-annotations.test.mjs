import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
test('irrigation keeps zone pairs and two interior boundary datums with fill-aware ink',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false}}),load=p=>server.ssrLoadModule('/src/'+p);
 try{
  const {emptyProject}=await load('lib/project-types.ts'),{emptyDrawing}=await load('lib/cad/types.ts');
  const {addRect,addDim}=await load('lib/cad/engine.ts'),{automaticDimensions}=await load('lib/cad/auto-dimensions.ts');
  const {displayedDimensions}=await load('lib/cad/sprinkler-dimensions.ts');
  let d=addRect(emptyDrawing(),{x:0,y:0},{x:12,y:8},'lawn');
  d=addRect(d,{x:20,y:0},{x:30,y:8},'no_irrigation');
  d=addDim(d,{x:20,y:0},{x:30,y:0});
  const heads=[{id:'a',x:0,y:0,zone:1},{id:'b',x:4,y:0,zone:1},{id:'c',x:8,y:0,zone:2},{id:'d',x:12,y:0,zone:2},{id:'inner',x:3,y:3,zone:1}];
  const p={...emptyProject(),heads,drawing:d};p.drawing=automaticDimensions(p,'plan');
  const plan=displayedDimensions(p.drawing,'plan');
  const result=automaticDimensions(p,'irrigation'),shown=displayedDimensions(result,'irrigation');
  assert.ok(shown.length>=3);
  for(const dim of shown){
   const a=heads.find(h=>h.id===dim.aHeadId),b=heads.find(h=>h.id===dim.bHeadId);
   if(dim.autoKey.includes(':inside:')){assert.ok(a||b);assert.equal((a??b).id,'inner');}
   else{assert.ok(a&&b);assert.equal(a.zone,b.zone);}
  }
  assert.deepEqual(displayedDimensions(result,'plan'),plan);
  const internal=shown.filter(d=>d.autoKey.includes(':inside:'));
  assert.equal(internal.length,2);
  assert.ok(internal.some(d=>d.a.x===3&&d.a.y===0&&d.b.x===3&&d.b.y===3));
  assert.ok(internal.some(d=>d.a.x===3&&d.a.y===3&&d.b.x===0&&d.b.y===3));
 }finally{await server.close();}
});
