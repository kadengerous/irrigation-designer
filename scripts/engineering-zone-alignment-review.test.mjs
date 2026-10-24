import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createServer} from 'vite';
let server,bind,m,c,h,cad,emptyDrawing,emptyProject;
before(async()=>{server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});const load=p=>server.ssrLoadModule('/src/'+p);[bind,m,c,h,cad,{emptyDrawing},{emptyProject}]=await Promise.all(['lib/engineering-zone-route.ts','lib/engineering.ts','lib/engineering-connections.ts','lib/engineering-hydraulics.ts','lib/cad/engine.ts','lib/cad/types.ts','lib/project-types.ts'].map(load));});
after(async()=>server.close());
const xy=a=>a.map(([x,y])=>({x,y})),near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<1e-6;
const head=(id,[x,y],figureId,zone=1)=>({id,x,y,figureId,zone,catalogId:'MP1000-90',nozzleId:'MP1000-90',bodyId:'PRS40',designPressure:2.8,r:4,arc:180,start:0,popUpMm:100});
function fixture(heads=[[2,0],[8,0]],points=[[-8,-8],[-8,3],[0,3],[4,3],[8,3],[12,3]],noFigure=false){const drawing=noFigure?emptyDrawing():cad.addPointShape(emptyDrawing(),xy([[0,0],[10,0],[10,10],[0,10]]),'lawn'),figureId=Object.keys(drawing.faces)[0],pipe={id:'main',kind:'pipe',type:'main',number:1,label:true,diameterMm:32,color:'#398a38',points:xy(points)},project={...emptyProject(),drawing,heads:heads.map((p,i)=>head('h'+i,p,figureId)),zones:[{id:1,name:'One',hidden:false,locked:false},{id:2,name:'Two',hidden:false,locked:false}],engineering:{...m.emptyEngineering(),elements:{main:pipe}}};return {project,pipe};}
function commit(project,pipe){return {...project,engineering:c.commitAutoConnections(project,{...project.engineering,elements:{...project.engineering.elements,[pipe.id]:pipe}})};}
const length=ps=>ps.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-ps[i].x,p.y-ps[i].y),0);
function unchangedLine(old,next){assert.deepEqual(next[0],old[0]);assert.deepEqual(next.at(-1),old.at(-1));let at=-1;for(const p of old){at=next.findIndex((q,i)=>i>at&&near(p,q));assert.ok(at>=0);}assert.ok(Math.abs(length(old)-length(next))<1e-6);}
function result(f){const snapshot=JSON.stringify(f.project),r=bind.bindPipeToZone(f.project,f.pipe,1);assert.ok(r.pipe,r.error);assert.equal(JSON.stringify(f.project),snapshot);assert.equal(r.pipe.diameterMm,32);assert.equal(r.pipe.color,'#398a38');assert.equal(r.pipe.auto.networkCircuit,'main');const p=commit(f.project,r.pipe),links=c.autoConnections(p);for(const head of f.project.heads.filter(h=>h.zone===1)){const link=links.get('head:'+head.id);assert.ok(link);assert.deepEqual(link.point,p.engineering.elements.main.points[p.engineering.elements.main.auto.consumerNodes['head:'+head.id]]);}assert.ok(!h.calculateEngineering(p).issues.includes('loop'));return {pipe:p.engineering.elements.main,project:p,links};}

test('only the boundary span moves inward; the exact supply prefix and free suffix survive',()=>{
 const f=fixture(),r=result(f);assert.deepEqual(r.pipe.points.slice(0,3),f.pipe.points.slice(0,3));assert.deepEqual(r.pipe.points.at(-1),f.pipe.points.at(-1));assert.ok(r.pipe.points.some(p=>near(p,{x:8,y:3})),'original suffix splice stays');for(const id of ['head:h0','head:h1']){const link=r.links.get(id);assert.ok(Math.abs(link.point.y-.5)<1e-6);assert.ok(Math.abs(link.distance-.5)<1e-6);}assert.ok(r.pipe.points.some(p=>near(p,{x:2,y:.5}))&&r.pipe.points.some(p=>near(p,{x:8,y:.5})));
 const repeated=bind.bindPipeToZone(r.project,r.pipe,1);assert.ok(repeated.pipe,repeated.error);assert.deepEqual(repeated.pipe.points,r.pipe.points,'an already aligned route cannot creep inward again');
});

