export function SectorEditIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <path d="M5 19V5a14 14 0 0 1 14 14Z"/>
    <path d="m5 19 10-10" strokeDasharray="2 2"/>
    <circle cx="5" cy="5" r="2" fill="var(--color-surface)"/><circle cx="19" cy="19" r="2" fill="var(--color-surface)"/>
    <circle cx="15" cy="9" r="2" fill="var(--color-surface)"/><circle cx="5" cy="19" r="1.5" fill="currentColor"/>
  </svg>;
}
