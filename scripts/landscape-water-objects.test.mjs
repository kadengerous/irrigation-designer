import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createServer} from 'vite';

let server, store, objects, emptyDrawing, emptyProject, engine, geometry, file, validProject, migrateProject;
before(async()=>{
  server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
  [{useProject:store,migrateProject},objects,{emptyDrawing},{emptyProject},engine,geometry,file,{validProject}]=await Promise.all([
    'project-store','landscape-objects','cad/types','project-types','cad/engine','irrigation-geometry','project-file','project-validation',
  ].map(path=>server.ssrLoadModule('/src/lib/'+path+'.ts')));
});
after(async()=>{await server?.close();});
const ids=['pool-square','pool-round','pool-rectangle','tub-round-wood','tub-square-spa','tub-rectangle-plunge'];
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function reset(mode='image') {
  const drawing=engine.addRect(emptyDrawing(),{x:0,y:0},{x:30,y:30},'lawn');
  store.setState({project:{...emptyProject(),drawing,polygons:engine.toPolygons(drawing)},projects:[],past:[],future:[],pastOps:[],futureOps:[],
    snapOn:false,landscapeVisualMode:mode,pendingCatalogPlant:null,pendingLandscapeObject:null,selectedPlantId:null,selectedLandscapeId:null});
}
const currentObject=()=>store.getState().project.drawing.landscapeObjects[store.getState().selectedLandscapeId];
function place(id,mode) {
  const r=objects.landscapeRecord(id);
  store.getState().prepareLandscape(id,{...objects.defaultLandscapeSize(r),rotation:0,keepRatio:objects.defaultLandscapeKeepRatio(r),...(mode?{visualMode:mode}:{})});
  store.getState().placeLandscape({x:10,y:10});
  return currentObject();
}
const area=()=>geometry.surfaceArea(geometry.irrigationSurfaces(store.getState().project).target);

