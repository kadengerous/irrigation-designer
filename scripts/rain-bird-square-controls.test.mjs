import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const root=process.env.IRRI_ROOT??process.cwd(),req=createRequire(resolve(root,'package.json'));
const React=req('react'),{renderToStaticMarkup}=req('react-dom/server');
const {createServer}=await import(pathToFileURL(resolve(root,'node_modules/vite/dist/node/index.js')));
let server,cat,flow,geometry,store,i18n,units,HeadCard,CatalogInfo,PressureSteps,emptyProject;
const oldStorage=globalThis.localStorage;
const locales=['en','ru','es','pt-BR','fr','it','de','ar','tr','pl','zh-CN','nl','cs','el','hu','ro','sk','he','uk','ja'];
const keys=['sqThrowSetting','sqShortThrow','sqLongThrow','sqPatternSize','sqSizeHint','sqThreeQuarterHint'];
before(async()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 server=await createServer({configFile:false,root,resolve:{alias:{'@':resolve(root,'src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 [cat,flow,geometry,{useProject:store},i18n,units,{emptyProject},{HeadCard,CatalogInfo},{PressureSteps}]=await Promise.all([
  'lib/equipment-catalog.ts','lib/flow.ts','lib/equipment-footprint.ts','lib/project-store.ts','lib/i18n.ts','lib/units.ts','lib/project-types.ts','components/designer/designer-app.tsx','components/designer/pressure-steps.tsx'
 ].map(p=>server.ssrLoadModule('/src/'+p)));
});
after(async()=>{await server?.close();if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;});
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
const plain=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
function state(locale,prefs,heads=[]){
 i18n.setActiveLocale(locale);units.setActiveUnits(prefs);store.setState({locale,units:{...prefs},project:{...emptyProject(),heads}});Object.assign(store.getInitialState(),store.getState());
}
const makeHead=(item,nozzle,row)=>({...flow.catalogHeadDefaults(item),id:'sq-ui',catalogId:item.id,nozzleId:nozzle.id,designPressure:row.pressureBar,r:row.radiusM,arc:item.arcMax,x:0,y:0,start:37,zone:1,locked:false});
function dimensions(item,r,unit){const points=geometry.squareFootprint(item,r),xs=points.map(p=>p.x),ys=points.map(p=>p.y);return `${units.formatLenU(Math.max(...xs)-Math.min(...xs),unit)} × ${units.formatLenU(Math.max(...ys)-Math.min(...ys),unit)}`;}

test('SQ cards show actual pattern dimensions and two readable settings in all locales and unit systems',async()=>{
 const models=cat.CATALOG.filter(i=>i.manufacturerId==='rain-bird'&&i.coverageKind==='square'),before=JSON.stringify(models);
 assert.equal(models.length,4);
 for(const locale of locales)for(const prefs of [units.METRIC_UNITS,units.US_UNITS])for(const item of models){
  for(const nozzle of item.nozzles){
   const row=nozzle.performance.at(-1),head=makeHead(item,nozzle,row);state(locale,prefs,[head]);
   const hydraulic=flow.headFlow(head),markup=render(HeadCard,{head}),text=plain(markup);
   assert.ok(text.includes(i18n.tr(locale,'sqThrowSetting')),locale);
   assert.ok(text.includes(i18n.tr(locale,'sqShortThrow'))&&text.includes(i18n.tr(locale,'sqLongThrow')),locale);
   assert.ok(text.includes(dimensions(item,head.r,prefs.length)),`${locale}/${item.id}/${nozzle.id}`);
   assert.equal((markup.match(/class="sq-nozzle-option(?:\s|")/g)??[]).length,2);
   assert.ok(!text.includes(':throw-'),'internal nozzle IDs are not displayed');
   assert.ok(!markup.includes(`aria-label="${i18n.tr(locale,'radius')}"`),'SQ has no continuous radius slider');
   assert.ok(text.includes(i18n.tr(locale,'sqSizeHint')));
   assert.equal(text.includes(i18n.tr(locale,'sqThreeQuarterHint')),item.squarePatternFraction===.75);
   assert.deepEqual(flow.headFlow(head),hydraulic,'rendering changes no hydraulics');
  }
  const defaults=flow.catalogHeadDefaults(item),info=plain(render(CatalogInfo,{catalogId:item.id}));
  assert.ok(info.includes(i18n.tr(locale,'sqPatternSize')));
  assert.ok(info.includes(dimensions(item,defaults.r,prefs.length)));
 }
 assert.equal(JSON.stringify(models),before);
});

test('pressure recommendation is one wrapping row outside the clickable pressure labels',()=>{
 for(const locale of locales)for(const pressure of ['bar','psi','kpa']){
  state(locale,{...units.METRIC_UNITS,pressure});
  const html=render(PressureSteps,{values:[1.4,2.1,2.8,3.4],value:2.8,recommended:2.1,onChange:()=>{}});
  assert.equal((html.match(/type="radio"/g)??[]).length,4);
  assert.equal((html.match(/class="pressure-recommended-label"/g)??[]).length,1);
  for(const label of html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g))assert.ok(!label[1].includes('pressure-recommended-label'));
  assert.ok(plain(html).includes(i18n.tr(locale,'pressureRecommended')));
  assert.ok(!/type="(?:text|number)"/.test(html));
  assert.match(html,/checked=""[^>]*value="2.8"|value="2.8"[^>]*checked=""/);
  const without=render(PressureSteps,{values:[1.4,2.1],value:1.4,onChange:()=>{}});
  assert.ok(!without.includes('pressure-recommended-label'),'UI defaults are not labelled manufacturer recommendations');
 }
});

test('the SQ changes preserve circular radius controls and translate every added key',async()=>{
 state('en',units.METRIC_UNITS);
 const item=cat.itemById('rain-bird:HE-VAN-12'),head=makeHead(item,item.nozzles[0],item.nozzles[0].performance.at(-1));
 const html=render(HeadCard,{head});assert.ok(!html.includes('sq-nozzle-options'));assert.ok(plain(html).includes(i18n.tr('en','radius')));
 for(const locale of locales){const dictionary=JSON.parse(await readFile(resolve(root,`src/lib/locales/${locale}.json`),'utf8'));for(const key of keys)assert.ok(typeof dictionary[key]==='string'&&dictionary[key].trim(),`${locale}/${key}`);}
 const css=await readFile(resolve(root,'src/styles.css'),'utf8');
 const rule=selector=>css.match(new RegExp(selector.replaceAll('.','\\.')+' \\{([^}]+)\\}'))?.[1]??'';
 assert.match(rule('.pressure-recommended-label'),/white-space:normal/);assert.doesNotMatch(rule('.pressure-recommended-label'),/position:absolute|transform:/);
 assert.match(rule('.pressure-steps legend'),/overflow-wrap:anywhere/);
 assert.match(rule('.sq-nozzle-option'),/height:auto/);assert.match(rule('.sq-nozzle-option'),/white-space:normal/);
 assert.match(rule('.sq-nozzle-options'),/auto-fit/);assert.match(rule('.pressure-step-points'),/auto-fit/);
});
