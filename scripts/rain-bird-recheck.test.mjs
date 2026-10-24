import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createServer} from 'vite';

let server,cat,flow,auto,store,adjust,coverage,water,geometry,emptyProject,sector;
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
const head=(item,patch={})=>({...flow.catalogHeadDefaults(item),id:'rainbird-audit',catalogId:item.id,x:0,y:0,start:20,zone:1,locked:false,...patch});
before(async()=>{
 server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 [cat,flow,auto,store,adjust,coverage,water,geometry,{emptyProject},sector]=await Promise.all(['equipment-catalog','flow','automatic-head','project-store','head-adjustment','coverage','watering-preview','irrigation-geometry','project-types','head-sector-edit'].map(n=>server.ssrLoadModule('/src/lib/'+n+'.ts')));
});
after(async()=>server.close());

test('every supported Rain Bird table row survives manual editing and eligible radius endpoints can be selected automatically',t=>{
 let rows=0,automatic=0,excluded=0;
 for(const item of cat.placeableCatalog().filter(i=>i.manufacturerId==='rain-bird'))for(const nozzle of item.nozzles)for(const row of nozzle.performance){
  rows++;
  const arc=cat.clampArc(item,row.arcDeg),label=`${item.id}/${nozzle.id}/${row.pressureBar}/${arc}`;
  const initial=head(item,{nozzleId:nozzle.id,arc,designPressure:row.pressureBar,r:row.radiusM,
   ...(cat.mountingKind(item)==='spray'?{bodyId:'rain-bird:1804',popUpMm:102}:{})});
  if(row.pressureBar<item.recommendedPressureMin||row.pressureBar>item.recommendedPressureMax||!flow.headPressureAvailable(item,initial)){
   assert.equal(flow.operatingGeometryAvailable(item,initial),false,label);excluded++;continue;
  }
  const edited=store.updateHeadSettings(initial,{nozzleId:nozzle.id,arc,designPressure:row.pressureBar,r:row.radiusM});
  near(edited.designPressure,row.pressureBar,label+' pressure');near(edited.r,row.radiusM,label+' radius');
  if(nozzle.hydraulicVerificationStatus==='Needs Review')assert.equal(flow.headFlow(edited).lpm,null,label);
  else near(flow.headFlow(edited).lpm,row.flowLMin,label+' discharge');
  assert.ok(flow.operatingGeometryAvailable(item,edited),label+' geometry');
  const range=flow.radiusRange(item,nozzle.id,row.pressureBar,arc);
  if(range){
   const reduced=store.updateHeadSettings(edited,{nozzleId:nozzle.id,r:range.min});near(reduced.r,range.min,label+' reduction');
   assert.ok(flow.operatingGeometryAvailable(item,reduced),label+' reduced geometry');
  }
  if(!auto.automaticCandidateSupported(item))continue;
  for(const radius of [...new Set([range.min,range.max])]){
   const fit=auto.selectAutomaticHead(radius,arc,row.pressureBar,[{...item,nozzles:[nozzle]}]);
   assert.ok(fit,label+' automatic');near(fit.r,radius,label);near(fit.arc,arc,label);
   assert.ok(fit.designPressure<=row.pressureBar+1e-8,label+' no pressure boost');
   assert.ok(flow.operatingGeometryAvailable(item,fit),label);automatic++;
  }
 }
 assert.equal(rows,1119);assert.ok(automatic>1500);assert.ok(excluded<50);
 t.diagnostic(JSON.stringify({catalogRows:rows,automaticEndpoints:automatic,excludedByOperatingDomain:excluded}));
});

