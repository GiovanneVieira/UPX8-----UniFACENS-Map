import type { PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';

export function AdminButton({
  children,
  onPress,
  disabled = false,
  danger = false,
  primary = false,
  label,
}: PropsWithChildren<{
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  primary?: boolean;
  label?: string;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-[44px] items-center justify-center rounded-xl border px-4 py-3 ${disabled ? 'opacity-50' : 'active:opacity-80'} ${danger ? 'border-red-200 bg-red-50' : primary ? 'border-blue-700 bg-blue-700' : 'border-slate-300 bg-white'}`}
    >
      <Text
        className={`text-sm font-semibold ${danger ? 'text-red-800' : primary ? 'text-white' : 'text-slate-800'}`}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function AdminError({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <View className="gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
      <Text accessibilityRole="alert" className="text-red-800">
        {message}
      </Text>
      {retry && <AdminButton onPress={retry}>Tentar novamente</AdminButton>}
    </View>
  );
}
export function Pagination({
  offset,
  total,
  busy,
  onChange,
}: {
  offset: number;
  total: number;
  busy: boolean;
  onChange: (offset: number) => void;
}) {
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
      <Text className="text-sm text-slate-600">
        {total
          ? `${offset + 1}–${Math.min(offset + 20, total)} de ${total}`
          : 'Nenhum resultado'}
      </Text>
      <View className="flex-row gap-2">
        <AdminButton
          disabled={offset === 0 || busy}
          onPress={() => onChange(Math.max(0, offset - 20))}
        >
          Anterior
        </AdminButton>
        <AdminButton
          disabled={offset + 20 >= total || busy}
          onPress={() => onChange(offset + 20)}
        >
          Próxima
        </AdminButton>
      </View>
    </View>
  );
}
