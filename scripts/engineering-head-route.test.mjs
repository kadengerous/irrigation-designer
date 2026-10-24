import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {createServer,transformWithEsbuild} from 'vite';
let server,load,r,a,c,cad,emptyDrawing,emptyProject,defaults,catalog;
before(async()=>{server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});load=p=>server.ssrLoadModule('/src/'+p);r=await load('lib/engineering-head-route.ts');a=await load('lib/engineering-auto-route-draft.ts');c=await load('lib/engineering-connections.ts');cad=await load('lib/cad/engine.ts');({emptyDrawing}=await load('lib/cad/types.ts'));({emptyProject}=await load('lib/project-types.ts'));({catalogHeadDefaults:defaults}=await load('lib/flow.ts'));catalog=(await load('lib/hunter-catalog.ts')).itemById('MP1000-90');});
after(async()=>server.close());
const xy=ps=>ps.map(([x,y])=>({x,y}));
function fixture(points,bounds=[[0,0],[10,0],[10,10],[0,10]]){
 const drawing=cad.addPointShape(emptyDrawing(),xy(bounds),'lawn'),figureId=Object.keys(drawing.faces)[0];
 return {...emptyProject(),drawing,heads:points.map(([x,y],i)=>({...defaults(catalog),catalogId:catalog.id,start:0,popUpMm:100,locked:false,needsReview:false,id:`h${i}`,x,y,zone:1,figureId})),engineering:{version:1,categories:{},elements:{}}};
}
function save(p,route,id='pipe'){
 assert.ok(!route.error,route.error);const pipe={id,kind:'pipe',type:'zonePipe',number:1,label:true,diameterMm:32,points:route.points,auto:{circuit:`zone:${route.zone}`,selection:'heads',...(route.waypoints?{pathMode:'waypoints'}:{}),consumerNodes:route.consumerNodes,captureM:route.waypoints?1:.5,insetM:.5,...(route.figureId?{figureId:route.figureId}:{}),headStartIndex:route.headStartIndex,consumerIds:route.headIds.map(id=>`head:${id}`)}};
 return {...p,engineering:c.commitAutoConnections(p,{...p.engineering,elements:{...p.engineering.elements,[id]:pipe}})};
}

