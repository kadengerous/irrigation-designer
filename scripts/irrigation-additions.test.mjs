import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
let server,engine,types,store,projectTypes,snap,hydro,flow,catalog,auto,exports,files,saveState,labels,Selection;
before(async()=>{
  server=await createServer({server:{middlewareMode:true,hmr:false}});
  const load=p=>server.ssrLoadModule('/src/'+p);
  engine=await load('lib/cad/engine.ts');types=await load('lib/cad/types.ts');
  ({useProject:store}=await load('lib/project-store.ts'));projectTypes=await load('lib/project-types.ts');
  snap=await load('lib/head-snapping.ts');hydro=await load('lib/hydro.ts');flow=await load('lib/flow.ts');catalog=await load('lib/hunter-catalog.ts');
  auto=await load('lib/cad/auto-dimensions.ts');exports=await load('lib/export-plan.ts');files=await load('lib/project-file.ts');
  saveState=await load('lib/file-save.ts');labels=await load('lib/catalog-localization.ts');
  ({HeadSelectionActions:Selection}=await load('components/designer/head-selection-actions.tsx'));
});
after(async()=>{await server?.close();});
const head=(id,x,y,zone=1,model='MP2000-90')=>({...flow.catalogHeadDefaults(catalog.itemById(model)),id,x,y,zone,catalogId:model,start:0,locked:false});
const selectionMarkup=()=>{Object.assign(store.getInitialState(),store.getState());return renderToStaticMarkup(createElement(Selection));};
function rectangle(){return engine.addRect(types.emptyDrawing(),{x:0,y:0},{x:40,y:1000},'lawn');}
test('snap hierarchy, exact diagonal midpoint, distant alignment, red hint and green exact guide',()=>{
 const d=rectangle(),heads=[head('opposite',0,301)];
 const options={snapOn:true,snapGridOn:true,gridStep:1,pxPerMeter:40,heads};
 assert.deepEqual(snap.snapSprinklerPoint({x:.1,y:.1},d,options).pt,{x:0,y:0});
 assert.equal(snap.snapSprinklerPoint({x:39.95,y:499.9},d,options).kind,'mid');
 const edge=snap.snapSprinklerPoint({x:39.9,y:301.1},d,options);
 assert.deepEqual(edge.pt,{x:40,y:301});
 const exact=snap.sprinklerAlignmentGuides(edge.pt,heads,40);assert.ok(exact.some(g=>g.axis==='y'&&g.exact));
 assert.ok(snap.sprinklerAlignmentGuides({x:40,y:301.4},heads,40).some(g=>!g.exact));
 assert.equal(snap.sprinklerAlignmentGuides({x:40,y:302},heads,40).length,0);
 const tilted=engine.addDrawingLines(types.emptyDrawing(),[{x:1,y:2},{x:9,y:8}],'lawn');
 assert.deepEqual(snap.snapSprinklerPoint({x:5.03,y:4.96},tilted,options).pt,{x:5,y:5});
 const off={x:.21,y:.12};assert.deepEqual(snap.snapSprinklerPoint(off,d,{...options,snapOn:false,snapGridOn:false}).pt,off);
 assert.deepEqual(snap.snapSprinklerPoint(off,d,{...options,snapOn:false}).pt,off);
 assert.equal(snap.snapSprinklerPoint({x:40.09,y:310.43},d,options).pt.y,310.43,'grid never drags an edge point');
 const self=snap.snapSprinklerPoint({x:15.12,y:302.3},types.emptyDrawing(),{...options,heads:[head('self',15,302)],excludeHead:'self',snapGridOn:false});
 assert.equal(self.kind,'none');
 for(const px of [8,40,160]) assert.deepEqual(snap.snapSprinklerPoint({x:40-4/px,y:301+4/px},d,{...options,pxPerMeter:px}).pt,{x:40,y:301});
});
test('automatic zones belong to figure IDs, returning reuses them, incompatible heads split, manual assignments survive',()=>{
 let d=engine.addRect(types.emptyDrawing(),{x:0,y:0},{x:10,y:8},'lawn');d=engine.addRect(d,{x:20,y:0},{x:30,y:8},'lawn');
 const p={...projectTypes.emptyProject(),drawing:d,polygons:engine.toPolygons(d),zoneFlowLimitLpm:500};
 store.setState({project:p,projects:[],snapOn:true,snapGridOn:true,gridStep:.5,pxPerMeter:40,activeZoneId:1,selectedIds:[],past:[],future:[],pastOps:[],futureOps:[]});
 store.getState().placeHead({x:0,y:0},'MP2000-90');const first=store.getState().project.heads[0];
 store.getState().placeHead({x:20,y:0},'MP2000-90');const second=store.getState().project.heads[1];
 assert.notEqual(first.zone,second.zone);assert.notEqual(first.figureId,second.figureId);
 store.getState().placeHead({x:10,y:0},'MP2000-90');assert.equal(store.getState().project.heads[2].zone,first.zone);assert.equal(store.getState().project.zones.length,2);
 store.getState().transferHeadToZone(first.id,second.zone);
 store.getState().placeHead({x:0,y:8},'MP2000-90');assert.equal(store.getState().project.heads[3].zone,first.zone);
 assert.equal(store.getState().project.heads.find(h=>h.id===first.id).zone,second.zone);
 store.getState().placeHead({x:10,y:8},'8A');assert.equal(store.getState().project.zones.length,3);
 const saved=files.parseProjectFile(JSON.stringify(files.toProjectFile({project:store.getState().project}))).project;
 assert.equal(saved.heads.find(h=>h.id===first.id).zoneAssignment,'manual');
 assert.ok(saved.zones.every(z=>z.figureId));
 store.getState().removeHead(second.id);
 const moved=store.getState().project.heads.find(h=>h.id===first.id);assert.equal(moved.zoneAssignment,'manual');
 assert.notEqual(store.getState().project.zones.find(z=>z.id===moved.zone).figureId,first.figureId,'deleting another head does not undo a manual transfer');
});
test('concave figure interior dimensions stop at the real boundary, ties use left, corner chains never cross diagonally',()=>{
 const d=engine.fromPolygons([{id:'L',type:'poly',kind:'lawn',closed:true,points:[{x:0,y:0},{x:10,y:0},{x:10,y:3},{x:4,y:3},{x:4,y:9},{x:0,y:9}]}]);
 const p={...projectTypes.emptyProject(),drawing:d,heads:[head('inner',2,6),head('elbow',4,3),head('bottom',4,9),head('left',0,9)]};
 const out=auto.automaticDimensions(p,'irrigation');const dims=Object.values(out.dims);
 const inside=dims.filter(d=>d.autoKey.includes(':inside:inner:'));assert.equal(inside.length,2);
 assert.deepEqual(inside.find(d=>d.autoKey.endsWith(':x')).b,{x:0,y:6});
 assert.deepEqual(inside.find(d=>d.autoKey.endsWith(':y')).a,{x:2,y:9});
 for(const dim of dims.filter(d=>d.autoKey.includes(':side:')))assert.ok(dim.a.x===dim.b.x||dim.a.y===dim.b.y);
 const moved=engine.drawingOrMigrate({...p,drawing:out,heads:[head('inner',6,2)]});
 assert.deepEqual(Object.values(moved.dims).find(d=>d.autoKey.endsWith(':x')).b,{x:10,y:2});
 assert.equal(Object.values(moved.dims).length,2);
});
test('bulk zone labels localize, custom names persist, current and new zones are always listed',()=>{
 const zones=[{id:1,name:'Zone 1',hidden:false,locked:false},{id:2,name:'Газон перед домом',nameKind:'custom',hidden:false,locked:false}];
 const p={...projectTypes.emptyProject(),zones,heads:[head('a',0,0),head('b',0,1)]};
 store.setState({project:p,selectedIds:['a','b']});store.getState().setLocale('ru');
 let html=selectionMarkup();assert.ok(html.includes('Зона 1'));assert.ok(!html.includes('Zone 1'));assert.ok(html.includes('Газон перед домом'));assert.ok(!html.includes('Добавить зону'));
 store.getState().addZone();html=selectionMarkup();assert.ok(html.includes('Зона 3'));assert.ok(html.includes('value="1"'));
 store.getState().assignSelectedToZone(3);assert.ok(store.getState().project.heads.every(h=>h.zone===3));
 html=selectionMarkup();assert.ok(html.includes('Зона 3'));
 store.setState({project:{...p,heads:[head('a',0,0,0),head('b',0,1,2)]}});assert.ok(selectionMarkup().includes('Разные зоны'));
 store.setState({project:{...p,heads:[head('a',0,0,0),head('b',0,1,0)]}});assert.ok(selectionMarkup().includes('Без зоны'));
 const english=catalog.CATALOG.map(i=>[labels.catalogName(i),catalog.bomLineName(i),...i.nozzles.map(labels.nozzleName)]);
 for(const locale of ['en','ru','es','pt-BR','fr','it','de','ar','tr','pl','zh-CN','nl','cs','el','hu','ro','sk','he','uk','ja']) {
   store.getState().setLocale(locale);assert.deepEqual(catalog.CATALOG.map(i=>[labels.catalogName(i),catalog.bomLineName(i),...i.nozzles.map(labels.nozzleName)]),english);
 }
});
test('round figures retain their identity at arbitrary perimeter points and interior references use the actual circle',async()=>{
 const {figureAtPoint,irrigationFigures}=await server.ssrLoadModule('/src/lib/irrigation-figures.ts');
 const d=engine.addCircle(types.emptyDrawing(),{x:20,y:20},10,'lawn');
 const point={x:20+10*Math.cos(.123),y:20+10*Math.sin(.123)};
 assert.equal(figureAtPoint(point,irrigationFigures(d)).id,Object.keys(d.faces)[0]);
 const p={...projectTypes.emptyProject(),drawing:d,heads:[head('inside',23,22),head('boundary',point.x,point.y)]};
 const dims=Object.values(auto.automaticDimensions(p,'irrigation').dims);
 assert.equal(dims.length,2);assert.ok(dims.every(d=>d.autoKey.includes(':inside:inside:')));
 assert.ok(Math.abs(dims.find(d=>d.autoKey.endsWith(':y')).a.y-(20+Math.sqrt(100-9)))<1e-9);
 assert.ok(Math.abs(dims.find(d=>d.autoKey.endsWith(':x')).b.x-(20+Math.sqrt(100-4)))<1e-9);
});
test('external save requires destination, cancels cleanly, awaits close and aborts failed writes',async()=>{
 const previousWindow=globalThis.window;let options,writes=[],closed=false,aborted=false;
 const target={createWritable:async()=>({write:async blob=>writes.push(blob),close:async()=>{closed=true;},abort:async()=>{aborted=true;}})};
 globalThis.window={showSaveFilePicker:async opts=>{options=opts;return target;}};
 try {
   const chosen=await exports.chooseSaveTarget('Сад.ird','application/json');assert.equal(options.suggestedName,'Сад.ird');assert.deepEqual(options.types[0].accept,{'application/json':['.ird']});
   await exports.saveFile(new Blob(['test']),'Сад.ird',chosen);assert.ok(closed);assert.equal(await writes[0].text(),'test');
   globalThis.window.showSaveFilePicker=async()=>{throw new DOMException('Cancelled','AbortError');};
   assert.equal(await exports.chooseSaveTarget('Сад.ird','application/json'),null);assert.equal(writes.length,1);
   await assert.rejects(exports.saveFile(new Blob(['bad']),'bad.ird',{createWritable:async()=>({write:async()=>{throw Error('disk full');},close:async()=>{},abort:async()=>{aborted=true;}})}));assert.ok(aborted);
   globalThis.window={};const fallback=await exports.chooseSaveTarget('Сад.ird','application/json');const pending=exports.saveFile(new Blob(['backup']),'Сад.ird',fallback);
   await new Promise(resolve=>setImmediate(resolve));assert.equal(saveState.useFileSave.getState().request.filename,'Сад.ird');assert.equal(writes.length,1,'no silent download');
   saveState.useFileSave.getState().request.finish();await pending;
 }finally{globalThis.window=previousWindow;}
});
test('other desktop browsers keep native Save Link As without an ordinary-click download',()=>{
 assert.equal(saveState.fileSaveMode({picker:false,mobile:false,share:true}),'link','desktop sharing must not masquerade as folder selection');
 assert.equal(saveState.fileSaveMode({picker:true,mobile:false,share:true}),'picker');
 assert.equal(saveState.fileSaveMode({picker:false,mobile:true,share:true}),'share');
 let prevented=false;saveState.preventFileNavigation({preventDefault:()=>{prevented=true;}});assert.ok(prevented);
 for(const ext of ['ird','pdf','png','jpeg','xlsx'])assert.equal(saveState.fileWithExtension(`Участок.${ext}`,ext),`Участок.${ext}`);
});
test('Mac Safari uses explicit downloads while native pickers and mobile file sharing take priority',()=>{
 assert.equal(saveState.fileSaveMode({picker:false,mobile:false,share:true,safari:true}),'download','Mac sharing is not a destination picker');
 assert.equal(saveState.fileSaveMode({picker:false,mobile:false,share:false,safari:true}),'download','Safari does not need file sharing');
 assert.equal(saveState.fileSaveMode({picker:true,mobile:false,share:true,safari:true}),'picker');
 assert.equal(saveState.fileSaveMode({picker:false,mobile:true,share:true,safari:true}),'share','iPad desktop mode must still save through Files');
 assert.equal(saveState.fileSaveMode({picker:false,mobile:true,share:false,safari:true}),'unavailable');
});
test('closing an old save request cannot dismiss a newer export or change its file contents',async()=>{
 const first=saveState.requestFileDestination(new Blob(['editable project']),'Сад.ird');
 const old=saveState.useFileSave.getState().request;
 const second=saveState.requestFileDestination(new Blob(['drawing']),'План.pdf');
 await first;old.finish();
 const current=saveState.useFileSave.getState().request;
 assert.equal(current.filename,'План.pdf');assert.equal(await current.blob.text(),'drawing');
 current.finish();await second;assert.equal(saveState.useFileSave.getState().request,null);
});
test('download closes its dialog after the click and keeps file bytes available while the browser takes over',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const pending=saveState.requestFileDestination(new Blob(['editable project']),'Сад.ird');
 const request=saveState.useFileSave.getState().request;
 const link=saveState.createFileDownloadLink(request.blob);
 link.handoff(request.finish);
 assert.equal(saveState.useFileSave.getState().request,request,'anchor remains mounted for its default click action');
 t.mock.timers.tick(0);await pending;
 assert.equal(saveState.useFileSave.getState().request,null);
 link.release();link.release();
 assert.equal(await (await fetch(link.url)).text(),'editable project','unmount must not break the download');
 t.mock.timers.tick(60_000);
 await assert.rejects(fetch(link.url));
});
test('a cancelled save releases its file without downloading or dismissing a newer save',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const link=saveState.createFileDownloadLink(new Blob(['cancelled']));
 link.release();let closed=false;link.handoff(()=>{closed=true;});
 t.mock.timers.tick(60_000);assert.equal(closed,false);await assert.rejects(fetch(link.url));
 const first=saveState.requestFileDestination(new Blob(['first']),'first.ird');
 const old=saveState.useFileSave.getState().request,oldLink=saveState.createFileDownloadLink(old.blob);
 oldLink.handoff(old.finish);
 const next=saveState.requestFileDestination(new Blob(['second']),'second.ird');await first;
 t.mock.timers.tick(0);assert.equal(saveState.useFileSave.getState().request.filename,'second.ird');
 saveState.useFileSave.getState().request.finish();await next;oldLink.release();t.mock.timers.tick(60_000);
});
