import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test("sector handles, inspector state, manufacturer limits and undo share one geometry", async () => {
  const oldStorage = globalThis.localStorage, oldWindow = globalThis.window;
  const memory = new Map();
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key,value) => memory.set(key,value), removeItem: key => memory.delete(key) };
  const server = await createServer({ server: { middlewareMode:true, hmr:false } });
  try {
    const {sectorDrag,sectorPoint,sectorHandlePoints} = await server.ssrLoadModule("/src/lib/head-sector-edit.ts");
    const {itemById,placeableCatalog} = await server.ssrLoadModule("/src/lib/hunter-catalog.ts");
    const {catalogHeadDefaults,headFlow,pressureSteps,radiusRange} = await server.ssrLoadModule("/src/lib/flow.ts");
    const {zoneFlow,zonePressure} = await server.ssrLoadModule("/src/lib/hydro.ts");
    const {emptyProject} = await server.ssrLoadModule("/src/lib/project-types.ts");
    const {canShowMagnifier} = await server.ssrLoadModule("/src/components/designer/canvas-magnifier-model.ts");
    globalThis.window = { localStorage:globalThis.localStorage };
    const {useProject} = await server.ssrLoadModule("/src/lib/project-store.ts");
    const item = itemById("I-20");
    const head = {...catalogHeadDefaults(item), id:"edit", catalogId:item.id, zone:1, x:12, y:8, start:350, arc:90, locked:false};
    const bounds = {arcMin:40,arcMax:360};
    const at = angle => sectorPoint(head,head.r,angle);
    let drag = sectorDrag(head,"rotation",at(350),bounds);
    close(drag(at(5)).start,5);
    close(drag(at(355)).start,355);
    drag = sectorDrag(head,"start",at(350),bounds);
    const start = drag(at(5));
    close(start.start,5); close(start.arc,75);
    close((start.start+start.arc)%360,(head.start+head.arc)%360);
    close(drag(at(90)).arc,40);
    drag = sectorDrag(head,"end",at(80),bounds);
    close(drag(at(100)).arc,110);
    for (const angle of [180,260,340,60]) drag(at(angle));
    close(drag(at(100)).arc,360);
    const r = sectorDrag(head,"radius",at(35),bounds)(sectorPoint(head,head.r-1,35));
    close(r.r,head.r-1);

    for (const model of placeableCatalog().filter(i => i.arcMin===360 && !i.strip && i.coverageKind!=="point")) {
      const full={...head,...catalogHeadDefaults(model),catalogId:model.id};
      assert.deepEqual(sectorHandlePoints(full,model,40).map(h=>h.kind),model.coverageKind==='square'?["radius","rotation"]:["radius"],model.id);
    }
    for (const model of placeableCatalog().filter(i=>i.strip)) {
      assert.deepEqual(sectorHandlePoints({...head,...catalogHeadDefaults(model)},model,40).map(h=>h.kind),["rotation"],model.id);
    }
    const bothEnds = sectorHandlePoints({...head,arc:360},item,40).filter(h=>h.kind==="start"||h.kind==="end");
    assert.ok(Math.hypot(bothEnds[0].point.x-bothEnds[1].point.x,bothEnds[0].point.y-bothEnds[1].point.y)*40>=27.99,"full arc handles remain separate");

    const initial={...emptyProject(),heads:[head],zones:[{id:1,name:"Зона 1",locked:false,hidden:false}]};
    useProject.setState({project:initial,panX:11,panY:22,pxPerMeter:40,selectedId:null,selectedIds:[],sectorEditId:null,past:[],future:[],pastOps:[],futureOps:[]});
    useProject.getState().setSectorEdit(head.id);
    assert.equal(useProject.getState().sectorEditId,head.id);
    assert.deepEqual(useProject.getState().selectedIds,[head.id]);
    assert.equal(useProject.getState().tool,"place");
    useProject.getState().beginHeadEdit();
    useProject.getState().patchHeadLive(head.id,{r:8,arc:180,start:75});
    const changed=useProject.getState().project.heads[0];
    close(changed.arc,180); close(changed.start,75);
    const limits=radiusRange(item,changed.nozzleId,changed.designPressure,changed.arc);
    assert.ok(changed.r>=limits.min && changed.r<=limits.max);
    close(zoneFlow(useProject.getState().project.heads,1),headFlow(changed).lpm);
    close(zonePressure(useProject.getState().project.heads,1),changed.designPressure);
    assert.equal(useProject.getState().past.length,0,"live dragging does not flood undo");
    useProject.getState().endHeadEdit();
    assert.equal(useProject.getState().past.length,1);
    useProject.getState().undo();
    assert.deepEqual(useProject.getState().project.heads,[head]);
    useProject.getState().redo();
    assert.deepEqual(useProject.getState().project.heads,[changed]);

    // Inspector edits update the exact head used to position all canvas handles.
    const pressure=pressureSteps(item,changed.nozzleId,changed.arc)[0];
    useProject.getState().updateHead(head.id,{designPressure:pressure,arc:120,start:25});
    const inspector=useProject.getState().project.heads[0];
    const radiusHandle=sectorHandlePoints(inspector,item,40).find(h=>h.kind==="radius");
    close(Math.hypot(radiusHandle.point.x-head.x,radiusHandle.point.y-head.y),inspector.r);
    close(zoneFlow(useProject.getState().project.heads,1),headFlow(inspector).lpm);
    const history=useProject.getState().past.length;
    useProject.getState().beginHeadEdit();
    useProject.getState().patchHeadLive(head.id,{r:999,arc:360,start:200});
    useProject.getState().cancelHeadEdit();
    assert.deepEqual(useProject.getState().project.heads,[inspector]);
    assert.equal(useProject.getState().past.length,history,"cancel leaves history intact");
    useProject.getState().beginHeadEdit(); useProject.getState().endHeadEdit();
    assert.equal(useProject.getState().past.length,history,"a handle tap is not a change");
    const beforeMove=useProject.getState().project.heads[0];
    const centerDrag=sectorDrag(beforeMove,"center",{x:beforeMove.x+.2,y:beforeMove.y+.1},item);
    useProject.getState().beginHeadEdit();
    useProject.getState().patchHeadLive(head.id,centerDrag({x:beforeMove.x+2.37,y:beforeMove.y+1.56}));
    const movedHead=useProject.getState().project.heads[0];
    close(movedHead.x,beforeMove.x+2.17); close(movedHead.y,beforeMove.y+1.46);
    assert.deepEqual({...movedHead,x:beforeMove.x,y:beforeMove.y},beforeMove,"moving the centre preserves nozzle, pressure, radius, arc and direction");
    assert.equal(useProject.getState().sectorEditId,head.id,"moving does not leave sector editing");
    useProject.getState().endHeadEdit();
    assert.equal(useProject.getState().past.length,history+1);
    useProject.getState().undo();
    assert.deepEqual(useProject.getState().project.heads,[beforeMove]);
    useProject.getState().redo();
    assert.deepEqual(useProject.getState().project.heads,[movedHead]);
    useProject.getState().beginHeadEdit();
    useProject.getState().patchHeadLive(head.id,{x:0,y:0});
    useProject.getState().cancelHeadEdit();
    assert.deepEqual(useProject.getState().project.heads,[movedHead],"interrupted movement restores the centre");
    assert.deepEqual([useProject.getState().panX,useProject.getState().panY,useProject.getState().pxPerMeter],[11,22,40]);
    useProject.getState().selectHead(null);
    assert.equal(useProject.getState().sectorEditId,null);
    useProject.getState().updateHead(head.id,{locked:true});
    useProject.getState().setSectorEdit(head.id);
    assert.equal(useProject.getState().sectorEditId,null,"locked heads do not enter edit mode");

    const magnifier={blocked:false,catalogOpen:true,editDrag:true,tool:"place",drawSub:"none",cadEditId:null,selectedEdgeId:null,draftPointCount:0};
    assert.equal(canShowMagnifier(magnifier),false);
    assert.equal(canShowMagnifier({...magnifier,sectorEditId:head.id}),true);
    assert.equal(canShowMagnifier({...magnifier,sectorEditId:head.id,blocked:true}),false);
    assert.equal(canShowMagnifier({...magnifier,sectorEditId:head.id,editDrag:false}),false);

    // An empty zone needs no transfer target, even if the other zone is locked.
    useProject.setState({project:{...initial,zones:[{...initial.zones[0],locked:true},{id:2,name:"Зона 2",locked:false,hidden:false}]}});
    useProject.getState().removeZone(2);
    assert.equal(useProject.getState().project.zones.length,1);
    assert.deepEqual(useProject.getState().project.heads,[head]);
    const last=useProject.getState().project;
    useProject.getState().removeZone(1);
    assert.equal(useProject.getState().project,last);
  } finally {
    await server.close();
    if(oldStorage) globalThis.localStorage=oldStorage; else delete globalThis.localStorage;
    if(oldWindow) globalThis.window=oldWindow; else delete globalThis.window;
  }
});

