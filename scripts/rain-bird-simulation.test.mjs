import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const root=process.env.IRRI_ROOT??process.cwd();
const {createServer}=await import(pathToFileURL(resolve(root,'node_modules/vite/dist/node/index.js')));
let server,cat,flow,w,geom,cov,lib,auto,models;
before(async()=>{
 server=await createServer({configFile:false,root,resolve:{alias:{'@':resolve(root,'src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 const load=name=>server.ssrLoadModule('/src/lib/'+name+'.ts');
 [cat,flow,w,geom,cov,lib,auto]=await Promise.all(['equipment-catalog','flow','watering-preview','irrigation-geometry','coverage','equipment-library','automatic-head'].map(load));
 models=cat.CATALOG.filter(c=>c.manufacturerId==='rain-bird'&&c.type!=='body');
});
after(async()=>server.close());
const head=(item,patch={})=>({...flow.catalogHeadDefaults(item),id:'test:'+item.id,catalogId:item.id,x:0,y:0,start:37,zone:1,locked:false,...patch});

test('all Rain Bird published supported default-radius rows preserve discharge and review gating',()=>{
 let checked=0;
 for(const item of models)for(const n of item.nozzles)for(const row of n.performance){
  if(row.pressureBar<item.recommendedPressureMin||row.pressureBar>item.recommendedPressureMax)continue;
  const arc=cat.supportsArc(item,row.arcDeg)?row.arcDeg:head(item).arc;
  assert.ok(Math.abs(row.flowM3H-row.flowLMin*.06)<1e-10,`${item.id} canonical flow units`);
  const result=flow.computeFlow(item,{arc,radius:row.radiusM,pressureBar:row.pressureBar,nozzleId:n.id});
  const reviewed=n.hydraulicVerificationStatus==='Needs Review'||(item.verificationStatus==='Needs Review'&&item.hydraulicVerificationStatus!=='Verified');
  if(reviewed)assert.equal(result.lpm,null,item.id);
  else assert.ok(result.lpm!=null&&Math.abs(result.lpm-row.flowLMin)<1e-7,`${item.id}/${n.id}/${row.pressureBar}`);
  checked++;
 }
 assert.ok(checked>1000,'exercise full Rain Bird tables, not one demonstration nozzle');
});

test('Rain Bird rotary, spray, rotor and strip particles stay inside their current rotated geometry',()=>{
 for(const item of models){
  const h=head(item),before=JSON.stringify(h),p=w.wateringProfile(h);
  for(const t of [0,1,9.25,41])for(let i=0;i<w.wateringParticleCount(p);i+=3){
   const d=w.wateringDrop(h,t,i,p);if(!d)continue;
   assert.ok(Number.isFinite(d.x)&&Number.isFinite(d.y),item.id);
   if(p.strip){
    const a=h.start*Math.PI/180,x=d.x*Math.cos(a)+d.y*Math.sin(a),y=-d.x*Math.sin(a)+d.y*Math.cos(a),s=p.strip;
    assert.ok(x>=s.ox-1e-7&&x<=s.ox+s.l+1e-7&&y>=s.oy-1e-7&&y<=s.oy+s.w+1e-7,item.id);
   }else if(p.footprint){
    const a=h.start*Math.PI/180,x=d.x*Math.cos(a)+d.y*Math.sin(a),y=-d.x*Math.sin(a)+d.y*Math.cos(a),f=item.squarePatternFraction,e=1e-7;
    assert.ok(Math.abs(x)<=h.r+e&&Math.abs(y)<=h.r+e&&(f!==.25||(x>=-e&&y>=-e))&&(f!==.5||y>=-e)&&(f!==.75||x<=e||y>=-e),item.id);
   }else if(p.kind!=='flood'){
    assert.ok(Math.hypot(d.x,d.y)<=h.r+1e-7,item.id);
    const offset=((d.angle*180/Math.PI-h.start)%360+360)%360;
    assert.ok(h.arc===360||offset<=h.arc+1e-7||offset>=360-1e-7,item.id);
   }
  }
  assert.equal(JSON.stringify(h),before,'preview is read-only');
 }
});

test('Rain Bird strip pressures outside the published rectangle never fall back to a circular rotor',()=>{
 const failed=[];
 for(const item of models.filter(c=>c.strip))for(const pressure of [item.recommendedPressureMin-.5,item.recommendedPressureMax+.5]){
  const h=head(item,{designPressure:pressure}),p=w.wateringProfile(h);
  assert.equal(flow.headFlow(h).lpm,null);assert.equal(geom.surfaceArea(geom.headSurface(h)),0);
  if(p.kind!=='unknown'||w.wateringParticleCount(p)!==0)failed.push(`${item.id}@${pressure}: ${p.kind}`);
 }
 assert.deepEqual(failed,[]);
});

test('imported Rain Bird unsupported arc gaps do not animate or claim a known wetted footprint',()=>{
 for(const [id,arcs]of [['rain-bird:8005',[340,350,359]],['rain-bird:R-VAN14',[271,340]],['rain-bird:4-VAN',[331,359]]]){
  const item=cat.itemById(id);
  for(const arc of arcs){const h=head(item,{arc});assert.equal(cat.supportsArc(item,arc),false);
   assert.equal(flow.headFlow(h).lpm,null);assert.equal(w.wateringProfile(h).kind,'unknown',`${id}/${arc}`);
   assert.deepEqual(geom.headSurface(h),[]);assert.equal(cov.headCovers(h,{x:0,y:0}),false);
  }
 }
 const full=head(cat.itemById('rain-bird:8005'),{arc:360});assert.ok(geom.surfaceArea(geom.headSurface(full))>0);
});

test('Rain Bird SQ uses square areas and unknown stream bubblers never invent surface coverage',()=>{
 for(const model of ['SQ-QTR','SQ-HLF','SQ-3QTR','SQ-FUL']){
  const item=cat.itemById('rain-bird:'+model),h=head(item),area=geom.surfaceArea(geom.headSurface(h));
  assert.ok(Math.abs(area-4*item.squarePatternFraction*h.r*h.r)<1e-7,model);
  assert.deepEqual(geom.headSurface({...h,r:-1}),[],'negative saved radius is not a mirrored positive footprint');
 }
 for(const model of ['5F-B','5H-B','5Q-B','5CST-B']){
  const item=cat.itemById('rain-bird:'+model),h=head(item);
  assert.equal(item.placementSupported,false);assert.ok(flow.headFlow(h).lpm>0);
  assert.deepEqual(geom.headSurface(h),[]);assert.equal(w.wateringProfile(h).kind,'unknown');
 }
 for(const model of ['1300A-F','1401','1402','1404','1408']){
  const item=cat.itemById('rain-bird:'+model),h=head(item);
  assert.equal(w.wateringProfile(h).kind,'flood');assert.deepEqual(geom.headSurface(h),[]);
 }
});

test('new Rain Bird family scopes are mutually exclusive and automatic-head never leaves the chosen family',()=>{
 const seen=new Set();
 for(const category of lib.equipmentCategoriesFor('rain-bird')){
  const scope=lib.filterEquipment(cat.CATALOG,{manufacturerId:'rain-bird',category:category.id});
  assert.ok(scope.length>0,category.id);
  for(const item of scope){assert.equal(seen.has(item.id),false,item.id);seen.add(item.id);}
  for(const item of scope.filter(c=>!c.strip&&c.coverageKind==='sector'&&c.verificationStatus!=='Needs Review')){
   const h=head(item),fit=auto.selectAutomaticHead(h.r,h.arc,h.designPressure,scope);
   assert.ok(fit,`${category.id}: ${item.id} full-radius fixture should fit`);
   assert.ok(scope.some(c=>c.id===fit.catalogId));
  }
 }
 const expected=models.filter(c=>!c.discontinued&&c.placementSupported!==false).map(c=>c.id).sort();
 assert.deepEqual([...seen].sort(),expected);
});

test('restoring a changed same-ID snapshot refreshes the actual WateringHead clip without changing saved hydraulics',async()=>{
 const req=createRequire(resolve(root,'package.json')),React=req('react'),K=req('konva'),Konva=K.default??K,{KonvaRenderer}=req('react-konva/lib/ReactKonvaCore.js');
 const previous=globalThis.IS_REACT_ACT_ENVIRONMENT;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const {WateringHead}=await server.ssrLoadModule('/src/components/designer/zone-highlights.tsx');
 const item=cat.itemById('rain-bird:R-VAN-LCS'),a=cat.equipmentSnapshot(item),b=cat.equipmentSnapshot(item);
 a.strip={w:1.5,l:4.6,ox:0,oy:-1.5};a.stripPerformance=[];
 b.strip={w:2.5,l:8,ox:0,oy:-2.5};b.stripPerformance=[];
 const h=head(item,{start:0}),savedBefore=JSON.stringify([a,b]),errors=[],container=new Konva.Group();
 const r=KonvaRenderer.createContainer(container,1,null,false,null,'',e=>errors.push(e),e=>errors.push(e),e=>errors.push(e),null);
 const draw=async snapshot=>{
  await React.act(async()=>KonvaRenderer.updateContainer(React.createElement(WateringHead,{head:{...h,equipmentSnapshot:snapshot},elapsed:{current:0},px:1}),r,null,()=>{}));
  const points=[],ctx=new Proxy({},{get(_,key){if(key==='moveTo'||key==='lineTo')return(...p)=>{if(points.length<4)points.push(p);};return()=>{};},set(){return true;}});
  container.children[0].sceneFunc()(ctx);return points;
 };
 try{assert.equal((await draw(a))[1][0],4.6);assert.equal((await draw(b))[1][0],8);
  assert.deepEqual(errors,[]);assert.equal(JSON.stringify([a,b]),savedBefore);
 }finally{await React.act(async()=>KonvaRenderer.updateContainer(null,r,null,()=>{}));globalThis.IS_REACT_ACT_ENVIRONMENT=previous;}
});


test('SQ-HLF verifies geometry independently and never exposes disputed small-setting flow',async()=>{
 const item=cat.itemById('rain-bird:SQ-HLF');
 const small=item.nozzles.find(n=>n.hydraulicVerificationStatus==='Needs Review');
 const large=cat.defaultNozzle(item);
 assert.ok(small);assert.equal(large.hydraulicVerificationStatus,'Verified');
 const {updateHeadSettings}=await server.ssrLoadModule('/src/lib/project-store.ts');
 const original=head(item),changed=updateHeadSettings(original,{nozzleId:small.id});
 assert.equal(changed.nozzleId,small.id);
 const geometry=flow.geometryAt(item,small.id,changed.designPressure,changed.arc);
 assert.ok(geometry);assert.equal(changed.r,geometry.radiusM);
 assert.deepEqual(Object.keys(geometry).sort(),['radiusM','radiusMinM']);
 assert.equal(flow.performanceAt(item,small.id,changed.designPressure,changed.arc),null);
 assert.equal(flow.headFlow(changed).lpm,null);
 assert.equal(w.wateringProfile(changed).kind,'square-fan');
 const restored=updateHeadSettings(changed,{nozzleId:large.id});
 assert.ok(flow.headFlow(restored).lpm>0);assert.equal(flow.headFlow(restored).precipMmHr,null);
});


test('unsupported Rain Bird pressure is unknown in coverage and rotor arc gaps have a direct diagnostic',async()=>{
 for(const item of models.filter(c=>c.coverageKind!=='point')){
  const h=head(item,{designPressure:item.recommendedPressureMin-.1});
  assert.deepEqual(geom.headSurface(h),[],item.id);
  assert.equal(cov.headCovers(h,{x:h.x,y:h.y}),false,item.id);
 }
 const {checkProject}=await server.ssrLoadModule('/src/lib/check-project.ts');
 const {emptyProject}=await server.ssrLoadModule('/src/lib/project-types.ts');
 const h=head(cat.itemById('rain-bird:8005'),{arc:350});
 assert.ok(checkProject({...emptyProject(),heads:[h]}).some(i=>i.id===`arc-${h.id}`));
 assert.ok(lib.filterEquipment(cat.CATALOG,{manufacturerId:'rain-bird',category:'sq',radius:.8,pressure:1.4,arc:180}).some(i=>i.id==='rain-bird:SQ-HLF'),'verified small SQ geometry stays discoverable');
 for(const item of models.filter(c=>c.modelId.startsWith('R-VAN'))){
  const bodies=cat.bodiesFor(item);
  assert.ok(bodies.some(b=>b.sku==='1804-P45'));
  assert.ok(bodies.every(b=>!['1802','1802-PRS','1803','1803-PRS'].includes(b.sku)));
 }
});
