import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadImage} from '@napi-rs/canvas';
import {createServer} from 'vite';

// Run against dist/client as a publication gate too: originals in public/ can
// conceal missing deployed files. No redirect is involved in these URLs.
test('catalogue, category and material URLs point directly to decodable deployed images',async()=>{
  const server=await createServer({server:{middlewareMode:true,hmr:false}});
  try {
    const {CATALOG,CATEGORIES,catalogPhoto,categoryPhoto}=await server.ssrLoadModule('/src/lib/hunter-catalog.ts');
    const {ALL_FACE_TEXTURES}=await server.ssrLoadModule('/src/lib/cad/types.ts');
    const {staticImageSrc}=await server.ssrLoadModule('/src/lib/static-image-src.ts');
    const roots=process.env.IRRI_ASSET_ROOT??'public';
    const sources=new Set([
      ...CATALOG.map(catalogPhoto),...CATEGORIES.map(c=>categoryPhoto(c.id)).filter(Boolean),
      ...ALL_FACE_TEXTURES.map(t=>t.src),
      ...['PGP-ADJ','MSBN-50Q','MP2000','body','8A'].map(id=>staticImageSrc(`/catalog/${id}.png?v=9`)),
    ]);
    assert.ok(sources.size>100);
    assert.equal(catalogPhoto(CATALOG.find(i=>i.id==='MP1000-90')),'/catalog/MP1000-90.webp?v=10');
    for(const src of sources){
      const path=src.split(/[?#]/)[0];
      assert.match(path,/\.webp$/,src);
      const bytes=await readFile(resolve(roots,'.'+path));
      const image=await loadImage(bytes);
      assert.ok(image.width>0&&image.height>0,src);
    }
    assert.equal(staticImageSrc('/catalog/MP1000-90.png?v=9#photo'),'/catalog/MP1000-90.webp?v=9#photo');
    assert.equal(staticImageSrc('/plants/unchanged.png?v=1'),'/plants/unchanged.png?v=1');
    console.log(`Verified ${sources.size} image URLs in ${roots}`);
  }finally{await server.close();}
});
