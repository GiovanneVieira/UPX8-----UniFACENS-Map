import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { nextClassOfToday } from '../mocks/data';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function formattedDate(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date());
}

/**
 * Tela inicial (espelho estrutural do app UniFacens): saudação com data,
 * card de próxima aula com sala, atalhos acadêmicos e entradas para as
 * funcionalidades próprias (Campus e Realidade Aumentada).
 */
export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, isAdmin, signOut } = useAuth();
  const nextClass = nextClassOfToday();
  const firstName = user?.name?.split(' ')[0] ?? 'estudante';

  const shortcuts = [
    { key: 'aulas', icon: '📅', label: 'Aulas', route: '/aulas' as const },
    { key: 'notas', icon: '📊', label: 'Notas', route: '/notas' as const },
    { key: 'faltas', icon: '🚫', label: 'Faltas', route: '/faltas' as const },
    { key: 'servicos', icon: '⋯', label: 'Ver mais', route: '/servicos' as const },
  ];

  return (
    <ScrollView
      className="flex-1 bg-slate-950"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}>
      <View className="w-full max-w-5xl self-center gap-6 px-4">
        {/* Header: saudação + perfil */}
        <View className="flex-row items-center justify-between">
          <View className="gap-0.5">
            <Text className="text-2xl font-bold text-white">
              {greeting()}, {firstName}
            </Text>
            <Text className="text-sm text-slate-400">{formattedDate()}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => void signOut()}
            className="min-h-[44px] items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 active:opacity-80">
            <Text className="text-sm font-semibold text-slate-200">Sair</Text>
          </Pressable>
        </View>

        {/* Badge de role */}
        <View className="flex-row items-center gap-2">
          <View
            className={`rounded-full px-3 py-1 ${isAdmin ? 'bg-emerald-900/60 border border-emerald-600' : 'bg-slate-900 border border-slate-700'}`}>
            <Text className={`text-xs font-semibold ${isAdmin ? 'text-emerald-300' : 'text-slate-300'}`}>
              {isAdmin ? '👑 Administrador' : '🎓 Conta de estudante'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/carteirinha')}
            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 active:opacity-80">
            <Text className="text-xs font-semibold text-slate-300">🪪 Carteirinha</Text>
          </Pressable>
        </View>

        {/* Próxima aula (espelho UniFacens) */}
        {nextClass ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/aulas')}
            className="gap-2 rounded-2xl border border-sky-800 bg-gradient-to-br from-sky-950 to-slate-900 p-5 active:opacity-90">
            <Text className="text-xs font-semibold uppercase tracking-wider text-sky-400">
              Próxima aula · {nextClass.day}
            </Text>
            <Text className="text-xl font-bold text-white">{nextClass.discipline}</Text>
            <Text className="text-sm text-slate-300">{nextClass.teacher}</Text>
            <View className="mt-1 flex-row items-center gap-3">
              <View className="rounded-lg bg-sky-900/70 px-3 py-1.5">
                <Text className="text-sm font-bold text-sky-200">📍 {nextClass.room}</Text>
              </View>
              <Text className="text-sm font-semibold text-slate-200">
                {nextClass.start} – {nextClass.end}
              </Text>
            </View>
            <Text className="mt-2 text-xs font-semibold text-sky-400">
              Ver grade completa →
            </Text>
          </Pressable>
        ) : null}

        {/* Atalhos acadêmicos (espelho UniFacens) */}
        <View className="flex-row justify-between gap-3">
          {shortcuts.map((s) => (
            <Pressable
              key={s.key}
              accessibilityRole="button"
              onPress={() => router.push(s.route)}
              className="flex-1 items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 px-2 py-4 active:opacity-80">
              <Text className="text-2xl">{s.icon}</Text>
              <Text className="text-xs font-semibold text-slate-200">{s.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Funcionalidades próprias: Campus + AR */}
        <View className="gap-3">
          <Text className="text-lg font-bold text-white">Explorar o campus</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate('/campus')}
            className="flex-row items-center justify-between rounded-2xl border border-blue-800 bg-blue-950/60 p-5 active:opacity-80">
            <View className="gap-1">
              <Text className="text-base font-bold text-white">🗺️ Mapa do Campus</Text>
              <Text className="text-sm text-slate-300">
                Busque salas, prédios e serviços da UniFACENS.
              </Text>
            </View>
            <Text className="text-2xl">›</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate('/ar')}
            className="flex-row items-center justify-between rounded-2xl border border-cyan-800 bg-cyan-950/50 p-5 active:opacity-80">
            <View className="gap-1">
              <Text className="text-base font-bold text-white">📱 Realidade Aumentada</Text>
              <Text className="text-sm text-slate-300">
                {isAdmin
                  ? 'Navegue pelos pontos AR e cadastre novos locais.'
                  : 'Veja os pontos do campus projetados no mundo real.'}
              </Text>
            </View>
            <Text className="text-2xl">›</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
