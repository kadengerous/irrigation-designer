import { useRef } from "react";
import { X } from "lucide-react";
import { tr } from "@/lib/i18n";
import { useProject } from "@/lib/project-store";
import { formatLenU } from "@/lib/units";
import { useFloatingPlacement } from "./floating-workspace";
import { TapeMeasureIcon } from "./tape-measure-icon";

export function MeasurementResult({ meters, onClose }: { meters: number; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const locale = useProject(s => s.locale), units = useProject(s => s.units);
  const box = useFloatingPlacement(ref, b => ({
    x: b.x + (b.width - (ref.current?.offsetWidth ?? 240)) / 2,
    y: b.y + (b.height - (ref.current?.offsetHeight ?? 108)) / 2,
  }), 70);
  const origin = ref.current?.offsetParent?.getBoundingClientRect();
  return <section ref={ref} className="measurement-result" data-floating-priority="70" aria-label={tr(locale, "drawDim")}
    style={{ left: (box?.x ?? 0) - (origin?.left ?? 0), top: (box?.y ?? 0) - (origin?.top ?? 0),
      maxWidth: box?.width, maxHeight: box?.height, visibility: box?.width && box.height ? "visible" : "hidden" }}
    onPointerDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    <div role="status" aria-live="polite" aria-atomic="true">
      <span className="measurement-result-label"><TapeMeasureIcon />{tr(locale, "drawDim")}</span>
      <output>{formatLenU(meters, units.length)}</output>
    </div>
    <button type="button" className="measurement-result-close" aria-label={tr(locale, "close")} onClick={onClose}><X size={16}/></button>
  </section>;
}
