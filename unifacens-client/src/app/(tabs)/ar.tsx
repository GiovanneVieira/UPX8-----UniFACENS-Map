import { StyleSheet, View } from "react-native";
import ViroARAnchorContainer from "@/components/ar/ViroARAnchorContainer";

export default function ARScreen() {
  return (
    <View style={styles.container}>
      <ViroARAnchorContainer />
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
