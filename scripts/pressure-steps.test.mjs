import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("every Hunter nozzle uses published points and bounded interpolation, refreshing geometry and zone totals", async () => {
  const oldStorage=globalThis.localStorage, oldWindow=globalThis.window;
  const memory=new Map();
  globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
  const server=await createServer({server:{middlewareMode:true,hmr:false}});
  try {
    const {placeableCatalog,stripAtPressure,bodiesFor,mountingKind}=await server.ssrLoadModule('/src/lib/equipment-catalog.ts');
    const {catalogHeadDefaults,pressureSteps,performanceAt,headFlow,runTimeMin}=await server.ssrLoadModule('/src/lib/flow.ts');
    const {zoneFlow,zonePressure}=await server.ssrLoadModule('/src/lib/hydro.ts');
    const {emptyProject}=await server.ssrLoadModule('/src/lib/project-types.ts');
    const {sliderRange,sliderFillPosition}=await server.ssrLoadModule('/src/lib/slider-range.ts');
    const {headRadiusScale}=await server.ssrLoadModule('/src/lib/head-adjustment.ts');
    globalThis.window={localStorage:globalThis.localStorage};
    const {useProject,migrateProject}=await server.ssrLoadModule('/src/lib/project-store.ts');
    let checked=0;
    for(const item of placeableCatalog().filter(c=>c.manufacturerId==='hunter')) {
      const defaults=catalogHeadDefaults(item);
      // Testing every chart pressure requires a compatible body without a regulator.
      if(mountingKind(item)==='spray')defaults.bodyId=bodiesFor(item).find(body=>body.regulatedPressureBar==null).id;
      for(const nozzle of item.nozzles) {
        const steps=pressureSteps(item,nozzle.id,defaults.arc);
        for(const [i,bar] of steps.entries()) {
          const row=performanceAt(item,nozzle.id,bar,defaults.arc).row;
          assert.ok(nozzle.performance.some(r=>r.pressureBar===bar)||item.pressureCompensating&&performanceAt(item,nozzle.id,bar,defaults.arc).kind==='pressure-compensated');
          const source=performanceAt(item,nozzle.id,steps[0],defaults.arc).row;
          const h={...defaults,id:'a',catalogId:item.id,nozzleId:nozzle.id,r:source.radiusM,designPressure:steps[0],x:3,y:4,start:90,zone:1,locked:false};
          const companion={...h,id:'b',zone:2};
          useProject.setState({project:{...emptyProject(),heads:[h,companion]},past:[],future:[]});
          const untouched=zoneFlow([companion],2);
          useProject.getState().updateHead('a',{designPressure:bar});
          const current=useProject.getState().project.heads;
          const edited=current[0],flow=headFlow(edited);
          assert.equal(edited.designPressure,bar);
          assert.equal(edited.nozzleId,nozzle.id,'pressure selects the installed nozzle table');
          if(!item.strip && item.coverageKind!=='point') {
            assert.equal(edited.r,row.radiusM,`${item.id} drawn radius`);
            const scale=headRadiusScale(item,h);
            assert.deepEqual(headRadiusScale(item,edited),scale,'pressure cannot move the radius scale endpoints');
            const before=sliderRange(scale.min,scale.max,.05,h.r);
            const after=sliderRange(scale.min,scale.max,.05,edited.r);
            if(Math.abs(edited.r-h.r)>.05) assert.notEqual(after.tick,before.tick,`${item.id} thumb follows the new radius`);
          }
          assert.equal(flow.lpm,row.flowLMin,`${item.id}/${nozzle.id} flow at ${bar}`);
          assert.ok(Math.abs(flow.m3h-row.flowM3H)<0.005);
          if(item.precipBasis==='square' && (item.type!=='rotor'||row.arcDeg===edited.arc)) {
            assert.equal(flow.precipMmHr,row.precipSquareMmH);
            assert.equal(flow.precipTriangleMmHr,row.precipTriangleMmH);
          }
          if(flow.precipMmHr) assert.equal(runTimeMin(10,flow.precipMmHr),600/flow.precipMmHr);
          assert.equal(zoneFlow(current,1),flow.lpm);
          assert.equal(zoneFlow(current,2),untouched);
          assert.equal(zonePressure(current,1),bar);
          assert.deepEqual([edited.x,edited.y,edited.start,edited.zone],[3,4,90,1]);
          if(item.stripPerformance?.length) {
            const strip=stripAtPressure(item,bar), official=item.stripPerformance.find(r=>r.pressureBar===bar);
            assert.equal(strip.w,official.w);assert.equal(strip.l,official.l);
          }
          if(i>0) {
            const middle=(steps[i-1]+bar)/2;
            const interpolated=performanceAt(item,nozzle.id,middle,defaults.arc);
            assert.ok(interpolated,'intermediate pressure stays inside the official table');
            assert.ok(['interpolated','pressure-compensated'].includes(interpolated.kind));
            useProject.getState().updateHead('a',{designPressure:middle});
            assert.equal(useProject.getState().project.heads[0].designPressure,middle);
            const legacy=migrateProject({...emptyProject(),heads:[{...h,designPressure:middle}]});
            assert.equal(legacy.heads[0].designPressure,middle,'opening an old project does not silently change it');
            assert.equal(legacy.heads[0].needsReview,false);
          }
          checked++;
        }
      }
    }
    assert.ok(checked>500);
    // Pixel position must follow the native thumb travel, including irregular end steps.
    for(const width of [180,260,400]) for(const value of [2.3,2.5,3.6,5.97]) {
      const r=sliderRange(2.3,5.97,.05,value), css=sliderFillPosition(r.tick,r.ticks);
      const [,percent,offset]=css.match(/calc\(([-\d.]+)% \+ ([-\d.]+)px\)/);
      assert.ok(Math.abs(width*Number(percent)/100+Number(offset)-(10+(width-20)*r.tick/r.ticks))<1e-8);
    }
  } finally {
    await server.close();
    if(oldStorage)globalThis.localStorage=oldStorage;else delete globalThis.localStorage;
    if(oldWindow)globalThis.window=oldWindow;else delete globalThis.window;
  }
});
