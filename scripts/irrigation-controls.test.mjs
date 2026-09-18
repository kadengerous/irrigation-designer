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
    const {catalogHeadDefaults,headFlow} = await server.ssrLoadModule("/src/lib/flow.ts");
    const {zoneFlow,zonePressure,recommendPump} = await server.ssrLoadModule("/src/lib/hydro.ts");
    const {emptyProject} = await server.ssrLoadModule("/src/lib/project-types.ts");
    globalThis.window = {localStorage:globalThis.localStorage};
    const {useProject} = await server.ssrLoadModule("/src/lib/project-store.ts");
    for (const item of placeableCatalog()) {
      const defaults = catalogHeadDefaults(item);
      assert.equal(defaults.designPressure,workingPressureBar(item,defaults.bodyId,defaults.nozzleId),item.id);
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
    assert.deepEqual(project.heads.map(h=>({...h,zone:1})),heads.map(h=>({...h,zone:1})),"zone transfer does not change nozzle, geometry or pressure settings");
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
    assert.equal(recommendPump(project).zoneId,2);
    assert.deepEqual(useProject.getState().selectedIds,[]);
    useProject.getState().undo();
    assert.equal(useProject.getState().project.heads.length,3);
    useProject.getState().removeHead("b");
    assert.deepEqual(useProject.getState().project.heads.map(h=>h.id),["a","c"]);
    assert.equal(zoneFlow(useProject.getState().project.heads,2),0);
    const unknown={...heads[0],catalogId:"missing-model"};
    assert.equal(zonePressure([unknown],1),null);
    assert.equal(recommendPump({...initial,heads:[unknown]}),null);
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
