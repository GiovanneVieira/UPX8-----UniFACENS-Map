import { NativeModules, Platform } from 'react-native';

/**
 * Wrapper JS para o módulo nativo CloudAnchorModule (Kotlin).
 *
 * Contorna o bug do Viro 3.0.3 onde resolveCloudAnchor pendura a promise
 * para sempre em resolves cross-session. O módulo nativo chama o ARCore
 * SDK diretamente (Session.resolveAnchorOnCloudAsync) e retorna a posição
 * em COORDENADAS DA SESSÃO AR (metros da origem).
 */

interface CloudAnchorResolveResult {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  cloudAnchorId: string;
}

interface CloudAnchorNativeModule {
  resolveCloudAnchor(cloudAnchorId: string): Promise<CloudAnchorResolveResult>;
  registerSession(): Promise<boolean>;
  isSessionAvailable(): Promise<boolean>;
}

const isAndroid = Platform.OS === 'android';
const CloudAnchorNative: CloudAnchorNativeModule | undefined = isAndroid
  ? (NativeModules.CloudAnchorNative as CloudAnchorNativeModule | undefined)
  : undefined;

/**
 * Resolve um cloud anchor pelo ID usando o módulo nativo (ARCore SDK direto).
 * Retorna a posição em coordenadas da SESSÃO AR (metros da origem) ou null
 * se o módulo não estiver disponível (iOS, web, etc).
 */
export async function resolveCloudAnchorNative(
  cloudAnchorId: string,
): Promise<CloudAnchorResolveResult | null> {
  if (!CloudAnchorNative) {
    console.warn('[CloudAnchorNative] módulo nativo não disponível nesta plataforma');
    return null;
  }
  return await CloudAnchorNative.resolveCloudAnchor(cloudAnchorId);
}

/**
 * Registra a sessão ARCore no módulo nativo (chamado quando a cena AR
 * fica pronta — após o tracking estabilizar).
 */
export async function registerARSession(): Promise<boolean> {
  if (!CloudAnchorNative) return false;
  return await CloudAnchorNative.registerSession();
}

/** Verifica se o módulo nativo tem acesso à sessão ARCore. */
export async function isARSessionAvailable(): Promise<boolean> {
  if (!CloudAnchorNative) return false;
  return await CloudAnchorNative.isSessionAvailable();
}

/** Extrai o yaw (rotação Y em graus) do quaternion retornado pelo resolve. */
export function quaternionToYawDeg(result: CloudAnchorResolveResult): number {
  // Yaw = rotação em torno do eixo Y
  // Para quaternion (qx, qy, qz, qw):
  // yaw = atan2(2(qw*qy + qx*qz), 1 - 2(qy² + qz²))
  const sinY = 2 * (result.qw * result.qy + result.qx * result.qz);
  const cosY = 1 - 2 * (result.qy * result.qy + result.qz * result.qz);
  const yawDeg = (Math.atan2(sinY, cosY) * 180) / Math.PI;
  return yawDeg;
}
