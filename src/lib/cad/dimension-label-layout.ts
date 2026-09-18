import type {Pt} from "@/lib/geometry";

export function dimensionLabelLayout(a:Pt,b:Pt,offset:number) {
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
  let angle=Math.atan2(dy,dx)*180/Math.PI;
  if(angle>90 || angle< -90) angle+=180;
  const side=offset<0 ? -1:1;
  return {x:(a.x+b.x)/2-dy/length*side*18,y:(a.y+b.y)/2+dx/length*side*18,angle};
}
