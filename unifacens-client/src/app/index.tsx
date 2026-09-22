import '../../global.css';
import React from 'react';
import { View } from 'react-native';
import ViroARAnchorContainer from '@/components/ar/ViroARAnchorContainer';

export default function HomeScreen() {
  return (
    <View className="flex-1 bg-slate-950">
      <ViroARAnchorContainer />
    </View>
  );
}
