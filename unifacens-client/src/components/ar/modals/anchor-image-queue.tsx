import React, { useCallback } from 'react';
import {
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

/** Foto pendente de upload (ordem da fila = ordem gravada no ponto). */
export interface PendingPhoto {
  id: string;
  /** file:// para preview E upload (RN FormData). */
  uri: string;
  fileName: string;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  size: number;
}

/** Paridade com o server: JPEG/PNG/WebP ≤5MB, máx 5 por ponto. */
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_PHOTOS = 5;

let pendingSeq = 0;

interface AssetLike {
  uri?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  assetId?: string | null;
}

/**
 * Valida e converte assets do picker em fotos pendentes (espelha o server).
 * Retorna null + Alert quando o arquivo é inválido (feedback imediato).
 */
function toPendingPhotos(assets: AssetLike[]): PendingPhoto[] {
  const valid: PendingPhoto[] = [];
  for (const asset of assets) {
    const mime = (asset.mimeType ?? 'image/jpeg') as PendingPhoto['mime'];
    if (!ALLOWED_MIMES.includes(mime)) {
      Alert.alert('Formato não suportado', 'Envie imagens JPEG, PNG ou WebP.');
      continue;
    }
    if ((asset.fileSize ?? 0) > MAX_FILE_SIZE) {
      Alert.alert('Arquivo muito grande', 'Cada imagem pode ter até 5 MB.');
      continue;
    }
    valid.push({
      id: `pending-${++pendingSeq}-${asset.fileName ?? 'foto'}`,
      uri: asset.uri as string,
      fileName: asset.fileName ?? `foto-${++pendingSeq}.jpg`,
      mime,
      size: asset.fileSize ?? 0,
    });
  }
  return valid;
}

interface AnchorImageQueueProps {
  entries: PendingPhoto[];
  onChange: (entries: PendingPhoto[]) => void;
  disabled?: boolean;
  max?: number;
}

/**
 * Fila de fotos do ponto (F3 — paridade mobile/web): tirar foto (câmera) ou
 * importar (biblioteca, seleção múltipla), preview com badge de ordem,
 * setas ‹ › para reordenar e lixeira. A ordem da fila é a ordem do upload
 * (FormData) — o servidor preserva a sequência no JSONB.
 * Regra de ouro §6: StyleSheet.create puro.
 */
export const AnchorImageQueue: React.FC<AnchorImageQueueProps> = ({
  entries,
  onChange,
  disabled = false,
  max = MAX_PHOTOS,
}) => {
  const remaining = max - entries.length;

  const takePhoto = useCallback(async () => {
    if (remaining <= 0 || disabled) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Câmera', 'Permita o acesso à câmera para tirar fotos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled) return;
    const photos = toPendingPhotos(result.assets);
    onChange([...entries, ...photos.slice(0, remaining)]);
  }, [entries, remaining, disabled, onChange]);

  const importPhotos = useCallback(async () => {
    if (remaining <= 0 || disabled) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Biblioteca', 'Permita o acesso às fotos para importar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (result.canceled) return;
    const photos = toPendingPhotos(result.assets);
    onChange([...entries, ...photos.slice(0, remaining)]);
  }, [entries, remaining, disabled, onChange]);

  const move = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= entries.length || from === to) return;
      const next = [...entries];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      onChange(next);
    },
    [entries, onChange],
  );

  const removeAt = useCallback(
    (index: number) => {
      onChange(entries.filter((_, i) => i !== index));
    },
    [entries, onChange],
  );

  return (
    <View>
      <View style={styles.actionRow}>
        <TouchableOpacity
          onPress={takePhoto}
          disabled={disabled || remaining <= 0}
          style={[styles.actionBtn, (disabled || remaining <= 0) && styles.actionDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Tirar foto com a câmera">
          <Ionicons name="camera-outline" size={18} color="#67E8F9" />
          <Text style={styles.actionText}>Tirar foto</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={importPhotos}
          disabled={disabled || remaining <= 0}
          style={[styles.actionBtn, (disabled || remaining <= 0) && styles.actionDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Importar fotos da biblioteca">
          <Ionicons name="images-outline" size={18} color="#A5B4FC" />
          <Text style={styles.actionText}>Importar</Text>
        </TouchableOpacity>
        <Text style={styles.counter}>
          {entries.length}/{max}
        </Text>
      </View>

      {entries.length > 0 ? (
        <View style={styles.grid}>
          {entries.map((entry, index) => (
            <View key={entry.id} style={styles.photoCard}>
              <Image source={{ uri: entry.uri }} style={styles.thumb} />
              <View style={styles.orderBadge}>
                <Text style={styles.orderText}>{index + 1}</Text>
              </View>
              <TouchableOpacity
                onPress={() => removeAt(index)}
                disabled={disabled}
                style={styles.trashBtn}
                accessibilityRole="button"
                accessibilityLabel={`Remover ${entry.fileName}`}>
                <Ionicons name="trash-outline" size={14} color="#FDA4AF" />
              </TouchableOpacity>
              <View style={styles.controls}>
                <TouchableOpacity
                  onPress={() => move(index, index - 1)}
                  disabled={disabled || index === 0}
                  style={[styles.arrowBtn, (disabled || index === 0) && styles.arrowDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel={`Mover ${entry.fileName} para trás`}>
                  <Ionicons name="chevron-back" size={15} color="#CBD5E1" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => move(index, index + 1)}
                  disabled={disabled || index === entries.length - 1}
                  style={[
                    styles.arrowBtn,
                    (disabled || index === entries.length - 1) && styles.arrowDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Mover ${entry.fileName} para frente`}>
                  <Ionicons name="chevron-forward" size={15} color="#CBD5E1" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>
          Fotos do ponto (opcional) — aparecem no detalhe e no mapa 2D.
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 40,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
  },
  actionDisabled: {
    opacity: 0.45,
  },
  actionText: {
    color: '#E2E8F0',
    fontSize: 12.5,
    fontWeight: '600',
  },
  counter: {
    color: '#64748B',
    fontSize: 12,
    marginLeft: 'auto',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoCard: {
    width: 96,
    gap: 4,
  },
  thumb: {
    width: 96,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#1E293B',
  },
  orderBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  orderText: {
    color: '#E2E8F0',
    fontSize: 10,
    fontWeight: '700',
  },
  trashBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    padding: 5,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  arrowBtn: {
    padding: 4,
    minHeight: 32,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: {
    opacity: 0.25,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 11.5,
  },
});
