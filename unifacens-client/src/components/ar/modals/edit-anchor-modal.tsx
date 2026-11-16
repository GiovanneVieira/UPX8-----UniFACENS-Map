import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import type { AdminModelsPage, Anchor, Category } from 'shared';
import { adminApi } from '@/features/admin/services/admin-api';
import { uploadAnchorImages, deleteAnchorImage } from '@/services/api';
import { anchorKeys } from '@/features/anchors/queries/use-anchors-query';
import { ModelCarousel } from './model-carousel';
import { AnchorImageQueue, type PendingPhoto } from './anchor-image-queue';

interface EditAnchorModalProps {
  visible: boolean;
  anchor: Anchor | null;
  categories: Category[];
  models: AdminModelsPage['items'];
  /**
   * PREVIEW VIVO (lição de device 2026-11-16): dispara a cada troca de
   * modelo no carousel — o container sobrepõe o modelo do PIN REAL na cena
   * AR atrás do sheet (o preview mais honesto é o próprio modelo no lugar).
   * null = "Padrão da categoria" (limpa o override do ponto).
   */
  onModelPreview?: (modelId: string | null) => void;
  /** Showcase: "ver na câmera" posiciona o modelo à frente da câmera. */
  onModelShowcase?: (model: { url: string; format: string; boundingBox: AdminModelsPage['items'][number]['boundingBox'] }) => void;
  onClose: () => void;
}

/**
 * Edição de ponto (F3, admin): nome, descrição, categoria, modelo override e
 * fotos — MESMO contrato do editor web (PATCH /admin/points/:id). Reusa os
 * componentes do modal de criação (ModelCarousel + AnchorImageQueue).
 * Regra de ouro §6: StyleSheet.create puro.
 */
