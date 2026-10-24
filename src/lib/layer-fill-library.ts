import { create } from "zustand";
import { drawingOrMigrate, setGroupMemberAppearance, setFaceTextureRotation } from "./cad/engine";
import { useProject } from "./project-store";

// The library belongs to the workspace, never to the row that opened it.
export const useLayerFillLibrary = create<{ open: boolean }>(() => ({ open: false }));

useProject.subscribe((state,previous) => {
  if (useLayerFillLibrary.getState().open && (
    (previous.workspaceSection === "plan" && state.workspaceSection !== "plan") ||
    (state.referenceOpen && !previous.referenceOpen) || state.project.id !== previous.project.id
  )) useLayerFillLibrary.setState({ open: false });
});

export function activeFillFace(state = useProject.getState()) {
  const id = state.groupMemberId ?? state.selectedPolyId;
  if (!id || (!state.groupMemberId && state.selectedPolyIds.length > 1)) return null;
  const face = drawingOrMigrate(state.project).faces[id];
  if (!face || face.segment || (face.layerId && state.groupMemberId !== id)) return null;
  return face;
}

export function openLayerFillLibrary(id: string) {
  const state = useProject.getState();
  const face = drawingOrMigrate(state.project).faces[id];
  if (!face || face.segment) return;
  if (state.groupMemberId && state.groupMemberId !== id) state.finishGroupMember();
  if (face.layerId && state.groupMemberId !== id) state.selectGroupMember(id);
  else if (state.selectedPolyId !== id || state.selectedPolyIds.length !== 1) state.selectPoly(id);
  useLayerFillLibrary.setState({ open: true });
}

export function applyLibraryFill(fill: string) {
  const state = useProject.getState();
  const face = activeFillFace(state);
  if (!face || face.locked) return;
  // Also handles an individual member without repainting its siblings.
  state.commitDrawing(setGroupMemberAppearance(drawingOrMigrate(state.project), face.id, { fill }), face.id, true);
}

export function applyLibraryOrientation(textureRotation: 0 | 90) {
  const state = useProject.getState();
  const face = activeFillFace(state);
  if (!face || face.locked) return;
  const drawing = drawingOrMigrate(state.project);
  state.commitDrawing(face.layerId
    ? setGroupMemberAppearance(drawing, face.id, { textureRotation })
    : setFaceTextureRotation(drawing, face.id, textureRotation), face.id, true);
}
