import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false } });
const e = await server.ssrLoadModule('/src/lib/cad/engine.ts');
const fsnap = await server.ssrLoadModule('/src/lib/cad/figure-snapping.ts');
const sf = await server.ssrLoadModule('/src/lib/cad/segment-figures.ts');
const { segmentAlignmentAnchors, segmentAlignmentGuides, snapSegmentAlignment } = await server.ssrLoadModule('/src/lib/cad/segment-alignment.ts');
const { emptyDrawing } = await server.ssrLoadModule('/src/lib/cad/types.ts');
const { emptyProject } = await server.ssrLoadModule('/src/lib/project-types.ts');
const { polygonArea } = await server.ssrLoadModule('/src/lib/geometry.ts');
const { useProject, migrateProject, drawingForEditing } = await server.ssrLoadModule('/src/lib/project-store.ts');
const { layerRows, layerTitle, groupMemberLabel, groupMemberTitle } = await server.ssrLoadModule('/src/components/designer/mobile-workspace.tsx');
const { tr } = await server.ssrLoadModule('/src/lib/i18n.ts');
const { layerReorderLayout, layerReorderScroll } = await server.ssrLoadModule('/src/components/designer/layer-reorder-layout.ts');
const { canvasTheme, THEME_IDS } = await server.ssrLoadModule('/src/lib/theme.ts');
const { magnifierLayout, canShowMagnifier } = await server.ssrLoadModule('/src/components/designer/canvas-magnifier-model.ts');
const {closureTarget,guidanceCopy}=await server.ssrLoadModule('/src/components/designer/drawing-guidance-model.ts');
await server.close();

test('open curves and freehand paths can join and leave a mixed selection', () => {
  const d = emptyDrawing();
  d.faces.curve = {id:'curve',type:'lawn',outer:[],holes:[],spline:{pts:[{x:0,y:0},{x:2,y:3},{x:4,y:0}],closed:false}};
  d.faces.free = {id:'free',type:'lawn',outer:[],holes:[],freehand:{pts:[{x:10,y:0},{x:12,y:2}],closed:false}};
  const point=e.facePoints(d,'curve')[5];
  assert.equal(e.pickOpenPathAt(d,point,0.1),'curve');
  assert.equal(e.pickOpenPathAt(d,{x:11,y:1},0.1),'free');
  assert.equal(e.pickOpenPathAt(d,{x:7,y:7},0.1),null);
  const project=emptyProject(); project.drawing=d;
  useProject.setState({project,selectedPolyId:null,selectedPolyIds:[],cadEditId:null});
  useProject.getState().selectPoly('free',true);
  useProject.getState().selectPoly('curve',true);
  assert.deepEqual(new Set(useProject.getState().selectedPolyIds),new Set(['free','curve']));
  useProject.getState().selectPoly('curve',true);
  assert.deepEqual(useProject.getState().selectedPolyIds,['free']);
  d.faces.curve.hidden=true;
  assert.equal(e.pickOpenPathAt(d,point,0.1),null);
});


test('closure guidance targets the contour start only when enough points exist and the pointer is near',()=>{
 const pts=[{x:-3,y:0},{x:0,y:0},{x:5,y:0},{x:5,y:5}];
 assert.deepEqual(closureTarget(pts,'polygon',{x:-2.9,y:0},100),pts[0]);
 assert.equal(closureTarget(pts,'polygon',{x:1,y:0},100),null);
 assert.equal(closureTarget(pts.slice(0,2),'polygon',{x:-3,y:0},100),null);
 assert.deepEqual(closureTarget(pts,'spline',{x:-3,y:0},100),pts[0]);
 assert.equal(closureTarget(pts,'line',{x:0,y:0},100),null);
 assert.equal(Object.keys(guidanceCopy).length,11);
 for(const row of Object.values(guidanceCopy))assert.ok(row.length===7 && row.every(text=>text.length>0));
});

test('the compact magnifier stays at the right edge below visible phone and tablet panels', () => {
  for (const [width,height] of [[390,720],[768,860],[1024,650]]) {
    for (const topInset of [0,50,90]) {
      const frame=magnifierLayout(width,height,topInset);
      assert.deepEqual(frame,{left:width-102,top:topInset+4,size:100});
      assert.equal(width-frame.left-frame.size,2,'the full frame leaves only a 2px edge gap');
      assert.ok(frame.top>topInset && frame.top+frame.size<=height-2,'tool/layer strips cannot cover the lens');
    }
  }
  assert.equal(magnifierLayout(60,100),null);
  assert.equal(magnifierLayout(390,120,90),null,'hide when there is no usable space below the panels');
});

test('magnifier is enabled for precision drawing and geometry editing, never normal navigation or pinch', () => {
  const state={blocked:false,catalogOpen:false,editDrag:false,tool:'draw',drawSub:'line',cadEditId:null,selectedEdgeId:null,draftPointCount:1};
  assert.equal(canShowMagnifier(state),true);
  for (const drawSub of ['rect','triangle','polygon','spline','ellipse']) assert.equal(canShowMagnifier({...state,drawSub}),true);
  assert.equal(canShowMagnifier({...state,tool:null}),false);
  assert.equal(canShowMagnifier({...state,tool:'select'}),false);
  assert.equal(canShowMagnifier({...state,draftPointCount:0}),false);
  assert.equal(canShowMagnifier({...state,cadEditId:'rectangle'}),false,'selection or idle editing is not a drag');
  assert.equal(canShowMagnifier({...state,cadEditId:'rectangle',editDrag:true}),true);
  assert.equal(canShowMagnifier({...state,editDrag:true,blocked:true}),false);
  assert.equal(canShowMagnifier({...state,editDrag:true,catalogOpen:true}),false);
  assert.equal(canShowMagnifier({...state,drawSub:'freehand'}),false);
});

test('live layer drag preserves all row slots and moves neighbours without remeasuring them', () => {
  const items = Object.freeze(['a','b','c','d'].map((id,i)=>Object.freeze({id,top:100+i*44,height:40})));
  const original = JSON.stringify(items);
  // The active card follows the finger before any neighbour changes position.
  assert.equal(layerReorderLayout(items,'a',12).offsets.a,12);
  const end=layerReorderLayout(items,'a',132);
  assert.deepEqual(end.order,['b','c','d','a']);
  assert.deepEqual(end.offsets,{a:132,b:-44,c:-44,d:-44});
  // Holding at the same location cannot oscillate the neighbours or lose a row.
  for(let frame=0;frame<120;frame++) assert.deepEqual(layerReorderLayout(items,'a',132),end);
  for(const dy of [0,10,50,90,132,90,50,10,0,-1000,1000]) {
    const preview=layerReorderLayout(items,'a',dy);
    assert.equal(new Set(preview.order).size,4);
    for(const row of items) {
      const top=row.top+preview.offsets[row.id];
      assert.ok(top>=100 && top+row.height<=272);
    }
  }
  assert.equal(JSON.stringify(items),original);
  assert.deepEqual(layerReorderLayout(items,'d',-132).order,['d','a','b','c']);
});

test('expanded layer rows retain their heights and original order throughout preview', () => {
  const items=[{id:'a',top:10,height:40},{id:'b',top:54,height:120},{id:'c',top:178,height:40}];
  const preview=layerReorderLayout(items,'c',-168);
  assert.deepEqual(preview.order,['c','a','b']);
  assert.deepEqual(preview.offsets,{a:44,b:44,c:-168});
  assert.deepEqual(items.map(r=>r.id),['a','b','c']);
  assert.equal(items[1].height,120);
  assert.deepEqual(layerReorderLayout(items,'b',0).order,['a','b','c']);
  assert.deepEqual(layerReorderLayout(items,'b',1000).order,['a','c','b']);
  assert.deepEqual(layerReorderLayout(items,'b',-1000).order,['b','a','c']);
});

