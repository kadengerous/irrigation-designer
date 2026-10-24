import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

test('all 240 landscape choices ship direct, verified transparent images',async()=>{
 const root=process.env.IRRI_ASSET_ROOT||'public';
 const manifest=JSON.parse(await readFile('data/landscape-delivery.json','utf8'));
 assert.equal(manifest.assets.length,240);
 assert.equal(new Set(manifest.assets.map(a=>a.target)).size,240);
 for(const asset of manifest.assets){
  const bytes=await readFile(resolve(root,asset.target.replace(/^public\//,'')));
  assert.equal(bytes.subarray(0,4).toString(),'RIFF',asset.id);
  assert.equal(bytes.subarray(8,12).toString(),'WEBP',asset.id);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,asset.id);
  assert.equal(asset.alphaIdentical,true,asset.id);
  assert.ok(Math.max(asset.width,asset.height)>=1024,asset.id);
 }
});
