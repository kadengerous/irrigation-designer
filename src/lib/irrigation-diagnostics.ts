import {equipmentTechnology} from './equipment-library';
import { catalogForHead, supportsArc, bodyForHead, defaultNozzle, itemById, mountingKind, popUpHeights, nozzleTablePressure } from "./equipment-catalog";
import { headFlow, performanceAt, pressureRange, radiusRange } from "./flow";
import { significantHeadPairs, directedReach, dryOnHeadLink } from './head-to-head';
import { coverageRuleFor } from './coverage-rules';
import type { Head, Project, Pt } from "./project-types";
import { CURVE_TOLERANCE_M, GEOMETRY_EPS, cleanCoverageSurface, cleanSurface, headSurface, intersectSurface, irrigationSurfaces,
  pointInSurface, subtractSurface, surfaceArea, unionSurfaces, type Surface } from "./irrigation-geometry";

export type IssueLevel = "error" | "warn" | "info";
export type DiagnosticMetric = { key: string; value: number; kind: "length" | "area" | "flow" | "pressure" | "precipitation" | "count";
  model?: string; approximate?: boolean };
export type Issue = {
  id: string; level: IssueLevel; titleKey: string; detailKey: string;
  zoneIds: number[]; headIds: string[]; metrics: DiagnosticMetric[];
  area?: Surface; line?: { a: Pt; b: Pt }; sources?: string[];
  direction?: { fromHeadId:string; toHeadId:string; inSector:boolean };
  resolved?: boolean;
  reportNumber?: number;
};

export const HUNTER_CHECK_SOURCES = {
  guide: "https://www.hunterirrigation.com/sites/default/files/design_guide_Residential_System_LIT-226-US.pdf",
  mp10: "https://www.hunterirrigation.com/irrigation-product/mp-rotator/standard-mp-rotatorr-nozzle",
  mp20: "https://www.hunterirrigation.com/irrigation-product/mp-rotator/mp-rotatorr-mp800-nozzle",
};
const unique = <T,>(values: T[]) => [...new Set(values)];
const isFinitePositive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const metric = (key: string, value: number, kind: DiagnosticMetric["kind"], approximate = false): DiagnosticMetric => ({ key, value, kind, approximate });

