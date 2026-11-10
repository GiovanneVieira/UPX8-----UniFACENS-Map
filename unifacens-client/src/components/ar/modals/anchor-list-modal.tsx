import React from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { isRealCloudAnchorId } from '../hooks/use-cloud-anchors';
import type { Anchor } from 'shared';

interface AnchorListModalProps {
  visible: boolean;
  /** Pins efetivamente carregados (projection.anchors — já com distância). */
  anchors: Anchor[];
  onClose: () => void;
  /** "Ir para": traça a rota AR para o ponto. */
  onNavigate: (anchor: Anchor) => void;
}

/**
 * Lista de pontos carregados com ação "Ir para" (rota AR Live View).
 * Regra de ouro §6: tela AR usa ESTRITAMENTE StyleSheet.create.
 */
export const AnchorListModal: React.FC<AnchorListModalProps> = ({
  visible,
  anchors,
  onClose,
  onNavigate,
}) => {
  const insets = useSafeAreaInsets();

  const sorted = React.useMemo(
    () =>
      [...anchors].sort(
        (a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity),
      ),
    [anchors],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingTop: insets.top + 24 }]}>
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom + 16, 28) },
          ]}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Pontos carregados ({sorted.length})</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Fechar lista">
              <Ionicons name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
            Ordenados pela distância. "Ir para" traça a rota em AR até o ponto.
          </Text>

          <FlatList
            data={sorted}
            keyExtractor={(item) => item.id}
            style={styles.list}
            contentContainerStyle={sorted.length === 0 ? styles.emptyWrap : undefined}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                Nenhum ponto carregado ainda — aguarde o alinhamento/localização.
              </Text>
            }
            renderItem={({ item }) => {
              const isCloud = isRealCloudAnchorId(item.cloudAnchorId);
              const estimated = item.estimated === true;
              return (
                <View style={styles.row}>
                  <Ionicons
                    name={isCloud ? 'cloud' : 'locate'}
                    size={16}
                    color={isCloud ? '#38BDF8' : '#A78BFA'}
                  />
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {typeof item.distanceMeters === 'number'
                        ? `${item.distanceMeters < 1000 ? `${item.distanceMeters.toFixed(0)} m` : `${(item.distanceMeters / 1000).toFixed(1)} km`}`
                        : '—'}
                      {isCloud ? ' · âncora visual' : ' · GPS'}
                      {estimated ? ' · estimado' : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      onClose();
                      onNavigate(item);
                    }}
                    style={styles.goBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Ir para ${item.name}`}>
                    <Ionicons name="navigate" size={15} color="#FFFFFF" />
                    <Text style={styles.goBtnText}>Ir para</Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0B1220',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 16,
    paddingTop: 14,
    maxHeight: '72%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  title: {
    color: '#F1F5F9',
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 12.5,
    marginBottom: 10,
  },
  list: {
    flexGrow: 0,
  },
  emptyWrap: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13.5,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 8,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
  },
  rowMeta: {
    color: '#94A3B8',
    fontSize: 11.5,
  },
  goBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 40,
  },
  goBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
