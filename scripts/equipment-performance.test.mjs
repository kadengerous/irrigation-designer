import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';

test('catalog compatibility, bounded interpolation and unsupported configurations',async()=>{
  const server=await createServer({server:{middlewareMode:true,hmr:false}});
  try {
    const generic=await server.ssrLoadModule('/src/lib/equipment-catalog.ts');
    const legacy=await server.ssrLoadModule('/src/lib/hunter-catalog.ts');
    const {performanceAt,computeFlow,boundedPressure}=await server.ssrLoadModule('/src/lib/flow.ts');
    assert.equal(generic.CATALOG,legacy.CATALOG);
    assert.equal(new Set(generic.CATALOG.map(c=>c.id)).size,generic.CATALOG.length);
    assert.ok(generic.CATALOG.every(c=>c.manufacturerId&&c.modelId&&c.catalogVersion));
    const rotor=generic.itemById('I-20'),nozzle=generic.defaultNozzle(rotor);
    const lo=performanceAt(rotor,nozzle.id,2.4,180).row;
    const hi=performanceAt(rotor,nozzle.id,2.8,180).row;
    const middle=performanceAt(rotor,nozzle.id,2.6,180);
    assert.equal(middle.kind,'interpolated');
    assert.ok(Math.abs(middle.row.flowLMin-(lo.flowLMin+hi.flowLMin)/2)<1e-9);
    assert.ok(Math.abs(middle.row.radiusM-(lo.radiusM+hi.radiusM)/2)<1e-9);
    assert.equal(middle.row.pressureBar,2.6);
    assert.equal(performanceAt(rotor,nozzle.id,100,180),null);
    assert.equal(performanceAt(rotor,nozzle.id,2.8,0),null);
    assert.equal(performanceAt(rotor,'missing',2.8,180),null);
    assert.equal(boundedPressure([2.4,2.8],2.6),2.6);
    assert.equal(boundedPressure([2.4,2.8],100),2.8);
    assert.equal(computeFlow({...rotor,verificationStatus:'Needs Review'},
      {nozzleId:nozzle.id,pressureBar:2.8,arc:180,radius:hi.radiusM}).lpm,null);
    const strip=generic.itemById('SS-530');
    const rows=strip.stripPerformance.slice().sort((a,b)=>a.pressureBar-b.pressureBar);
    const a=rows[0],b=rows[1];
    const c=generic.stripAtPressure(strip,(a.pressureBar+b.pressureBar)/2);
    assert.ok(Math.abs(c.w-(a.w+b.w)/2)<1e-9);
    assert.equal(generic.stripAtPressure(strip,100),undefined);
  } finally {await server.close();}
});
