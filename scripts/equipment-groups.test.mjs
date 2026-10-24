import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'vite';
let server,catalog,groups;
before(async()=>{
 server=await createServer({server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 [catalog,groups]=await Promise.all([server.ssrLoadModule('/src/lib/equipment-catalog.ts'),server.ssrLoadModule('/src/lib/equipment-groups.ts')]);
});
after(async()=>server.close());
const brands=['hunter','rain-bird','toro','k-rain'];
const pool=(brand,id)=>groups.equipmentGroupCatalog(catalog.CATALOG,brand,id);
const ids=items=>items.map(i=>i.id);
const eligible=item=>item.type!=='body'&&!item.discontinued&&item.placementSupported!==false;

test('all placeable emitters have one group; split Rain Bird racks cover every nozzle exactly once',()=>{
 const before=JSON.stringify(catalog.CATALOG);
 for(const brand of brands){
  const expected=catalog.CATALOG.filter(i=>(i.manufacturerId??'hunter')===brand&&eligible(i));
  const selected=groups.equipmentGroupsFor(brand).flatMap(group=>pool(brand,group.id));
  assert.deepEqual(new Set(ids(selected)),new Set(ids(expected)),`${brand}: complete emitter coverage`);
  assert.ok(selected.every(i=>i.manufacturerId===brand&&eligible(i)));
  for(const item of expected){
   const views=selected.filter(i=>i.id===item.id);
   const split=item.manufacturerId==='rain-bird'&&item.type==='rotor'&&item.nozzles.some(n=>n.type==='MPR')&&item.nozzles.some(n=>n.type!=='MPR');
   assert.equal(views.length,split?2:1,`${item.id}: unexpected duplicate or missing group`);
   const actual=views.flatMap(i=>i.nozzles.map(n=>n.id)).sort();
   assert.deepEqual(actual,item.nozzles.map(n=>n.id).sort(),`${item.id}: lost/duplicated nozzle configuration`);
  }
 }
 assert.equal(JSON.stringify(catalog.CATALOG),before,'group views never mutate the base catalog');
});

test('saved category aliases always resolve to a real group, including absent/all brand',()=>{
 const cases={
  hunter:{strip:'mp',rotary:'mp',strips:'prostrip',specialty:'prostrip',stream:'bubbler'},
  'rain-bird':{hevan:'spray-mpr',he:'spray-mpr','u-series':'spray-mpr',mpr:'spray-mpr',strips:'spray-mpr',prostrip:'spray-mpr',spray:'spray-mpr',fixed:'spray-mpr',short:'spray-mpr',mp:'rvan',mp800:'rvan',strip:'rvan',rotary:'rvan',specialty:'sq',golf:'rotor',st:'rotor'},
  toro:{'precision-plus':'precision',strips:'precision',specialty:'precision',spray:'precision',fixed:'precision',prostrip:'precision',strip:'precision',golf:'rotor',st:'rotor'},
  'k-rain':{mp:'rotary',mp800:'rotary',strip:'rotary',spray:'kvf',he:'kvf',short:'fixed',specialty:'strips',prostrip:'strips',rvan:'rotary',hevan:'kvf',van:'kvf','u-series':'fixed',mpr:'fixed',sq:'strips',precision:'fixed','precision-plus':'fixed',golf:'rotor',st:'rotor'},
 };
 for(const brand of brands){
  for(const [old,expected] of Object.entries(cases[brand]))assert.equal(groups.equipmentGroupSelection(brand,old),expected,`${brand}/${old}`);
  for(const group of groups.equipmentGroupsFor(brand))assert.equal(groups.equipmentGroupSelection(brand,group.id),group.id);
  for(const old of [undefined,'all','obsolete-category',...Object.keys(cases.hunter)])assert.ok(groups.equipmentGroup(brand,old)?.id);
 }
 for(const brand of [undefined,'all'])for(const old of [undefined,'strip','rotary','strips','mp800','fixed','obsolete-category']){
  assert.equal(groups.equipmentGroupSelection(brand,old),groups.equipmentGroupSelection('hunter',old));
  assert.deepEqual(ids(pool(brand,old)),ids(pool('hunter',old)));
 }
});

test('Hunter standard MP and MP800 stay separate while rotary strips follow MP Standard',()=>{
 const standard=pool('hunter','mp'),fast=pool('hunter','mp800');
 assert.ok(standard.some(i=>i.family==='strip'));
 assert.ok(standard.some(i=>i.id.startsWith('MP3500')));
 assert.ok(standard.some(i=>i.id.startsWith('MPCORNER'))||standard.some(i=>i.series==='MP Corner'));
 assert.ok(standard.every(i=>['mp','strip'].includes(i.family)));
 assert.ok(fast.length>0&&fast.every(i=>i.family==='mp800'));
 assert.ok(!ids(standard).some(id=>ids(fast).includes(id)));
 const mp=standard.find(i=>i.family==='mp');
 assert.notEqual(groups.matchedPrecipitationClass(mp),groups.matchedPrecipitationClass(fast[0]));
});

test('Rain Bird spray MPR includes 12–18 VAN, while 4–10 VAN remain configured',()=>{
 const matched=pool('rain-bird','spray-mpr'),van=pool('rain-bird','van');
 for(const size of [12,15,18])assert.ok(ids(matched).includes(`rain-bird:${size}-VAN`));
 assert.deepEqual(van.map(i=>i.modelId).sort(),['10-VAN','4-VAN','6-VAN','8-VAN']);
 assert.ok(matched.some(i=>i.modelId.startsWith('HE-VAN')));
 assert.ok(matched.some(i=>i.modelId.startsWith('U-')));
 assert.ok(matched.some(i=>i.strip));
 for(const i of matched.filter(i=>/^(12|15|18)-VAN$/.test(i.modelId)))assert.equal(groups.equipmentInnerSeries(i),'VAN 12–18');
});

test('Rain Bird MPR rotor views use only documented sectors, rack bounds and valid defaults',()=>{
 const rotary=pool('rain-bird','rvan'),rotors=pool('rain-bird','rotor');
 const rvan=rotary.find(i=>i.modelId==='R-VAN18');
 const views=rotary.filter(i=>i.type==='rotor');
 assert.equal(views.length,2);
 for(const item of views){
  const original=catalog.itemById(item.id),standard=rotors.find(i=>i.id===item.id);
  assert.ok(item.nozzles.every(n=>n.type==='MPR'));
  assert.ok(standard.nozzles.every(n=>n.type!=='MPR'));
  assert.deepEqual(item.allowedArcRanges,[[90,90],[120,120],[180,180],[360,360]]);
  assert.equal(item.arcMin,90);assert.equal(item.arcMax,360);
  assert.equal(catalog.supportsArc(item,137),false);
  assert.equal(item.rMin,5.25);assert.equal(item.rMax,10.7);
  assert.ok(item.rNom>=item.rMin&&item.rNom<=item.rMax);
  assert.ok(standard.rMax>item.rMax);
  assert.equal(catalog.defaultNozzle(item)?.designArcDeg,180);
  assert.equal(catalog.defaultNozzle(standard)?.id,catalog.defaultNozzle({...original,nozzles:standard.nozzles})?.id);
  assert.equal(groups.equipmentInnerSeries(item),'5000 MPR');
  for(const nozzle of item.nozzles){
   assert.ok([90,120,180,360].includes(nozzle.designArcDeg));
   assert.equal(groups.matchedPrecipitationClass(item,nozzle.id,nozzle.designArcDeg),groups.matchedPrecipitationClass(rvan));
   assert.equal(groups.matchedPrecipitationClass(item,nozzle.id,137),null);
  }
  const half=item.nozzles.find(n=>n.designArcDeg===180);
  assert.equal(groups.matchedPrecipitationClass(item,half.id,180),'rain-bird:rotary-mpr');
  assert.equal(groups.matchedPrecipitationClass(item,half.id,90),null);
 }
 for(const original of catalog.CATALOG.filter(i=>i.manufacturerId==='rain-bird'&&i.type==='rotor'&&!i.nozzles.some(n=>n.type==='MPR'))){
  const view=rotors.find(i=>i.id===original.id);
  assert.equal(view,original,'unsplit racks preserve the original settings');
  assert.equal(catalog.defaultNozzle(view)?.id,catalog.defaultNozzle(original)?.id);
 }
});

test('group membership resolves legacy default nozzles and respects MPR design sectors',()=>{
 const rotary=pool('rain-bird','rvan'),rotors=pool('rain-bird','rotor');
 const mpr=rotary.find(i=>i.type==='rotor'),nozzle=mpr.nozzles.find(n=>n.designArcDeg===180);
 const head={id:'legacy',catalogId:mpr.id,nozzleId:null,arc:180,r:10,designPressure:3,x:0,y:0,start:0,zone:1};
 assert.equal(groups.headInEquipmentGroup(head,rotors),true);
 assert.equal(groups.headInEquipmentGroup(head,rotary),false);
 const configured={...head,nozzleId:nozzle.id};
 assert.equal(groups.headInEquipmentGroup(configured,rotary),true);
 assert.equal(groups.headInEquipmentGroup(configured,rotors),false);
 assert.equal(groups.headInEquipmentGroup({...configured,arc:90},rotary),false);
 assert.equal(groups.headInEquipmentGroup({...head,equipmentSnapshot:mpr},rotary),true);
 assert.equal(groups.equipmentGroupItem(mpr.id,'rain-bird','rvan').nozzles.every(n=>n.type==='MPR'),true);
});

test('Toro unites all 204 Precision variants; K-Rain separates KVF6 and names RN generations',()=>{
 const precision=pool('toro','precision');
 assert.equal(precision.length,204);
 assert.ok(precision.every(i=>i.type==='nozzle'));
 assert.equal(pool('toro','rotor').length,13);
 assert.ok(groups.equipmentSeriesOptions(precision).includes('PSN+ Strip'));
 assert.ok(groups.equipmentSeriesOptions(precision).includes('Precision Strip'));
 assert.deepEqual(ids(pool('k-rain','kvf6')),['k-rain:KVF6']);
 assert.equal(pool('k-rain','kvf').length,5);
 assert.ok(!ids(pool('k-rain','kvf')).includes('k-rain:KVF6'));
 const rn=pool('k-rain','rotary');assert.equal(rn.length,15);
 assert.deepEqual(new Set(groups.equipmentSeriesOptions(rn)),new Set(['Rotary Nozzle Series','Fully Adjustable Rotary Nozzles','Rotary Nozzle Series — Strip']));
 for(const brand of brands)for(const group of groups.equipmentGroupsFor(brand)){
  const rows=pool(brand,group.id),options=groups.equipmentSeriesOptions(rows);
  assert.ok(rows.length>0,`${brand}/${group.id}: empty group`);
  assert.equal(options.length,new Set(options).size);
  for(const item of rows){const series=groups.equipmentInnerSeries(item);assert.ok(typeof series==='string'&&series.trim());assert.ok(options.includes(series));}
 }
});

test('all twenty locales provide group descriptions and interpolated automatic scope',async()=>{
 const {LOCALES}=await server.ssrLoadModule('/src/lib/locale-config.ts');
 const keys=['autoHead.scope','autoHead.cancelHint','autoHead.unsupported','equipment.groupMatched','equipment.groupConfigured','equipment.groupLayout','equipment.groupLocalized'];
 assert.equal(LOCALES.length,20);
 for(const {id}of LOCALES){
  const messages=JSON.parse(await readFile(`src/lib/locales/${id}.json`,'utf8'));
  for(const key of keys)assert.ok(typeof messages[key]==='string'&&messages[key].trim(),`${id}: ${key}`);
  assert.deepEqual([...messages['autoHead.scope'].matchAll(/\{([^}]+)\}/g)].map(x=>x[1]),['group'],`${id}: scope placeholder`);
 }
});
