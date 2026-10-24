import { specialFootprint } from "./equipment-footprint";
import { operatingGeometryAvailable } from "./flow";
import type { Head } from "./project-types";
import { catalogForHead, stripAtPressure, supportsArc, workingPressureBar } from "./equipment-catalog";

export type WateringProfile = {
  kind: "rotor" | "opposed" | "multi" | "fan" | "square-fan" | "strip-multi" | "strip-fan" | "streams" | "dual" | "flood" | "unknown";
  reaches: number[];
  footprint?: { x: number; y: number }[];
  strip?: { w: number; l: number; ox: number; oy: number };
  rotationSeconds?: number;
  fullCircleReversing?: boolean;
  timingBasis?: 'illustrative' | 'reference';
  bubblePattern?: 'trickle' | 'umbrella';
  phaseSeconds?: number;
};

/** Equipment geometry follows saved model data; artistic density/speed are not specifications.
 * Source mapping and exceptions: docs/watering-preview-sources.md. */
export function wateringProfile(head: Head): WateringProfile {
  const profile = modelWateringProfile(head);
  return { ...profile, phaseSeconds: wateringPhase(head, profile) };
}
function modelWateringProfile(head: Head): WateringProfile {
  const item = catalogForHead(head);
  const base = { reaches: [1], timingBasis: 'illustrative' as const };
  const hunterStreams=item?.manufacturerId==='hunter'&&(item.id.startsWith('MSBN-')||item.id==='5-CST-B');
  if (!item || !supportsArc(item, head.arc) || ![head.r,head.arc,head.start].every(Number.isFinite) || head.r<0 || item.coverageKind === "streams"&&!hunterStreams || item.type === "body" || item.family === "stream") return { ...base, kind: "unknown" };
  const pressure = head.designPressure ?? workingPressureBar(item, head.bodyId, head.nozzleId);
  // An illustrative picture still requires a supported operating pressure/nozzle.
  // This lookup validates the domain; it does not certify disputed flow values.
  if (!operatingGeometryAvailable(item,head)) return { ...base, kind: "unknown" };
  if(item.type==='rotor'&&head.arc===360&&item.fullCircleRotation==='unknown')return {...base,kind:'unknown'};
  if (item.coverageKind === "square") {
    const footprint = specialFootprint(head);
    return head.r > 0 && footprint ? { ...base, kind: "square-fan", footprint } : { ...base, kind: "unknown" };
  }
  const strip = stripAtPressure(item, pressure);
  if (item.strip && !strip) return { ...base, kind: "unknown" };
  if (strip) return { ...base, kind: item.family === "strip" ? "strip-multi" : "strip-fan", strip, rotationSeconds: 40 };
  if (item.family === "mp" || item.family === "mp800") return { ...base, reaches: [.4, .6, .8, 1], kind: "multi", rotationSeconds: 40 };
  if (["spray", "he", "fixed", "short"].includes(item.family)) return { ...base, kind: "fan",
    // U-Series has two stationary outlets. The secondary reach is illustrative,
    // not a second footprint or an additional hydraulic discharge.
    reaches:item.manufacturerId==='rain-bird'&&item.series==='U-Series'?[1,.55]:[1] };
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
    fullCircleReversing:item.fullCircleRotation==='reversing'||item.manufacturerId==='toro'&&item.series==='T5 RapidSet',
    timingBasis: 'illustrative' };
}

export function wateringParticleCount(profile: WateringProfile) {
  return profile.kind === "unknown" ? 0 : profile.kind === "flood" ? 96 : (profile.kind === "fan" || profile.kind === "square-fan") ? 2640 : profile.kind === "strip-fan" ? 2592 : 1620;
}

/** Fine breakup texture, not a manufacturer droplet count or misting model. */
export function wateringMicroParticleCount(profile:WateringProfile){
  if(profile.kind==='unknown'||profile.kind==='flood')return 0;
  if(profile.kind==='streams'||profile.kind==='dual')return 900;
  return ['fan','square-fan','strip-fan'].includes(profile.kind)?5760:
    ['multi','strip-multi'].includes(profile.kind)?7200:5400;
}

/** Bound painting work by visible footprint area, without changing mechanics.
 * Sample indexes across the whole population so every stream retains texture. */