test('six water objects use physical preset sizes and exclude the whole pool or tub from irrigation',()=>{
  const expected=[[4,4],[4,4],[6,3],[2,2],[2,2],[2,1.2]];
  for(let i=0;i<ids.length;i++) {
    reset();const r=objects.landscapeRecord(ids[i]);assert.ok(r);assert.equal(r.category,'decor');
    assert.deepEqual(objects.defaultLandscapeSize(r),{length:expected[i][0],width:expected[i][1]});
    const o=place(ids[i]);assert.equal(o.noIrrigation,true);assert.equal(o.visualMode,'image');
    assert.equal(o.keepRatio,r.shape!=='rect');
    const expectedArea=r.shape==='circle'?Math.PI*(o.length/2)**2:o.length*o.width;
    assert.ok(Math.abs((900-area())-expectedArea)<.02,ids[i]+': occupied water area');
    const footprint=objects.landscapeFootprint(o);
    assert.ok(footprint.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
    assert.ok(footprint.length>=4);
  }
});

test('independent rectangular sizes and linked square/circle sizes survive editing and undo',()=>{
  reset();const rect=place('pool-rectangle');
  store.getState().updateLandscape(rect.id,{length:9,width:2.5});
  assert.deepEqual([currentObject().length,currentObject().width],[9,2.5]);
  close(area(),900-22.5);
  store.getState().undo();assert.deepEqual([currentObject().length,currentObject().width],[6,3]);
  store.getState().redo();assert.deepEqual([currentObject().length,currentObject().width],[9,2.5]);
  for(const id of ['pool-square','pool-round','tub-square-spa','tub-round-wood']) {
    reset();const o=place(id);
    store.getState().updateLandscape(o.id,{length:3});assert.deepEqual([currentObject().length,currentObject().width],[3,3]);
    store.getState().updateLandscape(o.id,{width:5,keepRatio:false});assert.deepEqual([currentObject().length,currentObject().width,currentObject().keepRatio],[5,5,true]);
    const before=JSON.stringify(currentObject());store.getState().updateLandscape(o.id,{length:NaN});assert.equal(JSON.stringify(currentObject()),before);
  }
});

test('per-object image/vector changes preserve placement, exclusions, other objects and history',()=>{
  reset();const a=place('pool-rectangle'),b=place('tub-square-spa');
  store.getState().updateLandscape(b.id,{x:20,y:20});
  const original=structuredClone(store.getState().project.drawing.landscapeObjects),beforeArea=area();
  store.getState().updateLandscape(a.id,{visualMode:'vector'});
  let drawing=store.getState().project.drawing;
  assert.deepEqual(drawing.landscapeObjects[a.id],{...original[a.id],visualMode:'vector'});
  assert.deepEqual(drawing.landscapeObjects[b.id],original[b.id]);close(area(),beforeArea);
  store.getState().undo();assert.deepEqual(store.getState().project.drawing.landscapeObjects,original);
  store.getState().redo();assert.equal(store.getState().project.drawing.landscapeObjects[a.id].visualMode,'vector');
  store.getState().duplicateLandscape(a.id);assert.equal(currentObject().visualMode,'vector');
  store.getState().updateLandscape(a.id,{locked:true});store.getState().updateLandscape(a.id,{visualMode:'image'});
  assert.equal(store.getState().project.drawing.landscapeObjects[a.id].visualMode,'vector','locked object cannot change');
});

test('new plant mode follows the chosen default while existing plants remain independently editable',()=>{
  reset('vector');
  const plantRecord={id:'test-tree',category:'tree',symbol:'deciduous',latinName:'Testus',russianName:null,cultivar:null,aliases:[],photos:[],sources:[],matureWidthM:null,matureHeightM:null,light:null,soil:null,moisture:null,hardiness:null,description:null,water:{need:null,sourceUrl:null,context:null,quantity:null,method:null,wettingZone:null,recommendations:null}};
  store.getState().preparePlant(plantRecord,'tree',3);store.getState().placeCatalogPlant({x:4,y:4});
  const id=store.getState().selectedPlantId,plant=structuredClone(store.getState().project.drawing.plants[id]);assert.equal(plant.visualMode,'vector');
  store.getState().updatePlant(id,{visualMode:'image'});assert.deepEqual(store.getState().project.drawing.plants[id],{...plant,visualMode:'image'});
  store.getState().undo();assert.deepEqual(store.getState().project.drawing.plants[id],plant);
  store.getState().duplicatePlant(id);assert.equal(store.getState().project.drawing.plants[store.getState().selectedPlantId].visualMode,'vector');
  store.setState({landscapeVisualMode:'image'});assert.equal(store.getState().project.drawing.plants[id].visualMode,'vector');
  store.getState().preparePlant(plantRecord,'tree',2,'vector');assert.equal(store.getState().pendingCatalogPlant.visualMode,'vector');
  store.getState().updatePlant(id,{visualMode:'invalid'});assert.equal(store.getState().project.drawing.plants[id].visualMode,'vector');
});

test('mixed styles and sizes round-trip; legacy projects remain valid and invalid style values are rejected',()=>{
  reset('vector');const o=place('pool-round');
  const pr=store.getState().project;
  pr.drawing.plants={legacy:{id:'legacy',kind:'tree',x:2,y:3,r:1},vector:{id:'vector',kind:'flower',x:4,y:3,r:.3,visualMode:'vector'}};
  const restored=file.parseProjectFile(JSON.stringify({project:pr})).project;
  assert.deepEqual(restored.drawing.landscapeObjects,pr.drawing.landscapeObjects);
  assert.deepEqual(restored.drawing.plants,pr.drawing.plants);
  const migrated=migrateProject(JSON.parse(JSON.stringify(restored)));
  assert.equal(migrated.drawing.landscapeObjects[o.id].visualMode,'vector');
  assert.equal(migrated.drawing.plants.legacy.visualMode,undefined);assert.equal(validProject(migrated),true);
  const bad=structuredClone(pr);bad.drawing.landscapeObjects[o.id].visualMode='unknown';assert.equal(validProject(bad),false);
  const options=store.persist.getOptions();assert.equal(options.partialize(store.getState()).landscapeVisualMode,'vector');
  assert.equal(options.merge({landscapeVisualMode:'vector'},store.getState()).landscapeVisualMode,'vector');
  assert.equal(options.merge({landscapeVisualMode:'bad'},store.getState()).landscapeVisualMode,'image');
});
