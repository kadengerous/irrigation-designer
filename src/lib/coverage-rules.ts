import type { CatalogItem, CatalogNozzle } from './hunter-catalog';

export type CoverageRule = 'HEAD_TO_HEAD' | 'SPECIAL' | 'CUSTOM';
export const COVERAGE_RULE_SOURCES = {
  mp: 'https://www.hunterirrigation.com/en-metric/support/mp-rotator-installation',
  corner: 'https://www.hunterirrigation.com/sites/default/files/2024-08/LIT-461-RevJ-DG-MPR-EM-web.pdf',
  residential: 'https://www.hunterirrigation.com/sites/default/files/design_guide_Residential_System_LIT-226-US.pdf',
};

/** A catalog policy is not inferred from the current amount of geometric overlap. */
export function modelCoveragePolicy(item: CatalogItem): { coverageRule:CoverageRule; coverageRuleSource:string; coverageRuleId:string } {
  if(item.id==='MP-CORNER') return {coverageRule:'SPECIAL',coverageRuleId:'mp-corner-supplement',coverageRuleSource:COVERAGE_RULE_SOURCES.corner};
  if(item.strip) return {coverageRule:'SPECIAL',coverageRuleId:'strip-layout',coverageRuleSource:item.family==='strip'?COVERAGE_RULE_SOURCES.corner:item.sourceUrl};
  if(['mp','mp800','spray','he','fixed','short'].includes(item.family) || ['PGJ','SRM','PGP-ADJ','PGP-ULTRA','I-20','I-20-SS'].includes(item.id))
    return {coverageRule:'HEAD_TO_HEAD',coverageRuleId:'standard-spacing',coverageRuleSource:['mp','mp800'].includes(item.family)?COVERAGE_RULE_SOURCES.mp:COVERAGE_RULE_SOURCES.residential};
  // Specialty turf, golf and bubbler layouts must not inherit a residential rule.
  return {coverageRule:'CUSTOM',coverageRuleId:item.coverageKind==='point'?'point-application':'unverified-layout',coverageRuleSource:item.sourceUrl};
}
export function coverageRuleFor(item:CatalogItem, nozzleId?:string|null):CoverageRule {
  const nozzle:CatalogNozzle|undefined=item.nozzles.find(n=>n.id===nozzleId);
  return nozzle?.coverageRule ?? item.coverageRule ?? 'CUSTOM';
}
