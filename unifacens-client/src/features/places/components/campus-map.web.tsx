import { AdvancedMarker, Map } from "@vis.gl/react-google-maps";
import { CAMPUS_MAP_CENTER, type CampusMapProps } from "./campus-map.types";
import { GoogleMapFrame, GOOGLE_MAP_ID } from "./google-map-frame.web";

export default function CampusMap({
  places,
  selectedPlace,
  onSelect,
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
      </Map>
    </GoogleMapFrame>
  );
}
