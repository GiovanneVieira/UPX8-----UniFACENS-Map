import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormInputField } from '@/components/ui/form-field';

/** Reportar um problema: formulário mockado com confirmação. */
export function ReportProblemScreen() {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const submit = () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert('Aviso', 'Preencha o título e a descrição do problema.');
      return;
    }
    Alert.alert('Obrigado!', 'Seu relato foi registrado (demonstração).', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <View className="flex-1 bg-neutral-950" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-5 pb-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={() => router.back()}
          className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-neutral-800 active:opacity-80">
          <Ionicons name="chevron-back" size={22} color="#D4D4D4" />
        </Pressable>
        <Text className="text-2xl font-bold text-white">Reportar</Text>
        <View className="h-11 w-11" />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
        <View className="flex-row items-center gap-3 rounded-2xl bg-neutral-900 px-5 py-4">
          <Ionicons name="bug-outline" size={20} color="#60A5FA" />
          <Text className="flex-1 text-sm text-neutral-300">
            Encontrou algo errado? Descreva o problema e a equipe vai investigar.
          </Text>
        </View>
        <FormInputField
          label="Título"
          value={title}
          onChangeText={setTitle}
          maxLength={120}
          placeholder="Resumo do problema"
        />
        <FormInputField
          label="Descrição"
          value={description}
          onChangeText={setDescription}
          maxLength={500}
          multiline
          placeholder="Detalhe o que aconteceu, em qual tela e o que esperava"
        />
        <Pressable
          accessibilityRole="button"
          onPress={submit}
          className="min-h-[48px] items-center justify-center rounded-full bg-blue-600 active:opacity-80">
          <Text className="font-semibold text-white">Enviar relato</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
