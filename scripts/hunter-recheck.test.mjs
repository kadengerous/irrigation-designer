import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createServer} from 'vite';

let server,cat,flow,auto,store,adjust,coverage,water,emptyProject,sector;
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
const head=(item,patch={})=>({...flow.catalogHeadDefaults(item),id:'audit-head',catalogId:item.id,x:0,y:0,start:315,zone:1,locked:false,...patch});
before(async()=>{
 server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 const load=name=>server.ssrLoadModule('/src/lib/'+name+'.ts');
 [cat,flow,auto,store,adjust,coverage,water,{emptyProject},sector]=await Promise.all(['equipment-catalog','flow','automatic-head','project-store','head-adjustment','coverage','watering-preview','project-types','head-sector-edit'].map(load));
});
after(async()=>server.close());

test('Hunter audit: every active table row survives manual settings and every eligible row can be automatically selected',()=>{
 let rows=0,automatic=0,excluded=0;
 for(const item of cat.placeableCatalog().filter(i=>i.manufacturerId==='hunter'))for(const nozzle of item.nozzles)for(const row of nozzle.performance){
  rows++;
  const arc=cat.clampArc(item,row.arcDeg),label=`${item.id}/${nozzle.id}/${row.pressureBar}/${arc}`;
  if(row.pressureBar<item.recommendedPressureMin||row.pressureBar>item.recommendedPressureMax){
   // Hunter prints two I-80-ON/23 rows below its own 65 psi operating minimum.
   assert.equal(item.id,'I-80-ON');assert.equal(nozzle.id,'i80-23');assert.ok([3.4,4.1].includes(row.pressureBar));
   assert.equal(flow.performanceAt(item,nozzle.id,row.pressureBar,arc),null,label);
   assert.equal(auto.selectAutomaticHead(row.radiusM,arc,row.pressureBar,[{...item,nozzles:[nozzle]}]),null,label);
   excluded++;continue;
  }
  const range=flow.radiusRange(item,nozzle.id,row.pressureBar,arc);
  const initial=head(item,{nozzleId:nozzle.id,arc,designPressure:row.pressureBar,r:row.radiusM,
   ...(cat.mountingKind(item)==='spray'?{bodyId:'PRO-SPRAY',popUpMm:100}:{})});
  const edited=store.updateHeadSettings(initial,{nozzleId:nozzle.id,arc,designPressure:row.pressureBar,r:row.radiusM});
  near(edited.designPressure,row.pressureBar,label+' pressure');near(edited.r,row.radiusM,label+' full throw');
  near(flow.headFlow(edited).lpm,row.flowLMin,label+' flow');
  if(range){
   const reduced=store.updateHeadSettings(edited,{nozzleId:nozzle.id,r:range.min});
   near(reduced.r,range.min,label+' reduction');assert.ok(flow.headFlow(reduced).lpm>0,label);
   assert.ok(flow.operatingGeometryAvailable(item,reduced),label);
  }
  if(!auto.automaticCandidateSupported(item))continue;
  const single={...item,nozzles:[nozzle]};
  for(const radius of [...new Set([range.min,range.max])]){
   const fit=auto.selectAutomaticHead(radius,arc,row.pressureBar,[single]);
   assert.ok(fit,label+' automatic');near(fit.r,radius,label);near(fit.arc,arc,label);
   assert.ok(fit.designPressure<=row.pressureBar+1e-8,label+' cannot boost pressure');
   assert.ok(flow.operatingGeometryAvailable(item,fit),label);automatic++;
  }
 }
 assert.equal(rows,1377);assert.equal(excluded,2);assert.ok(automatic>1500);
});

test('official Hunter corrections: corner strips are 90 degrees and Pro HE uses the corrected cutsheet cells',()=>{
 for(const id of ['MP-LCS-515','MP-RCS-515']){
  const item=cat.itemById(id);assert.deepEqual([item.arcMin,item.arcMax],[90,90]);
  assert.ok(item.nozzles.every(n=>n.performance.every(row=>row.arcDeg===90)));
  assert.equal(auto.automaticCandidateSupported(item),false);assert.ok(item.strip);
 }
 assert.deepEqual([cat.itemById('MP-SS-530').arcMin,cat.itemById('MP-SS-530').arcMax],[180,180]);
 near(flow.performanceAt(cat.itemById('8A-HE'),'8A-HE',2.8,360).row.flowLMin,1.36*3.785411784,'8A-HE PDF flow');
 for(const [id,bar,arc,inch] of [['10A-HE',1.4,270,1.92],['10A-HE',1.7,270,2.13],['17A-HE',2.8,360,2.04]])
  near(flow.performanceAt(cat.itemById(id),id,bar,arc).row.precipTriangleMmH,inch*25.4,id+' PDF triangular precipitation');
});

