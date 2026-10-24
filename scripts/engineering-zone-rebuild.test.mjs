import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createCanvas,loadImage} from '@napi-rs/canvas';
let server,m,b,c,h,draft,cad,emptyDrawing,types,file,store,units,AutoPipeDrawing,EngineeringSprinklers;
before(async()=>{
 server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 const load=p=>server.ssrLoadModule('/src/'+p);
 [m,b,c,h,draft,cad,{emptyDrawing},types,file,{useProject:store},units,{AutoPipeDrawing},{EngineeringSprinklers}]=await Promise.all(['lib/engineering.ts','lib/engineering-zone-route.ts','lib/engineering-connections.ts','lib/engineering-hydraulics.ts','lib/engineering-auto-route-draft.ts','lib/cad/engine.ts','lib/cad/types.ts','lib/project-types.ts','lib/project-file.ts','lib/project-store.ts','lib/units.ts','components/designer/engineering-auto-pipe.tsx','components/designer/engineering-zones.tsx'].map(load));
});
after(async()=>server?.close());
const xy=ps=>ps.map(([x,y])=>({x,y})),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),close=(a,b)=>distance(a,b)<1e-6;
const outline=xy([[0,0],[16,0],[16,12],[7,12],[7,9],[5,9],[5,7],[3,7],[1,4],[0,4]]);
const consumers=xy([[1,4],[3,7],[5,9],[7,12],[11,12],[16,12],[16,8]]);
const lead=xy([[-15,25],[-10,25],[-10,-2],[-2,-2]]);
const near=[...lead,...xy([[1,3],[3,3],[4,4],[6,7],[8,11],[15.5,11],[15.5,8]])];
const far=[...lead,...xy([[1,1],[6,1],[8,4],[10,6],[11,9],[13,9],[13,7]])];
const outside=xy([[-18,24],[-18,-2],[-14,-2]]);
const head=(id,p,zone=1,figureId)=>({...p,id,zone,figureId,catalogId:'MP1000-90',nozzleId:'MP1000-90',r:4,arc:180,start:0,bodyId:'PRS40',designPressure:2.8,popUpMm:100,locked:false,needsReview:false});
function fixture(points=near,{reverseBoundary=false,noFigure=false,paving=true}={}){
 let drawing=noFigure?emptyDrawing():cad.addPointShape(emptyDrawing(),reverseBoundary?[...outline].reverse():outline,'lawn');const figureId=Object.keys(drawing.faces)[0];
 if(paving&&!noFigure)drawing=cad.addPointShape(drawing,xy([[-20,-4],[-3,-4],[-3,27],[-20,27]]),'path');
 const project={...types.emptyProject(),drawing,heads:[...consumers.map((p,i)=>head('h'+i,p,1,figureId)),...xy([[-7,2],[-7,9],[-7,18]]).map((p,i)=>head('other'+i,p,2))],zones:[{id:1,name:'Green',nameKind:'custom',hidden:false,locked:false},{id:2,name:'Other',nameKind:'custom',hidden:false,locked:false}],engineering:m.emptyEngineering()};
 project.heads[5].hidden=true;
 const pipe={id:'manual',kind:'pipe',type:'main',number:1,label:true,diameterMm:32,color:'#5d982d',points:points.map(p=>({...p}))};project.engineering.elements.manual=pipe;
 return {project,pipe,figureId};
}
function saved(p,pipe){return {...p,engineering:c.commitAutoConnections(p,{...p.engineering,elements:{...p.engineering.elements,[pipe.id]:pipe}})};}
const length=ps=>ps.slice(1).reduce((sum,p,i)=>sum+distance(p,ps[i]),0);
function nearestDistance(point,points){return Math.min(...points.slice(1).map((b,i)=>{const a=points[i],dx=b.x-a.x,dy=b.y-a.y,t=dx||dy?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy))):0;return Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);}));}
function sameGeometry(original,actual){
 assert.deepEqual(actual[0],original[0]);assert.deepEqual(actual.at(-1),original.at(-1));let index=-1;
 for(const p of original){index=actual.findIndex((q,i)=>i>index&&close(p,q));assert.ok(index>=0,`original vertex retained in order: ${JSON.stringify(p)}`);}
 for(const p of actual)assert.ok(nearestDistance(p,original)<1e-6,`added tee lies on original line: ${JSON.stringify(p)}`);
 assert.ok(Math.abs(length(actual)-length(original))<1e-6,'binding does not add, shorten or redirect a main segment');
}
function verifyHeads(project,original,bound,{direct=false}={}){
 if(direct)sameGeometry(original.points,bound.points);assert.deepEqual(bound.points[0],original.points[0],'the supply anchor stays fixed');assert.equal(bound.type,original.type);assert.equal(bound.diameterMm,original.diameterMm);assert.equal(bound.color,original.color);assert.equal(bound.auto.sizing,'manual');assert.ok([0,.5].includes(bound.auto.insetM));assert.equal(bound.auto.headStartIndex,0);assert.equal(bound.auto.circuit,'zone:1');assert.equal(bound.auto.networkCircuit,original.auto?.networkCircuit??original.auto?.circuit??'main');
 const links=c.autoConnections(saved(project,bound)),selected=project.heads.filter(h=>h.zone===1);assert.deepEqual(bound.auto.consumerIds.slice().sort(),selected.map(h=>'head:'+h.id).sort());
 for(const head of selected){const id='head:'+head.id,link=links.get(id),index=bound.auto.consumerNodes[id];assert.ok(link,id);assert.equal(link.pipeId,bound.id);assert.ok(Number.isInteger(index)&&index>=0&&index<bound.points.length);assert.deepEqual(link.point,bound.points[index]);if(direct)assert.ok(Math.abs(link.distance-nearestDistance(head,original.points))<1e-6,`${id}: nearest point over the entire existing pipe`);}
 for(const head of project.heads.filter(h=>h.zone!==1))assert.notEqual(links.get('head:'+head.id)?.pipeId,bound.id,'another zone is never captured');
 return saved(project,bound);
}

