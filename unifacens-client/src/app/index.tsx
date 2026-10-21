import React from 'react';
import { StyleSheet, View } from 'react-native';
import ViroARAnchorContainer from '@/components/ar/ViroARAnchorContainer';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <ViroARAnchorContainer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
});

