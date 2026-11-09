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
import { Ionicons } from '@expo/vector-icons';

interface PlaceAnchorModalProps {
  visible: boolean;
  isSaving: boolean;
  /** Rótulo da origem ativa (marco calibrado ou GPS). */
  originLabel: string;
  /** Heading verdadeiro em graus. */
  heading: number;
  /** Acurácia horizontal da pose (m) — null = indisponível. */
  accuracyMeters: number | null;
  /** Limite de acurácia para habilitar o salvar (mesma const do container). */
  maxAccuracyMeters: number;
  pendingDistance: number;
  onAdjustDistance: (delta: number) => void;
  /** Define distância ABSOLUTA da mira (input customizado, m). */
  onSetDistance: (value: number) => void;
  /** Range permitido de distância (m) — hint do input customizado. */
  minDistanceMeters: number;
  maxDistanceMeters: number;
  /** Ativa/desativa o modo preview (olho) — o modal minimiza. */
  previewMode: boolean;
  onTogglePreview: () => void;
  anchorName: string;
  onAnchorNameChange: (value: string) => void;
  anchorDescription: string;
  onAnchorDescriptionChange: (value: string) => void;
  onCreate: () => void;
  onClose: () => void;
}

/** Passos rápidos: finos para ajuste milimétrico, largos para alcance grande.
 * Duas fileiras de 3 (negativos / positivos) — 6 numa fileira só quebra o
 * label "-10cm"/"+10cm" em duas linhas (validado via a11y + screenshot). */
const DISTANCE_STEP_ROWS: Array<Array<{ label: string; delta: number; tone: 'neg' | 'pos' }>> = [
  [
    { label: '-1m', delta: -1, tone: 'neg' },
    { label: '-0.5m', delta: -0.5, tone: 'neg' },
    { label: '-10cm', delta: -0.1, tone: 'neg' },
  ],
  [
    { label: '+10cm', delta: 0.1, tone: 'pos' },
    { label: '+0.5m', delta: 0.5, tone: 'pos' },
    { label: '+1m', delta: 1, tone: 'pos' },
  ],
];

/**
 * Modal de cadastro de ponto geodésico com micro-ajuste de profundidade
 * da mira. Envolvido em KeyboardAvoidingView + ScrollView conforme
 * diretriz de acessibilidade do AGENTS.MD §10.5.
 */
