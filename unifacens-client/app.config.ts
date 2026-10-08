import type { ConfigContext, ExpoConfig } from "expo/config";
import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(__dirname, "../.env.client"), quiet: true });

export default ({ config }: ConfigContext): ExpoConfig => {
  const androidKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;
  return {
    ...config,
    name: config.name ?? "UniFACENS Map",
    slug: config.slug ?? "unifacens-client",
    plugins: [
      ...(config.plugins ?? []),
      ...(androidKey
        ? [
            ["react-native-maps", { androidGoogleMapsApiKey: androidKey }] as [
              string,
              Record<string, string>,
            ],
          ]
        : []),
    ],
  };
};
