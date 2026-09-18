import { useMemo } from "react";
import { Circle, Group, Line } from "react-konva";
import type { Pt } from "@/lib/geometry";
import type { CadDrawing } from "@/lib/cad/types";
import type { canvasTheme } from "@/lib/theme";
import { segmentAlignmentAnchors, segmentAlignmentGuides } from "@/lib/cad/segment-alignment";

export function SegmentAlignmentGuides({ drawing, point, fixed, excludeFaceId, excludeEdgeId, extraPoints,
  sx, sy, px, appearance }: {
  drawing: CadDrawing; point: Pt; fixed: Pt; excludeFaceId?: string; excludeEdgeId?: string; extraPoints?: readonly Pt[];
  sx: (n: number) => number; sy: (n: number) => number; px: number; appearance: ReturnType<typeof canvasTheme>;
}) {
  const anchors = useMemo(() => segmentAlignmentAnchors(drawing, fixed, excludeFaceId, excludeEdgeId, extraPoints),
    [drawing, fixed, excludeFaceId, excludeEdgeId, extraPoints]);
  const guides = segmentAlignmentGuides(point, anchors, px);
  return <Group listening={false}>
    {guides.map(guide => {
      const x1 = sx(guide.anchor.x), y1 = sy(guide.anchor.y);
      const x2 = sx(guide.projection.x), y2 = sy(guide.projection.y);
      const color = guide.aligned ? appearance.guideAligned : appearance.guideError;
      const extension = 48;
      return <Group key={guide.axis} listening={false}>
        <Line points={guide.axis === "horizontal"
          ? [Math.min(x1,x2)-extension,y1,Math.max(x1,x2)+extension,y1]
          : [x1,Math.min(y1,y2)-extension,x1,Math.max(y1,y2)+extension]}
          stroke={color} strokeWidth={1} dash={[5,4]} opacity={0.95} listening={false}/>
        {!guide.aligned && <Line points={[x2,y2,sx(point.x),sy(point.y)]}
          stroke={color} strokeWidth={1} dash={[2,3]} opacity={0.85} listening={false}/>}
        <Circle x={x1} y={y1} radius={2.5} stroke={color} strokeWidth={1} fill={appearance.bg} listening={false}/>
      </Group>;
    })}
  </Group>;
}
