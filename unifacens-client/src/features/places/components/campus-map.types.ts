import type { Place } from "shared";
export interface CampusMapProps {
  places: Place[];
  selectedPlace: Place | null;
  onSelect: (id: string) => void;
}
// Centro inicial aproximado; os dados cadastrados determinam os marcadores.
export const CAMPUS_MAP_CENTER = { latitude: -23.4699, longitude: -47.4297 };
