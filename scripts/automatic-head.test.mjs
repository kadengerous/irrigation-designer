import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer,transformWithEsbuild} from 'vite';
let server,load;
before(async()=>{server=await createServer({server:{middlewareMode:true,hmr:false}});load=p=>server.ssrLoadModule('/src/'+p);});
after(async()=>server.close());

test('selection respects the exact radius, sector, pressure table and a compatible body without boosting pressure',async()=>{
 const {selectAutomaticHead}=await load('lib/automatic-head.ts'),{itemById,bodiesFor}=await load('lib/hunter-catalog.ts'),{radiusRange,pressureSteps,headFlow,geometryAt,performanceAt}=await load('lib/flow.ts');
 let count=0;
 for(const pressure of [1,1.7,2.1,2.8,3,4,5])for(const radius of [1,2,3,4,5,7,10,15,20])for(const arc of [45,90,180,270,360]){
  const fit=selectAutomaticHead(radius,arc,pressure);if(!fit)continue;count++;
  const item=itemById(fit.catalogId),body=itemById(fit.bodyId),range=radiusRange(item,fit.nozzleId,fit.designPressure,arc);
  assert.equal(fit.r,radius);assert.equal(fit.arc,arc);assert.ok(arc>=item.arcMin&&arc<=item.arcMax);
  assert.ok(geometryAt(item,fit.nozzleId,fit.designPressure,arc));
  if(!performanceAt(item,fit.nozzleId,fit.designPressure,arc))assert.equal(fit.needsReview,true,'geometry-only sectors never claim known discharge');
  assert.ok(radius>=range.min-1e-7&&radius<=range.max+1e-7);
  assert.ok(fit.designPressure<=pressure);
  if(item.type!=='rotor'){assert.ok(bodiesFor(item).some(b=>b.id===body.id));assert.ok(fit.designPressure<= (body.regulatedPressureBar??pressure));}
  else assert.equal(fit.designPressure,pressure);
  assert.equal(fit.needsReview,headFlow(fit).lpm==null);if(!fit.needsReview)assert.ok(headFlow(fit).lpm>0);
 }
 assert.ok(count>100);
 for(const args of [[1000,90,2.8],[4,0,2.8],[4,361,2.8],[4,90,.1],[NaN,90,2.8]])assert.equal(selectAutomaticHead(...args),null);
 const fit=selectAutomaticHead(4,180,3);assert.ok(fit);assert.ok(fit.designPressure<3,'regulated body handles a source pressure between table rows');
});

test('sector tracing follows both directions, keeps winding beyond 180 degrees and preserves the centre dead zone',async()=>{
 const {traceSector,snapAutomaticSector,editAutomaticSector,automaticSectorTargetAngle}=await load('lib/automatic-head.ts');
 const initial={center:{x:2,y:3},radius:4,start:0,arc:0};
 const point=angle=>({x:2+4*Math.cos(angle*Math.PI/180),y:3+4*Math.sin(angle*Math.PI/180)});
 for(const sign of [1,-1]){
  let draft=initial;
  for(const magnitude of [45,90,179,181,270,359,360]){
   draft=traceSector(draft,point(sign*magnitude),.3);
   assert.equal(draft.arc,magnitude);assert.equal(draft.start,sign>0?0:(360-magnitude)%360);
   assert.deepEqual(traceSector(draft,{x:2.05,y:3.02},.3),draft);
  }
  draft=traceSector(draft,point(sign*270),.3);assert.equal(draft.arc,270,'reversing unwinds the sweep');
 }
 for(const sign of [1,-1]){
  const tiny=traceSector(initial,point(sign*1),.3),snapped=snapAutomaticSector(tiny,point(0));
  assert.equal(tiny.arc,1);assert.equal(snapped.arc,0,'snapping to the initial edge cannot invent a full turn');
  assert.equal(snapped.trace.sweep,tiny.trace.sweep,'snapping does not rewrite pointer winding history');assert.equal(editAutomaticSector(snapped,{arc:90}).start,sign>0?0:270,'numeric edits retain direction at the snapped starting corner');
  assert.equal(traceSector(snapped,point(sign*45),.3).arc,45);
  const drawn=traceSector(initial,point(sign*45),.3),edited=editAutomaticSector(drawn,{arc:120});
  assert.equal(edited.arc,120);assert.equal(traceSector(edited,point(sign*45),.3).arc,120,'stationary pointer preserves numeric angle');
  assert.equal(traceSector(edited,point(sign*50),.3).arc,125,'next pointer move adds only its angular delta');
  const full=editAutomaticSector(drawn,{arc:360});assert.equal(traceSector(full,point(sign*45),.3).arc,360,'explicit full-circle selection persists');
  assert.equal(automaticSectorTargetAngle(edited)%360,sign>0?120:240);
 }
});

test('arbitrary drawn radii work in every brand and keep the exact requested geometry',async()=>{
 const {selectAutomaticHead,automaticHeadCatalog}=await load('lib/automatic-head.ts');
 const {itemById}=await load('lib/equipment-catalog.ts'),{headFlow,operatingGeometryAvailable}=await load('lib/flow.ts');
 for(const [brand,group,radius,arc,bar] of [['hunter','mp',4.17,137,2.8],['rain-bird','rvan',3.27,137,2.8],['rain-bird','rotor',8.17,137,3.1],['toro','precision',4.17,90,2.8],['toro','rotor',8.37,137,3.1],['k-rain','rotary',4.17,137,2.8],['k-rain','rotor',8.17,137,3.1]]){
  const fit=selectAutomaticHead(radius,arc,bar,automaticHeadCatalog(brand,group));
  assert.ok(fit,`${brand}: ${radius}m / ${arc}° / ${bar}bar`);
  const item=itemById(fit.catalogId);assert.equal(item.manufacturerId,brand);
  assert.equal(fit.r,radius);assert.equal(fit.arc,arc);assert.ok(fit.designPressure<=bar);
  assert.ok(operatingGeometryAvailable(item,fit));assert.equal(fit.needsReview,headFlow(fit).lpm==null);
 }
});

