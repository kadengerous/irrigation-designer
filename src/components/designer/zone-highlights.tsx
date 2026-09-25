import { useEffect, useMemo, useRef, type RefObject } from "react";
import Konva from "konva";
import { Group, Shape } from "react-konva";
import type { Head } from "@/lib/project-types";
import { wateringDrop, wateringMicroDrop, wateringDropTone, wateringJetPath, wateringProfile, wateringParticleCount } from "@/lib/watering-preview";

/** One canvas animation; no timers or project edits per head. */
export function ZoneHighlights({ elapsed }: { elapsed: RefObject<number> }) {
  const group = useRef<Konva.Group>(null);
  useEffect(() => {
    const node = group.current;
    if (!node) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animation = new Konva.Animation(frame => { elapsed.current += (frame?.timeDiff ?? 0) / 1000; }, node.getLayer());
    const update = () => { if (preference.matches || document.hidden) animation.stop(); else animation.start(); };
    update(); preference.addEventListener("change", update); document.addEventListener('visibilitychange', update);
    return () => { animation.stop(); preference.removeEventListener("change", update); document.removeEventListener('visibilitychange', update); };
  }, [elapsed]);
  return <Group ref={group} listening={false}/>;
}

/** Lives inside the draggable head, including during native touch/mouse dragging. */
export function FocusedHead({ points, elapsed, symbolScale=1 }: { points: number[]; elapsed: RefObject<number>; symbolScale?:number }) {
  return <Shape listening={false} perfectDrawEnabled={false} sceneFunc={context => {
    context.save();
    context.strokeStyle = "#783507";
    context.lineWidth = 3 * symbolScale;
    context.beginPath(); context.arc(0, 0, 15 * symbolScale, 0, Math.PI * 2); context.stroke();
    context.setLineDash([8 * symbolScale, 6 * symbolScale]); context.setAttr("lineDashOffset", -elapsed.current * 22 * symbolScale);
    context.strokeStyle = "#ff9b24"; context.lineWidth = 2 * symbolScale; context.stroke();
    if (points.length >= 4) {
      context.setLineDash([]);
      context.beginPath(); context.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) context.lineTo(points[i], points[i + 1]);
      context.closePath(); context.strokeStyle = "#164427"; context.lineWidth = 3; context.stroke();
      context.setLineDash([8, 6]); context.setAttr("lineDashOffset", -elapsed.current * 22);
      context.strokeStyle = "#dcff9b"; context.lineWidth = 2; context.stroke();
    }
    context.restore();
  }}/>;
}

