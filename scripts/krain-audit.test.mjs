import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
let server,cat,flow,water,geo,coverage,library,auto,display,models;
before(async()=>{
 server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 [cat,flow,water,geo,coverage,library,auto,display]=await Promise.all(['equipment-catalog','flow','watering-preview','irrigation-geometry','coverage','equipment-library','automatic-head','precipitation-display'].map(n=>server.ssrLoadModule('/src/lib/'+n+'.ts')));
 models=cat.CATALOG.filter(m=>m.manufacturerId==='k-rain');
});
after(async()=>server?.close());
const near=(a,b,msg='')=>assert.ok(a!=null&&Math.abs(a-b)<1e-6,`${msg}: ${a} != ${b}`);
const point=(n,r)=>({nozzleId:n.id,pressureBar:r.pressureBar,arc:r.arcDeg,radius:r.radiusM});
const head=(m,patch={})=>({id:'audit-'+m.id,catalogId:m.id,x:0,y:0,start:37,zone:1,locked:false,...flow.catalogHeadDefaults(m),...patch});

test('K-Rain tabs partition every placeable model, include five actual Bubblers and preserve thread variants',()=>{
 const tabs=library.equipmentCategoriesFor('k-rain'),ids=[];
 assert.deepEqual(tabs.map(t=>t.id),['rotary','kvf','kv','fixed','strips','rotor','bubbler']);
 const expected=[15,6,5,24,6,9,5];
 for(const [i,t]of tabs.entries()){
  const list=library.filterEquipment(cat.CATALOG,{manufacturerId:'k-rain',category:t.id});
  assert.equal(list.length,expected[i],t.id);ids.push(...list.map(m=>m.id));
 }
 assert.equal(new Set(ids).size,70);assert.equal(ids.length,70);
 assert.deepEqual(ids.sort(),library.filterEquipment(cat.CATALOG,{manufacturerId:'k-rain'}).map(m=>m.id).sort());
 const general=library.equipmentCategoriesFor('all').flatMap(t=>library.filterEquipment(cat.CATALOG,{manufacturerId:'all',category:t.id}).filter(m=>m.manufacturerId==='k-rain'));
 assert.equal(general.length,70);assert.equal(new Set(general.map(m=>m.id)).size,70);
 assert.equal(library.equipmentCategorySelection('k-rain','specialty'),'strips');
 assert.equal(library.equipmentCategorySelection('k-rain','spray'),'kvf');
 assert.ok(ids.includes('k-rain:P15CS')&&ids.includes('k-rain:FN-15CS'));
});

test('every K-Rain source row uses verified discharge and canonical units; disputed points cannot interpolate',()=>{
 let baseRows=0,blocked=0;
 for(const m of models)for(const n of m.nozzles)for(const row of n.performance){
  if(m.type!=='bubbler')baseRows++;
  near(row.flowM3H,row.flowLMin*.06,m.id);near(row.pressureKPa,row.pressureBar*100,m.id);
  const result=flow.computeFlow(m,point(n,row));
  if(row.verificationStatus==='Needs Review'){
   assert.equal(result.lpm,null,m.id);assert.equal(flow.geometryAt(m,n.id,row.pressureBar,row.arcDeg),null);blocked++;
  }else{
   near(result.lpm,row.flowLMin,m.id);
   if(m.type==='rotor'){
    const quarter=flow.computeFlow(m,{...point(n,row),arc:90});near(quarter.lpm,row.flowLMin,m.id);
    if(row.precipSquareMmH!=null)near(quarter.precipMmHr,row.precipSquareMmH*2,m.id);
   }
  }
  const next=n.performance.filter(r=>r.arcDeg===row.arcDeg&&r.pressureBar>row.pressureBar).sort((a,b)=>a.pressureBar-b.pressureBar)[0];
  if(next){
   const mid={...point(n,row),pressureBar:(row.pressureBar+next.pressureBar)/2,radius:(row.radiusM+next.radiusM)/2};
   const result=flow.computeFlow(m,mid);
   if(row.verificationStatus==='Needs Review'||next.verificationStatus==='Needs Review')assert.equal(result.lpm,null,m.id+' no bridging disputed row');
   else near(result.lpm,(row.flowLMin+next.flowLMin)/2,m.id+' bounded interpolation');
  }
 }
 assert.equal(baseRows,764);assert.equal(blocked,17);
});

