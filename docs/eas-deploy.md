# Deploy EAS Build via GitHub Actions

Pipeline: push na `main` que toca `unifacens-client/**` ou `packages/shared/**`
dispara build Android na nuvem do EAS (profile `preview` = APK). Manual:
Actions → *EAS Build (Android)* → Run workflow (escolhe `preview`/`production`).

- Workflow: `.github/workflows/eas-build.yml`
- Profiles: `unifacens-client/eas.json` (`preview` APK / `production` AAB)
- Monorepo: `postinstall` do client builda o `packages/shared` (padrão da doc
  do Expo para builds em monorepo).
- ⚠️ `eas.json` vive na root do **app directory** (`unifacens-client/`), não
  na raiz do monorepo — exigência da doc do Expo para monorepos (o CLI lê o
  projeto de lá).
- Node **22** na nuvem EAS (LTS garantido nas build images — exemplos
  oficiais); o Node 24 do dev/verify.yml fica no runner próprio, não precisa
  casar com a nuvem.

## Setup único (uma vez por conta/repo)

### 1. Conta Expo + projeto
```bash
npm i -g eas-cli
eas login                     # conta expo.dev
cd unifacens-client
eas init                      # cria o projeto e imprime o Project ID
```
Cole o UUID impresso no `app.config.ts` → `extra.eas.projectId` (ou exporte
`EAS_PROJECT_ID`). Commit.

### 2. Env vars de BUILD no EAS (as EXPO_PUBLIC_* de produção)
⚠️ O build roda na **nuvem EAS** — secrets do GitHub NÃO chegam lá. Criar em
https://expo.dev/accounts/<conta>/projects/<projeto>/environment-variables
**visibilidade Plaintext** (regra do EAS: vars `EXPO_PUBLIC_*` NÃO aceitam
"Secret" — são embutidas no bundle por design). As que são **keys** (AIza…,
rv_client_…) podem usar **Sensitive** (plaintext mascarado: oculto na UI e
nos logs do build; a proteção real das AIza continua sendo a restrição
package+SHA-1 no Google Console, e a rv_client é pública por design).
Ambientes **Preview + Production** (NÃO Development — dev local lê o
`.env` local):

| Variável | Valor (ver `.env.production` local) |
|---|---|
| `EXPO_PUBLIC_API_URL` | `https://unifacens-map-api-0drk.onrender.com` |
| `EXPO_PUBLIC_GOOGLE_AR_API_KEY` | AIza… (ARCore) |
| `EXPO_PUBLIC_RV_API_KEY` | `rv_client_1650c574…` (**projeto PROD** — ver abaixo) |
| `EXPO_PUBLIC_RV_PROJECT_ID` | `965ed7ef-…` (**projeto PROD**) |
| `EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY` | AIza… (Maps) |
| `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` | AIza… (Maps) |
| `EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID` | `ca8b07f4227a15f6374cde50` (real — NÃO o demo) |

⚠️ **Dois projetos ReactVision (decisão 2026-11-11)**: dev =
`4b9ee82c-1219-4890-a956-14b876c685c9` / prod = `965ed7ef-786d-418b-9367-834aae04a814`.
Cloud anchors são POR PROJETO: as âncoras hospedadas no dev **não existem** no
APK de prod (ficam ghost) — o campus real é re-mapeado no projeto prod. O
backend `ar-diagnostics` usa as env do `.env.api` (dev local = projeto dev);
para diagnosticar âncoras de prod, o Render precisará das keys prod.

⚠️ Nome da var: o client lê **`EXPO_PUBLIC_RV_API_KEY`** — `RV_CLIENT_API_KEY`
é o nome do *backend* (`.env.api`). Pegadinha que já mordeu 2× (2026-11-11).

(`EXPO_PUBLIC_AR_PROVIDER=reactvision` já vive no `eas.json` — não é secret.)

### 3. GitHub Secret do token
 expo.dev → Account Settings → **Access Tokens** → Create → copiar →
repo GitHub → Settings → Secrets and variables → **Actions** →
`EXPO_TOKEN` = token.

### 4. (Só para `production`/AAB) Keystore de release
O primeiro build `production` exige credenciais — rodar **local e interativo**
uma vez para o EAS gerar/gerenciar a keystore:
```bash
cd unifacens-client
eas build -p android --profile production   # escolher "generar keystore"
eas credentials -p android                  # ler o SHA-1 de release
```
Restringir a AR key e a Maps Android key no Google Cloud Console ao
package `com.giovannevq.unifacensclient` + este SHA-1 (debug builds usam
SHA-1 de debug — keys sem restrição enquanto houver build dev).

O profile `preview` (APK interno) NÃO precisa de keystore
(`withoutCredentials`).

## Quota
Plano free: **30 builds/mês**. Mitigações já no workflow: filtro de paths
(só dispara em mudanças significativas), `paths-ignore` de docs e
`concurrency` cancelando builds superseded.