export function wateringParticleBudget(head:Head,profile:WateringProfile,px:number){
  if(!(px>0)||!Number.isFinite(px)||profile.kind==='unknown')return {main:0,micro:0};
  if(profile.kind==='flood')return {main:96,micro:0};
  const area=profile.strip?profile.strip.w*profile.strip.l:
    (profile.kind==='square-fan'?4:Math.PI)*head.r*head.r*Math.min(360,Math.max(0,head.arc))/360;
  const detail=Math.max(.04,Math.min(1,area*px*px/40000));
  const spray=['fan','square-fan','strip-fan'].includes(profile.kind);
  return {main:Math.min(wateringParticleCount(profile),Math.ceil((spray?1440:600)*detail)),
    micro:Math.ceil(wateringMicroParticleCount(profile)*detail)};
}

/** Counts/reach layers are drawing parameters; the catalog supplies the actual footprint. */
export function wateringStreamCount(head:Head,profile:WateringProfile){
  switch(profile.kind){
    case 'multi':return 24;
    case 'strip-multi':return 12;
    case 'rotor':case 'opposed':return profile.reaches.length;
    case 'streams':return Math.max(3,Math.ceil(Math.max(0,head.arc)/30));
    case 'dual':return 2;
    case 'fan':case 'square-fan':return 48*profile.reaches.length;
    case 'strip-fan':return 96;
    default:return 0;
  }
}

type StreamPoint={x:number;y:number;travel:number};

/** A stream is a continuous history of water emission, rather than a rigid ray.
 * Null samples mask inactive rotating outlets at the sector edge: never connect
 * their last visible position to the next revolution or draw a boundary spike. */
export function wateringStreamPath(head:Head,seconds:number,profile:WateringProfile,lane:number):Array<StreamPoint|null>{
  const flight=wateringFlightSeconds(head);
  return Array.from({length:33},(_,i)=>{
    const travel=i/32,jet=streamEndpoint(head,seconds-travel*flight,profile,lane);
    return jet?streamPosition(head,profile,jet,travel):null;
  });
}

function streamPosition(head:Head,profile:WateringProfile,jet:{x:number;y:number},travel:number):StreamPoint{
  let x=jet.x*travel,y=jet.y*travel;
  if(profile.strip){
    const a=head.start*Math.PI/180,c=Math.cos(a),s=Math.sin(a),strip=profile.strip;
    const xx=Math.max(strip.ox,Math.min(strip.ox+strip.l,x*c+y*s));
    const yy=Math.max(strip.oy,Math.min(strip.oy+strip.w,-x*s+y*c));
    x=xx*c-yy*s;y=xx*s+yy*c;
  }
  return {x,y,travel};
}

function streamEndpoint(head:Head,seconds:number,profile:WateringProfile,lane:number){
  const count=wateringStreamCount(head,profile);
  if(lane<0||lane>=count)return null;
  const arc=Math.max(0,Math.min(360,head.arc)),kind=profile.kind;
  const emitted=seconds+wateringPhase(head,profile);
  let offset=0,reach=Math.max(0,head.r);
  if(profile.strip){
    const strip=profile.strip,u=fraction(lane/count+(kind==='strip-multi'?emitted/(profile.rotationSeconds??40):0))*4;
    const edge=Math.floor(u),part=u-edge;
    const x=strip.ox+strip.l*(edge===0?part:edge===1?1:edge===2?1-part:0);
    const y=strip.oy+strip.w*(edge===0?0:edge===1?part:edge===2?1:1-part);
    const a=head.start*Math.PI/180;
    return {x:x*Math.cos(a)-y*Math.sin(a),y:x*Math.sin(a)+y*Math.cos(a)};
  }
  if(kind==='multi'){
    offset=fraction(emitted/(profile.rotationSeconds??40)+lane/count)*360;
    if(offset>arc)return null;
    reach*=profile.reaches[lane%profile.reaches.length]??1;
  }else if(kind==='fan'||kind==='square-fan'){
    offset=(lane%48+.5)/48*arc;
    if(kind==='square-fan')reach=squareRayReach(head.r,offset);
    reach*=profile.reaches[Math.floor(lane/48)]??1;
  }else if(kind==='streams'||kind==='dual')offset=lane*arc/(arc>=360?count:count-1);
  else{
    offset=wateringAngle(0,arc,emitted,profile.rotationSeconds,profile.fullCircleReversing);
    if(kind==='opposed'&&lane>0)offset+=180;
    offset=arc>=360?fraction(offset/360)*360:Math.min(arc,offset);
    reach*=profile.reaches[lane]??1;
  }
  const a=(head.start+offset)*Math.PI/180;
  return {x:Math.cos(a)*reach,y:Math.sin(a)*reach};
}

