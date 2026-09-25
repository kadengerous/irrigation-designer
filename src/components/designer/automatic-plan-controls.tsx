import { Ruler, ScanLine } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ButtonHTMLAttributes } from 'react';
import { createPortal } from "react-dom";
import { useProject } from "@/lib/project-store";
import { applyAutomaticDimensions } from '@/lib/automatic-dimension-action';
import { useCoverageDisplay } from "@/lib/coverage-display";
import { tr } from "@/lib/i18n";
import { localeDirection } from "@/lib/locale-config";
import { useDiagnosticFocus } from "@/lib/diagnostic-focus";
import { DiagnosticLegend } from "./irrigation-check";
import "./automatic-plan-controls.css";
import { canvasTapActivation } from './canvas-tap-activation';

export function CanvasActionButton({activate,...props}: ButtonHTMLAttributes<HTMLButtonElement> & {activate:()=>void}) {
  const action=useRef(activate);action.current=activate;
  const handlers=useRef<ReturnType<typeof canvasTapActivation>|null>(null);
  if(!handlers.current)handlers.current=canvasTapActivation(()=>action.current());
  return <button {...props} {...handlers.current} type="button"/>;
}

export function CoverageLegend({locale}:{locale:Parameters<typeof tr>[0]}) {
  const rightOpen=useProject(s=>s.rightOpen),rightMode=useProject(s=>s.rightMode);
  const [position,setPosition]=useState<CSSProperties>({visibility:'hidden'});
  useLayoutEffect(()=>{
    const canvas=document.querySelector('[data-design-canvas]');
    const panels=[...document.querySelectorAll('.info-panel')];
    const update=()=>{
      const c=canvas?.getBoundingClientRect();if(!c)return;
      const gap=10,viewportW=window.innerWidth,viewportH=window.innerHeight;
      let left=Math.max(8,c.left+gap),right=Math.min(viewportW-8,c.right-gap),top=Math.max(8,c.top+gap),bottom=Math.min(viewportH-60,c.bottom-gap);
      for(const panel of panels){const p=panel.getBoundingClientRect();if(p.width<1||p.height<1)continue;
        if(p.width>c.width*.75){if(p.top<=top)top=Math.max(top,p.bottom+gap);else bottom=Math.min(bottom,p.top-gap);}
        else if(p.left>c.left+c.width/2)right=Math.min(right,p.left-gap);
        else left=Math.max(left,p.right+gap);
      }
      const width=Math.max(0,Math.min(260,right-left)),height=Math.max(0,bottom-top);
      setPosition({left:Math.max(8,right-width),right:'auto',bottom:viewportH-bottom,width,maxHeight:height,visibility:width>0&&height>0?'visible':'hidden'});
    };
    update();const observer=new ResizeObserver(update);
    [canvas,...panels].forEach(el=>{if(el)observer.observe(el);});window.addEventListener('resize',update);
    return()=>{observer.disconnect();window.removeEventListener('resize',update);};
  },[rightOpen,rightMode,locale]);
  return <aside className="coverage-display-legend" style={position} dir={localeDirection(locale)} aria-live="polite">
    <DiagnosticLegend locale={locale}/>
  </aside>;
}

export function AutomaticPlanControls() {
  const project = useProject(s => s.project), mode = useProject(s => s.workspaceSection);
  const locale = useProject(s => s.locale);
  const coverageId = useCoverageDisplay(s => s.projectId);
  const focused = useDiagnosticFocus(s => s.focus?.project.id === project.id);
  if (mode !== "plan" && mode !== "irrigation") return null;
  const active = mode === "irrigation" && coverageId === project.id;
  const label = tr(locale, mode === "plan" ? "autoDimensionsPlan" : "autoDimensionsIrrigation");
  return <div className="automatic-plan-controls workspace-canvas-controls">
    {mode === "irrigation" && <CanvasActionButton className="mobile-icon-button" title={tr(locale,"coverageDisplay")} aria-label={tr(locale,"coverageDisplay")}
      aria-pressed={active} activate={() => useCoverageDisplay.getState().toggle(project.id)}><ScanLine/></CanvasActionButton>}
    <CanvasActionButton className="mobile-icon-button" title={label} aria-label={label} activate={applyAutomaticDimensions}><Ruler/><span className="automatic-dimension-star" aria-hidden="true">✦</span></CanvasActionButton>
    {active && !focused && typeof document !== "undefined" && createPortal(<CoverageLegend locale={locale}/>, document.body)}
  </div>;
}
