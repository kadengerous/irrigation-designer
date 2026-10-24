import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

test('legend dismissal keeps coverage, next activation reopens it; masks preserve holes and combine overlapping bands', async () => {
  const server = await createServer({server:{middlewareMode:true,hmr:false}});
  const previousPath = globalThis.Path2D;
  try {
    const {useCoverageDisplay} = await server.ssrLoadModule('/src/lib/coverage-display.ts');
    const {hatchedPaintMask,outsideHatchesClip,sprinklerPaintClip} = await server.ssrLoadModule('/src/lib/coverage-paint.ts');
    const {pointInSurface} = await server.ssrLoadModule('/src/lib/irrigation-geometry.ts');
    const state = () => useCoverageDisplay.getState();
    state().toggle('first');
    state().closeLegend();
    assert.equal(state().projectId,'first');
    assert.equal(state().legendOpen,false);
    state().toggle('first');
    assert.equal(state().projectId,'first');
    assert.equal(state().legendOpen,true);
    state().toggle('first');
    assert.equal(state().projectId,null);
    state().toggle('second');
    assert.equal(state().legendOpen,true);

    const square = (a,b,c,d) => [[a,b],[c,b],[c,d],[a,d],[a,b]];
    const dry = [[square(0,0,10,10),square(3,3,7,7)]];
    const mask = hatchedPaintMask({dry,single:[[square(8,0,12,10)]],outside:[],double:[],triple:[]});
    assert.equal(outsideHatchesClip([],20,0,0),undefined,'disabled check restores normal paint');
    globalThis.Path2D = class {
      moves=[]; rings=[];
      rect() {} // The surrounding rectangle includes every test point.
      lineTo(x,y) {this.rings.at(-1).push([x,y]);}
      closePath() {this.rings.at(-1).push(this.rings.at(-1)[0]);}
      moveTo(x,y) {this.moves.push([x,y]);this.rings.push([[x,y]]);}
    };
    const clipCalls = callback => {
      const clips=[];
      const ctx={clip:(path,rule)=>{assert.equal(rule,'evenodd');clips.push(path);}};
      ctx.clip(...callback(ctx)); // Konva applies the returned last clip.
      return clips;
    };
    const visible = (clips,x,y) => clips.every(p=>!pointInSurface({x,y},[p.rings]));
    const clips = clipCalls(outsideHatchesClip(mask,1,0,0));
    assert.equal(visible(clips,5,5),true,'holes retain the underlying fill');
    assert.equal(visible(clips,9,5),false,'overlapping masks never cancel each other');
    assert.equal(visible(clips,11,5),false,'every hatch band masks paint');
    assert.equal(visible(clips,13,5),true,'unhatched paint is preserved');
    const sharedClip = outsideHatchesClip(mask,36,100,50);
    const firstFrame = clipCalls(sharedClip);
    for (let frame=0;frame<60;frame++) {
      const reused=clipCalls(sharedClip);
      assert.ok(reused.every((path,i)=>path===firstFrame[i]),'canvas redraws reuse prepared paths');
    }
    const changedView=clipCalls(outsideHatchesClip(mask,72,100,50));
    assert.notEqual(changedView[0],firstFrame[0],'zoom builds a fresh aligned mask');
    const [screen] = clipCalls(outsideHatchesClip(dry,20,100,50));
    const [local] = clipCalls(outsideHatchesClip(dry,20,-40,-60));
    assert.deepEqual(screen.moves,[[100,50],[160,110]]);
    assert.deepEqual(local.moves,[[-40,-60],[20,0]]);
    const head = {id:'moving',x:2,y:3};
    const preview = {id:'moving',x:8,y:9};
    const movedSurface = [[square(8,9,12,13)]];
    for (const zoom of [12,36,100]) {
      const [moving] = clipCalls(sprinklerPaintClip(movedSurface,zoom,head,preview));
      assert.deepEqual(moving.moves,[[0,0]],'hatching follows the live head position before drop');
      const [stationary] = clipCalls(sprinklerPaintClip(movedSurface,zoom,{...head,id:'other'},preview));
      assert.deepEqual(stationary.moves,[[6*zoom,6*zoom]],'dragging one head does not shift other heads’ clipping');
      const [dropped] = clipCalls(sprinklerPaintClip(movedSurface,zoom,preview,null));
      assert.deepEqual(dropped.moves,moving.moves,'dropping must not change mask alignment');
    }
    // Dense, nearly coincident boundaries used to require an unstable boolean
    // operation during rendering. They must now reach the canvas unchanged.
    const closeRings = Array.from({length:40},(_,i)=>[square(-13.427700243753597+i*1e-13,21,4.220497242418776,24.357596598355144)]);
    const before=JSON.stringify(closeRings);
    const touchingMask=hatchedPaintMask({dry:closeRings,single:closeRings,outside:closeRings,double:[],triple:[]});
    const touchingClips=clipCalls(outsideHatchesClip(touchingMask,36,0,0));
    assert.equal(visible(touchingClips,0,22*36),false);
    assert.equal(visible(touchingClips,10*36,22*36),true);
    assert.equal(JSON.stringify(closeRings),before,'display never changes project geometry');
  } finally {
    globalThis.Path2D = previousPath;
    await server.close();
  }
});

