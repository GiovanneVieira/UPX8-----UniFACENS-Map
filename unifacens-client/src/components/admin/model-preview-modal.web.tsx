'use client';

import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { Model } from 'shared';
import { resolveAssetUrl } from '@/services/api';
import { AdminButton } from '@/features/admin/components/admin-ui';
import { AdminModalShell } from '@/components/ui/admin-modal-shell.web';
import {
  fitObjectToView,
  loadThreeFromCdn,
} from './three-cdn';
import { PREVIEWABLE_FORMATS } from './model-thumbnail.web';

/**
 * Preview 3D do modelo no navegador — three.js sob demanda via CDN ESM
 * (bundle do app intocado; mobile nem resolve este arquivo .web.tsx).
 * GLB/GLTF via GLTFLoader, OBJ via OBJLoader; órbita com auto-rotate.
 * Fecha com clique fora ou Esc (AdminModalShell).
 */
export function ModelPreviewModal({
  model,
  onClose,
}: {
  model: Model | null;
  onClose: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!model || !PREVIEWABLE_FORMATS.has(model.format)) return;
    let disposed = false;
    // Cleanup completo de tudo que o three aloca na GPU.
    let cleanup = () => {};

    (async () => {
      setLoading(true);
      setError('');
      try {
        const { THREE, GLTFLoader, OBJLoader, OrbitControls } =
          await loadThreeFromCdn();
        if (disposed || !mountRef.current) return;

        const mount = mountRef.current;
        const width = mount.clientWidth || 480;
        const height = mount.clientHeight || 360;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0f172a);
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
        camera.position.set(2.2, 1.6, 2.8);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        mount.appendChild(renderer.domElement);

        scene.add(new THREE.AmbientLight(0xffffff, 0.75));
        const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
        keyLight.position.set(3, 5, 2);
        scene.add(keyLight);
        const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.8);
        rimLight.position.set(-3, 2, -3);
        scene.add(rimLight);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 1.6;

        const grid = new THREE.GridHelper(4, 12, 0x334155, 0x1e293b);
        scene.add(grid);

        const url = resolveAssetUrl(model.url);
        const object3d =
          model.format === 'obj'
            ? await new OBJLoader().loadAsync(url)
            : (await new GLTFLoader().loadAsync(url)).scene;

        fitObjectToView(THREE, object3d, 1.6);
        scene.add(object3d);

        let frame = 0;
        const tick = () => {
          if (disposed) return;
          controls.update();
          renderer.render(scene, camera);
          frame = requestAnimationFrame(tick);
        };
        tick();

        const onResize = () => {
          const w = mount.clientWidth || width;
          const h = mount.clientHeight || height;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        window.addEventListener('resize', onResize);

        cleanup = () => {
          cancelAnimationFrame(frame);
          window.removeEventListener('resize', onResize);
          controls.dispose();
          scene.traverse((child: unknown) => {
            const mesh = child as {
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
      } catch (loadError) {
        if (!disposed) {
          setError(
            loadError instanceof Error
              ? `Não foi possível carregar o preview: ${loadError.message}`
              : 'Não foi possível carregar o preview.',
          );
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [model]);

  if (!model) return null;
  const previewable = PREVIEWABLE_FORMATS.has(model.format);
  void error;

  return (
    <AdminModalShell
      visible
      onClose={onClose}
      maxWidth="max-w-3xl"
      dismissable={!loading}
    >
      <View className="mb-4 flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="text-lg font-bold text-slate-900">{model.name}</Text>
          <Text className="text-xs text-slate-500">
            {model.format.toUpperCase()} · {(model.sizeBytes / 1024).toFixed(0)} KB ·
            preview interativo (arraste para girar, scroll para zoom)
          </Text>
        </View>
        <AdminButton onPress={onClose} label="Fechar preview">
          Fechar
        </AdminButton>
      </View>
      {previewable ? (
        <View className="relative">
          <div
            ref={mountRef}
            aria-label={`Preview 3D de ${model.name}`}
            style={{ width: '100%', height: 420, display: 'block' }}
          />
          {loading && (
            <View className="absolute inset-0 items-center justify-center rounded-xl bg-slate-950/60">
              <Text className="text-sm font-semibold text-white">
                Carregando preview 3D…
              </Text>
            </View>
          )}
          {error ? (
            <View className="absolute inset-0 items-center justify-center gap-2 rounded-xl bg-slate-950/80 p-6">
              <Text className="text-center text-sm text-red-200">{error}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View className="items-center gap-2 py-10">
          <Text className="text-base font-semibold text-slate-800">
            Sem preview para VRX
          </Text>
          <Text className="text-center text-sm text-slate-500">
            VRX é o formato proprietário do ViroReact — só é renderizado dentro
            do app AR. O arquivo continua válido para os pins.
          </Text>
        </View>
      )}
    </AdminModalShell>
  );
}
