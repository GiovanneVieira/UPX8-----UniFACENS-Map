import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOCK_ATTENDANCE, MOCK_GRADES } from '../mocks/data';

type Mode = 'grades' | 'attendance';

const PERIODS = ['2026/1', '2026/2'];

/**
 * Notas e Faltas (espelho UniFacens): seletor de período ‹ › + resumo por
 * disciplina — dados de demonstração (sem integração com a API acadêmica).
 */
export function GradesScreen({ mode }: { mode: Mode }) {
  const insets = useSafeAreaInsets();
  const [periodIdx, setPeriodIdx] = useState(PERIODS.length - 1);
  const period = PERIODS[periodIdx];
  const isGrades = mode === 'grades';
  const grades = MOCK_GRADES[period] ?? [];
  const attendance = MOCK_ATTENDANCE[period] ?? [];

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
        <Text className="text-2xl font-bold text-white">{isGrades ? 'Notas' : 'Faltas'}</Text>
      </View>

      {/* Seletor de período */}
      <View className="flex-row items-center justify-center gap-4 pb-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Período anterior"
          disabled={periodIdx === 0}
          onPress={() => setPeriodIdx((i) => Math.max(0, i - 1))}
          className="min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-neutral-900 active:opacity-80">
          <Text className={`text-xl ${periodIdx === 0 ? 'text-neutral-700' : 'text-white'}`}>‹</Text>
        </Pressable>
        <Text className="min-w-[90px] text-center text-lg font-bold text-white">{period}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Próximo período"
          disabled={periodIdx === PERIODS.length - 1}
          onPress={() => setPeriodIdx((i) => Math.min(PERIODS.length - 1, i + 1))}
          className="min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-neutral-900 active:opacity-80">
          <Text
            className={`text-xl ${periodIdx === PERIODS.length - 1 ? 'text-neutral-700' : 'text-white'}`}>
            ›
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {isGrades ? (
          <View className="gap-3">
            {grades.map((subject) => (
              <View
                key={subject.id}
                className="gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 text-base font-bold text-white">{subject.discipline}</Text>
                  <View
                    className={`rounded-lg px-2.5 py-1 ${subject.average == null ? 'bg-neutral-800' : subject.average >= 6 ? 'bg-emerald-900/70' : 'bg-rose-900/70'}`}>
                    <Text
                      className={`text-sm font-bold ${subject.average == null ? 'text-neutral-400' : 'text-white'}`}>
                      {subject.average == null ? '—' : subject.average.toFixed(1)}
                    </Text>
                  </View>
                </View>
                <View className="flex-row gap-2">
                  {subject.grades.map((g) => (
                    <View key={g.label} className="flex-1 items-center gap-1 rounded-xl bg-neutral-800/60 p-2">
                      <Text className="text-xs text-neutral-400">{g.label}</Text>
                      <Text className="text-sm font-bold text-white">
                        {g.value == null ? '—' : g.value.toFixed(1)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View className="gap-3">
            {attendance.map((subject) => {
              const ratio = subject.absences / subject.limit;
              return (
                <View
                  key={subject.id}
                  className="gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
                  <Text className="text-base font-bold text-white">{subject.discipline}</Text>
                  <View className="h-2 overflow-hidden rounded-full bg-neutral-800">
                    <View
                      className={`h-full rounded-full ${ratio > 0.7 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, ratio * 100)}%` }}
                    />
                  </View>
                  <Text className="text-xs text-neutral-400">
                    {subject.absences} falta(s) de {subject.limit} permitidas
                  </Text>
                </View>
              );
            })}
          </View>
        )}
        <Text className="mt-4 text-center text-xs text-neutral-500">
          Dados de demonstração — sem integração com o portal acadêmico.
        </Text>
      </ScrollView>
    </View>
  );
}
