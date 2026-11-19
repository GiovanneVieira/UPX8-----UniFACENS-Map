import { useEffect } from "react";
import {
  AdvancedMarker,
  Map,
  Polyline,
  useMap,
} from "@vis.gl/react-google-maps";
import { CAMPUS_MAP_CENTER, type CampusMapProps } from "./campus-map.types";
import { GoogleMapFrame, GOOGLE_MAP_ID } from "./google-map-frame.web";

/** Enquadra a câmera na polyline do percurso (child do <Map>). */
function RouteFitter({
  points,
}: {
  points: Array<{ latitude: number; longitude: number }>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map || points.length < 2) return;
    const bounds = new google.maps.LatLngBounds();
    for (const point of points) {
      bounds.extend({ lat: point.latitude, lng: point.longitude });
    }
    map.fitBounds(bounds, 48);
  }, [map, points]);
  return null;
}

export default function CampusMap({
  places,
  anchors,
  selectedPlace,
  onSelect,
  onSelectAnchor,
  routePolyline,
}: CampusMapProps) {
  const center = selectedPlace ?? CAMPUS_MAP_CENTER;
  return (
    <GoogleMapFrame fallback="Consulte os locais e suas informações na lista abaixo.">
      <Map
        mapId={GOOGLE_MAP_ID}
        defaultCenter={{
          lat: CAMPUS_MAP_CENTER.latitude,
          lng: CAMPUS_MAP_CENTER.longitude,
        }}
        defaultZoom={17}
        center={
          selectedPlace
            ? { lat: center.latitude, lng: center.longitude }
            : undefined
        }
        gestureHandling="cooperative"
        streetViewControl={false}
        mapTypeControl={false}
      >
        {places.map((place) => (
          <AdvancedMarker
            key={place.id}
            title={place.name}
            position={{ lat: place.latitude, lng: place.longitude }}
            onClick={() => onSelect(place.id)}
          />
        ))}
        {/* Pins AR (âncoras) — mesmo pin roxo do nativo; tap abre detalhes. */}
        {anchors.map((anchor) => (
          <AdvancedMarker
            key={`anchor-${anchor.id}`}
            title={anchor.name}
            position={{ lat: anchor.latitude, lng: anchor.longitude }}
            onClick={() => onSelectAnchor?.(anchor.id)}
          />
        ))}
        {/* Percurso calculado (planejamento) — mesma polyline Sky do nativo. */}
        {routePolyline && routePolyline.length >= 2 ? (
          <>
            <RouteFitter points={routePolyline} />
            <Polyline
              path={routePolyline.map((point) => ({
                lat: point.latitude,
                lng: point.longitude,
              }))}
              strokeColor="#38BDF8"
              strokeWeight={4}
            />
          </>
        ) : null}
      </Map>
    </GoogleMapFrame>
  );
}
