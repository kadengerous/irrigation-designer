import type { Pt } from "@/lib/geometry";

export type DesignCanvasProps = {
  previewView?: { px: number; panX: number; panY: number };
  onScalePair: (a: Pt, b: Pt) => void;
  onMeasure: (meters: number) => void;
  onHover?: (p: Pt | null) => void;
  onExportReady?: (fn: () => string | null) => void;
};
