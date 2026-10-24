import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
let svgRenderer;try{svgRenderer=createRequire((process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES??resolve('node_modules'))+'/package.json')('sharp');}catch{}
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {createCanvas,Image as NativeImage,loadImage} from '@napi-rs/canvas';
const dir=resolve('node_modules/.cache/plant-visual-tests');await mkdir(dir,{recursive:true});
const bundle=resolve(dir,'app.mjs');
await build({stdin:{contents:`export * from './src/lib/plant-visuals';export {useProject,migrateProject} from './src/lib/project-store';export {emptyDrawing} from './src/lib/cad/types';export {emptyProject} from './src/lib/project-types';export {addRect,toPolygons} from './src/lib/cad/engine';export {irrigationSurfaces} from './src/lib/irrigation-geometry';export {inIrrigable} from './src/lib/cad/irrigation-geom';export {cadSnap} from './src/lib/cad/snap';export {parseProjectFile} from './src/lib/project-file';export {plantName} from './src/lib/catalog-localization';export {LOCALES} from './src/lib/locale-config';export {projectToSvg,projectToEmbeddedSvg,exportPngFromProject,exportJpegFromProject,exportPdfFromProject} from './src/lib/export-plan';`,resolveDir:process.cwd()},outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const app=await import(pathToFileURL(bundle));await rm(bundle);
const store=app.useProject;

test('120 decorative records are distinct, localized and make no botanical claims',async()=>{
 assert.equal(app.DECORATIVE_PLANTS.length,120);
 assert.deepEqual(Object.fromEntries(Object.entries(app.PLANT_VISUALS).map(([k,v])=>[k,v.length])),{tree:30,shrub:30,flower:30,grass:30});
 for(const p of app.DECORATIVE_PLANTS){
  assert.equal(p.matureWidthM,null);assert.equal(p.water.quantity,null);
  const src=app.plantImageSrc({kind:p.category,catalog:p}),bytes=await readFile(resolve('public',src.slice(1)));
  assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');
  const image=await loadImage(bytes);assert.ok(Math.max(image.width,image.height)>=1024,'full-resolution artwork');
  const box=app.plantArtworkBox({kind:p.category,catalog:p},2);assert.ok(Math.abs(Math.max(box.width,box.height)-2)<1e-9);
  for(const {id} of app.LOCALES)assert.ok(app.plantName(p,id)&&!app.plantName(p,id).startsWith('plantVisual_'),`${p.id}/${id}`);
 }
 assert.equal(new Set(app.DECORATIVE_PLANTS.map(p=>app.plantImageSrc({kind:p.category,catalog:p}))).size,120);
});
test('crown edits preserve centre, category layers, irrigation, undo and project round trip',()=>{
 store.getState().newProject();store.setState({snapOn:false,projectFormOpen:false});
 const d=app.addRect(app.emptyDrawing(),{x:0,y:0},{x:20,y:15},'lawn');
 store.setState({project:{...store.getState().project,drawing:d,polygons:app.toPolygons(d)}});
 const surface=app.irrigationSurfaces(store.getState().project);
 const ids=[];
 for(const name of ['tree-rounded','tree-burgundy','shrub-lime','flower-blue','grass-green']){
  const p=app.DECORATIVE_PLANTS.find(p=>p.visualId===name);
  store.getState().preparePlant(p,p.category,p.defaultDiameterM);store.getState().placeCatalogPlant({x:7,y:6});ids.push(store.getState().selectedPlantId);
 }
 const id=ids[0],original=store.getState().project.drawing.plants[id];
 store.getState().updatePlant(id,{r:app.resizedPlantRadius(original.r,30,0,60)});
 const resized=store.getState().project.drawing.plants[id];assert.equal(resized.r,2.5);assert.deepEqual([resized.x,resized.y],[7,6]);
 store.getState().updatePlant(id,{rotation:405});assert.equal(store.getState().project.drawing.plants[id].rotation,45);assert.equal(store.getState().project.drawing.plants[id].r,2.5);
 store.getState().undo();assert.equal(store.getState().project.drawing.plants[id].rotation,0);store.getState().redo();assert.equal(store.getState().project.drawing.plants[id].rotation,45);
 const roundtrip=app.parseProjectFile(JSON.stringify({project:store.getState().project})).project;
 assert.deepEqual(roundtrip.drawing.plants,store.getState().project.drawing.plants);
 assert.deepEqual(app.irrigationSurfaces(roundtrip),surface,'crowns do not exclude irrigated territory');assert.ok(app.inIrrigable({x:7,y:6},roundtrip.drawing));
 store.getState().setCadLayer('trees',{visible:false});assert.equal(store.getState().rightMode,'landscape');
 assert.ok(!app.plantLayerVisible(store.getState().project.drawing,'tree'));assert.ok(app.plantLayerVisible(store.getState().project.drawing,'shrub'));
 assert.equal((app.projectToSvg(store.getState().project).match(/data-plant-id=/g)||[]).length,3);
 store.getState().undo();assert.ok(app.plantLayerVisible(store.getState().project.drawing,'tree'));
 store.getState().setCadLayer('grasses',{locked:true});const grass=store.getState().project.drawing.plants[ids[4]];
 store.getState().updatePlant(grass.id,{r:3});assert.equal(store.getState().project.drawing.plants[grass.id].r,grass.r);
 store.getState().updatePlant(id,{r:3});assert.equal(store.getState().project.drawing.plants[id].r,3);
});
test('PNG, JPEG and PDF embed actual alpha artwork and preserve rotation',{skip:!svgRenderer&&'Requires a native SVG rasterizer with embedded PNG support'},async()=>{
 const fetchBefore=globalThis.fetch,imageBefore=globalThis.Image,documentBefore=globalThis.document;
 // Native canvas runs the actual exporters without a browser or external network.
 const NativeSrc=Object.getOwnPropertyDescriptor(NativeImage.prototype,'src');
 class ExportImage extends NativeImage {
  set src(value){if(typeof value==='string'&&value.startsWith('blob:'))fetchBefore(value).then(r=>r.arrayBuffer()).then(b=>svgRenderer(Buffer.from(b)).png().toBuffer()).then(b=>NativeSrc.set.call(this,b)).catch(e=>this.onerror?.(e));else NativeSrc.set.call(this,value);}
  get src(){return NativeSrc.get.call(this);}
 }
 globalThis.Image=ExportImage;
 globalThis.document={createElement(name){assert.equal(name,'canvas');return createCanvas(1,1);},fonts:{ready:Promise.resolve()}};
 globalThis.fetch=async src=>new Response(await readFile(resolve('public',String(src).replace(/^\//,''))),{headers:{'content-type':'image/png'}});
 try{
  const record=app.DECORATIVE_PLANTS.find(p=>p.visualId==='tree-rounded');
  const drawing=app.emptyDrawing();drawing.plants={one:{id:'one',kind:'tree',x:0,y:0,r:2,rotation:30,catalog:record},two:{id:'two',kind:'tree',x:5,y:0,r:1,rotation:90,catalog:record}};
  const project={...app.emptyProject(),name:'Plants',drawing};
  const svg=await app.projectToEmbeddedSvg(project);
  assert.match(svg,/rotate\(30 0 0\)/);assert.equal((svg.match(/data:image\/png;base64,/g)||[]).length,1,'shared asset embedded once');assert.doesNotMatch(svg,/href="\/plants\//);
  const outputs={};const target=ext=>({createWritable:async()=>({write:async blob=>{outputs[ext]=Buffer.from(await blob.arrayBuffer());},close:async()=>{},abort:async()=>{}})});
  await app.exportPngFromProject(project,'plants',target('png'));
  await app.exportJpegFromProject(project,'plants',target('jpeg'));
  await app.exportPdfFromProject(project,'plants',undefined,target('pdf'));
  if(process.env.PLANT_QA_DIR){await mkdir(process.env.PLANT_QA_DIR,{recursive:true});await writeFile(resolve(process.env.PLANT_QA_DIR,'plant-export.svg'),svg);for(const [ext,bytes] of Object.entries(outputs))await writeFile(resolve(process.env.PLANT_QA_DIR,`plant-export.${ext}`),bytes);}
  for(const ext of ['png','jpeg']){
   const image=await loadImage(outputs[ext]);assert.ok(image.width>=3000);const c=createCanvas(image.width,image.height),ctx=c.getContext('2d');ctx.drawImage(image,0,0);
   const rgba=ctx.getImageData(0,0,c.width,c.height).data;let green=0;
   for(let i=0;i<rgba.length;i+=4)if(rgba[i+1]>rgba[i]*1.15&&rgba[i+1]>rgba[i+2]*1.15)green++;
   assert.ok(green>100000,`${ext}: detailed green artwork is present (${green})`);
  }
  assert.equal(outputs.pdf.subarray(0,4).toString(),'%PDF');assert.ok(outputs.pdf.includes(Buffer.from('/Subtype /Image')));
  if(process.env.PLANT_QA_DIR){await mkdir(process.env.PLANT_QA_DIR,{recursive:true});for(const [ext,bytes] of Object.entries(outputs))await writeFile(resolve(process.env.PLANT_QA_DIR,`plant-export.${ext}`),bytes);}
 }finally{globalThis.fetch=fetchBefore;globalThis.Image=imageBefore;globalThis.document=documentBefore;}
});
