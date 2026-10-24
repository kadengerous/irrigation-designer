import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true,hmr:false}});
const load=p=>server.ssrLoadModule(`/src/lib/${p}.ts`);
const e=await load('cad/engine'),{emptyDrawing}=await load('cad/types');
const {attachedSegmentFigures,resolveAttachedSegmentFigure}=await load('cad/attached-segment-figures');
const {cutFigures}=await load('cad/cut-figures');
const {useProject:store}=await load('project-store'),{emptyProject}=await load('project-types');
const {itemById}=await load('hunter-catalog'),{catalogHeadDefaults}=await load('flow');
const {diagnosticCoverage}=await load('diagnostic-coverage');
const {irrigationSurfaces,surfaceArea,pointInSurface,intersectSurface}=await load('irrigation-geometry');
await server.close();

function fixture(cut=false){
 let d=e.addRect(emptyDrawing(),{x:0,y:0},{x:3,y:20},'lawn');
 d=e.addPointShape(d,[[15,0],[18,0],[18,14],[12,14],[12,12],[11,12],[11,11],[10,11],[7,7],[7,4],[15,4]].map(([x,y])=>({x,y})),'lawn');
 for(const [a,b] of [[{x:3,y:4},{x:7,y:4}],[{x:3,y:7},{x:7,y:7}]])d=e.segmentLayers(e.addDrawingLines(d,[a,b],'lawn'));
 const candidate=attachedSegmentFigures(d)[0];assert.ok(candidate);
 let result=resolveAttachedSegmentFigure(d,candidate.key,cut?'merge':'separate');
 if(cut){result=cutFigures(result.drawing,[{x:3,y:4},{x:3,y:7}]);result=cutFigures(result.drawing,[{x:7,y:4},{x:7,y:7}]);}
 d=e.cloneDrawing(result.drawing);
 const bridge=Object.keys(d.faces).find(id=>Math.abs(e.faceArea(d,id)-12)<1e-6);assert.ok(bridge);
 const idAt=p=>Object.keys(d.faces).find(id=>e.headInsideFace(d,id,p));
 const heads=[[3,4,1],[7,7,2],[1.5,16,1],[15,7,2]].map(([x,y,zone],i)=>({
  ...catalogHeadDefaults(itemById('MP2000-360')),id:`head-${i}`,catalogId:'MP2000-360',x,y,zone,start:0,arc:360,r:2.5,
  figureId:idAt(zone===1?{x:1,y:16}:{x:16,y:10}),
 }));
 const project={...emptyProject(),drawing:d,polygons:e.toPolygons(d),heads,zones:[1,2].map(id=>({id,name:`Zone ${id}`,nameKind:'custom',hidden:false,locked:false}))};
 return {project,bridge};
}
function reset(project){store.setState({project,past:[],future:[],pastOps:[],futureOps:[],groupMemberId:null,groupMemberGroupId:null,
 selectedIds:[],selectedId:null,selectedPolyIds:[],selectedPolyId:null,selectedEdgeId:null,selectedPlantId:null,cadEditId:null,tool:null,drawSub:'none'});}

for(const cut of [false,true])test(`deleting ${cut?'a cut piece':'an attached bridge'} preserves equipment, zones and neighbouring contours`,()=>{
 const {project,bridge}=fixture(cut);reset(project);
 store.getState().selectPoly(bridge);store.getState().deleteSelected();
 const next=store.getState().project;
 assert.equal(next.drawing.faces[bridge],undefined);
 assert.deepEqual(next.heads,project.heads,'shared-boundary sprinklers belong to the irrigation plan');
 assert.deepEqual(next.zones,project.zones,'no automatic redistribution from a drawing deletion');
 for(const id of Object.keys(project.drawing.faces).filter(id=>id!==bridge)){
  assert.deepEqual(next.drawing.faces[id],project.drawing.faces[id]);
  assert.deepEqual(e.facePoints(next.drawing,id),e.facePoints(project.drawing,id));
 }
 assert.ok(diagnosticCoverage(next));
 store.getState().setCatalogOpen(true);
 assert.equal(store.getState().workspaceSection,'irrigation');
 assert.deepEqual(store.getState().project.heads,project.heads);assert.deepEqual(store.getState().project.zones,project.zones);
 store.getState().undo();assert.deepEqual(store.getState().project.drawing,project.drawing);
 store.getState().redo();assert.deepEqual(store.getState().project.heads,project.heads);assert.deepEqual(store.getState().project.zones,project.zones);
});

