import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import "./irrigation-check.css";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, Crosshair, Info, ListChecks } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { checkProject, type Issue, type IssueLevel } from "@/lib/check-project";
import { liveDiagnosticIssue, formatDiagnosticMetric, useDiagnosticFocus } from "@/lib/diagnostic-focus";
import { formatNumber, tr, type Locale } from "@/lib/i18n";
import { localeDirection } from "@/lib/locale-config";
import { zoneLabel, type Project } from "@/lib/project-types";
import { itemById } from "@/lib/hunter-catalog";
import { catalogName, nozzleName } from "@/lib/catalog-localization";
import { flowLabel, fromLpm, precipitationUnit, lenLabel, toLpm, type UnitPrefs } from "@/lib/units";
import { LocalizedNumberInput } from "./localized-number-input";
import { COVERAGE_HATCHES } from "@/lib/diagnostic-coverage";
import { diagnosticReportCards } from "@/lib/diagnostic-report";

const LEVEL_KEY = { error: "diagErrors", warn: "diagWarnings", info: "diagInformation" } as const;
function headDescription(project: Project, id: string) {
  const index = project.heads.findIndex(head => head.id === id), head = project.heads[index];
  const item = head && itemById(head.catalogId), nozzle = item?.nozzles.find(n => n.id === head.nozzleId);
  const name = item ? `${catalogName(item)}${nozzle && item.type === 'rotor' ? ` (${nozzleName(nozzle)})` : ''}` : head?.catalogId ?? id;
  return `${name}${index >= 0 ? ` · #${formatNumber(index + 1, 0)}` : ''}`;
}
export function DiagnosticLegend({ locale }: { locale: Locale }) {
  return <section className="diagnostic-legend" aria-label={tr(locale, "diagMapLegend")}>
    <h4>{tr(locale, "diagMapLegend")}</h4>
    {COVERAGE_HATCHES.map(hatch => <div className="diagnostic-legend-row" key={hatch.id}>
      <span className="diagnostic-hatch-swatch" style={{ "--hatch-color": hatch.color } as React.CSSProperties} aria-hidden="true"/>
      <span>{tr(locale, hatch.key)}</span>
    </div>)}
  </section>;
}
export function IrrigationCheckButton({ project, section, locale, onClick }: { project: Project; section: string; locale: Locale; onClick: () => void }) {
  if (section !== "irrigation" || !project.zones.length) return null;
  return <button type="button" className="diagnostic-check-trigger" onClick={onClick} title={tr(locale, "checkIrrigation")} aria-label={tr(locale, "checkIrrigation")}><ListChecks/><span>{tr(locale, "checkIrrigation")}</span></button>;
}
function LevelIcon({ level }: { level: IssueLevel }) {
  const Icon = level === "error" ? AlertCircle : level === "warn" ? AlertTriangle : Info;
  return <Icon aria-hidden="true" className="diagnostic-level-icon" />;
}
export function DiagnosticDetails({ issue, units, locale, project }: { issue: Issue; units: UnitPrefs; locale: Locale; project:Project }) {
  const describe = (id: string) => headDescription(project, id);
  return <>
    {issue.reportNumber != null && <p className="diagnostic-reference"><bdi>#{formatNumber(issue.reportNumber, 0)}</bdi></p>}
    {issue.direction && <p className="diagnostic-reason" dir="ltr"><bdi>A: {describe(issue.direction.fromHeadId)}</bdi> → <bdi>B: {describe(issue.direction.toHeadId)}</bdi></p>}
    {!issue.direction && !!issue.headIds.length && <p className="diagnostic-models">{issue.headIds.map(id => <bdi key={id}>{describe(id)}</bdi>)}</p>}
    <p className="diagnostic-reason">{tr(locale, issue.detailKey)}</p>
    {!!issue.metrics.length && <dl className="diagnostic-metrics">{issue.metrics.map((m, index) => <div key={index}>
      <dt>{m.model ? <bdi>{m.model}</bdi> : tr(locale, m.key)}</dt><dd><bdi>{formatDiagnosticMetric(m, units)}</bdi></dd>
    </div>)}</dl>}
  </>;
}

/** Pure report component shared by every workspace and exercised in all twenty locales. */
export function IrrigationReport({ project, issues, units, locale, filter, onFilter, onSelect }: {
  project: Project; issues: Issue[]; units: UnitPrefs; locale: Locale; filter: "all" | "error" | "warn";
  onFilter: (filter: "all" | "error" | "warn") => void; onSelect: (issue: Issue) => void;
}) {
  const t = (key: string) => tr(locale, key);
  const counts = { error: issues.filter(i => i.level === "error").length, warn: issues.filter(i => i.level === "warn").length, info: issues.filter(i => i.level === "info").length };
  const incomplete = issues.some(i => i.level === "info" && i.id !== "coverage-basis");
  const cards = diagnosticReportCards(issues);
  const zones = (ids: number[]) => ids.map(id => project.zones.find(zone => zone.id === id)).filter(zone => zone != null).map(zone => zoneLabel(zone)).join(' · ') || t('diagWholeProject');
  return <div className="irrigation-report" lang={locale} dir={localeDirection(locale)}>
    <section className="diagnostic-summary" aria-label={t("diagSummary")}>
      <div className="diagnostic-totals" role="status">
        {(["error", "warn", "info"] as const).map(level => <span key={level} data-level={level}><LevelIcon level={level}/><strong>{formatNumber(counts[level], 0)}</strong>{t(level === "error" ? "diagErrors" : level === "warn" ? "diagWarnings" : "diagInformation")}</span>)}
      </div>
      {!counts.error && !counts.warn && !incomplete && <p className="diagnostic-passed"><CheckCircle2/>{t("noIssues")}</p>}
      {incomplete && <p className="diagnostic-limited"><Info/>{t("diagLimited")}</p>}
      <p className="diagnostic-help">{t("diagSelectHint")}</p>
    </section>
    <div className="diagnostic-filters" role="group" aria-label={t("diagFilter")}>
      {(["all", "error", "warn"] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => onFilter(value)}>
        {t(value === "all" ? "diagAll" : value === "error" ? "diagErrors" : "diagWarnings")}
        <span>{formatNumber(value === "all" ? issues.length : counts[value], 0)}</span>
      </button>)}
    </div>
    <div className="diagnostic-groups">
      {cards.filter(card => filter === 'all' || card.level === filter).map(card => <section className="diagnostic-group diagnostic-severity-card" data-level={card.level} key={card.level} aria-labelledby={`diagnostic-${card.level}`}>
        <h3 id={`diagnostic-${card.level}`}><LevelIcon level={card.level}/><span>{t(LEVEL_KEY[card.level])}</span><b>{formatNumber(card.count, 0)}</b></h3>
        {!card.count && <p className="diagnostic-empty">{t('diagFilterEmpty')}</p>}
        {card.groups.map(group => <details className="diagnostic-category" key={group.titleKey}>
          <summary><span className="diagnostic-title">{t(group.titleKey)} <span className="diagnostic-category-count">({formatNumber(group.entries.length, 0)})</span></span>
            <span className="diagnostic-shared">{zones(group.zoneIds)}</span>
            {!!group.headIds.length && <span className="diagnostic-models">{[...new Set(group.headIds.map(id => {
              const head = project.heads.find(h => h.id === id), item = head && itemById(head.catalogId);
              return item ? catalogName(item) : head?.catalogId ?? id;
            }))].map(name => <bdi key={name}>{name}</bdi>)}</span>}
            <span className="diagnostic-expand">{t('details')}<ChevronRight aria-hidden="true"/></span>
          </summary>
          {group.entries.map(issue => <button className="diagnostic-issue" data-level={issue.level} data-issue-id={issue.id} key={issue.id} type="button" onClick={() => onSelect(issue)}>
            <bdi className="diagnostic-reference">#{formatNumber(issue.reportNumber!, 0)}</bdi>
            <span className="diagnostic-issue-content">
              {!!issue.headIds.length && <span className="diagnostic-entry-models">{issue.headIds.map((id, index) => <span key={id}>{index > 0 && (issue.direction ? ' → ' : ' · ')}<bdi>{headDescription(project, id)}</bdi></span>)}</span>}
              <span className="diagnostic-shared">{zones(issue.zoneIds)}</span>
              <span className="diagnostic-reason">{t(issue.detailKey)}</span>
              <span className="diagnostic-locate"><Crosshair/>{t(issue.headIds.length || issue.area?.length || issue.line ? 'diagShowOnPlan' : 'details')}</span>
            </span>
          </button>)}
        </details>)}
      </section>)}
    </div>
  </div>;
}

