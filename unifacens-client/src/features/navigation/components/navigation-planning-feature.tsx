import { Link } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAnchorsQuery } from "@/features/anchors/queries/use-anchors-query";
import { useNavigationNetworksQuery } from "../queries/use-navigation-query";
import { NavigationPlanForm } from "./navigation-plan-form";
import { PlanningButton, PlanningNotice } from "./planning-ui";

export function NavigationPlanningFeature() {
  const anchors = useAnchorsQuery();
  const networks = useNavigationNetworksQuery();
  const published =
    networks.data?.pages
      .flatMap((page) => page.items)
      .filter((network) => network.status === "published") ?? [];
  const networkControls = (
    <View className="gap-3">
      {networks.isPending ? (
        <Text accessibilityLiveRegion="polite" className="text-slate-200">
          Carregando caminhos…
        </Text>
      ) : null}
      {networks.isError ? (
        <Text accessibilityRole="alert" className="text-rose-200">
          {networks.error.message}
        </Text>
      ) : null}
      {networks.isSuccess && !published.length ? (
        <PlanningNotice>
          <Text className="font-semibold text-white">
            Ainda não há percursos publicados
          </Text>
          <Text className="text-slate-200">
            Seus pontos AR continuam disponíveis para busca. O cálculo será
            liberado quando a equipe publicar os caminhos que os conectam.
          </Text>
        </PlanningNotice>
      ) : null}
      {networks.hasNextPage ? (
        <PlanningButton
          disabled={networks.isFetchingNextPage}
          onPress={() => void networks.fetchNextPage()}
        >
          {networks.isFetchingNextPage ? "Carregando…" : "Carregar mais áreas"}
        </PlanningButton>
      ) : null}
      <PlanningButton
        disabled={networks.isFetching}
        onPress={() => void networks.refetch()}
      >
        {networks.isFetching ? "Atualizando áreas…" : "Atualizar áreas"}
      </PlanningButton>
    </View>
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
              Busque um ponto AR e planeje o caminho até ele considerando suas
              necessidades de locomoção.
            </Text>
          </View>
          {anchors.isPending ? (
            <View className="flex-row items-center gap-3">
              <ActivityIndicator color="#7dd3fc" />
              <Text accessibilityLiveRegion="polite" className="text-slate-200">
                Carregando pontos AR…
              </Text>
            </View>
          ) : null}
          {anchors.isError ? (
            <PlanningNotice>
              <Text accessibilityRole="alert" className="text-rose-200">
                Não foi possível carregar os pontos AR. Confira a conexão e
                atualize a lista.
              </Text>
            </PlanningNotice>
          ) : null}
          {anchors.isSuccess && !anchors.data.length ? (
            <PlanningNotice>
              <Text className="font-semibold text-white">
                Nenhum ponto AR cadastrado
              </Text>
              <Text className="text-slate-200">
                Os pontos AR cadastrados no app aparecerão aqui com seus nomes e
                referências.
              </Text>
            </PlanningNotice>
          ) : null}
          <PlanningButton
            disabled={anchors.isFetching}
            onPress={() => void anchors.refetch()}
          >
            {anchors.isFetching ? "Atualizando pontos…" : "Atualizar pontos AR"}
          </PlanningButton>
          {anchors.data?.length ? (
            <NavigationPlanForm
              anchors={anchors.data}
              networks={published}
              networkControls={networkControls}
            />
          ) : (
            networkControls
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
