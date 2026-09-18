import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true, hmr: false } });
const e = await server.ssrLoadModule('/src/lib/cad/engine.ts');
const { emptyDrawing } = await server.ssrLoadModule('/src/lib/cad/types.ts');
const { emptyProject } = await server.ssrLoadModule('/src/lib/project-types.ts');
const { useProject, migrateProject } = await server.ssrLoadModule('/src/lib/project-store.ts');
const { layerRows } = await server.ssrLoadModule('/src/components/designer/mobile-workspace.tsx');
const { layerGridAnchors, snapLayerTransform } = await server.ssrLoadModule('/src/lib/cad/layer-snapping.ts');
await server.close();
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-6, `${a} != ${b}`);
function fixture() {
  let d=e.addRect(emptyDrawing(),{x:0,y:0},{x:4,y:3},'building');
  d=e.addCircle(d,{x:12,y:8},2,'lawn');
  d=e.addEllipse(d,{x:25,y:10},3,1,'path');
  const ids=Object.keys(d.faces);
  d=e.setFaceFill(d,ids[0],'texture:mulch'); d=e.setFaceFill(d,ids[1],'#ff0000');
  return {d,ids};
}
const project = d => ({...emptyProject(),drawing:d,polygons:e.toPolygons(d)});

test('disconnected figures become one layer without changing topology, areas or materials',()=>{
 const {d,ids}=fixture(); const grouped=e.mergeLayers(d,ids);
 assert.equal(e.layerRepresentatives(grouped).length,1);
 assert.deepEqual(grouped.vertices,d.vertices); assert.deepEqual(grouped.edges,d.edges);
 for(const id of ids){assert.equal(grouped.faces[id].fill,d.faces[id].fill);near(e.faceArea(grouped,id),e.faceArea(d,id));}
 near(e.layerArea(grouped,ids[0]),ids.reduce((n,id)=>n+e.faceArea(d,id),0));
 const rows=layerRows(project(grouped),{selectedPolyId:ids[1],selectedPolyIds:ids,selectedEdgeId:null,selectedId:null,cadEditId:null},'ru');
 assert.equal(rows.filter(r=>r.kind==='face').length,1);assert.equal(rows[0].selected,true);
});

test('whole-layer translation, rotation and scale keep exact primitive metadata and shared geometry',()=>{
 const {d,ids}=fixture(),g=e.mergeLayers(d,ids);
 const moved=e.moveFace(g,ids[1],7,-2);
 for(const id of ids){const a=e.facePoints(g,id),b=e.facePoints(moved,id);near(b[0].x,a[0].x+7);near(b[0].y,a[0].y-2);}
 const transformed=e.transformLayer(g,ids[0],{scale:2,angle:90},{x:0,y:0});
 const circle=ids.find(id=>g.faces[id].circle), ellipse=ids.find(id=>g.faces[id].ellipse);
 near(transformed.faces[circle].circle.cx,-16);near(transformed.faces[circle].circle.cy,24);near(transformed.faces[circle].circle.r,4);
 near(transformed.faces[ellipse].ellipse.cx,-20);near(transformed.faces[ellipse].ellipse.cy,50);near(transformed.faces[ellipse].ellipse.rx,6);
 near(e.layerArea(transformed,ids[0]),e.layerArea(g,ids[0])*4);
 const v=Object.keys(g.vertices)[0]; near(transformed.vertices[v].x,-g.vertices[v].y*2);near(transformed.vertices[v].y,g.vertices[v].x*2);
});

test('layer operations cover every component and copying creates an independent layer',()=>{
 const {d,ids}=fixture(),g=e.mergeLayers(d,ids);
 const named=e.setFaceName(g,ids[1],'Group');assert.ok(ids.every(id=>named.faces[id].name==='Group'));
 const hidden=e.setFaceHidden(g,ids[0],true);assert.ok(ids.every(id=>hidden.faces[id].hidden));
 const locked=e.setFaceLocked(g,ids[0],true);assert.equal(e.transformLayer(locked,ids[0],{dx:2}),locked);
 const filled=e.setFaceFill(g,ids[0],'texture:sand');assert.ok(ids.every(id=>filled.faces[id].fill==='texture:sand'));
 const copy=e.duplicateFace(g,ids[0],30,0);
 assert.equal(e.layerRepresentatives(copy.drawing).length,2);
 assert.equal(e.layerFaceIds(copy.drawing,copy.id).length,3);
 assert.notEqual(copy.drawing.faces[copy.id].layerId,g.faces[ids[0]].layerId);
 const deleted=e.deleteFace(copy.drawing,ids[0]);
 assert.ok(ids.every(id=>!deleted.faces[id]));assert.equal(e.layerFaceIds(deleted,copy.id).length,3);
});

