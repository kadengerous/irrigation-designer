import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {createServer} from 'vite';
let server,e,emptyDrawing,emptyProject,automaticDimensions,layoutDimensions,presentation;
before(async()=>{server=await createServer({server:{middlewareMode:true,hmr:false}});e=await server.ssrLoadModule('/src/lib/cad/engine.ts');({emptyDrawing}=await server.ssrLoadModule('/src/lib/cad/types.ts'));({emptyProject}=await server.ssrLoadModule('/src/lib/project-types.ts'));({automaticDimensions}=await server.ssrLoadModule('/src/lib/cad/auto-dimensions.ts'));({layoutDimensions}=await server.ssrLoadModule('/src/lib/cad/dimension-layout.ts'));presentation=await server.ssrLoadModule('/src/lib/head-presentation.ts');});
after(async()=>server.close());
const pts=[{x:0,y:5},{x:12,y:5},{x:12,y:0},{x:15.5,y:0},{x:15.5,y:20},{x:6.5,y:20},{x:6.5,y:17.5},{x:5,y:17.5},{x:5,y:16},{x:3.5,y:16},{x:0,y:7}];
function fixture(){
 const drawing=e.addChain(emptyDrawing(),pts,true,'lawn',false);
 const heads=[{x:0,y:5},{x:3,y:5},{x:8,y:5},{x:12,y:5},{x:12,y:3},{x:12,y:0},{x:15.5,y:.07},{x:15.5,y:3},{x:15.5,y:9},{x:15.5,y:15},{x:15.5,y:20},{x:11,y:20},{x:6.5,y:20},{x:5,y:17.5},{x:3.5,y:16},{x:1.75,y:11.5},{x:1.05,y:9.7},{x:8,y:12}].map((h,i)=>({...h,id:`h${i}`}));
 const p={...emptyProject(),heads,drawing};return {...p,drawing:automaticDimensions(p,'irrigation')};
}
test('zoom preserves drawing coordinates of dimension numbers and sprinkler labels',()=>{
 const p=fixture(),label=n=>`${n.toFixed(2)} м`;
 function layout(px){
  const rows=[...layoutDimensions(p.drawing,px,'irrigation',label).values()];
  const heads=p.heads.map(h=>({...h,...presentation.equipmentLabel('MP800SR 90–210°',px/36,true),radius:13*px/36}));
  const positions=presentation.layoutHeadLabels(heads,p.drawing,px,{boxes:rows.map(r=>r.box),segments:rows.flatMap(r=>r.segments)},true);
  return {rows,positions};
 }
 const base=layout(36),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
 assert.ok(base.positions.size>0);
 for(const px of [4.5,9,18,27,36,70,120]){
  const current=layout(px);
  assert.deepEqual([...current.positions.keys()],[...base.positions.keys()]);
  for(let i=0;i<base.rows.length;i++){
   for(const axis of ['x','y'])near(current.rows[i].text[axis]/px,base.rows[i].text[axis]/36);
   for(const key of ['x','y','width','height'])near(current.rows[i].box[key]/px,base.rows[i].box[key]/36);
  }
  for(const [id,pos] of current.positions)for(const axis of ['x','y'])near(pos[axis]/px,base.positions.get(id)[axis]/36);
 }
});
test('complete irregular contour includes upper cap, convex bend, both sides and every step without duplicates',()=>{
 const p=fixture(),dims=Object.values(p.drawing.dims);
 assert.ok(dims.some(d=>d.a.x===12&&d.a.y===0&&d.b.x===15.5&&d.b.y===.07),'top cap tolerates a small corner placement deviation');
 assert.ok(dims.some(d=>[d.a,d.b].some(p=>p.x===0&&p.y===7)),'ordinary convex corner closes the left gap');
 for(const [a,b] of [[{x:3.5,y:16},{x:5,y:16}],[{x:5,y:16},{x:5,y:17.5}],[{x:5,y:17.5},{x:6.5,y:17.5}],[{x:6.5,y:17.5},{x:6.5,y:20}]])assert.ok(dims.some(d=>JSON.stringify(d.a)===JSON.stringify(a)&&JSON.stringify(d.b)===JSON.stringify(b)||JSON.stringify(d.a)===JSON.stringify(b)&&JSON.stringify(d.b)===JSON.stringify(a)),'step side exists');
 assert.equal(new Set(dims.map(d=>[JSON.stringify(d.a),JSON.stringify(d.b)].sort().join('|'))).size,dims.length);
 assert.ok(dims.every(d=>Math.hypot(d.a.x-d.b.x,d.a.y-d.b.y)>.1),'no artificial short corner fragments');
 assert.deepEqual(automaticDimensions(p,'irrigation').dims,p.drawing.dims);
 const circle={...emptyProject(),drawing:e.addCircle(emptyDrawing(),{x:0,y:0},5,'lawn'),heads:[{id:'a',x:5,y:0},{id:'b',x:-5,y:0}]};
 assert.ok(Object.keys(automaticDimensions(circle,'irrigation').dims).length<5,'do not dimension tessellation of a curve');
});
test('step numbers stay close to their own dimension line without colliding with other numbers',()=>{
 const p=fixture();
 for(const px of [18,36,70,120]){
  const rows=[...layoutDimensions(p.drawing,px,'irrigation',n=>`${n.toFixed(2)} м`).values()];
  for(let i=0;i<rows.length;i++){
   for(let j=0;j<i;j++)assert.ok(!presentation.labelBoxesOverlap(rows[i].box,rows[j].box),`text collision at ${px}`);
   const own=rows[i].segments[1],text=rows[i].text,dx=own.b.x-own.a.x,dy=own.b.y-own.a.y;
   const normal=Math.abs((text.x-own.a.x)*dy-(text.y-own.a.y)*dx)/Math.hypot(dx,dy);
   assert.ok(normal<=20*rows[i].textScale*px/36+1e-8,'dimension number stays immediately beside its line relative to text size');
  }
 }
});
test('every sprinkler retains a nearby two-line label, including crowded layouts',()=>{
 const p=fixture(),px=36;
 for(const name of ['MP800SR 90–210°','MP815 210–270°','MP2000 360°','MP Corner 45–105°']){
  const label=presentation.equipmentLabel(name,1,true);
  assert.equal(label.text.split('\n').length,2);
  assert.ok(label.text.split('\n')[1].includes('°'));
 }
 const heads=p.heads.map(h=>({...h,...presentation.equipmentLabel('MP815 90–210°',1,true),radius:13}));
 const positions=presentation.layoutHeadLabels(heads,p.drawing,px,undefined,true);
 assert.equal(positions.size,heads.length,'no labels hidden');
 for(const h of heads){
  const p=positions.get(h.id),dx=Math.max(p.x,0,-p.x-h.width),dy=Math.max(p.y,0,-p.y-h.height);
  assert.ok(Math.hypot(dx,dy)<=h.radius+5,'label must touch its own symbol neighbourhood');
 }
});
test('with dimensions, boundary equipment labels fit inside the figure and avoid dimension numbers',async()=>{
 const d=e.addRect(emptyDrawing(),{x:0,y:0},{x:14,y:10},'lawn');
 const {irrigationFigures,figureAtPoint}=await server.ssrLoadModule('/src/lib/irrigation-figures.ts');
 for(const px of [18,36,120]){
  const scale=presentation.headSymbolScale(px),heads=[{x:0,y:0},{x:14,y:0},{x:0,y:5},{x:14,y:5},{x:0,y:10},{x:14,y:10}].map((p,i)=>({...p,id:String(i),width:140*scale,height:12*scale,radius:13*scale}));
  const result=presentation.layoutHeadLabels(heads,d,px,undefined,true);
  assert.equal(result.size,heads.length);
  for(const h of heads){const pos=result.get(h.id);for(const [x,y] of [[0,0],[h.width,0],[0,h.height],[h.width,h.height]])assert.ok(figureAtPoint({x:h.x+(pos.x+x)/px,y:h.y+(pos.y+y)/px},irrigationFigures(d)));}
 }
});
