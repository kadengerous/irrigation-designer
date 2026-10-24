import { useEffect, useMemo } from "react";
import { Arrow, Circle, Group, Line, Rect, Shape, Text } from "react-konva";
import { diagnosticBounds, diagnosticView, DIAGNOSTIC_COLORS, liveDiagnosticIssue, formatDiagnosticMetric, useDiagnosticFocus } from "@/lib/diagnostic-focus";
import { useProject } from "@/lib/project-store";
import { headSurface, irrigationSurfaces, subtractSurface, type Surface } from "@/lib/irrigation-geometry";
import { COVERAGE_HATCHES, diagnosticCoverage } from "@/lib/diagnostic-coverage";
import type { Project } from "@/lib/project-types";
import { tr } from "@/lib/i18n";
import { useCoverageDisplay } from "@/lib/coverage-display";

function HatchedSurface({ surface, color, px, panX, panY }: { surface: Surface; color: string; px: number; panX: number; panY: number }) {
  const pattern = useMemo(() => {
    if (typeof document === "undefined") return undefined;
    const tile = document.createElement("canvas"); tile.width = tile.height = 8;
    const ctx = tile.getContext("2d"); if (!ctx) return undefined;
    for (const [stroke, width] of [["#ffffffb3", 2.8], [color, 1.2]] as const) {
      ctx.strokeStyle = stroke; ctx.lineWidth = width;
      ctx.beginPath();
      for (const offset of [-8, 0, 8]) { ctx.moveTo(offset, 8); ctx.lineTo(offset + 8, 0); }
      ctx.stroke();
    }
    return tile;
  }, [color]);
  if (!surface.length) return null;
  return <Shape listening={false} sceneFunc={ctx => {
    if (!pattern) return;
    const paint = ctx.createPattern(pattern, "repeat"); if (!paint) return;
    ctx.save(); ctx.setAttr("fillStyle", paint);
    ctx.beginPath();
    for (const polygon of surface) for (const ring of polygon) {
      ring.forEach(([a, b], i) => i ? ctx.lineTo(a * px + panX, b * px + panY) : ctx.moveTo(a * px + panX, b * px + panY)); ctx.closePath();
    }
    ctx.fill("evenodd"); ctx.restore();
  }}/>;
}