test("sprinkler hold activates once and cancels on movement, release, pinch and blur", async t => {
  const server=await createServer({server:{middlewareMode:true,hmr:false}});
  const {startSprinklerHold}=await server.ssrLoadModule("/src/components/designer/sprinkler-hold.ts");
  await server.close();
  const oldWindow=globalThis.window;
  globalThis.window=new EventTarget();
  t.mock.timers.enable({apis:["setTimeout"]});
  const down={pointerId:1,clientX:50,clientY:60};
  let count=0;
  const fire=(type,props={})=>window.dispatchEvent(Object.assign(new Event(type),down,props));
  try {
    startSprinklerHold(down,()=>count++);
    t.mock.timers.tick(499); assert.equal(count,0);
    t.mock.timers.tick(1); assert.equal(count,1);
    t.mock.timers.tick(1000); assert.equal(count,1);
    for (const [type,props] of [["pointermove",{clientX:59}],["pointerup",{}],["pointercancel",{}],["pointerdown",{pointerId:2}],["blur",{}]]) {
      startSprinklerHold(down,()=>count++);
      fire(type,props); t.mock.timers.tick(600);
      assert.equal(count,1,type);
    }
    const cancel=startSprinklerHold(down,()=>count++);
    cancel(); t.mock.timers.tick(600); assert.equal(count,1,"unmount cancels pending hold");
  } finally {
    t.mock.timers.reset();
    if(oldWindow) globalThis.window=oldWindow; else delete globalThis.window;
  }
});
