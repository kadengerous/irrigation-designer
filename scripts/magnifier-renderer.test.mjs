import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanvas } from '@napi-rs/canvas';
import Konva from 'konva';
import { createServer } from 'vite';

// Exercise Konva's real vector renderer on a native canvas without a browser or DOM.
Konva.autoDrawEnabled = false;
Konva.Util.createCanvasElement = () => Object.assign(createCanvas(1, 1), { style: {} });
const server = await createServer({ server: { middlewareMode: true, hmr: false } });
const { MagnifierRenderer } = await server.ssrLoadModule('/src/components/designer/magnifier-renderer.ts');
await server.close();

const pixels = canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
const at = (canvas, x, y) => [...canvas.getContext('2d').getImageData(x, y, 1, 1).data];

test('magnifier omits measurement and zero text while retaining geometry and user notes', () => {
  const stage=new Konva.Stage({width:390,height:720});
  const layer=new Konva.Layer();
  stage.add(layer);
  layer.add(new Konva.Line({points:[90,100,110,100],stroke:'#00e640',strokeWidth:1}));
  layer.add(new Konva.Text({x:93,y:96,text:'0.00 m',fontSize:8,fill:'#f00'}));
  layer.add(new Konva.Text({x:102,y:101,text:'N',fontSize:4,fill:'#00f',name:'drawing-annotation'}));
  layer.draw();
  const original=stage.toJSON();
  const main=pixels(layer.getNativeCanvasElement()).slice();
  const count=(data,predicate)=>{
    let n=0; for(let i=0;i<data.length;i+=4) if(data[i+3]>0 && predicate(data[i],data[i+1],data[i+2])) n++;
    return n;
  };
  const red=(r,g,b)=>r>200 && g<60 && b<60;
  assert.ok(count(main,red)>0,'measurement is present on the main drawing');
  const renderer=new MagnifierRenderer();
  try {
    const lens=renderer.render(stage,{x:100,y:100},390,720,98,2,'#fff');
    const data=pixels(lens);
    assert.equal(count(data,red),0,'measurement does not appear in the lens');
    assert.ok(count(data,(r,g,b)=>b>200 && r<60 && g<60)>0,'user notes are preserved');
    assert.ok(count(data,(r,g,b)=>g>180 && r<100 && b<130)>0,'alignment geometry is preserved');
    assert.equal(stage.toJSON(),original);
    assert.deepEqual(pixels(layer.getNativeCanvasElement()),main);
  } finally {renderer.dispose();stage.destroy();}
});

test('magnifier enlarges geometry 5x in a compact frame while keeping strokes thin at both pixel densities', () => {
  const stage = new Konva.Stage({ width: 390, height: 720 });
  const layer = new Konva.Layer();
  stage.add(layer);
  layer.add(new Konva.Line({ points: [20,100,180,100], stroke: '#000', strokeWidth: 3 }));
  layer.add(new Konva.Rect({ x: 106, y: 96, width: 3, height: 3, fill: '#f00' }));
  layer.draw();
  const originalScene = stage.toJSON();
  const originalPixels = pixels(layer.getNativeCanvasElement()).slice();
  const renderer = new MagnifierRenderer();
  try {
    for (const dpr of [1,2]) {
      const canvas = renderer.render(stage, {x:100,y:100}, 390,720,98,dpr,'#fff');
      const darkRows = Array.from({length:canvas.height}, (_,y) => at(canvas,49*dpr,y))
        .filter(([r,g,b]) => r<220 && g<220 && b<220).length;
      assert.ok(darkRows > 0 && darkRows <= 2*dpr+1, `thin line at DPR ${dpr}: ${darkRows} pixels`);
      const redColumns = Array.from({length:canvas.width}, (_,x) => at(canvas,x,34*dpr))
        .filter(([r,g,b]) => r>240 && g<20 && b<20).length;
      assert.equal(redColumns,15*dpr,'a 3px-wide shape is magnified to 15 CSS pixels');
      assert.deepEqual(at(canvas,85*dpr,34*dpr),[255,0,0,255],'geometry retains its exact position around the focus');
    }
    assert.equal(stage.toJSON(),originalScene,'lens rendering cannot modify scene attributes');
    assert.deepEqual(pixels(layer.getNativeCanvasElement()),originalPixels,'main canvas stays unchanged');
  } finally { renderer.dispose(); stage.destroy(); }
});

