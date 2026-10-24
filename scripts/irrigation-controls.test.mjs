import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("pressure defaults, zone transfers, deletion and pump demand stay consistent", async () => {
  const savedStorage = globalThis.localStorage, savedWindow = globalThis.window;
  const memory = new Map();
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key,value) => memory.set(key,value), removeItem: key => memory.delete(key) };
  const server = await createServer({ server:{middlewareMode:true,hmr:false} });
  try {
    const {placeableCatalog,itemById,workingPressureBar} = await server.ssrLoadModule("/src/lib/hunter-catalog.ts");
    const {catalogHeadDefaults,headFlow,boundedPressure,pressureSteps} = await server.ssrLoadModule("/src/lib/flow.ts");
    const {zoneFlow,zonePressure,recommendPump} = await server.ssrLoadModule("/src/lib/hydro.ts");
    const {emptyProject} = await server.ssrLoadModule("/src/lib/project-types.ts");
    globalThis.window = {localStorage:globalThis.localStorage};
    const {useProject} = await server.ssrLoadModule("/src/lib/project-store.ts");
    for (const item of placeableCatalog()) {
      const defaults = catalogHeadDefaults(item);
      const recommended=workingPressureBar(item,defaults.bodyId,defaults.nozzleId);
      assert.equal(defaults.designPressure,boundedPressure(pressureSteps(item,defaults.nozzleId,defaults.arc),recommended)??recommended,item.id);
    }
    const makeHead = (id,model,zone) => ({...catalogHeadDefaults(itemById(model)),id,catalogId:model,zone,x:10,y:15,start:20,locked:false});
    const heads = [makeHead("a","I-20",1),makeHead("b","I-20",2),makeHead("c","G-75-B",2)];
    const zones = [1,2,3].map(id=>({id,name:`Зона ${id}`,locked:false,hidden:false}));
    const initial = {...emptyProject(),heads,zones,water:{...emptyProject().water,elevationM:5}};
    useProject.setState({project:initial,selectedIds:[],selectedId:null,selectedPolyIds:["old-layer"],selectedPolyId:"old-layer",past:[],future:[]});
    useProject.getState().selectHeads(["a","c"]);
    assert.deepEqual(useProject.getState().selectedPolyIds,[],"head selection clears stale layer actions");
    assert.equal(useProject.getState().selectedPolyId,null);
    const oldZone2Flow=zoneFlow(heads,2);
    useProject.getState().assignSelectedToZone(3);
    let project=useProject.getState().project;
    assert.deepEqual(project.heads.map(h=>h.zone),[3,2,3]);
    assert.equal(zoneFlow(project.heads,1),0);
    assert.ok(Math.abs(zoneFlow(project.heads,2)-(oldZone2Flow-headFlow(heads[2]).lpm))<1e-8);
    assert.equal(zonePressure(project.heads,1),0);
    assert.equal(zonePressure(project.heads,2),heads[1].designPressure);
    assert.equal(zonePressure(project.heads,3),Math.max(heads[0].designPressure,heads[2].designPressure));
    assert.deepEqual(project.heads.map(({zoneAssignment,...h})=>({...h,zone:1})),heads.map(h=>({...h,zone:1})),"zone transfer does not change nozzle, geometry or pressure settings");
    assert.ok(project.heads.filter(h=>["a","c"].includes(h.id)).every(h=>h.zoneAssignment==="manual"),"explicit transfers retain manual membership");
    const pump=recommendPump(project);
    assert.equal(pump.zoneId,3);
    assert.ok(Math.abs(pump.qLpm-zoneFlow(project.heads,3)*1.1)<1e-8);
    assert.ok(Math.abs(pump.pBar-(Math.max(...heads.map(h=>h.designPressure))+0.6+5*0.0981))<1e-8);
    assert.equal(useProject.getState().past.length,1,"one transfer = one undo entry");
    useProject.getState().undo();
    assert.deepEqual(useProject.getState().project.heads,heads);
    useProject.getState().redo();
    useProject.getState().selectHeads(["a","c"]);
    project=useProject.getState().project;
    useProject.getState().assignSelectedToZone(999);
    assert.equal(useProject.getState().project,project,"no orphan zone assignment");
    useProject.getState().updateHead("c",{designPressure:5.5});
    project=useProject.getState().project;
    assert.equal(zonePressure(project.heads,3),5.5);
    assert.equal(recommendPump(project).workingBar,5.5);
    useProject.getState().deleteSelected();
    project=useProject.getState().project;
    assert.deepEqual(project.heads.map(h=>h.id),["b"]);
    assert.equal(recommendPump(project).zoneId,1);
    assert.deepEqual(useProject.getState().selectedIds,[]);
    useProject.getState().undo();
    assert.equal(useProject.getState().project.heads.length,3);
    useProject.getState().removeHead("b");
    assert.deepEqual(useProject.getState().project.heads.map(h=>h.id),["a","c"]);
    assert.equal(zoneFlow(useProject.getState().project.heads,2),0);
    assert.deepEqual(useProject.getState().project.zones.map(z=>z.id),[1],"remaining zones are renumbered from one with their assignments");

    const {redistributeZonesAfterRemoval,projectZoneLimit}=await server.ssrLoadModule("/src/lib/hydro.ts");
    const packedHeads=[makeHead("p1","I-20",1),makeHead("p2","I-20",1),makeHead("p3","I-20",2),makeHead("p4","I-20",2)];
    const singleFlow=headFlow(packedHeads[0]).lpm;
    const packed={...emptyProject(),heads:packedHeads,zones,zoneFlowLimitLpm:singleFlow*2,
      water:{...emptyProject().water,availableLpm:singleFlow*10}};
    useProject.setState({project:packed,selectedIds:["p2","p4"],selectedId:"p2",activeZoneId:2,past:[],future:[]});
    useProject.getState().deleteSelected();
    const consolidated=useProject.getState().project;
    assert.deepEqual(consolidated.heads.map(h=>h.zone),[1,1],"deletion fills freed capacity in compatible zones");
    assert.deepEqual(consolidated.heads.map(h=>({...h,zone:0})),[packedHeads[0],packedHeads[2]].map(h=>({...h,zone:0})),"reassignment preserves all geometry/nozzle/pressure settings");
    assert.deepEqual(consolidated.zones.map(z=>z.id),[1]);
    assert.equal(zoneFlow(consolidated.heads,1),singleFlow*2);
    assert.equal(useProject.getState().activeZoneId,1,"removed active zone gets a valid replacement");
    assert.equal(useProject.getState().past.length,1,"deletion and redistribution share one undo");
    useProject.getState().undo();
    assert.deepEqual(useProject.getState().project.heads,packed.heads);
    assert.deepEqual(useProject.getState().project.zones,packed.zones);
    useProject.getState().redo();
    assert.deepEqual(useProject.getState().project.heads,consolidated.heads);
    useProject.getState().removeHead("p1");
    useProject.getState().removeHead("p3");
    assert.equal(useProject.getState().project.heads.length,0);
    assert.equal(useProject.getState().project.zones.length,1,"only the initial working zone remains after deleting all heads");
    assert.equal(recommendPump(useProject.getState().project),null);

    const oneRemoved={...packed,heads:packedHeads.filter(h=>h.id!=="p2")};
    const capacity=redistributeZonesAfterRemoval(oneRemoved);
    assert.equal(capacity.zones.length,2,"retained user flow limit prevents overpacking");
    assert.ok(capacity.zones.every(z=>zoneFlow(capacity.heads,z.id)<=singleFlow*2+1e-8));
    assert.equal(projectZoneLimit({...packed,water:{...packed.water,availableLpm:singleFlow}}),singleFlow);
    const lockProtected=redistributeZonesAfterRemoval({...oneRemoved,zones:zones.map(z=>({...z,locked:z.id===2}))});
    assert.deepEqual(lockProtected.heads,oneRemoved.heads,"locked zone membership stays intact");
    const plantProtected=redistributeZonesAfterRemoval({...oneRemoved,drawing:{plants:{plant:{irrigation:{zoneId:2}}}}});
    assert.deepEqual(plantProtected.heads,oneRemoved.heads,"plant-linked zones are preserved");
    assert.ok(plantProtected.zones.some(z=>z.id===2));
    const incompatible={...packed,heads:[packedHeads[0],makeHead("golf","G-75-B",2)],zoneFlowLimitLpm:1e5};
    assert.deepEqual(redistributeZonesAfterRemoval(incompatible).heads,incompatible.heads,"different irrigation classes do not merge");
    const unknown={...heads[0],catalogId:"missing-model"};
    assert.equal(zonePressure([unknown],1),null);
    assert.equal(recommendPump({...initial,heads:[unknown]}),null);

    // The inspector can remove any non-last zone and explicitly move its objects.
    useProject.setState({project:initial,selectedId:"a",selectedIds:["a"],activeZoneId:1,past:[],future:[]});
    useProject.getState().removeZone(1,3);
    project=useProject.getState().project;
    assert.deepEqual(project.heads.map(h=>h.zone),[2,1,1]);
    assert.equal(project.heads.length,heads.length,"deleting a zone never deletes sprinklers");
    assert.deepEqual(project.heads.map(h=>({...h,zone:0})),heads.map(h=>({...h,zone:0})));
    assert.equal(useProject.getState().activeZoneId,2,"active zone follows the chosen destination after renumbering");
    assert.equal(project.zones.length,2);
    useProject.getState().undo();
    assert.deepEqual(useProject.getState().project.heads,heads);
    assert.deepEqual(useProject.getState().project.zones,zones);
    useProject.getState().addZone("a");
    assert.equal(useProject.getState().project.heads[0].zone,4,"new zone immediately receives the inspected head");
    useProject.getState().removeZone(4,2);
    assert.equal(useProject.getState().project.heads[0].zone,2);
    const beforeInvalid=useProject.getState().project;
    useProject.getState().removeZone(2,2);
    assert.equal(useProject.getState().project,beforeInvalid,"cannot transfer into the zone being removed");
    useProject.getState().removeZone(3,1);
    useProject.getState().removeZone(2,1);
    const last=useProject.getState().project;
    useProject.getState().removeZone(1);
    assert.equal(useProject.getState().project,last,"the last zone is preserved");
  } finally {
    await server.close();
    if(savedStorage)globalThis.localStorage=savedStorage;else delete globalThis.localStorage;
    if(savedWindow)globalThis.window=savedWindow;else delete globalThis.window;
  }
});

