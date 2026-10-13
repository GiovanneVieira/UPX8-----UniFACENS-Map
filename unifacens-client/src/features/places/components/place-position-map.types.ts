import type { PlacePosition } from "shared";

export interface PlacePositionMapProps {
  position: PlacePosition | null;
  onSelectPosition: (position: PlacePosition) => void;
}
