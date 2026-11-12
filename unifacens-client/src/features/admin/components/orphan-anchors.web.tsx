'use client';

import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Category, OrphanAnchor } from 'shared';
import { adminApi } from '../services/admin-api';
import { AdminButton, AdminError } from './admin-ui';

/**
 * Âncoras órfãs — hospedadas na plataforma ReactVision mas sem registro no
 * banco (ex.: modal de criação fechado após o hosting, antes de salvar).
 * A "adoção" registra o pin via POST /anchors reaproveitando o cloudAnchorId
 * (sem re-hospedar) — o pin passa a resolver normalmente no AR.
 *
 * A query vem do useAdminPanel (mesma queryKey do badge da nav — 1 fetch).
 */
export function OrphanAnchors({
  orphans,
  notice,
  categories,
}: {
  orphans: UseQueryResult<OrphanAnchor[], Error>;
  notice: (message: string) => void;
  categories: Category[];
}) {
  const [adopting, setAdopting] = useState<OrphanAnchor | null>(null);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function startAdoption(orphan: OrphanAnchor) {
    setAdopting(orphan);
    setName('');
    setCategoryId(null);
    setError('');
  }

  async function confirmAdoption() {
    if (!adopting) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Dê um nome ao ponto antes de adotar.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await adminApi.adoptOrphan({
        name: trimmed,
        cloudAnchorId: adopting.cloudAnchorId,
        categoryId,
        ...(adopting.gps
          ? { latitude: adopting.gps.latitude, longitude: adopting.gps.longitude }
          : {}),
      });
      notice(`Ponto "${trimmed}" adotado — visível no AR na próxima sessão.`);
      setAdopting(null);
      await orphans.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível adotar a âncora.');
    } finally {
      setSaving(false);
    }
  }

  if (orphans.isPending) {
    return (
      <View className="items-center gap-3 py-16">
        <ActivityIndicator color="#1d4ed8" />
        <Text accessibilityLiveRegion="polite" className="text-slate-600">
          Consultando a plataforma ReactVision…
        </Text>
      </View>
    );
  }
  if (orphans.isError) {
    return (
      <AdminError
        message={orphans.error.message}
        retry={() => void orphans.refetch()}
      />
    );
  }

  const items = orphans.data ?? [];

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3 rounded-xl bg-slate-100 p-3">
        <Ionicons name="information-circle-outline" size={18} color="#475569" />
        <Text className="flex-1 text-xs leading-4 text-slate-600">
          Âncoras hospedadas na plataforma (ReactVision) que não têm ponto
          correspondente no banco — em geral por criação interrompida após o
          escaneamento. Adotar registra o ponto sem precisar re-escanear.
        </Text>
      </View>

      {items.length === 0 && (
        <View className="items-center gap-2 py-14">
          <Ionicons name="checkmark-circle-outline" size={34} color="#059669" />
          <Text className="text-lg font-semibold text-slate-800">
            Nenhuma âncora órfã
          </Text>
          <Text className="text-center text-sm text-slate-500">
            Tudo hospedado na plataforma já tem ponto correspondente no banco.
          </Text>
        </View>
      )}

      {items.map((orphan) => (
        <View
          key={orphan.cloudAnchorId}
          className="flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row md:items-center"
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
            <Ionicons name="cloud-offline-outline" size={20} color="#b45309" />
          </View>
          <View className="flex-1 gap-1">
            <Text
              numberOfLines={1}
              className="font-mono text-sm font-semibold text-slate-800"
            >
              {orphan.cloudAnchorId}
            </Text>
            <Text className="text-xs text-slate-500">
              {orphan.keypoints != null ? `${orphan.keypoints} keypoints` : 'sem keypoints'}
              {' · '}
              {orphan.resolveCount ?? 0} resolves ({orphan.successfulResolveCount ?? 0} ok)
              {orphan.gps ? ' · com GPS' : ' · sem GPS'}
              {orphan.hostedAt
                ? ` · hospedada ${new Date(orphan.hostedAt).toLocaleDateString('pt-BR')}`
                : ''}
            </Text>
            <Text className="text-xs text-amber-700">
              TTL de 30 dias conta desde o hospedagem — adote antes que expire.
            </Text>
          </View>
          <AdminButton
            primary
            label={`Adotar ${orphan.cloudAnchorId}`}
            onPress={() => startAdoption(orphan)}
          >
            Adotar
          </AdminButton>
        </View>
      ))}

      {adopting && (
        <View className="gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <Text className="text-base font-bold text-slate-900">
            Adotar âncora órfã
          </Text>
          <Text numberOfLines={1} className="font-mono text-xs text-slate-500">
            {adopting.cloudAnchorId}
          </Text>
          <View className="gap-1">
            <Text className="text-sm font-semibold text-slate-700">
              Nome do ponto *
            </Text>
            <TextInput
              accessibilityLabel="Nome do ponto"
              placeholder="Ex: Geladeira do laboratório"
              placeholderTextColor="#64748b"
              value={name}
              onChangeText={setName}
              maxLength={80}
              autoFocus
              className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900"
            />
          </View>
          <View className="gap-1">
            <Text className="text-sm font-semibold text-slate-700">
              Categoria (opcional)
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: categoryId === null }}
                onPress={() => setCategoryId(null)}
                className={`min-h-[40px] justify-center rounded-lg border px-3 py-2 ${
                  categoryId === null
                    ? 'border-blue-600 bg-blue-600'
                    : 'border-slate-300 bg-white'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    categoryId === null ? 'text-white' : 'text-slate-700'
                  }`}
                >
                  Sem categoria
                </Text>
              </Pressable>
              {categories.map((category) => (
                <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: categoryId === category.id }}
                  onPress={() => setCategoryId(category.id)}
                  className={`min-h-[40px] justify-center rounded-lg border px-3 py-2 ${
                    categoryId === category.id
                      ? 'border-blue-600 bg-blue-600'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      categoryId === category.id ? 'text-white' : 'text-slate-700'
                    }`}
                  >
                    {category.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          {!!error && (
            <Text accessibilityLiveRegion="polite" className="text-sm text-red-700">
              {error}
            </Text>
          )}
          <View className="flex-row justify-end gap-2">
            <AdminButton
              disabled={saving}
              onPress={() => setAdopting(null)}
            >
              Cancelar
            </AdminButton>
            <AdminButton primary disabled={saving} onPress={() => void confirmAdoption()}>
              {saving ? 'Adotando…' : 'Adotar ponto'}
            </AdminButton>
          </View>
        </View>
      )}
    </View>
  );
}
