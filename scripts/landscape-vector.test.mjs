import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Konva from 'konva';
import {KonvaRenderer} from 'react-konva/lib/ReactKonvaCore.js';
import {createCanvas,Image as NativeImage} from '@napi-rs/canvas';
import {createServer} from 'vite';
import {resolve} from 'node:path';
import {writeFile,mkdir} from 'node:fs/promises';
let server,vector,plants,objects,types,cad,exports,images,objectImages,PlantGlyph,ObjectGlyph,thumb;
before(async()=>{
 server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 [vector,plants,objects,types,cad,exports,images,objectImages,{PlantGlyph},{LandscapeObjectGlyph:ObjectGlyph},thumb]=await Promise.all([
  'lib/landscape-vector.ts','lib/plant-visuals.ts','lib/landscape-objects.ts','lib/project-types.ts','lib/cad/types.ts','lib/export-plan.ts','lib/plant-images.ts','lib/landscape-object-images.ts','components/designer/plant-glyph.tsx','components/designer/landscape-object-glyph.tsx','components/designer/landscape-thumbnail.tsx'
 ].map(path=>server.ssrLoadModule('/src/'+path)));
});
after(async()=>server?.close());
const plant=(catalog,patch={})=>({id:catalog.id,kind:catalog.category,catalog,x:0,y:0,r:1,rotation:0,visualMode:'vector',...patch});
const object=(record,patch={})=>({id:record.id,catalogId:record.id,category:record.category,x:0,y:0,...objects.defaultLandscapeSize(record),rotation:0,keepRatio:true,noIrrigation:true,visualMode:'vector',...patch});
const project=(pp=[],oo=[])=>({...types.emptyProject(),drawing:{...cad.emptyDrawing(),plants:Object.fromEntries(pp.map(p=>[p.id,p])),landscapeObjects:Object.fromEntries(oo.map(o=>[o.id,o]))}});

test('all plants and objects have shared finite vectors and SVG thumbnails at their physical proportions',()=>{
 for(const p of plants.DECORATIVE_PLANTS){
  const h=plant(p),art=vector.plantVectorArtwork(h,2),box=plants.plantArtworkBox(h,2);
  assert.equal(art.width,box.width);assert.equal(art.height,box.height);assert.ok(art.paths.length>1,p.id);
  assert.doesNotMatch(vector.vectorArtworkSvg(art),/NaN|Infinity|<image/);
  const html=renderToStaticMarkup(React.createElement(thumb.PlantThumbnail,{plant:h}));assert.match(html,/<svg/);assert.doesNotMatch(html,/<img/);
 }
 for(const record of objects.LANDSCAPE_OBJECTS){
  const h=object(record),art=vector.landscapeVectorArtwork(h);
  assert.equal(art.width,h.length);assert.equal(art.height,h.width);assert.ok(art.paths.length>1,record.id);
  assert.doesNotMatch(vector.vectorArtworkSvg(art),/NaN|Infinity|<image/);
  const html=renderToStaticMarkup(React.createElement(thumb.LandscapeObjectThumbnail,{object:h}));assert.match(html,/<svg/);assert.doesNotMatch(html,/<img/);
 }
});

test('mixed SVG preserves per-instance appearance, size and rotation; missing photos fall back without network in vector mode',async()=>{
 const p=plant(plants.DECORATIVE_PLANTS[0],{id:'plant-vector',x:2,y:3,rotation:37}),photo={...p,id:'plant-photo',x:6,visualMode:'image'};
 const o=object(objects.landscapeRecord('pool-rectangle'),{id:'pool-vector',x:4,y:8,rotation:23,length:8,width:3}),oPhoto={...o,id:'pool-photo',x:14,visualMode:'image'};
 const pr=project([p,photo],[o,oPhoto]),before=JSON.stringify(pr),svg=exports.projectToSvg(pr);
 assert.equal((svg.match(/<image /g)||[]).length,2);
 assert.match(svg,/data-plant-id="plant-vector" data-landscape-visual="vector" transform="translate\(2 3\) rotate\(37\)"/);
 assert.match(svg,/data-landscape-id="pool-vector" data-landscape-visual="vector" transform="translate\(4 8\) rotate\(23\)"/);
 const oldFetch=globalThis.fetch;let fetches=0;
 globalThis.fetch=async()=>{fetches++;return {ok:false};};
 try{
  const plain=await exports.projectToEmbeddedSvg(project([p],[o]));assert.doesNotMatch(plain,/<image/);assert.equal(fetches,0);
  const fallback=await exports.projectToEmbeddedSvg(pr);assert.equal(fetches,2);assert.doesNotMatch(fallback,/<image/);
  assert.equal((fallback.match(/data-landscape-visual="vector"/g)||[]).length,4);
 }finally{globalThis.fetch=oldFetch;}
 assert.equal(JSON.stringify(pr),before,'rendering never edits saved geometry');
});