test('straight chains offset exactly 0.5 m inward in either drawing direction',()=>{
 const p=fixture([[0,0],[5,0],[10,0]]),snapshot=JSON.stringify(p);
 const a=r.buildHeadRoute(p,['h0','h1','h2']),b=r.buildHeadRoute(p,['h2','h1','h0']);
 assert.deepEqual(a.points,xy([[0,.5],[5,.5],[10,.5]]));assert.deepEqual(b.points,[...a.points].reverse());assert.equal(JSON.stringify(p),snapshot);
 const right=fixture([[10,0],[10,10]]);assert.deepEqual(r.buildHeadRoute(right,['h0','h1']).points,xy([[9.5,0],[9.5,10]]));
});
test('corners join without gaps and follow a concave lawn instead of a bounding rectangle',()=>{
 const p=fixture([[0,0],[10,0],[10,10]]),a=r.buildHeadRoute(p,['h0','h1','h2']);assert.deepEqual(a.points,xy([[0,.5],[9.5,.5],[9.5,10]]));
 const q=fixture([[10,0],[10,4],[4,4],[4,10]],[[0,0],[10,0],[10,4],[4,4],[4,10],[0,10]]);
 const b=r.buildHeadRoute(q,['h0','h1','h2','h3']);assert.deepEqual(b.points,xy([[9.5,0],[9.5,3.5],[3.5,3.5],[3.5,10]]));
});
test('narrow lawns, tiny obstacles and holes reject impossible inward routes without changing the plan',()=>{
 const p=fixture([[0,0],[10,0]],[[0,0],[10,0],[10,.4],[0,.4]]);
 const q=fixture([[0,0],[10,0]]);q.drawing=cad.addPointShape(q.drawing,xy([[4,.499],[6,.499],[6,.501],[4,.501]]),'pool');
 const hole=fixture([[0,0],[10,0]]);hole.drawing=cad.addPointShape(hole.drawing,xy([[4,.4],[6,.4],[6,.6],[4,.6]]),'lawn');const f=Object.values(hole.drawing.faces);f[0].holes=[f[1].outer];delete hole.drawing.faces[f[1].id];
 const missing={...fixture([[0,0],[10,0]]),drawing:emptyDrawing()};
 for(const project of [p,q,hole]){const snapshot=JSON.stringify(project),route=r.buildHeadRoute(project,['h0','h1']);assert.equal(route.error,'routeOutside');assert.equal(JSON.stringify(project),snapshot);}
 const noPlan=r.buildHeadRoute(missing,['h0','h1']);assert.ok(!noPlan.error);assert.equal(c.autoConnections(save(missing,noPlan)).size,2);
 assert.deepEqual(r.buildHeadRoute(missing,['h0','h1']).points,xy([[0,.5],[10,.5]]));
});
test('routes cannot cross gaps between separate shapes or use stale figure IDs to escape boundaries',()=>{
 const p=fixture([[0,0],[10,0]]);p.drawing=cad.addPointShape(cad.addPointShape(emptyDrawing(),xy([[0,0],[4,0],[4,4],[0,4]]),'lawn'),xy([[8,0],[12,0],[12,4],[8,4]]),'lawn');
 const ids=Object.keys(p.drawing.faces);p.heads=p.heads.map((h,i)=>({...h,figureId:ids[i]}));
 const snapshot=JSON.stringify(p);assert.equal(r.buildHeadRoute(p,['h0','h1'],undefined,xy([[-3,2],[-3,0]])).error,'routeOutside');
 const stale={...p,heads:p.heads.map(h=>({...h,figureId:'deleted-plan-figure'}))};assert.equal(r.buildHeadRoute(stale,['h0','h1']).error,'routeOutside');
 const outside={...p,heads:p.heads.map(h=>({...h,y:-2}))};assert.equal(r.buildHeadRoute(outside,['h0','h1']).error,'routeOutside');
 assert.equal(r.buildHeadRoute(stale,['h1','h0']).error,'routeOutside');assert.equal(JSON.stringify(p),snapshot);
 const recovered=fixture([[0,0],[10,0]]);recovered.heads=recovered.heads.map(h=>({...h,figureId:'deleted-plan-figure'}));assert.deepEqual(r.buildHeadRoute(recovered,['h0','h1']).points,xy([[0,.5],[10,.5]]));
});
test('only selected heads attach; another zone or already-owned head is rejected; extension retains order',async()=>{
 let p=fixture([[0,0],[5,0],[10,0],[2,.5]]);const a=r.buildHeadRoute(p,['h0','h1']);p=save(p,a);
 assert.deepEqual([...c.autoConnections(p).keys()],['head:h0','head:h1']);assert.equal(r.buildHeadRoute(p,['h1','h2']).error,'occupiedHead');
 const b=r.buildHeadRoute(p,['h0','h1','h2'],'pipe');p=save(p,b);assert.deepEqual(p.engineering.elements.pipe.auto.consumerIds,['head:h0','head:h1','head:h2']);assert.ok(!c.autoConnections(p).has('head:h3'));
 const q=fixture([[0,0],[10,0]]);q.heads[1].zone=2;assert.equal(r.buildHeadRoute(q,['h0','h1']).error,'sameZone');
 const {useProject:s}=await load('lib/project-store.ts');const base=fixture([[0,0],[10,0]]);s.setState({project:base,projects:[],past:[],future:[],pastOps:[],futureOps:[]});const saved=save(base,r.buildHeadRoute(base,['h0','h1']));s.getState().commitEngineering(saved.engineering);s.getState().undo();assert.deepEqual(s.getState().project.engineering,base.engineering);s.getState().redo();assert.deepEqual(s.getState().project.engineering,saved.engineering);
 const {parseProjectFile,toProjectFile}=await load('lib/project-file.ts');assert.deepEqual(parseProjectFile(JSON.stringify(toProjectFile({project:saved}))).project.engineering,saved.engineering);
});
test('each selected sprinkler has a thin live branch and correct flexible takeoff at its actual offset',async()=>{
 const p=fixture([[0,0],[5,0],[10,0],[2,.5]]),saved=save(p,r.buildHeadRoute(p,['h0','h1','h2']));
 const h=await load('lib/engineering-hydraulics.ts'),v=await load('lib/engineering-pipe-display.ts'),m=await load('lib/engineering-materials.ts');
 const result=h.calculateEngineering(saved);assert.deepEqual(result.edges.filter(e=>e.branch).map(e=>e.length),[.5,.5,.5]);assert.ok(v.pipeStrokeWidth(20,true)<v.pipeStrokeWidth(20));
 const totals=v.pipeTotals(saved,result.edges);assert.equal(totals.byDiameter.reduce((n,d)=>n+d.length,0),10);
 const units={...(await load('lib/units.ts')).currentUnits(),length:'m',pipe:'mm'};const takeoff=m.engineeringMaterials(saved,units);assert.equal(takeoff.rows.find(x=>x.key.startsWith('flex:')).qty,1.73);assert.equal(takeoff.rows.filter(x=>x.key.startsWith('saddle:')).reduce((n,x)=>n+x.qty,0),3);
 const moved=structuredClone(saved);moved.engineering.elements.pipe.points=moved.engineering.elements.pipe.points.map(p=>({...p,y:1}));assert.deepEqual(h.calculateEngineering(moved).edges.filter(e=>e.branch).map(e=>e.length),[1,1,1]);
});
test('double tap finishes only on the last selected head and does not append duplicates',()=>{
 let state=r.headRouteTap([],'a',null,100);state=r.headRouteTap(state.ids,'a',state.last,250);assert.equal(state.finish,false);assert.deepEqual(state.ids,['a']);
 state=r.headRouteTap(state.ids,'b',state.last,700);assert.equal(state.finish,false);state=r.headRouteTap(state.ids,'b',state.last,900);assert.equal(state.finish,true);assert.deepEqual(state.ids,['a','b']);
 assert.equal(r.headRouteTap(['a','b'],'a',{id:'a',at:100},200).finish,false);assert.equal(r.headRouteTap(['a','b'],'b',{id:'b',at:100},1000).finish,false);
});
test('free lead remains unchanged outside the lawn; sloped open ends finish inside the real boundary',()=>{
 const p=fixture([[0,0],[10,0]],[[0,0],[10,0],[0,10]]),lead=xy([[-3,3],[-3,0]]);
 const route=r.buildHeadRoute(p,['h0','h1'],undefined,lead);
 assert.deepEqual(route.points,xy([[-3,3],[-3,0],[0,.5],[9.5,.5]]));assert.equal(route.headStartIndex,2);assert.deepEqual(lead,xy([[-3,3],[-3,0]]));
 const backwards=r.buildHeadRoute(p,['h1','h0']);assert.deepEqual(backwards.points,xy([[9.5,.5],[0,.5]]));
 const saved=save(p,route),links=c.autoConnections(saved);assert.equal(links.size,2);assert.ok(Object.values(saved.engineering.elements.pipe.auto.consumerNodes).every(index=>index>=2));assert.ok([...links.values()].every(link=>link.point.y===.5),'branches attach to the lateral vertices, not an earlier point of the free supply');assert.deepEqual(links.get('head:h0').point,{x:0,y:.5});
});
test('one sprinkler after a free lead is a valid route; the supply is not shifted and the end keeps its branch',async()=>{
 const p=fixture([[5,0]]),lead=xy([[5,-4],[5,-1]]);const route=r.buildHeadRoute(p,['h0'],undefined,lead);
 assert.ok(!route.error,route.error);assert.deepEqual(route.points.slice(0,2),lead);assert.ok(Math.abs(route.points.at(-1).x-5)<1e-8);assert.equal(route.points.at(-1).y,.5);
 const saved=save(p,route),link=c.autoConnections(saved).get('head:h0');assert.equal(link.t,1);assert.equal(link.distance,.5);assert.deepEqual(link.point,route.points.at(-1));
 const result=(await load('lib/engineering-hydraulics.ts')).calculateEngineering(saved);assert.deepEqual(result.edges.filter(e=>e.branch).map(e=>e.length),[.5]);assert.deepEqual(result.source,lead[0]);
 assert.equal(r.headRouteTap(['h0'],'h0',{id:'h0',at:100},600,true).finish,true);
 const m=await load('lib/engineering.ts'),pipe=saved.engineering.elements.pipe,inserted=m.insertEngineeringNode(pipe,1,{x:5,y:-3});assert.equal(inserted.auto.headStartIndex,3);assert.equal(m.removeEngineeringNode(inserted,1).auto.headStartIndex,2);
 const {parseProjectFile,toProjectFile}=await load('lib/project-file.ts');assert.deepEqual(parseProjectFile(JSON.stringify(toProjectFile({project:saved}))).project.engineering,saved.engineering);
});
test('mouse, pen and touch complete a free lead plus heads; native double-click cannot duplicate a route',async()=>{
 const source=await readFile('src/components/designer/engineering-workspace.tsx','utf8');const code=(await transformWithEsbuild(source.slice(source.indexOf(' const finish='),source.indexOf(' const place='))+source.slice(source.indexOf(' const onDown='),source.indexOf(' const displayed=')),'events.tsx',{loader:'tsx'})).code;
 for(const pointerType of ['mouse','pen','touch'])for(const plan of ['triangle','separate','none','stale']){
  let project=fixture([[0,0],[10,0]],[[0,0],[10,0],[0,10]]),draft=[],committed=null,error=null,tool='autoPipe',commits=0;if(plan==='none')project.drawing=emptyDrawing();
  if(plan==='separate'){project.drawing=cad.addPointShape(cad.addPointShape(emptyDrawing(),xy([[0,0],[4,0],[4,4],[0,4]]),'lawn'),xy([[8,0],[12,0],[12,4],[8,4]]),'lawn');const ids=Object.keys(project.drawing.faces);project.heads=project.heads.map((h,i)=>({...h,figureId:ids[i]}));}
  if(plan==='stale'){project.drawing=emptyDrawing();project.heads=project.heads.map(h=>({...h,figureId:'removed-figure'}));}
  const originalHeads=JSON.stringify(project.heads);
  const svg={setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(){},getBoundingClientRect(){return{left:0,top:0}}};
  const empty={closest:()=>null,getAttribute:()=>null},head=id=>({closest:q=>q==='[data-engineering-head-id]'?{getAttribute:()=>id}:null,getAttribute:()=>null});
  const state={project,spaceDown:false,setPan(){}};
  const env={useProject:{getState:()=>state},px:40,panX:0,panY:0,data:project.engineering,editableData:project.engineering,pinnedData:project.engineering,project,nodeMode:null,item:null,locked:false,setPanning(){},preview:null,editing:null,extending:null,pointers:{current:new Map()},pinch:{current:null},drag:{current:null},stage:{current:svg},point:(x,y)=>({x:x/40,y:y/40}),autoDraft:{current:a.emptyAutoRouteDraft()},...r,...a,AUTO_ROUTE_INSET_M:.5,current:()=>project.engineering,nextNumber:()=>1,setDraft:v=>draft=v,setAutoError:v=>error=v,setHover(){},setSnap(){},setPreview(){},setLibrary(){},choose(){},cancel(){tool=null;env.autoDraft.current=a.emptyAutoRouteDraft();},snapped:p=>p,commit(e){committed=e;commits++;},isRoute:()=>true};
  const handlers=()=>new Function(...Object.keys(env),'draft','tool',code+';return {onDown,onMove,onUp,onDoubleClick};')(...Object.values(env),draft,tool);
  const event=(id,x,y,timeStamp,target)=>({button:0,pointerId:id,pointerType,clientX:x,clientY:y,timeStamp,target,currentTarget:svg,preventDefault(){}});
  const tap=(x,y,timeStamp,target,jitter=0)=>{handlers().onDown(event(1,x,y,timeStamp,target));if(jitter)handlers().onMove(event(1,x+jitter,y,timeStamp+10,svg));handlers().onUp(event(1,x+jitter,y,timeStamp+20,svg));};
  tap(-120,120,100,empty);tap(-120,0,500,empty);assert.deepEqual(draft,xy([[-3,3],[-3,0]]));assert.equal(error,null);
  tap(0,0,1000,head('h0'));assert.equal(draft.length,3);
  handlers().onDown(event(1,200,200,1400,empty));handlers().onMove(event(1,230,200,1500,empty));handlers().onUp(event(1,230,200,1600,svg));assert.equal(draft.length,3);
  tap(400,0,2000,head('h1'));assert.equal(committed,null);
  // Slow mouse double-click is recognized by the browser; small touch jitter is still a tap.
  const beforeFinish=handlers();tap(400,0,pointerType==='mouse'?2700:2500,head('h1'),pointerType==='mouse'?0:6);
  if(pointerType==='mouse')handlers().onDoubleClick(event(1,400,0,2750,svg));
  if(plan==='separate'){assert.ok(committed);assert.equal(error,null);assert.equal(commits,1);assert.equal(tool,null);assert.deepEqual(committed.points.slice(0,2),xy([[-3,3],[-3,0]]));assert.deepEqual(committed.auto.consumerIds,['head:h0','head:h1']);beforeFinish.onDoubleClick(event(1,400,0,2800,svg));assert.equal(commits,1);continue;}assert.ok(committed,`${pointerType} ${plan} must create the route`);assert.deepEqual(committed.points,xy([[-3,3],[-3,0],[0,.5],[plan==='triangle'?9.5:10,.5]]));assert.deepEqual(committed.auto.consumerIds,['head:h0','head:h1']);assert.equal(committed.auto.headStartIndex,2);assert.equal(tool,null);assert.equal(JSON.stringify(project.heads),originalHeads);
  beforeFinish.onDoubleClick(event(1,400,0,2800,svg));assert.equal(commits,1);
 }
});

