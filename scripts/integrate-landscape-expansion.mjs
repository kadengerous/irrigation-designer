// Mechanical integration of reviewed, separately generated catalogue assets.
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const assetsOnly=process.argv.includes('--assets-only');
const manifests=process.argv.slice(2).filter(a=>a!=='--assets-only');
const items=[];
for(const file of manifests){const data=JSON.parse(await readFile(file,'utf8'));items.push(...(Array.isArray(data)?data:data.items));}
const locales=['en','ru','es','pt-BR','fr','it','de','ar','tr','pl','zh-CN','nl','cs','el','hu','ro','sk','he','uk','ja'];
const plantCategories=['tree','shrub','flower','grass'],objectCategories=['furniture','lighting','decor','equipment'];
const plants=[],objects=[],provenance=[],seen=new Set();
const objectBounds=JSON.parse(await readFile('src/lib/landscape-object-bounds.json','utf8'));
let assetsCopied=0;
for(const item of items){
 if(!/^[a-z][a-z0-9-]+$/.test(item.id)||seen.has(item.id))throw Error(`Invalid or duplicate ID: ${item.id}`);seen.add(item.id);
 const plant=plantCategories.includes(item.category);
 if(!plant&&!objectCategories.includes(item.category))throw Error(`Invalid category: ${item.category}`);
 const target=`public/${plant?'plants':'landscape'}/${item.id}.png`,source=resolve(item.path);
 let bytes;try{bytes=await readFile(source);}catch(e){if(assetsOnly&&e.code==='ENOENT')continue;throw e;}
 if(bytes.subarray(1,4).toString()!=='PNG')throw Error(`Expected PNG: ${source}`);
 try{const existing=await readFile(target);if(!existing.equals(bytes))throw Error(`Refusing to replace existing artwork: ${target}`);}catch(e){if(e.code==='ENOENT')await copyFile(source,target);else throw e;}
 assetsCopied++;
 if(assetsOnly)continue;
 const names=item.names??item.labels;
 for(const locale of locales)if(typeof names?.[locale]!=='string'||!names[locale].trim())throw Error(`${item.id}: missing ${locale} label`);
 if(plant){
  if(!(item.defaultDiameterM>=.05&&item.defaultDiameterM<=100))throw Error(`Invalid plant size: ${item.id}`);
  plants.push({id:item.id,category:item.category,defaultDiameterM:item.defaultDiameterM});
 }else{
  if(!(item.width>=.03&&item.length>=.03)||!item.subcategory||!['rect','circle','hexagon','rock','lshape'].includes(item.shape))throw Error(`Invalid object: ${item.id}`);
  const crop=objectBounds[item.id],size=Math.max(item.width,item.length);
  // Authoring dimensions are physical long/short sides, whereas the canvas uses
  // horizontal length and vertical width. A portrait sprite must not grow huge.
  const scale=crop?size/Math.max(crop.width,crop.height):1;
  const length=item.shape==='circle'?size:crop?crop.width*scale:item.length;
  const width=item.shape==='circle'?size:crop?crop.height*scale:item.width;
  objects.push({id:item.id,category:item.category,subcategory:item.subcategory,width,length,shape:item.shape,stretch:!!item.stretch});
 }
 provenance.push({id:item.id,category:item.category,source:target,generator:'built-in imagegen',prompt:item.prompt});
}
if(!assetsOnly){
 const previous=JSON.parse(await readFile('src/data/landscape-objects.json','utf8'));
 const all=[...previous.filter(r=>!seen.has(r.id)),...objects];
 for(const c of objectCategories)if(all.filter(r=>r.category===c).length!==30)throw Error(`${c}: expected 30 objects`);
 const legacy={tree:8,shrub:10,flower:8,grass:6};
 if(plants.length){
  for(const c of plantCategories)if(plants.filter(r=>r.category===c).length+legacy[c]!==30)throw Error(`${c}: expected 30 plants`);
  await writeFile('src/data/decorative-plants-extra.json',JSON.stringify(plants,null,2)+'\n');
 }
 await writeFile('src/data/landscape-objects.json',JSON.stringify(all,null,2)+'\n');
 const boundsPath='src/lib/landscape-object-bounds.json',bounds=JSON.parse(await readFile(boundsPath,'utf8'));
 for(const item of items)if(item.footprint){
  if(!bounds[item.id]||item.footprint.length<3||!item.footprint.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=.5&&Math.abs(p.y)<=.5))throw Error(`Invalid footprint: ${item.id}`);
  bounds[item.id].footprint=item.footprint;
 }
 // The curved bench leaves its open centre irrigable, like the U kitchen.
 if(bounds['bench-semicircle']){
  const arc=(r,reverse=false)=>Array.from({length:33},(_,i)=>{
   const a=Math.PI+(reverse?32-i:i)*Math.PI/32;
   return {x:.5*r*Math.cos(a),y:.5+r*Math.sin(a)};
  });
  bounds['bench-semicircle'].footprint=[...arc(1),...arc(.68,true)];
 }
 await writeFile(boundsPath,JSON.stringify(bounds,null,2)+'\n');
 for(const locale of locales){
  const path=`src/lib/locales/${locale}.json`,dictionary=JSON.parse(await readFile(path,'utf8'));
  for(const item of items)dictionary[`${plantCategories.includes(item.category)?'plantVisual':'landscapeObject'}_${item.id}`]=(item.names??item.labels)[locale];
  await writeFile(path,JSON.stringify(dictionary,null,2)+'\n');
 }
 await writeFile('data/landscape-artwork-365.json',JSON.stringify({note:'Decorative variants; dimensions are editable placement defaults, not botanical or product specifications.',assets:provenance},null,2)+'\n');
}
console.log(JSON.stringify({assetsCopied,assetsOnly}));
