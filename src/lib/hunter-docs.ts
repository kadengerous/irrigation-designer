import type { Family } from "@/lib/hunter-catalog";
import type { Locale } from "@/lib/i18n";
import type { UnitPrefs } from "@/lib/units";

export type HunterDoc = {
  kind: "page" | "pdf" | "video";
  titleKey: string;
  label?: string;
  url: string;
  media?: string;
};

type Lang = "US" | "EM" | "ES" | "FR" | "DE" | "IT" | "PT" | "RU" | "PL" | "TR" | "CN";

function hunterLang(locale: Locale, imperial: boolean): Lang {
  if (locale === "en") return imperial ? "US" : "EM";
  if (locale === "es") return "ES";
  if (locale === "de") return "DE";
  if (locale === "fr") return "FR";
  if (locale === "it") return "IT";
  if (locale === "pt") return "PT";
  if (locale === "ru") return "RU";
  if (locale === "pl") return "PL";
  if (locale === "tr") return "TR";
  if (locale === "zh") return "CN";
  return imperial ? "US" : "EM";
}

function pick(files: Partial<Record<Lang, string>>, lang: Lang): string | undefined {
  return files[lang] || files.EM || files.US || Object.values(files)[0];
}

function fileUrl(path: string) {
  if (path.startsWith("http")) return path;
  return `https://www.hunterirrigation.com/sites/default/files/${path}`;
}

function videoUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `https://www.hunterirrigation.com${p}`;
}

function pageUrl(path: string, imperial: boolean) {
  const p = path.startsWith("/") ? path : `/${path}`;
  const prefix = imperial ? "" : "/en-metric";
  return `https://www.hunterirrigation.com${prefix}${p}`;
}

function cut(name: string, lang: Lang) {
  const code = lang === "CN" ? "EM" : lang;
  return fileUrl(`CA-Cutsheet-${name}-${code}.pdf`);
}

type FamilyPack = {
  page: string;
  specName?: string;
  spec?: Partial<Record<Lang, string>>;
  guide?: Partial<Record<Lang, string>>;
  install?: Partial<Record<Lang, string>>;
  parts?: string;
  written?: string;
  series?: { label: string; path: string }[];
  videos?: { label: string; path: string; media?: string }[];
};

