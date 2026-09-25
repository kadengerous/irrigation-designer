import { headFlow } from "@/lib/flow";
import { drawingOrMigrate } from './cad/engine';
import { figureAtPoint, irrigationFigures } from './irrigation-figures';
import { itemById, workingPressureBar } from "@/lib/hunter-catalog";
import { defaultZones, zoneLabel, renumberProjectZones, MAX_ZONES, type Head, type Project, type Zone } from "@/lib/project-types";

/** Typical 1″ valve / household tap if the source flow is unknown. */
export const DEFAULT_ZONE_LPM = 50;

const VALVE_LOSS_BAR = 0.2;
const FILTER_LOSS_BAR = 0.1;
const LATERAL_LOSS_BAR = 0.3;
const Q_SPARE = 1.1;

export function defaultMaxZoneLpm(availableLpm: number | null | undefined): number {
  return availableLpm && availableLpm > 0 ? availableLpm : DEFAULT_ZONE_LPM;
}

export function projectZoneLimit(project: Project): number {
  const chosen = project.zoneFlowLimitLpm;
  const available = project.water.availableLpm;
  const limit = chosen != null && Number.isFinite(chosen) && chosen > 0 ? chosen : defaultMaxZoneLpm(available);
  return available != null && available > 0 ? Math.min(limit, available) : limit;
}

/** Fill space in compatible earlier zones without changing sprinkler settings or plant assignments. */
export function redistributeZonesAfterRemoval(project: Project): Project {
  const limit = projectZoneLimit(project);
  const zones = [...project.zones].sort((a, b) => a.id - b.id);
  const plantZones = new Set(Object.values(project.drawing?.plants ?? {}).map(p => p.irrigation?.zoneId));
  const protectedZones = new Set(zones.filter(z => z.locked || z.hidden || plantZones.has(z.id) ||
    project.heads.some(h => h.zone === z.id && h.locked)).map(z => z.id));
  const heads = [...project.heads];
  const flows = new Map(heads.map(h => [h.id, headFlow(h).lpm]));
  const keys = new Map(heads.map(h => [h.id, hydroKey(h)]));
  for (let i = 1; i < zones.length; i++) {
    const source = zones[i]!;
    if (protectedZones.has(source.id)) continue;
    const moving = heads.filter(h => h.zone === source.id && h.zoneAssignment !== 'manual')
      .sort((a, b) => (flows.get(b.id) ?? 0) - (flows.get(a.id) ?? 0));
    for (const head of moving) {
      const q = flows.get(head.id);
      if (q == null) continue;
      const target = zones.slice(0, i).find(z => {
        if (protectedZones.has(z.id) || z.figureId !== source.figureId) return false;
        const members = heads.filter(h => h.zone === z.id);
        // Do not renumber existing zones merely to reuse an empty slot.
        return members.length > 0 && members.every(h => keys.get(h.id) === keys.get(head.id) && flows.get(h.id) != null) &&
          members.reduce((sum, h) => sum + flows.get(h.id)!, 0) + q <= limit + 1e-8;
      });
      if (target) heads[heads.findIndex(h => h.id === head.id)] = { ...head, zone: target.id };
    }
  }
  const occupied = new Set(heads.map(h => h.zone));
  const remaining = zones.filter(z => occupied.has(z.id) || protectedZones.has(z.id));
  return renumberProjectZones({ ...project, heads, zones: remaining.length ? remaining : defaultZones() });
}

/** Group key: precipitation class + pressure band so mixed MP/spray/rotor never share a zone. */
export function hydroKey(h: Head): string {
  const item = itemById(h.catalogId);
  if (headFlow(h).lpm == null) return `unknown|${h.id}`;
  const precip = item?.precipClass ?? "unknown";
  const p = headWorkingBar(h);
  const band = p >= 3.2 ? "p35" : p >= 2.45 ? "p28" : "p21";
  return `${precip}|${band}`;
}

export function headWorkingBar(h: Head): number {
  const item = itemById(h.catalogId);
  return h.designPressure ?? (item ? workingPressureBar(item, h.bodyId, h.nozzleId) : 2.8);
}

export function zoneFlow(heads: Head[], zoneId: number): number | null {
  let q = 0;
  for (const h of heads) {
    if (h.zone !== zoneId) continue;
    const value = headFlow(h).lpm;
    if (value == null) return null;
    q += value;
  }
  return q;
}

/** Required pressure at the sprinklers; pipe losses are accounted for separately. */
export function zonePressure(heads: Head[], zoneId: number): number | null {
  let bar = 0;
  for (const h of heads) {
    if (h.zone !== zoneId) continue;
    const pressure = headWorkingBar(h);
    if (!itemById(h.catalogId) || !Number.isFinite(pressure) || pressure <= 0) return null;
    bar = Math.max(bar, pressure);
  }
  return bar;
}

