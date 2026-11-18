import React, { useId, useState } from "react";
import { View, Text, TextInput, Pressable, type TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface FormInputFieldProps extends TextInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  errors?: string[];
  helperText?: string;
  className?: string;
  /**
   * Acessório à direita do input (ex.: toggle de visibilidade da senha).
   * O input ocupa o espaço restante (flex-1) — sem o acessório, largura total.
   */
  rightElement?: React.ReactNode;
}

/**
 * Campo de texto reutilizável para TanStack Form estilizado com classes do NativeWind.
 * Forwarda ref (foco programático: Enter no campo anterior avança p/ o próximo).
 */
export const FormInputField = React.forwardRef<TextInput, FormInputFieldProps>(
  function FormInputField(
    {
      label,
      value,
      onChangeText,
      onBlur,
      errors = [],
      helperText,
      className = "",
      rightElement,
      ...textInputProps
    },
    ref,
  ) {
    const hasError = errors.length > 0;
    const labelId = useId();

    return (
      <View className="mb-4">
        <Text
          nativeID={labelId}
          className="text-sm font-semibold text-slate-200 mb-1.5"
        >
          {label}
        </Text>
        <View className="relative">
          <TextInput
            ref={ref}
            accessibilityLabel={label}
            accessibilityLabelledBy={labelId}
            className={`min-h-[44px] w-full bg-slate-900 border rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-sky-400 ${
              hasError ? "border-rose-500" : "border-slate-700"
            } ${rightElement ? "pr-12" : ""} ${className}`}
            value={value}
            onChangeText={onChangeText}
            onBlur={onBlur}
            placeholderTextColor="#94A3B8"
            {...textInputProps}
          />
          {rightElement ? (
            <View
              pointerEvents="box-none"
              className="absolute right-1 top-0 h-full justify-center">
              {rightElement}
            </View>
          ) : null}
        </View>
        {hasError ? (
          <Text
            accessibilityLiveRegion="polite"
            className="text-xs text-rose-300 mt-1 font-medium"
          >
            {errors.join(", ")}
          </Text>
        ) : helperText ? (
          <Text className="text-xs text-slate-400 mt-1">{helperText}</Text>
        ) : null}
      </View>
    );
  },
);

type PasswordFieldProps = Omit<
  FormInputFieldProps,
  "secureTextEntry" | "rightElement"
> & {
  /**
   * Visibilidade controlada — quando fornecida junto com `onToggleVisible`,
   * permite COMPARTILHAR o toggle entre campos (ex.: senha + confirmar
   * senha: abrir um abre o outro). Sem os props, estado interno do campo.
   */
  visible?: boolean;
  onToggleVisible?: () => void;
};

/**
 * Campo de senha com toggle de visibilidade (ícone de olho DENTRO do input,
 * sobreposto à direita — acessível: label dinâmico "Exibir/Ocultar senha",
 * tap target de 44×44 dp). Forwarda ref como FormInputField (Enter avança
 * p/ o próximo campo).
 */
export const PasswordField = React.forwardRef<TextInput, PasswordFieldProps>(
  function PasswordField({ visible, onToggleVisible, ...props }, ref) {
    const [internalVisible, setInternalVisible] = useState(false);
    const isShown = visible ?? internalVisible;
    const toggle = () =>
      onToggleVisible ? onToggleVisible() : setInternalVisible((current) => !current);
    return (
      <FormInputField
        ref={ref}
        {...props}
        secureTextEntry={!isShown}
        rightElement={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isShown ? "Ocultar senha" : "Exibir senha"}
            accessibilityState={{ expanded: isShown }}
            onPress={toggle}
            hitSlop={8}
            className="h-11 w-11 items-center justify-center">
            <Ionicons
              name={isShown ? "eye-off-outline" : "eye-outline"}
              size={22}
              color="#94A3B8"
            />
          </Pressable>
        }
      />
    );
  },
);
