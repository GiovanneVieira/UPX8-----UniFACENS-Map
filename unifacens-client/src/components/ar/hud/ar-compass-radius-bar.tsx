import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const RADIUS_OPTIONS = [
  { label: 'Todos', value: 0 },
  { label: '< 100m', value: 100 },
  { label: '< 50m', value: 50 },
];

interface ARCompassRadiusBarProps {
  /** Heading verdadeiro em graus (0-360). */
  heading: number;
  /** 0 = sem filtro de raio; caso contrário, raio máximo em metros. */
  radiusFilter: number;
  onRadiusChange: (value: number) => void;
}

/**
 * Linha do topo (ARTopHudStack): bússola (Norte Verdadeiro) FIXA à esquerda
 * — é status, não ação — + carousel horizontal livre de filtros de raio.
 * O grupo de chips vive num pill externo (bg + border, segmented control)
 * consistente com as demais pills do HUD; chip ativo preenchido azul.
 */
export const ARCompassRadiusBar: React.FC<ARCompassRadiusBarProps> = ({
  heading,
  radiusFilter,
  onRadiusChange,
}) => {
  return (
    <View style={styles.barRow}>
      <View style={styles.compassBadge}>
        <Ionicons name="compass-outline" size={13} color="#38BDF8" />
        <Text style={styles.compassBadgeText}>{heading}° N</Text>
      </View>

      {/* Carrossel horizontal — nunca overflow em X (lição 2026-11-10). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.radiusScroll}
        contentContainerStyle={styles.radiusScrollContent}>
        <View style={styles.chipGroup}>
          {RADIUS_OPTIONS.map((item) => {
            const isActive = radiusFilter === item.value;
            return (
              <TouchableOpacity
                key={`radius-${item.value}`}
                onPress={() => onRadiusChange(item.value)}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={`Filtrar pontos: ${item.label}`}
                accessibilityState={{ selected: isActive }}
                style={[styles.chip, isActive ? styles.chipActive : null]}>
                <Text style={[styles.chipText, isActive ? styles.chipTextActive : null]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compassBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    flexShrink: 0,
  },
  compassBadgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  radiusScroll: {
    flex: 1,
  },
  radiusScrollContent: {
    alignItems: 'center',
  },
  /** Pill externo do grupo de filtros (a "div externa" com bg + border). */
  chipGroup: {
    flexDirection: 'row',
    gap: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 999,
    padding: 4,
  },
  /** Chip: altura 32 + hitSlop 6/6 = alvo de toque efetivo de 44dp (§10.3). */
  chip: {
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: '#2563EB',
  },
  chipText: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
