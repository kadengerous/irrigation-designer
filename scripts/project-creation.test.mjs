import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';

test('project cancellation restores the previous project without saving an empty draft',async()=>{
  const memory=new Map();
  globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
  globalThis.window={localStorage:globalThis.localStorage,dispatchEvent(){},setTimeout(){},requestAnimationFrame:callback=>setImmediate(callback),cancelAnimationFrame:clearImmediate};
  const server=await createServer({server:{middlewareMode:true,hmr:false}});
  try {
    const {useProject:store,projectRequiresName}=await server.ssrLoadModule('/src/lib/project-store.ts');
    await new Promise(resolve=>{if(store.persist.hasHydrated())resolve();else{const off=store.persist.onFinishHydration(()=>{off();resolve();});}});
    const {emptyProject}=await server.ssrLoadModule('/src/lib/project-types.ts');
    const {projectDetails}=await server.ssrLoadModule('/src/components/designer/projects-submenu.tsx');
    const previous=emptyProject('Garden');
    previous.meta.client='Customer';previous.meta.phone='+7 123 456';
    store.setState({project:previous,projects:[],trash:[],panX:32,panY:64,pxPerMeter:48});
    store.getState().saveCurrentToLibrary();
    store.getState().newProject();
    assert.equal(store.getState().projectFormOpen,true,'new projects ask for a name immediately');
    assert.equal(projectRequiresName(store.getState().project,store.getState().projects),true);
    const draftId=store.getState().project.id;
    store.getState().saveCurrentToLibrary();
    assert.equal(store.getState().projects.some(p=>p.id===draftId),false);
    store.getState().setProjectFormOpen(true);
    store.getState().cancelProjectForm();
    assert.equal(store.getState().project.id,previous.id);
    assert.equal(store.getState().project.meta.phone,previous.meta.phone);
    assert.deepEqual([store.getState().panX,store.getState().panY,store.getState().pxPerMeter],[32,64,48]);
    assert.equal(store.getState().projectFormOpen,false);
    assert.deepEqual(store.getState().projects.map(p=>p.id),[previous.id]);
    assert.equal(store.getState().trash.length,0);

    store.getState().newProject();store.getState().newProject();store.getState().cancelProjectForm();
    assert.equal(store.getState().project.id,previous.id,'repeated creation still returns to the last real project');
    store.getState().newProject();store.getState().patchProject({name:'Saved garden'});
    assert.equal(projectRequiresName(store.getState().project,store.getState().projects),false,'saving a name enables the workspace');
    assert.equal(store.getState().workspaceSection,null,'saving a name does not enter Plan automatically');
    const savedId=store.getState().project.id;
    store.getState().cancelProjectForm();
    assert.equal(store.getState().project.id,savedId,'closing an existing project form preserves that project');
    store.getState().newProject();
    store.getState().patchProject({meta:{...store.getState().project.meta,notes:'Keep this draft'}});
    const editedId=store.getState().project.id;
    assert.ok(store.getState().projects.some(p=>p.id===editedId),'first project mutation still autosaves without geometry or a name');
    store.getState().cancelProjectForm();
    assert.equal(store.getState().project.id,editedId,'cancellation does not discard a previously edited project');

    const blank=emptyProject();blank.meta.phone='  ';
    assert.deepEqual(projectDetails(blank),[],'automatic date and empty values do not reveal the arrow');
    assert.deepEqual(projectDetails(previous),[{key:'client',value:'Customer'},{key:'phone',value:'+7 123 456'}]);
    store.setState({project:blank,projects:[],newProjectReturnId:null,past:[]});
    store.getState().cancelProjectForm();
    assert.equal(store.getState().project.id,blank.id);
    assert.deepEqual(store.getState().projects,[],'first launch can close without creating a saved project');
    assert.equal(projectRequiresName(store.getState().project,store.getState().projects),true,'cancelling without saved projects leaves the workspace locked');
    store.getState().patchProject({name:'Only project'});
    store.getState().removeLibrary(store.getState().project.id);
    assert.equal(store.getState().projectFormOpen,true,'deleting the last project asks for the next project name');
    assert.equal(projectRequiresName(store.getState().project,store.getState().projects),true);
  } finally {await server.close();}
});
