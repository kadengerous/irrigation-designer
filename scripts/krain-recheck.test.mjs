import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createServer} from 'vite';

let server,cat,flow,auto,store,hydro,adjust,water,coverage,geometry,emptyProject,diagnostics,groups,models;
const near=(actual,expected,label,tolerance=1e-6)=>assert.ok(actual!=null&&Math.abs(actual-expected)<=tolerance,`${label}: ${actual} != ${expected}`);
const head=(item,patch={})=>({...flow.catalogHeadDefaults(item),id:'krain-recheck',catalogId:item.id,x:0,y:0,start:23,zone:1,locked:false,...patch});
const reset=(heads=[],group='rotary')=>store.useProject.setState({project:{...emptyProject(),heads},equipmentFilters:{manufacturerId:'k-rain'},familyFilter:group,activeZoneId:1,past:[],future:[],pastOps:[],futureOps:[]});
before(async()=>{
 server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 [cat,flow,auto,store,hydro,adjust,water,coverage,geometry,{emptyProject},diagnostics,groups]=await Promise.all(['equipment-catalog','flow','automatic-head','project-store','hydro','head-adjustment','watering-preview','coverage','irrigation-geometry','project-types','check-project','equipment-groups'].map(name=>server.ssrLoadModule('/src/lib/'+name+'.ts')));
 models=cat.CATALOG.filter(i=>i.manufacturerId==='k-rain');
});
after(async()=>server?.close());

test('all 764 K-Rain table rows survive manual settings or remain explicitly blocked; every eligible radius endpoint auto-selects',()=>{
 let rows=0,blocked=0,manual=0,unrepresented=0,automatic=0;
 for(const item of models)for(const nozzle of item.nozzles)for(const row of nozzle.performance){
  rows++;const label=`${item.id}/${nozzle.id}/${row.pressureBar}/${row.arcDeg}`;
  const body=cat.bodiesFor(item).find(b=>b.regulatedPressureBar==null&&row.pressureBar>=cat.nozzleTablePressure(item,b.recommendedPressureMin)-1e-7&&row.pressureBar<=cat.nozzleTablePressure(item,b.recommendedPressureMax)+1e-7);
  if(cat.mountingKind(item)==='spray')assert.ok(body,label+' compatible unregulated body');
  const initial=head(item,{nozzleId:nozzle.id,arc:row.arcDeg,designPressure:row.pressureBar,r:row.radiusM,...(body?{bodyId:body.id,popUpMm:body.popUpMm}:{})});
  if(row.verificationStatus==='Needs Review'){
   assert.equal(flow.headFlow(initial).lpm,null,label+' disputed discharge');assert.equal(water.wateringProfile(initial).kind,'unknown',label+' disputed simulation');blocked++;continue;
  }
  near(flow.headFlow(initial).lpm,row.flowLMin,label+' source discharge');
  if(item.placementSupported===false){assert.deepEqual(geometry.headSurface(initial),[],label+' no invented high/low footprint');unrepresented++;continue;}
  const edited=store.updateHeadSettings(initial,{nozzleId:nozzle.id,arc:row.arcDeg,designPressure:row.pressureBar,r:row.radiusM});
  near(edited.designPressure,row.pressureBar,label+' pressure');near(edited.r,row.radiusM,label+' radius');near(edited.arc,row.arcDeg,label+' arc');
  near(flow.headFlow(edited).lpm,row.flowLMin,label+' manual discharge');assert.ok(flow.operatingGeometryAvailable(item,edited),label+' actual geometry');manual++;
  if(!auto.automaticCandidateSupported(item))continue;
  const autoArc=item.id==='k-rain:RPS-Select'?Number(nozzle.id.match(/standard-(\d+)/)[1])*90:row.arcDeg;
  const range=flow.radiusRange(item,nozzle.id,row.pressureBar,autoArc);assert.ok(range,label+' radius range');
  const reduced=store.updateHeadSettings(edited,{nozzleId:nozzle.id,arc:autoArc,r:range.min});near(reduced.r,range.min,label+' manual reduction');assert.ok(flow.operatingGeometryAvailable(item,reduced),label+' valid reduced geometry');
  for(const radius of [range.min,range.max]){
   const fit=auto.selectAutomaticHead(radius,autoArc,row.pressureBar,[{...item,nozzles:[nozzle]}]);
   assert.ok(fit,label+' automatic '+radius);near(fit.r,radius,label+' auto radius');near(fit.arc,autoArc,label+' auto arc');
   assert.ok(fit.designPressure<=cat.nozzleTablePressure(item,row.pressureBar)+1e-7,label+' no pressure boost');
   assert.ok(flow.operatingGeometryAvailable(item,fit),label+' valid auto geometry');automatic++;
  }
 }
 assert.equal(rows,764);assert.equal(blocked,17);assert.equal(unrepresented,4);assert.equal(manual,743);assert.equal(automatic,1432);
});

