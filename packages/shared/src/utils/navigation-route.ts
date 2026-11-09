import {
  navigationGraphSchema,
  navigationRequestSchema,
  navigationResultSchema,
  type NavigationEdge,
  type NavigationGraph,
  type NavigationRequestInput,
  type NavigationResult,
} from "../schemas/navigation.schema.js";
import {
  assessNavigationEdge,
  isNavigationDataGap,
  navigationEvaluationTime,
} from "./navigation-policy.js";

/** Dijkstra por comprimento: sem atalhos geométricos ou ligações reversas implícitas. */
function shortestPath(
  edges: NavigationEdge[],
  origin: string,
  destination: string,
): { nodeIds: string[]; edgeIds: string[]; distanceMeters: number } | null {
  const adjacency = new Map<string, NavigationEdge[]>();
  for (const edge of edges) {
    const outgoing = adjacency.get(edge.fromNodeId) ?? [];
    outgoing.push(edge);
    adjacency.set(edge.fromNodeId, outgoing);
  }
  const distances = new Map([[origin, 0]]);
  const pending = new Set([origin]);
  const visited = new Set<string>();
  const previous = new Map<string, NavigationEdge>();
  while (pending.size > 0) {
    let current: string | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const nodeId of pending) {
      const distance = distances.get(nodeId)!;
      if (distance < best) {
        current = nodeId;
        best = distance;
      }
    }
    if (current === undefined) break;
    pending.delete(current);
    if (current === destination) {
      const nodeIds = [destination];
      const edgeIds: string[] = [];
      let nodeId = destination;
      while (nodeId !== origin) {
        const edge = previous.get(nodeId)!;
        edgeIds.push(edge.id);
        nodeId = edge.fromNodeId;
        nodeIds.push(nodeId);
      }
      return {
        nodeIds: nodeIds.reverse(),
        edgeIds: edgeIds.reverse(),
        distanceMeters: best,
      };
    }
    visited.add(current);
    for (const edge of adjacency.get(current) ?? []) {
      if (visited.has(edge.toNodeId)) continue;
      const distance = best + edge.lengthMeters;
      if (!Number.isFinite(distance))
        throw new Error("Comprimento acumulado fora do intervalo numérico.");
      if (
        distance < (distances.get(edge.toNodeId) ?? Number.POSITIVE_INFINITY)
      ) {
        distances.set(edge.toNodeId, distance);
        previous.set(edge.toNodeId, edge);
        pending.add(edge.toNodeId);
      }
    }
  }
  return null;
}

/**
 * Núcleo independente de HTTP, GPS e persistência. A futura API deverá fornecer
 * a rede autoritativa; dataSource não é um atestado produzido por este motor.
 */
export function findNavigationRoute(
  graphInput: NavigationGraph,
  requestInput: NavigationRequestInput,
  evaluatedAt: string,
): NavigationResult {
  const graph = navigationGraphSchema.parse(graphInput);
  const request = navigationRequestSchema.parse(requestInput);
  navigationEvaluationTime(evaluatedAt);
  const context = {
    graphId: graph.id,
    graphVersion: graph.version,
    dataSource: graph.dataSource,
    needs: request.needs,
  };
  if (graph.dataSource === "demo" && request.mode !== "demonstration") {
    return navigationResultSchema.parse({
      ...context,
      status: "demo_not_allowed",
      excludedEdges: [],
    });
  }
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (
    !nodeIds.has(request.originNodeId) ||
    !nodeIds.has(request.destinationNodeId)
  ) {
    return navigationResultSchema.parse({
      ...context,
      status: "node_not_found",
      excludedEdges: [],
    });
  }
  const eligible: NavigationEdge[] = [];
  const pendingData: NavigationEdge[] = [];
  const excludedEdges = [];
  for (const edge of graph.edges) {
    const assessment = assessNavigationEdge(edge, request.needs, evaluatedAt);
    if (assessment.eligible) eligible.push(edge);
    else {
      excludedEdges.push({ edgeId: edge.id, reasons: assessment.reasons });
      if (assessment.reasons.every(isNavigationDataGap)) pendingData.push(edge);
    }
  }
  const path = shortestPath(
    eligible,
    request.originNodeId,
    request.destinationNodeId,
  );
  if (path)
    return navigationResultSchema.parse({ ...context, status: "ok", ...path });

  // Essa segunda busca apenas explica a lacuna. Nunca retorna o caminho incerto.
  const missingInformation = shortestPath(
    [...eligible, ...pendingData],
    request.originNodeId,
    request.destinationNodeId,
  );
  return navigationResultSchema.parse({
    ...context,
    status: missingInformation ? "insufficient_data" : "no_route",
    excludedEdges,
  });
}
