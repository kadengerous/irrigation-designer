import {useLayoutEffect,useRef,type RefObject} from 'react';
import {useProject} from '@/lib/project-store';
import {drawingOrMigrate} from '@/lib/cad/engine';
import {visibleProjectHeads} from '@/lib/head-visibility';
import {createManualPlacementTracker,type ManualPlacementTracker} from '@/lib/manual-placement-tracker';
import {setPlacementFocus} from './placement-focus';
import {headSymbolScale} from '@/lib/head-presentation';
import {SprinklerTarget} from './sprinkler-target';

/** Only this small SVG moves. The plan and library never render for pointer motion. */
export function ManualSprinklerPlacement({trackerRef}:{trackerRef:RefObject<ManualPlacementTracker|null>}) {
  const svg=useRef<SVGSVGElement>(null);
  useLayoutEffect(()=>{
    const root=svg.current!;
    const target=root.querySelector<SVGGElement>('[data-placement-target]')!;
    const lines=[...root.querySelectorAll<SVGLineElement>('[data-placement-guide]')];
    const tracker=createManualPlacementTracker(()=>{
      const s=useProject.getState();
      return {drawing:drawingOrMigrate(s.project),heads:visibleProjectHeads(s.project),px:s.pxPerMeter,
        panX:s.panX,panY:s.panY,snapOn:s.snapOn,snapGridOn:s.snapGridOn,gridStep:s.gridStep};
    },frame=>{
      root.style.visibility=frame?'visible':'hidden';
      if(!frame){setPlacementFocus('catalog-head',null);return;}
      target.setAttribute('transform',`translate(${frame.screen.x} ${frame.screen.y}) scale(${headSymbolScale(frame.scene.px)})`);
      const s=frame.scene;
      lines.forEach((line,index)=>{
        const g=frame.guides[index];line.style.display=g?'':'none';if(!g)return;
        line.setAttribute('x1',String(g.target.x*s.px+s.panX));line.setAttribute('y1',String(g.target.y*s.px+s.panY));
        line.setAttribute('x2',String(g.point.x*s.px+s.panX));line.setAttribute('y2',String(g.point.y*s.px+s.panY));
        line.setAttribute('stroke',g.exact?'#12a647':'#ed4242');
      });
      setPlacementFocus('catalog-head',frame.hit.pt,undefined,frame.hit.kind);
    });
    trackerRef.current=tracker;
    const off=useProject.subscribe((s,prev)=>{
      if(s.project!==prev.project||s.pxPerMeter!==prev.pxPerMeter||s.panX!==prev.panX||s.panY!==prev.panY||
        s.snapOn!==prev.snapOn||s.snapGridOn!==prev.snapGridOn||s.gridStep!==prev.gridStep)tracker.refresh();
    });
    const clear=()=>tracker.clear();
    window.addEventListener('blur',clear);
    return()=>{window.removeEventListener('blur',clear);off();tracker.clear();trackerRef.current=null;};
  },[trackerRef]);
  return <svg ref={svg} data-manual-sprinkler-placement aria-hidden="true"
    style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',visibility:'hidden'}}>
    <line data-placement-guide strokeWidth="1.25" strokeDasharray="6 5"/>
    <line data-placement-guide strokeWidth="1.25" strokeDasharray="6 5"/>
    <g data-placement-target><SprinklerTarget/></g>
  </svg>;
}
