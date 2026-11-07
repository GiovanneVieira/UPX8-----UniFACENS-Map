import type { ExpoConfig } from 'expo/config';

/**
 * Config dinâmica do Expo — lê a ARCore API key do .env (nunca commitada) e
 * injeta no plugin do ViroReact, que a escreve como meta-data
 * `com.google.android.ar.API_KEY` no AndroidManifest no build nativo.
 *
 * Provider "arcore" = Google ARCore Geospatial API (VPS + Terra ancorada).
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

  return {
    ...config,
    plugins: (config.plugins ?? []).map((plugin) => {
      if (Array.isArray(plugin) && plugin[0] === '@reactvision/react-viro') {
        return [
          plugin[0],
          {
            ...(typeof plugin[1] === 'object' && plugin[1] !== null ? plugin[1] : {}),
            provider: 'arcore',
            googleCloudApiKey: googleCloudApiKey ?? '',
          },
        ];
      }
      return plugin;
    }),
  };
};