test('magnifier keeps live edit handles centred and compact, including near canvas edges', () => {
  const stage = new Konva.Stage({ width: 768, height: 860 });
  const layer = new Konva.Layer();
  stage.add(layer);
  const handle = new Konva.Group({ name: 'edit-point-glyph', x: 100, y: 100 });
  const dot = new Konva.Circle({ radius: 4.5, fill: '#e8892f', stroke: '#fff', strokeWidth: 1.3 });
  handle.add(dot);
  layer.add(handle);
  const hidden = new Konva.Layer({visible:false});
  hidden.add(new Konva.Rect({width:768,height:860,fill:'#f00'}));
  stage.add(hidden);
  const renderer = new MagnifierRenderer();
  try {
    for (const point of [{x:100,y:100},{x:0,y:0},{x:767,y:859}]) {
      handle.position(point);
      const canvas = renderer.render(stage,point,768,860,98,2,'#17212b');
      assert.deepEqual(at(canvas,98,98),[232,137,47,255],'latest handle position stays at the lens centre');
      const orangeColumns = Array.from({length:canvas.width},(_,x)=>at(canvas,x,98))
        .filter(([r,g,b])=>r>220 && g>110 && g<160 && b<75).length;
      assert.ok(orangeColumns>=14 && orangeColumns<=20,`handle stays about 9 CSS pixels wide: ${orangeColumns}`);
      assert.deepEqual(at(canvas,10,10),[23,33,43,255],'dark background and hidden layers are respected');
    }
    assert.equal(dot.radius(),4.5);
    assert.equal(dot.strokeWidth(),1.3);
  } finally { renderer.dispose(); stage.destroy(); }
});

test('construction point stays small in the lens with its large touch target intact',()=>{
 const stage=new Konva.Stage({width:390,height:720});const layer=new Konva.Layer();stage.add(layer);
 const marker=new Konva.Group({name:'magnifier-symbol construction-point',x:100,y:100});
 const target=new Konva.Circle({radius:20,fill:'rgba(255,255,255,0.001)'});
 marker.add(target);marker.add(new Konva.Circle({radius:11,fill:'#f5222d'}));layer.add(marker);
 const renderer=new MagnifierRenderer();
 try { for(const dpr of [1,2]) {
  const lens=renderer.render(stage,{x:100,y:100},390,720,98,dpr,'#fff');
  const red=Array.from({length:lens.width},(_,x)=>at(lens,x,49*dpr)).filter(([r,g,b])=>r>200&&g<80&&b<80).length;
  assert.ok(red>=10*dpr&&red<=14*dpr,`compact dot at DPR ${dpr}: ${red}`);
  assert.equal(target.radius(),20);
 }} finally {renderer.dispose();stage.destroy();}
});

test('cursor lens uses gentle 1.35x zoom at native pixel density without changing the drawing', () => {
  const stage=new Konva.Stage({width:200,height:200});
  const layer=new Konva.Layer();stage.add(layer);
  layer.add(new Konva.Rect({x:98,y:98,width:4,height:4,fill:'#f00'}));layer.draw();
  const original=stage.toJSON(),renderer=new MagnifierRenderer();
  try {
    for(const dpr of [1,2,3]) {
      const lens=renderer.render(stage,{x:100,y:100},200,200,22,dpr,'#fff',1.35);
      assert.equal(lens.width,22*dpr);
      const red=Array.from({length:lens.width},(_,x)=>at(lens,x,11*dpr)).filter(([r,g,b])=>r>220&&g<50&&b<50).length;
      assert.ok(red>=4*dpr&&red<=6*dpr,`gentle cursor magnification at DPR ${dpr}: ${red}`);
      assert.equal(stage.toJSON(),original);
    }
  } finally {renderer.dispose();stage.destroy();}
});
