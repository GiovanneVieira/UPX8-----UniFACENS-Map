import type { BoundingBox, ModelFormat } from 'shared';

/**
 * ── Bounding box canônico de modelos 3D (parser puro, zero deps) ─────────
 * Computado 1× no upload e persistido em `models.bounding_box`. Os consumers
 * (Viro3DObjectPin no AR) derivam scale/offset daqui — o fim do "modelo
 * nasce longe da âncora/origem" para arquivos com pivô deslocado (o Viro
 * não expõe bbox em runtime, por isso o backend é o lugar do conhecimento).
 *
 * - GLB: header 12B + chunks; o 1º chunk é JSON (glTF 2.0). Accessors de
 *   POSITION carregam `min`/`max` OBRIGATÓRIOS pela spec — o parser compõe
 *   com as transforms dos nós (TRS ou matrix, column-major) transformando
 *   os 8 cantos de cada AABB (correto sob rotação arbitrária).
 * - GLTF: mesmo JSON direto (o validador já exige buffers embutidos).
 * - OBJ: scan das linhas `v x y z`.
 * - VRX: binário proprietário → null (fallback honesto no AR).
 *
 * Skinned meshes usam o transform do node (bind pose — suficiente para
 * marcadores low-poly); morph targets são ignorados (accessor base).
 */

/** Matriz 4×4 column-major (convenção glTF: m[i + 4*j] = linha i, coluna j). */
type Mat4 = number[];

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = Array.from({ length: 16 }, () => 0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[row + 4 * k] * b[k + 4 * col];
      out[row + 4 * col] = sum;
    }
  }
  return out;
}

/** Node matrix do glTF: node.matrix direto ou composição T·R·S. */
function nodeMatrix(node: GltfNode): Mat4 {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) {
    return [...node.matrix] as Mat4;
  }
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  // R (row-major) com escala por coluna (R·S) + translação na 4ª coluna.
  return [
    (1 - 2 * (qy * qy + qz * qz)) * sx,
    2 * (qx * qy + qw * qz) * sx,
    2 * (qx * qz - qw * qy) * sx,
    0,
    2 * (qx * qy - qw * qz) * sy,
    (1 - 2 * (qx * qx + qz * qz)) * sy,
    2 * (qy * qz + qw * qx) * sy,
    0,
    2 * (qx * qz + qw * qy) * sz,
    2 * (qy * qz - qw * qx) * sz,
    (1 - 2 * (qx * qx + qy * qy)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

function transformPoint(m: Mat4, p: readonly number[]): [number, number, number] {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

interface GltfNode {
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}

interface GltfJson {
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: { primitives?: { attributes?: { POSITION?: number } }[] }[];
  accessors?: { min?: number[]; max?: number[] }[];
}

function accumulateBox(
  box: { min: [number, number, number]; max: [number, number, number] } | null,
  point: readonly number[],
) {
  if (!box) {
    return {
      min: [point[0], point[1], point[2]] as [number, number, number],
      max: [point[0], point[1], point[2]] as [number, number, number],
    };
  }
  for (let i = 0; i < 3; i += 1) {
    box.min[i] = Math.min(box.min[i], point[i]);
    box.max[i] = Math.max(box.max[i], point[i]);
  }
  return box;
}

/** Percorre a cena acumulando o AABB de cada primitive transformado pelos 8 cantos. */
function bboxFromGltf(json: GltfJson): BoundingBox | null {
  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  const accessors = json.accessors ?? [];
  let box: { min: [number, number, number]; max: [number, number, number] } | null = null;

  const visit = (nodeIndex: number, parent: Mat4) => {
    const node = nodes[nodeIndex];
    if (!node) return;
    const world = mat4Multiply(parent, nodeMatrix(node));

    if (typeof node.mesh === 'number') {
      for (const primitive of meshes[node.mesh]?.primitives ?? []) {
        const accessorIndex = primitive.attributes?.POSITION;
        if (typeof accessorIndex !== 'number') continue;
        const accessor = accessors[accessorIndex];
        // spec glTF: accessors de POSITION EXIGEM min/max. Sem eles
        // (arquivo malformado) → null (fallback honesto).
        if (
          !accessor?.min ||
          !accessor?.max ||
          accessor.min.length < 3 ||
          accessor.max.length < 3
        ) {
          continue; // malformado: pula o primitive (fallback cobre o resto)
        }
        const min = accessor.min;
        const max = accessor.max;
        for (const cx of [min[0], max[0]]) {
          for (const cy of [min[1], max[1]]) {
            for (const cz of [min[2], max[2]]) {
              box = accumulateBox(box, transformPoint(world, [cx, cy, cz]));
            }
          }
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };

  const roots = json.scenes?.[0]?.nodes ?? nodes.map((_, index) => index);
  for (const root of roots) visit(root, IDENTITY);
  return box;
}

/** Extrai o JSON do container GLB (1º chunk — type 0x4E4F534A 'JSON'). */
function glbJsonChunk(buffer: Buffer): GltfJson | null {
  if (buffer.length < 20) return null;
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546c67) return null; // 'glTF'
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    if (chunkType === 0x4e4f534a) {
      try {
        return JSON.parse(buffer.subarray(offset + 8, offset + 8 + chunkLength).toString('utf8')) as GltfJson;
      } catch {
        return null;
      }
    }
    offset += 8 + chunkLength;
  }
  return null;
}

function bboxFromObj(buffer: Buffer): BoundingBox | null {
  let box: { min: [number, number, number]; max: [number, number, number] } | null = null;
  const text = buffer.toString('utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('v ') && !line.startsWith('v\t')) continue;
    const parts = line.slice(1).trim().split(/\s+/);
    const x = Number.parseFloat(parts[0] ?? '');
    const y = Number.parseFloat(parts[1] ?? '0');
    const z = Number.parseFloat(parts[2] ?? '0');
    if (!Number.isFinite(x)) continue;
    box = accumulateBox(box, [x, y, z]);
  }
  return box;
}

/**
 * Computa o bounding box canônico do arquivo. Retorna null quando o formato
 * não permite (VRX) ou o arquivo está malformado — consumers fazem fallback.
 */
export function computeModelBoundingBox(
  buffer: Buffer,
  format: ModelFormat,
): BoundingBox | null {
  try {
    if (format === 'glb') {
      const json = glbJsonChunk(buffer);
      return json ? bboxFromGltf(json) : null;
    }
    if (format === 'gltf') {
      const json = JSON.parse(buffer.toString('utf8')) as GltfJson;
      return bboxFromGltf(json);
    }
    if (format === 'obj') {
      return bboxFromObj(buffer);
    }
    return null; // vrx (e fbx, recusado antes de chegar aqui)
  } catch {
    return null;
  }
}
