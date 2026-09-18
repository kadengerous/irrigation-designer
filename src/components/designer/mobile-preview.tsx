"use client";
import { useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { CanvasHost } from "./canvas-host";
import { useProject } from "@/lib/project-store";
import { tr } from "@/lib/i18n";

type Point = { x: number; y: number };
type View = { px: number; panX: number; panY: number };
export function previewGesture(view: View, before: Point[], after: Point[]): View {
  if (!before.length || before.length !== after.length) return view;
  const mid = (p: Point[]) => p.length > 1 ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } : p[0];
  const a = mid(before), b = mid(after);
  const distance = (p: Point[]) => Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
  const ratio = before.length > 1 && distance(before) > 2 ? distance(after) / distance(before) : 1;
  const px = Math.max(0.5, Math.min(5000, view.px * ratio));
  return { px, panX: b.x - (a.x - view.panX) * px / view.px, panY: b.y - (a.y - view.panY) * px / view.px };
}

export function MobilePreview({ onBack }: { onBack: () => void }) {
  const locale = useProject((s) => s.locale);
  const [view, setView] = useState(() => { const s = useProject.getState(); return { px: s.pxPerMeter, panX: s.panX, panY: s.panY }; });
  const pointers = useRef(new Map<number, Point>());
  return <section className="mobile-project-preview" aria-label={tr(locale, "projectPreview")} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") onBack(); }} onKeyUp={(e) => e.stopPropagation()}>
    <div className="mobile-preview-gestures"
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); }}
      onPointerMove={(e) => { if (!pointers.current.has(e.pointerId)) return; const before = [...pointers.current.values()]; pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); const after = [...pointers.current.values()]; setView(v => previewGesture(v, before, after)); }}
      onPointerUp={(e) => pointers.current.delete(e.pointerId)} onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}>
      <div className="mobile-preview-render"><CanvasHost previewView={view} onScalePair={() => {}} onMeasure={() => {}} /></div>
    </div>
    <button autoFocus type="button" className="mobile-preview-back" onClick={onBack}><ChevronLeft size={20} />{tr(locale, "backToEditor")}</button>
  </section>;
}
