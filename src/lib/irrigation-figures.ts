import { ellipseWorldPts, faceHoles, facePoints } from './cad/engine';
import { layerPurpose, type CadDrawing } from './cad/types';
import { dist, pointInPoly, polygonArea, projectOnSegment, type Pt } from './geometry';

export type IrrigationFigure = { id: string; points: Pt[]; holes: Pt[][]; ellipse?:{cx:number;cy:number;rx:number;ry:number;rot?:number} };
const cache = new WeakMap<CadDrawing, IrrigationFigure[]>();
const contourCache = new WeakMap<CadDrawing, IrrigationFigure[]>();
/** Figure identity is independent of its layer, translated name and list position. */
export function closedDrawingFigures(d: CadDrawing): IrrigationFigure[] {
  const cached = contourCache.get(d); if (cached) return cached;
  const result = Object.values(d.faces).filter(f => !f.segment && !(f.spline && !f.spline.closed) &&
    !(f.freehand && !f.freehand.closed))
    .map(f => {
      const ellipse=f.ellipse??(f.circle?{cx:f.circle.cx,cy:f.circle.cy,rx:f.circle.r,ry:f.circle.r}:undefined);
      return { id:f.id,ellipse,points:ellipse?ellipseWorldPts(ellipse.cx,ellipse.cy,ellipse.rx,ellipse.ry,ellipse.rot??0,720):facePoints(d,f.id),holes:faceHoles(d,f.id) };
    })
    .filter(f => f.points.length >= 3).sort((a,b) => polygonArea(a.points)-polygonArea(b.points) || a.id.localeCompare(b.id));
  contourCache.set(d,result); return result;
}
export function irrigationFigures(d: CadDrawing): IrrigationFigure[] {
  const cached = cache.get(d); if (cached) return cached;
  const result=closedDrawingFigures(d).filter(figure=>{
    const face=d.faces[figure.id]!;
    return layerPurpose(face)!=='none' && (face.type!=='site'||face.hydro?.purpose==='irrigation');
  });
  cache.set(d,result);return result;
}
export function onContour(p: Pt, points: Pt[], tolerance = 1e-5): boolean {
  return points.some((a,i) => dist(p,projectOnSegment(p,a,points[(i+1)%points.length]!).pt) <= tolerance);
}
export function figureAtPoint(p: Pt, figures: IrrigationFigure[]): IrrigationFigure | undefined {
  return figures.find(f => (f.ellipse ? ellipseDistance(p,f.ellipse)<=1+1e-7 : onContour(p,f.points) || pointInPoly(p,f.points)) &&
    !f.holes.some(h => pointInPoly(p,h) && !onContour(p,h)));
}
function ellipseDistance(p:Pt,e:NonNullable<IrrigationFigure['ellipse']>) {
  const a=(e.rot??0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=p.x-e.cx,y=p.y-e.cy;
  return ((x*c+y*s)/e.rx)**2+((-x*s+y*c)/e.ry)**2;
}
export function onFigureBoundary(p:Pt,f:IrrigationFigure) {
  return (f.ellipse ? Math.abs(ellipseDistance(p,f.ellipse)-1)<1e-7 : onContour(p,f.points)) || f.holes.some(h=>onContour(p,h));
}
/** Axis-aligned rays intersect the actual ellipse, not its bounding box or tessellation. */
export function figureAxisIntersections(p:Pt,f:IrrigationFigure,axis:'x'|'y'):Pt[] {
  const result:Pt[]=[], other=axis==='x'?'y':'x';
  if(f.ellipse){
    const e=f.ellipse,a=(e.rot??0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=p.x-e.cx,y=p.y-e.cy;
    const u=x*c+y*s,v=-x*s+y*c,du=axis==='x'?c:s,dv=axis==='x'?-s:c;
    const A=(du/e.rx)**2+(dv/e.ry)**2,B=2*(u*du/e.rx**2+v*dv/e.ry**2),C=(u/e.rx)**2+(v/e.ry)**2-1;
    const determinant=B*B-4*A*C;
    if(determinant>=0)for(const sign of [-1,1])result.push({...p,[axis]:p[axis]+(-B+sign*Math.sqrt(determinant))/(2*A)});
  }
  for(const points of [...(f.ellipse?[]:[f.points]),...f.holes])points.forEach((a,i)=>{
    const b=points[(i+1)%points.length]!,delta=b[other]-a[other];if(Math.abs(delta)<1e-10)return;
    const t=(p[other]-a[other])/delta;if(t>=0&&t<=1)result.push({...p,[axis]:a[axis]+t*(b[axis]-a[axis])});
  });
  return result;
}
