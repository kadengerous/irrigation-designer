// Authoring only: retain originals; deliver full-resolution WebP with exact alpha.
// No resizing, crop changes or replacement of the source artwork.
import {createRequire} from 'node:module';
import {readdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const sharp=createRequire((process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES??resolve('node_modules'))+'/package.json')('sharp');
const results=[];
let previous=[];
if(process.argv.includes('--new-only')){
 try{const manifest=JSON.parse(await readFile('data/landscape-delivery.json','utf8'));if(manifest.encoding==='WebP quality 92, original resolution, lossless alpha')previous=manifest.assets;}catch{}
}
for(const directory of ['plants','landscape']){
 const names=(await readdir(`public/${directory}`)).filter(name=>name.endsWith('.png')).sort();
 const boundPath=directory==='plants'?'src/lib/plant-art-bounds.json':'src/lib/landscape-object-bounds.json';
 const bounds=JSON.parse(await readFile(boundPath,'utf8'));
 let cursor=0;
 await Promise.all(Array.from({length:4},async()=>{while(cursor<names.length){
  const name=names[cursor++],id=name.slice(0,-4),source=`public/${directory}/${name}`,target=source.replace(/\.png$/,'.webp');
  const cached=previous.find(r=>r.source===source);
  if(cached&&cached.sourceBytes===(await stat(source)).size){
   const encoded=await readFile(target);
   if(createHash('sha256').update(encoded).digest('hex')===cached.sha256){results.push(cached);continue;}
  }
  const encoded=await sharp(source).webp({quality:92,alphaQuality:100,effort:6}).toBuffer();
  const a=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(encoded).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(a.info.width!==b.info.width||a.info.height!==b.info.height)throw Error(`${id}: dimensions changed`);
  let difference=0,channels=0,minX=a.info.width,minY=a.info.height,maxX=-1,maxY=-1,transparent=0;
  for(let y=0;y<a.info.height;y++)for(let x=0;x<a.info.width;x++){
   const i=(y*a.info.width+x)*4,alpha=a.data[i+3];
   if(alpha!==b.data[i+3])throw Error(`${id}: alpha changed`);
   if(alpha===0)transparent++;
   if(alpha>32){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
   if(alpha>128)for(let j=0;j<3;j++){difference+=Math.abs(a.data[i+j]-b.data[i+j]);channels++;}
  }
  if(maxX<minX||!transparent)throw Error(`${id}: missing artwork or transparent background`);
  if(!bounds[id]||(cached&&cached.sourceBytes!==(await stat(source)).size))bounds[id]={...bounds[id],x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1,imageWidth:a.info.width,imageHeight:a.info.height};
  await writeFile(target,encoded);
  results.push({id,source,target,sourceBytes:(await stat(source)).size,bytes:encoded.length,sha256:createHash('sha256').update(encoded).digest('hex'),width:a.info.width,height:a.info.height,alphaIdentical:true,meanRgbDifference:difference/Math.max(channels,1)});
 }}));
 await writeFile(boundPath,JSON.stringify(bounds,null,2)+'\n');
}
results.sort((a,b)=>a.id.localeCompare(b.id));
await writeFile('data/landscape-delivery.json',JSON.stringify({encoding:'WebP quality 92, original resolution, lossless alpha',assets:results},null,2)+'\n');
console.log(JSON.stringify({count:results.length,sourceMiB:results.reduce((n,r)=>n+r.sourceBytes,0)/1048576,deliveryMiB:results.reduce((n,r)=>n+r.bytes,0)/1048576,maxMeanRgbDifference:Math.max(...results.map(r=>r.meanRgbDifference))}));