export const EditAnchorModal: React.FC<EditAnchorModalProps> = ({
  visible,
  anchor,
  categories,
  models,
  onModelPreview,
  onModelShowcase,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // (Re)carrega o formulário a cada abertura / troca de ponto.
  useEffect(() => {
    if (!visible || !anchor) return;
    setName(anchor.name);
    setDescription(anchor.description ?? '');
    setCategoryId(anchor.category?.id ?? null);
    setModelId(anchor.modelId ?? null);
    setImages(anchor.images ?? []);
    setPhotos([]);
  }, [visible, anchor]);

  if (!visible || !anchor) return null;

  /** Troca de modelo: atualiza o form E o pin real na cena (preview vivo). */
  const handleSelectModel = (id: string | null) => {
    setModelId(id);
    onModelPreview?.(id);
  };

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Aviso', 'Informe o nome do ponto.');
      return;
    }
    try {
      setIsSaving(true);
      // 1. Conteúdo (mesmo DTO do editor web) + modelo override (F3).
      await adminApi.updatePoint(anchor.id, {
        name: name.trim(),
        description: description.trim() || null,
        categoryId,
        modelId,
      });
      // 2. Novas fotos (na ordem da fila) — falha não-bloqueante.
      if (photos.length > 0) {
        try {
          const result = await uploadAnchorImages(anchor.id, photos);
          setImages(result.images);
        } catch (err) {
          console.warn('[ARPoint] upload de fotos na edição falhou:', err);
          Alert.alert(
            'Fotos',
            'As alterações foram salvas, mas algumas fotos não subiram. Tente de novo.',
          );
        }
      }
      await queryClient.invalidateQueries({ queryKey: anchorKeys.all });
      Alert.alert('✓ Ponto atualizado', `"${name.trim()}" foi salvo.`);
      onClose();
    } catch (err) {
      Alert.alert(
        'Erro ao salvar',
        err instanceof Error ? err.message : 'Não foi possível salvar o ponto.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const removeImage = async (url: string) => {
    try {
      setIsSaving(true);
      const result = await deleteAnchorImage(anchor.id, url);
      setImages(result.images);
      await queryClient.invalidateQueries({ queryKey: anchorKeys.all });
    } catch (err) {
      Alert.alert(
        'Erro',
        err instanceof Error ? err.message : 'Não foi possível remover a imagem.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const confirmRemoveImage = (url: string) => {
    Alert.alert('Remover imagem', 'Excluir esta foto do ponto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => void removeImage(url) },
    ]);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.backdrop, { paddingTop: insets.top + 12 }]}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom + 20, 36) },
          ]}
          keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Editar ponto</Text>
              <TouchableOpacity
                onPress={onClose}
                disabled={isSaving}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Fechar edição">
                <Ionicons name="close" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Nome do ponto *</Text>
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="Ex: Geladeira"
              placeholderTextColor="#64748B"
              maxLength={80}
              accessibilityLabel="Nome do ponto"
            />
            <Text style={styles.inputLabel}>Descrição (opcional)</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Detalhes, referências…"
              placeholderTextColor="#64748B"
              multiline
              maxLength={280}
              accessibilityLabel="Descrição do ponto"
            />

            <Text style={styles.inputLabel}>Categoria (opcional)</Text>
            <View style={styles.categoryWrap}>
              <TouchableOpacity
                onPress={() => setCategoryId(null)}
                style={[styles.categoryChip, !categoryId && styles.categoryChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: !categoryId }}
                accessibilityLabel="Sem categoria">
                <Text
                  style={[
                    styles.categoryChipText,
                    !categoryId && styles.categoryChipTextActive,
                  ]}>
                  Sem categoria
                </Text>
              </TouchableOpacity>
              {categories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  onPress={() => setCategoryId(category.id)}
                  style={[
                    styles.categoryChip,
                    categoryId === category.id && styles.categoryChipActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: categoryId === category.id }}
                  accessibilityLabel={category.label}>
                  <Text
                    style={[
                      styles.categoryChipText,
                      categoryId === category.id && styles.categoryChipTextActive,
                    ]}>
                    {category.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {models.length > 0 ? (
              <>
                <Text style={styles.inputLabel}>Modelo 3D do ponto</Text>
                <ModelCarousel
                  models={models}
                  selectedModelId={modelId}
                  categoryModelId={
                    categories.find((c) => c.id === categoryId)?.modelId ?? null
                  }
                  onSelect={handleSelectModel}
                  onPreview={onModelShowcase}
                />
              </>
            ) : null}

            <Text style={styles.inputLabel}>Fotos do ponto</Text>
            {images.length > 0 ? (
              <View style={styles.gallery}>
                {images.map((url) => (
                  <View key={url} style={styles.galleryCard}>
                    <Image source={{ uri: url }} style={styles.galleryThumb} />
                    <TouchableOpacity
                      onPress={() => confirmRemoveImage(url)}
                      disabled={isSaving}
                      style={styles.galleryTrash}
                      accessibilityRole="button"
                      accessibilityLabel="Remover foto do ponto">
                      <Ionicons name="trash-outline" size={14} color="#FDA4AF" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}
            <AnchorImageQueue
              entries={photos}
              onChange={setPhotos}
              disabled={isSaving}
              max={Math.max(0, 5 - images.length)}
            />

            <View style={styles.actionsRow}>
              <TouchableOpacity onPress={onClose} disabled={isSaving} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void save()}
                disabled={isSaving}
                style={[styles.saveBtn, isSaving && styles.saveBtnBlocked]}
                accessibilityRole="button"
                accessibilityLabel="Salvar alterações">
                {isSaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                <Text style={styles.saveText}>{isSaving ? 'Salvando...' : 'Salvar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.55)',
    justifyContent: 'flex-end',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#0B1220',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    color: '#F1F5F9',
    fontSize: 17,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  inputLabel: {
    color: '#CBD5E1',
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 4,
  },
  textInput: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    color: '#F1F5F9',
    fontSize: 14.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  textArea: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  categoryChip: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
  },
  categoryChipActive: {
    borderColor: '#60A5FA',
    backgroundColor: '#1D4ED8',
  },
  categoryChipText: {
    color: '#CBD5E1',
    fontSize: 12.5,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  gallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  galleryCard: {
    position: 'relative',
  },
  galleryThumb: {
    width: 96,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#1E293B',
  },
  galleryTrash: {
    position: 'absolute',
    top: 4,
    right: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    padding: 5,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingVertical: 12,
    minHeight: 46,
  },
  cancelText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 12,
    minHeight: 46,
  },
  saveBtnBlocked: {
    opacity: 0.45,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