test('pressure-specific reduction uses the screw limit instead of the smallest unreduced catalog radius',()=>{
 for(const id of ['PGJ','SRM','PGP-ADJ','PGP-ULTRA','I-20','I-20-SS','4A','6A','10A-HE','5Q','2Q']){
  const item=cat.itemById(id),nozzle=item.nozzles[0],row=nozzle.performance.find(r=>r.pressureBar>=item.recommendedPressureMin),arc=cat.clampArc(item,row.arcDeg);
  const range=flow.radiusRange(item,nozzle.id,row.pressureBar,arc);
  near(range.min,row.radiusM*.75,id);near(range.max,row.radiusM,id);
  const h=head(item,{nozzleId:nozzle.id,bodyId:cat.mountingKind(item)==='spray'?'PRO-SPRAY':item.id,designPressure:row.pressureBar,arc,r:range.min});
  const edited=store.updateHeadSettings(h,{nozzleId:nozzle.id,r:range.min});near(edited.r,range.min,id+' edit');
  const snapped=sector.sectorSnapPatch(h,'radius',{},sector.sectorPoint(h,range.min,h.start+h.arc/2),item);
  assert.ok(snapped,id+' endpoint snap');near(snapped.r,range.min,id);
 }
 const pgj=cat.itemById('PGJ');near(flow.radiusRange(pgj,pgj.nozzles[0].id,2.8,90).min,15*.3048*.75,'PGJ 0.50 at 40 psi');
 for(const item of cat.placeableCatalog().filter(i=>i.manufacturerId==='hunter'&&i.family==='mp800'))for(const n of item.nozzles)for(const row of n.performance){
  if(row.radiusMinM==null)continue;
  near(flow.radiusRange(item,n.id,row.pressureBar,row.arcDeg).min,row.radiusMinM,item.id+' published MP800SR minimum');
 }
});

test('I-80 and large rotors without a published reduction limit use nozzle/pressure throw, never a universal 25 percent screw',()=>{
 for(const id of ['I-80','I-80-SS','I-80-ON','I-25','I-25-SS','I-40','I-40-SS','I-40-ON','I-90','I-90-36V','G-70-B','G-75-B','G-80-B','G-85-B','ST-90','STG-900','ST-1600']){
  const item=cat.itemById(id),nozzle=item.nozzles[0],row=nozzle.performance.find(r=>r.pressureBar>=item.recommendedPressureMin),arc=cat.clampArc(item,row.arcDeg);
  assert.equal(item.radiusAdjustment.minimumRatio,1,id);
  const range=flow.radiusRange(item,nozzle.id,row.pressureBar,arc);near(range.min,row.radiusM,id);near(range.max,row.radiusM,id);
  assert.equal(auto.selectAutomaticHead(row.radiusM*.9,arc,row.pressureBar,[{...item,nozzles:[nozzle]}]),null,id+' unsupported reduction');
  assert.ok(auto.selectAutomaticHead(row.radiusM,arc,row.pressureBar,[{...item,nozzles:[nozzle]}]),id+' nominal throw');
 }
});

test('manual pressure, live dragging and inspector bounds respect all Hunter PRS30/PRS40 bodies',()=>{
 const item=cat.itemById('MP1000-90');
 for(const body of cat.bodiesFor(item).filter(b=>b.regulatedPressureBar!=null)){
  const initial=head(item,{bodyId:body.id,popUpMm:body.popUpMm});
  const changed=store.updateHeadSettings(initial,{designPressure:3.8});
  near(changed.designPressure,body.regulatedPressureBar,body.id);near(adjust.headParameterRanges(item,changed).pressure.max,body.regulatedPressureBar,body.id);
  assert.ok(flow.headPressureSteps(item,changed).every(bar=>bar<=body.regulatedPressureBar));
  near(changed.r,flow.performanceAt(item,changed.nozzleId,changed.designPressure,changed.arc).row.radiusM,body.id+' dependent radius');
  store.useProject.setState({project:{...emptyProject(),heads:[initial]},past:[],future:[],pastOps:[],futureOps:[]});
  store.useProject.getState().beginHeadEdit();store.useProject.getState().patchHeadLive(initial.id,{designPressure:3.8});store.useProject.getState().endHeadEdit();
  near(store.useProject.getState().project.heads[0].designPressure,body.regulatedPressureBar,body.id+' live');
  store.useProject.getState().undo();assert.deepEqual(store.useProject.getState().project.heads[0],JSON.parse(JSON.stringify(initial)));
 }
 const ordinary=store.updateHeadSettings(head(item,{bodyId:'PRO-SPRAY'}),{designPressure:3.8});near(ordinary.designPressure,3.8,'ordinary body');
 const low=store.updateHeadSettings(head(cat.itemById('4A'),{bodyId:'PRS30'}),{designPressure:1.7});near(low.designPressure,1.7,'regulation must not boost a lower working pressure');
});

