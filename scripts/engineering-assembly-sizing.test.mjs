import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {createServer} from 'vite';
let server,a,e,s,p,i,u,m,ex,ui,water,hydro,file,store;
before(async()=>{server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});const load=path=>server.ssrLoadModule('/src/'+path);[a,e,s,p,i,u,m,ex,ui,water,hydro,file,{useProject:store}]=await Promise.all(['lib/engineering-assembly.ts','lib/engineering.ts','lib/engineering-assembly-sizing.ts','lib/project-types.ts','lib/i18n.ts','lib/units.ts','lib/engineering-materials.ts','lib/export-plan.ts','components/designer/engineering-assembly.tsx','lib/irrigation-water-recommendations.ts','lib/engineering-hydraulics.ts','lib/project-file.ts','lib/project-store.ts'].map(load));});
after(async()=>server.close());
const pipe=(id,points,circuit)=>({id,kind:'pipe',type:circuit==='main'?'main':'zonePipe',points:points.map(([x,y])=>({x,y})),auto:{circuit,captureM:.5},diameterMm:32,number:1,label:true});
const consumer=(id,x,y,zoneId,flowLpm)=>({id,kind:'equipment',type:'waterOutlet',x:x+.5,y,size:1,rotation:0,zoneId,flowLpm,pressureBar:2,number:1,label:true});
function fixture(routes=false){const base=p.emptyProject(),item=e.newEquipment(e.emptyEngineering(),'assembly',{x:-4,y:0}),elements={[item.id]:item,c1:consumer('c1',5,10,1,20),c2:consumer('c2',15,0,2,15)};if(routes){for(const route of [pipe('main',[[0,0],[5,0],[10,0]],'main'),pipe('a',[[5,0],[5,10]],'zone:1'),pipe('b',[[5,0],[15,0]],'zone:2')])elements[route.id]=route;}
 return {...base,zones:Array.from({length:6},(_,i)=>({id:i+1,name:'Zone '+(i+1),nameKind:'custom',hidden:false,locked:false})),engineering:{version:1,elements,categories:{},hydraulics:{staticLiftM:0,additionalLossBar:0,inletPressureBar:0,tankRuntimeMin:10,tankReservePct:20,operation:'sequential'}}};}
