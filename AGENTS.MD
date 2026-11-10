# 🧭 Diretrizes de Desenvolvimento e Arquitetura para Agentes (AGENTS.MD)
> **UniFACENS-Map** — Monorepo de Navegação no Campus & Realidade Aumentada (AR)
> Este documento é a fonte primária de verdade (SSOT) técnica e arquitetural para agentes de IA e desenvolvedores que operam neste repositório.

---

## 📑 Sumário
1. [Guia Pré-Ação: Catálogo de Skills & Slash Commands Obrigatórios](#1-guia-pré-ação-catálogo-de-skills--slash-commands-obrigatórios)
2. [Visão Geral do Projeto & Stack](#2-visão-geral-do-projeto--stack)
3. [Estrutura do Monorepo & Montagem dos Packages](#3-estrutura-do-monorepo--montagem-dos-packages)
4. [Princípios de Engenharia de Software (SOLID & Clean Code)](#4-princípios-de-engenharia-de-software-solid--clean-code)
5. [Backend (`unifacens-api`): Drizzle ORM, Performance & Prevenção de N+1](#5-backend-unifacens-api-drizzle-orm-performance--prevenção-de-n1)
6. [Frontend (`unifacens-client`): Arquitetura & Regra de Ouro de Estilização](#6-frontend-unifacens-client-arquitetura--regra-de-ouro-de-estilização)
7. [Regras Críticas do `useEffect` ("You Might Not Need an Effect")](#7-regras-críticas-do-useeffect-you-might-not-need-an-effect)
8. [Arquitetura de Estado: TanStack Query v5, Zustand v5 & TanStack Form](#8-arquitetura-de-estado-tanstack-query-v5-zustand-v5--tanstack-form)
9. [Fluxo de Desenvolvimento, Comandos & Checklist Consistente](#9-fluxo-de-desenvolvimento-comandos--checklist-consistente)
10. [Validação Visual e Acessibilidade (UI Visual Validation & WCAG)](#10-validação-visual-e-acessibilidade-ui-visual-validation--wcag)
11. [Diretrizes de Realidade Aumentada (ViroReact) & Sistema de Coordenadas 3D](#11-diretrizes-de-realidade-aumentada-viroreact--sistema-de-coordenadas-3d)
12. [Arquitetura de Câmera, Zoom Suave (Smooth 60 FPS) & Troubleshooting](#12-arquitetura-de-câmera-zoom-suave-smooth-60-fps--troubleshooting)
13. [Autenticação better-auth (JWT, Roles e Secret Storage)](#13-autenticação-better-auth-jwt-roles-e-secret-storage)
14. [AuthGate, Espelho UniFacens e Matriz de Capacidades (plano v2)](#14-authgate-espelho-unifacens-e-matriz-de-capacidades-plano-v2)
15. [ViroReact 3.1.x — Providers, Cloud/Geospatial API e Invariantes](#15-viroreact-31x--providers-cloudgeospatial-api-e-invariantes)

---

## 1. Guia Pré-Ação: Catálogo de Skills & Slash Commands Obrigatórios

Antes de executar qualquer comando ou alteração de código, o agente **DEVE** identificar a natureza da tarefa e ativar proativamente as skills e slash commands recomendados:

| Slash Command / Skill | Quando Ativar Obrigatoriamente | O que Executar Antes de Modificar Código |
| :--- | :--- | :--- |
| **`/plan`** | **Sempre que a tarefa envolver múltiplas etapas, correções estruturais, refatorações ou decisões de design.** | 1. Diagnosticar a causa raiz sem alterar arquivos.<br>2. Criar o artefato `implementation_plan.md` com `RequestFeedback: true`.<br>3. **Aguardar aprovação explícita** do usuário antes de editar código ou rodar scripts destrutivos. |
| **`/react-native-architecture`** | **Ao projetar ou refatorar telas, componentes de UI, navegação no Expo Router ou fluxo de dados no cliente.** | 1. Seguir padrões de feature-driven design.<br>2. Modularizar estados locais vs globais.<br>3. Aplicar separação estrita de container vs presentational. |
| **`/mobile-developer`** | **Ao lidar com código nativo (Android/iOS), ViroReact, sensores de hardware, permissões, bugs de layout em telas físicas (notch, safe areas) ou performance de câmera.** | 1. Consultar particularidades de permissões Android e lifecycle nativo.<br>2. Garantir 60 FPS com `useNativeDriver: true`.<br>3. Testar via ADB no dispositivo conectado. |
| **`/learn`** | **Sempre que um bug complexo for resolvido, uma alucinação de regra for corrigida ou o usuário solicitar persistência de aprendizado.** | 1. Atualizar o `learning_proposal.md` com `RequestFeedback: true`.<br>2. Persistir guardrails no `AGENTS.MD` para evitar repetição do erro em sessões futuras. |
| **`/tdd-workflows-tdd-cycle`** | **Ao implementar novas rotas, regras de negócio ou serviços no backend (`unifacens-api`).** | 1. Escrever testes de integração com Testcontainers (`.spec.ts`) primeiro.<br>2. Implementar a regra mínima no service/controller.<br>3. Garantir 100% dos testes passando. |
| **`/search-specialist` / `/browser`** | **Sempre que um problema persistente de biblioteca de terceiros, ARCore, GLSurfaceView ou comportamento nativo não puder ser solucionado apenas com inspeção local.** | 1. Pesquisar documentações técnicas atualizadas, upstream repositories e papers da indústria.<br>2. Comparar trade-offs de soluções (ex: Marcadores Fiduciais vs Cloud Anchors vs VPS).<br>3. Estruturar a estratégia comprovada antes de codificar. |
| **`/ui-visual-validator`** | **Sempre que criar ou alterar elementos visuais, botões, modais ou layouts.** | 1. Verificar hierarquia visual, contraste WCAG (mínimo 4.5:1).<br>2. Garantir área de toque mínima de 44x44 dp.<br>3. Capturar screenshot via `adb exec-out screencap -p` para comprovação visual. |

---

## 2. Visão Geral do Projeto & Stack

O **UniFACENS-Map** é uma plataforma que mapeia e fornece navegação interativa pelo campus da UniFACENS, combinando geolocalização e **Realidade Aumentada (AR)** para guiar estudantes, professores e visitantes entre blocos, salas de aula, laboratórios e pontos de interesse.

### 🧱 Stacks por Camada

| Camada / Package | Tecnologias Principais | Propósito |
| :--- | :--- | :--- |
| **`packages/shared`** | TypeScript 7+, Node.js (ESM), Zod | Contratos de tipos, DTOs, schemas de validação, constantes e enums universais. |
| **`unifacens-api`** | NestJS 12 (ESM), Drizzle ORM, PostgreSQL (`pg`), Vitest, Oxlint, Testcontainers | API RESTful, rotas do campus, persistência de blocos, salas e POIs. |
| **`unifacens-client`** | Expo SDK 57, React Native 0.86, React 19, Expo Router, NativeWind 4, TanStack Query v5, Zustand v5, TanStack Form, ViroReact (`@reactvision/react-viro`) | App Mobile (Android/iOS) e Web com renderização 2D de mapa e projeção AR na câmera. |
| **Infraestrutura** | Docker Compose, PostgreSQL 16 | Execução local isolada do banco de dados e serviços do monorepo. |

---

## 3. Estrutura do Monorepo & Montagem dos Packages

O repositório adota **NPM Workspaces**:
```json
"workspaces": [
  "./packages/*",
  "./unifacens-api",
  "./unifacens-client"
]
```

### 📦 3.1 Package `packages/shared` (Single Source of Truth)
- **Schemas Zod Centrais**: Todos os schemas residem em `packages/shared/src/schemas/`.
- **Tipos TypeScript Inferidos**: Derivados via `z.infer<typeof schema>`.
- **Princípio da Dependência Única de Validação**: Apenas `packages/shared` declara `"zod"` em `dependencies`. A API e o Client importam `z`, schemas e tipos diretamente de `'shared'`.
- **Proibido em `shared`**: Qualquer dependência de React, React Native, Expo, NestJS ou drivers de banco (`pg`, `drizzle-orm`).

### 🚀 3.2 Package `unifacens-api`
- Servidor NestJS 12 em ESM nativo (`"type": "module"`).
- Estrutura modular: `common/`, `config/`, `db/` (schema Drizzle + migrations), `modules/` (features verticais com controller, service, repository).
- Validação de entrada via `ZodValidationPipe` universal.

### 📱 3.3 Package `unifacens-client`
- Expo SDK 57 com Expo Router e React 19.
- Estrutura:
  - `src/app/`: Rotas finas do Expo Router (`_layout.tsx`, `index.tsx`, etc.).
  - `src/components/`: Componentes de UI, abas e telas AR.
  - `src/stores/`: Client State de UI (Zustand v5).
  - `src/services/`: Chamadas HTTP (Axios / Fetch).

### 🔐 3.4 Gestão de Variáveis de Ambiente (.env.api e .env.client)
- **`.env.api`**: Segredos do backend e credenciais do PostgreSQL (`DATABASE_URL`, `POSTGRES_USER`, etc.). Mapeado no compose via `env_file: .env.api`.
- **`.env.client`**: Variáveis públicas do Expo (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GOOGLE_AR_API_KEY`).
- **Segredos Nativos**: Injetados no build Android dinamicamente via `manifestPlaceholders = [ googleArApiKey: googleArApiKey ]` em `build.gradle`. Zero hardcoding no `AndroidManifest.xml` ou `app.json`.
- **Segurança do Token de Equipe (Bearer sobre HTTP)**: o client mantém o token de equipe apenas em memória (Zustand sem persistência — nunca em storage nem em `EXPO_PUBLIC_*`), porém em desenvolvimento ele trafega via `http://` na rede local e é interceptável por sniffing. **Produção exige HTTPS** (reverse proxy com TLS na frente da API); URLs `http://` são restritas a ambientes de desenvolvimento.

---

## 4. Princípios de Engenharia de Software (SOLID & Clean Code)

1. **S — Single Responsibility**:
   - Controllers apenas lidam com requisições HTTP e DTOs.
   - Services orquestram lógica de domínio e cálculos.
   - Repositories isolam queries SQL / Drizzle.
   - Componentes visuais apenas renderizam UI; custom hooks isolam regras e estado.
2. **O — Open/Closed**: Estender funcionalidades via composição (`children`, compound components) em vez de empilhar flags booleanas dentro do mesmo componente.
3. **L — Liskov Substitution**: Interfaces permitem implementações alternativas (ex: repositórios em memória para testes unitários).
4. **I — Interface Segregation**: Contratos pequenos e focados em `packages/shared`.
5. **D — Dependency Inversion**: Injeção de dependência via construtores no NestJS e Context Providers / custom hooks no React.

---

## 5. Backend (`unifacens-api`): Drizzle ORM, Performance & Prevenção de N+1

### ⚠️ Prevenção do Problema N+1 Queries
Nunca execute queries ao banco de dados dentro de loops (`for`, `map`, `forEach`).

```typescript
// ❌ PÉSSIMO: N+1 queries. Se houver 50 âncoras, serão 51 queries ao banco!
for (const anchor of anchors) {
  const details = await db.select().from(detailsTable).where(eq(detailsTable.anchorId, anchor.id));
}

// ✅ EXCELENTE: Consulta relacional única otimizada em lote
export async function getAnchorsWithRelations(db: DrizzleDB) {
  return await db.query.anchorsTable.findMany({
    with: {
      tags: true,
    },
  });
}
```

### 🛢️ Migrações Idempotentes
Toda migração SQL gerada no Drizzle deve conter cláusulas de verificação segura (`IF NOT EXISTS` para colunas/tabelas) para garantir execução sem falhas em múltiplos ambientes de desenvolvimento e CI/CD.

---

## 6. Frontend (`unifacens-client`): Arquitetura & Regra de Ouro de Estilização

### 🌟 A REGRA DE OURO DE ESTILIZAÇÃO (NativeWind vs StyleSheet)

> [!IMPORTANT]
> **Compatibilidade Nativa com ViroReact (Prevenção de Crash Fatal):**
> 1. **Telas e Componentes 2D Convencionais** (ex: `app-tabs.tsx`, telas informativas, listas 2D):
>    - **UTILIZE classes NativeWind 4 (`className="..."`)**.
> 2. **Telas que Hospedam ou Envolvem o `ViroARSceneNavigator`** (ex: `ViroARAnchorContainer.native.tsx`, HUD de mira, badges de zoom e modais AR):
>    - **UTILIZE ESTRITAMENTE `StyleSheet.create` PURO!**
>    - **NUNCA use classes `className` do NativeWind dentro ou ao redor de componentes AR!**
>    - *Motivo Técnico*: O runtime do `react-native-css-interop` percorre a árvore Fiber do React Fiber durante re-renders. Ao encontrar o nó raiz de navegação, ele dispara `Couldn't find a navigation context`, desmontando abruptamente a árvore React e causando destruição de contexto EGL com **crash fatal `SIGSEGV` na biblioteca nativa C++ (`libviro_renderer.so`)**.

---

## 7. Regras Críticas do `useEffect` ("You Might Not Need an Effect")

1. **Não use `useEffect` para calcular dados derivados**: Calcule diretamente durante a renderização com variáveis normais ou `useMemo`.
2. **Não use `useEffect` para reagir a eventos do usuário**: Coloque a lógica no manipulador de eventos (`onPress`, `onClick`).
3. **Não use `useEffect` para resetar estado de componente filho**: Utilize a prop `key={uniqueId}` para remontagem limpa.
4. **Use `useEffect` estritamente para sincronização com sistemas externos**: Assinatura de sensores de hardware (`expo-sensors`), permissões do dispositivo (`expo-location`), timers globais ou listeners de websockets (com cleanup obrigatório no `return () => {}`).

---

## 8. Arquitetura de Estado: TanStack Query v5, Zustand v5 & TanStack Form

- **Server State (TanStack Query v5)**:
  - Todas as chamadas para a API NestJS utilizam `useQuery` ou `useMutation`.
  - Chaves centralizadas em `anchorKeys` com invalidação automática no sucesso de mutations.
- **Client State (Zustand v5)**:
  - Dados temporários de sessão de UI (status do rastreamento SLAM, âncora selecionada, filtros locais) residem em stores Zustand.
  - Consumir sempre via seletores granulares com `useShallow` para evitar re-renders desnecessários.
- **Formulários e Modais (TanStack Form v1)**:
  - Entradas de dados utilizam `useForm` com validação tipada e renderização por campo (`form.Field`).

---

## 9. Fluxo de Desenvolvimento, Comandos & Checklist Consistente

### 🛠️ Comandos Principais (Executados na Raiz do Monorepo)

```bash
# Instalação e Conexão:
npm install                        # Instala dependências de todos os workspaces
npm run android:connect            # Mapeia portas 8081 (Metro) e 8000 (API) via ADB

# Qualidade e Verificação:
npm run lint                       # Executa oxlint com verificação de tipos na API e Client
npm run typecheck                  # Checagem estrita de tipos TypeScript em shared e client
npm run test                       # Executa testes unitários e de integração com Testcontainers

# Servidores em Desenvolvimento:
npm --workspace=unifacens-api run start:dev     # Inicia API NestJS (Porta 8000)
npm --workspace=unifacens-client run android    # Inicia App Android no dispositivo conectado
```

### 📋 Checklist de Qualidade do Agente (Obrigatório Antes de Finalizar Qualquer Tarefa)

1. [ ] **Princípios SOLID aplicados**: Responsabilidades bem definidas entre controller, service, repository e componentes.
2. [ ] **Zero N+1 Queries**: Drizzle utiliza consultas relacionais (`db.query`) ou joins em lote.
3. [ ] **Regra de Ouro de Estilização Respeitada**: Telas AR com `ViroARSceneNavigator` usam estritamente `StyleSheet.create`. Telas convencionais 2D usam NativeWind.
4. [ ] **Conformidade com `useEffect`**: Nenhum dado derivado ou disparo de ação do usuário dentro de effects.
5. [ ] **Server State no TanStack Query v5**: Requisições HTTP utilizam hooks com query keys padronizadas.
6. [ ] **Single Source of Truth (`packages/shared`)**: Contratos de DTO e entidades derivados de schemas Zod. Apenas `shared` possui `zod` em suas dependências.
7. [ ] **Zero Erros de Qualidade**: `npm run lint` e `npm run typecheck` passam com 0 erros e 0 warnings.
8. [ ] **Testes Integrados com Testcontainers**: `npm run test` passa 100% contra PostgreSQL 16 real.
9. [ ] **Execução Nativa no Dispositivo Físico**: Testado no smartphone conectado via ADB; câmera, zoom e HUD alinhados com safe areas.

---

## 10. Validação Visual e Acessibilidade (UI Visual Validation & WCAG)

1. **Postura Cética**: Não assuma que uma alteração ficou visualmente correta sem inspecionar a tela real.
2. **Safe Area Insets Dinâmicos**: Sempre respeitar `useSafeAreaInsets()` para prevenir sobreposição com o punch-hole da câmera frontal, barra de status e barra de navegação por gestos do sistema.
3. **Áreas de Toque (Tap Targets)**: Botões e ícones interativos devem ter tamanho mínimo de 44x44 dp.
4. **Contraste de Cores (WCAG 2.2)**: Mínimo de 4.5:1 para texto normal e 3:1 para textos grandes ou elementos de destaque.
5. **Modais Responsivos com Teclado**: Todo modal com campos de entrada de texto deve ser envolvido em `KeyboardAvoidingView` e `ScrollView` (`keyboardShouldPersistTaps="handled"`).

---

## 11. Diretrizes de Realidade Aumentada (ViroReact) & Sistema de Coordenadas 3D

### 🚫 Incompatibilidade Obrigatória com Expo Go
O `@reactvision/react-viro` utiliza binários compilados em C++ (`libviro_renderer.so`), ARCore (Android) e ARKit (iOS).
- **Nunca utilize o Expo Go** (provoca crash imediato na importação).
- **Sempre utilize um Development Build** compilado (`npx expo run:android` ou APK nativo).

### 📡 Comunicação com a Cena (`viroAppProps`)
O `<ViroARSceneNavigator>` não reconstrói closures passadas em `initialScene`.
- Sempre passe a classe estática `initialScene={{ scene: ViroARAnchorScene as any }}`.
- Envie dados dinâmicos e callbacks através do objeto memoizado `viroAppProps`.

### 🧭 Motor de Projeção Geodésica & Posicionamento Baseado em Coordenadas (Zero QR Code)

> [!CRITICAL]
> **A Regra de Ouro do Posicionamento AR: Coordenadas Reais sem Marcadores Físicos**
> No campus UniFACENS, o mapeamento e a visualização de pontos de interesse (blocos, laboratórios, salas) **operam puramente com base em coordenadas espaciais geográficas (Latitude, Longitude, Altitude, Heading)**, sem depender de alvos impressos em papel ou QR Codes na experiência primária.
>
> Para garantir que os pontos não surjam flutuando aleatoriamente na tela:
> 1. **Motor Geodésico Compartilhado (`packages/shared/src/utils/geodesy.ts`)**:
>    - Converte coordenadas WGS84 para o Plano Tangente Local ENU (*East-North-Up*) centrado no usuário.
>    - Aplica matriz de rotação pelo Norte Verdadeiro ($H$):
>      $$x_{\text{AR}} = \text{east} \cdot \cos(H) - \text{north} \cdot \sin(H)$$
>      $$z_{\text{AR}} = -(\text{east} \cdot \sin(H) + \text{north} \cdot \cos(H))$$
>      $$y_{\text{AR}} = \text{up} - h_{\text{camera}}$$
> 2. **Compensação Obrigatória da Declinação Magnética de Sorocaba/SP ($-21.3^\circ$ Oeste)**:
>    $$\text{TrueHeading} = (\text{MagneticHeading} - 21.3^\circ + 360^\circ) \pmod{360^\circ}$$
>    *Importância*: Sem essa correção, a 40 metros de distância o ponto sofre um erro lateral de $14.5\text{m}$.
> 3. **Mitigação de Jitter com Filtro Passa-Baixa Circular (`CircularLowPassFilter`)**:
>    - Utiliza média móvel exponencial nos vetores unitários $(\sin \theta, \cos \theta)$ com $\alpha = 0.15$.
>    - Elimina a descontinuidade na transição $0^\circ \leftrightarrow 360^\circ$ e ruídos eletromagnéticos do smartphone.
> 4. **Calibração Zero-Marker (Pinpoint em Marco Conhecido do Campus)**:
>    - Para ambientes internos ou sob copas de árvores onde a precisão do GPS cai (> 10m), o usuário seleciona um marco de entrada conhecido (ex: Entrada Bloco A).
>    - O sistema zera o desvio do GPS alinhando a origem do ARCore com a coordenada real exata daquele marco.
>    - A partir desse ponto, o *Visual SLAM Dead Reckoning* do ARCore mantém deriva ínfima (< 1% a 2% ao longo de 50m de caminhada pelo corredor).
> 5. **Âncoras Nativas ARCore Geospatial — Sistema Primário (pós-WorldAnchor)**:
>    - O WorldAnchor custom foi REMOVIDO (~1000 linhas deletadas). Cada pin gera `createGeospatialAnchor(lat, lng, alt)` via `useNativeAnchors` — o ARCore mantém a âncora cravada na Terra sem intervenção da aplicação. Lição: manter um segundo mapa WGS84↔AR compete com o próprio ARCore (cada correção move todos os pins).
>    - **O GPS NUNCA reprojeta âncoras mid-session**: a âncora do mundo (mapa ARCore ↔ WGS84) congela UMA vez na primeira good-fix (acurácia ≤ 20m) ou na calibração em marco. Reprojetar por deslocamento de GPS dupla-compensa o movimento (o SLAM já rastreia o usuário no mesmo mundo onde os pins renderizam) e causa o "teleporte" dos pins — bug erradicado, não reintroduzir.
>    - **Alinhamento Δ (azimute do mundo AR ↔ Norte) — motor `use-ar-world-alignment` (2026-11-08)**: o mundo AR do ARCore nasce com yaw arbitrário; projetar WGS84→AR exige Δ. Fórmula: $\Delta = \text{pose.heading}_{\text{geospatial}} - \text{yaw}_{AR}(\text{forward da câmera})$ — fonte GEOSPATIAL (Terra-ancorada), **não** magnetômetro (o viés ferromagnético foi o que condenou o Δ por bússola do antigo `useARWorldAnchor`, deletado). Congelado 1× quando `headingAccuracy ≤ 15°`; sem amostra boa por 20s → lock best-effort + janela de refinamento 10s (só amostras melhores, guarda de salto ≤ 30°); **jamais fusão contínua** — reajustar Δ gira o mundo em torno da câmera e faz os pins perseguirem o celular. Recalibração apenas explícita (botão de refresh). ⚠️ Lição de device (2026-11-08): rotacionar a projeção pelo `pose.heading` cru SEM o Δ faz o pin orbitar o usuário por um ângulo arbitrário por sessão — "pins em lugares aleatórios a cada reload" e "pins sempre à frente da câmera" são a assinatura desse bug (o mesmo erro no `handleCreate` antigo gravava lat/lng rotacionados NO BANCO — por isso o wipe de 2026-11-08).
>    - **ARCore Geospatial API (provider `arcore`) é a fonte prioritária do World Anchor** (ativada em 2026-11-06): a cena habilita `setGeospatialModeEnabled(true)` com **retry ×6/5s** (as 2 primeiras chamadas falham com `Invalid view type` — transição da interop Fabric no mount) e faz poll de `getCameraGeospatialPose()` (1Hz) → pose **ancorada na TERRA** (lat/lng/alt/heading + acurácias) que substitui GPS+bússola no estabelecimento e na re-ancoragem contínua (5s, pivô câmera, **limiar = max(mínimo, acurácia da própria pose)** — corrigir dentro do ruído da pose faz pins pularem). Requisitos nativos: meta-data `com.google.android.ar.API_KEY` (via placeholder do gradle lendo `EXPO_PUBLIC_GOOGLE_AR_API_KEY` do .env — o Expo CLI exporta a env pro processo gradle) + `play-services-location` (já trazido pelo expo-location). O gate nativo `geospatialSupported` lê a meta-data **`com.google.android.geo.API_KEY`** (presente via Maps) — em caso de suporte=false, chamar `getGeospatialSetupStatus()` revela o gate exato (key/location/play-services). VPS (precisão ~1-3m) só outdoor com cobertura Street View; indoor = GPS-only (~±5m) com fallback à bússola congelada.
>    - **Estabilidade ~100% e rota viva (E1-E3, 2026-11-06)**: **E1.1** portão de estabilização — pins só ficam visíveis quando o mundo converge (janela de 3 poses com dispersão < 1.5m e acurácia ≤ 10m / fallback tracking verde 10s); HUD mostra "Estabilizando AR…" — o pin nasce UMA vez, no lugar certo (padrão Live View). **E1.2** correção SUAVE — re-ancoragens interpolam 15% do erro a cada 120ms até convergir (pins deslizam, jamais saltam). **E1.3** histerese (limiares ×2 por 30s pós-correção) + convergência monótona (pose com acurácia piorada > 1m não corrige). **E2** rota viva — chevron "perna viva" (key `-1`) nasce nos pés do usuário quando afastado > 1.5m da polyline apontando ao lookahead 4m; modo direto recalcula com desvio > 3m/4s (campus conserva API: 8m/5s); commit a 1Hz com keys estáveis. **E3** âncoras nativas com **roteamento por dado** (2026-11-08): pin COM `altitude` registrada → `createGeospatialAnchor(lat, lng, alt)` (altitude absoluta elipsoidal WGS84 = altura exata de criação); SEM altitude → `createTerrainAnchor(lat, lng, 1.5)` (1.5m acima do terreno real SRTM). Limites: até **30 pins**, **3 criações/tick** de 1.5s. Falha/pendência tem **timeout JS de 60s + 2 retries** (`createdRef` só marca APÓS sucesso — antes marcava antes do `await` e um `TASK_IN_PROGRESS` eterno sem VPS deixava o pin para sempre no fallback); esgotados os retries, o pin permanece como estimativa até refresh explícito. API do Viro é one-shot (sem stream de pose) — a posição nativa tem prioridade na projeção.
>    - **Roundtrip WGS84↔AR por inversas exatas** (a matriz de rotação do plano tangente é a própria inversa, $M^2 = I$): `geodeticToENU`/`enuToGeodetic` (raios de curvatura WGS84 — nunca a aproximação flat-earth 111320) e `enuToArXZ`/`arXZToEnu` (ambas por Δ). A criação (`handleCreate`) usa as inversas com a **pose média do buffer** — o ponto reaparece no mesmo lugar após reload.
>    - **Origem da rota = posição SLAM atual → WGS84** (`useARNavigation`), não o GPS cru: o primeiro waypoint cai nos pés do usuário e o último coincide com o pin de destino **por construção** (mesma âncora, mesmo Δ); se o snap do grid A* afastar o terminus > 2m da âncora, o waypoint exato é anexado.
>    - **Altitude = altura de criação (Q4=B, 2026-11-08)**: `handleCreate` persiste `pose.altitude + offset[1]` (o componente vertical do tap ENTRA — antes era descartado e todo pin nascia na altitude da câmera); elipsoidal WGS84 ponta a ponta (ARCore cria → ARCore projeta → datum cancela). Render usa a altitude salva nos dois caminhos: nativo via `createGeospatialAnchor` absoluto; fallback via `y = camPos.y + (alt_pin − alt_pose)` (confia só se `verticalAccuracy ≤ 20m`, senão chão). Seeds/tipos sem altitude ficam NULL e roteiam via terrain anchor — **nunca** gravar datum misto (605/606 ortométrico vs elipsoidal ARCore divergem ~dezenas de metros em SP).
>    - **Contrato SEM `position`** (higiene 2026-11-06): coordenadas AR do mundo local são session-relative (origem = pose do celular no launch) — lixo entre sessões. Removidas do schema shared, do DTO da API e do INSERT Drizzle (colunas `positionX/Y/Z` ficam nullable no DB, mortas). O SSOT geográfico é **lat/lng/alt**; a trava intra-sessão usa `lockPosition` (SLAM puro) sem persistir.
>    - **Estabilização v2** (2026-11-06, lição do quintal): o limiar de dispersão escala com a acurácia (`spread < max(1.5, acc×0.75)` — GPS-only outdoor treme ±3-10m parado, spread fixo de 1.5m era inalcançável e os pins nunca apareciam); poses contínuas por 15s sem critério estrito => estável **best-effort** (correção suave cuida do resíduo — melhor pin deslizando que tela vazia); pose stale > 10s => fallback tracking-verde volta a valer mesmo se já houve pose antes (o gate jamais trava para sempre).
>    - **Fallback de projeção world-stable (2026-11-08)**: sem âncora nativa, `useARProjection` posiciona via `pos = camPos + R(Δ)·ENU(pose→pin)` recomputado a 1Hz — **não é mais um efeito congelado por refs nas deps** (bug que cravava o pin na pose do instante do mount para sempre). O pin nasce UMA vez (gates: `horizontalAccuracy ≤ 15m` OU timeout 15s) com **low-pass de 25%/tick** rumo a um alvo que **só melhora com acurácia melhor** (convergência monótona, lição E1.3) e **congela** (acc ≤ 6m ou 8 ticks) → SLAM-stable na sessão. Renderiza como **estimativa honesta**: opacidade 0.6 + selo "±Xm" no label. Quando a âncora nativa resolve, **interpola easeOutCubic ~0.8s** (jamais teleporte — valia também para o `addLocal` do tap SLAM). Distância do label é **viva** (recomputada a 1Hz contra `cameraPosRef` — antes congelava no momento da projeção).
>    - **Refresh do HUD é REAL (2026-11-08)**: antes era só `query.refetch()` (structural sharing do TanStack preserva a identidade do array → nada re-projetava; âncoras falhas bloqueadas por `createdRef` jamais re-enfileiravam). Agora: refetch + `retryFailed()` dos pins que esgotaram retries + `clearFrozen()` das projeções + **recalibração explícita do Δ** (`alignment.realign()` — única forma permitida de re-alinhar) + bump de `reprojectNonce`.
>    - **Pacote anti-ruído para precisão (2026-11-08, tarde)**: cada reload faz uma medição NOVA e independente (pose + Δ) do mesmo ponto físico — a soma dos dois ruídos é o "pin nasce em direção diferente a cada sessão". Mitigações: **(1) Δ robusto** — janela deslizante de 6 amostras com média circular e rejeição de outliers (>15° do centro), lock só com spread ≤ 10° + headingAcc ≤ 12° (lote turbulento = câmera girando/pose convergindo NÃO trava o Δ); **(2) gate de ESTABILIDADE na criação** (`geospatial.stability()`: spread posicional ≤ 2.5m e de heading ≤ 10° com ≥4 amostras frescas) — buffer estável = ruído independente → **pose média é segura** (÷√N); buffer espalhado = pose derivando → média seria sistematicamente atrasada (NUNCA parear média com camPos sem este gate — lição da regressão do mesmo dia); **(3) freeze em PLATÔ** — estimativa congela quando a acurácia para de melhorar por 10 ticks (nunca por tempo fixo: pins nasciam cravados na pose ruim dos primeiros segundos), gates de fallback apertados (acc ≤ 10m OU timeout 25s); **(4) telemetria `[ARProj]`** — loga a distância entre âncora nativa e estimativa no resolve (diz empiricamente qual fonte carrega o erro). Próximo nível de precisão (roadmap): **Cloud Anchors visuais** (`hostCloudAnchor`/`resolveCloudAnchor` do Viro 3.0.3, precisão centimétrica e funciona INDOOR) — exige TTL > 1 dia via autorização keyless (JWT assinado pelo backend Nest) pois API key só permite TTL de 1 dia.
>    - **Âncoras de Nuvem VISUAIS implementadas (2026-11-08, noite) — `use-cloud-anchors.ts`**: a cura para "pin nasce com relação ao celular" indoor (GPS não distingue cômodos). **Criação**: após salvar o pin, `startScan()` → usuário escaneia ~25s ao redor do ponto (UI guia) → `finishScan(ttl=1)` hospeda o mapa visual no Google → **auto-calibração**: `resolveCloudAnchor` na MESMA sessão revela a origem do frame (centróide das posições da câmera, heading do 1º keyframe — §doc `ViroCloudAnchor`) → `frameOffset = pin − origem` (rotacionado ao frame) → `PATCH /anchors/:id` grava `cloudAnchorId` REAL + offset nas colunas `positionX/Y/Z` (**renascidas**: coordenadas no frame da cloud anchor são estáveis entre sessões — nada a ver com o antigo `position` session-relative). **Retorno**: `resolveNearby` resolve 1 por vez (SIFT ~30s, `getCloudAnchorStatus` p/ progresso) pins com cloud ID real + offset a ≤40m → posição mundial = `origem + R(yaw)·frameOffset` → entra como entrada de **prioridade máxima** no pipeline (merge: cloud > geospatial nativa > fallback). Erro `ErrorResolvingLocalizationNoMatch` = não reconhecido DAQUELE ponto de vista (existe, mas não foi visto) — sem retry na sessão, geospatial segue. **Limitação TTL**: API key = 24h; para 365 dias → autorização keyless (JWT RS256 por service account, `aud=https://arcore.googleapis.com/`) no Viro OU renovação via **Management API** no backend (roadmap). IDs sintéticos (`coord-`, `ua-`) nunca resolvem (`isRealCloudAnchorId`).
>    - **Criação de pin com precisão** (P3, 2026-11-06; vertical 2026-11-08): modal exibe "Precisão do GPS: ±Xm" (verde ≤5 / âmbar ≤10 / vermelho >10; null = "Aguardando GPS…" com botão bloqueado — alinhado ao gate do handler); "Salvar" bloqueado acima de `CREATE_MAX_ACCURACY_M = 10` horizontal ou `CREATE_MAX_VERTICAL_ACCURACY_M = 25` vertical (média do buffer de 8 amostras, suaviza spikes); exige **Δ travado** (sem alinhamento não há conversão AR→ENU confiável).
>    - **Renderização da rota (estilo Google Live View)**: chevrons azuis de textura (`assets/images/ar/route-chevron.png`, glow #3B82F6) achatados no chão via `rotation=[-90,0,0]` + 3cm contra z-fighting, amostrados por comprimento de arco: **1m na zona próxima (≤60m) e 3m ao longe**, cap de 300 nós — cobre rotas de qualquer comprimento (cap antigo de 90×2.2m cortava a trilha em ~198m). Topo da textura = `-Z` = frente. Sem marcador de destino (o próprio pin da âncora marca a chegada). Texturas geradas proceduralmente (PNG encoder zlib+CRC32, sem dependências).
> 6. **Escala Dinâmica com Clamping e Distância Métrica nos Pins 3D**:
>    $$\text{scaleFactor} = \max\left(1.0, \min\left(6.0, \sqrt{\text{distância}} \times 0.45\right)\right)$$
>    - Garante que pins a 5m não cubram toda a câmera e que prédios a 100m+ permaneçam nítidos e legíveis com sua tag de distância (ex: `Bloco B\n📍 45 m`).

---

## 12. Arquitetura de Câmera, Zoom Suave (Smooth 60 FPS) & Troubleshooting

### 📷 Por que ViroReact e Não Outras Bibliotecas de Câmera?
No Android (`android.hardware.camera2`), **apenas um cliente pode acessar o sensor físico da câmera por vez**. O Google ARCore requer acesso exclusivo aos streams brutos da câmera e giroscópio para odometria SLAM a 60 FPS. Instanciar `react-native-vision-camera` ou `expo-camera` simultaneamente causa conflito de hardware imediato (`CAMERA_IN_USE`).

### 🔍 Zoom Suave a 60 FPS Sem Tela Preta (Invariante de `SurfaceView`)

> [!IMPORTANT]
> **Prevenção de Tela Preta / Destruição do Contexto OpenGL:**
> - O `ViroARSceneNavigator` utiliza uma `GLSurfaceView` nativa que desenha em um buffer dedicado de hardware.
> - Se o container pai alternar dinamicamente entre `transform: null` e `transform: [{ scale }]`, o Android invalida o buffer, chamando `surfaceDestroyed()` e `surfaceCreated()`. Esse ciclo gera **tela preta temporária (flicker)**.
> - **SOLUÇÃO OBRIGATÓRIA**:
>   1. O transform deve ser **permanente desde a montagem inicial**, utilizando `<Animated.View style={[styles.arZoomWrapper, { transform: [{ scale: zoomAnim }] }]}>` com `zoomAnim = useRef(new Animated.Value(1.0)).current`.
>   2. Botões rápidos (`1x`, `2x`, `3x`, `5x`) disparam `Animated.timing` suave de 180ms com `Easing.out(Easing.quad)` e `useNativeDriver: true`.
>   3. O gesto de pinça (*pinch-to-zoom*) atualiza diretamente `zoomAnim.setValue(clamped)` na UI thread nativa, aplicando throttle nas atualizações de estado do React apenas para rótulos/badges.

### 🛡️ Troubleshooting Essencial

1. **Exportação Nomeada e Default em Telas e Contêineres**:
   - Todo componente de tela importado pelo Expo Router deve conter tanto exportação nomeada quanto default:
     ```typescript
     export const ViroARAnchorContainer: FC = () => { ... };
     export default ViroARAnchorContainer;
     ```
   - Omitir o `default` causa erro fatal no React 19: `TypeError: Cannot read property 'displayName' of undefined`.
2. **Queda do Túnel ADB (`adb reverse`)**:
   - Se o app relatar erro de conexão ao Metro ou à API após reconectar o cabo USB, reestabeleça os mapeamentos:
     ```bash
     npm run android:connect
     ```
3. **Resolução de Tipos React 19 em Monorepo NPM Workspaces**:
   - `@types/react: ~19.2.2` deve estar declarado no `devDependencies` do `package.json` raiz do monorepo para evitar conflitos de `JSX.ElementClass` com bibliotecas elevadas (hoisted).
4. **Resolução de Módulos do Expo Router em Monorepos (`Cannot find module 'expo-router/_ctx-shared'`)**:
   - O `@expo/cli` é executado na raiz do monorepo (`node_modules/@expo/cli`). Durante a inicialização do dev server ou compilação nativa com `typedRoutes: true`, ele carrega o `@expo/router-server`, que exige a resolução de `expo-router` e `@expo/metro-runtime`.
   - Se o NPM mantiver o `expo-router` isolado dentro de `unifacens-client/node_modules/`, o Node não consegue encontrá-lo a partir do `@expo/cli` raiz, lançando `MODULE_NOT_FOUND`.
   - **SOLUÇÃO OBRIGATÓRIA**: Declarar `"expo-router"` e `"@expo/metro-runtime"` no `devDependencies` do `package.json` raiz e garantir o script `postinstall` para criar os links simbólicos necessários.
5. **IP Fixo Obsoleto no `.env` => "Carregando pontos..." Infinito**:
   - Variáveis `EXPO_PUBLIC_*` são **embutidas no bundle JS pelo Metro** em tempo de serviço. Um `EXPO_PUBLIC_API_URL` com IP de rede antiga (ex.: troca do Wi-Fi da faculdade para casa) faz o app apontar para um IP fantasma.
   - Pacotes descartados por rota inexistente **não geram `ECONNREFUSED`**: sem timeout no `fetch`, a promise nunca resolve nem rejeita => o `catch` de "Erro de conexão" jamais executa e o spinner fica eterno.
   - **SOLUÇÃO PADRÃO (Modo Resiliente)**: não fixar `REACT_NATIVE_PACKAGER_HOSTNAME` nem `EXPO_PUBLIC_API_URL` no `.env` (ver `unifacens-client/.env.example`). Via USB, `npm run android:connect` mantém o fallback `http://localhost:8000` funcional à prova de troca de rede.
   - Após alterar o `.env`, reinicie o Metro com `--clear` (re-transforma os inline constants) e recarregue o app.
   - *Hardening recomendado*: `AbortSignal.timeout()` nas funções de `src/services/api.ts` e uso do `use-anchors-query` (TanStack Query) no lugar de fetch manual em `useEffect` no `ViroARAnchorContainer`.
6. **Dispositivos Xiaomi/HyperOS (ex.: POCO X7 Pro): Permissão de Injeção de Input**:
   - Erro `Injecting input events requires the caller ... INJECT_EVENTS permission` ao usar **mobile-mcp**, **scrcpy** (controle) ou `adb shell input` indica que a opção **"Depuração USB (Configurações de segurança)"** está desativada — a "Depuração USB" comum não basta.
   - Ativar em *Configurações > Configurações adicionais > Opções do desenvolvedor* (exige aparelho desbloqueado; em alguns casos, SIM inserido + conta Xiaomi logada).
7. **Kit de Depuração para Features AR (Dev Build Obrigatória)**:
   - **Rebuild nativo (`npx expo run:android`) somente quando código nativo/dependências mudarem** — toda iteração de JS flui via Metro (Fast Refresh ou `r`).
   - `j` no terminal do Metro abre o **React Native DevTools** (console, breakpoints, inspeção de componentes). *A aba Network não captura `fetch` nativo.*
   - `adb logcat -s ReactNativeJS:V` expõe `console.log/warn/error` do JS rodando no dispositivo.
   - **scrcpy** (espelho + controle do aparelho) e **mobile-mcp** (hierarquia de elementos, toques, logs, crashes) operam em paralelo com o Metro via ADB.
8. **"Pins seguindo o celular" = tracking do ARCore, NUNCA a projeção** (lição de device, 2026-11-06):
   - Estados de tracking do Viro/ARCore: **1 = Indisponível, 2 = Limitado (só IMU), 3 = Estável (ancoragem visual)**. Com `track=1/2` a pose da câmera congela na identidade (`cam=[0,0,0]`, `yaw=0` travados nos logs `[ARDiag]`) — o quadro do mundo NÃO é rígido e **nenhum conteúdo AR pode ficar estático**: tudo fica colado ao aparelho.
   - Telemetria `[ARDiag]` (dev-only, 2s, no container AR) discrimina empiricamente: `track` (ancoragem), `yaw` vs `compass` (mundo rígido quando andam juntos), `cam=[x,y,z]` (deriva parado). Diagnóstico: girar o celular 90° e ver o `yaw` mudar <90° = mundo girando junto (tracking ruim); yaw≈90° = mundo rígido (pins estáticos por construção — projeção é função pura do anchor congelado).
   - O `ARStatusHud` exibe banner âmbar quando `track≠3` — pins/rotas só são validáveis com banner ausente (ponto verde). Indoors com textura pobre/laptop perto, o ARCore demora ~12s+ para estabilizar ou nunca estabiliza: apontar para cantos/estantes e mover devagar acelera a ancoragem.
   - Se o tracking cai de 3→1/2 e recupera sem re-localizar contra os features antigos, o ARCore pode **re-basar a origem do mundo** na pose atual — pins colocados para o mundo antigo "pulam". Propriedade da plataforma: prevenir = manter tracking estável; o banner é o aviso visível.
    - **Comportamento 2026-11-08 (noite)**: (a) conteúdo AR (pins + chevrons) é **OCULTADO** quando `track ≠ 3` (`trackingHealthy` no viroAppProps → cena) — mundo não-rígido renderiza tudo colado ao aparelho, melhor sumir que mentir; (b) o fallback de projeção exige **pose FRESCA** (`isPoseFresh` no gate do `fallbackAllowed`) — com pose stale, `pos = camPos(agora) + R(Δ)·ENU(pose_velha→pin)` faz o pin andar JUNTO com o usuário 1:1 (bug de device: "os pontos saíram junto comigo" na transição indoor→outdoor); (c) transições de tracking logadas como `[ARTrack]`. Sintoma "pins saíram junto comigo ao andar" = tracking perdido OU pose stale — os logs discriminam qual dos dois.
 9. **"Artefato azul" cobrindo a tela = visualização de PLANOS detectados, não pin** (lição de device, 2026-11-08): um plano horizontal do tamanho do cômodo renderizado como `ViroQuad` translúcido `#3B82F633`, visto de dentro, ocupa o frustum inteiro abaixo da sua borda distante (linha reta horizontal no topo do feed) — parecia "estar dentro do pin" e ocluía os pins reais. O render visual fica **DESLIGADO** por padrão (`SHOW_DETECTED_PLANES = false` na cena); a *detecção* de planos continua ativa (hit-tests dependem dela). Sintoma correlato: "N ponto(s)" no HUD mas nenhum pin visível — conferir distância (pins do campus projetados a km de casa são subpixel) e overlays antes de culpar a projeção.
10. **Volume de requests na ARCore API (Cloud Console) = f(tempo de sessão × remounts × âncoras), não loop de useEffect** (2026-11-08): cada sessão com Geospatial ativo gera tráfego contínuo de **localização VPS** (o ARCore consulta o serviço enquanto a câmera tenta localizar; indoor sem match, ele continua tentando) + **1 request por criação/resolução de âncora** (terrain/geospatial). Dev com muitas iterações (cada entrada na tab AR = sessão nova) facilmente casa com centenas/dia — 963 num dia de testes foi isso, não bug. Mitigações do app: criação de âncoras nativas **gateada por pose** (`horizontalAccuracy ≤ 20m` + fresca — resolver âncora com GPS ruim é request fútil), **no-retry em erros fatais** (`NOT_SUPPORTED`/`RESOURCE_EXHAUSTED`/API key), tab focus-gated (sessão vive só com a tab AR aberta). Quota oficial: 1.000 sessões/min ou 100k requests/min por projeto.
11. **Yaw da câmera para o Δ vem do VETOR `forward`** do `onCameraTransformUpdate` com guarda de horizontalidade (`yawAR = atan2(fwd.x, −fwd.z)`, descartando amostras com componente horizontal < 0.4) — válido para QUALQUER pitch (projeção no plano XZ). ⚠️ `rotation[1]` (euler) foi testado em 2026-11-08 e **garbla o yaw sob câmera inclinada** (a ordem do euler mistura pitch/roll no componente Y) — a pose típica de criar pin mirando o chão — envenenando o Δ da sessão inteira e piorando a precisão de todos os pins. Regressão detectada por device e revertida no mesmo dia. O log `[ARAlign]` imprime heading + Δ no lock — se girar o celular 90° físico e os pins girarem junto, suspeitar primeiro da fonte do yaw.
12. **SIGSEGV/NPE ao SAIR da tab AR com chamadas nativas periódicas ativas (2026-11-10, 3.1.1)**: **toda** API do navigator/cena (`getCameraGeospatialPose`, `performARHitTestWithPoint`, `createGeospatialAnchor`/`createTerrainAnchor`…) é executada como **UIBlock interop** (`ARSceneModule.java` / `ARSceneNavigatorModule$N` ← `InteropUIBlockListener.didMountItems`) na fila de mount items do frame seguinte. **A janela fatal: o detach NATIVO da view (troca de tab) antecede o blur JS em ~0.5–1s** (provado em device: `onDetachedFromWindow` 14:41:31.497 vs `[ARTab] blur` 14:41:32.024; tombstones 14:26/14:48 cravaram COM todos os gates de foco ativos e o blur nem chegou a logar). Se o destroy/pause da view despacha antes de um UIBlock enfileirado, ele executa com a view nula → **SIGSEGV** (`nativeGetCameraGeospatialPose+44`) ou **NPE** (`performARHitTest on null ViroViewARCore`). Bug upstream (sem null checks no nativo; não consta nos known traps do MCP oficial). **Mitigação em 4 camadas** (nenhuma fecha 100% — o zero é upstream): (a) `ar.tsx` separa `focused` (false NO INSTANTE do blur → `viroAppProps.focused` congela toda chamada nativa nos hooks/cena) de `mounted` (**keep-alive de 1.2s** — UIBlocks pendentes drenam com cena viva); (b) **gate de tracking ≥ 2** (o detach pausa a sessão; `onTrackingUpdated` chega da bridge em ~100ms vs 500–1000ms do blur) — poll/hit-test/tick de âncoras nativas não rodam com tracking 1 (mundo morto). ⚠️ Lição 14:56–14:57: **NÃO use `=== 3`** — a cena remonta a cada reentrada (`internalRemountKey` da lib) e o tracking oscila 3→1→3; indoor pode ficar em 2 (LIMITED) permanente, `===3` mata o poll para sempre => pose stale => 0 pins; e o detach NÃO emite tracking degradado (tombstone 14:48 sem sinal prévio), então `===3` não protegia o crash de qualquer forma. A ocultação de CONTEÚDO continua `=== 3` (§12.8) — gates de CHAMADA NATIVA são `≥ 2`; (c) anti-overlap em cada poll (`poseInFlight`/`hitInFlight`/`processingRef`); (d) watchdog de promises penduradas (o módulo nativo é **one-op-por-vez e a 2ª chamada pode pendurar para sempre** — lição das sessões 14:35–14:41: o poll morria, `poseTick` congelava, o `recompute` nunca mais rodava e o timeout de 25s do fallback nunca era avaliado → pins invisíveis até refresh; fixes: watchdog 8s no poll + heartbeat 2s no recompute). Regra: **nenhuma chamada nativa periódica sem os 4 gates (alive + focused + tracking + in-flight com watchdog)**.

---

## 13. Autenticação better-auth (JWT, Roles e Secret Storage)

### 🏛️ Arquitetura
- **Servidor (`unifacens-api`)**: instância central em `src/common/auth/better-auth.ts` com plugins `admin` (roles `user`/`admin`, default `user`) e `jwt` (expiração **24h**, issuer/audience = `BETTER_AUTH_URL`, payload com `role`/`email`/`name`). Handler montado em `/auth/*` via `toNodeHandler` — exige `bodyParser: false` no Nest com `express.json()` restaurado para as demais rotas.
- **Guard global (`JwtAdminGuard`)**: leituras (GET/HEAD/OPTIONS) e `@PublicContribution()` seguem abertas; **toda mutation exige `Authorization: Bearer <JWT>` válido em qualquer ambiente** (sem bypass em dev), com `role === 'admin'` obrigatória (role `user` → 403). Validação local via `jose/createRemoteJWKSet` contra `GET /auth/jwks` (cache e rotação automáticos). `@AdminOnly()` estende a exigência para leituras.
- **Mobile (`unifacens-client`)**: `authClient` (better-auth/react + `expoClient`) persiste os cookies de sessão no **expo-secure-store** (Android Keystore/iOS Keychain); o JWT é obtido em `GET /auth/token` (`authClient.$fetch` anexa a sessão) e guardado sob `unifacens.jwt`. `hydrateAuth()` (chamado no `_layout`) faz o **refresh silencioso** do JWT enquanto a sessão viva. Login é **aberto a todos** (`useAuth().canEdit` só para admins).
- **Endpoints de contrato**: `GET /access` (política) e `GET /access/session` (`@AdminOnly`, valida o JWT e retorna `{ canEdit, user }`).

### ⚠️ Invariáveis Críticas
1. **NUNCA anote o tipo de retorno de `createBetterAuth` manualmente** — a inferência preserva os endpoints tipados dos plugins (`auth.api.createUser` etc.).
2. O `drizzleAdapter` exige o mapa de tabelas: `schema: { user, session, account, verification, jwks }` (colunas conforme better-auth 1.7, incluindo `session.impersonatedBy`, `jwks.crv`, `jwks.expiresAt`).
3. O client `jwtClient()` do better-auth 1.7 **não expõe mais `getToken()`** — use `authClient.$fetch('/token')`.
4. Rebuild do container da API é **obrigatório** ao adicionar dependências (o volume sincroniza `src/`, mas `node_modules` é local do container).
5. Seed do admin (`npm run db:seed-admin`): idempotente, roda no `start:dev` com `ADMIN_EMAIL`/`ADMIN_PASSWORD`; produção valida `BETTER_AUTH_SECRET` como obrigatório.
6. Tabelas de auth são criadas por migrations Drizzle idempotentes — nunca use `npx auth generate` sobre o schema sem revisar o SQL gerado (padrão `IF NOT EXISTS` do §5).
7. **Peer deps nativas do `@better-auth/expo`**: `expo-network`, `expo-constants`, `expo-linking`, `expo-web-browser` e `expo-secure-store` — todas módulos nativos. Faltando `expo-network`, TODA chamada do `authClient` no nativo falha com `Cannot find module 'expo-network'` (sintoma: "[auth] Falha ao hidratar sessão"). Instalar com `npx expo install` e **rebuildar o dev build**.
8. **basePath do client deve casar com o servidor**: o handler é montado em `/auth` (`basePath: '/auth'` no servidor + `expressInstance.use('/auth', ...)`). O client better-auth assume o default `/api/auth` — sem `basePath: '/auth'` no `createAuthClient`, todo endpoint retorna **404 `Cannot POST /api/auth/...`**.
9. **trustedOrigins em desenvolvimento**: o client expo envia como `Origin` a URL do Metro (IP de LAN que muda com a rede). Fora de produção, o servidor aceita a própria origem do request via função em `trustedOrigins` (ver `better-auth.ts`); em produção apenas `CORS_ORIGINS` + baseURL são aceitos. Sintoma do 403: `INVALID_ORIGIN`.
10. **Hash de senha = scrypt** (`node:crypto scrypt`, formato `salt(16B hex):hash(64B hex)`, salt novo a cada senha — memory-hard, resistente a GPU). A tabela `account` é o modelo de identity linking 1:N: `user_id` = usuário local; `account_id` = ID no provedor (para `credential` o better-auth copia o `userId`; para OAuth difere); `access_token`/`refresh_token` só se preenchem em OAuth.
11. **Seed de admin é UPSERT**: `db:seed-admin` sincroniza a senha com `ADMIN_PASSWORD` do `.env.api` quando o admin já existe (via `auth.api.setPassword` + revogação de sessões) — a env é a fonte de verdade em qualquer restart. Desde 2026-11-09 o seed também roda **no boot da API em qualquer ambiente** (`main.ts` chama quando ADMIN_EMAIL/ADMIN_PASSWORD definidos) — é assim que o admin default sobe para PRODUÇÃO sem passo manual; falha no seed não derruba a API.
 12. **WEB exige API same-site + expoClient só em nativo** (2026-11-09): três condições JUNTAS para o login web: (a) `credentials: 'include'` no `createAuthClient` (sem isto o navegador descarta o Set-Cookie do login); (b) plugin `expoClient` registrado **apenas em `Platform.OS !== 'web'`** — no navegador seu adapter de cookies via SecureStore engole o Set-Cookie e a sessão nunca persiste ("signIn ok, mas getSession sem usuário"); (c) a API no **MESMO SITE** que a página (`getApiBaseUrl()` via `window.location.hostname` — IP fixo tipo `192.168.x.x` na `.env.client` faz localhost:8081→192.168.x.x:8000 ser CROSS-SITE e o cookie `SameSite=Lax` **nunca é enviado**, mesmo com credentials). Sintoma clássico: login 200 + "Não foi possível concluir o acesso". Diagnóstico em 30s: DevTools → Network → conferir se `get-session`/`token` vão para o MESMO hostname da página.

---

## 14. AuthGate, Espelho UniFacens e Matriz de Capacidades (plano v2)

### 🚪 Modelo "identidade primeiro"
- O `_layout` raiz implementa o **AuthGate**: `!hydrated → splash` · `!jwt → LoginScreen` (tela cheia, abas Entrar/Criar conta) · autenticado → **Stack raiz** contendo o grupo `(tabs)` (NativeTabs: Início | Campus | AR) e as telas empilhadas `/aulas /notas /faltas /carteirinha /servicos`.
- **O Stack raiz é obrigatório** para que `router.push('/aulas')` funcione — NativeTabs sozinho não empilha rotas fora dos triggers.
- Sign-out ou **401 em qualquer chamada** (`api.ts`/`places-api`) fazem `clearSession()` → o gate devolve ao login automaticamente.

### 🎭 Matriz de capacidades (role → recurso)
| Capacidade | `user` | `admin` |
|---|---|---|
| Home/Carteirinha/telas acadêmicas (mocks) | ✔ | ✔ |
| Campus: buscar/ver | ✔ | ✔ |
| Campus: cadastrar/editar/excluir local | ✖ (UI oculta; API 403) | ✔ |
| AR: ver pins | ✔ | ✔ |
| AR: "Marcar Ponto"/excluir | ✖ (badge "Modo leitura") | ✔ |

### 🏛️ Espelho UniFacens (liga.app.facens)
- Telas replicadas estruturalmente por **mapeamento de acessibilidade** (o app oficial usa `FLAG_SECURE` — screenshots saem pretos; a hierarquia de a11y continua acessível).
- Dados acadêmicos são **MOCKS** em `src/features/academic/mocks/` (salas C36/D27/B08 reais para exercitar "Aula → Campus/AR").
- Referência extraída: Home (saudação+data, próxima aula com sala, atalhos Aulas/Notas/Faltas/Ver mais), Aulas (Seg–Sáb + timeline), Notas/Faltas (seletor de período), Carteirinha, Serviços (grid + lista Acesso).
- **Drawer completo**: perfil, Carteirinha, Botão de Emergência (motivo+localização+envio), Notificações, Configurações (Aparência/Atualizações/Segurança/Idioma), Ajuda, Reportar, Desconectar, versão no rodapé. ⚠️ O sheet de emergência é **overlay absoluto dentro do Modal do drawer** — NÃO usar `Modal` aninhado em `Modal` no RN (window encalha e a tela congela).
- **Detalhes da Aula** (`/aula-detalhe?discipline=`): hub alcançado do carrossel da Home, dos cards de Aulas e das disciplinas de Notas/Faltas — salas expandíveis, Turma, Faltas, Notas segmentadas e timeline de Tarefas.
- **Períodos históricos**: seletor ‹ › + bottom sheet em grade (espelho oficial) percorre todo o histórico (2024/01→2026/02 nos mocks).
- **Performance do mapa**: JAMAIS use `region` controlado no `MapView` (cada re-render faz o mapa "voar" — inclusive a cada tecla da busca). Use `initialRegion` + `animateCamera` via ref + `React.memo`.

---

## 15. ViroReact 3.1.x — Providers, Cloud/Geospatial API e Invariantes

> Fonte: docs oficiais viro-community.readme.io (provider-setup, cloud-anchors, geospatial, authentication, co-location, advanced-vps, upgrading-to-310) verificadas em 2026-11-10. Seção leva 1 = fatos de documentação; leva 2 (lições de device) entra após o A/B de providers.

### 🔌 15.1 Sistema de Provider (CRÍTICO)
- **O `provider` é ÚNICO e controla Cloud Anchors + Geospatial SIMULTANEAMENTE** — prop do `<ViroARSceneNavigator>`: `"reactvision" | "arcore" | "none"`. **Default = `"reactvision"` desde v2.53**.
- **Breaking 3.1.0**: props legadas `cloudAnchorProvider`/`geospatialAnchorProvider` voltaram a ser honradas quando `provider` não está setado (o 3.0 SEMPRE sobrescrevia com `"reactvision"`). App que ainda passa `cloudAnchorProvider="arcore"` e migrou 3.0→3.1 mudou de backend sem perceber.
- **Trocar provider muda a fonte do `getCameraGeospatialPose`** (motor Δ!): `arcore` = ARCore Geospatial API (VPS/Earth, Terra-ancorada); `reactvision` = SDK ReactVision ("No VPS or ARCore pods required"). Gate obrigatório antes de migrar: lock do Δ <20s, headingAccuracy ≤15° outdoor.
- **A/B sem rebuild**: o provider é prop JS (Metro/Fast Refresh), mas as credenciais vivem no manifesto. Com `com.google.android.ar.API_KEY` + `com.reactvision.RVApiKey`/`RVProjectId` coexistindo no manifesto, alternar provider vira troca de prop. É por isso que o `build.gradle` injeta TODAS via `manifestPlaceholders` (env `EXPO_PUBLIC_GOOGLE_AR_API_KEY`, `EXPO_PUBLIC_RV_API_KEY`, `EXPO_PUBLIC_RV_PROJECT_ID`) e o `app.config.ts` repassa ao plugin do Viro (prebuilds futuros).
- Plugin só escreve cada meta-data se a respectiva key existir no config — enviar vazia não polui o manifesto.

### ⚙️ 15.2 API Essencial (contratos JS estáveis entre providers)
| Método | Retorno / Nota |
| :--- | :--- |
| `sceneNavigator.hostCloudAnchor(anchorId, ttlDays)` | `{ success, cloudAnchorId?, error?, state }` — anchorId local vem de `createAnchoredNode(hit)` (válido ~30s pós-hit). |
| `sceneNavigator.resolveCloudAnchor(cloudAnchorId)` | `{ success, anchor?: { anchorId, cloudAnchorId, position: [x,y,z], rotation, scale, state } }` — **position em coordenadas de SESSÃO** (não ECEF; lições 3.0.3: promise pendurava cross-session e/ou retornava ECEF ~6,37Mm — revalidado no 3.1.x, guard `MAX_SESSION_COORD_M=1000` em `use-ar-projection`). `node` pode ser null. |
| `getCloudAnchorStatus()` | Poll de progresso do resolve (`onCloudAnchorStateChange` foi REMOVIDO em 3.0.1 — nunca existiu ligado). |
| `cancelCloudAnchorOperations()` | Funciona desde 3.0.2, **só cancela ops do provider reactvision** (ARCore não tem cancel nativo). |
| `createGeospatialAnchor(lat, lng, altWGS84, quat?)` / `createTerrainAnchor(lat, lng, altAboveTerrain, quat?)` / `createRooftopAnchor(...)` | Local-only (anchorId = UUID random). Terrain/Rooftop falham sem dados do Google p/ o ponto (erro -20). |
| `getCameraGeospatialPose()` / `checkVPSAvailability(lat,lng)` / `isGeospatialModeSupported()` / `setGeospatialModeEnabled(bool)` / `getEarthTrackingState()` | Pose: lat/lng/alt/heading + horizontalAccuracy/verticalAccuracy/headingAccuracy (95%). |
| `startScan()` / `finishScan()` | **Provider reactvision APENAS** (pipeline VPS room-scale; coverage gate ≥40 pontos, ≥1m spread, ≥5 viewpoint pairs). Com `provider="arcore"` falham sempre ("Ancoragem Visual Indisponível"). |
| `<ViroARCloudAnchor cloudAnchorId onLocalized onLocalizeError>` | Resolve dentro da cena; children no frame resolvido (caminho oficial p/ cross-session, 3.0+). |
| Helpers | `gpsToArWorld(pose, lat, lng, alt)`, `latLngToMercator(lat, lng)`. |
| ReactVision-only (client key) | `rvFindNearbyCloudAnchors(lat,lng,raio,limit)` — busca por GPS; máx 50 âncoras num raio de 1.000m. `hostGeospatialAnchor`/`resolveGeospatialAnchor` (persistência no backend RV). |

### 🚦 15.3 `ViroCloudAnchorState` × Causa Raiz × Ação
| State | Causa | Ação |
| :--- | :--- | :--- |
| `ErrorNotAuthorized` | Key inválida/ausente OU API key restrita a apps (package+SHA-1) que não incluem o atual OU Play Services ausente/velho OU ARCore API desabilitada no projeto Google Cloud | `aapt2 dump xmltree --file AndroidManifest.xml base.apk` no APK do device p/ conferir a key mergeada; Cloud Console → APIs & Credentials; `ERROR_NOT_AUTHORIZED` no ARCore cobre todos estes. |
| `ErrorResourceExhausted` | Quota ARCore: host 30/min, resolve 300/min **por projeto** | Backoff; dev com muitas sessões casa com intermitência. |
| `ErrorHostingDatasetProcessingFailed` | Poucos dados visuais no entorno (âncora FeaturePoint fraca) | Mover o device pelo ponto (≥30s de tracking), features distintas, luz estável; `startScan` (RV) guia pelo coverage gate. |
| `ErrorCloudIdNotFound` | TTL expirado ou ID errado | Re-hospedar (API key Google = TTL máx 24h!). |
| `ErrorResolvingLocalizationNoMatch` | Âncora existe mas NÃO foi vista deste ponto de vista | Sem retry na sessão; geospatial segue. |
| `ErrorCancelled` | `cancelCloudAnchorOperations()` (só reactvision) | Fluxo normal de saída. |

### 📏 15.4 Quotas, TTL e Autorização
- **TTL**: `ttlDays` 1–365. **API key do Google = máx 1 dia**; >1 dia exige autorização **keyless** (JWT assinado por service account — ARCore Cloud Anchors Authorization docs) OU provider reactvision (TTL longo nativo — verificar empiricamente).
- **Management API** (`arcore.googleapis.com/v1beta2/anchors`): **exige OAuth2** — API key NÃO é aceita (401 `CREDENTIALS_MISSING` verificado empiricamente 2026-11-10). Roadmap de renovação/limpeza via backend precisa de service account.
- ARCore API habilitada no projeto responde 401 de credencial (não 403 `SERVICE_DISABLED`) — diagnóstico rápido por REST.

### 🔑 15.5 Autenticação ReactVision Spatial
| Credencial | Prefixo | Onde vive | Alcance |
| :--- | :--- | :--- | :--- |
| Client key | `rv_client_` | No app (`rvApiKey` + `rvProjectId`) — pública por design | 1 projeto; host/resolve/find de cloud+geospatial anchors, Editor scenes, colocation join |
| Secret key | `rv_secret_` | Backend/builds internos — NUNCA em app publicado | Todos os projetos do time; list/edit/delete anchors, uploads, AI, mint de user tokens |
| User token | `rv_ut_` | Mintado pelo backend (1h, `POST /app-user-tokens`) | 1 projeto + 1 usuário; colocation/vps scopes |

- API REST: base `https://platform.reactvision.xyz/functions/v1`, header `x-api-key`.
- **Custos** (compute pool mensal): Cloud/Geospatial **anchors = incluídos** (sem cobrança por âncora); co-location **$0.01/dev/min** (exige plano pago); Advanced VPS **$0.60/min** de processamento de scan + $0.60/min localização server-mode (plano pago; $5 crédito/mês no Basic, $15 no Pro; spend limit default $100).
- Chaves erradas para a operação → 403 `API_KEY_TYPE_NOT_ALLOWED` ("This endpoint does not accept this type of API key").

### 🧭 15.6 Advanced VPS (ViroVPS) — o que é (e não é)
- Workflow: `startRecording`/`stopRecording` → `uploadScanRecording` (location + outputs: map/world_mesh/semantic/mesh/splat/poses) → processamento (map aceito: ≥500 pontos, ≥70% frames localizados, erro mediano ≤10cm) → `<ViroVPS>` track (device mode baixa o `map.rvmap`; server mode $0.60/min) → `<ViroVPSAnchor>` children no frame do mapa.
- **NÃO é** cloud anchor por pin: mapeia LUGARES (locations) — mudança de arquitetura (pins viram conteúdo ancorado em locais mapeados). Indoor OK, qualquer device iOS/Android. Pago.

### 🔒 15.7 Invariantes do Repo (com 3.1.x)
1. Provider ÚNICO: cloud + geospatial trocam JUNTOS; avaliar impacto no motor Δ antes de trocar.
2. Nunca confiar em posição nativa/cloud sem guard de sessão (`|coord| ≤ 1000m`) — ECEF/geo pode vazar (P7).
3. IDs `coord-*` e `ua-facens-*` = sintéticos, nunca resolvem; `ua-<hex>` = cloud anchor ID real do Google.
4. Hosting exige âncora LOCAL prévia (`createAnchoredNode` em hit anchorable — ExistingPlaneUsingExtent > FeaturePoint); hit expira ~30s.
5. `startScan/finishScan` só com provider reactvision.
6. Manifesto carrega AS DUAS credenciais (AR + RV) — A/B de provider é troca JS.
7. Management API e TTL>1d (Google) = OAuth/service account; âncoras com API key morrem em 24h.
8. Poll de `getCameraGeospatialPose` + unmount = SIGSEGV (§12.12): keep-alive 1.2s no blur da tab AR + anti-overlap no poll são OBRIGATÓRIOS; método é UIBlock interop, não chamada síncrona.

### 🔗 15.8 Links Canônicos
- Overview: https://viro-community.readme.io/docs/overview · Reference: https://viro-community.readme.io/reference/introduction
- Provider Setup: https://viro-community.readme.io/docs/provider-setup · Cloud Anchors: /docs/cloud-anchors · Geospatial: /docs/geospatial
- Authentication: /docs/authentication · Studio Setup (custos): /docs/reactvision-studio-setup · Co-Location: /docs/co-location · Advanced VPS: /docs/advanced-vps-and-scanning · Upgrade 3.1: /docs/upgrading-to-310
- **MCP Server** (docs vivas, platform matrix, validação de cena): `https://mcp.reactvision.xyz/viro` — configurado GLOBAL no opencode (`~/.config/opencode/opencode.json`).
- Issue-chave provider/keys: ReactVision/viro#498.

### 🏆 15.9 Leva 2 — Veredito do A/B de Providers (2026-11-10, device)

**VEREDITO: `provider="reactvision"` é o provider da épica** (`EXPO_PUBLIC_AR_PROVIDER=reactvision` no `.env`). Evidência empíricas:

| Critério | ReactVision | ARCore |
| :--- | :--- | :--- |
| Gate do Δ (D5) | ✅ travou em toda sessão (49.9°/58.7°/59.5°, 5–6 amostras, spread <10°) | ✅ igual |
| Persistência (D4 ≥30d) | ✅ **90 dias** nativo | ❌ 24h (API key Google) |
| Qualidade de hosting | ✅ **424–1094 keypoints** (faixa doc: 300–500) | ⚠️ dataset fraco → `DatasetProcessingFailed` |
| Resolve cross-session | ✅ 2/3 pins (`successful_resolve_count ≥ 1`) | ❌ promise pendurada nativa + matching não fecha indoor |
| Proximidade GPS | ✅ nearby funcional (raio 500m, client key) | ❌ inexistente |

### 🧭 15.10 Leva 3 — Pipeline OFICIAL implementado (fim da épica de hospedagem)

**Auditoria 2026-11-10 (tarde)**: taxa de resolve 24% (8/33) com keypoints ALTOS → o gargalo era o PIPELINE nosso, não o dataset. Más práticas erradicadas: hosting fora do pipeline oficial (âncora de plano + `hostCloudAnchor` + "escaneio guiado" de timer cego SEM coverage gate), resolve às cegas (sem poll de status, 1 tentativa/sessão), sem reports de resolve, matemática de frame própria (world coords entre sessões), pins cloud "pulsando" para fallback GPS.

**Fluxo NOVO (fidelidade à doc VPS)**:
1. **Hosting** (`use-anchor-scan.ts`): `startScan()` → usuário **ANDE** pelo entorno (doc: *"walk, don't rotate in place"*) → `getScanStatus()` @1Hz (**coverage gate VISÍVEL na UI**: keyframes X/min, pares de visão, percurso m — cada métrica traz o próprio mínimo) → `finishScan(30d)` → `{cloudAnchorId}` → `getScanDiagnostics()` em falha nomeia o gate curto. **Offset ZERO por construção** (pin = âncora do scan; sem mira, sem frameOffset manual).
2. **Modal 2 etapas** (`place-anchor-modal.tsx`): ① Escanear (medidores + guia "ANDE/textura/luz") ② Confirmar (nome/salvar). Zero gates de GPS no caminho cloud; lat/lng best-effort (mapa 2D/proximity) — o RV grava GPS preciso no hosting.
3. **Resolve** (`use-cloud-anchors.ts`): `resolveCloudAnchor` + **poll `getCloudAnchorStatus()` @1Hz** (progress 0–1 + message para o HUD — a promise é silenciosa por design) + **re-tentativa com backoff** (15/30/60s — um tiro por sessão perde resolves) + **`rvTrackCloudAnchorResolution()`** após cada tentativa (best practice: *"report every resolve"*).
4. **Estado honesto**: pins cloud não-localizados ficam **invisíveis com selo no HUD** ("N p/ aproximar") — `noFallbackIds` na projeção PROÍBE fallback GPS para pins cloud (fim do "pin pulando").
5. **Aprendizados do processo**: misturar providers no banco (ua- Google vs UUID RV) polui a experiência; espelhos nunca relocalizam (SIFT); `resolve: "Localisation timed out — move closer"` é o SDK guiando o usuário; o RNGH sobre a GLSurfaceView consome toques (se algum dia precisar de toque nativo no Viro, `Gesture.Native()` é o passthrough).

**Removidos**: hit-test manual de criação, `createAnchoredNode`, gates `CREATE_MAX_*`, mira/`frameOffset` manual, `ViroARPlaneSelector` (artefatos azuis), preview bar, `setPendingLocalAnchor`/`hostPendingAnchor` (hosting antigo), timeout cego 45s.

### 📌 15.11 Pin visível NA HORA + física da relocalização (2026-11-10, noite)

**Bug "salvei e o pin não apareceu"**: o estado honesto (sem fallback GPS) deixava o pin INVISÍVEL até o resolve fechar — que demora dezenas de segundos por design. **Fix pelo exemplo oficial `vps-lite-test`**: *"its own locationTransform as a stand-in for a resolved anchor's transform"* — o **`locationTransform` do `finishScan()` é o frame do scan NESSA sessão**. `parseLocationTransform(token)` (export oficial) → 16 floats column-major onde **[12],[13],[14] = translação** = posição de mundo da origem do scan. Fluxo final: save → entry **provisária** (`setProvisionalEntry`) com essa posição → pin na tela **<1s** → o resolve continua elegível para o provisório e **substitui** pela posição definitiva quando confirma (transição suave — sem pulo). `resolveCloudAnchor` também traz `anchor.resolvedTransform` (mesmo formato) — fallback canônico quando `.position` falta. Fila de resolve ordenada por **createdAt DESC** (pin novo primeiro: features do scan em memória = match quase imediato).

**Física da relocalização (resposta a "por que depender de olhar?")**: a posição FÍSICA do pin nunca muda; o que falta é o CELULAR saber onde ELE está. Cada sessão AR nasce com coords arbitrárias (origem = onde o app abriu) — sem relação com sessões anteriores. GPS indoor (±5–15m) não resolve precisão cm. O único mapa do cômodo é o que hospedamos → o SDK só calcula "sessão atual ↔ frame da âncora" **comparando a câmera com o mapa visual** (SIFT). Analogia: chegar de olhos vendados numa sala — o objeto escondido nunca se moveu, mas você só o localiza ao TIRAR A VENDA e reconhecer a sala. O "80% — waiting on a second match" é o SDK pedindo uma segunda visão do lugar; fechado o match, o pin fica cravado mesmo olhando pra outro lado. Outdoor com VPS Google (Street View) dispensa isso — mapa global já existe; indoor não. HUD escalonado: "olhe o ponto" → >25s: "aponte a câmera para onde escaneou".

### 🎯 15.12 VERDADE FINAL: hostCloudAnchor por PONTO ≠ finishScan por SALA (dados da plataforma, 2026-11-10 noite)

**A lição que encerra a saga** (prova: `GET /cloud-anchors/list` com secret key — dados crus da plataforma):

| Caminho | Âncoras | GPS tag | Resolve | Taxa |
| :--- | :--- | :--- | :--- | :--- |
| `finishScan()` (frame da SALA) | 5 | **100% NULL** | 1/19 | **5%** |
| `hostCloudAnchor(plano)` (PONTO) | 3 | **100% ✓** | 10/40 (Armário 7/13) | **25–54%** |

Doc-fonte (`ViroEvents.ts` do repo): *"`hostCloudAnchor()` ties it to a **hand-placed physical anchor**; `finishScan()` (room/building-scale scans) ties it to a [room frame]"*. `finishScan` é para CO-LOCATION (sala compartilhada); **pins de POI = plane/hit + `hostCloudAnchor`** — o guia oficial Cloud Anchors. A lição E1 da auditoria (§15.10) estava MEIA certa: o problema nunca foi o `hostCloudAnchor` — era a UX em volta (gates de GPS, mira confusa). O scan de sala foi um desvio de 2 dias.

**Fluxo FINAL (`use-point-hosting.ts`)**: modal → "Posicionar Ponto" → usuário mira o ponto e **TOCA na retícula** (tap do RNGH, roteado quando phase==='placing') → hit-test pontual 1× → preferir `ExistingPlane*` → `createAnchoredNode` (âncora NO PONTO) → guia 8s "mova ao redor do ponto" (best practice da doc) → `hostCloudAnchor(anchorId, 30d)` → hosted{cloudAnchorId, position=hit} → salvar → **provisória EXATA** (posição do ponto, não da câmera) → resolve confirma.

**Fixes do loop de resolve** (lição dos logs 18:46: `"already in progress" (2ms!)`): backoff **60/90/120s** (sempre > vida nativa ~30s); `"already in progress"` = resolve nativo em curso → **re-check 12s sem penalizar** (não é falha); timeout JS 45s.

**Secret key no backend** (`RV_SECRET_API_KEY` no `.env.api`): o painel `ar/diagnostics` usa `/cloud-anchors/list` (1 request, todas + private); client key permanece só no app. ⚠️ Secret = edit/delete — nunca no client.

**Lições de device:**
1. **IDs por provider NÃO são intercambiáveis**: `ua-<hex>` = Google (arcore); **UUID = ReactVision**. Pins com ID do provider errado nunca resolvem e poluem a experiência como fallback GPS — classificar antes de tentar resolve (endpoint de diagnóstico faz; `coord-*`/`ua-facens-*` = sintéticos). A "precisão horrível entre sessões" era majoritariamente ESTA divergência no banco.
2. **Espelho/reflexivo nunca relocaliza** (SIFT): "Teste vr espelho" = 492 keypoints, 9 resolves, 0 sucessos. Superfícies refletivas e lisas = hospedagem proibida por física.
3. **A API REST RV é o melhor instrumento de diagnóstico**: `GET /cloud-anchors/{id}?project_id=` (client key OK, 300/min) retorna `keypoint_count`, `resolve_count`, `successful_resolve_count`, `average_confidence`, GPS tag e `descriptors_url`. `/cloud-anchors/list` exige **secret key** (criar `rv_secret_` no Editor quando precisar); `/nearby` aceita client key (50 âncoras/1000m, públicas).
4. **Endpoint de diagnóstico no backend**: `GET /ar/diagnostics/cloud-anchors` (módulo `ar-diagnostics`, `@Public()` — natureza healthcheck) cruza o banco com a API RV e classifica providers. Env: `RV_CLIENT_API_KEY` + `RV_PROJECT_ID` no `.env.api`.
5. O crash de detach (§12.12) é **provider-agnóstico** (bug comum do viro_core) — reproducido com ambos.
