import { create } from "zustand";
/** A view preference, never part of saved project geometry or undo history. */
export const useCoverageDisplay = create<{ projectId: string | null; legendOpen: boolean; closeLegend: () => void; toggle: (id: string) => void }>(set => ({
  projectId: null,
  legendOpen: false,
  closeLegend: () => set({ legendOpen: false }),
  toggle: id => set(s => s.projectId === id && s.legendOpen
    ? { projectId: null, legendOpen: false }
    : { projectId: id, legendOpen: true }),
}));
