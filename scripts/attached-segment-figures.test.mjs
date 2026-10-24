import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
const server=await createServer({server:{middlewareMode:true,hmr:false}});
const e=await server.ssrLoadModule('/src/lib/cad/engine.ts');
const {emptyDrawing}=await server.ssrLoadModule('/src/lib/cad/types.ts');
const {attachedSegmentFigures,resolveAttachedSegmentFigure}=await server.ssrLoadModule('/src/lib/cad/attached-segment-figures.ts');
const {useProject}=await server.ssrLoadModule('/src/lib/project-store.ts');
const {emptyProject}=await server.ssrLoadModule('/src/lib/project-types.ts');
await server.close();
const line=(d,a,b)=>e.segmentLayers(e.addDrawingLines(d,a.map((x,i)=>({x,y:b[i]})),'lawn'));
function fixture() {
  let d=e.addRect(emptyDrawing(),{x:0,y:0},{x:10,y:10},'lawn');
  const sourceId=Object.keys(d.faces)[0];
  d=e.addRect(d,{x:30,y:30},{x:33,y:33},'lawn');
  const unrelatedId=Object.keys(d.faces).find(id=>id!==sourceId);
  d=line(d,[2,2],[0,-4]);
  d=line(d,[2,8],[-4,-4]);
  return {d,sourceId,unrelatedId};
}
test('returning to the same rectangle offers all three actions and preserves unrelated geometry',()=>{
  let {d,sourceId,unrelatedId}=fixture();
  assert.equal(attachedSegmentFigures(d).length,0,'unfinished chain is not offered');
  d=line(d,[8,8],[-4,0]);
  const before=structuredClone(d), candidates=attachedSegmentFigures(d);
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].sourceId,sourceId);
  for(const action of ['merge','separate','delete']) {
    const result=resolveAttachedSegmentFigure(d,candidates[0].key,action);
    assert.ok(result,action);
    const next=result.drawing;
    assert.deepEqual(next.faces[unrelatedId],d.faces[unrelatedId]);
    assert.deepEqual(e.facePoints(next,unrelatedId),e.facePoints(d,unrelatedId));
    assert.equal(Object.values(next.faces).filter(f=>f.segment).length,0);
    assert.equal(e.faceArea(next,sourceId),action==='merge' ? 124 : 100);
    assert.equal(Object.keys(next.faces).length,action==='separate' ? 3 : 2);
    if(action==='separate') assert.equal(e.faceArea(next,result.faceId),24);
    assert.equal(attachedSegmentFigures(next).length,0);
    useProject.setState({project:{...emptyProject(),drawing:d},past:[],future:[],tool:'draw',drawSub:'line'});
    useProject.getState().commitDrawing(next,result.faceId);
    useProject.getState().undo();
    assert.deepEqual(useProject.getState().project.drawing,d,'action can be undone');
  }
  assert.deepEqual(d,before,'candidate detection never mutates the original');
});
test('a straight chord between two sides creates one choice without splitting the source',()=>{
  let {d,sourceId}=fixture();
  d=line(d,[0,10],[3,3]);
  const candidates=attachedSegmentFigures(d);
  assert.equal(candidates.length,1);
  const result=resolveAttachedSegmentFigure(d,candidates[0].key,'separate');
  assert.ok(result);
  assert.equal(e.faceArea(result.drawing,result.faceId),30);
  assert.equal(e.faceArea(result.drawing,sourceId),100);
});
test('locked, hidden, grouped and different figures do not offer a join',()=>{
  let {d,sourceId}=fixture();
  d=line(d,[8,8],[-4,0]);
  for(const patch of [{locked:true},{hidden:true},{layerId:'group'}]) {
    const next=structuredClone(d);Object.assign(next.faces[sourceId],patch);
    assert.equal(attachedSegmentFigures(next).length,0);
  }
  let other=e.addRect(emptyDrawing(),{x:0,y:0},{x:10,y:10},'lawn');
  other=e.addRect(other,{x:20,y:0},{x:30,y:10},'lawn');
  other=line(other,[10,20],[5,5]);
  assert.equal(attachedSegmentFigures(other).length,0);
  other=line(other,[-2,32],[4,4]);
  assert.equal(attachedSegmentFigures(other).length,0,'crossings alone are not endpoints');
});

test('two lines between two rectangles offer a bridge and all three actions',()=>{
  let d=e.addRect(emptyDrawing(),{x:0,y:0},{x:10,y:10},'lawn');
  d=e.addRect(d,{x:20,y:0},{x:30,y:10},'lawn');
  const sourceIds=Object.keys(d.faces);
  // A touching third figure must never be pulled into the merge.
  d=e.addRect(d,{x:30,y:2},{x:34,y:6},'lawn');
  const third=Object.keys(d.faces).find(id=>!sourceIds.includes(id));
  d=line(d,[10,20],[2,2]);
  assert.equal(attachedSegmentFigures(d).length,0,'one connecting line is insufficient');
  d=line(d,[20,10],[8,8]);
  const before=structuredClone(d), candidates=attachedSegmentFigures(d);
  assert.equal(candidates.length,1);
  assert.deepEqual(candidates[0].sourceIds,sourceIds);
  for(const action of ['merge','separate','delete']) {
    const result=resolveAttachedSegmentFigure(d,candidates[0].key,action);
    assert.ok(result,action);
    assert.deepEqual(result.drawing.faces[third],before.faces[third]);
    assert.deepEqual(e.facePoints(result.drawing,third),e.facePoints(before,third));
    assert.equal(Object.values(result.drawing.faces).filter(f=>f.segment).length,0);
    if(action==='merge') {
      assert.equal(Object.keys(result.drawing.faces).length,2);
      assert.equal(e.faceArea(result.drawing,result.faceId),260);
    } else {
      for(const id of sourceIds) {
        assert.deepEqual(result.drawing.faces[id],before.faces[id]);
        assert.deepEqual(e.facePoints(result.drawing,id),e.facePoints(before,id));
      }
      assert.equal(Object.keys(result.drawing.faces).length,action==='separate' ? 4 : 3);
      if(action==='separate') assert.equal(e.faceArea(result.drawing,result.faceId),60);
    }
    useProject.setState({project:{...emptyProject(),drawing:d},past:[],future:[],tool:'draw',drawSub:'line'});
    useProject.getState().commitDrawing(result.drawing,result.faceId);
    const committed=JSON.parse(JSON.stringify(useProject.getState().project.drawing));
    useProject.getState().undo();
    assert.deepEqual(useProject.getState().project.drawing,before);
    useProject.getState().redo();
    assert.deepEqual(useProject.getState().project.drawing,committed);
  }
  assert.deepEqual(d,before);
  for(const patch of [{hidden:true},{locked:true},{layerId:'group'}]) {
    const next=structuredClone(d);Object.assign(next.faces[sourceIds[1]],patch);
    assert.equal(attachedSegmentFigures(next).length,0);
  }
});