test('layer autoscroll is inactive for fitting lists and bounded for long lists', () => {
  assert.equal(layerReorderScroll(219,0,220,0,0,true,16),0);
  assert.equal(layerReorderScroll(219,0,220,0,500,false,16),0);
  assert.equal(layerReorderScroll(110,0,220,100,500,true,16),100);
  let scroll=0;
  for(let i=0;i<300;i++) scroll=layerReorderScroll(250,0,220,scroll,500,true,16);
  assert.equal(scroll,500);
  for(let i=0;i<300;i++) scroll=layerReorderScroll(-20,0,220,scroll,500,true,16);
  assert.equal(scroll,0);
});

const controls = [{ x: -5, y: -1 }, { x: 1, y: -4 }, { x: 6, y: 1 }, { x: 0, y: 4 }];
const project = drawing => ({ ...emptyProject(), drawing, polygons: e.toPolygons(drawing) });
const rows = drawing => layerRows(project(drawing), {
  selectedPolyId: null, selectedPolyIds: [], selectedEdgeId: null, selectedId: null, cadEditId: null,
}, 'ru');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('segment alignment guides track both the initial point and the fixed endpoint of a U-shaped chain', () => {
  let d=e.segmentLayers(e.addDrawingLines(emptyDrawing(),[
    {x:0,y:0},{x:14,y:0},{x:14,y:15},{x:2,y:15},
  ],'lawn'));
  const edited=Object.values(d.faces).find(f=>f.segment && f.spline.pts.every(p=>p.y===15));
  assert.ok(edited);
  const before=JSON.stringify(d);
  const anchors=segmentAlignmentAnchors(d,{x:14,y:15},edited.id);
  assert.ok(anchors.some(p=>p.x===0 && p.y===0));
  assert.ok(!anchors.some(p=>p.x===2 && p.y===15),'the old moving endpoint is not a reference');
  const exact=segmentAlignmentGuides({x:0,y:15},anchors,24);
  assert.deepEqual(exact.map(g=>[g.axis,g.aligned]),[['horizontal',true],['vertical',true]]);
  assert.deepEqual(exact.find(g=>g.axis==='vertical').anchor,{x:0,y:0});
  const offset=segmentAlignmentGuides({x:0.5,y:15},anchors,24);
  assert.equal(offset.find(g=>g.axis==='horizontal').aligned,true);
  assert.equal(offset.find(g=>g.axis==='vertical').aligned,false);
  assert.deepEqual(offset.find(g=>g.axis==='vertical').projection,{x:0,y:15});
  assert.equal(JSON.stringify(d),before,'guides do not modify objects, add layers or save constraints');
});

test('segment alignment approach distance stays constant in screen pixels and does not round to an exact match', () => {
  for (const px of [5,30,180]) {
    const anchor={x:0,y:0};
    const approach=segmentAlignmentGuides({x:20/px,y:200/px},[anchor],px);
    assert.equal(approach.length,1);
    assert.equal(approach[0].axis,'vertical');
    assert.equal(approach[0].aligned,false);
    assert.deepEqual(segmentAlignmentGuides({x:33/px,y:200/px},[anchor],px),[]);
    const nearMatch=segmentAlignmentGuides({x:0.01/px,y:200/px},[anchor],px);
    assert.equal(nearMatch[0].aligned,false,'a tiny real offset is still red');
    assert.equal(segmentAlignmentGuides({x:0,y:200/px},[anchor],px)[0].aligned,true);
    assert.equal(segmentAlignmentGuides({x:200/px,y:0},[anchor],px)[0].aligned,true);
  }
  for (const px of [0,-1,Infinity,NaN]) assert.deepEqual(segmentAlignmentGuides({x:0,y:2},[{x:0,y:0}],px),[]);
  assert.deepEqual(segmentAlignmentGuides({x:NaN,y:2},[{x:0,y:0}],24),[]);
});

test('segment alignment picks only the nearest reference per axis without guide clutter', () => {
  const anchors=[{x:0,y:0},{x:0,y:5},{x:0.6,y:6},{x:8,y:15},{x:14,y:15}];
  const guides=segmentAlignmentGuides({x:0,y:15},anchors,24);
  assert.equal(guides.length,2);
  assert.deepEqual(guides.find(g=>g.axis==='vertical').anchor,{x:0,y:5});
  assert.deepEqual(guides.find(g=>g.axis==='horizontal').anchor,{x:8,y:15});
  assert.deepEqual(segmentAlignmentGuides({x:100,y:100},anchors,24),[]);
  const joined=segmentAlignmentGuides({x:0,y:0},[{x:0,y:0}],24);
  assert.equal(joined.length,2,'an exact endpoint join keeps both guides visible beyond the point');
  assert.ok(joined.every(guide=>guide.aligned));
});

test('alignment references include visible figure corners and exact joins without changing geometry', () => {
  const d=e.addRect(emptyDrawing(),{x:2,y:3},{x:8,y:9},'lawn');
  const id=Object.keys(d.faces)[0];
  const before=JSON.stringify(d);
  const anchors=segmentAlignmentAnchors(d,{x:15,y:15});
  assert.ok(anchors.some(p=>p.x===2 && p.y===3));
  assert.ok(segmentAlignmentGuides({x:2,y:3},anchors,24).every(g=>g.aligned));
  assert.deepEqual(segmentAlignmentAnchors(d,{x:15,y:15},id),[{x:15,y:15}]);
  assert.equal(JSON.stringify(d),before);
});

test('alignment references ignore hidden and moving segments but retain visible locked segments and legacy endpoints', () => {
  let d=e.segmentLayers(e.addDrawingLines(emptyDrawing(),[{x:0,y:0},{x:10,y:0}],'lawn'));
  d=e.segmentLayers(e.addDrawingLines(d,[{x:20,y:8},{x:25,y:8}],'lawn'));
  const visible=Object.values(d.faces).find(f=>f.spline.pts[0].y===0);
  const hidden=Object.values(d.faces).find(f=>f.spline.pts[0].y===8);
  d={...d,faces:{...d.faces,[visible.id]:{...visible,locked:true},[hidden.id]:{...hidden,hidden:true}},
    vertices:{...d.vertices,la:{id:'la',x:30,y:20},lb:{id:'lb',x:40,y:20}},
    edges:{...d.edges,legacy:{id:'legacy',a:'la',b:'lb',bulge:0,faceL:null,faceR:null}}};
  const before=JSON.stringify(d);
  const anchors=segmentAlignmentAnchors(d,{x:10,y:10},undefined,undefined,[{x:0,y:0}]);
  assert.equal(anchors.filter(p=>p.x===0 && p.y===0).length,1);
  assert.ok(anchors.some(p=>p.x===10 && p.y===0),'locked visible references remain usable');
  assert.ok(!anchors.some(p=>p.y===8),'hidden endpoints do not attract guides');
  assert.ok(anchors.some(p=>p.x===30 && p.y===20),'legacy loose segment endpoints remain usable');
  const excluded=segmentAlignmentAnchors(d,{x:10,y:10},visible.id,'legacy');
  assert.deepEqual(excluded,[{x:10,y:10}]);
  assert.equal(JSON.stringify(d),before);
});