test('all 17 K-Rain bodies retain the correct physical thread, stroke and pressure regulation in live and saved settings',()=>{
 const bodies=models.filter(i=>i.type==='body');assert.equal(bodies.length,17);
 assert.equal(bodies.filter(i=>i.regulatedPressureBar!=null).length,6);
 let configurations=0;
 for(const body of bodies){
  const item=cat.itemById(body.nozzleThread==='male'?'k-rain:KV8':'k-rain:KVF8');
  assert.ok(cat.bodiesFor(item).some(b=>b.id===body.id),body.id+' correct nozzle interface');
  const wrong=cat.itemById(body.nozzleThread==='male'?'k-rain:KVF8':'k-rain:KV8');
  assert.ok(!cat.bodiesFor(wrong).some(b=>b.id===body.id),body.id+' wrong interface excluded');
  const min=cat.nozzleTablePressure(item,body.recommendedPressureMin);
  const expected=Math.min(item.recommendedPressureMax,cat.nozzleTablePressure(item,body.regulatedPressureBar??body.recommendedPressureMax));
  for(const snapshot of [false,true]){
   const initial=head(item,{bodyId:body.id,popUpMm:body.popUpMm,designPressure:2.07,...(snapshot?{bodySnapshot:cat.equipmentSnapshot(body)}:{})});
   const edited=store.updateHeadSettings(initial,{designPressure:100});near(edited.designPressure,expected,body.id+' manual upper limit');
   near(adjust.headParameterRanges(item,edited).pressure.max,expected,body.id+' inspector limit');
   near(store.updateHeadSettings(initial,{designPressure:0}).designPressure,min,body.id+' manual lower limit');
   assert.ok(flow.headPressureAvailable(item,edited));
   for(const designPressure of [min-.05,expected+.05]){
    const invalid={...initial,designPressure};assert.equal(flow.operatingGeometryAvailable(item,invalid),false,body.id+' saved invalid pressure');
    assert.equal(flow.headFlow(invalid).lpm,null);assert.equal(water.wateringProfile(invalid).kind,'unknown');assert.deepEqual(geometry.headSurface(invalid),[]);
   }
   configurations++;
  }
 }
 assert.equal(configurations,34);
 const item=cat.itemById('k-rain:KVF8'),original=head(item,{bodyId:'k-rain:78004-PR30',designPressure:2.07});
 reset([original],'kvf');store.useProject.getState().beginHeadEdit();store.useProject.getState().patchHeadLive(original.id,{designPressure:3.45});store.useProject.getState().endHeadEdit();
 near(store.useProject.getState().project.heads[0].designPressure,2.07,'live regulator cap');
 store.useProject.getState().undo();assert.deepEqual(store.useProject.getState().project.heads[0],JSON.parse(JSON.stringify(original)));
 store.useProject.getState().redo();near(store.useProject.getState().project.heads[0].designPressure,2.07,'redo cap');
});