test('merge survives serialization, startup migration and topology rebuild',()=>{
 const {d,ids}=fixture(),g=e.mergeLayers(d,ids);
 const restored=migrateProject(JSON.parse(JSON.stringify(project(g))));
 assert.equal(e.layerRepresentatives(restored.drawing).length,1);
 const rebuilt=e.cloneDrawing(g);e.rebuildFaces(rebuilt,'lawn');
 assert.equal(e.layerRepresentatives(rebuilt).length,1);
 assert.equal(e.layerFaceIds(rebuilt,ids[0]).length,3);
});

test('cursor toggles unlimited selections, grouped selection and the final deselection correctly',()=>{
 const {d,ids}=fixture(),many=e.cloneDrawing(d);
 for(let i=0;i<120;i++)many.faces['test-'+i]={...d.faces[ids[0]],id:'test-'+i};
 useProject.setState({project:project(many),selectedPolyId:null,selectedPolyIds:[],cadEditId:null,selectedEdgeId:null,pendingConstraint:null});
 for(let i=0;i<120;i++)useProject.getState().selectPoly('test-'+i,true);
 assert.equal(useProject.getState().selectedPolyIds.length,120);
 for(let i=0;i<120;i++)useProject.getState().selectPoly('test-'+i,true);
 assert.equal(useProject.getState().selectedPolyIds.length,0);assert.equal(useProject.getState().selectedPolyId,null);
 const grouped=e.mergeLayers(d,ids);
 useProject.setState({project:project(grouped)});
 useProject.getState().selectPoly(ids[1],true);assert.equal(useProject.getState().selectedPolyIds.length,3);
 useProject.getState().selectPoly(ids[2],true);assert.equal(useProject.getState().selectedPolyId,null);
 useProject.getState().setCadEdit(ids[1]);assert.equal(useProject.getState().selectedPolyIds.length,3);
});

test('merge is a single undoable operation',()=>{
 const {d,ids}=fixture();useProject.setState({project:project(d),past:[],future:[],pastOps:[],futureOps:[],cadEditId:null});
 useProject.getState().commitDrawing(e.mergeLayers(d,ids),ids[0],true);
 assert.equal(e.layerRepresentatives(useProject.getState().project.drawing).length,1);
 useProject.getState().undo();assert.equal(e.layerRepresentatives(useProject.getState().project.drawing).length,3);
 useProject.getState().redo();assert.equal(e.layerRepresentatives(useProject.getState().project.drawing).length,1);
});

test('repeated layer rotations retain one fixed pivot and do not translate components',()=>{
 const {d,ids}=fixture();let g=e.mergeLayers(d,ids);
 const before=structuredClone(g),center=e.layerCenter(g,ids[0]);
 for(let i=0;i<36;i++){
   g=e.transformLayer(g,ids[0],{angle:10});
   near(e.layerCenter(g,ids[0]).x,center.x);near(e.layerCenter(g,ids[0]).y,center.y);
 }
 for(const id of ids){
   const a=e.facePoints(before,id),b=e.facePoints(g,id);
   for(let j=0;j<a.length;j++){near(a[j].x,b[j].x);near(a[j].y,b[j].y);}
 }
 near(g.faces[ids[0]].layerAngle,360);
 const restored=migrateProject(JSON.parse(JSON.stringify(project(g))));
 assert.deepEqual(e.layerCenter(restored.drawing,ids[0]),center);
});

test('splitting a rotated layer preserves geometry and materials and can be undone',()=>{
 const {d,ids}=fixture();const g=e.transformLayer(e.mergeLayers(d,ids),ids[0],{angle:37});
 const split=e.splitLayer(g,ids[1]);
 assert.equal(e.layerRepresentatives(split).length,3);
 assert.deepEqual(split.vertices,g.vertices);
 for(const id of ids){assert.equal(split.faces[id].layerId,undefined);assert.equal(split.faces[id].layerPivot,undefined);assert.deepEqual(e.facePoints(split,id),e.facePoints(g,id));assert.equal(split.faces[id].fill,g.faces[id].fill);}
 useProject.setState({project:project(g),past:[],future:[],pastOps:[],futureOps:[],cadEditId:null});
 useProject.getState().commitDrawing(split,ids[0],true);
 useProject.getState().undo();assert.equal(e.layerRepresentatives(useProject.getState().project.drawing).length,1);
 useProject.getState().redo();assert.equal(e.layerRepresentatives(useProject.getState().project.drawing).length,3);
});

