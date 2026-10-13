import { Text, View } from "react-native";

export function MapUnavailable({
  message = "Consulte os locais e suas informações na lista abaixo.",
}: {
  message?: string;
}) {
  return (
    <View className="min-h-48 flex-1 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 p-6">
      <Text
        accessibilityLiveRegion="polite"
        className="text-lg font-semibold text-white"
      >
        Mapa indisponível no momento
      </Text>
      <Text className="mt-2 text-center text-base text-slate-300">
        {message}
      </Text>
    </View>
  );
}
