import { dist, projectOnSegment, shoelace, type Pt } from './geometry';
import { figureAtPoint, irrigationFigures } from './irrigation-figures';
import type { CadDrawing } from './cad/types';

/** Visual size follows zoom out; pointer hit targets remain independently usable. */
export const headSymbolScale = (px: number) => Math.min(1, Math.max(0, px) / 36);
export const HEAD_SYMBOL_RADIUS=11;

/** Keep model words intact while making an inward label compact. */
export function equipmentLabel(text:string,scale:number,compact=false) {
  // Catalogue model and arc belong to separate lines, even for short model names.
  const arc=text.match(/^(.*?)\s+(\d+(?:[.,]\d+)?(?:[–—-]\d+(?:[.,]\d+)?)?°)(.*)$/);
  const nozzle=text.match(/^(.*?)\s+(\([^()]+\))$/);
  if(arc||nozzle){
    const match=arc??nozzle!;
    const lines=[match[1]!,match[2]!+(match[3]??'')];
    return {text:lines.join('\n'),width:Math.max(...lines.map(line=>line.length))*7*scale,height:24*scale};
  }
  const lines:string[]=[];
  for(const word of text.split(/\s+/)) {
    const last=lines.length-1;
    if(last>=0&&(!compact||lines[last]!.length+1+word.length<=14))lines[last]+=` ${word}`;
    else lines.push(word);
  }
  return {text:lines.join('\n'),width:Math.max(...lines.map(line=>line.length))*7.5*scale,height:lines.length*12*scale};
}

/** Screen-space label bounds, separated from the symbol and outside its boundary. */
export function headLabelPosition(point: Pt, drawing: CadDrawing, px: number, width: number, height: number, radius: number, preferInside=false) {
  const figures = irrigationFigures(drawing);
  const figure = figureAtPoint(point, figures) ?? figures.find(f => f.points.some((a,i) => dist(point,projectOnSegment(point,a,f.points[(i+1)%f.points.length]!).pt) < .03));
  const gap = radius + 4 * headSymbolScale(px);
  if (!figure) return {x:gap,y:-height/2};
  const edges = figure.points.map((a,i) => {
    const b=figure.points[(i+1)%figure.points.length]!, length=dist(a,b)||1;
    const sign=shoelace(figure.points)>=0?1:-1;
    return {distance:dist(point,projectOnSegment(point,a,b).pt),x:sign*(b.y-a.y)/length,y:-sign*(b.x-a.x)/length};
  }).sort((a,b)=>a.distance-b.distance);
  if (edges[0]!.distance <= .03) {
    const near=edges.filter(e=>e.distance<=.03);
    let x=near.reduce((n,e)=>n+e.x,0),y=near.reduce((n,e)=>n+e.y,0);
    const length=Math.hypot(x,y)||1;x/=length;y/=length;
    if(preferInside){x=-x;y=-y;}
    return {x:x*gap+(x < -.2 ? -width : x > .2 ? 0 : -width/2),y:y*gap+(y < -.2 ? -height : y > .2 ? 0 : -height/2)};
  }
  // Interior labels prefer the right, but turn inward near the boundary.
  const candidates=[{x:gap,y:-height/2},{x:-gap-width,y:-height/2},{x:-width/2,y:-gap-height},{x:-width/2,y:gap}];
  return candidates.find(p=>[[0,0],[width,0],[width,height],[0,height]].every(([x,y])=>figureAtPoint({x:point.x+(p.x+x!)/px,y:point.y+(p.y+y!)/px},[figure]))) ?? candidates[0]!;
}

