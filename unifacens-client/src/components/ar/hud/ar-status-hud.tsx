import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ARStatusHudProps {
  cloudStatus: string;
  /** 1: Indisponível, 2: Mapeando, 3: Estável */
  trackingState: number;
  isFetching: boolean;
  /** Nome curto do marco calibrado, ou null para exibir a precisão do GPS. */
  calibratedLabel: string | null;
  gpsAccuracyMeters: number;
  /** Acurácia horizontal da pose VPS (Terra) — prioridade sobre o GPS. */
  vpsAccuracyMeters?: number | null;
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
  vpsAccuracyMeters,
  onOpenCalibration,
  onRefresh,
}) => {
  const insets = useSafeAreaInsets();
  const trackingDotColor =
    trackingState === 3 ? '#34D399' : trackingState === 2 ? '#FBBF24' : '#EF4444';
  // Origem exibida: marco calibrado > pose VPS (Terra) > GPS cru
  const originLabel = calibratedLabel ?? (vpsAccuracyMeters != null ? `VPS ±${Math.round(vpsAccuracyMeters)}m` : `GPS ±${Math.round(gpsAccuracyMeters)}m`);

  return (
    <View
      style={[styles.topHudWrapper, { top: Math.max(insets.top + 8, 48) }]}
      pointerEvents="box-none">
      <View style={styles.topHudRow}>
        <View style={[styles.hudPill, styles.hudPillBlue]}>
          <View style={[styles.statusDot, { backgroundColor: trackingDotColor }]} />
          <Text style={styles.hudPillTextWhite}>{cloudStatus}</Text>
        </View>

        <TouchableOpacity
          onPress={onOpenCalibration}
          activeOpacity={0.8}
          style={[styles.hudPill, calibratedLabel ? styles.hudPillEmerald : styles.hudPillCyan]}>
          {calibratedLabel ? (
            <Ionicons name="location" size={13} color="#34D399" />
          ) : vpsAccuracyMeters != null ? (
            <Ionicons name="globe-outline" size={13} color="#67E8F9" />
          ) : (
            <Ionicons name="navigate-outline" size={13} color="#67E8F9" />
          )}
          <Text style={calibratedLabel ? styles.hudPillTextEmerald : styles.hudPillTextCyan}>
            {originLabel}
          </Text>
        </TouchableOpacity>

        <View style={styles.hudActionsRow}>
          <TouchableOpacity onPress={onOpenCalibration} activeOpacity={0.75} style={styles.hudIconBtn}>
            <Ionicons name="location-outline" size={18} color="#67E8F9" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onRefresh}
            disabled={isFetching}
            activeOpacity={0.75}
            style={styles.hudIconBtn}>
            {isFetching ? (
              <ActivityIndicator size="small" color="#60A5FA" />
            ) : (
              <Ionicons name="refresh" size={18} color="#67E8F9" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Banner de tracking: sem ancoragem visual estável (state 3), o quadro
          do mundo do ARCore não fica rígido e nenhum ponto AR pode ficar
          cravado — aviso prominente em vez de apenas o pontinho colorido. */}
      {trackingState !== 3 ? (
        <View style={styles.trackingBanner}>
          <Ionicons name="warning" size={13} color="#FCD34D" />
          <Text style={styles.trackingBannerText}>
            {trackingState === 2
              ? 'SLAM limitado: aponte para objetos com textura e mova devagar'
              : 'Rastreamento indisponível: ambiente sem ancoragem visual'}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  topHudWrapper: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 20,
    elevation: 20,
  },
  topHudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trackingBanner: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(69, 26, 3, 0.88)',
    borderColor: '#B45309',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  trackingBannerText: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '600',
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
