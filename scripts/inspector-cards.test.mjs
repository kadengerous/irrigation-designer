import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer,transformWithEsbuild} from 'vite';
import postcss from 'postcss';
import {transform as transformCss} from 'lightningcss';
let server,cards,locale,display,types,source;
before(async()=>{
 server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 [cards,locale,display,types,source]=await Promise.all(['components/designer/inspector-card.tsx','lib/i18n.ts','lib/engineering-pipe-display.ts','lib/project-types.ts'].map(p=>server.ssrLoadModule('/src/'+p)).concat(readFile('src/components/designer/engineering-workspace.tsx','utf8')));
});
after(async()=>server?.close());

test('opening another section or zone replaces its sibling while closing retains no hidden open path',()=>{
 let path=cards.normalizeInspectorPath(['equipment','networks','irrigationZones','zone:1','zone:2']);
 assert.deepEqual(path,['equipment']);
 for(const key of ['networks','pump','tank','equipment','zone:1','zone:2','pump']){
  path=cards.toggleInspectorPath(path,key);
  assert.deepEqual(path,key.startsWith('zone:')?['irrigationZones',key]:[key]);
 }
 assert.deepEqual(cards.toggleInspectorPath(path,'pump'),[]);
 assert.deepEqual(cards.toggleInspectorPath(['irrigationZones','zone:2'],'zone:2'),['irrigationZones']);
});

test('actual equipment selection and sprinkler focus open only their owning path without clearing selection on collapse',async()=>{
 const chooseSource=source.slice(source.indexOf(' const choose='),source.indexOf(' const toggleExpanded='));
 const focusSource=source.slice(source.indexOf(' const focusHeads='),source.indexOf(' const remove='));
 const compiled=(await transformWithEsbuild(chooseSource+focusSource,'inspector-navigation.ts',{loader:'ts'})).code;
 let selected='old',expanded=['pump'],focus=null;
 const noop=()=>{},setValue=(fn,v)=>typeof v==='function'?v(fn):v;
 const env={selected,setSelected:v=>selected=v,setNodeMode:noop,setHover:noop,setBindZone:noop,setBindError:noop,setEditing:noop,setNode:noop,setFocus:v=>focus=v,setScheme:noop,setExpanded:v=>expanded=setValue(expanded,v),current:()=>({elements:{pipe:{kind:'pipe'},pump:{kind:'equipment'}}}),project:{heads:[{id:'head',zone:2}]},engineeringFocusZone:(heads,value)=>value?.kind==='head'?heads.find(h=>h.id===value.id)?.zone:value?.id};
 const api=new Function(...Object.keys(env),compiled+';return {choose,focusHeads};')(...Object.values(env));
 api.choose('pipe');assert.equal(selected,'pipe');assert.deepEqual(expanded,['networks']);
 expanded=cards.toggleInspectorPath(expanded,'networks');assert.deepEqual(expanded,[]);assert.equal(selected,'pipe');
 api.choose('pump');assert.deepEqual(expanded,['equipment']);assert.equal(selected,'pump');
 api.focusHeads({kind:'head',id:'head'});assert.equal(selected,null);assert.deepEqual(expanded,['irrigationZones','zone:2']);assert.deepEqual(focus,{kind:'head',id:'head'});
});

