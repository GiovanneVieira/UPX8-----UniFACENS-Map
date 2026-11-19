import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LOGO = require('../../assets/images/UnifacensMapLogo.png');

/**
 * Tela de carregamento com a marca (substitui o "null" do AuthGate durante
 * a hidratação da sessão — antes o app ficava preto após a splash nativa).
 *
 * Pulso suave com Animated + useNativeDriver (60fps, §12.3). Tela 2D
 * convencional → NativeWind ok (§6), mas o wrapper animado usa estilo
 * direto para não re-renderizar por frame.
 */
export function LoadingScreen() {
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const scaleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.06,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    scaleLoop.start();
    glowLoop.start();
    return () => {
      scaleLoop.stop();
      glowLoop.stop();
    };
  }, [pulse, glow]);

  const glowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.15, 0.5],
  });

  return (
    <View
      className="flex-1 items-center justify-center bg-[#021831]"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* Halo suave atrás da logo (respira junto com o pulso). */}
      <View className="items-center justify-center">
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            width: 260,
            height: 260,
            borderRadius: 130,
            backgroundColor: '#38BDF8',
            opacity: glowOpacity,
            transform: [{ scale: pulse }],
          }}
        />
        <Animated.Image
          source={LOGO}
          accessible
          accessibilityLabel="UnifacensMAP"
          style={{
            width: 190,
            height: 190,
            borderRadius: 38,
            transform: [{ scale: pulse }],
          }}
        />
      </View>

      <Text className="mt-8 text-3xl font-extrabold tracking-tight text-white">
        Unifacens
        <Text className="text-sky-300">MAP</Text>
      </Text>
      <Text className="mt-2 text-sm text-slate-400">
        Navegação pelo campus e realidade aumentada
      </Text>
    </View>
  );
}
