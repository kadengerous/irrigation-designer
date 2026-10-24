import type { Pt } from "@/lib/geometry";

export type Corner = { point: Pt; incoming: Pt; outgoing: Pt; turn: number; factor: number; direction: Pt; centerFactor: number };
export type ContourPart = { a: Pt; b: Pt; bulge: number; center?: Pt; radius?: number; start?: number; sweep?: number };
const EPS = 1e-8;
const length = (a: Pt, b: Pt) => Math.hypot(a.x-b.x,a.y-b.y);
const cross = (a: Pt,b: Pt) => a.x*b.y-a.y*b.x;
const sub = (a: Pt,b: Pt) => ({x:a.x-b.x,y:a.y-b.y});
const dot = (a: Pt,b: Pt) => a.x*b.x+a.y*b.y;
const at = (a: Pt,v: Pt,t: number) => ({x:a.x+v.x*t,y:a.y+v.y*t});

export function roundingCorners(points: Pt[]): (Corner | null)[] {
  return points.map((point,i) => {
    const prev=points[(i+points.length-1)%points.length]!,next=points[(i+1)%points.length]!;
    const l=length(prev,point),r=length(point,next);
    if(l<EPS || r<EPS) return null;
    const incoming={x:(point.x-prev.x)/l,y:(point.y-prev.y)/l},outgoing={x:(next.x-point.x)/r,y:(next.y-point.y)/r};
    const turn=Math.atan2(cross(incoming,outgoing),dot(incoming,outgoing));
    if(Math.abs(turn)<1e-6 || Math.PI-Math.abs(turn)<1e-6) return null;
    const direction=sub(outgoing,incoming),n=Math.hypot(direction.x,direction.y);
    return {point,incoming,outgoing,turn,factor:Math.tan(Math.abs(turn)/2),
      direction:{x:direction.x/n,y:direction.y/n},centerFactor:1/Math.cos(turn/2)};
  });
}

export function roundedCorner(corner: Corner, radius: number): ContourPart {
  const t=radius*corner.factor,a=at(corner.point,corner.incoming,-t),b=at(corner.point,corner.outgoing,t);
  if(radius<EPS) return {a:corner.point,b:corner.point,bulge:0};
  const center=at(a,{x:-corner.incoming.y,y:corner.incoming.x},Math.sign(corner.turn)*radius);
  return {a,b,bulge:Math.tan(corner.turn/4),center,radius,start:Math.atan2(a.y-center.y,a.x-center.x),sweep:corner.turn};
}

export function roundedContour(points: Pt[], radii: number[]): ContourPart[] {
  const corners=roundingCorners(points),arcs=corners.map((corner,i)=>corner?roundedCorner(corner,radii[i]??0):{a:points[i]!,b:points[i]!,bulge:0});
  return arcs.flatMap((arc,i)=>[...(arc.radius ? [arc] : []),{a:arc.b,b:arcs[(i+1)%arcs.length]!.a,bulge:0}]);
}

export function roundedBounds(points: Pt[], radii: number[]) {
  const samples:Pt[]=[];
  for(const part of roundedContour(points,radii)) {
    samples.push(part.a,part.b);
    if(part.center)for(let i=0;i<4;i++) {
      const angle=i*Math.PI/2,p={x:part.center.x+part.radius!*Math.cos(angle),y:part.center.y+part.radius!*Math.sin(angle)};
      if(onPart(p,part))samples.push(p);
    }
  }
  const minX=Math.min(...samples.map(p=>p.x)),minY=Math.min(...samples.map(p=>p.y)),maxX=Math.max(...samples.map(p=>p.x)),maxY=Math.max(...samples.map(p=>p.y));
  return {minX,minY,maxX,maxY,width:maxX-minX,height:maxY-minY};
}

