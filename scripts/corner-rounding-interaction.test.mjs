import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import Konva from 'konva';
import {KonvaRenderer} from 'react-konva/lib/ReactKonvaCore.js';
import {createCanvas,Path2D,DOMMatrix} from '@napi-rs/canvas';
import {createServer} from 'vite';
import {writeFile} from 'node:fs/promises';

test('actual canvas handles drag all/individual corners, clamp radius, and commit one undoable edit',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 globalThis.Path2D=Path2D;globalThis.DOMMatrix=DOMMatrix;
 Konva.Util.createCanvasElement=()=>{const canvas=createCanvas(1,1);canvas.style={};return canvas;};
 const server=await createServer({server:{middlewareMode:true,hmr:false}});
 let store,previous,mode,stage,root;
 try {
  const e=await server.ssrLoadModule('/src/lib/cad/engine.ts');
  const {emptyDrawing}=await server.ssrLoadModule('/src/lib/cad/types.ts');
  const {emptyProject}=await server.ssrLoadModule('/src/lib/project-types.ts');
  ({useProject:store}=await server.ssrLoadModule('/src/lib/project-store.ts'));previous=store.getState();
  mode=await server.ssrLoadModule('/src/lib/corner-rounding-store.ts');
  const {CornerRoundingHandles}=await server.ssrLoadModule('/src/components/designer/corner-rounding-handles.tsx');
  const {parseProjectFile}=await server.ssrLoadModule('/src/lib/project-file.ts');
  const d=e.addRect(emptyDrawing(),{x:0,y:0},{x:10,y:5},'lawn'),id=Object.keys(d.faces)[0];
  store.setState({project:{...emptyProject(),drawing:d,polygons:e.toPolygons(d)},selectedPolyId:id,selectedPolyIds:[id],selectedId:null,selectedIds:[],selectedPlantId:null,selectedEdgeId:null,groupMemberId:null,referenceOpen:false,tool:'draw',drawSub:'none',cadEditId:null,past:[],future:[],pastOps:[],futureOps:[],uiSize:'m'});
  mode.openCornerRounding();
  const editDrag={current:false},skipClick={current:false},gestureBlocked={current:false},px=60,panX=80,panY=100;
  stage=new Konva.Stage({width:780,height:520});
  function Scene() {
   const pr=store(s=>s.project),preview=mode.useCornerRounding(s=>s.preview),drawing=preview?.drawing??pr.drawing;
   return React.createElement('Layer',null,
    React.createElement('Rect',{width:780,height:520,fill:'#f8fbfc'}),
    React.createElement('Line',{points:e.facePoints(drawing,id).flatMap(p=>[p.x*px+panX,p.y*px+panY]),closed:true,fill:'#d5e9db',stroke:'#1c2724',strokeWidth:1.5}),
    React.createElement(CornerRoundingHandles,{px,panX,panY,editDrag,skipClick,gestureBlocked}));
  }
  const errors=[];const error=e=>errors.push(e);
  root=KonvaRenderer.createContainer(stage,1,null,false,null,'',error,error,error,null);
  await act(async()=>{KonvaRenderer.updateContainer(React.createElement(Scene),root,null);});
  assert.equal(stage.find('.round-corner-0').length,1);
  let marker=stage.findOne('.round-corner-0');
  const drag=async(radius)=>{
   await act(async()=>marker.fire('dragstart',{evt:{}}));
   await act(async()=>{const distance=24+radius*Math.SQRT2*px;marker.position({x:panX+distance/Math.SQRT2,y:panY+distance/Math.SQRT2});marker.fire('dragmove',{evt:{}});});
  };
  await drag(.5);
  assert.equal(store.getState().past.length,0,'preview does not pollute history');
  assert.ok(mode.useCornerRounding.getState().preview.drawing.faces[id].rounding.radii.every(r=>Math.abs(r-.5)<1e-8));
  await act(async()=>marker.fire('dragend',{evt:{}}));
  assert.equal(store.getState().past.length,1);assert.equal(editDrag.current,false);
  const saved=store.getState().project;
  assert.deepEqual(parseProjectFile(JSON.stringify({project:saved})).project.drawing.faces[id].rounding,saved.drawing.faces[id].rounding);
  await act(async()=>store.getState().undo());assert.equal(store.getState().project.drawing.faces[id].rounding,undefined);
  await act(async()=>store.getState().redo());assert.ok(Math.abs(store.getState().project.drawing.faces[id].rounding.radii[0]-.5)<1e-8);
  marker=stage.findOne('.round-corner-0');
  await act(async()=>marker.fire('tap',{evt:{}}));assert.deepEqual(mode.useCornerRounding.getState().selected,[0]);
  await drag(1);
  await act(async()=>marker.fire('dragend',{evt:{}}));
  assert.deepEqual(store.getState().project.drawing.faces[id].rounding.radii.map(r=>Math.round(r*100)),[100,50,50,50]);
  await act(async()=>{mode.useCornerRounding.setState({multiple:true});stage.findOne('.round-corner-1').fire('tap',{evt:{}});});
  assert.deepEqual(mode.useCornerRounding.getState().selected,[0,1]);
  await act(async()=>mode.useCornerRounding.setState({selected:null,multiple:false}));
  await drag(100);
  const max=mode.useCornerRounding.getState().preview.drawing.faces[id].rounding.radii;
  assert.ok(max.every(r=>r<=2.5));
  await act(async()=>marker.fire('dragend',{evt:{}}));
  await act(async()=>store.getState().undo());
  stage.draw();if(process.env.ROUNDING_QA_IMAGE)await writeFile(process.env.ROUNDING_QA_IMAGE,stage.toCanvas().toBuffer('image/png'));
  await act(async()=>store.getState().setDrawSub('circle'));assert.equal(mode.useCornerRounding.getState().faceId,null);assert.equal(stage.find('.round-corner-0').length,0);
  assert.deepEqual(errors,[]);
 } finally {
  if(root)await act(async()=>KonvaRenderer.updateContainer(null,root,null));stage?.destroy();
  mode?.closeCornerRounding(false);if(store&&previous)store.setState(previous);await server.close();
 }
});
