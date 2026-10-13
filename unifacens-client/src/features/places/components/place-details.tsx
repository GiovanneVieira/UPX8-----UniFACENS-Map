import { Pressable, Text, View } from "react-native";
import { PLACE_CATEGORY_LABELS, PLACE_SOURCE_LABELS, type Place } from "shared";

export function PlaceDetails({
  place,
  onClose,
  onEdit,
}: {
  place: Place;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <View className="rounded-2xl border border-sky-500 bg-slate-900 p-5">
      <View className="flex-row flex-wrap items-start justify-between gap-3">
        <Text
          accessibilityRole="header"
          className="flex-1 text-xl font-bold text-white"
        >
          {place.name}
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fechar detalhes do local"
          className="min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-slate-800 px-3 active:opacity-80"
        >
          <Text className="text-sm text-white">Fechar</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Editar local ${place.name}`}
        onPress={onEdit}
        className="mt-3 min-h-[44px] self-start justify-center rounded-xl bg-blue-700 px-4 active:opacity-80"
      >
        <Text className="font-semibold text-white">Editar local</Text>
      </Pressable>
      <Text className="mt-2 text-sm text-sky-300">
        {PLACE_CATEGORY_LABELS[place.category]}
      </Text>
      {place.description ? (
        <Text className="mt-3 text-base text-slate-200">
          {place.description}
        </Text>
      ) : null}
      {place.building ? (
        <Text className="mt-2 text-sm text-slate-300">
          Prédio: {place.building}
        </Text>
      ) : null}
      {place.floor !== null ? (
        <Text className="mt-1 text-sm text-slate-300">
          Andar: {place.floor}
        </Text>
      ) : null}
      <Text className="mt-3 text-sm text-slate-300">
        Coordenadas: {place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}
      </Text>
      <Text className="mt-1 text-sm text-slate-400">
        Origem: {PLACE_SOURCE_LABELS[place.source]}
      </Text>
      <Text className="mt-1 text-sm text-amber-200">
        {place.verificationStatus === "verified"
          ? "Informações verificadas"
          : "Ainda não verificado"}
      </Text>
      <Text className="mt-3 text-sm text-amber-200">
        {place.source === "demo"
          ? "Dados e coordenadas ilustrativos. Não use este ponto para deslocamento."
          : "O cadastro deste recurso não comprova suas condições de acessibilidade nem uma rota acessível até ele."}
      </Text>
    </View>
  );
}
