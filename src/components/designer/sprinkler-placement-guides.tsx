import { useEffect } from 'react';
import { Group, Line } from 'react-konva';
import { useProject } from '@/lib/project-store';
import { visibleProjectHeads } from '@/lib/head-visibility';
import { drawingOrMigrate } from '@/lib/cad/engine';
import { itemById } from '@/lib/hunter-catalog';
import { snapSprinklerPoint, sprinklerAlignmentGuides } from '@/lib/head-snapping';
import type { Pt } from '@/lib/geometry';

export function SprinklerGuides({ point, px, panX, panY, excludeHead }: {point:Pt;px:number;panX:number;panY:number;excludeHead?:string}) {
  const project = useProject(s=>s.project), snapOn=useProject(s=>s.snapOn);
  const x=(v:number)=>v*px+panX, y=(v:number)=>v*px+panY;
  const guides=snapOn ? sprinklerAlignmentGuides(point,visibleProjectHeads(project),px,excludeHead,drawingOrMigrate(project)) : [];
  return <Group listening={false}>
    {guides.map(g=><Line key={g.axis} points={[x(g.target.x),y(g.target.y),x(g.point.x),y(g.point.y)]} stroke={g.exact?'#12a647':'#ed4242'} strokeWidth={1.25} dash={[6,5]}/>)}
    <Group x={x(point.x)} y={y(point.y)}>
      <Line points={[-11,0,-3,0]} stroke="#fff" strokeWidth={3}/><Line points={[3,0,11,0]} stroke="#fff" strokeWidth={3}/>
      <Line points={[0,-11,0,-3]} stroke="#fff" strokeWidth={3}/><Line points={[0,3,0,11]} stroke="#fff" strokeWidth={3}/>
      <Line points={[-11,0,-3,0]} stroke="#244137" strokeWidth={1}/><Line points={[3,0,11,0]} stroke="#244137" strokeWidth={1}/>
      <Line points={[0,-11,0,-3]} stroke="#244137" strokeWidth={1}/><Line points={[0,3,0,11]} stroke="#244137" strokeWidth={1}/>
    </Group>
  </Group>;
}

/** Fixed SVG follows the exact same snap calculation as the final library drop. */
export function CatalogPlacementPreview({ ghost }: {ghost:{id:string;x:number;y:number}}) {
  const project=useProject(s=>s.project), px=useProject(s=>s.pxPerMeter), panX=useProject(s=>s.panX), panY=useProject(s=>s.panY);
  const snapOn=useProject(s=>s.snapOn), snapGridOn=useProject(s=>s.snapGridOn), gridStep=useProject(s=>s.gridStep);
  useEffect(()=>{document.documentElement.dataset.sprinklerPlacement='true'; return ()=>{delete document.documentElement.dataset.sprinklerPlacement;};},[]);
  const rect=document.querySelector('[data-design-canvas]')?.getBoundingClientRect();
  if (!rect) return null;
  const inside=ghost.x>=rect.left&&ghost.x<=rect.right&&ghost.y>=rect.top&&ghost.y<=rect.bottom;
  const heads=visibleProjectHeads(project);
  const point=inside ? snapSprinklerPoint({x:(ghost.x-rect.left-panX)/px,y:(ghost.y-rect.top-panY)/px},drawingOrMigrate(project),{snapOn,snapGridOn,gridStep,pxPerMeter:px,heads}).pt : null;
  const x=(v:number)=>rect.left+panX+v*px,y=(v:number)=>rect.top+panY+v*px;
  const cx=point?x(point.x):ghost.x,cy=point?y(point.y):ghost.y;
  const guides=point&&snapOn?sprinklerAlignmentGuides(point,heads,px,undefined,drawingOrMigrate(project)):[];
  return <svg aria-hidden="true" className="sprinkler-placement-preview" style={{position:'fixed',inset:0,width:'100vw',height:'100dvh',zIndex:120,pointerEvents:'none'}}>
    <defs><clipPath id="sprinkler-guide-clip"><rect x={rect.left} y={rect.top} width={rect.width} height={rect.height}/></clipPath></defs>
    <g clipPath="url(#sprinkler-guide-clip)">{guides.map(g=><line key={g.axis} x1={x(g.target.x)} y1={y(g.target.y)} x2={x(g.point.x)} y2={y(g.point.y)} stroke={g.exact?'#12a647':'#ed4242'} strokeWidth="1.25" strokeDasharray="6 5"/>)}</g>
    <g transform={`translate(${cx} ${cy})`} fill="none" strokeLinecap="round">
      <circle r="7" stroke={itemById(ghost.id)?.color??'#327b64'} strokeWidth="1.2" opacity=".7"/>
      <path d="M-12 0H-3M3 0H12M0-12V-3M0 3V12" stroke="white" strokeWidth="3"/>
      <path d="M-12 0H-3M3 0H12M0-12V-3M0 3V12" stroke="#244137" strokeWidth="1"/>
      <text x="16" y="-16" fill="#244137" stroke="white" strokeWidth="3" paintOrder="stroke" fontSize="12">{ghost.id}</text>
    </g>
  </svg>;
}
