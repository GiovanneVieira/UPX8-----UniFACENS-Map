import React from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { calculateDistance } from 'shared';
import {
  type CampusLandmark,
  CAMPUS_CALIBRATION_POINTS,
} from '@/constants/campus-landmarks';
import type { GeoCoords } from '../hooks/use-ar-geolocation';

interface CalibrationModalProps {
  visible: boolean;
  calibratedLandmark: CampusLandmark | null;
  userCoords: GeoCoords;
  onSelect: (landmark: CampusLandmark) => void;
  onReset: () => void;
  onClose: () => void;
}

/**
 * Modal de Calibração Zero-Marker: o usuário seleciona um marco físico
 * conhecido (entrada/bloco) para zerar o desvio do GPS e deixar o Visual
 * SLAM do ARCore manter a precisão absoluta.
 */
export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  visible,
  calibratedLandmark,
  userCoords,
  onSelect,
  onReset,
  onClose,
}) => {
  const handleSelect = (landmark: CampusLandmark) => {
    onSelect(landmark);
    Alert.alert(
      'Calibração Concluída!',
      `Origem AR alinhada com ${landmark.name}.\nTodos os pontos agora estão fixos e ancorados rigidamente no espaço físico.`,
    );
  };

  const handleReset = () => {
    onReset();
    Alert.alert('GPS Restaurado', 'O aplicativo voltou a usar o sinal GPS em tempo real.');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.calibrationSheet}>
          <Text style={styles.modalTitle}>📍 Calibração de Localização</Text>
          <Text style={styles.modalSubtitle}>
            Selecione sua entrada ou marco de referência para zerar desvios de GPS. O SLAM manterá
            a precisão máxima.
          </Text>

          {calibratedLandmark ? (
            <View style={styles.activeCalibrationBox}>
              <Text style={styles.activeCalibrationTitle}>
                ✅ Calibrado em: {calibratedLandmark.name}
              </Text>
              <TouchableOpacity onPress={handleReset} style={styles.resetCalibrationBtn}>
                <Text style={styles.resetCalibrationBtnText}>Restaurar Sinal GPS</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <ScrollView style={styles.landmarksList} showsVerticalScrollIndicator={false}>
            {CAMPUS_CALIBRATION_POINTS.map((landmark) => {
              const distToUser = calculateDistance(
                userCoords.latitude,
                userCoords.longitude,
                landmark.latitude,
                landmark.longitude,
              );

              return (
                <TouchableOpacity
                  key={landmark.name}
                  onPress={() => handleSelect(landmark)}
                  style={styles.landmarkCard}
                  activeOpacity={0.75}>
                  <View style={styles.landmarkCardHeader}>
                    <Text style={styles.landmarkCardTitle}>{landmark.name}</Text>
                    <Text style={styles.landmarkCardDist}>~{Math.round(distToUser)} m</Text>
                  </View>
                  <Text style={styles.landmarkCardDesc}>{landmark.description}</Text>
                  <Text style={styles.landmarkCardCoords}>
                    GPS: [{landmark.latitude.toFixed(5)}, {landmark.longitude.toFixed(5)}]
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity onPress={onClose} style={styles.closeCalibrationBtn}>
            <Text style={styles.closeCalibrationBtnText}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  calibrationSheet: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 22,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 16,
    lineHeight: 17,
  },
  activeCalibrationBox: {
    backgroundColor: 'rgba(6, 78, 59, 0.45)',
    borderWidth: 1,
    borderColor: '#059669',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activeCalibrationTitle: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  resetCalibrationBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  resetCalibrationBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  landmarksList: {
    marginBottom: 16,
  },
  landmarkCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  landmarkCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  landmarkCardTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  landmarkCardDist: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  landmarkCardDesc: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 4,
  },
  landmarkCardCoords: {
    color: '#64748B',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  closeCalibrationBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  closeCalibrationBtnText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
});
