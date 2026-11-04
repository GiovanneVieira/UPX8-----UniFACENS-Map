import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/hooks/use-auth';

/**
 * Carteirinha estudantil (espelho UniFacens): card fullscreen com a
 * identidade do usuário logado (RA e validade são placeholders).
 */
export function IdCardScreen() {
  const insets = useSafeAreaInsets();
  const { user, isAdmin } = useAuth();

  const rows = [
    { label: 'Curso', value: isAdmin ? 'Equipe UniFACENS Map' : 'Engenharia de Computação' },
    { label: 'RA', value: isAdmin ? '—' : '000000' },
    { label: 'Validade', value: '12/2027' },
  ];

  return (
    <View className="flex-1 bg-slate-950" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-3 px-4 pb-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={() => router.back()}
          className="min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-slate-900 active:opacity-80">
          <Text className="text-xl text-white">‹</Text>
        </Pressable>
        <Text className="text-2xl font-bold text-white">Carteirinha</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <View className="gap-4 rounded-3xl border border-sky-800 bg-gradient-to-br from-sky-950 via-slate-900 to-slate-950 p-6">
          <View className="flex-row items-center justify-between">
            <Text className="text-2xl font-black tracking-wide text-white">UniFACENS</Text>
            <View className="rounded-full bg-sky-900/80 px-3 py-1">
              <Text className="text-xs font-bold text-sky-200">ESTUDANTE</Text>
            </View>
          </View>

          <View className="mt-4 gap-3">
            <Text className="text-xl font-bold text-white">{user?.name ?? '—'}</Text>
            {rows.map((row) => (
              <View key={row.label} className="gap-0.5">
                <Text className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {row.label}
                </Text>
                <Text className="text-base font-semibold text-slate-100">{row.value}</Text>
              </View>
            ))}
            <View className="gap-0.5">
              <Text className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                E-mail
              </Text>
              <Text className="text-sm font-semibold text-slate-100">{user?.email ?? '—'}</Text>
            </View>
          </View>
        </View>
        <Text className="mt-4 text-center text-xs text-slate-500">
          Dados de demonstração — carteirinha oficial disponível no app UniFacens.
        </Text>
      </ScrollView>
    </View>
  );
}
