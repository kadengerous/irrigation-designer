import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { createServer } from "vite";

test("hip slopes partition rectangular footprints and roof materials use hips and greenhouses use gables", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { hipRoof } = await server.ssrLoadModule("/src/lib/cad/hip-roof.ts");
    const { FACE_TEXTURES, FACE_TEXTURE_GROUPS } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const area = points => Math.abs(points.reduce((sum, a, i) => {
      const b = points[(i + 1) % points.length]; return sum + a.x * b.y - b.x * a.y;
    }, 0)) / 2;
    for (const [width, height] of [[12, 6], [6, 12], [8, 8], [.1, 12]]) {
      const roof = hipRoof(width, height);
      assert.equal(roof.planes.length, 4);
      assert.ok(roof.planes.every(points => area(points) > 0));
      assert.ok(Math.abs(roof.planes.reduce((sum, points) => sum + area(points), 0) - width * height) < 1e-8);
      const inside = (points, p) => points.every((a, i) => {
        const b = points[(i + 1) % points.length]; return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) > 0;
      });
      for (let x = .173; x < 1; x += .131) for (let y = .219; y < 1; y += .157)
        assert.equal(roof.planes.filter(points => inside(points, { x: x * width, y: y * height })).length, 1);
    }
    assert.equal(hipRoof(0, 10), null);
    assert.equal(hipRoof(NaN, 10), null);
    assert.equal(FACE_TEXTURE_GROUPS.length, 5);
    for (const group of FACE_TEXTURE_GROUPS) assert.equal(group.textures.length, 8, group.key);
    const ids = FACE_TEXTURE_GROUPS.flatMap(group => group.textures.map(texture => texture.id));
    assert.equal(new Set(ids).size, FACE_TEXTURES.length);
    assert.equal(ids.length, FACE_TEXTURES.length);
    for (const texture of FACE_TEXTURES) {
      await access(`public${texture.src}`);
      if (/^texture:roof-/.test(texture.id)) assert.equal(texture.roof, "hip");
      if (/^texture:greenhouse/.test(texture.id)) assert.equal(texture.roof, "gable");
    }
  } finally { await server.close(); }
});

test('compound roofs tile the footprint and connect valleys at reflex corners', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { polygonHipRoof, gableRoof } = await server.ssrLoadModule('/src/lib/cad/hip-roof.ts');
    const pt = coordinates => coordinates.map(([x,y]) => ({x,y}));
    const cases = [
      { name:'L', ring:pt([[0,0],[8,0],[8,3],[14,3],[14,8],[0,8]]), valleys:[[[8,3],[5.5,5.5]]] },
      { name:'T', ring:pt([[0,0],[12,0],[12,4],[8,4],[8,12],[4,12],[4,4],[0,4]]), valleys:[[[8,4],[6,2]],[[4,4],[6,2]]] },
      { name:'U', ring:pt([[0,0],[4,0],[4,8],[8,8],[8,0],[12,0],[12,12],[0,12]]), valleys:[[[4,8],[2,10]],[[8,8],[10,10]]] },
      { name:'cross', ring:pt([[4,0],[8,0],[8,4],[12,4],[12,8],[8,8],[8,12],[4,12],[4,8],[0,8],[0,4],[4,4]]) },
      { name:'oblique', ring:pt([[0,0],[10,0],[14,5],[8,5],[8,10],[0,10]]) },
      { name:'courtyard', ring:pt([[0,0],[14,0],[14,12],[0,12]]), holes:[pt([[4,4],[4,8],[10,8],[10,4]])] },
    ];
    const area = ring => Math.abs(ring.reduce((sum,a,i) => {const b=ring[(i+1)%ring.length];return sum+a.x*b.y-b.x*a.y;},0))/2;
    const inside = (p, ring) => {
      let yes=false;
      for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
        const a=ring[i],b=ring[j];
        if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) yes=!yes;
      }
      return yes;
    };
    const near = (a,b) => Math.hypot(a.x-b.x,a.y-b.y)<1e-6;
    for(const fixture of cases) {
      const roof=polygonHipRoof(fixture.ring,fixture.holes);
      assert.ok(roof,fixture.name);
      assert.equal(roof.planes.length,fixture.ring.length+(fixture.holes?.reduce((s,r)=>s+r.length,0)??0),fixture.name);
      const expected=area(fixture.ring)-(fixture.holes?.reduce((s,r)=>s+area(r),0)??0);
      assert.ok(Math.abs(roof.planes.reduce((s,r)=>s+area(r),0)-expected)<1e-6,fixture.name);
      // Every interior sample belongs to exactly one slope. No overlaps or empty wings.
      for(let x=.137;x<14;x+=.331) for(let y=.213;y<12;y+=.327) {
        const p={x,y};
        const expected=inside(p,fixture.ring)&&!(fixture.holes??[]).some(r=>inside(p,r));
        assert.equal(roof.planes.filter(r=>inside(p,r)).length,expected?1:0,`${fixture.name} at ${x},${y}`);
      }
      for(const [a,b] of fixture.valleys??[]) {
        const [p,q]=pt([a,b]);
        assert.ok(roof.ribs.some(([c,d])=>near(p,c)&&near(q,d)||near(p,d)&&near(q,c)),fixture.name+' valley');
      }
      // Rotation, translation and zoom preserve topology and area; winding may be reversed.
      for(const factor of [.02,1000]) {
        const transform=p=>({x:1e5+factor*(p.x*Math.cos(.37)-p.y*Math.sin(.37)),y:-1e5+factor*(p.x*Math.sin(.37)+p.y*Math.cos(.37))});
        const rotated=polygonHipRoof(fixture.ring.map(transform).reverse(),fixture.holes?.map(r=>r.map(transform).reverse()));
        assert.ok(rotated,fixture.name+' transformed');
        assert.equal(rotated.planes.length,roof.planes.length);
      }
    }
    const duplicate=pt([[0,0],[6,0],[12,0],[12,0],[12,6],[0,6],[0,0]]);
    assert.equal(polygonHipRoof(duplicate).planes.length,4);
    assert.equal(polygonHipRoof(pt([[0,0],[0,0],[0,0]])),null);
    assert.equal(polygonHipRoof(pt([[0,0],[NaN,2],[1,0]])),null);
    for(const [w,h] of [[12,6],[6,12],[8,8]]) {
      const roof=gableRoof(w,h);
      assert.equal(roof.planes.length,2);
      assert.equal(roof.ribs.length,1);
      const [a,b]=roof.ribs[0];assert.equal(Math.hypot(a.x-b.x,a.y-b.y),Math.max(w,h));
      assert.equal(roof.planes.reduce((sum,r)=>sum+area(r),0),w*h);
    }
  } finally { await server.close(); }
});

