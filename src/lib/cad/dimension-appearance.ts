import {closestOnSegment,pointInPoly,type Pt} from '../geometry';
import {facePoints,faceHoles} from './engine';
import type {CadDrawing} from './types';

const scaleCache=new WeakMap<CadDrawing,(a:Pt,b:Pt)=>number>();
export const DIMENSION_SCALE_MAX=1.17;
const DIMENSION_SCALE_MIN=.45;
/** Text is tuned independently of arrowheads and the figure's geometry. */
export const dimensionTextScale=(scale:number)=>scale*.7225;
/** A figure-sized annotation, independent of camera zoom, units and UI scale. */
export function dimensionScaleResolver(d:CadDrawing) {
  const cached=scaleCache.get(d);if(cached)return cached;
  const span=(points:Pt[])=>{
    // Farthest-point sweeps stay linear even for detailed imported outlines.
    // Distances, unlike a screen-aligned bounding box, survive rotation.
    let origin=points[0],size=0;if(!origin)return 0;
    for(let pass=0;pass<2;pass++){
      let farthest=origin;size=0;
      for(const point of points){const distance=Math.hypot(point.x-origin.x,point.y-origin.y);if(distance>=8)return 8;if(distance>size){size=distance;farthest=point;}}
      origin=farthest;
    }
    return size;
  };
  // Open line chains also need one consistent size before Create Figure is pressed.
  const segments=Object.values(d.edges).flatMap<{a:Pt;b:Pt}>(e=>{
    const a=d.vertices[e.a],b=d.vertices[e.b];return a&&b?[{a,b}]:[];
  });
  const parent=new Map<string,string>(),points=new Map<string,Pt>();
  const key=(p:Pt)=>`${Math.round(p.x*1e6)}:${Math.round(p.y*1e6)}`;
  const find=(id:string):string=>{let root=id;while(parent.get(root)!==root)root=parent.get(root)!;while(id!==root){const next=parent.get(id)!;parent.set(id,root);id=next;}return root;};
  for(const {a,b} of segments){
    for(const p of [a,b]){const id=key(p);if(!parent.has(id)){parent.set(id,id);points.set(id,p);}}
    parent.set(find(key(a)),find(key(b)));
  }
  const groups=new Map<string,{points:Pt[];segments:{a:Pt;b:Pt}[]}>();
  for(const [id,p] of points){const root=find(id);if(!groups.has(root))groups.set(root,{points:[],segments:[]});groups.get(root)!.points.push(p);}
  for(const segment of segments)groups.get(find(key(segment.a)))!.segments.push(segment);
  const components=[...groups.values()].map(group=>({...group,size:span(group.points)})).sort((a,b)=>a.size-b.size);
  const onSegment=(p:Pt,a:Pt,b:Pt)=>{const q=closestOnSegment(p,a,b);return Math.hypot(q.x-p.x,q.y-p.y)<1e-6;};
  const contours=Object.values(d.faces).filter(f=>!f.hidden).flatMap(f=>[facePoints(d,f.id),...faceHoles(d,f.id)])
    .filter(points=>points.length>1).map(points=>({points,size:span(points)})).sort((a,b)=>a.size-b.size);
  const contains=(points:Pt[],p:Pt)=>pointInPoly(p,points)||points.some((a,i)=>{
    const q=closestOnSegment(p,a,points[(i+1)%points.length]!);
    return Math.hypot(q.x-p.x,q.y-p.y)<1e-6;
  });
  const resolve=(a:Pt,b:Pt)=>{
    const contour=contours.find(c=>contains(c.points,a)&&contains(c.points,b));
    const component=contour?undefined:components.find(c=>[a,b].every(p=>c.segments.some(s=>onSegment(p,s.a,s.b))));
    const startComponent=contour||component?undefined:components.find(c=>c.segments.some(s=>onSegment(a,s.a,s.b)||onSegment(b,s.a,s.b)));
    const size=contour?.size??component?.size??(startComponent?span([...startComponent.points,a,b]):Math.hypot(b.x-a.x,b.y-a.y));
    // Keep isolated short measurements visible while sizing text to its figure.
    return Math.max(DIMENSION_SCALE_MIN,Math.min(1,size/8)*DIMENSION_SCALE_MAX);
  };
  scaleCache.set(d,resolve);return resolve;
}

/** Use outside arrows when a short measured span cannot contain both heads. */
export function dimensionEndMarkers(a:Pt,b:Pt,scale=1) {
  const length=Math.hypot(b.x-a.x,b.y-a.y)||1,ux=(b.x-a.x)/length,uy=(b.y-a.y)/length,nx=-uy,ny=ux;
  const tick=7*scale,head=4.48*scale,halfWidth=1.472*scale,outside=length<head*2.5;
  return {outside,markers:[a,b].map((p,i)=>{
    const direction=(i?-1:1)*(outside?-1:1);
    return {tick:[p.x-nx*tick,p.y-ny*tick,p.x+nx*tick,p.y+ny*tick],
      arrow:[p.x,p.y,p.x+direction*ux*head+nx*halfWidth,p.y+direction*uy*head+ny*halfWidth,p.x+direction*ux*head-nx*halfWidth,p.y+direction*uy*head-ny*halfWidth],
      extension:outside?[p.x,p.y,p.x+direction*ux*head*1.7,p.y+direction*uy*head*1.7]:null};
  })};
}
