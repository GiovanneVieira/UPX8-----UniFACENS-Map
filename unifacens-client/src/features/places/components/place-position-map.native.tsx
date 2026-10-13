import { Platform, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { CAMPUS_MAP_CENTER } from "./campus-map.types";
import { MapUnavailable } from "./map-unavailable";
import type { PlacePositionMapProps } from "./place-position-map.types";

export default function PlacePositionMap({
  position,
  onSelectPosition,
}: PlacePositionMapProps) {
  if (
    Platform.OS === "android" &&
    !process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY
  )
    return (
      <MapUnavailable message="Preencha latitude e longitude nos campos do formulário para continuar." />
    );
  const center = position ?? CAMPUS_MAP_CENTER;
  return (
    <View className="h-72 overflow-hidden rounded-2xl border border-slate-700">
      <MapView
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        style={{ flex: 1 }}
        initialRegion={{
          ...center,
          latitudeDelta: 0.003,
          longitudeDelta: 0.003,
        }}
        onPress={(event) => onSelectPosition(event.nativeEvent.coordinate)}
      >
        {position ? (
          <Marker
            coordinate={position}
            title="Posição selecionada para o local"
            draggable
            onDragEnd={(event) =>
              onSelectPosition(event.nativeEvent.coordinate)
            }
          />
        ) : null}
      </MapView>
    </View>
  );
}