test('reduced-radius fallback preserves unknown flow, rejects disputed data and prefers known discharge',async()=>{
 const {selectAutomaticHead,automaticHeadCatalog}=await load('lib/automatic-head.ts');
 const {itemById}=await load('lib/equipment-catalog.ts'),{headFlow}=await load('lib/flow.ts');
 const rvan=itemById('rain-bird:R-VAN14');
 const fit=selectAutomaticHead(3.27,137,3.1,[rvan]);assert.ok(fit);assert.equal(fit.needsReview,true);assert.equal(headFlow(fit).lpm,null);
 const exact=selectAutomaticHead(4.3,137,3.1,[rvan]);assert.ok(exact);assert.equal(exact.needsReview,false);assert.ok(headFlow(exact).lpm>0);
 assert.equal(exact.bodyId,'rain-bird:1804','3.1 bar at the inlet is below the P45 nominal-regulation threshold');
 for(const changed of [{...rvan,geometryVerificationStatus:'Needs Review'},{...rvan,verificationStatus:'Needs Review'},{...rvan,nozzles:rvan.nozzles.map(n=>({...n,hydraulicVerificationStatus:'Needs Review'}))}])
  assert.equal(selectAutomaticHead(3.27,137,3.1,[changed]),null);
 assert.equal(selectAutomaticHead(4.31,137,3.1,[rvan]),null,'no enlargement beyond published throw');
 assert.equal(selectAutomaticHead(3.27,300,3.1,[rvan]),null,'no unsupported arc gap');
 assert.equal(selectAutomaticHead(3.27,137,.1,[rvan]),null,'no pressure boost');
 const all=selectAutomaticHead(3.27,137,3.1);assert.ok(all);assert.equal(all.needsReview,false,'known-flow model wins over a reduced-flow unknown');
 for(const [brand,group] of [['hunter','mp'],['rain-bird','rvan'],['toro','precision'],['toro','rotor'],['k-rain','rotary'],['k-rain','rotor']])for(const pressure of [2.1,2.8,3.1])for(const radius of [2.37,3.27,4.17,6.37,8.17,10.37])for(const arc of [90,137,180,360]){
  const h=selectAutomaticHead(radius,arc,pressure,automaticHeadCatalog(brand,group));if(!h)continue;
  assert.equal(h.needsReview,headFlow(h).lpm==null);assert.ok(h.designPressure<=pressure);
 }
});

test('Rain Bird PRS30 uses documented 30 psi chart equivalents, never arbitrary pressure clamping',async()=>{
 const {selectAutomaticHead}=await load('lib/automatic-head.ts'),{itemById}=await load('lib/equipment-catalog.ts'),{headFlow}=await load('lib/flow.ts');
 for(const id of ['HE-VAN-8','HE-VAN-10','5H','5Q','10H','10Q']){
  const item=itemById('rain-bird:'+id),row=item.nozzles[0].performance.at(-1);
  const h=selectAutomaticHead(row.radiusM,row.arcDeg,3.1,[item]);assert.ok(h,id);
  assert.equal(h.designPressure,row.pressureBar);assert.ok(itemById(h.bodyId).regulatedPressureBar===2.1);
  assert.equal(headFlow(h).lpm,row.flowLMin);assert.equal(h.needsReview,false);
  assert.equal(selectAutomaticHead(row.radiusM,row.arcDeg,2.09,[item]),null,'not an arbitrary supplied pressure alias');
 }
});

test('geometry-only selections animate within bounds without inventing zone flow or watering duration',async()=>{
 const {selectAutomaticHead,automaticHeadCatalog}=await load('lib/automatic-head.ts');
 const {headFlow,runTimeMin}=await load('lib/flow.ts'),{zoneFlow}=await load('lib/hydro.ts');
 const {wateringProfile,wateringDrop,wateringParticleCount}=await load('lib/watering-preview.ts');
 for(const [brand,group,radius] of [['rain-bird','rvan',3.27],['toro','rotor',8.37],['k-rain','rotor',8.17]]){
  const scope=automaticHeadCatalog(brand,group).filter(item=>brand!=='k-rain'||item.id==='k-rain:MiniPro');
  const fit=selectAutomaticHead(radius,137,3.1,scope);assert.ok(fit?.needsReview,brand);
  const head={...fit,id:'test',x:0,y:0,start:30,zone:1,locked:false};
  const flow=headFlow(head);assert.equal(flow.lpm,null);assert.equal(flow.precipMmHr,null);assert.equal(flow.precipTriangleMmHr,null);
  assert.equal(zoneFlow([head],1),null);assert.equal(runTimeMin(10,flow.precipMmHr),null);
  const profile=wateringProfile(head);assert.notEqual(profile.kind,'unknown');
  let drops=0;
  for(const time of [1,9.25,41])for(let i=0;i<wateringParticleCount(profile);i+=17){
   const drop=wateringDrop(head,time,i,profile);if(!drop)continue;drops++;
   assert.ok(Math.hypot(drop.x,drop.y)<=radius+1e-7);
   const offset=((drop.angle*180/Math.PI-head.start)%360+360)%360;
   assert.ok(offset<=137+1e-7||offset>=360-1e-7);
  }
  assert.ok(drops>0);
 }
});

test('automatic placement respects the current compatibility group and preserves review status through editing, undo and save',async()=>{
 const {useProject:s,updateHeadSettings}=await load('lib/project-store.ts'),{emptyProject}=await load('lib/project-types.ts');
 const {headFlow}=await load('lib/flow.ts');
 const {automaticHeadCatalog,selectAutomaticHead}=await load('lib/automatic-head.ts');
 const sector={center:{x:3,y:4},radius:3.27,start:30,arc:137};
 for(const group of ['rvan','spray-mpr','van','sq','bubbler','rotor']){
  s.setState({project:emptyProject(),projects:[],past:[],future:[],pastOps:[],futureOps:[],equipmentFilters:{manufacturerId:'rain-bird'},familyFilter:group,workspaceSection:'irrigation',tool:'auto-head',activeZoneId:1});
  const catalog=automaticHeadCatalog('rain-bird',group),expected=selectAutomaticHead(sector.radius,sector.arc,3.1,catalog);
  assert.equal(s.getState().placeAutomaticHead(sector,3.1),!!expected,group);
  const h=s.getState().project.heads[0];
  if(!expected){assert.equal(h,undefined);assert.equal(s.getState().past.length,0);continue;}
  assert.equal(h.catalogId,expected.catalogId);assert.equal(h.nozzleId,expected.nozzleId);
  assert.ok(catalog.some(item=>item.id===h.catalogId&&item.nozzles.some(n=>n.id===h.nozzleId)),group);
  assert.equal(h.needsReview,expected.needsReview);
  assert.ok(h.equipmentSnapshot);assert.ok(h.bodySnapshot);assert.equal(s.getState().past.length,1);
  if(group==='rvan'){
   assert.equal(h.needsReview,true);assert.equal(headFlow(h).lpm,null);
   for(const patch of [{start:45},{arc:138},{r:3.28}]){const edited=updateHeadSettings(h,patch);assert.equal(edited.needsReview,true);assert.equal(headFlow(edited).lpm,null);}
  }
  s.getState().undo();assert.equal(s.getState().project.heads.length,0);s.getState().redo();assert.equal(s.getState().project.heads[0].needsReview,h.needsReview);
  const {toProjectFile,parseProjectFile}=await load('lib/project-file.ts');
  const file=toProjectFile({project:s.getState().project,showCoverage:true,showLabels:true,showGrid:true,snapOn:true,snapGridOn:true,gridStep:.5,measureUnit:'m',activeZoneId:1});
  const restored=parseProjectFile(JSON.stringify(file)).project.heads[0];assert.equal(restored.needsReview,h.needsReview);assert.equal(headFlow(restored).lpm,headFlow(h).lpm);
 }
 s.setState({equipmentFilters:{manufacturerId:'hunter'},familyFilter:'mp'});
});

