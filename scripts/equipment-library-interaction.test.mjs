import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer,transformWithEsbuild} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
let server,load,store,emptyProject;
before(async()=>{
 server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 load=p=>server.ssrLoadModule('/src/'+p);
 ({useProject:store}=await load('lib/project-store.ts'));
 ({emptyProject}=await load('lib/project-types.ts'));
});
after(async()=>server.close());

test('library selection is separate from placement, with Hunter default and retired filters cleared',async()=>{
 assert.equal(store.getState().equipmentFilters.manufacturerId,'hunter');
 assert.equal(store.getState().familyFilter,'mp');
 const saved={project:emptyProject(),equipmentFilters:{manufacturerId:'all',radius:999,arc:1,pressure:.1},familyFilter:'rotary'};
 const restored=store.persist.getOptions().merge(saved,store.getState());
 assert.deepEqual(restored.equipmentFilters,{manufacturerId:'hunter'});
 assert.equal(restored.familyFilter,'mp');assert.equal(restored.catalogPlacementArmed,false);
 const explicit=store.persist.getOptions().merge({...saved,equipmentFilters:{manufacturerId:'rain-bird',radius:999}},store.getState());
 assert.deepEqual(explicit.equipmentFilters,{manufacturerId:'rain-bird'});
 store.setState({project:emptyProject(),past:[],future:[],pastOps:[],futureOps:[],selectedId:'old',selectedIds:['old'],catalogPlacementArmed:false});
 store.getState().setCatalogOpen(true);
 assert.equal(store.getState().catalogPlacementArmed,false,'opening the library never adds or arms an implicit model');
 const before=JSON.stringify(store.getState().project);
 store.getState().selectCatalogItem('MP2000-90');
 const s=store.getState();
 assert.equal(s.catalogPlacementArmed,true);assert.equal(s.catalogVisible,true);
 assert.equal(s.selectedId,null);assert.deepEqual(s.selectedIds,[]);
 assert.equal(s.placeId,'MP2000-90');assert.equal(s.rightMode,'irrigation');assert.equal(s.rightOpen,true);
 assert.equal(JSON.stringify(s.project),before);assert.equal(s.past.length,0);
 s.setTool(null);assert.equal(store.getState().catalogPlacementArmed,false);
});

