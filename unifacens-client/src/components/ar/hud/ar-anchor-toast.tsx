import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * TTL do toast de ponto encontrado (ms) — SSOT da duração: o container usa
 * ao criar a deadline absoluta (`expiresAt`).
 */
export const ANCHOR_TOAST_TTL_MS = 3500;

export interface AnchorToastData {
  name: string;
  distanceM?: number;
  isCloud: boolean;
  /**
   * Deadline ABSOLUTA de expiração (Date.now() + ANCHOR_TOAST_TTL_MS).
   * O timer e a barra derivam DELA — não de um setTimeout resetável.
   * ⚠️ Lição 2026-11-11: o container re-renderiza a 1Hz (distância viva da
   * projeção) e o efeito antigo tinha `onDismiss` inline nas deps → o timer
   * de 3.5s reiniciava a cada render e o toast NUNCA expirava sozinho.
   */
  expiresAt: number;
}

interface ARAnchorToastProps {
  toast: AnchorToastData | null;
  onDismiss: () => void;
}

/**
 * Toast flutuante quando um ponto é ENCONTRADO (cloud anchor resolvida ou
 * pin projetado pela primeira vez). Auto-dismiss na deadline absoluta com
 * fade+slide, barra de expiração linear e fechamento manual (X).
 */
export const ARAnchorToast: React.FC<ARAnchorToastProps> = ({ toast, onDismiss }) => {
  const anim = useRef(new Animated.Value(0)).current;
  const barAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast) {
      anim.setValue(0);
      barAnim.setValue(1);
      return;
    }

    // Entra
    Animated.timing(anim, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();

    // Barra esvazia linearmente até a deadline (driver JS: anima width/layout
    // — uma view de 3px, custo desprezível; opacity/translateY seguem nativos).
    const remaining = Math.max(0, toast.expiresAt - Date.now());
    barAnim.setValue(1);
    Animated.timing(barAnim, {
      toValue: 0,
      duration: remaining,
      useNativeDriver: false,
    }).start();

    // Auto-dismiss na deadline absoluta: re-execuções do efeito (por qualquer
    // re-render) recalculam o restante — a contagem NUNCA reinicia do zero.
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      Animated.timing(anim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => onDismiss());
    }, remaining);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast, anim, barAnim, onDismiss]);

  /** Fechamento manual: cancela o timer e some rápido (fade). */
  const handleManualClose = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    barAnim.stopAnimation();
    Animated.timing(anim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onDismiss());
  };

  if (!toast) return null;

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, 0],
  });
  const opacity = anim;
  const barWidth = barAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[styles.toast, { transform: [{ translateY }], opacity }]}
      pointerEvents="box-none">
      <View style={styles.toastInner} pointerEvents="auto">
        <View style={styles.iconWrap}>
          <Ionicons
            name={toast.isCloud ? 'cloud-done' : 'locate'}
            size={20}
            color={toast.isCloud ? '#34D399' : '#A78BFA'}
          />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {toast.name}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {toast.isCloud ? 'Âncora visual localizada' : 'Ponto projetado'}
            {typeof toast.distanceM === 'number' && toast.distanceM > 0
              ? ` · ${toast.distanceM < 1000 ? `${Math.round(toast.distanceM)}m` : `${(toast.distanceM / 1000).toFixed(1)}km`}`
              : ''}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleManualClose}
          style={styles.closeBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Fechar aviso de ponto encontrado">
          <Ionicons name="close" size={18} color="#A7F3D0" />
        </TouchableOpacity>

        {/* Barra de expiração — esvazia linearmente até a deadline */}
        <View style={styles.expiryTrack} pointerEvents="none">
          <Animated.View style={[styles.expiryFill, { width: barWidth }]} />
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  /** Linha da pilha do topo (ARTopHudStack) — sem position absolute. */
  toast: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  toastInner: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(6, 78, 59, 0.94)',
    borderWidth: 1,
    borderColor: '#059669',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 16,
    maxWidth: 340,
    overflow: 'hidden',
  },
  expiryTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(5, 150, 105, 0.25)',
  },
  expiryFill: {
    height: '100%',
    backgroundColor: '#34D399',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5, 150, 105, 0.3)',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(5, 150, 105, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#D1FAE5',
    fontSize: 14.5,
    fontWeight: '700',
  },
  subtitle: {
    color: '#6EE7B7',
    fontSize: 12,
  },
});
