import { useState } from "react";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import { View } from "react-native";
import { CAMPUS_MAP_CENTER, type CampusMapProps } from "./campus-map.types";
import { MapUnavailable } from "./map-unavailable";

export default function CampusMap({
  places,
  selectedPlace,
  onSelect,
}: CampusMapProps) {
  const [failed, setFailed] = useState(false);
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY;
  if (!key || failed) return <MapUnavailable />;
  const center = selectedPlace ?? CAMPUS_MAP_CENTER;
  return (
    <View className="h-72 overflow-hidden rounded-2xl border border-slate-700">
      <APIProvider apiKey={key} onError={() => setFailed(true)}>
        <Map
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
            <Marker
              key={place.id}
              title={place.name}
              position={{ lat: place.latitude, lng: place.longitude }}
              onClick={() => onSelect(place.id)}
            />
          ))}
        </Map>
      </APIProvider>
    </View>
  );
}
