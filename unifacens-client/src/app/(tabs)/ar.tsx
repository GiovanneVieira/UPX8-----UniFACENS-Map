import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import ViroARAnchorContainer from "@/components/ar/ViroARAnchorContainer";

/**
 * Tela AR — DESMONTA o container no blur IMEDIATAMENTE.
 *
 * ⚠️ EVOLUÇÃO DA LIÇÃO (2026-11-10, tombstones 15:13/15:20): o keep-alive de
 * 1.2s PIORAVA o crash — o detach NATIVO (troca de tab) destrói a cena na
 * hora, mas o gate `focused` NÃO propaga à cena (viroAppProps não re-renderiza
 * a cena, mesmo mecanismo de "navigator não reconstrói closures" §11), então
 * o poll seguia 1Hz por +1.2s atirando UIBlocks em cena morta. O unmount
 * IMEDIATO no blur mata todos os intervals no commit seguinte (cleanup do
 * React) — a menor janela possível por JS. Resíduo (~janela detach→cleanup):
 * bug upstream (null check ausente no nativo do Viro 3.1.1).
 */
export default function ARScreen() {
  const [focused, setIsFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      console.log("[ARTab] focus — sessão AR montada");
      setIsFocused(true);
      return () => {
        console.log("[ARTab] blur — unmount imediato (mata intervals)");
        setIsFocused(false);
      };
    }, []),
  );

  return (
    <View style={styles.container}>
      {focused ? <ViroARAnchorContainer /> : null}
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