test('nested merges split in reverse order and retain prior group pivots after rotation and reload',()=>{
 const {d,ids}=fixture();
 const first=e.mergeLayers(d,[ids[0],ids[1]]),firstId=first.faces[ids[0]].layerId;
 const center=e.layerCenter(first,ids[0]);
 let second=e.mergeLayers(first,[ids[0],ids[2]]);
 assert.equal(e.layerRepresentatives(second).length,1);
 const pivot=e.layerCenter(second,ids[0]);
 second=e.transformLayer(second,ids[0],{angle:90});
 const loaded=migrateProject(JSON.parse(JSON.stringify(project(second)))).drawing;
 const once=e.splitLayer(loaded,ids[2]);
 assert.equal(e.layerRepresentatives(once).length,2);
 assert.equal(once.faces[ids[0]].layerId,firstId);
 assert.equal(once.faces[ids[1]].layerId,firstId);
 assert.equal(once.faces[ids[2]].layerId,undefined);
 near(e.layerCenter(once,ids[0]).x,pivot.x-(center.y-pivot.y));
 near(e.layerCenter(once,ids[0]).y,pivot.y+(center.x-pivot.x));
 const twice=e.splitLayer(once,ids[0]);
 assert.equal(e.layerRepresentatives(twice).length,3);
 assert.deepEqual(twice.vertices,loaded.vertices);
 for(const id of ids){assert.equal(twice.faces[id].fill,d.faces[id].fill);assert.deepEqual(e.facePoints(twice,id),e.facePoints(loaded,id));}
});

test('undo first reverses the last merge, then the preceding draw, then the earlier merge',()=>{
 const {d,ids}=fixture();const base=e.deleteFace(d,ids[2]);
 useProject.setState({project:project(base),past:[],future:[],pastOps:[],futureOps:[],cadEditId:null});
 const first=e.mergeLayers(base,[ids[0],ids[1]]);
 useProject.getState().commitDrawing(first,ids[0],true);
 const drawn=e.addCircle(first,{x:35,y:8},2,'lawn');
 const newId=Object.keys(drawn.faces).find(id=>!first.faces[id]);
 useProject.getState().commitDrawing(drawn,newId,true);
 useProject.getState().commitDrawing(e.mergeLayers(drawn,[ids[0],newId]),ids[0],true);
 useProject.getState().undo();assert.equal(e.layerRepresentatives(useProject.getState().project.drawing).length,2);
 assert.ok(useProject.getState().project.drawing.faces[newId]);
 useProject.getState().undo();assert.equal(e.layerRepresentatives(useProject.getState().project.drawing).length,1);
 assert.equal(useProject.getState().project.drawing.faces[newId],undefined);
 useProject.getState().undo();assert.equal(e.layerRepresentatives(useProject.getState().project.drawing).length,2);
});

test('group titles are independent and nested details retain original layer names',()=>{
 let {d,ids}=fixture();
 d=e.setFaceName(d,ids[0],'Дом');d=e.setFaceName(d,ids[1],'Дорожка');
 let g=e.mergeLayers(d,ids.slice(0,2));
 assert.equal(g.faces[ids[0]].name,undefined);
 assert.equal(e.faceLayerNumber(g,ids[0]),1);
 assert.deepEqual(e.groupMembers(g,ids[0]).map(({number,name})=>({number,name})),[{number:1,name:'Дом'},{number:2,name:'Дорожка'}]);
 g=e.setFaceName(g,ids[0],'Двор');
 let nested=e.mergeLayers(g,[ids[0],ids[2]]);
 assert.equal(nested.faces[ids[0]].name,undefined);
 nested=JSON.parse(JSON.stringify(nested));
 assert.deepEqual(e.groupMembers(nested,ids[0]).map(x=>x.name),['Дом','Дорожка',undefined]);
 const restored=e.splitLayer(nested,ids[0]);
 assert.equal(restored.faces[ids[0]].name,'Двор');
 assert.equal(e.splitLayer(restored,ids[0]).faces[ids[0]].name,'Дом');
 const rows=layerRows(project(nested),{selectedPolyIds:[],selectedPolyId:null,selectedEdgeId:null,selectedId:null,cadEditId:null},'ru');
 assert.equal(rows[0].title,'Группа 1');
});