/** Language-free data. Checks never mutate geometry, selection, names, units or history. */
export function checkProject(project: Project): Issue[] {
  const issues: Issue[] = [], heads = project.heads;
  const add = (id: string, level: IssueLevel, titleKey: string, detailKey: string, affected: Head[] = [], extra: Partial<Issue> = {}) => {
    const issue = { id, level, titleKey, detailKey, headIds: affected.map(h => h.id), zoneIds: unique(affected.map(h => h.zone)), metrics: [], ...extra };
    issue.zoneIds = issue.zoneIds.filter(id => project.zones.some(z => z.id === id));
    issues.push(issue);
  };
  const calibrated = !project.underlay || project.scaleCalibrated;
  if (!calibrated) add("scale", "error", "diagScale", "diagScaleDetail");
  if (!heads.length) add("no-heads", "info", "diagNoHeads", "diagNoHeadsDetail");
  let target: Surface = [], geometryReady = false;
  const footprints = new Map<string, Surface>();
  try {
    const regions = irrigationSurfaces(project);
    target = regions.target;
    for (const h of heads) footprints.set(h.id, headSurface(h));
    geometryReady = target.length > 0 && calibrated;
    if (!target.length) add("no-target", "info", "diagDataMissing", "diagTargetMissing");
    const pointHeads = heads.filter(h => catalogForHead(h)?.coverageKind === "point");
    if (regions.unmodeled.length || pointHeads.length) add("point-irrigation", "info", "diagDataMissing", "diagPointCoverage", pointHeads, { area: regions.unmodeled });
    if (geometryReady) {
      // All zones participate in one union. Expanded arcs compensate only the 2 mm tessellation error.
      const wet = unionSurfaces(heads.map(h => headSurface(h, CURVE_TOLERANCE_M * 1.01)));
      const dry = cleanCoverageSurface(subtractSurface(target, wet));
      const unknownGeometry = heads.filter(h => !footprints.get(h.id)?.length);
      const grouped = new Map<string, { zones: number[]; area: Surface }>();
      for (const component of target) {
        const gaps = cleanSurface(intersectSurface(dry, [component]));
        if (!gaps.length) continue;
        // Shared land belongs to all participating zones; do not invent ownership of unassigned land.
        const zones = unique(heads.filter(h => pointInSurface(h, [component]) || surfaceArea(intersectSurface(footprints.get(h.id) ?? [], [component])) > GEOMETRY_EPS).map(h => h.zone)).sort((a, b) => a - b);
        const key = zones.join(":"), group = grouped.get(key) ?? { zones, area: [] };
        group.area.push(...gaps); grouped.set(key, group);
      }
      for (const [key, group] of grouped) add(`dry-${key || "project"}`, unknownGeometry.length ? "info" : "error",
        unknownGeometry.length ? "diagCoverageUnknown" : "diagMapDry", unknownGeometry.length ? "diagCoverageUnknownDetail" : "diagDryDetail", [],
        { zoneIds: group.zones, area: group.area, metrics: [metric("diagRegions", group.area.length, "count"), metric("area", surfaceArea(group.area), "area", true)] });
      for (const z of project.zones) {
        const zh = heads.filter(h => h.zone === z.id);
        const culprit = zh.filter(h => surfaceArea(subtractSurface(footprints.get(h.id) ?? [], target)) > GEOMETRY_EPS);
        const outside = cleanSurface(subtractSurface(unionSurfaces(culprit.map(h => footprints.get(h.id) ?? [])), target));
        if (outside.length) add(`over-${z.id}`, "warn", "diagOverspray", "diagOversprayDetail", culprit,
          { area: outside, metrics: [metric("area", surfaceArea(outside), "area", true), metric("diagOutsideHeads", culprit.length, "count")] });
      }
      const unknownRules=heads.filter(h=>{const item=catalogForHead(h);return item&&item.coverageRuleId!=='mp-corner-supplement'&&coverageRuleFor(item,h.nozzleId)!=='HEAD_TO_HEAD';});
      if(unknownRules.length)add('coverage-rules','info','diagDataMissing','diagRuleMissing',unknownRules,{sources:unique(unknownRules.map(h=>catalogForHead(h)!.coverageRuleSource!).filter(Boolean))});
      for(const pair of significantHeadPairs(project,target))for(const [h,neighbor] of [pair,[pair[1],pair[0]]] as const){
        const reach=directedReach(h,neighbor);if(reach.reached)continue;
        const linkDry=dryOnHeadLink(h,neighbor,dry),confirmed=linkDry.length>0&&!unknownGeometry.length;
        const item=catalogForHead(h)!;
        add(`h2h-${h.id}-${neighbor.id}`,confirmed?'error':'warn','diagOverlap',!reach.inSector?'diagDirectionDetail':confirmed?'diagOverlapDryDetail':'diagOverlapWetDetail',[h,neighbor],{
          line:{a:{x:h.x,y:h.y},b:{x:neighbor.x,y:neighbor.y}},direction:{fromHeadId:h.id,toHeadId:neighbor.id,inSector:reach.inSector},
          area:confirmed?linkDry:undefined,
          metrics:[metric('diagDistance',reach.distance,'length'),metric('radius',h.r,'length'),metric('diagShortage',reach.deficit,'length'),metric('workingPressure',nozzleTablePressure(item,h.designPressure),'pressure')],
          sources:[item.coverageRuleSource||HUNTER_CHECK_SOURCES.guide],
        });
      }
    }
  } catch {
    geometryReady = false;
    // A failed operation must not leave a partial, apparently authoritative geometric diagnosis.
    for (let i = issues.length - 1; i >= 0; i--) if (/^(dry-|over-|h2h-)/.test(issues[i]!.id)) issues.splice(i, 1);
    add("geometry-unavailable", "info", "diagDataMissing", "diagGeometryMissing");
  }

  for (const h of heads) {
    const item = catalogForHead(h);
    if (!item) { add(`model-${h.id}`, "info", "diagDataMissing", "verifyModel", [h]); continue; }
    const nozzle = h.nozzleId ? item.nozzles.find(n => n.id === h.nozzleId) : defaultNozzle(item);
    const source = nozzle?.sourceUrl || item.sourceUrl;
    const extra: Partial<Issue> = { sources: source ? [source] : [] };
    const working=nozzleTablePressure(item,h.designPressure);
    const pressure = pressureRange(item,h.nozzleId,h.arc);
    const min = pressure?.min ?? null, max = pressure?.max ?? null;
    if (!isFinitePositive(working) || min != null && max != null && (working < min - GEOMETRY_EPS || working > max + GEOMETRY_EPS)) {
      add(`p-${h.id}`, "error", "diagPressure", "diagPressureDetail", [h], { ...extra, metrics: [
        ...(Number.isFinite(working) ? [metric("workingPressure", working, "pressure")] : []),
        ...(min != null && max != null ? [metric("diagMinimum", min, "pressure"), metric("diagMaximum", max, "pressure")] : [])] });
    }
    const row = performanceAt(item, h.nozzleId, h.designPressure, h.arc)?.row;
    if (!row) add(`table-${h.id}`, "info", "diagDataMissing", "diagTableMissing", [h], extra);
    const minRadius=['toro','k-rain'].includes(item.manufacturerId??'')?radiusRange(item,h.nozzleId,working,h.arc)?.min:row?.radiusMinM;
    if (row && !item.strip && item.coverageKind !== "point" && (!isFinitePositive(h.r) || h.r > row.radiusM + GEOMETRY_EPS || minRadius != null && h.r < minRadius - GEOMETRY_EPS)) {
      add(`r-${h.id}`, "error", "diagRadius", "diagRadiusDetail", [h], { ...extra, metrics: [metric("radius", h.r, "length"),
        metric("diagMaximum", row.radiusM, "length"), ...(minRadius != null ? [metric("diagMinimum", minRadius, "length")] : [])] });
    }
    if (!supportsArc(item,h.arc)) {
      add(`arc-${h.id}`, "error", "diagSectorRange", "diagSectorRangeDetail", [h], extra);
    }
    const body = bodyForHead(item, h.bodyId, h.popUpMm, h.bodySnapshot);
    if (mountingKind(item) === "spray" && !body) add(`body-${h.id}`, "warn", "checkBody", "diagBodyDetail", [h], extra);
    // PRS30 is a valid MP option. Recommended nozzle pressure is not a mandatory minimum.
    if (body?.regulatedPressureBar != null && working > nozzleTablePressure(item,body.regulatedPressureBar) + GEOMETRY_EPS) {
      add(`body-pressure-${h.id}`, "warn", "diagRegulator", "diagRegulatorDetail", [h], {
        sources: [body.sourceUrl], metrics: [metric("workingPressure", working, "pressure"), metric("diagMaximum", nozzleTablePressure(item,body.regulatedPressureBar), "pressure")] });
    }
    if (item.type === "rotor" && item.popUpOptions?.length && h.popUpMm != null && !popUpHeights(item).includes(h.popUpMm)) {
      add(`body-height-${h.id}`, "warn", "checkRotorHeight", "diagBodyDetail", [h], extra);
    }
    if (!project.zones.some(z => z.id === h.zone)) add(`unassigned-${h.id}`, "error", "diagUnassigned", "diagUnassignedDetail", [h], { zoneIds: [] });
  }

  const available = project.water.availableLpm;
  const availableKnown = available != null && Number.isFinite(available) && available >= 0;
  if (heads.length && !availableKnown) add("source-flow", "info", "diagDataMissing", "diagSourceMissing");
  const runoffData = project.meta.soil.trim() && Number.isFinite(project.meta.slopePct) && project.meta.slopePct != null && project.meta.slopePct >= 0 && isFinitePositive(project.meta.infiltrationMmHr);
  if (heads.length && !runoffData) add("runoff-data", "info", "diagDataMissing", "diagRunoffMissing");
  for (const z of project.zones) {
    const zh = heads.filter(h => h.zone === z.id);
    if (!zh.length) { add(`empty-${z.id}`, "info", "zoneIsEmpty", "diagNoHeadsDetail", [], { zoneIds: [z.id] }); continue; }
    const classes = unique(zh.map(h => {const item=catalogForHead(h);return item?.strip?undefined:item?.precipClass;}));
    if (classes.includes("mp10") && classes.includes("mp20")) {
      const involved = zh.filter(h => !catalogForHead(h)?.strip && ["mp10", "mp20"].includes(catalogForHead(h)?.precipClass ?? ""));
      add(`mix-${z.id}`, "error", "diagMixed", "diagSplitZones", involved, { sources: [HUNTER_CHECK_SOURCES.mp10, HUNTER_CHECK_SOURCES.mp20],
        metrics: [{ ...metric("precipRate", 10, "precipitation", true), model: "MP Rotator Standard" }, { ...metric("precipRate", 20, "precipitation", true), model: "MP800" }] });
    }
    const fixed = zh.filter(h => !!catalogForHead(h)&&equipmentTechnology(catalogForHead(h)!)==='spray');
    const rotating = zh.filter(h => !!catalogForHead(h)&&['rotary','rotor'].includes(equipmentTechnology(catalogForHead(h)!)));
    if (fixed.length && rotating.length) add(`mix-type-${z.id}`, "error", "diagMixedTypes", "diagMixedTypesDetail", [...fixed, ...rotating], { sources: [HUNTER_CHECK_SOURCES.guide] });
    const flows = zh.map(headFlow);
    const rates = zh.map((h, i) => ({ head: h, value: flows[i]!.precipMmHr })).filter(row => row.value != null);
    const matched = classes.length === 1 && (classes[0] === "mp10" || classes[0] === "mp20");
    if (!matched && !(fixed.length && rotating.length) && !(classes.includes("mp10") && classes.includes("mp20")) && (new Set(rates.map(row => row.value)).size > 1 || zh.length>1&&zh.some(h=>catalogForHead(h)?.strip))) {
      const entries = new Map<string, DiagnosticMetric>();
      for (const { head: h, value } of rates) {
        const model = [h.catalogId, h.nozzleId].filter(Boolean).join(" · ");
        entries.set(`${model}:${value}`, { ...metric("precipRate", value!, "precipitation", true), model });
      }
      add(`precip-review-${z.id}`, "info", "diagRateReview", "diagRateReviewDetail", zh, {
        metrics: [...entries.values()], sources: unique(zh.map(h => catalogForHead(h)?.sourceUrl).filter((url): url is string => !!url)) });
    }
    const known = flows.every(flow => flow.lpm != null && Number.isFinite(flow.lpm));
    const estimated = flows.some(flow => flow.kind === "interpolated" || flow.kind === "matched-precip");
    const q = flows.reduce((sum, f) => sum + (f.lpm ?? 0), 0);
    if (!known) add(`flow-data-${z.id}`, "info", "diagDataMissing", "diagFlowMissing", zh.filter((_, i) => flows[i]!.lpm == null));
    if (known && availableKnown && q > available + GEOMETRY_EPS) add(`zone-q-${z.id}`, "error", "diagFlow", estimated ? "diagFlowEstimateDetail" : "diagFlowDetail", zh, {
      sources: [HUNTER_CHECK_SOURCES.guide], metrics: [metric("diagRequired", q, "flow", estimated), metric("diagAvailable", available, "flow"), metric("diagExcess", q - available, "flow", estimated)] });
    // Site-specific intake is supplied by the designer, never guessed from a soil label or slope.
    // MP nominal matched rates are documented; other layouts need a verified application rate.
    if (runoffData) {
      const rates = zh.map(h => { const item = catalogForHead(h); const c = item?.strip?undefined:item?.precipClass; return c === "mp10" ? 10 : c === "mp20" ? 20 : null; });
      const runoffHeads = zh.filter((_, i) => rates[i] != null && rates[i]! > project.meta.infiltrationMmHr!);
      if (runoffHeads.length) add(`runoff-${z.id}`, "warn", "diagRunoff", "diagRunoffDetail", runoffHeads, { sources: [HUNTER_CHECK_SOURCES.mp10, HUNTER_CHECK_SOURCES.mp20],
        metrics: [metric("precipRate", Math.max(...rates.filter(r => r != null)), "precipitation", true), metric("diagInfiltration", project.meta.infiltrationMmHr!, "precipitation")] });
      if (rates.some(r => r == null)) add(`runoff-rate-${z.id}`, "info", "diagDataMissing", "diagRunoffRateMissing", zh);
    }
  }
  if (geometryReady && heads.length) add("coverage-basis", "info", "diagCoverageBasis", "diagCoverageBasisDetail", [], {
    metrics: [metric("area", surfaceArea(target), "area", true)], sources: [HUNTER_CHECK_SOURCES.guide] });
  return issues;
}
