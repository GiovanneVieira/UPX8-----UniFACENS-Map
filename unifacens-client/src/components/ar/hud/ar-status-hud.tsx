import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ARStatusHudProps {
  cloudStatus: string;
  /** 1: Indisponível, 2: Mapeando, 3: Estável */
  trackingState: number;
  isFetching: boolean;
  /** Nome curto do marco calibrado, ou null para exibir a precisão do GPS. */
  calibratedLabel: string | null;
  gpsAccuracyMeters: number;
  onOpenCalibration: () => void;
  onRefresh: () => void;
}

/**
 * HUD superior da tela AR: status da nuvem (pontos/carregamento/erro),
 * indicador de tracking SLAM, origem ativa (marco calibrado ou GPS) e
 * ações de calibração/atualização.
 */
export const ARStatusHud: React.FC<ARStatusHudProps> = ({
  cloudStatus,
  trackingState,
  isFetching,
  calibratedLabel,
  gpsAccuracyMeters,
  onOpenCalibration,
  onRefresh,
}) => {
  const insets = useSafeAreaInsets();
  const trackingDotColor =
    trackingState === 3 ? '#34D399' : trackingState === 2 ? '#FBBF24' : '#EF4444';

  return (
    <View
      style={[styles.topHudBar, { top: Math.max(insets.top + 8, 48) }]}
      pointerEvents="box-none">
      <View style={styles.hudPillsRow}>
        <View style={[styles.hudPill, styles.hudPillBlue]}>
          <View style={[styles.statusDot, { backgroundColor: trackingDotColor }]} />
          <Text style={styles.hudPillTextWhite}>{cloudStatus}</Text>
        </View>

        <TouchableOpacity
          onPress={onOpenCalibration}
          activeOpacity={0.8}
          style={[styles.hudPill, calibratedLabel ? styles.hudPillEmerald : styles.hudPillCyan]}>
          <Text style={calibratedLabel ? styles.hudPillTextEmerald : styles.hudPillTextCyan}>
            {calibratedLabel ?? `📡 GPS ±${Math.round(gpsAccuracyMeters)}m`}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.hudActionsRow}>
        <TouchableOpacity onPress={onOpenCalibration} activeOpacity={0.75} style={styles.hudIconBtn}>
          <Text style={styles.hudIconBtnText}>📍</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onRefresh}
          disabled={isFetching}
          activeOpacity={0.75}
          style={styles.hudIconBtn}>
          {isFetching ? (
            <ActivityIndicator size="small" color="#60A5FA" />
          ) : (
            <Text style={styles.hudIconBtnText}>🔄</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  topHudBar: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
    elevation: 20,
  },
  hudPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  hudActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hudPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  hudPillBlue: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderColor: '#1E3A8A',
  },
  hudPillCyan: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderColor: '#0E7490',
  },
  hudPillEmerald: {
    backgroundColor: 'rgba(6, 78, 59, 0.85)',
    borderColor: '#059669',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  hudPillTextWhite: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  hudPillTextCyan: {
    color: '#67E8F9',
    fontSize: 12,
    fontWeight: '600',
  },
  hudPillTextEmerald: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
  },
  hudIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudIconBtnText: {
    fontSize: 16,
  },
});
