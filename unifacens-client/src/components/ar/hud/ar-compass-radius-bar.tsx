import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

/** Sub-barra com bússola (Norte Verdadeiro) e seletor de filtro de raio. */
export const ARCompassRadiusBar: React.FC<ARCompassRadiusBarProps> = ({
  heading,
  radiusFilter,
  onRadiusChange,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.subHudBar, { top: Math.max(insets.top + 52, 92) }]}
      pointerEvents="box-none">
      <View style={[styles.compassBadge, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
        <Ionicons name="compass-outline" size={13} color="#38BDF8" />
        <Text style={styles.compassBadgeText}>{heading}° N</Text>
      </View>

      <View style={styles.radiusSelector}>
        {RADIUS_OPTIONS.map((item) => {
          const isActive = radiusFilter === item.value;
          return (
            <TouchableOpacity
              key={`radius-${item.value}`}
              onPress={() => onRadiusChange(item.value)}
              style={[styles.radiusOptionBtn, isActive ? styles.radiusOptionBtnActive : null]}>
              <Text
                style={[styles.radiusOptionText, isActive ? styles.radiusOptionTextActive : null]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  subHudBar: {
    position: 'absolute',
    top: 94,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
    elevation: 20,
  },
  compassBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  compassBadgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  radiusSelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 2,
    gap: 4,
  },
  radiusOptionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  radiusOptionBtnActive: {
    backgroundColor: '#2563EB',
  },
  radiusOptionText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  radiusOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