test("wheel zoom is anchored to the mouse for pixel, line, page and pinch events", async () => {
  const server=await createServer({server:{middlewareMode:true,hmr:false}});
  try {
    const {wheelCanvasView,zoomCanvasAt}=await server.ssrLoadModule("/src/lib/canvas-navigation.ts");
    const view={pxPerMeter:40,panX:85,panY:-33}, pointer={x:351,y:229};
    const world={x:(pointer.x-view.panX)/view.pxPerMeter,y:(pointer.y-view.panY)/view.pxPerMeter};
    const check=next=>{
      assert.ok(Math.abs((pointer.x-next.panX)/next.pxPerMeter-world.x)<1e-9);
      assert.ok(Math.abs((pointer.y-next.panY)/next.pxPerMeter-world.y)<1e-9);
    };
    for(const mode of [0,1,2])for(const pinch of [false,true]) {
      const zoomIn=wheelCanvasView(view,pointer.x,pointer.y,-3,mode,800,pinch);
      const zoomOut=wheelCanvasView(view,pointer.x,pointer.y,3,mode,800,pinch);
      assert.ok(zoomIn.pxPerMeter>view.pxPerMeter);assert.ok(zoomOut.pxPerMeter<view.pxPerMeter);
      check(zoomIn);check(zoomOut);
    }
    for(const target of [0.001,1e7])check(zoomCanvasAt(view,pointer.x,pointer.y,target));
    assert.deepEqual(wheelCanvasView(view,pointer.x,pointer.y,0,0,800),view);
  }finally{await server.close();}
});
