import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createServer} from 'vite';
let server,h,emptyProject;
before(async()=>{server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});h=await server.ssrLoadModule('/src/lib/engineering-hydraulics.ts');({emptyProject}=await server.ssrLoadModule('/src/lib/project-types.ts'));});
after(async()=>server.close());
const pipe=(id,points,circuit='zone:1')=>({id,kind:'pipe',type:circuit==='main'?'main':'zonePipe',points:points.map(([x,y])=>({x,y})),auto:{circuit,captureM:.5},diameterMm:32,number:1,label:true});
const consumer=(id,x,y,zoneId=1,flowLpm=10)=>({id,kind:'equipment',type:'waterOutlet',x:x+.5,y,size:1,rotation:0,zoneId,flowLpm,pressureBar:2,number:1,label:true});
const project=(elements,hydraulics={})=>({...emptyProject(),heads:[],engineering:{version:1,categories:{},elements:Object.fromEntries(elements.map(e=>[e.id,e])),hydraulics:{staticLiftM:0,additionalLossBar:0,inletPressureBar:0,...hydraulics}}});

test('three consumers produce 32 → 25 → 20 and include branch losses without mutating project',()=>{
 const p=project([pipe('p',[[0,0],[30,0]]),consumer('a',10,.2),consumer('b',20,.2),consumer('c',30,.2)]),before=JSON.stringify(p),r=h.calculateEngineering(p);
 assert.deepEqual(r.issues,[]);assert.equal(r.ready,true);assert.equal(r.flow,30);assert.equal(r.connected.length,3);
 assert.deepEqual(r.edges.filter(e=>!e.branch).map(e=>[e.flow,e.diameter]),[[30,32],[20,25],[10,20]]);
 assert.equal(r.edges.filter(e=>e.branch).length,3);assert.ok(r.headM>2*h.BAR_TO_HEAD);assert.equal(JSON.stringify(p),before);
 const direct=h.calculateEngineering(project([pipe('p',[[0,0],[30,0]]),consumer('a',10,0),consumer('b',20,0),consumer('c',30,0)]));assert.ok(r.headM>direct.headM);
});
test('shared main uses peak zone demand or simultaneous sum; tee at a main vertex is not a loop',()=>{
 const es=[pipe('main',[[0,0],[5,0],[10,0]],'main'),pipe('a',[[5,0],[5,10]],'zone:1'),pipe('b',[[5,0],[15,0]],'zone:2'),consumer('c1',5,10,1,20),consumer('c2',15,0,2,15)];
 const sequential=h.calculateEngineering(project(es));assert.deepEqual(sequential.issues,[]);assert.equal(sequential.flow,20);assert.equal(sequential.edges.find(e=>e.pipeId==='main'&&e.a.x===0).flow,20);
 const all=h.calculateEngineering(project(es,{operation:'simultaneous'}));assert.deepEqual(all.issues,[]);assert.equal(all.flow,35);assert.equal(all.edges.find(e=>e.pipeId==='main'&&e.a.x===0).diameter,32);
});
test('nearby other zones are not captured and missing inputs prevent a pump recommendation',()=>{
 const p=project([pipe('p',[[0,0],[10,0]]),consumer('a',5,.1,1),consumer('b',8,.1,2)]);const r=h.calculateEngineering(p);
 assert.deepEqual(r.connected,['equipment:a']);assert.deepEqual(r.unconnected,['equipment:b']);assert.equal(r.headM,null);
 assert.equal(h.inferAutoCircuit(p,[{x:0,y:0},{x:10,y:0}],.5),'zone:2');
 delete p.engineering.elements.b;delete p.engineering.hydraulics.staticLiftM;assert.ok(h.calculateEngineering(p).issues.includes('inputs'));
 p.engineering.hydraulics.staticLiftM=0;assert.equal(h.calculateEngineering(p).ready,true);
});
test('unknown demand never produces an invented diameter or pump duty',()=>{
 const p=project([pipe('p',[[0,0],[10,0]]),consumer('a',10,0)]);delete p.engineering.elements.a.flowLpm;
 const r=h.calculateEngineering(p);assert.ok(r.issues.includes('consumerData'));assert.equal(r.edges[0].diameter,null);assert.equal(r.flow,null);
 assert.equal(r.duties[0].flow,null);assert.equal(r.duties[0].headM,null);
 p.engineering.elements.b=consumer('b',5,0,1,10);
 const mixed=h.calculateEngineering(p);assert.equal(mixed.duties[0].flow,null,'known demand does not hide an unknown consumer');assert.equal(mixed.duties[0].headM,null);
});
test('disconnected routes retain local sizes but block the pump result; loops are rejected',()=>{
 const p=project([pipe('p',[[0,0],[10,0]]),pipe('q',[[20,0],[30,0]]),consumer('a',10,0),consumer('b',30,0,1,30)]);
 const r=h.calculateEngineering(p);assert.ok(r.issues.includes('unconnected'));assert.equal(r.edges.find(e=>e.pipeId==='q').diameter,32);
 p.engineering.elements.p.points=[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:0}];assert.ok(h.calculateEngineering(p).issues.includes('loop'));
});
test('sizing responds to demand edits and removal, and excessive capacity is blocked',()=>{
 const p=project([pipe('p',[[0,0],[10,0]]),consumer('a',10,0,1,30)]);assert.equal(h.calculateEngineering(p).edges[0].diameter,32);
 p.engineering.elements.a.flowLpm=10;assert.equal(h.calculateEngineering(p).edges[0].diameter,20);
 p.engineering.elements.a.flowLpm=10000;assert.ok(h.calculateEngineering(p).issues.includes('capacity'));
 delete p.engineering.elements.a;assert.ok(h.calculateEngineering(p).issues.includes('empty'));
});
test('Hazen–Williams agrees with independent published PVC example within 2%',()=>{
 // Published US formula uses exponent 4.866 versus SI 4.8704; allow 2% for this coefficient variant.
 // Hunter: 500 ft, 50 US gpm, 2.129 inch inside diameter, C150: 7.544 psi.
 const metres=h.pipeLossM(500*.3048,50*3.785411784,2.129*25.4,150),expected=7.544*.70306958;
 assert.ok(Math.abs(metres-expected)/expected<.02,`${metres} vs ${expected}`);
 assert.equal(h.choosePipeDiameter(30),32);assert.equal(h.pipeInsideMm(32),26);
});
test('supply follows the saved route start and ignores both existing and stale legacy source selections',()=>{
 const es=[pipe('p',[[30,0],[0,0]]),consumer('a',10,0),consumer('b',20,0),consumer('c',30,0),{id:'s',kind:'equipment',type:'inlet',x:-.5,y:0,size:1,rotation:0,number:1,label:true}];
 const expected=h.calculateEngineering(project(es));assert.deepEqual(expected.issues,[]);assert.deepEqual(expected.source,{x:30,y:0});assert.equal(expected.flow,30);
 assert.deepEqual(expected.edges.map(e=>[e.flow,e.diameter]),[[20,25],[10,20],[0,20]],'the consumer at the supply origin does not load downstream pipe segments');
 for(const sourceId of ['s','deleted-source'])assert.deepEqual(h.calculateEngineering(project(es,{sourceId})),expected,'legacy source selections cannot move the source or invalidate the calculation');
});
test('real sprinkler catalog demand and pressure drive sizing even when visually hidden',async()=>{
 const {CATALOG}=await server.ssrLoadModule('/src/lib/hunter-catalog.ts'),{catalogHeadDefaults,headFlow}=await server.ssrLoadModule('/src/lib/flow.ts');
 const item=CATALOG.find(i=>i.id==='MP1000')??CATALOG.find(i=>i.nozzles?.length);
 const defaults=catalogHeadDefaults(item);
 const p=project([pipe('p',[[0,0],[10,0]])]);p.heads=[{...defaults,id:'h',catalogId:item.id,x:10,y:0,zone:1,hidden:true}];
 const cs=h.waterConsumers(p);assert.equal(cs.length,1);assert.equal(cs[0].flow,headFlow(p.heads[0]).lpm);assert.ok(cs[0].flow>0);
 const r=h.calculateEngineering(p);assert.deepEqual(r.connected,['head:h']);assert.equal(r.flow,cs[0].flow);
 p.heads[0].zone=2;assert.deepEqual(h.calculateEngineering(p).unconnected,['head:h']);
});
