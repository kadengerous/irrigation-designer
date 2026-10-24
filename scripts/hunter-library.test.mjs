import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer,transformWithEsbuild} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

let server,cat,groups,hunter,auto,ui,i18n,localization,store,emptyProject;
before(async()=>{
 server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 const load=path=>server.ssrLoadModule('/src/'+path);
 [cat,groups,hunter,auto,ui,i18n,localization,{useProject:store},{emptyProject}]=await Promise.all([
  'lib/equipment-catalog.ts','lib/equipment-groups.ts','lib/hunter-library.ts','lib/automatic-head.ts',
  'components/designer/equipment-library-controls.tsx','lib/i18n.ts','lib/catalog-localization.ts',
  'lib/project-store.ts','lib/project-types.ts',
 ].map(load));
});
after(async()=>{i18n?.setActiveLocale('ru');await server?.close();});
const ids=items=>items.map(item=>item.id).sort();
const pool=id=>groups.equipmentGroupCatalog(cat.placeableCatalog(),'hunter',id);
const parts=id=>hunter.hunterLibrarySubgroups(pool(id),id);
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;'}[char]));

test('Hunter browsing covers all 104 active emitters exactly once without reviving archived models',()=>{
 const before=JSON.stringify(cat.CATALOG),expected=cat.placeableCatalog().filter(item=>item.manufacturerId==='hunter');
 assert.equal(expected.length,104);
 const actual=groups.equipmentGroupsFor('hunter').flatMap(group=>{
  const catalog=pool(group.id),subgroups=hunter.hunterLibrarySubgroups(catalog,group.id);
  const shown=subgroups.length?subgroups.flatMap(subgroup=>subgroup.catalog):catalog;
  assert.deepEqual(ids(shown),ids(catalog),group.id);
  assert.equal(new Set(ids(shown)).size,catalog.length,`${group.id}: duplicate card`);
  return shown;
 });
 assert.deepEqual(ids(actual),ids(expected));assert.equal(new Set(ids(actual)).size,104);
 for(const id of ['8A','10A','12A','15A','17A','S-8A','S-16A','I-50','I-50-ON'])assert.ok(!ids(actual).includes(id),id);
 assert.equal(JSON.stringify(cat.CATALOG),before,'browsing does not mutate model or hydraulic data');
 for(const brand of ['rain-bird','toro','k-rain']){
  const other=cat.placeableCatalog().filter(item=>item.manufacturerId===brand);
  for(const groupId of ['mp','fixed','bubbler'])assert.deepEqual(hunter.hunterLibrarySubgroups(other,groupId),[]);
 }
});

test('MP Standard separates all eleven circular models from the three manual strip models',()=>{
 const [normal,strip]=parts('mp');
 assert.deepEqual([normal.id,strip.id],['mp','strip']);assert.equal(normal.catalog.length,11);
 assert.ok(normal.catalog.every(item=>item.family==='mp'&&!item.strip));
 for(const id of ['MP1000-90','MP2000-360','MP3000-210','MP3500-90','MP-CORNER'])assert.ok(ids(normal.catalog).includes(id),id);
 assert.deepEqual(ids(strip.catalog),['MP-LCS-515','MP-RCS-515','MP-SS-530']);
 assert.ok(normal.catalog.some(auto.automaticCandidateSupported));
 assert.ok(strip.catalog.every(item=>!auto.automaticCandidateSupported(item)));
 assert.deepEqual(ids(auto.automaticHeadCatalog('hunter','mp')),ids(pool('mp')));
});

test('all 21 Pro Fixed models use their actual equipment colors in six radius families',()=>{
 const expected=[
  ['5','#1565C0','blue',['5Q','5H','5F']],
  ['8','#8D4B2B','brown',['8Q','8T','8H','8F']],
  ['10','#C62828','red',['10Q','10T','10H','10F']],
  ['12','#2E7D32','green',['12Q','12T','12H','12F']],
  ['15','#1a1a1a','black',['15Q','15T','15H','15F']],
  ['17','#90A4AE','gray',['17Q','17H']],
 ];
 const actual=parts('fixed');assert.deepEqual(actual.map(part=>part.id),expected.map(row=>row[0]));
 assert.equal(actual.flatMap(part=>part.catalog).length,21);
 expected.forEach(([id,color,name,models],index)=>{
  const part=actual[index];assert.deepEqual(ids(part.catalog),models.sort());assert.equal(part.color,color,id);
  assert.equal(localization.catalogColor(part.colorName,'en'),name,id);
  for(const item of part.catalog){
   const appearance=cat.equipmentAppearance(item);
   assert.equal(part.color,appearance.color,`${id}: ${item.id} actual glyph color`);
   assert.equal(part.colorName,appearance.colorName,item.id);
   assert.ok(auto.automaticCandidateSupported(item),item.id);
  }
 });
});

test('all 22 bubblers stay available, including MSBN-V, PCB-R and the prefixed 5-CST-B model',()=>{
 const actual=parts('bubbler');
 const expected={
  MSBN:['MSBN-25Q','MSBN-50Q','MSBN-50H','MSBN-10H','MSBN-10F','MSBN-20F','MSBN-25V','MSBN-50V'],
  PCN:['PCN-25','PCN-50','PCN-10','PCN-20'],
  PCB:['PCB-25','PCB-50','PCB-10','PCB-20','PCB-25-R','PCB-50-R','PCB-10-R','PCB-20-R'],
  AFB:['AFB'],CST:['5-CST-B'],
 };
 assert.deepEqual(actual.map(part=>part.id),Object.keys(expected));
 assert.equal(actual.flatMap(part=>part.catalog).length,22);
 for(const part of actual){
  assert.deepEqual(ids(part.catalog),expected[part.id].sort(),part.id);
  assert.ok(part.catalog.every(item=>item.type==='bubbler'&&!auto.automaticCandidateSupported(item)));
 }
});