test('live preview and placement apply the same current-zone compatibility check',async()=>{
 const {useProject:s}=await load('lib/project-store.ts'),{emptyProject}=await load('lib/project-types.ts');
 const {automaticHeadCatalog,automaticZonePeers,selectAutomaticHead,selectAutomaticRadius}=await load('lib/automatic-head.ts');
 for(const [group,radius,arc] of [['rvan',4.3,90],['van',1.2,90]]){
  s.setState({project:emptyProject(),projects:[],past:[],future:[],pastOps:[],futureOps:[],equipmentFilters:{manufacturerId:'rain-bird'},familyFilter:group,workspaceSection:'irrigation',tool:'auto-head',activeZoneId:1});
  const bar=group==='rvan'?3.1:2.1,sector={center:{x:0,y:0},radius,start:0,arc};
  assert.equal(s.getState().placeAutomaticHead(sector,bar),true,group);
  const catalog=automaticHeadCatalog('rain-bird',group),state=s.getState(),peers=automaticZonePeers(state.project.heads,state.activeZoneId,catalog);
  assert.equal(peers.length,1);
  const requested={...sector,center:{x:5,y:5},arc:180},preview=selectAutomaticHead(radius,requested.arc,bar,catalog,peers);
  assert.equal(!!selectAutomaticRadius(radius,bar,catalog,peers),true,`${group}: the original angle remains available`);
  assert.equal(s.getState().placeAutomaticHead(requested,bar),!!preview,`${group}: preview and commit agree`);
  if(preview){const h=s.getState().project.heads.at(-1);assert.equal(h.catalogId,preview.catalogId);assert.equal(h.nozzleId,preview.nozzleId);}
  else assert.equal(s.getState().project.heads.length,1,'rejection adds no sprinkler');
 }
 s.setState({equipmentFilters:{manufacturerId:'hunter'},familyFilter:'mp'});
});

test('automatic placement is one saved undoable operation and invalid selection adds nothing',async()=>{
 const {useProject:s}=await load('lib/project-store.ts'),{emptyProject}=await load('lib/project-types.ts');
 const base=emptyProject();s.setState({project:base,projects:[],past:[],future:[],pastOps:[],futureOps:[],workspaceSection:'irrigation',tool:'auto-head',activeZoneId:1});
 const sector={center:{x:3,y:4},radius:4,start:30,arc:180};
 assert.equal(s.getState().placeAutomaticHead(sector,.1),false);assert.equal(s.getState().past.length,0);
 assert.equal(s.getState().placeAutomaticHead(sector,3),true);
 const h=s.getState().project.heads[0];assert.deepEqual([h.x,h.y,h.r,h.start,h.arc],[3,4,4,30,180]);
 assert.equal(s.getState().past.length,1);assert.equal(s.getState().selectedId,h.id);assert.equal(s.getState().tool,'place');
 assert.deepEqual(s.getState().projects[0].heads,[h]);
 for(const key of ['polygons','water','engineering'])assert.deepEqual(s.getState().project[key],base[key]);
 s.getState().undo();assert.equal(s.getState().project.heads.length,0);s.getState().redo();assert.deepEqual(s.getState().project.heads,JSON.parse(JSON.stringify([h])));
 const {toProjectFile,parseProjectFile}=await load('lib/project-file.ts');
 const file=toProjectFile({project:s.getState().project,showCoverage:true,showLabels:true,showGrid:true,snapOn:true,snapGridOn:true,gridStep:.5,measureUnit:'m',activeZoneId:1});
 assert.deepEqual(parseProjectFile(JSON.stringify(file)).project.heads,JSON.parse(JSON.stringify([h])));
});

test('radius preview can select a part-circle-only model before the angle is known',async()=>{
 const {selectAutomaticRadius,selectAutomaticHead}=await load('lib/automatic-head.ts');
 const {itemById}=await load('lib/equipment-catalog.ts');
 const item=itemById('rain-bird:R-VAN14');
 assert.equal(selectAutomaticHead(4.3,360,3.1,[item]),null);
 const fit=selectAutomaticRadius(4.3,3.1,[item]);assert.ok(fit);assert.equal(fit.catalogId,item.id);
 for(const [radius,pressure] of [[100,3.1],[4.3,.1],[0,3.1],[NaN,3.1]])assert.equal(selectAutomaticRadius(radius,pressure,[item]),null);
});

test('optimized radius preview agrees with independent sector searches across all manufacturers',async()=>{
 const {selectAutomaticRadius,selectAutomaticHead,automaticHeadCatalog}=await load('lib/automatic-head.ts');
 for(const [brand,group] of [['hunter','mp'],['rain-bird','rvan'],['rain-bird','spray-mpr'],['rain-bird','rotor'],['toro','precision'],['k-rain','rotary'],['k-rain','rotor']]){
  const catalog=automaticHeadCatalog(brand,group),arcs=[...new Set([180,360,90,...catalog.flatMap(item=>[item.arcMin,item.arcMax,...(item.allowedArcRanges??[]).flat()])])].filter(arc=>arc>0&&arc<=360);
  for(const pressure of [2.1,3.1,4])for(const radius of [1,3.27,4.17,8.17,10,40]){
   let expected=null;
   for(const arc of arcs){const fit=selectAutomaticHead(radius,arc,pressure,catalog);expected??=fit;if(fit&&!fit.needsReview){expected=fit;break;}}
   assert.deepEqual(selectAutomaticRadius(radius,pressure,catalog),expected,`${brand}: ${radius}m / ${pressure}bar`);
  }
 }
});

