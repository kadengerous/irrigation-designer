import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createServer} from 'vite';

let server,cat,flow,auto,hydro,display,water,geometry,coverage,store,updateHeadSettings,i18n,emptyProject,models;
const close=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,`${message}: ${actual} != ${expected}`);
const head=(item,patch={})=>({...flow.catalogHeadDefaults(item),id:`he-test:${item.id}`,catalogId:item.id,x:3,y:4,start:37,zone:1,locked:false,...patch});
const point=(nozzle,row,patch={})=>({nozzleId:nozzle.id,pressureBar:row.pressureBar,arc:row.arcDeg,radius:row.radiusM,...patch});
const reset=(heads=[])=>store.setState({project:{...emptyProject(),heads},projects:[],past:[],future:[],pastOps:[],futureOps:[],equipmentFilters:{manufacturerId:'hunter'},familyFilter:'he',workspaceSection:'irrigation',tool:'auto-head',activeZoneId:1});

before(async()=>{
 server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 const load=name=>server.ssrLoadModule('/src/lib/'+name+'.ts');
 [cat,flow,auto,hydro,display,water,geometry,coverage,{useProject:store,updateHeadSettings},i18n,{emptyProject}]=await Promise.all([
  'equipment-catalog','flow','automatic-head','hydro','precipitation-display','watering-preview','irrigation-geometry','coverage','project-store','i18n','project-types'
 ].map(load));
 models=auto.automaticHeadCatalog('hunter','he');
 assert.equal(models.length,5);
 i18n.setActiveLocale('en');
});
after(async()=>server.close());

test('all five Hunter Pro HE models estimate every positive sub-90 sector from the bounded 90-degree chart row',()=>{
 const arcs=[.5,...Array.from({length:89},(_,i)=>i+1),89.9];
 for(const item of models)for(const nozzle of item.nozzles){
  const before=JSON.stringify(nozzle.performance);
  for(const pressureBar of [1.4,1.7,2.1,2.45,2.8]){
   const source=flow.performanceAt(item,nozzle.id,pressureBar,90);
   assert.ok(source,item.id);
   for(const arc of arcs){
    const found=flow.performanceAt(item,nozzle.id,pressureBar,arc),label=`${item.id} / ${pressureBar} bar / ${arc} degrees`;
    assert.ok(found,label);assert.equal(found.sectorEstimated,true,label);assert.equal(found.kind,'matched-precip',label);
    close(found.row.flowLMin,source.row.flowLMin*arc/90,label);
    close(found.row.flowM3H,source.row.flowM3H*arc/90,label);
    assert.equal(found.row.radiusM,source.row.radiusM,label);
    assert.equal(found.row.arcDeg,arc,label);
    assert.equal(found.row.precipSquareMmH,source.row.precipSquareMmH,label);
    assert.equal(found.row.precipTriangleMmH,source.row.precipTriangleMmH,label);
    const operating=point(nozzle,found.row),result=flow.computeFlow(item,operating);
    close(result.lpm,found.row.flowLMin,label);assert.equal(result.sectorEstimated,true,label);
    assert.ok(result.note.includes(i18n.text('flowSectorEstimate')),label);
    if(source.kind==='interpolated')assert.ok(result.note.includes(i18n.text('flowInterpolated')),label);
    const shown=display.displayPrecipitation(item,operating,result);
    assert.equal(shown.calculated,true,label);assert.equal(shown.noteKey,'flowSectorEstimate',label);
    close(shown.rate,source.row.precipSquareMmH,label);close(shown.triangle,source.row.precipTriangleMmH,label);
    assert.deepEqual(flow.pressureSteps(item,nozzle.id,arc),flow.pressureSteps(item,nozzle.id,90),label);
   }
  }
  assert.equal(JSON.stringify(nozzle.performance),before,'estimates must not mutate official source rows');
 }
});

