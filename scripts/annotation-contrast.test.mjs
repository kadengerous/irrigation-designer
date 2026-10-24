import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
test('white annotations on every visible fill or sector, grey after hiding or moving to empty canvas',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false}});
 try{
  const {annotationPaintInk:ink}=await server.ssrLoadModule('/src/components/designer/annotation-contrast.ts');
  const {emptyDrawing}=await server.ssrLoadModule('/src/lib/cad/types.ts');
  const {addRect}=await server.ssrLoadModule('/src/lib/cad/engine.ts');
  const head={id:'head',catalogId:'MP1000-360',x:5,y:5,r:3,start:0,arc:360};
  assert.equal(ink({x:6,y:5},emptyDrawing(),[head],true),'#ffffff');
  assert.equal(ink({x:6,y:5},emptyDrawing(),[head],false),'#626b75');
  assert.equal(ink({x:30,y:5},emptyDrawing(),[head],true),'#626b75');
  for(const fill of ['#ffffff','#c7efff','#222222','texture:lawn-parterre']){
   const d=addRect(emptyDrawing(),{x:0,y:0},{x:10,y:10},'lawn');
   Object.values(d.faces)[0].fill=fill;
   assert.equal(ink({x:5,y:5},d,[],false),'#ffffff',fill);
   assert.equal(ink({x:15,y:5},d,[],false),'#626b75');
   const hidden={...d,faces:Object.fromEntries(Object.entries(d.faces).map(([id,f])=>[id,{...f,hidden:true}]))};
   assert.equal(ink({x:5,y:5},hidden,[],false),'#626b75');
  }
 }finally{await server.close();}
});