export const PlaceAnchorModal: React.FC<PlaceAnchorModalProps> = ({
  visible,
  isSaving,
  originLabel,
  heading,
  accuracyMeters,
  maxAccuracyMeters,
  pendingDistance,
  onAdjustDistance,
  onSetDistance,
  minDistanceMeters,
  maxDistanceMeters,
  previewMode,
  onTogglePreview,
  anchorName,
  onAnchorNameChange,
  anchorDescription,
  onAnchorDescriptionChange,
  onCreate,
  onClose,
}) => {
  const [customDistance, setCustomDistance] = React.useState('');

  // Sincroniza o input customizado com a distância atual ao abrir o modal.
  React.useEffect(() => {
    if (visible) setCustomDistance(pendingDistance.toFixed(2));
  }, [visible, pendingDistance]);

  const commitCustomDistance = () => {
    const parsed = parseFloat(customDistance.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) {
      onSetDistance(parsed);
    } else {
      setCustomDistance(pendingDistance.toFixed(2));
    }
  };
  // Gate de precisão (P3): verde ≤5m, âmbar ≤limite, vermelho > limite.
  // null = SEM leitura → botão bloqueado ("Aguardando GPS…") — alinhado ao
  // gate do handleCreate (antes liberava a UI e barrava só ao tocar Salvar).
  const accuracyOk = accuracyMeters !== null && accuracyMeters <= maxAccuracyMeters;
  const accuracyColor =
    accuracyMeters === null ? '#94A3B8' : accuracyMeters <= 5 ? '#34D399' : accuracyOk ? '#FBBF24' : '#EF4444';
  const accuracyLabel =
    accuracyMeters === null
      ? 'aguardando GPS…'
      : `±${accuracyMeters.toFixed(1)}m${accuracyOk ? '' : ' — aguarde melhorar'}`;
  const saveBlocked = isSaving || !accuracyOk;
  return (
    <Modal
      visible={visible && !previewMode}
      transparent
      animationType="fade"
      onRequestClose={() => !isSaving && onClose()}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalBackdrop}>
        <ScrollView
          contentContainerStyle={styles.modalScrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.modalCard}>
          <View className="flex-row items-center justify-between mb-1">
            <Text style={styles.modalTitle}>Marcar Ponto no Espaço</Text>
            <TouchableOpacity
              onPress={onTogglePreview}
              disabled={isSaving}
              style={styles.previewToggleBtn}
              accessibilityRole="button"
              accessibilityLabel="Ver preview do ponto em AR"
            >
              <Ionicons name="eye" size={20} color="#FCD34D" />
            </TouchableOpacity>
          </View>
            <Text style={styles.modalSubtitle}>
              O ponto será registrado nas coordenadas geográficas apontadas pela mira.
            </Text>

            <View style={styles.geoInfoBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="location-outline" size={13} color="#38BDF8" />
                <Text style={styles.geoInfoRow}>Origem: {originLabel}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="compass-outline" size={13} color="#38BDF8" />
                <Text style={styles.geoInfoRow}>Bússola: {heading}° (Norte Verdadeiro)</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons
                  name={accuracyOk ? 'locate' : 'warning'}
                  size={13}
                  color={accuracyColor}
                />
                <Text style={[styles.geoInfoRow, { color: accuracyColor }]}>
                  Precisão do GPS: {accuracyLabel}
                </Text>
              </View>
            </View>

            <View style={styles.distanceAdjustPanel}>
              <View style={styles.distanceHeaderRow}>
                <Text style={styles.distanceLabel}>Distância da Mira:</Text>
                <Text style={styles.distanceValue}>{pendingDistance.toFixed(2)} m</Text>
              </View>
              {DISTANCE_STEP_ROWS.map((row, rowIndex) => (
                <View key={`dist-row-${rowIndex}`} style={styles.distanceButtonsRow}>
                  {row.map((step) => (
                    <TouchableOpacity
                      key={`dist-step-${step.label}`}
                      onPress={() => onAdjustDistance(step.delta)}
                      disabled={isSaving}
                      style={styles.distanceStepButton}>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={step.tone === 'neg' ? styles.distanceStepTextNeg : styles.distanceStepTextPos}>
                        {step.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
              <View style={styles.customDistanceRow}>
                <TextInput
                  value={customDistance}
                  onChangeText={setCustomDistance}
                  onEndEditing={commitCustomDistance}
                  onSubmitEditing={commitCustomDistance}
                  keyboardType="numeric"
                  placeholder={`distância em m (${minDistanceMeters}–${maxDistanceMeters})`}
                  placeholderTextColor="#64748B"
                  editable={!isSaving}
                  accessibilityLabel="Distância personalizada da mira em metros"
                  style={styles.customDistanceInput}
                />
                <TouchableOpacity
                  onPress={commitCustomDistance}
                  disabled={isSaving}
                  style={styles.customDistanceApplyButton}
                  accessibilityRole="button"
                  accessibilityLabel="Aplicar distância personalizada">
                  <Text style={styles.customDistanceApplyText}>Aplicar</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.inputLabel}>Nome do Local *</Text>
            <TextInput
              value={anchorName}
              onChangeText={onAnchorNameChange}
              placeholder="Ex: Bloco C, Entrada Biblioteca, Sala 102"
              placeholderTextColor="#64748B"
              style={styles.textInput}
              autoFocus
            />

            <Text style={styles.inputLabel}>Descrição (opcional)</Text>
            <TextInput
              value={anchorDescription}
              onChangeText={onAnchorDescriptionChange}
              placeholder="Ex: Prédio de TI e Computação"
              placeholderTextColor="#64748B"
              style={[styles.textInput, styles.textInputLast]}
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity onPress={onClose} disabled={isSaving} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onCreate}
                disabled={saveBlocked}
                style={[styles.saveButton, !accuracyOk && styles.saveButtonBlocked]}>
                {isSaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                <Text style={styles.saveButtonText}>
                  {isSaving
                    ? 'Salvando...'
                    : accuracyMeters === null
                      ? 'Aguardando GPS…'
                      : !accuracyOk
                        ? 'Precisão insuficiente'
                        : 'Salvar Ponto'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#0F172A',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 25,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 4,
    flex: 1,
  },
  previewToggleBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 16,
    lineHeight: 17,
  },
  geoInfoBox: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 4,
  },
  geoInfoRow: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  distanceAdjustPanel: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  distanceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  distanceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  distanceValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#38BDF8',
  },
  distanceButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  distanceStepButton: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingVertical: 7,
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  distanceStepTextNeg: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '700',
  },
  distanceStepTextPos: {
    color: '#4ADE80',
    fontSize: 12,
    fontWeight: '700',
  },
  customDistanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  customDistanceInput: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 44,
    color: '#F8FAFC',
    fontSize: 13,
  },
  customDistanceApplyButton: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 44,
    justifyContent: 'center',
  },
  customDistanceApplyText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 14,
    marginBottom: 12,
  },
  textInputLast: {
    marginBottom: 18,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cancelButtonText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1.5,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: '#60A5FA',
  },
  saveButtonBlocked: {
    backgroundColor: '#1E3A5F',
    borderColor: '#475569',
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
