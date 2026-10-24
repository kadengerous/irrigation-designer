import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

test('landscape library and layers-only panel render in all locales on phone and desktop',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false}});
 try{
  const load=path=>server.ssrLoadModule(path);
  const {useProject:store}=await load('/src/lib/project-store.ts');
  const {LandscapeCategoryBar}=await load('/src/components/designer/landscape-category-bar.tsx');
  const {LandscapeLibrary}=await load('/src/components/designer/landscape-objects-library.tsx');
  const {LandscapeLayersPanel}=await load('/src/components/designer/landscape-layers-panel.tsx');
  const {LandscapeObjectLayers}=await load('/src/components/designer/landscape-object-layers.tsx');
  const {LandscapeSelectionActions}=await load('/src/components/designer/landscape-selection-actions.tsx');
  const {WorkspacePanelTitle}=await load('/src/components/designer/workspace-panel-title.tsx');
  const {emptyDrawing}=await load('/src/lib/cad/types.ts');
  const i18n=await load('/src/lib/i18n.ts'),units=await load('/src/lib/units.ts');
  const drawing=emptyDrawing();
  const o={id:'bench',catalogId:'bench-wood',category:'furniture',x:2,y:3,width:.5,length:1.8,rotation:45,keepRatio:true,noIrrigation:true};
  drawing.landscapeObjects={bench:o,bench2:{...o,id:'bench2',x:5}};
  for(const {id:locale} of i18n.LOCALES)for(const mobile of [false,true]){
   store.setState({locale,units:mobile?units.US_UNITS:units.METRIC_UNITS,numberFormat:'auto',workspaceSection:'landscape',landscapeLibrarySection:'furniture',selectedLandscapeId:'bench',selectedPlantId:null,pendingCatalogPlant:null,pendingLandscapeObject:null,inspectedLandscapeId:null,project:{...store.getState().project,drawing}});
   Object.assign(store.getInitialState(),store.getState());
   const library=renderToStaticMarkup(React.createElement(LandscapeLibrary,{mobile}));
   const actions=renderToStaticMarkup(React.createElement(LandscapeSelectionActions));
   assert.equal((actions.match(/type="submit"/g)||[]).length,1,'one apply for both dimensions');
   assert.equal((actions.match(/<input /g)||[]).length,2);
   assert.ok(actions.indexOf('name="length"')<actions.indexOf('name="width"'));
   assert.ok(actions.indexOf('name="width"')<actions.indexOf('type="submit"'));
   assert.ok(actions.indexOf('type="submit"')<actions.indexOf('landscape-delete-action'));
   assert.equal((library.match(/class="landscape-object-card"/g)||[]).length,30);
   for(const [section,key] of [['plan','layers'],['landscape','landscapeObjectsTitle'],['irrigation','zonesTitle']]){
    const heading=renderToStaticMarkup(React.createElement(WorkspacePanelTitle,{section}));
    assert.ok(heading.includes(i18n.tr(locale,key)));
    assert.equal((heading.match(/<svg/g)||[]).length,1);
   }
   const bar=renderToStaticMarkup(React.createElement(LandscapeCategoryBar));
   assert.equal((bar.match(/aria-pressed=/g)||[]).length,8);
   assert.ok(bar.includes(i18n.tr(locale,'landscapeCategory_equipment')));
   assert.ok(!library.includes('landscape-section-row'));
   assert.ok(!library.includes('plant-categories'));
   assert.equal((library.match(/type="search"/g)||[]).length,1);
   assert.ok(!library.includes('value="favorites"'));assert.ok(!library.includes('value="recent"'));
   assert.ok(!library.includes('class="landscape-favorite"'));
   const inspector=renderToStaticMarkup(React.createElement(LandscapeLayersPanel));
   assert.ok(!inspector.includes('<input'));assert.ok(!inspector.includes('plant-inspector'));
   assert.ok(inspector.includes(i18n.tr(locale,'landscapeObject_bench-wood')));
   assert.ok(!inspector.includes(i18n.tr(locale,'placeOnPlan')));
   assert.ok(!inspector.includes('NaN'));
   assert.ok(!inspector.includes('<details'));assert.ok(!inspector.includes('<summary'));
   assert.equal((inspector.match(/<button /g)||[]).length,6);
   assert.ok(inspector.includes(`2 ${i18n.tr(locale,'pcs')}`));
   assert.ok(inspector.includes('data-group="true"'));
   assert.ok(inspector.includes(`aria-label="${i18n.tr(locale,'details')}"`));
   assert.ok(inspector.includes('class="text-danger"'),'group header can delete the entire group');
   const single=renderToStaticMarkup(React.createElement(LandscapeObjectLayers,{drawing:{...drawing,landscapeObjects:{bench:o}}}));
   assert.ok(single.includes('data-group="false"'));assert.ok(single.includes('class="text-danger"'));
   const layer=renderToStaticMarkup(React.createElement(LandscapeObjectLayers,{drawing}));
   assert.equal((layer.match(/class="mobile-layer landscape-layer-card/g)||[]).length,1);
   assert.ok(layer.includes(i18n.tr(locale,'landscapeCategory_furniture')));
   assert.ok(!layer.includes(i18n.tr(locale,'landscapeCategory_lighting')),'unused layer absent');
   for(const html of [library,inspector,layer])assert.ok(!/landscape(?:Object|Category|Subcategory)_/.test(html));
  }
 }finally{await server.close();}
});
