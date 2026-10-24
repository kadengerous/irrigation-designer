/** Lawn materials are prepared at one fixed resolution, with an explicit world period. */
export const LAWN_PATTERN_PIXELS = 1024;
export function lawnPeriodMeters(fill:string) {
  return fill==='texture:lawn-striped'?4:fill==='texture:lawn-meadow'?1.5:1;
}
export function isLawnTexture(fill:string) {return fill==='texture:lawn'||fill.startsWith('texture:lawn-');}

/** Match local colour and contrast after the edge overlaps are blended.
 * Ordinary crossfades lose contrast in their centres, creating a grid of tufts.
 * Periodic neighbourhoods keep both the repeat edges and the interior uniform.
 * This is render-time material shading; catalog artwork stays untouched. */
export function evenLawnLighting(source:Uint8ClampedArray,width:number,height:number) {
  const radius=Math.max(4,Math.round(Math.min(width,height)*.035));
  const w=width+radius*2,h=height+radius*2,stride=w+1;
  const sums=Array.from({length:4},()=>new Float64Array(stride*(h+1)));
  const mean=[0,0,0];let square=0;
  for(let i=0;i<source.length;i+=4){
    for(let c=0;c<3;c++)mean[c]+=source[i+c];
    const l=(source[i]+2*source[i+1]+source[i+2])/4;square+=l*l;
  }
  for(let c=0;c<3;c++)mean[c]/=width*height;
  const luminance=(mean[0]+2*mean[1]+mean[2])/4;
  const contrast=Math.sqrt(Math.max(0,square/(width*height)-luminance*luminance));
  for(let y=0;y<h;y++){
    const row=[0,0,0,0],yy=((y-radius)%height+height)%height;
    for(let x=0;x<w;x++){
      const xx=((x-radius)%width+width)%width,i=(yy*width+xx)*4;
      const l=(source[i]+2*source[i+1]+source[i+2])/4;
      for(let c=0;c<4;c++){
        row[c]+=c===3?l*l:source[i+c];
        sums[c][(y+1)*stride+x+1]=sums[c][y*stride+x+1]+row[c];
      }
    }
  }
  const result=source.slice(),area=(radius*2+1)**2;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const x1=x+radius*2+1,y1=y+radius*2+1,local=[0,0,0,0];
    for(let c=0;c<4;c++){
      const s=sums[c];local[c]=(s[y1*stride+x1]-s[y*stride+x1]-s[y1*stride+x]+s[y*stride+x])/area;
    }
    const l=(local[0]+2*local[1]+local[2])/4;
    const gain=Math.max(.33,Math.min(3,contrast/Math.sqrt(Math.max(1,local[3]-l*l))));
    const i=(y*width+x)*4;
    for(let c=0;c<3;c++)result[i+c]=mean[c]+(source[i+c]-local[c])*gain;
  }
  return result;
}
