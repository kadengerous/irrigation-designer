import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('parametric fillets change true CAD geometry, snap to arcs, preserve radii through edits and restore R=0',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false}});
 try {
  const e=await server.ssrLoadModule('/src/lib/cad/engine.ts');
  const r=await server.ssrLoadModule('/src/lib/cad/rounding-engine.ts');
  const g=await server.ssrLoadModule('/src/lib/cad/corner-rounding.ts');
  const {emptyDrawing}=await server.ssrLoadModule('/src/lib/cad/types.ts');
  const {snapSprinklerPoint}=await server.ssrLoadModule('/src/lib/head-snapping.ts');
  const {inIrrigable}=await server.ssrLoadModule('/src/lib/cad/irrigation-geom.ts');
  const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
  const base=e.addRect(emptyDrawing(),{x:0,y:0},{x:10,y:5},'lawn'),id=Object.keys(base.faces)[0];
  let d=r.setFaceCornerRadii(base,id,[0,1,2,3],.5).drawing;
  assert.equal(d.faces[id].outer.length,8);assert.equal(base.faces[id].rounding,undefined);
  near(e.faceArea(d,id),50-(4-Math.PI)*.25);near(e.facePerimeter(d,id),30-4+Math.PI);
  assert.equal(inIrrigable({x:.01,y:.01},d),false);assert.equal(inIrrigable({x:.5,y:.5},d),true);
  assert.equal(e.headInsideFace(d,id,{x:.01,y:.01}),false,'layer membership uses the rounded contour');
  const {automaticDimensions}=await server.ssrLoadModule('/src/lib/cad/auto-dimensions.ts');
  const {emptyProject}=await server.ssrLoadModule('/src/lib/project-types.ts');
  const dimensioned=automaticDimensions({...emptyProject(),drawing:d,polygons:e.toPolygons(d)},'plan');
  assert.equal(Object.keys(dimensioned.dims).length,2,'rounded contours receive width and height only');
  const widthDim=Object.values(dimensioned.dims).find(dim=>dim.faceAxis.axis==='x');
  const fromDimension=e.setDimensionLength(dimensioned,widthDim.id,12);
  near(g.roundedBounds(fromDimension.faces[id].rounding.corners,fromDimension.faces[id].rounding.radii).width,12);
  assert.deepEqual(fromDimension.faces[id].rounding.radii,[.5,.5,.5,.5]);
  const hit=snapSprinklerPoint({x:.14,y:.14},d,{snapOn:true,pxPerMeter:100});
  near(Math.hypot(hit.pt.x-.5,hit.pt.y-.5),.5);assert.ok(hit.pt.x>.1&&hit.pt.y>.1);
  assert.equal(e.toPolygons(d)[0].type,'poly');assert.ok(e.toPolygons(d)[0].points.length>8);
  d=e.setRectSize(d,id,12,6);assert.deepEqual(d.faces[id].rounding.radii,[.5,.5,.5,.5]);
  near(e.faceArea(d,id),72-(4-Math.PI)*.25);
  d=e.moveFace(d,id,3,8);d=e.rotateFace(d,id,37);d=e.scaleFaceAbout(d,id,2);
  assert.deepEqual(d.faces[id].rounding.radii,[.5,.5,.5,.5]);near(e.faceArea(d,id),288-(4-Math.PI)*.25);
  const copy=e.duplicateFace(d,id,8,9);assert.deepEqual(copy.drawing.faces[copy.id].rounding.radii,[.5,.5,.5,.5]);
  assert.notEqual(copy.drawing.faces[copy.id].rounding.corners[0].id,d.faces[id].rounding.corners[0].id);
  d=e.setRectSize(d,id,.6,.4);assert.ok(d.faces[id].rounding.radii.every(v=>v<.2&&v>.19));
  d=r.setFaceCornerRadii(d,id,[0],0).drawing;assert.equal(d.faces[id].rounding.radii[0],0);
  assert.ok(d.faces[id].rounding.radii[1]>0);
  d=r.setFaceCornerRadii(d,id,[0,1,2,3],0).drawing;near(e.faceArea(d,id),.24);near(e.facePerimeter(d,id),2);
  const data=JSON.parse(JSON.stringify(d));assert.deepEqual(data.faces[id].rounding,d.faces[id].rounding);
  const corner=data.faces[id].rounding.corners[0];const edited=e.moveVertex(data,corner.id,{x:corner.x-.2,y:corner.y-.2});
  assert.equal(edited.faces[id].rounding.corners[0].x,corner.x-.2);
  const rotated=e.rotateFace(r.setFaceCornerRadii(base,id,[0,1,2,3],.5).drawing,id,23);
  const resized=e.setRoundedBounds(rotated,id,15,10),meta=resized.faces[id].rounding,bounds=g.roundedBounds(meta.corners,meta.radii);
  near(bounds.width,15,1e-6);near(bounds.height,10,1e-6);assert.deepEqual(meta.radii,[.5,.5,.5,.5]);
  // A small hole near the corner must stop the outer fillet before it crosses the hole.
  const square=[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];
  const hole=g.roundedContour([{x:.3,y:.3},{x:.6,y:.3},{x:.6,y:.6},{x:.3,y:.6}],[0,0,0,0]);
  const holeMaximum=g.maximumCornerRadius(square,[0,0,0,0],[0],hole);
  assert.ok(holeMaximum>1&&holeMaximum<1.1,'fillet is limited by an interior hole');
  assert.ok(g.validRoundedContour(square,[holeMaximum,0,0,0],hole));
  assert.equal(g.validRoundedContour(square,[holeMaximum+.05,0,0,0],hole),false);
  const shapes=[[[0,0],[10,0],[5,8]],[[0,0],[8,0],[8,3],[14,3],[14,8],[0,8]],[[0,0],[8,0],[8,8],[5,8],[5,2],[3,2],[3,8],[0,8]]];
  for(const pairs of shapes) {
   const points=pairs.map(([x,y])=>({x,y})),radii=points.map(()=>0),selected=points.map((_,i)=>i);
   const max=g.maximumCornerRadius(points,radii,selected);assert.ok(max>0);
   assert.ok(g.validRoundedContour(points,radii.map(()=>max)));
   assert.equal(g.validRoundedContour(points,radii.map(()=>max+1)),false);
   const corners=g.roundingCorners(points);
   for(const c of corners) {const arc=g.roundedCorner(c,.25);near(Math.hypot(arc.a.x-arc.center.x,arc.a.y-arc.center.y),.25);near((arc.a.x-arc.center.x)*c.incoming.x+(arc.a.y-arc.center.y)*c.incoming.y,0);}
   if(points.length>3)assert.ok(g.roundedContour(points,radii.map(()=>.2)).some(p=>p.bulge<0),'concave arcs preserve winding');
  }
 } finally {await server.close();}
});