test('HE-VAN and matched 12/15/18-VAN support small sectors with explicitly estimated discharge',()=>{
 for(const id of ['HE-VAN-8','HE-VAN-10','HE-VAN-12','HE-VAN-15','12-VAN','15-VAN','18-VAN']){
  const item=cat.itemById('rain-bird:'+id),n=cat.defaultNozzle(item),pressure=flow.catalogHeadDefaults(item).designPressure;
  const quarter=flow.performanceAt(item,n.id,pressure,90).row;
  for(const arc of [1,30,60,77,89]){
   const result=flow.computeFlow(item,{arc,radius:quarter.radiusM,pressureBar:pressure,nozzleId:n.id});
   near(result.lpm,quarter.flowLMin*arc/90,id+'/'+arc);assert.equal(result.sectorEstimated,true);assert.ok(result.note);
   near(result.precipMmHr,quarter.precipSquareMmH,id+' precipitation');
   const fit=auto.selectAutomaticHead(quarter.radiusM,arc,pressure,[item]);assert.ok(fit,id+'/'+arc);assert.equal(fit.arc,arc);
   const changed=store.updateHeadSettings(head(item),{arc});assert.equal(changed.arc,arc);assert.ok(flow.headFlow(changed).lpm>0);
  }
  assert.equal(auto.selectAutomaticHead(quarter.radiusM,0,pressure,[item]),null,'zero is shutoff');
 }
 for(const id of ['4-VAN','6-VAN','8-VAN','10-VAN']){
  const item=cat.itemById('rain-bird:'+id);
  assert.equal(flow.performanceAt(item,item.nozzles[0].id,2.1,60),null,'no undocumented matched-sector flow');
  const geometry=flow.geometryAt(item,item.nozzles[0].id,2.1,60);assert.ok(geometry,id);
  const fit=auto.selectAutomaticHead(geometry.radiusM,60,2.1,[item]);assert.ok(fit,id);assert.equal(fit.needsReview,true);
  const changed=store.updateHeadSettings(head(item),{arc:60});assert.equal(changed.arc,60);assert.equal(flow.headFlow(changed).lpm,null);
  assert.ok(flow.operatingGeometryAvailable(item,changed));assert.notEqual(water.wateringProfile(changed).kind,'unknown');
  const invalid={...item,nozzles:item.nozzles.map(n=>({...n,hydraulicVerificationStatus:'Needs Review'}))};
  assert.equal(auto.selectAutomaticHead(geometry.radiusM,60,2.1,[invalid]),null,'source conflicts remain excluded');
 }
});

test('all Rain Bird PRS bodies cap manual pressure, live editing and inspector bounds',()=>{
 const item=cat.itemById('rain-bird:R-VAN18');
 for(const body of cat.bodiesFor(item).filter(b=>b.regulatedPressureBar!=null)){
  const initial=head(item,{bodyId:body.id,popUpMm:body.popUpMm});
  const changed=store.updateHeadSettings(initial,{designPressure:3.8});
  near(changed.designPressure,body.regulatedPressureBar,body.id);near(adjust.headParameterRanges(item,changed).pressure.max,body.regulatedPressureBar,body.id);
  near(changed.r,flow.performanceAt(item,changed.nozzleId,changed.designPressure,changed.arc).row.radiusM,body.id+' radius');
  store.useProject.setState({project:{...emptyProject(),heads:[initial]},past:[],future:[],pastOps:[],futureOps:[]});
  store.useProject.getState().beginHeadEdit();store.useProject.getState().patchHeadLive(initial.id,{designPressure:3.8});store.useProject.getState().endHeadEdit();
  near(store.useProject.getState().project.heads[0].designPressure,body.regulatedPressureBar,body.id+' live');
  store.useProject.getState().undo();assert.deepEqual(store.useProject.getState().project.heads[0],JSON.parse(JSON.stringify(initial)));
 }
 near(store.updateHeadSettings(head(item,{bodyId:'rain-bird:1804'}),{designPressure:3.8}).designPressure,3.8,'unregulated body');
 const small=cat.itemById('rain-bird:HE-VAN-12');
 near(store.updateHeadSettings(head(small),{designPressure:1.4}).designPressure,1.4,'PRS never boosts a lower working pressure');
 const sam=head(small,{bodyId:'rain-bird:1804-SAM'});
 near(store.updateHeadSettings(sam,{designPressure:1.4}).designPressure,1.7,'SAM minimum');
});

