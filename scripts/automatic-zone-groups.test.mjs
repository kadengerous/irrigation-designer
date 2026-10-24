import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
let server,load;
before(async()=>{server=await createServer({server:{middlewareMode:true,hmr:false}});load=p=>server.ssrLoadModule('/src/'+p);});
after(async()=>server.close());
const placed=(fit,id='peer')=>({...fit,id,x:0,y:0,zone:1,locked:false});

test('declared matched families share zones without the former arbitrary precipitation bins',async()=>{
 const {itemById}=await load('lib/equipment-catalog.ts'),{performanceAt}=await load('lib/flow.ts'),{hydroKey,assignZoneForNewHead}=await load('lib/hydro.ts'),{emptyProject}=await load('lib/project-types.ts');
 const make=(id,arc,bar,nozzleId)=>{const item=itemById(id);nozzleId??=item.nozzles[0].id;const row=performanceAt(item,nozzleId,bar,arc).row;return placed({catalogId:id,nozzleId,r:row.radiusM,arc,start:0,designPressure:bar,bodyId:id,needsReview:false},id);};
 const standard=make('MP1000-90',90,2.8),large=make('MP2000-90',180,2.8),fast=make('MP800SR-90',90,2.8);
 assert.equal(hydroKey(standard),hydroKey(large));assert.notEqual(hydroKey(standard),hydroKey(fast));
 const rotary=make('rain-bird:R-VAN14',180,3.1),mpr=make('rain-bird:5004-PC',180,3.1,'rain-bird:5000-MPR-25:Half');
 assert.equal(hydroKey(rotary),hydroKey(mpr),'R-VAN and correctly configured 5000 MPR share manufacturer-declared rate');
 const lowRotor=make('rain-bird:5004-PC',120,1.7,'rain-bird:5000-MPR-30:Third'),lowRotary=make('rain-bird:R-VAN18',45,2.4);
 assert.notEqual(hydroKey(lowRotor),hydroKey(lowRotary),'non-nominal MPR settings cannot inherit a shared pressure-band label');
 const highRotor=make('rain-bird:5004-PC',180,4.5,'rain-bird:5000-MPR-30:Half'),highRotary=make('rain-bird:R-VAN18',270,3.4);
 assert.notEqual(hydroKey(highRotor),hydroKey(highRotary));
 assert.notEqual(hydroKey(rotary),hydroKey({...mpr,arc:90}),'changing a fixed-discharge MPR nozzle to the wrong arc breaks the match');
 const project={...emptyProject(),heads:[rotary]};
 assert.equal(assignZoneForNewHead(project,mpr,1,100).zoneId,1);
 assert.notEqual(assignZoneForNewHead(project,{...mpr,arc:90},1,100).zoneId,1);
});

test('5000 MPR automatic selection keeps every nozzle at its published design arc',async()=>{
 const {automaticHeadCatalog,selectAutomaticHead,selectAutomaticRadius}=await load('lib/automatic-head.ts');
 const item=automaticHeadCatalog('rain-bird','rvan').find(i=>i.id==='rain-bird:5004-PC');
 for(const nozzle of item.nozzles){
  const row=nozzle.performance[0],catalog=[{...item,nozzles:[nozzle]}];
  const fit=selectAutomaticHead(row.radiusM,nozzle.designArcDeg,row.pressureBar,catalog);
  assert.ok(fit,nozzle.id);assert.equal(fit.nozzleId,nozzle.id);
  assert.equal(selectAutomaticHead(row.radiusM,137,row.pressureBar,catalog),null);
  const radiusFit=selectAutomaticRadius(row.radiusM,row.pressureBar,catalog);
  assert.ok(radiusFit,nozzle.id);assert.equal(radiusFit.arc,nozzle.designArcDeg,'radius preview includes third-circle MPR sectors');
 }
});

test('rotor compatibility uses the requested arc during radius-preview caching',async()=>{
 const {itemById}=await load('lib/equipment-catalog.ts'),{selectAutomaticHead,selectAutomaticRadius}=await load('lib/automatic-head.ts');
 const item=itemById('toro:T5HP-RS'),nozzle=item.nozzles.find(n=>n.id==='2.0'),row=nozzle.performance.find(r=>r.arcDeg===180)??nozzle.performance[0];
 const catalog=[{...item,nozzles:[nozzle]}];
 const peer=placed(selectAutomaticHead(row.radiusM,90,row.pressureBar,catalog));
 assert.equal(selectAutomaticHead(row.radiusM,180,row.pressureBar,catalog,[peer]),null,'half circle has different application rate at the same discharge');
 const preview=selectAutomaticRadius(row.radiusM,row.pressureBar,catalog,[peer]);
 assert.ok(preview);assert.equal(preview.arc,90,'cached half-circle candidate cannot falsely match a quarter-circle zone');
});

test('K-Rain RPS Select observes all four manufacturer nozzle/arc bands',async()=>{
 const {itemById}=await load('lib/equipment-catalog.ts'),{selectAutomaticHead}=await load('lib/automatic-head.ts');
 const item=itemById('k-rain:RPS-Select');
 for(const [number,min,max] of [[1,40,135],[2,136,225],[3,226,315],[4,316,360]]){
  const nozzle=item.nozzles.find(n=>n.id.endsWith(`standard-${number}.0`)),row=nozzle.performance[0],catalog=[{...item,nozzles:[nozzle]}];
  for(const arc of [min,max])assert.ok(selectAutomaticHead(row.radiusM,arc,row.pressureBar,catalog),`${number} / ${arc}`);
  if(min>40)assert.equal(selectAutomaticHead(row.radiusM,min-1,row.pressureBar,catalog),null);
  if(max<360)assert.equal(selectAutomaticHead(row.radiusM,max+1,row.pressureBar,catalog),null);
 }
});

test('MPR manual placement keeps the selected group nozzle and does not leak standard rack defaults',async()=>{
 const {useProject}=await load('lib/project-store.ts'),{emptyProject}=await load('lib/project-types.ts'),{itemById}=await load('lib/equipment-catalog.ts');
 useProject.setState({project:emptyProject(),equipmentFilters:{manufacturerId:'rain-bird'},familyFilter:'rvan',activeZoneId:1,placeId:'rain-bird:5004-PC'});
 useProject.getState().placeHead({x:0,y:0});
 const head=useProject.getState().project.heads[0],nozzle=itemById(head.catalogId).nozzles.find(n=>n.id===head.nozzleId);
 assert.equal(nozzle.type,'MPR');assert.equal(head.arc,nozzle.designArcDeg);
 useProject.setState({project:emptyProject(),familyFilter:'rotor',activeZoneId:1});
 useProject.getState().placeHead({x:0,y:0});
 const standard=useProject.getState().project.heads[0];assert.notEqual(itemById(standard.catalogId).nozzles.find(n=>n.id===standard.nozzleId).type,'MPR');
});


test('radius preview finds a compatible nonstandard existing sector',async()=>{
 const {automaticHeadCatalog,selectAutomaticHead,selectAutomaticRadius}=await load('lib/automatic-head.ts');
 const catalog=automaticHeadCatalog('rain-bird','van');
 const head=selectAutomaticHead(1.2,137,2.1,catalog);assert.ok(head);
 const peers=[placed(head)];
 assert.ok(selectAutomaticHead(1.2,137,2.1,catalog,peers));
 const preview=selectAutomaticRadius(1.2,2.1,catalog,peers);assert.ok(preview);
 assert.ok(selectAutomaticHead(1.2,preview.arc,2.1,catalog,peers));
});
