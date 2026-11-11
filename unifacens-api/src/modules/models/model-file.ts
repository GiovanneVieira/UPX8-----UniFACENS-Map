import type { ModelFormat } from 'shared';

/**
 * Validação por magic bytes — nunca confiar em mimetype ou extensão sozinho.
 * Retorna o formato detectado ou null quando o conteúdo não casa com nenhum
 * formato suportado. VRX é proprietário (sem magic público): o chamador
 * aceita pela extensão + conteúdo não-vazio.
 */
export function detectModelFormat(buffer: Buffer): ModelFormat | null {
  if (buffer.length === 0) return null;

  // GLB: magic "glTF" (0x46546C67 little-endian) + versão.
  if (buffer.length >= 12 && buffer.readUInt32LE(0) === 0x46546c67) {
    return 'glb';
  }

  // FBX binário: "Kaydara FBX Binary  \x00\x1a\x00"
  const FBX_BINARY_MAGIC = 'Kaydara FBX Binary  \x00\x1a\x00';
  if (
    buffer.length >= FBX_BINARY_MAGIC.length &&
    buffer.subarray(0, FBX_BINARY_MAGIC.length).equals(
      Buffer.from(FBX_BINARY_MAGIC, 'binary'),
    )
  ) {
    return 'fbx';
  }

  const head = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('utf8');
  const trimmed = head.trimStart();

  // FBX ASCII: "; FBX ..." ou contém FBXHeaderExtension.
  if (trimmed.startsWith('; FBX') || head.includes('FBXHeaderExtension')) {
    return 'fbx';
  }

  // glTF JSON: objeto com asset.version 2.x e buffers sem uri externa.
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(buffer.toString('utf8')) as {
        asset?: { version?: string };
        buffers?: Array<{ uri?: string }>;
      };
      if (json?.asset?.version?.startsWith('2')) {
        const hasExternalBuffer = (json.buffers ?? []).some(
          (entry) => typeof entry.uri === 'string' && !entry.uri.startsWith('data:'),
        );
        if (hasExternalBuffer) {
          throw new Error(
            'glTF com buffers externos (.bin) não é suportado — exporte como GLB ou glTF embutido.',
          );
        }
        return 'gltf';
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('externos')) throw error;
      // JSON inválido: cai para as heurísticas seguintes.
    }
  }

  // OBJ: geometria textual — linhas iniciando com v/vt/vn/f/o.
  if (!trimmed.startsWith('{') && /^[\s]*(v|vt|vn|f|o)\s+/m.test(head)) {
    return 'obj';
  }

  return null;
}

/** Extensão → formato esperado (para conferir coerência com o conteúdo). */
export function extensionToFormat(
  extension: string,
): ModelFormat | null {
  const normalized = extension.toLowerCase().replace(/^\./, '');
  const map: Record<string, ModelFormat> = {
    glb: 'glb',
    gltf: 'gltf',
    obj: 'obj',
    fbx: 'fbx',
    vrx: 'vrx',
  };
  return map[normalized] ?? null;
}

/**
 * Valida conteúdo+extensão juntos. VRX é aceito somente pela extensão
 * (binário proprietário do Viro, sem magic documentado). FBX é recusado
 * com orientação: quem modela em FBX exporta GLB antes do upload.
 */
export function validateModelFile(
  buffer: Buffer,
  extension: string,
): { format: ModelFormat } {
  const expected = extensionToFormat(extension);
  if (expected === 'fbx') {
    throw new Error(
      'FBX não é aceito. Exporte o modelo como GLB (único arquivo, texturas embutidas) e envie novamente.',
    );
  }
  if (!expected) {
    throw new Error(
      `Extensão "${extension}" não suportada. Use .glb, .gltf, .obj ou .vrx.`,
    );
  }
  if (buffer.length === 0) {
    throw new Error('Arquivo vazio.');
  }
  if (expected === 'vrx') return { format: 'vrx' };

  const detected = detectModelFormat(buffer);
  if (!detected) {
    throw new Error(
      'Conteúdo não reconhecido como GLB, glTF ou OBJ. Exporte um arquivo único válido.',
    );
  }
  if (detected === 'fbx') {
    throw new Error(
      'Conteúdo FBX detectado. Exporte o modelo como GLB (único arquivo, texturas embutidas) e envie novamente.',
    );
  }
  if (detected !== expected) {
    throw new Error(
      `Extensão .${extension} não corresponde ao conteúdo detectado (${detected.toUpperCase()}). Renomeie o arquivo ou reexporte no formato correto.`,
    );
  }
  return { format: detected };
}
