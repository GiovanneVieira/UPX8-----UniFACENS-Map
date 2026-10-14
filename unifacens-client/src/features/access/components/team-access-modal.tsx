import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { FormInputField } from "@/components/ui/form-field";
import { useTeamAccessForm } from "../hooks/use-team-access-form";

export function TeamAccessModal({ onClose }: { onClose: () => void }) {
  const { form, mutation } = useTeamAccessForm(onClose);
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!form.state.isSubmitting) onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-center bg-black/70 p-4"
      >
        <View
          accessibilityViewIsModal
          className="max-h-[90%] w-full max-w-xl self-center rounded-3xl border border-slate-700 bg-slate-950"
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <View className="gap-3 p-5">
              <Text
                accessibilityRole="header"
                className="text-2xl font-bold text-white"
              >
                Acesso da equipe
              </Text>
              <Text className="text-sm text-slate-300">
                Informe o código fornecido pela equipe para editar os locais. O
                acesso termina ao sair ou fechar a página.
              </Text>
              <form.Field name="token">
                {(field) => (
                  <FormInputField
                    label="Código de acesso"
                    secureTextEntry
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={512}
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
              {mutation.isError ? (
                <Text
                  accessibilityLiveRegion="polite"
                  className="text-sm text-rose-300"
                >
                  {mutation.error.message}
                </Text>
              ) : null}
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(submitting) => (
                  <View className="flex-row flex-wrap justify-end gap-3">
                    <Pressable
                      accessibilityRole="button"
                      disabled={submitting}
                      accessibilityState={{ disabled: submitting }}
                      onPress={onClose}
                      className="min-h-[44px] justify-center rounded-xl bg-slate-800 px-4 active:opacity-80"
                    >
                      <Text className="font-semibold text-white">Cancelar</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={submitting}
                      accessibilityState={{
                        disabled: submitting,
                        busy: submitting,
                      }}
                      onPress={() => void form.handleSubmit()}
                      className="min-h-[44px] justify-center rounded-xl bg-blue-700 px-4 active:opacity-80"
                    >
                      <Text className="font-semibold text-white">
                        {submitting ? "Validando…" : "Entrar"}
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
