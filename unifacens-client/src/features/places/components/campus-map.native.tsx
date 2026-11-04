import React, { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { CAMPUS_MAP_CENTER, type CampusMapProps } from './campus-map.types';
import { MapUnavailable } from './map-unavailable';

/**
 * Mapa do campus — otimizado para 60 FPS:
 * - `initialRegion` imutável (NUNCA `region` controlado: cada re-render do
 *   explorer — ex.: cada tecla digitada na busca — faria o mapa "voar");
 * - Centralização via `animateCamera` imperativa apenas quando o local
 *   selecionado muda de fato;
 * - `React.memo`: markers só re-criam quando a lista filtrada muda.
 */
const CampusMapBase = React.memo(function CampusMap({
  places,
  selectedPlace,
  onSelect,
}: CampusMapProps) {
  const mapRef = useRef<MapView>(null);
  const lastSelectedId = useRef<string | null>(null);

  useEffect(() => {
    const id = selectedPlace?.id ?? null;
    if (id && id !== lastSelectedId.current && selectedPlace) {
      lastSelectedId.current = id;
      mapRef.current?.animateCamera(
        {
          center: {
            latitude: selectedPlace.latitude,
            longitude: selectedPlace.longitude,
          },
          zoom: 17,
        },
        { duration: 350 },
      );
    }
  }, [selectedPlace]);

  if (
    Platform.OS === 'android' &&
    !process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY
  )
    return <MapUnavailable />;

  return (
    <View className="h-72 overflow-hidden rounded-2xl border border-neutral-800">
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={{ flex: 1 }}
        initialRegion={{
          ...CAMPUS_MAP_CENTER,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        }}
        rotateEnabled={false}
        toolbarEnabled={false}
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
              place.source === 'demo'
                ? 'Exemplo ilustrativo'
                : 'Consulte as informações na lista'
            }
            onPress={() => onSelect(place.id)}
          />
        ))}
      </MapView>
    </View>
  );
});

export default CampusMapBase;
