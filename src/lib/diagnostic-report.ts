import type { Issue, IssueLevel } from './check-project';

/** Presentation only: never combine geometry or lose a directed diagnostic link. */
export function diagnosticReportCards(issues: Issue[]) {
  const levels: IssueLevel[] = ['error', 'warn', 'info'];
  const unique = [...new Map(issues.map(issue => [issue.id, issue])).values()];
  const numbered = unique.map((issue, index) => ({ ...issue, reportNumber: index + 1 }));
  return levels.map(level => {
    const groups = new Map<string, Issue[]>();
    for (const issue of numbered.filter(issue => issue.level === level)) {
      groups.set(issue.titleKey, [...(groups.get(issue.titleKey) ?? []), issue]);
    }
    return { level, count: numbered.filter(issue => issue.level === level).length,
      groups: [...groups].map(([titleKey, entries]) => ({ titleKey, entries,
        headIds: [...new Set(entries.flatMap(issue => issue.headIds))],
        zoneIds: [...new Set(entries.flatMap(issue => issue.zoneIds))] })) };
  });
}
