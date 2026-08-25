import { headFlow } from "@/lib/flow";
import { itemById, workingPressureBar } from "@/lib/hunter-catalog";
import { defaultZones, MAX_ZONES, type Head, type Project, type Zone } from "@/lib/project-types";

/** Typical 1″ valve / household tap if the source flow is unknown. */
export const DEFAULT_ZONE_LPM = 50;

const VALVE_LOSS_BAR = 0.2;
const FILTER_LOSS_BAR = 0.1;
const LATERAL_LOSS_BAR = 0.3;
const Q_SPARE = 1.1;

export function defaultMaxZoneLpm(availableLpm: number | null | undefined): number {
  return availableLpm && availableLpm > 0 ? availableLpm : DEFAULT_ZONE_LPM;
}

/** Group key: precipitation class + pressure band so mixed MP/spray/rotor never share a zone. */
export function hydroKey(h: Head): string {
  const item = itemById(h.catalogId);
  const precip = item?.precipClass ?? "unknown";
  const p = item ? workingPressureBar(item, h.bodyId, h.nozzleId) : 2.8;
  const band = p >= 3.2 ? "p35" : p >= 2.45 ? "p28" : "p21";
  return `${precip}|${band}`;
}

export function headWorkingBar(h: Head): number {
  const item = itemById(h.catalogId);
  return item ? workingPressureBar(item, h.bodyId, h.nozzleId) : 2.8;
}

function zoneFlow(heads: Head[], zoneId: number): number {
  let q = 0;
  for (const h of heads) {
    if (h.zone !== zoneId) continue;
    q += headFlow(h).lpm ?? 8;
  }
  return q;
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
    const packed = [...arr].sort((a, b) => (headFlow(b).lpm ?? 8) - (headFlow(a).lpm ?? 8));
    let acc = 0;
    let local = zid;
    for (const h of packed) {
      const q = headFlow(h).lpm ?? 8;
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
    zones.push({ id, name: `Зона ${id}`, hidden: false, locked: false });
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
  const q = headFlow(head).lpm ?? 8;
  const zones = project.zones.length ? project.zones : defaultZones();
  return pickZone(project, limit, key, q, zones, activeZoneId);
}

function pickZone(
  project: Project,
  limit: number,
  key: string,
  q: number,
  zones: Zone[],
  activeId?: number,
): { zoneId: number; zones: Zone[] } {
  const fits = (id: number) => {
    const members = project.heads.filter((h) => h.zone === id);
    if (members.length && hydroKey(members[0]!) !== key) return false;
    return zoneFlow(project.heads, id) + q <= limit + 0.05;
  };
  if (activeId != null && fits(activeId)) return { zoneId: activeId, zones };
  const existing = zones.find((z) => fits(z.id));
  if (existing) return { zoneId: existing.id, zones };
  if (zones.length >= MAX_ZONES) return { zoneId: zones[0]!.id, zones };
  const id = Math.max(0, ...zones.map((z) => z.id)) + 1;
  return { zoneId: id, zones: [...zones, { id, name: `Зона ${id}`, hidden: false, locked: false }] };
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
  for (const [id, hs] of byZone) {
    let q = 0;
    let p = 0;
    for (const h of hs) {
      q += headFlow(h).lpm ?? 8;
      p = Math.max(p, headWorkingBar(h));
    }
    workingBar = Math.max(workingBar, p);
    if (q > zoneMaxLpm) {
      zoneMaxLpm = q;
      zoneId = id;
    }
  }
  const elevBar = Math.max(0, project.water.elevationM ?? 0) * 0.0981;
  const lossBar = VALVE_LOSS_BAR + FILTER_LOSS_BAR + LATERAL_LOSS_BAR;
  const pBar = workingBar + elevBar + lossBar;
  const qLpm = zoneMaxLpm * Q_SPARE;
  const zoneName = project.zones.find((z) => z.id === zoneId)?.name ?? `Зона ${zoneId}`;
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
  };
}
