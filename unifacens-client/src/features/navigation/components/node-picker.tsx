import { useId, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { filterNavigationPoints } from "shared";
import { SelectionControl } from "./selection-control";

export function NodePicker({
  label,
  nodes,
  value,
  onChange,
}: {
  label: string;
  nodes: readonly { id: string; name: string; description?: string | null }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [limit, setLimit] = useState(20);
  const id = useId();
  const trigger = useRef<View>(null);
  const selected = nodes.find((node) => node.id === value);
  const matches = filterNavigationPoints(nodes, search);
  return (
    <View className="gap-2">
      <Text className="font-semibold text-slate-200">{label}</Text>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.name ?? "Selecionar ponto"}`}
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        onPress={() => setExpanded(!expanded)}
        className="min-h-[48px] justify-center rounded-xl border border-slate-500 bg-slate-800 px-4 py-3 active:opacity-80"
      >
        <Text className="text-white">
          {selected?.name ?? "Selecionar ponto"} {expanded ? "▴" : "▾"}
        </Text>
      </Pressable>
      {expanded ? (
        <View className="gap-2 rounded-xl border border-slate-600 bg-slate-900 p-3">
          <Text nativeID={id} className="text-sm text-slate-300">
            Buscar em {label.toLocaleLowerCase("pt-BR")}
          </Text>
          <TextInput
            accessibilityLabel={`Buscar em ${label.toLocaleLowerCase("pt-BR")}`}
            accessibilityLabelledBy={id}
            value={search}
            onChangeText={(text) => {
              setSearch(text);
              setLimit(20);
            }}
            placeholder="Nome ou referência do ponto"
            placeholderTextColor="#94a3b8"
            className="min-h-[48px] rounded-lg border border-slate-500 bg-slate-800 px-3 text-white"
          />
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={label}
            className="gap-2"
          >
            {matches.slice(0, limit).map((node) => (
              <SelectionControl
                key={node.id}
                kind="radio"
                label={node.name}
                groupName={id}
                checked={value === node.id}
                onSelect={() => {
                  onChange(node.id);
                  setExpanded(false);
                  setSearch("");
                  trigger.current?.focus();
                }}
                className={`min-h-[48px] justify-center rounded-lg border px-3 py-3 active:opacity-80 ${value === node.id ? "border-sky-300 bg-blue-800" : "border-slate-600 bg-slate-800"}`}
              >
                <View className="gap-1">
                  <Text className="text-white">{node.name}</Text>
                  {node.description ? (
                    <Text className="text-sm text-slate-300">
                      {node.description}
                    </Text>
                  ) : null}
                </View>
              </SelectionControl>
            ))}
          </View>
          {!matches.length ? (
            <Text className="text-slate-300">
              Nenhum ponto encontrado nesta área.
            </Text>
          ) : null}
          {matches.length > limit ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setLimit(limit + 20)}
              className="min-h-[48px] justify-center px-3"
            >
              <Text className="text-sky-200">Mostrar mais pontos</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