test('automatic selection observes the PRS inlet margin and nominal 30 psi chart equivalence',()=>{
 const rvan=cat.itemById('rain-bird:R-VAN18'),radius=flow.geometryAt(rvan,rvan.nozzles[0].id,3.1,180).radiusM;
 const low=auto.selectAutomaticHead(radius,180,3.1,[rvan]);assert.ok(low);assert.equal(cat.itemById(low.bodyId).regulatedPressureBar,null);
 const regulated=auto.selectAutomaticHead(radius,180,3.5,[rvan]);assert.ok(regulated);assert.equal(cat.itemById(regulated.bodyId).regulatedPressureBar,3.1);
 near(regulated.designPressure,3.1,'P45 outlet');
 for(const id of ['HE-VAN-8','HE-VAN-10','5H','5Q','10H','10Q']){
  const item=cat.itemById('rain-bird:'+id),row=item.nozzles[0].performance.at(-1);
  const nominal=auto.selectAutomaticHead(row.radiusM,row.arcDeg,2.1,[item]);assert.ok(nominal,id);
  assert.equal(cat.itemById(nominal.bodyId).regulatedPressureBar,null,id+' direct nominal supply');near(nominal.designPressure,row.pressureBar,id);
 }
 for(const available of [2.1,2.4,2.5,2.8,3.1,3.4,3.5,3.8,4.8])for(const item of cat.placeableCatalog().filter(i=>i.manufacturerId==='rain-bird'&&auto.automaticCandidateSupported(i))){
  const h=head(item),fit=auto.selectAutomaticHead(h.r,h.arc,available,[item]);if(!fit)continue;
  const body=cat.itemById(fit.bodyId);if(body?.nominalRegulationMinInletBar!=null)assert.ok(available>=body.nominalRegulationMinInletBar-1e-7,item.id);
 }
});

test('nominal 30 psi Rain Bird MPR chart conventions remain compatible with existing zone heads',async()=>{
 const {hydroKey}=await server.ssrLoadModule('/src/lib/hydro.ts');
 const base=cat.itemById('rain-bird:HE-VAN-12'),b=head(base),key=hydroKey(b);
 for(const id of ['HE-VAN-8','HE-VAN-10','5H','5Q','10H','10Q'])for(const supply of [2.1,3.1]){
  const item=cat.itemById('rain-bird:'+id),row=item.nozzles[0].performance.at(-1),fit=auto.selectAutomaticHead(row.radiusM,row.arcDeg,supply,[item],[b]);
  assert.ok(fit,id+'/'+supply);assert.equal(hydroKey({...head(item),...fit}),key,id);
  assert.ok(auto.selectAutomaticHead(b.r,b.arc,supply,[base],[{...head(item),...fit}]),'reverse order '+id);
 }
 const he8=cat.itemById('rain-bird:HE-VAN-8'),low=head(he8,{bodyId:'rain-bird:1804',designPressure:2});
 low.r=flow.geometryAt(he8,low.nozzleId,2,low.arc).radiusM;
 assert.notEqual(hydroKey(low),key,'nearby arbitrary pressure is not nominal 30 psi');
});

