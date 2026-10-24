import { tr, type Locale } from "@/lib/i18n";
import type { CatalogItem } from "@/lib/equipment-catalog";

export { popUpHeight as popUpLabel } from "@/lib/catalog-localization";
import { popUpHeight as popUpLabel } from "@/lib/catalog-localization";

export function bodyLabel(body: CatalogItem, locale: Locale): string {
  return [body.body, popUpLabel(body.popUpMm, locale), ...(body.bodyFeatures ?? [])].join(" · ");
}

export function BodyOptions({ bodies, locale, recommendedFamily }: {
  bodies: CatalogItem[]; locale: Locale; recommendedFamily?: string;
}) {
  const families = [...new Set(bodies.map(body => body.bodyFamilyId))];
  return <>{families.map(family => {
    const rows = bodies.filter(body => body.bodyFamilyId === family);
    return <optgroup key={family} label={`${rows[0]!.body}${family === recommendedFamily ? ` · ${tr(locale, "pressureRecommended")}` : ""}`}>
      {rows.map(body => <option key={body.id} value={body.id}>{bodyLabel(body, locale)}</option>)}
    </optgroup>;
  })}</>;
}
