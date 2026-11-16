import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AdminModelsPage } from 'shared';

type CarouselModel = AdminModelsPage['items'][number];

interface ModelCarouselProps {
  /** Biblioteca de modelos (GET /admin/models — admin-only). */
  models: CarouselModel[];
  /** Modelo override selecionado (null = padrão da categoria). */
  selectedModelId: string | null;
  /** Modelo da categoria selecionada (pré-selecionado quando sem override). */
  categoryModelId?: string | null;
  onSelect: (modelId: string | null) => void;
  /**
   * PREVIEW SHOWCASE (2026-11-16): botão "olho" em cada card — o container
   * posiciona o modelo 2m À FRENTE da câmera (renderizado pela cena atrás
   * do sheet). Preview real, zero dependências nativas.
   */
  onPreview?: (model: CarouselModel) => void;
}

/** Dimensões legíveis a partir do bounding box (ex.: "0.6 × 0.4 × 0.3 m"). */
function dims(model: CarouselModel): string {
  const bb = model.boundingBox;
  if (!bb) return 'dimensões n/d';
  const size = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]].map(
    (v) => (v >= 10 ? v.toFixed(0) : v.toFixed(1)),
  );
  return `${size[0]} × ${size[1]} × ${size[2]} m`;
}

/**
 * Carousel horizontal de modelos 3D (F3 — escolha por ponto). O preview
 * honesto no mobile é o PRÓPRIO pin no AR: trocar a seleção atualiza o pin
 * vivo atrás do sheet (cards carregam nome/formato/dimensões do bbox).
 * Regra de ouro §6: StyleSheet.create puro (componente de tela AR).
 */
export const ModelCarousel: React.FC<ModelCarouselProps> = ({
  models,
  selectedModelId,
  categoryModelId,
  onSelect,
  onPreview,
}) => {
  if (models.length === 0) return null;
  const usingCategoryDefault = selectedModelId === null;

  const renderItem = ({ item }: { item: CarouselModel }) => {
    const selected = selectedModelId === item.id;
    const isCategoryModel = categoryModelId === item.id;
    return (
      <TouchableOpacity
        onPress={() => onSelect(selected ? null : item.id)}
        style={[styles.card, selected && styles.cardSelected]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`Modelo ${item.name}${isCategoryModel ? ' (padrão da categoria)' : ''}`}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          {selected ? (
            <Ionicons name="checkmark-circle" size={18} color="#60A5FA" />
          ) : null}
        </View>
        <Text style={styles.cardMeta}>
          {item.format.toUpperCase()} · {dims(item)}
        </Text>
        {onPreview ? (
          <TouchableOpacity
            onPress={() => onPreview(item)}
            style={styles.previewBtn}
            accessibilityRole="button"
            accessibilityLabel={`Pré-visualizar ${item.name} na câmera`}>
            <Ionicons name="eye-outline" size={14} color="#67E8F9" />
            <Text style={styles.previewBtnText}>ver na câmera</Text>
          </TouchableOpacity>
        ) : null}
        {isCategoryModel ? (
          <View style={styles.tagRow}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>padrão da categoria</Text>
            </View>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View>
      <FlatList
        data={models}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <TouchableOpacity
            onPress={() => onSelect(null)}
            style={[styles.card, styles.cardDefault, usingCategoryDefault && styles.cardSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected: usingCategoryDefault }}
            accessibilityLabel="Usar o modelo padrão da categoria">
            <View style={styles.cardHeader}>
              <Text style={styles.cardName} numberOfLines={1}>
                Padrão da categoria
              </Text>
              {usingCategoryDefault ? (
                <Ionicons name="checkmark-circle" size={18} color="#60A5FA" />
              ) : null}
            </View>
            <Text style={styles.cardMeta} numberOfLines={2}>
              {categoryModelId
                ? 'Herdar o modelo vinculado à categoria'
                : 'Sem modelo — marcador padrão (caixa)'}
            </Text>
          </TouchableOpacity>
        }
      />
      <Text style={styles.helper}>
        O ponto atualiza no AR em tempo real ao trocar de modelo.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  listContent: {
    gap: 10,
    paddingRight: 12,
    paddingVertical: 2,
  },
  card: {
    width: 168,
    minHeight: 88,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    padding: 12,
    justifyContent: 'center',
    gap: 6,
  },
  cardSelected: {
    borderColor: '#60A5FA',
    backgroundColor: 'rgba(29, 78, 216, 0.35)',
  },
  cardDefault: {
    borderStyle: 'dashed',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  cardName: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  cardMeta: {
    color: '#94A3B8',
    fontSize: 11,
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#155E75',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 28,
    alignSelf: 'flex-start',
  },
  previewBtnText: {
    color: '#67E8F9',
    fontSize: 10.5,
    fontWeight: '600',
  },
  tagRow: {
    flexDirection: 'row',
  },
  tag: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: {
    color: '#7DD3FC',
    fontSize: 9.5,
    fontWeight: '600',
  },
  helper: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 6,
  },
});
