import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  PLACE_CATEGORY_LABELS,
  PLACE_SOURCE_LABELS,
  placeCategorySchema,
  placeSourceSchema,
  type Place,
} from "shared";
import { FormInputField } from "@/components/ui/form-field";
import { useCreatePlaceForm } from "../hooks/use-create-place-form";

const textFields = [
  {
    name: "name",
    label: "Nome do local (obrigatório)",
    placeholder: "Nome encontrado na placa do local",
  },
  {
    name: "latitude",
    label: "Latitude (obrigatória)",
    placeholder: "Ex.: -23,4699",
    helperText: "Coordenada em graus decimais, entre -90 e 90.",
  },
  {
    name: "longitude",
    label: "Longitude (obrigatória)",
    placeholder: "Ex.: -47,4297",
    helperText: "Coordenada em graus decimais, entre -180 e 180.",
  },
  { name: "building", label: "Bloco ou prédio", placeholder: "Opcional" },
  {
    name: "floor",
    label: "Andar",
    placeholder: "Opcional. Ex.: 0 para térreo",
  },
  {
    name: "description",
    label: "Descrição",
    placeholder: "Referências para identificar o local",
  },
] as const;

export function CreatePlaceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (place: Place) => void;
}) {
  const { form, mutation } = useCreatePlaceForm(onCreated);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-center bg-black/70 p-4"
      >
        <View
          accessibilityViewIsModal
          className="max-h-[90%] w-full max-w-2xl self-center rounded-3xl border border-slate-700 bg-slate-950"
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <View className="p-5">
              <Text
                accessibilityRole="header"
                className="text-2xl font-bold text-white"
              >
                Cadastrar local
              </Text>
              <Text className="mb-5 mt-2 text-sm text-slate-300">
                O cadastro ficará como ainda não verificado. Uma rampa ou um
                elevador cadastrado não comprova acessibilidade.
              </Text>
              {textFields.map((input) => (
                <form.Field key={input.name} name={input.name}>
                  {(field) => (
                    <FormInputField
                      label={input.label}
                      placeholder={input.placeholder}
                      helperText={
                        "helperText" in input ? input.helperText : undefined
                      }
                      autoFocus={input.name === "name"}
                      multiline={input.name === "description"}
                      maxLength={
                        input.name === "description"
                          ? 1000
                          : input.name === "name"
                            ? 255
                            : input.name === "building"
                              ? 80
                              : 30
                      }
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={field.handleBlur}
                      errors={field.state.meta.errors.map((error) =>
                        typeof error === "string"
                          ? error
                          : (error?.message ?? ""),
                      )}
                    />
                  )}
                </form.Field>
              ))}
              <Text className="mb-2 text-sm font-semibold text-slate-200">
                Categoria
              </Text>
              <form.Field name="category">
                {(field) => (
                  <View className="mb-4 flex-row flex-wrap gap-2">
                    {placeCategorySchema.options.map((category) => (
                      <Pressable
                        key={category}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: field.state.value === category,
                        }}
                        onPress={() => field.handleChange(category)}
                        className={`min-h-[44px] justify-center rounded-xl border px-3 active:opacity-80 ${field.state.value === category ? "border-sky-400 bg-blue-700" : "border-slate-700 bg-slate-900"}`}
                      >
                        <Text className="text-sm text-white">
                          {PLACE_CATEGORY_LABELS[category]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </form.Field>
              <Text className="mb-2 text-sm font-semibold text-slate-200">
                Origem das informações
              </Text>
              <form.Field name="source">
                {(field) => (
                  <View className="mb-4 flex-row flex-wrap gap-2">
                    {placeSourceSchema.options.map((source) => (
                      <Pressable
                        key={source}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: field.state.value === source,
                        }}
                        onPress={() => field.handleChange(source)}
                        className={`min-h-[44px] justify-center rounded-xl border px-3 active:opacity-80 ${field.state.value === source ? "border-sky-400 bg-blue-700" : "border-slate-700 bg-slate-900"}`}
                      >
                        <Text className="text-sm text-white">
                          {PLACE_SOURCE_LABELS[source]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </form.Field>
              {mutation.isError ? (
                <Text
                  accessibilityLiveRegion="polite"
                  className="mb-4 text-sm text-rose-300"
                >
                  Não foi possível salvar. Confira a conexão e tente novamente.
                </Text>
              ) : null}
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <View className="flex-row flex-wrap justify-end gap-3">
                    <Pressable
                      accessibilityRole="button"
                      disabled={isSubmitting}
                      onPress={onClose}
                      className="min-h-[44px] justify-center rounded-xl bg-slate-800 px-4 active:opacity-80"
                    >
                      <Text className="font-semibold text-white">Cancelar</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{
                        disabled: isSubmitting,
                        busy: isSubmitting,
                      }}
                      disabled={isSubmitting}
                      onPress={() => void form.handleSubmit()}
                      className={`min-h-[44px] justify-center rounded-xl bg-blue-700 px-4 active:opacity-80 ${isSubmitting ? "opacity-60" : ""}`}
                    >
                      <Text className="font-semibold text-white">
                        {isSubmitting ? "Salvando…" : "Salvar local"}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </form.Subscribe>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