test('boundary alignment accepts near, far, outside and paving supplies; no-figure routes stay exactly drawn',()=>{
 for(const points of [near,far,outside,[...near.slice(0,4),near[3],...near.slice(4)]])for(const noFigure of [false,true]){
  const {project,pipe}=fixture(points,{noFigure}),snapshot=JSON.stringify(project),result=b.bindPipeToZone(project,pipe,1);assert.ok(result.pipe,result.error);verifyHeads(project,pipe,result.pipe,{direct:noFigure});assert.equal(JSON.stringify(project),snapshot);if(!noFigure&&points!==outside)assert.deepEqual(result.pipe.points.slice(0,4),pipe.points.slice(0,4),'long supply over paving is retained');
 }
 const {project,pipe}=fixture(outside,{paving:false});project.drawing=cad.addPointShape(project.drawing,xy([[-20,-4],[-12,-4],[-12,27],[-20,27]]),'lawn');const result=b.bindPipeToZone(project,pipe,1);assert.ok(result.pipe,result.error);verifyHeads(project,pipe,result.pipe);
});

test('reversing the manual line or figure winding preserves the supply anchor and consumer ownership',()=>{
 const first=fixture(),reverse=fixture([...near].reverse(),{reverseBoundary:true}),a=b.bindPipeToZone(first.project,first.pipe,1),z=b.bindPipeToZone(reverse.project,reverse.pipe,1);assert.ok(a.pipe&&z.pipe);verifyHeads(first.project,first.pipe,a.pipe);verifyHeads(reverse.project,reverse.pipe,z.pipe);assert.ok(!h.calculateEngineering(saved(reverse.project,z.pipe)).issues.includes('loop'));const winding=fixture(near,{reverseBoundary:true}),w=b.bindPipeToZone(winding.project,winding.pipe,1);assert.ok(w.pipe);assert.equal(w.pipe.auto.insetM,a.pipe.auto.insetM);for(const head of consumers)assert.ok(Math.abs(nearestDistance(head,w.pipe.points)-nearestDistance(head,a.pipe.points))<1e-6);
});