test('free route keeps its position for central heads on opposite sides; owners, lengths and edits remain stable',async()=>{
 const project=fixture([[3,.7],[7,-.7],[5,.6],[5,2]],[[-1,-5],[13,-5],[13,5],[-1,5]]);project.heads[2].zone=2;
 let draft=a.emptyAutoRouteDraft();
 for(const [i,point] of xy([[0,0],[3,0],[7,0],[10,0]]).entries())draft=a.tapAutoRoute(project,draft,point,undefined,1000*i,40).draft;
 const info=a.describeAutoRoute(project,draft);assert.deepEqual(info.headIds,['h0','h1']);assert.equal(info.headChain,false);assert.deepEqual(info.branches.map(b=>b.point),xy([[3,0],[7,0]]));
 const route=a.buildAutoRoute(project,draft);assert.deepEqual(route.points,xy([[0,0],[3,0],[7,0],[10,0]]));assert.equal(route.waypoints,true);
 const saved=save(project,route),links=c.autoConnections(saved);assert.equal(links.size,2);assert.ok(Math.abs(links.get('head:h0').distance-.7)<1e-8);assert.ok(Math.abs(links.get('head:h1').distance-.7)<1e-8);
 const result=(await load('lib/engineering-hydraulics.ts')).calculateEngineering(saved);assert.ok(Math.abs(result.edges.filter(e=>e.branch).reduce((sum,e)=>sum+e.length,0)-1.4)<1e-8);
 const next=a.buildAutoRoute(saved,draft);assert.deepEqual(next.headIds,['h2'],'the next route captures only unowned heads, in its own zone');assert.equal(next.zone,2);
 const extension={steps:[...route.points,{x:12,y:0}].map(point=>({point})),baseHeadIds:route.headIds,waypoints:true,established:true};
 const extended=a.buildAutoRoute(saved,extension,'pipe');assert.deepEqual(extended.points.slice(0,4),route.points);assert.deepEqual(extended.headIds,['h0','h1']);
 const m=await load('lib/engineering.ts'),inserted=m.insertEngineeringNode(saved.engineering.elements.pipe,1,{x:1,y:0});assert.equal(inserted.auto.headStartIndex,0);assert.equal(m.removeEngineeringNode(inserted,1).auto.headStartIndex,0);
 const {parseProjectFile,toProjectFile}=await load('lib/project-file.ts');assert.deepEqual(parseProjectFile(JSON.stringify(toProjectFile({project:saved}))).project.engineering,saved.engineering);
 const {useProject:s}=await load('lib/project-store.ts');s.setState({project,projects:[],past:[],future:[],pastOps:[],futureOps:[]});s.getState().commitEngineering(saved.engineering);s.getState().undo();assert.deepEqual(s.getState().project.engineering,project.engineering);s.getState().redo();assert.deepEqual(s.getState().project.engineering,saved.engineering);
});
test('free points after selecting a head, undo, majority selection and explicit chain offset',()=>{
 const p=fixture([[0,0],[5,1],[10,0]]);let draft=a.emptyAutoRouteDraft();
 draft=a.tapAutoRoute(p,draft,{x:0,y:0},'h0',100,40).draft;
 draft=a.tapAutoRoute(p,draft,{x:3,y:.5},undefined,1000,40).draft;
 assert.equal(draft.steps.length,2);assert.equal(draft.waypoints,true);
 draft=a.tapAutoRoute(p,draft,{x:7,y:.5},undefined,2000,40).draft;
 assert.deepEqual(a.describeAutoRoute(p,draft).headIds,['h0','h1']);
 const undone=a.undoAutoRoute(draft);assert.deepEqual(a.describeAutoRoute(p,undone).headIds,['h0']);assert.equal(undone.steps.length,2);
 const shifted=a.buildAutoRoute(p,draft);assert.ok(!shifted.error,shifted.error);assert.equal(shifted.points.at(-1).y,.5);assert.ok(shifted.points[0].y>.49);assert.equal(shifted.waypoints,true);
 const q=structuredClone(p);q.heads[2].zone=2;const accepted=a.tapAutoRoute(q,draft,{x:10,y:0},'h2',3000,40);assert.equal(accepted.error,undefined);assert.equal(accepted.draft.steps.length,draft.steps.length+1);assert.equal(a.describeAutoRoute(q,accepted.draft).zone,1);
 const chain={steps:[{point:{x:0,y:0},headId:'h0'},{point:{x:10,y:0},headId:'h2'}]};assert.deepEqual(a.buildAutoRoute(p,chain).points,xy([[0,.5],[10,.5]]));
 const hidden=structuredClone(p);hidden.heads[1].hidden=true;assert.ok(!a.describeAutoRoute(hidden,draft).headIds.includes('h1'));
});
test('actual mouse, pen and touch handlers finish near central heads without shifting the drawn path',async()=>{
 const source=await readFile('src/components/designer/engineering-workspace.tsx','utf8');const code=(await transformWithEsbuild(source.slice(source.indexOf(' const finish='),source.indexOf(' const place='))+source.slice(source.indexOf(' const onDown='),source.indexOf(' const displayed=')),'events.tsx',{loader:'tsx'})).code;
 for(const pointerType of ['mouse','pen','touch'])for(const px of [20,40]){
  const project=fixture([[3,.7],[7,-.7]],[[-1,-5],[13,-5],[13,5],[-1,5]]);let draft=[],committed=null,error=null,tool='autoPipe',commits=0;
  const svg={setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(){},getBoundingClientRect(){return{left:0,top:0}}},empty={closest:()=>null,getAttribute:()=>null};
  const env={useProject:{getState:()=>({project,spaceDown:false,setPan(){}})},px,panX:0,panY:0,data:project.engineering,editableData:project.engineering,pinnedData:project.engineering,project,nodeMode:null,item:null,locked:false,setPanning(){},preview:null,editing:null,extending:null,pointers:{current:new Map()},pinch:{current:null},drag:{current:null},stage:{current:svg},point:(x,y)=>({x:x/px,y:y/px}),autoDraft:{current:a.emptyAutoRouteDraft()},...r,...a,current:()=>project.engineering,nextNumber:()=>1,setDraft:v=>draft=v,setAutoError:v=>error=v,setHover(){},setSnap(){},setPreview(){},setLibrary(){},choose(){},cancel(){tool=null;env.autoDraft.current=a.emptyAutoRouteDraft();},snapped:p=>p,commit(e){committed=e;commits++;},isRoute:()=>true};
  const handlers=()=>new Function(...Object.keys(env),'draft','tool',code+';return {onDown,onMove,onUp,onDoubleClick};')(...Object.values(env),draft,tool);
  const event=(x,y,timeStamp)=>({button:0,pointerId:1,pointerType,clientX:x,clientY:y,timeStamp,target:empty,currentTarget:svg,preventDefault(){}});
  const tap=(x,y,t,jitter=0)=>{handlers().onDown(event(x,y,t));if(jitter)handlers().onMove(event(x+jitter,y,t+10));handlers().onUp(event(x+jitter,y,t+20));};
  tap(0,0,100);tap(3*px,0,1000);tap(7*px,0,2000);tap(10*px,0,3000);assert.equal(error,null);assert.equal(committed,null);
  assert.deepEqual(a.describeAutoRoute(project,env.autoDraft.current).headIds,['h0','h1']);
  const oldHandlers=handlers();tap(10*px,0,pointerType==='mouse'?3700:3500,pointerType==='mouse'?0:6);if(pointerType==='mouse')handlers().onDoubleClick(event(10*px,0,3750));
  assert.equal(error,null);assert.ok(committed,pointerType);assert.deepEqual(committed.points,xy([[0,0],[3,0],[7,0],[10,0]]));assert.equal(committed.auto.pathMode,'waypoints');assert.deepEqual(committed.auto.consumerIds,['head:h0','head:h1']);
  oldHandlers.onDoubleClick(event(10*px,0,3800));assert.equal(commits,1);
 }
});

