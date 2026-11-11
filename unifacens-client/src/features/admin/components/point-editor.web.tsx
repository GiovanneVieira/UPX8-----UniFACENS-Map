import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  updateAdminPointSchema,
  type UpdateAdminPoint,
  type AnchorDetail,
} from 'shared';
import { adminApi, adminImageUrl } from '../services/admin-api';
import { useCategoriesQuery } from '@/features/categories/queries/use-categories-query';
import { FileDropZone } from '@/components/ui/file-drop-zone.web';
import {
  PendingImageList,
  createPendingEntries,
  type PendingImage,
} from '@/components/ui/pending-image-list.web';
import { AdminModalShell } from '@/components/ui/admin-modal-shell.web';
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
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [images, setImages] = useState(point.images);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState('');
  const categories = useCategoriesQuery();
  const categoryOptions = categories.data ?? [];
  const update = useMutation({
    mutationFn: (value: UpdateAdminPoint) =>
      adminApi.updatePoint(point.id, value),
    onSuccess: async (updated) => {
      setMessage('Alterações salvas.');
      setImages(updated.images);
      await refresh('Ponto atualizado.');
    },
  });
  const upload = useMutation({
    // A ordem da fila é a ordem do FormData — o servidor grava no JSONB nela.
    mutationFn: () =>
      adminApi.uploadImages(point.id, pending.map((entry) => entry.file)),
    onSuccess: async (data) => {
      pending.forEach((entry) => URL.revokeObjectURL(entry.url));
      setPending([]);
      setImages(data.images);
      setMessage('Imagens adicionadas.');
      await refresh('Imagens adicionadas ao ponto.');
    },
  });
  const removeImage = useMutation({
    mutationFn: (key: string) => adminApi.deleteImage(point.id, key),
    onSuccess: (data) => {
      setImages(data.images);
      setMessage('Imagem removida.');
    },
  });
  const remove = useMutation({
    mutationFn: () => adminApi.deletePoint(point.id),
    onSuccess: () => refresh('Ponto excluído.', true),
  });
  const busy =
    update.isPending || upload.isPending || remove.isPending || removeImage.isPending;
  const error =
    update.error || upload.error || remove.error || removeImage.error;
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
      categoryId: point.category?.id ?? '',
    } as UpdateAdminPoint,
    validators: { onSubmit: updateAdminPointSchema },
    onSubmit: async ({ value }) => {
      resetMessages();
      await update.mutateAsync(value).catch(() => undefined);
    },
  });
  return (
    <AdminModalShell visible onClose={() => { if (!busy) close(); }} dismissable={!busy}>
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
              <Text className="mb-2 text-sm font-semibold text-slate-700">
                Categoria do ponto
              </Text>
              <form.Field name="categoryId">
                {(field) => (
                  <View className="mb-3 flex-row flex-wrap gap-2">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Sem categoria"
                      accessibilityState={{ selected: !field.state.value }}
                      disabled={busy}
                      onPress={() => field.handleChange(null)}
                      className={`min-h-[44px] justify-center rounded-xl border px-4 py-2 ${!field.state.value ? 'border-blue-600 bg-blue-700' : 'border-slate-300 bg-white'}`}
                    >
                      <Text
                        className={`text-sm font-semibold ${!field.state.value ? 'text-white' : 'text-slate-700'}`}
                      >
                        Sem categoria
                      </Text>
                    </Pressable>
                    {categoryOptions.map((category) => {
                      const selected = field.state.value === category.id;
                      return (
                        <Pressable
                          key={category.id}
                          accessibilityRole="button"
                          accessibilityLabel={category.label}
                          accessibilityState={{ selected }}
                          disabled={busy}
                          onPress={() => field.handleChange(category.id)}
                          className={`min-h-[44px] flex-row items-center gap-1.5 justify-center rounded-xl border px-4 py-2 ${selected ? 'border-blue-600 bg-blue-700' : 'border-slate-300 bg-white'}`}
                        >
                          <Text
                            className={`text-sm font-semibold ${selected ? 'text-white' : 'text-slate-700'}`}
                          >
                            {category.label}
                          </Text>
                          {selected && category.model && (
                            <Ionicons name="cube" size={13} color="#bfdbfe" />
                          )}
                        </Pressable>
                      );
                    })}
                    {categoryOptions.length === 0 && (
                      <Text className="text-sm text-slate-500">
                        {categories.isPending
                          ? 'Carregando categorias…'
                          : 'Cadastre categorias na seção Categorias.'}
                      </Text>
                    )}
                  </View>
                )}
              </form.Field>
              <Text className="mb-3 text-xs text-slate-500">
                A categoria define o modelo 3D renderizado no modo AR — o ícone
                de cubo indica categorias com modelo vinculado.
              </Text>
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
                  cada. Arraste e solte para enviar.
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {images.map((path, index) =>
                    adminImageUrl(path) ? (
                      <View
                        key={path}
                        className="gap-1 rounded-lg border border-slate-200 p-1"
                      >
                        <Image
                          accessibilityLabel={`Imagem ${index + 1} de ${point.name}`}
                          source={{ uri: adminImageUrl(path) }}
                          className="h-24 w-28 rounded-lg bg-slate-100"
                        />
                        <AdminButton
                          danger
                          disabled={busy}
                          label={`Remover imagem ${index + 1}`}
                          onPress={() => {
                            resetMessages();
                            removeImage.mutate(path);
                          }}
                        >
                          <Ionicons name="trash-outline" size={14} color="#b91c1c" />
                        </AdminButton>
                      </View>
                    ) : null,
                  )}
                </View>
                {!images.length && (
                  <Text className="text-sm text-slate-500">
                    Este ponto ainda não tem imagens.
                  </Text>
                )}
                <FileDropZone
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  maxSizeBytes={5 * 1024 * 1024}
                  hint="JPEG, PNG ou WebP · até 5 MB cada · máx 5 por envio"
                  label="Arraste as imagens do ponto"
                  disabled={busy}
                  onFiles={(selected) => {
                    resetMessages();
                    // Concatena (máx 5 no total) preservando a fila atual.
                    const additions = createPendingEntries(selected);
                    setPending((current) => [...current, ...additions].slice(0, 5));
                  }}
                >
                  {pending.length ? (
                    <PendingImageList
                      entries={pending}
                      onChange={setPending}
                      disabled={busy}
                      max={5}
                    />
                  ) : null}
                </FileDropZone>
                <AdminButton
                  disabled={busy || !pending.length}
                  onPress={() => {
                    resetMessages();
                    upload.mutate();
                  }}
                >
                  {upload.isPending
                    ? 'Enviando…'
                    : `Adicionar imagens${pending.length ? ` (${pending.length})` : ''}`}
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
    </AdminModalShell>
  );
}
