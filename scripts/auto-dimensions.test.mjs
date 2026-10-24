import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
let server, engine, automaticDimensions, emptyDrawing, emptyProject, coverage;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false } });
  engine = await server.ssrLoadModule("/src/lib/cad/engine.ts");
  ({ automaticDimensions } = await server.ssrLoadModule("/src/lib/cad/auto-dimensions.ts"));
  ({ emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts"));
  ({ emptyProject } = await server.ssrLoadModule("/src/lib/project-types.ts"));
  coverage = await server.ssrLoadModule("/src/lib/coverage-display.ts");
});
after(async () => { await server?.close(); });
test("plan: editable persistent edge dimensions, repeat without duplicates, linked geometry", () => {
  const p = { ...emptyProject(), drawing: engine.addRect(emptyDrawing(), {x:0,y:0}, {x:10,y:6}, "lawn") };
  const d = automaticDimensions(p,"plan");
  assert.equal(Object.keys(d.dims).length,4);
  const dim = Object.values(d.dims)[0];
  dim.label = "Custom name"; dim.offset = 1.25;
  const repeat = automaticDimensions({...p,drawing:d},"plan");
  assert.deepEqual(repeat.dims,d.dims);
  const reopened = JSON.parse(JSON.stringify(repeat));
  reopened.vertices[dim.aId].x += 2;
  assert.equal(engine.resolveDim(reopened,dim).a.x, dim.a.x+2);
});
test("curves receive useful axes, not tessellated segment dimensions", () => {
  const p = { ...emptyProject(), drawing: engine.addCircle(emptyDrawing(), {x:5,y:5}, 3,"lawn") };
  const d = automaticDimensions(p,"plan");
  assert.equal(Object.keys(d.dims).length,1);
  const dim = Object.values(d.dims)[0], f = d.faces[dim.faceAxis.id];
  f.circle.r = 5;
  const {a,b} = engine.resolveDim(d,dim);
  assert.equal(Math.hypot(a.x-b.x,a.y-b.y),10);
});
test('sprinkler dimensions are restricted to irrigation contours',async()=>{
  const {irrigationFigures}=await server.ssrLoadModule('/src/lib/irrigation-figures.ts');
  const {displayedDimensions}=await server.ssrLoadModule('/src/lib/cad/sprinkler-dimensions.ts');
  for(const type of ['lawn','site','no_irrigation']){
    const drawing=engine.addRect(emptyDrawing(),{x:0,y:0},{x:12,y:8},type);
    const project={...emptyProject(),drawing,heads:[{id:'a',x:0,y:0},{id:'b',x:6,y:0},{id:'c',x:12,y:0}]};
    const result=automaticDimensions(project,'irrigation');
    const dims=displayedDimensions(result,'irrigation');
    assert.equal(dims.length,type==='lawn'?2:0,type);
    assert.ok(dims.every(d=>d.a.y===0&&d.b.y===0&&Math.abs(d.a.x-d.b.x)===6),type);
    assert.equal(irrigationFigures(result).length,type==='lawn'?1:0,'measurement never changes watering eligibility');
    assert.deepEqual(engine.drawingOrMigrate(JSON.parse(JSON.stringify({...project,drawing:result}))).dims,result.dims);
  }
});
test('a shared boundary sprinkler participates in both adjacent figure chains without duplicate dimensions',()=>{
  let drawing=engine.addRect(emptyDrawing(),{x:0,y:0},{x:12,y:8},'lawn');
  drawing=engine.addRect(drawing,{x:12,y:0},{x:16,y:8},'lawn');
  const project={...emptyProject(),drawing,heads:[0,6,12,16].map((x,i)=>({id:`h${i}`,x,y:0}))};
  const result=automaticDimensions(project,'irrigation');
  const pairs=Object.values(result.dims).map(d=>[d.a.x,d.b.x].sort((a,b)=>a-b).join(':')).sort();
  assert.deepEqual(pairs,['0:6','12:16','6:12']);
  assert.deepEqual(automaticDimensions({...project,drawing:result},'irrigation').dims,result.dims);
  assert.deepEqual(engine.drawingOrMigrate(JSON.parse(JSON.stringify({...project,drawing:result}))).dims,result.dims);
});
test("sprinkler dimensions: adjacent exterior chains, two real boundary offsets, live updates and manual edits", () => {
  let drawing=engine.addRect(emptyDrawing(),{x:0,y:0},{x:12,y:8},'lawn');
  drawing=engine.addRect(drawing,{x:20,y:0},{x:30,y:8},'lawn');
  drawing.dims={manual:{id:'manual',a:{x:2,y:2},b:{x:7,y:4},offset:1,label:'Custom'}};
  const p = {...emptyProject(),drawing,heads:[{id:"a",x:0,y:0},{id:"b",x:3,y:0},{id:"c",x:8,y:0},{id:"d",x:12,y:0},{id:'inside',x:9,y:3},{id:'other',x:20,y:0}]};
  const d = automaticDimensions(p,"irrigation");
  assert.equal(Object.keys(d.dims).length,6);
  assert.deepEqual(automaticDimensions({...p,drawing:d},"irrigation").dims,d.dims);
  const dims=Object.values(d.dims),chains=dims.filter(v=>v.autoKey?.includes(':side:'));
  assert.equal(chains.length,3);
  for(const dim of chains){assert.equal(dim.a.y,0);assert.equal(dim.b.y,0);assert.ok(dim.offset<0,'dimension is above the top side');}
  const interior=dims.filter(v=>v.autoKey?.includes(':inside:'));assert.equal(interior.length,2);
  assert.ok(interior.every(dim=>!!dim.aHeadId!==!!dim.bHeadId),'interior dimensions join a boundary and sprinkler');
  const edited=chains[0];d.dims[edited.id]={...edited,offset:-2,label:'Edited'};
  const moved = JSON.parse(JSON.stringify({...p,drawing:d}));
  moved.heads[1].x = 4;
  const resolved = engine.drawingOrMigrate(moved);
  assert.equal(resolved.dims[edited.id].b.x,4);assert.equal(resolved.dims[edited.id].offset,-2);assert.equal(resolved.dims[edited.id].label,'Edited');
  const removed = engine.drawingOrMigrate({...moved,heads:moved.heads.filter(h=>h.id!=='b')});
  assert.equal(Object.values(removed.dims).filter(v=>v.autoKey?.includes(':side:')).length,1,'opening a project with missing heads never creates dimensions');
  assert.deepEqual(removed.dims.manual,drawing.dims.manual);
  const added=engine.drawingOrMigrate({...moved,heads:[...moved.heads,{id:'new',x:10,y:0}]});
  assert.equal(Object.values(added.dims).filter(v=>v.autoKey?.includes(':side:')).length,3,'new heads wait for the explicit command');
  const suppressed=engine.deleteDimension(d,edited.id);
  assert.ok(!engine.drawingOrMigrate({...p,drawing:suppressed}).dims[edited.id]);
  assert.equal(Object.keys(d.dims).length,6,"source is immutable");
});
test('one click is one generation, including empty results, new heads and reopened older files',()=>{
  let p={...emptyProject(),drawing:engine.addRect(emptyDrawing(),{x:0,y:0},{x:12,y:8},'lawn'),heads:[{id:'a',x:0,y:0}]};
  p.drawing=automaticDimensions(p,'irrigation');
  assert.equal(Object.keys(p.drawing.dims).length,0);
  p={...p,heads:[...p.heads,{id:'b',x:12,y:0}]};
  assert.equal(Object.keys(engine.drawingOrMigrate(p).dims).length,0,'placing a second sprinkler must not add a dimension');
  p.drawing=automaticDimensions(p,'irrigation');
  const existing=Object.values(p.drawing.dims)[0];assert.ok(existing);
  p.drawing.dims[existing.id]={...existing,offset:-2,label:'Edited'};
  const before=structuredClone(p.drawing.dims);
  p={...p,heads:[...p.heads,{id:'between',x:6,y:0},{id:'inside',x:6,y:4}]};
  assert.deepEqual(engine.drawingOrMigrate(p).dims,before,'no new dimensions or splitting of the existing chain');
  p=JSON.parse(JSON.stringify(p));
  assert.deepEqual(engine.drawingOrMigrate(p).dims,before,'save/reopen is not generation');
  const legacy=JSON.parse(JSON.stringify(p));delete legacy.drawing.irrigationDimensions.headIds;
  assert.deepEqual(engine.drawingOrMigrate(legacy).dims,before,'older projects also wait for the button');
  const moved={...p,heads:p.heads.map(h=>h.id==='b'?{...h,x:11}:h)};
  const updated=engine.drawingOrMigrate(moved).dims[existing.id];
  assert.equal(updated.b.x,11);assert.equal(updated.offset,-2);assert.equal(updated.label,'Edited');
  p.drawing=automaticDimensions(p,'irrigation');
  assert.equal(Object.keys(p.drawing.dims).length,4,'the next click includes the new contour and interior sprinklers');
  assert.deepEqual(automaticDimensions(p,'irrigation').dims,p.drawing.dims,'repeated clicks do not create duplicates');
});
test("coverage switch is independent, project-scoped and reversible", () => {
  const store = coverage.useCoverageDisplay;
  store.getState().toggle("a"); assert.equal(store.getState().projectId,"a");
  store.getState().toggle("a"); assert.equal(store.getState().projectId,null);
  store.getState().toggle("b"); assert.equal(store.getState().projectId,"b");
});
test("new controls translated in every supported language", async () => {
  for(const locale of ["en","ru","es","pt-BR","fr","it","de","ar","tr","pl","zh-CN","nl","cs","el","hu","ro","sk","he","uk","ja"]) {
    const dictionary = JSON.parse(await readFile(`src/lib/locales/${locale}.json`,"utf8"));
    for (const key of ["autoDimensionsPlan","autoDimensionsIrrigation","coverageDisplay"]) assert.ok(dictionary[key]?.length,`${locale}: ${key}`);
  }
});

