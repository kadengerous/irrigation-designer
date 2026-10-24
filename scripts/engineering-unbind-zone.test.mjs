import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as icons from 'lucide-react';
import {createServer,transformWithEsbuild} from 'vite';
import postcss from 'postcss';
let server,b,m,c,h,v,types,file,store,units,i18n,symbols,panel,propertiesCode;
before(async()=>{
 server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 const load=p=>server.ssrLoadModule('/src/'+p);
 [b,m,c,h,v,types,file,{useProject:store},units,i18n,symbols,panel]=await Promise.all(['lib/engineering-zone-route.ts','lib/engineering.ts','lib/engineering-connections.ts','lib/engineering-hydraulics.ts','lib/engineering-pipe-display.ts','lib/project-types.ts','lib/project-file.ts','lib/project-store.ts','lib/units.ts','lib/i18n.ts','components/designer/engineering-symbol.tsx','components/designer/engineering-hydraulic-panel.tsx'].map(load));
 const source=await readFile('src/components/designer/engineering-workspace.tsx','utf8');propertiesCode=(await transformWithEsbuild(source.slice(source.indexOf(' const properties='),source.indexOf(' const controls=')),'unbind-fixture.tsx',{loader:'tsx',jsx:'transform',jsxFactory:'React.createElement',jsxFragment:'React.Fragment'})).code;
});
after(async()=>server?.close());
const xy=a=>a.map(([x,y])=>({x,y}));
const head=(id,x,y,zone=1)=>({id,x,y,zone,catalogId:'MP1000-90',nozzleId:'MP1000-90',r:4,arc:180,start:0,bodyId:'PRS40',designPressure:2.8,popUpMm:100,locked:false,needsReview:false});
const pipe=(id,points,patch={})=>({id,kind:'pipe',type:'main',number:1,name:'Supply',label:true,color:'#763ab2',diameterMm:32,points:xy(points),...patch});
const reset=project=>store.setState({project,projects:[],past:[],future:[],pastOps:[],futureOps:[],workspaceSection:'engineering',tool:null,drawSub:'none',groupMemberId:null});
const save=(p,e)=>({...p,engineering:c.commitAutoConnections(p,{...p.engineering,elements:{...p.engineering.elements,[e.id]:e}})});
function shared(){
 const main=pipe('main',[[-8,0],[0,0],[0,0],[6,0],[18,0]]),other=pipe('other',[[6,0],[6,-5],[8,-5]],{type:'zonePipe',diameterMm:25,auto:{circuit:'zone:2',selection:'heads',captureM:.5,consumerIds:['head:other-a','head:other-b'],consumerNodes:{'head:other-a':1,'head:other-b':2}}});
 const p={...types.emptyProject(),heads:[head('a',2,4),head('b',12,4),head('other-a',6,-7,2),head('other-b',8,-5,2)],zones:[1,2,3].map(id=>({id,name:'Zone '+id,nameKind:'custom',hidden:false,locked:false})),engineering:{...m.emptyEngineering(),elements:{main,other}}};
 const inlet=m.newEquipment(p.engineering,'inlet',main.points[0]);p.engineering.elements[inlet.id]=inlet;p.engineering.hydraulics={sourceId:inlet.id,inletPressureBar:1,staticLiftM:0,additionalLossBar:0,operation:'sequential'};const bound=b.bindPipeToZone(p,main,1);assert.ok(bound.pipe,bound.error);return save(p,bound.pipe);
}
test('unbind removes only zone automation, preserves every route vertex and restores the independent color',()=>{
 const p=shared(),bound=p.engineering.elements.main,snapshot=JSON.stringify(p),manual=b.unbindPipeFromZone(bound);
 assert.equal(JSON.stringify(p),snapshot);assert.ok(!Object.hasOwn(manual,'auto'));const {auto,...properties}=bound;assert.deepEqual(manual,{...properties,networkCircuit:'main'});assert.deepEqual(manual.points,bound.points);assert.equal(m.engineeringNetworkCircuit(manual),m.engineeringNetworkCircuit(bound));assert.equal(v.engineeringInk(bound),types.zoneColor(1));assert.equal(v.engineeringInk(manual),'#763ab2');assert.strictEqual(b.unbindPipeFromZone(manual),manual);
 const mainAuto={...bound,auto:{...auto,circuit:'main'}};assert.strictEqual(b.unbindPipeFromZone(mainAuto),mainAuto,'a main automation is not a zone binding');
});
test('actual store commit removes thin branches atomically, retains the shared source and other zone, and supports undo/file roundtrip',()=>{
 const p=shared(),before=h.calculateEngineering(p);assert.ok(before.ready,before.issues.join(','));reset(p);const unbound=b.unbindPipeFromZone(p.engineering.elements.main);store.getState().commitEngineering({...p.engineering,elements:{...p.engineering.elements,main:unbound}});const next=store.getState().project,after=h.calculateEngineering(next),links=c.autoConnections(next);
 assert.equal(store.getState().past.length,1);assert.ok(!links.has('head:a')&&!links.has('head:b'));assert.equal(links.get('head:other-a').pipeId,'other');assert.ok(!after.edges.some(e=>e.pipeId==='main'&&e.branch));assert.deepEqual(after.connected.slice().sort(),['head:other-a','head:other-b']);assert.ok(!after.issues.includes('loop'));assert.deepEqual(after.source,before.source);assert.deepEqual(next.heads,p.heads);assert.deepEqual(next.engineering.hydraulics,p.engineering.hydraulics);assert.deepEqual(next.engineering.elements.other,p.engineering.elements.other);assert.equal(after.duties.find(d=>d.circuit==='zone:2').flow,before.duties.find(d=>d.circuit==='zone:2').flow);
 const expected=structuredClone(next.engineering);store.getState().undo();assert.deepEqual(store.getState().project.engineering,p.engineering);assert.deepEqual(c.autoConnections(store.getState().project).size,4);store.getState().redo();assert.deepEqual(store.getState().project.engineering,expected);const reopened=file.parseProjectFile(JSON.stringify(file.toProjectFile({project:store.getState().project}))).project;assert.deepEqual(reopened.engineering,expected);assert.equal(m.engineeringNetworkCircuit(reopened.engineering.elements.main),'main');
});
test('legacy automatic laterals retain their physical channel through unbind, rebind, zone remap and file loading',()=>{
 const p=shared(),main=pipe('main',[[-8,0],[0,0]],{color:'#387632'}),lateral=pipe('lateral',[[0,0],[5,0],[10,0]],{type:'zonePipe',auto:{circuit:'zone:1',captureM:.5,selection:'heads',consumerIds:['head:a'],consumerNodes:{'head:a':1},headStartIndex:0}}),tail=pipe('tail',[[10,0],[10,5]],{auto:{circuit:'zone:2',networkCircuit:'zone:1',captureM:.5,selection:'heads',consumerIds:['head:other'],consumerNodes:{'head:other':1},headStartIndex:0}});
 p.heads=[head('a',5,3),head('other',10,7,2)];p.engineering.elements={main,lateral,tail,[p.engineering.hydraulics.sourceId]:p.engineering.elements[p.engineering.hydraulics.sourceId]};const prior=h.calculateEngineering(p);assert.ok(prior.ready,prior.issues.join(','));const manual=b.unbindPipeFromZone(lateral),unbound=save(p,manual),after=h.calculateEngineering(unbound);assert.equal(manual.networkCircuit,'zone:1');assert.equal(m.engineeringNetworkCircuit(manual),'zone:1');assert.deepEqual(manual.points,lateral.points);assert.deepEqual(after.connected,['head:other']);assert.ok(!after.issues.includes('loop'));assert.deepEqual(unbound.engineering.elements.tail,tail);
 const withNew={...unbound,heads:[...unbound.heads,head('new',7,-4,3)]},rebound=b.bindPipeToZone(withNew,manual,3);assert.ok(rebound.pipe,rebound.error);assert.equal(rebound.pipe.auto.circuit,'zone:3');assert.equal(rebound.pipe.auto.networkCircuit,'zone:1');assert.equal(m.engineeringNetworkCircuit(rebound.pipe),'zone:1');assert.equal(v.engineeringInk(rebound.pipe),types.zoneColor(3));assert.deepEqual(h.calculateEngineering(save(withNew,rebound.pipe)).connected.slice().sort(),['head:new','head:other']);
 const mapped=types.remapEngineeringZones(unbound.engineering,new Map([[1,7],[2,8]]));assert.equal(mapped.elements.lateral.networkCircuit,'zone:7');assert.equal(mapped.elements.tail.auto.networkCircuit,'zone:7');assert.equal(mapped.elements.tail.auto.circuit,'zone:8');assert.equal(m.engineeringNetworkCircuit(mapped.elements.main),'main');
 const sparse={...unbound,zones:unbound.zones.map(z=>({...z,id:z.id===1?7:z.id===2?8:9})),heads:unbound.heads.map(h=>({...h,zone:h.zone===1?7:8})),engineering:mapped},loaded=file.parseProjectFile(JSON.stringify(file.toProjectFile({project:sparse}))).project;assert.equal(loaded.engineering.elements.lateral.networkCircuit,loaded.engineering.elements.tail.auto.networkCircuit);assert.equal(m.engineeringNetworkCircuit(loaded.engineering.elements.lateral),`zone:${loaded.heads.find(h=>h.id==='a').zone}`);
});
const walk=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(walk):[node,...walk(node.props?.children)];
function properties(p,item,locked=false){
 const commit=value=>store.getState().commitEngineering({...store.getState().project.engineering,elements:{...store.getState().project.engineering.elements,[value.id]:value}});
 const env={...icons,...m,...c,...units,...i18n,...symbols,...panel,...b,React,t:i18n.text,item,project:p,locked,preview:null,units:units.METRIC_UNITS,tool:null,editing:null,node:null,nodeMode:null,bindZone:1,bindError:null,hydraulic:h.calculateEngineering(p),AUTO_ROUTE_INSET_M:.5,ink:v.engineeringInk,zoneLabel:types.zoneLabel,itemTitle:()=>item.name??'Pipe',useProject:store,commit,patch:values=>commit({...item,...values}),cancel(){},deleteNode(){},setNodeMode(){},setNode(){},setHover(){},setBindZone(){},setBindError(){},setTool(){},setExtending(){},setDraft(){},setLibrary(){},setScheme(){},setEditing(){},duplicate(){},remove(){},autoDraft:{current:{}}};const keys=Object.keys(env).filter(k=>k!=='default'&&/^[$A-Z_a-z][$\w]*$/.test(k));return new Function(...keys,propertiesCode+';return properties;')(...keys.map(k=>env[k]));
}
test('actual properties replace bind with translated unbind in all 20 locales; click commits once, respects locking and restores manual controls',()=>{
 const p=shared();for(const{id:locale}of i18n.LOCALES){i18n.setActiveLocale(locale);reset(p);const tree=properties(p,p.engineering.elements.main),markup=renderToStaticMarkup(tree),button=walk(tree).find(n=>n.props?.['data-unbind-zone']);assert.ok(button,locale);assert.equal(button.props.children,i18n.text('engineering.unbindFromZone'));assert.doesNotMatch(markup,/engineering\.[A-Za-z]/);assert.ok(!walk(tree).some(n=>n.props?.['data-bind-zone']));assert.ok(walk(tree).some(n=>n.type==='input'&&n.props.type==='checkbox'));
  button.props.onClick();assert.equal(store.getState().past.length,1);const next=store.getState().project,manualTree=properties(next,next.engineering.elements.main);assert.ok(!walk(manualTree).some(n=>n.props?.['data-unbind-zone']));assert.ok(walk(manualTree).some(n=>n.props?.['data-bind-zone']));assert.ok(walk(manualTree).some(n=>n.type==='input'&&n.props.type==='color'));
  reset(p);const locked=properties(p,p.engineering.elements.main,true);assert.ok(walk(locked).find(n=>n.type==='fieldset').props.disabled);walk(locked).find(n=>n.props?.['data-unbind-zone']).props.onClick();assert.equal(store.getState().past.length,0);
 }i18n.setActiveLocale('en');
});
test('checkbox styling defeats inspector and coarse-dialog input sizing while retaining a larger clickable label',async()=>{
 const engineering=postcss.parse(await readFile('src/components/designer/engineering.css','utf8')),global=postcss.parse(await readFile('src/styles.css','utf8'));
 const declarations=(root,selector)=>{let rule;root.walkRules(r=>{if(r.selectors.includes(selector))rule=r;});assert.ok(rule,selector);return Object.fromEntries(rule.nodes.filter(n=>n.type==='decl').map(n=>[n.prop,n.value]));};
 for(const[root,selector]of [[engineering,'.engineering-properties .engineering-checkbox input[type="checkbox"]'],[global,'.settings-panel .settings-hints input[type="checkbox"]']]){const d=declarations(root,selector);for(const key of ['width','min-width','max-width','height','min-height','max-height'])assert.equal(d[key],'1.125rem');assert.equal(d.padding,'0');assert.equal(d.flex,'0 0 1.125rem');assert.equal(d.appearance,'auto');}
 const d=declarations(engineering,'.inspector-card .engineering-properties label.engineering-checkbox');assert.equal(d['flex-direction'],'row');assert.equal(d['white-space'],'nowrap');assert.ok(parseFloat(d['min-height'])>=2.25);assert.ok(parseFloat(declarations(global,'.settings-hints')['min-height'])>=2.5);
 const settings=await readFile('src/components/designer/settings-panel.tsx','utf8');assert.match(settings,/<label className="settings-hints">\s*<input type="checkbox" checked=\{showHints\}/);assert.match(settings,/setShowHints\(e.target.checked\)/);
});
