import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
const inputs=JSON.parse(await readFile(process.argv[2],'utf8'));
const out=resolve('public/engineering/assembly');await mkdir(out,{recursive:true});
for(const[id,path]of inputs){
 const img=await loadImage(path),source=createCanvas(img.width,img.height),ctx=source.getContext('2d');ctx.drawImage(img,0,0);const {data}=ctx.getImageData(0,0,img.width,img.height);
 let left=img.width,top=img.height,right=0,bottom=0,transparent=0;
 for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){const alpha=data[(y*img.width+x)*4+3];if(alpha===0)transparent++;if(alpha>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
 if(!transparent)throw new Error(id+': image has no transparent pixels');
 const width=right-left+1,height=bottom-top+1,size=512,padding=18,ratio=Math.min((size-padding*2)/width,(size-padding*2)/height),w=width*ratio,h=height*ratio;
 const canvas=createCanvas(Math.ceil(w+padding*2),Math.ceil(h+padding*2));canvas.getContext('2d').drawImage(img,left,top,width,height,padding,padding,w,h);
 const buffer=canvas.toBuffer('image/webp',84);await writeFile(resolve(out,id+'.webp'),buffer);console.log(JSON.stringify({id,bytes:buffer.length,transparent:Math.round(transparent/data.length*400)+'%'}));
}
