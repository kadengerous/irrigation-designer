import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
let svgRenderer;try{svgRenderer=createRequire((process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES??resolve('node_modules'))+'/package.json')('sharp');}catch{}
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {createCanvas,Image as NativeImage,loadImage} from '@napi-rs/canvas';
const dir=resolve('node_modules/.cache/landscape-export-tests');await mkdir(dir,{recursive:true});
const bundle=resolve(dir,'app.mjs');
await build({stdin:{contents:`export * from './src/lib/landscape-objects';export {emptyDrawing} from './src/lib/cad/types';export {emptyProject} from './src/lib/project-types';export {projectToEmbeddedSvg,exportPngFromProject,exportJpegFromProject,exportPdfFromProject} from './src/lib/export-plan';`,resolveDir:process.cwd()},outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const app=await import(pathToFileURL(bundle));await rm(bundle);

test('landscape PNG, JPEG and PDF retain four categories, transparent art and rotated dimensions',{skip:!svgRenderer&&'Requires a native SVG rasterizer with embedded PNG support'},async()=>{
 const fetchBefore=globalThis.fetch,imageBefore=globalThis.Image,documentBefore=globalThis.document;
 // Native canvas runs the actual exporters without a browser or external network.
 const NativeSrc=Object.getOwnPropertyDescriptor(NativeImage.prototype,'src');
 class ExportImage extends NativeImage {
  set src(value){if(typeof value==='string'&&value.startsWith('blob:'))fetchBefore(value).then(r=>r.arrayBuffer()).then(b=>svgRenderer(Buffer.from(b)).png().toBuffer()).then(b=>NativeSrc.set.call(this,b)).catch(e=>this.onerror?.(e));else NativeSrc.set.call(this,value);}
  get src(){return NativeSrc.get.call(this);}
 }
 globalThis.Image=ExportImage;
 globalThis.document={createElement(name){assert.equal(name,'canvas');return createCanvas(1,1);},fonts:{ready:Promise.resolve()}};
 globalThis.fetch=async src=>new Response(await readFile(resolve('public',String(src).replace(/^\//,''))),{headers:{'content-type':String(src).endsWith('.webp')?'image/webp':'image/png'}});
 try{
  const drawing=app.emptyDrawing();drawing.landscapeObjects={};
  const ids=['gazebo-square','light-ground','fountain-round','kitchen-corner'];
  for(let i=0;i<ids.length;i++){
   const record=app.landscapeRecord(ids[i]),size=app.defaultLandscapeSize(record);
   drawing.landscapeObjects[ids[i]]={id:ids[i],catalogId:ids[i],category:record.category,x:i%2*7,y:Math.floor(i/2)*7,...size,rotation:i*30,keepRatio:true,noIrrigation:record.category!=='lighting'};
  }
  // A duplicate uses one embedded source while keeping its own placement and angle.
  drawing.landscapeObjects.copy={...drawing.landscapeObjects['gazebo-square'],id:'copy',x:14,y:0,rotation:90};
  const project={...app.emptyProject(),name:'Landscape',drawing};
  const svg=await app.projectToEmbeddedSvg(project);
  assert.match(svg,/rotate\(30 7 0\)/);assert.match(svg,/rotate\(90 14 0\)/);
  assert.equal((svg.match(/data:image\/png;base64,/g)||[]).length,4,'shared lossless asset embedded once as interoperable PNG');assert.doesNotMatch(svg,/href="\/landscape\//);
  assert.equal((svg.match(/data-landscape-id=/g)||[]).length,5);
  const outputs={};const target=ext=>({createWritable:async()=>({write:async blob=>{outputs[ext]=Buffer.from(await blob.arrayBuffer());},close:async()=>{},abort:async()=>{}})});
  await app.exportPngFromProject(project,'landscape',target('png'));
  await app.exportJpegFromProject(project,'landscape',target('jpeg'));
  await app.exportPdfFromProject(project,'landscape',undefined,target('pdf'));
  if(process.env.LANDSCAPE_QA_DIR){await mkdir(process.env.LANDSCAPE_QA_DIR,{recursive:true});await writeFile(resolve(process.env.LANDSCAPE_QA_DIR,'landscape-export.svg'),svg);for(const [ext,bytes] of Object.entries(outputs))await writeFile(resolve(process.env.LANDSCAPE_QA_DIR,`landscape-export.${ext}`),bytes);}
  for(const ext of ['png','jpeg']){
   const image=await loadImage(outputs[ext]);assert.ok(image.width>=3000);const c=createCanvas(image.width,image.height),ctx=c.getContext('2d');ctx.drawImage(image,0,0);
   const rgba=ctx.getImageData(0,0,c.width,c.height).data;let colored=0;const shades=new Set();
   for(let i=0;i<rgba.length;i+=4)if(Math.max(rgba[i],rgba[i+1],rgba[i+2])-Math.min(rgba[i],rgba[i+1],rgba[i+2])>20){colored++;if(i%16===0)shades.add(`${rgba[i]>>3},${rgba[i+1]>>3},${rgba[i+2]>>3}`);}
   assert.ok(colored>100000,`${ext}: detailed landscape artwork is present (${colored})`);
   assert.ok(shades.size>100,`${ext}: material textures retain color variety (${shades.size})`);
  }
  assert.equal(outputs.pdf.subarray(0,4).toString(),'%PDF');assert.ok(outputs.pdf.includes(Buffer.from('/Subtype /Image')));
  if(process.env.LANDSCAPE_QA_DIR){await mkdir(process.env.LANDSCAPE_QA_DIR,{recursive:true});for(const [ext,bytes] of Object.entries(outputs))await writeFile(resolve(process.env.LANDSCAPE_QA_DIR,`landscape-export.${ext}`),bytes);}
 }finally{globalThis.fetch=fetchBefore;globalThis.Image=imageBefore;globalThis.document=documentBefore;}
});
