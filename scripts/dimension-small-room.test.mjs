import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {createServer} from 'vite';
let server,e,t,layoutDimensions,dimensionScaleResolver,dimensionEndMarkers,dimensionTextScale,dimensionsInBox,labelBoxesOverlap,projectToSvg,emptyProject;
before(async()=>{
  server=await createServer({server:{middlewareMode:true,hmr:false}});
  e=await server.ssrLoadModule('/src/lib/cad/engine.ts');
  t=await server.ssrLoadModule('/src/lib/cad/types.ts');
  ({layoutDimensions}=await server.ssrLoadModule('/src/lib/cad/dimension-layout.ts'));
  ({dimensionScaleResolver,dimensionEndMarkers,dimensionTextScale}=await server.ssrLoadModule('/src/lib/cad/dimension-appearance.ts'));
  ({dimensionsInBox}=await server.ssrLoadModule('/src/lib/cad/dimension-selection.ts'));
  ({labelBoxesOverlap}=await server.ssrLoadModule('/src/lib/head-presentation.ts'));
  ({projectToSvg}=await server.ssrLoadModule('/src/lib/export-plan.ts'));
  ({emptyProject}=await server.ssrLoadModule('/src/lib/project-types.ts'));
});
after(async()=>server.close());
const points=[{x:0,y:0},{x:1.05,y:0},{x:1.05,y:.24},{x:2.37,y:.24},{x:2.37,y:1.77},{x:1.9,y:1.77},{x:1.9,y:1.4},{x:1.05,y:1.4},{x:1.05,y:1.77},{x:0,y:1.77}];
const label=n=>`${n.toFixed(2)} м`;
function room(){
  let d=e.addChain(t.emptyDrawing(),points,false,'lawn',false);
  for(let i=0;i<points.length;i++)d=e.addDim(d,points[i],points[(i+1)%points.length],-.3);
  return d;
}
test('small open room has compact, consistent dimensions at every camera zoom',()=>{
  const d=room(),original=JSON.stringify(d),base=[...layoutDimensions(d,36,'plan',label).values()];
  assert.equal(new Set(base.map(r=>r.annotationScale)).size,1,'one text size for the whole room');
  assert.ok(base.every(r=>12*r.textScale/36>=.10&&12*r.textScale/36<.12),'room text is legible without returning to the original 33 cm height');
  for(const px of [36,120,216,360]){
    const rows=[...layoutDimensions(d,px,'plan',label).values()];
    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      for(let j=0;j<i;j++)assert.ok(!labelBoxesOverlap(row.box,rows[j].box),`${row.label} overlaps ${rows[j].label} at ${px}`);
      assert.ok(Math.abs(row.text.x/px-base[i].text.x/36)<1e-9);
      assert.ok(Math.abs(row.text.y/px-base[i].text.y/36)<1e-9);
      const p={x:row.text.x/px,y:row.text.y/px};
      assert.deepEqual(dimensionsInBox(d,p,p,px,'plan',label,true),[row.id],`tap selects ${row.label} at ${px}`);
    }
  }
  assert.equal(JSON.stringify(d),original,'presentation never changes geometry or stored measurements');
});
test('a separate large plot does not enlarge room annotations and rotating a room preserves their size',()=>{
  const d=room(),a=points[0],b=points[1],size=dimensionScaleResolver(d)(a,b);
  const large=e.addRect(d,{x:20,y:20},{x:60,y:80},'lawn');
  assert.equal(dimensionScaleResolver(large)(a,b),size);
  assert.equal(dimensionScaleResolver(large)({x:20,y:20},{x:60,y:20}),1.17);
  const rotate=p=>({x:(p.x-p.y)/Math.sqrt(2),y:(p.x+p.y)/Math.sqrt(2)});
  const rotated=e.addChain(t.emptyDrawing(),points.map(rotate),false,'lawn',false);
  assert.ok(Math.abs(dimensionScaleResolver(rotated)(rotate(a),rotate(b))-size)<1e-9);
});
test('tiny figures and standalone short dimensions retain a readable minimum size',()=>{
  for(const length of [.02,.06,.24,.47]){
    const a={x:0,y:0},b={x:length,y:0};
    for(const d of [e.addDim(t.emptyDrawing(),a,b,.3),e.addRect(t.emptyDrawing(),a,{x:length,y:length},'lawn')]){
      const scale=dimensionScaleResolver(d)(a,b);
      assert.equal(scale,.45);
      assert.ok(Math.abs(12*dimensionTextScale(scale)*120/36-13.005)<1e-9,'15% smaller than the previous 15.3 px labels');
    }
  }
  const d=e.addRect(t.emptyDrawing(),{x:0,y:0},{x:4,y:3},'lawn');
  assert.equal(dimensionScaleResolver(d)({x:0,y:0},{x:4,y:0}),5/8*1.17,'ordinary dimensions use the refined annotation size');
});
test('arrowheads move outside when a span cannot hold them',()=>{
  const roomScale=dimensionScaleResolver(room())(points[0],points[1]);
  for(const px of [36,120,216,360]){
    const scale=roomScale*px/36,a={x:0,y:0},b={x:.06*px,y:0};
    const {outside,markers}=dimensionEndMarkers(a,b,scale);
    assert.equal(outside,true);
    assert.ok(markers[0].arrow[2]<a.x&&markers[1].arrow[2]>b.x);
    assert.ok(Math.abs(Math.abs(markers[0].arrow[2])/scale/5.6-.8)<1e-9,'arrow length shrinks by 20%, independently of text');
    assert.ok(Math.abs(Math.abs(markers[0].arrow[3])/scale/1.84-.8)<1e-9,'arrow width shrinks by 20%');
    assert.ok(markers.every(m=>m.extension));
    assert.equal(dimensionEndMarkers(a,{x:.24*px,y:0},scale).outside,false);
    assert.equal(dimensionEndMarkers(a,{x:.37*px,y:0},scale).outside,false);
  }
});
test('saving an interior dimension or a dimension between figures does not resize their labels',()=>{
  const d=e.addRect(t.emptyDrawing(),{x:0,y:0},{x:2.37,y:1.77},'lawn');
  const a={x:.5,y:.5},b={x:.74,y:.5},scale=dimensionScaleResolver(d)(a,b);
  const saved=e.addDim(d,a,b,.1);
  assert.equal(dimensionScaleResolver(saved)(a,b),scale);
  const linked=e.addDim(saved,{x:0,y:0},{x:20,y:20},.3);
  assert.equal(dimensionScaleResolver(linked)({x:0,y:0},{x:2.37,y:0}),scale);
});
test('SVG export uses the same compact sizes and rotated label positions',()=>{
  const d=room(),svg=projectToSvg({...emptyProject(),drawing:d});
  for(const row of layoutDimensions(d,1,undefined,label).values()){
    const group=svg.match(new RegExp(`<g data-dimension-id="${row.id}">([\\s\\S]*?)</g>`))?.[1];
    assert.ok(group,'every dimension is exported');
    assert.ok(group.includes(`font-size="${12*row.textScale/36}"`));
    assert.ok(group.includes(`rotate(${row.text.angle}`));
  }
});
