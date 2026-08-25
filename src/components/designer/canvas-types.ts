import type { Pt } from "@/lib/geometry";

export type DesignCanvasProps = {
  onScalePair: (a: Pt, b: Pt) => void;
  onMeasure: (meters: number) => void;
  onHover?: (p: Pt | null) => void;
  onExportReady?: (fn: () => string | null) => void;
};
