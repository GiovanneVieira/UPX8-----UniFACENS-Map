import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { Image, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import {
  updateAdminPointSchema,
  type UpdateAdminPoint,
  type AnchorDetail,
} from 'shared';
import { adminApi, adminImageUrl } from '../services/admin-api';
import { AdminButton, AdminError } from './admin-ui';

export function PointEditor({
  point,
  close,
  refresh,
}: {
  point: AnchorDetail;
  close: () => void;
  refresh: (message: string, deleted?: boolean) => Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [images, setImages] = useState(point.images);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState('');
  const update = useMutation({
    mutationFn: (value: UpdateAdminPoint) =>
      adminApi.updatePoint(point.id, value),
    onSuccess: async () => {
      setMessage('Alterações salvas.');
      await refresh('Ponto atualizado.');
    },
  });
  const upload = useMutation({
    mutationFn: () => adminApi.uploadImages(point.id, files),
    onSuccess: async (data) => {
      setImages(data.images);
      setFiles([]);
      setMessage('Imagens adicionadas.');
      await refresh('Imagens adicionadas ao ponto.');
    },
  });
  const remove = useMutation({
    mutationFn: () => adminApi.deletePoint(point.id),
    onSuccess: () => refresh('Ponto excluído.', true),
  });
  const busy = update.isPending || upload.isPending || remove.isPending;
  const error = update.error || upload.error || remove.error;
  function resetMessages() {
    setMessage('');
    update.reset();
    upload.reset();
    remove.reset();
  }
  const form = useForm({
    defaultValues: {
      name: point.name,
      description: point.description ?? '',
      longDescription: point.longDescription ?? '',
    } as UpdateAdminPoint,
    validators: { onSubmit: updateAdminPointSchema },
    onSubmit: async ({ value }) => {
      resetMessages();
      await update.mutateAsync(value).catch(() => undefined);
    },
  });
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) close();
      }}
    >
      <View className="flex-1 items-center justify-center bg-slate-950/60 p-3 md:p-6">
        <View
          accessibilityViewIsModal
          className="max-h-[95%] w-full max-w-2xl rounded-2xl bg-white"
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 24 }}
          >
            <View className="mb-5 flex-row items-center justify-between gap-3">
              <View className="flex-1">
                <Text className="text-xs font-bold uppercase tracking-widest text-blue-700">
                  Gestão do campus
                </Text>
                <Text
                  accessibilityRole="header"
                  className="mt-2 text-2xl font-bold text-slate-900"
                >
                  Editar ponto
                </Text>
              </View>
              <AdminButton onPress={close} disabled={busy}>
                Fechar
              </AdminButton>
            </View>
            <View className="gap-4">
              {(['name', 'description', 'longDescription'] as const).map(
                (name) => (
                  <form.Field key={name} name={name}>
                    {(field) => (
                      <View className="gap-2">
                        <Text className="text-sm font-semibold text-slate-700">
                          {name === 'name'
                            ? 'Nome'
                            : name === 'description'
                              ? 'Descrição'
                              : 'Informações detalhadas'}
                        </Text>
                        <TextInput
                          accessibilityLabel={
                            name === 'name'
                              ? 'Nome do ponto'
                              : name === 'description'
                                ? 'Descrição do ponto'
                                : 'Informações detalhadas'
                          }
                          value={field.state.value ?? ''}
                          onChangeText={field.handleChange}
                          onBlur={field.handleBlur}
                          editable={!busy}
                          maxLength={
                            name === 'name'
                              ? 255
                              : name === 'description'
                                ? 1000
                                : 10000
                          }
                          multiline={name !== 'name'}
                          className={`min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-base text-slate-900 ${name !== 'name' ? 'min-h-[90px]' : ''}`}
                        />
                        {field.state.meta.errors.map((issue, index) => (
                          <Text
                            key={index}
                            accessibilityRole="alert"
                            className="text-sm text-red-700"
                          >
                            {typeof issue === 'string' ? issue : issue?.message}
                          </Text>
                        ))}
                      </View>
                    )}
                  </form.Field>
                ),
              )}
              <AdminButton
                primary
                disabled={busy}
                onPress={() => void form.handleSubmit()}
              >
                {update.isPending ? 'Salvando…' : 'Salvar alterações'}
              </AdminButton>
              <View className="mt-3 gap-3 border-t border-slate-200 pt-5">
                <Text
                  accessibilityRole="header"
                  className="text-lg font-bold text-slate-900"
                >
                  Imagens do ponto
                </Text>
                <Text className="text-sm text-slate-600">
                  JPEG, PNG ou WebP. Até 5 imagens por envio, com no máximo 5 MB
                  cada.
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {images.map((path, index) =>
                    adminImageUrl(path) ? (
                      <Image
                        key={path}
                        accessibilityLabel={`Imagem ${index + 1} de ${point.name}`}
                        source={{ uri: adminImageUrl(path) }}
                        className="h-24 w-28 rounded-lg bg-slate-100"
                      />
                    ) : null,
                  )}
                </View>
                {!images.length && (
                  <Text className="text-sm text-slate-500">
                    Este ponto ainda não tem imagens.
                  </Text>
                )}
                <input
                  key={images.length}
                  aria-label="Selecionar imagens do ponto"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  disabled={busy}
                  onChange={(event) => {
                    resetMessages();
                    setFiles(Array.from(event.target.files ?? []));
                  }}
                  style={{ maxWidth: '100%', minHeight: 44, color: '#334155' }}
                />
                <AdminButton
                  disabled={busy || !files.length}
                  onPress={() => {
                    resetMessages();
                    upload.mutate();
                  }}
                >
                  {upload.isPending
                    ? 'Enviando…'
                    : `Adicionar imagens${files.length ? ` (${files.length})` : ''}`}
                </AdminButton>
              </View>
              {!!message && (
                <Text
                  accessibilityLiveRegion="polite"
                  className="rounded-lg bg-emerald-50 p-3 text-emerald-800"
                >
                  {message}
                </Text>
              )}
              {error && <AdminError message={error.message} />}
              <View className="mt-3 gap-3 border-t border-slate-200 pt-5">
                {confirmDelete ? (
                  <View className="gap-3 rounded-xl bg-red-50 p-4">
                    <Text className="font-semibold text-red-900">
                      Excluir “{point.name}”?
                    </Text>
                    <Text className="text-red-800">
                      O ponto será removido do catálogo. Esta ação não pode ser
                      desfeita.
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      <AdminButton
                        disabled={busy}
                        onPress={() => setConfirmDelete(false)}
                      >
                        Cancelar
                      </AdminButton>
                      <AdminButton
                        danger
                        disabled={busy}
                        onPress={() => {
                          resetMessages();
                          remove.mutate();
                        }}
                      >
                        {remove.isPending ? 'Excluindo…' : 'Confirmar exclusão'}
                      </AdminButton>
                    </View>
                  </View>
                ) : (
                  <AdminButton
                    danger
                    disabled={busy}
                    onPress={() => setConfirmDelete(true)}
                  >
                    Excluir ponto
                  </AdminButton>
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
