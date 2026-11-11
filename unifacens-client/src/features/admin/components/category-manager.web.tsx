import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import type { AdminModelsPage, Category } from 'shared';
import { adminApi } from '../services/admin-api';
import { AdminButton, AdminError } from './admin-ui';
import { ModelPicker } from './model-picker.web';

/** Gera slug a partir do label (editável) — conveniência do formulário. */
function suggestSlug(label: string) {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface Draft {
  id?: string;
  label: string;
  slug: string;
  sort: string;
  modelId: string;
}

const emptyDraft: Draft = { label: '', slug: '', sort: '0', modelId: '' };

/**
 * Gestão de categorias: criação/edição inline, vínculo com modelo 3D
 * (categoria mandante) e exclusão bloqueada quando em uso (409 tratado).
 */
export function CategoryManager({ notice }: { notice: (message: string) => void }) {
  const client = useQueryClient();
  const categories = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: ({ signal }) => adminApi.categories.list(signal),
    retry: false,
  });
  const models = useQuery({
    queryKey: ['admin', 'models'],
    queryFn: ({ signal }) => adminApi.models.list(signal),
    retry: false,
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');

  const invalidate = async (message: string) => {
    notice(message);
    setError('');
    await client.invalidateQueries({ queryKey: ['categories'] });
    await client.invalidateQueries({ queryKey: ['admin'] });
  };

  const save = useMutation({
    mutationFn: async (value: Draft) => {
      const payload = {
        label: value.label,
        slug: value.slug,
        sort: Number(value.sort) || 0,
        modelId: value.modelId || null,
      };
      return value.id
        ? adminApi.categories.update(value.id, payload)
        : adminApi.categories.create(payload);
    },
    onSuccess: async (category) => {
      setDraft(null);
      await invalidate(`Categoria "${category.label}" salva.`);
    },
    onError: (mutationError) => setError(mutationError.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.categories.remove(id),
    onSuccess: () => invalidate('Categoria excluída.'),
    onError: (mutationError) => setError(mutationError.message),
  });

  const modelOptions: AdminModelsPage['items'] = models.data?.items ?? [];

  function startEdit(category: Category) {
    setError('');
    setDraft({
      id: category.id,
      label: category.label,
      slug: category.slug,
      sort: String(category.sort),
      modelId: category.modelId ?? '',
    });
  }

  return (
    <View className="gap-5">
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-slate-700">
            {draft ? (draft.id ? 'Editar categoria' : 'Nova categoria') : 'Categorias do campus'}
          </Text>
          <Text className="text-sm text-slate-500">
            Cada categoria pode ter um modelo 3D vinculado — é o que o ponto AR renderiza.
          </Text>
        </View>
        {!draft && (
          <AdminButton
            primary
            onPress={() => {
              setError('');
              setDraft({ ...emptyDraft });
            }}
          >
            Nova categoria
          </AdminButton>
        )}
      </View>

      {draft && (
        <View className="gap-4 rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
          <View className="gap-2">
            <Text className="text-sm font-semibold text-slate-700">Nome</Text>
            <TextInput
              accessibilityLabel="Nome da categoria"
              value={draft.label}
              onChangeText={(label) =>
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        label,
                        slug: current.id ? current.slug : suggestSlug(label),
                      }
                    : current,
                )
              }
              maxLength={60}
              className="min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 px-4 text-base text-slate-900"
            />
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1 gap-2">
              <Text className="text-sm font-semibold text-slate-700">
                Identificador (slug)
              </Text>
              <TextInput
                accessibilityLabel="Identificador da categoria"
                value={draft.slug}
                onChangeText={(slug) =>
                  setDraft((current) => (current ? { ...current, slug } : current))
                }
                maxLength={60}
                autoCapitalize="none"
                className="min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 px-4 text-base text-slate-900"
              />
            </View>
            <View className="w-32 gap-2">
              <Text className="text-sm font-semibold text-slate-700">Ordem</Text>
              <TextInput
                accessibilityLabel="Ordem de exibição"
                value={draft.sort}
                onChangeText={(sort) =>
                  setDraft((current) => (current ? { ...current, sort } : current))
                }
                keyboardType="number-pad"
                maxLength={3}
                className="min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 px-4 text-base text-slate-900"
              />
            </View>
          </View>
          <View className="gap-2">
            <Text className="text-sm font-semibold text-slate-700">Modelo 3D vinculado</Text>
            {draft && (
              <ModelPicker
                models={modelOptions}
                selectedId={draft.modelId}
                onSelect={(modelId) =>
                  setDraft((current) => (current ? { ...current, modelId } : current))
                }
              />
            )}
          </View>
          {error ? <AdminError message={error} /> : null}
          <View className="flex-row gap-3">
            <AdminButton onPress={() => setDraft(null)} disabled={save.isPending}>
              Cancelar
            </AdminButton>
            <AdminButton
              primary
              disabled={save.isPending || !draft.label.trim() || !draft.slug.trim()}
              onPress={() => save.mutate(draft)}
            >
              {save.isPending ? 'Salvando…' : 'Salvar categoria'}
            </AdminButton>
          </View>
        </View>
      )}

      {categories.isPending ? (
        <ActivityIndicator color="#1d4ed8" />
      ) : categories.isError ? (
        <AdminError message={categories.error.message} retry={() => void categories.refetch()} />
      ) : (
        <View className="gap-3">
          {(categories.data ?? []).map((category) => (
            <View
              key={category.id}
              className="flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row md:items-center"
            >
              <View className="flex-1 gap-1">
                <Text className="text-base font-bold text-slate-900">{category.label}</Text>
                <Text className="font-mono text-xs text-slate-500">/{category.slug}</Text>
                <Text className="text-xs text-slate-500">
                  {category.model
                    ? `Modelo ${category.model.format.toUpperCase()} vinculado — renderiza no AR`
                    : 'Sem modelo — pin AR usa o visual padrão.'}
                </Text>
              </View>
              <View className="flex-row gap-2">
                <AdminButton onPress={() => startEdit(category)}>Editar</AdminButton>
                <AdminButton
                  danger
                  disabled={remove.isPending}
                  onPress={() => remove.mutate(category.id)}
                >
                  Excluir
                </AdminButton>
              </View>
            </View>
          ))}
          {(categories.data ?? []).length === 0 && (
            <Text className="py-6 text-center text-slate-500">
              Nenhuma categoria cadastrada ainda.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
