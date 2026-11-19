import { useMemo } from "react";
import { Text, View } from "react-native";
import type { Anchor } from "shared";
import CampusMap from "@/features/places/components/campus-map";
import {
  buildRoutePolyline,
} from "../utils/build-route-polyline";
import type { RoutePolylinePoint } from "@/features/places/components/campus-map.types";

interface RoutableGraphNode {
  id: string;
  position?:
    | { kind: "geographic"; latitude: number; longitude: number }
    | { kind: "local"; referenceId: string; xMeters: number; yMeters: number }
    | null;
  anchorId?: string | null;
}

/**
 * Mapa do percurso calculado (tela Planejar): reusa o CampusMap com a
 * polyline + pins das âncoras de origem/destino. A câmera se enquadra na
 * rota (fitToCoordinates/fitBounds dentro do CampusMap).
 */
export function RouteMap({
  nodeIds,
  nodes,
  anchors,
}: {
  nodeIds: readonly string[];
  nodes: readonly RoutableGraphNode[];
  anchors: readonly Anchor[];
}) {
  const polyline = useMemo(
    () => buildRoutePolyline(nodeIds, nodes, anchors),
    [nodeIds, nodes, anchors],
  );

  if (!polyline) {
    return (
      <Text className="text-sm text-slate-400">
        Os nós deste percurso ainda não têm posições geográficas — exibindo
        apenas a descrição em texto.
      </Text>
    );
  }

  const involvedIds = new Set(
    nodes
      .filter((node) => nodeIds.includes(node.id) && node.anchorId)
      .map((node) => node.anchorId as string),
  );
  const endpointMarkers = anchors
    .filter((anchor) => involvedIds.has(anchor.id))
    .map((anchor) => ({
      id: anchor.id,
      name: anchor.name,
      latitude: anchor.latitude as number,
      longitude: anchor.longitude as number,
      categoryLabel: anchor.category?.label ?? null,
    }));

  return (
    <View className="gap-2">
      <View className="overflow-hidden rounded-2xl border border-slate-700">
        {/* O CampusMap tem altura própria (h-72) e enquadra a polyline. */}
        <CampusMap
          places={[]}
          anchors={endpointMarkers}
          selectedPlace={null}
          onSelect={() => undefined}
          routePolyline={polyline satisfies RoutePolylinePoint[]}
        />
      </View>
      <Text className="text-xs text-slate-400">
        Trajeto em azul sobre o mapa do campus. Fonte: posições do
        levantamento e dos pontos AR.
      </Text>
    </View>
  );
}