test('actual mouse, pen and touch finish once after a later zone wins the majority',async()=>{
 const source=await readFile('src/components/designer/engineering-workspace.tsx','utf8');const code=(await transformWithEsbuild(source.slice(source.indexOf(' const finish='),source.indexOf(' const place='))+source.slice(source.indexOf(' const onDown='),source.indexOf(' const displayed=')),'events.tsx',{loader:'tsx'})).code;
 for(const pointerType of ['mouse','pen','touch'])for(const px of [20,40]){
  const project=fixture([[3,.7],[7,-.7],[9,.7]],[[-1,-5],[13,-5],[13,5],[-1,5]]);let draft=[],committed=null,error=null,tool='autoPipe',commits=0;project.heads[1].zone=2;project.heads[2].zone=2;
  const svg={setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(){},getBoundingClientRect(){return{left:0,top:0}}},empty={closest:()=>null,getAttribute:()=>null};
  const env={useProject:{getState:()=>({project,spaceDown:false,setPan(){}})},px,panX:0,panY:0,data:project.engineering,editableData:project.engineering,pinnedData:project.engineering,project,nodeMode:null,item:null,locked:false,setPanning(){},preview:null,editing:null,extending:null,pointers:{current:new Map()},pinch:{current:null},drag:{current:null},stage:{current:svg},point:(x,y)=>({x:x/px,y:y/px}),autoDraft:{current:a.emptyAutoRouteDraft()},...r,...a,current:()=>project.engineering,nextNumber:()=>1,setDraft:v=>draft=v,setAutoError:v=>error=v,setHover(){},setSnap(){},setPreview(){},setLibrary(){},choose(){},cancel(){tool=null;env.autoDraft.current=a.emptyAutoRouteDraft();},snapped:p=>p,commit(e){committed=e;commits++;},isRoute:()=>true};
  const handlers=()=>new Function(...Object.keys(env),'draft','tool',code+';return {onDown,onMove,onUp,onDoubleClick};')(...Object.values(env),draft,tool);
  const event=(x,y,timeStamp)=>({button:0,pointerId:1,pointerType,clientX:x,clientY:y,timeStamp,target:empty,currentTarget:svg,preventDefault(){}});
  const tap=(x,y,t,jitter=0)=>{handlers().onDown(event(x,y,t));if(jitter)handlers().onMove(event(x+jitter,y,t+10));handlers().onUp(event(x+jitter,y,t+20));};
  tap(0,0,100);tap(3*px,0,1000);tap(7*px,0,2000);tap(10*px,0,3000);assert.equal(error,null);assert.equal(committed,null);
  assert.deepEqual(a.describeAutoRoute(project,env.autoDraft.current).headIds,['h1','h2']);
  const oldHandlers=handlers();tap(10*px,0,pointerType==='mouse'?3700:3500,pointerType==='mouse'?0:6);if(pointerType==='mouse')handlers().onDoubleClick(event(10*px,0,3750));
  assert.equal(error,null);assert.ok(committed,pointerType);assert.deepEqual(committed.points,xy([[0,0],[3,0],[7,0],[9,0],[10,0]]));assert.equal(committed.auto.pathMode,'waypoints');assert.deepEqual(committed.auto.consumerIds,['head:h1','head:h2']);
  oldHandlers.onDoubleClick(event(10*px,0,3800));assert.equal(commits,1);
 }
});

