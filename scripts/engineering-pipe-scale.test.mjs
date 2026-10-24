import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {createServer} from 'vite';
let server,display,AutoPipeDrawing,units;
before(async()=>{
 server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 [display,{AutoPipeDrawing},units]=await Promise.all(['lib/engineering-pipe-display.ts','components/designer/engineering-auto-pipe.tsx','lib/units.ts'].map(path=>server.ssrLoadModule('/src/'+path)));
});
after(async()=>server?.close());
const edge=(id,a,b,diameter,branch)=>({id,pipeId:'pipe',a,b,diameter,branch,length:Math.hypot(b.x-a.x,b.y-a.y),flow:10});
const edges=[edge('main32',{x:0,y:0},{x:5,y:0},32),edge('main25',{x:5,y:0},{x:10,y:0},25),edge('branch',{x:2,y:0},{x:2,y:1.4},16,'head:h0')];
const walk=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(walk):[node,...walk(node.props?.children)];
const drawing=(px,selected=false)=>AutoPipeDrawing({edges,px,selected,color:'#167be8',units:units.METRIC_UNITS,label:false});

test('pipe widths and complete casings shrink proportionally with the plan, without a fixed pixel floor',()=>{
 for(const diameter of [null,16,20,25,32,40,50,63,75,90,100])for(const branch of [false,true]){
  const atDefault=display.pipeStrokeWidth(diameter,branch),outline=display.pipeOutlineWidth(diameter,branch);
  for(const px of [.1,1,4.5,9,18,36]){
   const width=display.pipeStrokeWidth(diameter,branch,px),casing=display.pipeOutlineWidth(diameter,branch,px);
   assert.ok(Math.abs(width/px-atDefault/36)<1e-10);assert.ok(Math.abs(casing/px-outline/36)<1e-10);
   assert.ok(width>0&&casing>width);
  }
  for(const px of [72,144,5000]){assert.equal(display.pipeStrokeWidth(diameter,branch,px),atDefault);assert.equal(display.pipeOutlineWidth(diameter,branch,px),outline);}
 }
 assert.ok(display.pipeStrokeWidth(20)<display.pipeStrokeWidth(25));assert.ok(display.pipeStrokeWidth(25)<display.pipeStrokeWidth(32));
 assert.ok(display.pipeStrokeWidth(32,false,9)<1.3,'32 mm cannot stay a thick 4.8 px bar when zoomed out');
});

test('actual auto/branch SVG scales ink, selection casing and transitions together but retains the 22 px hit target',()=>{
 const before=JSON.stringify(edges);
 for(const px of [4.5,9,18,36,72])for(const selected of [false,true]){
  const tree=drawing(px,selected),groups=walk(tree).filter(node=>node.type==='g'&&node.props['data-pipe-branch']!=null);
  assert.equal(groups.length,3);
  groups.forEach((group,index)=>{
   const paths=walk(group).filter(node=>node.type==='path'),e=edges[index],branch=!!e.branch;
   assert.equal(paths.length,3);assert.equal(paths[0].props.strokeWidth*px,22);
   assert.equal(paths[1].props.stroke,selected?'#e8892f':'white');
   assert.ok(Math.abs(paths[1].props.strokeWidth*px-display.pipeOutlineWidth(e.diameter,branch,px))<1e-10);
   assert.ok(Math.abs(paths[2].props.strokeWidth*px-display.pipeStrokeWidth(e.diameter,branch,px))<1e-10);
  });
  const transition=walk(tree).find(node=>node.type==='circle');assert.ok(transition);
  assert.equal(transition.props.r*px,3.5*display.pipeDisplayScale(px));
  assert.equal(transition.props.strokeWidth*px,1.5*display.pipeDisplayScale(px));
 }
 assert.equal(JSON.stringify(edges),before,'rendering does not edit hydraulic geometry or diameter');
});

test('native contact sheet renders the real SVG at four zooms in normal and selected states',async()=>{
 const width=960,height=600,sheet=createCanvas(width,height),ctx=sheet.getContext('2d');ctx.fillStyle='#edf2f6';ctx.fillRect(0,0,width,height);
 const zooms=[36,18,9,4.5];
 for(let row=0;row<zooms.length;row++)for(let column=0;column<2;column++){
  const px=zooms[row],selected=column===1;
  const svg=renderToStaticMarkup(React.createElement('svg',{xmlns:'http://www.w3.org/2000/svg',width:480,height:120},
   React.createElement('rect',{width:480,height:120,fill:'#f8fafc'}),
   React.createElement('g',{transform:`translate(32 35) scale(${px})`},
    React.createElement('path',{d:'M0 -0.4H10V1.8H0Z',fill:'none',stroke:'#b7c3ca',strokeWidth:.045}),drawing(px,selected))));
  ctx.drawImage(await loadImage(Buffer.from(svg)),column*480,row*150+25);
  ctx.fillStyle='#17334d';ctx.font='14px sans-serif';ctx.fillText(`${px} px/m — ${selected?'selected':'normal'} — 32 / 25 mm + branch`,column*480+16,row*150+19);
 }
 const directory='/private/tmp/irri-engineering-pipe-scale';await mkdir(directory,{recursive:true});await writeFile(resolve(directory,'pipe-scale-contact-sheet.png'),sheet.toBuffer('image/png'));
 assert.equal(sheet.width,960);assert.equal(sheet.height,600);
});