test('valid K-Rain pressure/arc/nozzle combinations have matching geometry and invalid ones never simulate coverage',()=>{
 for(const m of models.filter(m=>m.type!=='body')){
  const h=head(m);
  const invalid=[{designPressure:NaN},{designPressure:m.recommendedPressureMin-.1},{designPressure:m.recommendedPressureMax+.1},{nozzleId:'missing'},{arc:361},{r:-1}];
  if(!m.strip&&m.coverageKind!=='point')invalid.push({r:1e4},{r:0});
  for(const patch of invalid){const bad={...h,...patch};
   assert.equal(water.wateringProfile(bad).kind,'unknown',m.id+JSON.stringify(patch));
   assert.deepEqual(geo.headSurface(bad),[],m.id);assert.equal(coverage.headCovers(bad,{x:0,y:0}),false,m.id);
  }
  if(m.placementSupported===false){assert.deepEqual(geo.headSurface(h),[]);assert.equal(water.wateringProfile(h).kind,'unknown');}
 }
});

test('all verified K-Rain nozzle and rotor animations remain inside their rotated footprints',()=>{
 for(const m of models.filter(m=>m.type!=='body'&&m.type!=='bubbler'&&m.placementSupported!==false))for(const n of m.nozzles){
  const usable=n.performance.filter(r=>r.verificationStatus!=='Needs Review');
  for(const row of [usable[0],usable.at(-1)].filter(Boolean))for(const start of [0,37,201]){
   const body=cat.mountingKind(m)==='spray'?cat.bodiesFor(m).find(b=>b.regulatedPressureBar==null):null;
   const h=head(m,{...(body?{bodyId:body.id}:{}),nozzleId:n.id,designPressure:row.pressureBar,r:row.radiusM,arc:m.type==='rotor'?90:row.arcDeg,start});
   const p=water.wateringProfile(h),a=start*Math.PI/180,prior=JSON.stringify(h);
   assert.notEqual(p.kind,'unknown',m.id);
   assert.ok(geo.surfaceArea(geo.headSurface(h))>0,m.id);
   const check=d=>{if(!d)return;const x=d.x*Math.cos(a)+d.y*Math.sin(a),y=-d.x*Math.sin(a)+d.y*Math.cos(a),eps=1e-7;
    assert.ok(Number.isFinite(x)&&Number.isFinite(y));
    if(p.strip)assert.ok(x>=p.strip.ox-eps&&x<=p.strip.ox+p.strip.l+eps&&y>=p.strip.oy-eps&&y<=p.strip.oy+p.strip.w+eps,m.id);
    else{assert.ok(Math.hypot(x,y)<=h.r+eps,m.id);const angle=(Math.atan2(y,x)*180/Math.PI+360)%360;assert.ok(h.arc===360||angle<=h.arc+eps||angle>=360-eps,m.id);}
   };
   for(const t of [0,9.25,41]){
    for(let i=0;i<water.wateringParticleCount(p);i+=17)check(water.wateringDrop(h,t,i,p));
    for(let i=0;i<720;i+=13)check(water.wateringMicroDrop(h,t,i,p));
   }
   assert.equal(JSON.stringify(h),prior);
  }
 }
});

test('K-Rain radius reduction follows each pressure row and published reduced points, never a nominal floor',()=>{
 for(const id of ['k-rain:RN100-ADJ','k-rain:RN200-ADJ','k-rain:RN300-ADJ']){
  const m=cat.itemById(id),n=m.nozzles[0];
  for(const row of n.performance){const range=flow.radiusRange(m,n.id,row.pressureBar,row.arcDeg);near(range.min,row.radiusM*.7,id);
   const r=flow.computeFlow(m,{...point(n,row),radius:range.min});near(r.lpm,row.flowLMin*.49,id);assert.equal(r.kind,'matched-precip');
  }
 }
 for(const m of models.filter(m=>m.reductionPerformance))for(const r of m.reductionPerformance){
  const base=flow.performanceAt(m,r.nozzleId,r.pressureBar,r.arcDeg);
  const result=flow.computeFlow(m,{nozzleId:r.nozzleId,pressureBar:r.pressureBar,arc:r.arcDeg,radius:r.radiusM});
  if(r.verificationStatus==='Needs Review'||!base)assert.equal(result.lpm,null,m.id+' disputed reduced point');
  else{near(result.lpm,r.flowLMin,m.id+' published reduced endpoint');assert.equal(result.kind,'table');}
 }
});