function DiagnosticInputs({ project, locale, units }: { project: Project; locale: Locale; units: UnitPrefs }) {
  const t = (key: string) => tr(locale, key), depth = precipitationUnit(units), factor = depth === "in" ? 25.4 : 1;
  const patchMeta = (patch: Partial<Project["meta"]>) => { const state = useProject.getState(); state.patchProject({ meta: { ...state.project.meta, ...patch } }); };
  return <div className="diagnostic-inputs">
    <label>{t("sourceFlow")} · {flowLabel(units.flow)}
      <LocalizedNumberInput value={project.water.availableLpm == null ? null : fromLpm(project.water.availableLpm, units.flow)} min={0}
        onCommit={value => { const state = useProject.getState(); state.patchProject({ water: { ...state.project.water, availableLpm: value == null ? null : toLpm(value, units.flow) } }); }}/>
    </label>
    <label>{t("siteSoil")}<input key={project.id} defaultValue={project.meta.soil} onBlur={event => patchMeta({ soil: event.currentTarget.value })}/></label>
    <label>{t("diagSlope")} · %<LocalizedNumberInput value={project.meta.slopePct} min={0} onCommit={value => patchMeta({ slopePct: value })}/></label>
    <label>{t("diagInfiltration")} · {lenLabel(depth)}/{t("unitHourShort")}
      <LocalizedNumberInput value={project.meta.infiltrationMmHr == null ? null : project.meta.infiltrationMmHr / factor} min={0.001} onCommit={value => patchMeta({ infiltrationMmHr: value == null ? null : value * factor })}/>
    </label>
    <p>{t("diagInfiltrationHelp")}</p>
  </div>;
}

