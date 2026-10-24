import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createCanvas} from '@napi-rs/canvas';
const source=await readFile('src/components/designer/drawing-guidance.tsx','utf8'),layoutSource=await readFile('src/components/designer/floating-layout.ts','utf8');
const transpile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const layout=await import('data:text/javascript;base64,'+Buffer.from(transpile(layoutSource)).toString('base64'));
const componentCode=transpile(source.slice(source.indexOf('export function DrawingGuidance')).replace('export function','function'));
const locales=['en','ru','es','pt-BR','fr','it','de','ar','tr','pl','zh-CN','nl','cs','el','hu','ro','sk','he','uk','ja'];
const dictionaries=Object.fromEntries(await Promise.all(locales.map(async locale=>[locale,JSON.parse(await readFile(`src/lib/locales/${locale}.json`,'utf8'))])));
const copy=Object.fromEntries(locales.map(locale=>[locale,['showHints','guidanceStart','guidanceContinue','guidanceClose','guidanceEdit','guidanceSelect','guidanceTool'].map(key=>dictionaries[locale][key])]));
const measurement=createCanvas(8,8).getContext('2d');
function textLayout(text,width,scale){
 measurement.font=`${13*scale}px Arial`;const natural=measurement.measureText(text).width,lines=[];let line='';
 const tokens=/[\u3000-\u9fff\u3040-\u30ff]/.test(text)?[...text]:text.split(/(?<=\s)/u);
 for(const token of tokens){if(line&&measurement.measureText(line+token).width>width){lines.push(line.trimEnd());line=token.trimStart();}else line+=token;}if(line)lines.push(line);
 return {width:Math.min(width,natural),height:lines.length*18.2*scale,lines};
}
const walk=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(walk):[n,...walk(n.props?.children)];
function fixture({width=768,height=1024,locale='ru',scale=1,enabled=true,catalog=false}={}){
 const rtl=['ar','he'].includes(locale),state={width,height,scale,extra:[],frames:[],measurements:0,box:null,showHints:enabled,locale,tool:null,drawSub:'none',cadEditId:null,draft:{points:[]},pxPerMeter:36,catalogOpen:catalog};
 const bounds=()=>({x:rtl?336:8,y:90,width:state.width-352,height:state.height-160});
 const tools=()=>{const b=bounds(),width=Math.min(b.width,430*state.scale);return {x:rtl?b.x+b.width-width:b.x,y:b.y,width,height:54*state.scale};};
 const rect=b=>({...b,left:b.x,right:b.x+b.width,top:b.y,bottom:b.y+b.height});
 const toolbar={getBoundingClientRect:()=>rect(tools())};let effect;
 const env={React,useRef:()=>({current:null}),useState:()=>[null,value=>state.box=typeof value==='function'?value(state.box):value],useLayoutEffect:fn=>effect=fn,useProject:fn=>fn(state),copy,closureTarget:()=>null,tr:(l,key)=>dictionaries[l][key]??key,localeDirection:()=>rtl?'rtl':'ltr',uiPixels:n=>n*state.scale,workspaceBounds:bounds,floatingObstacles:()=>state.extra,...layout};
 // Use the real component effect with measured DOM equivalents; no browser or
 // server is started. Native canvas supplies font metrics for each label.
 env.workspaceBounds=bounds;env.floatingObstacles=()=>state.extra;
 const component=new Function(...Object.keys(env),componentCode+';return DrawingGuidance;')(...Object.values(env));
 const tree=component({wrapRef:{current:{getBoundingClientRect:()=>({left:0,top:0})}},hover:null});
 const el={style:{},getBoundingClientRect:()=>rect(state.box??{x:0,y:0,width:0,height:0})},measurer={style:{},getBoundingClientRect:()=>{state.measurements++;return textLayout(copy[locale][5],Number.parseFloat(measurer.style.maxWidth),state.scale);}};
 if(tree){tree.props.ref.current=el;walk(tree).find(n=>n.props?.className==='drawing-guidance-measure').props.ref.current=measurer;}
 const originals={document:globalThis.document,getComputedStyle:globalThis.getComputedStyle,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
 const install=()=>Object.assign(globalThis,{document:{querySelectorAll:()=>[toolbar]},getComputedStyle:()=>({display:'block',visibility:'visible',font:`${13*state.scale}px Arial`,lineHeight:`${18.2*state.scale}px`,letterSpacing:'0px',paddingLeft:String(10*state.scale),paddingRight:String(10*state.scale),paddingTop:String(8*state.scale),paddingBottom:String(8*state.scale),borderLeftWidth:'1',borderRightWidth:'1',borderTopWidth:'1',borderBottomWidth:'1'}),requestAnimationFrame:fn=>state.frames.push(fn),cancelAnimationFrame(){}});
 const run=()=>{install();try{effect?.();}finally{Object.assign(globalThis,originals);}};
 const tick=()=>{const fn=state.frames.pop();state.frames=[];install();try{fn?.();}finally{Object.assign(globalThis,originals);}};
 return {state,tree,bounds,tools,run,tick,text:copy[locale][5]};
}
function readable(f){const b=f.bounds(),box=f.state.box,s=f.state.scale,natural=Math.ceil(textLayout(f.text,480*s-20*s-4,s).width+20*s+4);assert.ok(box&&box.width>=Math.min(192*s,natural),JSON.stringify({locale:f.state.locale,box,natural}));assert.ok(box.x>=b.x&&box.y>=b.y);assert.ok(box.x+box.width<=b.x+b.width+.01&&box.y+box.height<=b.y+b.height+.01);assert.ok(!layout.overlaps(box,f.tools(),8*f.state.scale));for(const o of f.state.extra)assert.ok(!layout.overlaps(box,o,8*f.state.scale));assert.ok(box.height<200*f.state.scale,'a short hint stays a horizontal paragraph');}
test('actual guidance placement stays readable across tablet portrait, landscape, RTL and UI sizes',()=>{
 for(const locale of ['ru','de','ar','he','ja'])for(const scale of [.875,1,1.25]){const f=fixture({locale,scale});f.run();readable(f);f.state.width=1024;f.state.height=768;f.tick();readable(f);f.state.width=768;f.state.height=1024;f.tick();readable(f);}
});
test('a blocked narrow sliver cannot turn the hint vertical; clearing obstacles restores natural width',()=>{
 const f=fixture({width:1024,height:768});f.run();const natural={...f.state.box},b=f.bounds();f.state.extra=[{x:b.x,y:b.y,width:b.width-100,height:b.height}];f.tick();assert.equal(f.state.box.width,0);f.state.extra=[];f.tick();readable(f);assert.deepEqual(f.state.box,natural);
});
test('unchanged animation frames reuse text measurements; changed font/UI scale remeasures',()=>{
 const f=fixture({width:1024,height:768});f.run();const first=f.state.measurements;assert.ok(first>0);for(let i=0;i<20;i++)f.tick();assert.equal(f.state.measurements,first,'steady frames must not force text layout');f.state.scale=1.25;f.tick();assert.ok(f.state.measurements>first);readable(f);
});
test('actual markup has one announced hint and an independent hidden measurer in all 20 locales',()=>{
 for(const locale of locales){const f=fixture({locale}),markup=renderToStaticMarkup(f.tree);assert.match(markup,/role="status"/);assert.match(markup,/class="drawing-guidance-measure" aria-hidden="true"/);assert.doesNotMatch(markup,/hint_none|guidanceSelect/);f.run();readable(f);}
 assert.equal(fixture({enabled:false}).tree,null);assert.equal(fixture({catalog:true}).tree,null);
});
test('native tablet typography and layout sheet uses the actual guidance placement',async()=>{
 const directory=process.env.GUIDANCE_QA_DIR;if(!directory)return;await mkdir(directory,{recursive:true});const canvas=createCanvas(1600,1500),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1600,1500);
 const samples=[{width:768,height:1024,locale:'ru',scale:1},{width:1024,height:768,locale:'ru',scale:1},{width:768,height:1024,locale:'ar',scale:1},{width:1024,height:768,locale:'de',scale:1.25}];
 for(let i=0;i<samples.length;i++){const f=fixture(samples[i]);f.run();readable(f);const x=i%2*800,y=Math.floor(i/2)*750,s=Math.min(780/f.state.width,705/f.state.height);ctx.save();ctx.translate(x+10,y+35);ctx.scale(s,s);ctx.fillStyle='#f5f8fa';ctx.fillRect(0,0,f.state.width,f.state.height);ctx.strokeStyle='#e4e9ed';for(let n=0;n<f.state.width;n+=36){ctx.beginPath();ctx.moveTo(n,80);ctx.lineTo(n,f.state.height);ctx.stroke();}for(let n=90;n<f.state.height;n+=36){ctx.beginPath();ctx.moveTo(0,n);ctx.lineTo(f.state.width,n);ctx.stroke();}
  const rtl=['ar','he'].includes(f.state.locale);ctx.fillStyle='#e9eff3';ctx.fillRect(rtl?8:f.state.width-328,90,320,f.state.height-160);ctx.fillStyle='#dce9f1';const toolbar=f.tools();ctx.fillRect(toolbar.x,toolbar.y,toolbar.width,toolbar.height);const box=f.state.box;ctx.fillStyle='#fff';ctx.strokeStyle='#90a3ae';ctx.beginPath();ctx.roundRect(box.x,box.y,box.width,box.height,8);ctx.fill();ctx.stroke();const flow=textLayout(f.text,box.width-22*f.state.scale-2,f.state.scale);ctx.font=`${13*f.state.scale}px Arial`;ctx.fillStyle='#263741';ctx.textAlign=rtl?'right':'left';flow.lines.forEach((line,n)=>ctx.fillText(line,rtl?box.x+box.width-10*f.state.scale:box.x+10*f.state.scale,box.y+(21+n*18.2)*f.state.scale));ctx.restore();ctx.font='18px Arial';ctx.fillStyle='#263741';ctx.fillText(`${f.state.width}×${f.state.height} · ${f.state.locale} · UI ${f.state.scale}`,x+12,y+25);
 }await writeFile(`${directory}/tablet-guidance.png`,canvas.toBuffer('image/png'));
});
