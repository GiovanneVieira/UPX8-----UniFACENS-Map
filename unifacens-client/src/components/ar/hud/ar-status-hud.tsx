import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ARTickerText } from './ar-ticker-text';

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
  /** Abre o modal de diagnóstico do mapeamento (pill de status clicável). */
  onOpenDiagnostics?: () => void;
}

/**
 * Banner âmbar de tracking — LINHA EFÊMERA própria na pilha do topo (fora
 * do bloco estável: entra/sai conforme o tracking 2↔3 sem mover os
 * flutuantes ancorados abaixo da pilha, lição de device 2026-11-11).
 */
export const ARTrackingBanner: React.FC<{ trackingState: number }> = ({ trackingState }) => {
  if (trackingState === 3) return null;
  return (
    <View style={styles.trackingBanner}>
      <Ionicons name="warning" size={13} color="#FCD34D" />
      <Text style={styles.trackingBannerText}>
        {trackingState === 2
          ? 'SLAM limitado: aponte para objetos com textura e mova devagar'
          : 'Rastreamento indisponível: ambiente sem ancoragem visual'}
      </Text>
    </View>
  );
};

/**
 * HUD superior da tela AR: status da nuvem (pontos/carregamento/erro),
 * indicador de tracking SLAM, origem ativa (marco calibrado ou GPS) e
 * ações de calibração/atualização. Linha do bloco estável da pilha.
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
  onOpenDiagnostics,
}) => {
  const trackingDotColor =
    trackingState === 3 ? '#34D399' : trackingState === 2 ? '#FBBF24' : '#EF4444';
  // Origem exibida: marco calibrado > pose VPS (Terra) > GPS cru
  const originLabel = calibratedLabel ?? (vpsAccuracyMeters != null ? `VPS ±${Math.round(vpsAccuracyMeters)}m` : `GPS ±${Math.round(gpsAccuracyMeters)}m`);

  return (
    <View style={styles.topHudWrapper} pointerEvents="box-none">
      <View style={styles.topHudRow}>
        {/* Pill de status — CLICÁVEL: abre o modal de diagnóstico do
            mapeamento. O texto anima em reveal cíclico (typewriter):
            mensagens de progresso do resolve são longas e a pill é estreita. */}
        <TouchableOpacity
          onPress={onOpenDiagnostics}
          disabled={!onOpenDiagnostics}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Status do mapeamento — detalhes"
          style={[styles.hudPill, styles.hudPillBlue, styles.hudPillShrink]}>
          <View style={[styles.statusDot, { backgroundColor: trackingDotColor }]} />
          <ARTickerText text={cloudStatus} style={styles.hudPillTextWhite} />
          {onOpenDiagnostics ? (
            <Ionicons name="information-circle-outline" size={13} color="#93C5FD" />
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onOpenCalibration}
          activeOpacity={0.8}
          style={[styles.hudPill, calibratedLabel ? styles.hudPillEmerald : styles.hudPillCyan, styles.hudPillShrink]}>
          {calibratedLabel ? (
            <Ionicons name="location" size={13} color="#34D399" />
          ) : vpsAccuracyMeters != null ? (
            <Ionicons name="globe-outline" size={13} color="#67E8F9" />
          ) : (
            <Ionicons name="navigate-outline" size={13} color="#67E8F9" />
          )}
          {/* Origem usa a mesma janela deslizante (prefixo+… → desliza →
              volta) quando transborda. */}
          <ARTickerText
            text={originLabel}
            style={calibratedLabel ? styles.hudPillTextEmerald : styles.hudPillTextCyan}
          />
        </TouchableOpacity>

        <View style={styles.hudActionsRow}>
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
    </View>
  );
};

const styles = StyleSheet.create({
  /** Linha da pilha do topo (ARTopHudStack) — sem position absolute. */
  topHudWrapper: {
    alignSelf: 'stretch',
  },
  topHudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'nowrap',
    gap: 6,
  },
  hudPillShrink: {
    flexShrink: 1,
    minWidth: 0,
  },
  trackingBanner: {
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
