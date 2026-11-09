import { useState } from "react";
import { Link } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NavigationNetworkSummary } from "shared";
import {
  useNavigationNetworksQuery,
  useNavigationVersionQuery,
} from "../queries/use-navigation-query";
import { NavigationPlanForm } from "./navigation-plan-form";
import { PlanningButton, PlanningNotice } from "./planning-ui";
import { SelectionControl } from "./selection-control";

export function NavigationPlanningFeature() {
  const query = useNavigationNetworksQuery();
  const [selected, setSelected] = useState<NavigationNetworkSummary | null>(
    null,
  );
  const networks =
    query.data?.pages
      .flatMap((page) => page.items)
      .filter((network) => network.status === "published") ?? [];
  const active = networks.find(
    (network) =>
      network.networkId === selected?.networkId &&
      network.version === selected.version,
  );
  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="w-full max-w-3xl self-center gap-6 px-4 pb-12 pt-5 md:px-8">
          <Link href="/campus" asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-[48px] self-start justify-center px-2 active:opacity-80"
            >
              <Text className="font-semibold text-sky-200">
                ← Voltar ao campus
              </Text>
            </Pressable>
          </Link>
          <View className="gap-2">
            <Text className="text-sm font-semibold text-sky-300">
              UniFACENS Map
            </Text>
            <Text
              accessibilityRole="header"
              className="text-3xl font-bold text-white"
            >
              Planejar percurso
            </Text>
            <Text className="text-slate-300">
              Encontre um caminho até o prédio considerando suas necessidades de
              locomoção.
            </Text>
          </View>
          <View className="gap-3">
            <Text
              accessibilityRole="header"
              className="text-xl font-semibold text-white"
            >
              Área de planejamento
            </Text>
            <Text className="text-sm text-slate-300">
              Escolha um conjunto de percursos publicado pela equipe.
            </Text>
            {query.isPending ? (
              <View className="flex-row items-center gap-3">
                <ActivityIndicator color="#7dd3fc" />
                <Text
                  accessibilityLiveRegion="polite"
                  className="text-slate-200"
                >
                  Carregando áreas…
                </Text>
              </View>
            ) : null}
            {query.isError ? (
              <PlanningNotice>
                <Text accessibilityRole="alert" className="text-rose-200">
                  {query.error.message}
                </Text>
              </PlanningNotice>
            ) : null}
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Área de planejamento"
              className="gap-3"
            >
              {networks.map((network) => (
                <SelectionControl
                  key={`${network.networkId}/${network.version}`}
                  kind="radio"
                  label={`${network.dataSource === "demo" ? "Demonstração · dados fictícios" : "Percursos do campus"} · ${network.networkId} · versão ${network.version}`}
                  groupName="navigation-network"
                  checked={active === network}
                  onSelect={() => setSelected(network)}
                  className={`min-h-[48px] gap-1 rounded-xl border p-4 active:opacity-80 ${active === network ? "border-sky-300 bg-blue-950" : "border-slate-600 bg-slate-900"}`}
                >
                  <View className="gap-1">
                    <Text className="font-semibold text-white">
                      {network.dataSource === "demo"
                        ? "Demonstração · dados fictícios"
                        : "Percursos do campus"}
                    </Text>
                    <Text className="text-sm text-slate-300">
                      {network.networkId} · versão {network.version}
                    </Text>
                  </View>
                </SelectionControl>
              ))}
            </View>
            {query.isSuccess && !networks.length ? (
              <PlanningNotice>
                <Text className="font-semibold text-white">
                  Ainda não há percursos publicados
                </Text>
                <Text className="text-slate-200">
                  Os caminhos estão sendo preparados e conferidos pela equipe.
                  As áreas aparecerão aqui quando estiverem disponíveis.
                </Text>
              </PlanningNotice>
            ) : null}
            {query.hasNextPage ? (
              <PlanningButton
                disabled={query.isFetchingNextPage}
                onPress={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage
                  ? "Carregando…"
                  : "Carregar mais áreas"}
              </PlanningButton>
            ) : null}
            <PlanningButton
              disabled={query.isFetching}
              onPress={() => {
                setSelected(null);
                void query.refetch();
              }}
            >
              {query.isFetching ? "Atualizando áreas…" : "Atualizar áreas"}
            </PlanningButton>
          </View>
          {active ? (
            <NetworkPlanner
              key={`${active.networkId}/${active.version}`}
              network={active}
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function NetworkPlanner({ network }: { network: NavigationNetworkSummary }) {
  const query = useNavigationVersionQuery(network);
  if (query.isPending)
    return (
      <Text accessibilityLiveRegion="polite" className="text-slate-200">
        Carregando pontos e caminhos…
      </Text>
    );
  if (query.isError)
    return (
      <PlanningNotice>
        <Text accessibilityRole="alert" className="text-rose-200">
          {query.error.message}
        </Text>
        <PlanningButton onPress={() => void query.refetch()}>
          Tentar carregar novamente
        </PlanningButton>
      </PlanningNotice>
    );
  if (query.data.status !== "published")
    return (
      <PlanningNotice>
        <Text className="text-slate-200">
          Esta área não está mais disponível. Atualize as áreas para continuar.
        </Text>
      </PlanningNotice>
    );
  return <NavigationPlanForm graph={query.data.graph} />;
}
