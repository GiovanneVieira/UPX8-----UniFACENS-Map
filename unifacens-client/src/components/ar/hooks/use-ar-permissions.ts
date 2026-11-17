import { useEffect, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

export interface ARPermissionsState {
  /** Câmera concedida? (ARCore/SLAM — sem ela a tab AR é inútil.) */
  camera: boolean;
  /** Deslocamento/atividade concedido? (ACTIVITY_RECOGNITION — fusão de
   *  movimento do ARCore Geospatial/VPS.) */
  activityRecognition: boolean;
  /** Diálogos já exibidos nesta sessão (não perguntar de novo). */
  asked: boolean;
}

const INITIAL: ARPermissionsState = {
  camera: false,
  activityRecognition: false,
  asked: false,
};

/**
 * Solicita em RUNTIME as permissões perigosas da tab AR que o Viro/ARCore
 * NÃO pedem por conta própria: câmera e deslocamento (activity
 * recognition). A localização continua no useARGeolocation (expo-location).
 *
 * ⚠️ As três já são DECLARADAS no AndroidManifest (ARCore/expo as inserem no
 * prebuild) — mas permissões perigosas exigem o diálogo em runtime (Android
 * 6+), e o Viro assume que a câmera já foi concedida (tab preta/estril se
 * negada). Idempotente: permissões já concedidas não re-preguntam.
 *
 * Uso: mount do ViroARAnchorContainer (abrir a tab AR dispara os diálogos).
 */
export function useARPermissions(): ARPermissionsState {
  const [state, setState] = useState<ARPermissionsState>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Platform.OS !== 'android') {
        // iOS: ARKit pede câmera automaticamente na primeira sessão.
        setState({ camera: true, activityRecognition: true, asked: true });
        return;
      }
      try {
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          'android.permission.ACTIVITY_RECOGNITION' as never,
        ]);
        if (cancelled) return;
        const camera = results[PermissionsAndroid.PERMISSIONS.CAMERA] === 'granted';
        const activity =
          results['android.permission.ACTIVITY_RECOGNITION'] === 'granted';
        if (!camera) {
          console.warn('[ARPermissions] câmera NEGADA — a tab AR não funciona sem ela');
        }
        if (!activity) {
          console.warn(
            '[ARPermissions] deslocamento (activity recognition) negado — VPS degrada',
          );
        }
        setState({ camera, activityRecognition: activity, asked: true });
      } catch (err) {
        console.warn('[ARPermissions] falha ao solicitar:', err);
        if (!cancelled) setState((prev) => ({ ...prev, asked: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
