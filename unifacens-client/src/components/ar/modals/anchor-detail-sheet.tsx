import { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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

/**
 * Bottom sheet de detalhes de um ponto AR (C1/C4): galeria de imagens,
 * descrição longa, distância e ações "Ir para" / "Excluir" (admin).
 * StyleSheet puro — Regra de Ouro do AGENTS.MD §6.
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

  if (!visible || !anchor) return null;

  const images = (anchor as Anchor & { images?: string[] }).images ?? [];
  const longDescription = (anchor as Anchor & { longDescription?: string | null }).longDescription;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} onPress={onClose} accessibilityLabel="Fechar detalhes" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled">
            {/* Header: nome + fechar */}
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <Text style={styles.title} numberOfLines={2}>{anchor.name}</Text>
                {typeof distanceMeters === 'number' ? (
                  <Text style={styles.distance}>📍 {Math.round(distanceMeters)} m</Text>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar"
                onPress={onClose}
                style={styles.closeBtn}>
                <Ionicons name="close" size={20} color="#94A3B8" />
              </Pressable>
            </View>

            {/* Galeria de imagens (se houver) */}
            {images.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.galleryContent}
                style={styles.gallery}>
                {images.map((uri, i) => (
                  <Pressable key={uri} onPress={() => setImageIndex(i)}>
                    <Image
                      source={{ uri }}
                      style={[
                        styles.thumb,
                        i === imageIndex ? styles.thumbActive : null,
                      ]}
                    />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

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

            {/* Coordenadas */}
            {anchor.latitude != null && anchor.longitude != null ? (
              <Text style={styles.coords}>
                GPS: [{anchor.latitude.toFixed(6)}, {anchor.longitude.toFixed(6)}]
              </Text>
            ) : null}

            {/* Ações */}
            <View style={styles.actionsRow}>
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
                  <Ionicons name="trash-outline" size={18} color="#FDA4AF" />
                  <Text style={styles.deleteBtnText}>Excluir</Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 12,
    maxHeight: '75%',
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  distance: {
    fontSize: 14,
    fontWeight: '600',
    color: '#38BDF8',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gallery: {
    marginBottom: 12,
  },
  galleryContent: {
    gap: 8,
    paddingRight: 8,
  },
  thumb: {
    width: 100,
    height: 100,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbActive: {
    borderColor: '#38BDF8',
  },
  descBox: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  descText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CBD5E1',
  },
  longDescText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#94A3B8',
  },
  coords: {
    fontSize: 11,
    color: '#64748B',
    fontFamily: 'monospace',
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  navigateBtn: {
    flex: 1.5,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#7F1D1D',
  },
  deleteBtnText: {
    color: '#FDA4AF',
    fontSize: 15,
    fontWeight: '700',
  },
});