test('Hunter simulation cannot show unsupported pressure, nozzle, sector or radius as valid coverage',()=>{
 const item=cat.itemById('MP1000-90'),valid=head(item);
 assert.notEqual(water.wateringProfile(valid).kind,'unknown');
 for(const patch of [{designPressure:.1},{designPressure:100},{nozzleId:'nonexistent'},{arc:77},{r:100},{r:.1}]){
  const invalid={...valid,...patch};assert.equal(flow.operatingGeometryAvailable(item,invalid),false,JSON.stringify(patch));
  assert.equal(water.wateringProfile(invalid).kind,'unknown');assert.equal(coverage.headCovers(invalid,{x:.1,y:0}),false);
 }
});

test('Hunter stream bubblers animate individual jets without claiming a solid wetted sector',async()=>{
 const {headSurface}=await server.ssrLoadModule('/src/lib/irrigation-geometry.ts');
 const models=cat.placeableCatalog().filter(i=>i.manufacturerId==='hunter'&&(i.id.startsWith('MSBN-')||i.id==='5-CST-B'));
 assert.equal(models.length,9);
 for(const item of models){
  assert.equal(item.coverageKind,'streams');const h=head(item);
  assert.ok(['streams','dual'].includes(water.wateringProfile(h).kind),item.id);
  assert.deepEqual(headSurface(h),[],item.id);assert.equal(coverage.headCovers(h,{x:h.r*.5,y:0}),false,item.id);
  assert.ok(flow.headFlow(h).lpm>0,item.id);assert.equal(auto.automaticCandidateSupported(item),false,item.id);
 }
});

test('MSBN-V uses the published six-inch height exception without inventing a height curve or altering saved snapshots',()=>{
 for(const [id,feet] of [['MSBN-25V',2],['MSBN-50V',3]]){
  const item=cat.itemById(id),initial=head(item,{popUpMm:100,equipmentSnapshot:cat.equipmentSnapshot(item)}),flowBefore=flow.headFlow(initial).lpm;
  const tall=store.updateHeadSettings(initial,{bodyId:'PROS-06'});
  near(tall.r,feet*.3048,id+' six-inch throw');near(flow.headFlow(tall).lpm,flowBefore,id+' constant discharge');
  assert.equal(tall.popUpMm,150);assert.equal(water.wateringProfile(tall).kind,'dual');
  near(store.updateHeadSettings(tall,{bodyId:'PRO-SPRAY'}).r,item.rNom,id+' restore four-inch throw');
  assert.equal(initial.equipmentSnapshot.rNom,item.rNom,'derived lookup does not mutate snapshot');
  const old=cat.equipmentSnapshot(item);delete old.radiusByPopUpMm;
  near(cat.catalogForHead({...initial,popUpMm:150,equipmentSnapshot:old}).rNom,item.rNom,'old saved definition remains authoritative');
  const imported=store.migrateProject({...emptyProject(),heads:[{...tall,equipmentSnapshot:undefined}]}).heads[0];
  near(store.updateHeadSettings(imported,{bodyId:'PRO-SPRAY'}).r,item.rNom,'import captures the base catalog, not its derived six-inch throw');
 }
});

test('sector endpoint snapping validates the resulting arc rather than the previous one',()=>{
 const item=cat.itemById('MP2000-90'),h=head(item,{arc:90,start:0,r:6.096,designPressure:2.8});
 const range=flow.radiusRange(item,h.nozzleId,h.designPressure,93);
 assert.equal(sector.sectorSnapPatch(h,'end',{arc:90},sector.sectorPoint(h,h.r,93),item),null,'old radius is too large for snapped 93 degrees');
 const patch=sector.sectorSnapPatch(h,'end',{arc:90},sector.sectorPoint(h,range.min,93),item);
 assert.ok(patch);near(patch.arc,93,'snapped arc');near(patch.r,range.min,'snapped radius');
 const stored=store.updateHeadSettings(h,patch);near(stored.r,range.min,'store agrees with target');
});

test('legacy pressure above a PRS regulator is retained for review without invented flow or watering',()=>{
 const item=cat.itemById('MP1000-90'),h=head(item,{bodyId:'PRS30',popUpMm:100,designPressure:3.8,r:4.572,equipmentSnapshot:cat.equipmentSnapshot(item)});
 const migrated=store.migrateProject({...emptyProject(),heads:[h]}).heads[0];
 near(migrated.designPressure,3.8,'load preserves saved pressure');near(migrated.r,h.r,'load preserves saved geometry');
 assert.equal(migrated.needsReview,true);assert.equal(flow.headFlow(migrated).lpm,null);
 assert.equal(flow.operatingGeometryAvailable(item,migrated),false);assert.equal(water.wateringProfile(migrated).kind,'unknown');
 assert.equal(store.updateHeadSettings(migrated,{start:40}).needsReview,true);
 const corrected=store.updateHeadSettings(migrated,{designPressure:2.1});
 assert.equal(corrected.needsReview,false);assert.ok(flow.headFlow(corrected).lpm>0);
});