test('grouped segments keep their own translated labels and numbering through nesting, reorder and reload', () => {
  let d=e.addRect(emptyDrawing(),{x:0,y:0},{x:4,y:3},'lawn');
  const rect=Object.keys(d.faces)[0];
  for (const y of [6,8,10]) d=e.segmentLayers(e.addDrawingLines(d,[{x:0,y},{x:4,y}],'lawn'));
  const ids=Object.values(d.faces).filter(f=>f.segment).map(f=>f.id);
  assert.deepEqual(ids.map(id=>layerTitle(d,id,'ru')),['Отрезок 1','Отрезок 2','Отрезок 3']);
  d=e.setFaceName(d,ids[1],'Граница');
  let grouped=e.mergeLayers(d,ids.slice(0,2));
  assert.equal(layerTitle(grouped,ids[0],'ru'),'Группа 1');
  assert.equal(layerTitle(grouped,ids[2],'ru'),'Отрезок 3');
  const check = drawing => {
    const members=e.groupMembers(drawing,ids[0]);
    for (const [index,id] of ids.slice(0,2).entries()) {
      const member=members.find(m=>m.id===id);
      assert.equal(member.segment,true);
      assert.equal(member.number,index+1);
      assert.equal(groupMemberLabel(member,'ru'),`Отрезок ${index+1}`);
      assert.equal(groupMemberTitle(member,'ru'),`Отрезок ${index+1}${index===1?' · Граница':''}`);
      for (const locale of ['ru','en','es','de','fr','pt','it','zh','ja','pl','tr']) {
        assert.equal(groupMemberLabel(member,locale),`${tr(locale,'drawLine')} ${index+1}`);
      }
    }
  };
  check(grouped);
  grouped=e.mergeLayers(grouped,[ids[0],rect]);
  grouped={...grouped,faceOrder:Object.keys(grouped.faces).reverse()};
  check(grouped);
  const rectangle=e.groupMembers(grouped,ids[0]).find(m=>m.id===rect);
  assert.equal(rectangle.segment,false);
  assert.equal(groupMemberLabel(rectangle,'ru'),'слой 1');
  grouped=migrateProject(JSON.parse(JSON.stringify(project(grouped)))).drawing;
  check(grouped);
  const split=e.splitLayer(e.splitLayer(grouped,ids[0]),ids[0]);
  assert.equal(layerTitle(split,ids[0],'ru'),'Отрезок 1');
  assert.equal(layerTitle(split,ids[1],'ru'),'Граница');
  assert.equal(layerTitle(split,ids[2],'ru'),'Отрезок 3');
});

test('segments use black on light themes and contrasting light ink on the dark theme', () => {
  const luminance = hex => {
    const channels = hex.slice(1).match(/../g).map(c => parseInt(c,16)/255)
      .map(c => c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4);
    return channels[0]*0.2126 + channels[1]*0.7152 + channels[2]*0.0722;
  };
  for (const id of THEME_IDS) {
    const theme = canvasTheme(id);
    assert.equal(theme.segmentStroke,id === 'graphite' ? theme.ink : '#000000');
    for (const color of [theme.segmentStroke, theme.accent, theme.guideError]) {
      const a=luminance(theme.bg), b=luminance(color);
      assert.ok((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)>3,`${id}: ${color} must be visible`);
    }
  }
});

test('finishing segment editing consumes the tap; only the next action starts a new segment', () => {
  const d=e.segmentLayers(e.addDrawingLines(emptyDrawing(),[{x:0,y:0},{x:8,y:0}],'lawn'));
  const id=Object.keys(d.faces)[0];
  for (const drawSub of ['line','none']) {
    useProject.setState({project:project(d),groupMemberId:null,groupMemberGroupId:null,
      cadEditId:null,selectedPolyId:null,selectedPolyIds:[],selectedEdgeId:null,
      past:[],future:[],pastOps:[],futureOps:[],pendingConstraint:null});
    useProject.getState().setCadEdit(id);
    useProject.setState({drawSub});
    const before=useProject.getState().project;
    assert.equal(useProject.getState().finishSegmentEdit(),true);
    let state=useProject.getState();
    assert.equal(state.cadEditId,null);
    assert.equal(state.tool,'draw');
    assert.equal(state.drawSub,drawSub);
    assert.deepEqual(state.draft.points,[]);
    assert.equal(state.splinePreview,null);
    assert.equal(state.project,before);
    assert.equal(state.past.length,0);
    assert.equal(state.future.length,0);
    assert.equal(state.finishSegmentEdit(),false);
    if (drawSub === 'line') {
      state.addDraftPoint({x:12,y:3});
      state=useProject.getState();
      assert.deepEqual(state.draft.points,[{x:12,y:3}]);
      assert.equal(state.project,before);
      assert.equal(Object.keys(state.project.drawing.faces).length,1);
    }
  }
});

test('segment tap dismissal does not end shape or whole-group editing', () => {
  let d=e.addRect(emptyDrawing(),{x:0,y:0},{x:4,y:3},'lawn');
  const rect=Object.keys(d.faces)[0];
  d=e.segmentLayers(e.addDrawingLines(d,[{x:6,y:0},{x:10,y:0}],'lawn'));
  const segment=Object.keys(d.faces).find(id=>id!==rect);
  useProject.setState({project:project(d),groupMemberId:null,groupMemberGroupId:null,cadEditId:null});
  useProject.getState().setCadEdit(rect);
  assert.equal(useProject.getState().finishSegmentEdit(),false);
  assert.equal(useProject.getState().cadEditId,rect);
  d={...d,faces:Object.fromEntries(Object.entries(d.faces).map(([id,face])=>[id,{...face,layerId:'group-test'}]))};
  useProject.setState({project:project(d),cadEditId:null});
  useProject.getState().setCadEdit(segment);
  assert.equal(useProject.getState().finishSegmentEdit(),false);
  assert.equal(useProject.getState().cadEditId,segment);
  // Explicitly editing that group's segment returns to the group without
  // detaching the child, changing paint order, or mutating geometry.
  useProject.getState().selectGroupMember(segment,true);
  const before=useProject.getState().project;
  assert.equal(useProject.getState().finishSegmentEdit(),true);
  assert.equal(useProject.getState().groupMemberId,null);
  assert.equal(useProject.getState().cadEditId,null);
  assert.equal(useProject.getState().project,before);
  assert.equal(useProject.getState().project.drawing.faces[segment].layerId,'group-test');
});