test('published Hunter Pro HE 90/180-degree rows remain exact table values without an estimate flag',()=>{
 let checked=0;
 for(const item of models)for(const nozzle of item.nozzles)for(const row of nozzle.performance.filter(r=>[90,180].includes(r.arcDeg))){
  const found=flow.performanceAt(item,nozzle.id,row.pressureBar,row.arcDeg),result=flow.computeFlow(item,point(nozzle,row));
  assert.deepEqual(found,{row,kind:'table'},item.id);assert.equal(result.kind,'table',item.id);
  assert.equal(result.sectorEstimated,undefined,item.id);assert.equal(result.note,null,item.id);
  close(result.lpm,row.flowLMin,item.id);close(result.m3h,row.flowLMin*.06,item.id);
  close(result.precipMmHr,row.precipSquareMmH,item.id);close(result.precipTriangleMmHr,row.precipTriangleMmH,item.id);
  assert.equal(display.displayPrecipitation(item,point(nozzle,row)).calculated,false,item.id);
  checked++;
 }
 assert.ok(checked>=30);
});

test('Hunter Pro HE small sectors retain shutoff, pressure and physical radius bounds',()=>{
 for(const item of models)for(const nozzle of item.nozzles){
  const row=flow.performanceAt(item,nozzle.id,2.1,90).row;
  for(const arc of [60,77]){
   const range=flow.radiusRange(item,nozzle.id,2.1,arc);
   close(range.min,row.radiusM*.75,item.id+' screw reduction');close(range.max,row.radiusM,item.id);
   assert.ok(flow.computeFlow(item,point(nozzle,row,{arc,radius:range.min})).lpm>0,item.id);
   for(const radius of [0,range.min-.03,range.max+.03]){
    assert.equal(flow.computeFlow(item,point(nozzle,row,{arc,radius})).lpm,null,item.id);
    assert.equal(auto.selectAutomaticHead(radius,arc,2.1,[item]),null,item.id);
   }
   for(const pressureBar of [item.recommendedPressureMin-.01,item.recommendedPressureMax+.01,NaN,Infinity]){
    assert.equal(flow.performanceAt(item,nozzle.id,pressureBar,arc),null,item.id);
    assert.equal(flow.computeFlow(item,point(nozzle,row,{arc,pressureBar})).lpm,null,item.id);
   }
  }
  for(const arc of [0,-1,361,NaN]){
   assert.equal(flow.performanceAt(item,nozzle.id,2.1,arc),null,item.id);
   assert.equal(flow.computeFlow(item,point(nozzle,row,{arc})).lpm,null,item.id);
   assert.equal(auto.selectAutomaticHead(row.radiusM,arc,2.1,[item]),null,item.id);
  }
  assert.deepEqual(flow.pressureSteps(item,nozzle.id,0),[],item.id);
 }
 assert.equal(auto.selectAutomaticHead(2.51,60,.1,models),null,'automatic selection must not boost supply pressure');
});

test('small-sector estimates remain limited to audited matched families; fixed and ordinary sprays gain no fabricated flow',()=>{
 const reference=models[0],nozzle=reference.nozzles[0];
 for(const manufacturerId of ['rain-bird','toro','k-rain']){
  const other={...reference,manufacturerId};
  assert.equal(flow.performanceAt(other,nozzle.id,2.1,60),null,manufacturerId);
  assert.deepEqual(flow.pressureSteps(other,nozzle.id,60),[],manufacturerId);
 }
 let otherModels=0,fixedModels=0;
 for(const item of cat.CATALOG.filter(item=>item.type!=='rotor'&&item.type!=='body'))for(const n of item.nozzles){
  const arcs=[...new Set(n.performance.map(row=>row.arcDeg))].sort((a,b)=>a-b);
  if(arcs.length>1&&arcs[0]>60&&cat.supportsArc(item,60)&&!models.some(model=>model.id===item.id)){
   // Subsequent manufacturer audits added specific Rain Bird estimates and
   // geometry-only small sectors; they are not a blanket cross-brand HE rule.
   const matched=item.manufacturerId==='rain-bird'&&(item.series==='HE-VAN'||['12-VAN','15-VAN','18-VAN'].includes(item.modelId));
   const geometryOnly=item.manufacturerId==='rain-bird'&&['4-VAN','6-VAN','8-VAN','10-VAN'].includes(item.modelId)||item.manufacturerId==='k-rain'&&['KV','KVF'].includes(item.series);
   if(matched){
    const pressure=flow.pressureSteps(item,n.id,60)[0],estimate=flow.performanceAt(item,n.id,pressure,60);
    assert.equal(estimate?.sectorEstimated,true,item.id+' explicitly estimated');
   }else{
    assert.equal(flow.performanceAt(item,n.id,item.recommendedPressureBar,60),null,item.id);
    if(!geometryOnly)assert.deepEqual(flow.pressureSteps(item,n.id,60),[],item.id);
    otherModels++;
   }
  }
  if(item.family==='fixed'&&item.arcMin===item.arcMax&&item.arcMin>=90){
   assert.equal(flow.performanceAt(item,n.id,item.recommendedPressureBar,60),null,item.id);fixedModels++;
  }
 }
 assert.ok(otherModels>5,'check real non-HE model tables as well as the brand guard');
 assert.ok(fixedModels>5,'fixed-sector models must not gain adjustable sectors');
});

