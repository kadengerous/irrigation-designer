import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const root=process.env.IRRI_ROOT??process.cwd(),req=createRequire(resolve(root,'package.json'));
const React=req('react'),{renderToStaticMarkup}=req('react-dom/server');
const {createServer}=await import(pathToFileURL(resolve(root,'node_modules/vite/dist/node/index.js')));
let server,cat,flow,coverage,store,i18n,units,app,CatalogReference,emptyProject;
const oldStorage=globalThis.localStorage;
const locales=['en','ru','es','pt-BR','fr','it','de','ar','tr','pl','zh-CN','nl','cs','el','hu','ro','sk','he','uk','ja'];
const keys=['coveragePattern','localizedWatering','coverageRadiusUndefined','coverageStreams','coverageUnverified','coverageThrow'];
before(async()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 server=await createServer({configFile:false,root,resolve:{alias:{'@':resolve(root,'src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 [cat,flow,coverage,{useProject:store},i18n,units,{emptyProject},app,{CatalogReference}]=await Promise.all([
  'lib/equipment-catalog.ts','lib/flow.ts','lib/catalog-coverage.ts','lib/project-store.ts','lib/i18n.ts','lib/units.ts','lib/project-types.ts','components/designer/designer-app.tsx','components/designer/catalog-details.tsx'
 ].map(p=>server.ssrLoadModule('/src/'+p)));
});
after(async()=>{await server?.close();if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;});
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
const plain=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const rowShapes=html=>[...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].flatMap(m=>[...m[1].matchAll(/<tr\b[^>]*>\s*<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(row=>plain(row[1])));
function state(locale,prefs,heads=[]){i18n.setActiveLocale(locale);units.setActiveUnits(prefs);store.setState({locale,units:{...prefs},project:{...emptyProject(),heads}});Object.assign(store.getInitialState(),store.getState());}
const makeHead=item=>({...flow.catalogHeadDefaults(item),id:'coverage-ui',catalogId:item.id,x:0,y:0,start:37,zone:1,locked:false});
const renderCard=item=>render(app.EquipmentLibraryCard,{item,selected:false,onSelect(){}});

test('all manufacturer libraries distinguish local water, streams, squares, strips and actual radial ranges',()=>{
 state('en',units.METRIC_UNITS);const before=JSON.stringify(cat.CATALOG),brands=new Set();
 for(const item of cat.CATALOG.filter(i=>i.type!=='body')){
  brands.add(item.manufacturerId??'hunter');const text=plain(renderCard(item));
  assert.ok(!/NaN|Infinity/.test(text),item.id);
  if(coverage.isLocalWatering(item)){assert.ok(text.includes('Localized watering'),item.id);assert.ok(text.includes('Radius not specified'),item.id);assert.ok(!text.includes('0°'),item.id);}
  else if(item.coverageKind==='point'){assert.ok(text.includes('Coverage geometry not confirmed'),item.id);assert.ok(!text.includes('180°'),item.id);}
  else if(coverage.hasStreamCoverage(item)){assert.ok(text.includes('Separate streams'),item.id);}
  else if(item.strip){const strip=cat.stripAtPressure(item);assert.ok(text.includes(strip?`${units.formatLenU(strip.w,'m')} × ${units.formatLenU(strip.l,'m')}`:i18n.tr('en','noData')),item.id);assert.ok(!/\d°/.test(text),item.id);}
  else if(item.coverageKind==='square'){const f=item.squarePatternFraction;assert.ok(text.includes(f===.25?'¼':f===.5?'½':f===.75?'¾':'Square pattern'),item.id);assert.ok(text.includes(' × '),item.id);assert.ok(!/\d°/.test(text),item.id);}
  else if(item.arcMax>0&&item.placementSupported!==false&&item.geometryVerificationStatus!=='Needs Review'){assert.ok(text.includes('°'),item.id);assert.ok(text.includes(units.formatLenU(item.rMax,'m')),item.id);}
 }
 assert.deepEqual([...brands].sort(),['hunter','k-rain','rain-bird','toro']);assert.equal(JSON.stringify(cat.CATALOG),before);
 const variable=cat.CATALOG.find(i=>i.arcMin===0&&i.arcMax===360&&i.type==='nozzle'&&!i.strip&&!i.coverageKind?.includes('point'));
 assert.ok(variable);assert.equal(app.formatCatalogArc(variable),'0–360°');
 assert.equal(app.formatCatalogArc({...variable,arcMax:330}),'0–330°');
 assert.equal(app.formatCatalogArc({...variable,arcMax:0}),'Coverage geometry not confirmed');
 assert.equal(app.formatCatalogArc({...variable,arcMin:90,arcMax:360,allowedArcRanges:[[90,90],[120,120],[180,180],[360,360]]}),'90° / 120° / 180° / 360°');
});

test('localized coverage facts agree in library, inspector, saved head and reference across 20 locales and both units',()=>{
 const ids=['PCN-25','AFB','MSBN-25Q','MSBN-25V','S-8A','rain-bird:1300A-F','rain-bird:1401','rain-bird:5CST-B','rain-bird:SQ-QTR','rain-bird:SQ-HLF','rain-bird:SQ-3QTR','rain-bird:SQ-FUL','rain-bird:15CST','k-rain:TB-025','k-rain:TB-ADJ','k-rain:P15HL','k-rain:FN-15HL'];
 for(const brand of ['hunter','rain-bird','k-rain','toro']){const strip=cat.CATALOG.find(i=>(i.manufacturerId??'hunter')===brand&&i.strip);assert.ok(strip);ids.push(strip.id);}
 for(const locale of locales)for(const prefs of [units.METRIC_UNITS,units.US_UNITS])for(const id of new Set(ids)){
  const item=cat.itemById(id);assert.ok(item,id);const head=makeHead(item);state(locale,prefs,[head]);
  const hydraulic=flow.headFlow(head),label=coverage.coveragePatternLabel(item,locale),nozzle=item.nozzles.find(n=>n.id===head.nozzleId)??item.nozzles[0];
  const card=plain(renderCard(item)),info=plain(render(app.CatalogInfo,{catalogId:item.id})),saved=plain(render(app.HeadCard,{head}));
  for(const html of [card,info,saved])assert.ok(html.includes(label),`${id}/${locale}/${label}`);
  if(coverage.isLocalWatering(item))for(const html of [card,info,saved])assert.ok(html.includes(i18n.tr(locale,'coverageRadiusUndefined')),`${id}/${locale}`);
  const reference=render(CatalogReference,{item,nozzle});
  for(const shape of rowShapes(reference))assert.ok(shape.startsWith(label),`${id}/${locale}: ${shape}`);
  if(coverage.isLocalWatering(item)){assert.ok(!rowShapes(reference).some(s=>s.includes('0°')));assert.ok(!reference.includes(`<th class="pr-1">${i18n.tr(locale,'radius')}</th>`));}
  if(item.coverageKind==='square')for(const row of nozzle.performance){const dims=coverage.coverageSize(item,row.radiusM,prefs.length,row.pressureBar,locale,2);assert.ok(plain(reference).includes(dims),`${id}/${locale}/${dims}`);}
  assert.deepEqual(flow.headFlow(head),hydraulic);
 }
});

test('unknown footprints remain unknown; physical zero-degree trajectory and reference precision are retained',()=>{
 state('en',units.METRIC_UNITS);
 const base=cat.itemById('rain-bird:1300A-F'),nozzle={...base.nozzles[0],trajectoryDeg:0};
 const reference=render(CatalogReference,{item:base,nozzle});assert.match(plain(reference),/Jet angle: 0°/);assert.ok(rowShapes(reference).every(s=>s==='Localized watering'));
 const radial=cat.itemById('rain-bird:HE-VAN-12');
 assert.equal(coverage.coverageSize({...radial,geometryVerificationStatus:'Needs Review'},3,'m'),i18n.tr('en','noData'));
 assert.equal(coverage.coverageSize({...radial,placementSupported:false},3,'m'),i18n.tr('en','noData'));
 assert.equal(coverage.coveragePatternLabel({...radial,geometryVerificationStatus:'Needs Review'}),'Coverage geometry not confirmed');
 assert.equal(coverage.coverageSize(radial,1.234,'m',undefined,'en',2),'1.23 m');
 const strip=cat.CATALOG.find(i=>i.stripPerformance?.length);assert.ok(strip);
 assert.equal(coverage.coverageSize(strip,1,'m',100),i18n.tr('en','noData'),'no base-strip fallback beyond the published pressure range');
});

test('all coverage keys have actual translations in every supported locale',async()=>{
 for(const locale of locales){const dictionary=JSON.parse(await readFile(resolve(root,`src/lib/locales/${locale}.json`),'utf8'));for(const key of keys)assert.ok(typeof dictionary[key]==='string'&&dictionary[key].trim(),`${locale}/${key}`);}
});
