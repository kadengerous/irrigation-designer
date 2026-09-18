import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true, hmr: false } });
const { seamlessPixels } = await server.ssrLoadModule('/src/lib/cad/seamless-pattern.ts');
await server.close();
test('periodic texture transitions remove edge discontinuities in both directions', () => {
  const w=128,h=128, source=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)source.set([x*2,y*2,80,255],(y*w+x)*4);
  const tile=seamlessPixels(source,w,h);
  for(let y=0;y<tile.height;y++)assert.ok(Math.abs(tile.data[y*tile.width*4]-tile.data[(y*tile.width+tile.width-1)*4])<=3);
  for(let x=0;x<tile.width;x++)assert.ok(Math.abs(tile.data[x*4+1]-tile.data[((tile.height-1)*tile.width+x)*4+1])<=3);
  const i=(50*tile.width+50)*4;
  assert.deepEqual([...tile.data.slice(i,i+4)],[100,100,80,255]);
  for(let i=3;i<tile.data.length;i+=4)assert.equal(tile.data[i],255);
});
test('constant textures stay constant through corner overlaps', () => {
  const source=new Uint8ClampedArray(32*32*4).fill(123);
  const tile=seamlessPixels(source,32,32);
  assert.ok(tile.data.every(value=>value===123));
});
