import { create } from "zustand";

interface PlacesState {
  selectedPlaceId: string | null;
  selectPlace: (id: string | null) => void;
}
export const usePlacesStore = create<PlacesState>((set) => ({
  selectedPlaceId: null,
  selectPlace: (selectedPlaceId) => set({ selectedPlaceId }),
}));
