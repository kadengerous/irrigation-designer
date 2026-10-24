import {squareFootprint} from "@/lib/equipment-footprint";
import { localizedFact } from "@/lib/catalog-localization";
import { fromBar, fromLpm, precipitationUnit, pressureLabel, lenLabel, flowLabel } from "@/lib/units";
import { Play } from "lucide-react";
import { stripAtPressure, supportsArc, type CatalogItem, type CatalogNozzle, type Family } from "@/lib/equipment-catalog";
import { docsForFamily } from "@/lib/hunter-docs";
import { formatNumber, tr } from "@/lib/i18n";
import { useProject } from "@/lib/project-store";
import { displayPrecipitation } from "@/lib/precipitation-display";
import {coveragePatternLabel, coverageSize, coverageSizeLabel, hasStreamCoverage, isLocalWatering} from '@/lib/catalog-coverage';

export function CatalogSeriesInfo({ family }: { family: Family | "all" }) {
  const locale = useProject(s => s.locale);
  const units = useProject(s => s.units);
  const t = (key: string) => tr(locale, key);
  return <section className="p-3" aria-label={t(`cat_${family}`)}>
    <h2 className="mt-3 text-sm font-semibold">{t(`cat_${family}`)}</h2>
    <p className="mt-2 text-xs leading-relaxed text-ink-soft">{t(`catInfo_${family}`)}</p>
    <details className="mt-3 border-t border-line pt-2">
      <summary className="cursor-pointer py-1 text-xs font-semibold">{t("docs")}</summary>
      <ul className="mt-2 space-y-1">
        {docsForFamily(family, locale, units).map(doc => <li key={doc.url + (doc.label ?? "")}>
          <a href={doc.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-xs hover:bg-btn-soft">
            <span className="min-w-0 break-words">{doc.kind === "video" ? (doc.label ?? t("docsVideo")) : doc.label ? `${doc.label} · ${t(doc.titleKey)}` : t(doc.titleKey)}</span>
            <span className="shrink-0 text-accent">{doc.kind === "video" ? <Play className="size-3.5" /> : t("docsOpen")}</span>
          </a>
        </li>)}
      </ul>
    </details>
  </section>;
}

export function CatalogThumb({ item, color }: { item: CatalogItem; color: string }) {
  const neutral = <svg data-coverage="unknown" width="1.75rem" height="1.75rem" viewBox="0 0 28 28" className="shrink-0" aria-hidden="true">
    <path d="M8 7H5V10M20 7H23V10M5 18V21H8M23 18V21H20" fill="none" stroke="currentColor" strokeWidth="1" opacity=".3" />
    <circle data-head="true" cx="14" cy="14" r="2.3" fill={color} />
  </svg>;
  // A compatibility/layout warning alone does not make a known shape unknown.
  // Explicitly unsupported geometry and archival Stream models do.
  if (item.type === 'body' || item.geometryVerificationStatus === 'Needs Review' || item.family === 'stream') return neutral;
  if (item.coverageKind === 'point') {
    if (item.type !== 'bubbler') return neutral;
    return <svg data-coverage="point" width="1.75rem" height="1.75rem" viewBox="0 0 28 28" className="shrink-0" aria-hidden="true">
      <path d="M14 13C11 14 9 17 9 20M14 13V21M14 13C17 14 19 17 19 20" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <circle data-head="true" cx="14" cy="12" r="2.3" fill="#172127" stroke="white" strokeWidth=".7" />
    </svg>;
  }
  if (item.placementSupported === false) return neutral;
  if (item.coverageKind === 'square') {
    if (![.25, .5, .75, 1].includes(item.squarePatternFraction ?? 0) || !Number.isFinite(item.rMax) || item.rMax <= 0) return neutral;
    const points = squareFootprint(item, 10);
    return <svg data-coverage="square" width="2.5rem" height="2.5rem" viewBox="-14 -14 28 28" className="shrink-0" aria-hidden="true">
      <polygon data-footprint="true" points={points.map(p => `${p.x},${p.y}`).join(' ')} fill={color} fillOpacity=".8" stroke="currentColor" strokeOpacity=".18" strokeWidth=".5" />
      <circle data-head="true" r="1.5" fill="#172127" stroke="white" strokeWidth=".5" />
    </svg>;
  }
  if (item.coverageKind === 'strip' || item.strip) {
    const strip = stripAtPressure(item);
    if (!strip || ![strip.w, strip.l, strip.ox, strip.oy].every(Number.isFinite) || strip.w <= 0 || strip.l <= 0) return neutral;
    // Include the real origin in the fit, even for an offset or end-strip nozzle.
    const minX = Math.min(0, strip.ox), maxX = Math.max(0, strip.ox + strip.l);
    const minY = Math.min(0, strip.oy), maxY = Math.max(0, strip.oy + strip.w);
    const scale = Math.min(44 / (maxX - minX), 34 / (maxY - minY));
    const originX = (50 - (maxX - minX) * scale) / 2 - minX * scale;
    const originY = (40 - (maxY - minY) * scale) / 2 - minY * scale;
    return <svg data-coverage="strip" width="3.125rem" height="2.5rem" viewBox="0 0 50 40" className="shrink-0" aria-hidden="true">
      <rect data-footprint="true" x={originX + strip.ox * scale} y={originY + strip.oy * scale} width={strip.l * scale} height={strip.w * scale} fill={color} fillOpacity=".8" stroke={color} strokeWidth=".8" />
      <circle data-head="true" cx={originX} cy={originY} r="2.3" fill="#172127" stroke="white" strokeWidth=".8" />
    </svg>;
  }
  if (![item.arcMin, item.arcMax, item.rMax].every(Number.isFinite) || item.arcMin < 0 || item.arcMax > 360 || item.arcMin > item.arcMax || item.rMax <= 0) return neutral;
  const permitted = (item.allowedArcRanges ?? [[item.arcMin, item.arcMax]])
    .filter(([min, max]) => Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max <= 360 && min <= max)
    .map(([, max]) => Math.min(item.arcMax, max)).filter(arc => arc > 0 && supportsArc(item, arc));
  if (!permitted.length) return neutral;
  const sweep = Math.max(...permitted), r = 10, cx = 14, cy = 14;
  if (item.coverageKind === 'streams') {
    const opposed = item.manufacturerId === 'hunter' && item.id === '5-CST-B';
    const dual = opposed || item.manufacturerId === 'hunter' && /^MSBN-.*V$/.test(item.id);
    // Dual-stream directions are documented. Other rays only identify the
    // declared pattern schematically; their count is not a nozzle specification.
    const angles = opposed ? [0, 180] : dual ? [-sweep / 2, sweep / 2]
      : sweep === 360 ? [0, 90, 180, 270] : [-sweep / 2, 0, sweep / 2];
    return <svg data-coverage="streams" data-schematic={!dual ? 'true' : undefined} width="1.75rem" height="1.75rem" viewBox="0 0 28 28" className="shrink-0" aria-hidden="true">
      <g data-footprint="true" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round">
        {angles.map(angle => <path key={angle} d={`M ${cx} ${cy} L ${cx + r * Math.cos(angle * Math.PI / 180)} ${cy + r * Math.sin(angle * Math.PI / 180)}`} />)}
      </g>
      <circle data-head="true" cx={cx} cy={cy} r="1.5" fill="#172127" stroke="white" strokeWidth=".5" />
    </svg>;
  }
  if (item.coverageKind && item.coverageKind !== 'sector') return neutral;
  const a0 = -sweep * Math.PI / 360, a1 = sweep * Math.PI / 360;
  const d = sweep === 360
    ? `M ${cx} ${cy} m -${r} 0 a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 -${r * 2} 0`
    : `M ${cx} ${cy} L ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`;
  return <svg data-coverage="sector" data-arc={sweep} width="1.75rem" height="1.75rem" viewBox="0 0 28 28" className="shrink-0" aria-hidden="true">
    <circle cx="14" cy="14" r="13" fill="none" stroke="currentColor" opacity=".12" />
    <path data-footprint="true" d={d} fill={color} fillOpacity=".9" stroke="currentColor" strokeOpacity=".18" strokeWidth=".5" />
  </svg>;
}

export function CatalogReference({ item, nozzle }: { item: CatalogItem; nozzle?: CatalogNozzle | null }) {
  const locale = useProject(s => s.locale);
  const units = useProject(s => s.units);
  const depthUnit = precipitationUnit(units);
  const secondary = units.flow === "gpm" || units.flow === "gph" ? "gph" : "m3h";
  const t = (key: string) => tr(locale, key);
  const rows=nozzle?.performance.map(row=>({row,display:displayPrecipitation(item,{nozzleId:nozzle.id,pressureBar:row.pressureBar,arc:row.arcDeg,radius:row.radiusM})}))??[];
  const basis=rows[0]?.display.basis;
  const keepPublishedStrip=basis==='strip'&&item.manufacturerId!=='rain-bird';
  const showRate=basis==='square'||basis==='single'||basis==='strip-layout'||rows.some(({row,display})=>display.rate!=null||(keepPublishedStrip&&row.precipSquareMmH!=null));
  const rateLabel=t(basis==='single'?'precipSingle':basis==='strip'?'precipStrip':basis==='strip-layout'?'precipStripSquare':'precipSquare');
  const showTriangle=basis==='square'||basis==='strip-layout';
  const rateUnit=`${lenLabel(depthUnit)}/${t("unitHourShort")}`;
  const rateText=(value:number|null|undefined)=>value==null?'—':formatNumber(depthUnit==='in'?value/25.4:value,2);
  const nonradial=item.strip||hasStreamCoverage(item)||item.coverageKind&&item.coverageKind!=='sector';
  const showSize=!isLocalWatering(item);
  return <details className="mt-3 border-t border-line pt-2">
    <summary className="cursor-pointer py-1 text-xs font-semibold">{t("charTable")}</summary>
    <p className="mt-2 text-xs text-muted">{t("jetAngle")}: <span className="text-ink">{nozzle?.trajectoryDeg == null ? localizedFact(item.trajectoryNote) ?? t("noData") : `${nozzle.trajectoryDeg}°`}</span></p>
    {nozzle && nozzle.performance.length > 0 && <div className="mt-2 overflow-x-auto">
      <table className="w-full text-[0.625rem]">
        <thead><tr className="text-left text-muted">
          {[t(nonradial?"coveragePattern":"sector"), pressureLabel(units.pressure), ...(showSize?[coverageSizeLabel(item,locale)]:[]), flowLabel(units.flow), flowLabel(secondary)].map((label, i) => <th className="pr-1" key={i}>{label}</th>)}
          {showRate&&<th className="pr-1">{rateLabel}, {rateUnit}</th>}
          {showTriangle&&<th>{t(basis==='strip-layout'?'precipStripTriangle':'precipTriangle')}, {rateUnit}</th>}
        </tr></thead>
        <tbody>{rows.map(({row,display}, index) => <tr key={index} className="tabular" title={row.verificationStatus==='Needs Review'?t('equipment.sourceConflict'):undefined}>
          <td className="pr-1">{coveragePatternLabel(item,locale,row.arcDeg)}{row.verificationStatus==='Needs Review'?' ⚠':''}</td><td className="pr-1">{formatNumber(fromBar(row.pressureBar, units.pressure), 2)}</td>
          {showSize&&<td className="pr-1">{coverageSize(item,row.radiusM,units.length,row.pressureBar,locale,2)}</td>}
          <td className="pr-1">{formatNumber(fromLpm(row.flowLMin, units.flow), 2)}</td><td className="pr-1">{formatNumber(fromLpm(row.flowLMin, secondary), 3)}</td>
          {showRate&&<td className="pr-1">{rateText(basis==='square'||keepPublishedStrip?row.precipSquareMmH:display.rate)}</td>}
          {showTriangle&&<td>{rateText(row.precipTriangleMmH)}</td>}
        </tr>)}</tbody>
      </table>
    </div>}
  </details>;
}
