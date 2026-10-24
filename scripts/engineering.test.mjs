import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {createServer,transformWithEsbuild} from 'vite';
let server,load;
before(async()=>{server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});load=p=>server.ssrLoadModule('/src/'+p);});
after(async()=>server.close());

test('engineering commits preserve all existing modes and survive undo, redo and project-file reopen',async()=>{
 const {useProject:s,projectHasContent}=await load('lib/project-store.ts'),{emptyProject}=await load('lib/project-types.ts');
 const {emptyEngineering,newEquipment}=await load('lib/engineering.ts');
 const {emptyDrawing}=await load('lib/cad/types.ts'),{addRect}=await load('lib/cad/engine.ts');
 const base={...emptyProject(),name:'Engineering QA',drawing:addRect(emptyDrawing(),{x:0,y:0},{x:10,y:8},'lawn')};
 s.setState({project:base,projects:[],past:[],future:[],pastOps:[],futureOps:[],workspaceSection:'engineering',tool:null,drawSub:'none',groupMemberId:null});
 const data=emptyEngineering(),pump=newEquipment(data,'pump',{x:3,y:4});data.elements[pump.id]=pump;
 data.elements.pipe={id:'pipe',kind:'pipe',type:'main',number:1,label:true,diameterMm:32,auto:{circuit:'zone:1',captureM:.5,consumerIds:[]},points:[{x:0,y:0},{x:3,y:4},{x:6,y:4}]};
 data.elements.cable={id:'cable',kind:'cable',number:1,label:true,cableType:'Test 2×1.5',points:[{x:1,y:2},{x:5,y:2}]};
 data.hydraulics={staticLiftM:3,additionalLossBar:.5,inletPressureBar:0,operation:'sequential'};
 s.getState().commitEngineering(data);
 const next=s.getState().project;
 for(const key of ['drawing','polygons','heads','zones','water'])assert.deepEqual(next[key],base[key],key);
 assert.equal(projectHasContent({...emptyProject(),engineering:data}),true);
 assert.equal(s.getState().projects[0].engineering,data,'uses the shared save path');
 s.getState().undo();assert.equal(s.getState().project.engineering,undefined);
 s.getState().redo();assert.deepEqual(s.getState().project.engineering,data);
 const {toProjectFile,parseProjectFile}=await load('lib/project-file.ts');
 const file=toProjectFile({project:next,showCoverage:true,showLabels:true,showGrid:true,snapOn:true,snapGridOn:true,gridStep:.5,measureUnit:'m',activeZoneId:1});
 const reopened=parseProjectFile(JSON.stringify(file));s.getState().importPacked(reopened.project,reopened);
 assert.deepEqual(s.getState().project.engineering,data);
});

test('routes use world lengths and snap to rotated ports, nodes and existing plan geometry',async()=>{
 const m=await load('lib/engineering.ts'),{emptyDrawing}=await load('lib/cad/types.ts'),{addRect}=await load('lib/cad/engine.ts');
 const data=m.emptyEngineering(),e=m.newEquipment(data,'manifold',{x:10,y:20});e.outlets=6;e.rotation=90;e.size=2;data.elements[e.id]=e;
 const ports=m.equipmentPorts(e);assert.equal(ports.length,7);assert.ok(Math.abs(ports[0].x-10)<1e-9);assert.equal(ports[0].y,19);
 const hit=m.snapEngineering({x:10.02,y:19.03},data,emptyDrawing(),100,true,true,.5);assert.deepEqual(hit.point,ports[0]);assert.equal(hit.hit,true);
 assert.equal(m.routeLength([{x:0,y:0},{x:3,y:4},{x:6,y:4}]),8);
 const moved=m.moveEngineering(e,2,3);assert.equal(moved.volumeL,e.volumeL);assert.deepEqual({x:moved.x,y:moved.y},{x:12,y:23});
 const plan=addRect(emptyDrawing(),{x:0,y:0},{x:5,y:5},'lawn');
 assert.deepEqual(m.snapEngineering({x:.02,y:.03},m.emptyEngineering(),plan,100,true,false,.5).point,{x:0,y:0});
 assert.deepEqual(m.snapEngineering({x:.02,y:.03},data,plan,100,false,false,.5).point,{x:.02,y:.03});
 const tank=m.newEquipment(data,'tank',{x:0,y:0});assert.equal({...tank,size:4}.volumeL,2000);
});

