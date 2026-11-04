import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
 * Tela inicial — fidelidade visual ao app oficial UniFacens (dark neutro,
 * elevação por contraste tonal sem bordas, atalhos circulares, acento azul
 * + pill dourado nos CTAs). Mapeado por screenshot real do dispositivo.
 */
export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, isAdmin, signOut } = useAuth();
  const nextClass = nextClassOfToday();
  const firstName = user?.name?.split(' ')[0] ?? 'estudante';

  const shortcuts = [
    { key: 'aulas', icon: 'time-outline' as const, label: 'Aulas', route: '/aulas' as const },
    { key: 'notas', icon: 'document-text-outline' as const, label: 'Notas', route: '/notas' as const },
    { key: 'faltas', icon: 'person-outline' as const, label: 'Faltas', route: '/faltas' as const },
    { key: 'servicos', icon: 'add-outline' as const, label: 'Ver mais', route: '/servicos' as const },
  ];

  return (
    <ScrollView
      className="flex-1 bg-neutral-950"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}>
      <View className="w-full max-w-5xl self-center gap-7 px-5">
        {/* Header: saudação + data (espelho UniFacens) */}
        <View className="gap-1">
          <View className="flex-row items-end justify-between gap-3">
            <Text className="flex-1 text-3xl font-bold text-white">
              {greeting()}, {firstName}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void signOut()}
              className="min-h-[44px] items-center justify-center rounded-full bg-neutral-800 px-5 active:opacity-80">
              <Text className="text-sm font-medium text-neutral-300">Sair</Text>
            </Pressable>
          </View>
          <Text className="text-base text-neutral-400">{formattedDate()}</Text>
        </View>

        {/* Badge de role + carteirinha */}
        <View className="flex-row items-center gap-2">
          <View className="flex-row items-center gap-1.5 rounded-full bg-neutral-800 px-3 py-1.5">
            <Ionicons
              name={isAdmin ? 'shield-checkmark-outline' : 'school-outline'}
              size={13}
              color="#A3A3A3"
            />
            <Text className="text-xs font-semibold text-neutral-300">
              {isAdmin ? 'Administrador' : 'Conta de estudante'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/carteirinha')}
            className="flex-row items-center gap-1.5 rounded-full bg-neutral-800 px-3 py-1.5 active:opacity-80">
            <Ionicons name="card-outline" size={13} color="#A3A3A3" />
            <Text className="text-xs font-semibold text-neutral-300">Carteirinha</Text>
          </Pressable>
        </View>

        {/* Próxima aula — card destaque (carrossel no app oficial; v1 card único com peek visual) */}
        {nextClass ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/aulas')}
            className="rounded-3xl bg-neutral-900 p-6 active:opacity-90">
            <View className="flex-row items-center justify-between">
              <Text className="text-[13px] font-medium uppercase tracking-wider text-blue-400">
                Próxima aula · {nextClass.day}
              </Text>
              <Text className="text-xl text-neutral-500">›</Text>
            </View>
            <Text className="mt-2 text-[22px] font-semibold text-neutral-200">
              {nextClass.discipline}
            </Text>
            <View className="mt-2 gap-1">
              <Text className="text-base text-neutral-400">👤 {nextClass.teacher}</Text>
              <Text className="text-base text-neutral-400">📍 {nextClass.room}</Text>
              <Text className="text-base text-neutral-400">🕐 {nextClass.start} – {nextClass.end}</Text>
            </View>
            <View className="mt-4 flex-row justify-center gap-2">
              <View className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <View className="h-1.5 w-1.5 rounded-full bg-neutral-700" />
            </View>
          </Pressable>
        ) : null}

        {/* Atalhos circulares (espelho UniFacens) */}
        <View className="flex-row justify-between px-2">
          {shortcuts.map((s) => (
            <Pressable
              key={s.key}
              accessibilityRole="button"
              onPress={() => router.push(s.route)}
              className="items-center gap-2 active:opacity-80">
              <View className="h-[68px] w-[68px] items-center justify-center rounded-full bg-neutral-800">
                <Ionicons name={s.icon} size={28} color="#D4D4D4" />
              </View>
              <Text className="text-sm text-neutral-200">{s.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Funcionalidades próprias: Campus + AR (pill dourado como CTA do app oficial) */}
        <View className="gap-4">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate('/(tabs)/campus')}
            className="rounded-3xl bg-neutral-900 p-6 active:opacity-90">
            <View className="flex-row items-center gap-2">
              <Ionicons name="map-outline" size={20} color="#D8B97A" />
              <Text className="text-lg font-semibold text-white">Mapa do Campus</Text>
            </View>
            <Text className="mt-1 text-sm text-neutral-400">
              Busque salas, prédios e serviços da UniFACENS.
            </Text>
            <View className="mt-4 self-start rounded-full bg-[#D8B97A] px-4 py-2">
              <Text className="text-sm font-semibold text-neutral-950">Abrir mapa ↗</Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate('/(tabs)/ar')}
            className="rounded-3xl bg-neutral-900 p-6 active:opacity-90">
            <View className="flex-row items-center gap-2">
              <Ionicons name="cube-outline" size={20} color="#D8B97A" />
              <Text className="text-lg font-semibold text-white">Realidade Aumentada</Text>
            </View>
            <Text className="mt-1 text-sm text-neutral-400">
              {isAdmin
                ? 'Navegue pelos pontos AR e cadastre novos locais.'
                : 'Veja os pontos do campus projetados no mundo real.'}
            </Text>
            <View className="mt-4 self-start rounded-full bg-[#D8B97A] px-4 py-2">
              <Text className="text-sm font-semibold text-neutral-950">Abrir AR ↗</Text>
            </View>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
