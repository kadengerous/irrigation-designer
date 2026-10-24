import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {resolve} from 'node:path';
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
let server,vector,plants,objects,entries;
const qa=process.env.LANDSCAPE_VARIETY_QA_DIR;
const report={categories:{},bounds:[],comparisons:[]};
const plant=(catalog,patch={})=>({id:catalog.id,kind:catalog.category,catalog,x:0,y:0,r:1,rotation:0,visualMode:'vector',...patch});
let object;
before(async()=>{
 server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 [vector,plants,objects]=await Promise.all(['landscape-vector','plant-visuals','landscape-objects'].map(id=>server.ssrLoadModule('/src/lib/'+id+'.ts')));
 object=(record,patch={})=>({id:record.id,catalogId:record.id,category:record.category,x:0,y:0,...objects.defaultLandscapeSize(record),rotation:0,keepRatio:true,noIrrigation:true,visualMode:'vector',...patch});
 entries=[...plants.DECORATIVE_PLANTS.map(catalog=>({id:catalog.visualId,category:catalog.category,kind:'plant',record:catalog,instance:plant(catalog),make:(h,scale=1)=>vector.plantVectorArtwork(h,2*scale)})),...objects.LANDSCAPE_OBJECTS.map(record=>({id:record.id,category:record.category,kind:'object',record,instance:object(record),make:(h,scale=1)=>vector.landscapeVectorArtwork({...h,length:h.length*scale,width:h.width*scale})}))];
 for(const e of entries)e.art=e.make(e.instance);
 if(qa)await mkdir(qa,{recursive:true});
});
after(async()=>{if(qa)await writeFile(resolve(qa,'variety-report.json'),JSON.stringify(report,null,2));await server?.close();});

