import type {Pt} from "@/lib/geometry";

export function dimensionLabelLayout(a:Pt,b:Pt,offset:number,scale=1) {
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
  let angle=Math.atan2(dy,dx)*180/Math.PI;
  if(angle>90 || angle< -90) angle+=180;
  const side=offset<0 ? -1:1;
  return {x:(a.x+b.x)/2-dy/length*side*18*scale,y:(a.y+b.y)/2+dx/length*side*18*scale,angle};
}

/** Screen-space geometry reserved for both the text and all three dimension lines. */
export function dimensionObstacles(a:Pt,b:Pt,offset:number,px:number,label:string) {
  const length=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
  const start={x:a.x*px,y:a.y*px},end={x:b.x*px,y:b.y*px};
  const a2={x:(a.x+nx*offset)*px,y:(a.y+ny*offset)*px},b2={x:(b.x+nx*offset)*px,y:(b.y+ny*offset)*px};
  const text=dimensionLabelLayout(a2,b2,offset),angle=text.angle*Math.PI/180,w=Math.max(96,label.length*9),h=18;
  const width=Math.abs(Math.cos(angle))*w+Math.abs(Math.sin(angle))*h;
  const height=Math.abs(Math.sin(angle))*w+Math.abs(Math.cos(angle))*h;
  return {box:{x:text.x-width/2,y:text.y-height/2,width,height},segments:[{a:start,b:a2},{a:a2,b:b2},{a:b2,b:end}]};
}