test('2.51 m at 60/77 degrees previews and commits at supported supply pressures with the exact drawn geometry',()=>{
 for(const pressure of [1.4,1.7,2.1,2.8,3.1])for(const arc of [60,77]){
  reset();
  const sector={center:{x:3,y:4},radius:2.51,start:323,arc},fit=auto.selectAutomaticHead(sector.radius,arc,pressure,models);
  assert.ok(fit,`${pressure} bar / ${arc} degrees`);assert.ok(fit.designPressure<=pressure);
  assert.equal(fit.r,2.51);assert.equal(fit.arc,arc);assert.equal(fit.needsReview,false);
  assert.equal(flow.headFlow(fit).sectorEstimated,true);
  assert.ok(auto.selectAutomaticRadius(sector.radius,pressure,models));
  assert.equal(store.getState().placeAutomaticHead(sector,pressure),true);
  const placed=store.getState().project.heads[0];
  assert.deepEqual([placed.catalogId,placed.nozzleId,placed.designPressure],[fit.catalogId,fit.nozzleId,fit.designPressure]);
  assert.deepEqual([placed.x,placed.y,placed.r,placed.start,placed.arc],[3,4,2.51,323,arc]);
  assert.equal(flow.headFlow(placed).sectorEstimated,true);assert.equal(store.getState().past.length,1);
  store.getState().undo();assert.equal(store.getState().project.heads.length,0);
  store.getState().redo();assert.equal(store.getState().project.heads[0].arc,arc);
 }
});

test('manual Hunter Pro HE settings preserve a valid 2.51 m radius together with 60/77-degree sectors',()=>{
 for(const [id,pressure] of [['8A-HE',2.8],['10A-HE',1.4],['10A-HE',1.7],['10A-HE',2.1]])for(const arc of [60,77]){
  const item=cat.itemById(id),original=head(item,{designPressure:pressure,bodyId:'PRO-SPRAY'});
  const edited=updateHeadSettings(original,{r:2.51,arc,designPressure:pressure});
  assert.equal(edited.r,2.51,`${id} / ${pressure} bar / ${arc} degrees`);assert.equal(edited.arc,arc);assert.equal(edited.designPressure,pressure);
  assert.ok(flow.headFlow(edited).lpm>0);assert.equal(flow.headFlow(edited).sectorEstimated,true);
  assert.equal(updateHeadSettings(edited,{start:53}).r,2.51,'rotating the head must not restore the old global minimum radius');
 }
});

test('180-degree HE peers accept 60/77-degree heads at identical model, radius and pressure, while different settings remain separate',()=>{
 for(const [id,pressure] of [['8A-HE',2.8],['10A-HE',2.1]]){
  const item=cat.itemById(id),fit180=auto.selectAutomaticHead(2.51,180,pressure,[item]);assert.ok(fit180,id);
  const peer=head(item,fit180);
  for(const arc of [60,77]){
   reset([peer]);
   const peers=auto.automaticZonePeers(store.getState().project.heads,1,models),fit=auto.selectAutomaticHead(2.51,arc,pressure,models,peers);
   assert.equal(peers.length,1);assert.ok(fit,`${id} / ${arc}`);assert.equal(fit.catalogId,id);
   assert.equal(hydro.hydroKey(head(item,fit)),hydro.hydroKey(peer));
   assert.ok(auto.selectAutomaticRadius(2.51,pressure,models,peers));
   const sector={center:{x:7,y:8},radius:2.51,start:10,arc};
   assert.equal(store.getState().placeAutomaticHead(sector,pressure),true);
   const placed=store.getState().project.heads.at(-1);assert.equal(placed.catalogId,fit.catalogId);assert.equal(placed.zone,peer.zone);
  }
  const different=head(item,{...fit180,id:'different-radius',r:2.41});
  assert.ok(flow.headFlow(different).lpm>0);assert.notEqual(hydro.hydroKey(different),hydro.hydroKey(peer));
  assert.equal(auto.selectAutomaticHead(2.41,60,pressure,[item],[peer]),null,'a different screw setting must not silently inherit the matched class');
  const assigned=hydro.distributeZones([peer,different],100);
  assert.notEqual(assigned.heads.find(h=>h.id===peer.id).zone,assigned.heads.find(h=>h.id===different.id).zone);
  assert.notEqual(hydro.hydroKey(head(item,{...fit180,designPressure:pressure-.1})),hydro.hydroKey(peer),'working pressure remains part of compatibility');
 }
});

