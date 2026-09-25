import { create } from "zustand";
/** A view preference, never part of saved project geometry or undo history. */
export const useCoverageDisplay = create<{ projectId: string | null; toggle: (id: string) => void }>(set => ({
  projectId: null,
  toggle: id => set(s => ({ projectId: s.projectId === id ? null : id })),
}));
