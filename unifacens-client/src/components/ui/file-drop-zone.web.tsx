'use client';

import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Zona de upload com drag & drop (web) — interface única de coleta de arquivos,
 * reusada em imagens de pontos, modelos 3D e futuros ícones.
 * Validação espelha o servidor (tipo + tamanho) para feedback imediato.
 *
 * `children`: quando fornecido, renderiza DENTRO da zona (ex.: fila de cards
 * pendentes) no lugar do estado vazio — a zona continua aceitando drop/clique.
 */
export function FileDropZone({
  accept,
  multiple = false,
  maxSizeBytes,
  hint,
  label = 'Arraste arquivos aqui',
  onFiles,
  disabled = false,
  count,
  children,
}: {
  accept: string;
  multiple?: boolean;
  maxSizeBytes: number;
  hint: string;
  label?: string;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  count?: number;
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const depth = useRef(0);

  function validateAndEmit(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    const oversized = files.find((file) => file.size > maxSizeBytes);
    if (oversized) {
      setError(
        `"${oversized.name}" excede ${Math.round(maxSizeBytes / 1024 / 1024) || 1} MB.`,
      );
      return;
    }
    const wrongType = files.find(
      (file) => !accept.split(',').some((type) => file.type === type.trim()),
    );
    // Modelos 3D têm mimetypes exóticos/ausentes: aceita pela extensão.
    const extensionOk = files.every((file) =>
      accept
        .split(',')
        .some((entry) => entry.trim().startsWith('.') && file.name.toLowerCase().endsWith(entry.trim())),
    );
    if (wrongType && !extensionOk) {
      setError(`"${wrongType.name}" não é um formato aceito.`);
      return;
    }
    setError('');
    onFiles(multiple ? files : files.slice(0, 1));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    if (!disabled) validateAndEmit(event.dataTransfer.files);
  }

  return (
    <View className="gap-2">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          depth.current += 1;
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setDragging(false);
        }}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col justify-center gap-1 rounded-2xl border-2 border-dashed text-center transition-colors ${children ? 'min-h-[150px] px-3 py-3' : 'min-h-[120px] items-center px-4 py-6'} ${dragging ? 'border-blue-600 bg-blue-50' : 'border-slate-300 bg-slate-50'} ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-blue-400 hover:bg-blue-50/50'} focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2`}
      >
        {children ?? (
          <>
            <Ionicons
              name={dragging ? 'download' : 'cloud-upload-outline'}
              size={28}
              color={dragging ? '#1d4ed8' : '#64748b'}
            />
            <Text className="text-sm font-semibold text-slate-700">
              {dragging ? 'Solte para selecionar' : label}
            </Text>
            <Text className="text-xs text-slate-500">{hint}</Text>
            <Text className="text-xs text-slate-400">ou clique para procurar</Text>
          </>
        )}
        <input
          ref={inputRef}
          aria-hidden
          tabIndex={-1}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          className="hidden"
          onChange={(event) => {
            validateAndEmit(event.target.files);
            event.target.value = '';
          }}
        />
      </div>
      {!children && !!count && (
        <Text className="text-xs text-slate-500">
          {count} {count === 1 ? 'arquivo selecionado' : 'arquivos selecionados'}
        </Text>
      )}
      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-red-700">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** Chip de arquivo pendente com remoção individual. */
export function FileChip({
  name,
  sizeLabel,
  onRemove,
}: {
  name: string;
  sizeLabel: string;
  onRemove: () => void;
}) {
  return (
    <View className="flex-row items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <Ionicons name="document-outline" size={16} color="#334155" />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm text-slate-800">
          {name}
        </Text>
        <Text className="text-xs text-slate-500">{sizeLabel}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remover ${name}`}
        onPress={onRemove}
        className="min-h-[44px] min-w-[44px] items-center justify-center"
      >
        <Ionicons name="close-circle-outline" size={20} color="#b91c1c" />
      </Pressable>
    </View>
  );
}
