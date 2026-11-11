import { describe, expect, it } from 'vitest';
import {
  detectModelFormat,
  extensionToFormat,
  validateModelFile,
} from '../../../src/modules/models/model-file.js';

/** GLB sintético: magic "glTF" + versão 2 + length. */
function glbBuffer(extra: Buffer = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + extra.length, 8);
  return Buffer.concat([header, extra]);
}

const FBX_ASCII = Buffer.from(
  '; FBX 7.4.0 project file\nFBXHeaderExtension: {\n}\n',
  'utf8',
);

const OBJ_TEXT = Buffer.from(
  '# Blender v3.0\no Cube\nv 1.0 0.0 0.0\nv 0.0 1.0 0.0\nf 1 2 3\n',
  'utf8',
);

const GLTF_EMBEDDED = Buffer.from(
  JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{ uri: 'data:application/octet-stream;base64,AAAA' }],
  }),
);

const GLTF_EXTERNAL = Buffer.from(
  JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{ uri: 'scene.bin' }],
  }),
);

describe('detectModelFormat (magic bytes)', () => {
  it('detecta GLB pelo magic glTF', () => {
    expect(detectModelFormat(glbBuffer())).toBe('glb');
  });
  it('detecta FBX ASCII pelo cabeçalho', () => {
    expect(detectModelFormat(FBX_ASCII)).toBe('fbx');
  });
  it('detecta FBX binário pelo magic Kaydara', () => {
    const binary = Buffer.concat([
      Buffer.from('Kaydara FBX Binary  \x00\x1a\x00', 'binary'),
      Buffer.alloc(32),
    ]);
    expect(detectModelFormat(binary)).toBe('fbx');
  });
  it('detecta glTF JSON com buffers embutidos', () => {
    expect(detectModelFormat(GLTF_EMBEDDED)).toBe('gltf');
  });
  it('rejeita glTF JSON com buffer externo (.bin)', () => {
    expect(() => detectModelFormat(GLTF_EXTERNAL)).toThrow(/externos/);
  });
  it('detecta OBJ pela geometria textual', () => {
    expect(detectModelFormat(OBJ_TEXT)).toBe('obj');
  });
  it('retorna null para conteúdo desconhecido', () => {
    expect(detectModelFormat(Buffer.from('arquivo qualquer'))).toBeNull();
    expect(detectModelFormat(Buffer.alloc(0))).toBeNull();
  });
});

describe('validateModelFile (extensão × conteúdo)', () => {
  it('aceita VRX apenas pela extensão (binário proprietário)', () => {
    expect(validateModelFile(Buffer.from('vrx-opaque'), '.vrx').format).toBe('vrx');
  });
  it('aceita OBJ coerente', () => {
    expect(validateModelFile(OBJ_TEXT, 'obj').format).toBe('obj');
  });
  it('recusa FBX pela extensão com orientação de exportar GLB', () => {
    expect(() => validateModelFile(FBX_ASCII, 'fbx')).toThrow(/FBX não é aceito/);
  });
  it('recusa conteúdo FBX renomeado como .glb com orientação', () => {
    expect(() => validateModelFile(FBX_ASCII, '.glb')).toThrow(/FBX detectado/);
  });
  it('recusa extensão incoerente com o conteúdo', () => {
    expect(() => validateModelFile(glbBuffer(), 'obj')).toThrow(/não corresponde/);
  });
  it('recusa extensão fora da lista', () => {
    expect(() => validateModelFile(glbBuffer(), '.stl')).toThrow(/não suportada/);
  });
  it('recusa arquivo vazio', () => {
    expect(() => validateModelFile(Buffer.alloc(0), '.glb')).toThrow(/vazio/);
  });
});

describe('extensionToFormat', () => {
  it.each([
    ['glb', 'glb'],
    ['.gltf', 'gltf'],
    ['OBJ', 'obj'],
    ['fbx', 'fbx'],
    ['vrx', 'vrx'],
  ])('mapeia %s → %s', (extension, format) => {
    expect(extensionToFormat(extension)).toBe(format);
  });
  it('retorna null para extensão desconhecida', () => {
    expect(extensionToFormat('.zip')).toBeNull();
  });
});