test('roof courses meet across hips and valleys, with every material running downhill from its eave', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { polygonHipRoof, gableRoof } = await server.ssrLoadModule('/src/lib/cad/hip-roof.ts');
    const { roofPatternTransform, texturePatternAttrs } = await server.ssrLoadModule('/src/lib/cad/texture-mapping.ts');
    const { FACE_TEXTURES } = await server.ssrLoadModule('/src/lib/cad/types.ts');
    const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
    const ring = [[0,0],[8,0],[8,3],[14,3],[14,8],[0,8]].map(([x,y]) => ({x,y}));
    const turn = p => ({x:130 + p.x*Math.cos(.37) - p.y*Math.sin(.37),y:260 + p.x*Math.sin(.37) + p.y*Math.cos(.37)});
    const layouts = [polygonHipRoof(ring), polygonHipRoof(ring.map(turn).reverse()), gableRoof(12,6), gableRoof(6,12),
      polygonHipRoof([{x:0,y:0},{x:14,y:0},{x:14,y:12},{x:0,y:12}], [[{x:4,y:4},{x:4,y:8},{x:10,y:8},{x:10,y:4}]])];
    for (const texture of FACE_TEXTURES.filter(t => t.roof)) {
      const frame = {x:0,y:0,width:14,height:8,rotation:37};
      assert.deepEqual(texturePatternAttrs(texture.id,frame,frame,36,90),texturePatternAttrs(texture.id,frame,frame,36,0), 'old manual turns cannot override roof slopes');
      for (const roof of layouts) {
        const transforms = roof.planes.map((plane,i) => {
          const [a,b] = roof.eaves[i], dx=b.x-a.x, dy=b.y-a.y;
          const matrix = roofPatternTransform(texture.id,roof.angles[i],a,.24,.24);
          // Texture columns (+Y) drain out through the eave. Courses (+X) follow it.
          assert.ok(dx*matrix.d - dy*matrix.c < 0, texture.id+' downhill');
          near(dx*matrix.b - dy*matrix.a,0);
          const sampleY = p => ((p.x-matrix.e)*matrix.c + (p.y-matrix.f)*matrix.d)/(matrix.c**2+matrix.d**2);
          near(sampleY(a),0); near(sampleY(b),0);
          assert.ok(plane.every(p => sampleY(p) <= 1e-6), texture.id+' slope is uphill of eave');
          return sampleY;
        });
        // Equal-height courses continue at the same phase on both sides of each seam.
        for (const [a,b] of roof.ribs) {
          const adjoining = roof.planes.flatMap((plane,i) => plane.some(p=>Math.hypot(p.x-a.x,p.y-a.y)<1e-6)&&plane.some(p=>Math.hypot(p.x-b.x,p.y-b.y)<1e-6)?[i]:[]);
          if (adjoining.length !== 2) continue;
          const midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
          near(transforms[adjoining[0]](midpoint),transforms[adjoining[1]](midpoint));
        }
      }
    }
  } finally { await server.close(); }
});
