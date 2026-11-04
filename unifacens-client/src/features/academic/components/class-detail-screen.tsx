import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MOCK_ATTENDANCE,
  MOCK_CLASS_GROUP,
  MOCK_GRADES,
  MOCK_SCHEDULE,
  MOCK_TASKS,
} from '../mocks/data';

function formatGrade(value: number | null): string {
  if (value == null) return '–';
  return value.toFixed(2).replace('.', ',');
}

function formatTaskDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${iso}T12:00:00`));
}

/**
 * Detalhes da Aula — hub por disciplina (drill-down do carrossel da Home,
 * dos cards de Aulas e das disciplinas de Notas/Faltas). Fidelidade ao app
 * oficial: card com salas expandíveis, Turma, Faltas, Notas (AC1..Média) e
 * timeline de Tarefas agrupadas por data.
 */
export function ClassDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ discipline?: string }>();
  const discipline = params.discipline ?? 'Eletrônica Analógica';
  const [roomsExpanded, setRoomsExpanded] = useState(false);

  const slots = MOCK_SCHEDULE.filter((c) => c.discipline === discipline);
  const rooms = [...new Set(slots.map((s) => s.room))];
  const firstSlot = slots[0];
  const group = MOCK_CLASS_GROUP[discipline] ?? '—';
  const attendance = (MOCK_ATTENDANCE['2026/2'] ?? []).find(
    (a) => a.discipline === discipline,
  );
  const grade = (MOCK_GRADES['2026/2'] ?? []).find((g) => g.discipline === discipline);
  const tasks = MOCK_TASKS.filter((t) => t.discipline === discipline);

  const gradeCells = grade
    ? [
        { label: 'AC1', value: grade.ac1 },
        { label: 'AC2', value: grade.ac2 },
        { label: 'AF', value: grade.af },
        { label: 'Sub', value: grade.sub },
        { label: 'AG', value: grade.ag },
      ]
    : [];

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
        <Text className="text-2xl font-bold text-white">Detalhes da Aula</Text>
        <View className="h-11 w-11" />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 20 }}>
        {/* Card principal: disciplina, professor, horário, salas expandíveis */}
        <View className="gap-3 rounded-3xl bg-neutral-900 p-6">
          <Text className="text-[22px] font-semibold text-neutral-200">{discipline}</Text>
          {firstSlot ? (
            <>
              <View className="flex-row items-center gap-2">
                <Ionicons name="person-outline" size={15} color="#8F8F8F" />
                <Text className="text-[15px] text-neutral-400">
                  {firstSlot.teacher}
                </Text>
              </View>
              <Text className="text-[15px] text-neutral-400">
                {firstSlot.day} {firstSlot.start}
              </Text>
            </>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => setRoomsExpanded((v) => !v)}
            className="flex-row items-center justify-between rounded-2xl bg-neutral-800 px-4 py-3">
            <Text className="flex-1 text-sm text-neutral-300" numberOfLines={roomsExpanded ? undefined : 1}>
              {rooms.join(', ')}
            </Text>
            <Ionicons
              name={roomsExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="#8F8F8F"
            />
          </Pressable>
        </View>

        {/* Turma */}
        <View className="gap-1">
          <Text className="text-xs uppercase tracking-wider text-neutral-500">Turma</Text>
          <Text className="text-base font-semibold text-white">{group}</Text>
        </View>

        {/* Faltas (navegável) */}
        {attendance ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/faltas')}
            className="flex-row items-center justify-between rounded-3xl bg-neutral-900 px-5 py-4 active:opacity-90">
            <Text className="text-base font-semibold text-white">Faltas</Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-sm text-neutral-400">
                {attendance.absences}/{attendance.total}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#525252" />
            </View>
          </Pressable>
        ) : null}

        {/* Notas (linha segmentada) */}
        {grade ? (
          <View className="gap-2">
            <Text className="text-base font-semibold text-white">Notas</Text>
            <View className="flex-row gap-1.5">
              {gradeCells.map((cell) => (
                <View
                  key={cell.label}
                  className="flex-1 items-center gap-1 rounded-xl bg-neutral-800 py-2.5">
                  <Text className="text-[10px] text-neutral-500">{cell.label}</Text>
                  <Text className="text-sm font-semibold text-white">
                    {formatGrade(cell.value)}
                  </Text>
                </View>
              ))}
              <View className="flex-1 items-center gap-1 rounded-xl bg-blue-700 py-2.5">
                <Text className="text-[10px] text-blue-200">Média</Text>
                <Text className="text-sm font-bold text-white">
                  {formatGrade(grade.media)}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Tarefas: timeline agrupada por data (espelho oficial) */}
        {tasks.length > 0 ? (
          <View className="gap-3">
            <Text className="text-base font-semibold text-white">Tarefas</Text>
            <View className="gap-4">
              {tasks.map((task) => (
                <View key={task.id} className="flex-row gap-3">
                  <View className="items-center">
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-neutral-800">
                      <Ionicons name="calendar-outline" size={16} color="#60A5FA" />
                    </View>
                    {tasks.indexOf(task) < tasks.length - 1 ? (
                      <View className="mt-1 w-px flex-1 bg-neutral-800" />
                    ) : null}
                  </View>
                  <View className="flex-1 rounded-2xl border-l-[3px] border-blue-500 bg-neutral-900 px-4 py-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold text-blue-400">Tarefa</Text>
                      <Text className="text-xs text-neutral-500">
                        {formatTaskDate(task.date)}
                      </Text>
                    </View>
                    <View className="mt-1 flex-row items-center justify-between">
                      <Text className="text-sm font-semibold text-white">
                        {task.title}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color="#525252" />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
