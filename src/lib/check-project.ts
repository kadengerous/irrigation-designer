import { itemById } from "@/lib/hunter-catalog";
import { coverageStats, lawnPolygon } from "@/lib/coverage";
import { headFlow } from "@/lib/flow";
import { headToHeadPairs } from "@/lib/head-to-head";
import { defaultBodyFor } from "@/lib/hunter-catalog";
import type { Head, Project } from "@/lib/project-types";

export type IssueLevel = "error" | "warn";

export type Issue = {
  id: string;
  level: IssueLevel;
  message: string;
  headId?: string;
};

function precipClassOf(h: Head): string {
  return itemById(h.catalogId)?.precipClass ?? "unknown";
}

export function checkProject(project: Project): Issue[] {
  const issues: Issue[] = [];
  const lawn = lawnPolygon(project.polygons);
  const heads = project.heads;

  if (project.underlay && !project.scaleCalibrated) {
    issues.push({ id: "scale", level: "error", message: "Масштаб не задан — расчёты радиуса на импортированном плане недоступны." });
  }

  if (lawn && heads.length) {
    const cov = coverageStats(lawn, heads);
    if (cov.dry > 2) {
      issues.push({
        id: "dry",
        level: cov.dry > 8 ? "error" : "warn",
        message: `Не покрыто ${cov.dry.toFixed(1)}% газона.`,
      });
    }
    if (cov.cover2 < 75) {
      issues.push({
        id: "h2h-dual",
        level: cov.cover2 < 55 ? "error" : "warn",
        message: `Двойное перекрытие ${cov.cover2.toFixed(0)}% (норма Hunter head-to-head: сосед достаёт до соседа).`,
      });
    }
    if (cov.oversprayM2 > 4) {
      issues.push({
        id: "over",
        level: "warn",
        message: `Overspray за границы: ${cov.oversprayM2.toFixed(1)} м².`,
      });
    }
  }

  const h2h = headToHeadPairs(heads);
  for (const p of h2h) {
    if (p.status === "ok") continue;
    const msg =
      p.status === "far"
        ? "Недостаточное перекрытие (head-to-head)."
        : p.status === "short"
          ? "Слишком малое расстояние между головками."
          : "Сосед вне сектора.";
    issues.push({ id: `h2h-${p.a}-${p.b}`, level: "warn", message: msg, headId: p.a });
  }

  for (const z of project.zones) {
    const zh = heads.filter((h) => h.zone === z.id);
    const classes = new Set(zh.map(precipClassOf).filter((c) => c === "mp10" || c === "mp20"));
    if (classes.has("mp10") && classes.has("mp20")) {
      issues.push({
        id: `mix-${z.id}`,
        level: "warn",
        message: `Разная интенсивность полива: MP Standard ≈10 мм/ч, MP800 ≈20 мм/ч (${z.name}).`,
      });
    }
  }

  const dyn = project.water.dynamicBar;
  const avail = project.water.availableLpm;
  for (const z of project.zones) {
    const zh = heads.filter((h) => h.zone === z.id);
    let q = 0;
    let qKnown = true;
    for (const h of zh) {
      const item = itemById(h.catalogId);
      if (!item) {
        issues.push({ id: `model-${h.id}`, level: "warn", message: "Требуется проверка модели.", headId: h.id });
        continue;
      }
      if (h.r < item.rMin - 0.05 || h.r > item.rMax + 0.05) {
        issues.push({ id: `r-${h.id}`, level: "error", message: `Радиус вне ${item.rMin}–${item.rMax} м.`, headId: h.id });
      }
      const fl = headFlow(h);
      if (fl.kind === "none") {
        issues.push({ id: `q-${h.id}`, level: "warn", message: fl.note ?? "Нет данных производителя", headId: h.id });
        qKnown = false;
      } else if (fl.lpm != null) q += fl.lpm;
      if (dyn != null && item.recommendedPressureMin - 0.05 > dyn) {
        issues.push({ id: `p-${h.id}`, level: "warn", message: "Недостаточное давление для модели.", headId: h.id });
      }
      const body = h.bodyId ?? defaultBodyFor(item);
      if ((item.family === "mp" || item.family === "mp800") && body === "PRS30") {
        issues.push({ id: `body-${h.id}`, level: "warn", message: "MP Rotator рекомендуется с PRS40 (2,8 бар).", headId: h.id });
      }
    }
    if (qKnown && avail != null && q > avail + 0.05) {
      issues.push({
        id: `zone-q-${z.id}`,
        level: "error",
        message: `${z.name}: расход ${q.toFixed(1)} л/мин выше доступного ${avail} л/мин.`,
      });
    }
  }

  return issues;
}
