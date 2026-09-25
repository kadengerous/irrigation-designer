import test, {before,after} from "node:test";
import assert from "node:assert/strict";
import { indexedDB, IDBObjectStore } from "fake-indexeddb";
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
let server,store,storage,file,emptyProject,catalog,flow,original,errors=0;
const memory=new Map();
const key="irrigation-designer-v3";
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const complete=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);});
async function database(){return request(indexedDB.open("irrigation-workspace",2));}
async function record(id){const db=await database();return request(db.transaction("projects").objectStore("projects").get(id));}
before(async()=>{
  globalThis.indexedDB=indexedDB;
  globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
  globalThis.window={localStorage:globalThis.localStorage,dispatchEvent:e=>{if(e.type==="project-storage-error")errors++;},setTimeout};
  server=await createServer({server:{middlewareMode:true,hmr:false}});
  ({emptyProject}=await server.ssrLoadModule("/src/lib/project-types.ts"));
  catalog=await server.ssrLoadModule("/src/lib/hunter-catalog.ts");flow=await server.ssrLoadModule("/src/lib/flow.ts");
  original=emptyProject("Сад 庭園");original.id="legacy-current";
  original.underlay={src:"data:image/png;base64,"+"A".repeat(250000),source:{name:"plan.pdf",mime:"application/pdf",data:"data:application/pdf;base64,UEZERg=="},name:"plan.pdf",x:3,y:4,width:20,height:10,opacity:.5,rotation:20,locked:true,visible:true};
  memory.set(key,JSON.stringify({state:{project:original,projects:[original,emptyProject("Second")],locale:"ru"},version:0}));
  storage=await server.ssrLoadModule("/src/lib/workspace-storage.ts");
  file=await server.ssrLoadModule("/src/lib/project-file.ts");
  ({useProject:store}=await server.ssrLoadModule("/src/lib/project-store.ts"));
  if(!store.persist.hasHydrated())await new Promise(resolve=>{const off=store.persist.onFinishHydration(()=>{off();resolve();});});
});
after(async()=>{await storage?.flushProjectStorage();await server?.close();delete globalThis.window;delete globalThis.localStorage;delete globalThis.indexedDB;});

