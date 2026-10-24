import descriptions from '@/data/equipment/descriptions.json';

// Exact model assignments keep fixed/full-circle variants out of adjustable-only
// descriptions. These sources describe use; hydraulic provenance stays separate.
const byModel = new Map(descriptions.entries.flatMap(entry =>
  entry.modelIds.map(id => [id, entry] as const)));

export function equipmentDescription(id: string) {
  return byModel.get(id);
}
