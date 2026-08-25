"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Droplets, FileImage, Spline, Timer, X } from "lucide-react";
import {
  HEADS,
  LAWN_AREA,
  NOZZLES,
  TOTAL_FLOW,
  ZONES,
  billOfMaterials,
  flowLpm,
  fmt1,
  fmtM,
  zoneFlow,
  zoneHeads,
  type Head,
} from "@/lib/irrigation";
import { cn } from "@/lib/utils";
import { PlotPlan } from "@/components/plot-plan";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function PlotApp() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showCoverage, setShowCoverage] = useState(true);
  const [showPipes, setShowPipes] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [zoneFilter, setZoneFilter] = useState<0 | 1 | 2 | 3>(0);
  const [tab, setTab] = useState<"zones" | "heads" | "bom">("zones");

  const selected = HEADS.find((h) => h.id === selectedId) ?? null;
  const bom = useMemo(() => billOfMaterials(), []);

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="border-b border-line px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-widest text-hunter uppercase">
              Hunter MP Rotator
            </p>
            <h1 className="font-display mt-1 text-3xl font-medium tracking-tight text-ink sm:text-4xl">
              Газон
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
              Расстановка дождевателей по чертежу 15,1 × 16,4 м. Покрытие
              голова-к-голове, 2,8 бар, корпуса Pro-Spray PRS40.
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-3 sm:gap-5">
            <Stat k="Площадь" v={`${fmtM(LAWN_AREA)} м²`} />
            <Stat k="Дожди" v={`${HEADS.length} шт`} />
            <Stat k="Расход" v={`${fmt1(TOTAL_FLOW)} л/мин`} />
          </dl>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:flex-row lg:px-8 lg:py-6">
        <section className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Toggle
              on={showCoverage}
              onClick={() => setShowCoverage((v) => !v)}
              icon={<Droplets />}
              label="Покрытие"
            />
            <Toggle
              on={showPipes}
              onClick={() => setShowPipes((v) => !v)}
              icon={<Spline />}
              label="Трубы"
            />
            <Toggle
              on={showOriginal}
              onClick={() => setShowOriginal((v) => !v)}
              icon={<FileImage />}
              label="Исходник"
            />
            <div className="flex flex-wrap gap-1.5 lg:ml-auto">
              <FilterChip
                active={zoneFilter === 0}
                onClick={() => setZoneFilter(0)}
                label="Все"
              />
              {ZONES.map((z) => (
                <FilterChip
                  key={z.id}
                  active={zoneFilter === z.id}
                  onClick={() => setZoneFilter(z.id)}
                  label={z.title}
                  zone={z.id}
                />
              ))}
            </div>
          </div>

          <div
            className="overflow-hidden rounded-xl bg-surface-2 shadow-border"
            onClick={() => setSelectedId(null)}
          >
            {showOriginal ? (
              <img
                src="/original-plan.jpg"
                alt="Исходный чертёж участка"
                className="block h-auto w-full"
              />
            ) : (
              <PlotPlan
                selectedId={selectedId}
                hoveredId={hoveredId}
                showCoverage={showCoverage}
                showPipes={showPipes}
                zoneFilter={zoneFilter}
                onSelect={setSelectedId}
                onHover={setHoveredId}
              />
            )}
          </div>
          <p className="mt-2 text-xs text-faint">
            {showOriginal
              ? "Это ваш PDF. Кнопка «Исходник» выключает его — снова схема с дождями."
              : "Нажмите на точку — карточка дождя. Дуги обрезаны по газону: на дом и плитку не льём."}
          </p>
        </section>

        <aside className="flex w-full min-w-0 shrink-0 flex-col gap-3 lg:w-80">
          {selected ? (
            <HeadCard head={selected} onClose={() => setSelectedId(null)} />
          ) : (
            <div className="rounded-xl bg-surface p-4 shadow-border">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                Принцип
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Сетка 3×3 из MP3000 на основном прямоугольнике (шаг 7,55 × 8,2 м).
                У уступа дома — MP2000, чтобы не бить по фасаду и плитке. Вода
                заходит через прокол в западной стене.
              </p>
            </div>
          )}

          <div className="rounded-xl bg-surface shadow-border">
            <div className="flex border-b border-line p-1">
              {(
                [
                  ["zones", "Зоны"],
                  ["heads", "Точки"],
                  ["bom", "Смета"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "h-11 flex-1 rounded-md text-sm font-medium transition-colors duration-150",
                    tab === id ? "bg-ink text-bg" : "text-muted hover:text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="max-h-96 overflow-y-auto p-3">
              {tab === "zones" && <ZonesList onPick={setSelectedId} />}
              {tab === "heads" && (
                <HeadsList
                  selectedId={selectedId}
                  onPick={setSelectedId}
                  zoneFilter={zoneFilter}
                />
              )}
              {tab === "bom" && <BomList rows={bom} />}
            </div>
          </div>

          <div className="rounded-xl bg-surface p-4 shadow-border">
            <div className="flex items-center gap-2 text-ink">
              <Timer className="size-4 text-hunter" />
              <h2 className="text-sm font-semibold">Полив</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              MP Rotator даёт ≈10 мм/ч. Норма газона 25 мм/нед —{" "}
              <strong className="font-semibold text-ink">2 раза по 75 мин</strong>{" "}
              на каждую зону. Три зоны подряд, не вместе: водоразбор 1,5–2,0 м³/ч.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-faint uppercase">{k}</dt>
      <dd className="font-display mt-0.5 text-xl font-medium tabular-nums text-ink">{v}</dd>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  icon,
  label,
}: {
  on: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Button variant={on ? "pressed" : "outline"} size="sm" onClick={onClick} aria-pressed={on}>
      {icon}
      {label}
    </Button>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  zone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  zone?: 1 | 2 | 3;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center gap-1.5 rounded-sm px-3 text-xs font-semibold transition-colors duration-150",
        active ? "bg-ink text-bg" : "bg-surface text-ink-soft shadow-border hover:bg-surface-2",
      )}
    >
      {zone === 1 && <span className="size-2 rounded-full bg-zone-1" />}
      {zone === 2 && <span className="size-2 rounded-full bg-zone-2" />}
      {zone === 3 && <span className="size-2 rounded-full bg-zone-3" />}
      {label}
    </button>
  );
}