test('narrow lawns, holes and other figures cannot reject binding or move the existing supply',()=>{
 for(const type of ['building','pool','water','path']){const {project,pipe}=fixture();project.drawing=cad.addPointShape(project.drawing,xy([[-20,-4],[-3,-4],[-3,27],[-20,27]]),type);const result=b.bindPipeToZone(project,pipe,1);assert.ok(result.pipe,result.error);verifyHeads(project,pipe,result.pipe);}
 const {project,pipe}=fixture();project.drawing=cad.addPointShape(emptyDrawing(),xy([[0,0],[16,0],[16,.4],[0,.4]]),'lawn');const result=b.bindPipeToZone(project,pipe,1);assert.ok(result.pipe,result.error);verifyHeads(project,pipe,result.pipe,{direct:true});
 const holed=fixture();holed.project.drawing=cad.addPointShape(holed.project.drawing,xy([[9,5],[11,5],[11,7],[9,7]]),'lawn');const faces=Object.values(holed.project.drawing.faces),hole=faces.at(-1);faces[0].holes=[hole.outer];delete holed.project.drawing.faces[hole.id];const bound=b.bindPipeToZone(holed.project,holed.pipe,1);assert.ok(bound.pipe,bound.error);verifyHeads(holed.project,holed.pipe,bound.pipe);
});

test('existing ownership is atomic and repeated binding does not duplicate branches or move tees',()=>{
 const {project,pipe}=fixture(outside),result=b.bindPipeToZone(project,pipe,1);assert.ok(result.pipe,result.error);const p=verifyHeads(project,pipe,result.pipe),snapshot=JSON.stringify(p),again=b.bindPipeToZone(p,p.engineering.elements.manual,1);assert.ok(again.pipe,again.error);assert.deepEqual(again.pipe,result.pipe);
 assert.equal(b.bindPipeToZone(p,{...pipe,id:'competing'},1).error,'occupiedHead');assert.equal(JSON.stringify(p),snapshot);assert.equal(b.bindPipeToZone(project,pipe,42).error,'selectHeads');
});

function sharedMain(){
 const {project,pipe}=fixture(xy([[-8,12],[-8,0],[6,0],[18,0],[18,10]]));project.heads=[head('a',{x:2,y:4}),head('b',{x:12,y:4}),head('other-a',{x:6,y:-7},2),head('other-b',{x:8,y:-5},2)];
 project.engineering.elements.other={id:'other',kind:'pipe',type:'zonePipe',number:2,label:true,diameterMm:25,points:xy([[6,0],[6,-5],[8,-5]]),auto:{circuit:'zone:2',captureM:.5,headStartIndex:0,selection:'heads',consumerIds:['head:other-a','head:other-b'],consumerNodes:{'head:other-a':1,'head:other-b':2}}};
 const source=m.newEquipment(project.engineering,'inlet',pipe.points[0]);project.engineering.elements[source.id]=source;project.engineering.hydraulics={sourceId:source.id,inletPressureBar:.6,staticLiftM:0,additionalLossBar:0,operation:'sequential'};return {project,pipe};
}
test('binding a shared main preserves its source and existing zone, with correct sequential and simultaneous demand',()=>{
 const {project,pipe}=sharedMain(),prior=h.calculateEngineering(project),oldDuty=prior.duties.find(d=>d.circuit==='zone:2'),snapshot=JSON.stringify(project),result=b.bindPipeToZone(project,pipe,1);assert.ok(result.pipe,result.error);const p=verifyHeads(project,pipe,result.pipe,{direct:true}),hyd=h.calculateEngineering(p);assert.equal(JSON.stringify(project),snapshot);assert.deepEqual(p.engineering.hydraulics,project.engineering.hydraulics);assert.deepEqual(p.engineering.elements.other,project.engineering.elements.other);assert.deepEqual(hyd.source,pipe.points[0]);assert.deepEqual(hyd.connected.slice().sort(),project.heads.map(h=>'head:'+h.id).sort());assert.ok(hyd.ready,hyd.issues.join(','));
 const nextDuty=hyd.duties.find(d=>d.circuit==='zone:2');assert.equal(nextDuty.flow,oldDuty.flow);assert.equal(nextDuty.requiredBar,oldDuty.requiredBar);assert.ok(Math.abs(nextDuty.pipeLossM-oldDuty.pipeLossM)<1e-6);assert.ok(hyd.edges.filter(e=>e.pipeId===pipe.id&&!e.branch).every(e=>e.diameter===32));assert.equal(hyd.flow,Math.max(...hyd.duties.map(d=>d.flow)));
 const parallel=h.calculateEngineering({...p,engineering:{...p.engineering,hydraulics:{...p.engineering.hydraulics,operation:'simultaneous'}}});assert.ok(parallel.ready,parallel.issues.join(','));assert.equal(parallel.flow,hyd.duties.reduce((sum,d)=>sum+d.flow,0));
 const higherPressure=h.calculateEngineering({...p,engineering:{...p.engineering,hydraulics:{...p.engineering.hydraulics,inletPressureBar:1.2}}});assert.equal(higherPressure.flow,hyd.flow);assert.ok(higherPressure.headM<hyd.headM);assert.deepEqual(higherPressure.source,hyd.source);
});

