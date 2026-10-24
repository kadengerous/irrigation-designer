import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import Konva from 'konva';
import {KonvaRenderer} from 'react-konva/lib/ReactKonvaCore.js';
import {createCanvas,Image as NativeImage} from '@napi-rs/canvas';
import {createServer} from 'vite';
import {resolve} from 'node:path';
import {writeFile,mkdir,access} from 'node:fs/promises';

test('landscape artwork keeps proportion, rotation and touch controls',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const beforeImage=globalThis.Image;
 const nativeSrc=Object.getOwnPropertyDescriptor(NativeImage.prototype,'src');
 class LocalImage extends NativeImage {set src(src){nativeSrc.set.call(this,src.startsWith('/landscape/')?resolve('public'+src):src);}get src(){return nativeSrc.get.call(this);}}
 globalThis.Image=LocalImage;
 Konva.Util.createCanvasElement=()=>{const c=createCanvas(1,1);c.style={};const ctx=c.getContext('2d'),arc=ctx.arc.bind(ctx);ctx.arc=(x,y,r,a,b,ccw)=>arc(x,y,r,a,b,Boolean(ccw));return c;};
 const server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 let stage,root;
 try{
  const {LandscapeObjectGlyph}=await server.ssrLoadModule('/src/components/designer/landscape-object-glyph.tsx');
  const art=await server.ssrLoadModule('/src/lib/landscape-objects.ts');
  const {loadPlantImage}=await server.ssrLoadModule('/src/lib/plant-images.ts');
  const choices=[];for(const record of art.LANDSCAPE_OBJECTS){try{await access(resolve('public'+art.landscapeImageSrc(record)));choices.push(record);}catch{if(!process.env.LANDSCAPE_PARTIAL_QA)throw new Error('Missing '+record.id);}}
  await Promise.all(choices.map(p=>loadPlantImage(art.landscapeImageSrc(p))));
  stage=new Konva.Stage({width:1080,height:Math.ceil(choices.length/6)*210});
  const errors=[],recordError=e=>errors.push(e);
  root=KonvaRenderer.createContainer(stage,1,null,false,null,'',recordError,recordError,recordError,null);
  let radius=1,rotation=0,uiScale=1;const events=[];
  const render=()=>{
   const nodes=choices.map((catalog,i)=>{
    const size=art.defaultLandscapeSize(catalog),factor=2/Math.max(size.width,size.length)*(i===0?radius:1);
    return React.createElement(LandscapeObjectGlyph,{key:catalog.id,object:{id:catalog.id,catalogId:catalog.id,category:catalog.category,x:0,y:0,length:size.length*factor,width:size.width*factor,rotation:i===0?rotation:0,keepRatio:true,noIrrigation:catalog.category!=='lighting'},x:90+i%6*180,y:105+Math.floor(i/6)*210,px:60,selected:i===0,locked:false,interactive:true,uiScale,onBegin:()=>events.push('move'),onResize:()=>events.push('resize'),onRotate:()=>events.push('rotate')});
   });
   return act(async()=>KonvaRenderer.updateContainer(React.createElement('Layer',null,React.createElement('Rect',{width:1080,height:stage.height(),fill:'#f1f5f0'}),...nodes),root,null));
  };
  await render();await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30));});assert.equal(stage.find('.landscape-artwork').length,choices.length);
  const first=stage.findOne('.landscape-artwork'),w=first.width(),h=first.height();
  await act(async()=>stage.findOne('.landscape-resize').fire('touchstart',{evt:{}}));await act(async()=>stage.findOne('.landscape-rotate').fire('pointerdown',{evt:{}}));
  assert.deepEqual(events,['resize','rotate']);
  radius=1.3;rotation=57;uiScale=1.2;await render();
  assert.ok(Math.abs(first.width()/w-1.3)<1e-9);assert.ok(Math.abs(first.height()/h-1.3)<1e-9);assert.equal(first.getParent().getParent().rotation(),57);
  assert.ok(Math.abs(stage.findOne('.landscape-resize').hitStrokeWidth()-36)<1e-8);
  assert.deepEqual(first.getParent().getParent().getAbsolutePosition(),{x:90,y:105});
  const lock=stage.findOne('.landscape-resize');assert.ok(lock.radius()>=7);
  radius=1;rotation=0;uiScale=1;await render();
  stage.draw();if(process.env.LANDSCAPE_QA_DIR){await mkdir(process.env.LANDSCAPE_QA_DIR,{recursive:true});await writeFile(resolve(process.env.LANDSCAPE_QA_DIR,'landscape-canvas.png'),stage.toCanvas().toBuffer('image/png'));}
  assert.deepEqual(errors,[]);
 }finally{if(root)await act(async()=>KonvaRenderer.updateContainer(null,root,null));stage?.destroy();globalThis.Image=beforeImage;await server.close();}
});