test('cards contain only a readable model and coverage symbol, and ordinary selection has no drag gesture',async()=>{
 const {EquipmentLibraryCard,AutomaticLibraryCard}=await load('components/designer/designer-app.tsx');
 const {EquipmentLibraryControls}=await load('components/designer/equipment-library-controls.tsx');
 const {itemById}=await load('lib/equipment-catalog.ts');
 let clicks=0;
 for(const id of ['MP2000-90','PGP-ADJ','rain-bird:R-VAN14','rain-bird:5004-PC']){
  const item=itemById(id),button=EquipmentLibraryCard({item,selected:false,onSelect:()=>clicks++});
  assert.equal(button.props.onPointerDown,undefined,'no pointer-down selection, hold timer or drag');
  button.props.onClick();
  const markup=renderToStaticMarkup(button);
  assert.match(markup,/<strong>/);assert.match(markup,/<svg/);assert.doesNotMatch(markup,/<img|<image|catalog-photo|rain-bird-product/);
  assert.ok(markup.includes(item.manufacturerId==='hunter'?'Hunter':'Rain Bird'));
  assert.match(markup,/irrigation-catalog-spec/);assert.match(markup,/°/);
 }
 assert.equal(clicks,4);
 const list=renderToStaticMarkup(createElement('ul',null,createElement('li',null,createElement(AutomaticLibraryCard,{active:false,onClick(){}})),createElement('li',null,createElement(EquipmentLibraryCard,{item:itemById('MP2000-90'),selected:false,onSelect(){}}))));
 assert.ok(list.indexOf('automatic-library-card')<list.indexOf('MP2000-90'));
 const controls=renderToStaticMarkup(createElement(EquipmentLibraryControls));
 assert.match(controls,/<select/);assert.doesNotMatch(controls,/<details|<input|value="all"/);
 const app=await readFile('src/components/designer/designer-app.tsx','utf8');
 assert.doesNotMatch(app,/startCatalogDrag|setCatalogGhost|<CatalogPic/);
 assert.equal((app.match(/<li><AutomaticLibraryCard/g)??[]).length,2,'first card exists on phone and desktop');
 assert.match(app,/library-panel absolute inset-y-0 left-0 z-30/,'library stays above the automatic placement surface');
 assert.match(app,/catalogPlacementArmed && <div className="mobile-placement-hint"/,'hint only promises placement when a model is armed');
 const autoCss=await readFile('src/components/designer/automatic-head.css','utf8');
 assert.doesNotMatch(autoCss,/:has\(> \.library-panel\)/,'automatic settings are no longer an overlay beside the library');
 assert.match(app,/tool==='auto-head'\s*\?\s*<div ref=\{setAutomaticHeadPanelHost\}/,'desktop inspector owns the automatic controls host');
 assert.match(app,/automatic-phone-inspector/,'phone has an automatic controls inspector');
 const autoTool=await readFile('src/components/designer/automatic-head-tool.tsx','utf8');
 assert.match(autoTool,/panelHost&&createPortal\(<AutomaticHeadPanel/,'a single tool keeps its draft when the inspector is hidden');
});

test('clearing a placed-head selection to choose a library card does not erase its information',async()=>{
 const source=await readFile('src/components/designer/designer-app.tsx','utf8');
 const effect=source.match(/useEffect\(\(\) => \{([^\n]*setLibInfo\(null\)[^\n]*)\}, \[selectedId, selectedIds\]\);/)[1];
 const reset=new Function('selectedId','selectedIds','setLibInfo','setCatInfo',effect);
 for(const previous of [[],['old'],['old','second']]){
  store.setState({selectedId:previous[0]??null,selectedIds:previous});
  for(const id of ['MP2000-90','rain-bird:R-VAN14','rain-bird:R-VAN14']){
   store.getState().selectCatalogItem(id);let info=id;
   const state=store.getState();reset(state.selectedId,state.selectedIds,v=>info=v,()=>{});
   assert.equal(info,id);assert.equal(state.rightMode,'irrigation');assert.equal(state.rightOpen,true);
  }
 }
 let info='MP2000-90';reset('placed',['placed'],v=>info=v,()=>{});assert.equal(info,null);
 assert.match(source,/libInfo===item.id && <div className="mobile-catalog-info"><CatalogInfo/,'phone can show information while keeping library scrolling available');
});

test('browsing subdivisions preserve automatic scope and stop it when entering manual-only models',async()=>{
 const source=await readFile('src/components/designer/designer-app.tsx','utf8');
 const start=source.indexOf('  const openEquipmentSeries=');assert.ok(start>=0);
 const {code}=await transformWithEsbuild(source.slice(start,source.indexOf('  const onUploadFile =',start)),'series-handler.ts',{loader:'ts'});
 const groups=await load('lib/equipment-groups.ts'),{hunterLibrarySubgroups}=await load('lib/hunter-library.ts');
 const {automaticHeadCatalog,automaticCandidateSupported}=await load('lib/automatic-head.ts'),{CATALOG}=await load('lib/equipment-catalog.ts');
 for(const [brand,id] of [['hunter','mp'],['hunter','fixed'],['hunter','bubbler'],['toro','precision']]){
  const group=groups.equipmentGroup(brand,id),catalog=groups.equipmentGroupCatalog(CATALOG,brand,id);
  const librarySubgroups=hunterLibrarySubgroups(catalog,id),seriesOptions=group.browseBySeries?groups.equipmentSeriesOptions(catalog):[];
  const options=librarySubgroups.length?librarySubgroups.map(group=>group.id):seriesOptions,seriesKey=`${brand}:${id}`;
  assert.ok(options.length>1);
  for(const option of options){
   store.setState({project:emptyProject(),equipmentFilters:{manufacturerId:brand},familyFilter:id,tool:'auto-head',catalogPlacementArmed:true,past:[],future:[],pastOps:[],futureOps:[]});
   const before=JSON.stringify(automaticHeadCatalog(brand,id)),project=store.getState().project;
   let selected={[seriesKey]:options[0]},info='old';const sheet={scrollTop:70},list={scrollTop:80,closest:()=>sheet};
   const env={setSeriesByGroup:fn=>selected=fn(selected),seriesKey,setLibInfo:value=>info=value,setCatInfo(){},useProject:store,catalogListRef:{current:list},librarySubgroups,seriesOptions,catalog,equipmentInnerSeries:groups.equipmentInnerSeries,automaticCandidateSupported};
   const open=new Function(...Object.keys(env),code+';return openEquipmentSeries;')(...Object.values(env));
   open(option);
   assert.equal(selected[seriesKey],option);assert.equal(info,null);assert.equal(list.scrollTop,0);assert.equal(sheet.scrollTop,0);
   const visible=librarySubgroups.find(group=>group.id===option)?.catalog??catalog.filter(item=>groups.equipmentInnerSeries(item)===option);
   assert.equal(store.getState().tool,visible.some(automaticCandidateSupported)?'auto-head':'place',`${brand}/${id}/${option}`);
   assert.equal(store.getState().familyFilter,id);assert.equal(store.getState().catalogPlacementArmed,false);
   assert.equal(store.getState().project,project);assert.equal(store.getState().past.length,0);
   assert.equal(JSON.stringify(automaticHeadCatalog(brand,id)),before,'browsing never narrows automatic candidates');
  }
 }
 assert.equal((source.match(/<EquipmentSeriesSelector series=\{seriesOptions\}/g)??[]).length,2);
 assert.equal((source.match(/<EquipmentSubgroupButtons groups=\{librarySubgroups\}/g)??[]).length,2,'phone and desktop share subgroup buttons');
 assert.equal((source.match(/automaticSupported&&<li><AutomaticLibraryCard/g)??[]).length,2,'manual-only browsing has no empty automatic card');
 assert.match(source,/const automaticSupported=visibleCatalog\.some\(automaticCandidateSupported\)/);
});

test('manual-only groups hide the automatic card and its explanatory note',async()=>{
 const {AutomaticLibraryCard,CatalogInfo,EquipmentLibraryCard,formatCatalogArc}=await load('components/designer/designer-app.tsx');
 const {EquipmentGroupNote}=await load('components/designer/equipment-library-controls.tsx');
 const groups=await load('lib/equipment-groups.ts'),{CATALOG}=await load('lib/equipment-catalog.ts');
 const {automaticCandidateSupported}=await load('lib/automatic-head.ts'),{setActiveLocale,tr}=await load('lib/i18n.ts');
 setActiveLocale('en');
 for(const [brand,id]of [['hunter','prostrip'],['rain-bird','sq'],['rain-bird','bubbler'],['k-rain','strips']]){
  const group=groups.equipmentGroup(brand,id),catalog=groups.equipmentGroupCatalog(CATALOG,brand,id);
  assert.ok(catalog.length);assert.equal(catalog.some(automaticCandidateSupported),false);
  const card=renderToStaticMarkup(createElement(AutomaticLibraryCard,{active:false,disabled:true,onClick(){throw Error('disabled');}}));
  assert.equal(card,'');
  const note=renderToStaticMarkup(createElement(EquipmentGroupNote,{group,catalog}));
  assert.equal(note,'');
 }
 for(const [brand,id]of [['hunter','mp'],['rain-bird','rvan'],['toro','precision']]){
  const catalog=groups.equipmentGroupCatalog(CATALOG,brand,id),group=groups.equipmentGroup(brand,id);
  const note=renderToStaticMarkup(createElement(EquipmentGroupNote,{group,catalog}));
  assert.ok(note.includes(tr('en','equipment.groupMatched')));assert.ok(note.includes(tr('en','equipment.groupLayout')));
 }
 for(const groupId of ['rvan','rotor']){
  const item=groups.equipmentGroupItem('rain-bird:5004-PC','rain-bird',groupId);assert.ok(item);
  const markup=renderToStaticMarkup(createElement(CatalogInfo,{catalogId:item.id,item}));
  assert.ok(markup.includes(item.modelId),'inspector identifies the scoped configuration');
  assert.ok(item.nozzles.every(nozzle=>(nozzle.type==='MPR')===(groupId==='rvan')));
  if(groupId==='rvan'){
   const arcs='90° / 120° / 180° / 360°';assert.equal(formatCatalogArc(item),arcs);
   const card=renderToStaticMarkup(createElement(EquipmentLibraryCard,{item,selected:false,onSelect(){}}));
   for(const text of [markup,card]){assert.ok(text.includes(arcs));assert.ok(!text.includes('40–360°'),'MPR rack does not advertise continuously adjustable matching');}
   const nozzle=item.nozzles.find(nozzle=>nozzle.id===item.defaultNozzleId);assert.ok(nozzle?.name);assert.ok(markup.includes(nozzle.name),'named MPR default is shown instead of a dash');
   assert.equal(formatCatalogArc({...item,allowedArcRanges:[[45,270],[360,360]]}),'45–270° / 360°');
  }
 }
 setActiveLocale('ru');
});

test('every sprinkler has an official-source description in every locale, and inspectors have no product images',async()=>{
 const {CATALOG}=await load('lib/equipment-catalog.ts');
 const {equipmentDescription}=await load('lib/equipment-descriptions.ts');
 const {catalogUse}=await load('lib/catalog-localization.ts');
 const {LOCALES,setActiveLocale,tr}=await load('lib/i18n.ts');
 const {CatalogInfo}=await load('components/designer/designer-app.tsx');
 const registry=JSON.parse(await readFile('src/data/equipment/descriptions.json','utf8'));
 const ids=registry.entries.flatMap(entry=>entry.modelIds);
 assert.equal(ids.length,new Set(ids).size);
 assert.deepEqual(ids.toSorted(),CATALOG.filter(item=>item.type!=='body').map(item=>item.id).toSorted());
 for(const item of CATALOG){
  const entry=equipmentDescription(item.id);
  if(item.type!=='body'){
   assert.ok(entry,item.id);
   assert.ok(entry.sourceUrls.length);
   for(const url of entry.sourceUrls)assert.match(new URL(url).hostname,/^(www\.(hunterirrigation|hunterindustries|rainbird|krain)\.com|cdn2\.toro\.com|cdn\.thetorocompany\.com)$/);
  }
  for(const locale of LOCALES){
   const code=typeof locale==='string'?locale:locale.code;
   setActiveLocale(code);
   const key=entry?.key??'useBody';
   assert.notEqual(tr(code,key),key,`${code}: ${item.id}`);
   assert.equal(catalogUse(item),tr(code,key));
  }
 }
 for(const locale of ['ru','de','zh-CN','ja','ar','he']){
  setActiveLocale(locale);
  for(const id of ['MP2000-90','PGP-ADJ','rain-bird:R-VAN14','rain-bird:5004-PC']){
   const markup=renderToStaticMarkup(createElement(CatalogInfo,{catalogId:id}));
   assert.match(markup,/<h2/);assert.doesNotMatch(markup,/<img|<image|catalog-photo|rain-bird-product/);
  }
 }
 setActiveLocale('ru');
});

test('actual canvas handlers show the same snapped point they place, once, with cancellation guards',async()=>{
 const source=await readFile('src/components/designer/design-canvas.tsx','utf8');
 const clickCode=(await transformWithEsbuild(source.slice(source.indexOf('  const clearEmptyCanvasSelection ='),source.indexOf('    if (st.tool === "scale") {',source.indexOf('  const clearEmptyCanvasSelection =')))+'\n};','handler.tsx',{loader:'tsx'})).code;
 let raw={x:3.21,y:4.79};
 const env={useProject:store,textEditor:null,segmentEditTapConsumed:{current:false},pinchGestureActive:{current:false},pinching:false,pinchSuppressClickUntil:{current:0},lineTapGuardUntil:{current:0},skipClick:{current:false},editDrag:{current:false},toWorld:()=>raw,finishSegmentEditOnTap:()=>false,applySnap:p=>({pt:p}),readOnly:false,simulationActive:false,onSelectionClear(){}};
 for(const key of ['setSelectedNote','setSelectedDimension','setDimensionEditor','setPickList'])env[key]=()=>{};
 const handle=()=>new Function(...Object.keys(env),clickCode+';return handleClick;')(...Object.values(env));
 const stage={},event={target:{name:()=> 'bg',getStage:()=>stage},evt:{button:0}};
 store.setState({project:emptyProject(),projects:[],past:[],future:[],pastOps:[],futureOps:[],spaceDown:false,snapOn:true,snapGridOn:true,gridStep:.5,activeZoneId:1});
 store.getState().selectCatalogItem('rain-bird:R-VAN14');
 const {drawingOrMigrate}=await load('lib/cad/engine.ts');
 const {snapSprinklerPoint}=await load('lib/head-snapping.ts');
 const {visibleProjectHeads}=await load('lib/head-visibility.ts');
 const {dist}=await load('lib/geometry.ts');
 const trackCode=(await transformWithEsbuild(source.slice(source.indexOf('  const trackPointer ='),source.indexOf('\n  useEffect(() => {',source.indexOf('  const trackPointer ='))),'track.tsx',{loader:'tsx'})).code;
 let preview=null,frame=null,parentUpdates=0;
 const {createManualPlacementTracker}=await load('lib/manual-placement-tracker.ts');
 const tracker=createManualPlacementTracker(()=>{const s=store.getState();return {drawing:drawingOrMigrate(s.project),heads:visibleProjectHeads(s.project),px:s.pxPerMeter,panX:s.panX,panY:s.panY,snapOn:s.snapOn,snapGridOn:s.snapGridOn,gridStep:s.gridStep};},v=>preview=v?.hit.pt??null,fn=>{frame=fn;return 1;},()=>{frame=null;});
 const trackEnv={useProject:store,segmentHoldStart:{current:null},endCadHold(){},dist,cutFigures:()=>null,drawingOrMigrate,snapSprinklerPoint,visibleProjectHeads,applySnap:p=>({pt:p,kind:'none'}),pendingHover:{current:null},hoverRaf:{current:0},requestAnimationFrame:()=>{throw Error('parent hover must not be queued');},editDrag:{current:false},setHoverPt:()=>parentUpdates++,setSnapHit:()=>parentUpdates++,onHover:()=>parentUpdates++,manualTracker:{current:tracker},pinchGestureActive:{current:false},midDown:{current:false},mousePan:{current:null},pointerType:{current:'mouse'}};
 const track=new Function(...Object.keys(trackEnv),trackCode+';return trackPointer;')(...Object.values(trackEnv));
 for(let i=0;i<100;i++)track(raw);
 assert.equal(preview,null);frame();assert.ok(preview);assert.equal(parentUpdates,0,'mouse movement never rerenders canvas or library');
 for(const key of ['readOnly','pinching']){env[key]=true;handle()(event);assert.equal(store.getState().project.heads.length,0,key);env[key]=false;}
 env.pinchGestureActive.current=true;handle()(event);assert.equal(store.getState().project.heads.length,0);env.pinchGestureActive.current=false;
 store.setState({spaceDown:true});handle()(event);assert.equal(store.getState().project.heads.length,0);store.setState({spaceDown:false});
 handle()(event);
 const placed=store.getState().project.heads[0];assert.ok(placed);
 assert.deepEqual({x:placed.x,y:placed.y},preview);assert.equal(placed.catalogId,'rain-bird:R-VAN14');
 assert.equal(store.getState().past.length,1);assert.equal(store.getState().catalogPlacementArmed,false);
 handle()(event);assert.equal(store.getState().project.heads.length,1,'a later click cannot add an unarmed copy');
 store.getState().undo();assert.equal(store.getState().project.heads.length,0);
});