test('actual canvas renders vectors without loading images, keeps controls and switches individual instances',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const oldImage=globalThis.Image,oldCreateCanvas=Konva.Util.createCanvasElement,nativeSrc=Object.getOwnPropertyDescriptor(NativeImage.prototype,'src');let loads=0;
 class LocalImage extends NativeImage {set src(src){loads++;nativeSrc.set.call(this,src.startsWith('/')?resolve('public'+src):src);}get src(){return nativeSrc.get.call(this);}}
 globalThis.Image=LocalImage;Konva.Util.createCanvasElement=()=>{const c=createCanvas(1,1);c.style={};const ctx=c.getContext('2d'),arc=ctx.arc.bind(ctx);ctx.arc=(x,y,r,a,b,ccw)=>arc(x,y,r,a,b,Boolean(ccw));return c;};
 let stage,root;const errors=[];
 try{
  const newIds=['pool-square','pool-round','pool-rectangle','tub-round-wood','tub-square-spa','tub-rectangle-plunge'];
  const chosenObjects=[...newIds.map(id=>objects.landscapeRecord(id)),...['gazebo-square','pergola-rectangle','bench-wood','kitchen-corner','rock-single','light-halo-ring'].map(id=>objects.landscapeRecord(id))];
  assert.ok(chosenObjects.every(Boolean),'all six new water objects are present');
  const chosenPlants=['tree-rounded','tree-conifer','shrub-boxwood-square','flower-blue-crescent','flower-sun-checker','grass-plume'].map(id=>plants.DECORATIVE_PLANTS.find(p=>p.visualId===id));
  const pp=chosenPlants.map((p,i)=>plant(p,{id:'p'+i})),oo=chosenObjects.map((o,i)=>object(o,{id:'o'+i}));
  const pr=project(pp,oo);await images.ensurePlantImages(pr.drawing);await objectImages.ensureLandscapeImages(pr.drawing);assert.equal(loads,0);
  stage=new Konva.Stage({width:1200,height:730});root=KonvaRenderer.createContainer(stage,1,null,false,null,'',e=>errors.push(e),e=>errors.push(e),e=>errors.push(e),null);
  const events=[],noop=()=>{};
  const render=async()=>{
   const nodes=[...oo.map((o,i)=>React.createElement(ObjectGlyph,{key:o.id,object:o,x:100+i%6*200,y:105+Math.floor(i/6)*230,px:140/Math.max(o.length,o.width),selected:i===0,locked:false,interactive:true,onBegin:noop,onResize:()=>events.push('resize'),onRotate:()=>events.push('rotate')})),...pp.map((p,i)=>React.createElement(PlantGlyph,{key:p.id,plant:p,x:100+i*200,y:565,px:70,selected:false,interactive:false,showLabel:false,onBegin:noop,onResize:noop,onRotate:noop})),...chosenObjects.map((o,i)=>React.createElement('Text',{key:'label'+i,text:o.id,x:5+i%6*200,y:190+Math.floor(i/6)*230,width:190,align:'center',fontSize:12,fill:'#24332b'})),...chosenPlants.map((p,i)=>React.createElement('Text',{key:'plantlabel'+i,text:p.visualId,x:5+i*200,y:675,width:190,align:'center',fontSize:12,fill:'#24332b'}))];
   await act(async()=>KonvaRenderer.updateContainer(React.createElement('Layer',null,React.createElement('Rect',{width:1200,height:730,fill:'#f6f7f2'}),...nodes),root,null));stage.draw();
  };
  await render();assert.ok(stage.find('Path').every(p=>p.fill()!=='none'),'Konva must not treat SVG none as a black fill');assert.equal(loads,0);assert.equal(stage.find('.landscape-vector').length,12);assert.equal(stage.find('.plant-vector').length,6);
  await act(async()=>stage.findOne('.landscape-resize').fire('touchstart',{evt:{}}));await act(async()=>stage.findOne('.landscape-rotate').fire('pointerdown',{evt:{}}));assert.deepEqual(events,['resize','rotate']);
  const qa=process.env.LANDSCAPE_VECTOR_QA_DIR;
  if(qa){await mkdir(qa,{recursive:true});await writeFile(resolve(qa,'vector-canvas.png'),stage.toCanvas().toBuffer('image/png'));}
  pp[0].visualMode='image';oo[6].visualMode='image';
  await act(async()=>{await Promise.all([images.loadPlantImage(plants.plantImageSrc(pp[0])),images.loadPlantImage(objects.landscapeImageSrc(oo[6]))]);});
  await render();await act(async()=>new Promise(resolve=>setTimeout(resolve,25)));stage.draw();
  assert.equal(stage.find('.plant-artwork').length,1);assert.equal(stage.find('.landscape-artwork').length,1);assert.equal(stage.find('.plant-vector').length,5);
  if(qa)await writeFile(resolve(qa,'mixed-canvas.png'),stage.toCanvas().toBuffer('image/png'));
  pp[0].visualMode='vector';oo[6].visualMode='vector';const prior=loads;await render();assert.equal(loads,prior);assert.equal(stage.find('.plant-artwork').length,0);assert.equal(stage.find('.landscape-artwork').length,0);
  globalThis.Image=class MissingImage {set src(src){loads++;queueMicrotask(()=>this.onerror?.());}};
  oo[2].visualMode='image';await render();await act(async()=>new Promise(resolve=>setTimeout(resolve,0)));
  assert.ok(stage.findOne('.landscape-o2').findOne('.landscape-vector'),'a failed photo keeps its vector visible');
  assert.equal(stage.findOne('.landscape-o2').find('Image').length,0);
  await objectImages.ensureLandscapeImages(project([], [oo[2]]).drawing);
  assert.deepEqual(errors,[]);
 }finally{if(root)await act(async()=>KonvaRenderer.updateContainer(null,root,null));stage?.destroy();globalThis.Image=oldImage;Konva.Util.createCanvasElement=oldCreateCanvas;}
});
