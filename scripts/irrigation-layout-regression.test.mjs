import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {createServer} from 'vite';
let server,engine,types,auto,dimensions,snap,presentation;
before(async()=>{
 server=await createServer({server:{middlewareMode:true,hmr:false}});
 const load=p=>server.ssrLoadModule('/src/lib/'+p+'.ts');
 engine=await load('cad/engine');types=await load('cad/types');auto=await load('cad/auto-dimensions');
 dimensions=await load('cad/sprinkler-dimensions');snap=await load('head-snapping');presentation=await load('head-presentation');
});
after(async()=>{await server?.close();});
const rectangle=()=>engine.addRect(types.emptyDrawing(),{x:0,y:0},{x:10,y:12},'lawn');
test('boundary labels clear the symbol and remain outside on all four sides at different zooms',()=>{
 const d=rectangle();
 for(const px of [9,18,36,120]){
  const s=presentation.headSymbolScale(px),w=120*s,h=12*s,r=11*s;
  const label=p=>presentation.headLabelPosition(p,d,px,w,h,r);
  assert.ok(label({x:0,y:5}).x+w < -r);
  assert.ok(label({x:10,y:5}).x > r);
  assert.ok(label({x:5,y:0}).y+h < -r);
  assert.ok(label({x:5,y:12}).y > r);
  const inner=label({x:5,y:6});assert.ok(5+inner.x/px>0);assert.ok(5+(inner.x+w)/px<10);
 }
 assert.equal(presentation.headSymbolScale(9),presentation.headSymbolScale(18)/2);
});
test('guides and edge intersections never align to a neighbouring figure, even over large distances',()=>{
 const d=engine.addRect(rectangle(),{x:20,y:0},{x:30,y:12},'lawn');
 const heads=[{id:'other',x:20,y:3}];
 const options={snapOn:true,pxPerMeter:40,heads};
 const p={x:9.9,y:3.1};
 const snapped=snap.snapSprinklerPoint(p,d,options).pt;
 assert.equal(snapped.x,10);assert.ok(Math.abs(snapped.y-3.1)<1e-9);
 assert.equal(snap.sprinklerAlignmentGuides({x:10,y:3},heads,40,undefined,d).length,0);
 const same=[...heads,{id:'same',x:0,y:3}];
 assert.deepEqual(snap.snapSprinklerPoint(p,d,{...options,heads:same}).pt,{x:10,y:3});
 assert.equal(snap.sprinklerAlignmentGuides({x:10,y:3},same,40,undefined,d)[0].target.id,'same');
 assert.deepEqual(snap.snapSprinklerPoint({x:10.1,y:3.1},d,{...options,heads:same}).pt,{x:10,y:3});
});
test('plan and irrigation automatic dimensions cannot overlay each other; repeated generation and movement do not accumulate copies',()=>{
 const manual={id:'manual',a:{x:1,y:1},b:{x:2,y:2},offset:.5,label:'User'};
 let p={polygons:[],drawing:rectangle(),heads:[{id:'a',x:0,y:0},{id:'b',x:4,y:0},{id:'c',x:10,y:0},{id:'inner',x:7,y:9}]};
 p.drawing.dims={manual};p.drawing=auto.automaticDimensions(p,'plan');
 const plan=dimensions.displayedDimensions(p.drawing,'plan');assert.equal(plan.length,5);
 for(let i=0;i<4;i++){
  p.drawing=auto.automaticDimensions(p,'irrigation');
  const visible=dimensions.displayedDimensions(p.drawing,'irrigation');
  assert.equal(visible.length,5);assert.equal(visible.filter(d=>d.autoKey?.includes(':inside:')).length,2);
  assert.ok(!visible.some(d=>d.autoKey?.startsWith('edge:')));
  const vertical=visible.find(d=>d.autoKey?.endsWith(':inner:y'));assert.deepEqual(vertical.a,{x:7,y:12});
  assert.deepEqual(p.drawing.dims.manual,manual);
  p={...p,heads:p.heads.map(h=>h.id==='b'?{...h,x:h.x+.01}:h)};
 }
 assert.deepEqual(dimensions.displayedDimensions(p.drawing,'plan'),plan);
 const legacy={...p.drawing,dims:{...p.drawing.dims,old:{id:'auto:heads:old',a:{x:1,y:1},b:{x:3,y:3},offset:.5}}};
 assert.ok(!dimensions.resolveSprinklerDimensions(legacy,p.heads).old);
});
