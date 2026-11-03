import '../../global.css';
import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import AppTabs from '@/components/app-tabs';

import { SafeAreaProvider } from 'react-native-safe-area-context';

// Supressões REMANESCENTES de ruído interno do Viro/third-party apenas.
// Os ignores de "Cannot update a component" (setState aninhado — corrigido)
// e "Couldn't find a navigation context" (className na rota AR — corrigido)
// foram REMOVIDOS: sintomas reais de bug não devem ficar silenciados.
LogBox.ignoreLogs([
  'Failed to create anchored node',
  "Property 'loading' doesn't exist",
]);

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 2, // 2 minutos de cache fresco
            gcTime: 1000 * 60 * 10, // 10 minutos de coleta de lixo
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <AppTabs />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
