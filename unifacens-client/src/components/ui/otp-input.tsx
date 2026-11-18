import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

interface OtpInputProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Quantidade de casas (default 6). */
  length?: number;
  label: string;
  error?: boolean;
  autoFocus?: boolean;
}

/**
 * Input de código OTP no estilo clássico [][][][][][]
 *
 * Um único TextInput INVISÍVEL (sem caret, teclado numérico) por trás das
 * caixas — o valor continua sendo UMA string (mesma API do formulário),
 * sem gestão de foco entre N inputs. Tocar em qualquer caixa foca o input;
 * a caixa "ativa" (próximo dígito) destaca quando o teclado está aberto.
 */
export function OtpInput({
  value,
  onChangeText,
  length = 6,
  label,
  error = false,
  autoFocus = false,
}: OtpInputProps) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const chars = Array.from({ length }, (_, i) => value[i] ?? '');
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <View className="mb-4">
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="keyboardkey"
        onPress={() => inputRef.current?.focus()}
        className="flex-row justify-center gap-2">
        {chars.map((char, index) => {
          const isActive = focused && index === activeIndex;
          const filled = char !== '';
          return (
            <View
              key={index}
              importantForAccessibility="no"
              className={`h-14 w-11 items-center justify-center rounded-xl border bg-slate-900 ${
                error
                  ? 'border-rose-500'
                  : isActive || filled
                    ? 'border-sky-400'
                    : 'border-slate-700'
              } ${isActive ? 'bg-slate-800' : ''}`}>
              <Text className="text-2xl font-bold text-slate-100">{char}</Text>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus={autoFocus}
        caretHidden
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
        accessibilityHint={`Digite os ${length} dígitos recebidos`}
        style={{ position: 'absolute', opacity: 0, height: 1, width: 1, top: 0, left: 0 }}
      />
    </View>
  );
}