test('majority counts unique available heads, permits crossing another zone, and undo restores the prior choice',()=>{
 const p=fixture([[0,0],[4,0],[8,0]]);p.heads[1].zone=2;p.heads[2].zone=2;
 let d=a.tapAutoRoute(p,a.emptyAutoRouteDraft(),{x:0,y:0},'h0',100,40).draft;
 assert.equal(a.describeAutoRoute(p,d).zone,1);
 d=a.tapAutoRoute(p,d,{x:4,y:0},'h1',1000,40).draft;
 assert.equal(a.describeAutoRoute(p,d).zone,1,'tie keeps the first encountered zone');
 const tied=d;d=a.tapAutoRoute(p,d,{x:8,y:0},'h2',2000,40).draft;
 assert.equal(a.describeAutoRoute(p,d).zone,2);assert.deepEqual(a.describeAutoRoute(p,d).headIds,['h1','h2']);
 const route=a.buildAutoRoute(p,d);assert.ok(!route.error,route.error);assert.equal(route.zone,2);assert.deepEqual(route.headIds,['h1','h2']);
 assert.equal(a.describeAutoRoute(p,a.undoAutoRoute(d)).zone,1);
 const back={...d,steps:[...d.steps,{point:{x:0,y:0}}]};assert.equal(a.describeAutoRoute(p,back).zone,2,'retracing does not count a head twice');
 const hidden=structuredClone(p);hidden.heads[2].hidden=true;assert.equal(a.describeAutoRoute(hidden,d).zone,1);
 const extension={...tied,established:true,baseHeadIds:['h0']};assert.equal(a.tapAutoRoute(p,extension,{x:8,y:0},'h2',2500,40).error,'sameZone');
});
test('double tap uses raw pointer distance when snapping jumps or the head hit target changes',()=>{
 const p=fixture([[0,0],[10,0]]);
 let d=a.tapAutoRoute(p,a.emptyAutoRouteDraft(),{x:0,y:0},'h0',100,100).draft;
 d=a.tapAutoRoute(p,d,{x:10,y:0},'h1',1000,100,undefined,{x:9.76,y:0}).draft;
 const completed=a.tapAutoRoute(p,d,{x:9.5,y:0},undefined,1200,100,undefined,{x:9.74,y:0});
 assert.equal(completed.finish,true);assert.deepEqual(completed.draft.steps,d.steps);assert.ok(!a.buildAutoRoute(p,completed.draft).error);
 assert.equal(a.tapAutoRoute(p,{...d,lastTap:undefined},{x:9.5,y:0},undefined,1200,100).finish,false,'panning or a pinch clears completion');
});

