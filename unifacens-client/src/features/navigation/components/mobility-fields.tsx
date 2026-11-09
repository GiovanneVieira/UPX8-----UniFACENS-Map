import { useId, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { NavigationPlan } from "../hooks/use-navigation-plan";
import { FieldErrors } from "./planning-ui";
import { SelectionControl } from "./selection-control";

const switches = [
  ["stepFree", "Evitar degraus e escadas"],
  ["avoidLifts", "Evitar elevadores e plataformas"],
  ["requireFirmSurface", "Exigir piso firme e regular"],
  ["requireHandrail", "Exigir corrimão em todos os trechos"],
  ["requireTactilePaving", "Exigir piso tátil em todos os trechos"],
] as const;
const measures = [
  ["minWidthMeters", "Largura mínima livre (m)"],
  ["maxUphillSlopePercent", "Inclinação máxima de subida (%)"],
  ["maxDownhillSlopePercent", "Inclinação máxima de descida (%)"],
  ["maxCrossSlopePercent", "Inclinação transversal máxima (%)"],
] as const;

export function MobilityFields({ plan }: { plan: NavigationPlan }) {
  const [expanded, setExpanded] = useState(false);
  const labelPrefix = useId();
  return (
    <View className="gap-3">
      <Text
        accessibilityRole="header"
        className="text-xl font-semibold text-white"
      >
        O que você precisa no caminho?
      </Text>
      <Text className="text-sm text-slate-300">
        Escolha suas necessidades de locomoção. Não é necessário informar uma
        deficiência.
      </Text>
      {switches.map(([name, label]) => (
        <plan.form.Field key={name} name={name}>
          {(field) => (
            <SelectionControl
              kind="checkbox"
              label={label}
              groupName={`${labelPrefix}-${name}`}
              checked={field.state.value}
              onSelect={() => field.handleChange(!field.state.value)}
              className={`min-h-[48px] flex-row items-center gap-3 rounded-xl border p-3 active:opacity-80 ${field.state.value ? "border-sky-300 bg-blue-950" : "border-slate-600 bg-slate-900"}`}
            >
              <Text className="flex-1 text-slate-100">{label}</Text>
            </SelectionControl>
          )}
        </plan.form.Field>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        onPress={() => setExpanded(!expanded)}
        className="min-h-[48px] justify-center rounded-xl border border-slate-500 px-4 py-3 active:opacity-80"
      >
        <Text className="font-semibold text-sky-200">
          {expanded ? "Ocultar" : "Ajustar"} largura e inclinações
        </Text>
      </Pressable>
      <View
        className={
          expanded
            ? "gap-4 rounded-xl border border-slate-600 bg-slate-900 p-4"
            : "hidden"
        }
      >
        <Text className="text-sm text-slate-300">
          Valores opcionais. Deixe vazio para não aplicar esse limite. Um trecho
          sem a medida exigida não será recomendado.
        </Text>
        {measures.map(([name, label]) => (
          <plan.form.Field key={name} name={name}>
            {(field) => (
              <View className="gap-2">
                <Text
                  nativeID={`${labelPrefix}-${name}`}
                  className="text-slate-200"
                >
                  {label}
                </Text>
                <TextInput
                  accessibilityLabel={label}
                  accessibilityLabelledBy={`${labelPrefix}-${name}`}
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={field.handleBlur}
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  maxLength={16}
                  placeholder="Sem limite definido"
                  placeholderTextColor="#94a3b8"
                  className="min-h-[48px] rounded-lg border border-slate-500 bg-slate-800 px-3 py-2 text-white"
                />
                <FieldErrors errors={field.state.meta.errors} />
              </View>
            )}
          </plan.form.Field>
        ))}
      </View>
      <Text className="text-sm text-slate-300">
        Sem opções marcadas, o percurso pode incluir degraus. Estes critérios
        não substituem a conferência das condições no local.
      </Text>
    </View>
  );
}
