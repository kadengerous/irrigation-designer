import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer,transformWithEsbuild} from 'vite';
let server,rec,types,m,h,catalog,flow,precip,hydro,units,i18n,panel,store,file,localized,source;
before(async()=>{server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});const load=p=>server.ssrLoadModule('/src/'+p);[rec,types,m,h,catalog,flow,precip,hydro,units,i18n,panel,{useProject:store},file,localized]=await Promise.all(['lib/irrigation-water-recommendations.ts','lib/project-types.ts','lib/engineering.ts','lib/engineering-hydraulics.ts','lib/hunter-catalog.ts','lib/flow.ts','lib/precipitation-display.ts','lib/hydro.ts','lib/units.ts','lib/i18n.ts','components/designer/engineering-hydraulic-panel.tsx','lib/project-store.ts','lib/project-file.ts','components/designer/localized-number-input.tsx'].map(load));source=await readFile('src/components/designer/engineering-hydraulic-panel.tsx','utf8');});
after(async()=>server.close());
const consumer=(id,zoneId,flowLpm=10)=>({id,kind:'equipment',type:'waterOutlet',x:5.5,y:0,size:1,rotation:0,zoneId,flowLpm,pressureBar:2,number:1,label:true});
const project=(elements=[],settings={})=>({...types.emptyProject(),heads:[],engineering:{version:1,categories:{},elements:Object.fromEntries(elements.map(e=>[e.id,e])),hydraulics:settings}});
function head(id,zone=1){const item=catalog.CATALOG.find(i=>i.id==='MP1000-90')??catalog.CATALOG.find(i=>i.id==='MP1000')??catalog.CATALOG.find(i=>i.nozzles?.length&&i.type==='nozzle');assert.ok(item);return {...flow.catalogHeadDefaults(item),id,catalogId:item.id,x:5,y:0,zone,hidden:true};}
const calculate=p=>rec.irrigationWaterRecommendations(p);
const reset=p=>store.setState({project:p,projects:[],past:[],future:[],pastOps:[],futureOps:[],units:units.METRIC_UNITS,locale:'en',numberFormat:'auto'});
const walk=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(walk):[n,...walk(n.props?.children)];

test('pre-route pump demand uses peak zone flow or simultaneous sum and tank volume counts each full zone once',()=>{
 const p=project([consumer('a',1,10),consumer('b',1,20),consumer('c',2,15)],{tankRuntimeMin:30}),snapshot=JSON.stringify(p),r=calculate(p);assert.equal(r.flowLpm,30);assert.equal(r.pressureBar,2);assert.equal(r.cycleVolumeL,1350);assert.equal(r.capacityL,1620);assert.equal(r.reservePct,20);assert.equal(r.zones.length,2);assert.deepEqual(r.zones.map(z=>z.volumeL),[900,450]);assert.equal(JSON.stringify(p),snapshot);
 p.engineering.hydraulics.operation='simultaneous';const simultaneous=calculate(p);assert.equal(simultaneous.flowLpm,45);assert.equal(simultaneous.cycleVolumeL,1350);assert.equal(simultaneous.capacityL,1620);
 p.engineering.hydraulics.tankReservePct=0;assert.equal(calculate(p).capacityL,1350);p.engineering.hydraulics.tankReservePct=50;assert.equal(calculate(p).capacityL,2025);
});