test('Rain Bird simulation rejects impossible pressure, sector, nozzle and saved radius',()=>{
 const item=cat.itemById('rain-bird:R-VAN18'),valid=head(item);
 assert.notEqual(water.wateringProfile(valid).kind,'unknown');
 for(const patch of [{designPressure:.1},{designPressure:100},{designPressure:3.8},{nozzleId:'missing'},{arc:300},{r:100},{r:.1}]){
  const invalid={...valid,...patch};assert.equal(flow.operatingGeometryAvailable(item,invalid),false,JSON.stringify(patch));
  assert.equal(water.wateringProfile(invalid).kind,'unknown');assert.deepEqual(geometry.headSurface(invalid),[]);assert.equal(coverage.headCovers(invalid,{x:.1,y:.1}),false);
 }
 const square=cat.itemById('rain-bird:SQ-HLF'),n=square.nozzles.find(n=>n.hydraulicVerificationStatus==='Needs Review');
 const h=store.updateHeadSettings(head(square),{nozzleId:n.id});
 assert.ok(flow.operatingGeometryAvailable(square,h),'square geometry remains independent of disputed discharge');
 assert.equal(flow.headFlow(h).lpm,null);assert.equal(water.wateringProfile(h).kind,'square-fan');
 const old=cat.equipmentSnapshot(square);delete old.geometryVerificationStatus;
 assert.equal(water.wateringProfile({...h,equipmentSnapshot:old}).kind,'square-fan','older square snapshots retain verified geometry');
});

test('legacy overpressure remains saved for review without false watering, and changing pressure repairs it',()=>{
 const item=cat.itemById('rain-bird:R-VAN18'),h=head(item,{designPressure:3.8,r:5.5,equipmentSnapshot:cat.equipmentSnapshot(item)});
 const migrated=store.migrateProject({...emptyProject(),heads:[h]}).heads[0];
 near(migrated.designPressure,3.8,'preserve pressure');near(migrated.r,5.5,'preserve geometry');
 assert.equal(migrated.needsReview,true);assert.equal(flow.headFlow(migrated).lpm,null);assert.equal(water.wateringProfile(migrated).kind,'unknown');
 const fixed=store.updateHeadSettings(migrated,{designPressure:3.1});assert.equal(fixed.needsReview,false);assert.ok(flow.headFlow(fixed).lpm>0);
});

test('5000 Plus PRS retains its published INLET pressure plateau rather than treating it as spray nozzle pressure',()=>{
 const item=cat.itemById('rain-bird:5004+PCR');
 assert.equal(cat.catalogPressureLabel(item),'equipment.pressureAtInlet');
 assert.equal(cat.catalogPressureLabel(cat.itemById('rain-bird:5004-PC')),'workingPressure');
 for(const n of item.nozzles){
  const row=n.performance.find(r=>r.pressureRangeIsConstant);if(!row)continue;
  for(const bar of [row.pressureBar,(row.pressureBar+row.pressureMaxBar)/2,row.pressureMaxBar]){
   const h=head(item,{nozzleId:n.id,designPressure:bar,r:row.radiusM,arc:180});
   near(flow.headFlow(h).lpm,row.flowLMin,n.id);assert.ok(flow.operatingGeometryAvailable(item,h));
   near(store.updateHeadSettings(h,{nozzleId:n.id,designPressure:bar}).designPressure,bar,n.id);
  }
 }
});

test('conflicting 5000 #6 precipitation is withheld while independently calculated display remains labelled',async()=>{
 const {displayPrecipitation}=await server.ssrLoadModule('/src/lib/precipitation-display.ts');
 for(const id of ['5004-PC','5004+PC','5004+PCR']){
  const item=cat.itemById('rain-bird:'+id),n=item.nozzles.find(n=>n.id.endsWith(':6')),row=n.performance.find(r=>r.pressureBar===2);
  assert.equal(row.precipSquareMmH,null);assert.equal(row.precipTriangleMmH,null);
  const opts={arc:180,radius:row.radiusM,pressureBar:2,nozzleId:n.id},fl=flow.computeFlow(item,opts),display=displayPrecipitation(item,opts,fl);
  near(fl.lpm,17.4,id+' unchanged discharge');assert.equal(fl.precipMmHr,null);
  assert.ok(display.rate>0,id+' calculated value');assert.equal(display.calculated,true);assert.equal(display.noteKey,'precipCalculated');
 }
});