test('the approach through a different zone remains a supply lead when the later zone wins',()=>{
 const p=fixture([[-4,0],[0,0],[10,0]]);p.heads[1].zone=2;p.heads[2].zone=2;
 const d={steps:p.heads.map(h=>({point:{x:h.x,y:h.y},headId:h.id}))};
 const route=a.buildAutoRoute(p,d);assert.ok(!route.error,route.error);assert.equal(route.zone,2);assert.deepEqual(route.headIds,['h1','h2']);assert.deepEqual(route.points,xy([[-4,0],[-.5,0],[.5,.5],[9.5,.5]]));
 assert.equal(c.autoConnections(save(p,route)).has('head:h0'),false);
});

test('double tapping an earlier already-selected head does not finish at a different endpoint',()=>{
 const p=fixture([[0,0],[10,0]]);let d=a.tapAutoRoute(p,a.emptyAutoRouteDraft(),{x:0,y:0},'h0',100,40).draft;
 d=a.tapAutoRoute(p,d,{x:10,y:0},'h1',1000,40).draft;
 d=a.tapAutoRoute(p,d,{x:0,y:0},'h0',2000,40).draft;
 assert.equal(a.tapAutoRoute(p,d,{x:0,y:0},'h0',2200,40).finish,false);
});

test('continuing an existing route preserves its saved consumers even when one is hidden',()=>{
 const p=fixture([[0,0],[5,0],[10,0]]);p.heads[0].hidden=true;
 const d={steps:xy([[0,.5],[5,.5],[10,.5]]).map(point=>({point})),baseHeadIds:['h0','h1'],established:true,waypoints:true};
 assert.deepEqual(new Set(a.describeAutoRoute(p,d).headIds),new Set(['h0','h1','h2']));
});