export function DiagnosticOverlay({ project, px, panX, panY, size, canvas }: {
  project: Project; px: number; panX: number; panY: number; size: { w: number; h: number }; canvas: React.RefObject<HTMLDivElement | null>;
}) {
  const focus = useDiagnosticFocus(s => s.focus), units = useProject(s => s.units);
  const locale = useProject(s => s.locale);
  useProject(s => s.numberFormat); useProject(s => s.decimals);
  const issue = liveDiagnosticIssue(focus, project);
  const coverageId = useCoverageDisplay(s => s.projectId);
  const irrigation = useProject(s => s.workspaceSection === "irrigation");
  const coverage = issue || (irrigation && coverageId === project.id) ? diagnosticCoverage(project) : null;
  const issueArea=useMemo(()=>{
    if(!issue?.area?.length)return [];
    try{return subtractSurface(issue.area,irrigationSurfaces(project).excluded);}catch{return [];}
  },[issue?.area,project]);
  const heads = useMemo(() => issue ? project.heads.filter(h => issue.headIds.includes(h.id)) : [], [issue, project]);
  useEffect(() => {
    if (!issue) return;
    const bounds = diagnosticBounds(project, issue);
    if (!bounds) return;
    const origin = canvas.current?.getBoundingClientRect();
    let left = 12, right = size.w - 12, top = 48;
    if (origin) for (const panel of document.querySelectorAll<HTMLElement>("[data-catalog],.info-panel,.diagnostic-focus-card,.irrigation-check-dialog")) {
      const r = panel.getBoundingClientRect();
      const diagnostic = panel.matches(".diagnostic-focus-card,.irrigation-check-dialog");
      if (r.width < 20 || r.height < 20 || getComputedStyle(panel).visibility === "hidden") continue;
      if (size.w <= 700 || r.width > size.w / 2) {
        if (diagnostic) top = Math.max(top, r.bottom - origin.top + 12);
        continue;
      }
      const x = r.left - origin.left;
      if (x < size.w / 3) left = Math.max(left, r.right - origin.left + 12);
      else if (x > size.w / 2) right = Math.min(right, x - 12);
    }
    const view = diagnosticView(bounds, { x: left, y: top, w: Math.max(120, right - left), h: Math.max(100, size.h - top - 48) });
    const state = useProject.getState(); state.setZoom(view.px); state.setPan(view.panX, view.panY);
  }, [focus, project.id, size.w, size.h, canvas]);
  if (!issue && !coverage) return null;
  const color = issue?.resolved ? '#159447' : issue ? DIAGNOSTIC_COLORS[issue.level] : DIAGNOSTIC_COLORS.info, x = (v: number) => v * px + panX, y = (v: number) => v * px + panY;
  const distance = issue?.line && issue.metrics.find(m => m.key === "diagDistance");
  const label = distance ? formatDiagnosticMetric(distance, units) : "";
  const radius = issue?.line && issue.metrics.find(m => m.key === "radius");
  return <Group listening={false}>
    {coverage && COVERAGE_HATCHES.map(hatch => <HatchedSurface key={hatch.id} surface={coverage[hatch.id]} color={hatch.color} px={px} panX={panX} panY={panY}/>)}
    {!!issueArea.length && <HatchedSurface surface={issueArea} color={color} px={px} panX={panX} panY={panY}/>}
    {heads.map(head => <Group key={head.id}>
      {headSurface(head).flatMap((polygon, p) => polygon.map((ring, r) => <Group key={`${p}-${r}`}>
        <Line points={ring.flatMap(([a, b]) => [x(a), y(b)])} closed stroke="#ffffffdd" strokeWidth={5}/>
        <Line points={ring.flatMap(([a, b]) => [x(a), y(b)])} closed stroke={color} strokeWidth={2.5} dash={[7, 4]}/>
      </Group>))}
      <Circle x={x(head.x)} y={y(head.y)} radius={13} stroke="#fff" strokeWidth={6}/>
      <Circle x={x(head.x)} y={y(head.y)} radius={13} stroke={color} strokeWidth={3}/>
      <Circle x={x(head.x)} y={y(head.y)} radius={3} fill={color}/>
    </Group>)}
    {issue?.line && <>
      <Line points={[x(issue.line.a.x), y(issue.line.a.y), x(issue.line.b.x), y(issue.line.b.y)]} stroke="#fff" strokeWidth={5}/>
      <Line points={[x(issue.line.a.x), y(issue.line.a.y), x(issue.line.b.x), y(issue.line.b.y)]} stroke={color} strokeWidth={2}/>
      {issue.direction && <Arrow points={[x(issue.line.a.x),y(issue.line.a.y),x(issue.line.b.x),y(issue.line.b.y)]} stroke={color} fill={color} strokeWidth={2} pointerLength={10} pointerWidth={8}/>}
      {issue.direction && radius && distance && distance.value>radius.value && (()=>{
        const {a,b}=issue.line!,ratio=radius.value/distance.value;
        return <Line points={[x(a.x+(b.x-a.x)*ratio),y(a.y+(b.y-a.y)*ratio),x(b.x),y(b.y)]} stroke={color} strokeWidth={5} dash={[4,4]}/>;
      })()}
      {issue.direction && [issue.line.a,issue.line.b].map((p,i)=><Text key={i} x={x(p.x)+16} y={y(p.y)-22} text={i?'B':'A'} fontSize={14} fill={color} stroke="#fff" strokeWidth={3} fillAfterStrokeEnabled/>)}
      <Group x={x((issue.line.a.x + issue.line.b.x) / 2)} y={y((issue.line.a.y + issue.line.b.y) / 2) - 28}>
        <Rect x={-70} width={140} height={26} fill="#fff" stroke={color} cornerRadius={5}/>
        <Text x={-66} y={6} width={132} text={label} align="center" fill="#15314a" fontSize={13}/>
      </Group>
      {radius && <Group x={x(issue.line.a.x) - 86} y={y(issue.line.a.y) + 19}>
        <Rect width={172} height={34} fill="#fff" stroke={color} cornerRadius={5}/>
        <Text x={5} y={5} width={162} height={30} text={`${tr(locale, "radius")}: ${formatDiagnosticMetric(radius, units)}`} align="center" fill="#15314a" fontSize={12}/>
      </Group>}
    </>}
  </Group>;
}
