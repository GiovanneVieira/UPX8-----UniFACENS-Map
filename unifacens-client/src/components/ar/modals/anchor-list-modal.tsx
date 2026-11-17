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
  /** Ações de admin (Editar/Excluir) visíveis apenas para admins. */
  isAdmin: boolean;
  onClose: () => void;
  /** "Ir para": traça a rota AR para o ponto. */
  onNavigate: (anchor: Anchor) => void;
  /** "Detalhes": abre o bottom sheet de metadados do ponto. */
  onDetails: (anchor: Anchor) => void;
  /** "Editar" (admin): abre o modal de edição do ponto. */
  onEdit?: (anchor: Anchor) => void;
  /** "Excluir" (admin): confirma e exclui o ponto. */
  onDelete?: (anchor: Anchor) => void;
}

/**
 * Lista de pontos carregados (F3): "Ir para" + "Detalhes" para todos;
 * "Editar"/"Excluir" apenas para admin. Ações secundárias em segunda linha
 * dentro do card — alvo de toque ≥40dp sem espremer o nome do ponto.
 * Regra de ouro §6: tela AR usa ESTRITAMENTE StyleSheet.create.
 */
export const AnchorListModal: React.FC<AnchorListModalProps> = ({
  visible,
  anchors,
  isAdmin,
  onClose,
  onNavigate,
  onDetails,
  onEdit,
  onDelete,
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
              const hasGeo = !!item.geospatialAnchorId;
              return (
                <View style={styles.row}>
                  <View style={styles.rowTop}>
                    <Ionicons
                      name={isCloud ? 'cloud' : hasGeo ? 'earth' : 'locate'}
                      size={16}
                      color={isCloud ? '#38BDF8' : hasGeo ? '#34D399' : '#A78BFA'}
                    />
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {typeof item.distanceMeters === 'number'
                          ? `${item.distanceMeters < 1000 ? `${item.distanceMeters.toFixed(0)} m` : `${(item.distanceMeters / 1000).toFixed(1)} km`}`
                          : '—'}
                        {isCloud ? ' · âncora visual' : hasGeo ? ' · geoespacial' : ' · GPS'}
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
                  <View style={styles.rowActions}>
                    <TouchableOpacity
                      onPress={() => {
                        onClose();
                        onDetails(item);
                      }}
                      style={styles.secondaryBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Detalhes de ${item.name}`}>
                      <Ionicons name="information-circle-outline" size={16} color="#93C5FD" />
                      <Text style={styles.secondaryBtnText}>Detalhes</Text>
                    </TouchableOpacity>
                    {isAdmin && onEdit ? (
                      <TouchableOpacity
                        onPress={() => {
                          onClose();
                          onEdit(item);
                        }}
                        style={styles.secondaryBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`Editar ${item.name}`}>
                        <Ionicons name="create-outline" size={16} color="#FCD34D" />
                        <Text style={styles.secondaryBtnText}>Editar</Text>
                      </TouchableOpacity>
                    ) : null}
                    {isAdmin && onDelete ? (
                      <TouchableOpacity
                        onPress={() => onDelete(item)}
                        style={[styles.secondaryBtn, styles.deleteBtn]}
                        accessibilityRole="button"
                        accessibilityLabel={`Excluir ${item.name}`}>
                        <Ionicons name="trash-outline" size={16} color="#FDA4AF" />
                        <Text style={styles.deleteBtnText}>Excluir</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
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
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 8,
    padding: 10,
    gap: 8,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
  },
  secondaryBtnText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteBtn: {
    borderColor: '#7F1D1D',
  },
  deleteBtnText: {
    color: '#FDA4AF',
    fontSize: 12,
    fontWeight: '600',
  },
});
