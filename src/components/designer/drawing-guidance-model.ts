import { LOCALES, tr, type Locale } from "@/lib/i18n";
import { dist, type Pt } from "@/lib/geometry";
const guidanceKeys = ["showHints", "guidanceStart", "guidanceContinue", "guidanceClose", "guidanceEdit", "guidanceSelect", "guidanceTool"] as const;
export const guidanceCopy = Object.fromEntries(LOCALES.map(({id}) => [id, guidanceKeys.map(key => tr(id,key))])) as Record<Locale,[string,string,string,string,string,string,string]>;
export const hintLabel = (locale: Locale) => guidanceCopy[locale][0];
export function closureTarget(points: Pt[], drawSub: string, hover: Pt | null, px: number) {
 const first = 0;
 if (!["polygon","spline"].includes(drawSub) || points.length < first + 3 || !hover) return null;
 return dist(hover, points[first]!) * px <= 40 ? points[first]! : null;
}
