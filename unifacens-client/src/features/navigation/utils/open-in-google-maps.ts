import { Linking, Platform } from 'react-native';

/**
 * Abre o Google Maps com rota A PÉ até o destino (deep-link universal,
 * gratuito — NÃO é a Directions API nem considera acessibilidade do
 * campus; é a rota "externa/comum" para quem não precisa dos ajustes).
 */
export function openInGoogleMaps(latitude: number, longitude: number): void {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=walking`;
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  void Linking.openURL(url);
}