test('HE watering particles and the wetted surface follow the actual 60/77-degree sector, including rotation across north',()=>{
 for(const [id,pressure] of [['8A-HE',2.8],['10A-HE',2.1]])for(const arc of [60,77])for(const start of [37,323]){
  const item=cat.itemById(id),fit=auto.selectAutomaticHead(2.51,arc,pressure,[item]),h=head(item,{...fit,start}),before=JSON.stringify(h);
  assert.ok(fit);const profile=water.wateringProfile(h);assert.equal(profile.kind,'fan');
  const area=geometry.surfaceArea(geometry.headSurface(h)),ideal=Math.PI*h.r*h.r*arc/360;
  assert.ok(Math.abs(area-ideal)/ideal<.002,'footprint area must be the requested sector, not a 90-degree fallback');
  const at=(offset,distance=h.r*.7)=>({x:h.x+Math.cos((start+offset)*Math.PI/180)*distance,y:h.y+Math.sin((start+offset)*Math.PI/180)*distance});
  assert.equal(coverage.headCovers(h,at(arc/2)),true);
  for(const offset of [-2,arc+2,180])assert.equal(coverage.headCovers(h,at(offset)),false);
  assert.equal(coverage.headCovers(h,at(arc/2,h.r+.05)),false);
  let count=0;
  for(const seconds of [0,1,9.25,41])for(let index=0;index<water.wateringParticleCount(profile);index+=7){
   for(const drop of [water.wateringDrop(h,seconds,index,profile),water.wateringMicroDrop(h,seconds,index,profile)]){
    if(!drop)continue;count++;assert.ok(Math.hypot(drop.x,drop.y)<=h.r+1e-7);
    const offset=((Math.atan2(drop.y,drop.x)*180/Math.PI-start)%360+360)%360;
    if(Math.hypot(drop.x,drop.y)>1e-8)assert.ok(offset<=arc+1e-7||offset>=360-1e-7);
   }
  }
  assert.ok(count>100);assert.equal(JSON.stringify(h),before,'simulation must not change saved settings');
 }
});

test('automatic inspector exposes the HE sector estimate and enables placement for both requested small sectors',async()=>{
 const React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const {AutomaticHeadPanel}=await server.ssrLoadModule('/src/components/designer/automatic-head-tool.tsx');
 for(const locale of ['en','ru']){
  i18n.setActiveLocale(locale);
  for(const arc of [60,77]){
   const sector={center:{x:3,y:4},radius:2.51,start:0,arc},fit=auto.selectAutomaticHead(2.51,arc,2.1,models);
   const props={center:sector.center,sector,radius:sector.radius,fit,pressure:2.1,failed:false,units:store.getState().units,groupLabel:'Pro HE',cancel(){},finish(){},restart(){},setPressure(){},editSector(){}};
   const markup=renderToStaticMarkup(React.createElement(AutomaticHeadPanel,props));
   assert.match(markup,/data-match="true"/);assert.match(markup,/10A-HE/);
   assert.ok(markup.includes(i18n.text('flowSectorEstimate')),'estimated flow must never look like a separately published chart row');
   assert.ok(markup.includes(i18n.text('autoHead.place')));assert.doesNotMatch(markup,/<button[^>]*disabled/);
   const exact=auto.selectAutomaticHead(2.51,90,2.1,models);
   const officialMarkup=renderToStaticMarkup(React.createElement(AutomaticHeadPanel,{...props,fit:exact,sector:{...sector,arc:90}}));
   assert.ok(!officialMarkup.includes(i18n.text('flowSectorEstimate')));
  }
 }
 i18n.setActiveLocale('en');
});