test('point construction over an ellipse creates only its own vertices and one new layer', () => {
  for (const points of [controls, [...controls].reverse(), [{x:4,y:0},{x:7,y:-3},{x:-5,y:-3},{x:-4,y:0}]]) {
    let base = e.addEllipse(emptyDrawing(), { x: 0, y: 0 }, 4, 2, 'lawn');
    base = e.addRect(base, {x:8,y:0}, {x:12,y:4}, 'building');
    useProject.setState({project:project(base), draft:{points},
      selectedPolyId:null, selectedPolyIds:[], cadEditId:null, selectedEdgeId:null,
      past:[], future:[], tool:'draw', drawSub:'polygon'});
    useProject.getState().closePolygon();
    const state = useProject.getState(), id = state.cadEditId;
    let drawing = state.project.drawing;
    const verify = () => {
      assert.equal(Object.keys(drawing.faces).length, 3);
      assert.equal(rows(drawing).length, 3);
      assert.equal(drawing.faces[id].outer.length, points.length);
      assert.equal(e.faceVertices(drawing,id).length, points.length);
      for (const [key, value] of Object.entries(base.faces)) assert.deepEqual(drawing.faces[key],value);
      for (const [key, value] of Object.entries(base.edges)) assert.deepEqual(drawing.edges[key],value);
      for (const [key, value] of Object.entries(base.vertices)) assert.deepEqual(drawing.vertices[key],value);
    };
    verify();
    near(e.faceArea(drawing,id),polygonArea(points));
    for (const delta of [-3, 2, 8]) {
      const next = e.facePoints(drawing,id).map((p,i)=>i===0?{x:p.x+delta,y:p.y+1}:p);
      drawing = e.setPointShapeVertices(drawing,id,next);
      verify();
    }
    state.commitDrawing(drawing,id,true);
    state.undo();
    near(e.faceArea(useProject.getState().project.drawing,id),polygonArea(points));
    state.redo();
    const restored = migrateProject(JSON.parse(JSON.stringify(useProject.getState().project)));
    drawing=restored.drawing;
    verify();
  }
});
function fixture(closed = true) {
  const base = e.addEllipse(emptyDrawing(), { x: 0, y: 0 }, 4, 2, 'lawn');
  const ellipseId = Object.keys(base.faces)[0];
  const drawing = e.addSpline(base, controls, closed, 'path');
  const curveId = Object.keys(drawing.faces).find(id => id !== ellipseId);
  return { base, drawing, ellipseId, curveId };
}
function ellipseUnchanged(drawing, base, ellipseId) {
  // Rebuilding fills optional keys with undefined; persisted geometry must be identical.
  assert.deepEqual(JSON.parse(JSON.stringify(drawing.faces[ellipseId])), JSON.parse(JSON.stringify(base.faces[ellipseId])));
  assert.deepEqual(drawing.edges, base.edges);
  assert.deepEqual(drawing.vertices, base.vertices);
  assert.equal(Object.keys(drawing.faces).length, 2);
  assert.equal(rows(drawing).length, 2, 'only the ellipse and the curve appear in Layers');
}

test('overlapping closed and open curves do not subdivide an ellipse or add loose segments', () => {
  for (const closed of [false, true]) {
    const { base, drawing, ellipseId, curveId } = fixture(closed);
    ellipseUnchanged(drawing, base, ellipseId);
    assert.equal(drawing.faces[curveId].spline.closed, closed);
    let edited = drawing;
    for (const [x, y] of [[0, 0], [10, 5], [-7, 2], [2, -1]]) {
      edited = e.updateSpline(edited, curveId, controls.map((p, i) => i === 1 ? { x, y } : p));
      ellipseUnchanged(edited, base, ellipseId);
    }
    if (closed) near(e.faceArea(edited, curveId), polygonArea(e.catmullRom(edited.faces[curveId].spline.pts, 8, true)));
  }
});

test('closing and moving a curve preserves its identity, properties, area and the underlying ellipse', () => {
  const { base, drawing, ellipseId, curveId } = fixture(false);
  drawing.faces[curveId] = {
    ...drawing.faces[curveId], name: 'Дорожка', fill: 'texture:gray-pavers', textureRotation: 90,
    hydro: { method: 'none', purpose: 'none' },
  };
  let closed = e.updateSpline(drawing, curveId, controls, true);
  const restored = migrateProject(JSON.parse(JSON.stringify(project(closed))));
  closed = e.drawingOrMigrate(restored);
  ellipseUnchanged(closed, base, ellipseId);
  const area = e.faceArea(closed, curveId), center = e.faceCentroid(closed, curveId);
  const moved = e.updateSpline(closed, curveId, controls.map(p => ({ x: p.x + 3, y: p.y - 2 })));
  ellipseUnchanged(moved, base, ellipseId);
  near(e.faceArea(moved, curveId), area);
  near(e.faceCentroid(moved, curveId).x, center.x + 3);
  near(e.faceCentroid(moved, curveId).y, center.y - 2);
  for (const key of ['name', 'fill', 'textureRotation', 'hydro']) assert.deepEqual(moved.faces[curveId][key], drawing.faces[curveId][key]);
  const rebuilt = e.cloneDrawing(moved);
  e.rebuildFaces(rebuilt, 'lawn');
  ellipseUnchanged(rebuilt, base, ellipseId);
  assert.deepEqual(JSON.parse(JSON.stringify(rebuilt.faces[curveId])), JSON.parse(JSON.stringify(moved.faces[curveId])));
});

test('editing and undoing a curve never removes the ellipse or creates extra layers', () => {
  const { base, drawing, ellipseId, curveId } = fixture();
  useProject.setState({ project: project(drawing), selectedPolyId: curveId, selectedPolyIds: [curveId],
    cadEditId: null, selectedEdgeId: null, past: [], future: [], tool: 'draw', drawSub: 'none' });
  useProject.getState().setCadEdit(curveId);
  ellipseUnchanged(useProject.getState().project.drawing, base, ellipseId);
  useProject.getState().setSplinePt(1, { x: 0, y: 1 });
  const edited = useProject.getState().project.drawing;
  ellipseUnchanged(edited, base, ellipseId);
  assert.equal(useProject.getState().cadEditId, curveId);
  useProject.getState().undo();
  assert.deepEqual(useProject.getState().project.drawing.faces[curveId].spline.pts, controls);
  ellipseUnchanged(useProject.getState().project.drawing, base, ellipseId);
  useProject.getState().redo();
  assert.deepEqual(useProject.getState().project.drawing.faces[curveId].spline.pts[1], { x: 0, y: 1 });
  ellipseUnchanged(useProject.getState().project.drawing, base, ellipseId);
});

test('legacy sampled curve boundaries detach without deleting another face shared edges', () => {
  const base = e.addRect(emptyDrawing(), { x: 0, y: 0 }, { x: 4, y: 4 }, 'lawn');
  const otherId = Object.keys(base.faces)[0];
  const legacy = e.addRect(base, { x: 4, y: 0 }, { x: 8, y: 4 }, 'path');
  const curveId = Object.keys(legacy.faces).find(id => id !== otherId);
  const curve = legacy.faces[curveId];
  curve.spline = { pts: [{ x: 4, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 4 }, { x: 4, y: 4 }], closed: true };
  const otherPoints = e.facePoints(legacy, otherId);
  const otherEdges = legacy.faces[otherId].outer.map(half => half.e);
  const edited = e.updateSpline(legacy, curveId, curve.spline.pts.map(p => ({ x: p.x + 2, y: p.y + 1 })));
  assert.deepEqual(e.facePoints(edited, otherId), otherPoints);
  assert.ok(otherEdges.every(id => edited.edges[id]));
  assert.equal(Object.keys(edited.edges).length, otherEdges.length);
  assert.equal(Object.keys(edited.faces).length, 2);
  assert.equal(rows(edited).length, 2);
  assert.deepEqual(edited.faces[curveId].outer, []);
});

test('draft undo and redo walk every point without changing project history', () => {
  for (const sub of ['polygon', 'spline']) {
    const base=project(e.addRect(emptyDrawing(),{x:0,y:0},{x:4,y:3},'lawn'));
    useProject.setState({project:base,past:[emptyProject()],future:[emptyProject()]});
    useProject.getState().setDrawSub(sub);
    const st=useProject.getState();
    for(const point of controls) st.addDraftPoint(point);
    for(let count=controls.length-1;count>=0;count--) {
      st.undo(); assert.deepEqual(useProject.getState().draft.points,controls.slice(0,count));
      assert.equal(useProject.getState().project,base);
    }
    st.undo(); assert.equal(useProject.getState().project,base);
    for(let count=1;count<=controls.length;count++) {
      st.redo(); assert.deepEqual(useProject.getState().draft.points,controls.slice(0,count));
    }
    st.redo(); assert.equal(useProject.getState().project,base);
    assert.equal(useProject.getState().past.length,1);
    assert.equal(useProject.getState().future.length,1);
    st.undo();st.addDraftPoint({x:12,y:15});st.redo();
    assert.deepEqual(useProject.getState().draft.points.at(-1),{x:12,y:15});
    assert.equal(useProject.getState().draft.points.length,controls.length);
    st.undo();st.cancelDraft();st.redo();
    assert.deepEqual(useProject.getState().draft.points,[]);
    st.addDraftPoint(controls[0]);st.undo();st.setDrawSub(sub);st.redo();
    assert.deepEqual(useProject.getState().draft.points,[]);
  }
});


