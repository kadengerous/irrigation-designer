import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
let api;const output=resolve('node_modules/.cache/engineering-route-interaction-'+process.pid+'.mjs');
before(async()=>{
 await mkdir(resolve('node_modules/.cache'),{recursive:true});
 await build({entryPoints:['src/components/designer/engineering-route-interaction.ts'],bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':resolve('src')},outfile:output,logLevel:'silent'});
 api=await import(pathToFileURL(output).href);
});
after(async()=>unlink(output).catch(()=>{}));
const xy=a=>a.map(([x,y])=>({x,y})),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),close=(a,b)=>assert.ok(distance(a,b)<1e-9,`${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
const length=ps=>ps.slice(1).reduce((sum,p,i)=>sum+distance(ps[i],p),0);

test('insertion projects onto the nearest actual segment at every angle without changing route length',()=>{
 for(const degrees of [0,17,45,83,90,135,217,270,319]){
  const radians=degrees*Math.PI/180,u={x:Math.cos(radians),y:Math.sin(radians)},a={x:-4,y:7},b={x:a.x+u.x*12,y:a.y+u.y*12},expected={x:a.x+u.x*4,y:a.y+u.y*4},pointer={x:expected.x-u.y*3,y:expected.y+u.x*3},points=[a,b],snapshot=JSON.stringify(points),insert=api.routeNodeInsertion(points,pointer);
  assert.ok(insert);assert.equal(insert.index,1);close(insert.point,expected);assert.ok(Math.abs(length([a,insert.point,b])-length(points))<1e-9);assert.equal(JSON.stringify(points),snapshot);
 }
 const points=xy([[0,0],[8,0],[8,8],[1,8]]),insert=api.routeNodeInsertion(points,{x:5,y:7});assert.deepEqual(insert,{index:3,point:{x:5,y:8}});
});

test('insertion skips degenerate segments and never adds duplicate or endpoint nodes',()=>{
 const points=xy([[0,0],[0,0],[10,0]]);assert.deepEqual(api.routeNodeInsertion(points,{x:4,y:3}),{index:2,point:{x:4,y:0}});
 for(const point of xy([[0,0],[-4,3],[10,4],[16,2]]))assert.equal(api.routeNodeInsertion(points,point),null);
 for(const invalid of [[],xy([[0,0]]),xy([[0,0],[0,0]]),[{x:0,y:0},{x:NaN,y:1}]])assert.equal(api.routeNodeInsertion(invalid,{x:4,y:3}),null);
 assert.equal(api.routeNodeInsertion(points,{x:Infinity,y:0}),null);
 const tie=api.routeNodeInsertion(xy([[0,0],[5,0],[5,5]]),{x:4,y:1});assert.deepEqual(tie,{index:1,point:{x:4,y:0}},'ties stay deterministic');
});

test('node drag snaps to the neighbour chord at arbitrary angles with a constant pixel tolerance',()=>{
 for(const degrees of [0,17,45,83,90,135,217,270,319])for(const px of [4,40,400]){
  const radians=degrees*Math.PI/180,u={x:Math.cos(radians),y:Math.sin(radians)},a={x:-7,y:11},b={x:a.x+u.x*20,y:a.y+u.y*20},expected={x:a.x+u.x*7,y:a.y+u.y*7},points=[a,{x:100,y:-100},b],snapshot=JSON.stringify(points);
  for(const offset of [-1,1]){const pointer={x:expected.x-u.y*offset*9/px,y:expected.y+u.x*offset*9/px},hit=api.snapRouteNodeToNeighbors(points,1,pointer,px,true);assert.equal(hit.hit,true);close(hit.point,expected);}
  const far={x:expected.x-u.y*11/px,y:expected.y+u.x*11/px},miss=api.snapRouteNodeToNeighbors(points,1,far,px,true);assert.equal(miss.hit,false);assert.deepEqual(miss.point,far);assert.equal(JSON.stringify(points),snapshot);
 }
});

test('drag snapping respects magnet off, endpoints, finite inputs and degenerate neighbour chords',()=>{
 const points=xy([[0,0],[5,4],[10,10]]),point={x:5,y:5.1};
 for(const [index,px,on,tolerance] of [[1,40,false,10],[0,40,true,10],[2,40,true,10],[1.5,40,true,10],[1,0,true,10],[1,-1,true,10],[1,NaN,true,10],[1,Infinity,true,10],[1,40,true,-1],[1,40,true,NaN]]){
  const result=api.snapRouteNodeToNeighbors(points,index,point,px,on,tolerance);assert.equal(result.hit,false);assert.deepEqual(result.point,point);
 }
 for(const p of xy([[-.01,-.01],[10.01,10.01],[0,0],[10,10]]))assert.equal(api.snapRouteNodeToNeighbors(points,1,p,40,true).hit,false,'a neighbour or line extension must not collapse the node');
 assert.equal(api.snapRouteNodeToNeighbors(xy([[0,0],[4,2],[0,0]]),1,{x:0,y:.01},40,true).hit,false);
 assert.equal(api.snapRouteNodeToNeighbors([{x:NaN,y:0},{x:4,y:2},{x:10,y:0}],1,point,40,true).hit,false);
 assert.equal(api.snapRouteNodeToNeighbors(points,1,{x:NaN,y:0},40,true).hit,false);
});

test('the drag tolerance is configurable and only the immediate neighbours define its chord',()=>{
 const points=xy([[-20,-20],[0,0],[8,6],[10,0],[20,20]]),point={x:6,y:.2};
 assert.equal(api.snapRouteNodeToNeighbors(points,2,point,40,true,7).hit,false);
 assert.deepEqual(api.snapRouteNodeToNeighbors(points,2,point,40,true,8),{point:{x:6,y:0},hit:true});
 assert.deepEqual(api.snapRouteNodeToNeighbors(points,2,{x:6,y:0},40,true,0),{point:{x:6,y:0},hit:true});
});
