import { Text, View } from "react-native";
import {
  NAVIGATION_REASON_LABELS,
  type NavigationGraph,
  type NavigationNeeds,
  type NavigationResult,
} from "shared";
import { PlanningNotice } from "./planning-ui";

const kinds = {
  walkway: "Calçada / caminho",
  footbridge: "Passarela",
  ramp: "Rampa",
  stairs: "Escada",
  elevator: "Elevador",
  platform: "Plataforma",
} as const;
const failures = {
  no_route: [
    "Nenhum caminho compatível",
    "Não há conexão disponível que respeite todas as suas escolhas. Confira os pontos selecionados ou consulte a equipe do campus.",
  ],
  insufficient_data: [
    "Faltam dados para recomendar um caminho",
    "Há passagens que precisam de medição ou conferência atualizada. Não foi possível confirmar um percurso com suas necessidades.",
  ],
  node_not_found: [
    "Ponto indisponível",
    "Atualize as áreas e selecione novamente a partida e a chegada.",
  ],
  demo_not_allowed: [
    "Demonstração não autorizada",
    "Selecione novamente a área de demonstração para simular o percurso.",
  ],
} as const;
const number = (value: number) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function describeNeeds(needs: NavigationNeeds): string[] {
  return [
    needs.stepFree ? "Sem degraus ou escadas" : "",
    needs.avoidLifts ? "Sem elevadores ou plataformas" : "",
    needs.requireFirmSurface ? "Piso firme e regular" : "",
    needs.requireHandrail ? "Corrimão em todos os trechos" : "",
    needs.requireTactilePaving ? "Piso tátil em todos os trechos" : "",
    needs.minWidthMeters !== null
      ? `Largura mínima: ${number(needs.minWidthMeters)} m`
      : "",
    needs.maxUphillSlopePercent !== null
      ? `Subida máxima: ${number(needs.maxUphillSlopePercent)}%`
      : "",
    needs.maxDownhillSlopePercent !== null
      ? `Descida máxima: ${number(needs.maxDownhillSlopePercent)}%`
      : "",
    needs.maxCrossSlopePercent !== null
      ? `Inclinação transversal máxima: ${number(needs.maxCrossSlopePercent)}%`
      : "",
  ].filter(Boolean);
}

export function RoutePreview({
  result,
  graph,
}: {
  result: NavigationResult;
  graph: NavigationGraph;
}) {
  if (
    result.graphId !== graph.id ||
    result.graphVersion !== graph.version ||
    result.dataSource !== graph.dataSource
  )
    return (
      <PlanningNotice>
        <Text className="text-rose-200">
          Os percursos mudaram. Atualize as áreas e calcule novamente.
        </Text>
      </PlanningNotice>
    );
  const needs = describeNeeds(result.needs);
  if (result.status !== "ok") {
    const [title, description] = failures[result.status];
    const reasons = [
      ...new Set(result.excludedEdges.flatMap((edge) => edge.reasons)),
    ];
    return (
      <PlanningNotice>
        <Text
          accessibilityRole="header"
          className="text-xl font-semibold text-amber-200"
        >
          {title}
        </Text>
        <Text className="text-slate-200">{description}</Text>
        {reasons.length ? (
          <Text className="text-sm text-slate-300">
            Motivos encontrados na área consultada (podem incluir passagens fora
            deste trajeto):
          </Text>
        ) : null}
        {reasons.map((reason) => (
          <Text key={reason} className="text-sm text-slate-200">
            • {NAVIGATION_REASON_LABELS[reason]}
          </Text>
        ))}
        <Text className="text-sm text-slate-300">
          As suas restrições foram mantidas.
        </Text>
      </PlanningNotice>
    );
  }
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const steps = result.edgeIds.map((id) => edges.get(id));
  const invalid =
    result.nodeIds.length !== steps.length + 1 ||
    result.nodeIds.some((id) => !nodes.has(id)) ||
    steps.some(
      (edge, index) =>
        !edge ||
        edge.fromNodeId !== result.nodeIds[index] ||
        edge.toNodeId !== result.nodeIds[index + 1],
    );
  if (invalid)
    return (
      <PlanningNotice>
        <Text className="text-rose-200">
          A sequência recebida está incompleta. Atualize as áreas e calcule
          novamente.
        </Text>
      </PlanningNotice>
    );
  return (
    <View
      accessibilityLiveRegion="polite"
      className="gap-4 rounded-2xl border border-sky-500 bg-slate-900 p-5"
    >
      <Text
        accessibilityRole="header"
        className="text-2xl font-bold text-white"
      >
        Prévia do percurso
      </Text>
      <Text className="text-3xl font-bold text-sky-200">
        {number(result.distanceMeters)} m
      </Text>
      <Text className="text-sm text-slate-300">
        Menor distância entre os caminhos compatíveis com suas escolhas. Soma
        dos comprimentos dos trechos cadastrados.
      </Text>
      {graph.dataSource === "demo" ? (
        <Text className="font-semibold text-amber-200">
          Simulação: pontos e distâncias fictícios. Não use para se deslocar no
          campus.
        </Text>
      ) : null}
      <View className="gap-1">
        <Text className="font-semibold text-white">Critérios aplicados</Text>
        {needs.length ? (
          needs.map((need) => (
            <Text key={need} className="text-slate-200">
              • {need}
            </Text>
          ))
        ) : (
          <Text className="text-slate-200">
            Nenhuma restrição de mobilidade selecionada. Pode haver degraus.
          </Text>
        )}
      </View>
      <Text className="text-slate-200">
        Partida: {nodes.get(result.nodeIds[0])?.name}
      </Text>
      {!steps.length ? (
        <Text className="text-slate-200">
          Partida e chegada são o mesmo ponto cadastrado. Não é necessário
          percorrer um trecho.
        </Text>
      ) : null}
      {steps.map((edge, index) =>
        edge ? (
          <View
            key={`${index}-${edge.id}`}
            className="gap-2 rounded-xl border border-slate-600 bg-slate-800 p-4"
          >
            <Text className="font-semibold text-white">
              {index + 1}. {kinds[edge.kind]} · {number(edge.lengthMeters)} m
            </Text>
            <Text className="text-slate-200">
              {nodes.get(edge.fromNodeId)?.name} →{" "}
              {nodes.get(edge.toNodeId)?.name}
            </Text>
            <Text className="text-sm text-slate-300">
              {[
                edge.stepCount === null
                  ? "Quantidade de degraus não informada"
                  : `${edge.stepCount} degraus`,
                edge.hasHandrail ? "Corrimão" : "",
                edge.hasTactilePaving ? "Piso tátil" : "",
                edge.surface === "firm_regular" ? "Piso firme e regular" : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            {edge.verification.status === "verified" ? (
              <Text className="text-xs text-slate-300">
                {graph.dataSource === "demo"
                  ? "Verificação simulada"
                  : "Revisão dos dados"}
                :{" "}
                {new Date(edge.verification.verifiedAt).toLocaleString("pt-BR")}
                . Validade:{" "}
                {new Date(edge.verification.validUntil).toLocaleString("pt-BR")}
                .
              </Text>
            ) : null}
          </View>
        ) : null,
      )}
      <Text className="font-semibold text-slate-100">
        Chegada: {nodes.get(result.nodeIds[result.nodeIds.length - 1])?.name}
      </Text>
      <Text className="text-sm text-slate-300">
        Esta tela planeja a chegada ao ponto AR selecionado. Acompanhamento por
        localização ainda não está disponível nesta tela.
      </Text>
    </View>
  );
}
