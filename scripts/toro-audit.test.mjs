import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
let server,cat,flow,water,geo,coverage,library,auto,display,models,store,emptyProject;
before(async()=>{
 server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 const load=name=>server.ssrLoadModule('/src/lib/'+name+'.ts');
 [cat,flow,water,geo,coverage,library,auto,display,{useProject:store},{emptyProject}]=await Promise.all(['equipment-catalog','flow','watering-preview','irrigation-geometry','coverage','equipment-library','automatic-head','precipitation-display','project-store','project-types'].map(load));
 models=cat.CATALOG.filter(m=>m.manufacturerId==='toro'&&m.type!=='body');
});
after(async()=>server?.close());
const head=(m,patch={})=>({...flow.catalogHeadDefaults(m),id:'audit-'+m.id,catalogId:m.id,x:0,y:0,start:37,zone:1,locked:false,...patch});
// Full published pressure tables require an unregulated compatible body.
const unregulated=m=>cat.mountingKind(m)==='spray'?{bodyId:cat.bodiesFor(m).find(b=>b.regulatedPressureBar==null).id}:{};
const point=(n,r,arc=r.arcDeg)=>({nozzleId:n.id,pressureBar:r.pressureBar,radius:r.radiusM,arc});
const close=(a,b,msg)=>assert.ok(a!=null&&Math.abs(a-b)<1e-6,`${msg}: ${a} != ${b}`);

test('PSN15 full-circle thread variants use the current dedicated chart without extending its pressure domain',()=>{
 for(const id of ['toro:PSN15-F','toro:PSN15T-F']){
  const m=cat.itemById(id),n=m.nozzles[0];
  assert.equal(m.verificationStatus,'Verified');assert.equal(m.geometryVerificationStatus,'Verified');
  assert.equal(n.performance.length,4);const row=n.performance[1];
  close(row.flowLMin,2.31*3.785411784,id+' current30psi discharge');close(row.radiusM,15*.3048,id+' current30psi throw');
  assert.ok(flow.computeFlow(m,point(n,row)).lpm>0);
  assert.equal(flow.performanceAt(m,n.id,60*.0689475729318,360),null,'older60psi row is not merged');
 }
});

test('Toro compatibility groups and inner series cover every available model without duplication',async()=>{
 const groups=await server.ssrLoadModule('/src/lib/equipment-groups.ts');
 const tabs=groups.equipmentGroupsFor('toro');
 assert.deepEqual(tabs.map(c=>c.id),['precision','rotor']);
 const counts=[204,13],ids=[];
 tabs.forEach((tab,index)=>{
  const items=groups.equipmentGroupCatalog(cat.CATALOG,'toro',tab.id);
  assert.equal(items.length,counts[index]);ids.push(...items.map(m=>m.id));
  assert.equal(groups.equipmentGroupSelection('toro',tab.id),tab.id);
  const inner=groups.equipmentSeriesOptions(items);
  const mapped=inner.flatMap(series=>items.filter(item=>groups.equipmentInnerSeries(item)===series).map(item=>item.id));
  assert.equal(new Set(mapped).size,items.length);
  assert.deepEqual(mapped.sort(),items.map(item=>item.id).sort());
 });
 assert.equal(new Set(ids).size,217);
 assert.deepEqual(ids.sort(),models.map(item=>item.id).sort());
 for(const old of ['all','precision-plus','strips','fixed','specialty','prostrip'])assert.equal(groups.equipmentGroupSelection('toro',old),'precision');
 store.setState({project:emptyProject()});store.getState().setEquipmentFilters({manufacturerId:'toro'});
 assert.equal(store.getState().familyFilter,'precision');
 for(const tab of tabs){store.getState().setFamily(tab.id);const restored=store.persist.getOptions().merge({equipmentFilters:{manufacturerId:'toro'},familyFilter:tab.id},store.getState());assert.equal(restored.familyFilter,tab.id);}
 const spray=groups.equipmentGroupCatalog(cat.CATALOG,'toro','precision'),series=groups.equipmentSeriesOptions(spray);
 assert.equal(series.length,12);
 for(const id of ['PSN5','PSN8','PSN10','PSN12','PSN15','O-5','O-8','O-10','O-12','O-15']){
  const rows=spray.filter(item=>groups.equipmentInnerSeries(item)===id);
  assert.equal(rows.length,18,id);assert.equal(new Set(rows.map(item=>item.arcMin)).size,9);
  assert.equal(rows.filter(item=>item.nozzleThread==='female').length,9);
  assert.equal(rows.filter(item=>item.nozzleThread==='male').length,9);
 }
 for(const id of ['PSN+ Strip','Precision Strip'])assert.equal(spray.filter(item=>groups.equipmentInnerSeries(item)===id).length,12,id);
 const {EquipmentSeriesSelector}=await server.ssrLoadModule('/src/components/designer/equipment-library-controls.tsx');
 for(const value of ['PSN12','O-12']){
  const markup=renderToStaticMarkup(createElement(EquipmentSeriesSelector,{series,value,onChange(){}}));
  assert.equal((markup.match(/<option/g)??[]).length,12);
  assert.equal((markup.match(/selected=""/g)??[]).length,1);
  assert.ok(markup.includes(`value="${value}" selected=""`));
 }
});