test('context buttons follow capabilities and open the existing material state without modifying it',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false}});
 let store,previous,library,mode,initial;
 try {
  ({useProject:store}=await server.ssrLoadModule('/src/lib/project-store.ts'));previous=store.getState();initial={...store.getInitialState()};
  library=await server.ssrLoadModule('/src/lib/layer-fill-library.ts');
  mode=await server.ssrLoadModule('/src/lib/corner-rounding-store.ts');
  const {FigureContextTools}=await server.ssrLoadModule('/src/components/designer/figure-context-tools.tsx');
  const {emptyProject}=await server.ssrLoadModule('/src/lib/project-types.ts');
  const {emptyDrawing}=await server.ssrLoadModule('/src/lib/cad/types.ts');
  const e=await server.ssrLoadModule('/src/lib/cad/engine.ts');
  let drawing=e.addRect(emptyDrawing(),{x:0,y:0},{x:10,y:5},'building');
  const id=Object.keys(drawing.faces)[0];drawing.faces[id].fill='texture:roof-cedar';
  drawing=e.addCircle(drawing,{x:15,y:15},3,'lawn');
  const circle=Object.keys(drawing.faces).find(key=>key!==id);
  store.setState({project:{...emptyProject(),drawing,polygons:e.toPolygons(drawing)},selectedPolyId:null,selectedPolyIds:[],selectedId:null,selectedIds:[],selectedPlantId:null,selectedEdgeId:null,groupMemberId:null,referenceOpen:false,locale:'ru',tool:'draw',drawSub:'none',cadEditId:null,past:[],future:[]});
  const render=()=>{Object.assign(store.getInitialState(),store.getState());return renderToStaticMarkup(createElement(FigureContextTools));};
  assert.equal(render(),'');
  store.getState().selectPoly(id);
  const markup=render();assert.ok(markup.includes('Заливка и материалы'));assert.ok(markup.indexOf('Заливка и материалы')<markup.indexOf('Скругление углов'));
  const unchanged=store.getState().project;
  library.openLayerFillLibrary(id);assert.equal(store.getState().project,unchanged);assert.equal(library.activeFillFace().fill,'texture:roof-cedar');
  library.applyLibraryFill('texture:lake-water');assert.equal(store.getState().project.drawing.faces[id].fill,'texture:lake-water');
  library.useLayerFillLibrary.setState({open:false});library.openLayerFillLibrary(id);assert.equal(library.activeFillFace().fill,'texture:lake-water');
  store.getState().selectPoly(circle);assert.ok(render().includes('Заливка и материалы'));assert.ok(!render().includes('Скругление углов'));
  store.getState().selectPoly(id,true);assert.equal(render(),'');
  store.getState().selectPoly(id);mode.openCornerRounding();assert.equal(mode.useCornerRounding.getState().faceId,id);
  store.getState().selectPoly(circle);assert.equal(mode.useCornerRounding.getState().faceId,null);
  store.getState().selectPoly(null);assert.equal(render(),'');
 } finally {
  mode?.closeCornerRounding(false);library?.useLayerFillLibrary.setState({open:false});
  if(store&&previous){store.setState(previous);Object.assign(store.getInitialState(),initial);}await server.close();
 }
});