export function IrrigationCheck({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const project = useProject(s => s.project), locale = useProject(s => s.locale), units = useProject(s => s.units);
  useProject(s => s.numberFormat); useProject(s => s.decimals);
  const [filter, setFilter] = useState<"all" | "error" | "warn">("all");
  const [inputs, setInputs] = useState(false);
  const focus = useDiagnosticFocus(s => s.focus);
  const liveIssue = liveDiagnosticIssue(focus, project);
  const workspace = typeof document === "undefined" ? null : document.querySelector(".designer-workspace");
  const issues = useMemo(() => open ? checkProject(project) : [], [open, project]);
  // Only changing projects invalidates a diagnostic. Canvas gestures, selection,
  // immutable project updates and reopening the report must not dismiss it.
  useEffect(() => { if (focus && focus.project.id !== project.id) useDiagnosticFocus.getState().clear(); }, [project.id, focus]);
  const acknowledge = () => { useDiagnosticFocus.getState().clear(); onOpenChange(false); };
  const t = (key: string) => tr(locale, key);
  const choose = (issue: Issue) => {
    useProject.setState({ selectedId: null, selectedIds: [], zoneFocus: null, sectorEditId: null, simulationProjectId: null, tool: "place", drawSub: "none" });
    useDiagnosticFocus.getState().show(project, issue); onOpenChange(false);
  };
  return <>
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Dialog.Portal container={workspace}>
        <Dialog.Content className="irrigation-check-dialog" dir={localeDirection(locale)} aria-describedby="diagnostic-description"
          onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => event.preventDefault()}
          onCloseAutoFocus={event => event.preventDefault()}
          onOpenAutoFocus={event => { if (inputs) {
            event.preventDefault();
            requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".irrigation-check-dialog .diagnostic-data input")?.focus());
          } }}
          onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
          <header className="diagnostic-heading"><Dialog.Title><ListChecks/>{t("checkIrrigation")}</Dialog.Title>
            <button className="diagnostic-acknowledge" type="button" onClick={acknowledge}>{t("diagOK")}</button>
          </header>
          <Dialog.Description id="diagnostic-description" className="sr-only">{t("diagSelectHint")}</Dialog.Description>
          <div className="diagnostic-scroll">
            <IrrigationReport project={project} issues={issues} units={units} locale={locale} filter={filter} onFilter={setFilter} onSelect={choose}/>
            <details className="diagnostic-data" open={inputs} onToggle={event => setInputs(event.currentTarget.open)}><summary>{t("diagInputs")}</summary>
              <DiagnosticInputs project={project} locale={locale} units={units}/>
            </details>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    {!open && focus && liveIssue && workspace && createPortal(<aside className="diagnostic-focus-card" data-level={liveIssue.level} dir={localeDirection(locale)} aria-label={t("checkIrrigation")}
      onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <div className="diagnostic-focus-heading">{liveIssue.resolved?<CheckCircle2 color="#159447"/>:<LevelIcon level={liveIssue.level}/>}<strong>{t(liveIssue.titleKey)}</strong>
        <button className="diagnostic-acknowledge" type="button" onClick={acknowledge}>{t("diagOK")}</button>
      </div>
      <div className="diagnostic-focus-scroll"><DiagnosticDetails issue={liveIssue} units={units} locale={locale} project={project}/>
        <DiagnosticLegend locale={locale}/>
        {!!focus.issue.sources?.length && <div className="diagnostic-sources">{[...new Set(focus.issue.sources)].filter(url => /^https:\/\/(www\.)?hunterirrigation\.com\//.test(url)).map((url, i) => <a href={url} target="_blank" rel="noreferrer" key={url}>{t("diagManufacturer")} · Hunter {focus.issue.sources!.length > 1 ? formatNumber(i + 1, 0) : ""} ↗</a>)}</div>}
      </div>
      <div className="diagnostic-focus-actions"><button type="button" onClick={() => onOpenChange(true)}><ListChecks/>{t("diagBack")}</button>
        {focus.issue.level === "info" && <button type="button" onClick={() => { setInputs(true); onOpenChange(true); }}>{t("diagInputs")}</button>}
      </div>
    </aside>, workspace)}
  </>;
}