test('hidden group members keep layer numbering and tablet selection keeps list order',()=>{
 let {d,ids}=fixture();
 d=e.mergeLayers(d,ids.slice(0,2));
 assert.equal(e.faceLayerNumber(d,ids[0]),1);
 assert.equal(e.faceLayerNumber(d,ids[2]),3);
 d=e.addRect(d,{x:40,y:0},{x:42,y:2},'building');
 const fourth=Object.keys(d.faces).at(-1);
 assert.equal(e.faceLayerNumber(d,fourth),4);
 const selection={selectedPolyId:fourth,selectedPolyIds:[fourth],selectedEdgeId:null,selectedId:null,cadEditId:null};
 const tablet=layerRows(project(d),selection,'ru',false);
 assert.deepEqual(tablet.filter(r=>r.kind==='face').map(r=>r.title),['Группа 1','слой 3','слой 4']);
 assert.equal(tablet.at(-1).selected,true);
 assert.equal(layerRows(project(d),selection,'ru',true)[0].id,fourth);
 d=e.mergeLayers(d,[ids[2],fourth]);
 assert.equal(e.faceLayerNumber(d,ids[2]),2);
 const legacy=e.setFaceName(d,ids[0],'слой 1');
 assert.equal(layerRows(project(legacy),selection,'ru',false)[0].title,'Группа 1');
 const renamed=e.setFaceName(legacy,ids[0],'Двор');
 assert.equal(layerRows(project(renamed),selection,'ru',false)[0].title,'Двор');
 assert.deepEqual(e.groupMembers(d,ids[2]).map(m=>m.number),[3,4]);
});

test('group frame follows committed rotation and translation without resizing geometry',()=>{
 const {d,ids}=fixture(),g=e.mergeLayers(d,ids);
 const original=e.layerFrame(g,ids[0]),o=e.layerCenter(g,ids[0]);
 const changed=e.transformLayer(g,ids[0],{angle:37,dx:8,dy:-3});
 const frame=e.layerFrame(changed,ids[0]);
 const r=37*Math.PI/180;
 original.forEach((p,i)=>{
   near(frame[i].x,o.x+(p.x-o.x)*Math.cos(r)-(p.y-o.y)*Math.sin(r)+8);
   near(frame[i].y,o.y+(p.x-o.x)*Math.sin(r)+(p.y-o.y)*Math.cos(r)-3);
 });
 near(e.layerArea(changed,ids[0]),e.layerArea(g,ids[0]));
 const pivot=e.layerCenter(changed,ids[0]);near(pivot.x,o.x+8);near(pivot.y,o.y-3);
});

test('bulk delete removes selected group and layer in one undoable action',()=>{
 let {d,ids}=fixture();d=e.mergeLayers(d,ids.slice(0,2));
 d=e.addRect(d,{x:60,y:0},{x:62,y:2},'building');const keep=Object.keys(d.faces).at(-1);
 useProject.setState({project:project(d),past:[],future:[],pastOps:[],futureOps:[],selectedIds:[],selectedId:null,selectedPolyIds:[],selectedPolyId:null,selectedEdgeId:null,cadEditId:null});
 useProject.getState().selectPoly(ids[0],true);useProject.getState().selectPoly(ids[2],true);
 useProject.getState().deleteSelected();
 assert.deepEqual(Object.keys(useProject.getState().project.drawing.faces),[keep]);
 useProject.getState().undo();assert.equal(Object.keys(useProject.getState().project.drawing.faces).length,4);
 assert.equal(e.layerRepresentatives(useProject.getState().project.drawing).length,3);
});

test('three copied shapes group without phantom boundary rows, including older saves',()=>{
 let d=e.addRect(emptyDrawing(),{x:0,y:0},{x:4,y:3},'building');
 const first=Object.keys(d.faces)[0],ids=[first];
 for(const dx of [8,16]) {
   const copy=e.duplicateFace(d,first,dx,0);d=copy.drawing;ids.push(copy.id);
   for(const half of d.faces[copy.id].outer) {
     const edge=d.edges[half.e];assert.ok(edge.faceL===copy.id || edge.faceR===copy.id);
   }
 }
 // A genuine independent line must remain available.
 d.vertices['loose-a']={id:'loose-a',x:0,y:20};d.vertices['loose-b']={id:'loose-b',x:4,y:20};
 d.edges.loose={id:'loose',a:'loose-a',b:'loose-b',bulge:0,faceL:null,faceR:null};
 // Reproduce copies from older saved projects with incomplete back-references.
 for(const id of ids.slice(1))for(const half of d.faces[id].outer){d.edges[half.e].faceL=null;d.edges[half.e].faceR=null;}
 const grouped=e.mergeLayers(d,ids),restored=JSON.parse(JSON.stringify(grouped));
 const selection={selectedPolyId:first,selectedPolyIds:ids,selectedEdgeId:null,selectedId:null,cadEditId:null};
 for(const selectedFirst of [true,false]) {
   const rows=layerRows(project(restored),selection,'ru',selectedFirst);
   assert.equal(rows.filter(r=>r.kind==='face').length,1);
   assert.deepEqual(rows.filter(r=>r.kind==='edge').map(r=>r.id),['loose']);
 }
 assert.deepEqual(restored.edges,grouped.edges,'listing must not delete project geometry');
});


