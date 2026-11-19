import type { Anchor } from "shared";
import type { RoutePolylinePoint } from "@/features/places/components/campus-map.types";

interface RoutableNode {
  id: string;
  position?:
    | { kind: "geographic"; latitude: number; longitude: number }
    | { kind: "local"; referenceId: string; xMeters: number; yMeters: number }
    | null;
  anchorId?: string | null;
}

/**
 * Deriva a polyline geográfica do percurso a partir dos nós do caminho:
 * posição `geographic` do nó (levantamento) → fallback coordenada da
 * âncora vinculada (pin AR) → nó sem nenhuma das duas é PULSADO (a linha
 * liga os pontos conhecidos; posições `local` não têm datum global).
 *
 * Retorna null quando restam menos de 2 pontos (nada a desenhar).
 */
export function buildRoutePolyline(
  nodeIds: readonly string[],
  nodes: readonly RoutableNode[],
  anchors: readonly Anchor[],
): RoutePolylinePoint[] | null {
  const byAnchor = new Map(
    anchors
      .filter(
        (anchor) =>
          typeof anchor.latitude === "number" &&
          typeof anchor.longitude === "number",
      )
      .map((anchor) => [anchor.id, anchor] as const),
  );
  const points: RoutePolylinePoint[] = [];
  for (const nodeId of nodeIds) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) continue;
    if (node.position?.kind === "geographic") {
      points.push({
        latitude: node.position.latitude,
        longitude: node.position.longitude,
      });
      continue;
    }
    const anchor = node.anchorId ? byAnchor.get(node.anchorId) : undefined;
    if (anchor) {
      points.push({
        latitude: anchor.latitude as number,
        longitude: anchor.longitude as number,
      });
    }
  }
  // Colapsa pontos consecutivos idênticos (nó e âncora na mesma coord).
  const deduped = points.filter((point, index) => {
    if (index === 0) return true;
    const prev = points[index - 1]!;
    return (
      Math.abs(point.latitude - prev.latitude) > 1e-9 ||
      Math.abs(point.longitude - prev.longitude) > 1e-9
    );
  });
  return deduped.length >= 2 ? deduped : null;
}
