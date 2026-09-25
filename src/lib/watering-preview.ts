import type { Head } from "./project-types";
import { itemById, stripAtPressure } from "./hunter-catalog";

export type WateringProfile = {
  kind: "rotor" | "opposed" | "multi" | "fan" | "strip-multi" | "strip-fan" | "streams" | "dual" | "flood" | "unknown";
  reaches: number[];
  strip?: { w: number; l: number; ox: number; oy: number };
  rotationSeconds?: number;
  timingBasis?: 'illustrative' | 'reference';
  bubblePattern?: 'trickle' | 'umbrella';
  phaseSeconds?: number;
};

/** Family mechanics verified against Hunter; artistic density/speed are not specifications.
 * Source mapping and exceptions: docs/watering-preview-sources.md. */
export function wateringProfile(head: Head): WateringProfile {
  const profile = modelWateringProfile(head);
  return { ...profile, phaseSeconds: wateringPhase(head, profile) };
}
function modelWateringProfile(head: Head): WateringProfile {
  const item = itemById(head.catalogId);
  const base = { reaches: [1], timingBasis: 'illustrative' as const };
  if (!item || item.type === "body" || item.family === "stream") return { ...base, kind: "unknown" };
  const strip = stripAtPressure(item, head.designPressure);
  if (strip) return { ...base, kind: item.family === "strip" ? "strip-multi" : "strip-fan", strip, rotationSeconds: 40 };
  if (item.family === "mp" || item.family === "mp800") return { ...base, kind: "multi", rotationSeconds: 40 };
  if (["spray", "he", "fixed", "short"].includes(item.family)) return { ...base, kind: "fan" };
  if (item.type === "bubbler") {
    if (item.id === "5-CST-B" || /MSBN-.*V$/.test(item.id)) return { ...base, kind: "dual" };
    return { ...base, kind: item.id.startsWith("MSBN-") ? "streams" : "flood",
      bubblePattern: /^(PCN|PCB)-(25|50)(-R)?$/.test(item.id) ? 'trickle' : 'umbrella' };
  }
  const opposed = /-ON$/.test(item.id) || item.id === "G-80-B";
  const secondary = /^I-(?:80|90)/.test(item.id) || item.family === "golf";
  // ST reference: 80 s / 180° at 90 psi (6.2 bar), maximum speed, not a pressure curve.
  const stReference = item.id === 'ST-1600';
  return { kind: opposed ? "opposed" : "rotor", reaches: secondary ? [1, .65, .35] : opposed ? [1, .65] : [1],
    rotationSeconds: stReference ? 160 : item.family === 'st' ? 120 : item.family === 'golf' ? 90 : 75,
    timingBasis: 'illustrative' };
}

export function wateringParticleCount(profile: WateringProfile) {
  return profile.kind === "unknown" ? 0 : profile.kind === "flood" ? 96 : profile.kind === "fan" ? 2640 : profile.kind === "strip-fan" ? 2592 : 1620;
}

/** Stable per-drop color, independent of stream lane, distance and shape. */
export function wateringDropTone(index: number): number {
  let hash = Math.imul(index + 1, 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return ((hash ^ (hash >>> 16)) >>> 0) % 3;
}

/** Jet endpoints use the current radius, never a catalog/default throw. */
export function wateringJets(head: Head, seconds: number, profile: WateringProfile) {
  if (profile.kind !== "rotor" && profile.kind !== "opposed") return [];
  const arc = Math.max(0, Math.min(360, head.arc));
  return profile.reaches.map((reach, lane) => {
    let offset = wateringAngle(0, arc, seconds + wateringPhase(head, profile), profile.rotationSeconds);
    if (profile.kind === "opposed" && lane > 0) offset += 180;
    offset = arc >= 359 ? fraction(offset / 360) * 360 : Math.min(arc, offset);
    return { angle: (head.start + offset) * Math.PI / 180, reach: Math.max(0, head.r) * reach };
  });
}

const fraction = (n: number) => ((n % 1) + 1) % 1;

/** Stable phase prevents all installed heads starting/reversing in lockstep. */
export function wateringPhase(head: Head, profile: WateringProfile) {
  if (profile.phaseSeconds != null) return profile.phaseSeconds;
  let hash = 2166136261;
  for (const letter of head.id) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296 * (profile.rotationSeconds ?? 75);
}

/** Visual flight duration, not a pressure/ballistics performance prediction. */
export function wateringFlightSeconds(head: Head) { return Math.max(.4, Math.min(3.2, .4 + Math.sqrt(Math.max(0, head.r)) * .35)); }

export function wateringJetPath(head: Head, seconds: number, profile: WateringProfile, lane: number) {
  const flight = wateringFlightSeconds(head);
  return Array.from({ length: 33 }, (_, index) => {
    const travel = index / 32, jet = wateringJets(head, seconds - travel * flight, profile)[lane];
    return jet ? { x: Math.cos(jet.angle) * jet.reach * travel, y: Math.sin(jet.angle) * jet.reach * travel } : { x: 0, y: 0 };
  });
}

/** A visual preview, not a hydraulic simulation. Never mutates project data. */
export function wateringHeads(heads: Head[], headId: string | null): Head[] {
  return headId == null ? heads : heads.filter(head => head.id === headId);
}

/** Full circles rotate continuously; partial sectors reverse at their boundaries. */
export function wateringAngle(start: number, arc: number, seconds: number, rotationSeconds = 75): number {
  const sweep = Math.max(0, Math.min(360, arc));
  if (!sweep) return start;
  const degrees = seconds * 360 / Math.max(1, rotationSeconds);
  if (sweep >= 360) return start + fraction(degrees / 360) * 360;
  const position = fraction(degrees / (2 * sweep)) * 2 * sweep;
  return start + (position <= sweep ? position : 2 * sweep - position);
}

export function wateringDrop(head: Head, seconds: number, index: number, profile?: WateringProfile) {
  if (profile) return profileDrop(head, seconds, index, profile);
  const travel = ((seconds / .95 + index / 32) % 1 + 1) % 1;
  const emittedAt = seconds - travel * .95;
  const offset = Math.max(0, Math.min(head.arc, wateringAngle(0, head.arc, emittedAt) + (index % 3 - 1) * 2));
  const angle = (head.start + offset) * Math.PI / 180;
  const distance = Math.max(0, head.r) * travel;
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, angle, travel };
}

