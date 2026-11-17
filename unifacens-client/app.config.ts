import type { ExpoConfig } from 'expo/config';

/**
 * Config dinâmica do Expo — injeta as credenciais de anchor providers no
 * plugin do ViroReact, que as escreve como meta-data no AndroidManifest
 * (via prebuild) no build nativo:
 *
 * - `com.google.android.ar.API_KEY` ← EXPO_PUBLIC_GOOGLE_AR_API_KEY
 *   (provider "arcore" = Google ARCore Geospatial/Cloud Anchors)
 * - `com.reactvision.RVApiKey` + `RVProjectId` ← EXPO_PUBLIC_RV_API_KEY /
 *   EXPO_PUBLIC_RV_PROJECT_ID (provider "reactvision" = ReactVision Spatial)
 *
 * ⚠️ O provider É ÚNICO e controla Cloud + Geospatial SIMULTANEAMENTE (prop
 * `provider` do <ViroARSceneNavigator> — default "reactvision" desde a
 * v2.53). As DUAS credenciais coexistem no manifesto de propósito: o A/B
 * arcore ⇄ reactvision vira troca de prop via Metro, sem rebuild nativo.
 *
 * provider "arcore" = Google ARCore Geospatial API (VPS + Terra ancorada).
 * A EXPO_PUBLIC_GOOGLE_AR_API_KEY deve pertencer ao projeto Google Cloud
 * com a "ARCore API" habilitada.
 */
export default ({ config }: { config: ExpoConfig }): ExpoConfig => {
  const googleCloudApiKey = process.env.EXPO_PUBLIC_GOOGLE_AR_API_KEY;
  if (!googleCloudApiKey) {
    console.warn(
      '[app.config] EXPO_PUBLIC_GOOGLE_AR_API_KEY ausente no .env — o provider Geospatial do ARCore ficará sem key',
    );
  }

  const rvApiKey = process.env.EXPO_PUBLIC_RV_API_KEY;
  const rvProjectId = process.env.EXPO_PUBLIC_RV_PROJECT_ID;
  if (!rvApiKey || !rvProjectId) {
    console.warn(
      '[app.config] EXPO_PUBLIC_RV_API_KEY/EXPO_PUBLIC_RV_PROJECT_ID ausentes no .env — o provider reactvision (Cloud Anchors visuais) ficará sem credenciais',
    );
  }

  /**
   * Maps SDK NATIVO (react-native-maps): a meta-data
   * `com.google.android.geo.API_KEY` só nasce no prebuild via
   * expo.android.config.googleMaps.apiKey — as EXPO_PUBLIC_* alimentam o JS,
   * o SDK nativo lê o MANIFESTO. Sem isto o APK de release crasha com
   * IllegalStateException "API key not found" ao montar qualquer MapView
   * (lição de device 2026-11-11: dev local tinha a meta-data editada à mão
   * no android/ não-versionado; o build EAS (CNG/prebuild) nasceu sem ela).
   */
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;
  if (!googleMapsApiKey) {
    console.warn(
      '[app.config] EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY ausente — o SDK nativo do Maps crashará o app de release em qualquer MapView',
    );
  }

  return {
    ...config,
    ...(googleMapsApiKey
      ? {
          android: {
            ...(config.android ?? {}),
            config: {
              ...(config.android?.config ?? {}),
              googleMaps: { apiKey: googleMapsApiKey },
            },
          },
        }
      : null),
    android: {
      ...(config.android ?? {}),
      ...(googleMapsApiKey
        ? {
            config: {
              ...(config.android?.config ?? {}),
              googleMaps: { apiKey: googleMapsApiKey },
            },
          }
        : null),
      /**
       * Deslocamento (activity recognition) — fusão de movimento do ARCore
       * Geospatial/VPS. Nenhum plugin injeta (lição 2026-11-13); permissão
       * perigosa: além de DECLARADA aqui, o useARPermissions solicita em
       * runtime ao abrir a tab AR.
       */
      permissions: [
        ...(config.android?.permissions ?? []),
        'android.permission.ACTIVITY_RECOGNITION',
      ],
    },
    // EAS Build: projectId da conta Expo (@giovannevqs-team/unifacens-client)
    // — vinculado pelo `eas init` em 2026-11-11. NÃO é secret.
    extra: {
      ...(config.extra ?? {}),
      eas: {
        ...(config.extra?.eas ?? {}),
        projectId: 'ae6304bc-05e5-4a87-afa7-3b3e648c9cce',
      },
    },
    plugins: [
      ...(config.plugins ?? []).map((plugin) => {
        if (Array.isArray(plugin) && plugin[0] === '@reactvision/react-viro') {
          return [
            plugin[0],
            {
              ...(typeof plugin[1] === 'object' && plugin[1] !== null ? plugin[1] : {}),
              provider: 'arcore',
              googleCloudApiKey: googleCloudApiKey ?? '',
              // O plugin só escreve cada meta-data se a key existir — enviar
              // vazio não polui o manifesto do prebuild.
              ...(rvApiKey ? { rvApiKey } : {}),
              ...(rvProjectId ? { rvProjectId } : {}),
            },
          ];
        }
        return plugin;
      }),
      /**
       * Fotos dos pontos AR (F3, 2026-11-13): câmera + biblioteca no modal
       * de criação/edição. Android: permissões vêm do manifest do pacote (a
       * CAMERA já existe pelo AR); iOS: strings de uso OBRIGATÓRIAS via plugin.
       */
      [
        'expo-image-picker',
        {
          cameraPermission:
            'O app usa a câmera para fotografar os pontos do campus e anexar ao local.',
          photoLibraryPermission:
            'O app acessa sua biblioteca para anexar fotos aos pontos do campus.',
        },
      ],
    ] as ExpoConfig['plugins'],
  };
};