test('inspector and live canvas editing retain the selected pressure-specific reduced radius',async()=>{
 const {updateHeadSettings,useProject}=await server.ssrLoadModule('/src/lib/project-store.ts');
 const {emptyProject}=await server.ssrLoadModule('/src/lib/project-types.ts');
 for(const id of ['k-rain:MiniPro','k-rain:RPS75i','k-rain:SuperPro']){
  const m=cat.itemById(id),n=m.nozzles[0],row=n.performance[0];
  const h=head(m,{nozzleId:n.id,designPressure:row.pressureBar,r:row.radiusM,arc:180});
  const r=flow.radiusRange(m,n.id,row.pressureBar,180).min;
  const updated=updateHeadSettings(h,{nozzleId:n.id,r});near(updated.r,r,id+' inspector');
  useProject.setState({project:{...emptyProject(),heads:[h]},past:[],future:[],pastOps:[],futureOps:[]});
  useProject.getState().patchHeadLive(h.id,{nozzleId:n.id,r});near(useProject.getState().project.heads[0].r,r,id+' live');
  useProject.getState().endHeadEdit();near(useProject.getState().project.heads[0].r,r,id+' committed');
 }
 const m=cat.itemById('k-rain:P12Q'),h=head(m,{designPressure:1.4,r:3.4,arc:90});
 assert.equal(updateHeadSettings(h,{designPressure:1.4}).needsReview,false,'verified row has no whole-model warning');
 assert.equal(updateHeadSettings(h,{designPressure:2.1}).needsReview,true,'disputed point remains flagged');
 const rotor=cat.itemById('k-rain:RPS75i'),reduced=head(rotor,{nozzleId:'k-rain:RPS75i:standard-1.0',designPressure:2.1,r:7,arc:180});
 near(flow.headFlow(reduced).lpm,2.9);
 const quarter=updateHeadSettings(reduced,{arc:90});near(quarter.r,7);near(flow.headFlow(quarter).lpm,2.9,'sector change preserves available published reduced flow');
 assert.equal(quarter.needsReview,false);
});

test('four compensated Bubblers have pressure-independent flow without an invented irrigated area; adjustable flow is unknown',()=>{
 assert.equal(library.filterEquipment(cat.CATALOG,{manufacturerId:'k-rain',category:'bubbler',pressure:2.1}).length,5);
 assert.equal(library.filterEquipment(cat.CATALOG,{manufacturerId:'k-rain',category:'bubbler',pressure:3.6}).length,0);
 for(const [id,q]of [['TB-025',.95],['TB-05',1.9],['TB-10',3.8],['TB-20',7.6],['TB-ADJ',null]]){
  const m=cat.itemById('k-rain:'+id);assert.ok(m);assert.equal(cat.mountingKind(m),'riser');
  assert.deepEqual(flow.pressureRange(m,m.nozzles[0].id,360),{min:1.4,max:3.5});
  for(const p of [1.4,2.1,2.8,3.5]){
   const h=head(m,{designPressure:p}),result=flow.headFlow(h),preview=water.wateringProfile(h);
   if(q==null)assert.equal(result.lpm,null);else near(result.lpm,q,id);
   assert.equal(preview.kind,'flood');assert.equal(preview.bubblePattern,'umbrella');
   assert.deepEqual(geo.headSurface(h),[]);assert.equal(coverage.headCovers(h,{x:0,y:0}),false);
   assert.equal(display.displayPrecipitation(m,{nozzleId:h.nozzleId,arc:h.arc,pressureBar:p,radius:0}).basis,'flow-only');
  }
 }
});

