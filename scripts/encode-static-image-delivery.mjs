// Deployment encodings only: no resizing, palette changes or source replacement.
import {createRequire} from 'node:module';
import {readdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const sharp=createRequire((process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES??resolve('node_modules'))+'/package.json')('sharp');
const paths=[];
for(const directory of ['materials','catalog'])for(const name of await readdir(`public/${directory}`))if(name.endsWith('.png')&&!name.startsWith('_src_'))paths.push(`/${directory}/${name}`);
const results=[];let cursor=0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<paths.length){
 const source=paths[cursor++],target=source.replace(/\.png$/,'.webp');
 const encoded=await sharp('public'+source).webp({lossless:true,quality:100,effort:4}).toBuffer();
 const a=await sharp('public'+source).ensureAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(encoded).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(a.info.width!==b.info.width||a.info.height!==b.info.height||a.data.length!==b.data.length)throw Error(`${source}: dimensions changed`);
 for(let i=0;i<a.data.length;i+=4)if(a.data[i+3]!==b.data[i+3]||(a.data[i+3]&&[0,1,2].some(j=>a.data[i+j]!==b.data[i+j])))throw Error(`${source}: pixels changed`);
 await writeFile('public'+target,encoded);
 results.push({source,target,sourceBytes:(await stat('public'+source)).size,bytes:encoded.length,sha256:createHash('sha256').update(encoded).digest('hex'),visiblePixelsIdentical:true,alphaIdentical:true});
}}));
results.sort((a,b)=>a.source.localeCompare(b.source));
await writeFile('data/static-image-delivery.json',JSON.stringify({encoding:'lossless WebP',assets:results},null,2)+'\n');
console.log(JSON.stringify({count:results.length,sourceBytes:results.reduce((n,r)=>n+r.sourceBytes,0),deliveryBytes:results.reduce((n,r)=>n+r.bytes,0)}));