test('fixed tee edits and network identity survive rebind, undo, redo and file reopen',()=>{
 const {project,pipe}=sharedMain(),bound=b.bindPipeToZone(project,pipe,1).pipe;assert.ok(bound);const index=bound.auto.consumerNodes['head:a'],moved={...bound,points:bound.points.map((p,i)=>i===index?{x:1,y:1}:p)},p=saved(project,moved),again=b.bindPipeToZone(p,p.engineering.elements.manual,1);assert.ok(again.pipe,again.error);assert.deepEqual(again.pipe.points,moved.points);assert.deepEqual(again.pipe.auto.consumerNodes,moved.auto.consumerNodes);assert.deepEqual(c.autoConnections(saved(p,again.pipe)).get('head:a').point,{x:1,y:1});
 const inserted=m.insertEngineeringNode(moved,1,{x:-8,y:6}),removed=m.removeEngineeringNode(inserted,1);assert.deepEqual(removed.points,moved.points);assert.deepEqual(removed.auto.consumerNodes,moved.auto.consumerNodes);assert.equal(removed.auto.networkCircuit,'main');
 store.setState({project,projects:[],past:[],future:[],pastOps:[],futureOps:[],workspaceSection:'engineering',tool:null,drawSub:'none',groupMemberId:null});store.getState().commitEngineering(p.engineering);const expected=structuredClone(store.getState().project.engineering);store.getState().undo();assert.deepEqual(store.getState().project.engineering,project.engineering);store.getState().redo();assert.deepEqual(store.getState().project.engineering,expected);const reopened=file.parseProjectFile(JSON.stringify(file.toProjectFile({project:store.getState().project}))).project;assert.deepEqual(reopened.engineering,expected);assert.equal(reopened.engineering.elements.manual.auto.networkCircuit,'main');
});

test('extending a bound manual route keeps the saved prefix and remaps a new tee on any part of the original line',()=>{
 const {project,pipe}=sharedMain(),bound=b.bindPipeToZone(project,pipe,1).pipe;assert.ok(bound);const p=saved(project,bound),withHead={...p,heads:[...p.heads,head('new',{x:10,y:4})]},nextPoint={x:20,y:10},built=draft.buildAutoRoute(withHead,{steps:[...bound.points,nextPoint].map(point=>({point})),baseHeadIds:['a','b','new'],waypoints:true,established:true},pipe.id);assert.ok(!built.error,built.error);sameGeometry([...bound.points,nextPoint],built.points);for(const id of ['head:a','head:b'])assert.deepEqual(built.points[built.consumerNodes[id]],bound.points[bound.auto.consumerNodes[id]]);assert.ok(built.consumerNodes['head:b']>bound.auto.consumerNodes['head:b']);assert.deepEqual(built.points[built.consumerNodes['head:new']],{x:10,y:0});assert.equal(built.headStartIndex,0);assert.equal(built.insetM,0);
});

