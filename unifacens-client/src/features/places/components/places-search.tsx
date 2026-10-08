import { Pressable, Text, View } from "react-native";
import { PLACE_CATEGORY_LABELS, placeCategorySchema } from "shared";
import { FormInputField } from "@/components/ui/form-field";
import type { usePlacesExplorer } from "../hooks/use-places-explorer";

type Explorer = ReturnType<typeof usePlacesExplorer>;
export function PlacesSearch({
  explorer,
}: {
  explorer: Pick<Explorer, "searchForm" | "filters" | "selectCategory">;
}) {
  const { searchForm, filters, selectCategory } = explorer;
  return (
    <View className="gap-3">
      <View className="flex-row items-start gap-3">
        <View className="flex-1">
          <searchForm.Field name="search">
            {(field) => (
              <FormInputField
                label="Buscar por nome ou bloco"
                placeholder="Sala, laboratório, entrada…"
                value={field.state.value}
                onChangeText={field.handleChange}
                onBlur={field.handleBlur}
                maxLength={100}
                returnKeyType="search"
                onSubmitEditing={() => void searchForm.handleSubmit()}
                errors={field.state.meta.errors.map((error) =>
                  typeof error === "string" ? error : (error?.message ?? ""),
                )}
              />
            )}
          </searchForm.Field>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => void searchForm.handleSubmit()}
          className="mt-6 min-h-[44px] justify-center rounded-xl bg-blue-700 px-4 active:opacity-80"
        >
          <Text className="font-semibold text-white">Buscar</Text>
        </Pressable>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: !filters.category }}
          onPress={() => selectCategory()}
          className={`min-h-[44px] justify-center rounded-xl border px-3 active:opacity-80 ${!filters.category ? "border-sky-400 bg-blue-700" : "border-slate-700 bg-slate-900"}`}
        >
          <Text className="text-sm text-white">Todas as categorias</Text>
        </Pressable>
        {placeCategorySchema.options.map((category) => (
          <Pressable
            key={category}
            accessibilityRole="button"
            accessibilityState={{ selected: filters.category === category }}
            onPress={() => selectCategory(category)}
            className={`min-h-[44px] justify-center rounded-xl border px-3 active:opacity-80 ${filters.category === category ? "border-sky-400 bg-blue-700" : "border-slate-700 bg-slate-900"}`}
          >
            <Text className="text-sm text-white">
              {PLACE_CATEGORY_LABELS[category]}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
