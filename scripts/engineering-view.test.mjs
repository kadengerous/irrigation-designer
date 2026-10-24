import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {createServer,transformWithEsbuild} from 'vite';
let server,load;
before(async()=>{server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});load=p=>server.ssrLoadModule('/src/'+p);});
after(async()=>server.close());
const head=(id,zone,x=0)=>({id,zone,x,y:0,catalogId:'MP1000-90',nozzleId:'MP1000-90',r:4,arc:180,start:0,bodyId:'PRS40',designPressure:2.8,popUpMm:100,locked:false,needsReview:false});
const walk=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(walk):[node,...walk(node.props?.children)];

test('engineering-only presentation preserves all data and filters every head-linked dimension',async()=>{
 const {engineeringPlanDrawing,ENGINEERING_BACKGROUND}=await load('lib/engineering-view.ts'),{emptyDrawing}=await load('lib/cad/types.ts');
 const dim=(id,extra={})=>({id,a:{x:0,y:0},b:{x:5,y:0},offset:1,...extra});
 const drawing={...emptyDrawing(),dims:{plan:dim('plan'),manual:dim('manual',{aHeadId:'h'}),auto:dim('auto:heads:a:b'),inside:dim('inside',{autoKey:'irrigation:figure:inside:h:x'})}};
 const before=JSON.stringify(drawing),view=engineeringPlanDrawing(drawing);
 assert.deepEqual(Object.keys(view.dims),['plan']);assert.equal(JSON.stringify(drawing),before);
 assert.equal(view.faces,drawing.faces);assert.equal(view.layers,drawing.layers);
 assert.ok(ENGINEERING_BACKGROUND.plants>=.35&&ENGINEERING_BACKGROUND.plants<=.5);
 assert.ok(ENGINEERING_BACKGROUND.furniture>ENGINEERING_BACKGROUND.plants);
 const source=await readFile('src/components/designer/design-canvas.tsx','utf8');
 assert.match(source,/!engineeringBase&&workspace.showIrrigation\?visibleProjectHeads/);
 assert.match(source,/!engineeringBase && s.showCoverage/);
 assert.match(source,/materialOpacity=\{engineeringBase\?ENGINEERING_BACKGROUND.materials:1\}/);
 assert.match(source,/paint="fill" passThrough/);assert.match(source,/paint="outline"/);
});

test('zone rows toggle one active zone; individual selection marks its zone without selecting its other heads',async()=>{
 const {emptyProject}=await load('lib/project-types.ts'),{EngineeringZones}=await load('components/designer/engineering-zones.tsx'),{engineeringHeadEmphasis,engineeringFocusZone}=await load('lib/engineering-view.ts');
 let project={...emptyProject(),heads:[head('a',1),head('b',1),head('c',2)],zones:[{id:1,name:'One',nameKind:'custom',hidden:false,locked:false},{id:2,name:'Two',nameKind:'custom',hidden:true,locked:true}]};
 const snapshot=JSON.stringify(project);let focus=null,expanded=['irrigationZones','zone:1','zone:2'];
 const {ZoneLayerRow}=await load('components/designer/zone-list.tsx');
 const units={length:'m',area:'m2',flow:'lpm',pressure:'bar',pipe:'mm'};
 const nodes=()=>walk(EngineeringZones({project,focus,onFocus:v=>focus=v,expanded,units,locale:'en',onToggle:key=>expanded=expanded.includes(key)?expanded.filter(v=>v!==key):[...expanded,key]}));
 const zoneButtons=()=>nodes().filter(n=>n.type===ZoneLayerRow);
 zoneButtons()[0].props.onSelect();assert.deepEqual(focus,{kind:'zone',id:1});
 assert.equal(engineeringHeadEmphasis(project.heads[0],focus).active,true);assert.equal(engineeringHeadEmphasis(project.heads[1],focus).active,true);assert.equal(engineeringHeadEmphasis(project.heads[2],focus).opacity,.45);
 zoneButtons()[1].props.onSelect();assert.deepEqual(focus,{kind:'zone',id:2});zoneButtons()[1].props.onSelect();assert.equal(focus,null);
 zoneButtons()[0].props.onSelectHead('a');
 assert.deepEqual(focus,{kind:'head',id:'a'});assert.equal(engineeringFocusZone(project.heads,focus),1);
 assert.equal(engineeringHeadEmphasis(project.heads[1],focus).active,false);
 assert.ok(zoneButtons().every(n=>n.props.readOnly&&n.props.editableHeads));
 assert.equal(JSON.stringify(project),snapshot,'navigation must not edit heads, zones or visibility flags');
 project={...project,heads:[{...project.heads[0],zone:2},project.heads[2]],zones:[project.zones[1]]};
 assert.equal(engineeringFocusZone(project.heads,focus),2);assert.equal(zoneButtons().length,1);
 const React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const markup=renderToStaticMarkup(React.createElement(EngineeringZones,{project,focus,onFocus(){},expanded,units,locale:'en',onToggle(){}}));
 assert.match(markup,/irrigation-layer-row/);assert.match(markup,/zone-color-marker/);assert.match(markup,/zone-demand/);
 assert.ok(!/layer-delete-direct/.test(markup),'zone deletion is absent, head details are initially collapsed');
 assert.match(markup,/zone-head-grip/,'same transferable head cards as Irrigation');
 assert.equal((markup.match(/data-kind="head"/g)||[]).length,2,'uses current heads after move and delete');
 assert.match(markup,/data-zone-drop-id="2"/,'zones accept pointer drops');
});