/** Screen-local bubbler glyph coordinates, never metres or a wetted radius.
 * The outlets stay fixed; only the water travelling along them is animated. */
export function wateringBubblerPaths(head: Head, profile: WateringProfile): StreamPoint[][] {
  if (profile.kind !== 'flood') return [];
  const count = profile.bubblePattern === 'trickle' ? 7 : 14;
  return Array.from({ length: count }, (_, lane) => Array.from({ length: 17 }, (_, i) =>
    localBubblerPoint(head, profile, lane, i / 16)));
}

/** Local, fine breakup stays beside a fixed outlet. Independently hashed travel
 * phases avoid the rotating dotted rings produced by correlated polar samples. */
export function wateringBubblerDroplet(head: Head, seconds: number, index: number, profile: WateringProfile) {
  if (profile.kind !== 'flood') return null;
  const count = profile.bubblePattern === 'trickle' ? 7 : 14;
  const lane = index % count;
  const speed = (profile.bubblePattern === 'trickle' ? .65 : .95) * (.8 + bubblerNoise(index + 700) * .4);
  const travel = .22 + .78 * fraction(seconds * speed + bubblerNoise(index + 1200));
  const p = localBubblerPoint(head, profile, lane, travel);
  const angle = Math.atan2(p.y, p.x), spread = (bubblerNoise(index + 1900) - .5) * .045 * travel * travel;
  return { x: p.x - Math.sin(angle) * spread, y: p.y + Math.cos(angle) * spread, angle, travel };
}

