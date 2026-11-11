import { Pressable, Text, View } from "react-native";
import { useCategoriesQuery } from "@/features/categories/queries/use-categories-query";
import { FormInputField } from "@/components/ui/form-field";
import type { usePlacesExplorer } from "../hooks/use-places-explorer";

type Explorer = ReturnType<typeof usePlacesExplorer>;
export function PlacesSearch({
  explorer,
}: {
  explorer: Pick<Explorer, "searchForm" | "filters" | "selectCategory">;
}) {
  const { searchForm, filters, selectCategory } = explorer;
  // Categorias dinâmicas: criar/editar no admin muda os filtros sem deploy.
  const categories = useCategoriesQuery();
  const options = categories.data ?? [];
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
        {options.map((category) => (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityState={{ selected: filters.category === category.slug }}
            onPress={() => selectCategory(category.slug)}
            className={`min-h-[44px] justify-center rounded-xl border px-3 active:opacity-80 ${filters.category === category.slug ? "border-sky-400 bg-blue-700" : "border-slate-700 bg-slate-900"}`}
          >
            <Text className="text-sm text-white">{category.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
