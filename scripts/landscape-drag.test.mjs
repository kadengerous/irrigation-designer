import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
let server,load;
before(async()=>{server=await createServer({server:{middlewareMode:true,hmr:false}});load=p=>server.ssrLoadModule('/src/'+p);});
after(async()=>server?.close());
test('library mouse drag, held touch drag, scrolling, cancellation and duplicate events',async()=>{
 const {libraryPointerDrag}=await load('components/designer/library-pointer-drag.ts');
 for(const scenario of ['mouse','touch','scroll','tap','cancel','escape','blur']){
  const host=new EventTarget(),timers=new Map();let sequence=0,drops=0,ends=0,previews=0;
  host.setTimeout=fn=>{timers.set(++sequence,fn);return sequence;};host.clearTimeout=id=>timers.delete(id);
  const emit=(type,fields={})=>{const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:7,clientX:50,clientY:60,...fields});host.dispatchEvent(event);return event;};
  const initial={pointerId:7,pointerType:scenario==='mouse'?'mouse':'touch',button:0,isPrimary:true,clientX:10,clientY:10};
  const cancel=libraryPointerDrag(host,initial,{preview:()=>previews++,drop:(x,y)=>{assert.deepEqual([x,y],[50,60]);drops++;},end:()=>ends++});
  if(!['mouse','scroll','tap'].includes(scenario))for(const fn of timers.values())fn();
  if(scenario==='tap')emit('pointerup',{clientX:10,clientY:10});
  else {
   emit('pointermove');
   if(scenario==='cancel')emit('pointercancel');
   else if(scenario==='escape')emit('keydown',{key:'Escape'});
   else if(scenario==='blur')emit('blur');
   else emit('pointerup');
  }
  emit('pointerup');emit('touchend',{changedTouches:[{clientX:50,clientY:60}]});cancel();
  assert.equal(drops,['mouse','touch'].includes(scenario)?1:0,scenario);
  assert.equal(ends,1,scenario);
  if(['scroll','tap'].includes(scenario))assert.equal(previews,0,scenario);
 }
});
test('library drop coordinates respect canvas origin, pan and zoom and reject outside points',async()=>{
 const {libraryDropPoint}=await load('components/designer/library-pointer-drag.ts');
 const rect={left:100,top:80,width:700,height:400},view={panX:20,panY:30,pxPerMeter:50};
 assert.deepEqual(libraryDropPoint(320,260,rect,view),{x:4,y:3});
 for(const [x,y] of [[99,100],[801,100],[200,79],[200,481],[NaN,100]])assert.equal(libraryDropPoint(x,y,rect,view),null);
});
test('dropping plants and objects creates a single editable item and category layer; undo and locked layers',async()=>{
 const {placeLibraryItem}=await load('components/designer/use-landscape-drag.tsx');
 const {useProject:s}=await load('lib/project-store.ts');
 const {emptyProject}=await load('lib/project-types.ts'),{emptyDrawing}=await load('lib/cad/types.ts');
 const {DECORATIVE_PLANTS}=await load('lib/plant-visuals.ts'),{LANDSCAPE_OBJECTS}=await load('lib/landscape-objects.ts');
 s.setState({project:{...emptyProject(),drawing:emptyDrawing()},workspaceSection:'landscape',snapOn:false,tool:null,drawSub:'none',past:[],future:[],pastOps:[],futureOps:[]});
 assert.ok(placeLibraryItem({kind:'plant',record:DECORATIVE_PLANTS[0]},{x:4,y:3}));
 assert.equal(Object.keys(s.getState().project.drawing.plants).length,1);assert.ok(s.getState().project.drawing.layers.trees);
 const record=LANDSCAPE_OBJECTS.find(r=>r.id==='bench-wood');
 assert.ok(placeLibraryItem({kind:'object',record},{x:7,y:3}));
 const d=s.getState().project.drawing,id=s.getState().selectedLandscapeId;
 assert.deepEqual([d.landscapeObjects[id].x,d.landscapeObjects[id].y],[7,3]);assert.ok(d.layers.furniture);
 assert.equal(s.getState().past.length,2);assert.equal(s.getState().pendingLandscapeObject,null);
 s.getState().undo();assert.equal(Object.keys(s.getState().project.drawing.landscapeObjects??{}).length,0);
 s.getState().redo();assert.equal(Object.keys(s.getState().project.drawing.landscapeObjects).length,1);
 s.getState().setCadLayer('furniture',{locked:true});const before=s.getState().project;
 assert.equal(placeLibraryItem({kind:'object',record},{x:9,y:9}),false);assert.equal(s.getState().project,before);
});
