import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('Rain Bird families partition the catalog, preserve selection and show lightweight model artwork',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false}});
 try{
  const {CATALOG,equipmentAppearance,equipmentSnapshot,defaultNozzle}=await server.ssrLoadModule('/src/lib/equipment-catalog.ts');
  const {equipmentCategoriesFor,equipmentCategorySelection,filterEquipment}=await server.ssrLoadModule('/src/lib/equipment-library.ts');
  const {rainBirdLibraryCategory}=await server.ssrLoadModule('/src/lib/rain-bird-library.ts');
  const {RainBirdProduct}=await server.ssrLoadModule('/src/components/designer/rain-bird-product.tsx');
  const {catalogColor}=await server.ssrLoadModule('/src/lib/catalog-localization.ts');
  const {LOCALES}=await server.ssrLoadModule('/src/lib/locale-config.ts');
  const tabs=equipmentCategoriesFor('rain-bird');
  assert.deepEqual(tabs.map(c=>c.id),['rvan','hevan','van','u-series','mpr','strips','sq','rotor','bubbler']);
  const expected=filterEquipment(CATALOG,{manufacturerId:'rain-bird'}).map(c=>c.id).sort();
  const actual=tabs.flatMap(tab=>{
   const items=filterEquipment(CATALOG,{manufacturerId:'rain-bird',category:tab.id});
   assert.ok(items.length,tab.label);
   assert.ok(items.every(item=>rainBirdLibraryCategory(item)===tab.id));
   assert.equal(equipmentCategorySelection('rain-bird',tab.id),tab.id);
   return items.map(c=>c.id);
  });
  assert.equal(new Set(actual).size,actual.length,'no item occurs in multiple Rain Bird tabs');
  assert.deepEqual(actual.sort(),expected,'every available model remains reachable');
  const general=equipmentCategoriesFor('all').flatMap(tab=>filterEquipment(CATALOG,{manufacturerId:'all',category:tab.id}).filter(c=>c.manufacturerId==='rain-bird').map(c=>c.id));
  assert.equal(new Set(general).size,general.length,'general manufacturer view also has no Rain Bird duplicates');
  assert.deepEqual(general.sort(),expected);
  for(const [old,next] of [['all','rvan'],['rotary','rvan'],['spray','van'],['fixed','mpr'],['specialty','sq']])assert.equal(equipmentCategorySelection('rain-bird',old),next);
  const rvans=filterEquipment(CATALOG,{manufacturerId:'rain-bird',category:'rvan'});
  for(const id of ['R-VAN-LCS','R-VAN-RCS','R-VAN-SST'])assert.ok(rvans.some(c=>c.modelId===id));
  assert.ok(filterEquipment(CATALOG,{manufacturerId:'rain-bird',category:'strips'}).every(c=>!c.modelId.startsWith('R-VAN')));
  for(const item of CATALOG.filter(c=>c.manufacturerId==='rain-bird')){
   const art=renderToStaticMarkup(createElement(RainBirdProduct,{item}));
   assert.match(art,/viewBox="0 0 120 120"/);assert.match(art,/role="img"/);
   assert.ok(art.includes(item.modelId));assert.doesNotMatch(art,/<image|<img|https?:|<foreignObject/);
   assert.ok(art.length<10000,item.id+' remains a compact inline vector');
   const saved=equipmentSnapshot(item);
   saved.color='#64748b';saved.colorName='Unknown';
   for(const nozzle of saved.nozzles){nozzle.color='#64748b';nozzle.colorName='Unknown';}
   const before=JSON.stringify(saved),selected=defaultNozzle(saved)?.id;
   assert.deepEqual(equipmentAppearance(saved,selected),equipmentAppearance(item,selected),'saved heads adopt verified appearance only');
   assert.equal(JSON.stringify(saved),before,'updating display colors never changes saved engineering data');
  }
  for(const {id:code} of LOCALES){
   for(const color of ['blue','tan','brown','maroon','black','gray','Unknown'])assert.ok(!catalogColor(color,code).startsWith('color_'));
  }
  const rotor=CATALOG.find(c=>c.manufacturerId==='rain-bird'&&c.type==='rotor');
  const custom=equipmentSnapshot(rotor),n=custom.nozzles[0];
  n.id='saved-only-nozzle';n.color='#b123ab';n.colorName='purple';
  assert.deepEqual(equipmentAppearance(custom,n.id),{color:'#b123ab',colorName:'purple'},'a saved-only nozzle never inherits a different current nozzle color');
  const source=CATALOG.find(c=>c.id==='rain-bird:R-VAN14'),original=source.nozzles[0].colorSourceUrl;
  try{
   const saved=equipmentSnapshot(source);saved.nozzles[0].color='#b123ab';saved.nozzles[0].colorName='purple';
   delete source.nozzles[0].colorSourceUrl;
   assert.equal(equipmentAppearance(saved,saved.nozzles[0].id).color,'#b123ab','unproven current color cannot replace a saved color');
  }finally{source.nozzles[0].colorSourceUrl=original;}
 }finally{await server.close();}
});