function onPart(p: Pt, part: ContourPart) {
  if(!part.center) {
    const v=sub(part.b,part.a),q=sub(p,part.a),l=Math.hypot(v.x,v.y);
    return Math.abs(cross(v,q))<=EPS*Math.max(1,l) && dot(q,v)>=-EPS && dot(q,v)<=dot(v,v)+EPS;
  }
  const angle=Math.atan2(p.y-part.center.y,p.x-part.center.x),tau=2*Math.PI;
  const delta=part.sweep!>0 ? (angle-part.start!+tau)%tau : (part.start!-angle+tau)%tau;
  return delta<=Math.abs(part.sweep!)+EPS || tau-delta<EPS;
}

/** Analytic line/arc intersections: a large radius must not jump through a narrow neck. */
function intersections(a: ContourPart,b: ContourPart): Pt[] {
  if(!a.center && !b.center) {
    const u=sub(a.b,a.a),v=sub(b.b,b.a),q=sub(b.a,a.a),den=cross(u,v);
    if(Math.abs(den)<EPS) return [a.a,a.b,b.a,b.b].filter(p=>onPart(p,a)&&onPart(p,b));
    const t=cross(q,v)/den,s=cross(q,u)/den;
    return t>=-EPS && t<=1+EPS && s>=-EPS && s<=1+EPS ? [at(a.a,u,t)] : [];
  }
  if(a.center && !b.center) return intersections(b,a);
  if(!a.center && b.center) {
    const v=sub(a.b,a.a),q=sub(a.a,b.center),A=dot(v,v),B=2*dot(v,q),C=dot(q,q)-b.radius!**2;
    if(A<EPS*EPS) return [];
    const disc=B*B-4*A*C;
    if(disc<-EPS) return [];
    return [(-B-Math.sqrt(Math.max(0,disc)))/(2*A),(-B+Math.sqrt(Math.max(0,disc)))/(2*A)]
      .filter(t=>t>=-EPS&&t<=1+EPS).map(t=>at(a.a,v,t)).filter(p=>onPart(p,b));
  }
  const u=sub(b.center!,a.center!),d=Math.hypot(u.x,u.y),r=a.radius!,s=b.radius!;
  if(d<EPS) return Math.abs(r-s)<EPS ? [a.a,a.b,b.a,b.b].filter(p=>onPart(p,a)&&onPart(p,b)) : [];
  if(d>r+s+EPS || d<Math.abs(r-s)-EPS) return [];
  const x=(r*r-s*s+d*d)/(2*d),h=Math.sqrt(Math.max(0,r*r-x*x)),p=at(a.center!,u,x/d);
  return [{x:p.x-u.y*h/d,y:p.y+u.x*h/d},{x:p.x+u.y*h/d,y:p.y-u.x*h/d}].filter(q=>onPart(q,a)&&onPart(q,b));
}

/** Horizontal ray crossings, splitting arcs at their vertical extrema. */
function insideContour(point:Pt,parts:ContourPart[]) {
  let inside=false;
  for(const part of parts) {
    if(!part.center) {
      if((part.a.y>point.y)!==(part.b.y>point.y) && point.x<part.a.x+(point.y-part.a.y)*(part.b.x-part.a.x)/(part.b.y-part.a.y))inside=!inside;
      continue;
    }
    const start=part.start!,end=start+part.sweep!,low=Math.min(start,end),high=Math.max(start,end),angles=[low,high];
    for(let k=Math.ceil((low-Math.PI/2)/Math.PI);Math.PI/2+k*Math.PI<high;k++) {
      const angle=Math.PI/2+k*Math.PI;if(angle>low)angles.push(angle);
    }
    angles.sort((a,b)=>a-b);
    for(let i=1;i<angles.length;i++) {
      const a=angles[i-1]!,b=angles[i]!,ya=part.center.y+part.radius!*Math.sin(a),yb=part.center.y+part.radius!*Math.sin(b);
      if((ya>point.y)===(yb>point.y))continue;
      const dx=Math.sqrt(Math.max(0,part.radius!**2-(point.y-part.center.y)**2));
      if(point.x<part.center.x+Math.sign(Math.cos((a+b)/2))*dx)inside=!inside;
    }
  }
  return inside;
}

