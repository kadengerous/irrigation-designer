import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const dir = resolve("node_modules/.cache/landscape-tests");
await mkdir(dir, {recursive:true});
const bundle = resolve(dir, `test-${process.pid}.mjs`);
await build({stdin:{contents:`export {LOCALES} from './src/lib/locale-config'; export {useProject,migrateProject} from './src/lib/project-store';
export {emptyDrawing} from './src/lib/cad/types'; export {cadSnap} from './src/lib/cad/snap';
export {parseProjectFile,toProjectFile} from './src/lib/project-file';
export {projectToSvg,projectToDxf} from './src/lib/export-plan';
export {default as middleware} from './server/middleware/landscape';
export {taxonRecord,parseToolboxFacts} from './server/landscape-sources';`,resolveDir:process.cwd()},
  outfile:bundle,bundle:true,platform:"node",format:"esm",packages:"external",logLevel:"silent"});
const memory = new Map();
globalThis.localStorage = {getItem:k=>memory.get(k) ?? null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
globalThis.window = { localStorage: globalThis.localStorage };
const app = await import(pathToFileURL(bundle).href);
if (!app.useProject.persist.hasHydrated()) await new Promise(resolve => { const off = app.useProject.persist.onFinishHydration(() => { off(); resolve(); }); });
await rm(bundle);
const seed = JSON.parse(await readFile(new URL("../data/landscape-plants.json",import.meta.url),"utf8"));
const originalFetch = globalThis.fetch;
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(await readFile(new URL("../drizzle/0001_gorgeous_metal_master.sql",import.meta.url),"utf8"));
const db = {
  prepare(sql) { const statement=sqlite.prepare(sql); let values=[]; return {
    bind(...v){values=v;return this;},async first(){return statement.get(...values) ?? null;},
    async all(){return {results:statement.all(...values)};},async run(){statement.run(...values);},
  }; }, async batch(statements){for(const statement of statements)await statement.run();},
};
async function request(search="",method="GET",binding=db) {
  const url=new URL(`https://example.test/api/landscape${search}`),req=new Request(url,{method});
  req.runtime={cloudflare:{env:{DB:binding}}};
  return app.middleware({url,req},()=>{throw new Error("Unexpected route");});
}
test("catalog persists separate records, searches Russian, Latin and cultivar across categories, and is read-only",async()=>{
  globalThis.fetch=async()=>Response.json({results:[],total_results:0});
  const category=await (await request("?category=tree")).json();
  assert.ok(category.plants.length>=3);assert.ok(category.plants.every(p=>p.category==="tree"));
  for(const q of ["Береза","Betula pendula","Limelight","Лаймлайт"]){
    const response=await request(`?category=flower&q=${encodeURIComponent(q)}`);
    assert.equal(response.status,200);assert.ok((await response.json()).plants.length>=1,q);
  }
  assert.equal((await request("","PUT")).status,405);
  assert.equal((await request("?page=NaN")).status,400);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM landscape_plants").get().n,seed.length);
  globalThis.fetch=originalFetch;
});
test("unavailable remote search preserves local matches and reports the limitation",async()=>{
  globalThis.fetch=async()=>{throw new Error("offline fixture");};
  const log=console.error;console.error=()=>{};
  try{
    const result=await(await request(`?q=${encodeURIComponent("сирень")}`)).json();
    assert.equal(result.plants[0].latinName,"Syringa vulgaris");assert.ok(result.warning);
    assert.equal((await request("","GET",undefined)).status,200);
    const missing=await request("","GET",{});assert.equal(missing.status,503);
  }finally{console.error=log;globalThis.fetch=originalFetch;}
});
test("cached taxonomy results do not duplicate a verified species",async()=>{
  let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({results:[{id:777,name:"Betula pendula",rank_level:10,iconic_taxon_id:47126}],total_results:1});};
  try {
    for(let i=0;i<2;i++){
      const result=await(await request("?q=Betula")).json();
      const matches=result.plants.filter(p=>p.latinName==="Betula pendula");
      assert.equal(matches.length,1);assert.ok(matches[0].matureWidthM);
      assert.ok(matches[0].id.startsWith("plant-"));
    }
    assert.equal(calls,1);
  }finally{globalThis.fetch=originalFetch;}
});
test("external taxonomy does not invent traits or water, rejects non-plants and higher taxa",()=>{
  const basic={id:123,name:"Salvia officinalis",rank_level:10,iconic_taxon_id:47126,names:[{locale:"ru",name:"Шалфей лекарственный"}]};
  const p=app.taxonRecord(basic);assert.equal(p.water.need,null);assert.equal(p.water.quantity,null);assert.equal(p.matureWidthM,null);assert.equal(p.category,null);
  assert.equal(app.taxonRecord({...basic,iconic_taxon_id:1}),null);assert.equal(app.taxonRecord({...basic,rank_level:20}),null);
  const html='<h1>Salvia officinalis</h1>Dimensions: Height: 1 ft. 0 in. - 2 ft. 0 in. Width: 1 ft. 6 in. - 3 ft. 0 in. Whole Plant Traits: Plant Type: Shrub Cultural Conditions: Light: Full sun Soil Texture: Loam Soil pH: Neutral Soil Drainage: Good Drainage Moist USDA Plant Hardiness Zone: 5a, 5b';
  const sourced=app.parseToolboxFacts(html,p,"https://plants.ces.ncsu.edu/plants/salvia-officinalis/");
  assert.deepEqual([sourced.matureWidthM.min,sourced.matureWidthM.max],[0.46,0.91]);assert.equal(sourced.category,"shrub");assert.equal(sourced.light,"fact_sun");assert.equal(sourced.soil,"fact_loam");assert.equal(sourced.water.need,null);
  assert.equal(app.parseToolboxFacts(html.replace('Salvia officinalis','Salvia splendens'),p,"https://example.test"),p);
});
test("plants edit, duplicate, undo, export and reopen independently without changing drawing scale",async()=>{
  const store=app.useProject;
  store.getState().setLocale("ru");
  store.getState().setUnitPreset("metric");
  store.getState().newProject();
  const view={panX:store.getState().panX,panY:store.getState().panY,pxPerMeter:store.getState().pxPerMeter};
  store.getState().preparePlant(seed[0],"tree",6);store.getState().placeCatalogPlant({x:8,y:9});
  const id=store.getState().selectedPlantId;
  assert.ok(id);assert.equal(store.getState().project.drawing.plants[id].r,3);
  store.getState().updatePlant(id,{x:12,y:14,r:2});
  assert.equal(store.getState().project.drawing.plants[id].irrigation.diameterM,4);
  store.getState().duplicatePlant(id);const copy=store.getState().selectedPlantId;
  assert.notEqual(copy,id);assert.equal(Object.keys(store.getState().project.drawing.plants).length,2);
  store.getState().removePlant(copy);assert.equal(Object.keys(store.getState().project.drawing.plants).length,1);
  store.getState().undo();assert.equal(Object.keys(store.getState().project.drawing.plants).length,2);
  const project=store.getState().project;
  const reopened=app.migrateProject(app.parseProjectFile(JSON.stringify({type:"irrigationproject",schemaVersion:1,project})).project);
  assert.deepEqual(reopened.drawing.plants,project.drawing.plants);
  const persisted = await store.persist.getOptions().storage.getItem("irrigation-designer-v3");
  assert.deepEqual(persisted.state.project.drawing.plants,project.drawing.plants);
  assert.match(app.projectToSvg(project),/Берёза повислая/);assert.match(app.projectToDxf(project),/TREES/);
  assert.deepEqual({panX:store.getState().panX,panY:store.getState().panY,pxPerMeter:store.getState().pxPerMeter},view);
  store.getState().selectPlant(id);store.getState().updatePlant(id,{locked:true});store.getState().deleteSelected();
  assert.ok(store.getState().project.drawing.plants[id]);
  store.getState().selectHead(null);assert.equal(store.getState().selectedPlantId,null);
});
test("plant centers and crown edges snap, with self-exclusion and hidden-layer handling",()=>{
  const drawing=app.emptyDrawing();drawing.plants={p:{id:"p",kind:"tree",x:5,y:5,r:2}};
  const options={pxPerMeter:100,snapOn:true,snapGridOn:false,gridStep:0.5};
  const center=app.cadSnap({x:5.05,y:5},drawing,options);
  assert.equal(center.kind,"center");assert.deepEqual(center.pt,{x:5,y:5});
  assert.equal(app.cadSnap({x:7.02,y:5},drawing,options).kind,"tangent");
  assert.equal(app.cadSnap({x:5,y:5},drawing,{...options,excludePlant:"p"}).kind,"none");
  drawing.layers.plants.visible=false;assert.equal(app.cadSnap({x:5,y:5},drawing,options).kind,"none");
});
test("snapping a new plant to an existing center preserves two independent objects",()=>{
  const store=app.useProject;store.getState().newProject();
  store.getState().preparePlant(seed[0],"tree",6);store.getState().placeCatalogPlant({x:8,y:9});
  const first=store.getState().selectedPlantId,point=store.getState().project.drawing.plants[first];
  store.getState().preparePlant(seed[3],"shrub",2);store.getState().placeCatalogPlant({x:point.x,y:point.y});
  const second=store.getState().selectedPlantId;
  assert.notEqual(first,second);assert.equal(Object.keys(store.getState().project.drawing.plants).length,2);
  assert.equal(store.getState().project.drawing.plants[second].kind,"shrub");
});
test("seed records have local photographs, provenance, and no unsourced quantitative water value",async()=>{
  for(const p of seed){assert.ok(p.id);assert.ok(p.photos[0].author);await readFile(resolve("public",p.photos[0].url.slice(1)));assert.ok(p.sources.length);if(p.water.need)assert.ok(p.water.sourceUrl);if(p.water.quantity){assert.ok(p.water.quantity.conditions);assert.ok(p.water.quantity.sourceUrl);}}
});

test("plant search forwards all twenty locales and preserves localized taxonomy names",async()=>{
  const locales=app.LOCALES.map(locale=>locale.id);
  const requested=[];
  globalThis.fetch=async url=>{
    const locale=new URL(url).searchParams.get("locale");requested.push(locale);
    return Response.json({results:[{id:991122,name:"Testus locales",rank_level:10,iconic_taxon_id:47126,preferred_common_name:`common-${locale}`,names:locales.map(locale=>({locale,name:`name-${locale}`}))}],total_results:1});
  };
  try {
    for(const locale of locales){
      const result=await(await request(`?q=locale-probe&locale=${locale}`)).json();
      const plant=result.plants.find(p=>p.id==="inat-991122");
      assert.ok(plant,locale);assert.equal(plant.names[locale],`name-${locale}`);
      for(const other of locales) assert.equal(plant.names[other],`name-${other}`);
    }
    assert.deepEqual(requested,locales);
  }finally{globalThis.fetch=originalFetch;}
});
