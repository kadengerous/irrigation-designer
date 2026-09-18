import type { DrawSub, MeasureSub, Tool } from "@/lib/project-types";

/** Single drawing state machine (spec §6). Not a pile of isDrawing flags. */
export type CadMode =
  | "select"
  | "pan"
  | "place"
  | "calibrate"
  | "measure"
  | "guide"
  | "move_object"
  | "draw_line"
  | "draw_polyline"
  | "draw_polygon"
  | "draw_rect"
  | "draw_rotrect"
  | "draw_circle"
  | "draw_ellipse"
  | "draw_triangle"
  | "draw_hexagon"
  | "draw_arc"
  | "draw_spline"
  | "draw_freehand"
  | "draw_offset"
  | "draw_fillet"
  | "draw_chamfer"
  | "draw_fill"
  | "draw_dim"
  | "draw_text"
  | "draw_trim"
  | "draw_extend"
  | "draw_copy"
  | "draw_array"
  | "draw_polar"
  | "draw_hole"
  | "draw_match"
  | "draw_path";

const DRAW_MODES: Partial<Record<DrawSub, CadMode>> = {
  line: "draw_line",
  polyline: "draw_polyline",
  polygon: "draw_polygon",
  rect: "draw_rect",
  rotrect: "draw_rotrect",
  circle: "draw_circle",
  ellipse: "draw_ellipse",
  triangle: "draw_triangle",
  hexagon: "draw_hexagon",
  arc: "draw_arc",
  spline: "draw_spline",
  freehand: "draw_freehand",
  offset: "draw_offset",
  fillet: "draw_fillet",
  chamfer: "draw_chamfer",
  fill: "draw_fill",
  dim: "draw_dim",
  text: "draw_text",
  trim: "draw_trim",
  extend: "draw_extend",
  copy: "draw_copy",
  array: "draw_array",
  polar: "draw_polar",
  hole: "draw_hole",
  match: "draw_match",
  path: "draw_path",
};

export function cadModeOf(s: {
  tool: Tool;
  drawSub: DrawSub;
  measureSub: MeasureSub;
  spaceDown: boolean;
}): CadMode {
  if (s.spaceDown) return "pan";
  if (s.tool === "scale") return "calibrate";
  if (s.tool === "measure") return s.measureSub === "guide" || s.measureSub === "guide-point" ? "guide" : "measure";
  if (s.tool === "place") return "place";
  if (s.tool === "move") return "move_object";
  if (s.tool === "draw") return DRAW_MODES[s.drawSub] ?? "select";
  return "select";
}

export function fromCadMode(mode: CadMode, currentTool: Tool = null): { tool: Tool; drawSub?: DrawSub; measureSub?: MeasureSub } {
  // Selecting is a tool within the open drawing workspace, not an exit from it.
  if (mode === "select") return currentTool === "draw" ? { tool: "draw", drawSub: "none" } : { tool: null };
  if (mode === "pan") return { tool: null };
  if (mode === "place") return { tool: "place" };
  if (mode === "calibrate") return { tool: "scale" };
  if (mode === "measure") return { tool: "measure", measureSub: "measure", drawSub: "none" };
  if (mode === "guide") return { tool: "measure", measureSub: "guide", drawSub: "none" };
  if (mode === "move_object") return { tool: "move" };
  const sub = mode.replace("draw_", "") as DrawSub;
  return { tool: "draw", drawSub: sub };
}