function bubblerNoise(index: number) {
  let hash = Math.imul(index + 1, 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function localBubblerPoint(head: Head, profile: WateringProfile, lane: number, travel: number): StreamPoint {
  const count = profile.bubblePattern === 'trickle' ? 7 : 14;
  const angle = head.start * Math.PI / 180 + wateringPhase(head, profile) * .13
    + lane * Math.PI * 2 / count + Math.sin(travel * Math.PI) * .045 * Math.sin(lane * 1.81);
  const reach = .72 + bubblerNoise(lane + 300) * .2;
  return { x: Math.cos(angle) * reach * travel, y: Math.sin(angle) * reach * travel, travel };
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
    let offset = wateringAngle(0, arc, seconds + wateringPhase(head, profile), profile.rotationSeconds,profile.fullCircleReversing);
    if (profile.kind === "opposed" && lane > 0) offset += 180;
    offset = arc >= 360 ? fraction(offset / 360) * 360 : Math.min(arc, offset);
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

/** Partial sectors reverse; full circles follow the product's documented mechanism. */
export function wateringAngle(start: number, arc: number, seconds: number, rotationSeconds = 75,fullCircleReversing=false): number {
  const sweep = Math.max(0, Math.min(360, arc));
  if (!sweep) return start;
  const degrees = seconds * 360 / Math.max(1, rotationSeconds);
  if (sweep >= 360&&!fullCircleReversing) return start + fraction(degrees / 360) * 360;
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
  const fan=['fan','square-fan','strip-fan'].includes(profile.kind);
  const bubbler=profile.kind==='streams'||profile.kind==='dual';
  let point:StreamPoint,reach=head.r;
  if(!fan){
    const count=wateringStreamCount(head,profile),lane=index%count;
    // Retain each stream's flight history while fine spray spreads away from
    // it. Most breakup remains distal, with extra particles between the lanes.
    const phase=fraction(seconds/wateringFlightSeconds(head)+index*.61803398875);
    const travel=.14+.86*Math.pow(phase,.44);
    const jet=streamEndpoint(head,seconds-travel*wateringFlightSeconds(head),profile,lane);
    if(!jet)return null;
    point=streamPosition(head,profile,jet,travel);
    reach=Math.hypot(jet.x,jet.y);
  }else{
    const drop=profileDrop(head,seconds,index*7%wateringParticleCount(profile),profile);
    if(!drop)return null;
    point=drop;
  }

  // Two broad layers and one close breakup layer, independently sampled per
  // lane. Cartesian drift gives droplets radial AND sideways trajectories;
  // this is illustrative texture, not a change in the hydraulic coverage.
  const wide=!bubbler&&Math.floor(index/wateringStreamCount(head,profile))%3!==0;
  const direction=fraction(index*.754877666)*Math.PI*2;
  const scatter=Math.sqrt(fraction(index*.56984029+.37))*point.travel*point.travel;
  const start=head.start*Math.PI/180,c=Math.cos(start),s=Math.sin(start);
  let x=point.x*c+point.y*s,y=-point.x*s+point.y*c;
  if(profile.strip){
    const strip=profile.strip;
    x+=Math.cos(direction)*scatter*strip.l*(wide?.13:.009);
    y+=Math.sin(direction)*scatter*strip.w*(wide?.20:.014);
    // Reject overflow instead of accumulating particles along a clipped edge.
    if(x<strip.ox||x>strip.ox+strip.l||y<strip.oy||y>strip.oy+strip.w)return null;
  }else{
    const width=reach*(bubbler?.014:wide?(fan?.10:.22):.018)*scatter;
    x+=Math.cos(direction)*width;y+=Math.sin(direction)*width;
    const arc=Math.max(0,Math.min(360,head.arc));
    const angle=fraction(Math.atan2(y,x)/(Math.PI*2))*360;
    if(arc<360&&angle>arc&&angle<360-1e-7)return null;
    if(profile.kind==='square-fan'){
      if(Math.abs(x)>head.r||Math.abs(y)>head.r)return null;
    }else if(x*x+y*y>head.r*head.r)return null;
  }
  return {x:x*c-y*s,y:x*s+y*c,travel:point.travel};
}

/** SQ throw is the perpendicular distance to a side, not the corner distance.
 * Its quarter/half/three-quarter angular domain omits the corresponding quadrants. */
function squareRayReach(radius: number, offsetDeg: number) {
  const a = offsetDeg * Math.PI / 180;
  return Math.max(0, radius) / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
}

function profileDrop(head: Head, seconds: number, index: number, profile: WateringProfile) {
  // Independent angular lanes and radial strata prevent diagonal holes in sprays.
  const fan = profile.kind === "fan" || profile.kind === "square-fan";
  const lane = index % 48;
  const phase = fraction(seconds / .95 + lane * .41421356237);
  const travel = fan
    ? index >= 2592
      ? .99 + .01 * phase // A moving outer band makes the full throw clearly visible.
      : Math.sqrt(fraction(seconds / wateringFlightSeconds(head) + (Math.floor(index / 48) + lane * .41421356237) / 54))
    : fraction(seconds / wateringFlightSeconds(head) + index * .61803398875);
  const arc = Math.max(0, Math.min(360, head.arc));
  let offset = 0, reach = Math.max(0, head.r);
  const kind = profile.kind;
  if (kind === "unknown") return null;
  if(!fan&&kind!=='strip-fan'&&kind!=='flood'){
    const jet=streamEndpoint(head,seconds-travel*wateringFlightSeconds(head),profile,index%wateringStreamCount(head,profile));
    if(!jet)return null;
    const point=streamPosition(head,profile,jet,travel);
    return {...point,angle:Math.atan2(jet.y,jet.x)};
  }
  if (profile.strip) {
    const s = profile.strip;
    // Endpoints stay in the actual pressure-dependent strip, in local coordinates.
    const lane = index % 96;
    const u = lane / 96 * 4;
    const edge = Math.floor(u), part = u - edge;
    const endX = s.ox + s.l * (edge === 0 ? part : edge === 1 ? 1 : edge === 2 ? 1 - part : 0);
    const endY = s.oy + s.w * (edge === 0 ? 0 : edge === 1 ? part : edge === 2 ? 1 : 1 - part);
    const x = Math.max(s.ox, Math.min(s.ox + s.l, endX * travel));
    const y = Math.max(s.oy, Math.min(s.oy + s.w, endY * travel));
    const angle = head.start * Math.PI / 180;
    return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle), angle, travel };
  }
  if (kind === "fan" || kind === "square-fan") {
    offset = (lane + .5) / 48 * arc;
    if (kind === "square-fan") reach = squareRayReach(head.r, offset);
  } else if (kind === "flood") {
    offset = fraction(index * .61803398875) * 360;
    reach = 0; // Local bubbling symbol, not an invented engineering radius.
  }
  const angle = (head.start + offset) * Math.PI / 180;
  const distance = reach * travel;
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, angle, travel };
}
