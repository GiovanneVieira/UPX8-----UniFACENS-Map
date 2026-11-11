#!/usr/bin/env node
/**
 * Postinstall do client — padrão da doc do Expo para monorepos no EAS Build:
 * builda packages/shared durante o npm install (a nuvem EAS copia o source
 * completo ANTES de instalar; o app importa 'shared' de dist/).
 *
 * ⚠️ GUARDA (2026-11-11): o estágio "dependencies" do dockerfile da API
 * (Render/docker compose) copia APENAS os manifests (package.json) para
 * cache de camadas — sem o fonte do shared, o tsc deste script estourou o
 * deploy ("tsc" imprimia o help e o npm ci morria). Nesse estágio o build
 * é PULADO: o estágio builder do dockerfile compila o shared depois
 * (linha `RUN npm --workspace=shared run build`).
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const repoRoot = path.join(__dirname, '..', '..');
const sharedTsconfig = path.join(repoRoot, 'packages', 'shared', 'tsconfig.json');

if (!fs.existsSync(sharedTsconfig)) {
  console.log(
    '[client postinstall] fonte do packages/shared ausente (estágio deps do Docker) — pulando; o builder compilará depois',
  );
  process.exit(0);
}

execSync('npm run build --workspace=shared', { stdio: 'inherit', cwd: repoRoot });
