import { useProject } from "@/lib/project-store";
import { tr, formatNumber } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { downloadSourceZip } from "@/lib/download-source";

export const Route = createFileRoute("/downloads")({
  component: DownloadsPage,
});

function DownloadsPage() {
  const locale = useProject(s => s.locale);
  const t = (key: string, vars?: Record<string,string|number>) => tr(locale, key, vars);
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState("");
  return (
    <main className="min-h-screen bg-[#e8eef0] px-5 py-10 text-[#1b1f24]">
      <h1 className="text-xl font-semibold">{t("sourceDownload")}</h1>
      <p className="mt-2 max-w-md text-sm text-zinc-600">
        {t("sourceDownloadHint")}
      </p>
      <button
        type="button"
        disabled={pct !== null}
        onClick={() => {
          setErr("");
          setPct(0);
          void downloadSourceZip(setPct)
            .then(() => setPct(null))
            .catch(() => {
              setErr(t("sourceDownloadError"));
              setPct(null);
            });
        }}
        className="mt-5 inline-flex rounded-lg bg-[#0b6e62] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
      >
        {pct === null ? t("sourceDownload") : t("downloadProgress", { percent: formatNumber(pct, 0) })}
      </button>
      {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
      <p className="mt-6 text-sm">
        <a href="/" className="text-[#0b6e62] underline">
          {t("backToApp")}
        </a>
      </p>
    </main>
  );
}
