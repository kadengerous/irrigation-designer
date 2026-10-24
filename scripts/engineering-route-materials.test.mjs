import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createServer} from 'vite';
let server,load,emptyProject,c,h,m,v,units;
before(async()=>{server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});load=p=>server.ssrLoadModule('/src/'+p);({emptyProject}=await load('lib/project-types.ts'));c=await load('lib/engineering-connections.ts');h=await load('lib/engineering-hydraulics.ts');m=await load('lib/engineering-materials.ts');v=await load('lib/engineering-pipe-display.ts');units=(await load('lib/units.ts')).currentUnits();});
after(async()=>server.close());
const pipe=(id,y=0)=>({id,kind:'pipe',type:'zonePipe',points:[{x:0,y},{x:30,y}],auto:{circuit:'zone:1',captureM:.5},diameterMm:32,number:1,label:true});
const consumer=(id,x,y,zoneId=1)=>({id,kind:'equipment',type:'waterOutlet',x:x+.5,y,size:1,rotation:0,zoneId,flowLpm:10,pressureBar:2,number:1,label:true});
const project=es=>({...emptyProject(),heads:[],engineering:{version:1,categories:{},elements:Object.fromEntries(es.map(e=>[e.id,e])),hydraulics:{staticLiftM:0,additionalLossBar:0,inletPressureBar:0}}});

