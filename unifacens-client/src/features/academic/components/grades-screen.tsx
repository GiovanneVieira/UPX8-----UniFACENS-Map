import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOCK_ATTENDANCE, MOCK_GRADES } from '../mocks/data';

type Mode = 'grades' | 'attendance';

const PERIODS = ['2024/01', '2024/02', '2025/01', '2025/02', '2026/01', '2026/02'];
const GRADE_COLUMNS = ['AC1', 'AC2', 'AF', 'Sub', 'AG'] as const;

/** Bottom sheet de seleção de período letivo (espelho oficial do app
 *  UniFacens: título descritivo + grade de chips 3 colunas + Cancelar). */
function PeriodPickerSheet({
  visible,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: string;
  onSelect: (period: string) => void;
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <Pressable className="absolute inset-0" onPress={onClose} accessibilityLabel="Fechar seletor" />
        <View className="gap-5 rounded-t-3xl bg-neutral-900 px-6 pb-8 pt-6">
          <Text className="text-center text-lg font-bold text-white">
            Selecione o período letivo
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {PERIODS.map((period) => {
              const active = period === current;
              return (
                <Pressable
                  key={period}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    onSelect(period);
                    onClose();
                  }}
                  className={`min-h-[48px] w-[30%] items-center justify-center rounded-2xl ${
                    active ? 'bg-blue-600' : 'bg-neutral-800'
                  } active:opacity-80`}>
                  <Text className={`text-[15px] font-semibold ${active ? 'text-white' : 'text-neutral-300'}`}>
                    {period}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            className="self-center py-2">
            <Text className="text-sm text-neutral-400">Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

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
  const [pickerVisible, setPickerVisible] = useState(false);
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

      {/* Seletor de período em pílula (clique abre o sheet com todos os
          períodos letivos, espelho do app oficial) */}
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Selecionar período letivo"
          onPress={() => setPickerVisible(true)}
          className="flex-row items-center gap-2 rounded-full bg-neutral-900 px-6 py-2 active:opacity-80">
          <Text className="text-lg font-semibold text-white">{period}</Text>
          <Ionicons name="chevron-down" size={16} color="#8F8F8F" />
        </Pressable>
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
              <Pressable
                key={subject.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/aula-detalhe',
                    params: { discipline: subject.discipline },
                  })
                }
                className="gap-2 active:opacity-80">
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
              </Pressable>
            ))}
          </View>
        ) : (
          <View className="gap-3">
            {attendance.map((subject) => {
              const ratio = subject.total > 0 ? subject.absences / subject.total : 0;
              return (
                <Pressable
                  key={subject.id}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: '/aula-detalhe',
                      params: { discipline: subject.discipline },
                    })
                  }
                  className="gap-2 rounded-3xl bg-neutral-900 p-5 active:opacity-80">
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
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <PeriodPickerSheet
        visible={pickerVisible}
        current={period}
        onSelect={(p) => setPeriodIdx(PERIODS.indexOf(p))}
        onClose={() => setPickerVisible(false)}
      />
    </View>
  );
}
