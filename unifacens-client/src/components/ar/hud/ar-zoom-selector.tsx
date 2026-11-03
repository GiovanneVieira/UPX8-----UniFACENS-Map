import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ZOOM_LEVELS } from '../hooks/use-ar-zoom';

interface ARZoomSelectorProps {
  zoomLevel: number;
  onZoomChange: (level: number) => void;
}

/** Seletor de zoom flutuante (1x, 2x, 3x, 5x) na lateral direita da tela AR. */
export const ARZoomSelector: React.FC<ARZoomSelectorProps> = ({ zoomLevel, onZoomChange }) => {
  return (
    <View style={styles.zoomSelectorBar} pointerEvents="box-none">
      {ZOOM_LEVELS.map((level) => {
        const isActive = Math.abs(zoomLevel - level) < 0.2;
        return (
          <TouchableOpacity
            key={`zoom-btn-${level}`}
            onPress={() => onZoomChange(level)}
            activeOpacity={0.75}
            style={[styles.zoomButton, isActive ? styles.zoomButtonActive : null]}>
            <Text style={[styles.zoomButtonText, isActive ? styles.zoomButtonTextActive : null]}>
              {level}x
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  zoomSelectorBar: {
    position: 'absolute',
    right: 14,
    top: '32%',
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.7)',
    gap: 8,
    alignItems: 'center',
    zIndex: 20,
    elevation: 20,
  },
  zoomButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  zoomButtonActive: {
    backgroundColor: '#2563EB',
    borderColor: '#60A5FA',
  },
  zoomButtonText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  zoomButtonTextActive: {
    color: '#FFFFFF',
  },
});
