import { Platform, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { CAMPUS_MAP_CENTER, type CampusMapProps } from "./campus-map.types";
import { MapUnavailable } from "./map-unavailable";

export default function CampusMap({
  places,
  selectedPlace,
  onSelect,
}: CampusMapProps) {
  if (
    Platform.OS === "android" &&
    !process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY
  )
    return <MapUnavailable />;
  const center = selectedPlace ?? CAMPUS_MAP_CENTER;
  return (
    <View className="h-72 overflow-hidden rounded-2xl border border-slate-700">
      <MapView
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        style={{ flex: 1 }}
        initialRegion={{
          ...CAMPUS_MAP_CENTER,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        }}
        region={
          selectedPlace
            ? {
                latitude: center.latitude,
                longitude: center.longitude,
                latitudeDelta: 0.003,
                longitudeDelta: 0.003,
              }
            : undefined
        }
      >
        {places.map((place) => (
          <Marker
            key={place.id}
            coordinate={{
              latitude: place.latitude,
              longitude: place.longitude,
            }}
            title={place.name}
            description={
              place.source === "demo"
                ? "Exemplo ilustrativo"
                : "Consulte as informações na lista"
            }
            onPress={() => onSelect(place.id)}
          />
        ))}
      </MapView>
    </View>
  );
}