// SVG coordinates, arc flags and rotations are treated separately: colors and
// physical aspect ratio cannot make copies count as different drawings.
function geometry(art){
 return art.paths.map(p=>{
  const tokens=p.d.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)||[],out=[];
  let cmd='',position=0;
  for(const token of tokens){
   if(/^[A-Za-z]$/.test(token)){cmd=token.toUpperCase();position=0;out.push(cmd);continue;}
   const n=Number(token);assert.ok(Number.isFinite(n));
   let axis;
   if(cmd==='A'){axis=position%7===0||position%7===5?'x':position%7===1||position%7===6?'y':null;}
   else if(cmd==='H')axis='x';else if(cmd==='V')axis='y';else axis=position%2===0?'x':'y';
   out.push(axis?n/(axis==='x'?art.width:art.height):n);position++;
  }
  return {tokens:out,filled:p.fill!=='none',stroke:p.stroke!=='none',weight:p.strokeWidth/Math.min(art.width,art.height)};
 });
}
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const canonical=art=>geometry(art).map(p=>({...p,weight:+p.weight.toFixed(5),tokens:p.tokens.map(t=>typeof t==='number'?+t.toFixed(5):t)}));
const topology=art=>geometry(art).map(p=>({commands:p.tokens.filter(t=>typeof t==='string'),filled:p.filled,stroke:p.stroke}));
function svg(art,{monochrome=false,overscan=1,pixels=160,normalized=false}={}){
 const w=art.width*overscan,h=art.height*overscan;
 const content=monochrome?art.paths.map(p=>`<path d="${p.d}" fill="${p.fill==='none'?'none':'#8b9a91'}" stroke="${p.stroke==='none'?'none':'#263b30'}" stroke-width="${p.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`).join(''):vector.vectorArtworkSvg(art);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="${-w/2} ${-h/2} ${w} ${h}" preserveAspectRatio="${normalized?'none':'xMidYMid meet'}">${content}</svg>`;
}
async function pixels(art,options={}){const size=options.pixels??64,c=createCanvas(size,size),ctx=c.getContext('2d');ctx.drawImage(await loadImage(Buffer.from(svg(art,{...options,pixels:size}))),0,0);return {canvas:c,data:ctx.getImageData(0,0,size,size).data};}
function imageDifference(a,b){let difference=0;for(let i=0;i<a.length;i+=4){for(let j=0;j<3;j++)difference+=Math.abs((a[i+j]*a[i+3]/255+255-a[i+3])-(b[i+j]*b[i+3]/255+255-b[i+3]));}return difference/(a.length/4*3*255);}

test('all 246 catalogue drawings are deterministic, finite, scale proportionally and preserve saved objects',()=>{
 assert.equal(entries.length,246);
 for(const e of entries){
  const before=JSON.stringify(e.instance),art=e.art;
  assert.ok(art.width>0&&art.height>0,e.id);
  assert.ok(art.paths.length>=2&&art.paths.length<=(e.kind==='plant'?100:80),`${e.id}: ${art.paths.length} vector nodes`);
  assert.deepEqual(e.make(e.instance),art,`${e.id}: deterministic`);
  assert.deepEqual(e.make({...e.instance,id:'another-instance',x:38,y:-25,rotation:137}),art,`${e.id}: placement does not redraw its shape`);
  assert.equal(JSON.stringify(e.instance),before,`${e.id}: saved data unchanged`);
  for(const path of art.paths){assert.doesNotMatch(path.d,/NaN|Infinity|undefined/);assert.ok(path.d.length>0&&Number.isFinite(path.strokeWidth)&&path.strokeWidth>0,e.id);assert.ok(path.opacity==null||path.opacity>=0&&path.opacity<=1,e.id);}
  const bigger=e.make(e.instance,3.25),a=geometry(art),b=geometry(bigger);
  assert.ok(Math.abs(bigger.width/art.width-3.25)<1e-10&&Math.abs(bigger.height/art.height-3.25)<1e-10,e.id);
  assert.equal(a.length,b.length);
  for(let i=0;i<a.length;i++){
   assert.equal(a[i].tokens.length,b[i].tokens.length,e.id);
   assert.ok(Math.abs(a[i].weight-b[i].weight)<1e-6,e.id);
   for(let j=0;j<a[i].tokens.length;j++)if(typeof a[i].tokens[j]==='number')assert.ok(Math.abs(a[i].tokens[j]-b[i].tokens[j])<2e-5,`${e.id}: scale ${a[i].tokens[j]} / ${b[i].tokens[j]}`);else assert.equal(a[i].tokens[j],b[i].tokens[j]);
  }
 }
});

test('catalogue variety survives removing all colors and normalizing physical proportions',()=>{
 for(const category of new Set(entries.map(e=>e.category))){
  const group=entries.filter(e=>e.category===category),geometries=new Map(),structures=new Map();
  for(const e of group){const key=hash(canonical(e.art)),structure=hash(topology(e.art));geometries.set(key,[...(geometries.get(key)||[]),e.id]);structures.set(structure,[...(structures.get(structure)||[]),e.id]);}
  const duplicates=[...geometries.values()].filter(ids=>ids.length>1);
  report.categories[category]={count:group.length,uniqueGeometry:geometries.size,uniqueTopology:structures.size,maximumNodes:Math.max(...group.map(e=>e.art.paths.length)),duplicates,sharedTopology:[...structures.values()].filter(ids=>ids.length>1)};
  assert.deepEqual(duplicates,[],`${category}: copied normalized drawing`);
  assert.ok(structures.size>=Math.ceil(group.length/3),`${category}: too many drawings share the same path structure (${structures.size}/${group.length})`);
 }
});

test('specified tree, shrub, grass and equipment forms remain visibly distinct as 64-pixel monochrome thumbnails',async()=>{
 const groups=[['tree-rounded','tree-spreading','tree-airy','tree-oval'],['tree-conifer','tree-palm-fan','tree-silver-weeping'],['tree-conifer','tree-dark-fir'],['tree-silver','tree-silver-fir','tree-blue-spruce'],['shrub-fern-mound','shrub-boxwood-square','shrub-hedge-dark-long'],['grass-moon-fan','grass-plume','grass-copper-whorl'],['bench-wood','bench-semicircle','hammock-timber'],['pool-square','tub-square-spa'],['light-halo-ring','light-lantern','light-bollard']];
 for(const ids of groups){
  const group=ids.map(id=>{const entry=entries.find(e=>e.id===id);assert.ok(entry,`fixture exists: ${id}`);return entry;});
  const buffers=await Promise.all(group.map(e=>pixels(e.art,{monochrome:true,normalized:true})));
  for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
   const difference=imageDifference(buffers[i].data,buffers[j].data);report.comparisons.push({ids:[group[i].id,group[j].id],difference});
   assert.ok(difference>.035,`${group[i].id} / ${group[j].id}: less than 3.5% structural difference (${difference})`);
  }
 }
});

test('every drawing paints visible detail inside its measured artwork box; native sheets cover all categories',async()=>{
 const errors=[];
 for(const e of entries){
  const {data}=await pixels(e.art,{pixels:240,overscan:1.2,normalized:true});let minX=240,minY=240,maxX=-1,maxY=-1,count=0;
  for(let y=0;y<240;y++)for(let x=0;x<240;x++)if(data[(y*240+x)*4+3]>16){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;}
  // The nominal box is [20,220]. One pixel permits anti-aliased strokes.
  const bounds={id:e.id,minX,minY,maxX,maxY,count};report.bounds.push(bounds);
  if(count<120||minX<19||minY<19||maxX>220||maxY>220)errors.push(bounds);
  e.preview=await pixels(e.art,{pixels:140});
 }
 if(qa){
  for(const category of new Set(entries.map(e=>e.category))){
   const group=entries.filter(e=>e.category===category),cols=6,tw=180,th=183,c=createCanvas(cols*tw,Math.ceil(group.length/cols)*th+40),ctx=c.getContext('2d');
   ctx.fillStyle='#f4f6f1';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#24352b';ctx.font='bold 18px sans-serif';ctx.fillText(`${category} · ${group.length} vector drawings`,16,27);
   group.forEach((e,i)=>{const x=i%cols*tw,y=Math.floor(i/cols)*th+40;ctx.strokeStyle='#dfe5dc';ctx.strokeRect(x+.5,y+.5,tw-1,th-1);ctx.drawImage(e.preview.canvas,x+20,y+5);ctx.fillStyle='#24352b';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText(e.id,x+tw/2,y+164,tw-8);});
   await writeFile(resolve(qa,`vector-${category}.png`),c.toBuffer('image/png'));
  }
  const sampleIds=['tree-rounded','tree-spreading','tree-airy','tree-oval','tree-conifer','tree-palm-fan','shrub-fern-mound','shrub-boxwood-square','shrub-hedge-dark-long','flower-blue-crescent','flower-sun-checker','flower-mixed','grass-green','grass-lime-fan','grass-plume','grass-copper-whorl','grass-blue-needle','grass-amber-feather','bench-wood','bench-semicircle','hammock-timber','kitchen-u','pool-rectangle','tub-square-spa','light-halo-ring','light-double-head','light-wall-tube','sculpture-stone','figure-frog','fountain-octagonal'];
  const sample=sampleIds.map(id=>entries.find(e=>e.id===id)).filter(Boolean),cols=6,tw=180,th=112,c=createCanvas(cols*tw,Math.ceil(sample.length/cols)*th+40),ctx=c.getContext('2d');ctx.fillStyle='#f4f6f1';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#24352b';ctx.font='bold 18px sans-serif';ctx.fillText('Catalogue artwork · actual 64 px thumbnails',16,27);ctx.textAlign='center';
  for(let i=0;i<sample.length;i++){const e=sample[i],x=i%cols*tw,y=Math.floor(i/cols)*th+40,{canvas}=await pixels(e.art,{pixels:64});ctx.drawImage(canvas,x+(tw-64)/2,y+4);ctx.font='11px sans-serif';ctx.fillText(e.id,x+tw/2,y+89,tw-8);}
  await writeFile(resolve(qa,'vector-thumbnails-64.png'),c.toBuffer('image/png'));
 }
 assert.deepEqual(errors,[],'artwork must stay within its existing physical/crop box');
});