test('moving-head coverage agrees with a full calculation across figure boundaries and excluded areas', async t => {
  const server=await createServer({server:{middlewareMode:true,hmr:false}});
  try {
    const {diagnosticCoverage}=await server.ssrLoadModule('/src/lib/diagnostic-coverage.ts');
    const {emptyProject}=await server.ssrLoadModule('/src/lib/project-types.ts');
    const {itemById}=await server.ssrLoadModule('/src/lib/hunter-catalog.ts');
    const {selectAutomaticHead}=await server.ssrLoadModule('/src/lib/automatic-head.ts');
    const {surfaceArea,pointInSurface}=await server.ssrLoadModule('/src/lib/irrigation-geometry.ts');
    const item=itemById('MP800SR-360'),fit=selectAutomaticHead(3,360,2.8,[item]);
    assert.ok(fit,'3 m footprints use a supported MP800SR model and pressure');
    const heads=Array.from({length:24},(_,i)=>({...fit,id:`h${i}`,catalogId:item.id,
      x:(i%6)*4,y:Math.floor(i/6)*4,r:3,arc:360,start:0,zone:1}));
    const rect=(id,x,y,w,h,cadType='lawn')=>({id,type:'poly',kind:'lawn',cadType,closed:true,hidden:false,locked:false,
      points:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]});
    const base={...emptyProject(),heads,polygons:[rect('left',0,0,8,16),rect('right',12,0,12,16),rect('excluded',16,6,2,2,'building')]};
    const before=JSON.stringify(base);
    let incrementalMs=0,fullMs=0;
    for(const [index,[x,y]] of [[-3.17,5.31],[4.13,5.17],[10.47,5.31],[15.21,3.13],[17.19,7.23],[26.43,4.21],[4.13,5.17]].entries()) {
      const moving={...heads[0],x,y},current={...base,heads:[moving,...heads.slice(1)]};
      let started=performance.now();
      const incremental=diagnosticCoverage(current,base,moving.id);
      if(index)incrementalMs+=performance.now()-started;
      started=performance.now();
      const full=diagnosticCoverage({...current});
      if(index)fullMs+=performance.now()-started;
      assert.ok(incremental && full,`coverage remains available at ${x},${y}: incremental=${!!incremental}, full=${!!full}`);
      for(const band of ['dry','outside','single','double','triple']) {
        assert.ok(Math.abs(surfaceArea(incremental[band])-surfaceArea(full[band]))<1e-5,`${band} area at ${x},${y}`);
        for(let sx=-2;sx<28;sx+=2)for(let sy=1;sy<18;sy+=2) {
          const point={x:sx+.137,y:sy+.219};
          assert.equal(pointInSurface(point,incremental[band]),pointInSurface(point,full[band]),`${band} at ${point.x},${point.y}`);
        }
      }
    }
    const touching={...base,heads:[{...heads[0],x:4,y:5},...heads.slice(1)]};
    assert.doesNotThrow(()=>diagnosticCoverage(touching,base,heads[0].id),'numerically unstable boundaries never crash a drag');
    assert.equal(JSON.stringify(base),before,'drag previews never change saved geometry');
    t.diagnostic(`Repeated drag calculations: incremental ${incrementalMs.toFixed(1)} ms, full ${fullMs.toFixed(1)} ms`);
  } finally {await server.close();}
});
