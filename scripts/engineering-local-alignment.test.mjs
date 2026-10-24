import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
let api;const output=resolve('node_modules/.cache/engineering-local-alignment-'+process.pid+'.mjs');
before(async()=>{
 await mkdir(resolve('node_modules/.cache'),{recursive:true});
 await build({stdin:{contents:`export * from './src/lib/engineering-zone-route';export * from './src/lib/engineering';export * from './src/lib/engineering-connections';export * from './src/lib/engineering-hydraulics';export * from './src/lib/cad/engine';export {emptyDrawing} from './src/lib/cad/types';export {emptyProject} from './src/lib/project-types';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',packages:'external',outfile:output,logLevel:'silent'});
 api=await import(pathToFileURL(output).href);
});
after(async()=>unlink(output).catch(()=>{}));
const xy=a=>a.map(([x,y])=>({x,y})),near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<1e-6;
function fixture(points,heads,outline=[[0,0],[10,0],[10,10],[0,10]]){
 const drawing=outline?api.addPointShape(api.emptyDrawing(),xy(outline),'lawn'):api.emptyDrawing(),figureId=Object.keys(drawing.faces)[0];
 const pipe={id:'manual',kind:'pipe',type:'main',number:1,label:true,diameterMm:32,points:xy(points)},project={...api.emptyProject(),drawing,heads:heads.map(([x,y],i)=>({id:'h'+i,x,y,figureId,zone:1,catalogId:'MP1000-90',nozzleId:'MP1000-90',r:4,arc:180,start:0,bodyId:'PRS40',designPressure:2.8,popUpMm:100})),zones:[{id:1,name:'One',hidden:false,locked:false}],engineering:{...api.emptyEngineering(),elements:{manual:pipe}}};return {project,pipe};
}
function bind(f){const r=api.bindPipeToZone(f.project,f.pipe,1);assert.ok(r.pipe,r.error);const project={...f.project,engineering:api.commitAutoConnections(f.project,{...f.project.engineering,elements:{...f.project.engineering.elements,manual:r.pipe}})},pipe=project.engineering.elements.manual,links=api.autoConnections(project);assert.equal(links.size,f.project.heads.length);assert.ok(!api.calculateEngineering(project).issues.includes('loop'));return {project,pipe,links};}
function repeat(r){const again=api.bindPipeToZone(r.project,r.pipe,1);assert.ok(again.pipe,again.error);assert.deepEqual(again.pipe,r.pipe);}

test('all boundary heads at one distant free endpoint append an open inset without altering any supply vertex',()=>{
 const f=fixture([[-30,20],[-30,-8],[-15,-8]],[[2,0],[8,0]]),r=bind(f);
 assert.deepEqual(r.pipe.points.slice(0,f.pipe.points.length),f.pipe.points);assert.equal(r.pipe.auto.insetM,.5);
 for(const link of r.links.values())assert.ok(Math.abs(link.point.y-.5)<1e-6);
 repeat(r);
});

test('one boundary head can offset a free tail, while a physical source remains fixed',()=>{
 const f=fixture([[-8,-8],[2,3],[2,0]],[[2,0]]),r=bind(f);
 assert.deepEqual(r.pipe.points.slice(0,2),f.pipe.points.slice(0,2));assert.ok(near(r.links.get('head:h0').point,{x:2,y:.5}));repeat(r);
 const source=fixture([[0,0],[0,0],[10,0]],[[0,0],[8,0]]),bound=bind(source);
 assert.deepEqual(bound.pipe.points.slice(0,2),source.pipe.points.slice(0,2));assert.equal(bound.links.get('head:h0').distance,0);assert.ok(near(bound.links.get('head:h1').point,{x:8,y:.5}));repeat(bound);
});

test('a supply passing exactly through boundary heads gets thin inset branches instead of zero-offset tees',()=>{
 const f=fixture([[-8,0],[2,0],[8,0],[12,0]],[[2,0],[8,0]]),r=bind(f);
 assert.deepEqual(r.pipe.points[0],f.pipe.points[0]);assert.deepEqual(r.pipe.points.at(-1),f.pipe.points.at(-1));
 for(const link of r.links.values()){assert.ok(Math.abs(link.point.y-.5)<1e-6);assert.ok(Math.abs(link.distance-.5)<1e-6);}repeat(r);
});

test('a tight figure or missing figure never prevents binding all selected consumers',()=>{
 for(const outline of [null,[[0,0],[10,0],[10,.4],[0,.4]]]){
  const f=fixture([[-20,-2],[-12,-2],[12,-2]],[[2,0],[8,0]],outline),r=bind(f);
  assert.equal(r.pipe.auto.insetM,0);assert.deepEqual(r.pipe.points[0],f.pipe.points[0]);assert.deepEqual(r.pipe.points.at(-1),f.pipe.points.at(-1));assert.ok(r.pipe.points.every(p=>Math.abs(p.y+2)<1e-6));repeat(r);
 }
});

test('an unconnected crossing cannot become a new hydraulic junction at the alignment splice',()=>{
 const f=fixture([[-8,0],[12,0]],[[5,0],[8,0]]);
 f.project.engineering.elements.other={...f.pipe,id:'other',number:2,points:xy([[-8,0],[-8,-2],[3,-2],[6,2]])};
 const r=bind(f);assert.equal(r.pipe.auto.insetM,0);assert.ok(r.pipe.points.every(p=>Math.abs(p.y)<1e-6));
});
