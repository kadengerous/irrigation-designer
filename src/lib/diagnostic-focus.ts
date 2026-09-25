import { create } from "zustand";
import type { Issue, DiagnosticMetric } from "./check-project";
import type { Project } from "./project-types";
import { headSurface, surfaceBounds, irrigationSurfaces, unionSurfaces, subtractSurface, intersectSurface, cleanSurface, cleanCoverageSurface, surfaceArea, CURVE_TOLERANCE_M } from "./irrigation-geometry";
import { formatNumber } from "./i18n";
import { clampPxPerMeter } from "./geometry";
import { directedReach, dryOnHeadLink } from './head-to-head';
import { formatAreaU, formatFlowU, formatLenU, formatPrecipitation, formatPressureU, type UnitPrefs } from "./units";

export type DiagnosticFocus = { project: Project; issue: Issue };
export function focusedIssue(focus: DiagnosticFocus | null, project: Project) {
  return focus?.project.id === project.id ? focus.issue : null;
}
const liveIssues = new WeakMap<Project, WeakMap<DiagnosticFocus, Issue>>();
/** The diagnosis stays selected, but its geometry follows the edited project. */
export function liveDiagnosticIssue(focus: DiagnosticFocus | null, project: Project): Issue | null {
  const issue = focusedIssue(focus, project);
  if (!issue || !focus) return null;
  if (project === focus.project) return issue;
  const cache = liveIssues.get(project) ?? new WeakMap<DiagnosticFocus, Issue>();
  liveIssues.set(project, cache);
  const cached = cache.get(focus); if (cached) return cached;
  let next = { ...issue };
  const heads = issue.headIds.map(id => project.heads.find(h => h.id === id)).filter(h => h != null);
  if (issue.line) {
    const [a, b] = heads;
    next.line = a && b ? { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } } : undefined;
    if (a && b) {
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      next.metrics = issue.metrics.map(m => ({ ...m, value: m.key === "diagDistance" ? distance : m.key === "radius" ? a.r : m.key === "diagShortage" ? Math.max(0, distance - a.r) : m.value }));
      if(issue.direction){
        const reach=directedReach(a,b);
        next.direction={...issue.direction,inSector:reach.inSector};next.resolved=reach.reached;
        try {
          const target=irrigationSurfaces(project).target;
          const surfaces=project.heads.map(h=>headSurface(h,CURVE_TOLERANCE_M*1.01));
          const dry=cleanCoverageSurface(subtractSurface(target,unionSurfaces(surfaces)));
          const local=dryOnHeadLink(a,b,dry),confirmed=local.length>0&&surfaces.every(s=>s.length);
          next.area=!reach.reached&&confirmed?local:[];
          next.level=reach.reached?'info':confirmed?'error':'warn';
          next.titleKey=reach.reached?'noIssues':'diagOverlap';
          next.detailKey=reach.reached?'noIssues':!reach.inSector?'diagDirectionDetail':confirmed?'diagOverlapDryDetail':'diagOverlapWetDetail';
        } catch {next.area=[];next.level='info';next.detailKey='diagGeometryMissing';}
        next.metrics=next.metrics.map(m=>m.key==='workingPressure'?{...m,value:a.designPressure}:m);
      }
    } else if(issue.direction) {
      next={...next,resolved:true,level:'info',titleKey:'noIssues',detailKey:'noIssues',direction:undefined,area:[],metrics:[]};
    }
  }
  if (issue.area && /^(over-|dry-)/.test(issue.id)) {
    try {
      const target = irrigationSurfaces(project).target;
      next.area = issue.id.startsWith("over-")
        ? cleanSurface(subtractSurface(unionSurfaces(heads.map(h => headSurface(h))), target))
        : cleanCoverageSurface(subtractSurface(target.filter(component => surfaceArea(intersectSurface([component], issue.area!)) > 0),
            unionSurfaces(project.heads.map(h => headSurface(h, CURVE_TOLERANCE_M * 1.01)))));
      next.metrics = issue.metrics.map(m => ({ ...m, value: m.key === "area" ? surfaceArea(next.area!) : m.key === "diagRegions" ? next.area!.length : m.key === "diagOutsideHeads" ? heads.filter(h => surfaceArea(subtractSurface(headSurface(h), target)) > 0).length : m.value }));
    } catch { next.area = []; }
  }
  cache.set(focus, next);
  return next;
}
/** Session-only overlay: deliberately excluded from project files, history and persisted preferences. */
export const useDiagnosticFocus = create<{ focus: DiagnosticFocus | null; show: (project: Project, issue: Issue) => void; clear: () => void }>(set => ({
  focus: null, show: (project, issue) => set({ focus: { project, issue } }), clear: () => set({ focus: null }),
}));
export function diagnosticBounds(project: Project, issue: Issue) {
  const heads = issue.headIds.map(id => project.heads.find(h => h.id === id)).filter(h => h != null);
  return surfaceBounds(issue.area?.length ? issue.area : heads.flatMap(h => headSurface(h)),
    [...heads, ...(issue.line ? [issue.line.a, issue.line.b] : [])]);
}
export function diagnosticView(bounds: NonNullable<ReturnType<typeof diagnosticBounds>>, viewport: { x: number; y: number; w: number; h: number }) {
  const px = clampPxPerMeter(Math.min(150, (viewport.w - 56) / Math.max(1, bounds.maxX - bounds.minX), (viewport.h - 56) / Math.max(1, bounds.maxY - bounds.minY)));
  return { px, panX: viewport.x + viewport.w / 2 - (bounds.minX + bounds.maxX) * px / 2,
    panY: viewport.y + viewport.h / 2 - (bounds.minY + bounds.maxY) * px / 2 };
}
export function formatDiagnosticMetric(m: DiagnosticMetric, units: UnitPrefs) {
  if (!Number.isFinite(m.value)) return "—";
  const value = m.kind === "length" ? formatLenU(m.value, units.length) : m.kind === "area" ? formatAreaU(m.value, units.area)
    : m.kind === "flow" ? formatFlowU(m.value, units.flow) : m.kind === "pressure" ? formatPressureU(m.value, units.pressure)
      : m.kind === "precipitation" ? formatPrecipitation(m.value, units) : formatNumber(m.value, 0);
  return `${m.approximate ? "≈ " : ""}${value}`;
}
export const DIAGNOSTIC_COLORS = { error: "#e03532", warn: "#bd8a00", info: "#259be2" } as const;