test('crossing lines do not split each other or existing figures; endpoint closure waits for confirmation', () => {
  const base=e.addEllipse(emptyDrawing(),{x:0,y:0},4,2,'lawn');
  const id=Object.keys(base.faces)[0];
  let d=base;
  const segments=[ [{x:-6,y:0},{x:6,y:0}], [{x:-3,y:-4},{x:3,y:4}], [{x:-3,y:4},{x:3,y:-4}] ];
  for(const pts of segments) d=e.addDrawingLines(d,pts,'lawn');
  assert.equal(Object.keys(d.faces).length,1);
  assert.equal(Object.keys(d.edges).length,Object.keys(base.edges).length+3);
  assert.deepEqual(d.faces[id],base.faces[id]);
  for(const [key,value] of Object.entries(base.edges)) assert.deepEqual(d.edges[key],value);
  const closed=e.addDrawingLines(d,[{x:10,y:0},{x:14,y:0},{x:14,y:3},{x:10,y:0}],'lawn');
  assert.equal(Object.keys(closed.faces).length,1);
  assert.deepEqual(closed.faces[id],base.faces[id]);
});

test('self-crossing pencil stroke adds at most one independent face and no topology edges', () => {
  const base=e.addEllipse(emptyDrawing(),{x:0,y:0},4,2,'lawn');
  const raw=[{x:-3,y:0},{x:3,y:3},{x:3,y:-3},{x:-3,y:3},{x:-3,y:-3},{x:2,y:0}];
  for(const pts of [raw,[...raw,raw[0]]]) {
    const r=e.addFreehandStroke(base,pts,'lawn',{closeTolerance:0.05});
    assert.equal(Object.keys(r.drawing.faces).length,2);
    assert.deepEqual(r.drawing.edges,base.edges);
    assert.deepEqual(r.drawing.vertices,base.vertices);
    for(const [key,value] of Object.entries(base.faces)) assert.deepEqual(r.drawing.faces[key],value);
  }
});

test('segments migrate to layer rows and selection does not enter editing', () => {
  let d=e.addDrawingLines(emptyDrawing(),[{x:0,y:0},{x:3,y:4}],'lawn');
  d=e.addDrawingLines(d,[{x:8,y:0},{x:8,y:5}],'lawn');
  const ids=Object.keys(d.edges);
  const restored=migrateProject(JSON.parse(JSON.stringify(project(d))));
  assert.equal(Object.keys(restored.drawing.edges).length,0);
  assert.equal(rows(restored.drawing).length,2);
  assert.ok(rows(restored.drawing).every(row=>row.title.startsWith('Отрезок')));
  for(const id of ids) { assert.equal(restored.drawing.faces[id].segment,true); near(e.facePerimeter(restored.drawing,id),5); }
  useProject.setState({project:restored,cadEditId:null,selectedPolyId:null,selectedPolyIds:[],selectedEdgeId:null,past:[],future:[]});
  useProject.getState().selectPoly(ids[0]);
  assert.equal(useProject.getState().cadEditId,null);
  assert.equal(useProject.getState().selectedPolyId,ids[0]);
  useProject.getState().setCadEdit(ids[0]);
  assert.equal(useProject.getState().cadEditId,ids[0]);
  useProject.getState().setSplinePt(1,{x:6,y:8});
  near(e.facePerimeter(useProject.getState().project.drawing,ids[0]),10);
  useProject.getState().hideSelected(true);
  assert.equal(useProject.getState().cadEditId,null);
  assert.equal(useProject.getState().project.drawing.faces[ids[0]].hidden,true);
});

test('multiple segments toggle, merge, move and split with layer identity preserved', () => {
  let d=e.segmentLayers(e.addDrawingLines(emptyDrawing(),[{x:0,y:0},{x:3,y:4},{x:7,y:4}],'lawn'));
  const ids=Object.keys(d.faces);
  useProject.setState({project:project(d),selectedPolyIds:[],selectedPolyId:null,cadEditId:null,pendingConstraint:null});
  ids.forEach(id=>useProject.getState().selectPoly(id,true));
  assert.equal(useProject.getState().selectedPolyIds.length,2);
  useProject.getState().selectPoly(ids[0],true);
  assert.deepEqual(useProject.getState().selectedPolyIds,[ids[1]]);
  const grouped=e.mergeLayers(d,ids);
  assert.equal(rows(grouped).length,1);
  assert.equal(e.layerFaceIds(grouped,ids[0]).length,2);
  const moved=e.moveFace(grouped,ids[0],2,3);
  for(const id of ids) { const a=e.facePoints(d,id)[0],b=e.facePoints(moved,id)[0];near(b.x,a.x+2);near(b.y,a.y+3); }
  const split=e.splitLayer(moved,ids[0]);
  assert.equal(rows(split).length,2);
  assert.ok(ids.every(id=>split.faces[id].segment && !split.faces[id].layerId));
  const locked=e.setFaceLocked(grouped,ids[0],true);
  assert.ok(ids.every(id=>locked.faces[id].locked));
  const deleted=e.deleteFace(moved,ids[0]);
  assert.equal(Object.keys(deleted.faces).length,0);
});


test('collinear endpoint segments join, without joining crossings, corners or groups', () => {
  const add = (d,a,b) => e.segmentLayers(e.addDrawingLines(d,[a,b],'lawn'));
  let d=add(emptyDrawing(),{x:0,y:0},{x:3,y:4});
  const id=Object.keys(d.faces)[0];
  d=add(d,{x:3,y:4},{x:6,y:8});
  assert.equal(Object.keys(d.faces).length,1);
  near(e.layerPerimeter(d,id),10);
  d=add(d,{x:6,y:8},{x:9,y:12});
  near(e.layerPerimeter(d,id),15);
  d=add(d,{x:6,y:8},{x:8,y:8});
  assert.equal(Object.keys(d.faces).length,2);
  d=add(d,{x:0,y:6},{x:9,y:6});
  assert.equal(Object.keys(d.faces).length,3);
  d.faces[id].layerId='group';
  d=add(d,{x:9,y:12},{x:12,y:16});
  assert.equal(Object.keys(d.faces).length,4);
});


