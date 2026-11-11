import React from 'react';
import {
  ActivityIndicator,
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
import type { PointHostingPhase } from '../hooks/use-point-hosting';
import type { Category } from 'shared';

interface PlaceAnchorModalProps {
  visible: boolean;
  isSaving: boolean;
  /** Estado do hosting por PONTO (use-point-hosting). */
  hosting: PointHostingPhase;
  /** Recomeça o fluxo (volta a 'placing'). */
  onRetry: () => void;
  anchorName: string;
  onAnchorNameChange: (value: string) => void;
  anchorDescription: string;
  onAnchorDescriptionChange: (value: string) => void;
  /** Categorias disponíveis (com modelo 3D vinculado, se houver). */
  categories: Category[];
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  /** Salva o pin (só com phase 'hosted'). */
  onCreate: () => void;
  onClose: () => void;
}

/**
 * Pílula da fase ativa (placing/guiding/hosting) — renderizada FORA do Modal
 * (⚠️ lição 2026-11-10: em Android o Modal RN é uma JANELA nativa que engole
 * todos os toques, mesmo com pointerEvents box-none — o tap de posicionar
 * nunca chegaria à câmera. Como overlay comum da árvore do container, os
 * toques atravessam e os insets são os da tela real).
 */
export const PlaceAnchorPill: React.FC<{
  hosting: PointHostingPhase;
  guideProgress: number;
  onClose: () => void;
}> = ({ hosting, guideProgress, onClose }) => {
  if (
    hosting.phase !== 'placing' &&
    hosting.phase !== 'guiding' &&
    hosting.phase !== 'hosting'
  ) {
    return null;
  }
  return (
    <View style={styles.pillCard} pointerEvents="box-none">
      {hosting.phase === 'placing' && (
        <>
          <Ionicons name="scan-outline" size={18} color="#93C5FD" />
          <Text style={styles.pillText}>
            Mire o ponto na retícula e TOQUE na imagem
          </Text>
        </>
      )}
      {hosting.phase === 'guiding' && (
        <>
          <Ionicons name="walk" size={18} color="#FCD34D" />
          <Text style={styles.pillText}>
            Mova o celular ao redor do ponto ({Math.ceil((1 - guideProgress) * 10)}s)
          </Text>
          <View style={styles.guideBar}>
            <View style={[styles.guideBarFill, { width: `${guideProgress * 100}%` }]} />
          </View>
        </>
      )}
      {hosting.phase === 'hosting' && (
        <>
          <ActivityIndicator size="small" color="#60A5FA" />
          <Text style={styles.pillText}>Hospedando âncora no ponto…</Text>
        </>
      )}
      <TouchableOpacity
        onPress={hosting.phase === 'hosting' ? undefined : onClose}
        style={styles.pillClose}
        accessibilityRole="button"
        accessibilityLabel="Cancelar">
        <Ionicons
          name="close"
          size={18}
          color={hosting.phase === 'hosting' ? '#334155' : '#64748B'}
        />
      </TouchableOpacity>
    </View>
  );
};

/**
 * Modal de criação — âncora NO PONTO (guia oficial Cloud Anchors).
 * ① POSICIONAR: o modal FECHA — a pílula (PlaceAnchorPill, fora do Modal)
 *    guia; o usuário mira o ponto e TOCA na imagem — âncora NO ponto.
 * ② GUIA (~8s): "mova o celular ao redor do ponto" (best practice da doc).
 * ③ HOSTING: hostCloudAnchor(30d) — GPS taggeado automaticamente.
 * ④ CONFIRMAR (modal reabre): nome → Salvar. Pin visível na hora.
 */
export const PlaceAnchorModal: React.FC<PlaceAnchorModalProps> = ({
  visible,
  isSaving,
  hosting,
  onRetry,
  anchorName,
  onAnchorNameChange,
  anchorDescription,
  onAnchorDescriptionChange,
  categories,
  selectedCategoryId,
  onSelectCategory,
  onCreate,
  onClose,
}) => {
  const hosted = hosting.phase === 'hosted';
  const saveBlocked = isSaving || !hosted;
  const insets = useSafeAreaInsets();

  const busy = hosting.phase === 'hosting' || isSaving;
  const requestClose = () => {
    if (busy) return;
    onClose();
  };

  // O Modal só existe nas fases EXPANDIDAS (idle/failed/hosted). Nas fases
  // ativas (placing/guiding/hosting) o container renderiza a PlaceAnchorPill
  // FORA do Modal — janela modal do Android engole toques (lição acima).
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={requestClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.modalBackdrop, { paddingTop: insets.top + 12 }]}>
          <ScrollView
            contentContainerStyle={[
              styles.modalScrollContent,
              { paddingBottom: Math.max(insets.bottom + 20, 36) },
            ]}
            keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.headerRow}>
                <Text style={styles.modalTitle}>Marcar Ponto no Espaço</Text>
                {(hosting.phase === 'idle' || hosted) && (
                  <TouchableOpacity
                    onPress={requestClose}
                    disabled={isSaving}
                    style={styles.closeBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Fechar">
                    <Ionicons name="close" size={20} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              {hosting.phase === 'idle' && (
                <>
                  <Text style={styles.modalSubtitle}>
                    O ponto nasce de uma âncora visual NO LOCAL exato onde você
                    tocar — precisão centimétrica, independente de GPS.
                  </Text>
                  <View style={styles.guideBox}>
                    <View style={styles.guideRow}>
                      <Ionicons name="locate" size={15} color="#FCD34D" />
                      <Text style={styles.guideText}>
                        Aponte a câmera para o ponto (ex: geladeira) e TOQUE na tela
                      </Text>
                    </View>
                    <View style={styles.guideRow}>
                      <Ionicons name="sunny-outline" size={15} color="#FCD34D" />
                      <Text style={styles.guideText}>
                        Local com textura e boa luz funciona melhor
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={onRetry}
                    style={styles.primaryBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Iniciar posicionamento">
                    <Ionicons name="scan-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.primaryBtnText}>Posicionar Ponto</Text>
                  </TouchableOpacity>
                </>
              )}

              {hosting.phase === 'failed' && (
                <>
                  <View style={styles.errorBox}>
                    <Ionicons name="warning" size={16} color="#FCA5A5" />
                    <Text style={styles.errorText}>
                      {hosting.error.includes('DatasetProcessingFailed')
                        ? 'O entorno do ponto ficou com poucas features visuais. Tente de novo: posicione, e durante a guia MOVA o celular ao redor do ponto (mude o ângulo da câmera).'
                        : hosting.error.includes('NotAuthorized')
                          ? 'Chave da API não autorizada — verifique as credenciais ReactVision.'
                          : hosting.error}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={onRetry}
                    style={styles.primaryBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Tentar novamente">
                    <Ionicons name="refresh" size={18} color="#FFFFFF" />
                    <Text style={styles.primaryBtnText}>Tentar Novamente</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={requestClose}
                    style={styles.cancelScanBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Fechar">
                    <Text style={styles.cancelScanText}>Fechar</Text>
                  </TouchableOpacity>
                </>
              )}

              {hosted && (
                <>
                  <View style={styles.hostedBox}>
                    <Ionicons name="checkmark-circle" size={16} color="#34D399" />
                    <Text style={styles.hostedText}>
                      Âncora hospedada NO ponto (TTL 30 dias, GPS anexado) — precisão centimétrica
                    </Text>
                  </View>
                  <Text style={styles.inputLabel}>Nome do ponto *</Text>
                  <TextInput
                    style={styles.textInput}
                    value={anchorName}
                    onChangeText={onAnchorNameChange}
                    placeholder="Ex: Geladeira"
                    placeholderTextColor="#64748B"
                    maxLength={80}
                    accessibilityLabel="Nome do ponto"
                  />
                  <Text style={styles.inputLabel}>Descrição (opcional)</Text>
                  <TextInput
                    style={[styles.textInput, styles.textArea]}
                    value={anchorDescription}
                    onChangeText={onAnchorDescriptionChange}
                    placeholder="Detalhes, referências…"
                    placeholderTextColor="#64748B"
                    multiline
                    maxLength={280}
                    accessibilityLabel="Descrição do ponto"
                  />
                  <Text style={styles.inputLabel}>Categoria (opcional)</Text>
                  <Text style={styles.helperText}>
                    A categoria define o modelo 3D que marca o ponto no AR.
                  </Text>
                  <View style={styles.categoryWrap}>
                    <TouchableOpacity
                      onPress={() => onSelectCategory(null)}
                      style={[
                        styles.categoryChip,
                        !selectedCategoryId && styles.categoryChipActive,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: !selectedCategoryId }}
                      accessibilityLabel="Sem categoria">
                      <Text
                        style={[
                          styles.categoryChipText,
                          !selectedCategoryId && styles.categoryChipTextActive,
                        ]}>
                        Sem categoria
                      </Text>
                    </TouchableOpacity>
                    {categories.map((category) => (
                      <TouchableOpacity
                        key={category.id}
                        onPress={() => onSelectCategory(category.id)}
                        style={[
                          styles.categoryChip,
                          selectedCategoryId === category.id &&
                            styles.categoryChipActive,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: selectedCategoryId === category.id,
                        }}
                        accessibilityLabel={category.label}>
                        <Text
                          style={[
                            styles.categoryChipText,
                            selectedCategoryId === category.id &&
                              styles.categoryChipTextActive,
                          ]}>
                          {category.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.modalActionsRow}>
                    <TouchableOpacity onPress={requestClose} disabled={isSaving} style={styles.cancelButton}>
                      <Text style={styles.cancelButtonText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={onCreate}
                      disabled={saveBlocked}
                      style={[styles.saveButton, saveBlocked && styles.saveButtonBlocked]}
                      accessibilityRole="button"
                      accessibilityLabel="Salvar ponto">
                      {isSaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                      <Text style={styles.saveButtonText}>
                        {isSaving ? 'Salvando...' : 'Salvar Ponto'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Regra de ouro §6: componente de tela AR usa ESTRITAMENTE StyleSheet.create.
const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.55)',
    justifyContent: 'flex-end',
  },
  pillCard: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    backgroundColor: 'rgba(11, 18, 32, 0.94)',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 20,
  },
  pillText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  pillClose: {
    padding: 4,
  },
  guideBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#1E293B',
    borderRadius: 2,
    overflow: 'hidden',
  },
  guideBarFill: {
    height: '100%',
    backgroundColor: '#60A5FA',
  },
  modalScrollContent: {
    paddingBottom: 24,
  },
  modalCard: {
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
    marginBottom: 4,
  },
  modalTitle: {
    color: '#F1F5F9',
    fontSize: 17,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  modalSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
    marginTop: 2,
  },
  guideBox: {
    backgroundColor: 'rgba(69, 26, 3, 0.55)',
    borderWidth: 1,
    borderColor: '#7C2D12',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    gap: 8,
  },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  guideText: {
    color: '#FDE68A',
    fontSize: 12.5,
    flex: 1,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(69, 10, 10, 0.55)',
    borderWidth: 1,
    borderColor: '#7F1D1D',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 12.5,
    flex: 1,
  },
  hostedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(6, 78, 59, 0.45)',
    borderWidth: 1,
    borderColor: '#065F46',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  hostedText: {
    color: '#6EE7B7',
    fontSize: 12.5,
    flex: 1,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 13,
    marginBottom: 8,
    minHeight: 48,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelScanBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    minHeight: 44,
  },
  cancelScanText: {
    color: '#94A3B8',
    fontSize: 13.5,
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
  helperText: {
    color: '#94A3B8',
    fontSize: 11.5,
    marginBottom: 8,
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
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    marginBottom: 8,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingVertical: 12,
    minHeight: 46,
  },
  cancelButtonText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
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
  saveButtonBlocked: {
    opacity: 0.45,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