test('binding a saved automatic lateral preserves its physical channel and diameter while allowing boundary alignment',()=>{
 const {project,pipe}=fixture(far);pipe.type='zonePipe';pipe.auto={circuit:'zone:1',captureM:.5,sizing:'auto',selection:'heads',consumerIds:[],insetM:.5,headStartIndex:3};const result=b.bindPipeToZone(project,pipe,1);assert.ok(result.pipe,result.error);verifyHeads(project,pipe,result.pipe);assert.equal(result.pipe.auto.networkCircuit,'zone:1');
});

test('native before and after draw the actual aligned hydraulic route, retained supply and thin branches',async()=>{
 const directory=process.env.ENGINEERING_REBUILD_QA_DIR;if(!directory)return;await mkdir(directory,{recursive:true});const {project,pipe}=fixture();project.engineering.hydraulics={inletPressureBar:1,staticLiftM:0,additionalLossBar:0};project.engineering.elements.other={id:'other',kind:'pipe',type:'zonePipe',number:2,label:true,diameterMm:25,points:[pipe.points[0],...xy([[-7,25],[-7,18],[-7,9],[-7,2]])],auto:{circuit:'zone:2',captureM:.5,selection:'heads',consumerIds:['head:other0','head:other1','head:other2'],consumerNodes:{'head:other0':4,'head:other1':3,'head:other2':2}}};const result=b.bindPipeToZone(project,pipe,1);assert.ok(result.pipe,result.error);assert.equal(result.pipe.auto.insetM,.5,'the visual example must exercise alignment');assert.deepEqual(result.pipe.points.slice(0,4),pipe.points.slice(0,4));const p=verifyHeads(project,pipe,result.pipe),hyd=h.calculateEngineering(p),px=13,panX=220,panY=78;assert.ok(hyd.ready,hyd.issues.join(','));assert.deepEqual(hyd.connected.slice().sort(),project.heads.map(h=>'head:'+h.id).sort());assert.ok(!hyd.issues.includes('loop'));
 const polygon=ps=>ps.map(p=>`${p.x},${p.y}`).join(' '),background=React.createElement(React.Fragment,null,React.createElement('polygon',{points:polygon(xy([[-20,-4],[-3,-4],[-3,27],[-20,27]])),fill:'#dce0df',stroke:'#929e99',strokeWidth:1/px}),React.createElement('polygon',{points:polygon(outline),fill:'#e8f4e9',stroke:'#657a6d',strokeWidth:1/px}));const heads=React.createElement(EngineeringSprinklers,{project,focus:null,onFocus(){},px,selectable:false});
 const after=React.createElement(React.Fragment,null,React.createElement(AutoPipeDrawing,{edges:hyd.edges.filter(e=>e.pipeId==='manual'),px,selected:false,color:'#00b83b',units:units.METRIC_UNITS,label:true}),...result.pipe.points.map((p,i)=>React.createElement('circle',{key:i,cx:p.x,cy:p.y,r:2.5/px,fill:'white',stroke:'#e8892f',strokeWidth:1/px})));
 const canvas=createCanvas(1060,520),ctx=canvas.getContext('2d');ctx.fillStyle='#f5f8fa';ctx.fillRect(0,0,canvas.width,canvas.height);
 for(let i=0;i<2;i++){const title=i?'After · boundary aligned, supply retained':'Before · complete manual route',tree=React.createElement('svg',{xmlns:'http://www.w3.org/2000/svg',width:530,height:520},React.createElement('g',{transform:`translate(${panX} ${panY}) scale(${px})`},background,i?after:React.createElement('polyline',{points:polygon(pipe.points),fill:'none',stroke:'#6e9a2e',strokeWidth:4/px}),heads));const svg=renderToStaticMarkup(tree),raster=svg.replaceAll('fill="transparent"','fill="#000000" fill-opacity="0"').replaceAll('stroke="transparent"','stroke="#000000" stroke-opacity="0"');ctx.drawImage(await loadImage(Buffer.from(raster)),i*530,0);ctx.fillStyle='#30463c';ctx.font='17px sans-serif';ctx.fillText(title,i*530+14,25);await writeFile(resolve(directory,i?'bound.svg':'manual.svg'),svg);}
 await writeFile(resolve(directory,'engineering-zone-binding.png'),canvas.toBuffer('image/png'));
});
