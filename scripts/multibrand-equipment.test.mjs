import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';

test('four-brand data, model replacement, mixed-zone totals and immutable save/reopen',async()=>{
 const memory=new Map(),storage=globalThis.localStorage,win=globalThis.window;
 globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const server=await createServer({server:{middlewareMode:true,hmr:false}});
 try{
  const cat=await server.ssrLoadModule('/src/lib/equipment-catalog.ts'),flow=await server.ssrLoadModule('/src/lib/flow.ts');
  const {filterEquipment,equipmentCategory,equipmentTechnology,equipmentCategoriesFor}=await server.ssrLoadModule('/src/lib/equipment-library.ts');
  const {equipmentGroupsFor}=await server.ssrLoadModule('/src/lib/equipment-groups.ts');
  const {headSurface,surfaceArea}=await server.ssrLoadModule('/src/lib/irrigation-geometry.ts');
  globalThis.window={localStorage:globalThis.localStorage};
  const {useProject,migrateProject,updateHeadSettings}=await server.ssrLoadModule('/src/lib/project-store.ts');
  const {emptyProject}=await server.ssrLoadModule('/src/lib/project-types.ts');
  const {zoneFlow,hydroKey,distributeZones}=await server.ssrLoadModule('/src/lib/hydro.ts');
  assert.deepEqual([...new Set(cat.CATALOG.map(c=>c.manufacturerId))].sort(),['hunter','k-rain','rain-bird','toro']);
  assert.equal(new Set(cat.CATALOG.map(c=>c.id)).size,cat.CATALOG.length);
  for(const c of cat.CATALOG){
   assert.ok(c.modelId&&c.catalogVersion&&c.sourceUrl,c.id);
   if(c.type==='body'||c.placementSupported===false)continue;
   const d=flow.catalogHeadDefaults(c);
   assert.ok([d.arc,d.r,d.designPressure].every(Number.isFinite),c.id);
   assert.ok(d.arc>=c.arcMin&&d.arc<=c.arcMax,c.id);
   if(c.verificationStatus==='Needs Review'&&c.hydraulicVerificationStatus!=='Verified'&&c.performanceReview!=='per-row')assert.equal(flow.headFlow({catalogId:c.id,...d}).lpm,null,c.id);
   for(const n of c.nozzles)for(const row of n.performance){
    assert.ok([row.pressureBar,row.radiusM,row.flowLMin,row.arcDeg].every(Number.isFinite),`${c.id}/${n.id}`);
    if(c.verificationStatus!=='Verified'||c.type==='body')continue;
    const arc=c.type==='rotor'?Math.max(c.arcMin,Math.min(row.arcDeg,c.arcMax)):row.arcDeg;
    if(arc<c.arcMin||arc>c.arcMax||row.pressureBar<c.recommendedPressureMin||row.pressureBar>c.recommendedPressureMax)continue;
    const found=flow.performanceAt(c,n.id,row.pressureBar,arc);
    assert.ok(found,`${c.id}/${n.id} official row available`);
    assert.equal(found.row.flowLMin,row.flowLMin,`${c.id}/${n.id} exact published discharge`);
   }
  }
  useProject.setState({project:emptyProject(),snapOn:false,snapGridOn:false,past:[],future:[]});
  const ids=['MP2000-90','rain-bird:R-VAN18','toro:PSN10T-H','k-rain:RN100-ADJ-210-270'];
  for(const [i,id] of ids.entries())useProject.getState().placeHead({x:i*10,y:2},id);
  const placed=useProject.getState().project;
  assert.equal(placed.heads.length,4);
  for(const head of placed.heads){assert.equal(head.equipmentSnapshot.id,head.catalogId);assert.ok(flow.headFlow(head).lpm>0,head.catalogId);assert.ok(head.bodySnapshot,head.catalogId);}
  const mixed={...placed,heads:placed.heads.map(h=>({...h,zone:1})),zones:[{id:1,name:'Mixed',hidden:false,locked:false}]};
  const expected=mixed.heads.reduce((sum,h)=>sum+flow.headFlow(h).lpm,0);
  assert.equal(zoneFlow(mixed.heads,1),expected);
  const reopened=migrateProject(JSON.parse(JSON.stringify(mixed)));
  assert.deepEqual(reopened.heads,JSON.parse(JSON.stringify(mixed.heads)));
  assert.equal(zoneFlow(reopened.heads,1),expected);
  const original=cat.itemById(ids[1]),oldFlow=original.nozzles[0].performance[0].flowLMin,body=cat.itemById(mixed.heads[1].bodyId),oldHeight=body.popUpMm;
  original.nozzles[0].performance[0].flowLMin=999;body.popUpMm=999;
  try{const stable=migrateProject(JSON.parse(JSON.stringify(mixed)));assert.equal(zoneFlow(stable.heads,1),expected);assert.equal(stable.heads[1].popUpMm,mixed.heads[1].popUpMm);}
  finally{original.nozzles[0].performance[0].flowLMin=oldFlow;body.popUpMm=oldHeight;}
  let replaced=mixed.heads[0];
  for(const id of [...ids.slice(1),ids[0]]){
   replaced=updateHeadSettings(replaced,{catalogId:id});const c=cat.catalogForHead(replaced);
   assert.equal(c.id,id);assert.equal(replaced.equipmentSnapshot.manufacturerId,cat.itemById(id).manufacturerId);
   assert.ok(c.nozzles.some(n=>n.id===replaced.nozzleId));assert.ok(cat.bodiesFor(c).some(b=>b.id===replaced.bodyId));
   assert.ok(replaced.arc>=c.arcMin&&replaced.arc<=c.arcMax);assert.equal(replaced.x,mixed.heads[0].x);assert.equal(replaced.zone,1);
   const clamped=updateHeadSettings(replaced,{r:1000,arc:1000,designPressure:1000,nozzleId:'invalid'});
   assert.ok(c.nozzles.some(n=>n.id===clamped.nozzleId));assert.ok(clamped.arc<=c.arcMax);
   assert.ok(clamped.designPressure<=c.recommendedPressureMax);assert.ok(clamped.r<=c.rMax+.001);
   assert.ok(cat.bomLineName(c).startsWith(cat.manufacturerName(c)));
  }
  assert.equal(filterEquipment(cat.CATALOG,{manufacturerId:'toro',category:'rotor',radius:15,pressure:1.723689}).length,0,'filters use one simultaneous supported configuration');
  const rotary=filterEquipment(cat.CATALOG,{manufacturerId:'hunter',category:'rotary'});
  const strips=filterEquipment(cat.CATALOG,{manufacturerId:'hunter',category:'strips'});
  assert.ok(rotary.some(c=>c.id==='MP-LCS-515'));
  assert.ok(!strips.some(c=>c.id==='MP-LCS-515')&&strips.some(c=>c.id==='CS-530'));
  assert.deepEqual(equipmentCategoriesFor('hunter').map(c=>c.id),['mp','mp800','strip','he','spray','fixed','prostrip','short','bubbler','rotor','golf','st']);
  const hunterTabs=equipmentCategoriesFor('hunter').flatMap(category=>{
   const items=filterEquipment(cat.CATALOG,{manufacturerId:'hunter',category:category.id});
   assert.ok(items.length>0,category.label);
   assert.ok(items.every(item=>item.family===category.id),category.label+' contains only its own family');
   return items.map(item=>item.id);
  });
  assert.equal(new Set(hunterTabs).size,hunterTabs.length,'Hunter models appear in exactly one family tab');
  assert.deepEqual([...hunterTabs].sort(),filterEquipment(cat.CATALOG,{manufacturerId:'hunter'}).map(item=>item.id).sort(),'all available Hunter models remain accessible');
  for(const manufacturerId of ['all','hunter','rain-bird','toro','k-rain']){
   assert.ok(equipmentCategoriesFor(manufacturerId).every(category=>category.id!=='all'));
   useProject.getState().setEquipmentFilters({manufacturerId});
   assert.ok(equipmentGroupsFor(manufacturerId).some(group=>group.id===useProject.getState().familyFilter));
  }
  useProject.getState().setEquipmentFilters({manufacturerId:'hunter'});
  assert.equal(useProject.getState().familyFilter,'mp');
  for(const category of equipmentGroupsFor('hunter')){
   useProject.getState().setFamily(category.id);
   useProject.getState().setEquipmentFilters({radius:undefined});
   assert.equal(useProject.getState().familyFilter,category.id,'changing a numeric filter preserves family');
   const restored=useProject.persist.getOptions().merge({equipmentFilters:{manufacturerId:'hunter'},familyFilter:category.id},useProject.getState());
   assert.equal(restored.familyFilter,category.id,'reopening preserves '+category.label);
  }
  for(const [old,expected] of [['all','mp'],['rotary','mp'],['strips','prostrip'],['specialty','prostrip']]){
   const restored=useProject.persist.getOptions().merge({equipmentFilters:{manufacturerId:'hunter'},familyFilter:old},useProject.getState());
   assert.equal(restored.familyFilter,expected);
  }
  const legacy=useProject.persist.getOptions().merge({familyFilter:'mp800'},useProject.getState());
  assert.equal(legacy.equipmentFilters.manufacturerId,'hunter');assert.equal(legacy.familyFilter,'mp800');
  const stripHeads=['MP-LCS-515','CS-530','SS-918'].map(id=>{const c=cat.itemById(id);return {id,catalogId:id,...flow.catalogHeadDefaults(c),bodyId:'PRS40',designPressure:2.8,x:0,y:0,start:0,zone:1};});
  for(const h of stripHeads)assert.ok(flow.headFlow(h).lpm>0,h.catalogId);
  assert.notEqual(hydroKey(stripHeads[0]),hydroKey(stripHeads[1]),'MP and conventional strips remain separate at identical pressure');
  const assigned=distributeZones(stripHeads,100);
  assert.notEqual(assigned.heads.find(h=>h.id==='MP-LCS-515').zone,assigned.heads.find(h=>h.id==='CS-530').zone);
  for(const id of ['rain-bird:R-VAN-SST','k-rain:RNS-SS-530']){
   assert.equal(equipmentCategory(cat.itemById(id)),'rotary');assert.equal(equipmentTechnology(cat.itemById(id)),'rotary');
  }
  const sq=cat.itemById('rain-bird:SQ-QTR'),sqd=flow.catalogHeadDefaults(sq),sqh={catalogId:sq.id,...sqd,x:0,y:0,start:0};
  assert.ok(Math.abs(surfaceArea(headSurface(sqh))-sqd.r**2)<1e-8,'SQ quarter is a square quadrant');
  const full=cat.itemById('rain-bird:SQ-FUL'),fd=flow.catalogHeadDefaults(full);
  assert.ok(Math.abs(surfaceArea(headSurface({catalogId:full.id,...fd,x:0,y:0,start:45}))-4*fd.r**2)<1e-8);
  const squareVariants=full.nozzles.map(n=>{const row=flow.performanceAt(full,n.id,2.8,360).row;return {id:n.id,catalogId:full.id,nozzleId:n.id,designPressure:2.8,r:row.radiusM,arc:360};});
  assert.notEqual(hydroKey(squareVariants[0]),hydroKey(squareVariants[1]),'unknown layout rates do not merge different square throw settings');
  const gap=cat.itemById('rain-bird:8005');
  assert.equal(flow.performanceAt(gap,gap.nozzles[0].id,3.5,345),null);
  assert.equal(cat.clampArc(gap,340),330);assert.equal(cat.clampArc(gap,359),360);
  const prs=cat.itemById('rain-bird:5004+PCR'),pn=prs.nozzles.find(n=>n.performance.some(r=>r.pressureRangeIsConstant));
  assert.ok(flow.performanceAt(prs,pn.id,5,180));assert.ok(flow.pressureSteps(prs,pn.id,180).includes(5.2));
  const female=cat.itemById('toro:PSN10-H'),femaleDefaults=flow.catalogHeadDefaults(female);
  assert.equal(femaleDefaults.designPressure,2.068427);assert.equal(flow.headFlow({catalogId:female.id,...femaleDefaults}).kind,'table','Hunter PRS30 uses the same nominal 30 psi Toro row');
  const {layoutOnPolygon}=await server.ssrLoadModule('/src/lib/auto-layout.ts');
  const rainScope=filterEquipment(cat.CATALOG,{manufacturerId:'rain-bird',category:'rotary'});
  const layout=layoutOnPolygon([{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20}],'mp',null,[],rainScope,3.1);
  assert.ok(layout.length>0);
  assert.ok(layout.every(h=>cat.itemById(h.catalogId).manufacturerId==='rain-bird'&&flow.headFlow(h).lpm>0));
  const {inletThread}=await server.ssrLoadModule('/src/lib/engineering-materials.ts');
  assert.equal(inletThread('1/2 inch NPT female'),'½″ NPT');assert.equal(inletThread('3/4-inch BSP female'),'¾″ BSP');assert.equal(inletThread('Unknown'),undefined);
  const fn12=cat.itemById('k-rain:FN-12Q');
  assert.equal(flow.performanceAt(fn12,fn12.nozzles[0].id,1.4,90).row.flowLMin,2);
  const rn300=cat.itemById('k-rain:RN300-ADJ');
  assert.equal(flow.performanceAt(rn300,rn300.nozzles[0].id,3.5,360).row.radiusM,8.53);
  const krPr=cat.itemById('k-rain:RPS75-PR'),krPrd=flow.catalogHeadDefaults(krPr);
  assert.ok(flow.headFlow({catalogId:krPr.id,...krPrd}).lpm>0);
  assert.equal(flow.headFlow({catalogId:krPr.id,...krPrd}).precipMmHr,null,'conflicting precipitation never invalidates verified discharge or invents a rate');
  const highLow=cat.itemById('k-rain:P15HL');
  assert.ok(!cat.placeableCatalog().some(c=>c.id===highLow.id));
  assert.ok(flow.headFlow({catalogId:highLow.id,...flow.catalogHeadDefaults(highLow)}).lpm>0,'unsupported footprint keeps separately verified hydraulics');
  const partial=cat.itemById('rain-bird:3504-PC'),partialDefaults=flow.catalogHeadDefaults(partial);
  assert.ok(flow.headFlow({catalogId:partial.id,...partialDefaults}).lpm>0,'verified full-radius hydraulics remain usable');
  assert.equal(flow.headFlow({catalogId:partial.id,...partialDefaults,r:partialDefaults.r*.9}).lpm,null,'unpublished reduced-radius discharge stays unknown');
  assert.ok(!cat.placeableCatalog().some(c=>['rain-bird:1408','rain-bird:5F-B','rain-bird:5H-B','rain-bird:5Q-B','rain-bird:5CST-B'].includes(c.id)));
  const retired=cat.itemById('rain-bird:1408');
  assert.ok(flow.headFlow({catalogId:retired.id,...flow.catalogHeadDefaults(retired)}).lpm>0,'archived models retain historical hydraulics');
  const sq3=cat.itemById('rain-bird:SQ-3QTR'),sq3d=flow.catalogHeadDefaults(sq3);
  assert.ok(flow.headFlow({catalogId:sq3.id,...sq3d}).lpm>0);
  assert.ok(Math.abs(surfaceArea(headSurface({catalogId:sq3.id,...sq3d,x:0,y:0,start:0}))-3*sq3d.r**2)<1e-8);
  const point=cat.itemById('rain-bird:1401');assert.equal(flow.headFlow({catalogId:point.id,...flow.catalogHeadDefaults(point)}).lpm,point.compensatedFlowLMin);
  assert.equal(cat.catalogForHead({catalogId:sq.id,equipmentSnapshot:{...sq,nozzles:[null]}}),undefined);
 }finally{await server.close();globalThis.localStorage=storage;globalThis.window=win;}
});