test('outer-edge tolerance remains usable at every zoom and never accepts the centre',async()=>{
 const {automaticSectorEdgeHit}=await load('lib/automatic-head.ts');
 for(const px of [2,40,400])for(const radius of [.05,1,20])for(const touch of [false,true]){
  const sector={center:{x:3,y:4},radius,start:0,arc:90};
  assert.equal(automaticSectorEdgeHit(sector,{x:3,y:4+radius},px,touch),true);
  for(const factor of [0,.25,.5,1.5,2])assert.equal(automaticSectorEdgeHit(sector,{x:3,y:4+radius*factor},px,touch),false);
  const tolerance=Math.min((touch?20:12)/px,radius*.25);
  assert.equal(automaticSectorEdgeHit(sector,{x:3,y:4+radius+tolerance*.9},px,touch),true);
  assert.equal(automaticSectorEdgeHit(sector,{x:3,y:4+radius+tolerance*1.1},px,touch),false);
 }
});

test('actual pointer handlers pan with right, Ctrl-click, middle and Space without changing construction or committing',async()=>{
 const source=await readFile('src/components/designer/automatic-head-tool.tsx','utf8');
 const {code}=await transformWithEsbuild(source.slice(source.indexOf(' const point='),source.indexOf(' return <div className="automatic-head-tool"')),'handlers.ts',{loader:'ts'});
 const auto=await load('lib/automatic-head.ts'),{automaticHeadTarget}=await load('components/designer/automatic-head-tool.tsx');
 const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,message??`${actual} != ${expected}`);
 const harness=(pointerType='mouse')=>{
  let center=null,sector=null,hover=null,failed=false,panning=false;const placed=[];
  const draft={current:null},pointers={current:new Map()},blocked={current:false},pinch={current:null},pan={current:null},resumePointer={current:null},gestureStart={current:null};
  const state={pxPerMeter:40,panX:10,panY:20,spaceDown:false,project:{heads:[]},equipmentFilters:{manufacturerId:'hunter'},familyFilter:'mp',activeZoneId:1,setZoom(v){this.pxPerMeter=v},setPan(x,y){this.panX=x;this.panY=y}};
  const captures=[],surface={setPointerCapture(id){captures.push(id);},getBoundingClientRect(){return{left:100,top:60}}};
  const finish=()=>{const value=draft.current;if(auto.selectAutomaticHead(value.radius,value.arc,3.1,auto.automaticHeadCatalog('hunter','mp')))placed.push({center:value.center,radius:value.radius,start:value.start,arc:value.arc});else failed=true;};
  const handlers=()=>{
   const env={...auto,automaticHeadTarget,center,hover,pressure:3.1,gestureStart,draft,setFailed:v=>failed=v,setCenter:v=>center=v,setSector:v=>sector=v,setHover:v=>hover=v,setPanning:v=>panning=v,px:state.pxPerMeter,closeDistance:Math.min(14/state.pxPerMeter,(sector?.radius??1)*.25),finish,pointers,blocked,pinch,pan,resumePointer,useProject:{getState:()=>state},svg:{current:surface},snapSprinklerPoint:p=>({pt:p,kind:'none'}),drawingOrMigrate:()=>null,visibleProjectHeads:()=>[]};
   return new Function(...Object.keys(env),code+';return{down,move,up,cancelPointer,contextMenu};')(...Object.values(env));
  };
  const e=(x,y,id=1,button=0)=>({clientX:x*state.pxPerMeter+state.panX+100,clientY:y*state.pxPerMeter+state.panY+60,pointerId:id,pointerType,button,buttons:button===2?2:button===1?4:0,currentTarget:surface,preventDefault(){},stopPropagation(){}});
  const send=(kind,event)=>handlers()[kind](event),tap=(x,y)=>{send('down',e(x,y));send('up',e(x,y));};
  return{send,e,tap,state,draft,placed,pointers,pan,pinch,resumePointer,captures,read:()=>({center,sector,hover,failed,panning}),edit:patch=>{draft.current=auto.editAutomaticSector(draft.current,patch);sector=draft.current;}};
 };
 for(const stage of ['centre','radius','sector'])for(const gesture of ['right','ctrl','middle','space']){
  const h=harness();h.send('move',h.e(1,2));if(stage!=='centre'){h.tap(1,2);h.send('move',h.e(5,2));}if(stage==='sector'){h.tap(5,2);h.send('move',h.e(1,6));}
  const before=structuredClone(h.read()),oldPan={x:h.state.panX,y:h.state.panY},captures=h.captures.length;
  const button=gesture==='right'?2:gesture==='middle'?1:0,start={...h.e(-3,7,1,button),ctrlKey:gesture==='ctrl',buttons:gesture==='ctrl'?1:gesture==='right'?2:gesture==='middle'?4:1};
  h.state.spaceDown=gesture==='space';h.send('down',start);assert.equal(h.read().panning,true);assert.equal(h.captures.length,captures+1);
  const moved={...start,clientX:start.clientX+57,clientY:start.clientY-23};h.send('move',moved);
  for(const key of ['center','sector','hover'])assert.deepEqual(h.read()[key],before[key],`${gesture}: ${stage} geometry and winding stay unchanged during pan`);
  h.send('up',{...moved,buttons:0,ctrlKey:false});h.state.spaceDown=false;
  assert.equal(h.state.panX,oldPan.x+57);assert.equal(h.state.panY,oldPan.y-23);assert.equal(h.read().panning,false);assert.equal(h.pan.current,null);assert.equal(h.pointers.current.size,0);assert.equal(h.placed.length,0);
  for(const key of ['center','sector','hover'])assert.deepEqual(h.read()[key],before[key]);
  const stationary={...moved,button:0,buttons:0,ctrlKey:false};h.send('move',stationary);h.send('move',stationary);
  for(const key of ['center','sector','hover'])assert.deepEqual(h.read()[key],before[key],`${stage}: stationary moves after pan preserve the draft`);
  if(stage==='sector'){
   const reference={x:-3,y:7},c=before.center,angle=auto.sectorAngle(c,reference)+10,distance=Math.hypot(reference.x-c.x,reference.y-c.y);
   h.send('move',h.e(c.x+distance*Math.cos(angle*Math.PI/180),c.y+distance*Math.sin(angle*Math.PI/180)));
   assert.equal(h.read().sector.arc,100,'resumed movement adds only the new angular delta');assert.equal(h.read().sector.radius,4);
  }else{
   h.send('move',{...stationary,clientX:stationary.clientX+4});assert.notDeepEqual(h.read().hover,before.hover,'real new motion resumes pointer tracking');assert.equal(h.read().sector,null);assert.equal(h.placed.length,0);
  }
 }
 for(const pointerType of ['mouse','touch']){
  const h=harness(pointerType),{e,send,tap}=h;
  send('up',e(1,2));assert.equal(h.read().center,null,'unmatched pointerup does nothing');tap(1,2);tap(5,2);send('move',e(1,6));assert.equal(h.read().sector.arc,90);
  for(const [x,y] of [[1,2],[1.01,2.01]]){tap(x,y);assert.equal(h.placed.length,0);assert.equal(h.read().failed,true);}
  const beforePinch=structuredClone(h.read());send('down',e(5,2));send('down',e(2,6,2));send('move',e(2.5,6,2));const release1=e(5,2),release2=e(2.5,6,2);send('up',release1);send('up',release2);
  assert.equal(h.placed.length,0);assert.deepEqual(h.draft.current,beforePinch.sector,'pinch restores the draft before the first finger moved it');send('move',{...release2,buttons:0});assert.deepEqual(h.draft.current,beforePinch.sector,'stationary pinch release keeps the same sweep');
  const prior=structuredClone(h.read()),right=e(-3,7,1,2);send('down',right);const move={...right,clientX:right.clientX+40,clientY:right.clientY-30};send('move',move);send('cancelPointer',move);send('up',move);
  assert.deepEqual(h.draft.current,prior.sector);assert.equal(h.read().panning,false);assert.equal(h.placed.length,0,'cancelled pan never places');assert.equal(h.pan.current,null);
  send('move',{...move,button:0,buttons:0});assert.deepEqual(h.draft.current,prior.sector,'cancelled pan also rebases the stationary pointer');
  let prevented=false,stopped=false;send('contextMenu',{preventDefault(){prevented=true},stopPropagation(){stopped=true}});assert.equal(prevented,true);assert.equal(stopped,true);assert.equal(h.placed.length,0);
  const cancel=harness(pointerType);cancel.tap(0,0);cancel.tap(4,0);cancel.send('move',cancel.e(0,4));const original=structuredClone(cancel.draft.current);cancel.send('down',cancel.e(4,0));cancel.send('move',cancel.e(0,-4));cancel.send('cancelPointer',cancel.e(0,-4));cancel.send('up',cancel.e(0,-4));assert.deepEqual(cancel.draft.current,original);assert.equal(cancel.placed.length,0);
  const projected=harness(pointerType);projected.tap(1,2);projected.tap(5,2);projected.tap(1,10);assert.deepEqual(projected.placed[0],{center:{x:1,y:2},radius:4,start:0,arc:90});projected.send('up',projected.e(1,10));assert.equal(projected.placed.length,1);
  const repeated=harness(pointerType);repeated.tap(0,0);repeated.tap(4,0);repeated.tap(4,0);repeated.tap(4,0);assert.equal(repeated.placed.length,0);assert.equal(repeated.draft.current.arc,0);repeated.edit({arc:360});repeated.tap(4,0);assert.equal(repeated.placed.at(-1).arc,360);
  const invalid=harness(pointerType);invalid.tap(0,0);invalid.tap(1000,0);invalid.tap(0,1000);assert.equal(invalid.placed.length,0);assert.equal(invalid.read().failed,true);
 }
 const css=await readFile('src/components/designer/automatic-head.css','utf8');assert.match(css,/automatic-head-field\[data-panning="true"\]\{cursor:grabbing\}/);assert.match(source,/data-panning=\{panning\}/);assert.doesNotMatch(source,/radiusDrag/);
});

