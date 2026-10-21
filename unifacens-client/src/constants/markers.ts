import { ViroARTrackingTargets } from '@reactvision/react-viro';

/**
 * Registro de Marcadores Visuais Físicos para Ancoragem Precisa em Realidade Aumentada.
 * Os alvos registrados aqui são reconhecidos pelo ARCore/ARKit com precisão milimétrica (< 5mm),
 * servindo de âncora rígida física no mundo real que independe de GPS ou orientação ao abrir o app.
 */
export const FACENS_MARKER_TARGET = 'facensAnchorMarker';

// Registra os alvos rastreáveis no ViroReact
ViroARTrackingTargets.createTargets({
  [FACENS_MARKER_TARGET]: {
    source: require('@/assets/images/markers/facens-target.png'),
    orientation: 'Up',
    physicalWidth: 0.2, // 20 centímetros impressos no mundo real
  },
});