test('equipment handles resize and rotate around the installation point without changing technical data',async()=>{
 const {newEquipment,emptyEngineering,transformEngineeringEquipment:transform}=await load('lib/engineering.ts');
 const tank={...newEquipment(emptyEngineering(),'tank',{x:3,y:4}),size:2,rotation:350,volumeL:5000};
 const enlarged=transform(tank,{x:4,y:5},{x:5,y:6},'resize',40);
 assert.equal(enlarged.size,4);assert.equal(enlarged.volumeL,5000);assert.equal(enlarged.rotation,350);
 assert.deepEqual([enlarged.x,enlarged.y],[3,4]);assert.equal(tank.size,2);
 const rotated=transform(tank,{x:4,y:4},{x:3,y:5},'rotate',40);
 assert.equal(rotated.rotation,80);assert.equal(rotated.size,2);assert.equal(rotated.volumeL,5000);
 assert.deepEqual([rotated.x,rotated.y],[3,4]);
 assert.equal(transform(tank,{x:4,y:5},{x:3,y:4},'resize',40).size,.1);
 const {useProject:s}=await load('lib/project-store.ts'),{emptyProject}=await load('lib/project-types.ts');
 const data={...emptyEngineering(),elements:{[tank.id]:tank}};
 s.setState({project:{...emptyProject(),engineering:data},past:[],future:[],pastOps:[],futureOps:[]});
 s.getState().commitEngineering({...data,elements:{[tank.id]:enlarged}});
 s.getState().undo();assert.equal(s.getState().project.engineering.elements[tank.id].size,2);
 s.getState().redo();assert.equal(s.getState().project.engineering.elements[tank.id].size,4);
});

test('all equipment glyphs are distinct and every engineering key exists in all supported dictionaries',async()=>{
 const React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const {EngineeringThumb}=await load('components/designer/engineering-symbol.tsx'),{EQUIPMENT}=await load('lib/engineering.ts');
 const glyphs=EQUIPMENT.map(([type])=>renderToStaticMarkup(React.createElement(EngineeringThumb,{type})));
 assert.equal(new Set(glyphs).size,EQUIPMENT.length);
 const {LOCALES}=await load('lib/locale-config.ts');
 const en=JSON.parse(await readFile('src/lib/locales/en.json','utf8')),keys=Object.keys(en).filter(k=>k.startsWith('engineering.'));
 for(const locale of LOCALES){const code=typeof locale==='string'?locale:locale.id;const dict=JSON.parse(await readFile(`src/lib/locales/${code}.json`,'utf8'));for(const key of keys)assert.ok(dict[key],`${code} ${key}`);}
});

test('engineering workspace renders equipment and assembly together without missing UI strings',async()=>{
 const React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const {EngineeringWorkspace}=await load('components/designer/engineering-workspace.tsx');
 const markup=renderToStaticMarkup(React.createElement(EngineeringWorkspace,{}));
 assert.match(markup,/engineering-canvas/);assert.match(markup,/engineering-library/);
 assert.equal((markup.match(/viewBox="-55 -55 110 110"/g)||[]).length,6);
 assert.ok(!markup.includes('engineering.routeHint'));
});

test('pointer-captured equipment taps retain selection; node drags commit only their route; pinch cancels editing',async()=>{
 const {snapRouteNodeToNeighbors}=await load('components/designer/engineering-route-interaction.ts');
 const source=await readFile('src/components/designer/engineering-workspace.tsx','utf8');
 const code=(await transformWithEsbuild(source.slice(source.indexOf(' const onDown='),source.indexOf(' const displayed=')),'events.tsx',{loader:'tsx'})).code;
 let selection=null,node=null,preview=null,committed=null;const state={spaceDown:false,panX:0,panY:0,pxPerMeter:40,setPan(x,y){this.panX=x;this.panY=y;}};
 const data={elements:{route:{id:'route',kind:'pipe',points:[{x:0,y:0},{x:5,y:0},{x:8,y:2}]}},categories:{}};
 const target={closest:q=>q==='[data-engineering-id]'?{getAttribute:()=> 'route'}:q==='[data-node]'?{getAttribute:()=> '1'}:null,getAttribute:key=>key==='data-node'?'1':null};
 const svg={setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(){},getBoundingClientRect(){return {left:0,top:0};}};
 const env={useProject:{getState:()=>state,setState:patch=>Object.assign(state,patch)},px:40,panX:0,panY:0,data,editableData:data,pinnedData:data,project:{heads:[],engineering:data},nodeMode:null,item:null,locked:false,setPanning(){},setHover(){},tool:null,editing:null,pointers:{current:new Map()},pinch:{current:null},drag:{current:null},stage:{current:svg},point:(x,y)=>({x:x/40,y:y/40}),engineeringCategory:()=> 'pipelines',choose:id=>selection=id,setNode:n=>node=n,setPreview:v=>preview=v,setSnap:()=>{},snapped:p=>p,commit:e=>committed=e};
 const handlers=()=>new Function(...Object.keys(env),'preview','snapRouteNodeToNeighbors',code+';return {onDown,onMove,onUp};')(...Object.values(env),preview,snapRouteNodeToNeighbors);
 const event=(x,y,targetOverride=target)=>({button:0,pointerId:1,clientX:x,clientY:y,target:targetOverride,currentTarget:svg,preventDefault(){}});
 handlers().onDown(event(200,0));handlers().onUp(event(200,0,svg));assert.equal(selection,'route');assert.equal(node,1);
 handlers().onDown(event(200,0));handlers().onMove(event(240,80));handlers().onUp(event(240,80,svg));
 assert.deepEqual(committed.points,[{x:0,y:0},{x:6,y:2},{x:8,y:2}]);
 assert.deepEqual(data.elements.route.points,[{x:0,y:0},{x:5,y:0},{x:8,y:2}]);
 handlers().onDown(event(200,0));handlers().onDown({...event(300,0),pointerId:2});assert.equal(env.drag.current,null);assert.ok(env.pinch.current);assert.equal(preview,null);
});
