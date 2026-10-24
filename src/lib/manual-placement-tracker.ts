import type {Pt} from './geometry';
import type {CadDrawing, SnapHit} from './cad/types';
import type {Head} from './project-types';
import {snapSprinklerPoint, sprinklerAlignmentGuides} from './head-snapping';

export type PlacementScene = {
  drawing: CadDrawing; heads: Head[]; px: number; panX: number; panY: number;
  snapOn: boolean; snapGridOn: boolean; gridStep: number;
};
export type PlacementFrame = {
  hit: SnapHit; screen: Pt; scene: PlacementScene;
  guides: ReturnType<typeof sprinklerAlignmentGuides>;
};

/** Coalesce raw screen positions before snapping, without rendering the editor. */
export function createManualPlacementTracker(
  scene: () => PlacementScene, publish: (frame: PlacementFrame | null) => void,
  schedule = requestAnimationFrame, cancel = cancelAnimationFrame,
) {
  let pointer: Pt | null = null, raf = 0;
  const flush = () => {
    raf = 0;
    if (!pointer) return;
    const s = scene();
    const hit = snapSprinklerPoint({x:(pointer.x-s.panX)/s.px,y:(pointer.y-s.panY)/s.px},s.drawing,
      {snapOn:s.snapOn,snapGridOn:s.snapGridOn,gridStep:s.gridStep,pxPerMeter:s.px,heads:s.heads});
    publish({hit,scene:s,screen:{x:hit.pt.x*s.px+s.panX,y:hit.pt.y*s.px+s.panY},
      guides:s.snapOn?sprinklerAlignmentGuides(hit.pt,s.heads,s.px,undefined,s.drawing):[]});
  };
  const refresh = () => { if(pointer && !raf) raf=schedule(flush); };
  return {
    move(point: Pt, immediate = false) {
      pointer=point;
      if(immediate){if(raf)cancel(raf);flush();}else refresh();
    },
    refresh,
    clear(){pointer=null;if(raf)cancel(raf);raf=0;publish(null);},
  };
}
export type ManualPlacementTracker = ReturnType<typeof createManualPlacementTracker>;
