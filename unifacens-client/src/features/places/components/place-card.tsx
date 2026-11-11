import React from 'react';
import { Pressable, Text, View } from "react-native";
import { PLACE_SOURCE_LABELS, type Place } from "shared";

/** Card memoizado: a lista re-renderiza apenas quando place/selected mudam. */
export const PlaceCard = React.memo(function PlaceCard({
  place,
  selected,
  onSelect,
}: {
  place: Place;
  selected: boolean;
  onSelect: () => void;
}) {
  const location = [
    place.building,
    place.floor !== null ? `Andar ${place.floor}` : null,
  ]
    .filter(Boolean)
    .join(" • ");
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Ver detalhes de ${place.name}, ${place.category.label}`}
      className={`min-h-[44px] rounded-2xl border p-4 active:opacity-80 ${selected ? "border-sky-400 bg-slate-800" : "border-slate-700 bg-slate-900"}`}
    >
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="text-xs font-semibold text-sky-300">
          {place.category.label}
        </Text>
        <Text className="text-xs text-amber-200">
          {place.source === "demo"
            ? "Exemplo ilustrativo"
            : place.verificationStatus === "verified"
              ? "Informações verificadas"
              : "Ainda não verificado"}
        </Text>
      </View>
      <Text className="mt-2 text-lg font-bold text-white">{place.name}</Text>
      {location ? (
        <Text className="mt-1 text-sm text-slate-300">{location}</Text>
      ) : null}
      <Text className="mt-2 text-xs text-slate-400">
        {PLACE_SOURCE_LABELS[place.source]}
      </Text>
    </Pressable>
  );
});