const PACKS: Partial<Record<Family | "all", FamilyPack>> = {
  mp: {
    page: "/irrigation-product/mp-rotator/standard-mp-rotatorr-nozzle",
    specName: "MP-Rotator",
    guide: {
      US: "2026-07/LIT-461-RevJ-DG-MPR-US-web.pdf",
      EM: "2026-07/LIT-461-RevK-DG-MPR-EM-web_0.pdf",
      ES: "2026-07/LIT-461-RevK-DG-MPR-ES-web.pdf",
      IT: "2026-07/LIT-461-RevK-DG-MPR-IT-web.pdf",
      FR: "2026-07/LIT-461-RevK-DG-MPR-FR-web.pdf",
      PT: "2026-07/LIT-461-RevK-DG-MPR-PT-web.pdf",
      DE: "2026-07/LIT-461-Revk-DG-MPR-DE-web.pdf",
      TR: "2026-07/LIT-461-RevK-DG-MPR-TR-web.pdf",
      PL: "2026-07/LIT-461-RevK-DG-MPR-PL-web.pdf",
      RU: "2026-07/LIT-461-RevK-DG-MPR-RU-web.pdf",
      CN: "2026-07/LIT-461-RevK-DG-MPR-CN-web.pdf",
    },
    install: { US: "2024-08/RC-210-RevF-IG-ProductInstallationGuide-EN-web.pdf" },
    parts: "2025-11/21-1494-RevS-IR-ReplacementPartsList2025-MPRotator.pdf",
    written: "2024-10/RC-219-MP820-IR-MP-Rotator-Nozzle-Written-Specifications-FINAL-100924.pdf",
    videos: [
      { label: "Matched Precipitation", path: "/videos/mp-rotator-matched-precipitation", media: "https://hunterindustries.widen.net/content/gk5iqas0bk/original/MP-KP-02-matched-precip.mov?u=u9m5zw" },
      { label: "Water Savings", path: "/videos/mp-rotator-water-savings", media: "https://hunterindustries.widen.net/content/wznis3o4wn/original/MP-KP-01-water-savings.mov?u=u9m5zw" },
    ],
  },
  mp800: {
    page: "/irrigation-product/mp-rotator/standard-mp-rotatorr-nozzle",
    specName: "MP-Rotator",
    guide: {
      US: "2026-07/LIT-461-RevJ-DG-MPR-US-web.pdf",
      EM: "2026-07/LIT-461-RevK-DG-MPR-EM-web_0.pdf",
      ES: "2026-07/LIT-461-RevK-DG-MPR-ES-web.pdf",
      IT: "2026-07/LIT-461-RevK-DG-MPR-IT-web.pdf",
      FR: "2026-07/LIT-461-RevK-DG-MPR-FR-web.pdf",
      PT: "2026-07/LIT-461-RevK-DG-MPR-PT-web.pdf",
      DE: "2026-07/LIT-461-Revk-DG-MPR-DE-web.pdf",
      TR: "2026-07/LIT-461-RevK-DG-MPR-TR-web.pdf",
      PL: "2026-07/LIT-461-RevK-DG-MPR-PL-web.pdf",
      RU: "2026-07/LIT-461-RevK-DG-MPR-RU-web.pdf",
      CN: "2026-07/LIT-461-RevK-DG-MPR-CN-web.pdf",
    },
    series: [
      { label: "MP800SR", path: "/node/38356" },
      { label: "MP815", path: "/node/434666" },
    ],
    videos: [
      { label: "Matched Precipitation", path: "/videos/mp-rotator-matched-precipitation", media: "https://hunterindustries.widen.net/content/gk5iqas0bk/original/MP-KP-02-matched-precip.mov?u=u9m5zw" },
      { label: "Water Savings", path: "/videos/mp-rotator-water-savings", media: "https://hunterindustries.widen.net/content/wznis3o4wn/original/MP-KP-01-water-savings.mov?u=u9m5zw" },
    ],
  },
  strip: {
    page: "/irrigation-product/mp-rotator/mp-rotatorr-strip-nozzle",
    specName: "MP-Rotator",
    guide: {
      US: "2026-07/LIT-461-RevJ-DG-MPR-US-web.pdf",
      EM: "2026-07/LIT-461-RevK-DG-MPR-EM-web_0.pdf",
      ES: "2026-07/LIT-461-RevK-DG-MPR-ES-web.pdf",
      FR: "2026-07/LIT-461-RevK-DG-MPR-FR-web.pdf",
      DE: "2026-07/LIT-461-Revk-DG-MPR-DE-web.pdf",
      IT: "2026-07/LIT-461-RevK-DG-MPR-IT-web.pdf",
      PT: "2026-07/LIT-461-RevK-DG-MPR-PT-web.pdf",
      RU: "2026-07/LIT-461-RevK-DG-MPR-RU-web.pdf",
      PL: "2026-07/LIT-461-RevK-DG-MPR-PL-web.pdf",
      TR: "2026-07/LIT-461-RevK-DG-MPR-TR-web.pdf",
      CN: "2026-07/LIT-461-RevK-DG-MPR-CN-web.pdf",
    },
    videos: [
      { label: "Matched Precipitation", path: "/videos/mp-rotator-matched-precipitation", media: "https://hunterindustries.widen.net/content/gk5iqas0bk/original/MP-KP-02-matched-precip.mov?u=u9m5zw" },
    ],
  },
  he: {
    page: "/irrigation-product/pro-high-efficiency-nozzles",
    spec: {
      US: "2025-05/RC-198-ProHE-SS-US-Web.pdf",
      EM: "2023-06/ProHE-SS-EM.pdf",
      ES: "2024-11/Sprays_ES_Vol40-PHE-ES.pdf",
      IT: "2024-11/Sprays_IT_Vol40-PHE.pdf",
      FR: "2024-11/Sprays_FR_Vol40-PHE.pdf",
      PT: "2024-11/Sprays_PT_Vol40-PHE.pdf",
      DE: "2024-11/Sprays_DE_Vol40-PHE-DE.pdf",
      PL: "2024-11/Sprays_PL_Vol40-PHE.pdf",
      RU: "2024-11/Sprays_RU_Vol40-PHE.pdf",
    },
    videos: [
      { label: "Spray Adjustments", path: "/videos/hunter-spray-adjustments-and-maintenance", media: "https://hunterindustries.widen.net/content/4z6mj6c81o/original/FK_Spray_Adj_Maintenance.mov?u=u9m5zw" },
      { label: "Pro-Spray Product Guide", path: "/videos/pro-spray-product-guide", media: "https://hunterindustries.widen.net/content/novnwn8c9g/original/Pro-Spray_PG.mov?u=u9m5zw" },
    ],
  },
  spray: {
    page: "/irrigation-product/nozzles/pro-adjustable-nozzles",
    spec: {
      US: "2026-05/RC-244-SS-Nozzles-ProAdj-US.pdf",
      EM: "2026-05/RC-244-SS-Nozzles-ProAdj-US.pdf",
    },
    videos: [
      { label: "Pro Adjustable Nozzles", path: "/videos/hunter-pro-adjustable-spray-nozzles-more-durable-and-long-lasting-competition", media: "https://hunterindustries.widen.net/content/dxmemo5z5q/original/SprayNozzles_BT.mov?u=u9m5zw" },
      { label: "Spray Adjustments", path: "/videos/hunter-spray-adjustments-and-maintenance", media: "https://hunterindustries.widen.net/content/4z6mj6c81o/original/FK_Spray_Adj_Maintenance.mov?u=u9m5zw" },
      { label: "Pro-Spray Product Guide", path: "/videos/pro-spray-product-guide", media: "https://hunterindustries.widen.net/content/novnwn8c9g/original/Pro-Spray_PG.mov?u=u9m5zw" },
    ],
  },
  fixed: {
    page: "/irrigation-product/nozzles/pro-fixed-nozzles",
    specName: "Pro-Spray-Fixed-Arc-Nozzles",
    videos: [
      { label: "Spray Adjustments", path: "/videos/hunter-spray-adjustments-and-maintenance", media: "https://hunterindustries.widen.net/content/4z6mj6c81o/original/FK_Spray_Adj_Maintenance.mov?u=u9m5zw" },
      { label: "Pro-Spray Product Guide", path: "/videos/pro-spray-product-guide", media: "https://hunterindustries.widen.net/content/novnwn8c9g/original/Pro-Spray_PG.mov?u=u9m5zw" },
    ],
  },
  prostrip: {
    page: "/irrigation-product/nozzles/strip-pattern-nozzles",
    videos: [
      { label: "Spray Adjustments", path: "/videos/hunter-spray-adjustments-and-maintenance", media: "https://hunterindustries.widen.net/content/4z6mj6c81o/original/FK_Spray_Adj_Maintenance.mov?u=u9m5zw" },
      { label: "Pro-Spray Product Guide", path: "/videos/pro-spray-product-guide", media: "https://hunterindustries.widen.net/content/novnwn8c9g/original/Pro-Spray_PG.mov?u=u9m5zw" },
    ],
  },
  short: {
    page: "/irrigation-product/nozzles/short-radius-micro-spray-nozzles",
    videos: [
      { label: "Spray Adjustments", path: "/videos/hunter-spray-adjustments-and-maintenance", media: "https://hunterindustries.widen.net/content/4z6mj6c81o/original/FK_Spray_Adj_Maintenance.mov?u=u9m5zw" },
      { label: "Pro-Spray Product Guide", path: "/videos/pro-spray-product-guide", media: "https://hunterindustries.widen.net/content/novnwn8c9g/original/Pro-Spray_PG.mov?u=u9m5zw" },
    ],
  },
  bubbler: {
    page: "/irrigation-product/nozzles/bubblers-bubbler-nozzles",
    videos: [
      { label: "Pro-Spray Product Guide", path: "/videos/pro-spray-product-guide", media: "https://hunterindustries.widen.net/content/novnwn8c9g/original/Pro-Spray_PG.mov?u=u9m5zw" },
    ],
  },
  rotor: {
    page: "/products/Rotors",
    series: [
      { label: "PGJ", path: "/irrigation-product/rotors/pgj" },
      { label: "SRM", path: "/irrigation-product/rotors/srm" },
      { label: "PGP", path: "/irrigation-product/rotors/pgp" },
      { label: "PGP Ultra", path: "/irrigation-product/rotors/pgp-ultra" },
      { label: "I-20", path: "/irrigation-product/rotors/i-20" },
      { label: "I-25", path: "/irrigation-product/rotors/i-25" },
      { label: "I-40", path: "/irrigation-product/rotors/i-40" },
      { label: "I-80", path: "/irrigation-product/rotors/i-80" },
      { label: "I-90", path: "/irrigation-product/rotors/i-90" },
    ],
    videos: [
      { label: "PGP, PGP Ultra and I-20", path: "/videos/hunter-rotors-pgp-pgp-ultra-and-i-20-industrys-most-reliable-sprinkler", media: "https://hunterindustries.widen.net/content/vtyvpcqw51/original/Rotors_BOI_PGP_PGP-Ultra_I-20.mp4?u=u9m5zw" },
      { label: "PGP Ultra and I-20 Nozzles", path: "/videos/hunter-pgp-ultra-and-i-20-rotor-nozzles-product-guide", media: "https://hunterindustries.widen.net/content/maejwiqaaz/original/RotorNozzles_PG.mov?u=u9m5zw" },
      { label: "I-Series Rotors Product Guide", path: "/videos/hunter-i-series-rotors-product-guide", media: "https://hunterindustries.widen.net/content/yhbxdakdkw/original/Hunter-I-Series-Rotors-Product-Guide.mov?u=u9m5zw" },
    ],
  },
  golf: {
    page: "/products/Golf%20Rotor",
    series: [
      { label: "G-70-B", path: "/irrigation-product/golf-rotors/g-70-b" },
      { label: "G-75-B", path: "/irrigation-product/golf-rotors/g-75-b" },
      { label: "G-80-B", path: "/irrigation-product/golf-rotors/g-80-b" },
      { label: "G-85-B", path: "/irrigation-product/golf-rotors/g-85-b" },
    ],
    videos: [
      { label: "PGP, PGP Ultra and I-20", path: "/videos/hunter-rotors-pgp-pgp-ultra-and-i-20-industrys-most-reliable-sprinkler", media: "https://hunterindustries.widen.net/content/vtyvpcqw51/original/Rotors_BOI_PGP_PGP-Ultra_I-20.mp4?u=u9m5zw" },
    ],
  },
  st: {
    page: "/irrigation-product/st-system/st-90",
    series: [
      { label: "ST-90", path: "/irrigation-product/st-system/st-90" },
      { label: "STG-900", path: "/irrigation-product/st-system/stg-900" },
      { label: "ST-1600", path: "/irrigation-product/st-1600" },
    ],
    videos: [
      { label: "PGP, PGP Ultra and I-20", path: "/videos/hunter-rotors-pgp-pgp-ultra-and-i-20-industrys-most-reliable-sprinkler", media: "https://hunterindustries.widen.net/content/vtyvpcqw51/original/Rotors_BOI_PGP_PGP-Ultra_I-20.mp4?u=u9m5zw" },
    ],
  },
};