test('overlapping and contained segments select and edit as one full segment after reload', () => {
  const raw=(pairs) => {
    const d=emptyDrawing();
    pairs.forEach((pts,i)=>{d.faces['s'+i]={id:'s'+i,type:'lawn',outer:[],holes:[],segment:true,spline:{pts,closed:false}};});
    return d;
  };
  for (const pts of [[{x:2,y:0},{x:5,y:0}], [{x:12,y:0},{x:5,y:0}], [{x:10,y:0},{x:0,y:0}]]) {
    const d=raw([[{x:0,y:0},{x:10,y:0}],pts]);
    const fixed=migrateProject(project(d));
    assert.equal(Object.keys(fixed.drawing.faces).length,1);
    const expected=Math.max(10,pts[0].x,pts[1].x);
    near(e.layerPerimeter(fixed.drawing,'s0'),expected);
    useProject.setState({project:fixed,selectedPolyId:null,selectedPolyIds:[],cadEditId:null,past:[],future:[]});
    useProject.getState().selectPoly('s0');
    assert.deepEqual(useProject.getState().selectedPolyIds,['s0']);
    useProject.getState().setCadEdit('s0');
    near(e.layerPerimeter(useProject.getState().project.drawing,'s0'),expected);
    assert.equal(useProject.getState().project.drawing.faces.s0.spline.pts.length,2);
    const preferred=e.segmentLayers(d,'s1');
    assert.deepEqual(Object.keys(preferred.faces),['s1']);
    near(e.layerPerimeter(preferred,'s1'),expected);
  }
  const separated=raw([[{x:0,y:0},{x:10,y:0}],[{x:2,y:.01},{x:5,y:.01}],[{x:11,y:0},{x:12,y:0}]]);
  assert.equal(Object.keys(e.segmentLayers(separated).faces).length,3);
});


test('segment closure offers a figure without changing lines until confirmed; tails and other figures survive', () => {
  const ellipse=e.addEllipse(emptyDrawing(),{x:2,y:1},3,2,'lawn');
  const ellipseId=Object.keys(ellipse.faces)[0];
  let d=ellipse;
  for(const pts of [ [{x:-2,y:0},{x:6,y:0}], [{x:4,y:0},{x:4,y:3}], [{x:4,y:3},{x:0,y:3}], [{x:0,y:3},{x:0,y:0}] ]) {
    d=e.segmentLayers(e.addDrawingLines(d,pts,'lawn'));
  }
  const before=structuredClone(d);
  const candidates=sf.segmentFigures(d);
  assert.equal(candidates.length,1);
  assert.deepEqual(d,before); // Detection/cancellation never changes the project.
  const result=sf.createSegmentFigure(d,candidates[0].key);
  assert.ok(result);
  near(e.faceArea(result.drawing,result.faceId),12);
  assert.equal(result.drawing.faces[result.faceId].pointShape,true);
  assert.deepEqual(result.drawing.faces[ellipseId],ellipse.faces[ellipseId]);
  const tails=Object.values(result.drawing.faces).filter(f=>f.segment);
  assert.equal(tails.length,2);
  near(tails.reduce((sum,f)=>sum+e.facePerimeter(result.drawing,f.id),0),4);
  assert.equal(sf.segmentFigures(result.drawing).length,0);
  useProject.setState({project:project(d),past:[],future:[],selectedPolyId:null,selectedPolyIds:[],cadEditId:null});
  useProject.getState().commitDrawing(result.drawing,result.faceId);
  useProject.getState().setCadEdit(result.faceId);
  assert.equal(useProject.getState().cadEditId,result.faceId);
  useProject.getState().undo();
  assert.equal(sf.segmentFigures(useProject.getState().project.drawing).length,1);
});

test('crossings alone and open segment chains do not offer a figure', () => {
  let d=emptyDrawing();
  for(const pts of [[{x:-1,y:0},{x:5,y:0}],[{x:4,y:-1},{x:4,y:4}],[{x:5,y:3},{x:-1,y:3}],[{x:0,y:4},{x:0,y:-1}]]) d=e.segmentLayers(e.addDrawingLines(d,pts,'lawn'));
  assert.equal(sf.segmentFigures(d).length,0);
  d=e.segmentLayers(e.addDrawingLines(emptyDrawing(),[{x:0,y:0},{x:3,y:0},{x:3,y:2}],'lawn'));
  assert.equal(sf.segmentFigures(d).length,0);
});


test('numeric line length works before the first point and for consecutive normalized segments', () => {
  useProject.setState({project:project(emptyDrawing()),past:[],future:[],draft:{points:[]},tool:'draw',drawSub:'line',selectedEdgeId:null,cadEditId:null});
  const st=useProject.getState();
  st.applyCadLength(7.5,null);
  assert.equal(useProject.getState().draft.lineLength,7.5);
  assert.equal(Object.keys(useProject.getState().project.drawing.faces).length,0);
  st.addDraftPoint({x:2,y:3});
  st.applyCadLength(7.5,{x:2,y:10});
  let state=useProject.getState();
  near(Object.values(state.project.drawing.faces).reduce((sum,f)=>sum+e.facePerimeter(state.project.drawing,f.id),0),7.5);
  assert.deepEqual(state.draft.points,[{x:2,y:10.5}]);
  st.applyCadLength(2.5,{x:2,y:15});
  state=useProject.getState();
  near(Object.values(state.project.drawing.faces).reduce((sum,f)=>sum+e.facePerimeter(state.project.drawing,f.id),0),10);
  assert.equal(Object.keys(state.project.drawing.faces).length,1);
  st.undo();
  state=useProject.getState();
  near(Object.values(state.project.drawing.faces).reduce((sum,f)=>sum+e.facePerimeter(state.project.drawing,f.id),0),7.5);
});


test('figure corners outrank edges and grid; editing geometry never snaps to itself', () => {
  let d=e.addRect(emptyDrawing(),{x:0.13,y:0.27},{x:4.13,y:3.27},'lawn');
  const target=Object.keys(d.faces)[0];
  d=e.addRect(d,{x:7,y:5},{x:9,y:7},'lawn');
  const moving=Object.keys(d.faces).find(id=>id!==target);
  const hit=fsnap.snapFigurePoint(d,{x:4.09,y:3.25},moving,40,1,true);
  near(hit.x,4.13); near(hit.y,3.27);
  const free=fsnap.snapFigurePoint(d,{x:7.01,y:5.01},moving,40,1,false);
  near(free.x,7.01);near(free.y,5.01);
  const anchors=e.faceVertices(d,moving);
  const delta=fsnap.snapFigureTranslation(d,moving,anchors,-2.9,-1.7,1,40,true);
  near(7+delta.dx,4.13); near(5+delta.dy,3.27);
  const gridOff=fsnap.snapFigureTranslation(d,moving,anchors,-2.9,-1.7,1,40,false);
  assert.deepEqual(gridOff,delta);
  d.faces[target].hidden=true;
  const hidden=fsnap.snapFigurePoint(d,{x:4.09,y:3.25},moving,40,1,false);
  near(hidden.x,4.09);near(hidden.y,3.25);
});


test('group member appearance stays isolated through nested grouping and splitting', () => {
  let d=e.addRect(emptyDrawing(),{x:0,y:0},{x:3,y:4},'lawn');
  d=e.addRect(d,{x:5,y:0},{x:8,y:4},'lawn');
  d=e.addRect(d,{x:10,y:0},{x:13,y:4},'lawn');
  const [a,b,c]=Object.keys(d.faces);
  d=e.setFaceName(d,a,'Терраса');
  d=e.mergeLayers(d,[a,b]);
  d=e.mergeLayers(d,[a,c]);
  const before=JSON.parse(JSON.stringify(d));
  d=e.setGroupMemberAppearance(d,a,{fill:'texture:deck',textureRotation:90});
  assert.deepEqual(d.faces[b],before.faces[b]);
  assert.deepEqual(d.faces[c],before.faces[c]);
  assert.deepEqual(d.vertices,before.vertices);
  assert.equal(d.faces[a].layerId,before.faces[a].layerId);
  assert.equal(d.faces[a].hydro.purpose,'none');
  assert.equal(e.groupMembers(d,a)[0].name,'Терраса');
  d=e.setGroupMemberAppearance(d,a,{purpose:'shade'});
  d=e.splitLayer(d,a);
  d=e.splitLayer(d,a);
  assert.equal(d.faces[a].name,'Терраса');
  assert.equal(d.faces[a].fill,'texture:deck');
  assert.equal(d.faces[a].textureRotation,90);
  assert.equal(d.faces[a].hydro.purpose,'shade');
  d=e.setFaceLocked(d,a,true);
  assert.equal(e.setGroupMemberAppearance(d,a,{fill:'#ff0000'}),d);
});

