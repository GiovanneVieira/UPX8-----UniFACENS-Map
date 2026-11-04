import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FAQ = [
  {
    q: 'Como navego até uma sala de aula?',
    a: 'Na aba Aulas, toque em "Ver no campus" para localizar a sala no mapa, ou "Navegar em AR" para vê-la em realidade aumentada.',
  },
  {
    q: 'Como cadastro um local no mapa?',
    a: 'O cadastro de locais é exclusivo da equipe (administradores). Entre com uma conta de administrador para liberar a opção.',
  },
  {
    q: 'O que é o modo de realidade aumentada?',
    a: 'Os pontos do campus são projetados no mundo real através da câmera, com distâncias reais em metros.',
  },
  {
    q: 'Meus dados acadêmicos são reais?',
    a: 'Não. Os dados de aulas, notas e faltas são demonstrações — a integração com o portal acadêmico está planejada.',
  },
];

/** Ajuda: FAQ em acordeões. */
export function HelpScreen() {
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
        <Text className="text-2xl font-bold text-white">Ajuda</Text>
        <View className="h-11 w-11" />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }}>
        {FAQ.map((item, i) => (
          <View key={i} className="rounded-3xl bg-neutral-900 p-5">
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 text-[15px] font-semibold text-white">{item.q}</Text>
            </View>
            <Text className="mt-2 text-sm text-neutral-400">{item.a}</Text>
          </View>
        ))}
        <Text className="mt-2 text-center text-xs text-neutral-600">
          Precisa de mais ajuda? Use "Reportar um problema" no menu.
        </Text>
      </ScrollView>
    </View>
  );
}
