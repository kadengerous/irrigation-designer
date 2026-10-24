import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import Konva from 'konva';
import {KonvaRenderer} from 'react-konva/lib/ReactKonvaCore.js';
import {createCanvas,Image as NativeImage} from '@napi-rs/canvas';
import {createServer} from 'vite';
import {resolve} from 'node:path';
import {writeFile,mkdir} from 'node:fs/promises';

test('actual plant canvas uses alpha artwork, proportional resize, rotation and touch handles',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const beforeImage=globalThis.Image;
 const nativeSrc=Object.getOwnPropertyDescriptor(NativeImage.prototype,'src');
 class LocalImage extends NativeImage {set src(src){nativeSrc.set.call(this,src.startsWith('/plants/')?resolve('public'+src):src);}get src(){return nativeSrc.get.call(this);}}
 globalThis.Image=LocalImage;
 Konva.Util.createCanvasElement=()=>{const c=createCanvas(1,1);c.style={};return c;};
 const server=await createServer({server:{middlewareMode:true,hmr:false}});
 let stage,root;
 try{
  const {PlantGlyph}=await server.ssrLoadModule('/src/components/designer/plant-glyph.tsx');
  const art=await server.ssrLoadModule('/src/lib/plant-visuals.ts');
  const {loadPlantImage}=await server.ssrLoadModule('/src/lib/plant-images.ts');
  const choices=art.DECORATIVE_PLANTS;
  await Promise.all(choices.map(p=>loadPlantImage(art.plantImageSrc({kind:p.category,catalog:p}))));
  stage=new Konva.Stage({width:1080,height:Math.ceil(choices.length/6)*210});
  const errors=[],recordError=e=>errors.push(e);
  root=KonvaRenderer.createContainer(stage,1,null,false,null,'',recordError,recordError,recordError,null);
  let radius=1,rotation=0,uiScale=1;const events=[];
  const render=()=>{
   const nodes=choices.map((catalog,i)=>React.createElement(PlantGlyph,{key:catalog.id,plant:{id:catalog.id,kind:catalog.category,catalog,x:0,y:0,r:i===0?radius:1,rotation:i===0?rotation:i*17%360},x:90+i%6*180,y:105+Math.floor(i/6)*210,px:70,selected:i===0,showLabel:false,interactive:true,uiScale,onBegin:()=>events.push('move'),onResize:()=>events.push('resize'),onRotate:()=>events.push('rotate')}));
   return act(async()=>KonvaRenderer.updateContainer(React.createElement('Layer',null,React.createElement('Rect',{width:1080,height:stage.height(),fill:'#f1f5f0'}),...nodes),root,null));
  };
  await render();assert.equal(stage.find('.plant-artwork').length,120);
  const first=stage.findOne('.plant-artwork'),w=first.width(),h=first.height();
  await act(async()=>stage.findOne('.plant-resize').fire('touchstart',{evt:{}}));await act(async()=>stage.findOne('.plant-rotate').fire('pointerdown',{evt:{}}));
  assert.deepEqual(events,['resize','rotate']);
  radius=1.3;rotation=57;uiScale=1.2;await render();
  assert.ok(Math.abs(first.width()/w-1.3)<1e-9);assert.ok(Math.abs(first.height()/h-1.3)<1e-9);assert.equal(first.getParent().rotation(),57);
  assert.ok(Math.abs(stage.findOne('.plant-resize').hitStrokeWidth()-36)<1e-8);
  assert.deepEqual(first.getParent().getParent().getAbsolutePosition(),{x:90,y:105});
  const lock=stage.findOne('.plant-resize');assert.ok(lock.radius()>=7);
  stage.draw();if(process.env.PLANT_QA_DIR){await mkdir(process.env.PLANT_QA_DIR,{recursive:true});await writeFile(resolve(process.env.PLANT_QA_DIR,'plant-canvas.png'),stage.toCanvas().toBuffer('image/png'));}
  assert.deepEqual(errors,[]);
 }finally{if(root)await act(async()=>KonvaRenderer.updateContainer(null,root,null));stage?.destroy();globalThis.Image=beforeImage;await server.close();}
});
