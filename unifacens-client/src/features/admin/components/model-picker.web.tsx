'use client';

import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AdminModelsPage } from 'shared';
import { resolveAssetUrl } from '@/services/api';
import { ModelThumbnail } from '@/components/admin/model-thumbnail.web';
import { ModelPreviewModal } from '@/components/admin/model-preview-modal.web';
import { AdminButton } from './admin-ui';

type AdminModel = AdminModelsPage['items'][number];

const PAGE_SIZE = 6;

/**
 * Seletor de modelo 3D para a categoria: busca por nome + grade de cards
 * paginados com RENDER REAL do modelo (thumbnail three.js lazy). O card
 * "Padrão (cubo)" representa a categoria sem modelo — visual default do AR.
 * Duplo clique ou botão direito em qualquer card abre o render completo
 * (zoom/órbita) sem selecionar o modelo.
 */
export function ModelPicker({
  models,
  selectedId,
  onSelect,
}: {
  models: AdminModel[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<AdminModel | null>(null);

  const normalized = search.trim().toLowerCase();
  const filtered = normalized
    ? models.filter((model) => model.name.toLowerCase().includes(normalized))
    : models;
  const totalPages = Math.max(1, Math.ceil((filtered.length + 1) / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  // O card "Padrão" ocupa a primeira posição da primeira página.
  const withDefault = [{ isDefault: true as const }, ...filtered.map((m) => ({ model: m }))];
  const slice = withDefault.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE,
  );

  function changeSearch(value: string) {
    setSearch(value);
    setPage(0); // busca muda o conjunto — volta pra primeira página.
  }

  /** Render completo: duplo clique OU botão direito (sem seleção). */
  function openRender(event: { preventDefault(): void }, model: AdminModel) {
    event.preventDefault();
    setPreview(model);
  }

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <View className="flex-1 flex-row items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3">
          <Ionicons name="search-outline" size={16} color="#64748b" />
          <TextInput
            accessibilityLabel="Buscar modelo por nome"
            placeholder="Buscar modelo por nome…"
            placeholderTextColor="#64748b"
            value={search}
            onChangeText={changeSearch}
            maxLength={80}
            className="min-h-[44px] flex-1 text-base text-slate-900"
          />
          {!!search && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Limpar busca"
              onPress={() => changeSearch('')}
              className="min-h-[44px] min-w-[32px] items-center justify-center"
            >
              <Ionicons name="close-circle-outline" size={18} color="#64748b" />
            </Pressable>
          )}
        </View>
      </View>

      <View className="flex-row flex-wrap gap-3">
        {slice.map((entry) =>
          'isDefault' in entry ? (
            <Pressable
              key="default-model"
              accessibilityRole="button"
              accessibilityLabel="Padrão, sem modelo 3D"
              accessibilityState={{ selected: selectedId === '' }}
              onPress={() => onSelect('')}
              className={`w-[47%] min-w-0 flex-1 gap-2 rounded-2xl border-2 p-2 md:w-[31%] ${
                selectedId === ''
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <View className="h-28 items-center justify-center rounded-xl bg-slate-100">
                <Ionicons name="cube-outline" size={30} color="#64748b" />
              </View>
              <Text
                numberOfLines={1}
                className={`text-center text-sm font-semibold ${
                  selectedId === '' ? 'text-blue-800' : 'text-slate-800'
                }`}
              >
                Padrão (cubo)
              </Text>
              <Text className="text-center text-xs text-slate-500">
                visual default do AR
              </Text>
            </Pressable>
          ) : (
            <Pressable
              key={entry.model.id}
              accessibilityRole="button"
              accessibilityLabel={`Vincular modelo ${entry.model.name}. Duplo clique para render completo`}
              accessibilityState={{ selected: selectedId === entry.model.id }}
              onPress={() => onSelect(entry.model.id)}
              className={`relative w-[47%] min-w-0 flex-1 gap-2 rounded-2xl border-2 p-2 md:w-[31%] ${
                selectedId === entry.model.id
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              {/* Render completo: duplo clique / botão direito (não seleciona). */}
              <div
                onDoubleClick={(event) => openRender(event, entry.model)}
                onContextMenu={(event) => openRender(event, entry.model)}
                title="Duplo clique ou botão direito: render completo"
              >
                {selectedId === entry.model.id && (
                  <View className="absolute -right-1.5 -top-1.5 z-10 h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-blue-600 shadow">
                    <Ionicons name="checkmark" size={16} color="white" />
                  </View>
                )}
                <ModelThumbnail
                  url={resolveAssetUrl(entry.model.url)}
                  format={entry.model.format}
                  label={entry.model.name}
                />
                <Text
                  numberOfLines={1}
                  className={`mt-2 text-center text-sm font-semibold ${
                    selectedId === entry.model.id ? 'text-blue-800' : 'text-slate-800'
                  }`}
                >
                  {entry.model.name}
                </Text>
                <Text className="text-center text-xs text-slate-500">
                  {entry.model.format.toUpperCase()} ·{' '}
                  {(entry.model.sizeBytes / 1024).toFixed(0)} KB
                </Text>
              </div>
            </Pressable>
          ),
        )}
      </View>

      {filtered.length === 0 && !!normalized && (
        <Text className="py-4 text-center text-sm text-slate-500">
          Nenhum modelo encontrado para "{search}".
        </Text>
      )}
      {models.length === 0 && (
        <Text className="py-4 text-center text-sm text-slate-500">
          Nenhum modelo publicado — envie arquivos na seção "Modelos 3D".
        </Text>
      )}

      {totalPages > 1 && (
        <View className="flex-row items-center justify-between border-t border-slate-200 pt-3">
          <Text className="text-sm text-slate-600">
            Página {currentPage + 1} de {totalPages}
          </Text>
          <View className="flex-row gap-2">
            <AdminButton
              disabled={currentPage === 0}
              onPress={() => setPage(currentPage - 1)}
            >
              Anterior
            </AdminButton>
            <AdminButton
              disabled={currentPage + 1 >= totalPages}
              onPress={() => setPage(currentPage + 1)}
            >
              Próxima
            </AdminButton>
          </View>
        </View>
      )}

      <ModelPreviewModal model={preview} onClose={() => setPreview(null)} />
    </View>
  );
}
