import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
let api;const output=resolve('node_modules/.cache/engineering-operating-scenarios-'+process.pid+'.mjs');
before(async()=>{await mkdir(resolve('node_modules/.cache'),{recursive:true});await build({stdin:{contents:`export * from './src/lib/engineering-hydraulics';export * from './src/lib/engineering-operation';export * from './src/lib/irrigation-water-recommendations';export * from './src/lib/engineering';export {emptyProject,remapEngineeringZones} from './src/lib/project-types';export {toProjectFile,parseProjectFile} from './src/lib/project-file';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',packages:'external',outfile:output,logLevel:'silent'});api=await import(pathToFileURL(output).href);});
after(async()=>unlink(output).catch(()=>{}));
const xy=ps=>ps.map(([x,y])=>({x,y}));
const pipe=(id,points,zone,flowIds=[])=>({id,kind:'pipe',type:zone?'zonePipe':'main',number:1,label:true,diameterMm:63,points:xy(points),...(zone?{auto:{circuit:'zone:'+zone,captureM:.5,selection:'heads',consumerIds:flowIds.map(id=>'equipment:'+id)}}:{})});
const consumer=(id,x,y,zoneId,flowLpm,pressureBar=2)=>({id,kind:'equipment',type:'waterOutlet',number:1,label:true,x:x+.5,y,rotation:0,size:1,zoneId,flowLpm,pressureBar});
function fixture(){const a=pipe('a',[[10,0],[10,10]],1,['one']),b=pipe('b',[[20,0],[20,10]],2,['two']),main=pipe('main',[[0,0],[10,0],[20,0]]),one=consumer('one',10,10,1,16),two=consumer('two',20,10,2,40,3);return {...api.emptyProject(),heads:[],zones:[1,2,3].map(id=>({id,name:'Zone '+id,nameKind:'generated',hidden:false,locked:false})),engineering:{...api.emptyEngineering(),elements:{a,b,one,two,main},hydraulics:{staticLiftM:0,additionalLossBar:0,inletPressureBar:0,tankRuntimeMin:10}}};}
const run=p=>api.calculateEngineering(p),recommend=p=>api.irrigationWaterRecommendations(p),edge=(r,id)=>r.edges.find(e=>e.pipeId===id&&!e.branch);

test('automatic source uses the upstream main chain, independent of object order and stale source selection',()=>{
 const p=fixture();p.engineering.elements.supply=pipe('supply',[[-30,0],[0,0]]);p.engineering.elements.supply.number=10;
 const base=run(p);assert.ok(base.ready,base.issues.join(','));assert.deepEqual(base.source,{x:-30,y:0});assert.equal(edge(base,'supply').flow,40);assert.ok(edge(base,'supply').lossM>0);
 for(const sourceId of ['missing','one','legacy-source']){p.engineering.hydraulics.sourceId=sourceId;p.engineering.elements['legacy-source']={id:'legacy-source',kind:'equipment',type:'inlet',number:1,label:true,x:1000,y:1000,size:1,rotation:0};const result=run(p);assert.deepEqual(result.source,base.source);assert.equal(result.flow,base.flow);assert.equal(result.headM,base.headM);assert.ok(!result.issues.includes('source'));}
 p.engineering.elements=Object.fromEntries(Object.entries(p.engineering.elements).reverse());assert.deepEqual(run(p).source,base.source);
 const lone=fixture();delete lone.engineering.elements.main;delete lone.engineering.elements.b;delete lone.engineering.elements.two;lone.engineering.elements.a.points.reverse();assert.deepEqual(run(lone).source,{x:10,y:10},'the saved start controls direction, not an old source port');
});

test('selected scenarios drive both pump calculations while the tank keeps the full irrigation cycle',()=>{
 const p=fixture(),volume=recommend(p).cycleVolumeL;assert.equal(run(p).flow,40);assert.equal(recommend(p).flowLpm,40);
 p.engineering.hydraulics.operation='simultaneous';assert.equal(run(p).flow,56);assert.equal(recommend(p).flowLpm,56);
 p.engineering.hydraulics.operation='selected';p.engineering.hydraulics.simultaneousZoneIds=[1,1,999];let result=run(p),demand=recommend(p);
 assert.ok(result.ready,result.issues.join(','));assert.equal(result.flow,16);assert.deepEqual(result.connected,['equipment:one']);assert.deepEqual(result.unconnected,[]);assert.equal(result.connections.length,2,'inactive physical connections remain rendered');assert.equal(result.duties[0].circuit,'selected');assert.equal(demand.flowLpm,16);assert.equal(demand.pressureBar,2);assert.equal(demand.zones.length,2);assert.equal(demand.cycleVolumeL,volume);assert.equal(demand.capacityL,volume*1.2);assert.equal(edge(result,'b').flow,0);assert.equal(edge(result,'b').diameter,api.choosePipeDiameter(40*1.2));assert.notEqual(edge(result,'b').diameter,20);
 p.engineering.hydraulics.simultaneousZoneIds=[1,2];result=run(p);assert.equal(result.flow,56);assert.equal(recommend(p).flowLpm,56);assert.equal(recommend(p).cycleVolumeL,volume);
});

test('inactive unknown and disconnected consumers, pipe metadata and standalone equipment do not pollute the selected pump',()=>{
 const p=fixture();p.engineering.hydraulics={...p.engineering.hydraulics,operation:'selected',simultaneousZoneIds:[1]};
 delete p.engineering.elements.two.flowLpm;p.engineering.elements.unconnected=consumer('unconnected',100,100,3,undefined);p.engineering.elements.standalone=consumer('standalone',100,110,undefined,10);
 p.engineering.elements.b={...p.engineering.elements.b,diameterMm:100,auto:{...p.engineering.elements.b.auto,sizing:'manual'}};
 let result=run(p);assert.ok(result.ready,result.issues.join(','));assert.equal(result.flow,16);assert.equal(recommend(p).flowLpm,16);assert.equal(recommend(p).cycleVolumeL,null,'unknown inactive data still matters to the full-cycle tank');assert.equal(edge(result,'b').diameter,100);assert.equal(edge(result,'b').flow,0);assert.deepEqual(result.unconnected,[]);
 p.engineering.elements.main.auto={circuit:'zone:2',networkCircuit:'main',sizing:'manual',captureM:.5,selection:'heads',consumerIds:[]};result=run(p);assert.ok(result.ready,result.issues.join(','));assert.deepEqual(result.source,{x:0,y:0});assert.equal(edge(result,'main').flow,16,'an inactive binding label cannot disable the physical main');
});

test('empty or stale selected-zone lists cannot produce a zero-flow pump recommendation',()=>{
 const p=fixture();p.engineering.hydraulics.operation='selected';
 for(const selected of [undefined,[],[99],[NaN]]){p.engineering.hydraulics.simultaneousZoneIds=selected;const result=run(p),demand=recommend(p);assert.ok(result.issues.includes('zoneSelection'));assert.equal(result.ready,false);assert.equal(result.flow,null);assert.equal(result.headM,null);assert.equal(demand.flowLpm,null);assert.equal(demand.pressureBar,null);assert.equal(demand.selectionValid,false);assert.equal(demand.cycleVolumeL,560);}
});

test('the 20 percent reserve only selects automatic diameters; losses and water demand use actual flow',()=>{
 const p=fixture();delete p.engineering.elements.main;delete p.engineering.elements.b;delete p.engineering.elements.two;
 const result=run(p),actual=edge(result,'a');assert.ok(result.ready,result.issues.join(','));assert.equal(api.choosePipeDiameter(16),20,'the base chooser has no hidden reserve');assert.equal(actual.diameter,25);assert.equal(actual.flow,16);assert.equal(actual.length,10);assert.equal(actual.lossM,api.pipeLossM(10,16,api.pipeInsideMm(25)));assert.equal(result.flow,16);assert.equal(recommend(p).cycleVolumeL,160);
 p.engineering.elements.a.auto.sizing='manual';p.engineering.elements.a.diameterMm=20;const manual=run(p);assert.ok(manual.ready,manual.issues.join(','));assert.equal(edge(manual,'a').diameter,20);assert.equal(edge(manual,'a').lossM,api.pipeLossM(10,16,api.pipeInsideMm(20)));assert.equal(manual.flow,16);
});

test('selected zone identities renumber, deleted selections are removed, and saved settings survive reopen',()=>{
 const p=fixture();p.engineering.hydraulics={...p.engineering.hydraulics,operation:'selected',simultaneousZoneIds:[2,5,5,9]};
 const changed=api.remapEngineeringZones(p.engineering,new Map([[2,1],[5,2]]),1);assert.deepEqual(changed.hydraulics.simultaneousZoneIds,[1,2]);assert.deepEqual(p.engineering.hydraulics.simultaneousZoneIds,[2,5,5,9]);
 const deleted=api.remapEngineeringZones({...p.engineering,hydraulics:{...p.engineering.hydraulics,simultaneousZoneIds:[9]}},new Map([[2,1],[5,2]]),1);assert.deepEqual(deleted.hydraulics.simultaneousZoneIds,[],'deleting a selection must not silently activate the transfer target');
 p.engineering.hydraulics.simultaneousZoneIds=[1,2];const reopened=api.parseProjectFile(JSON.stringify(api.toProjectFile({project:p}))).project;assert.equal(reopened.engineering.hydraulics.operation,'selected');assert.deepEqual(reopened.engineering.hydraulics.simultaneousZoneIds,[1,2]);assert.equal(run(reopened).flow,56);
});
