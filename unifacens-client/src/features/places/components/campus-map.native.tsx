import React, { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
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
  anchors,
  selectedPlace,
  onSelect,
  onSelectAnchor,
  routePolyline,
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

  // Percurso calculado: enquadra a câmera na polyline (a rota pode ser
  // ~100m — o initialRegion do campus a deixaria subpixel).
  useEffect(() => {
    if (routePolyline && routePolyline.length >= 2) {
      mapRef.current?.fitToCoordinates(routePolyline, {
        edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
        animated: true,
      });
    }
  }, [routePolyline]);

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
        {/* Pins AR (âncoras): roxo — tap abre o modal de detalhes (mesmo
            sheet da tab AR: carrossel, descrição, distância, etc.). */}
        {anchors.map((anchor) => (
          <Marker
            key={`anchor-${anchor.id}`}
            coordinate={{
              latitude: anchor.latitude,
              longitude: anchor.longitude,
            }}
            title={anchor.name}
            description={
              anchor.categoryLabel
                ? `Ponto AR · ${anchor.categoryLabel}`
                : 'Ponto AR'
            }
            pinColor="#8B5CF6"
            tracksViewChanges={false}
            onPress={() => onSelectAnchor?.(anchor.id)}
          />
        ))}
        {/* Percurso calculado (planejamento) — polyline azul Sky. */}
        {routePolyline && routePolyline.length >= 2 ? (
          <Polyline
            coordinates={routePolyline}
            strokeColor="#38BDF8"
            strokeWidth={4}
            lineDashPattern={routePolyline.length === 2 ? [12, 8] : undefined}
          />
        ) : null}
      </MapView>
    </View>
  );
});

export default CampusMapBase;