test('a free supply route just outside the lawn finishes and captures only nearby heads',async()=>{
 const p=fixture([[2,0],[8,0],[8,8]]);
 const d={waypoints:true,steps:xy([[-5,-3],[-5,-.8],[2,-.8],[8,-.8],[12,-.8]]).map(point=>({point}))};
 const route=a.buildAutoRoute(p,d);assert.ok(!route.error,route.error);assert.deepEqual(route.headIds,['h0','h1']);assert.deepEqual(route.points[0],{x:-5,y:-3});
 const pipe={id:'nearby-route',kind:'pipe',type:'zonePipe',number:1,label:true,diameterMm:32,points:route.points,auto:{circuit:'zone:1',captureM:1,selection:'heads',pathMode:'waypoints',insetM:route.insetM,headStartIndex:route.headStartIndex,consumerIds:route.headIds.map(id=>'head:'+id),consumerNodes:route.consumerNodes}};
 const saved={...p,engineering:{...p.engineering,elements:{[pipe.id]:pipe}}};
 assert.deepEqual([...c.autoConnections(saved).keys()].sort(),['head:h0','head:h1']);
 assert.ok(route.consumerNodes&&Object.keys(route.consumerNodes).length===2);
 const extension={steps:[...route.points,{x:15,y:-.8}].map(point=>({point})),baseHeadIds:route.headIds,established:true,waypoints:true};
 const extended=a.buildAutoRoute(saved,extension,pipe.id);assert.ok(!extended.error,extended.error);assert.deepEqual(extended.points.slice(0,route.points.length),route.points);
 const {parseProjectFile,toProjectFile}=await load('lib/project-file.ts');const reopened=parseProjectFile(JSON.stringify(toProjectFile({project:saved}))).project;assert.equal(c.autoConnections(reopened).size,2);
});
test('an impossible inset preserves the drawn path rather than rejecting a valid captured route',()=>{
 const p=fixture([[2,.1],[8,.1]],[[0,0],[10,0],[10,.4],[0,.4]]),points=xy([[-3,.1],[2,.1],[8,.1]]);
 const route=a.buildAutoRoute(p,{steps:points.map(point=>({point})),waypoints:true});assert.ok(!route.error,route.error);assert.deepEqual(route.points,points);assert.equal(route.insetM,0);assert.deepEqual(route.headIds,['h0','h1']);
});

