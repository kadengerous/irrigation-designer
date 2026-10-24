"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Minus, Plus } from "lucide-react";
import { CanvasHost } from "./canvas-host";
import { useProject } from "@/lib/project-store";
import { tr } from "@/lib/i18n";

import {installPreviewNavigation,previewZoomAt,type PreviewView} from './preview-navigation';
export {previewGesture} from './preview-navigation';

export function MobilePreview({ onBack }: { onBack: () => void }) {
  const locale = useProject((s) => s.locale);
  const [view, setView] = useState(() => { const s = useProject.getState(); return { px: s.pxPerMeter, panX: s.panX, panY: s.panY }; });
  const surface=useRef<HTMLDivElement>(null),current=useRef<PreviewView>(view);
  const update=(next:PreviewView)=>{current.current=next;setView(next);};
  useEffect(()=>surface.current?installPreviewNavigation(surface.current,()=>current.current,update):undefined,[]);
  const zoom=(ratio:number)=>{
    const element=surface.current;if(!element)return;
    update(previewZoomAt(current.current,{x:element.clientWidth/2,y:element.clientHeight/2},current.current.px*ratio));
  };
  return <section className="mobile-project-preview" aria-label={tr(locale, "projectPreview")} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") onBack(); }} onKeyUp={(e) => e.stopPropagation()}>
    <div ref={surface} className="mobile-preview-gestures" onContextMenu={e=>e.preventDefault()}>
      <div className="mobile-preview-render"><CanvasHost previewView={view} onScalePair={() => {}} onMeasure={() => {}} /></div>
    </div>
    <div className="mobile-preview-zoom">
      <button type="button" aria-label={tr(locale,"zoomOut")} title={tr(locale,"zoomOut")} onClick={()=>zoom(1/1.25)}><Minus/></button>
      <button type="button" aria-label={tr(locale,"zoomIn")} title={tr(locale,"zoomIn")} onClick={()=>zoom(1.25)}><Plus/></button>
    </div>
    <button autoFocus type="button" className="mobile-preview-back" onClick={onBack}><ChevronLeft size={20} />{tr(locale, "backToEditor")}</button>
  </section>;
}
