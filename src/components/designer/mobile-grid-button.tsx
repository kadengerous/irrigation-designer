"use client";
import { useEffect, useRef } from "react";
import { Grid3x3 } from "lucide-react";

export function MobileGridButton({ enabled, open, label, onToggle, onHold }: { enabled: boolean; open: boolean; label: string; onToggle: () => void; onHold: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppress = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => clear, []);
  return <button type="button" className="mobile-icon-button" aria-label={label} aria-pressed={enabled} aria-expanded={open} aria-haspopup="dialog"
    onPointerDown={(e) => { if (e.button !== 0) return; clear(); suppress.current = false; start.current = { x: e.clientX, y: e.clientY }; timer.current = setTimeout(() => { suppress.current = true; onHold(); }, 450); }}
    onPointerMove={(e) => { if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) { clear(); suppress.current = true; } }}
    onPointerUp={clear} onPointerLeave={clear} onPointerCancel={() => { clear(); suppress.current = true; }}
    onContextMenu={(e) => e.preventDefault()}
    onClick={() => { clear(); if (suppress.current) { suppress.current = false; return; } onToggle(); }}><Grid3x3 /></button>;
}
