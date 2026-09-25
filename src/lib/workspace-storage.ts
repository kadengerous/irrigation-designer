import type { PersistStorage, StorageValue } from "zustand/middleware";
import { emptyProject, type Project } from "./project-types";
import { validProject } from "./project-validation";

export type TrashedProject = { project: Project; deletedAt: string };
type Workspace = { project: Project; projects: Project[]; trash?: TrashedProject[]; [key: string]: unknown };
type Snapshot = { data: string; checksum: string };
type ProjectRecord = { current: Snapshot; previous?: Snapshot; deletedAt?: string };
const RETENTION = 30 * 86400_000;
export const retainedTrash = (trash: TrashedProject[], now = Date.now()) => trash.filter(t => Number.isFinite(Date.parse(t.deletedAt)) && now - Date.parse(t.deletedAt) < RETENTION);
export function seal(value: unknown): Snapshot {
  const data = JSON.stringify(value); return { data, checksum: checksum(data) };
}
function checksum(data: string) {
  let h = 2166136261; for (let i=0;i<data.length;i++) h = Math.imul(h ^ data.charCodeAt(i),16777619);
  return (h >>> 0).toString(16);
}
export function unseal<T>(record?: Snapshot): T | null {
  if (!record || typeof record.data !== "string" || checksum(record.data) !== record.checksum) return null;
  try { return JSON.parse(record.data) as T; } catch { return null; }
}
let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  return database ??= new Promise<IDBDatabase>((resolve,reject) => {
    const request = indexedDB.open("irrigation-workspace",2);
    request.onupgradeneeded = () => {
      for (const name of ["state","projects","assets"]) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database=undefined; }; resolve(request.result); };
    request.onerror = () => { database=undefined; reject(request.error); };
    request.onblocked = () => failed();
  });
}
function txFor(db: IDBDatabase, mode: IDBTransactionMode) {
  try { return db.transaction(["state","projects","assets"],mode,{durability:"strict"}); }
  catch { return db.transaction(["state","projects","assets"],mode); }
}
const complete = (tx: IDBTransaction) => new Promise<void>((resolve,reject) => {
  tx.oncomplete=()=>resolve(); tx.onerror=tx.onabort=()=>reject(tx.error ?? new Error("Storage transaction failed"));
});
const get = <T>(request: IDBRequest<T>) => new Promise<T>((resolve,reject) => {request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
let reported = false;
function failed() {
  if (!reported && typeof window !== "undefined" && window.dispatchEvent) { reported=true; window.dispatchEvent(new Event("project-storage-error")); }
}
const assetIds = new Map<string,string>();
const durableAssets = new Set<string>();
function externalize(p: Project, assets: Map<string,string>): Project {
  if (!p.underlay) return p;
  const ref = (data: string) => {
    if (!data.startsWith("data:")) return data;
    let id = assetIds.get(data);
    if (!id) { id = `asset:${crypto.randomUUID()}`; assetIds.set(data,id); }
    if(!durableAssets.has(id)) assets.set(id,data); return id;
  };
  return {...p,underlay:{...p.underlay,src:ref(p.underlay.src),...(p.underlay.source ? {source:{...p.underlay.source,data:ref(p.underlay.source.data)}} : {})}};
}
function materialize(p: Project, assets: Map<string,string>): Project | null {
  if (!p.underlay) return p;
  const read = (s: string) => s.startsWith("asset:") ? assets.get(s) : s;
  const src = read(p.underlay.src), source = p.underlay.source;
  if (!src || source && !read(source.data)) return null;
  return {...p,underlay:{...p.underlay,src,...(source ? {source:{...source,data:read(source.data)!}} : {})}};
}
let last = new Map<string,{project:Project;deletedAt?:string}>();
const encoded = new WeakMap<Project,Snapshot>();
let pending: {name:string;value:StorageValue<Workspace>} | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<void> = Promise.resolve();
let previousInput: Workspace | undefined;
let latestInput: {name:string;value:StorageValue<Workspace>} | undefined;
let durableInput: Workspace | undefined;
const same = (a:Workspace|undefined,b:Workspace) => a && Object.keys(b).every(k => a[k] === b[k]);

async function write(name:string,value:StorageValue<Workspace>) {
  const state=value.state, trash=retainedTrash(state.trash ?? []);
  const entries = new Map<string,{project:Project;deletedAt?:string}>(state.projects.map(project=>[project.id,{project}]));
  entries.set(state.project.id,{project:state.project});
  trash.forEach(t=>entries.set(t.project.id,t));
  const db=await openDatabase(), assets=new Map<string,string>();
  const changed = [...entries].filter(([id,entry])=>last.get(id)?.project !== entry.project || last.get(id)?.deletedAt !== entry.deletedAt);
  const snapshots = changed.map(([id,entry])=>{
    if (!validProject(entry.project)) throw new Error("Invalid project state");
    let snapshot=encoded.get(entry.project);
    const portable=externalize(entry.project,assets);
    if (!snapshot) { snapshot=seal(portable); encoded.set(entry.project,snapshot); }
    return {id,entry,snapshot};
  });
  const {project,projects,trash:_,...prefs}=state;
  const meta=seal({version:value.version,state:{...prefs,projectId:project.id,projectIds:[...entries].filter(([,e])=>!e.deletedAt).map(([id])=>id)}});
  const tx=txFor(db,"readwrite"), done=complete(tx), records=tx.objectStore("projects"), store=tx.objectStore("state");
  for(const [id,data] of assets) tx.objectStore("assets").put(data,id);
  for(const {id,entry,snapshot} of snapshots) {
    const request=records.get(id);
    request.onsuccess=()=>{
      const old=request.result as ProjectRecord|undefined;
      const candidate=old && unseal<Project>(old.current);
      const previous=candidate && validProject(candidate) ? old!.current : old?.previous;
      records.put({current:snapshot,previous,deletedAt:entry.deletedAt} satisfies ProjectRecord,id);
    };
  }
  const removed=[...last.keys()].filter(id=>!entries.has(id));
  for(const id of removed) records.delete(id);
  const oldMeta=store.get(`workspace:${name}`);
  oldMeta.onsuccess=()=>{ if(unseal(oldMeta.result)) store.put(oldMeta.result,`previous:${name}`); store.put(meta,`workspace:${name}`); };
  const removedAssets:string[]=[];
  if(removed.length) {
    const all=records.getAll();
    all.onsuccess=()=>{
      const used=new Set<string>();
      for(const rec of all.result as ProjectRecord[]) for(const snapshot of [rec.current,rec.previous]) {
        const p=unseal<Project>(snapshot); for(const s of [p?.underlay?.src,p?.underlay?.source?.data]) if(s?.startsWith("asset:")) used.add(s);
      }
      for(const {snapshot} of snapshots) {const p=unseal<Project>(snapshot); for(const s of [p?.underlay?.src,p?.underlay?.source?.data]) if(s?.startsWith("asset:")) used.add(s);}
      const cursor=tx.objectStore("assets").openCursor(); cursor.onsuccess=()=>{const c=cursor.result;if(!c)return;if(!used.has(String(c.key))){removedAssets.push(String(c.key));c.delete();}c.continue();};
    };
  }
  store.delete(name);
  await done;
  for(const id of assets.keys()) durableAssets.add(id);
  for(const id of removedAssets) durableAssets.delete(id);
  last=entries; reported=false; durableInput=state;
  try {
    localStorage.removeItem(name);
    // A late completion must not remove a newer close-time recovery journal.
    if(latestInput?.value.state===state) localStorage.removeItem(`${name}:pending`);
    localStorage.removeItem(`${name}:fallback`); localStorage.removeItem(`${name}:backup`);
  } catch { /* Database is durable. */ }
}

function fallback(name:string,value:StorageValue<Workspace>) {
  try {
    const current=localStorage.getItem(`${name}:fallback`);
    if(current && unseal(JSON.parse(current))) {
      const old=unseal<StorageValue<Workspace>>(JSON.parse(current))!;
      const ids=new Set([value.state.project.id,...value.state.projects.map(p=>p.id),...(value.state.trash??[]).map(t=>t.project.id)]);
      const deleted=[old.state.project,...old.state.projects,...(old.state.trash??[]).map(t=>t.project)].some(p=>!ids.has(p.id));
      if(deleted) localStorage.removeItem(`${name}:backup`); else localStorage.setItem(`${name}:backup`,current);
    }
    localStorage.setItem(`${name}:fallback`,JSON.stringify(seal(value)));
    localStorage.removeItem(name);
    return true;
  } catch { failed(); return false; }
}
export function flushProjectStorage(): Promise<void> {
  if(timer) clearTimeout(timer); timer=undefined;
  const next=pending; pending=null;
  if(next) queue=queue.then(async()=>{
    try { await write(next.name,next.value); }
    catch { if(!fallback(next.name,next.value)) { pending ??= next; failed(); } }
  });
  return queue;
}
async function read(name:string): Promise<StorageValue<Workspace>|null> {
  let fromDb:StorageValue<Workspace>|null=null;
  let loadedAssets=new Map<string,string>();
  try {
    const db=await openDatabase(), tx=txFor(db,"readonly"), done=complete(tx);
    const [meta,backup,records,assetValues,assetKeys,legacy]=await Promise.all([
      get(tx.objectStore("state").get(`workspace:${name}`)),get(tx.objectStore("state").get(`previous:${name}`)),
      get(tx.objectStore("projects").getAll()),get(tx.objectStore("assets").getAll()),
      get(tx.objectStore("assets").getAllKeys()),get(tx.objectStore("state").get(name)),
    ]); await done;
    const assets=new Map(assetKeys.map((key,i)=>[String(key),assetValues[i] as string]));
    loadedAssets=assets;
    for(const [id,data] of assets) {assetIds.set(data,id);durableAssets.add(id);}
    const envelope=unseal<any>(meta) ?? unseal<any>(backup);
    const projects:Project[]=[],trash:TrashedProject[]=[];
    for(const rec of records as ProjectRecord[]) {
      const candidates=[unseal<Project>(rec.current),unseal<Project>(rec.previous)];
      const p=candidates.map(p=>p && validProject(p) ? materialize(p,assets) : null).find(Boolean);
      if(!p) {failed();continue;}
      if(rec.deletedAt) trash.push({project:p,deletedAt:rec.deletedAt}); else projects.push(p);
    }
    if(projects.length || trash.length) {
      const state=envelope?.state ?? {}, project=projects.find(p=>p.id===state.projectId) ?? projects[0] ?? emptyProject();
      if(project) fromDb={version:envelope?.version,state:{...state,project,projects,trash}};
      last=new Map([...projects.map(project=>[project.id,{project}] as const),...trash.map(t=>[t.project.id,t] as const)]);
    } else if(legacy) { try {fromDb=JSON.parse(legacy);} catch { failed(); } }
  } catch { /* Private mode / unsupported IndexedDB: use the verified fallback. */ }
  try {
    for(const key of [`${name}:pending`,`${name}:fallback`,`${name}:backup`]) {
      const text=localStorage.getItem(key); if(!text) continue;
      const candidate=unseal<StorageValue<Workspace>>(JSON.parse(text));
      if(candidate?.state && validProject(candidate.state.project)) {
        const embedded=(candidate as StorageValue<Workspace>&{assets?:[string,string][]}).assets??[];
        const assets=new Map([...loadedAssets,...embedded]);
        const project=materialize(candidate.state.project,assets);
        const projects=candidate.state.projects.map(p=>materialize(p,assets)).filter((p):p is Project=>!!p);
        const trash=(candidate.state.trash??[]).flatMap(t=>{const project=materialize(t.project,assets);return project?[{...t,project}]:[];});
        if(project && projects.length===candidate.state.projects.length && trash.length===(candidate.state.trash??[]).length) return {...candidate,state:{...candidate.state,project,projects,trash}};
      }
    }
    if(!fromDb) {const old=localStorage.getItem(name);if(old) return JSON.parse(old);}
  } catch { failed(); }
  return fromDb;
}
/** Keep object references until the write queue runs; no full JSON dump per pointer move. */
export const projectStorage: PersistStorage<Workspace> = {
  async getItem(name) { if(typeof window==="undefined") return null; await flushProjectStorage(); return read(name); },
  setItem(name,value) {
    if(typeof window==="undefined" || same(previousInput,value.state)) return;
    previousInput=value.state; pending={name,value}; latestInput=pending;
    timer ??= setTimeout(()=>void flushProjectStorage(),100);
  },
  async removeItem(name) {
    await flushProjectStorage();
    const db=await openDatabase(),tx=txFor(db,"readwrite"),done=complete(tx);
    for(const s of ["projects","assets"]) tx.objectStore(s).clear();
    for(const k of [name,`workspace:${name}`,`previous:${name}`]) tx.objectStore("state").delete(k);
    await done;last.clear();previousInput=undefined;
    for(const k of [name,`${name}:pending`,`${name}:fallback`,`${name}:backup`]) localStorage.removeItem(k);
  },
};
export function attachStorageLifecycle() {
  const flush=()=>{void flushProjectStorage();};
  const checkpoint=()=>{checkpointProjectStorage();flush();};
  const hide=()=>{if(document.visibilityState==="hidden") checkpoint();};
  window.addEventListener("pointerup",flush); window.addEventListener("keyup",flush);
  window.addEventListener("pagehide",checkpoint); document.addEventListener("visibilitychange",hide);
  return ()=>{checkpoint();window.removeEventListener("pointerup",flush);window.removeEventListener("keyup",flush);window.removeEventListener("pagehide",checkpoint);document.removeEventListener("visibilitychange",hide);};
}
/** Short synchronous journal covers normal closure while an asynchronous write is pending. */
export function checkpointProjectStorage() {
  if(!latestInput || latestInput.value.state===durableInput) return;
  const {name,value}=latestInput,assets=new Map<string,string>(),s=value.state;
  try {
    const state={...s,project:externalize(s.project,assets),projects:s.projects.map(p=>externalize(p,assets)),trash:(s.trash??[]).map(t=>({...t,project:externalize(t.project,assets)}))};
    localStorage.setItem(`${name}:pending`,JSON.stringify(seal({...value,state,assets:[...assets]})));
  } catch { failed(); }
}
