import { create } from 'zustand';

export interface ARSessionState {
  // Coordenadas do Ponto de Referência (Origem da Sessão)
  userLat: number;
  userLon: number;
  userAlt: number;
  originLabel: string;

  // Orientação e Calibração
  sessionHeading: number; // 0, 90, 180, 270 ou dinâmico
  isCalibrating: boolean;

  // Estado do Motor SLAM
  trackingState: number; // 1: Not Available, 2: Limited, 3: Normal (Tracking)

  // Interação e Seleção
  selectedAnchorId: string | null;
  reticleDistanceMeters: number;

  // Actions
  setOrigin: (label: string, lat: number, lon: number, alt: number, heading?: number) => void;
  setSessionHeading: (heading: number) => void;
  setTrackingState: (state: number) => void;
  setSelectedAnchorId: (id: string | null) => void;
  setReticleDistanceMeters: (distance: number) => void;
  setIsCalibrating: (isCalibrating: boolean) => void;
}

export const DEFAULT_CAMPUS_ORIGIN = {
  label: 'Campus Facens (Bloco A)',
  lat: -23.4699,
  lon: -47.4297,
  alt: 590,
  heading: 0,
};

export const useARStore = create<ARSessionState>((set) => ({
  userLat: DEFAULT_CAMPUS_ORIGIN.lat,
  userLon: DEFAULT_CAMPUS_ORIGIN.lon,
  userAlt: DEFAULT_CAMPUS_ORIGIN.alt,
  originLabel: DEFAULT_CAMPUS_ORIGIN.label,
  sessionHeading: DEFAULT_CAMPUS_ORIGIN.heading,
  isCalibrating: false,
  trackingState: 1,
  selectedAnchorId: null,
  reticleDistanceMeters: 1.5,

  setOrigin: (label, lat, lon, alt, heading = 0) =>
    set({
      originLabel: label,
      userLat: lat,
      userLon: lon,
      userAlt: alt,
      sessionHeading: heading,
    }),

  setSessionHeading: (sessionHeading) => set({ sessionHeading }),
  setTrackingState: (trackingState) => set({ trackingState }),
  setSelectedAnchorId: (selectedAnchorId) => set({ selectedAnchorId }),
  setReticleDistanceMeters: (reticleDistanceMeters) => set({ reticleDistanceMeters }),
  setIsCalibrating: (isCalibrating) => set({ isCalibrating }),
}));
