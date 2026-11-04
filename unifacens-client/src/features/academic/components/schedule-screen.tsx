import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOCK_SCHEDULE, WEEK_DAYS, type ClassSlot, type WeekDay } from '../mocks/data';

function TimelineCard({ slot }: { slot: ClassSlot }) {
  return (
    <View className="flex-1 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
      <View className="flex-row items-start justify-between">
        <Text className="flex-1 text-lg font-semibold text-neutral-200">
          {slot.discipline}
        </Text>
        <Ionicons name="chevron-forward" size={20} color="#404040" />
      </View>
      <View className="mt-2 gap-1.5">
        <View className="flex-row items-center gap-2">
          <Ionicons name="person-outline" size={14} color="#8F8F8F" />
          <Text className="text-sm text-neutral-400">{slot.teacher}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Ionicons name="location-outline" size={14} color="#8F8F8F" />
          <Text className="flex-1 text-sm text-neutral-400" numberOfLines={1}>
            {slot.room}
          </Text>
        </View>
      </View>
      <View className="mt-4 flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate('/(tabs)/campus')}
          className="min-h-[40px] flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-blue-600 px-3 active:opacity-80">
          <Ionicons name="map-outline" size={13} color="#FFFFFF" />
          <Text className="text-xs font-semibold text-white">Ver no campus</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate('/(tabs)/ar')}
          className="min-h-[40px] flex-1 flex-row items-center justify-center gap-1.5 rounded-full border border-blue-500/60 px-3 active:opacity-80">
          <Ionicons name="cube-outline" size={13} color="#60A5FA" />
          <Text className="text-xs font-semibold text-blue-400">Navegar em AR</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Grade de aulas — fidelidade visual ao app oficial UniFacens: abas de texto
 * com underline azul no dia selecionado e timeline vertical com gutter de
 * horários (badge circular + linha conectando) à esquerda dos cards.
 */
export function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const todayIdx = (() => {
    const map: Record<number, WeekDay> = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sab' };
    const today = map[new Date().getDay()];
    return today ? WEEK_DAYS.indexOf(today) : 0;
  })();
  const [day, setDay] = useState<WeekDay>(WEEK_DAYS[todayIdx]);
  const slots = MOCK_SCHEDULE.filter((c) => c.day === day);

  return (
    <View className="flex-1 bg-neutral-950" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pb-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={() => router.back()}
          className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-neutral-800 active:opacity-80">
          <Text className="text-xl text-neutral-200">‹</Text>
        </Pressable>
        <Text className="text-2xl font-bold text-white">Aulas</Text>
        <View className="h-11 w-11" />
      </View>

      {/* Abas de dias (texto + underline azul, espelho UniFacens) */}
      <View className="border-b border-neutral-800 px-3">
        <View className="flex-row">
          {WEEK_DAYS.map((d) => (
            <Pressable
              key={d}
              accessibilityRole="tab"
              accessibilityState={{ selected: d === day }}
              onPress={() => setDay(d)}
              className="min-h-[44px] flex-1 items-center justify-center">
              <Text
                className={`text-sm font-medium ${d === day ? 'text-blue-400' : 'text-neutral-500'}`}>
                {d}
              </Text>
              {d === day ? (
                <View className="mt-1 h-[3px] w-8 rounded-full bg-blue-500" />
              ) : (
                <View className="mt-1 h-[3px] w-8" />
              )}
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        <Text className="mb-4 text-xs text-neutral-500">
          Última sincronização às 14:14 · dados de demonstração
        </Text>
        {slots.length === 0 ? (
          <View className="items-center gap-2 py-12">
            <Ionicons name="happy-outline" size={32} color="#525252" />
            <Text className="text-sm text-neutral-500">Sem aulas neste dia</Text>
          </View>
        ) : (
          <View className="gap-6">
            {slots.map((slot, index) => (
              <View key={slot.id} className="flex-row gap-4">
                {/* Gutter da timeline: badge circular + horário + linha conectando */}
                <View className="items-center">
                  <View className="h-11 w-11 items-center justify-center rounded-full bg-neutral-800">
                    <Ionicons name="time-outline" size={18} color="#8F8F8F" />
                  </View>
                  <Text className="mt-1 text-xs text-neutral-500">{slot.start}</Text>
                  {index < slots.length - 1 ? (
                    <View className="mt-1 w-px flex-1 bg-neutral-800" />
                  ) : null}
                </View>
                {/* Card da aula */}
                <View className="flex-1">
                  <TimelineCard slot={slot} />
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