test('shared cards expose accessible controls, omit closed contents and preserve pipe tint in all twenty languages',()=>{
 const pipe={id:'p',kind:'pipe',type:'main',number:1,label:true,diameterMm:32,points:[{x:0,y:0},{x:1,y:0}],color:'#d13471'};
 const bound={...pipe,auto:{circuit:'zone:2',networkCircuit:'main',captureM:.5,sizing:'manual'}};
 for(const lang of locale.LOCALES){
  locale.setActiveLocale(lang.id);
  let rendered=0;
  function Content(){rendered++;return React.createElement('input',{'aria-label':'editable-detail'});}
  const closed=renderToStaticMarkup(React.createElement(cards.InspectorCard,{id:'pump',title:locale.text('engineering.pumpRecommendation'),open:false,onToggle(){},tint:display.engineeringInk(pipe)},React.createElement(Content)));
  assert.equal(rendered,0);assert.match(closed,/aria-expanded="false"/);assert.ok(!closed.includes('editable-detail'));assert.ok(closed.includes('--inspector-tint:#d13471'));
  const open=renderToStaticMarkup(React.createElement(cards.InspectorCard,{id:'pipe',title:locale.text('engineering.main'),open:true,onToggle(){},tint:display.engineeringInk(bound),summary:'12.50 m'},React.createElement(Content)));
  assert.equal(rendered,1);assert.match(open,/type="button"/);assert.match(open,/aria-expanded="true"/);assert.match(open,/role="region"/);assert.ok(open.includes(`--inspector-tint:${types.zoneColor(2)}`));
  const control=open.match(/aria-controls="([^"]+)"/)[1],trigger=open.match(/aria-labelledby="([^"]+)"/)[1];
  assert.ok(open.includes(`id="${control}"`));assert.ok(open.includes(`id="${trigger}"`));
 }
});

test('card chrome outranks the real global button cascade in resting, open and active states',async()=>{
 const [globalText,cardText]=await Promise.all(['src/styles.css','src/components/designer/inspector-card.css'].map(path=>readFile(path,'utf8')));
 const globalCss=postcss.parse(globalText);
 // Check the emitted CSS too: bundling must retain the nested important layer.
 const cardCss=postcss.parse(transformCss({filename:'inspector-card.css',code:Buffer.from(cardText),minify:true}).code.toString());
 const layerOf=node=>{
  const layers=[];
  for(let parent=node.parent;parent;parent=parent.parent)if(parent.type==='atrule'&&parent.name==='layer')layers.unshift(parent.params);
  return layers.flatMap(layer=>layer.split('.'));
 };
 let rule;
 cardCss.walkRules(candidate=>{if(candidate.selector==='.inspector-card>.inspector-card-heading>button.inspector-card-trigger')rule=candidate;});
 assert.ok(rule,'compiled state-independent card chrome rule');
 assert.deepEqual(layerOf(rule),['designer-controls','inspector-card-chrome']);
 const declarations=Object.fromEntries(rule.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node]));
 assert.equal(declarations.border.value,'0');
 assert.equal(declarations['border-radius'].value,'inherit');
 assert.match(declarations.background.value,/var\(--inspector-tint\)/);
 for(const property of ['border','background','border-radius'])assert.ok(declarations[property].important,property);

 // These production selectors caused the regression. Important declarations in
 // a nested layer precede unlayered declarations of its parent layer, independent
 // of selector specificity and stylesheet load order. All layered important
 // declarations also precede important declarations outside any layer.
 const collisions={border:[],background:[],radius:[],active:[]};
 globalCss.walkRules(candidate=>{
  let key;
  if(candidate.selector==='html:has(.app-shell) body button')key='border';
  else if(candidate.selector.includes('body :is(.info-panel,.grid-step-pop) button'))key='background';
  else if(candidate.selector.startsWith('html:has(.app-shell) body button:not(.floating-grip)'))key='radius';
  else if(candidate.selector.startsWith('html:has(.app-shell) body button:is([aria-pressed="true"]'))key='active';
  if(key)for(const decl of candidate.nodes)if(decl.type==='decl'&&['border','background','border-radius'].includes(decl.prop))collisions[key].push(decl);
 });
 for(const [kind,decls]of Object.entries(collisions)){
  assert.ok(decls.length,`real global ${kind} rule still covered`);
  for(const decl of decls){
   const layer=layerOf(decl);
   assert.ok(!layer.length||(layer.length===1&&layer[0]==='designer-controls'),`${kind} is no longer below the card layer`);
  }
 }
 const raw=postcss.parse(cardText);
 const heading=[];
 raw.walkRules(candidate=>{if(candidate.selector==='.inspector-card[data-open=true]>.inspector-card-heading')heading.push(...candidate.nodes.filter(node=>node.type==='decl'));});
 assert.deepEqual(heading.map(node=>[node.prop,node.value]),[['border-end-start-radius','0'],['border-end-end-radius','0']]);
});
