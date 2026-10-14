import { create } from "zustand";

interface TeamAccessState {
  token: string | null;
  authorize: (token: string) => void;
  signOut: () => void;
}

// Credencial somente em memória: nunca persistida nem incluída em EXPO_PUBLIC_.
export const useTeamAccessStore = create<TeamAccessState>((set) => ({
  token: null,
  authorize: (token) => set({ token }),
  signOut: () => set({ token: null }),
}));
