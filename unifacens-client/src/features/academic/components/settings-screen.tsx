import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Configurações (espelho oficial: Aparência/Atualizações/Segurança/Idioma). */
export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);

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
        <Text className="text-2xl font-bold text-white">Configurações</Text>
        <View className="h-11 w-11" />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 3 }}>
        {/* Aparência */}
        <Text className="mb-1 text-xs uppercase tracking-wider text-neutral-500">
          Aparência
        </Text>
        <View className="flex-row items-center justify-between rounded-2xl bg-neutral-900 px-5 py-4">
          <View className="flex-row items-center gap-3">
            <Ionicons name="moon-outline" size={20} color="#A3A3A3" />
            <Text className="text-[15px] text-neutral-200">Tema escuro</Text>
          </View>
          <Switch value={darkMode} onValueChange={setDarkMode} />
        </View>
        <View className="flex-row items-center justify-between rounded-2xl bg-neutral-900 px-5 py-4">
          <View className="flex-row items-center gap-3">
            <Ionicons name="notifications-outline" size={20} color="#A3A3A3" />
            <Text className="text-[15px] text-neutral-200">Notificações push</Text>
          </View>
          <Switch value={notifications} onValueChange={setNotifications} />
        </View>

        {/* Atualizações */}
        <Text className="mb-1 mt-4 text-xs uppercase tracking-wider text-neutral-500">
          Atualizações do aplicativo
        </Text>
        <View className="flex-row items-center justify-between rounded-2xl bg-neutral-900 px-5 py-4">
          <View className="flex-row items-center gap-3">
            <Ionicons name="download-outline" size={20} color="#A3A3A3" />
            <Text className="text-[15px] text-neutral-200">Versão</Text>
          </View>
          <Text className="text-sm text-neutral-400">1.0.0-dev (atualizada)</Text>
        </View>

        {/* Segurança */}
        <Text className="mb-1 mt-4 text-xs uppercase tracking-wider text-neutral-500">
          Segurança
        </Text>
        <View className="flex-row items-center justify-between rounded-2xl bg-neutral-900 px-5 py-4">
          <View className="flex-row items-center gap-3">
            <Ionicons name="lock-closed-outline" size={20} color="#A3A3A3" />
            <Text className="text-[15px] text-neutral-200">Sessão ativa</Text>
          </View>
          <Text className="text-sm text-emerald-400">Protegida</Text>
        </View>

        {/* Idioma */}
        <Text className="mb-1 mt-4 text-xs uppercase tracking-wider text-neutral-500">
          Idioma do Aplicativo
        </Text>
        <View className="flex-row items-center justify-between rounded-2xl bg-neutral-900 px-5 py-4">
          <View className="flex-row items-center gap-3">
            <Ionicons name="language-outline" size={20} color="#A3A3A3" />
            <Text className="text-[15px] text-neutral-200">Idioma</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Text className="text-sm text-neutral-400">Português (BR)</Text>
            <Ionicons name="chevron-forward" size={16} color="#404040" />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
