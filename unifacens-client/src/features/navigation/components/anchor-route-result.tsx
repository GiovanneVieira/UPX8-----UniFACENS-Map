import { Text, View } from "react-native";
import type {
  Anchor,
  NavigationAnchorResult,
  NavigationNetworkParams,
} from "shared";
import { useNavigationVersionQuery } from "../queries/use-navigation-query";
import { PlanningButton, PlanningNotice } from "./planning-ui";
import { RoutePreview } from "./route-preview";

export function AnchorRouteResult({
  result,
  network,
  anchors,
}: {
  result: NavigationAnchorResult;
  network: NavigationNetworkParams;
  anchors: Anchor[];
}) {
  const query = useNavigationVersionQuery(
    network,
    result.status !== "anchor_not_in_network",
  );
  if (
    result.graphId !== network.networkId ||
    result.graphVersion !== network.version
  )
    return (
      <PlanningNotice>
        <Text className="text-slate-200">
          Os percursos mudaram. Atualize as áreas e calcule novamente.
        </Text>
      </PlanningNotice>
    );
  if (result.status === "anchor_not_in_network")
    return (
      <PlanningNotice>
        <Text
          accessibilityRole="header"
          className="text-xl font-semibold text-amber-200"
        >
          Ponto AR encontrado, percurso ainda indisponível
        </Text>
        <Text className="text-slate-200">
          Os seguintes locais estão cadastrados, mas ainda não estão ligados aos
          caminhos desta área:
        </Text>
        {result.unmappedAnchorIds.map((id) => (
          <Text key={id} className="text-slate-200">
            •{" "}
            {anchors.find((anchor) => anchor.id === id)?.name ??
              "Ponto AR selecionado"}
          </Text>
        ))}
        <Text className="text-sm text-slate-300">
          Escolha outra área ou aguarde a associação dos pontos à rede de
          percursos pela equipe. Os pontos existentes podem ser reaproveitados.
        </Text>
      </PlanningNotice>
    );
  if (query.isPending)
    return (
      <Text accessibilityLiveRegion="polite" className="text-slate-200">
        Carregando os detalhes do percurso…
      </Text>
    );
  if (query.isError)
    return (
      <PlanningNotice>
        <Text accessibilityRole="alert" className="text-rose-200">
          {query.error.message}
        </Text>
        <PlanningButton onPress={() => void query.refetch()}>
          Tentar carregar a prévia novamente
        </PlanningButton>
      </PlanningNotice>
    );
  if (query.data.status !== "published")
    return (
      <PlanningNotice>
        <Text className="text-slate-200">
          Esta área foi atualizada. Atualize os caminhos e calcule novamente.
        </Text>
      </PlanningNotice>
    );
  const names = new Map(anchors.map((anchor) => [anchor.id, anchor.name]));
  const graph = {
    ...query.data.graph,
    nodes: query.data.graph.nodes.map((node) => ({
      ...node,
      name: node.anchorId ? (names.get(node.anchorId) ?? node.name) : node.name,
    })),
  };
  return (
    <View>
      <RoutePreview graph={graph} result={result} />
    </View>
  );
}
