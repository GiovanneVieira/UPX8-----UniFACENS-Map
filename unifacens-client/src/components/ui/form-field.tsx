import React from 'react';
import { View, Text, TextInput, type TextInputProps } from 'react-native';

interface FormInputFieldProps extends TextInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  errors?: string[];
  helperText?: string;
  className?: string;
}

/**
 * Campo de texto reutilizável para TanStack Form estilizado com classes do NativeWind.
 */
export function FormInputField({
  label,
  value,
  onChangeText,
  onBlur,
  errors = [],
  helperText,
  className = '',
  ...textInputProps
}: FormInputFieldProps) {
  const hasError = errors.length > 0;

  return (
    <View className="mb-4">
      <Text className="text-sm font-semibold text-slate-200 mb-1.5">{label}</Text>
      <TextInput
        className={`w-full bg-slate-900 border rounded-xl px-3.5 py-2.5 text-sm text-slate-100 ${
          hasError ? 'border-rose-500' : 'border-slate-700'
        } ${className}`}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholderTextColor="#94A3B8"
        {...textInputProps}
      />
      {hasError ? (
        <Text className="text-xs text-rose-400 mt-1 font-medium">{errors.join(', ')}</Text>
      ) : helperText ? (
        <Text className="text-xs text-slate-400 mt-1">{helperText}</Text>
      ) : null}
    </View>
  );
}