const raw=project=>Object.values(project.engineering.elements).find(e=>e.type==='assembly').assembly;
const node=(assembly,type)=>assembly.nodes.find(n=>n.type===type);
function current(project){return s.resolveAssembly(raw(project),project);}
test('tank, pump and filter share the irrigation recommendation and hydraulic calculation, including operation mode and reserves',()=>{
 const preliminary=fixture(),rec=water.irrigationWaterRecommendations(preliminary),shown=current(preliminary);
 assert.equal(node(shown,'tank').volumeL,Math.ceil(rec.capacityL));assert.equal(rec.capacityL,420);assert.equal(node(shown,'pump').flowLpm,20);assert.equal(node(shown,'pump').headM,undefined);assert.equal(node(shown,'controller').zones,6);assert.equal(node(shown,'filter').capacityLpm,24);assert.equal(node(shown,'filter').inletDnMm,s.requiredFilterDn(20));
 const connected=fixture(true),h=hydro.calculateEngineering(connected);assert.ok(h.ready,h.issues.join(','));const calculated=current(connected);assert.equal(node(calculated,'pump').flowLpm,h.flow);assert.equal(node(calculated,'pump').headM,h.headM);assert.equal(node(calculated,'tank').volumeL,420);
 connected.engineering.hydraulics.operation='simultaneous';assert.equal(node(current(connected),'pump').flowLpm,35);assert.equal(node(current(connected),'filter').capacityLpm,42);assert.equal(node(current(connected),'tank').volumeL,420,'tank uses the complete cycle, not only peak flow');
 connected.engineering.hydraulics.operation='selected';connected.engineering.hydraulics.simultaneousZoneIds=[2];assert.equal(node(current(connected),'pump').flowLpm,15);assert.equal(node(current(connected),'tank').volumeL,420);
 connected.engineering.hydraulics.tankReservePct=30;assert.equal(node(current(connected),'tank').volumeL,455);
});
test('missing calculation inputs never fall back to the former 2000 litre / 60 lpm / 40 m placeholders',()=>{
 const project=fixture();delete project.engineering.elements.c1.flowLpm;const shown=current(project);assert.equal(node(shown,'tank').volumeL,undefined);assert.equal(node(shown,'pump').flowLpm,undefined);assert.equal(node(shown,'pump').headM,undefined);assert.equal(node(shown,'filter').inletDnMm,undefined);
});
test('2, 6 and 128 outlet manifolds have exactly matching picture ports, linked valve cards and BOM quantities, without duplicate children on reopen',()=>{
 const project=fixture(true),assembly=raw(project),manifold=node(assembly,'manifold');
 for(const count of [2,6,128,6,2]){manifold.outlets=count;const shown=current(project),valves=shown.nodes.filter(n=>n.manifoldId===manifold.id);assert.equal(valves.length,count);assert.equal(shown.links.filter(l=>l.id.startsWith(manifold.id+':branch:')).length,count);assert.equal(new Set(valves.map(n=>n.id)).size,count);
  const markup=renderToStaticMarkup(React.createElement('svg',{},React.createElement(ui.AssemblyDrawing,{assembly:shown,units:u.METRIC_UNITS})));assert.equal((markup.match(/data-manifold-outlet=/g)||[]).length,count);assert.equal((markup.match(/data-assembly-art="valve"/g)||[]).length,count);assert.ok(markup.includes('data-manifold-art="bare"'));
  const rows=m.engineeringMaterials(project,u.METRIC_UNITS).rows;assert.equal(rows.filter(r=>r.key.startsWith('assembly:valve:')).reduce((sum,r)=>sum+r.qty,0),count);assert.equal(rows.find(r=>r.key.startsWith('assembly:manifold:')).qty,1);
  assert.ok(a.validEngineeringAssembly(shown));assert.deepEqual(s.resolveAssembly(shown,project),shown);
  for(const v of valves){const pos=s.assemblyNodePosition(v,shown);assert.ok(pos.x>=54&&pos.x<=1500-54);assert.ok(pos.y+55<s.assemblyDiagramHeight(shown));const id=manifold.id+':branch:'+v.outletIndex,part=markup.slice(markup.indexOf('data-assembly-link="'+id+'"')),d=part.match(/<path d="([^"]+)"/)[1];assert.equal(Number(d.match(/V([\d.]+)$/)[1]),pos.y-55,'arrow terminates above the small valve card, not behind its image');}
 }
});
test('controller defaults track project zones and an explicit override survives recalculation; automatic valve model edits and control links persist',()=>{
 const project=fixture(),assembly=raw(project),controller=node(assembly,'controller');controller.controllerManual=true;controller.zones=12;assert.equal(node(current(project),'controller').zones,12);controller.controllerManual=false;project.zones.pop();assert.equal(node(current(project),'controller').zones,5);
 let shown=current(project),valve=shown.nodes.find(n=>n.manifoldId);valve.model='Chosen valve';shown=a.connectAssembly(shown,controller.id,valve.id,'control');const next=s.resolveAssembly(shown,project);assert.equal(next.nodes.find(n=>n.id===valve.id).model,'Chosen valve');assert.ok(next.links.some(l=>l.to===valve.id&&l.kind==='control'));
});
test('estimate screen and common HTML/PDF/XLSX data share one expanded BOM with pump manufacturer and SI values; undo and file loading preserve it',()=>{
 const project=fixture(true),item=Object.values(project.engineering.elements).find(e=>e.type==='assembly');node(item.assembly,'pump').manufacturer='My pump factory';node(item.assembly,'manifold').outlets=6;item.assembly=current(project);
 const rows=m.engineeringMaterials(project,u.METRIC_UNITS).rows.filter(r=>r.key.startsWith('assembly:'));for(const type of ['tank','pump','filter','treatment','manifold','controller','valve'])assert.ok(rows.some(r=>r.key.startsWith('assembly:'+type+':')),type);assert.ok(rows.find(r=>r.key.startsWith('assembly:pump:')).name.includes('My pump factory'));assert.equal(rows.find(r=>r.key.startsWith('assembly:valve:')).qty,6);
 store.setState({units:u.METRIC_UNITS});const lines=ex.estimateLines(project);for(const row of rows){const match=lines.find(r=>r.name===row.name);assert.ok(match,row.name);assert.equal(match.qty,row.qty);}
 store.setState({project:p.emptyProject(),projects:[],past:[],future:[],pastOps:[],futureOps:[]});store.getState().commitEngineering(project.engineering);const committed=structuredClone(store.getState().project.engineering);store.getState().undo();assert.equal(store.getState().project.engineering,undefined);store.getState().redo();assert.deepEqual(JSON.parse(JSON.stringify(store.getState().project.engineering)),JSON.parse(JSON.stringify(committed)));
 const reopened=file.parseProjectFile(JSON.stringify(file.toProjectFile({project}))).project;assert.deepEqual(m.engineeringMaterials(reopened,u.METRIC_UNITS).rows, m.engineeringMaterials(project,u.METRIC_UNITS).rows);
});
test('updated labels, bare manifold artwork, calculated specifications and BOM render in all 20 languages and native SI / customary units',async()=>{
 const project=fixture(true),assembly=current(project),height=s.assemblyDiagramHeight(assembly);
 for(const{id:locale}of i.LOCALES){i.setActiveLocale(locale);for(const units of [u.METRIC_UNITS,{...u.METRIC_UNITS,pipe:'in',flow:'gpm',length:'ft',pressure:'psi'}]){const svg=renderToStaticMarkup(React.createElement('svg',{},React.createElement(ui.AssemblyDrawing,{assembly,units})));assert.doesNotMatch(svg,/assembly\.[a-z]|engineering\.[a-z]/);assert.ok(m.engineeringMaterials(project,units).rows.some(r=>r.key.startsWith('assembly:filter:')));}}
 i.setActiveLocale('ru');let svg=renderToStaticMarkup(React.createElement('svg',{xmlns:'http://www.w3.org/2000/svg',xmlnsXlink:'http://www.w3.org/1999/xlink',width:1500,height,viewBox:`0 0 1500 ${height}`},React.createElement(ui.AssemblyDrawing,{assembly,units:u.METRIC_UNITS})));
 const images=new Map();for(const match of svg.matchAll(/href="(\/engineering\/assembly\/[^\"]+)"/g)){const path=match[1];if(images.has(path))continue;const img=await loadImage(await readFile('public'+path)),c=createCanvas(img.width,img.height);c.getContext('2d').drawImage(img,0,0);images.set(path,'data:image/png;base64,'+c.toBuffer('image/png').toString('base64'));}for(const[path,data]of images)svg=svg.replaceAll(path,data);
 const canvas=createCanvas(1500,height),ctx=canvas.getContext('2d');ctx.drawImage(await loadImage(Buffer.from(svg.replaceAll('stroke="transparent"','stroke="#000000" stroke-opacity="0"'))),0,0);
 // Offline SVG parser omits image elements; use exactly the emitted artwork geometry.
 for(const match of svg.matchAll(/data-assembly-node="[^\"]+" transform="translate\(([^ ]+) ([^)]+)\)"([\s\S]*?)(?=<g data-assembly-node|<\/svg>)/g))for(const img of match[3].matchAll(/<image[^>]+href="(data:image\/png;base64,[^\"]+)"[\s\S]*? x="([^\"]+)" y="([^\"]+)" width="([^\"]+)" height="([^\"]+)" preserveAspectRatio="([^\"]+)"/g)){
  const image=await loadImage(Buffer.from(img[1].split(',')[1],'base64')),ratio=Math.min(Number(img[4])/image.width,Number(img[5])/image.height),w=img[6]==='none'?Number(img[4]):image.width*ratio,h=img[6]==='none'?Number(img[5]):image.height*ratio;ctx.drawImage(image,Number(match[1])+Number(img[2])+(Number(img[4])-w)/2,Number(match[2])+Number(img[3])+(Number(img[5])-h)/2,w,h);
 }
 await writeFile('/private/tmp/assembly-sizing-review.png',canvas.toBuffer('image/png'));await writeFile('/private/tmp/assembly-sizing-review.svg',svg);i.setActiveLocale('en');
});

