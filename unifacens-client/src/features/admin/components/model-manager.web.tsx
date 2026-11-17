import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  MODEL_UPLOAD_HINT,
  type AdminModelsPage,
} from 'shared';
import { adminApi } from '../services/admin-api';
import { AdminButton, AdminError } from './admin-ui';
import { FileDropZone, FileChip } from '@/components/ui/file-drop-zone.web';
import { ModelPreviewModal } from '@/components/admin/model-preview-modal.web';

type AdminModel = AdminModelsPage['items'][number];
const PREVIEWABLE = new Set(['glb', 'gltf', 'obj']);

const MODEL_ACCEPT = '.glb,.gltf,.obj,.vrx';
const MODEL_MAX_BYTES = 1024 * 1024; // 1MB

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Gestão de modelos 3D: upload com drag & drop (arquivo único até 1MB),
 * listagem e exclusão bloqueada quando vinculado a categoria (409 tratado).
 * FBX NÃO é aceito (decisão 2026-11-11) — o hint orienta exportar GLB.
 */
export function ModelManager({ notice }: { notice: (message: string) => void }) {
  const client = useQueryClient();
  const models = useQuery({
    queryKey: ['admin', 'models'],
    queryFn: ({ signal }) => adminApi.models.list(signal),
    retry: false,
  });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<AdminModel | null>(null);

  const upload = useMutation({
    mutationFn: (uploadFile: File) => adminApi.models.upload(uploadFile),
    onSuccess: async (model) => {
      setFile(null);
      setError('');
      notice(`Modelo "${model.name}" publicado.`);
      await client.invalidateQueries({ queryKey: ['admin', 'models'] });
    },
    onError: (mutationError) => setError(mutationError.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.models.remove(id),
    onSuccess: async () => {
      setError('');
      notice('Modelo excluído.');
      await client.invalidateQueries({ queryKey: ['admin', 'models'] });
    },
    onError: (mutationError) => setError(mutationError.message),
  });

  return (
    <View className="gap-5">
      <View className="gap-1">
        <Text className="text-sm font-semibold text-slate-700">
          Enviar modelo 3D
        </Text>
        <Text className="text-sm text-slate-500">{MODEL_UPLOAD_HINT}</Text>
      </View>
      <View className="gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
        <FileDropZone
          accept={MODEL_ACCEPT}
          maxSizeBytes={MODEL_MAX_BYTES}
          hint="GLB, glTF embutido, OBJ ou VRX · até 1 MB · FBX não é aceito (exporte GLB)"
          label="Arraste o modelo aqui"
          disabled={upload.isPending}
          count={file ? 1 : 0}
          onFiles={(files) => {
            setError('');
            setFile(files[0] ?? null);
          }}
        />
        {file && (
          <FileChip
            name={file.name}
            sizeLabel={formatSize(file.size)}
            onRemove={() => setFile(null)}
          />
        )}
        <AdminButton
          primary
          disabled={upload.isPending || !file}
          onPress={() => file && upload.mutate(file)}
        >
          {upload.isPending
            ? 'Enviando…'
            : file
              ? `Publicar ${file.name}`
              : 'Selecionar arquivo para publicar'}
        </AdminButton>
        {error ? <AdminError message={error} /> : null}
      </View>

      <View className="gap-3">
        <Text className="text-sm font-semibold text-slate-700">
          Modelos publicados
        </Text>
        {models.isPending ? (
          <ActivityIndicator color="#1d4ed8" />
        ) : models.isError ? (
          <AdminError message={models.error.message} retry={() => void models.refetch()} />
        ) : (
          (models.data?.items ?? []).map((model: AdminModel) => (
            <div
              key={model.id}
              onDoubleClick={() => setPreview(model)}
              onContextMenu={(event) => {
                event.preventDefault();
                setPreview(model);
              }}
              title="Duplo clique ou botão direito: render completo"
            >
              <View className="flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row md:items-center">
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                  <Ionicons name="cube-outline" size={20} color="#1d4ed8" />
                </View>
                <View className="flex-1 gap-1">
                  <Text className="text-base font-bold text-slate-900">{model.name}</Text>
                  <Text className="text-xs text-slate-500">
                    {model.format.toUpperCase()} · {formatSize(model.sizeBytes)} ·{' '}
                    {model.boundingBox ? 'com bounding box' : 'sem bounding box'}
                  </Text>
                  {model.category ? (
                    <Text className="text-xs text-emerald-700">
                      Vinculado à categoria {model.category.label}
                    </Text>
                  ) : (
                    <Text className="text-xs text-slate-400">
                      Sem vínculo — vincule na seção Categorias.
                    </Text>
                  )}
                </View>
                <View className="flex-row gap-2">
                  <AdminButton
                    onPress={() => setPreview(model)}
                    label={`Visualizar ${model.name}`}
                  >
                    {PREVIEWABLE.has(model.format)
                      ? 'Visualizar'
                      : 'Sem preview'}
                  </AdminButton>
                  <AdminButton
                    danger
                    disabled={remove.isPending}
                    onPress={() => remove.mutate(model.id)}
                  >
                    Excluir
                  </AdminButton>
                </View>
              </View>
            </div>
          ))
        )}
        {models.data?.items.length === 0 && (
          <Text className="py-6 text-center text-slate-500">
            Nenhum modelo publicado ainda.
          </Text>
        )}
      </View>
      <ModelPreviewModal model={preview} onClose={() => setPreview(null)} />
    </View>
  );
}