test('automatic construction snaps only to visible figure contours after centre selection and rechecks the exact release candidate',async()=>{
 const source=await readFile('src/components/designer/automatic-head-tool.tsx','utf8');
 const {code}=await transformWithEsbuild(source.slice(source.indexOf(' const point='),source.indexOf(' return <div className="automatic-head-tool"')),'automatic-snapping.ts',{loader:'ts'});
 const finishCode=source.slice(source.indexOf(' const finish=()=>'),source.indexOf(' useEffect(()=>{',source.indexOf(' const finish=()=>')));
 const auto=await load('lib/automatic-head.ts'),{automaticHeadTarget}=await load('components/designer/automatic-head-tool.tsx');
 const {snapSprinklerPoint}=await load('lib/head-snapping.ts'),{emptyDrawing}=await load('lib/cad/types.ts');
 const {addRect,drawingOrMigrate}=await load('lib/cad/engine.ts'),{visibleProjectHeads}=await load('lib/head-visibility.ts');
 const {useProject:s}=await load('lib/project-store.ts'),{emptyProject}=await load('lib/project-types.ts');
 const near=(p,q)=>assert.ok(Math.hypot(p.x-q.x,p.y-q.y)<1e-8,JSON.stringify({p,q}));
 const drawing=addRect(addRect(emptyDrawing(),{x:4,y:3},{x:8,y:7},'lawn'),{x:10.17,y:10.23},{x:12,y:12},'lawn');
 const hidden=Object.values(drawing.faces).at(-1);drawing.faces[hidden.id]={...hidden,hidden:true};
 const neighbor={id:'other-zone-head',catalogId:'MP2000-90',nozzleId:'MP2000-90',bodyId:'PRO-SPRAY',designPressure:2.8,x:1.2,y:1.2,r:.3,start:0,arc:90,zone:2,locked:false};
 const harness=(pointerType='mouse',figure=drawing,head=neighbor)=>{
  s.setState({project:{...emptyProject(),drawing:figure,heads:[head]},projects:[],past:[],future:[],pastOps:[],futureOps:[],equipmentFilters:{manufacturerId:'hunter'},familyFilter:'mp',workspaceSection:'irrigation',tool:'auto-head',activeZoneId:1,pxPerMeter:40,panX:0,panY:0,snapOn:true,snapGridOn:true,gridStep:.5,spaceDown:false});
  let center=null,sector=null,hover=null,failed=false,pressure=3.1;
  const draft={current:null},pointers={current:new Map()},blocked={current:false},pinch={current:null},pan={current:null},resumePointer={current:null},gestureStart={current:null};
  const surface={setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0}}};
  const setFailed=v=>failed=v;
  const handlers=()=>{
   const finish=new Function('draft','pressure','useProject','setFailed',finishCode+';return finish;')(draft,pressure,s,setFailed);
   const env={...auto,automaticHeadTarget,snapSprinklerPoint,drawingOrMigrate,visibleProjectHeads,center,hover,pressure,gestureStart,draft,setFailed,setCenter:v=>center=v,setSector:v=>sector=v,setHover:v=>hover=v,px:s.getState().pxPerMeter,closeDistance:Math.min(14/s.getState().pxPerMeter,(sector?.radius??1)*.25),finish,pointers,blocked,pinch,pan,resumePointer,setPanning:()=>{},useProject:s,svg:{current:surface}};
   return new Function(...Object.keys(env),code+';return {down,move,up,cancelPointer};')(...Object.values(env));
  };
  const event=(x,y,button=0)=>{const st=s.getState();return{clientX:x*st.pxPerMeter+st.panX,clientY:y*st.pxPerMeter+st.panY,pointerId:1,pointerType,button,buttons:button===2?2:0,currentTarget:surface,preventDefault(){},stopPropagation(){}};};
  const send=(kind,x,y,button=0)=>handlers()[kind](event(x,y,button));
  return{send,tap(x,y){send('down',x,y);send('up',x,y);},read:()=>({center,sector,hover,failed}),setPressure:v=>pressure=v};
 };
 for(const pointerType of ['mouse','touch','pen']){
  const h=harness(pointerType);h.tap(.03,.04);near(h.read().center,{x:0,y:0});
  h.send('move',1.21,1.21);near(h.read().hover,{x:1.21,y:1.21});
  h.send('move',1.51,1.25);near(h.read().hover,{x:1.51,y:1.25});
  h.send('move',4.08,5.73);near(h.read().hover,{x:4,y:5.73});
  h.send('move',4.08,3.02);near(h.read().hover,{x:4,y:3});
  h.send('move',10.2,10.25);near(h.read().hover,{x:10.2,y:10.25});
  s.setState({snapOn:false});h.send('move',4.08,3.02);near(h.read().hover,{x:4.08,y:3.02});s.setState({snapOn:true});
  h.tap(4.08,3.02);assert.equal(h.read().sector.radius,5,'the second point uses the snapped figure corner');
  const fixed=h.read().sector;
  h.send('move',20,15);assert.equal(h.read().sector.radius,5);near(automaticHeadTarget(h.read().center,h.read().hover,h.read().sector),{x:4,y:3});
  h.send('move',-1.23,1.17);assert.equal(h.read().sector.radius,5);assert.equal(h.read().sector.start,fixed.start);
  // A distant rectangle under the physical pointer must not attract the attached endpoint.
  const raw={x:10.2,y:11.9},expected=auto.traceSector(h.read().sector,raw,.35);h.send('move',raw.x,raw.y);
  assert.equal(h.read().sector.arc,expected.arc);
 }
 // Reproduce a second sprinkler whose radius ends exactly on an installed head.
 const square=addRect(emptyDrawing(),{x:0,y:0},{x:4,y:4},'lawn');
 const fit=auto.selectAutomaticHead(4,90,3.1,auto.automaticHeadCatalog('hunter','mp'));assert.ok(fit);
 for(const pointerType of ['mouse','touch','pen'])for(const [cx,cy,ex,ey,insideSign] of [[0,0,4,0,1],[4,0,0,0,-1],[0,4,4,4,-1],[4,4,0,4,1]])for(const sign of [insideSign,-insideSign]){
  const existing={...fit,id:'first-corner',x:ex,y:ey,zone:1,locked:false};
  const h=harness(pointerType,square,existing);h.tap(cx,cy);h.tap(ex,ey);
  assert.equal(h.read().sector.arc,0);assert.equal(s.getState().project.heads.length,1);
  const anchor=auto.sectorAngle({x:cx,y:cy},{x:ex,y:ey});
  const at=deg=>({x:cx+4*Math.cos((anchor+sign*deg)*Math.PI/180),y:cy+4*Math.sin((anchor+sign*deg)*Math.PI/180)});
  for(const degrees of [0,1,2,0]){const p=at(degrees);h.send('move',p.x,p.y);h.tap(p.x,p.y);assert.equal(h.read().sector.arc,0,'corner snapping keeps the unswept sector empty');assert.equal(s.getState().project.heads.length,1,'stationary or tiny repeated taps never install a 360 degree sprinkler');}
  for(const degrees of [45,90,135,181,225,270]){const p=at(degrees);h.send('move',p.x,p.y);assert.equal(h.read().sector.arc,degrees,'both winding directions preserve the selected sweep through and beyond 180 degrees');near(automaticHeadTarget(h.read().center,h.read().hover,h.read().sector),p);}
  for(const degrees of [315,359,360]){const p=at(degrees);h.send('move',p.x,p.y);}
  assert.equal(h.read().sector.arc,360,'an actual full winding still produces a complete circle');
  const inside=at(90);
  // Start again to verify the ordinary quarter-sector commit.
  const quarter=harness(pointerType,square,existing);quarter.tap(cx,cy);quarter.tap(ex,ey);const mid=at(45);quarter.send('move',mid.x,mid.y);quarter.tap(inside.x,inside.y);
  assert.equal(s.getState().project.heads.length,2,'interior and exterior quarter sectors both commit');
  const placed=s.getState().project.heads.at(-1);assert.equal(placed.arc,90);assert.equal(placed.r,4);assert.equal(placed.start,(anchor+(sign<0?-90:0)+360)%360);assert.equal(placed.trace,undefined,'winding metadata never enters the saved head');
 }
 const mouse=harness();mouse.tap(0,0);mouse.send('move',4.4,3.02);near(mouse.read().hover,{x:4.4,y:3});
 const touch=harness('touch');touch.tap(0,0);touch.send('move',4.4,3.02);near(touch.read().hover,{x:4,y:3});
 const release=harness();release.tap(0,0);release.send('move',4,0);release.send('down',4,0);release.send('up',1000,0);
 assert.equal(release.read().sector,null,'green hover cannot authorize an invalid radius at pointer release');assert.equal(release.read().failed,true);
 release.send('down',1000,0);release.send('up',4,0);assert.equal(release.read().sector.radius,4,'a valid release is accepted even after a red pointer-down');
 const changedGroup=harness();changedGroup.tap(0,0);changedGroup.send('down',4,0);s.setState({familyFilter:'bubbler'});changedGroup.send('up',4,0);
 assert.equal(changedGroup.read().sector,null,'second click checks the current group instead of the prior render catalog');
 s.setState({familyFilter:'mp'});changedGroup.send('down',4,0);
 const invalidPeer={...neighbor,id:'invalid-pressure-peer',x:30,y:30,r:4,zone:1,designPressure:100};
 s.setState({project:{...s.getState().project,heads:[invalidPeer]}});changedGroup.send('up',4,0);assert.equal(changedGroup.read().sector,null,'second click reads current zone peers');
 changedGroup.send('down',4,0);s.setState({activeZoneId:2});changedGroup.send('up',4,0);assert.equal(changedGroup.read().sector.radius,4,'current active zone is read at release');
 for(const [brand,group] of [['hunter','mp'],['rain-bird','rvan'],['toro','precision'],['k-rain','rotary']]){
  const invalidRadius=harness();s.setState({equipmentFilters:{manufacturerId:brand},familyFilter:group});invalidRadius.tap(0,0);invalidRadius.tap(1000,0);
  assert.equal(invalidRadius.read().sector,null,brand+': a red radius cannot become a sector');assert.equal(invalidRadius.read().failed,true);assert.equal(s.getState().project.heads.length,1);
 }
 for(const pressure of [null,.1]){const missingPressure=harness();missingPressure.tap(0,0);missingPressure.setPressure(pressure);missingPressure.tap(4,0);assert.equal(missingPressure.read().sector,null);}
 const final=harness();final.tap(0,0);final.tap(4,0);final.send('move',0,4);final.send('down',0,4);final.setPressure(.1);final.send('up',0,4);
 assert.equal(final.read().failed,true);assert.equal(s.getState().project.heads.length,1,'a red final sector never reaches the project');
 final.setPressure(3.1);final.tap(0,4);assert.equal(s.getState().project.heads.length,2,'a valid final sector still commits');
});

