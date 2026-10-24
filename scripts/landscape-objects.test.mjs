import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=resolve('node_modules/.cache/landscape-object-tests');await mkdir(dir,{recursive:true});const bundle=resolve(dir,'app.mjs');
await build({stdin:{contents:`export * from './src/lib/landscape-objects';export * from './src/lib/landscape-snapping';export {useProject,migrateProject} from './src/lib/project-store';export {emptyDrawing} from './src/lib/cad/types';export {emptyProject} from './src/lib/project-types';export {addRect,toPolygons} from './src/lib/cad/engine';export {irrigationSurfaces,surfaceArea,headSurface} from './src/lib/irrigation-geometry';export {inIrrigable} from './src/lib/cad/irrigation-geom';export {cadSnap} from './src/lib/cad/snap';export {parseProjectFile} from './src/lib/project-file';export {projectToSvg} from './src/lib/export-plan';`,resolveDir:process.cwd()},outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const app=await import(pathToFileURL(bundle));await rm(bundle);const store=app.useProject;
function reset(){store.getState().newProject();store.setState({snapOn:false,projectFormOpen:false});const d=app.addRect(app.emptyDrawing(),{x:0,y:0},{x:20,y:15},'lawn');store.setState({project:{...store.getState().project,drawing:d,polygons:app.toPolygons(d)}});}
function place(catalogId,x,y,width=1,length=1){store.getState().prepareLandscape(catalogId,{width,length,rotation:0,keepRatio:true});store.getState().placeLandscape({x,y});return store.getState().selectedLandscapeId;}
const object=id=>store.getState().project.drawing.landscapeObjects[id];

test('landscape Magnet aligns centres, rotated edges and movement axes without hidden/self targets',()=>{
 const target={id:'target',catalogId:'table-rectangle',category:'furniture',x:2,y:4,length:4,width:2,rotation:0,keepRatio:true,noIrrigation:true};
 const moving={...target,id:'moving',length:2};
 const drawing={...app.emptyDrawing(),landscapeObjects:{target}};
 const options={pxPerMeter:100,snapOn:true,snapGridOn:false,gridStep:.5};
 const snap=(point,d=drawing,extra={})=>app.snapLandscapePoint(point,moving,d,{...options,...extra}).pt;
 assert.deepEqual(snap({x:8,y:4.06}),{x:8,y:4});
 assert.deepEqual(snap({x:2.06,y:10}),{x:2,y:10});
 assert.deepEqual(snap({x:5.04,y:9}),{x:5,y:9},'left edge joins right edge');
 assert.deepEqual(snap({x:4.04,y:9},{...drawing,landscapeObjects:{target:{...target,rotation:90}}}),{x:4,y:9});
 assert.deepEqual(snap({x:8,y:4.06},drawing,{snapOn:false,snapGridOn:true}),{x:8,y:4.06});
 assert.deepEqual(snap({x:8,y:4.06},{...drawing,landscapeObjects:{target:{...target,hidden:true}}}),{x:8,y:4.06});
 assert.deepEqual(snap({x:8,y:4.06},{...drawing,layers:{furniture:{visible:false}}}),{x:8,y:4.06});
 assert.deepEqual(snap({x:8,y:4.06},{...drawing,landscapeObjects:{moving}}),{x:8,y:4.06});
 assert.deepEqual(snap({x:2.06,y:10},app.emptyDrawing(),{origin:{x:2,y:4}}),{x:2,y:10});
 assert.equal(snap({x:8,y:4.1}).y,4.1);assert.equal(snap({x:8,y:4.1},drawing,{pointerType:'touch'}).y,4);
 assert.equal(snap({x:8,y:4.1},drawing,{pxPerMeter:50}).y,4,'tolerance is in screen pixels');
 assert.equal(snap({x:8,y:4.06},{...drawing,landscapeObjects:{target:{...target,y:4.03}}},{snapGridOn:true}).y,4.03,'alignment wins over grid');
 assert.equal(app.landscapeAlignmentGuides({x:8,y:4.2},moving,drawing,100).find(g=>g.axis==='y').aligned,false);
 assert.equal(app.landscapeAlignmentGuides({x:8,y:4},moving,drawing,100).find(g=>g.axis==='y').aligned,true);
 for(const [angle,expected] of [[3,0],[87,90],[183,180],[267,270],[358,0],[40,40]]){
  assert.equal(app.snapLandscapeRotation(angle,true),expected);assert.equal(app.snapLandscapeRotation(angle,false),angle);
 }
});

test('equipment joins in the same row and column, even beside a competing CAD edge',()=>{
 const target={id:'target',catalogId:'bbq-built-in',category:'equipment',x:4,y:4,length:2,width:1,rotation:0,keepRatio:true,noIrrigation:true};
 const moving={...target,id:'moving',x:10,y:10};
 const drawing={...app.emptyDrawing(),landscapeObjects:{target}};
 const options={pxPerMeter:100,snapOn:true,snapGridOn:false,gridStep:.5};
 const snap=(p,d=drawing,extra={})=>app.snapLandscapePoint(p,moving,d,{...options,...extra}).pt;
 assert.deepEqual(snap({x:6.04,y:4.04}),{x:6,y:4},'adjoining left/right edges in one row');
 assert.deepEqual(snap({x:4.04,y:5.04}),{x:4,y:5},'adjoining top/bottom edges in one column');
 const wall=app.addRect(drawing,{x:0,y:0},{x:15,y:.07},'lawn');
 for(const v of Object.values(wall.vertices))v.y+=.8+.4*v.x;
 assert.deepEqual(snap({x:8,y:4.04},wall),{x:8,y:4},'object alignment wins over a nearby edge pulling its centre');
 assert.deepEqual(snap({x:6.04,y:4.04},drawing,{snapOn:false}),{x:6.04,y:4.04});
 assert.ok(app.landscapeAlignmentGuides({x:6,y:4},moving,drawing,100).some(g=>g.axis==='x'&&g.aligned));
});

test('library placement commits the same magnetic alignment and can undo/redo',()=>{
 reset();place('table-rectangle',5,5,2,4);
 store.setState({snapOn:true,snapGridOn:false,pxPerMeter:100});
 const id=place('bench-wood',12,5.04,1,2);assert.equal(object(id).y,5);
 store.getState().undo();assert.ok(!object(id));store.getState().redo();assert.equal(object(id).y,5);
 store.setState({snapOn:false});const free=place('bench-wood',16,5.04,1,2);assert.equal(object(free).y,5.04);
});

test('variant cards change groups atomically without changing irrigation or other variants',()=>{
 reset();const a=place('bench-wood',2,2),b=place('bench-wood',5,2),other=place('gazebo-open',10,10);
 const heads=store.getState().project.heads,zones=store.getState().project.zones;
 store.getState().changeLandscapeGroup('object',a,'visibility');
 assert.equal(object(a).hidden,true);assert.equal(object(b).hidden,true);assert.ok(!object(other).hidden);
 store.getState().undo();assert.ok(!object(a).hidden);assert.ok(!object(b).hidden);
 store.getState().changeLandscapeGroup('object',a,'lock');
 assert.equal(object(a).locked,true);assert.equal(object(b).locked,true);
 store.getState().changeLandscapeGroup('object',a,'delete');assert.ok(object(a));
 store.getState().changeLandscapeGroup('object',a,'lock');
 store.getState().changeLandscapeGroup('object',a,'delete');
 assert.ok(!object(a));assert.ok(!object(b));assert.ok(object(other));
 assert.deepEqual(store.getState().project.heads,heads);assert.deepEqual(store.getState().project.zones,zones);
 store.getState().undo();assert.ok(object(a));assert.ok(object(b));
 store.getState().redo();assert.ok(!object(a));assert.ok(!object(b));
});

test('category layers are automatic, persistent and independent of irrigation and plants',()=>{
 reset();const clean=store.getState().project;
 store.setState({project:{...clean,heads:[{id:'keep-head',catalogId:'MP1000-360',x:2,y:2,r:3,start:0,arc:360,zone:1}],zones:[{id:1,name:'Keep zone',hidden:false,locked:false}],drawing:{...clean.drawing,plants:{'keep-plant':{id:'keep-plant',kind:'tree',x:15,y:10,r:1}}}}});
 const before=store.getState().project;assert.equal(before.drawing.layers.furniture,undefined);
 const ids=[place('gazebo-square',4,4,2,3),place('bench-wood',10,4,1,2),place('light-ground',15,4,1,1),place('planter-stone',4,10,1,1),place('bbq-built-in',10,10,1,2)];
 const after=store.getState().project;
 assert.equal(app.surfaceArea(app.irrigationSurfaces(after).target),289,'6+2+1+2 square metres excluded; light footprint still irrigated');
 assert.equal(app.inIrrigable({x:4,y:4},after.drawing),false);assert.equal(app.inIrrigable({x:15,y:4},after.drawing),true);
 assert.equal(Object.keys(after.drawing.landscapeObjects).length,5);assert.deepEqual(app.LANDSCAPE_CATEGORIES.filter(c=>after.drawing.layers[c]),['furniture','lighting','decor','equipment']);
 store.getState().setCadLayer('furniture',{visible:false});assert.equal(app.surfaceArea(app.irrigationSurfaces(store.getState().project).target),289,'eye only affects rendering');assert.equal(store.getState().rightMode,'landscape');
 assert.equal((app.projectToSvg(store.getState().project).match(/data-landscape-id=/g)||[]).length,3);
 store.getState().renameLandscapeLayer('lighting','Path lights');assert.equal(app.landscapeLayerName(store.getState().project.drawing,'lighting'),'Path lights');
 store.getState().setCadLayer('lighting',{locked:true});store.getState().updateLandscape(ids[2],{x:99});assert.equal(object(ids[2]).x,15);
 store.getState().deleteLandscapeLayer('lighting');assert.ok(object(ids[2]));
 const saved=app.parseProjectFile(JSON.stringify({project:store.getState().project})).project;assert.deepEqual(saved.drawing.landscapeObjects,store.getState().project.drawing.landscapeObjects);assert.equal(saved.drawing.layers.lighting.name,'Path lights');
 const heads=store.getState().project.heads,zones=store.getState().project.zones,plants=store.getState().project.drawing.plants;
 store.getState().deleteLandscapeLayer('furniture');assert.equal(Object.keys(store.getState().project.drawing.landscapeObjects).length,3);
 assert.deepEqual(store.getState().project.heads,heads);assert.deepEqual(store.getState().project.zones,zones);assert.deepEqual(store.getState().project.drawing.plants,plants);
 store.getState().undo();assert.equal(Object.keys(store.getState().project.drawing.landscapeObjects).length,5);store.getState().redo();assert.equal(Object.keys(store.getState().project.drawing.landscapeObjects).length,3);
});

test('size, rotation, duplicates, favorites and recent objects retain editable data',()=>{
 reset();const id=place('table-rectangle',5,5,1,2),start=object(id);
 const size=app.resizeLandscapeObject(start,50,25,50);assert.equal(size.length,4);assert.equal(size.width,2);
 store.getState().updateLandscape(id,size);store.getState().updateLandscape(id,{rotation:405});assert.equal(object(id).rotation,45);assert.deepEqual([object(id).x,object(id).y],[5,5]);
 store.getState().undo();assert.equal(object(id).rotation,0);store.getState().redo();assert.equal(object(id).rotation,45);
 store.getState().duplicateLandscape(id);const copy=object(store.getState().selectedLandscapeId);assert.deepEqual([copy.catalogId,copy.width,copy.length,copy.rotation,copy.noIrrigation],[start.catalogId,2,4,45,true]);
 assert.equal(store.getState().landscapeRecent[0],'table-rectangle');assert.equal(store.getState().landscapeRecent.filter(x=>x==='table-rectangle').length,1);
 store.getState().toggleLandscapeFavorite('table-rectangle');assert.ok(store.getState().landscapeFavorites.includes('table-rectangle'));store.getState().toggleLandscapeFavorite('table-rectangle');assert.ok(!store.getState().landscapeFavorites.includes('table-rectangle'));
 const unlocked={...copy,keepRatio:false,rotation:90};const axis=app.resizeLandscapeObject(unlocked,0,50,50,'length');assert.ok(Math.abs(axis.length-6)<1e-8);assert.equal(axis.width,2);
 store.getState().updateLandscape(id,{noIrrigation:false});assert.equal(object(id).noIrrigation,false);
 store.getState().inspectPlant({id:'test'});assert.equal(store.getState().selectedLandscapeId,null);assert.equal(store.getState().inspectedLandscapeId,null);
});

test('rotated and concave footprints drive coverage and snap without stopping jets',()=>{
 const hex=app.landscapeFootprint({catalogId:'gazebo-open',length:4,width:3,x:0,y:0,rotation:0});
 assert.ok(Math.abs(Math.max(...hex.map(p=>p.x))-Math.min(...hex.map(p=>p.x))-4)<1e-9);
 assert.ok(Math.abs(Math.max(...hex.map(p=>p.y))-Math.min(...hex.map(p=>p.y))-3)<1e-9);
 reset();const id=place('kitchen-corner',5,5,3,3);store.getState().updateLandscape(id,{rotation:90});
 assert.equal(app.inIrrigable({x:5,y:5},store.getState().project.drawing),true,'open L centre remains lawn');
 assert.equal(app.inIrrigable({x:6.3,y:5},store.getState().project.drawing),false,'rotated solid arm excluded');
 const o=object(id),corner=app.landscapeFootprint(o)[0],hit=app.cadSnap({x:corner.x+.03,y:corner.y},store.getState().project.drawing,{pxPerMeter:50,snapOn:true,snapGridOn:false,gridStep:.5});assert.ok(Math.hypot(hit.pt.x-corner.x,hit.pt.y-corner.y)<.04);
 const head={x:0,y:5,r:10,start:0,arc:180,catalogId:'MP2000-90'};const water=app.headSurface(head);store.getState().updateLandscape(id,{x:6});assert.deepEqual(app.headSurface(head),water,'no irrigation does not mean a water-jet obstacle');
});

test('catalog covers all four rubrics and has complete localized labels',async()=>{
 assert.equal(app.LANDSCAPE_OBJECTS.length,126);assert.equal(new Set(app.LANDSCAPE_OBJECTS.map(r=>r.id)).size,126);
 for(const r of app.LANDSCAPE_OBJECTS.filter(r=>r.shape==='circle')){
  const art=app.landscapeArtworkBox({catalogId:r.id,length:1,width:1});
  assert.ok(Math.abs(art.width/art.height-art.crop.width/art.crop.height)<1e-9,`${r.id}: original artwork proportions`);
  assert.ok(art.width<=1+1e-10&&art.height<=1+1e-10,`${r.id}: diameter bounds`);
 }

 assert.deepEqual(Object.fromEntries(app.LANDSCAPE_CATEGORIES.map(c=>[c,app.LANDSCAPE_OBJECTS.filter(r=>r.category===c).length])),{furniture:30,lighting:30,decor:36,equipment:30});
 for(const locale of ['en','ru','es','pt-BR','fr','it','de','ar','tr','pl','zh-CN','nl','cs','el','hu','ro','sk','he','uk','ja']){
  const dict=JSON.parse(await readFile(`src/lib/locales/${locale}.json`));for(const r of app.LANDSCAPE_OBJECTS)for(const key of [`landscapeObject_${r.id}`,`landscapeCategory_${r.category}`,`landscapeSubcategory_${r.subcategory}`])assert.ok(dict[key],`${locale}: ${key}`);
 }
});

test('new open-centre objects do not exclude the lawn inside their openings',()=>{
 for(const catalogId of ['kitchen-u','bench-semicircle']){
  reset();place(catalogId,5,5,2,4);
  assert.equal(app.inIrrigable({x:5,y:5.5},store.getState().project.drawing),true,`${catalogId}: opening`);
  assert.equal(app.inIrrigable({x:5,y:4.1},store.getState().project.drawing),false,`${catalogId}: solid top`);
 }
});

test('portrait catalogue artwork retains a sensible physical placement size',()=>{
 for(const [id,longest] of [['light-linear-recessed',.8],['hammock-timber',3.4]]){
  const size=app.defaultLandscapeSize(app.landscapeRecord(id));
  assert.ok(Math.abs(Math.max(size.width,size.length)-longest)<1e-8,id);
 }
});

test('individual landscape eyes persist, undo and leave irrigation exclusions unchanged',()=>{
 reset();const id=place('bench-wood',5,5,1,2),other=place('bench-wood',10,5,1,2);
 const before=app.surfaceArea(app.irrigationSurfaces(store.getState().project).target);
 store.getState().updateLandscape(id,{locked:true});
 store.getState().updateLandscape(id,{hidden:true});
 let pr=store.getState().project;
 assert.equal(object(id).hidden,true);assert.equal(object(other).hidden,undefined);
 assert.equal(app.landscapeLayerVisible(pr.drawing,'furniture',object(id)),false);
 assert.equal((app.projectToSvg(pr).match(/data-landscape-id=/g)||[]).length,1);
 assert.equal(app.surfaceArea(app.irrigationSurfaces(pr).target),before);
 assert.equal(app.parseProjectFile(JSON.stringify({project:pr})).project.drawing.landscapeObjects[id].hidden,true);
 store.getState().undo();assert.equal(object(id).hidden,undefined);store.getState().redo();assert.equal(object(id).hidden,true);
 const drawing={...store.getState().project.drawing,plants:{tree:{id:'tree',kind:'tree',x:2,y:2,r:1,locked:true}}};
 store.setState({project:{...store.getState().project,drawing}});
 store.getState().updatePlant('tree',{hidden:true});pr=store.getState().project;
 assert.equal(pr.drawing.plants.tree.hidden,true);assert.ok(!app.projectToSvg(pr).includes('data-plant-id='));
 assert.equal(app.parseProjectFile(JSON.stringify({project:pr})).project.drawing.plants.tree.hidden,true);
 store.getState().undo();assert.equal(store.getState().project.drawing.plants.tree.hidden,undefined);
});
