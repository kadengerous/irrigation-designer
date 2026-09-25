import type {Pt} from '../geometry';
import type {CadDrawing} from './types';
import {resolveDim} from './engine';
import {displayedDimensions} from './sprinkler-dimensions';
import {dimensionObstacles,dimensionLabelLayout} from './dimension-label-layout';
import {labelBoxesOverlap,segmentTouchesLabel,type LabelBox} from '../head-presentation';

export function dimensionTextBox(text:Pt&{angle:number},label:string):LabelBox {
  const angle=text.angle*Math.PI/180,w=Math.max(24,label.length*8+8),h=20;
  const width=Math.abs(Math.cos(angle))*w+Math.abs(Math.sin(angle))*h;
  const height=Math.abs(Math.sin(angle))*w+Math.abs(Math.cos(angle))*h;
  return {x:text.x-width/2,y:text.y-height/2,width,height};
}
/** Test the rotated text itself, not its much larger diagonal bounding box. */
export function segmentTouchesDimensionText(a:Pt,b:Pt,text:Pt&{angle:number},label:string,scale=1) {
  const angle=text.angle*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const local=(p:Pt)=>({x:(p.x-text.x)*c+(p.y-text.y)*s,y:-(p.x-text.x)*s+(p.y-text.y)*c});
  const width=Math.max(24,label.length*8+8)*scale,height=20*scale;
  return segmentTouchesLabel(local(a),local(b),{x:-width/2,y:-height/2,width,height},scale);
}
/** A shared screen layout for rendering, selecting, editing and equipment labels. */
export function layoutDimensions(d:CadDrawing,px:number,mode:'plan'|'irrigation'|undefined,label:(length:number)=>string,preview?:{id:string;offset:number}|null) {
  // Solve at a fixed drawing scale; camera zoom must not reflow annotations.
  const scale=px/36;
  px=36;
  const rows=displayedDimensions(d,mode).map(dim=>{
    const {a,b}=resolveDim(d,dim),offset=preview?.id===dim.id?preview.offset:dim.offset;
    const value=dim.label??label(Math.hypot(b.x-a.x,b.y-a.y));
    const geometry=dimensionObstacles(a,b,offset,px,value),line=geometry.segments[1]!;
    const text=dimensionLabelLayout(line.a,line.b,offset);
    return {id:dim.id,a,b,offset,label:value,text,box:dimensionTextBox(text,value),segments:geometry.segments};
  });
  const occupied:LabelBox[]=[],segments=rows.flatMap(r=>r.segments);
  // Short sides have the fewest usable positions, so place their numbers first.
  for(const row of [...rows].sort((a,b)=>Math.hypot(a.b.x-a.a.x,a.b.y-a.a.y)-Math.hypot(b.b.x-b.a.x,b.b.y-b.a.y)||a.id.localeCompare(b.id))) {
    const line=row.segments[1]!,dx=line.b.x-line.a.x,dy=line.b.y-line.a.y,len=Math.hypot(dx,dy)||1,sign=row.offset<0?-1:1;
    let bestScore=Infinity;
    // Slide along this line or use its other side, never move the number to
    // remote collision-avoidance lanes where its dimension becomes ambiguous.
    for(const normal of [14,-14,20,-20])for(const fraction of [.5,.35,.65,.2,.8]){
      const text={x:line.a.x+dx*fraction-dy/len*sign*normal,y:line.a.y+dy*fraction+dx/len*sign*normal,angle:row.text.angle};
      const box=dimensionTextBox(text,row.label);
      const score=occupied.filter(b=>labelBoxesOverlap(box,b,3)).length*1000+
        segments.filter(s=>segmentTouchesDimensionText(s.a,s.b,text,row.label)).length*100+
        Math.abs(normal)-14+(normal<0?2:0)+Math.abs(fraction-.5)*10;
      if(score>=bestScore)continue;
      bestScore=score;row.text=text;row.box=box;
    }
    occupied.push(row.box);
  }
  const point=(p:Pt)=>({x:p.x*scale,y:p.y*scale});
  return new Map(rows.map(row=>[row.id,{...row,
    text:{...point(row.text),angle:row.text.angle},
    box:{...point(row.box),width:row.box.width*scale,height:row.box.height*scale},
    segments:row.segments.map(s=>({a:point(s.a),b:point(s.b)})),
  }]));
}