test('a group member edits independently, persists its membership and returns to the whole group', () => {
  let d=e.addRect(emptyDrawing(),{x:0,y:0},{x:3,y:4},'lawn');
  d=e.addCircle(d,{x:8,y:2},2,'lawn');
  const [a,b]=Object.keys(d.faces);
  d=e.setFaceName(d,b,'Клумба');
  d=e.mergeLayers(d,[a,b]);
  const group=d.faces[a].layerId, sibling=JSON.parse(JSON.stringify(d.faces[a]));
  useProject.setState({project:project(d),groupMemberId:null,groupMemberGroupId:null,cadEditId:null,selectedPolyIds:[],past:[],future:[],pastOps:[],futureOps:[],pendingConstraint:null});
  const st=()=>useProject.getState();
  st().selectGroupMember(b);
  assert.deepEqual(st().selectedPolyIds,[b]);
  assert.equal(st().cadEditId,null);
  st().setCadEdit(b);
  assert.equal(st().cadEditId,b);
  st().setCircleR(3);
  near(e.faceArea(st().project.drawing,b),Math.PI*9);
  near(e.layerArea(st().project.drawing,a),12+Math.PI*9);
  assert.equal(st().project.drawing.faces[b].layerId,group);
  assert.deepEqual(st().project.drawing.faces[a],sibling);
  st().setFaceName('Новая клумба');
  st().setFaceFill('#ff0000');
  st().setLayerPurpose(b,'shade');
  assert.equal(e.groupMembers(st().project.drawing,a)[1].name,'Новая клумба');
  let view=drawingForEditing(st().project);
  st().commitDrawing(e.moveFace(view,b,2,1),b,true);
  near(st().project.drawing.faces[b].circle.cx,10);
  st().commitDrawing(e.rotateFace(drawingForEditing(st().project),b,35),b,true);
  assert.deepEqual(st().project.drawing.faces[a],sibling);
  st().selectPoly(a); st().setCadEdit(a);
  assert.equal(st().cadEditId,b);
  assert.deepEqual(st().selectedPolyIds,[b]);
  st().undo(); st().redo();
  assert.equal(st().project.drawing.faces[b].layerId,group);
  const reloaded=migrateProject(JSON.parse(JSON.stringify(st().project)));
  assert.equal(reloaded.drawing.faces[b].layerId,group);
  st().setCadEdit(null);
  assert.equal(st().groupMemberId,null);
  assert.deepEqual(st().selectedPolyIds,[a,b]);
  const moved=e.moveFace(st().project.drawing,a,1,2);
  near(e.faceCentroid(moved,a).x,e.faceCentroid(st().project.drawing,a).x+1);
  near(moved.faces[b].circle.cx,st().project.drawing.faces[b].circle.cx+1);
});

test('member visibility, locking, deletion and undo never act on its siblings', () => {
  let d=e.addRect(emptyDrawing(),{x:0,y:0},{x:3,y:4},'lawn');
  d=e.addRect(d,{x:5,y:0},{x:8,y:4},'lawn');
  d=e.addRect(d,{x:10,y:0},{x:13,y:4},'lawn');
  const [a,b,c]=Object.keys(d.faces);
  d=e.mergeLayers(e.mergeLayers(d,[a,b]),[a,c]);
  const sibling=JSON.parse(JSON.stringify(d.faces[b]));
  useProject.setState({project:project(d),groupMemberId:null,groupMemberGroupId:null,cadEditId:null,past:[],future:[],pastOps:[],futureOps:[],pendingConstraint:null});
  const st=()=>useProject.getState();
  st().selectGroupMember(a,true);
  st().setFaceArea(24);
  near(e.faceArea(st().project.drawing,a),24);
  st().setGroupMemberFlag(a,{hidden:true});
  assert.equal(st().cadEditId,null);
  assert.equal(st().project.drawing.faces[b].hidden,false);
  st().setGroupMemberFlag(a,{hidden:false,locked:true});
  st().setCadEdit(a);
  assert.equal(st().cadEditId,null);
  st().deleteGroupMember(a);
  assert.ok(st().project.drawing.faces[a]);
  st().setGroupMemberFlag(a,{locked:false});
  st().selectGroupMember(a,true);
  st().deleteSelected();
  assert.equal(st().project.drawing.faces[a],undefined);
  assert.equal(Object.keys(st().project.drawing.faces).length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(st().project.drawing.faces[b])),sibling);
  assert.equal(rows(st().project.drawing).length,1);
  assert.equal(st().groupMemberId,null);
  assert.deepEqual(st().selectedPolyIds,[b,c]);
  st().undo();
  assert.ok(st().project.drawing.faces[a].layerId);
  assert.equal(Object.keys(st().project.drawing.faces).length,3);
});

test('a curve inside a group retains editable control points and group metadata', () => {
  const { drawing, ellipseId, curveId } = fixture(true);
  const grouped=e.mergeLayers(drawing,[ellipseId,curveId]);
  useProject.setState({project:project(grouped),groupMemberId:null,groupMemberGroupId:null,cadEditId:null,past:[],future:[],pastOps:[],futureOps:[]});
  const st=()=>useProject.getState();
  st().selectGroupMember(curveId,true);
  st().setSplinePt(1,{x:9,y:-6});
  const d=st().project.drawing;
  assert.deepEqual(d.faces[curveId].spline.pts[1],{x:9,y:-6});
  assert.equal(d.faces[curveId].layerId,grouped.faces[curveId].layerId);
  assert.deepEqual(JSON.parse(JSON.stringify(d.faces[ellipseId])),JSON.parse(JSON.stringify(grouped.faces[ellipseId])));
  near(e.layerArea(d,ellipseId),e.faceArea(d,ellipseId)+e.faceArea(d,curveId));
  st().finishGroupMember();
  const rotated=e.rotateFace(st().project.drawing,ellipseId,30);
  near(e.faceArea(rotated,curveId),e.faceArea(d,curveId));
});

test('group reordering changes paint order only and survives undo, reload and split', () => {
  let d=e.addRect(emptyDrawing(),{x:0,y:0},{x:4,y:4},'lawn');
  d=e.addCircle(d,{x:2,y:2},2,'lawn');
  d=e.addRect(d,{x:1,y:1},{x:3,y:3},'lawn');
  const [a,b,c]=Object.keys(d.faces);
  d=e.mergeLayers(d,[a,c]);
  const original=JSON.parse(JSON.stringify(d));
  useProject.setState({project:project(d),groupMemberId:null,groupMemberGroupId:null,cadEditId:null,selectedPolyIds:[],past:[],future:[],pastOps:[],futureOps:[]});
  useProject.getState().reorderGroupMembers([a,c]);
  let next=useProject.getState().project.drawing;
  assert.deepEqual(e.orderedFaces(next).map(f=>f.id),[c,b,a]);
  assert.deepEqual(e.toPolygons(next).map(p=>p.id),[c,b,a]);
  for(const id of [a,b,c]) assert.deepEqual(JSON.parse(JSON.stringify(next.faces[id])),original.faces[id]);
  near(e.layerArea(next,a),e.layerArea(original,a));
  useProject.getState().undo();
  assert.deepEqual(Object.keys(useProject.getState().project.drawing.faces),[a,b,c]);
  useProject.getState().redo();
  next=migrateProject(JSON.parse(JSON.stringify(useProject.getState().project))).drawing;
  assert.deepEqual(e.orderedFaces(next).map(f=>f.id),[c,b,a]);
  assert.deepEqual(e.orderedFaces(e.splitLayer(next,a)).map(f=>f.id),[c,b,a]);
  const before=useProject.getState().project;
  useProject.getState().reorderGroupMembers([a,b]);
  assert.equal(useProject.getState().project,before);
});


