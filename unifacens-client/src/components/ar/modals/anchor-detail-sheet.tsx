import { useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Anchor } from 'shared';
import { useAuth } from '@/features/auth/hooks/use-auth';

interface AnchorDetailSheetProps {
  visible: boolean;
  anchor: Anchor | null;
  distanceMeters?: number;
  onClose: () => void;
  onNavigate: (anchor: Anchor) => void;
  onDelete?: (anchor: Anchor) => void;
}

/** Dimensões legíveis do bounding box do modelo (ex.: "2 × 2 × 2 m"). */
function modelDims(anchor: Anchor): string | null {
  const bb = (anchor.model ?? anchor.category?.model)?.boundingBox;
  if (!bb) return null;
  const size = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]].map(
    (v) => (v >= 10 ? v.toFixed(0) : v.toFixed(1)),
  );
  return `${size[0]} × ${size[1]} × ${size[2]} m`;
}

/**
 * MODAL DE DETALHES DO PONTO (redesign 2026-11-16, a pedido): modal
 * CENTRALIZADO (não mais drawer/bottom-sheet) com o layout canônico —
 * título → descrição → carrossel de imagens (paging + indicadores) →
 * modelo do anchor → distância/meta → ação "Ir para".
 * Regra de Ouro §6: StyleSheet.create puro (tela AR).
 */