export function validRoundedContour(points: Pt[], radii: number[], obstacles: ContourPart[] = []): boolean {
  if(points.length<3 || points.some(p=>!Number.isFinite(p.x+p.y)) || radii.some(r=>!Number.isFinite(r)||r<0)) return false;
  const corners=roundingCorners(points);
  for(let i=0;i<points.length;i++) {
    const j=(i+1)%points.length,l=length(points[i]!,points[j]!);
    const used=(corners[i]?.factor??0)*(radii[i]??0)+(corners[j]?.factor??0)*(radii[j]??0);
    if(l<EPS || used>l-Math.min(1e-6,l*1e-7)+EPS) return false;
  }
  const parts=roundedContour(points,radii);
  for(let i=0;i<parts.length;i++) {
    const a=parts[i]!;
    for(let j=i+1;j<parts.length;j++) {
      const b=parts[j]!;
      const shared=j===i+1 ? a.b : i===0&&j===parts.length-1 ? a.a : null;
      if(intersections(a,b).some(p=>!shared||length(p,shared)>1e-6)) return false;
    }
    for(const b of obstacles) if(intersections(a,b).length) return false;
  }
  // An arc can pass completely beyond a small hole without intersecting it at
  // the final radius. Every hole must still lie inside the new outer boundary.
  if(obstacles.some(part=>!insideContour(part.a,parts)))return false;
  return true;
}

/** Common maximum for exactly the selected corners, leaving other radii unchanged. */
export function maximumCornerRadius(points: Pt[], radii: number[], selected: number[], obstacles: ContourPart[] = []): number {
  const corners=roundingCorners(points),chosen=new Set(selected.filter(i=>corners[i]));
  if(!chosen.size) return 0;
  let upper=Infinity;
  for(let i=0;i<points.length;i++) {
    const j=(i+1)%points.length,fi=corners[i]?.factor??0,fj=corners[j]?.factor??0;
    const factor=(chosen.has(i)?fi:0)+(chosen.has(j)?fj:0);
    if(factor<=EPS) continue;
    const l=length(points[i]!,points[j]!);
    upper=Math.min(upper,(l-Math.min(1e-6,l*1e-7)-(chosen.has(i)?0:fi*(radii[i]??0))-(chosen.has(j)?0:fj*(radii[j]??0)))/factor);
  }
  if(!Number.isFinite(upper)||upper<=0) return 0;
  const candidate=(r:number)=>points.map((_,i)=>chosen.has(i)?r:radii[i]??0);
  if(validRoundedContour(points,candidate(upper),obstacles)) return upper;
  let low=0,high=upper;
  for(let i=0;i<42;i++) { const mid=(low+high)/2; if(validRoundedContour(points,candidate(mid),obstacles)) low=mid; else high=mid; }
  return low;
}

/** Resizing preserves metres. Only geometrically impossible radii are reduced. */
export function fitCornerRadii(points: Pt[], radii: number[], obstacles: ContourPart[] = []): number[] | null {
  const corners=roundingCorners(points),wanted=points.map((_,i)=>corners[i]?Math.max(0,radii[i]??0):0);
  if(validRoundedContour(points,wanted,obstacles)) return wanted;
  if(!validRoundedContour(points,points.map(()=>0),obstacles)) return null;
  // Shortened sides constrain only the two touching corners, preserving the rest.
  const differentRadii=new Set(radii).size>1;
  for(let i=0;differentRadii && i<points.length;i++) {
    const j=(i+1)%points.length,l=length(points[i]!,points[j]!);
    const used=(corners[i]?.factor??0)*wanted[i]!+(corners[j]?.factor??0)*wanted[j]!;
    const available=l-Math.min(1e-6,l*1e-7);
    if(used>available){const k=available/used;wanted[i]!*=k;wanted[j]!*=k;}
  }
  if(validRoundedContour(points,wanted,obstacles))return wanted;
  let low=0,high=1;
  for(let i=0;i<42;i++) {const mid=(low+high)/2;if(validRoundedContour(points,wanted.map(r=>r*mid),obstacles))low=mid;else high=mid;}
  return wanted.map(r=>r*low);
}
