import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOCK_ACCESS_SERVICES, MOCK_QUICK_SERVICES } from '../mocks/data';

const QUICK_ICONS: Record<string, string> = {
  carteirinha: '🪪',
  horas: '⏱️',
  eventos: '📣',
  noticias: '📰',
};

/**
 * Serviços ("Ver mais" — espelho UniFacens): grade de atalhos rápidos +
 * lista de acessos institucionais (itens informativos, dados de demonstração).
 */
export function ServicesScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-neutral-950" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-3 px-4 pb-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={() => router.back()}
          className="min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-neutral-900 active:opacity-80">
          <Text className="text-xl text-white">‹</Text>
        </Pressable>
        <Text className="text-2xl font-bold text-white">Serviços</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <View className="mb-6 flex-row justify-between gap-3">
          {MOCK_QUICK_SERVICES.map((service) => (
            <Pressable
              key={service.id}
              accessibilityRole="button"
              onPress={() => {
                if (service.id === 'carteirinha') router.push('/carteirinha');
              }}
              className="flex-1 items-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/60 px-2 py-4 active:opacity-80">
              <Text className="text-2xl">{QUICK_ICONS[service.id] ?? '🔗'}</Text>
              <Text className="text-center text-xs font-semibold text-neutral-200">
                {service.title}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="mb-3 text-lg font-bold text-white">Acesso</Text>
        <View className="gap-3">
          {MOCK_ACCESS_SERVICES.map((service) => (
            <View
              key={service.id}
              className="flex-row items-center justify-between rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
              <View className="flex-1 gap-0.5">
                <Text className="text-base font-bold text-white">{service.title}</Text>
                <Text className="text-sm text-neutral-400">{service.subtitle}</Text>
              </View>
              <Text className="text-2xl text-neutral-600">›</Text>
            </View>
          ))}
        </View>
        <Text className="mt-4 text-center text-xs text-neutral-500">
          Serviços institucionais disponíveis no app oficial UniFacens.
        </Text>
      </ScrollView>
    </View>
  );
}