test('only documented KV/KVF pressure labels normalize; saved nominal pressure keeps flow and diagnostics consistent',()=>{
 for(const id of ['KV8','KVF8']){
  const item=cat.itemById('k-rain:'+id),bodyId=id==='KV8'?'k-rain:74001':'k-rain:78004-PR30';
  for(const [nominal,chart]of [[1.4,1.38],[2.1,2.07],[2.8,2.76],[3.5,3.45]]){
   assert.equal(cat.nozzleTablePressure(item,nominal),chart,id+' nominal point');
   assert.equal(cat.nozzleTablePressure(item,nominal-.001),nominal-.001,id+' neighboring point unchanged');
  }
  const saved=head(item,{bodyId,designPressure:2.1,equipmentSnapshot:cat.equipmentSnapshot(item)}),canonical={...saved,designPressure:2.07},before=JSON.stringify(saved);
  near(flow.headFlow(saved).lpm,flow.headFlow(canonical).lpm,id+' saved nominal discharge');assert.equal(hydro.hydroKey(saved),hydro.hydroKey(canonical));
  const migrated=store.migrateProject({...emptyProject(),heads:[saved]}).heads[0];near(migrated.designPressure,2.1,'migration preserves saved value');assert.equal(hydro.hydroKey(migrated),hydro.hydroKey(canonical));
  assert.ok(!diagnostics.checkProject({...emptyProject(),heads:[saved]}).some(i=>i.id===`body-pressure-${saved.id}`||i.id===`p-${saved.id}`));assert.equal(JSON.stringify(saved),before);
 }
 for(const id of ['RN100-ADJ','RN100-ADJ-90-210','FN-8H','RPS75-PR','TB-025'])assert.equal(cat.nozzleTablePressure(cat.itemById('k-rain:'+id),2.1),2.1,id+' separate pressure basis');
});

test('Pro-S nominal regulation has a separate 100 psi inlet guarantee and never invents pressure boost',()=>{
 const item=cat.itemById('k-rain:RN100-ADJ-90-210'),row=item.nozzles[0].performance.find(r=>r.pressureBar===2.8&&r.arcDeg===180);
 const regulated=models.filter(i=>i.type==='body'&&i.regulatedPressureBar!=null);assert.equal(regulated.length,6);
 for(const b of regulated){near(b.recommendedPressureMax,7.6,'mechanical body range');near(b.nominalRegulationMaxInletBar,6.9,'documented regulator inlet guarantee');assert.equal(b.nominalRegulationMinInletBar,undefined,'no invented differential');}
 const fit=auto.selectAutomaticHead(row.radiusM,180,6.9,[item]);assert.ok(fit);near(fit.designPressure,2.8,'working outlet');assert.ok(fit.bodyId.endsWith('-PR40'));
 assert.equal(auto.selectAutomaticHead(row.radiusM,180,6.91,[item]),null,'no guarantee above regulator inlet rating');
 assert.equal(auto.selectAutomaticHead(row.radiusM,180,1.39,[item]),null,'no boosting a low supply');
 const low=auto.selectAutomaticHead(item.nozzles[0].performance[0].radiusM,90,2.1,[item]);assert.ok(low);assert.ok(low.designPressure<=2.1);
});

