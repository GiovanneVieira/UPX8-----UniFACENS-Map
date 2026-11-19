import type { NavigationEdge, NavigationGraph, NavigationNode } from 'shared';
import { type WalkableGrid, latLngToCell } from './grid-builder.js';
import { findRoute } from './astar.js';

/** Âncora com coordenada — insumo da malha (pin AR = nó de referência). */
export interface DraftAnchor {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Tour pelo vizinho-mais-próximo (v1 — esqueleto conectando todos os pins;
 * evolução anotada no plano: pares completos). Retorna as âncoras na ordem
 * de visita.
 */
function nearestNeighborOrder(anchors: DraftAnchor[]): DraftAnchor[] {
  const remaining = [...anchors];
  const order: DraftAnchor[] = [remaining.shift()!];
  while (remaining.length > 0) {
    const current = order[order.length - 1]!;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]!;
      const distance = haversine(
        current.latitude,
        current.longitude,
        candidate.latitude,
        candidate.longitude,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    order.push(remaining.splice(bestIndex, 1)[0]!);
  }
  return order;
}

/**
 * Gera a MALHA EM RASCUNHO da rede de navegação a partir da grade
 * caminhável (grid A* do campus):
 *
 * - Geometria AUTOMÁTICA: para cada par consecutivo do tour, A* + suavização
 *   produzem os vértices de decisão; vértices de caminhos distintos que
 *   caem na MESMA célula (2m) são mesclados (grafo conectado).
 * - Acessibilidade DESCONHECIDA por construção: todo trecho nasce com
 *   atributos `null`, `verification: unverified` e `availability: unknown`
 *   — o motor exclui com motivos `*_unknown`/`unverified` e o cálculo
 *   responde `insufficient_data` até o levantamento conferir (honestidade;
 *   nunca rota inventada). A equipe completa os atributos no editor.
 * - `lengthMeters` = soma dos segmentos com linha de visão da suavização
 *   (caminhável por construção).
 */
export function generateDraftNetwork(
  grid: WalkableGrid,
  anchors: DraftAnchor[],
  networkId: string,
  version: string,
): NavigationGraph {
  const order = nearestNeighborOrder(anchors);
  const nodes = new Map<string, NavigationNode>();
  for (const anchor of order) {
    nodes.set(anchor.id, {
      id: anchor.id,
      name: anchor.name,
      kind: 'reference',
      anchorId: anchor.id,
      position: {
        kind: 'geographic',
        latitude: anchor.latitude,
        longitude: anchor.longitude,
      },
    });
  }

  const edges: NavigationEdge[] = [];
  let edgeSeq = 0;
  let junctionSeq = 0;

  for (let i = 0; i < order.length - 1; i++) {
    const from = order[i]!;
    const to = order[i + 1]!;
    const path = findRoute(grid, from.latitude, from.longitude, to.latitude, to.longitude);
    if (!path) {
      throw new Error(
        `Sem caminho caminhável na grade entre "${from.name}" e "${to.name}".`,
      );
    }

    // Cadeia de nós do trecho: âncora inicial + vértices intermediários
    // (mesclados por célula) + âncora final — com o índice do path de cada
    // um para somar comprimentos corretamente quando células colidem.
    const chain: Array<{ node: NavigationNode; pathIndex: number }> = [
      { node: nodes.get(from.id)!, pathIndex: 0 },
    ];
    for (let v = 1; v < path.length - 1; v++) {
      const point = path[v]!;
      const { row, col } = latLngToCell(grid, point.latitude, point.longitude);
      const cellKey = `junction-r${row}c${col}`;
      let node = nodes.get(cellKey);
      if (!node) {
        junctionSeq += 1;
        node = {
          id: cellKey,
          name: `Passagem ${junctionSeq}`,
          kind: 'junction',
          position: {
            kind: 'geographic',
            latitude: point.latitude,
            longitude: point.longitude,
          },
        };
        nodes.set(cellKey, node);
      }
      chain.push({ node, pathIndex: v });
    }
    chain.push({ node: nodes.get(to.id)!, pathIndex: path.length - 1 });

    for (let c = 0; c < chain.length - 1; c++) {
      const current = chain[c]!;
      const next = chain[c + 1]!;
      if (current.node.id === next.node.id) continue; // mesma célula: já conectados
      let lengthMeters = 0;
      for (let p = current.pathIndex; p < next.pathIndex; p++) {
        const a = path[p]!;
        const b = path[p + 1]!;
        lengthMeters += haversine(a.latitude, a.longitude, b.latitude, b.longitude);
      }
      if (lengthMeters <= 0) continue;
      edgeSeq += 1;
      edges.push({
        id: `edge-${edgeSeq}`,
        fromNodeId: current.node.id,
        toNodeId: next.node.id,
        kind: 'walkway',
        lengthMeters: Math.round(lengthMeters * 10) / 10,
        widthMeters: null,
        longitudinalSlopePercent: null,
        crossSlopePercent: null,
        stepCount: null,
        hasHandrail: null,
        hasTactilePaving: null,
        surface: null,
        verification: { status: 'unverified' },
        availability: { status: 'unknown' },
      });
    }
  }

  return {
    id: networkId,
    version,
    dataSource: 'field_survey',
    nodes: [...nodes.values()],
    edges,
  };
}
