import { useCallback, useMemo, useRef, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

export const ZOOM_LEVELS = [1.0, 2.0, 3.0, 5.0];
const ZOOM_MIN = 1.0;
const ZOOM_MAX = 5.0;

// Diretiva 'worklet': utilizável tanto em callbacks JS quanto dentro de
// worklets do Reanimated (worklets não podem capturar funções JS comuns).
function clampZoom(value: number, decimals = 1): number {
  'worklet';
  return Number(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)).toFixed(decimals));
}

/**
 * Zoom da câmera AR (1.0x a 5.0x) com pinch-to-zoom e botões rápidos.
 *
 * O gesto roda 100% na UI thread nativa (RNGH + Reanimated worklets):
 * zero eventos cruzam a ponte para JS durante o pinch. O transform de
 * escala é permanente desde a montagem (invariante do AGENTS.MD §12 —
 * sem invalidação do buffer da GLSurfaceView / tela preta).
 *
 * O estado React (`zoomLevel`) é commitado uma única vez ao final do
 * gesto, evitando re-renders do container concorrendo com os toques.
 */
export function useARZoom({ onTap }: { onTap: () => void }) {
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const zoomLevelRef = useRef<number>(1.0);

  const zoom = useSharedValue(1.0);
  const pinchStartZoom = useSharedValue(1.0);

  const applyZoom = useCallback(
    (targetZoom: number, animate = true) => {
      const clamped = clampZoom(targetZoom);
      zoomLevelRef.current = clamped;
      setZoomLevel(clamped);
      zoom.value = animate
        ? withTiming(clamped, { duration: 180, easing: Easing.out(Easing.quad) })
        : clamped;
    },
    [zoom],
  );

  const commitPinchZoom = useCallback((finalZoom: number) => {
    const clamped = clampZoom(finalZoom);
    zoomLevelRef.current = clamped;
    setZoomLevel(clamped);
  }, []);

  // Exclusive(Tap, Pinch): whichever activates FIRST wins and cancels the other.
  // - Quick single tap → Tap wins → opens detail sheet instantly (no release delay)
  // - 2nd finger joins → Pinch wins → Tap is cancelled (no accidental modal)
  // - No Gesture.Native() needed: we handle tap ourselves via reticle selection
  const pinchGesture = useMemo(
    () =>
      Gesture.Exclusive(
        Gesture.Tap()
          .maxDuration(250)
          .onEnd(() => {
            'worklet';
            runOnJS(onTap)();
          }),
        Gesture.Pinch()
          .onBegin(() => {
            'worklet';
            pinchStartZoom.value = zoom.value;
          })
          .onUpdate((event) => {
            'worklet';
            // Amplifica o delta do scale: em uma tela de celular o spread
            // físico máximo é ~2x, mas o zoom vai até 5x. Amplificação de
            // 3x faz um spread de 1.5x virar zoom de 2.5x (responsivo).
            const amplification = 4;
            const adjustedScale = 1 + (event.scale - 1) * amplification;
            zoom.value = clampZoom(pinchStartZoom.value * adjustedScale, 2);
          })
          .onEnd(() => {
            'worklet';
            runOnJS(commitPinchZoom)(zoom.value);
          }),
      ),
    [zoom, pinchStartZoom, commitPinchZoom, onTap],
  );

  const arZoomAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: zoom.value }],
  }));

  return { zoomLevel, zoomLevelRef, applyZoom, pinchGesture, arZoomAnimatedStyle };
}
