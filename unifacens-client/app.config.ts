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

  return {
    ...config,
    // EAS Build: projectId da conta Expo (@giovannevqs-team/unifacens-client)
    // — vinculado pelo `eas init` em 2026-11-11. NÃO é secret.
    extra: {
      ...(config.extra ?? {}),
      eas: {
        ...(config.extra?.eas ?? {}),
        projectId: 'ae6304bc-05e5-4a87-afa7-3b3e648c9cce',
      },
    },
    plugins: (config.plugins ?? []).map((plugin) => {
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
  };
};