test('tablet reorder preserves group identity, numbering and child order', () => {
  let d=e.addRect(emptyDrawing(),{x:0,y:0},{x:4,y:4},'lawn');
  d=e.addCircle(d,{x:2,y:2},2,'lawn');
  d=e.addRect(d,{x:1,y:1},{x:3,y:3},'lawn');
  const [a,b,c]=Object.keys(d.faces);d=e.mergeLayers(d,[a,c]);
  const group=d.faces[a].layerId;
  useProject.setState({project:project(d),groupMemberId:null,groupMemberGroupId:null,cadEditId:null,past:[],future:[],pastOps:[],futureOps:[]});
  const beforeKey=rows(d).find(r=>r.id===a).key;
  useProject.getState().reorderGroupMembers([a,c]);
  let next=useProject.getState().project.drawing;
  assert.equal(rows(next).find(r=>r.id===a).key,beforeKey);
  assert.deepEqual(Object.keys(next.faces),[a,b,c]);
  useProject.getState().reorderLayers([b,group]);
  next=useProject.getState().project.drawing;
  assert.deepEqual(e.toPolygons(next).map(p=>p.id),[c,a,b]);
  assert.equal(e.faceLayerNumber(next,b),e.faceLayerNumber(d,b));
  assert.equal(e.faceLayerNumber(next,a),e.faceLayerNumber(d,a));
  useProject.getState().undo();
  assert.deepEqual(e.toPolygons(useProject.getState().project.drawing).map(p=>p.id),[c,b,a]);
  useProject.getState().redo();
  next=migrateProject(JSON.parse(JSON.stringify(useProject.getState().project))).drawing;
  assert.deepEqual(e.toPolygons(next).map(p=>p.id),[c,a,b]);
});

test('closing drawing clears active tools and selection without changing committed geometry',()=>{
 const base=project(e.addRect(emptyDrawing(),{x:0,y:0},{x:4,y:3},'lawn'));
 for(const sub of ['polygon','spline','line']) {
  useProject.setState({project:base,tool:'draw',drawSub:sub,cadEditId:'face',selectedPolyId:'face',selectedPolyIds:['face'],selectedEdgeId:'edge',draft:{points:controls,redoPoints:[],scaleA:null,scaleB:null,measureA:null},rightOpen:true});
  useProject.getState().deactivateDrawing();const st=useProject.getState();
  assert.equal(st.project,base);assert.equal(st.tool,null);assert.equal(st.drawSub,'none');
  assert.equal(st.cadEditId,null);assert.equal(st.selectedEdgeId,null);assert.deepEqual(st.selectedPolyIds,[]);assert.equal(st.draft.points.length,0);assert.equal(st.rightOpen,false);
 }
});

test('near segment alignment snaps the real endpoint exactly and turns both axes green',()=>{
 for(const px of [10,50,200]) {
  const anchors=[{x:0,y:0},{x:10,y:10}];
  const raw={x:2/px,y:10-1/px};
  const q=snapSegmentAlignment(raw,{x:0.25,y:9.75},anchors,px);
  assert.deepEqual(q,{x:0,y:10});
  assert.ok(segmentAlignmentGuides(q,anchors,px).every(g=>g.aligned));
  const far={x:8/px,y:20};
  assert.deepEqual(snapSegmentAlignment(far,far,[anchors[0]],px),far);
 }
});

test('undo reopens a point contour, walks to zero and redo closes the identical figure',()=>{
 const base=project(e.addRect(emptyDrawing(),{x:20,y:20},{x:24,y:23},'lawn'));
 base.name='Autosaved contour';
 const pts=[{x:0,y:0},{x:5,y:0},{x:5,y:4},{x:0,y:4}];
 useProject.setState({project:base,past:[],future:[],pastOps:[],futureOps:[],lastOp:'',groupMemberId:null});
 useProject.getState().setDrawSub('polygon');
 for(const p of pts)useProject.getState().addDraftPoint(p);
 useProject.getState().closePolygon();
 const closed=useProject.getState().project;const id=useProject.getState().selectedPolyId;
 assert.ok(closed.drawing.faces[id]);
 assert.equal(e.faceArea(closed.drawing,id),20,'the first tap is a real vertex, no discarded origin');
 useProject.getState().saveCurrentToLibrary();
 assert.notEqual(useProject.getState().project,closed,'autosave replaces the project shell');
 useProject.getState().saveCurrentToLibrary();
 useProject.getState().renameLibrary(base.id,'Renamed contour');
 useProject.getState().patchProject({name:'Later edit'});
 useProject.getState().undo();
 assert.ok(useProject.getState().project.drawing.faces[id],'a later edit is undone before closure');
 useProject.getState().undo();
 assert.equal(useProject.getState().drawSub,'polygon');
 assert.deepEqual(useProject.getState().draft.points,pts);
 assert.equal(useProject.getState().project.drawing.faces[id],undefined);
 assert.deepEqual(useProject.getState().project.drawing,base.drawing);
 for(let n=pts.length-1;n>=0;n--){useProject.getState().undo();assert.deepEqual(useProject.getState().draft.points,pts.slice(0,n));}
 for(let n=1;n<=pts.length;n++){useProject.getState().redo();assert.deepEqual(useProject.getState().draft.points,pts.slice(0,n));}
 useProject.getState().redo();
 assert.deepEqual(useProject.getState().project.drawing,closed.drawing);
 assert.equal(useProject.getState().cadEditId,id);
 useProject.getState().saveCurrentToLibrary();
 useProject.getState().undo();
 assert.deepEqual(useProject.getState().draft.points,pts,'redo followed by autosave retains point undo');
 useProject.getState().addDraftPoint({x:-2,y:2});
 const changed=useProject.getState().draft.points;
 useProject.getState().redo();
 assert.deepEqual(useProject.getState().draft.points,changed,'a changed draft cannot restore an obsolete closed contour');
});

test('three point taps create a triangle without a helper origin',()=>{
 const base=project(emptyDrawing());
 useProject.setState({project:base,past:[],future:[],groupMemberId:null,cadEditId:null,selectedPolyId:null,selectedPolyIds:[],selectedEdgeId:null,drawSub:'none',tool:null});
 useProject.getState().setDrawSub('polygon');
 useProject.getState().addDraftPoint({x:2,y:2});
 useProject.getState().applyCadLength(4,{x:6,y:2});
 assert.deepEqual(useProject.getState().draft.points,[{x:2,y:2},{x:6,y:2}]);
 useProject.getState().addDraftPoint({x:2,y:5});
 useProject.getState().closePolygon();
 const st=useProject.getState();
 assert.equal(e.faceArea(st.project.drawing,st.cadEditId),6);
 st.undo();
 assert.equal(useProject.getState().draft.points.length,3);
});