export function distributeZones(heads: Head[], maxLpm: number): { heads: Head[]; zones: Zone[] } {
  if (!heads.length) return { heads, zones: defaultZones() };
  const limit = Math.max(5, maxLpm);
  const groups = new Map<string, Head[]>();
  for (const h of heads) {
    const k = hydroKey(h);
    const arr = groups.get(k) ?? [];
    arr.push(h);
    groups.set(k, arr);
  }
  let zid = 1;
  const out: Head[] = [];
  const zones: Zone[] = [];
  for (const [, arr] of groups) {
    const packed = [...arr].sort((a, b) => (headFlow(b).lpm ?? Infinity) - (headFlow(a).lpm ?? Infinity));
    let acc = 0;
    let local = zid;
    for (const h of packed) {
      const q = headFlow(h).lpm ?? Infinity;
      if (acc + q > limit && acc > 0) {
        local += 1;
        acc = 0;
      }
      acc += q;
      out.push({ ...h, zone: local });
    }
    zid = local + 1;
  }
  const ids = [...new Set(out.map((h) => h.zone))].sort((a, b) => a - b).slice(0, MAX_ZONES);
  for (const id of ids) {
    zones.push({ id, name: `Zone ${id}`, hidden: false, locked: false });
  }
  if (!zones.length) return { heads: out, zones: defaultZones() };
  return { heads: out.map((h) => (ids.includes(h.zone) ? h : { ...h, zone: ids[0]! })), zones };
}

export function assignZoneForNewHead(
  project: Project,
  head: Head,
  activeZoneId: number,
  maxLpm: number,
): { zoneId: number; zones: Zone[] } {
  const limit = Math.max(5, maxLpm);
  const key = hydroKey(head);
  const q = headFlow(head).lpm;
  const figures = irrigationFigures(drawingOrMigrate(project));
  const figureId = figureAtPoint(head, figures)?.id;
  // Upgrade legacy zones only when all their members unambiguously belong to one figure.
  const zones = (project.zones.length ? project.zones : defaultZones()).map(z => {
    if (z.figureId) return z;
    const members = project.heads.filter(h => h.zone === z.id);
    const ids = new Set(members.map(h => figureAtPoint(h,figures)?.id));
    return members.length && ids.size === 1 && !ids.has(undefined) ? { ...z, figureId: [...ids][0] } : z;
  });
  return pickZone(project, limit, key, q, zones, activeZoneId, figureId);
}

function pickZone(
  project: Project,
  limit: number,
  key: string,
  q: number | null,
  zones: Zone[],
  activeId?: number,
  figureId?: string,
): { zoneId: number; zones: Zone[] } {
  const fits = (id: number) => {
    const zone = zones.find(z => z.id === id);
    if (!zone || zone.locked || zone.hidden) return false;
    const members = project.heads.filter((h) => h.zone === id);
    if (zone.figureId !== figureId && (zone.figureId || members.length)) return false;
    if (!members.length) return true;
    if (q == null) return false;
    if (members.some(h => hydroKey(h) !== key)) return false;
    const existingQ = zoneFlow(project.heads, id);
    return existingQ != null && existingQ + q <= limit + 0.05;
  };
  const assign = (id: number) => ({ zoneId: id, zones: zones.map(z => z.id === id && figureId && !z.figureId ? { ...z, figureId } : z) });
  const own = zones.find(z => z.figureId === figureId && fits(z.id));
  if (activeId != null && zones.find(z => z.id === activeId)?.figureId === figureId && fits(activeId)) return assign(activeId);
  if (own) return assign(own.id);
  const existing = zones.find(z => fits(z.id));
  if (existing) return assign(existing.id);
  // Never silently place in an incompatible figure when the zone limit is reached.
  if (zones.length >= MAX_ZONES) return { zoneId: 0, zones };
  const id = Math.max(0, ...zones.map((z) => z.id)) + 1;
  return { zoneId: id, zones: [...zones, { id, name: '', nameKind: 'generated', figureId, hidden: false, locked: false }] };
}

export type PumpRec = {
  qLpm: number;
  qM3h: number;
  pBar: number;
  headM: number;
  zoneMaxLpm: number;
  workingBar: number;
  lossBar: number;
  elevBar: number;
  stations: number;
  zoneId: number;
  zoneName: string;
  pressureZoneName: string;
};

export function recommendPump(project: Project): PumpRec | null {
  if (!project.heads.length) return null;
  const byZone = new Map<number, Head[]>();
  for (const h of project.heads) {
    const arr = byZone.get(h.zone) ?? [];
    arr.push(h);
    byZone.set(h.zone, arr);
  }
  let zoneMaxLpm = 0;
  let workingBar = 0;
  let zoneId = project.zones[0]?.id ?? 1;
  let pressureZoneId = zoneId;
  for (const [id, hs] of byZone) {
    const q = zoneFlow(hs, id), p = zonePressure(hs, id);
    if (q == null || p == null) return null;
    if (p > workingBar) { workingBar = p; pressureZoneId = id; }
    if (q > zoneMaxLpm) {
      zoneMaxLpm = q;
      zoneId = id;
    }
  }
  const elevBar = Math.max(0, project.water.elevationM ?? 0) * 0.0981;
  const lossBar = VALVE_LOSS_BAR + FILTER_LOSS_BAR + LATERAL_LOSS_BAR;
  const pBar = workingBar + elevBar + lossBar;
  const qLpm = zoneMaxLpm * Q_SPARE;
  const zoneName = zoneLabel(project.zones.find((z) => z.id === zoneId) ?? { id: zoneId, name: "" });
  return {
    qLpm,
    qM3h: qLpm * 0.06,
    pBar,
    headM: pBar * 10.2,
    zoneMaxLpm,
    workingBar,
    lossBar,
    elevBar,
    stations: byZone.size,
    zoneId,
    zoneName,
    pressureZoneName: zoneLabel(project.zones.find(z => z.id === pressureZoneId) ?? { id: pressureZoneId, name: "" }),
  };
}
