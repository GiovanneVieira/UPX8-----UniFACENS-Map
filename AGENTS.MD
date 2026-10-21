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
> 5. **Escala Dinâmica com Clamping e Distância Métrica nos Pins 3D**:
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