export function docsForFamily(
  family: Family | "all",
  locale: Locale,
  units: UnitPrefs,
): HunterDoc[] {
  const pack = PACKS[family];
  if (!pack) return [];
  const imperial = units.length === "ft" || units.length === "in";
  const lang = hunterLang(locale, imperial);
  const out: HunterDoc[] = [
    { kind: "page", titleKey: "docsPage", url: pageUrl(pack.page, imperial) },
  ];
  if (pack.specName) {
    out.push({ kind: "pdf", titleKey: "docsSpec", url: cut(pack.specName, lang) });
  }
  if (pack.spec) {
    const url = pick(pack.spec, lang);
    if (url) out.push({ kind: "pdf", titleKey: "docsSpec", url: fileUrl(url) });
  }
  if (pack.guide) {
    const url = pick(pack.guide, lang);
    if (url) out.push({ kind: "pdf", titleKey: "docsGuide", url: fileUrl(url) });
  }
  if (pack.install) {
    const url = pick(pack.install, lang);
    if (url) out.push({ kind: "pdf", titleKey: "docsInstall", url: fileUrl(url) });
  }
  if (pack.written) out.push({ kind: "pdf", titleKey: "docsWritten", url: fileUrl(pack.written) });
  if (pack.parts) out.push({ kind: "pdf", titleKey: "docsParts", url: fileUrl(pack.parts) });
  for (const s of pack.series ?? []) {
    out.push({ kind: "page", titleKey: "docsPage", label: s.label, url: pageUrl(s.path, imperial) });
  }
  for (const v of pack.videos ?? []) {
    out.push({ kind: "video", titleKey: "docsVideo", label: v.label, url: videoUrl(v.path), media: v.media });
  }
  return out;
}