test('all five Tree Bubblers remain local points; only four fixed discharges are known',()=>{
 const bubblers=models.filter(i=>i.type==='bubbler');assert.equal(bubblers.length,5);
 for(const item of bubblers){
  assert.equal(auto.automaticCandidateSupported(item),false);assert.deepEqual(cat.bodiesFor(item),[]);assert.equal(item.coverageKind,'point');
  for(const pressure of [1.4,2.1,3.5]){
   const h=head(item,{designPressure:pressure}),f=flow.headFlow(h);assert.ok(flow.operatingGeometryAvailable(item,h));
   assert.equal(f.lpm,item.modelId==='TB-ADJ'?null:item.compensatedFlowLMin);assert.equal(f.precipMmHr,null);assert.equal(f.precipTriangleMmHr,null);
   assert.deepEqual(geometry.headSurface(h),[]);assert.equal(coverage.headCovers(h,{x:0,y:0}),false,'point flow is not area coverage');
   assert.equal(auto.selectAutomaticHead(.5,90,pressure,[item]),null);
  }
  for(const patch of [{designPressure:1.39},{designPressure:3.51},{r:.5},{arc:90}]){const invalid=head(item,patch);assert.equal(flow.operatingGeometryAvailable(item,invalid),false);assert.equal(water.wateringProfile(invalid).kind,'unknown');}
  assert.equal(item.nozzles[0].performance.length,0,'do not fabricate pressure tables');
 }
});

test('eight current K-Rain groups partition all placeable models and preserve manual-only patterns',()=>{
 const expected=[['rotary',15,12],['kvf6',1,1],['kvf',5,5],['kv',5,5],['fixed',24,24],['strips',6,0],['rotor',9,9],['bubbler',5,0]],ids=[];
 assert.deepEqual(groups.equipmentGroupsFor('k-rain').map(g=>g.id),expected.map(g=>g[0]));
 for(const [group,total,automatic]of expected){const catalog=auto.automaticHeadCatalog('k-rain',group);assert.equal(catalog.length,total);assert.equal(catalog.filter(auto.automaticCandidateSupported).length,automatic);ids.push(...catalog.map(i=>i.id));}
 assert.equal(ids.length,70);assert.equal(new Set(ids).size,70);assert.deepEqual(ids.sort(),cat.placeableCatalog().filter(i=>i.manufacturerId==='k-rain').map(i=>i.id).sort());
 assert.ok(!ids.includes('k-rain:P15HL')&&!ids.includes('k-rain:FN-15HL'));
 for(const id of ['P15HL','FN-15HL'])assert.equal(auto.automaticCandidateSupported(cat.itemById('k-rain:'+id)),false);
});

test('RN preview, zone compatibility and final placement agree without crossing another group',()=>{
 const item=cat.itemById('k-rain:RN100-ADJ-90-210'),peer=head(item,{id:'corner-peer',x:10,y:10}),catalog=auto.automaticHeadCatalog('k-rain','rotary');reset([peer]);
 const sector={center:{x:3,y:4},radius:peer.r,start:313,arc:180},peers=auto.automaticZonePeers([peer],1,catalog),fit=auto.selectAutomaticHead(peer.r,180,3.4,catalog,peers);assert.ok(fit);assert.ok(auto.selectAutomaticRadius(peer.r,3.4,catalog,peers));
 assert.equal(store.useProject.getState().placeAutomaticHead(sector,3.4),true);const placed=store.useProject.getState().project.heads.at(-1);
 assert.deepEqual([placed.catalogId,placed.nozzleId,placed.bodyId,placed.designPressure],[fit.catalogId,fit.nozzleId,fit.bodyId,fit.designPressure]);assert.equal(hydro.hydroKey(placed),hydro.hydroKey(peer));assert.equal(placed.zone,peer.zone);
 assert.deepEqual([placed.x,placed.y,placed.r,placed.start,placed.arc],[3,4,peer.r,313,180]);
 assert.deepEqual(auto.automaticZonePeers([peer],1,auto.automaticHeadCatalog('k-rain','kvf')),[]);
 assert.equal(store.useProject.getState().placeAutomaticHead({...sector,radius:100},3.4),false);store.useProject.getState().undo();assert.equal(store.useProject.getState().project.heads.length,1);store.useProject.getState().redo();assert.equal(store.useProject.getState().project.heads.length,2);
});