test('all 1596 Toro rows preserve published flow, SI conversion, precipitation and source-review gating',()=>{
 let count=0;
 for(const m of models)for(const n of m.nozzles)for(const row of n.performance){
  const p=point(n,row),result=flow.computeFlow(m,p);count++;
  close(row.flowM3H,row.flowLMin*.06,m.id+' canonical flow rounding');
  if(m.verificationStatus==='Needs Review'&&m.hydraulicVerificationStatus!=='Verified'){assert.equal(result.lpm,null,m.id);continue;}
  close(result.lpm,row.flowLMin,m.id);close(result.m3h,row.flowLMin*.06,m.id);
  if(!m.strip){close(result.precipMmHr,row.precipSquareMmH,m.id);close(result.precipTriangleMmHr,row.precipTriangleMmH,m.id);}
  const between=n.performance.find(r=>r.arcDeg===row.arcDeg&&r.pressureBar>row.pressureBar);
  if(between){const pressure=(row.pressureBar+between.pressureBar)/2,radius=(row.radiusM+between.radiusM)/2;
   close(flow.computeFlow(m,{...p,pressureBar:pressure,radius}).lpm,(row.flowLMin+between.flowLMin)/2,m.id+' bounded interpolation');}
  if(m.type==='rotor')for(const arc of [40,90,270,360]){
   const r=flow.computeFlow(m,{...p,arc});close(r.lpm,row.flowLMin,m.id+' sweep-independent discharge');
   close(r.precipMmHr,row.precipSquareMmH*180/arc,m.id+' actual sweep');
  }
 }
 assert.equal(count,1596);
});

test('every Toro model rejects unsupported pressure/nozzle/sector without invented coverage or water',()=>{
 for(const m of models){
  const h=head(m);
  const invalid=[{designPressure:m.recommendedPressureMin-.1},{designPressure:m.recommendedPressureMax+.1},{designPressure:NaN},{nozzleId:'missing-nozzle'},{arc:0},{arc:361},{r:-1}];
  if(!m.strip)invalid.push({r:1000},{r:0});
  for(const patch of invalid){const bad={...h,...patch};
   assert.equal(water.wateringProfile(bad).kind,'unknown',m.id+JSON.stringify(patch));
   assert.deepEqual(geo.headSurface(bad),[],m.id);assert.equal(coverage.headCovers(bad,{x:0,y:0}),false,m.id);
  }
  if(m.geometryVerificationStatus==='Needs Review'||m.verificationStatus==='Needs Review'&&m.geometryVerificationStatus!=='Verified'){
   assert.equal(water.wateringProfile(h).kind,'unknown',m.id);assert.deepEqual(geo.headSurface(h),[]);
  }
 }
});

test('Toro fan/strip/rotor drops and fine spray stay inside each rotated pressure-dependent footprint',()=>{
 for(const m of models){
  if(m.verificationStatus==='Needs Review'&&m.geometryVerificationStatus!=='Verified')continue;
  for(const n of m.nozzles){
   for(const row of [n.performance[0],n.performance.at(-1)])for(const start of [0,37,201]){
    const h=head(m,{...unregulated(m),nozzleId:n.id,designPressure:row.pressureBar,r:row.radiusM,arc:m.type==='rotor'?90:row.arcDeg,start});
    const before=JSON.stringify(h),p=water.wateringProfile(h),a=start*Math.PI/180;
    assert.equal(p.kind,m.strip?'strip-fan':m.type==='rotor'?'rotor':'fan',m.id);
    const check=d=>{if(!d)return;assert.ok(Number.isFinite(d.x)&&Number.isFinite(d.y),m.id);
     const x=d.x*Math.cos(a)+d.y*Math.sin(a),y=-d.x*Math.sin(a)+d.y*Math.cos(a),e=1e-7;
     if(p.strip){assert.ok(x>=p.strip.ox-e&&x<=p.strip.ox+p.strip.l+e&&y>=p.strip.oy-e&&y<=p.strip.oy+p.strip.w+e,m.id);}
     else{assert.ok(Math.hypot(x,y)<=h.r+e,m.id);const angle=(Math.atan2(y,x)*180/Math.PI+360)%360;assert.ok(h.arc===360||angle<=h.arc+e||angle>=360-e,m.id);}
    };
    for(const seconds of [0,9.25,41]){
     for(let i=0;i<water.wateringParticleCount(p);i+=17)check(water.wateringDrop(h,seconds,i,p));
     for(let i=0;i<720;i+=13)check(water.wateringMicroDrop(h,seconds,i,p));
    }
    assert.equal(JSON.stringify(h),before,'animation never edits engineering data');
   }
  }
 }
});

