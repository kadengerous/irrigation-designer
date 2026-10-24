import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {createServer} from 'vite';
let server,catalog,flow,check,geometry,h2h,coverage,partition,emptyProject,selectAutomaticHead;
before(async()=>{
 server=await createServer({server:{middlewareMode:true,hmr:false}});
 const load=p=>server.ssrLoadModule('/src/lib/'+p+'.ts');
 catalog=await load('hunter-catalog');flow=await load('flow');geometry=await load('irrigation-geometry');h2h=await load('head-to-head');coverage=await load('coverage');
 ({selectAutomaticHead}=await load('automatic-head'));
 ({checkProject:check}=await load('irrigation-diagnostics'));({partitionCoverage:partition}=await load('diagnostic-coverage'));({emptyProject}=await load('project-types'));
});
after(async()=>{await server?.close();});
const head=(id,x,y,r,patch={})=>{
 const arc=patch.arc??360,series=r<=3?'MP800SR':r<=6.4?'MP2000':r<=9?'MP3000':'I-20';
 const item=catalog.itemById(series==='I-20'?series:`${series}-${arc===360?360:90}`);
 const pressure=r<=2||series==='MP3000'?2.1:r<=5.5?2.8:3.8;
 const fit=selectAutomaticHead(r,arc,pressure,[item]);
 assert.ok(fit,`physical coverage fixture: ${item.id}, ${r} m, ${arc}°`);
 return {...fit,id,x,y,zone:1,...patch};
};
const lawn=(id,x,y,w,h)=>({id,type:'poly',kind:'lawn',cadType:'lawn',closed:true,points:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]});
const project=heads=>({...emptyProject(),heads,zones:[{id:1,name:'Zone 1'}],polygons:[lawn('site',-1,-1,20,20)]});
test('directed working radius, not catalog maximum; numeric tolerance never inflates coverage',()=>{
 const a=head('a',0,0,5.5),b=head('b',6,0,6.5);
 assert.equal(h2h.directedReach(a,b).reached,false);assert.equal(h2h.directedReach(b,a).reached,true);
 assert.equal(h2h.directedReach(a,b).deficit,.5);
 assert.equal(h2h.directedReach(a,{...b,x:5.501}).reached,true);
 assert.equal(h2h.directedReach(a,{...b,x:5.503}).reached,false);
 assert.equal(coverage.headCovers(a,{x:5.501,y:0}),false);
 assert.equal(coverage.headCovers(head('quarter',0,0,5.5,{arc:90}),{x:0,y:-1}),false);
 assert.equal(h2h.directedReach(head('quarter',0,0,5.5,{start:90,arc:90}),{...b,x:4.8}).reached,false);
 const report=check(project([a,b]));assert.ok(report.some(i=>i.id==='h2h-a-b'));assert.ok(!report.some(i=>i.id==='h2h-b-a'));
});
test('a remote non-neighbour contributes coverage and downgrades the same short link from error to warning',()=>{
 const a=head('a',0,0,2),b=head('b',6,0,2),d=head('d',3,10,11,{zone:2});
 const p=project([a,b]);
 assert.equal(check(p).find(i=>i.id==='h2h-a-b').level,'error');
 const supplemented={...p,heads:[a,b,d]};
 const issue=check(supplemented).find(i=>i.id==='h2h-a-b');assert.equal(issue.level,'warn');assert.equal(issue.area,undefined);
 assert.equal(coverage.headCovers(d,{x:3,y:0}),true);
 const target=geometry.irrigationSurfaces(p).target;
 const bands=partition(target,supplemented.heads.map(h=>geometry.headSurface(h)));
 assert.ok(!geometry.pointInSurface({x:3,y:0},bands.dry));
});
test('four mutually exclusive coverage classes conserve target area, including all distant footprints',()=>{
 const box=(a,b)=>[[[[a,0],[b,0],[b,1],[a,1]]]];
 const bands=partition(box(0,5),[box(1,5),box(2,5),box(3,5),box(4,5)]);
 for(const [key,area]of Object.entries({dry:1,single:1,double:1,triple:2}))assert.equal(geometry.surfaceArea(bands[key]),area);
 for(const x of [0.5,1.5,2.5,3.5,4.5])assert.equal(['dry','single','double','triple'].filter(k=>geometry.pointInSurface({x,y:.5},bands[k])).length,1);
});
test('corner, strip, bubbler and unverified custom models never inherit universal head-to-head',()=>{
 assert.equal(catalog.itemById('MP-CORNER').coverageRule,'SPECIAL');
 assert.equal(catalog.itemById('MP-LCS-515').coverageRule,'SPECIAL');
 assert.equal(catalog.itemById('PCN-25').coverageRule,'CUSTOM');
 assert.ok(catalog.CATALOG.every(i=>['HEAD_TO_HEAD','SPECIAL','CUSTOM'].includes(i.coverageRule)));
 for(const id of ['MP-CORNER','MP-LCS-515','PCN-25','G-70-B']){
  const item=catalog.itemById(id),special={...flow.catalogHeadDefaults(item),id:'a',catalogId:id,x:0,y:0,start:0,zone:1};
  const p=project([special,head('b',6,0,2)]);
  assert.ok(!check(p).some(i=>i.id.startsWith('h2h-')));
 }
});
test('figure identity and relative neighbours prevent cross-figure links and all-pairs checks',()=>{
 const p=project([head('a',0,0,2),head('b',3,0,2),head('c',6,0,2)]);
 const target=geometry.irrigationSurfaces(p).target;
 assert.deepEqual(h2h.significantHeadPairs(p,target).map(pair=>pair.map(h=>h.id)),[['a','b'],['b','c']]);
 const separate={...p,polygons:[lawn('one',-1,-1,2,2),lawn('two',2,-1,5,2)]};
 assert.ok(!h2h.significantHeadPairs(separate,geometry.irrigationSurfaces(separate).target).some(pair=>pair.some(h=>h.id==='a')));
});
test('single or triple geometric coverage never creates an overlap error',()=>{
 const a=head('a',5,5,6);
 const base={...project([a]),polygons:[lawn('small',3,3,4,4)]};
 for(const heads of [[a],[a,{...a,id:'b'},{...a,id:'c'}]]){
   const issues=check({...base,heads});
   assert.ok(!issues.some(i=>i.id.startsWith('dry-')||i.id.startsWith('h2h-')));
 }
});
