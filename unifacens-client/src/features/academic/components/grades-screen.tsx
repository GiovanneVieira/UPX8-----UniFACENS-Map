import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOCK_ATTENDANCE, MOCK_GRADES } from '../mocks/data';

type Mode = 'grades' | 'attendance';

const PERIODS = ['2026/1', '2026/2'];
const GRADE_COLUMNS = ['AC1', 'AC2', 'AF', 'Sub', 'AG'] as const;

function formatGrade(value: number | null): string {
  if (value == null) return '–';
  return value.toFixed(2).replace('.', ',');
}

/**
 * Notas e Faltas — fidelidade ao app oficial: pílula de período com setas,
 * "última sincronização" e, por disciplina, linha de blocos segmentados
 * (AC1·AC2·AF·Sub·AG + Média em azul) ou barra de progresso azul de
 * faltas/total com chevron. Dados de demonstração.
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
      <View className="flex-row items-center justify-between px-5 pb-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={() => router.back()}
          className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-neutral-800 active:opacity-80">
          <Ionicons name="chevron-back" size={22} color="#D4D4D4" />
        </Pressable>
        <Text className="text-2xl font-bold text-white">{isGrades ? 'Notas' : 'Faltas'}</Text>
        <View className="h-11 w-11 items-center justify-center rounded-full bg-neutral-800">
          <Ionicons name="help-outline" size={20} color="#D4D4D4" />
        </View>
      </View>

      {/* Seletor de período em pílula (espelho oficial) */}
      <View className="flex-row items-center justify-center gap-3 pb-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Período anterior"
          disabled={periodIdx === 0}
          onPress={() => setPeriodIdx((i) => Math.max(0, i - 1))}
          className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full active:opacity-80">
          <Ionicons
            name="chevron-back"
            size={22}
            color={periodIdx === 0 ? '#404040' : '#D4D4D4'}
          />
        </Pressable>
        <View className="rounded-full bg-neutral-900 px-6 py-2">
          <Text className="text-lg font-semibold text-white">{period}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Próximo período"
          disabled={periodIdx === PERIODS.length - 1}
          onPress={() => setPeriodIdx((i) => Math.min(PERIODS.length - 1, i + 1))}
          className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full active:opacity-80">
          <Ionicons
            name="chevron-forward"
            size={22}
            color={periodIdx === PERIODS.length - 1 ? '#404040' : '#D4D4D4'}
          />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        <Text className="mb-4 text-xs text-neutral-500">
          Última sincronização às 12:21 · dados de demonstração
        </Text>

        {isGrades ? (
          <View className="gap-4">
            {grades.map((subject) => (
              <View key={subject.id} className="gap-2">
                <Text className="text-sm font-medium text-neutral-400">
                  {subject.discipline}
                </Text>
                <View className="flex-row gap-1.5">
                  {GRADE_COLUMNS.map((col) => {
                    const value =
                      col === 'AC1'
                        ? subject.ac1
                        : col === 'AC2'
                          ? subject.ac2
                          : col === 'AF'
                            ? subject.af
                            : col === 'Sub'
                              ? subject.sub
                              : subject.ag;
                    return (
                      <View
                        key={col}
                        className="flex-1 items-center gap-1 rounded-xl bg-neutral-800 py-2.5">
                        <Text className="text-[10px] text-neutral-500">{col}</Text>
                        <Text className="text-sm font-semibold text-white">
                          {formatGrade(value)}
                        </Text>
                      </View>
                    );
                  })}
                  <View className="flex-1 items-center gap-1 rounded-xl bg-blue-700 py-2.5">
                    <Text className="text-[10px] text-blue-200">Média</Text>
                    <Text className="text-sm font-bold text-white">
                      {formatGrade(subject.media)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View className="gap-3">
            {attendance.map((subject) => {
              const ratio = subject.total > 0 ? subject.absences / subject.total : 0;
              return (
                <View
                  key={subject.id}
                  className="gap-2 rounded-3xl bg-neutral-900 p-5">
                  <View className="flex-row items-center justify-between">
                    <Text className="flex-1 text-base font-semibold text-white">
                      {subject.discipline}
                    </Text>
                    <Text className="text-sm text-neutral-400">
                      {subject.absences}/{subject.total}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="#525252" />
                  </View>
                  <View className="h-2.5 overflow-hidden rounded-full bg-neutral-950">
                    <View
                      className="h-full rounded-full bg-blue-600"
                      style={{ width: `${Math.min(100, ratio * 100)}%` }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