test('no-irrigation bridge has no hatching, while both watered figures keep their coverage map',()=>{
 const {project,bridge}=fixture(true);reset(project);store.getState().setLayerPurpose(bridge,'none');
 const next=store.getState().project,{target,excluded}=irrigationSurfaces(next),bands=diagnosticCoverage(next);
 assert.ok(bands);assert.equal(surfaceArea(target),162);assert.equal(surfaceArea(excluded),12);
 for(const id of Object.keys(next.drawing.faces).filter(id=>id!==bridge)){
  const single={...next,drawing:{...next.drawing,faces:{[id]:next.drawing.faces[id]}}};
  const region=irrigationSurfaces(single).target;
  assert.ok(surfaceArea(intersectSurface(bands.dry,region))>0);
  assert.ok(surfaceArea(intersectSurface(bands.single,region))>0);
 }
 for(const band of Object.values(bands))assert.equal(surfaceArea(intersectSurface(band,excluded)),0);
 assert.deepEqual(next.heads,project.heads);assert.deepEqual(next.zones,project.zones);
 store.getState().undo();assert.equal(surfaceArea(irrigationSurfaces(store.getState().project).target),174);
});

test('missing nozzle geometry on an excluded bridge does not switch off other figures',()=>{
 const {project,bridge}=fixture();reset(project);store.getState().setLayerPurpose(bridge,'none');
 const normal=store.getState().project,base=diagnosticCoverage(normal);
 const mixed={...normal,heads:[...normal.heads,{...normal.heads[0],id:'legacy',x:5,y:5,catalogId:'unavailable-model',figureId:bridge}]};
 const actual=diagnosticCoverage(mixed);assert.ok(actual);
 assert.deepEqual(actual.dry,base.dry);assert.deepEqual(actual.single,base.single);
});

test('uncertain geometry is confined to its own figure',()=>{
 const {project}=fixture();
 const unknown={...project.heads[2],catalogId:'unavailable-model'};
 const bands=diagnosticCoverage({...project,heads:project.heads.map(h=>h.id===unknown.id?unknown:h)});
 assert.ok(bands);assert.equal(pointInSurface({x:17,y:13},bands.dry),true,'right-hand figure remains classified');
});

test('deleting a surrounding CAD layer cannot delete the irrigation system inside it',()=>{
 const {project}=fixture();const d=e.addRect(project.drawing,{x:-2,y:-2},{x:22,y:22},'site');
 const id=Object.keys(d.faces).find(id=>!project.drawing.faces[id]);reset({...project,drawing:d,polygons:e.toPolygons(d)});
 store.getState().selectPoly(id);store.getState().deleteSelected();
 assert.deepEqual(store.getState().project.heads,project.heads);assert.deepEqual(store.getState().project.zones,project.zones);
});

test('explicit sprinkler deletion still removes selected equipment and supports undo',()=>{
 const {project}=fixture();reset(project);store.getState().selectHead(project.heads[0].id);store.getState().deleteSelected();
 const remaining=store.getState().project.heads;
 assert.deepEqual(remaining.map(h=>h.id),project.heads.slice(1).map(h=>h.id));
 store.getState().undo();assert.deepEqual(store.getState().project.heads,project.heads);assert.deepEqual(store.getState().project.zones,project.zones);
});
