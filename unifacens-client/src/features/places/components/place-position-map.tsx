import { MapUnavailable } from "./map-unavailable";
import type { PlacePositionMapProps } from "./place-position-map.types";

export default function PlacePositionMap(_props: PlacePositionMapProps) {
  return (
    <MapUnavailable message="Preencha latitude e longitude nos campos do formulário para continuar." />
  );
}
