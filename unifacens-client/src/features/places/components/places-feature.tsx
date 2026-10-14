import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePlacesExplorer } from "../hooks/use-places-explorer";
import CampusMap from "./campus-map";
import { PlaceFormModal } from "./place-form-modal";
import { PlaceCard } from "./place-card";
import { PlaceDetails } from "./place-details";
import { PlacesSearch } from "./places-search";
import { TeamAccessPanel } from "@/features/access/components/team-access-panel";
import { useTeamAccess } from "@/features/access/hooks/use-team-access";

export function PlacesFeature() {
  const explorer = usePlacesExplorer();
  const access = useTeamAccess();
  const { query, details, places, selectedId, selectPlace, total } = explorer;
  return (
    <SafeAreaView
      className="flex-1 bg-slate-950"
      edges={["top", "left", "right"]}
    >
      <ScrollView keyboardShouldPersistTaps="handled">
        <View className="w-full max-w-5xl self-center gap-6 px-4 pb-28 pt-6 md:px-8">
          <View className="flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <View className="w-full md:w-auto md:flex-1">
              <Text className="text-sm font-semibold text-sky-300">
                UniFACENS Map
              </Text>
              <Text
                accessibilityRole="header"
                className="mt-1 text-3xl font-bold text-white"
              >
                Locais do campus
              </Text>
              <Text className="mt-2 text-sm text-slate-300">
                Encontre salas, prédios e serviços cadastrados pela equipe.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => explorer.setEditor("create")}
              className="min-h-[44px] justify-center rounded-xl bg-blue-700 px-4 active:opacity-80"
            >
              <Text className="font-semibold text-white">Cadastrar local</Text>
            </Pressable>
          </View>
          {explorer.notice ? (
            <Text
              accessibilityLiveRegion="polite"
              className="text-sm text-emerald-200"
            >
              {explorer.notice}
            </Text>
          ) : null}
          <PlacesSearch explorer={explorer} />
          <TeamAccessPanel />
          <View className="gap-2">
            <Text
              accessibilityRole="header"
              className="text-xl font-semibold text-white"
            >
              Mapa do campus
            </Text>
            <CampusMap
              places={places}
              selectedPlace={details.data ?? null}
              onSelect={selectPlace}
            />
            <Text className="text-xs text-slate-400">
              O mapa apresenta os locais carregados nesta busca. Confira a
              origem e a verificação dos dados antes de utilizá-los.
            </Text>
          </View>
          {details.isFetching && selectedId ? (
            <Text
              accessibilityLiveRegion="polite"
              className="text-sm text-slate-200"
            >
              Carregando detalhes…
            </Text>
          ) : null}
          {details.isError ? (
            <View className="gap-2">
              <Text
                accessibilityLiveRegion="polite"
                className="text-sm text-rose-300"
              >
                Não foi possível carregar os detalhes.
              </Text>
              <RetryButton onPress={() => void details.refetch()} />
            </View>
          ) : null}
          {details.data ? (
            <PlaceDetails
              place={details.data}
              onClose={() => selectPlace(null)}
              onEdit={
                access.canEdit ? () => explorer.setEditor("edit") : undefined
              }
            />
          ) : null}
          <View className="gap-3">
            <Text
              accessibilityRole="header"
              className="text-xl font-semibold text-white"
            >
              Locais encontrados
            </Text>
            {query.isPending ? (
              <View className="flex-row items-center gap-3">
                <ActivityIndicator color="#7dd3fc" />
                <Text
                  accessibilityLiveRegion="polite"
                  className="text-slate-200"
                >
                  Carregando locais…
                </Text>
              </View>
            ) : null}
            {query.isError ? (
              <View className="gap-3 rounded-2xl border border-rose-400 bg-slate-900 p-4">
                <Text
                  accessibilityLiveRegion="polite"
                  className="text-rose-200"
                >
                  Não foi possível carregar os locais. Confira a conexão e tente
                  novamente.
                </Text>
                <RetryButton onPress={() => void query.refetch()} />
              </View>
            ) : null}
            {query.isSuccess && places.length === 0 ? (
              <Text
                accessibilityLiveRegion="polite"
                className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-200"
              >
                Nenhum local encontrado. Altere a busca ou cadastre o primeiro
                local.
              </Text>
            ) : null}
            {places.length > 0 ? (
              <Text
                accessibilityLiveRegion="polite"
                className="text-sm text-slate-300"
              >
                {places.length} de {total} locais
              </Text>
            ) : null}
            {places.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                selected={selectedId === place.id}
                onSelect={() => selectPlace(place.id)}
              />
            ))}
            {query.hasNextPage ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: query.isFetchingNextPage }}
                disabled={query.isFetchingNextPage}
                onPress={() => void query.fetchNextPage()}
                className="min-h-[44px] items-center justify-center rounded-xl border border-sky-400 bg-slate-900 px-4 active:opacity-80"
              >
                <Text className="font-semibold text-sky-200">
                  {query.isFetchingNextPage
                    ? "Carregando…"
                    : "Carregar mais locais"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>
      {explorer.editor === "create" ||
      (explorer.editor === "edit" && details.data) ? (
        <PlaceFormModal
          key={explorer.editor === "edit" ? selectedId : "create"}
          initialPlace={explorer.editor === "edit" ? details.data : undefined}
          onClose={() => explorer.setEditor(null)}
          onSaved={explorer.onSaved}
        />
      ) : null}
    </SafeAreaView>
  );
}

function RetryButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-[44px] self-start justify-center rounded-xl bg-blue-700 px-4 active:opacity-80"
    >
      <Text className="font-semibold text-white">Tentar novamente</Text>
    </Pressable>
  );
}