test("legacy migration writes independent projects and embeds original reference without losing the working copy",async()=>{
  assert.equal(store.getState().project.name,"Сад 庭園");
  store.getState().saveCurrentToLibrary();await storage.flushProjectStorage();
  const saved=await storage.projectStorage.getItem(key);
  assert.equal(saved.state.projects.length,2);
  assert.deepEqual(saved.state.project.underlay,original.underlay);
  const raw=await record(original.id),packed=storage.unseal(raw.current);
  assert.ok(packed.underlay.src.startsWith("asset:"));
  assert.ok(!raw.current.data.includes("A".repeat(200000)),"images are stored independently");
  assert.equal(memory.has(key),false);
});
test("every edit, final sprinkler movement, undo and redo persists without manual Save",async()=>{
  const item=catalog.itemById("MP2000-360");
  const head={...flow.catalogHeadDefaults(item),id:"head-a",catalogId:item.id,x:1,y:2,start:0,arc:360,zone:1,popUpMm:100,locked:false};
  store.getState().patchProject({heads:[head]});
  store.getState().finishMoveHead(head.id,{x:7,y:9});
  await storage.flushProjectStorage();
  let saved=await storage.projectStorage.getItem(key);
  assert.deepEqual([saved.state.project.heads[0].x,saved.state.project.heads[0].y],[7,9]);
  store.getState().undo();await storage.flushProjectStorage();
  saved=await storage.projectStorage.getItem(key);assert.equal(saved.state.project.heads[0].x,1);
  store.getState().redo();await storage.flushProjectStorage();
  saved=await storage.projectStorage.getItem(key);assert.equal(saved.state.project.heads[0].x,7);
  assert.equal(saved.state.projects.find(p=>p.id===saved.state.project.id).heads[0].x,7);
});
test("portable .ird retains editable data and imports as a separate internal project",async()=>{
  const p=store.getState().project;
  const payload=file.toProjectFile({project:p,showCoverage:true,showLabels:true,showGrid:false,snapOn:true,snapGridOn:false,gridStep:.25,measureUnit:"m",activeZoneId:1});
  assert.equal(file.FILE_EXT,"ird");
  const parsed=file.parseProjectFile(JSON.stringify(payload));assert.deepEqual(parsed.project,p);
  store.getState().importPacked(parsed.project,parsed);await storage.flushProjectStorage();
  assert.notEqual(store.getState().project.id,p.id);
  assert.deepEqual(store.getState().project.underlay,p.underlay);
  assert.equal(store.getState().project.heads[0].x,p.heads[0].x);
  assert.ok(store.getState().projects.some(x=>x.id===p.id));
  for(const malformed of ["null","[]","{}",'{"type":"pdf"}',JSON.stringify({...payload,schemaVersion:999}),JSON.stringify({...payload,project:{...p,heads:[{...p.heads[0],x:"wrong"}]}})]) assert.throws(()=>file.parseProjectFile(malformed));
});
test("Trash persists for 30 days, restores all data and permanent deletion removes both revisions",async()=>{
  const p=store.getState().project;
  store.getState().removeLibrary(p.id);await storage.flushProjectStorage();
  assert.notEqual(store.getState().project.id,p.id);assert.equal(store.getState().trash[0].project.id,p.id);
  assert.ok((await record(p.id)).deletedAt);
  store.getState().restoreLibrary(p.id);await storage.flushProjectStorage();
  assert.ok(!store.getState().trash.some(t=>t.project.id===p.id));assert.ok(store.getState().projects.some(x=>x.id===p.id));
  store.getState().removeLibrary(p.id);await storage.flushProjectStorage();
  store.getState().purgeLibrary(p.id);await storage.flushProjectStorage();
  assert.equal(await record(p.id),undefined);
  const now=Date.now();assert.equal(storage.retainedTrash([{project:p,deletedAt:new Date(now-30*86400000).toISOString()}],now).length,0);
  assert.equal(storage.retainedTrash([{project:p,deletedAt:new Date(now-29*86400000).toISOString()}],now).length,1);
});
test("corrupt latest snapshot recovers the previous valid revision including assets",async()=>{
  store.getState().patchProject({name:"Before failure"});await storage.flushProjectStorage();
  store.getState().patchProject({name:"Latest"});await storage.flushProjectStorage();
  const id=store.getState().project.id,raw=await record(id);assert.ok(raw.previous);
  const db=await database(),tx=db.transaction("projects","readwrite"),done=complete(tx);
  tx.objectStore("projects").put({...raw,current:{...raw.current,data:'{"truncated":'}},id);await done;
  const loaded=await storage.projectStorage.getItem(key);
  assert.equal(loaded.state.project.name,"Before failure");assert.deepEqual(loaded.state.project.underlay,original.underlay);
});
test("interrupted transaction keeps a usable database revision and uses a verified fallback",async()=>{
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args){if(this.name==="projects"){this.transaction.abort();throw new Error("Simulated disk failure");}return put.apply(this,args);};
  try {store.getState().patchProject({name:"Fallback revision"});await storage.flushProjectStorage();}
  finally {IDBObjectStore.prototype.put=put;}
  const recovered=await storage.projectStorage.getItem(key);assert.equal(recovered.state.project.name,"Fallback revision");
  assert.ok(await record(store.getState().project.id));
  store.getState().patchProject({name:"Recovered database"});await storage.flushProjectStorage();
  assert.equal(memory.has(`${key}:fallback`),false);
});
test("XLSX is a valid OOXML archive with quantities stored as numbers",async()=>{
  const {estimateWorkbook}=await server.ssrLoadModule("/src/lib/estimate-xlsx.ts");
  const blob=estimateWorkbook([["№","Оборудование","Количество","Единица"],[1,"MP Rotator",7,"шт."]],"Смета",true);
  const archive=unzipSync(new Uint8Array(await blob.arrayBuffer()));
  assert.ok(archive["[Content_Types].xml"]);const xml=strFromU8(archive["xl/worksheets/sheet1.xml"]);
  assert.ok(xml.includes('<c r="C2"><v>7</v></c>'));assert.ok(xml.includes('rightToLeft="1"'));
});
test("new blank project is listed immediately; close-time journal and reopening retain the final state",async()=>{
  const before=store.getState().project.id;
  store.getState().newProject();
  const id=store.getState().project.id;assert.notEqual(id,before);
  assert.ok(store.getState().projects.some(p=>p.id===id));
  store.getState().patchProject({name:"Last action before closing"});
  storage.checkpointProjectStorage();
  const checkpoint=storage.unseal(JSON.parse(memory.get(`${key}:pending`)));
  assert.equal(checkpoint.state.project.name,"Last action before closing");
  await storage.flushProjectStorage();
  assert.equal(memory.has(`${key}:pending`),false);
  await store.persist.rehydrate();
  assert.equal(store.getState().project.name,"Last action before closing");
});
test("purging the final reference owner removes assets; re-importing that reference remains safe",async()=>{
  const p={...emptyProject("Unique reference"),underlay:{...original.underlay,src:"data:image/png;base64,VU5JUVVF",source:undefined}};
  store.getState().importPacked(p);await storage.flushProjectStorage();
  const id=store.getState().project.id,raw=storage.unseal((await record(id)).current),asset=raw.underlay.src;
  store.getState().removeLibrary(id);store.getState().purgeLibrary(id);await storage.flushProjectStorage();
  const db=await database();assert.equal(await request(db.transaction("assets").objectStore("assets").get(asset)),undefined);
  store.getState().importPacked(p);await storage.flushProjectStorage();
  const saved=await storage.projectStorage.getItem(key);assert.equal(saved.state.project.underlay.src,p.underlay.src);
});
test("all 20 locales include the new lifecycle and export actions",async()=>{
  for(const locale of ["en","ru","es","pt-BR","fr","it","de","ar","tr","pl","zh-CN","nl","cs","el","hu","ro","sk","he","uk","ja"]){
    const messages=JSON.parse(await readFile(`src/lib/locales/${locale}.json`,"utf8"));
    for(const key of ["saveProjectCopy","openEditableProject","projectTrash","purgeProjectWarning","exportMaterialsHint"])assert.ok(messages[key]?.length,`${locale}: ${key}`);
  }
});