export function AnchorDetailSheet({
  visible,
  anchor,
  distanceMeters,
  onClose,
  onNavigate,
  onDelete,
}: AnchorDetailSheetProps) {
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAuth();
  const [imageIndex, setImageIndex] = useState(0);
  const carouselRef = useRef<FlatList<string> | null>(null);
  // Responsivo (reage a rotação/resize — Dimensions.get é estático):
  // BREAKPOINT 768px — telas largas (web/tablet/paisagem) ganham card
  // maior; a FOTO mantém 4:3 em qualquer largura (antes: height fixa 170
  // com largura variável virava faixa panorâmica em telas largas).
  const { width: windowW } = useWindowDimensions();
  const cardMaxWidth = windowW >= 768 ? 540 : 460;
  const carouselItemW = Math.min(cardMaxWidth, windowW - 48) - 36;

  if (!visible || !anchor) return null;

  const images = anchor.images ?? [];
  const longDescription = anchor.longDescription;
  const model = anchor.model ?? anchor.category?.model ?? null;
  const dims = modelDims(anchor);
  const createdAt = anchor.createdAt ? new Date(anchor.createdAt) : null;
  /**
   * Largura EXPLÍCITA do item do carrossel (bug de device 2026-11-16:
   * Image com '100%' dentro de Pressable auto-width colapsava — nada
   * renderizava). Item = largura do conteúdo do card (paging 1:1).
   */

  const goImage = (index: number) => {
    const clamped = Math.max(0, Math.min(images.length - 1, index));
    setImageIndex(clamped);
    carouselRef.current?.scrollToIndex({ index: clamped, animated: true });
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} onPress={onClose} accessibilityLabel="Fechar detalhes" />
        <View
          style={[
            styles.card,
            { paddingBottom: Math.max(insets.bottom + 16, 24) },
            // Breakpoint: card maior em telas largas (web/tablet).
            { maxWidth: cardMaxWidth },
          ]}>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            {/* Cabeçalho: título + fechar */}
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                {anchor.category ? (
                  <View style={styles.categoryChip}>
                    <Ionicons name="pricetag-outline" size={11} color="#7DD3FC" />
                    <Text style={styles.categoryChipText}>{anchor.category.label}</Text>
                  </View>
                ) : null}
                <Text style={styles.title} numberOfLines={2}>
                  {anchor.name}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar"
                onPress={onClose}
                style={styles.closeBtn}>
                <Ionicons name="close" size={20} color="#94A3B8" />
              </Pressable>
            </View>

            {/* Descrição */}
            {anchor.description || longDescription ? (
              <View style={styles.descBox}>
                {anchor.description ? (
                  <Text style={styles.descText}>{anchor.description}</Text>
                ) : null}
                {longDescription ? (
                  <Text style={styles.longDescText}>{longDescription}</Text>
                ) : null}
              </View>
            ) : null}

            {/* Carrossel de imagens (paging + indicadores) */}
            {images.length > 0 ? (
              <View style={styles.carouselWrap}>
                <FlatList
                  ref={carouselRef}
                  data={images}
                  keyExtractor={(uri) => uri}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  getItemLayout={(_data, index) => ({
                    length: carouselItemW,
                    offset: carouselItemW * index,
                    index,
                  })}
                  onMomentumScrollEnd={(e) => {
                    const idx = Math.round(e.nativeEvent.contentOffset.x / carouselItemW);
                    setImageIndex(idx);
                  }}
                  renderItem={({ item }) => (
                    <Pressable
                      accessibilityLabel={`Imagem ${images.indexOf(item) + 1} de ${images.length}`}
                      onPress={() => goImage(images.indexOf(item) + 1)}>
                      <Image
                        source={{ uri: item }}
                        style={[styles.carouselImage, { width: carouselItemW }]}
                      />
                    </Pressable>
                  )}
                  style={styles.carousel}
                />
                {images.length > 1 ? (
                  <View style={styles.dotsRow}>
                    {images.map((uri, i) => (
                      <Pressable
                        key={uri}
                        accessibilityRole="button"
                        accessibilityLabel={`Ver imagem ${i + 1}`}
                        onPress={() => goImage(i)}
                        style={[styles.dot, i === imageIndex && styles.dotActive]}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Modelo do anchor */}
            <Text style={styles.sectionLabel}>Modelo do anchor</Text>
            <View style={styles.modelCard}>
              <View style={styles.modelIcon}>
                <Ionicons
                  name="cube-outline"
                  size={22}
                  color={model ? '#C4B5FD' : '#64748B'}
                />
              </View>
              <View style={styles.modelInfo}>
                <Text style={styles.modelName}>
                  {model
                    ? `${anchor.category?.label ?? 'Modelo'} · ${model.format.toUpperCase()}`
                    : 'Marcador padrão (cubo)'}
                </Text>
                <Text style={styles.modelMeta}>
                  {model
                    ? `${dims ?? 'dimensões n/d'} · renderizado no AR`
                    : 'Sem modelo 3D vinculado'}
                </Text>
              </View>
            </View>

            {/* Meta: distância atual + precisão + data */}
            <View style={styles.metaWrap}>
              {typeof distanceMeters === 'number' ? (
                <View style={styles.metaChip}>
                  <Ionicons name="navigate" size={12} color="#7DD3FC" />
                  <Text style={styles.metaChipText}>
                    {distanceMeters < 1000
                      ? `${distanceMeters.toFixed(0)} m`
                      : `${(distanceMeters / 1000).toFixed(1)} km`}
                  </Text>
                </View>
              ) : null}
              {anchor.estimated && typeof anchor.estimateAccuracyM === 'number' ? (
                <View style={[styles.metaChip, styles.metaChipWarn]}>
                  <Ionicons name="warning-outline" size={12} color="#FCD34D" />
                  <Text style={[styles.metaChipText, { color: '#FCD34D' }]}>
                    posição estimada ±{Math.round(anchor.estimateAccuracyM)} m
                  </Text>
                </View>
              ) : anchor.geospatialAnchorId ? (
                <View style={styles.metaChip}>
                  <Ionicons name="earth-outline" size={12} color="#6EE7B7" />
                  <Text style={styles.metaChipText}>âncora geoespacial</Text>
                </View>
              ) : null}
              {createdAt && !Number.isNaN(createdAt.getTime()) ? (
                <View style={styles.metaChip}>
                  <Ionicons name="calendar-outline" size={12} color="#94A3B8" />
                  <Text style={styles.metaChipText}>
                    {createdAt.toLocaleDateString('pt-BR')}
                  </Text>
                </View>
              ) : null}
            </View>
          </ScrollView>

          {/* Ações */}
          <View style={styles.actionsColumn}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onNavigate(anchor)}
              style={styles.navigateBtn}>
              <Ionicons name="navigate" size={18} color="#FFFFFF" />
              <Text style={styles.navigateBtnText}>Ir para</Text>
            </Pressable>
            {isAdmin && onDelete ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onDelete(anchor)}
                style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={16} color="#FDA4AF" />
                <Text style={styles.deleteBtnText}>Excluir ponto</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdropTouch: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  /** Modal CENTRALIZADO (redesign 2026-11-16 — era bottom-sheet/drawer).
   *  maxWidth é DINÂMICO (breakpoint 768px — ver inline no componente). */
  card: {
    width: '100%',
    marginHorizontal: 24,
    maxHeight: '82%',
    backgroundColor: '#0F172A',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerLeft: {
    flex: 1,
    gap: 6,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  categoryChipText: {
    color: '#7DD3FC',
    fontSize: 11,
    fontWeight: '600',
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  descBox: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 13,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  descText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#CBD5E1',
  },
  longDescText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#94A3B8',
  },
  carouselWrap: {
    marginBottom: 12,
  },
  carousel: {
    flexGrow: 0,
  },
  carouselImage: {
    // 4:3 em qualquer largura — a foto nunca vira faixa panorâmica
    // (a altura acompanha a largura do item em cada breakpoint).
    aspectRatio: 4 / 3,
    borderRadius: 14,
    backgroundColor: '#1E293B',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#334155',
  },
  dotActive: {
    backgroundColor: '#38BDF8',
    width: 18,
  },
  sectionLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  modelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  modelIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modelInfo: {
    flex: 1,
    gap: 2,
  },
  modelName: {
    color: '#E2E8F0',
    fontSize: 13.5,
    fontWeight: '700',
  },
  modelMeta: {
    color: '#94A3B8',
    fontSize: 11.5,
  },
  metaWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  metaChipWarn: {
    borderColor: '#B45309',
  },
  metaChipText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
  },
  actionsColumn: {
    gap: 8,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 12,
  },
  navigateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    backgroundColor: '#2563EB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#60A5FA',
  },
  navigateBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#7F1D1D',
  },
  deleteBtnText: {
    color: '#FDA4AF',
    fontSize: 14,
    fontWeight: '700',
  },
});
