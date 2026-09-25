import { text as uiText } from "@/lib/i18n";
import { saveFile, chooseSaveTarget } from "@/lib/export-plan";
import { validProject } from "./project-validation";
import type { Project } from "@/lib/project-types";

export const SCHEMA_VERSION = 2;
export const FILE_EXT = "ird";

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
  return name.replace(/[^\p{L}\p{N} _-]+/gu, " ").trim() || uiText("untitled");
}

export function toProjectFile(opts: Omit<ProjectFilePayload, "schemaVersion" | "type">): ProjectFilePayload {
  return { schemaVersion: SCHEMA_VERSION, type: "irrigationproject", ...opts };
}

export function parseProjectFile(text: string): ProjectFilePayload {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(uiText("projectFileInvalid"));
  }
  const o = raw as Record<string, unknown>;
  if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error(uiText("projectFileInvalid"));
  if (o.type && o.type !== "irrigationproject") {
    throw new Error(uiText("unknownFileType"));
  }
  if (typeof o.schemaVersion === "number" && o.schemaVersion > SCHEMA_VERSION) {
    throw new Error(uiText("newerProjectVersion"));
  }
  const project = ((o.project as Project | undefined) ?? (o as unknown as Project)) as Project;
  if (!validProject(project)) throw new Error(uiText("projectFileInvalid"));
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
  const target = await chooseSaveTarget(`${name}.${FILE_EXT}`, "application/json");
  if (target === null) return;
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  await saveFile(blob, `${name}.${FILE_EXT}`, target);
}
