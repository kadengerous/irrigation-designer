import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as icons from 'lucide-react';
import {createServer,transformWithEsbuild} from 'vite';
let server,engineering,units,i18n,types,display,binding,code;
before(async()=>{
 server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 [engineering,units,i18n,types,display,binding]=await Promise.all(['lib/engineering.ts','lib/units.ts','lib/i18n.ts','lib/project-types.ts','lib/engineering-pipe-display.ts','lib/engineering-zone-route.ts'].map(path=>server.ssrLoadModule('/src/'+path)));
 const source=await readFile('src/components/designer/engineering-workspace.tsx','utf8');
 code=(await transformWithEsbuild(source.slice(source.indexOf(' const properties='),source.indexOf(' const controls=')),'engineering-rebind-fixture.tsx',{loader:'tsx',jsx:'transform',jsxFactory:'React.createElement',jsxFragment:'React.Fragment'})).code;
});
after(async()=>server?.close());
const walk=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(walk):[node,...walk(node.props?.children)];
function fixture({auto=true,insetM=0,locked=false,error=null,independent=false}={}){
 const project={...types.emptyProject(),zones:[{id:2,name:'East',nameKind:'custom',hidden:false,locked:false},{id:9,name:'Other',nameKind:'custom',hidden:false,locked:false}]};
 const item={id:'pipe',kind:'pipe',type:'main',number:1,label:true,diameterMm:32,points:[{x:0,y:0},{x:10,y:0}],...(!independent?{auto:{circuit:'zone:2',captureM:.5,sizing:'manual',selection:'heads',insetM,...(auto?{networkCircuit:'main'}:{})}}:{})};
 const latest={...project,name:'latest store state'},output={...item,name:'binder result'},calls=[],commits=[],cleared=[];
 const noop=()=>{};
 const env={...icons,...engineering,...units,...i18n,React,item,project,locked,preview:null,editing:null,node:null,nodeMode:null,hydraulic:null,units:units.METRIC_UNITS,bindZone:9,bindError:null,t:i18n.text,AUTO_ROUTE_INSET_M:.5,ink:display.engineeringInk,zoneLabel:types.zoneLabel,itemTitle:()=> 'Pipe',circuitName:()=> 'East',Numeric:()=>null,
  useProject:{getState:()=>({project:latest})},unbindPipeFromZone:pipe=>{calls.push(['unbind',pipe]);return binding.unbindPipeFromZone(pipe);},bindPipeToZone:(...args)=>{calls.push(args);return error?{error}:{pipe:output};},commit:value=>commits.push(value),patch:noop,setBindZone:value=>cleared.push(['zone',value]),setBindError:value=>cleared.push(['error',value]),setNode:value=>cleared.push(['node',value]),setNodeMode:value=>cleared.push(['mode',value]),setHover:value=>cleared.push(['hover',value]),cancel:noop,deleteNode:noop,duplicate:noop,remove:noop,setTool:noop,setExtending:noop,setDraft:noop,setLibrary:noop,setScheme:noop,setEditing:noop,autoDraft:{current:{}}};
 const keys=Object.keys(env).filter(key=>key!=='default'&&/^[$A-Z_a-z][$\w]*$/.test(key));
 const tree=new Function(...keys,code+';return properties;')(...keys.map(key=>env[key]));
 return {tree,item,project,latest,output,calls,commits,cleared};
}
const action=tree=>walk(tree).find(node=>node.type==='button'&&node.props['data-unbind-zone']==='true');
const bindAction=tree=>walk(tree).find(node=>node.type==='button'&&node.props.children===i18n.text('engineering.bindToZone'));

test('bound pipes expose only localized unbind, preserve their route and restore independent controls',()=>{
 for(const locale of i18n.LOCALES)for(const auto of [true,false])for(const insetM of [0,.5]){
  i18n.setActiveLocale(locale.id);const f=fixture({auto,insetM}),button=action(f.tree),before=JSON.stringify(f.item);
  assert.ok(button,`${locale.id}: bound pipe at inset ${insetM}`);assert.equal(button.props.children,i18n.text('engineering.unbindFromZone'));assert.equal(bindAction(f.tree),undefined);
  assert.ok(!walk(f.tree).some(node=>node.type==='select'&&node.props['data-bind-zone']));
  assert.doesNotMatch(renderToStaticMarkup(f.tree),/engineering\.[A-Za-z]/);
  button.props.onClick();assert.deepEqual(f.calls,[['unbind',f.item]]);assert.equal(f.commits.length,1);assert.equal(f.commits[0].auto,undefined);assert.deepEqual(f.commits[0].points,f.item.points);assert.equal(f.commits[0].diameterMm,32);
  assert.equal(JSON.stringify(f.item),before);assert.deepEqual(f.cleared,[['zone',''],['error',null],['node',null],['mode',null],['hover',null]]);
 }
 const independent=fixture({independent:true});assert.ok(walk(independent.tree).some(node=>node.type==='select'&&node.props['data-bind-zone']));assert.ok(walk(independent.tree).some(node=>node.type==='input'&&node.props.type==='color'));assert.equal(action(independent.tree),undefined);assert.ok(bindAction(independent.tree));
});

test('locked bound pipes cannot detach and independent binding still handles errors',()=>{
 const locked=fixture({locked:true});assert.match(renderToStaticMarkup(locked.tree),/<fieldset disabled=""/);action(locked.tree).props.onClick();assert.equal(locked.calls.length,0);assert.equal(locked.commits.length,0);
 const rejected=fixture({independent:true,error:'occupiedHead'});bindAction(rejected.tree).props.onClick();assert.equal(rejected.commits.length,0);assert.deepEqual(rejected.cleared,[['error','occupiedHead']]);
 const independent=fixture({independent:true});bindAction(independent.tree).props.onClick();assert.deepEqual(independent.calls,[[independent.latest,independent.item,9]]);assert.deepEqual(independent.commits,[independent.output]);
});
