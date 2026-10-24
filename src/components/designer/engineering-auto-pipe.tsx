import type {HydraulicEdge} from '@/lib/engineering-hydraulics';
import {pipeStrokeWidth,pipeOutlineWidth,pipeDisplayScale,pipeTransitions} from '@/lib/engineering-pipe-display';
import {formatNumber} from '@/lib/i18n';
import {fromMmPipe,pipeLabel,type UnitPrefs} from '@/lib/units';
export function AutoPipeDrawing({edges,px,selected,color,units,label}:{edges:HydraulicEdge[];px:number;selected:boolean;color:string;units:UnitPrefs;label:boolean}){
 let prior:number|null|undefined;
 const detailScale=pipeDisplayScale(px);
 const diameter=(d:number)=>`Ø${formatNumber(fromMmPipe(d,units.pipe),units.pipe==='mm'?0:2)}`;
 return <>{edges.map(e=>{const width=pipeStrokeWidth(e.diameter,!!e.branch,px),show=label&&!e.branch&&e.length*px>45&&e.diameter!==prior;if(show)prior=e.diameter;
  return <g key={e.id} data-pipe-branch={!!e.branch}>
   <path d={`M${e.a.x} ${e.a.y}L${e.b.x} ${e.b.y}`} stroke="transparent" strokeWidth={22/px} fill="none"/>
   <path d={`M${e.a.x} ${e.a.y}L${e.b.x} ${e.b.y}`} stroke={selected?'#e8892f':'white'} strokeWidth={pipeOutlineWidth(e.diameter,!!e.branch,px)/px} fill="none" strokeLinecap="round" pointerEvents="none"/>
   <path d={`M${e.a.x} ${e.a.y}L${e.b.x} ${e.b.y}`} stroke={e.diameter?color:'#d45b3d'} strokeWidth={width/px} fill="none" strokeLinecap="round" pointerEvents="none"/>
   {show&&<text className="engineering-label" x={(e.a.x+e.b.x)/2} y={(e.a.y+e.b.y)/2-9/px} fontSize={11/px} textAnchor="middle" pointerEvents="none">{e.diameter?`${diameter(e.diameter)} ${pipeLabel(units.pipe)}`:'—'}</text>}
  </g>;
 })}{pipeTransitions(edges).map(n=><g key={n.id} data-pipe-transition pointerEvents="none">
  <circle cx={n.point.x} cy={n.point.y} r={3.5*detailScale/px} fill="white" stroke={color} strokeWidth={1.5*detailScale/px}/>
  {label&&<text className="engineering-label" x={n.point.x+7/px} y={n.point.y+17/px} fontSize={11/px}>{n.diameters.map(diameter).join(' / ')} {pipeLabel(units.pipe)}</text>}
 </g>)}</>;
}
