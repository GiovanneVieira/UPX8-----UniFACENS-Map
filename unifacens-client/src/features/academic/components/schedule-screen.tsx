import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOCK_SCHEDULE, WEEK_DAYS, type WeekDay } from '../mocks/data';

/**
 * Grade de aulas (espelho UniFacens): seletor de dias Seg–Sáb + timeline
 * vertical com disciplina, professor e SALA — com ação para localizar a sala
 * no campus ou navegá-la em AR.
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
    <View className="flex-1 bg-slate-950" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 pb-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={() => router.back()}
          className="min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-slate-900 active:opacity-80">
          <Text className="text-xl text-white">‹</Text>
        </Pressable>
        <Text className="text-2xl font-bold text-white">Aulas</Text>
      </View>

      {/* Seletor de dias */}
      <View className="flex-row border-b border-slate-800 px-2">
        {WEEK_DAYS.map((d) => (
          <Pressable
            key={d}
            accessibilityRole="tab"
            accessibilityState={{ selected: d === day }}
            onPress={() => setDay(d)}
            className={`min-h-[44px] flex-1 items-center justify-center ${
              d === day ? 'border-b-2 border-sky-400' : ''
            }`}>
            <Text className={`text-sm font-semibold ${d === day ? 'text-sky-300' : 'text-slate-400'}`}>
              {d}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text className="mb-3 text-xs text-slate-500">
          Última sincronização às 14:14 · dados de demonstração
        </Text>
        <View className="gap-3">
          {slots.length === 0 ? (
            <Text className="py-10 text-center text-sm text-slate-400">
              Sem aulas neste dia 🎉
            </Text>
          ) : (
            slots.map((slot) => (
              <View
                key={slot.id}
                className="gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-bold text-sky-300">
                    {slot.start} – {slot.end}
                  </Text>
                  <View className="rounded-lg bg-slate-800 px-2.5 py-1">
                    <Text className="text-xs font-bold text-white">📍 {slot.room}</Text>
                  </View>
                </View>
                <Text className="text-base font-bold text-white">{slot.discipline}</Text>
                <Text className="text-sm text-slate-400">{slot.teacher}</Text>
                <View className="mt-1 flex-row gap-2">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.navigate('/campus')}
                    className="min-h-[40px] flex-1 items-center justify-center rounded-xl bg-blue-700 px-3 active:opacity-80">
                    <Text className="text-xs font-bold text-white">🗺️ Ver no campus</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.navigate('/ar')}
                    className="min-h-[40px] flex-1 items-center justify-center rounded-xl border border-cyan-700 bg-cyan-950/60 px-3 active:opacity-80">
                    <Text className="text-xs font-bold text-cyan-200">📱 Navegar em AR</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