test('well lift augments the same network head once, missing depth stays unknown, and filter flow remains demand-based',()=>{
 const project=fixture(true),assembly=raw(project),pump=node(assembly,'pump'),well=a.newAssemblyNode('well');assembly.nodes.push(well);pump.wellId=well.id;
 const base=hydro.calculateEngineering(project).headM;
 assert.equal(node(current(project),'pump').headM,undefined);
 well.depthM=60;assert.equal(node(current(project),'pump').headM,base+60);assert.equal(node(current(project),'pump').wellPreliminary,true);
 well.dynamicLevelM=25;well.wellLossM=3;let shown=current(project);assert.equal(node(shown,'pump').headM,base+28);assert.equal(node(shown,'pump').wellPreliminary,false);assert.equal(node(shown,'filter').capacityLpm,24);
 assert.equal(node(s.resolveAssembly(shown,project),'pump').headM,base+28);
 pump.wellId=undefined;assert.equal(node(current(project),'pump').headM,base);
 well.dynamicLevelM=61;assert.equal(a.validEngineeringAssembly(assembly),false);well.dynamicLevelM=25;assert.ok(a.validEngineeringAssembly(assembly));
});
test('every generated valve gets one controller wire and the controller sits below all valves after outlet changes',()=>{
 const project=fixture(),assembly=raw(project),manifold=node(assembly,'manifold');
 for(const count of [2,6,12,2]){manifold.outlets=count;const shown=current(project),controller=node(shown,'controller'),valves=shown.nodes.filter(n=>n.type==='valve');
  assert.equal(shown.links.filter(l=>l.kind==='control').length,count);
  for(const v of valves){assert.equal(shown.links.filter(l=>l.from===controller.id&&l.to===v.id&&l.kind==='control').length,1);assert.ok(s.assemblyNodePosition(controller,shown).y-145>s.assemblyNodePosition(v,shown).y+55);}
  assert.deepEqual(s.resolveAssembly(shown,project),shown);
 }
});
