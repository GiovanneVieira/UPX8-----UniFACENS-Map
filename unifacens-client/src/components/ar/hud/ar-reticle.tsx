import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface ARReticleProps {
  zoomLevel: number;
  /**
   * Estado de tracking SLAM (1 indisponível · 2 mapeando · 3 estável) — a
   * retícula reflete a RIGIDEZ DO MUNDO, sem chamada nativa (lição
   * 2026-11-10: o background hit-test de 800ms mantinha um UIBlock em
   * flight quase permanente e cravava NPE/SIGSEGV no detach da tab; a
   * validação REAL de superfície acontece no clique de criar).
   * verde = mundo rígido (provavelmente dá pra criar) · âmbar = mapeando ·
   * vermelho = sem ancoragem visual.
   */
  trackingState?: number;
}

/**
 * Retículo/mira central sobreposto ao feed da câmera. Com zoom ativo
 * (> 1.05x) exibe a mira telescópica de precisão; caso contrário, a
 * mira simples de pontilhado.
 */
export const ARReticle: React.FC<ARReticleProps> = ({ zoomLevel, trackingState }) => {
  const isZoomed = zoomLevel > 1.05;
  const ringColor =
    trackingState === undefined
      ? '#FFFFFF'
      : trackingState === 3
        ? '#34D399'
        : trackingState === 2
          ? '#FBBF24'
          : '#EF4444';

  return (
    <View style={styles.reticleOverlay} pointerEvents="none">
      {isZoomed ? (
        <View style={styles.telescopicContainer}>
          <View style={styles.telescopicTag}>
            <Text style={styles.telescopicTagText}>
              {zoomLevel.toFixed(1)}x MIRA DE PRECISÃO
            </Text>
          </View>

          <View style={styles.telescopicOuterRing}>
            <View style={styles.telescopicMiddleRing}>
              <View style={styles.telescopicInnerRing}>
                <View style={[styles.telescopicCenterDot, { backgroundColor: ringColor }]} />
              </View>
            </View>
            <View style={styles.crosshairHorizontal} />
            <View style={styles.crosshairVertical} />
          </View>
        </View>
      ) : (
        <View style={[styles.defaultReticleRing, { borderColor: ringColor }]}>
          <View style={[styles.defaultReticleDot, { backgroundColor: ringColor }]} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  reticleOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 25,
    elevation: 25,
  },
  telescopicContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  telescopicTag: {
    backgroundColor: 'rgba(37, 99, 235, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#60A5FA',
    marginBottom: 8,
  },
  telescopicTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  telescopicOuterRing: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  telescopicMiddleRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: 'rgba(34, 211, 238, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  telescopicInnerRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  telescopicCenterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22D3EE',
  },
  crosshairHorizontal: {
    position: 'absolute',
    width: 96,
    height: 1.5,
    backgroundColor: 'rgba(34, 211, 238, 0.7)',
  },
  crosshairVertical: {
    position: 'absolute',
    width: 1.5,
    height: 96,
    backgroundColor: 'rgba(34, 211, 238, 0.7)',
  },
  defaultReticleRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultReticleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#38BDF8',
  },
});
