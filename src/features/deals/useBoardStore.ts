import { create } from "zustand";

interface BoardState {
  ownerFilter: "me" | "all";
  sort: "position" | "value" | "nextActivity";
  activeDragId: string | null;
  setOwnerFilter: (v: "me" | "all") => void;
  setSort: (v: "position" | "value" | "nextActivity") => void;
  setActiveDrag: (id: string | null) => void;
}

// Board-local state only (filters, sort, active drag). Server data lives in TanStack Query.
export const useBoardStore = create<BoardState>((set) => ({
  ownerFilter: "all",
  sort: "position",
  activeDragId: null,
  setOwnerFilter: (ownerFilter) => set({ ownerFilter }),
  setSort: (sort) => set({ sort }),
  setActiveDrag: (activeDragId) => set({ activeDragId }),
}));