test('central heads never align a route; a central station separates boundary spans',()=>{
 for(const heads of [[[2,5],[8,5]],[[2,0],[5,5],[8,0]],[[2,.2],[8,0]]]){const f=fixture(heads),r=result(f);unchangedLine(f.pipe.points,r.pipe.points);for(const head of f.project.heads)assert.ok(Math.abs(r.links.get('head:'+head.id).point.y-3)<1e-6);}
 const f=fixture([[2,0],[8,0]],undefined,true),r=result(f);unchangedLine(f.pipe.points,r.pipe.points);
});

test('reverse draw direction preserves both endpoints and chooses the same inside boundary, without a hydraulic loop',()=>{
 const f=fixture(),r=result(fixture([[8,0],[2,0]],[...f.pipe.points].reverse().map(p=>[p.x,p.y])));assert.deepEqual(r.pipe.points[0],f.pipe.points.at(-1));assert.deepEqual(r.pipe.points.at(-1),f.pipe.points[0]);for(const link of r.links.values())assert.ok(Math.abs(link.point.y-.5)<1e-6);
});

test('a shared main keeps existing zone junctions and source connectivity when boundary alignment would displace them',()=>{
 const f=fixture();f.project.heads.push(head('other',[5,14],undefined,2));f.project.engineering.elements.other={id:'other',kind:'pipe',type:'zonePipe',number:2,label:true,diameterMm:25,points:xy([[5,3],[5,12]]),auto:{circuit:'zone:2',captureM:1,selection:'heads',consumerIds:['head:other'],consumerNodes:{'head:other':1}}};const source=m.newEquipment(f.project.engineering,'inlet',f.pipe.points[0]);f.project.engineering.elements[source.id]=source;f.project.engineering.hydraulics={sourceId:source.id,inletPressureBar:1,additionalLossBar:0,staticLiftM:0};
 const r=result(f),hyd=h.calculateEngineering(r.project);assert.ok(r.pipe.points.slice(1).some((p,i)=>c.projectToSegment({x:5,y:3},r.pipe.points[i],p).distance<1e-7));assert.deepEqual(hyd.connected.slice().sort(),['head:h0','head:h1','head:other']);assert.ok(hyd.ready,hyd.issues.join(','));assert.deepEqual(hyd.source,f.pipe.points[0]);assert.deepEqual(r.project.engineering.elements.other.points,f.project.engineering.elements.other.points);assert.equal(r.links.get('head:other').pipeId,'other');
});

test('heads on a hole contour use its allowed outside offset, not the outer lawn perimeter',()=>{
 const f=fixture([[8,8],[12,8]],[[-4,6],[16,6]]);let drawing=cad.addPointShape(emptyDrawing(),xy([[0,0],[20,0],[20,20],[0,20]]),'lawn');drawing=cad.addPointShape(drawing,xy([[8,8],[12,8],[12,12],[8,12]]),'lawn');const faces=Object.values(drawing.faces);faces[0].holes=[faces[1].outer];delete drawing.faces[faces[1].id];f.project.drawing=drawing;f.project.heads.forEach(h=>h.figureId=faces[0].id);const r=result(f);for(const link of r.links.values()){assert.ok(Math.abs(link.point.y-7.5)<1e-6);assert.ok(Math.abs(link.distance-.5)<1e-6);}
});

test('alignment cannot create a second physical join to an existing main branch',()=>{
 const f=fixture();f.project.heads.push(head('other',[5,-1],undefined,2));f.project.engineering.elements.other={id:'other',kind:'pipe',type:'main',number:2,label:true,diameterMm:25,points:xy([[0,3],[0,.5],[5,.5]]),auto:{circuit:'zone:2',networkCircuit:'main',sizing:'manual',captureM:.5,selection:'heads',consumerIds:['head:other'],consumerNodes:{'head:other':2}}};const source=m.newEquipment(f.project.engineering,'inlet',f.pipe.points[0]);f.project.engineering.elements[source.id]=source;f.project.engineering.hydraulics={sourceId:source.id,inletPressureBar:1,additionalLossBar:0,staticLiftM:0};
 const before=h.calculateEngineering(f.project);assert.ok(!before.issues.includes('loop'));assert.ok(before.connected.includes('head:other'));const r=result(f),after=h.calculateEngineering(r.project);unchangedLine(f.pipe.points,r.pipe.points);assert.deepEqual(after.connected.slice().sort(),['head:h0','head:h1','head:other']);assert.ok(after.ready,after.issues.join(','));assert.deepEqual(after.source,before.source);assert.equal(after.duties.find(d=>d.circuit==='zone:2').flow,before.duties.find(d=>d.circuit==='zone:2').flow);
});
