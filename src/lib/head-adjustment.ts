import { headFlow, nearestPressure, performanceAt, pressureRange, pressureSteps, radiusRange } from "@/lib/flow";
import type { CatalogItem } from "@/lib/hunter-catalog";
import type { Head } from "@/lib/project-types";

export function usesAutomaticNozzle(item: CatalogItem) {
  return item.type === "rotor" && item.nozzles.length > 1;
}

type Range = { min: number; max: number };
function envelope(ranges: (Range | null)[]): Range | null {
  const known = ranges.filter((range): range is Range => range != null);
  return known.length ? { min: Math.min(...known.map(r => r.min)), max: Math.max(...known.map(r => r.max)) } : null;
}

/** Sliders span the available rack, so a radius change can select another nozzle. */
export function headParameterRanges(item: CatalogItem, head: Pick<Head, "nozzleId" | "arc" | "designPressure">) {
  const ids = usesAutomaticNozzle(item) ? item.nozzles.map(n => n.id) : [head.nozzleId];
  return {
    pressure: pressureRange(item, head.nozzleId, head.arc),
    radius: envelope(ids.map(id => radiusRange(item, id, head.designPressure, head.arc))),
  };
}

/** Keep the ruler fixed when pressure changes; the store still enforces the current physical limits. */
export function headRadiusScale(item: CatalogItem, head: Pick<Head, "nozzleId" | "arc">) {
  const ids = usesAutomaticNozzle(item) ? item.nozzles.map(n => n.id) : [head.nozzleId];
  return envelope(ids.flatMap(id => pressureSteps(item, id, head.arc)
    .map(bar => radiusRange(item, id, bar, head.arc))));
}

/** Keep the requested geometry/pressure; use the prior water-per-area as a nozzle-selection target. */
export function fitAutomaticNozzle(item: CatalogItem, head: Head, reference: Head = head): Head {
  const priorFlow = reference.catalogId === item.id && reference.r > 0 && reference.arc > 0 ? headFlow(reference).lpm : null;
  const candidates = item.nozzles.flatMap(nozzle => {
    const pressure = pressureRange(item, nozzle.id, head.arc);
    if (!pressure) return [];
    const requestedPressure = Number.isFinite(head.designPressure) ? head.designPressure : item.recommendedPressureBar;
    const designPressure = nearestPressure(pressureSteps(item, nozzle.id, head.arc), requestedPressure)!;
    const radius = radiusRange(item, nozzle.id, designPressure, head.arc);
    if (!radius) return [];
    const requestedRadius = Number.isFinite(head.r) ? head.r : radius.max;
    const r = Math.max(radius.min, Math.min(radius.max, requestedRadius));
    // Rotor flow is independent of arc. A larger watered sector therefore needs
    // more flow to maintain the previous application rate; never scale a table's actual flow.
    const targetFlow = priorFlow == null ? null : priorFlow * head.arc / reference.arc * (r / reference.r) ** 2;
    const actualFlow = performanceAt(item, nozzle.id, designPressure, head.arc)!.row.flowLMin;
    return [{ nozzleId: nozzle.id, designPressure, r, score: [
      Math.abs(designPressure - requestedPressure),
      Math.abs(r - requestedRadius),
      targetFlow != null && targetFlow > 0 ? Math.abs(actualFlow - targetFlow) / targetFlow : 0,
      (radius.max - r) / radius.max,
      nozzle.id === head.nozzleId ? 0 : 1,
    ] }];
  });
  candidates.sort((a, b) => {
    for (let i = 0; i < a.score.length; i++) {
      const diff = a.score[i]! - b.score[i]!;
      if (Math.abs(diff) > 1e-8) return diff;
    }
    return a.nozzleId.localeCompare(b.nozzleId);
  });
  const best = candidates[0];
  return best ? { ...head, nozzleId: best.nozzleId, designPressure: best.designPressure, r: best.r, needsReview: false } : head;
}