test('new RN supports 80–89 degree matched estimates, while KV/KVF tiny sectors never fabricate discharge',()=>{
 let estimates=0;
 for(const id of ['RN100-ADJ','RN200-ADJ','RN300-ADJ']){
  const item=cat.itemById('k-rain:'+id),nozzle=item.nozzles[0];
  for(const row of nozzle.performance.filter(r=>r.arcDeg===90))for(const arc of [80,85,89]){
   const point=flow.performanceAt(item,nozzle.id,row.pressureBar,arc);assert.equal(point.sectorEstimated,true,id+' estimate identified');near(point.row.flowLMin,row.flowLMin*arc/90,id+' proportional estimate');
   const body=cat.bodiesFor(item).find(b=>b.regulatedPressureBar==null),h=head(item,{bodyId:body.id,designPressure:row.pressureBar,arc,r:row.radiusM});
   const fit=auto.selectAutomaticHead(row.radiusM,arc,row.pressureBar,[item]);assert.ok(fit);assert.equal(fit.needsReview,false);assert.notEqual(water.wateringProfile(h).kind,'unknown');
   const at=angle=>({x:Math.cos(angle*Math.PI/180)*h.r*.5,y:Math.sin(angle*Math.PI/180)*h.r*.5});
   assert.equal(coverage.headCovers(h,at(h.start+arc/2)),true);assert.equal(coverage.headCovers(h,at(h.start+arc+1)),false);estimates++;
  }
  assert.equal(flow.geometryAt(item,nozzle.id,2.1,79),null,'unsupported RN lower arc');assert.equal(auto.selectAutomaticHead(4,79,2.1,[item]),null);
 }
 assert.equal(estimates,27);
 for(const [id,r]of [['KV8',2.4],['KVF6',1.8],['KVF8',3.1]]){
  const item=cat.itemById('k-rain:'+id),h=head(item,{arc:60,r,designPressure:2.07});
  near(flow.geometryAt(item,h.nozzleId,2.07,60).radiusM,r,id+' consistent published throw');assert.equal(flow.headFlow(h).lpm,null,id+' unknown narrow-sector flow');
  const fit=auto.selectAutomaticHead(r,60,2.1,[item]);assert.ok(fit);assert.equal(fit.needsReview,true);
  assert.equal(auto.selectAutomaticHead(r,60,2.1,[item],[head(item)]),null,'unknown narrow-sector flow cannot be declared compatible with a populated zone');
  assert.equal(flow.geometryAt(item,h.nozzleId,2.07,0),null,'zero does not irrigate');
 }
 const uncertain=cat.itemById('k-rain:KVF8');assert.equal(flow.geometryAt(uncertain,uncertain.nozzles[0].id,2.76,60),null,'90-degree3.4m and othersector3.1m do not establish a narrow-sector throw');
 assert.equal(auto.selectAutomaticHead(3.4,60,2.8,[uncertain]),null,'cannot use unverified narrow-sector throw');
});

test('pressure-relative reduction limits propagate to manual settings, diagnostics and invalid simulation',()=>{
 for(const id of ['RN100-ADJ','RN100-ADJ-90-210','KVF6','MiniPro','RPS75i']){
  const item=cat.itemById('k-rain:'+id),nozzle=item.nozzles[0],row=nozzle.performance.find(r=>r.arcDeg===180),minimum=flow.radiusRange(item,nozzle.id,row.pressureBar,180).min;
  const body=cat.bodiesFor(item).find(b=>b.regulatedPressureBar==null),h=head(item,{nozzleId:nozzle.id,designPressure:row.pressureBar,arc:180,r:row.radiusM,...(body?{bodyId:body.id,popUpMm:body.popUpMm}:{})});
  const reduced=store.updateHeadSettings(h,{nozzleId:nozzle.id,r:minimum});near(reduced.r,minimum,id+' manual minimum');assert.equal(reduced.nozzleId,nozzle.id);assert.ok(flow.operatingGeometryAvailable(item,reduced));
  assert.ok(!diagnostics.checkProject({...emptyProject(),heads:[reduced]}).some(i=>i.id===`r-${reduced.id}`),id+' no false radius warning');
  const invalid={...reduced,r:minimum-.05};assert.equal(flow.operatingGeometryAvailable(item,invalid),false,id+' below configured minimum');assert.equal(water.wateringProfile(invalid).kind,'unknown');assert.deepEqual(geometry.headSurface(invalid),[]);assert.equal(coverage.headCovers(invalid,{x:.1,y:.1}),false);
  const issue=diagnostics.checkProject({...emptyProject(),heads:[invalid]}).find(i=>i.id===`r-${invalid.id}`);assert.ok(issue,id+' real radius warning');near(issue.metrics.find(m=>m.key==='diagMinimum').value,minimum,id+' actual diagnostic minimum');
 }
});