test('split straight top, slightly offset heads and recessed step receive unique contour dimensions',()=>{
 const points=[{x:0,y:0},{x:5,y:0},{x:10,y:0},{x:10,y:10},{x:6,y:10},{x:6,y:8},{x:4,y:8},{x:4,y:10},{x:0,y:10}];
 const drawing=engine.addChain(emptyDrawing(),points,true,'lawn',false);
 const heads=[{id:'tl',x:0,y:.01},{id:'tr',x:10,y:.01},{id:'bl',x:0,y:10},{id:'br',x:10,y:10}];
 const p={...emptyProject(),drawing,heads};
 const d=automaticDimensions(p,'irrigation'),dims=Object.values(d.dims);
 assert.ok(dims.some(v=>v.a.y===.01&&v.b.y===.01&&Math.abs(v.a.x-v.b.x)===10),'top chain survives collinear vertices');
 const steps=dims.filter(v=>v.autoKey.includes(':step:'));
 assert.equal(steps.length,0,'no dimensions to figure corners');
 assert.ok(dims.every(dim=>heads.some(h=>h.id===dim.aHeadId)&&heads.some(h=>h.id===dim.bHeadId)));
 assert.ok(steps.every(v=>v.a.x===v.b.x||v.a.y===v.b.y),'no diagonal across a corner');
 assert.equal(dims.filter(v=>v.autoKey.includes(':inside:')).length,0);
 assert.equal(new Set(dims.map(v=>[JSON.stringify(v.a),JSON.stringify(v.b)].sort().join('|'))).size,dims.length);
 assert.deepEqual(automaticDimensions({...p,drawing:d},'irrigation').dims,d.dims);
 assert.deepEqual(engine.drawingOrMigrate({...p,drawing:d,heads:[...heads,{id:'new',x:5,y:3}]}).dims,d.dims,'new head waits for another command');
});