test('catalog application rates drive visible target depth and runtime; hidden heads remain real demand',()=>{
 const p=project();p.heads=[head('a'),head('b')];const r=calculate(p),f=flow.headFlow(p.heads[0]),item=catalog.CATALOG.find(i=>i.id===p.heads[0].catalogId),rate=precip.displayPrecipitation(item,{arc:p.heads[0].arc,radius:p.heads[0].r,pressureBar:hydro.headWorkingBar(p.heads[0]),nozzleId:p.heads[0].nozzleId},f).rate;assert.ok(rate>0&&f.lpm>0);assert.equal(r.flowLpm,2*f.lpm);assert.equal(r.zones[0].manualRuntime,false);assert.equal(r.zones[0].runtimeMin,600/rate);assert.ok(Math.abs(r.cycleVolumeL-2*f.lpm*600/rate)<1e-8);
 p.meta.targetMm=20;assert.equal(calculate(p).cycleVolumeL,2*r.cycleVolumeL);assert.equal(calculate(p).zones[0].runtimeMin,2*r.zones[0].runtimeMin);
 p.heads[1].zone=2;assert.equal(calculate(p).flowLpm,f.lpm);assert.equal(calculate(p).cycleVolumeL,2*r.cycleVolumeL,'two successive zones use the same total water');
 const fast=catalog.CATALOG.find(i=>i.id==='MP800SR-90');assert.ok(fast);const mixed=project();mixed.heads=[head('slow'),{...flow.catalogHeadDefaults(fast),catalogId:fast.id,id:'fast',x:10,y:0,zone:1}];const f2=flow.headFlow(mixed.heads[1]),r2=precip.displayPrecipitation(fast,{arc:mixed.heads[1].arc,radius:mixed.heads[1].r,pressureBar:hydro.headWorkingBar(mixed.heads[1]),nozzleId:mixed.heads[1].nozzleId},f2).rate;assert.ok(r2>rate);const estimate=calculate(mixed);assert.equal(estimate.zones[0].rateMmHr,rate);assert.equal(estimate.zones[0].runtimeMin,600/rate);assert.ok(Math.abs(estimate.cycleVolumeL-(f.lpm+f2.lpm)*600/rate)<1e-8,'mixed reference rates use the slowest rate for the entire zone');
});

test('local emitters and mixed zones require entered runtime, never an invented duration or partial total',()=>{
 const p=project([consumer('local',1,3)]);p.heads=[head('spray')];let r=calculate(p);assert.equal(r.zones[0].manualRuntime,true);assert.equal(r.zones[0].runtimeMin,null);assert.equal(r.cycleVolumeL,null);assert.equal(r.capacityL,null);const q=flow.headFlow(p.heads[0]).lpm+3;
 p.engineering.hydraulics.tankRuntimeMin=17;r=calculate(p);assert.equal(r.zones[0].runtimeMin,17);assert.equal(r.cycleVolumeL,q*17);
 p.engineering.elements.unknown=consumer('unknown',2);delete p.engineering.elements.unknown.flowLpm;r=calculate(p);assert.equal(r.flowLpm,null);assert.equal(r.cycleVolumeL,null);assert.equal(r.capacityL,null);
 for(const bad of [0,-1,NaN,Infinity]){p.engineering.hydraulics.tankRuntimeMin=bad;assert.equal(calculate(p).fallbackRuntimeMin,null);assert.equal(calculate(p).capacityL,null);}
});

test('empty, unverified and invalid inputs cannot produce a plausible final recommendation',()=>{
 assert.equal(calculate(project()).flowLpm,null);assert.equal(calculate(project()).capacityL,null);const p=project();p.heads=[{...head('missing'),catalogId:'not-a-model'}];assert.equal(calculate(p).flowLpm,null);assert.equal(calculate(p).capacityL,null);
 const known=project();known.heads=[head('valid')];for(const value of [0,-1,NaN,Infinity]){known.meta.targetMm=value;assert.equal(calculate(known).cycleVolumeL,null);}known.meta.targetMm=10;for(const value of [-1,101,NaN,Infinity]){known.engineering.hydraulics.tankReservePct=value;assert.equal(calculate(known).capacityL,null);}
});

