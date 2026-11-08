import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import ViroARAnchorContainer from "@/components/ar/ViroARAnchorContainer";

/**
 * Tela AR — DESMONTA o container quando a tab perde foco.
 *
 * Motivo: o Tab Navigator mantém a tela montada mesmo em outra tab. A view
 * nativa (GLSurfaceView) é removida da hierarquia, mas os intervals JS
 * (pose poll, âncoras nativas, retry geospatial) continuam chamando o C++
 * morto → SIGSEGV em libviro_renderer.so (nativeGetCameraGeospatialPose etc).
 *
 * Com useFocusEffect: sair da tab → container unmounta → intervals limpam →
 * cena nativa destruída com segurança. Voltar à tab → remonta fresca.
 */
export default function ARScreen() {
  const [isFocused, setIsFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  return (
    <View style={styles.container}>
      {isFocused ? <ViroARAnchorContainer /> : null}
    </View>
  );
}

// REGRA DE OURO (AGENTS.MD seção 6): telas que hospedam ou envolvem o
// ViroARSceneNavigator usam ESTRITAMENTE StyleSheet.create puro. Classes
// className (NativeWind) aqui fazem o react-native-css-interop percorrer a
// árvore Fiber sobre a GLSurfaceView, disparando "Couldn't find a navigation
// context" e crash fatal SIGSEGV no libviro_renderer.so.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
});
