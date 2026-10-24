import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer,transformWithEsbuild} from 'vite';
test('empty-canvas mouse/touch taps clear landscape editing, sprinkler multi-selection and zone focus',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false}});
 try{
  const {useProject}=await server.ssrLoadModule('/src/lib/project-store.ts');
  const source=await readFile('src/components/designer/design-canvas.tsx','utf8');
  const start=source.indexOf('  const clearEmptyCanvasSelection =');
  const end=source.indexOf('    if (st.tool === "scale") {',start);
  const js=(await transformWithEsbuild(source.slice(start,end)+'\n};','handler.tsx',{loader:'tsx'})).code;
  let cleared=0;
  const env={useProject,textEditor:null,segmentEditTapConsumed:{current:false},pinchGestureActive:{current:false},pinching:false,pinchSuppressClickUntil:{current:0},lineTapGuardUntil:{current:0},skipClick:{current:false},editDrag:{current:false},toWorld:()=>({x:0,y:0}),finishSegmentEditOnTap:()=>false,applySnap:p=>({pt:p}),readOnly:false,simulationActive:false};
  for(const name of ['setSelectedNote','setSelectedDimension','setDimensionEditor','setPickList'])env[name]=()=>{};
  env.onSelectionClear=()=>cleared++;
  const handle=new Function(...Object.keys(env),js+';return handleClick;')(...Object.values(env));
  const stage={},bg={name:()=> 'bg',getStage:()=>stage},object={name:()=> 'landscape-object',getStage:()=>stage};
  for(const workspaceSection of ['landscape','irrigation'])for(const evt of [{button:0},{touches:[]}]){
   useProject.setState({workspaceSection,tool:workspaceSection==='irrigation'?'place':null,spaceDown:false,drawSub:'none',pendingLandscapeObject:null,pendingCatalogPlant:null,selectedLandscapeId:'furniture',selectedPlantId:'plant',selectedId:'a',selectedIds:['a','b'],sectorEditId:'a',zoneFocus:{projectId:useProject.getState().project.id,zoneId:1,headId:null},groupMemberId:null});
   const original=useProject.getState().project,before=cleared;
   handle({target:bg,evt});
   const state=useProject.getState();
   for(const key of ['selectedLandscapeId','selectedPlantId','selectedId','sectorEditId','zoneFocus'])assert.equal(state[key],null,key);
   assert.deepEqual(state.selectedIds,[]);assert.equal(state.workspaceSection,workspaceSection);assert.equal(state.project,original);assert.equal(cleared,before+1);
  }
  useProject.setState({tool:'place',selectedId:'a',selectedIds:['a']});
  handle({target:object,evt:{button:0}});assert.equal(useProject.getState().selectedId,'a','object click is not empty space');
  env.editDrag.current=true;handle({target:bg,evt:{button:0}});assert.equal(useProject.getState().selectedId,'a','drag release is not deselection');
 }finally{await server.close();}
});