test('Escape cancels the actual automatic tool and clears an active pan gesture',async()=>{
 const source=await readFile('src/components/designer/automatic-head-tool.tsx','utf8');
 const cancelSource=source.slice(source.indexOf(' const cancel=()=>'),source.indexOf(' const finish=()=>'));
 const pointers={current:new Map([[7,{x:1,y:2}]])},blocked={current:false},pinch={current:{}},pan={current:{}},resumePointer={current:{x:1,y:2}},gestureStart={current:{}};
 let tool='auto-head',finished=0;
 const env={pointers,blocked,pinch,pan,resumePointer,gestureStart,setPanning:()=>{},useProject:{setState:patch=>tool=patch.tool}};
 const cancel=new Function(...Object.keys(env),cancelSource+';return cancel;')(...Object.values(env));
 const start=source.indexOf('  const onKey='),end=source.indexOf("  window.addEventListener('keydown'",start);
 const {code}=await transformWithEsbuild(source.slice(start,end),'keyboard.ts',{loader:'ts'});
 const onKey=new Function('cancel','finish',code+';return onKey;')(cancel,()=>finished++);
 let prevented=false;onKey({key:'Escape',target:{closest:()=>null},preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(tool,'place');assert.equal(finished,0);assert.equal(pointers.current.size,0);assert.equal(blocked.current,true);
 for(const ref of [pinch,pan,resumePointer,gestureStart])assert.equal(ref.current,null);
});

test('preview draws only a dashed radius until sector sweep and then attaches the target to the fixed outer edge',async()=>{
 const React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server'),{AutomaticHeadPreview}=await load('components/designer/automatic-head-tool.tsx');
 const props={center:{x:1,y:2},hover:{x:5,y:2},sector:null,px:40,panX:10,panY:20,matches:true};
 const render=p=>renderToStaticMarkup(React.createElement('svg',null,React.createElement(AutomaticHeadPreview,{...props,...p})));
 const radius=render({});assert.match(radius,/data-auto-head-radius/);assert.match(radius,/stroke-dasharray="5 4"/);assert.doesNotMatch(radius,/data-auto-head-coverage/);assert.match(radius,/#0f9f82/);
 const sector={center:props.center,radius:4,start:0,arc:0};assert.doesNotMatch(render({sector}),/data-auto-head-coverage/);
 for(const arc of [90,270,360])for(const matches of [true,false]){const markup=render({sector:{...sector,arc},matches});assert.match(markup,/data-auto-head-coverage/);assert.doesNotMatch(markup,/data-auto-head-radius/);assert.ok(markup.includes(matches?'#0f9f82':'#dc2626'));}
 const {traceSector}=await load('lib/automatic-head.ts');
 for(const sign of [1,-1])for(const arc of [45,90,181,270]){
  let draft=sector;
  for(const angle of [...Array.from({length:Math.floor(arc/45)},(_,i)=>(i+1)*45),arc])draft=traceSector(draft,{x:1+4*Math.cos(sign*angle*Math.PI/180),y:2+4*Math.sin(sign*angle*Math.PI/180)},.3);
  const markup=render({sector:draft,hover:{x:100,y:100}}),path=markup.match(/data-auto-head-coverage[^>]*d="([^"]+)"/)[1];
  const coordinates=path.match(/-?(?:\d*\.)?\d+(?:e[-+]?\d+)?/g).map(Number),a=draft.start*Math.PI/180,b=(draft.start+draft.arc)*Math.PI/180;
  const expected=[50,100,50+160*Math.cos(a),100+160*Math.sin(a),160,160,0,arc>180?1:0,1,50+160*Math.cos(b),100+160*Math.sin(b)];
  assert.equal(coordinates.length,expected.length);coordinates.forEach((n,i)=>assert.ok(Math.abs(n-expected[i])<1e-8,'canonical clockwise SVG arc closes onto the correct fixed/moving boundary'));
  const actualTarget=markup.match(/data-sprinkler-target[^>]*translate\(([^ ]+) ([^)]+)\)/).slice(1).map(Number),moving=sign*arc*Math.PI/180;
  assert.ok(Math.abs(actualTarget[0]-(50+160*Math.cos(moving)))<1e-8);assert.ok(Math.abs(actualTarget[1]-(100+160*Math.sin(moving)))<1e-8,'counterclockwise target follows the moving edge, not the fixed anchor');
 }
 assert.match(render({matches:false}),/#dc2626/);
 const target=markup=>markup.match(/data-sprinkler-target[^>]*translate\(([^ ]+) ([^)]+)\)/).slice(1).map(Number);
 assert.deepEqual(target(render({center:null})),[210,100],'target follows the pointer before centre selection');
 assert.deepEqual(target(radius),[210,100],'target follows the endpoint while choosing the radius');
 for(const px of [2,40,400])for(const arc of [0,60,90,180,270,360])for(const hover of [{x:1,y:3},{x:1,y:10},null]){
  const actual=target(render({px,sector:{...sector,arc},hover})),angle=arc*Math.PI/180;
  assert.ok(Math.abs(actual[0]-((1+4*Math.cos(angle))*px+10))<1e-8);
  assert.ok(Math.abs(actual[1]-((2+4*Math.sin(angle))*px+20))<1e-8,'fixed-radius target remains attached to the sector edge at every zoom');
 }
});

test('available pressure remains the input budget while working pressure and regulator explanation describe the actual selected body',async()=>{
 const React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server'),{AutomaticHeadPanel}=await load('components/designer/automatic-head-tool.tsx');
 const {LocalizedNumberInput}=await load('components/designer/localized-number-input.tsx'),{useProject}=await load('lib/project-store.ts');
 const {selectAutomaticHead,automaticHeadCatalog}=await load('lib/automatic-head.ts'),{itemById,bodiesFor}=await load('lib/equipment-catalog.ts');
 const {text:t,activeLocale,setActiveLocale}=await load('lib/i18n.ts'),{catalogName}=await load('lib/catalog-localization.ts'),{fromBar,formatPressureU}=await load('lib/units.ts');
 const mp=selectAutomaticHead(4,90,3.1,automaticHeadCatalog('hunter','mp')),spray=selectAutomaticHead(2.51,60,3.1,automaticHeadCatalog('hunter','he'));
 assert.equal(mp.designPressure,2.8);assert.equal(spray.designPressure,2.1);
 const base={groupLabel:'MP',center:{x:0,y:0},sector:null,radius:4,pressure:3.1,failed:false,cancel(){},finish(){},restart(){},setPressure(){},editSector(){}};
 const elements=node=>React.isValidElement(node)?[node,...React.Children.toArray(node.props.children).flatMap(elements)]:[];
 const priorLocale=activeLocale();
 try{for(const locale of ['en','ru','ar','he'])for(const pressureUnit of ['bar','psi']){
  setActiveLocale(locale);const units={...useProject.getState().units,pressure:pressureUnit};
  for(const fit of [mp,spray]){
   const props={...base,units,fit},tree=AutomaticHeadPanel(props),input=elements(tree).find(node=>node.type===LocalizedNumberInput);
   assert.equal(input.props.value,fromBar(3.1,pressureUnit),'changing the selected working pressure never overwrites the available-pressure input');
   const markup=renderToStaticMarkup(React.createElement(AutomaticHeadPanel,props)),body=itemById(fit.bodyId);
   assert.ok(markup.includes(t('autoHead.pressure')));assert.ok(markup.includes(t('workingPressure')));assert.ok(markup.includes(formatPressureU(fit.designPressure,pressureUnit)));
   assert.match(markup,/data-auto-head-regulated/);assert.ok(markup.includes('\u2068'+catalogName(body)+'\u2069'),'body name is directionally isolated within the localized explanation');
   const nominal=renderToStaticMarkup(React.createElement(AutomaticHeadPanel,{...props,pressure:body.regulatedPressureBar}));assert.doesNotMatch(nominal,/data-auto-head-regulated/,'no reduction explanation when supply equals the regulator setting');
   const unregulated=bodiesFor(itemById(fit.catalogId)).find(b=>b.regulatedPressureBar==null);assert.ok(unregulated);
   assert.doesNotMatch(renderToStaticMarkup(React.createElement(AutomaticHeadPanel,{...props,fit:{...fit,bodyId:unregulated.id,designPressure:3.1}})),/data-auto-head-regulated/);
  }
  const rotor=selectAutomaticHead(8.17,137,3.1,automaticHeadCatalog('rain-bird','rotor'));assert.ok(rotor);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(AutomaticHeadPanel,{...base,units,fit:rotor})),/data-auto-head-regulated/,'integrated rotor body is not an external regulating body');
  const rb=itemById('rain-bird:5Q'),row=rb.nozzles[0].performance.at(-1),alias=selectAutomaticHead(row.radiusM,row.arcDeg,2.1,[rb]);assert.ok(alias);assert.ok(alias.designPressure<2.1);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(AutomaticHeadPanel,{...base,units,pressure:2.1,fit:alias})),/data-auto-head-regulated/,'documented psi/bar table equivalence alone is not pressure reduction');
 }}finally{setActiveLocale(priorLocale);}
});