test('actual pump panel distinguishes preliminary emitter demand from a complete connected pump duty',()=>{
 const p=project([consumer('a',1,10)],{staticLiftM:0,additionalLossBar:0,inletPressureBar:0});reset(p);let html=renderToStaticMarkup(React.createElement(panel.HydraulicPanel,{project:p,embedded:true}));assert.match(html,/data-pump-basis="emitters"/);assert.doesNotMatch(html,/H ≥/);assert.doesNotMatch(html,/<h3/);
 p.engineering.elements.pipe={id:'pipe',kind:'pipe',type:'zonePipe',number:1,label:true,points:[{x:0,y:0},{x:10,y:0}],diameterMm:32,auto:{circuit:'zone:1',captureM:.5}};const result=h.calculateEngineering(p);assert.ok(result.ready,result.issues.join(','));html=renderToStaticMarkup(React.createElement(panel.HydraulicPanel,{project:p,result,embedded:true}));assert.match(html,/data-pump-basis="hydraulic"/);assert.match(html,/H ≥/);assert.doesNotMatch(html,/data-pump-basis="emitters"/);
 p.engineering.elements.b=consumer('b',2,15);html=renderToStaticMarkup(React.createElement(panel.HydraulicPanel,{project:p}));assert.match(html,/data-pump-basis="emitters"/);assert.doesNotMatch(html,/H ≥/);assert.match(html,/15/,'preliminary demand includes unconnected consumers');
});

test('actual tank input callbacks commit canonical units, preserve assumptions, undo and reopen',async()=>{
 const p=project([consumer('local',1,5)]);reset(p);store.setState({units:units.US_UNITS});const useProject=Object.assign(selector=>selector(store.getState()),{getState:store.getState});
 const code=(await transformWithEsbuild(source.replace(/^import .*;\n/gm,'').replaceAll('export function','function'),'recommendation-fixture.tsx',{loader:'tsx',jsx:'transform',jsxFactory:'React.createElement',jsxFragment:'React.Fragment'})).code;
 const env={React,useMemo:f=>f(),useProject,t:i18n.text,formatNumber:i18n.formatNumber,...units,...m,...h,...rec,...localized,zoneLabel:types.zoneLabel},keys=Object.keys(env),render=new Function(...keys,code+';return TankRecommendationPanel;')(...keys.map(k=>env[k]));
 const tree=render({project:p,embedded:true}),inputs=walk(tree).filter(n=>n.props?.['data-tank-input']),input=key=>inputs.find(n=>n.props['data-tank-input']===key);assert.equal(input('depth').props.value,10/25.4);assert.equal(input('runtime').props.value,null);assert.equal(input('reserve').props.value,20);
 input('runtime').props.onCommit(25);input('reserve').props.onCommit(15);input('depth').props.onCommit(.5);const saved=store.getState().project;assert.equal(saved.meta.targetMm,12.7);assert.equal(saved.engineering.hydraulics.tankRuntimeMin,25);assert.equal(saved.engineering.hydraulics.tankReservePct,15);assert.equal(calculate(saved).capacityL,143.75);store.getState().undo();assert.equal(store.getState().project.meta.targetMm,10);store.getState().redo();assert.equal(store.getState().project.meta.targetMm,12.7);const reopened=file.parseProjectFile(JSON.stringify(file.toProjectFile({project:store.getState().project}))).project;assert.equal(calculate(reopened).capacityL,143.75);assert.equal(reopened.meta.targetMm,12.7);
});

test('pump and tank contents render in all 20 locales and both engineering unit presets',()=>{
 const p=project([consumer('local',1,5)],{tankRuntimeMin:25});p.heads=[head('spray',2)];reset(p);for(const {id:locale}of i18n.LOCALES)for(const prefs of [units.METRIC_UNITS,units.US_UNITS]){i18n.setActiveLocale(locale);units.setActiveUnits(prefs);store.setState({locale,units:prefs});const pump=renderToStaticMarkup(React.createElement(panel.HydraulicPanel,{project:p,embedded:true})),tank=renderToStaticMarkup(React.createElement(panel.TankRecommendationPanel,{project:p,embedded:true}));assert.doesNotMatch(pump+tank,/engineering\.[A-Za-z]|NaN|Infinity/,locale);assert.match(tank,/data-tank-result="complete"/);assert.match(tank,/data-runtime-basis="manual"/);assert.match(tank,/data-runtime-basis="reference"/);assert.match(tank,/data-tank-input="depth"/);assert.match(tank,/data-tank-input="reserve"/);assert.match(tank,/data-tank-input="runtime"/);}i18n.setActiveLocale('en');units.setActiveUnits(units.METRIC_UNITS);
});


