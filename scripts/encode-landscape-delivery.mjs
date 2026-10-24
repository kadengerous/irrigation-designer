// Optional authoring step: retain the generated originals and encode their exact
// visible pixels/alpha losslessly for delivery. Builds use the checked-in WebPs.
import {createRequire} from 'node:module';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const sharp=createRequire((process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES??resolve('node_modules'))+'/package.json')('sharp');
const records=JSON.parse(await readFile('src/data/landscape-objects.json'));
const results=[];let cursor=0;
await Promise.all(Array.from({length:4},async()=>{
 while(cursor<records.length){
  const record=records[cursor++],source=`public/landscape/${record.id}.png`,target=`public/landscape/${record.id}.webp`;
  const encoded=await sharp(source).webp({lossless:true,quality:100,effort:6}).toBuffer();
  const a=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(encoded).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(a.info.width!==b.info.width||a.info.height!==b.info.height||a.data.length!==b.data.length)throw Error(`${record.id}: size changed`);
  for(let i=0;i<a.data.length;i+=4){
   if(a.data[i+3]!==b.data[i+3]||(a.data[i+3]&&[0,1,2].some(j=>a.data[i+j]!==b.data[i+j])))throw Error(`${record.id}: visible pixels/alpha changed`);
  }
  await writeFile(target,encoded);
  results.push({id:record.id,source,target,sourceBytes:(await stat(source)).size,bytes:encoded.length,sha256:createHash('sha256').update(encoded).digest('hex'),lossless:true,visiblePixelsIdentical:true,alphaIdentical:true});
 }
}));
results.sort((a,b)=>a.id.localeCompare(b.id));
await writeFile('data/landscape-delivery.json',JSON.stringify({encoding:'lossless WebP',assets:results},null,2)+'\n');
console.log(JSON.stringify({count:results.length,sourceBytes:results.reduce((n,r)=>n+r.sourceBytes,0),deliveryBytes:results.reduce((n,r)=>n+r.bytes,0)}));
