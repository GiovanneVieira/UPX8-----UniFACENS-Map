import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MOCK_NOTIFICATIONS = [
  { id: 'n1', icon: 'calendar-outline', title: 'Lembrete de aula', body: 'Eletrônica Analógica hoje às 19:00 — C36', time: 'há 2 h' },
  { id: 'n2', icon: 'document-text-outline', title: 'Nota lançada', body: 'UPX – Realidade Aumentada: AC1 = 8,06', time: 'ontem' },
  { id: 'n3', icon: 'megaphone-outline', title: 'Semana da Psicologia', body: 'Inscrições abertas para a jornada no campus', time: 'há 3 d' },
];

/** Notificações do app (lista mockada de demonstração). */
export function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-neutral-950" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-5 pb-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={() => router.back()}
          className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-neutral-800 active:opacity-80">
          <Ionicons name="chevron-back" size={22} color="#D4D4D4" />
        </Pressable>
        <Text className="text-2xl font-bold text-white">Notificações</Text>
        <View className="h-11 w-11" />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        {MOCK_NOTIFICATIONS.map((n) => (
          <View key={n.id} className="flex-row gap-3 rounded-3xl bg-neutral-900 p-4">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-neutral-800">
              <Ionicons name={n.icon as keyof typeof Ionicons.glyphMap} size={18} color="#60A5FA" />
            </View>
            <View className="flex-1 gap-0.5">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-white">{n.title}</Text>
                <Text className="text-xs text-neutral-500">{n.time}</Text>
              </View>
              <Text className="text-sm text-neutral-400">{n.body}</Text>
            </View>
          </View>
        ))}
        <Text className="mt-2 text-center text-xs text-neutral-600">
          Notificações de demonstração.
        </Text>
      </ScrollView>
    </View>
  );
}