type LabelInput = Pt & {id:string;width:number;height:number;radius:number;priority?:boolean};
export type LabelBox = Pt & {width:number;height:number};
export type LabelObstacles = {boxes:LabelBox[];segments:{a:Pt;b:Pt}[]};
export function segmentTouchesLabel(a:Pt,b:Pt,box:LabelBox,gap=3) {
  let low=0,high=1;
  for(const axis of ['x','y'] as const){
    const min=box[axis]-gap,max=box[axis]+(axis==='x'?box.width:box.height)+gap,delta=b[axis]-a[axis];
    if(Math.abs(delta)<1e-10){if(a[axis]<min||a[axis]>max)return false;continue;}
    const t1=(min-a[axis])/delta,t2=(max-a[axis])/delta;
    low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));if(low>high)return false;
  }
  return true;
}
export const labelBoxesOverlap = (a:LabelBox,b:LabelBox,gap=0) =>
  a.x < b.x+b.width+gap && a.x+a.width+gap > b.x && a.y < b.y+b.height+gap && a.y+a.height+gap > b.y;

/** Place labels together, in stable ID order, keeping perimeter labels outside. */
export function layoutHeadLabels(heads:LabelInput[],drawing:CadDrawing,px:number,obstacles:LabelObstacles={boxes:[],segments:[]},preferInside=false) {
  const scale=px/36;
  if(scale<=0)return new Map<string,Pt>();
  const point=(p:Pt)=>({x:p.x/scale,y:p.y/scale});
  const result=layoutHeadLabelsAtDrawingScale(heads.map(h=>({...h,width:h.width/scale,height:h.height/scale,radius:h.radius/scale})),drawing,36,{
    boxes:obstacles.boxes.map(b=>({...point(b),width:b.width/scale,height:b.height/scale})),
    segments:obstacles.segments.map(s=>({a:point(s.a),b:point(s.b)})),
  },preferInside);
  return new Map([...result].map(([id,p])=>[id,{x:p.x*scale,y:p.y*scale}]));
}

function layoutHeadLabelsAtDrawingScale(heads:LabelInput[],drawing:CadDrawing,px:number,obstacles:LabelObstacles,preferInside:boolean) {
  const result=new Map<string,Pt>(), figures=irrigationFigures(drawing), scale=headSymbolScale(px), gap=3*scale;
  const occupied:LabelBox[]=[...obstacles.boxes,...heads.map(h=>({x:h.x*px-h.radius,y:h.y*px-h.radius,width:h.radius*2,height:h.radius*2}))];
  for(const head of [...heads].sort((a,b)=>a.id.localeCompare(b.id))) {
    const base=headLabelPosition(head,drawing,px,head.width,head.height,head.radius,preferInside);
    const figure=figureAtPoint(head,figures);
    const boundary=figure && figure.points.some((a,i)=>dist(head,projectOnSegment(head,a,figure.points[(i+1)%figure.points.length]!).pt)<=.03);
    const d=head.radius+4*scale,w=head.width,h=head.height;
    // Every candidate touches the immediate neighbourhood of its own symbol.
    // Never search distant rows or silently drop a sprinkler's name.
    const candidates=[base,
      {x:d,y:-h/2},{x:-d-w,y:-h/2},{x:-w/2,y:d},{x:-w/2,y:-d-h},
      {x:d,y:0},{x:d,y:-h},{x:-d-w,y:0},{x:-d-w,y:-h},
      {x:0,y:d},{x:-w,y:d},{x:0,y:-d-h},{x:-w,y:-d-h}];
    const score=(p:Pt,index:number)=>{
      const box={x:head.x*px+p.x,y:head.y*px+p.y,width:head.width,height:head.height};
      let penalty=index*.01;
      for(const other of occupied)if(labelBoxesOverlap(box,other,gap))penalty+=100;
      for(const {a,b} of obstacles.segments)if(segmentTouchesLabel(a,b,box,gap))penalty+=20;
      if(figure) for(const u of [0,.5,1])for(const v of [0,.5,1]) {
        const inside=!!figureAtPoint({x:(box.x+u*box.width)/px,y:(box.y+v*box.height)/px},[figure]);
        if(boundary && !preferInside ? inside : !inside)penalty+=1000;
      }
      return penalty;
    };
    const chosen=candidates.map((p,i)=>({p,score:score(p,i)})).sort((a,b)=>a.score-b.score)[0]!.p;
    result.set(head.id,chosen);
    occupied.push({x:head.x*px+chosen.x,y:head.y*px+chosen.y,width:w,height:h});
  }
  return result;
}