test('automatic boundary spans use the figure inset and preserve approach and free continuation',()=>{
 for(const y of [0,-.8,.3]){
  const p=fixture([[2,0],[8,0]]),points=xy([[-4,-3],[-4,y],[2,y],[8,y],[12,y],[12,4]]);
  const route=a.buildAutoRoute(p,{waypoints:true,steps:points.map(point=>({point}))});assert.ok(!route.error,route.error);
  assert.deepEqual(route.points.slice(0,2),points.slice(0,2));assert.deepEqual(route.points.slice(-2),points.slice(-2));
  const links=c.autoConnections(save(p,route));for(const id of ['h0','h1']){const link=links.get('head:'+id);assert.equal(link.point.y,.5);assert.ok(Math.abs(link.distance-.5)<1e-8);}
 }
});
test('a single boundary sprinkler receives a local inset without moving the rest of the route',()=>{
 const p=fixture([[5,0]]),points=xy([[-3,0],[5,0],[12,0]]);
 const route=a.buildAutoRoute(p,{waypoints:true,steps:points.map(point=>({point}))});assert.ok(!route.error,route.error);assert.deepEqual(route.points[0],points[0]);assert.deepEqual(route.points.at(-1),points.at(-1));
 const link=c.autoConnections(save(p,route)).get('head:h0');assert.deepEqual(link.point,{x:5,y:.5});assert.equal(link.distance,.5);
});

test('continuing from the start preserves fixed tees, route orientation, zone and the original far endpoint',async()=>{
 const p=fixture([[2,0],[8,0]]),initial=a.buildAutoRoute(p,{waypoints:true,steps:xy([[0,0],[2,0],[8,0],[10,0]]).map(point=>({point}))}),saved=save(p,initial),pipe=saved.engineering.elements.pipe;
 const points=[...pipe.points].reverse().concat({x:-3,y:0});
 const extended=a.buildAutoRoute(saved,{steps:points.map(point=>({point})),baseHeadIds:initial.headIds,waypoints:true,established:true,fromStart:true},pipe.id);
 assert.ok(!extended.error,extended.error);assert.deepEqual(extended.points[0],{x:-3,y:0});assert.deepEqual(extended.points.at(-1),pipe.points.at(-1));assert.deepEqual(extended.points.slice(-pipe.points.length),pipe.points);assert.equal(extended.zone,1);
 const next=save(saved,extended),before=c.autoConnections(saved),after=c.autoConnections(next);
 for(const id of ['head:h0','head:h1']){assert.deepEqual(after.get(id).point,before.get(id).point);assert.deepEqual(extended.points[extended.consumerNodes[id]],before.get(id).point);}
 const {parseProjectFile,toProjectFile}=await load('lib/project-file.ts');assert.deepEqual(parseProjectFile(JSON.stringify(toProjectFile({project:next}))).project.engineering,next.engineering);
 const {useProject:s}=await load('lib/project-store.ts');s.setState({project:saved,projects:[],past:[],future:[],pastOps:[],futureOps:[]});s.getState().commitEngineering(next.engineering);s.getState().undo();assert.deepEqual(s.getState().project.engineering,saved.engineering);s.getState().redo();assert.deepEqual(s.getState().project.engineering,next.engineering);
});