export function WateringHead({ head, elapsed, px }: { head: Head; elapsed: RefObject<number>; px: number }) {
  const profile = useMemo(() => wateringProfile(head), [head.id, head.catalogId, head.designPressure]);
  if (profile.kind === 'unknown' || !Number.isFinite(head.r) || !Number.isFinite(head.arc) || !Number.isFinite(head.start) || !(px > 0)) return null;
  return <Shape listening={false}
      perfectDrawEnabled={false} sceneFunc={context => {
        const time = elapsed.current;
        const particleScale = px / 36;
        context.save();
        // Clip painted edges as well as particle centers to the current footprint.
        if (profile.kind !== "flood") {
          context.beginPath();
          if (profile.strip) {
            const s = profile.strip, a = head.start * Math.PI / 180;
            [[s.ox, s.oy], [s.ox + s.l, s.oy], [s.ox + s.l, s.oy + s.w], [s.ox, s.oy + s.w]].forEach(([x, y], i) => {
              const xx = (x * Math.cos(a) - y * Math.sin(a)) * px, yy = (x * Math.sin(a) + y * Math.cos(a)) * px;
              if (i === 0) context.moveTo(xx, yy); else context.lineTo(xx, yy);
            });
          } else {
            const a = head.start * Math.PI / 180;
            context.moveTo(0, 0);
            context.arc(0, 0, Math.max(0, head.r * px), a, a + Math.max(0, Math.min(360, head.arc)) * Math.PI / 180);
          }
          context.closePath(); context.clip();
        }
        if (profile.kind === 'rotor' || profile.kind === 'opposed') profile.reaches.forEach((reach, lane) => {
          const path = wateringJetPath(head, time, profile, lane);
          // A narrow moving water ribbon follows its emission history. The outer
          // part breaks into droplets, rather than a rigid triangle turning as one.
          const width = Math.min(3.5, 1 + head.r * reach * .12) * particleScale;
          for (const [scale, color] of [[1, 'rgba(26,164,218,.5)'], [.42, 'rgba(192,243,255,.86)']] as const) {
            context.fillStyle = color; context.beginPath();
            const sides: number[][] = [];
            for (let i = 0; i <= 25; i++) {
              const p = path[i], next = path[Math.min(32, i + 1)];
              const angle = Math.atan2(next.y - p.y, next.x - p.x);
              const w = width * scale * (.35 + i / 32) * (1 + .12 * Math.sin(i * .8 - time * 8));
              const dx = -Math.sin(angle) * w, dy = Math.cos(angle) * w;
              if (!i) context.moveTo(p.x * px + dx, p.y * px + dy); else context.lineTo(p.x * px + dx, p.y * px + dy);
              sides.push([p.x * px - dx, p.y * px - dy]);
            }
            for (const [x, y] of sides.reverse()) context.lineTo(x, y);
            context.closePath(); context.fill();
          }
        });
        if (profile.kind === 'flood') {
          const umbrella = profile.bubblePattern === 'umbrella';
          for (let ring = 0; ring < 4; ring++) {
            const phase = ((time / (umbrella ? 1.8 : 2.6) + ring / 4 + (profile.phaseSeconds ?? 0)) % 1 + 1) % 1;
            const radius = (9 + phase * (umbrella ? 19 : 10)) * particleScale;
            context.strokeStyle = `rgba(36,176,227,${(1 - phase) * .7})`;
            context.lineWidth = (1.2 - phase * .6) * particleScale;
            context.beginPath(); context.arc(0, 0, radius, 0, Math.PI * 2); context.stroke();
          }
        }
        // Batch small droplets by size to keep whole-zone previews inexpensive.
        for (let batch = 0; batch < 3; batch++) {
          context.fillStyle = ["rgba(25,116,174,.85)", "rgba(40,186,238,.94)", "rgba(156,237,255,.98)"][batch];
          context.strokeStyle = "rgba(0,87,153,.5)";
          context.lineWidth = .3 * particleScale;
          context.beginPath();
        for (let index = 0; index < wateringParticleCount(profile); index++) {
          if (wateringDropTone(index) !== batch) continue;
          const drop = wateringDrop(head, time, index, profile);
          if (!drop) continue;
          const local = profile.kind === "flood";
          const bubbleSize = profile.bubblePattern === 'umbrella' ? 24 : 16;
          const x = local ? Math.cos(drop.angle) * bubbleSize * drop.travel * particleScale : drop.x * px;
          const y = local ? Math.sin(drop.angle) * bubbleSize * drop.travel * particleScale : drop.y * px;
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          const seed = ((index * 137) % 101) / 100;
          const size = (.65 + seed * .7) * .7 * particleScale;
          const form = Math.floor(index / 3) % 5;
          if (form < 2) {
            context.moveTo(x + size, y); context.arc(x, y, size, 0, Math.PI * 2);
            context.closePath(); continue;
          }
          const length = size * (form < 2 ? 1 : form < 4 ? 1.8 : 3.1);
          const angle = profile.strip ? Math.atan2(drop.y, drop.x) : drop.angle;
          const c = Math.cos(angle), s = Math.sin(angle);
          // Closed rounded drops and tapered streaks point along the water's travel.
          context.moveTo(x + c * length, y + s * length);
          context.bezierCurveTo(x + c * length - s * size, y + s * length + c * size,
            x - c * length - s * size, y - s * length + c * size, x - c * length, y - s * length);
          context.bezierCurveTo(x - c * length + s * size, y - s * length - c * size,
            x + c * length + s * size, y + s * length - c * size, x + c * length, y + s * length);
          context.closePath();
        }
        context.stroke(); context.fill();
        }
        for (let batch = 0; batch < 3; batch++) {
          context.fillStyle = ["rgba(16,144,210,.65)", "rgba(56,201,255,.85)", "rgba(182,244,255,.9)"][batch];
          context.beginPath();
          for (let index = 0; index < 720; index++) {
            if (wateringDropTone(index + 2000) !== batch) continue;
            const drop = wateringMicroDrop(head, time, index, profile);
            if (!drop) continue;
            const x = drop.x * px, y = drop.y * px, size = (.4 + (index % 7) * .07) * .7 * particleScale;
            context.moveTo(x + size, y); context.arc(x, y, size, 0, Math.PI * 2); context.closePath();
          }
          context.fill();
        }
        context.restore();
      }}/>;
}
