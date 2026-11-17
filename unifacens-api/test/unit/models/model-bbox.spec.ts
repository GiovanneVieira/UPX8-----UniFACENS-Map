import { describe, expect, it } from 'vitest';
import { computeModelBoundingBox } from '../../../src/modules/models/model-bbox.js';

/** Constrói um GLB 2.0 mínimo: header + chunk JSON (padded) + chunk BIN vazio. */
function buildGlb(json: object): Buffer {
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const pad = (4 - (jsonBuf.length % 4)) % 4;
  const jsonPadded = Buffer.concat([jsonBuf, Buffer.alloc(pad, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonPadded.length + 8, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonPadded.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(0, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'
  return Buffer.concat([header, jsonHeader, jsonPadded, binHeader]);
}

function gltfJson(overrides: Record<string, unknown> = {}) {
  return {
    asset: { version: '2.0' },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ min: [-1, -1, -1], max: [1, 1, 1] }],
    ...overrides,
  };
}

const SQ = Math.SQRT1_2;

describe('computeModelBoundingBox (parser puro)', () => {
  it('GLB sem transform: bbox = min/max do accessor', () => {
    const bbox = computeModelBoundingBox(buildGlb(gltfJson()), 'glb');
    expect(bbox).toEqual({ min: [-1, -1, -1], max: [1, 1, 1] });
  });

  it('GLB com node translation desloca o bbox (pivô do autor compensado no AR)', () => {
    const json = gltfJson({
      nodes: [{ mesh: 0, translation: [100, 0, 50] }],
    });
    const bbox = computeModelBoundingBox(buildGlb(json), 'glb');
    expect(bbox).toEqual({ min: [99, -1, 49], max: [101, 1, 51] });
  });

  it('GLB com rotação 90° em Y gira o bbox (cantos transformados, não min/max)', () => {
    // Quaternion [x,y,z,w] de +90° em Y: ponto [1,0,0] → [0,0,-1].
    const json = gltfJson({
      nodes: [{ mesh: 0, rotation: [0, SQ, 0, SQ] }],
    });
    const bbox = computeModelBoundingBox(buildGlb(json), 'glb');
    // AABB do cubo girado em 90° coincide por simetria (com tolerância FP).
    for (const axis of [0, 1, 2] as const) {
      expect(bbox?.min[axis]).toBeCloseTo(-1, 9);
      expect(bbox?.max[axis]).toBeCloseTo(1, 9);
    }
  });

  it('GLB com rotação 45° em Y: AABB cresce (diagonal projetada)', () => {
    // Quaternion [x,y,z,w] de +45° em Y: [0, sin(22.5°), 0, cos(22.5°)].
    const json = gltfJson({
      nodes: [{ mesh: 0, rotation: [0, 0.3826834323650898, 0, 0.9238795325112867] }],
      accessors: [{ min: [0, 0, 0], max: [2, 0, 0] }],
    });
    const bbox = computeModelBoundingBox(buildGlb(json), 'glb');
    // Segmento [0..2] no eixo X girado +45° em Y: x' = 2·cos45 ≈ 1.414, z' = -2·sin45.
    expect(bbox?.max[0]).toBeCloseTo(Math.SQRT2, 5);
    expect(bbox?.min[2]).toBeCloseTo(-Math.SQRT2, 5);
    expect(bbox?.max[2]).toBeCloseTo(0, 5);
  });

  it('GLB com hierarquia de nós compõe transforms pai·filho', () => {
    const json = gltfJson({
      scenes: [{ nodes: [0] }],
      nodes: [
        { children: [1], translation: [10, 0, 0] },
        { mesh: 0, translation: [0, 5, 0] },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [{ min: [-1, -1, -1], max: [1, 1, 1] }],
    });
    const bbox = computeModelBoundingBox(buildGlb(json), 'glb');
    expect(bbox).toEqual({ min: [9, 4, -1], max: [11, 6, 1] });
  });

  it('GLB com node.matrix (column-major) é respeitado', () => {
    // matrix = escala 2 no eixo X: column-major [2,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
    const json = gltfJson({
      nodes: [{ mesh: 0, matrix: [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }],
    });
    const bbox = computeModelBoundingBox(buildGlb(json), 'glb');
    expect(bbox).toEqual({ min: [-2, -1, -1], max: [2, 1, 1] });
  });

  it('GLTF textual (JSON direto) sem binário também parseia', () => {
    const buffer = Buffer.from(JSON.stringify(gltfJson()), 'utf8');
    const bbox = computeModelBoundingBox(buffer, 'gltf');
    expect(bbox).toEqual({ min: [-1, -1, -1], max: [1, 1, 1] });
  });

  it('accessor sem min/max (malformado) → null (fallback honesto)', () => {
    const json = gltfJson({ accessors: [{}] });
    expect(computeModelBoundingBox(buildGlb(json), 'glb')).toBeNull();
  });

  it('OBJ: scan das linhas "v x y z" (w ignora, vn/vt não contam)', () => {
    const obj = [
      '# comment',
      'vt 999 999',
      'vn 888 888 888',
      'v 0 0 0',
      'v 10 -5 3',
      'v 5 2 1 1', // w extra é ignorado (posições 0..2)
      '',
    ].join('\n');
    const bbox = computeModelBoundingBox(Buffer.from(obj, 'utf8'), 'obj');
    expect(bbox).toEqual({ min: [0, -5, 0], max: [10, 2, 3] });
  });

  it('VRX e formatos desconhecidos → null', () => {
    expect(computeModelBoundingBox(Buffer.from('binario'), 'vrx')).toBeNull();
    expect(computeModelBoundingBox(Buffer.from('x'), 'fbx')).toBeNull();
  });

  it('GLB truncado/não-GLB → null sem lançar', () => {
    expect(computeModelBoundingBox(Buffer.alloc(4), 'glb')).toBeNull();
  });
});