function HeadCard({ head, onClose }: { head: Head; onClose: () => void }) {
  const spec = NOZZLES[head.sku];
  const lpm = flowLpm(head.sku, head.arc);
  return (
    <div className="rounded-xl bg-surface p-4 shadow-border">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-hunter uppercase">
            Точка {head.n} · зона {head.zone}
          </p>
          <h2 className="font-display mt-0.5 text-2xl font-medium">{head.title}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Закрыть" className="size-11">
          <X />
        </Button>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{head.note}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Row k="Форсунка" v={head.sku} />
        <Row k="Артикул" v={spec.hunterSku} />
        <Row k="Сектор" v={`${head.arc}°`} />
        <Row k="Радиус" v={`${fmt1(head.r)} м`} />
        <Row k="Расход" v={`${fmt1(lpm)} л/мин`} />
        <Row k="Цвет" v={spec.colorName} />
      </dl>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-bg-2 px-2.5 py-2">
      <dt className="text-xs font-semibold tracking-wide text-faint uppercase">{k}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{v}</dd>
    </div>
  );
}

function ZonesList({ onPick }: { onPick: (id: string) => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {ZONES.map((z) => {
        const heads = zoneHeads(z.id);
        const flow = zoneFlow(z.id);
        return (
          <li key={z.id} className="rounded-lg bg-bg-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {z.id === 1 && <span className="size-2.5 rounded-full bg-zone-1" />}
                {z.id === 2 && <span className="size-2.5 rounded-full bg-zone-2" />}
                {z.id === 3 && <span className="size-2.5 rounded-full bg-zone-3" />}
                <div>
                  <p className="text-sm font-semibold">{z.title}</p>
                  <p className="text-xs text-muted">{z.subtitle}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">{fmt1(flow)} л/мин</p>
                <p className="text-xs text-faint">{fmt1(flow * 0.06)} м³/ч</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {heads.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => onPick(h.id)}
                  className="h-11 rounded-sm bg-surface px-2.5 text-xs font-medium text-ink-soft shadow-border hover:text-ink"
                >
                  {h.n} · {h.sku.replace("MP", "")}
                </button>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function HeadsList({
  selectedId,
  onPick,
  zoneFilter,
}: {
  selectedId: string | null;
  onPick: (id: string) => void;
  zoneFilter: 0 | 1 | 2 | 3;
}) {
  const list = zoneFilter === 0 ? HEADS : HEADS.filter((h) => h.zone === zoneFilter);
  return (
    <ul className="flex flex-col">
      {list.map((h) => (
        <li key={h.id}>
          <button
            type="button"
            onClick={() => onPick(h.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-150",
              selectedId === h.id ? "bg-ink text-bg" : "hover:bg-bg-2",
            )}
          >
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-sm text-xs font-bold",
                selectedId === h.id ? "bg-hunter text-hunter-fg" : "bg-bg-2 text-ink",
              )}
            >
              {h.n}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{h.title}</span>
              <span
                className={cn(
                  "block text-xs",
                  selectedId === h.id ? "text-bg/70" : "text-muted",
                )}
              >
                {h.sku} · {h.arc}° · {fmt1(h.r)} м
              </span>
            </span>
            <Badge
              className={cn(
                "tabular-nums",
                selectedId === h.id && "bg-bg/15 text-bg",
              )}
            >
              з{h.zone}
            </Badge>
          </button>
        </li>
      ))}
    </ul>
  );
}

function BomList({ rows }: { rows: ReturnType<typeof billOfMaterials> }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs font-semibold tracking-wide text-faint uppercase">
          <th className="pb-2 pr-2">Позиция</th>
          <th className="pb-2 text-right">Кол.</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.sku} className="border-t border-line">
            <td className="py-2 pr-2">
              <p className="font-medium leading-snug">{r.name}</p>
              <p className="text-xs text-faint">
                {r.sku}
                {r.note ? ` · ${r.note}` : ""}
              </p>
            </td>
            <td className="py-2 text-right tabular-nums font-semibold whitespace-nowrap">
              {r.qty} {r.unit}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