test('Toro strips keep left/right/side origins and pressure-specific dimensions',()=>{
 for(const m of models.filter(m=>m.strip))for(const row of m.stripPerformance){
  const s=cat.stripAtPressure(m,row.pressureBar),h=head(m,{...unregulated(m),designPressure:row.pressureBar,start:90});
  close(s.w,row.w,m.id);close(s.l,row.l,m.id);close(s.oy,-s.w,m.id);
  close(s.ox,m.modelId.endsWith('LCS')?0:m.modelId.endsWith('RCS')?-s.l:-s.l/2,m.id);
  close(geo.surfaceArea(geo.headSurface(h)),s.w*s.l,m.id+' rectangle area');
  assert.equal(water.wateringProfile(h).strip.l,s.l);
 }
});

test('T5 reverses at 360 degrees and 359-degree spray stays inside the small unwatered gap',()=>{
 for(const m of models.filter(m=>m.type==='rotor')){
  const h=head(m,{arc:360,start:0}),p={...water.wateringProfile(h),phaseSeconds:0};
  assert.equal(p.fullCircleReversing,true);const period=p.rotationSeconds;
  close(water.wateringJets(h,period*.75,p)[0].angle,Math.PI*1.5,m.id);
  close(water.wateringJets(h,period*1.25,p)[0].angle,Math.PI*1.5,m.id+' reverse');
  close(water.wateringJets(h,period*1.5,p)[0].angle,Math.PI,m.id+' returns');
  const partial={...h,arc:359},profile=water.wateringProfile(partial);
  for(const seconds of [74.7,75,149.3])for(let i=0;i<720;i++){
   const d=water.wateringMicroDrop(partial,seconds,i,profile);
   const angle=(Math.atan2(d.y,d.x)*180/Math.PI+360)%360;
   assert.ok(angle<=359+1e-7||angle>=360-1e-7,m.id+' sector edge');
  }
 }
 const hunter=cat.itemById('PGP-ADJ'),h=head(hunter,{arc:360,start:0}),p={...water.wateringProfile(h),phaseSeconds:0};
 close(water.wateringJets(h,p.rotationSeconds*1.25,p)[0].angle,Math.PI/2,'other rotor mechanisms unchanged');
});

test('Toro strip rates keep both published layout columns and a clearly marked reference run time',async()=>{
 const {PrecipitationStats}=await server.ssrLoadModule('/src/components/designer/precipitation-stats.tsx');
 const {tr,setActiveLocale}=await server.ssrLoadModule('/src/lib/i18n.ts');
 const {METRIC_UNITS,setActiveUnits}=await server.ssrLoadModule('/src/lib/units.ts');
 setActiveLocale('en');setActiveUnits(METRIC_UNITS);Object.assign(store.getInitialState(),{locale:'en',units:METRIC_UNITS});
 let rows=0;
 for(const m of models.filter(m=>m.strip))for(const n of m.nozzles)for(const row of n.performance){
  const result=display.displayPrecipitation(m,point(n,row));
  assert.equal(result.basis,'strip-layout');assert.equal(result.rate,row.precipSquareMmH);assert.equal(result.triangle,row.precipTriangleMmH);
  assert.equal(flow.computeFlow(m,point(n,row)).precipMmHr,null,'source strip rates do not change zone compatibility');
  close(flow.runTimeMin(10,result.rate),600/row.precipSquareMmH,m.id);rows++;
 }
 assert.equal(rows,96);
 const m=models.find(m=>m.strip),n=m.nozzles[0],value=display.displayPrecipitation(m,point(n,n.performance[0]));
 const markup=renderToStaticMarkup(createElement(PrecipitationStats,{value,targetMm:10}));
 assert.ok(markup.includes(tr('en','precipStripSquare'))&&markup.includes(tr('en','precipStripTriangle'))&&markup.includes(tr('en','precipStripPublished')));
});

