import type { Pt } from "@/lib/geometry";

export type DesignCanvasProps = {
  automaticHeadPanelHost?:HTMLElement|null;
  engineeringBase?: boolean;
  previewView?: { px: number; panX: number; panY: number };
  multiSelect?: boolean;
  shortcutsDisabled?: boolean;
  onSelectionClear?: () => void;
  mobile?: boolean;
  onScalePair: (a: Pt, b: Pt) => void;
  onMeasure: (meters: number) => void;
  onHover?: (p: Pt | null) => void;
  onExportReady?: (fn: () => Promise<string | null>) => void;
};