test('controls live in the inspector, announce actual matches, isolate canvas events and have every locale message',async()=>{
 const React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server'),{AutomaticHeadTool,AutomaticHeadPanel}=await load('components/designer/automatic-head-tool.tsx');
 const {useProject}=await load('lib/project-store.ts'),{selectAutomaticRadius,selectAutomaticHead,automaticHeadCatalog}=await load('lib/automatic-head.ts');
 const markup=renderToStaticMarkup(React.createElement(AutomaticHeadTool));assert.match(markup,/automatic-head-field/);assert.doesNotMatch(markup,/automatic-head-panel/);
 let cancelled=0;const fit=selectAutomaticRadius(4,3.1),props={groupLabel:'MP Standard',center:{x:1,y:2},sector:null,radius:4,fit,pressure:3.1,failed:false,units:useProject.getState().units,cancel(){cancelled++},finish(){},restart(){},setPressure(){},editSector(){}};
 const render=p=>renderToStaticMarkup(React.createElement(AutomaticHeadPanel,{...props,...p}));
 const matched=render({});assert.match(matched,/data-match="true"/);assert.match(matched,/role="status"/);assert.ok(!matched.includes('autoHead.'));assert.match(matched,/MP Standard/);assert.doesNotMatch(matched,/\{group\}/);assert.match(matched,/automatic-head-cancel-hint/);
 assert.match(render({fit:null}),/data-match="false"/);
 const mpr=selectAutomaticHead(7.6,180,3.1,automaticHeadCatalog('rain-bird','rvan'));assert.ok(mpr?.nozzleId?.includes('5000-MPR'));
 assert.match(render({fit:mpr}),/5000-MPR-25 Half/,'rotor result identifies the selected MPR nozzle');
 const panel=AutomaticHeadPanel(props);for(const event of ['onClick','onPointerDown','onPointerMove','onPointerUp','onTouchStart','onTouchMove','onWheel','onKeyDown']){let stopped=false;panel.props[event]({key:'a',stopPropagation(){stopped=true}});assert.equal(stopped,true,event);}
 let prevented=false,stopped=false;panel.props.onContextMenu({preventDefault(){prevented=true},stopPropagation(){stopped=true}});assert.equal(cancelled,0);assert.equal(prevented,true);assert.equal(stopped,true);
 panel.props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){}});assert.equal(cancelled,1);
 const {LOCALES}=await load('lib/locale-config.ts');
 for(const locale of LOCALES){const d=JSON.parse(await readFile(`src/lib/locales/${locale.id??locale}.json`,'utf8'));for(const key of ['title','center','radius','sector','pressure','needPressure','noMatch','restart','place','scope','cancelHint','regulatedPressure','flowUnknown','radiusPreview','edgeRequired'])assert.ok(d['autoHead.'+key]);}
});