test('engineering sprinkler visibility follows zone and head eye controls, with matching rings and no sectors',async()=>{
 const React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server'),{EngineeringSprinklers}=await load('components/designer/engineering-zones.tsx'),{emptyProject}=await load('lib/project-types.ts');
 const {engineeringZoneColor:zoneColor}=await load('lib/engineering-view.ts');
 const {zoneColor:irrigationColor}=await load('lib/project-types.ts');
 assert.equal(zoneColor,irrigationColor,'both modes share the same zone palette');
 assert.equal(zoneColor(1),'#00d43b');assert.equal(zoneColor(2),'#087cff');
 assert.equal(new Set(Array.from({length:20},(_,i)=>zoneColor(i+1))).size,20);
 const project={...emptyProject(),heads:[head('a',1),head('b',2,4)],zones:[{id:1,name:'First',hidden:false,locked:false},{id:2,name:'Second',hidden:false,locked:true}]};
 const markup=renderToStaticMarkup(React.createElement(EngineeringSprinklers,{project,focus:{kind:'head',id:'a'},onFocus(){},px:40,selectable:true}));
 assert.equal((markup.match(/data-engineering-head-id=/g)||[]).length,2);
 assert.ok(markup.includes(`stroke="${zoneColor(1)}"`));assert.ok(markup.includes(`stroke="${zoneColor(2)}"`));
 assert.ok(markup.includes('opacity="0.45"'));assert.ok(!/<path|<text|Z1|Z2/.test(markup));
 const hiddenProject={...project,heads:[project.heads[0],{...project.heads[1],hidden:true}],zones:[{...project.zones[0],hidden:true},project.zones[1]]};
 const hiddenMarkup=renderToStaticMarkup(React.createElement(EngineeringSprinklers,{project:hiddenProject,focus:null,onFocus(){},px:40,selectable:true}));
 assert.ok(!hiddenMarkup.includes('data-engineering-head-id='));
 const workspace=await readFile('src/components/designer/engineering-workspace.tsx','utf8');
 assert.ok(workspace.indexOf('<EngineeringSprinklers')<workspace.indexOf('{displayed.map'));
 assert.ok(workspace.indexOf('<EngineeringZones')<workspace.lastIndexOf("{(['equipment','networks']"));
});

test('captured canvas click selects a sprinkler read-only and an empty click clears focus',async()=>{
 const source=await readFile('src/components/designer/engineering-workspace.tsx','utf8');
 const {code}=await transformWithEsbuild(source.slice(source.indexOf(' const onDown='),source.indexOf(' const displayed=')),'handlers.ts',{loader:'ts'});
 let focus=null,chosen=null;const state={spaceDown:false,setPan(){}};
 const svg={setPointerCapture(){},hasPointerCapture(){return true},releasePointerCapture(){},getBoundingClientRect(){return{left:0,top:0}}};
 const target={closest:selector=>selector==='[data-engineering-head-id]'?{getAttribute:()=> 'h'}:null,getAttribute:()=>null};
 const env={useProject:{getState:()=>state},px:40,panX:0,panY:0,data:{elements:{},categories:{}},editableData:{elements:{},categories:{}},pinnedData:{elements:{},categories:{}},nodeMode:null,item:null,locked:false,setPanning(){},setHover(){},tool:null,pointers:{current:new Map()},pinch:{current:null},drag:{current:null},stage:{current:svg},point:(x,y)=>({x:x/40,y:y/40}),choose:id=>{chosen=id;focus=null;},focusHeads:v=>focus=v,setNode(){},setPreview(){},setSnap(){},snapped:p=>p,commit(){throw new Error('read-only sprinkler selection committed data');}};
 const handlers=()=>new Function(...Object.keys(env),'preview',code+';return {onDown,onMove,onUp};')(...Object.values(env),null);
 const event=target=>({button:0,pointerId:1,clientX:40,clientY:80,target,currentTarget:svg,preventDefault(){}});
 handlers().onDown(event(target));handlers().onUp(event(svg));assert.deepEqual(focus,{kind:'head',id:'h'});assert.equal(chosen,null);
 handlers().onDown(event({closest:()=>null,getAttribute:()=>null}));handlers().onUp(event(svg));assert.equal(focus,null);
});
