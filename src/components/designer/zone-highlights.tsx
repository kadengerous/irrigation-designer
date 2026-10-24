import { useEffect, useMemo, useRef, type RefObject } from "react";
import Konva from "konva";
import { Group, Shape } from "react-konva";
import type { Head } from "@/lib/project-types";
import { headSymbolScale, HEAD_SYMBOL_RADIUS } from "@/lib/head-presentation";
import { wateringDrop, wateringMicroDrop, wateringDropTone, wateringProfile, wateringParticleCount, wateringMicroParticleCount, wateringParticleBudget, wateringStreamCount, wateringStreamPath, wateringBubblerPaths, wateringBubblerDroplet, type WateringProfile } from "@/lib/watering-preview";

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

type RibbonPoint = { x: number; y: number; nx: number; ny: number; travel: number; width: number };
type PaintedDrop = { x: number; y: number; angle: number; travel: number; index: number; tone: number };

/** A filled ribbon follows the water already in flight, including turns and
 * interrupted streams at the edge of a partial sector. No boundary ray is added. */
function paintRibbon(context: Konva.Context, points: RibbonPoint[], widthScale: number, maxTravel: number, fadeFrom: number) {
  const visible = points.filter(point => point.travel <= maxTravel);
  if (visible.length < 2) return;
  const widthAt = (p: RibbonPoint) => {
    const fade = Math.max(0, Math.min(1, (p.travel - fadeFrom) / (maxTravel - fadeFrom)));
    return p.width * widthScale * (1 - fade * fade * (3 - 2 * fade));
  };
  for (let i = 0; i < visible.length; i++) {
    const p = visible[i], width = widthAt(p);
    if (i === 0) context.moveTo(p.x + p.nx * width, p.y + p.ny * width);
    else context.lineTo(p.x + p.nx * width, p.y + p.ny * width);
  }
  for (let i = visible.length - 1; i >= 0; i--) {
    const p = visible[i], width = widthAt(p);
    context.lineTo(p.x - p.nx * width, p.y - p.ny * width);
  }
  context.closePath();
}

/** A local discharge symbol has no engineering footprint. Fine connected
 * trickles replace expanding circles and dotted rings; none of the outlets rotate. */
function paintLocalBubbler(context: Konva.Context, head: Head, profile: WateringProfile, seconds: number, px: number) {
  const scale = Math.max(.6, Math.min(1.8, Math.sqrt(px / 36)));
  // The installed head is painted over the water. Keep several pixels of each
  // trickle visible beyond that real symbol, including in a distant plan view.
  const reach = (HEAD_SYMBOL_RADIUS + 2) * headSymbolScale(px)
    + (profile.bubblePattern === 'trickle' ? 10 : 17) * Math.max(.4, Math.min(1.6, Math.sqrt(px / 36)));
  const ribbons = wateringBubblerPaths(head, profile).map((path, lane) => path.map((p, i) => {
    const before = path[Math.max(0, i - 1)], after = path[Math.min(path.length - 1, i + 1)];
    const angle = Math.atan2(after.y - before.y, after.x - before.x);
    const ripple = .85 + .15 * Math.sin(seconds * 7 - p.travel * 12 + lane * 2.3);
    return { x: p.x * reach, y: p.y * reach, nx: -Math.sin(angle), ny: Math.cos(angle), travel: p.travel,
      width: (.24 + .18 * p.travel) * scale * ripple };
  }));
  for (const pass of [
    { width: 2, end: 1, fade: .7, color: 'rgba(36,164,217,.12)' },
    { width: 1, end: .96, fade: .7, color: 'rgba(22,155,209,.56)' },
    { width: .32, end: .86, fade: .64, color: 'rgba(200,244,255,.8)' },
  ]) {
    context.fillStyle = pass.color; context.beginPath();
    for (const ribbon of ribbons) paintRibbon(context, ribbon, pass.width, pass.end, pass.fade);
    context.fill();
  }
  const drops = Array.from({ length: wateringParticleCount(profile) }, (_, index) => {
    const drop = wateringBubblerDroplet(head, seconds, index, profile);
    return drop && { ...drop, index, tone: wateringDropTone(index) };
  }).filter((drop): drop is NonNullable<typeof drop> => drop !== null);
  for (let tone = 0; tone < 3; tone++) {
    context.fillStyle = ['rgba(29,151,202,.5)', 'rgba(73,191,228,.64)', 'rgba(205,245,255,.82)'][tone];
    context.beginPath();
    for (const drop of drops) {
      if (drop.tone !== tone) continue;
      const x = drop.x * reach, y = drop.y * reach, c = Math.cos(drop.angle), s = Math.sin(drop.angle);
      const width = Math.min(.35, (.10 + drop.index % 5 * .022) * scale);
      const length = (.36 + drop.index % 7 * .065) * scale;
      context.moveTo(x + c * length, y + s * length);
      context.lineTo(x - s * width, y + c * width);
      context.lineTo(x - c * length, y - s * length);
      context.lineTo(x + s * width, y - c * width);
      context.closePath();
    }
    context.fill();
  }
}