test('regulated integral RPS rotors keep inlet-basis source pressures above their outlet setpoint',()=>{
 for(const id of ['RPS75-PR','RPS75i-PR']){
  const item=cat.itemById('k-rain:'+id);assert.equal(item.pressureBasis,'inlet');
  const nozzle=item.nozzles[0],row=nozzle.performance.find(r=>r.pressureBar===4.1),h=head(item,{nozzleId:nozzle.id,designPressure:4.1,arc:180,r:row.radiusM});
  assert.ok(flow.headPressureAvailable(item,h));near(flow.headFlow(h).lpm,row.flowLMin,id+' inlet-row discharge');assert.notEqual(water.wateringProfile(h).kind,'unknown');
  const edited=store.updateHeadSettings(h,{designPressure:4.1});near(edited.designPressure,4.1,id+' inlet not clamped to3.1');
  const fit=auto.selectAutomaticHead(row.radiusM,180,4.1,[{...item,nozzles:[nozzle]}]);assert.ok(fit);near(fit.designPressure,4.1,id+' automatic inlet pressure');
 }
});

test('all 162 published reduced-flow points retain verified discharge and isolate the three source conflicts',()=>{
 let total=0,verified=0,review=0;
 for(const item of models)for(const row of item.reductionPerformance??[]){
  total++;const h=head(item,{nozzleId:row.nozzleId,designPressure:row.pressureBar,r:row.radiusM,arc:row.arcDeg});
  const f=flow.headFlow(h);
  if(row.verificationStatus==='Needs Review'){assert.equal(f.lpm,null,item.id+' disputed reduced row');review++;}
  else{near(f.lpm,row.flowLMin,item.id+' source reduced discharge');assert.equal(f.kind,'table');verified++;}
 }
 assert.equal(total,162);assert.equal(verified,159);assert.equal(review,3);
 const item=cat.itemById('k-rain:SuperPro');
 for(const number of ['6.0','8.0']){
  const nozzle=item.nozzles.find(n=>n.id.endsWith('standard-'+number)),row=item.reductionPerformance.find(r=>r.nozzleId===nozzle.id&&r.pressureBar===4.8);
  assert.equal(row.verificationStatus,'Needs Review');
  const fit=auto.selectAutomaticHead(row.radiusM,180,4.8,[{...item,nozzles:[nozzle]}]);assert.ok(fit);assert.equal(fit.needsReview,true,'documented radius may place but disputed flow stays unknown');
  assert.equal(flow.headFlow(head(item,fit)).lpm,null);
 }
 const rps=cat.itemById('k-rain:RPS75i'),nozzle=rps.nozzles.find(n=>n.id.endsWith('standard-1.5')),row=nozzle.performance.find(r=>r.pressureBar===3.4);
 const f=flow.headFlow(head(rps,{nozzleId:nozzle.id,designPressure:3.4,r:row.radiusM,arc:180}));
 assert.equal(row.precipSquareMmH,null,'conflicting precipitation cell stays unavailable');assert.equal(f.precipMmHr,null);near(f.lpm,row.flowLMin,'verified discharge remains usable');near(f.precipTriangleMmHr,row.precipTriangleMmH,'independently verified triangle precipitation remains usable');
});
