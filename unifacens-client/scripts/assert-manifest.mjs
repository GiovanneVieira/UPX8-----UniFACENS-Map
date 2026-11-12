#!/usr/bin/env node
/**
 * Gate de invariantes do manifesto Android (CNG) — 2026-11-12.
 *
 * O QUÊ: roda `expo prebuild --no-install --clean` (gera `android/` efêmero),
 * lê o AndroidManifest.xml resultante e EXIGE as meta-data críticas presentes
 * e não-vazias.
 *
 * POR QUÊ: um prebuild pode ter SUCESSO gerando um manifesto INCOMPLETO —
 * o APK compila, instala e só CRASHA em runtime na primeira MapView
 * (`IllegalStateException: API key not found` — lição 2026-11-11,
 * meta-data `com.google.android.geo.API_KEY` ausente; o `expo export` do
 * verify não valida nada nativo). Este gate transforma essa classe de erro
 * em vermelho de ~2min no CI, ANTES de queimar quota/fila do EAS.
 *
 * ONDE RODA:
 *   - verify.yml (todo push/PR) — feedback antecipado;
 *   - eas-build.yml — ANTES do `eas build`: se falhar, a build nem é
 *     submetida à fila.
 *
 * ⚠️ Env: as EXPO_PUBLIC_* do ambiente alimentam o app.config.ts. No CI use
 * valores DUMMY — o gate valida o pipeline config→manifesto (estrutura), não
 * os segredos reais (que vivem nas EAS Environment Variables da nuvem).
 * ⚠️ `--clean` regenera `android/` (CNG não-versionado — nunca editar à mão).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MANIFEST_PATH = join(
  ROOT,
  'android',
  'app',
  'src',
  'main',
  'AndroidManifest.xml',
);

/** Meta-data que o app NÃO funciona sem (adicione aqui quando surgirem novas chaves nativas). */
const REQUIRED_META = [
  'com.google.android.geo.API_KEY',
  'com.google.android.ar.API_KEY',
  'com.reactvision.RVApiKey',
  'com.reactvision.RVProjectId',
];

console.log('[assert-manifest] expo prebuild --no-install --clean (gera android/ efêmero)…');
const prebuild = spawnSync(
  'npx expo prebuild --no-install --clean --platform android',
  { cwd: ROOT, stdio: 'inherit', shell: true },
);
if (prebuild.status !== 0) {
  console.error(
    '[assert-manifest] FALHA no prebuild — erro de config/plugin acima (seria 1 build EAS queimada).',
  );
  process.exit(prebuild.status ?? 1);
}

if (!existsSync(MANIFEST_PATH)) {
  console.error(`[assert-manifest] FALHA: manifesto não gerado em ${MANIFEST_PATH}`);
  process.exit(1);
}

const xml = readFileSync(MANIFEST_PATH, 'utf8');
const found = new Map();
for (const tag of xml.matchAll(/<meta-data\b[^>]*>/g)) {
  const name = /android:name="([^"]+)"/.exec(tag[0])?.[1];
  const value = /android:value="([^"]*)"/.exec(tag[0])?.[1];
  if (name) found.set(name, value ?? '');
}

let failures = 0;
for (const key of REQUIRED_META) {
  const value = found.get(key);
  if (value === undefined) {
    console.error(`[assert-manifest] ✗ ${key} — AUSENTE no AndroidManifest.xml`);
    failures += 1;
  } else if (value.trim() === '') {
    console.error(`[assert-manifest] ✗ ${key} — presente porém VAZIA`);
    failures += 1;
  } else {
    console.log(`[assert-manifest] ✓ ${key}`);
  }
}

if (failures > 0) {
  console.error(
    `\n[assert-manifest] ${failures} invariante(s) quebrada(s). Causas comuns: env EXPO_PUBLIC_* ausente no ambiente do prebuild (use dummies no CI), app.config.ts sem repassar a env ao plugin, ou plugin que deixou de escrever a meta-data.`,
  );
  process.exit(1);
}
console.log('[assert-manifest] Manifesto OK — invariantes nativas garantidas.');