test('group translation snaps member boundaries at the chosen grid step without deforming members', () => {
  const { d, ids } = fixture();
  const grouped = e.transformLayer(e.mergeLayers(d, ids), ids[0], { angle: 27 });
  const anchors = layerGridAnchors(grouped, ids[0]);
  for (const gridStep of [0.25, 1, 2]) {
    const options = { snapOn: true, snapGridOn: true, gridStep, pxPerMeter: 100 };
    const first = anchors[0];
    const raw = { dx: gridStep * 4 - first.x + 0.04, dy: gridStep * 7 - first.y - 0.03, angle: 0 };
    const change = snapLayerTransform(grouped, ids[0], 'move', raw, options);
    const onGrid = n => Math.abs(n / gridStep - Math.round(n / gridStep)) < 1e-7;
    assert.ok(anchors.some(a => onGrid(a.x + change.dx)));
    assert.ok(anchors.some(a => onGrid(a.y + change.dy)));
    const moved = e.transformLayer(grouped, ids[0], change);
    for (const id of ids) {
      const before = e.facePoints(grouped, id), after = e.facePoints(moved, id);
      before.forEach((a, i) => { near(after[i].x - a.x, change.dx); near(after[i].y - a.y, change.dy); });
      near(e.faceArea(moved, id), e.faceArea(grouped, id));
    }
    assert.deepEqual(snapLayerTransform(grouped, ids[0], 'move', raw, { ...options, snapOn: false }), raw);
    assert.deepEqual(snapLayerTransform(grouped, ids[0], 'move', raw, { ...options, snapGridOn: false }), raw);
  }
});

test('group rotation snaps its absolute angle and keeps the persistent pivot fixed', () => {
  const { d, ids } = fixture();
  const grouped = e.transformLayer(e.mergeLayers(d, ids), ids[0], { angle: 20 });
  const options = { snapOn: true, snapGridOn: true, gridStep: 1, pxPerMeter: 100 };
  const raw = { dx: 0, dy: 0, angle: 23 };
  const change = snapLayerTransform(grouped, ids[0], 'rotate', raw, options);
  near(change.angle, 25);
  const rotated = e.transformLayer(grouped, ids[0], change);
  near(rotated.faces[ids[0]].layerAngle, 45);
  assert.deepEqual(e.layerCenter(rotated, ids[0]), e.layerCenter(grouped, ids[0]));
  ids.forEach(id => near(e.faceArea(rotated, id), e.faceArea(grouped, id)));
  assert.deepEqual(snapLayerTransform(grouped, ids[0], 'rotate', raw, { ...options, snapOn: false }), raw);
  near(snapLayerTransform(grouped, ids[0], 'rotate', { ...raw, angle: 3 }, options).angle, 3);
  const still = { dx: 0, dy: 0, angle: 0 };
  assert.deepEqual(snapLayerTransform(grouped, ids[0], 'move', still, options), still);
  assert.deepEqual(snapLayerTransform(grouped, ids[0], 'rotate', still, options), still);
});

test('hiding a group or individual shape ends editing and showing it keeps editing off', () => {
  const { d, ids } = fixture();
  for (const drawing of [d, e.mergeLayers(d, ids)]) {
    for (const id of ids) {
      useProject.setState({ project: project(drawing), past: [], future: [], pastOps: [], futureOps: [], cadEditId: null });
      useProject.getState().setCadEdit(id);
      assert.equal(useProject.getState().cadEditId, id);
      useProject.getState().setCadLiveRot(17);
      // The shared layer-row eye selects the representative before hiding it.
      useProject.getState().selectPoly(e.layerFaceIds(drawing, id)[0]);
      useProject.getState().hideSelected(true);
      assert.equal(useProject.getState().cadEditId, null);
      assert.equal(useProject.getState().cadLiveRot, null);
      assert.ok(e.layerFaceIds(drawing, id).every(member => useProject.getState().project.drawing.faces[member].hidden));
      useProject.getState().setCadEdit(id);
      assert.equal(useProject.getState().cadEditId, null);
      useProject.getState().hideSelected(false);
      assert.equal(useProject.getState().cadEditId, null);
      assert.ok(e.layerFaceIds(drawing, id).every(member => !useProject.getState().project.drawing.faces[member].hidden));
      useProject.getState().setCadEdit(id);
      assert.equal(useProject.getState().cadEditId, id);
    }
  }
});
