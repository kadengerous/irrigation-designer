import type { SVGProps } from "react";

/** A pop-up nozzle with outward water jets, matching the toolbar's line icons. */
export function SprinklerIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M9 21v-5h6v5M8 16h8M5 21h14M12 12V7M9 12C7 7 4 6 2 7M15 12c2-5 5-6 7-5M10 8 8 5M14 8l2-3"/>
    <path d="M12 3v1M3 10l1 1M20 11l1-1" strokeWidth="1.8"/>
  </svg>;
}