test('subgroup buttons expose their localized colors and selected state in all twenty languages',()=>{
 assert.equal(i18n.LOCALES.length,20);
 for(const {id:locale} of i18n.LOCALES){
  i18n.setActiveLocale(locale);
  for(const groupId of ['mp','fixed','bubbler']){
   const subgroups=parts(groupId),selected=subgroups.at(-1).id;
   const markup=renderToStaticMarkup(createElement(ui.EquipmentSubgroupButtons,{groups:subgroups,value:selected,onChange(){}}));
   assert.doesNotMatch(markup,/<select/);
   assert.ok(markup.includes(`role="group" aria-label="${escape(i18n.tr(locale,'series'))}"`),locale);
   const buttons=[...markup.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match=>match[0]);
   assert.equal(buttons.length,subgroups.length);
   assert.equal(buttons.filter(button=>button.includes('aria-pressed="true"')).length,1);
   subgroups.forEach((part,index)=>{
    const color=part.colorName?localization.catalogColor(part.colorName,locale):null;
    const label=color?`${part.label} · ${color}`:part.label,button=buttons[index];
    assert.ok(button.includes(`aria-label="${escape(label)}"`),`${locale}/${part.id}: accessible label`);
    assert.ok(button.includes(`title="${escape(label)}"`),`${locale}/${part.id}: color tooltip`);
    assert.ok(button.includes(`<bdi dir="ltr">${escape(part.label)}</bdi>`),`${locale}/${part.id}: model isolation`);
    assert.ok(button.includes(`aria-pressed="${part.id===selected}"`));
    if(part.color)assert.ok(button.includes(`aria-hidden="true" style="background-color:${part.color}"`));
   });
  }
 }
 assert.equal(renderToStaticMarkup(createElement(ui.EquipmentSubgroupButtons,{groups:[],value:'',onChange(){}})),'');
 assert.equal(renderToStaticMarkup(createElement(ui.EquipmentSubgroupButtons,{groups:parts('fixed').slice(0,1),value:'5',onChange(){}})),'');
 i18n.setActiveLocale('en');
});

test('manual strip and bubbler subgroups show no automatic claims or compatibility notes',()=>{
 const manual=[['mp',parts('mp').find(part=>part.id==='strip')],...parts('bubbler').map(part=>['bubbler',part])];
 for(const [id,part] of manual){
  assert.equal(part.catalog.some(auto.automaticCandidateSupported),false);
  const markup=renderToStaticMarkup(createElement(ui.EquipmentGroupNote,{group:groups.equipmentGroup('hunter',id),catalog:part.catalog}));
  assert.equal(markup,'',part.id);
 }
 const normal=parts('mp').find(part=>part.id==='mp');
 const note=renderToStaticMarkup(createElement(ui.EquipmentGroupNote,{group:groups.equipmentGroup('hunter','mp'),catalog:normal.catalog}));
 assert.ok(note.includes(i18n.tr('en','equipment.groupMatched')));
 assert.ok(!note.includes(i18n.tr('en','equipment.groupLayout')),'strip warning is absent in the circular-only subgroup');
});

test('all Pro Fixed color buttons retain the full automatic parent pool while manual-only selection cancels auto',async()=>{
 const source=await readFile('src/components/designer/designer-app.tsx','utf8');
 const start=source.indexOf('  const openEquipmentSeries=');assert.ok(start>=0);
 const {code}=await transformWithEsbuild(source.slice(start,source.indexOf('  const onUploadFile =',start)),'subgroup-handler.ts',{loader:'ts'});
 for(const groupId of ['fixed','mp','bubbler']){
  const catalog=pool(groupId),subgroups=parts(groupId),seriesKey=`hunter:${groupId}`;
  const original=JSON.stringify(auto.automaticHeadCatalog('hunter',groupId));
  for(const subgroup of subgroups){
   store.setState({project:emptyProject(),equipmentFilters:{manufacturerId:'hunter'},familyFilter:groupId,tool:'auto-head',catalogPlacementArmed:true,past:[],future:[]});
   const project=store.getState().project;let selected={},info='old',category='old';
   const list={scrollTop:80,closest:()=>({scrollTop:70})};
   const env={setSeriesByGroup:fn=>selected=fn(selected),seriesKey,setLibInfo:value=>info=value,setCatInfo:value=>category=value,
    librarySubgroups:subgroups,seriesOptions:[],catalog,equipmentInnerSeries:groups.equipmentInnerSeries,
    automaticCandidateSupported:auto.automaticCandidateSupported,useProject:store,catalogListRef:{current:list}};
   const open=new Function(...Object.keys(env),code+';return openEquipmentSeries;')(...Object.values(env));
   open(subgroup.id);
   assert.equal(selected[seriesKey],subgroup.id);assert.equal(info,null);assert.equal(category,null);assert.equal(list.scrollTop,0);
   const supported=subgroup.catalog.some(auto.automaticCandidateSupported);
   assert.equal(store.getState().tool,supported?'auto-head':'place',`${groupId}/${subgroup.id}`);
   assert.equal(store.getState().catalogPlacementArmed,false);
   assert.equal(store.getState().familyFilter,groupId);assert.equal(store.getState().project,project);assert.equal(store.getState().past.length,0);
   assert.equal(JSON.stringify(auto.automaticHeadCatalog('hunter',store.getState().familyFilter)),original,'manual browsing never narrows automatic selection');
   if(groupId==='fixed')assert.equal(auto.automaticHeadCatalog('hunter',groupId).length,21,subgroup.id);
  }
 }
});
