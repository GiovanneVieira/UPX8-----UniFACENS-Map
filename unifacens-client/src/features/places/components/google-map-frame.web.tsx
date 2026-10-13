import type { ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import {
  APIProvider,
  APILoadingStatus,
  useApiLoadingStatus,
} from "@vis.gl/react-google-maps";
import { MapUnavailable } from "./map-unavailable";
import { useGoogleMapsAuthFailure } from "../hooks/use-google-maps-auth-failure.web";
import "./google-map-controls.web.css";

export const GOOGLE_MAP_ID =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

export function GoogleMapFrame({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: string;
}) {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY;
  const authFailed = useGoogleMapsAuthFailure();
  return (
    <View className="campus-google-map h-72 overflow-hidden rounded-2xl border border-slate-700">
      {authFailed ? (
        <MapUnavailable
          message={`O acesso ao mapa não foi autorizado. ${fallback}`}
        />
      ) : apiKey ? (
        <APIProvider apiKey={apiKey}>
          <GoogleMapStatus fallback={fallback}>{children}</GoogleMapStatus>
        </APIProvider>
      ) : (
        <MapUnavailable message={fallback} />
      )}
    </View>
  );
}

function GoogleMapStatus({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: string;
}) {
  const status = useApiLoadingStatus();
  if (status === APILoadingStatus.AUTH_FAILURE)
    return (
      <MapUnavailable
        message={`O acesso ao mapa não foi autorizado. ${fallback}`}
      />
    );
  if (status === APILoadingStatus.FAILED)
    return (
      <MapUnavailable
        message={`Não foi possível carregar o mapa. ${fallback}`}
      />
    );
  if (status !== APILoadingStatus.LOADED)
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-slate-900 p-4">
        <ActivityIndicator color="#7dd3fc" />
        <Text accessibilityLiveRegion="polite" className="text-slate-200">
          Carregando mapa…
        </Text>
      </View>
    );
  return children;
}
