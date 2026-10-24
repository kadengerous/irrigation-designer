import {catalogForHead,type CatalogItem} from './equipment-catalog';
import type {Head,Pt} from './project-types';
/** SQ radius denotes offset to a side, not distance to a square corner. */
export function squareFootprint(item:CatalogItem,r:number):Pt[]{
 const f=item.squarePatternFraction;
 const coordinates=f===.25?[[0,0],[r,0],[r,r],[0,r]]:f===.5?[[-r,0],[r,0],[r,r],[-r,r]]:
  f===.75?[[0,0],[r,0],[r,r],[-r,r],[-r,-r],[0,-r]]:[[-r,-r],[r,-r],[r,r],[-r,r]];
 return coordinates.map(([x,y])=>({x:x!,y:y!}));
}
export function specialFootprint(head:Head):Pt[]|null{
 const item=catalogForHead(head);
 if(item?.coverageKind!=='square')return null;
 const a=head.start*Math.PI/180;
 return squareFootprint(item,head.r).map(p=>({x:p.x*Math.cos(a)-p.y*Math.sin(a),y:p.x*Math.sin(a)+p.y*Math.cos(a)}));
}
