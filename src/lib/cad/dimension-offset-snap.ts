import {resolveDim} from "./engine";
import type {CadDrawing} from "./types";

/** Move only along this dimension's normal; snap its arrow tips to other tips. */
export function snapDimensionOffset(d:CadDrawing,id:string,offset:number,px:number):number {
  const dim=d.dims?.[id];
  if(!dim || d.layers?.dims?.visible===false) return offset;
  const {a,b}=resolveDim(d,dim),length=Math.hypot(b.x-a.x,b.y-a.y);
  if(length<1e-9) return offset;
  const ux=(b.x-a.x)/length,uy=(b.y-a.y)/length,nx=-uy,ny=ux;
  let result=offset,best=12/Math.max(px,1);
  for(const other of Object.values(d.dims ?? {})) {
    if(other.id===id) continue;
    const ends=resolveDim(d,other),len=Math.hypot(ends.b.x-ends.a.x,ends.b.y-ends.a.y);
    if(len<1e-9) continue;
    const ox=-(ends.b.y-ends.a.y)/len*other.offset,oy=(ends.b.x-ends.a.x)/len*other.offset;
    for(const source of [a,b]) for(const end of [ends.a,ends.b]) {
      const dx=end.x+ox-source.x,dy=end.y+oy-source.y;
      if(Math.abs(dx*ux+dy*uy)*px>0.5) continue;
      const candidate=dx*nx+dy*ny,distance=Math.abs(candidate-offset);
      if(distance<=best) {best=distance;result=candidate;}
    }
  }
  return result;
}
