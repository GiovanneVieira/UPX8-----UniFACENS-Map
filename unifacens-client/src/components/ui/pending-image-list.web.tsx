'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface PendingImage {
  id: string;
  file: File;
  /** object URL para preview — revogado na remoção/desmontagem. */
  url: string;
}

let pendingSeq = 0;

/**
 * Fila de imagens ANTES do upload — desenhada para viver DENTRO da
 * FileDropZone: cards na ordem + um card-nuvem ao final indicando que dá
 * para adicionar mais (clique nele ou em qualquer área livre da zona).
 * Reordenar: arraste o card ou use as setas ‹ ›; excluir: lixo. A ordem da
 * fila é a ordem gravada no ponto (o servidor preserva a sequência do
 * FormData no JSONB).
 */
export function PendingImageList({
  entries,
  onChange,
  disabled = false,
  max = 5,
}: {
  entries: PendingImage[];
  onChange: (entries: PendingImage[]) => void;
  disabled?: boolean;
  max?: number;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  // Revoga object URLs pendentes na desmontagem (recurso externo, §7).
  useEffect(
    () => () => {
      entriesRef.current.forEach((entry) => URL.revokeObjectURL(entry.url));
    },
    [],
  );

  if (entries.length === 0) return null;

  function move(from: number, to: number) {
    if (to < 0 || to >= entries.length || from === to) return;
    const next = [...entries];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  function removeAt(index: number) {
    URL.revokeObjectURL(entries[index].url);
    onChange(entries.filter((_, i) => i !== index));
  }

  function onDrop(event: DragEvent<HTMLDivElement>, index: number) {
    event.preventDefault();
    // Não deixa o drop do card-bolinha para a zona (que tentaria ler files).
    event.stopPropagation();
    if (dragIndex !== null) move(dragIndex, index);
    setDragIndex(null);
  }

  return (
    <div className="flex w-full flex-row flex-wrap items-stretch justify-start gap-2 py-1">
      {entries.map((entry, index) => (
        <div
          key={entry.id}
          draggable={!disabled}
          onDragStart={() => setDragIndex(index)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => onDrop(event, index)}
          className={`flex w-[118px] flex-col gap-1 rounded-xl border bg-white p-1.5 ${dragIndex === index ? 'border-blue-500 opacity-60' : 'border-slate-200'}`}
          aria-label={`Imagem ${index + 1} de ${entries.length}: ${entry.file.name}`}
        >
          <View className="relative">
            <Image
              source={{ uri: entry.url }}
              className="h-[74px] w-full rounded-lg bg-slate-100"
              accessibilityLabel={`Prévia da imagem ${index + 1}`}
            />
            <View className="absolute left-1 top-1 rounded-full bg-slate-900/80 px-1.5 py-0.5">
              <Text className="text-[10px] font-bold text-white">{index + 1}</Text>
            </View>
          </View>
          {/* Controles param a propagação: clique neles NÃO abre o seletor da zona. */}
          <div
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <View className="flex-row items-center justify-between">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Mover ${entry.file.name} para trás`}
                disabled={disabled || index === 0}
                onPress={() => move(index, index - 1)}
                className="min-h-[32px] min-w-[32px] items-center justify-center rounded-lg active:bg-slate-100 disabled:opacity-30"
              >
                <Ionicons name="chevron-back" size={15} color="#334155" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remover ${entry.file.name} da fila`}
                disabled={disabled}
                onPress={() => removeAt(index)}
                className="min-h-[32px] min-w-[32px] items-center justify-center rounded-lg active:bg-red-50"
              >
                <Ionicons name="trash-outline" size={15} color="#b91c1c" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Mover ${entry.file.name} para frente`}
                disabled={disabled || index === entries.length - 1}
                onPress={() => move(index, index + 1)}
                className="min-h-[32px] min-w-[32px] items-center justify-center rounded-lg active:bg-slate-100 disabled:opacity-30"
              >
                <Ionicons name="chevron-forward" size={15} color="#334155" />
              </Pressable>
            </View>
          </div>
        </div>
      ))}
      {/* Card-nuvem final: "ainda dá para adicionar" — clique abre o seletor
          (propaga para a zona). Some quando a fila está cheia. */}
      {entries.length < max && !disabled && (
        <div
          className="flex w-[118px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-white/60 py-3"
          aria-label={`Adicionar mais imagens (${entries.length} de ${max})`}
        >
          <Ionicons name="cloud-upload-outline" size={24} color="#64748b" />
          <Text className="text-[10px] text-slate-500">
            adicionar ({entries.length}/{max})
          </Text>
        </div>
      )}
    </div>
  );
}

/** Cria entradas validadas (tipo/tamanho checados pela FileDropZone antes). */
export function createPendingEntries(files: File[]): PendingImage[] {
  return files.map((file) => ({
    id: `pending-${++pendingSeq}-${file.name}`,
    file,
    url: URL.createObjectURL(file),
  }));
}
