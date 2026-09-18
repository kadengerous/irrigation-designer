import { Play } from "lucide-react";
import { categoryPhoto, type CatalogItem, type CatalogNozzle, type Family } from "@/lib/hunter-catalog";
import { docsForFamily } from "@/lib/hunter-docs";
import { fmt1 } from "@/lib/geometry";
import { tr } from "@/lib/i18n";
import { useProject } from "@/lib/project-store";

export function CatalogSeriesInfo({ family }: { family: Family | "all" }) {
  const locale = useProject(s => s.locale);
  const units = useProject(s => s.units);
  const t = (key: string) => tr(locale, key);
  const photo = categoryPhoto(family);
  return <section className="p-3" aria-label={t(`cat_${family}`)}>
    {photo && <img src={photo} alt={t(`cat_${family}`)} className="mx-auto max-h-52 w-full object-contain" />}
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

export function CatalogThumb({ color, arc, strip }: { color: string; arc: number; strip?: CatalogItem["strip"] }) {
  if (strip) {
    const scale = Math.min(44 / strip.l, 34 / strip.w);
    const width = strip.l * scale, height = strip.w * scale;
    const x = (50 - width) / 2, y = (40 - height) / 2;
    return <svg width="50" height="40" viewBox="0 0 50 40" className="shrink-0" aria-hidden="true">
      <rect x={x} y={y} width={width} height={height} fill={color} fillOpacity=".8" stroke={color} strokeWidth=".8" />
      <circle cx={x - strip.ox * scale} cy={y - strip.oy * scale} r="2.3" fill="#172127" stroke="white" strokeWidth=".8" />
    </svg>;
  }
  const sweep = Math.min(360, Math.max(40, arc)), r = 10, cx = 14, cy = 14;
  const a0 = -sweep * Math.PI / 360, a1 = sweep * Math.PI / 360;
  const d = sweep >= 359
    ? `M ${cx} ${cy} m -${r} 0 a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 -${r * 2} 0`
    : `M ${cx} ${cy} L ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`;
  return <svg width="28" height="28" viewBox="0 0 28 28" className="shrink-0" aria-hidden="true">
    <circle cx="14" cy="14" r="13" fill="transparent" stroke="currentColor" opacity=".12" />
    <path d={d} fill={color} opacity=".9" />
  </svg>;
}

export function CatalogReference({ item, nozzle }: { item: CatalogItem; nozzle?: CatalogNozzle | null }) {
  const locale = useProject(s => s.locale);
  const t = (key: string) => tr(locale, key);
  return <details className="mt-3 border-t border-line pt-2">
    <summary className="cursor-pointer py-1 text-xs font-semibold">{t("charTable")}</summary>
    <p className="mt-2 text-xs text-muted">{t("jetAngle")}: <span className="text-ink">{nozzle?.trajectoryDeg == null ? item.trajectoryNote ?? t("noData") : `${nozzle.trajectoryDeg}°`}</span></p>
    {nozzle && nozzle.performance.length > 0 && <div className="mt-2 overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead><tr className="text-left text-muted">
          {["sector", "bar", "unit_m", "lpm", "m3h", "mmhr"].map(key => <th className="pr-1" key={key}>{t(key)}</th>)}
        </tr></thead>
        <tbody>{nozzle.performance.map((row, index) => <tr key={index} className="tabular">
          <td className="pr-1">{row.arcDeg}°</td><td className="pr-1">{fmt1(row.pressureBar)}</td>
          <td className="pr-1">{item.coverageKind === "point" ? "—" : fmt1(row.radiusM)}</td>
          <td className="pr-1">{fmt1(row.flowLMin)}</td><td className="pr-1">{row.flowM3H.toFixed(3)}</td>
          <td>{row.precipSquareMmH == null ? "—" : fmt1(row.precipSquareMmH)}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </details>;
}
