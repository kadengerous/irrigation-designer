import { saveFile } from "@/lib/export-plan";
import type { Project } from "@/lib/project-types";

export const SCHEMA_VERSION = 1;
export const FILE_EXT = "irrigationproject";

export type ProjectFilePayload = {
  schemaVersion: number;
  type: "irrigationproject";
  project: Project;
  showCoverage: boolean;
  showLabels: boolean;
  showGrid: boolean;
  snapOn: boolean;
  snapGridOn: boolean;
  gridStep: number;
  measureUnit: string;
  activeZoneId: number;
};

export function fileStem(name: string) {
  return name.replace(/[^\wа-яё -]+/gi, " ").trim() || "Без названия";
}

export function toProjectFile(opts: Omit<ProjectFilePayload, "schemaVersion" | "type">): ProjectFilePayload {
  return { schemaVersion: SCHEMA_VERSION, type: "irrigationproject", ...opts };
}

export function parseProjectFile(text: string): ProjectFilePayload {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Файл повреждён или это не проект Irrigation Designer.");
  }
  const o = raw as Record<string, unknown>;
  if (o.type && o.type !== "irrigationproject") {
    throw new Error("Неизвестный тип файла.");
  }
  if (typeof o.schemaVersion === "number" && o.schemaVersion > SCHEMA_VERSION) {
    throw new Error("Файл создан в более новой версии приложения.");
  }
  const project = ((o.project as Project | undefined) ?? (o as unknown as Project)) as Project;
  if (!project || typeof project !== "object") throw new Error("В файле нет данных проекта.");
  return {
    schemaVersion: SCHEMA_VERSION,
    type: "irrigationproject",
    project,
    showCoverage: o.showCoverage !== false,
    showLabels: o.showLabels !== false,
    showGrid: Boolean(o.showGrid),
    snapOn: o.snapOn !== false,
    snapGridOn: Boolean(o.snapGridOn),
    gridStep: typeof o.gridStep === "number" ? o.gridStep : 0.5,
    measureUnit: typeof o.measureUnit === "string" ? o.measureUnit : "m",
    activeZoneId: typeof o.activeZoneId === "number" ? o.activeZoneId : 1,
  };
}

export async function downloadProjectFile(file: ProjectFilePayload) {
  const name = fileStem(file.project.name);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  await saveFile(blob, `${name}.json`);
}
