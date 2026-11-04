import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/hooks/use-auth';

/**
 * Carteirinha estudantil — fidelidade ao app oficial: card em formato de
 * cartão (paisagem ~1.6:1) com divisão 2/3 neutro + 1/3 azul com marca
 * d'água do monograma, foto circular com anel sobre a divisória e campos
 * CPF/Curso/RA/Validade. Dados do usuário logado (RA de demonstração).
 */
export function IdCardScreen() {
  const insets = useSafeAreaInsets();
  const { user, isAdmin } = useAuth();

  return (
    <View className="flex-1 bg-neutral-950" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-5 pb-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={() => router.back()}
          className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-neutral-800 active:opacity-80">
          <Ionicons name="chevron-back" size={22} color="#D4D4D4" />
        </Pressable>
        <Text className="text-2xl font-bold text-white">Carteirinha</Text>
        <View className="h-11 w-11" />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        {/* Card formato carteira (paisagem) — split neutro/azul */}
        <View className="aspect-[1.586] w-full flex-row overflow-hidden rounded-3xl bg-[#272727]">
          {/* Corpo neutro (2/3): dados */}
          <View className="flex-[2] justify-between p-5">
            <View className="gap-3">
              <View className="gap-0.5">
                <Text className="text-[10px] uppercase tracking-wider text-neutral-500">
                  CPF
                </Text>
                <Text className="text-sm font-semibold text-white">000.000.000-00</Text>
              </View>
              <View className="gap-0.5">
                <Text className="text-[10px] uppercase tracking-wider text-neutral-500">
                  Curso
                </Text>
                <Text className="text-sm font-semibold text-white">
                  {isAdmin ? 'Equipe UniFACENS Map' : 'Engenharia de Computação'}
                </Text>
              </View>
            </View>
            <View className="flex-row justify-between">
              <View className="gap-0.5">
                <Text className="text-[10px] uppercase tracking-wider text-neutral-500">
                  RA
                </Text>
                <Text className="text-sm font-semibold text-white">
                  {isAdmin ? '—' : '000000'}
                </Text>
              </View>
              <View className="gap-0.5">
                <Text className="text-[10px] uppercase tracking-wider text-neutral-500">
                  Validade
                </Text>
                <Text className="text-sm font-semibold text-white">03/2027</Text>
              </View>
            </View>
          </View>

          {/* Painel azul (1/3): nome + avatar + watermark */}
          <View className="relative flex-1 items-center justify-end overflow-hidden bg-[#2E7CD6] pb-5">
            {/* Marca d'água com monogramas repetidos */}
            {[...Array(6)].map((_, i) => (
              <View
                key={i}
                className="absolute items-center justify-center rounded-full border-[5px] border-white/10"
                style={{
                  width: 56,
                  height: 56,
                  right: (i % 3) * 34 - 10,
                  top: Math.floor(i / 3) * 60 - 10,
                }}
              />
            ))}
            {/* Avatar circular sobre a divisória */}
            <View className="absolute -left-8 top-5 h-16 w-16 items-center justify-center rounded-full bg-neutral-800 ring-4 ring-[#1C1C1C]">
              <Ionicons name="person" size={30} color="#D4D4D4" />
            </View>
            <View className="w-full px-3">
              <Text className="text-[13px] font-bold leading-tight text-white">
                {user?.name ?? '—'}
              </Text>
              <Text className="mt-0.5 text-[10px] text-blue-100">
                {user?.email ?? '—'}
              </Text>
            </View>
            <View className="absolute bottom-3 right-3 h-8 w-8 items-center justify-center rounded-full bg-white/90">
              <Text className="text-sm font-black text-[#2E7CD6]">F</Text>
            </View>
          </View>
        </View>

        <Text className="mt-4 text-center text-xs text-neutral-500">
          Dados de demonstração — carteirinha oficial disponível no app UniFacens.
        </Text>
      </ScrollView>
    </View>
  );
}