test('first route keeps consumers when a new, closer line is built, including legacy routes',()=>{
 const p=project([pipe('first'),consumer('a',5,.2)]);const next={...p.engineering,elements:{...p.engineering.elements,second:pipe('second',.19),b:consumer('b',20,.6)}};
 const saved=c.commitAutoConnections(p,next),q={...p,engineering:saved};
 assert.deepEqual(saved.elements.first.auto.consumerIds,['equipment:a']);assert.deepEqual(saved.elements.second.auto.consumerIds,['equipment:b']);
 assert.equal(c.autoConnections(q).get('equipment:a').pipeId,'first');assert.equal(h.inferAutoCircuit(q,[{x:0,y:.2},{x:10,y:.2}],.5),null);
 // A new route is allowed to target a different free zone, not the already-owned first zone.
 q.engineering.elements.c=consumer('c',25,.7,2);assert.equal(h.inferAutoCircuit(q,[{x:0,y:.2},{x:30,y:.2}],.6),'zone:2');
});
test('persistent owners survive moving outside capture distance, file reopen and undo/redo',async()=>{
 const p=project([pipe('first'),consumer('a',10,.2)]);p.engineering=c.pinAutoConnections(p,p.engineering);
 const s=(await load('lib/project-store.ts')).useProject;s.setState({project:p,projects:[],past:[],future:[],pastOps:[],futureOps:[]});
 const moved={...p.engineering.elements.first,points:[{x:0,y:5},{x:30,y:5}]};s.getState().commitEngineering({...p.engineering,elements:{...p.engineering.elements,first:moved}});
 assert.equal(c.autoConnections(s.getState().project).get('equipment:a').pipeId,'first');assert.ok(c.autoConnections(s.getState().project).get('equipment:a').distance>4);
 s.getState().undo();assert.equal(s.getState().project.engineering.elements.first.points[0].y,0);s.getState().redo();assert.equal(s.getState().project.engineering.elements.first.points[0].y,5);
 const {toProjectFile,parseProjectFile}=await load('lib/project-file.ts');const file=toProjectFile({project:s.getState().project});const reopened=parseProjectFile(JSON.stringify(file)).project;
 assert.deepEqual(reopened.engineering.elements.first.auto.consumerIds,['equipment:a']);
 delete reopened.engineering.elements.first;assert.equal(c.autoConnections(reopened).size,0);
});
test('live preview moves actual hydraulic paths and diameter transitions together',()=>{
 const p=project([pipe('p'),consumer('a',10,.2),consumer('b',20,.2),consumer('c',30,.2)]);p.engineering=c.pinAutoConnections(p,p.engineering);
 const old=h.calculateEngineering(p),oldPoints=v.pipeTransitions(old.edges);assert.deepEqual(oldPoints.map(n=>Math.round(n.point.x)),[10,20]);assert.deepEqual(oldPoints[0].diameters,[32,25]);
 const moved={...p,engineering:{...p.engineering,elements:{...p.engineering.elements,p:{...p.engineering.elements.p,points:[{x:0,y:2},{x:30,y:2}]}}}};
 const preview=h.calculateEngineering(moved);assert.ok(preview.edges.filter(e=>!e.branch).every(e=>e.a.y===2&&e.b.y===2));assert.equal(p.engineering.elements.p.points[0].y,0);
 assert.ok(v.pipeStrokeWidth(32)>v.pipeStrokeWidth(25));assert.ok(v.pipeStrokeWidth(25)>v.pipeStrokeWidth(20));assert.ok(v.pipeStrokeWidth(20,true)<v.pipeStrokeWidth(20)/2);
 assert.notEqual(v.engineeringInk(p.engineering.elements.p),v.engineeringInk({...p.engineering.elements.p,auto:{circuit:'zone:2'}}));assert.match(v.engineeringInk({...p.engineering.elements.p,auto:{circuit:'zone:15'}}),/^hsl/);
});
test('pipe lengths are split by diameter, spare added once, no flexible branches counted twice',async()=>{
 const {catalogHeadDefaults}=await load('lib/flow.ts'),{itemById}=await load('lib/hunter-catalog.ts');const item=itemById('MP1000-90');
 const p=project([pipe('p')]);p.heads=[10,20,30].map((x,i)=>({...catalogHeadDefaults(item),id:`h${i}`,catalogId:item.id,x,y:.2,zone:1}));p.engineering=c.pinAutoConnections(p,p.engineering);
 const result=h.calculateEngineering(p),totals=v.pipeTotals(p,result.edges);assert.ok(Math.abs(totals.byDiameter.reduce((n,r)=>n+r.length,0)-30)<1e-7);
 const takeoff=m.engineeringMaterials(p,{...units,length:'m',pipe:'mm'});assert.equal(takeoff.incomplete,false);
 assert.equal(takeoff.rows.filter(r=>r.key.startsWith('saddle:')).reduce((n,r)=>n+r.qty,0),3);
 assert.equal(takeoff.rows.find(r=>r.key.startsWith('flex:')).qty,1.38); // 3 × .40 × 1.15
 assert.ok(Math.abs(takeoff.rows.filter(r=>r.key.startsWith('pipe:')).reduce((n,r)=>n+r.qty,0)-34.5)<.03);
 assert.ok(takeoff.rows.filter(r=>r.key.startsWith('saddle:')).every(r=>r.key.endsWith('½″')));
 const saved=JSON.stringify(p);const imperial=m.engineeringMaterials(p,{...units,length:'ft',pipe:'in'});assert.ok(imperial.rows.find(r=>r.key.startsWith('flex:')).qty>4.5);assert.equal(JSON.stringify(p),saved);
 // No accumulation on repeated opens.
 assert.deepEqual(m.engineeringMaterials(p,{...units,length:'m',pipe:'mm'}),takeoff);
 const {estimateLines}=await load('lib/export-plan.ts');assert.ok(estimateLines(p).some(r=>r.unit===(m.engineeringMaterials(p).rows[0]?.unit)&&r.qty>0&&r.digits===2));
});
test('a sprinkler exactly on a route still has one saddle and one flexible allowance',async()=>{
 const {catalogHeadDefaults}=await load('lib/flow.ts'),{itemById}=await load('lib/hunter-catalog.ts');const item=itemById('PGP-ULTRA');const p=project([pipe('p')]);p.heads=[{...catalogHeadDefaults(item),id:'h',catalogId:item.id,x:15,y:0,zone:1}];
 const r=m.engineeringMaterials(p,{...units,length:'m',pipe:'mm'});assert.equal(r.rows.find(r=>r.key.startsWith('saddle:')).qty,1);assert.match(r.rows.find(r=>r.key.startsWith('saddle:')).key,/¾″$/);assert.equal(r.rows.find(r=>r.key.startsWith('flex:')).qty,.46);
});
