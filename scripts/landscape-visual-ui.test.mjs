import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {mkdir,rm,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
let app,bundle;
const dir=resolve('node_modules/.cache/landscape-visual-ui-tests');
before(async()=>{
 await mkdir(dir,{recursive:true});bundle=resolve(dir,'app.mjs');
 await build({stdin:{contents:`export * from './src/lib/landscape-objects';export * from './src/lib/i18n';export * from './src/lib/units';export {useProject} from './src/lib/project-store';export {emptyProject} from './src/lib/project-types';export {emptyDrawing} from './src/lib/cad/types';export {DECORATIVE_PLANTS} from './src/lib/plant-visuals';export {LandscapeLibrary,LandscapeInspector} from './src/components/designer/landscape-objects-library';export {PlantInspector} from './src/components/designer/landscape-library';export {LandscapeSelectionActions} from './src/components/designer/landscape-selection-actions';export {LandscapeObjectLayers} from './src/components/designer/landscape-object-layers';export {PlantLayers} from './src/components/designer/plant-layers';export {prepareLibraryItem} from './src/components/designer/use-landscape-drag';`,resolveDir:process.cwd()},outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
 app=await import(pathToFileURL(bundle));
});
after(async()=>{if(bundle)await rm(bundle,{force:true});});
const render=(Component,props={})=>renderToStaticMarkup(React.createElement(Component,props));
const plain=s=>s.replace(/<[^>]*>/g,' ').replace(/&#x27;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ');
function state(locale,units,overrides={}){
 app.setActiveLocale(locale);app.setActiveUnits(units);
 app.useProject.setState({locale,units,numberFormat:'auto',workspaceSection:'landscape',landscapeLibrarySection:'decor',landscapeVisualMode:'vector',selectedLandscapeId:null,selectedPlantId:null,inspectedLandscapeId:null,inspectedPlant:null,pendingLandscapeObject:null,pendingCatalogPlant:null,project:{...app.emptyProject(),drawing:app.emptyDrawing()},...overrides});
 Object.assign(app.useProject.getInitialState(),app.useProject.getState());
}
const ids=['pool-square','pool-round','pool-rectangle','tub-round-wood','tub-square-spa','tub-rectangle-plunge'];
const object=(id,visualMode)=>{const r=app.landscapeRecord(id);return {id:'water-object',catalogId:id,category:r.category,...app.defaultLandscapeSize(r),x:1,y:2,rotation:20,keepRatio:app.defaultLandscapeKeepRatio(r),noIrrigation:true,...visualMode?{visualMode}:{}};};

test('six water objects have exact design dimensions and appropriate resize defaults',()=>{
 const sizes=[[4,4],[4,4],[6,3],[2,2],[2,2],[2,1.2]];
 for(let index=0;index<ids.length;index++){
  const r=app.landscapeRecord(ids[index]);assert.ok(r);assert.equal(r.category,'decor');assert.equal(r.sizeFromCatalog,true);
  const size=app.defaultLandscapeSize(r);assert.deepEqual([size.length,size.width],sizes[index]);assert.equal(app.defaultLandscapeKeepRatio(r),r.shape!=='rect');
  state('en',app.METRIC_UNITS);app.prepareLibraryItem({kind:'object',record:r});
  const pending=app.useProject.getState().pendingLandscapeObject;assert.equal(pending.visualMode,'vector');assert.equal(pending.keepRatio,r.shape!=='rect');assert.deepEqual([pending.length,pending.width],sizes[index]);
 }
});

test('library and inspectors show translated image/vector choices in all locales and unit systems',()=>{
 for(const {id:locale} of app.LOCALES)for(const prefs of [app.METRIC_UNITS,app.US_UNITS])for(const mobile of [false,true]){
  state(locale,prefs);const library=render(app.LandscapeLibrary,{mobile});
  assert.ok(plain(library).includes(app.tr(locale,'landscapeNewAppearance')));assert.equal((library.match(/class="landscape-object-card"/g)||[]).length,36);
  assert.ok(!library.includes('<img'),'vector catalog does not load raster thumbnails');
  for(const id of ids)assert.ok(plain(library).includes(app.tr(locale,`landscapeObject_${id}`)));
  for(const id of ids){
   const o=object(id);const drawing={...app.emptyDrawing(),landscapeObjects:{[o.id]:o}};
   state(locale,prefs,{selectedLandscapeId:o.id,project:{...app.emptyProject(),drawing}});
   const inspector=render(app.LandscapeInspector),actions=render(app.LandscapeSelectionActions);
   for(const html of [inspector,actions]){assert.ok(plain(html).includes(app.tr(locale,'landscapeSelectedAppearance')));assert.ok(html.includes('aria-pressed="true"')&&html.includes('aria-pressed="false"'));assert.ok(!html.includes('type="radio"'));}
   assert.ok(inspector.includes('<img'),'old instance without visualMode stays image despite new-object vector default');
   const n=app.landscapeRecord(id).shape==='rect'?2:1;assert.equal((actions.match(/<input /g)||[]).length,n);
   assert.equal((actions.match(/type="submit"/g)||[]).length,1);
   if(app.landscapeRecord(id).shape==='square')assert.ok(plain(actions).includes(app.tr(locale,'landscapeSide')));
   if(app.landscapeRecord(id).shape==='circle')assert.ok(plain(actions).includes(app.tr(locale,'drawDiameter')));
   drawing.landscapeObjects[o.id]={...o,visualMode:'vector'};state(locale,prefs,{selectedLandscapeId:o.id,project:{...app.emptyProject(),drawing}});
   assert.ok(render(app.LandscapeInspector).includes('data-landscape-visual="vector"'));
   assert.ok(render(app.LandscapeObjectLayers,{drawing}).includes('data-landscape-visual="vector"'));
  }
 }
});

test('selected appearance controls are disabled by object or layer locks on phone and desktop',()=>{
 const record=app.DECORATIVE_PLANTS[0];
 for(const mobile of [false,true])for(const kind of ['plant','object'])for(const mode of ['image','vector'])for(const lock of ['instance','layer']){
  const selected=kind==='plant'?{id:'plant-1',kind:record.category,catalog:record,catalogId:record.id,x:2,y:3,r:1,visualMode:mode}:object('pool-square',mode);
  if(lock==='instance')selected.locked=true;
  const drawing={...app.emptyDrawing(),plants:kind==='plant'?{[selected.id]:selected}:{},landscapeObjects:kind==='object'?{[selected.id]:selected}:{}};
  if(lock==='layer')drawing.layers={...drawing.layers,[kind==='plant'?'plants':'decor']:{...drawing.layers?.[kind==='plant'?'plants':'decor'],locked:true}};
  state('en',app.METRIC_UNITS,{selectedPlantId:kind==='plant'?selected.id:null,selectedLandscapeId:kind==='object'?selected.id:null,project:{...app.emptyProject(),drawing}});
  for(const component of [app.LandscapeSelectionActions,kind==='plant'?app.PlantInspector:app.LandscapeInspector]){
   const html=renderToStaticMarkup(React.createElement('div',{className:'app-shell','data-mobile':String(mobile)},React.createElement(component,{mobile})));
   const control=html.match(/<fieldset class="landscape-visual-mode"[^>]*>[\s\S]*?<\/fieldset>/)?.[0];assert.ok(control);
   assert.match(control,/<fieldset[^>]* disabled=""/);assert.equal((control.match(/<button[^>]* disabled=""/g)||[]).length,2);
   const selectedButton=control.match(/<button[^>]*aria-pressed="true"[^>]*>([\s\S]*?)<\/button>/)?.[1];assert.equal(plain(selectedButton),app.tr('en',mode==='image'?'landscapeImages':'landscapeVector'));
  }
 }
});

test('plant inspector, active selection and layer thumbnails honor the individual mode',()=>{
 const record=app.DECORATIVE_PLANTS[0];
 for(const {id:locale} of app.LOCALES)for(const mode of ['image','vector']){
  const plant={id:'plant-1',kind:record.category,catalog:record,catalogId:record.id,x:2,y:3,r:1,visualMode:mode};
  const drawing={...app.emptyDrawing(),plants:{[plant.id]:plant}};
  state(locale,app.METRIC_UNITS,{landscapeVisualMode:mode==='image'?'vector':'image',selectedPlantId:plant.id,project:{...app.emptyProject(),drawing}});
  for(const component of [app.PlantInspector,app.LandscapeSelectionActions])assert.ok(plain(render(component)).includes(app.tr(locale,'landscapeSelectedAppearance')));
  for(const html of [render(app.PlantInspector),render(app.PlantLayers,{drawing})])assert.equal(html.includes('data-landscape-visual="vector"'),mode==='vector');
  assert.equal(app.useProject.getState().project.drawing.plants[plant.id].visualMode,mode);
 }
});

test('new UI labels are complete and thumbnail layout supports SVG as well as images',async()=>{
 const keys=['landscapeImages','landscapeVector','landscapeNewAppearance','landscapeSelectedAppearance','landscapeSide','landscapeSubcategory_pools','landscapeSubcategory_tubs',...ids.map(id=>'landscapeObject_'+id)];
 for(const {id:locale} of app.LOCALES){const dict=JSON.parse(await readFile(`src/lib/locales/${locale}.json`,'utf8'));for(const key of keys)assert.ok(dict[key]?.trim(),`${locale}/${key}`);}
 const css=await readFile('src/styles.css','utf8');for(const host of ['.plant-photo','.landscape-object-card','.landscape-drag-preview'])assert.ok(css.includes(`${host} :is(img,svg)`));
 assert.match(css,/\.landscape-visual-mode legend[^}]*overflow-wrap:anywhere/);
 assert.match(css,/\.landscape-visual-mode > div[^}]*flex-wrap:wrap/);
 assert.match(css,/\.figure-fusion-actions \.landscape-visual-mode button[^}]*min-height:2\.25rem[^}]*white-space:normal/);
 assert.match(css,/\.landscape-selection-actions \.landscape-visual-mode[^}]*max-width:100%/);
 assert.match(css,/\.landscape-selection-actions \.figure-actions-surface[^}]*max-width:100%[^}]*overflow-x:auto/);
});
