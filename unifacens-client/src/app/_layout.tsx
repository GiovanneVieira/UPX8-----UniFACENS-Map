import '../../global.css';
import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, LogBox } from 'react-native';

import AppTabs from '@/components/app-tabs';

import { SafeAreaProvider } from 'react-native-safe-area-context';

LogBox.ignoreLogs([
  'Failed to create anchored node',
  'Cannot update a component',
  "Property 'loading' doesn't exist",
  "Couldn't find a navigation context",
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
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AppTabs />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
