import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const root=process.env.IRRI_ROOT??process.cwd();
const {createServer}=await import(pathToFileURL(resolve(root,'node_modules/vite/dist/node/index.js')));
let server,cat,flow,w,footprints,models;
before(async()=>{
 server=await createServer({configFile:false,root,resolve:{alias:{'@':resolve(root,'src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 [cat,flow,w,footprints]=await Promise.all(['equipment-catalog','flow','watering-preview','equipment-footprint'].map(name=>server.ssrLoadModule('/src/lib/'+name+'.ts')));
 models=cat.CATALOG.filter(c=>c.manufacturerId==='rain-bird'&&c.coverageKind==='square');
});
after(async()=>server.close());
const head=(item,patch={})=>({...flow.catalogHeadDefaults(item),id:'sq:'+item.id,catalogId:item.id,x:3,y:7,start:37,zone:1,locked:false,...patch});
const publishedHead=(item,nozzle,row,patch={})=>head(item,{nozzleId:nozzle.id,designPressure:row.pressureBar,r:row.radiusM,...patch});
const inside=(h,f,p)=>{
 const a=h.start*Math.PI/180,x=p.x*Math.cos(a)+p.y*Math.sin(a),y=-p.x*Math.sin(a)+p.y*Math.cos(a),eps=1e-8;
 return Math.abs(x)<=h.r+eps&&Math.abs(y)<=h.r+eps&&(f!==.25||(x>=-eps&&y>=-eps))&&(f!==.5||y>=-eps)&&(f!==.75||x<=eps||y>=-eps);
};

test('all SQ fractions animate main and fine spray inside every rotated, selected square footprint',()=>{
 let mainCount=0,microCount=0;
 for(const item of models)for(const nozzle of item.nozzles)for(const row of [nozzle.performance[0],nozzle.performance.at(-1)])for(const start of [0,37,123,271]){
  const h=head(item,{nozzleId:nozzle.id,designPressure:row.pressureBar,r:row.radiusM,start}),before=JSON.stringify(h),hydraulics=flow.headFlow(h),p=w.wateringProfile(h);
  assert.equal(p.kind,'square-fan',item.id);assert.equal(p.timingBasis,'illustrative');assert.equal(p.rotationSeconds,undefined);
  assert.deepEqual(p.footprint,footprints.specialFootprint(h));
  for(const t of [0,1.73,42.13]){
   for(let i=0;i<w.wateringParticleCount(p);i+=3){const d=w.wateringDrop(h,t,i,p);assert.ok(d&&inside(h,item.squarePatternFraction,d),`${item.id} main ${i}/${t}/${start}`);mainCount++;}
   let retained=0,sampled=0;
   for(let i=0;i<w.wateringMicroParticleCount(p);i+=7){
    sampled++;const d=w.wateringMicroDrop(h,t,i,p);
    // Dispersed spray may leave the footprint; it is culled instead of
    // collecting on the square border. Every visible particle stays inside.
    if(!d)continue;
    assert.ok(inside(h,item.squarePatternFraction,d),`${item.id} fine ${i}/${t}/${start}`);retained++;microCount++;
   }
   assert.ok(retained/sampled>.85,`${item.id} retains dense fine spray at ${t}/${start}`);
  }
  assert.deepEqual(flow.headFlow(h),hydraulics);assert.equal(JSON.stringify(h),before);
 }
 assert.ok(mainCount>100000);assert.ok(microCount>100000);
});

test('SQ fan reaches square corners and follows actual saved radius without circular truncation',()=>{
 for(const item of models)for(const nozzle of item.nozzles)for(const row of [nozzle.performance[0],nozzle.performance.at(-1)]){
  const h=publishedHead(item,nozzle,row,{start:83}),p=w.wateringProfile(h);
  assert.equal(p.kind,'square-fan',`${item.id}/${nozzle.id}/${row.pressureBar}`);
  const drops=Array.from({length:w.wateringParticleCount(p)},(_,i)=>w.wateringDrop(h,2.31,i,p)).filter(Boolean);
  assert.ok(drops.length>2500);assert.ok(Math.max(...drops.map(d=>Math.hypot(d.x,d.y)))>h.r*1.3,'square corner reaches beyond circular radius');
  assert.ok(drops.every(d=>inside(h,item.squarePatternFraction,d)));
  const outer=drops.filter(d=>d.travel>.99);
  assert.ok(outer.length>=48);assert.ok(outer.every(d=>{const a=-h.start*Math.PI/180,x=d.x*Math.cos(a)-d.y*Math.sin(a),y=d.x*Math.sin(a)+d.y*Math.cos(a);return Math.max(Math.abs(x),Math.abs(y))>=h.r*.99-1e-9;}));
 }
});

test('unsupported Rain Bird pressures/nozzles and invalid SQ arcs/radii do not produce animated water',()=>{
 for(const item of cat.CATALOG.filter(c=>c.manufacturerId==='rain-bird'&&c.type!=='body')){
  for(const designPressure of [item.recommendedPressureMin-.1,item.recommendedPressureMax+.1,NaN,Infinity])assert.equal(w.wateringProfile(head(item,{designPressure})).kind,'unknown',`${item.id}/${designPressure}`);
  assert.equal(w.wateringProfile(head(item,{nozzleId:'unknown-nozzle'})).kind,'unknown',item.id);
 }
 for(const item of models){
  for(const patch of [{arc:item.arcMin-1},{arc:item.arcMin+1},{r:0},{r:-1},{r:NaN},{start:Infinity}])assert.equal(w.wateringProfile(head(item,patch)).kind,'unknown');
  const nozzle=item.nozzles[0],last=nozzle.performance.at(-1);
  const valid=publishedHead(item,nozzle,nozzle.performance[0]);
  assert.equal(w.wateringProfile(valid).kind,'square-fan');
  for(const r of [valid.r-.05,valid.r+.05]){
   const invalid=w.wateringProfile({...valid,r});
   assert.equal(invalid.kind,'unknown',`${item.id}: unsupported saved radius ${r}`);
   assert.equal(w.wateringParticleCount(invalid),0);
  }
  if(last.pressureBar<item.recommendedPressureMax)assert.equal(w.wateringProfile(head(item,{nozzleId:nozzle.id,designPressure:(last.pressureBar+item.recommendedPressureMax)/2})).kind,'unknown','no extrapolation beyond nozzle table');
 }
});

test('actual WateringHead paint clips SQ glyph edges to the exact polygon and refreshes rotated radius',async()=>{
 const req=createRequire(resolve(root,'package.json')),React=req('react'),K=req('konva'),Konva=K.default??K,{KonvaRenderer}=req('react-konva/lib/ReactKonvaCore.js');
 const previous=globalThis.IS_REACT_ACT_ENVIRONMENT;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const {WateringHead}=await server.ssrLoadModule('/src/components/designer/zone-highlights.tsx');
 const errors=[],container=new Konva.Group(),r=KonvaRenderer.createContainer(container,1,null,false,null,'',e=>errors.push(e),e=>errors.push(e),e=>errors.push(e),null);
 try{
  for(const item of models){
   const small=item.nozzles[0],large=item.nozzles.at(-1);
   let previousPoints;
   for(const [nozzle,row,start,px]of [[small,small.performance[0],0,36],[small,small.performance.at(-1),0,36],[large,large.performance.at(-1),37,93],[small,small.performance.at(-1),271,18]]){
   const h=publishedHead(item,nozzle,row,{start});
   assert.equal(w.wateringProfile(h).kind,'square-fan');
   await React.act(async()=>KonvaRenderer.updateContainer(React.createElement(WateringHead,{head:h,elapsed:{current:8.37},px}),r,null,()=>{}));
   assert.equal(container.children.length,1,item.id);
   const points=[];let clipped=false,closed=false,clippingArcs=0,clips=0;
   const ctx=new Proxy({},{get(_,key){
    if(key==='moveTo'||key==='lineTo')return(...p)=>{if(!clipped)points.push(p);};
    if(key==='arc')return()=>{if(!clipped)clippingArcs++;};
    if(key==='closePath')return()=>{if(!clipped)closed=true;};
    if(key==='clip')return()=>{clipped=true;clips++;};
    return()=>{};
   },set(){return true;}});
   container.children[0].sceneFunc()(ctx);
   assert.deepEqual(points,footprints.specialFootprint(h).map(p=>[p.x*px,p.y*px]));
   if(previousPoints)assert.notDeepEqual(points,previousPoints,'the reused renderer refreshes the changed nozzle, pressure, radius, rotation and scale');
   previousPoints=points;
   assert.equal(clippingArcs,0,'square clip cannot be a circular arc');assert.equal(clips,1);assert.equal(closed,true);
   }
  }
  assert.deepEqual(errors,[]);
 }finally{await React.act(async()=>KonvaRenderer.updateContainer(null,r,null,()=>{}));globalThis.IS_REACT_ACT_ENVIRONMENT=previous;}
});
