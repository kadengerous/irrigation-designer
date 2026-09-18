import type { SVGProps } from "react";

// The contact point is the tip of the extended hook, in viewBox coordinates.
export const TAPE_MEASURE_TIP = { x: 2, y: 12.5 };

export function TapeMeasureIcon({ showTip = false, snapped = false, ...props }: SVGProps<SVGSVGElement> & {
  showTip?: boolean;
  snapped?: boolean;
}) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M16 5h2.5a4 4 0 0 1 4 4v10.5H16a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4Z" fill="var(--color-surface)" fillOpacity=".8" />
    <path d="M12 14.5H2v5h10M2 12.5v2M5.5 14.5v2M9 14.5v2" />
    <circle cx="17.25" cy="11" r="2.6" />
    {showTip && <circle cx={TAPE_MEASURE_TIP.x} cy={TAPE_MEASURE_TIP.y} r={snapped ? 1.8 : 1.5}
      fill={snapped ? "#22a35a" : "#1689e8"} stroke="none" />}
  </svg>;
}