test('interior datum prefers perpendicular straight boundary over nearer slope',async()=>{
 const {sprinklerDatum}=await server.ssrLoadModule('/src/lib/cad/sprinkler-dimensions.ts');
 const figure={id:'trapezoid',points:[{x:0,y:0},{x:12,y:0},{x:12,y:10},{x:4,y:10}],holes:[]};
 assert.deepEqual(sprinklerDatum({x:5,y:6},figure,'x'),{x:12,y:6});
 assert.deepEqual(sprinklerDatum({x:5,y:6},figure,'y'),{x:5,y:10});
 const concave={id:'step',points:[{x:0,y:0},{x:12,y:0},{x:12,y:10},{x:8,y:10},{x:8,y:4},{x:4,y:4},{x:4,y:10},{x:0,y:10}],holes:[]};
 assert.deepEqual(sprinklerDatum({x:3,y:7},concave,'x'),{x:4,y:7},'stop at actual first boundary, not distant bounding box');
});

test('stale deleted-head references never regenerate dimensions on reopen or unrelated deletion',async()=>{
 const {resolveSprinklerDimensions}=await server.ssrLoadModule('/src/lib/cad/sprinkler-dimensions.ts');
 const heads=[{id:'a',x:0,y:0},{id:'b',x:4,y:0},{id:'c',x:8,y:0},{id:'d',x:12,y:0},{id:'inner',x:6,y:4}];
 const p={...emptyProject(),heads,drawing:engine.addRect(emptyDrawing(),{x:0,y:0},{x:12,y:8},'lawn')};
 const drawing=automaticDimensions(p,'irrigation');
 // Older files may retain participant IDs after removal and omit dimensions
 // without recording a suppression entry. Absence must remain authoritative.
 for(const dim of Object.values(drawing.dims))if(dim.autoKey.includes(':inside:'))delete drawing.dims[dim.id];
 drawing.irrigationDimensions.headIds.push('previously-deleted');
 const reopened=engine.drawingOrMigrate(JSON.parse(JSON.stringify({...p,drawing})));
 assert.deepEqual(reopened.dims,drawing.dims);
 const deleted=resolveSprinklerDimensions(drawing,heads.filter(h=>h.id!=='b'),false,['b']);
 assert.deepEqual(Object.values(deleted).map(d=>[d.a.x,d.b.x]),[[0,8],[8,12]]);
 const empty={...drawing,dims:{}};
 assert.deepEqual(engine.drawingOrMigrate({...p,drawing:empty}).dims,{});
 assert.deepEqual(resolveSprinklerDimensions(empty,heads.filter(h=>h.id!=='b'),false,['b']),{});
});
