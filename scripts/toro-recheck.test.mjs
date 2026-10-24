import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createServer} from 'vite';

let server,cat,flow,auto,store,hydro,adjust,water,coverage,geometry,emptyProject,diagnostics;
const near=(actual,expected,label,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} != ${expected}`);
const pressure30=2.068427;
const head=(item,patch={})=>({...flow.catalogHeadDefaults(item),id:'toro-audit',catalogId:item.id,x:0,y:0,start:23,zone:1,locked:false,...patch});
const reset=(heads=[])=>store.useProject.setState({project:{...emptyProject(),heads},equipmentFilters:{manufacturerId:'toro'},familyFilter:'precision',activeZoneId:1,past:[],future:[],pastOps:[],futureOps:[]});
before(async()=>{
 server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 [cat,flow,auto,store,hydro,adjust,water,coverage,geometry,{emptyProject},diagnostics]=await Promise.all(['equipment-catalog','flow','automatic-head','project-store','hydro','head-adjustment','watering-preview','coverage','irrigation-geometry','project-types','check-project'].map(name=>server.ssrLoadModule('/src/lib/'+name+'.ts')));
});
after(async()=>server.close());

test('all 1596 Toro rows preserve published geometry and flow in manual editing; eligible radius endpoints select automatically',()=>{
 let rows=0,automatic=0,strips=0;
 for(const item of cat.placeableCatalog().filter(i=>i.manufacturerId==='toro'))for(const nozzle of item.nozzles)for(const row of nozzle.performance){
  const label=`${item.id}/${nozzle.id}/${row.pressureBar}/${row.arcDeg}`;
  const body=cat.bodiesFor(item).find(b=>b.regulatedPressureBar==null&&row.pressureBar>=b.recommendedPressureMin&&row.pressureBar<=b.recommendedPressureMax);
  if(cat.mountingKind(item)==='spray')assert.ok(body,label+' compatible unregulated body');
  const initial=head(item,{nozzleId:nozzle.id,arc:row.arcDeg,designPressure:row.pressureBar,r:row.radiusM,...(body?{bodyId:body.id,popUpMm:body.popUpMm}:{})});
  assert.ok(flow.operatingGeometryAvailable(item,initial),label+' native geometry');
  const edited=store.updateHeadSettings(initial,{nozzleId:nozzle.id,arc:row.arcDeg,designPressure:row.pressureBar,r:row.radiusM});
  near(edited.designPressure,row.pressureBar,label+' pressure');near(edited.r,row.radiusM,label+' radius');near(edited.arc,row.arcDeg,label+' arc');
  near(flow.headFlow(edited).lpm,row.flowLMin,label+' discharge');
  assert.ok(flow.operatingGeometryAvailable(item,edited),label+' edited geometry');rows++;
  if(item.strip){strips++;assert.ok(cat.stripAtPressure(item,row.pressureBar));continue;}
  const range=flow.radiusRange(item,nozzle.id,row.pressureBar,row.arcDeg);assert.ok(range,label+' range');
  const reduced=store.updateHeadSettings(edited,{nozzleId:nozzle.id,r:range.min});near(reduced.r,range.min,label+' reduction');
  assert.ok(flow.operatingGeometryAvailable(item,reduced),label+' reduced geometry');
  assert.ok(auto.automaticCandidateSupported(item),label+' automatic eligibility');
  for(const radius of [range.min,range.max]){
   const fit=auto.selectAutomaticHead(radius,row.arcDeg,row.pressureBar,[{...item,nozzles:[nozzle]}]);
   assert.ok(fit,label+' automatic '+radius);near(fit.r,radius,label+' automatic radius');near(fit.arc,row.arcDeg,label+' automatic arc');
   assert.ok(fit.designPressure<=row.pressureBar+1e-7,label+' no pressure boost');
   assert.ok(flow.operatingGeometryAvailable(item,fit),label+' automatic geometry');automatic++;
  }
 }
 assert.equal(rows,1596);assert.equal(strips,96);assert.equal(automatic,3000);
});

test('all compatible Toro and Hunter regulated bodies bound editing, inspector pressure and saved-head simulation',()=>{
 let checked=0;
 for(const id of ['O-8-H','O-T-8-H','PSN8-H','PSN8T-H']){
  const item=cat.itemById('toro:'+id);
  for(const body of cat.bodiesFor(item).filter(b=>b.regulatedPressureBar!=null))for(const snapshot of [false,true]){
   const nominal=body.regulatedPressureBar===2.1?pressure30:body.regulatedPressureBar;
   const expected=Math.min(nominal,item.recommendedPressureMax,body.recommendedPressureMax);
   const initial=head(item,{bodyId:body.id,popUpMm:body.popUpMm,designPressure:expected,...(snapshot?{bodySnapshot:cat.equipmentSnapshot(body)}:{})});
   const edited=store.updateHeadSettings(initial,{designPressure:100});
   near(edited.designPressure,expected,`${id}/${body.id}/${snapshot}`);
   near(adjust.headParameterRanges(item,edited).pressure.max,expected,body.id+' inspector cap');
   assert.ok(flow.headPressureAvailable(item,edited),body.id+' valid outlet pressure');
   const invalid={...initial,designPressure:expected+.2};
   assert.equal(flow.headPressureAvailable(item,invalid),false,body.id+' saved overpressure');
   assert.equal(flow.headFlow(invalid).lpm,null,body.id+' no false flow');
   assert.equal(water.wateringProfile(invalid).kind,'unknown',body.id+' no false watering');checked++;
  }
 }
 assert.ok(checked>40,'cover the physical body variants and snapshot resolution');
 const item=cat.itemById('toro:O-T-8-H'),original=head(item),cap=pressure30;
 reset([original]);store.useProject.getState().beginHeadEdit();store.useProject.getState().patchHeadLive(original.id,{designPressure:3.4});store.useProject.getState().endHeadEdit();
 near(store.useProject.getState().project.heads[0].designPressure,cap,'live edit cap');
 store.useProject.getState().undo();assert.deepEqual(store.useProject.getState().project.heads[0],JSON.parse(JSON.stringify(original)));
 store.useProject.getState().redo();near(store.useProject.getState().project.heads[0].designPressure,cap,'redo cap');
});

test('documented 30 psi aliases give female/male and O/PSN heads one compatible nominal setting',()=>{
 const keys=[];
 for(const [femaleId,maleId] of [['O-8-H','O-T-8-H'],['PSN8-H','PSN8T-H']]){
  const female=cat.itemById('toro:'+femaleId),male=cat.itemById('toro:'+maleId),a=head(female),b=head(male,{id:'male'});
  near(a.designPressure,pressure30,femaleId+' default');near(b.designPressure,pressure30,maleId+' default');
  near(a.r,b.r,femaleId+' same table throw');near(flow.headFlow(a).lpm,flow.headFlow(b).lpm,femaleId+' same discharge');
  assert.equal(hydro.hydroKey(a),hydro.hydroKey(b));keys.push(hydro.hydroKey(a));
  const first=auto.selectAutomaticHead(a.r,a.arc,3.4,[female]),peer=head(female,{...first,id:'female-peer'});
  assert.ok(first);assert.equal(first.needsReview,false);
  const second=auto.selectAutomaticHead(b.r,b.arc,3.4,[male],[peer]);assert.ok(second,'male remains compatible after female');
  assert.ok(auto.selectAutomaticRadius(b.r,3.4,[male],[peer]));
  const saved=head(female,{designPressure:2.1,equipmentSnapshot:cat.equipmentSnapshot(female)}),before=JSON.stringify(saved);
  near(flow.headFlow(saved).lpm,flow.headFlow(a).lpm,femaleId+' saved nominal flow');
  near(hydro.headWorkingBar(saved),pressure30,femaleId+' saved nominal pressure');assert.equal(hydro.hydroKey(saved),hydro.hydroKey(a));
  assert.equal(JSON.stringify(saved),before,'lookup does not mutate raw saved pressure');
  const migrated=store.migrateProject({...emptyProject(),heads:[saved]}).heads[0];near(migrated.designPressure,2.1,'migration preserves raw legacy setting');
  assert.equal(hydro.hydroKey(migrated),hydro.hydroKey(a));
  for(const nearby of [2.09,2.11]){
   assert.equal(cat.nozzleTablePressure(female,nearby),nearby,'adjacent pressure is a real setting');
   assert.equal(flow.performanceAt(female,female.nozzles[0].id,nearby,a.arc).kind,'interpolated');
  }
  assert.equal(cat.nozzleTablePressure(female,2.8),2.8,'PRS40 remains a different setting');
  const switched=store.updateHeadSettings(head(female,{bodyId:'PRO-SPRAY',designPressure:2.8}),{bodyId:'PRS30'});
  near(switched.designPressure,pressure30,femaleId+' body switch');
 }
 assert.equal(new Set(keys).size,1,'O and PSN share their declared nominal family');
 const rotor=cat.itemById('toro:T5P-RS-LN');assert.equal(cat.nozzleTablePressure(rotor,2.1),2.1,'do not reinterpret rotor pressure');
});

test('legacy O reduction stays tied to designated radius, including snapshots without minimumRadiusM',()=>{
 for(const id of ['O-5-210','O-T-5-210','O-12-Q','O-T-12-Q']){
  const item=cat.itemById('toro:'+id),nominal=id.includes('-5-')?5:12,expected=nominal*.3048*.75;
  for(const snapshot of [false,true]){
   const saved=cat.equipmentSnapshot(item);if(snapshot)delete saved.radiusAdjustment.minimumRadiusM;
   for(const row of saved.nozzles[0].performance){
    near(flow.radiusRange(saved,saved.nozzles[0].id,row.pressureBar,row.arcDeg).min,expected,id+' designated floor');
    const body=cat.bodiesFor(item).find(b=>b.regulatedPressureBar==null&&row.pressureBar>=b.recommendedPressureMin&&row.pressureBar<=b.recommendedPressureMax);
    const h=head(item,{bodyId:body.id,popUpMm:body.popUpMm,designPressure:row.pressureBar,arc:row.arcDeg,r:row.radiusM,equipmentSnapshot:saved});
    const edited=store.updateHeadSettings(h,{r:expected});near(edited.r,expected,id+' manual saved floor');assert.ok(flow.headFlow(edited).lpm>0);
   }
  }
 }
});

test('T5 reduction is pressure/nozzle-relative and keeps unpublished reduced discharge unknown',()=>{
 let checked=0;
 for(const item of cat.placeableCatalog().filter(i=>i.manufacturerId==='toro'&&i.type==='rotor'))for(const nozzle of item.nozzles){
  const row=nozzle.performance[0],floor=row.radiusM*.75,range=flow.radiusRange(item,nozzle.id,row.pressureBar,180);
  near(range.min,floor,item.id+'/'+nozzle.id);const h=head(item,{nozzleId:nozzle.id,designPressure:row.pressureBar,arc:180,r:row.radiusM});
  const reduced=store.updateHeadSettings(h,{nozzleId:nozzle.id,r:floor});near(reduced.r,floor,item.id+' manual reduced radius');assert.equal(reduced.nozzleId,nozzle.id);
  assert.ok(flow.operatingGeometryAvailable(item,reduced));assert.equal(flow.headFlow(reduced).lpm,null,'no invented screw-reduced rotor discharge');
  const fit=auto.selectAutomaticHead(floor,180,row.pressureBar,[{...item,nozzles:[nozzle]}]);assert.ok(fit);assert.equal(fit.needsReview,true);checked++;
 }
 assert.equal(checked,156);
});

test('Toro strips use their pressure-specific rectangle and nominal alias without sector placement',()=>{
 const strips=cat.placeableCatalog().filter(i=>i.manufacturerId==='toro'&&i.strip);assert.equal(strips.length,24);
 for(const item of strips){
  assert.equal(auto.automaticCandidateSupported(item),false,item.id);
  assert.deepEqual(cat.stripAtPressure(item,2.1),cat.stripAtPressure(item,pressure30),item.id+' nominal rectangle');
  const h=head(item,{designPressure:2.1}),shape=geometry.headSurface(h);
  assert.equal(hydro.hydroKey(h),hydro.hydroKey({...h,designPressure:pressure30}),item.id+' same strip layout at nominal pressure');
  assert.ok(shape.length,item.id+' rectangular surface');assert.notEqual(water.wateringProfile(h).kind,'unknown',item.id+' simulation');
  const dimensions=cat.stripAtPressure(item,pressure30);
  near(geometry.surfaceArea(shape),dimensions.w*dimensions.l,item.id+' actual rectangular area',1e-5);
 }
});

test('Toro diagnostics use canonical 30 psi and the actual T5 reduction floor',()=>{
 for(const id of ['O-T-8-H','PSN8T-H']){
  const item=cat.itemById('toro:'+id),saved=head(item,{designPressure:2.1,equipmentSnapshot:cat.equipmentSnapshot(item)});
  const issues=diagnostics.checkProject({...emptyProject(),heads:[saved]});
  assert.ok(!issues.some(issue=>issue.id===`body-pressure-${saved.id}`),id+' no false regulator warning');
  assert.ok(!issues.some(issue=>issue.id===`p-${saved.id}`),id+' no false table pressure issue');
  near(saved.designPressure,2.1,'diagnostics do not mutate the saved nominal value');
 }
 const item=cat.itemById('toro:T5P-RS-LN'),nozzle=item.nozzles[0],row=nozzle.performance[0],minimum=row.radiusM*.75;
 const valid=head(item,{nozzleId:nozzle.id,designPressure:row.pressureBar,arc:180,r:minimum});
 assert.ok(!diagnostics.checkProject({...emptyProject(),heads:[valid]}).some(issue=>issue.id===`r-${valid.id}`),'the valid reduced rotor is not diagnosed against global rMin');
 const tooSmall={...valid,r:minimum-.05},issue=diagnostics.checkProject({...emptyProject(),heads:[tooSmall]}).find(issue=>issue.id===`r-${tooSmall.id}`);
 assert.ok(issue,'a radius below the true adjustment floor is diagnosed');
 near(issue.metrics.find(metric=>metric.key==='diagMinimum').value,minimum,'diagnostic minimum uses this nozzle and pressure');
});

test('Toro simulation rejects impossible pressure, radius, fixed arc and nozzle but follows the valid sector',()=>{
 for(const id of ['O-8-H','O-T-8-H','PSN8-H','PSN8T-H','T5P-RS-LN']){
  const item=cat.itemById('toro:'+id),valid=head(item);
  assert.ok(flow.operatingGeometryAvailable(item,valid));assert.notEqual(water.wateringProfile(valid).kind,'unknown');
  const patches=[{designPressure:.1},{designPressure:100},{nozzleId:'not-a-real-nozzle'},{r:100},{r:.1},{arc:0}];
  if(item.type!=='rotor')patches.push({arc:77});
  for(const patch of patches){
   const invalid={...valid,...patch};assert.equal(flow.operatingGeometryAvailable(item,invalid),false,id+JSON.stringify(patch));
   assert.equal(water.wateringProfile(invalid).kind,'unknown');assert.deepEqual(geometry.headSurface(invalid),[]);
   assert.equal(coverage.headCovers(invalid,{x:.1,y:.1}),false);
  }
  const at=angle=>({x:Math.cos(angle*Math.PI/180)*valid.r*.5,y:Math.sin(angle*Math.PI/180)*valid.r*.5});
  assert.equal(coverage.headCovers(valid,at(valid.start+valid.arc/2)),true,id+' inside sector');
  assert.equal(coverage.headCovers(valid,at(valid.start-5)),false,id+' outside sector');
 }
});

test('Toro automatic radius preview, final selection and store commit share group and peer compatibility',()=>{
 const catalog=auto.automaticHeadCatalog('toro','precision');
 const reference=cat.itemById('toro:O-T-8-H'),peer=head(reference,{id:'opposite-corner',x:10,y:10});
 reset([peer]);
 const sector={center:{x:3,y:4},radius:peer.r,start:313,arc:180},peers=auto.automaticZonePeers([peer],1,catalog);
 const fit=auto.selectAutomaticHead(sector.radius,sector.arc,3.4,catalog,peers);assert.ok(fit);
 assert.ok(auto.selectAutomaticRadius(sector.radius,3.4,catalog,peers));
 assert.equal(store.useProject.getState().placeAutomaticHead(sector,3.4),true);
 const placed=store.useProject.getState().project.heads.at(-1);
 assert.deepEqual([placed.catalogId,placed.nozzleId,placed.bodyId,placed.designPressure],[fit.catalogId,fit.nozzleId,fit.bodyId,fit.designPressure]);
 assert.deepEqual([placed.x,placed.y,placed.r,placed.start,placed.arc],[3,4,sector.radius,313,180]);
 assert.equal(hydro.hydroKey(placed),hydro.hydroKey(peer));assert.equal(placed.zone,peer.zone);
 assert.equal(store.useProject.getState().placeAutomaticHead({...sector,arc:77},3.4),false,'fixed sectors cannot be silently rounded');
 store.useProject.getState().undo();assert.equal(store.useProject.getState().project.heads.length,1);
 store.useProject.getState().redo();assert.equal(store.useProject.getState().project.heads.length,2);
});