test('LP bodies accept the published 15 psi lower limit and shrub check valve stays explicitly unverified',async()=>{
 const low=cat.CATALOG.filter(m=>m.manufacturerId==='toro'&&m.type==='body'&&m.modelId.includes('LP'));
 assert.equal(low.length,7);for(const m of low)close(m.recommendedPressureMin,15*.0689475729318,m.id);
 const {HeadPlacementSettings}=await server.ssrLoadModule('/src/components/designer/head-placement-settings.tsx');
 const {tr}=await server.ssrLoadModule('/src/lib/i18n.ts');
 for(const id of ['toro:T5S-RS','toro:T5SE-RS']){
  const m=cat.itemById(id);assert.ok(!m.bodyFeatures.includes('CV'));assert.deepEqual(m.unverifiedBodyFeatures,['CV']);assert.ok(flow.headFlow(head(m)).lpm>0);
  const markup=renderToStaticMarkup(createElement(HeadPlacementSettings,{item:m,head:head(m)}));assert.ok(markup.includes(tr('en','equipment.needsReview')));
 }
});

test('O radius floor uses original designated radius; reduced flow stays an estimate and T5 flow stays unknown',()=>{
 for(const m of models.filter(m=>m.modelId.startsWith('O-')&&!m.strip)){
  const n=m.nozzles[0],row=n.performance.at(-1),range=flow.radiusRange(m,n.id,row.pressureBar,row.arcDeg);
  close(range.min,m.rMin,m.id);const result=flow.computeFlow(m,{...point(n,row),radius:range.min});
  assert.equal(result.kind,'matched-precip');close(result.lpm,row.flowLMin*(range.min/row.radiusM)**2,m.id);
  close(result.precipMmHr,row.precipSquareMmH,m.id);
 }
 for(const m of models.filter(m=>m.type==='rotor')){
  const h=head(m),range=flow.radiusRange(m,h.nozzleId,h.designPressure,h.arc),r=(range.min+range.max)/2;
  assert.equal(flow.headFlow({...h,r}).lpm,null,m.id);assert.equal(water.wateringProfile({...h,r}).kind,'rotor',m.id+' supported geometry with unknown reduced discharge');
 }
});

test('automatic Toro choice stays within the selected top group and excludes disputed hydraulics',()=>{
 for(const group of ['precision','rotor']){
  const scope=auto.automaticHeadCatalog('toro',group);
  for(const m of scope.filter(m=>m.verificationStatus==='Verified'&&auto.automaticCandidateSupported(m))){
   const h=head(m),fit=auto.selectAutomaticHead(h.r,h.arc,h.designPressure,scope);
   assert.ok(fit,m.id);assert.ok(scope.some(m=>m.id===fit.catalogId));assert.ok(flow.headFlow(fit).lpm>0);
  }
 }
});

test('Toro library and sectors use verified identification colors without changing saved hydraulics',async()=>{
 const {EquipmentLibraryCard}=await server.ssrLoadModule('/src/components/designer/designer-app.tsx');
 const {catalogColor}=await server.ssrLoadModule('/src/lib/catalog-localization.ts');
 const {LOCALES}=await server.ssrLoadModule('/src/lib/locale-config.ts');
 for(const m of models){
  assert.ok(m.colorSourceUrl&&m.colorVerifiedOn,m.id);
  const saved=cat.equipmentSnapshot(m),n=cat.defaultNozzle(saved);
  saved.color='#ff00ff';saved.colorName='Unknown';for(const nozzle of saved.nozzles){nozzle.color='#ff00ff';nozzle.colorName='Unknown';}
  const before=JSON.stringify(saved),expected=cat.equipmentAppearance(m,n?.id);
  assert.deepEqual(cat.equipmentAppearance(saved,n?.id),expected,m.id);assert.equal(JSON.stringify(saved),before);
  const card=renderToStaticMarkup(createElement(EquipmentLibraryCard,{item:m,selected:false,onSelect(){}}));
  assert.ok(card.includes(expected.color));assert.doesNotMatch(card,/<img|<image/);
  for(const {id}of LOCALES)assert.notEqual(catalogColor(expected.colorName,id),undefined);
 }
});