export function WateringHead({ head, elapsed, px }: { head: Head; elapsed: RefObject<number>; px: number }) {
  const profile = useMemo(() => wateringProfile(head), [head]);
  if (profile.kind === 'unknown' || !Number.isFinite(head.r) || !Number.isFinite(head.arc) || !Number.isFinite(head.start) || !Number.isFinite(px) || !(px > 0)) return null;
  return <Shape listening={false}
      perfectDrawEnabled={false} sceneFunc={context => {
        const time = elapsed.current;
        const particleScale = px / 36;
        const fan = profile.kind === 'fan' || profile.kind === 'square-fan' || profile.kind === 'strip-fan';
        const local = profile.kind === 'flood';
        const bubblerStream = profile.kind === 'streams' || profile.kind === 'dual';
        const rotor = profile.kind === 'rotor' || profile.kind === 'opposed';
        context.save();
        if (local) {
          paintLocalBubbler(context, head, profile, time, px);
          context.restore(); return;
        }
        // Clip painted edges as well as particle centers to the current footprint.
        if (!local) {
          context.beginPath();
          if (profile.footprint) {
            profile.footprint.forEach(({ x, y }, i) => {
              if (i === 0) context.moveTo(x * px, y * px); else context.lineTo(x * px, y * px);
            });
          } else if (profile.strip) {
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

        const ribbons: RibbonPoint[][] = [];
        const footprintSpan = Math.max(0, profile.strip ? Math.min(profile.strip.w, profile.strip.l) : head.r) * px;
        // Preserve readable cores when zoomed out, without overwhelming tiny
        // footprints. These screen widths never alter engineering geometry.
        const scaledWidth = (fan ? .22 : rotor ? Math.min(1.25, .44 + head.r * .026) : Math.min(.72, .27 + head.r * .04)) * particleScale * 1.9;
        const streamWidth = Math.min(footprintSpan * .035, Math.max(fan ? .42 : .82, scaledWidth));
        for (let lane = 0; lane < wateringStreamCount(head, profile); lane++) {
          const path = wateringStreamPath(head, time, profile, lane);
          let segment: RibbonPoint[] = [];
          for (let i = 0; i < path.length; i++) {
            const p = path[i];
            if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
              if (segment.length > 1) ribbons.push(segment);
              segment = []; continue;
            }
            const before = path[Math.max(0, i - 1)], after = path[Math.min(path.length - 1, i + 1)];
            const dx = (after?.x ?? p.x) - (before?.x ?? p.x), dy = (after?.y ?? p.y) - (before?.y ?? p.y);
            const angle = Math.atan2(dy, dx);
            const flare = Math.max(0, (p.travel - .58) / .42);
            // Coherent narrow core, then a widening, gently rippled breakup zone.
            const width = streamWidth * (.22 + .38 * p.travel + (fan ? .55 : 1) * flare * flare)
              * (1 + .11 * Math.sin(i * 1.35 - time * 12 + lane * 2.4));
            segment.push({ x: p.x * px, y: p.y * px, nx: -Math.sin(angle), ny: Math.cos(angle), travel: p.travel, width });
          }
          if (segment.length > 1) ribbons.push(segment);
        }
        // Shared fill paths keep many fine streams inexpensive; their cores and
        // translucent distal fringes read as flowing water, not solid spokes.
        for (const pass of [
          { width: 1.9, end: 1, fade: .72, color: fan ? 'rgba(48,165,213,.075)' : 'rgba(36,164,217,.085)' },
          { width: 1, end: .94, fade: .7, color: fan ? 'rgba(30,157,209,.21)' : 'rgba(22,155,209,.40)' },
          { width: .34, end: .84, fade: .64, color: fan ? 'rgba(195,241,252,.37)' : 'rgba(197,245,255,.76)' },
        ]) {
          context.fillStyle = pass.color; context.beginPath();
          for (const ribbon of ribbons) paintRibbon(context, ribbon, pass.width, pass.end, pass.fade);
          context.fill();
        }

        // Evaluate each sampled position once. Stratified population sampling
        // reaches every angular region without integer-stride lane aliasing.
        const budget = wateringParticleBudget(head, profile, px);
        const main: PaintedDrop[] = [];
        const mainPopulation = wateringParticleCount(profile);
        for (let sample = 0; sample < budget.main; sample++) {
          const index = Math.min(mainPopulation - 1, Math.floor((sample + .12 + .76 * ((sample * .61803398875) % 1)) * mainPopulation / budget.main));
          const drop = wateringDrop(head, time, index, profile);
          if (!drop) continue;
          const x = drop.x * px, y = drop.y * px;
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          main.push({ x, y, angle: profile.strip ? Math.atan2(drop.y, drop.x) : drop.angle, travel: drop.travel, index, tone: wateringDropTone(index) });
        }
        for (let batch = 0; batch < 3; batch++) {
          context.fillStyle = fan
              ? ['rgba(25,138,191,.32)', 'rgba(53,183,228,.43)', 'rgba(162,229,249,.59)'][batch]
              : ['rgba(23,130,183,.48)', 'rgba(39,177,226,.64)', 'rgba(169,235,252,.83)'][batch];
          context.beginPath();
          for (const drop of main) {
            if (drop.tone !== batch) continue;
            const { x, y, angle, index } = drop;
            const seed = ((index * 137) % 101) / 100;
            const size = bubblerStream ? Math.min(.5, (.14 + seed * .15) * particleScale)
              : (fan ? .20 + seed * .21 : .23 + seed * .32) * particleScale;
            // Four-point tapered flecks avoid costly curved paths for every drop.
            const length = size * (index % 5 === 0 ? 1 : bubblerStream ? 1.5 + seed : fan ? 1.5 + seed : 1.7 + seed * 2.3);
            const c = Math.cos(angle), s = Math.sin(angle);
            context.moveTo(x + c * length, y + s * length);
            context.lineTo(x - s * size, y + c * size);
            context.lineTo(x - c * length, y - s * length);
            context.lineTo(x + s * size, y - c * size);
            context.closePath();
          }
          context.fill();
        }

        const micro: { x: number; y: number; size: number; tone: number }[] = [];
        const microPopulation = wateringMicroParticleCount(profile);
        for (let sample = 0; sample < budget.micro; sample++) {
          const index = Math.min(microPopulation - 1, Math.floor((sample + .12 + .76 * ((sample * .754877666) % 1)) * microPopulation / budget.micro));
          const drop = wateringMicroDrop(head, time, index, profile);
          if (!drop) continue;
          const x = drop.x * px, y = drop.y * px;
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          const grain = index % 7;
          const size = Math.min(bubblerStream ? .48 : .9, footprintSpan * .025,
            Math.max(.22 + grain * .012, (.13 + grain * .022) * 1.65 * particleScale));
          micro.push({ x, y, size, tone: wateringDropTone(index + 2000) });
        }
        for (let batch = 0; batch < 3; batch++) {
          context.fillStyle = ['rgba(38,159,209,.46)', 'rgba(80,199,237,.67)', 'rgba(193,242,255,.84)'][batch];
          for (const drop of micro) {
            if (drop.tone !== batch) continue;
            const { x, y, size } = drop;
            // Subpixel flecks retain soft antialiased edges without one enormous
            // curved path; small independent fills scale to whole-zone previews.
            context.fillRect(x - size, y - size, size * 2, size * 2);
          }
        }
        context.restore();
      }}/>;
}