/** Fine visual spray between the main streams, clipped to the same footprint. */
export function wateringMicroDrop(head: Head, seconds: number, index: number, profile: WateringProfile) {
  if (profile.kind === "unknown" || profile.kind === "flood") return null;
  const drop = profileDrop(head, seconds, index * 7 % wateringParticleCount(profile), profile);
  if (!drop) return null;
  const jitter = fraction(index * .754877666 + drop.travel * .13) - .5;
  const start = head.start * Math.PI / 180;
  if (profile.strip) {
    const s = profile.strip, c = Math.cos(start), sn = Math.sin(start);
    const x = Math.max(s.ox, Math.min(s.ox + s.l, drop.x * c + drop.y * sn + jitter * s.l * .12));
    const y = Math.max(s.oy, Math.min(s.oy + s.w, -drop.x * sn + drop.y * c + jitter * s.w * .25));
    return { x: x * c - y * sn, y: x * sn + y * c };
  }
  const arc = Math.max(0, Math.min(360, head.arc));
  const spread = profile.kind === "multi" ? 30 : profile.kind === "fan" ? arc / 48 : 14;
  let offset = (drop.angle - start) * 180 / Math.PI + jitter * spread;
  offset = arc >= 359 ? fraction(offset / 360) * 360 : Math.max(0, Math.min(arc, offset));
  const angle = start + offset * Math.PI / 180, distance = Math.min(Math.max(0, head.r), Math.hypot(drop.x, drop.y));
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
}

function profileDrop(head: Head, seconds: number, index: number, profile: WateringProfile) {
  // Independent angular lanes and radial strata prevent diagonal holes in sprays.
  const fan = profile.kind === "fan";
  const lane = index % 48;
  const phase = fraction(seconds / .95 + lane * .41421356237);
  const travel = fan
    ? index >= 2592
      ? .99 + .01 * phase // A moving outer band makes the full throw clearly visible.
      : Math.sqrt(fraction(seconds / wateringFlightSeconds(head) + (Math.floor(index / 48) + lane * .41421356237) / 54))
    : fraction(seconds / wateringFlightSeconds(head) + index * .61803398875);
  const emitted = seconds - travel * wateringFlightSeconds(head) + wateringPhase(head, profile);
  const scatter = (fraction(index * .754877666) - .5) * 1.8;
  const arc = Math.max(0, Math.min(360, head.arc));
  let offset = 0, reach = Math.max(0, head.r);
  const kind = profile.kind;
  if (kind === "unknown") return null;
  if (profile.strip) {
    const s = profile.strip;
    // Endpoints stay in the actual pressure-dependent strip, in local coordinates.
    const lane = kind === "strip-multi" ? index % 8 : index % 96;
    // Trace the rectangle perimeter continuously: streams never teleport across the bed.
    const u = fraction(lane / (kind === 'strip-multi' ? 8 : 96) + (kind === 'strip-multi' ? emitted / (profile.rotationSeconds ?? 40) : 0)) * 4;
    const edge = Math.floor(u), part = u - edge;
    const endX = s.ox + s.l * (edge === 0 ? part : edge === 1 ? 1 : edge === 2 ? 1 - part : 0);
    const endY = s.oy + s.w * (edge === 0 ? 0 : edge === 1 ? part : edge === 2 ? 1 : 1 - part);
    const x = Math.max(s.ox, Math.min(s.ox + s.l, endX * travel));
    const y = Math.max(s.oy, Math.min(s.oy + s.w, endY * travel));
    const angle = head.start * Math.PI / 180;
    return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle), angle, travel };
  }
  if (kind === "multi") {
    const stream = index % 12;
    offset = fraction(emitted / (profile.rotationSeconds ?? 40) + stream / 12) * 360;
    if (offset > arc) return null;
    reach *= [.48, .74, 1][Math.floor(index / 12) % 3]!;
  } else if (kind === "fan") {
    offset = (lane + .5) / 48 * arc;
  } else if (kind === "streams" || kind === "dual") {
    const count = kind === "dual" ? 2 : Math.max(3, Math.ceil(arc / 30));
    offset = (index % count) * arc / (arc >= 359 ? count : count - 1);
  } else if (kind === "flood") {
    offset = fraction(index * .61803398875) * 360;
    reach = 0; // Local bubbling symbol, not an invented engineering radius.
  } else {
    offset = wateringAngle(0, arc, emitted, profile.rotationSeconds) + scatter * travel * travel;
    const lane = index % profile.reaches.length;
    if (kind === "opposed" && lane > 0) offset += 180;
    if (arc >= 359) offset = fraction(offset / 360) * 360;
    else offset = Math.max(0, Math.min(arc, offset));
    reach *= profile.reaches[lane]!;
  }
  const angle = (head.start + offset) * Math.PI / 180;
  const distance = reach * travel;
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, angle, travel };
}
