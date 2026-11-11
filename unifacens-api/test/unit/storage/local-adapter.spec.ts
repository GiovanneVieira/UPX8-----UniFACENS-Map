import { describe, expect, it, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  assertSafeKey,
  storageKeys,
} from '../../../src/modules/storage/storage.types.js';
import { LocalStorageAdapter } from '../../../src/modules/storage/local.adapter.js';

describe('LocalStorageAdapter (adapter de dev/testes)', () => {
  let root: string;
  let adapter: LocalStorageAdapter;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-spec-'));
    // Prefixo explícito — o default deriva de NODE_ENV e quebraria o isolamento do teste.
    adapter = new LocalStorageAdapter(root, 'dev');
  });

  it('put aplica o prefixo de ambiente e devolve chave canônica + URL', async () => {
    const { key, url } = await adapter.put(
      storageKeys.pointImage('abc', 'foto.png'),
      Buffer.from('png-bytes'),
      'image/png',
    );
    expect(key).toBe('dev/points/images/abc/foto.png');
    expect(url).toBe('/uploads/dev/points/images/abc/foto.png');
    expect(
      fs
        .readFileSync(path.join(root, 'dev/points/images/abc/foto.png'))
        .toString(),
    ).toBe('png-bytes');
  });

  it('prefixo prod separa ambientes no mesmo root', async () => {
    const prod = new LocalStorageAdapter(root, 'prod');
    await prod.put('points/images/x/a.png', Buffer.from('p'), 'image/png');
    expect(fs.existsSync(path.join(root, 'prod/points/images/x/a.png'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'dev/points/images/x/a.png'))).toBe(false);
  });

  it('chave já prefixada não ganha prefixo duplicado', async () => {
    const { key } = await adapter.put('dev/pontos/a.png', Buffer.from('x'), 'image/png');
    expect(key).toBe('dev/pontos/a.png');
  });

  it('delete remove o objeto e é idempotente (aceita chave ou URL)', async () => {
    const { key, url } = await adapter.put('models/originals/m/a.glb', Buffer.from('x'), 'model/gltf-binary');
    await adapter.delete(url);
    expect(fs.existsSync(path.join(root, key))).toBe(false);
    await expect(adapter.delete(key)).resolves.toBeUndefined();
  });

  it('chaves legadas sem prefixo continuam resolvendo (pré-migração)', async () => {
    // Arquivo gravado antes do prefixo existir.
    const legacyPath = path.join(root, 'points/images/old/f.png');
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, 'legacy');
    expect(adapter.url('points/images/old/f.png')).toBe('/uploads/points/images/old/f.png');
    await expect(adapter.delete('points/images/old/f.png')).resolves.toBeUndefined();
    expect(fs.existsSync(legacyPath)).toBe(false);
  });

  it('trata URLs legadas /uploads/... (pré-S3) no url/keyFor', async () => {
    expect(adapter.url('/uploads/anchors/123/img.jpg')).toBe('/uploads/anchors/123/img.jpg');
    expect(adapter.keyFor('/uploads/dev/points/a.png')).toBe('dev/points/a.png');
    expect(adapter.keyFor('/uploads/points/a.png')).toBe('points/a.png');
  });

  it('rejeita path traversal na resolução', () => {
    expect(() => assertSafeKey('../etc/passwd')).toThrow();
    expect(() => assertSafeKey('/absoluto')).toThrow();
    expect(() => assertSafeKey('dev/points/images/abc/foto.png')).not.toThrow();
  });
});
