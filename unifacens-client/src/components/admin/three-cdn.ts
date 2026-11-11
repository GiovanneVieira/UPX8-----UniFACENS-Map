/**
 * Carregamento sob demanda do three.js via CDN ESM (esm.sh) — compartilhado
 * pelo preview 3D (model-preview-modal) e pelos thumbnails (model-thumbnail).
 * O import vive DENTRO de <script type="module"> criado em runtime: string
 * não é analisada pelo Metro (que não resolve URLs de import) e o navegador
 * resolve os módulos nativamente. Zero impacto no bundle do app.
 */

export interface ThreeVector3Like {
  x: number;
  y: number;
  z: number;
}

export type ThreeModule = {
  Scene: new () => {
    background: unknown;
    add: (object: unknown) => void;
    traverse: (callback: (child: unknown) => void) => void;
  };
  Color: new (color: number) => unknown;
  PerspectiveCamera: new (
    fov: number,
    aspect: number,
    near: number,
    far: number,
  ) => {
    position: { set: (x: number, y: number, z: number) => void };
    aspect: number;
    updateProjectionMatrix: () => void;
    lookAt: (x: number, y: number, z: number) => void;
  };
  WebGLRenderer: new (options: {
    antialias?: boolean;
    alpha?: boolean;
    preserveDrawingBuffer?: boolean;
  }) => {
    setSize: (w: number, h: number) => void;
    setPixelRatio: (ratio: number) => void;
    render: (scene: unknown, camera: unknown) => void;
    dispose: () => void;
    domElement: HTMLCanvasElement;
  };
  AmbientLight: new (color: number, intensity: number) => unknown;
  DirectionalLight: new (color: number, intensity: number) => {
    position: { set: (x: number, y: number, z: number) => void };
  };
  GridHelper: new (
    size: number,
    divisions: number,
    colorCenter: number,
    colorGrid: number,
  ) => unknown;
  Box3: new () => {
    setFromObject: (
      object: unknown,
    ) => {
      getSize: (v: ThreeVector3Like) => ThreeVector3Like;
      getCenter: (v: ThreeVector3Like) => ThreeVector3Like;
    };
  };
  Vector3: new () => ThreeVector3Like;
};

export interface OrbitControlsLike {
  enableDamping: boolean;
  autoRotate: boolean;
  autoRotateSpeed: number;
  update(): void;
  dispose(): void;
}

export interface ThreeBundle {
  THREE: ThreeModule;
  GLTFLoader: new () => { loadAsync(url: string): Promise<{ scene: unknown }> };
  OBJLoader: new () => { loadAsync(url: string): Promise<unknown> };
  OrbitControls: new (camera: unknown, dom: HTMLElement) => OrbitControlsLike;
}

let bundlePromise: Promise<ThreeBundle> | null = null;

/** Carrega (uma única vez por página) o three.js + loaders do CDN. */
export function loadThreeFromCdn(): Promise<ThreeBundle> {
  if (bundlePromise) return bundlePromise;
  bundlePromise = new Promise<ThreeBundle>((resolve, reject) => {
    const globalKey = '__unifacensThreeBundle__';
    const readyEvent = `${globalKey}:ready`;
    const existing = (window as unknown as Record<string, ThreeBundle | undefined>)[globalKey];
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = [
      'const [THREE, GLTF, OBJ, ORBIT] = await Promise.all([',
      "  import('https://esm.sh/three@0.169.0'),",
      "  import('https://esm.sh/three@0.169.0/examples/jsm/loaders/GLTFLoader.js'),",
      "  import('https://esm.sh/three@0.169.0/examples/jsm/loaders/OBJLoader.js'),",
      "  import('https://esm.sh/three@0.169.0/examples/jsm/controls/OrbitControls.js'),",
      ']);',
      `window.${globalKey} = { THREE, GLTFLoader: GLTF.GLTFLoader, OBJLoader: OBJ.OBJLoader, OrbitControls: ORBIT.OrbitControls };`,
      `window.dispatchEvent(new CustomEvent('${readyEvent}'));`,
    ].join('\n');
    script.addEventListener('error', () =>
      reject(new Error('Falha ao baixar three.js do CDN (esm.sh).')),
    );
    window.addEventListener(
      readyEvent,
      () => {
        const bundle = (window as unknown as Record<string, ThreeBundle>)[globalKey];
        if (bundle) resolve(bundle);
        else reject(new Error('Bundle three.js ausente.'));
      },
      { once: true },
    );
    document.head.appendChild(script);
  }).catch((error) => {
    // Falha não deve cachear: próxima tentativa recarrega.
    bundlePromise = null;
    throw error;
  });
  return bundlePromise;
}

/** Centraliza e escala o objeto para caber num enquadramento padrão. */
export function fitObjectToView(
  THREE: ThreeModule,
  object3d: unknown,
  targetSize = 1.6,
): void {
  const positioned = object3d as {
    position: { sub: (v: ThreeVector3Like) => void };
    scale: { multiplyScalar: (s: number) => void };
  };
  const box = new THREE.Box3().setFromObject(object3d);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  positioned.position.sub(center);
  positioned.scale.multiplyScalar(targetSize / maxDim);
}
