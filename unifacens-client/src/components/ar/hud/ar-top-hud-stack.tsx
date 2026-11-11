import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ARTopHudStackProps {
  children: React.ReactNode;
  /** Altura consumida pela pilha (px) — âncora dinâmica p/ flutuantes abaixo. */
  onLayoutHeight?: (height: number) => void;
}

/**
 * Pilha vertical do topo da tela AR — fim dos position:absolute com números
 * mágicos (lição 2026-11-11: o banner de tracking renderizava ATRÁS da
 * barra de filtros — cada HUD tinha absolute + top fixo + zIndex igual, e o
 * último no JSX vencia). Aqui cada faixa (status, banner, pílula de
 * hosting, filtros, navegação, toast) ocupa linha PRÓPRIA no fluxo: quando
 * um elemento aparece, tudo abaixo desce — sobreposição fica impossível
 * por construção. Safe-area aplicada uma única vez (paddingTop).
 */
export const ARTopHudStack: React.FC<ARTopHudStackProps> = ({ children, onLayoutHeight }) => {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.stack, { paddingTop: insets.top + 8 }]}
      pointerEvents="box-none"
      onLayout={(e) => onLayoutHeight?.(e.nativeEvent.layout.height)}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 20,
    gap: 8,
    paddingHorizontal: 16,
  },
});
