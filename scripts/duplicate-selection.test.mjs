import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true,hmr:false}});
const {useProject}=await server.ssrLoadModule('/src/lib/project-store.ts');
const {emptyProject}=await server.ssrLoadModule('/src/lib/project-types.ts');
const {emptyDrawing}=await server.ssrLoadModule('/src/lib/cad/types.ts');
const {addRect,mergeLayers,layerRepresentatives}=await server.ssrLoadModule('/src/lib/cad/engine.ts');
await server.close();
function fixture(){
 useProject.setState({project:emptyProject(),past:[],future:[],pastOps:[],futureOps:[],cadEditId:null,groupMemberId:null,selectedPolyIds:[],selectedPolyId:null,selectedEdgeId:null,selectedIds:[],selectedId:null});
 const d=addRect(emptyDrawing(),{x:0,y:0},{x:4,y:3},'lawn');
 const original=Object.keys(d.faces)[0];
 useProject.getState().commitDrawing(d,original);useProject.getState().setCadEdit(original);
 useProject.getState().duplicateSelected();
 const st=useProject.getState(),copy=st.selectedPolyId;
 assert.notEqual(copy,original);assert.equal(st.cadEditId,null);
 st.selectPoly(original,true);
 assert.equal(useProject.getState().selectedPolyIds.length,2);
 return {original,copy};
}
test('duplicating an edited figure allows selecting both and deleting them',()=>{
 fixture();useProject.getState().deleteSelected();
 assert.equal(Object.keys(useProject.getState().project.drawing.faces).length,0);
});
test('original and duplicate can be grouped, and additive selection exits single-object editing',()=>{
 const {original,copy}=fixture();
 useProject.getState().setCadEdit(original);useProject.getState().selectPoly(copy,true);
 const st=useProject.getState();assert.equal(st.cadEditId,null);
 assert.equal(st.selectedPolyIds.length,2);
 const grouped=mergeLayers(st.project.drawing,st.selectedPolyIds);
 st.commitDrawing(grouped,original,true);st.selectPoly(original);
 assert.equal(layerRepresentatives(useProject.getState().project.drawing).length,1);
});