test('rotor full-circle animation follows confirmed mechanisms; unknown mechanisms preserve coverage without a guessed sweep',()=>{
 for(const m of models.filter(m=>m.type==='rotor')){
  const n=m.nozzles[0],r=n.performance.find(r=>r.verificationStatus!=='Needs Review');
  const h=head(m,{nozzleId:n.id,designPressure:r.pressureBar,r:r.radiusM,arc:360,start:0}),p={...water.wateringProfile(h),phaseSeconds:0};
  assert.ok(geo.surfaceArea(geo.headSurface(h))>0,m.id);
  if(m.fullCircleRotation==='unknown')assert.equal(p.kind,'unknown',m.id);
  else{
   assert.equal(p.kind,'rotor');near(water.wateringJets(h,p.rotationSeconds*1.25,p)[0].angle,m.fullCircleRotation==='reversing'?Math.PI*1.5:Math.PI/2,m.id);
  }
 }
});

test('missing rotor precipitation is explicitly calculated only for verified full-radius operation',()=>{
 const m=cat.itemById('k-rain:RPS75-PR'),h=head(m),point={nozzleId:h.nozzleId,pressureBar:h.designPressure,arc:h.arc,radius:h.r};
 const raw=flow.computeFlow(m,point),d=display.displayPrecipitation(m,point);
 assert.equal(raw.precipMmHr,null);assert.equal(d.calculated,true);near(d.rate,60*raw.lpm*360/(h.arc*h.r*h.r));
 near(d.triangle,d.rate/(Math.sqrt(3)/2));near(flow.runTimeMin(10,d.rate),600/d.rate);
 assert.equal(display.displayPrecipitation(m,{...point,radius:h.r*.9}).rate,null);
 const p12=cat.itemById('k-rain:P12Q'),n=p12.nozzles[0],bad=n.performance.find(r=>r.verificationStatus==='Needs Review');
 assert.equal(display.displayPrecipitation(p12,pointFrom(n,bad)).rate,null);
 function pointFrom(n,r){return {nozzleId:n.id,pressureBar:r.pressureBar,arc:r.arcDeg,radius:r.radiusM};}
});

test('automatic selection can use a verified row of a partially reviewed model, but not its conflicting row',()=>{
 const m=cat.itemById('k-rain:P12Q');
 const good=auto.selectAutomaticHead(3.4,90,1.4,[m]);assert.ok(good);near(flow.headFlow(good).lpm,1.5);
 assert.equal(auto.selectAutomaticHead(4.3,90,2.1,[m]),null);
});

test('K-Rain colors and row warnings render without photos or hydraulic snapshot mutation',async()=>{
 const {EquipmentLibraryCard,CatalogInfo}=await server.ssrLoadModule('/src/components/designer/designer-app.tsx');
 const {tr,setActiveLocale}=await server.ssrLoadModule('/src/lib/i18n.ts');setActiveLocale('en');
 const {useProject}=await server.ssrLoadModule('/src/lib/project-store.ts');Object.assign(useProject.getInitialState(),{locale:'en'});
 for(const m of models.filter(m=>m.type!=='body')){
  const n=cat.defaultNozzle(m),appearance=cat.equipmentAppearance(m,n?.id),saved=cat.equipmentSnapshot(m);
  const markup=renderToStaticMarkup(createElement(EquipmentLibraryCard,{item:m,selected:false,onSelect(){}}));
  assert.ok(markup.includes(appearance.color));assert.doesNotMatch(markup,/<img|<image/);
  if(n?.colorSourceUrl||m.colorSourceUrl){saved.color='#ff00ff';saved.colorName='Unknown';for(const nozzle of saved.nozzles){nozzle.color='#ff00ff';nozzle.colorName='Unknown';}
   const before=JSON.stringify(saved);assert.deepEqual(cat.equipmentAppearance(saved,n?.id),appearance,m.id);assert.equal(JSON.stringify(saved),before);
  }
 }
 const html=renderToStaticMarkup(createElement(CatalogInfo,{catalogId:'k-rain:P12Q'}));
 assert.ok(html.includes('⚠'));assert.ok(html.includes(tr('en','equipment.rowReviewHint')));
});