test('actual pump controls choose simultaneous zones, omit source selection and preserve cycle volume through undo/reopen',async()=>{
 const p=project([consumer('first',1,10),consumer('second',2,20),consumer('third',3,90)],{sourceId:'deleted-source',tankRuntimeMin:10});
 p.zones=[1,2,3].map(id=>({id,name:`Plot ${id}`,nameKind:'custom',hidden:false,locked:false}));reset(p);
 const useProject=Object.assign(selector=>selector(store.getState()),{getState:store.getState});
 const code=(await transformWithEsbuild(source.replace(/^import .*;\n/gm,'').replaceAll('export function','function'),'pump-operation-fixture.tsx',{loader:'tsx',jsx:'transform',jsxFactory:'React.createElement',jsxFragment:'React.Fragment'})).code;
 const env={React,useMemo:f=>f(),useId:()=> 'pump-test',useProject,t:i18n.text,formatNumber:i18n.formatNumber,...units,...m,...h,...rec,...localized,zoneLabel:types.zoneLabel},keys=Object.keys(env),component=new Function(...keys,code+';return HydraulicPanel;')(...keys.map(k=>env[k]));
 const render=()=>component({project:store.getState().project,embedded:true});
 const initial=render(),select=walk(initial).find(n=>n.props?.['data-pump-operation']);assert.ok(select);assert.deepEqual(walk(select).filter(n=>n.type==='option').map(n=>n.props.value),['sequential','simultaneous','selected']);assert.equal(walk(initial).filter(n=>n.type==='select').length,1,'there is no source dropdown');
 const cycle=calculate(p).cycleVolumeL;select.props.onChange({target:{value:'selected'}});assert.equal(calculate(store.getState().project).flowLpm,null);
 const selected=render(),checkbox=id=>walk(selected).find(n=>n.props?.['data-pump-zone']===id);assert.ok(checkbox(1)&&checkbox(2)&&checkbox(3));
 checkbox(1).props.onChange({target:{checked:true}});checkbox(2).props.onChange({target:{checked:true}});
 let next=store.getState().project;assert.deepEqual(next.engineering.hydraulics.simultaneousZoneIds,[1,2]);assert.equal(calculate(next).flowLpm,30);assert.equal(calculate(next).cycleVolumeL,cycle);assert.equal(next.engineering.hydraulics.sourceId,'deleted-source','legacy storage is harmless and not exposed as a control');
 store.getState().undo();assert.deepEqual(store.getState().project.engineering.hydraulics.simultaneousZoneIds,[1]);store.getState().redo();next=store.getState().project;
 const reopened=file.parseProjectFile(JSON.stringify(file.toProjectFile({project:next}))).project;assert.equal(reopened.engineering.hydraulics.operation,'selected');assert.deepEqual(reopened.engineering.hydraulics.simultaneousZoneIds,[1,2]);assert.equal(calculate(reopened).flowLpm,30);
 for(const {id:locale}of i18n.LOCALES)for(const prefs of [units.METRIC_UNITS,units.US_UNITS]){i18n.setActiveLocale(locale);store.setState({locale,units:prefs});const html=renderToStaticMarkup(React.createElement(panel.HydraulicPanel,{project:next,embedded:true}));assert.doesNotMatch(html,/engineering\.[A-Za-z]|NaN|Infinity/,locale);assert.equal((html.match(/data-pump-zone=/g)||[]).length,3);assert.match(html,/Plot 1/);assert.match(html,/Plot 2/);}
 i18n.setActiveLocale('en');store.setState({units:units.METRIC_UNITS,locale:'en'});
});
