import {
  AdvancedMarker,
  Map,
  type MapMouseEvent,
} from "@vis.gl/react-google-maps";
import { CAMPUS_MAP_CENTER } from "./campus-map.types";
import { GoogleMapFrame, GOOGLE_MAP_ID } from "./google-map-frame.web";
import type { PlacePositionMapProps } from "./place-position-map.types";

export default function PlacePositionMap({
  position,
  onSelectPosition,
}: PlacePositionMapProps) {
  const center = position ?? CAMPUS_MAP_CENTER;
  function selectPoint(event: MapMouseEvent) {
    const point = event.detail.latLng;
    if (point) onSelectPosition({ latitude: point.lat, longitude: point.lng });
  }
  return (
    <GoogleMapFrame fallback="Preencha latitude e longitude nos campos do formulário para continuar.">
      <Map
        mapId={GOOGLE_MAP_ID}
        defaultCenter={{ lat: center.latitude, lng: center.longitude }}
        defaultZoom={18}
        gestureHandling="cooperative"
        streetViewControl={false}
        mapTypeControl={false}
        onClick={selectPoint}
      >
        {position ? (
          <AdvancedMarker
            title="Posição selecionada para o local"
            position={{ lat: position.latitude, lng: position.longitude }}
            draggable
            onDragEnd={(event) => {
              const point = event.latLng;
              if (point)
                onSelectPosition({
                  latitude: point.lat(),
                  longitude: point.lng(),
                });
            }}
          />
        ) : null}
      </Map>
    </GoogleMapFrame>
  );
}
