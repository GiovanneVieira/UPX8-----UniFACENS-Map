import type { Place } from "shared";

/** Âncora AR projetável no mapa 2D (pins criados na tab AR). */
export interface CampusAnchorMarker {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  categoryLabel: string | null;
}

/** Ponto da polyline do percurso calculado (WGS84). */
export interface RoutePolylinePoint {
  latitude: number;
  longitude: number;
}

export interface CampusMapProps {
  places: Place[];
  /**
   * Âncoras AR com coordenadas — o pin AR é o próprio local de interesse
   * (§2.1 do AGENTS.md): sem isto, pontos criados no AR ficam invisíveis
   * no mapa 2D do campus.
   */
  anchors: CampusAnchorMarker[];
  selectedPlace: Place | null;
  onSelect: (id: string) => void;
  /** Tap em marcador de âncora → abre o modal de detalhes (reuso do AR). */
  onSelectAnchor?: (id: string) => void;
  /**
   * Percurso calculado (planejamento): desenha a polyline e AJUSTA o
   * enquadramento da câmera para ela (fitToCoordinates/fitBounds).
   */
  routePolyline?: RoutePolylinePoint[];
}
// Centro inicial aproximado; os dados cadastrados determinam os marcadores.
export const CAMPUS_MAP_CENTER = { latitude: -23.4699, longitude: -47.4297 };
