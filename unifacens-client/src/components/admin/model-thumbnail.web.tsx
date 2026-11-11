'use client';

import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fitObjectToView, loadThreeFromCdn } from './three-cdn';

/** Formatos com render possível no navegador (VRX é proprietário do Viro). */
export const PREVIEWABLE_FORMATS = new Set(['glb', 'gltf', 'obj']);

/**
 * Miniatura 3D REAL do modelo (um frame estático): renderiza só quando o
 * card entra na viewport (IntersectionObserver) e libera a GPU ao sair.
 * Sem loop de animação — thumbnail é leve por definição.
 */
export function ModelThumbnail({
  url,
  format,
  label,
}: {
  url: string;
  format: string;
  label: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const previewable = PREVIEWABLE_FORMATS.has(format);

  useEffect(() => {
    if (!previewable || !mountRef.current) return;
    const mount = mountRef.current;
    let disposed = false;
    let cleanup = () => {};

    // Renderiza apenas quando visível — cards fora da página/viewport não gastam GPU.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();

        (async () => {
          setState('loading');
          try {
            const { THREE, GLTFLoader, OBJLoader } = await loadThreeFromCdn();
            if (disposed) return;
            const width = mount.clientWidth || 160;
            const height = mount.clientHeight || 120;

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0f172a);
            const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
            // MESMO enquadramento do preview modal (validado): fit 1.6 + esta
            // câmera centrava o cubo corretamente; fov menor deslocava o objeto.
            camera.position.set(2.2, 1.6, 2.8);
            // Sem OrbitControls aqui, a câmera olha para -Z por padrão — o
            // objeto na origem ficaria fora do frustum (só um canto aparecia).
            camera.lookAt(0, 0, 0);
            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(width, height);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            mount.appendChild(renderer.domElement);

            scene.add(new THREE.AmbientLight(0xffffff, 0.8));
            const key = new THREE.DirectionalLight(0xffffff, 2.2);
            key.position.set(3, 5, 2);
            scene.add(key);
            const rim = new THREE.DirectionalLight(0x93c5fd, 0.8);
            rim.position.set(-3, 2, -3);
            scene.add(rim);

            const object3d =
              format === 'obj'
                ? await new OBJLoader().loadAsync(url)
                : (await new GLTFLoader().loadAsync(url)).scene;
            if (disposed) return;
            fitObjectToView(THREE, object3d, 1.6);
            scene.add(object3d);
            renderer.render(scene, camera); // um único frame
            setState('ready'); // some com o overlay "renderizando…"

            cleanup = () => {
              scene.traverse((child) => {
                const mesh = child as unknown as {
                  geometry?: { dispose(): void };
                  material?: unknown;
                };
                mesh.geometry?.dispose();
                const material = mesh.material;
                if (Array.isArray(material)) {
                  material.forEach((entry) => (entry as { dispose(): void }).dispose());
                } else if (
                  material &&
                  typeof (material as { dispose?: () => void }).dispose === 'function'
                ) {
                  (material as { dispose(): void }).dispose();
                }
              });
              renderer.dispose();
              renderer.domElement.remove();
            };
          } catch {
            if (!disposed) setState('error');
          }
        })();
      },
      { rootMargin: '80px' },
    );
    observer.observe(mount);

    return () => {
      disposed = true;
      observer.disconnect();
      cleanup();
    };
  }, [url, format, previewable]);

  return (
    <View className="relative h-28 w-full overflow-hidden rounded-xl bg-slate-900">
      {previewable ? (
        <>
          <div
            ref={mountRef}
            aria-label={`Render de ${label}`}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
          {state === 'loading' && (
            <View className="absolute inset-0 items-center justify-center">
              <Text className="text-xs text-slate-400">renderizando…</Text>
            </View>
          )}
          {state === 'idle' && (
            <View className="absolute inset-0 items-center justify-center">
              <Text className="text-xs text-slate-400">preparando…</Text>
            </View>
          )}
          {state === 'error' && (
            <View className="absolute inset-0 items-center justify-center">
              <Ionicons name="alert-circle-outline" size={18} color="#fca5a5" />
              <Text className="mt-1 text-[10px] text-red-200">falha no render</Text>
            </View>
          )}
        </>
      ) : (
        <View className="flex-1 items-center justify-center gap-1">
          <Ionicons name="cube-outline" size={26} color="#64748b" />
          <Text className="text-[10px] text-slate-400">
            {format.toUpperCase()} · só no AR
          </Text>
        </View>
      )}
    </View>
  );
}
