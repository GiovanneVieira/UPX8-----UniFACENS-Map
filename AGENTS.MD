# 🧭 Diretrizes de Desenvolvimento e Arquitetura para Agentes (AGENTS.MD)
> **UniFACENS-Map** — Monorepo de Navegação no Campus & Realidade Aumentada (AR)
> Este documento é a fonte primária de verdade (SSOT) técnica e arquitetural para agentes de IA e desenvolvedores que operam neste repositório.

---

## 📑 Sumário
1. [Visão Geral do Projeto & Stack](#1-visão-geral-do-projeto--stack)
2. [Estrutura do Monorepo & Montagem dos Packages](#2-estrutura-do-monorepo--montagem-dos-packages)
3. [Princípios de Engenharia de Software (SOLID & Clean Code)](#3-princípios-de-engenharia-de-software-solid--clean-code)
4. [Backend (`unifacens-api`): Drizzle ORM, Performance & Prevenção de N+1](#4-backend-unifacens-api-drizzle-orm-performance--prevenção-de-n1)
5. [Frontend (`unifacens-client`): Arquitetura, NativeWind 4 & Pattern Composição](#5-frontend-unifacens-client-arquitetura-nativewind-4--pattern-composição)
6. [Regras Críticas do `useEffect` ("You Might Not Need an Effect")](#6-regras-críticas-do-useeffect-you-might-not-need-an-effect)
7. [Arquitetura de Estado Unificada: TanStack Query v5, Zustand v5, TanStack Form & Custom Hooks](#7-arquitetura-de-estado-unificada-tanstack-query-v5-zustand-v5-tanstack-form--custom-hooks)
8. [Fluxo de Desenvolvimento, Comandos & Checklist do Agente](#8-fluxo-de-desenvolvimento-comandos--checklist-do-agente)
9. [Validação Visual e de Telas (UI Visual Validation & A11y)](#9-validação-visual-e-de-telas-ui-visual-validation--a11y)
10. [Diretrizes de Realidade Aumentada (ViroReact) & Execução Mobile](#10-diretrizes-de-realidade-aumentada-viroreact--execução-mobile)
11. [Modelo Matemático Geodésico: Fontes, Fórmulas & Roteiro de Precisão](#11-modelo-matemático-geodésico-fontes-fórmulas--roteiro-de-precisão)
12. [Investigação de Drift de Inicialização, Persistência Exata & Soluções da Indústria (ARCore / ARKit / ViroReact)](#12-investigação-de-drift-de-inicialização-persistência-exata--soluções-da-indústria-arcore--arkit--viroreact)

---

## 1. Visão Geral do Projeto & Stack

O **UniFACENS-Map** é uma plataforma que visa mapear e fornecer navegação interativa pelo campus da UniFACENS, combinando geolocalização e **Realidade Aumentada (AR)** para guiar estudantes, professores e visitantes entre blocos, salas de aula, laboratórios, serviços e pontos de interesse.

### 🧱 Stacks por Camada

| Camada / Package | Tecnologias Principais | Propósito |
| :--- | :--- | :--- |
| **`packages/shared`** | TypeScript 7+, Node.js (ESM) | Contratos de tipos, DTOs, schemas de validação, constantes e enums universais. |
| **`unifacens-api`** | NestJS 12 (ESM), Drizzle ORM, PostgreSQL (`pg`), Vitest, Oxlint | API RESTful, cálculo de rotas do campus, persistência de blocos, salas e POIs. |
| **`unifacens-client`** | Expo SDK 57, React Native 0.86, React 19, Expo Router, NativeWind 4, TanStack Query v5, Zustand v5, TanStack Form, ViroReact (`@reactvision/react-viro`) | App Mobile (iOS/Android) e Web com renderização 2D de mapa e projeção AR na câmera. |
| **Infraestrutura** | Docker Compose, PostgreSQL | Execução local isolada do banco de dados e serviços do monorepo. |

---

## 2. Estrutura do Monorepo & Montagem dos Packages

O repositório adota a arquitetura de **NPM Workspaces** declarada no `package.json` raiz:
```json
"workspaces": [
  "./packages/*",
  "./unifacens-api",
  "./unifacens-client"
]
```

### 📦 2.1 Package `packages/shared` (Single Source of Truth)
O core de compartilhamento entre backend e frontend.
* **O que DEVE conter**:
  * **Schemas Zod Centrais**: Todos os schemas de validação residem em `packages/shared/src/schemas/`.
  * **Tipos TypeScript Inferidos**: Os tipos de DTOs e entidades são derivados diretamente dos schemas via `z.infer<typeof schema>` (ex: `export type CreateAnchorDto = z.infer<typeof createAnchorSchema>;`).
  * **Reexportação do Zod**: `packages/shared/src/index.ts` reexporta `z` (`export { z } from 'zod';`).
  * Enums de domínio e constantes universais.
  * Funções utilitárias puras (ex: sanitizadores, cálculos de projeção).
* **O que NUNCA deve conter**:
  * Dependências de React, React Native ou Expo.
  * Dependências de NestJS ou drivers de banco (`pg`, `drizzle-orm`).
* **Princípio da Dependência Única de Validação**:
  * **Apenas `packages/shared` declara `"zod"` em suas `dependencies`**.
  * Nem a API (`unifacens-api`) nem o Client (`unifacens-client`) devem instalar `zod` separadamente em seus `package.json`. Ambos importam `z`, os schemas e os tipos diretamente de `shared`:
    ```typescript
    import { z, createAnchorSchema, type CreateAnchorDto } from 'shared';
    ```
  * Isso elimina duplicidade de binários, previne falhas de versão desalinhada entre pacotes e garante que validações no frontend e no backend sejam 100% idênticas e automáticas.

### 🚀 2.2 Package `unifacens-api`
Servidor em NestJS 12 configurado com `"type": "module"` (ESM nativo).
* **Montagem Arquitetural**:
  ```text
  unifacens-api/src/
  ├── common/             # Interceptors, Filters, Guards, Decorators genéricos
  ├── config/             # Validação de variáveis de ambiente (.env)
  ├── db/                 # Infraestrutura de banco de dados
  │   ├── schema.ts       # Definição de tabelas e relações do Drizzle
  │   ├── index.ts        # Conexão do pool PostgreSQL com drizzle()
  │   └── migrations/     # Migrations geradas pelo drizzle-kit
  ├── modules/            # Módulos verticais de negócio
  │   ├── buildings/      # Exemplo: Módulo de Blocos e Prédios
  │   │   ├── dto/        # DTOs específicos da API estendendo shared
  │   │   ├── buildings.controller.ts
  │   │   ├── buildings.service.ts
  │   │   ├── buildings.repository.ts
  │   │   └── buildings.module.ts
  │   ├── routes/         # Módulo de nós de rota e pathfinding
  │   └── pois/           # Pontos de interesse
  ├── app.module.ts       # Módulo raiz agregador
  └── main.ts             # Bootstrap da aplicação
  ```

### 📱 2.3 Package `unifacens-client`
Aplicação Expo SDK 57 com Expo Router (roteamento baseado em arquivos) e React 19.
* **Montagem Arquitetural (Feature-Driven)**:
  ```text
  unifacens-client/src/
  ├── app/                # Rotas do Expo Router (Telas). MANTENHA-AS FINAS!
  │   ├── _layout.tsx     # Layout raiz, provedores e temas
  │   ├── index.tsx       # Tela inicial / Mapa 2D
  │   └── ar/             # Telas de navegação em Realidade Aumentada
  ├── features/           # Módulos de domínio ricos (Lógica + UI)
  │   ├── map/
  │   │   ├── components/ # Componentes exclusivos da feature de mapa
  │   │   ├── hooks/      # Custom hooks da feature (ex: useCampusMap)
  │   │   ├── queries/    # TanStack queries e mutations
  │   │   └── types/
  │   ├── ar-navigation/  # Lógica de AR e ViroReact
  │   │   ├── components/ # ARScene, HUD, marcadores 3D
  │   │   └── hooks/      # useARSession, useCompassHeading
  │   └── search/         # Busca de salas e blocos
  ├── components/         # Componentes compartilhados / Design System UI
  │   ├── ui/             # Botões, cards, modais, badges atômicos
  │   └── layout/         # Headers, bottom sheets, safe containers
  ├── stores/             # Stores globais do Zustand (apenas Client State de UI)
  ├── hooks/              # Custom hooks universais (ex: useTheme, useDebounce)
  ├── services/           # Cliente HTTP (Axios/Fetch configurado com baseURL)
  └── constants/          # Constantes visuais, temas e limites de layout
  ```

### 🔐 2.4 Gestão de Variáveis de Ambiente (.env.api e .env.client)
O monorepo adota a estratégia enxuta de arquivos de ambiente dedicados por container (sem arquivo `.env` genérico na raiz):
* **`.env.api`**: Variáveis do backend NestJS e credenciais do banco PostgreSQL (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, segredos, chaves de API). Mapeado no compose via `env_file: .env.api` para os serviços `api` e `postgres`.
* **`.env.client`**: Variáveis exclusivas do frontend Expo (`REACT_NATIVE_PACKAGER_HOSTNAME`, `EXPO_PUBLIC_API_URL`, `EXPO_OFFLINE`, `EXPO_PUBLIC_GOOGLE_AR_API_KEY`). Mapeado no compose via `env_file: .env.client` para o serviço `client`.
* **Injeção Dinâmica de Segredos no Android (Zero Hardcoding)**:
  - Chaves de API e segredos nativos (como a chave do Google ARCore) **NUNCA** devem ser hardcoded em `app.json` ou `AndroidManifest.xml`.
  - A chave reside estritamente no arquivo gitignorado `.env.client` como `EXPO_PUBLIC_GOOGLE_AR_API_KEY`.
  - O script [`android/app/build.gradle`](file:///home/giovanne/Documentos/UPX8/UniFACENS-Map/unifacens-client/android/app/build.gradle) carrega `.env.client` dinamicamente durante a compilação e injeta a chave no manifesto via `manifestPlaceholders = [ googleArApiKey: googleArApiKey ]`.
  - O [`AndroidManifest.xml`](file:///home/giovanne/Documentos/UPX8/UniFACENS-Map/unifacens-client/android/app/src/main/AndroidManifest.xml) referencia apenas a variável `${googleArApiKey}`.
* **Arquivos `.example`**: Todos os arquivos possuem seus respectivos templates (`.env.api.example`, `.env.client.example`) que devem ser mantidos sempre atualizados e versionados no Git com valores placeholder fictícios.

---

## 3. Princípios de Engenharia de Software (SOLID & Clean Code)

Todo código produzido neste repositório deve respeitar rigorosamente os princípios **SOLID**:

### 🎯 S — Single Responsibility Principle (Responsabilidade Única)
* **No Backend**:
  * **Controllers**: Apenas recebem requisições HTTP, validam DTOs e devolvem status HTTP. Nenhuma regra de negócio ou query SQL no controller.
  * **Services**: Orquestram regras de negócio, validações de domínio e cálculos de rotas.
  * **Repositories**: Isolam o acesso ao banco de dados Drizzle ORM.
* **No Frontend**:
  * **Componentes Visuais**: Apenas renderizam UI e propagam eventos.
  * **Custom Hooks**: Isolam estado, chamadas de API e subscrições de sensores.
  * **Stores**: Guardam estado reativo e suas transições puras.

### 🔓 O — Open/Closed Principle (Aberto para Extensão, Fechado para Modificação)
* Extensibilidade via abstrações, interfaces e injeção de dependências.
* No React, crie componentes customizáveis através de **Composição (children/slots)** em vez de empilhar flags booleanas dentro do mesmo componente.

### 🔄 L — Liskov Substitution Principle (Substituição de Liskov)
* Interfaces de repositórios e serviços no backend devem permitir implementações alternativas (ex: `MemoryBuildingRepository` para testes unitários rápidos sem banco de dados).

### 🧩 I — Interface Segregation Principle (Segregação de Interfaces)
* Evite interfaces gigantes no `packages/shared`.
* Prefira interfaces pequenas e focadas. Clientes não devem ser forçados a depender de campos que não utilizam.

### 💉 D — Dependency Inversion Principle (Inversão de Dependência)
* O NestJS provê injeção de dependência nativa. Sempre injete dependências através de construtores e utilize abstrações/tokens quando houver múltiplos provedores ou necessidade de isolamento para testes.
* No frontend, utilize Context Providers (TanStack Query, Temas) ou injeção de parâmetros nos custom hooks.

---

## 4. Backend (`unifacens-api`): Drizzle ORM, Performance & Prevenção de N+1

### ⚠️ O Problema N+1 Queries
Ocorre quando para buscar uma entidade e suas relações, o código executa 1 query para a lista principal e mais **N queries separadas** em loops para cada item filho:

```typescript
// ❌ PÉSSIMO: N+1 queries. Se houver 50 prédios, serão 51 queries ao banco!
async function getBuildingsWithRooms() {
  const buildings = await db.select().from(buildingsTable); // 1 query
  
  const result = [];
  for (const building of buildings) {
    // N queries executadas individualmente!
    const rooms = await db.select().from(roomsTable).where(eq(roomsTable.buildingId, building.id));
    result.push({ ...building, rooms });
  }
  return result;
}
```

### ✅ Soluções Corretas com Drizzle ORM

#### Abordagem 1: Drizzle Relational Queries (`db.query`)
Use a API relacional do Drizzle para carregar relações automaticamente em lote com `with`:
```typescript
// ✅ EXCELENTE: Executa queries otimizadas em batch (1 para buildings, 1 para rooms)
export async function getBuildingsWithRooms(db: DrizzleDB) {
  return await db.query.buildingsTable.findMany({
    with: {
      rooms: {
        columns: {
          id: true,
          name: true,
          floor: true,
          category: true,
        },
      },
    },
    columns: {
      id: true,
      code: true,
      name: true,
      latitude: true,
      longitude: true,
    },
  });
}
```

#### Abordagem 2: Joins Explícitos com Agregação
Para relatórios de alta performance ou rotas com filtros combinados:
```typescript
// ✅ EXCELENTE: 1 única query SQL com JOIN
export async function getBuildingWithRoomsJoined(db: DrizzleDB, buildingId: string) {
  return await db
    .select({
      building: buildingsTable,
      room: roomsTable,
    })
    .from(buildingsTable)
    .leftJoin(roomsTable, eq(roomsTable.buildingId, buildingsTable.id))
    .where(eq(buildingsTable.id, buildingId));
}
```

### 📐 Boas Práticas Adicionais no Backend:
1. **Seleção Estrita de Colunas**: Nunca use `SELECT *` desnecessariamente em tabelas com geometrias ou metadados pesados. Especifique `columns: { ... }`.
2. **Índices no PostgreSQL**: Certifique-se de que foreign keys (`building_id`, `node_id`), identificadores de código (`code`) e colunas de coordenadas possuam índices definidos no `schema.ts`.
3. **Transações Atômicas**: Operações que inserem rotas, blocos e nós de navegação devem sempre usar `await db.transaction(async (tx) => { ... })`.
4. **Validação Automática com `ZodValidationPipe`**: Nunca crie decorators manuais de validação com bibliotecas legadas (como `class-validator`). Todas as rotas `@Post`, `@Put` e `@Query` devem ser validadas usando o pipe dedicado [`ZodValidationPipe`](file:///home/giovanne/Documentos/UPX8/UniFACENS-Map/unifacens-api/src/common/pipes/zod-validation.pipe.ts) que recebe o schema importado de `shared`:
   ```typescript
   import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
   import { createAnchorSchema, type CreateAnchorDto } from 'shared';

   @Post()
   async createAnchor(
     @Body(new ZodValidationPipe(createAnchorSchema)) dto: CreateAnchorDto,
   ): Promise<AnchorCoordinate> {
     return this.anchorsService.create(dto);
   }
   ```
   Isso garante rejeição HTTP 400 imediata e padronizada com lista detalhada de campos inválidos caso o payload viole o contrato.
5. **Documentação Interativa com Scalar & OpenAPI (`/reference`)**:
   - A documentação interativa da API é gerada via `@nestjs/swagger` e servida pelo `@scalar/nestjs-api-reference` na rota `http://localhost:8000/reference`.
   - O Scalar substitui o Swagger UI tradicional por uma interface moderna, rápida, responsiva e com suporte a busca instantânea, visualização de schemas e geração de snippets de requisição.
   - Todos os controllers devem ser decorados com `@ApiTags('<tag>')` e cada rota com `@ApiOperation({ summary: '...' })`.
   - Configuração no [`src/main.ts`](file:///home/giovanne/Documentos/UPX8/UniFACENS-Map/unifacens-api/src/main.ts):
     ```typescript
     import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
     import { apiReference } from '@scalar/nestjs-api-reference';

     const swaggerConfig = new DocumentBuilder()
       .setTitle('UniFACENS Map API')
       .setDescription('Catálogo de Âncoras Espaciais e Google ARCore Cloud Anchors para o campus UniFACENS')
       .setVersion('1.0.0')
       .addTag('anchors', 'Gerenciamento de Google ARCore Cloud Anchors')
       .addTag('health', 'Healthcheck e Status da Aplicação')
       .build();

     const document = SwaggerModule.createDocument(app, swaggerConfig);
     app.use('/reference', apiReference({ spec: { content: document }, theme: 'kepler' }));
     ```
6. **Testes de Integração com Testcontainers (`@testcontainers/postgresql`)**:
   - ❌ **PROIBIDO usar Mocks em Testes de Integração**: Testes de integração em `test/integration/` **não devem** mockar serviços, repositórios ou banco de dados. Eles devem validar o comportamento real do stack completo.
   - ✅ **SEMPRE use Testcontainers com PostgreSQL Real**:
     - Cada suíte de teste de integração inicia um container descartável `new PostgreSqlContainer('postgres:16-alpine')` no hook `beforeAll`.
     - Executa as migrações oficiais do Drizzle via `migrate(drizzleDb, { migrationsFolder })` garantindo que as tabelas reflitam o estado real do schema.
     - Injeta a conexão real no TestingModule do NestJS (`provide: DRIZZLE, useValue: db`).
     - Executa requisições HTTP reais via `supertest`, validando os pipes Zod, regras de negócio do service, inserção e consulta no banco real e execução de teardown gracioso (`await container.stop()`) no `afterAll`.
     - Exemplo de padrão no [`test/integration/anchors/anchors.integration.spec.ts`](file:///home/giovanne/Documentos/UPX8/UniFACENS-Map/unifacens-api/test/integration/anchors/anchors.integration.spec.ts):
       ```typescript
       import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
       import { migrate } from 'drizzle-orm/node-postgres/migrator';

       beforeAll(async () => {
         container = await new PostgreSqlContainer('postgres:16-alpine')
           .withDatabase('unifacens_test')
           .start();
         const client = new pg.Client({ connectionString: container.getConnectionUri() });
         await client.connect();
         await migrate(drizzle({ client }), { migrationsFolder: path.resolve(__dirname, '../../../drizzle') });
         await client.end();
         // Injeta pool e db reais no NestJS TestingModule...
       }, 90000);
       ```

---

## 5. Frontend (`unifacens-client`): Arquitetura Modular & Pattern Composição

### 🧩 5.1 Modularização de Telas e Componentes
No Expo Router, os arquivos em `src/app/` são apenas **pontos de entrada de rotas**.
* **Regra**: Uma tela em `src/app/*.tsx` **não deve ultrapassar 60-80 linhas de código**. Ela apenas:
  1. Extrai parâmetros da URL / rota (`useLocalSearchParams`).
  2. Chama os provedores necessários da feature.
  3. Renderiza o componente orquestrador da feature.

```tsx
// ❌ RUIM: src/app/building/[id].tsx acumulando 400 linhas de estilos, queries e regras
// ✅ CORRETO: src/app/building/[id].tsx é uma casca fina
import { useLocalSearchParams } from 'expo-router';
import { BuildingDetailFeature } from '@/features/buildings/components/building-detail-feature';

export default function BuildingDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BuildingDetailFeature buildingId={id} />;
}
```

### 🧱 5.2 Pattern Composição (Evitando o "Boolean Prop Hell")
Evite criar componentes com dezenas de props condicionais (`hasIcon`, `isCard`, `showFooter`, `actionType`). Use **Composição** e **Compound Components**:

```tsx
// ❌ RUIM: Componente monólito e engessado
<BuildingCard 
  name="Bloco C" 
  floorCount={3} 
  showNavigationButton 
  navigationButtonText="Ir em AR" 
  onNavigate={() => {}} 
  badgeColor="blue"
  badgeText="Engenharias" 
/>

// ✅ CORRETO: Pattern Composição flexível e declarativo
<Card>
  <Card.Header>
    <Card.Title>Bloco C</Card.Title>
    <Badge variant="primary">Engenharias</Badge>
  </Card.Header>
  <Card.Content>
    <BuildingFloorSummary floorCount={3} />
  </Card.Content>
  <Card.Footer>
    <Button variant="ar" onPress={handleStartARNavigation}>
      Navegar em AR
    </Button>
  </Card.Footer>
</Card>
```

### 💨 5.3 Guia Definitivo do NativeWind 4 (Tailwind CSS no React Native)

O `unifacens-client` adota **NativeWind v4** (`tailwindcss: ^3.4.17`, `nativewind: 4.2.7`) como o **padrão universal de estilização para toda a interface 2D**.

#### ⚙️ Pipeline e Configurações Obrigatórias:
1. **Entrada CSS Raiz**: `src/app/_layout.tsx` deve conter impreterivelmente `import '../../global.css';` no topo.
2. **Escopo de Escaneamento (`tailwind.config.js`)**: O array `content` deve cobrir todo o diretório de código:
   ```javascript
   content: ["./src/**/*.{js,jsx,ts,tsx}"],
   presets: [require("nativewind/preset")],
   ```
3. **Metro Bundler (`metro.config.js`)**: Envelopado com `withNativeWind(config, { input: './global.css' })`.
4. **Babel Compiler (`babel.config.js`)**: Configurado com `jsxImportSource: "nativewind"` e preset `"nativewind/babel"`.

#### 🎯 Regras de Ouro do NativeWind no Projeto:
* **UI 2D 100% Declarativa com `className`**: Telas, modais, headers, botões, inputs, cards, chips e badges devem ser estilizados utilizando a prop `className="..."`.
* ❌ **EVITE `StyleSheet.create` para novas UIs 2D**: O uso de `StyleSheet.create` fica restrito a interpolações dinâmicas calculadas via Worklets/Reanimated a 60fps onde valores arbitrários de pixel mudam continuamente.
* ⚠️ **Fronteira Rígida entre Elementos 2D e o Motor 3D do ViroReact**:
  * **Elementos 2D (HUDs, Overlays, Menus, Modais)**: Renderizados fora da cena 3D, posicionados absolutamente sobre o `<ViroARSceneNavigator>` e estilizados **100% com classes do NativeWind** (`className="absolute top-12 left-4 right-4 flex-row justify-between z-20"`).
  * **Nós 3D Internos do Viro (`ViroARScene`, `ViroNode`, `ViroBox`, `ViroText`, `ViroMaterials`)**: O motor C++ do Viro **não interpreta classes CSS do NativeWind**. Os nós 3D devem utilizar propriedades nativas do Viro (`materials`, `position`, `scale`, `transformBehaviors={['billboardY']}`). Nunca passe `className` para componentes internos do Viro.

#### 🎨 Design Tokens & Identidade UniFACENS:
* **Tema Escuro Imersivo (Dark Mode)**:
  * Fundos: `bg-slate-950` (raiz), `bg-slate-900` (cards/modais), `bg-slate-800` (superfícies elevadas).
  * Bordas: `border-slate-800`, `border-slate-700`.
  * Tipografia: `text-white` (título), `text-slate-200` (corpo), `text-slate-400` (legendas/subtítulos).
* **Cores Semânticas**:
  * **Primário / Marca**: `bg-blue-600`, `border-blue-500`, `text-sky-400` (ações principais e nós de interesse).
  * **Sucesso / Tracking Normal**: `bg-emerald-600/90`, `border-emerald-500`, `text-emerald-300` (SLAM estável, salvar ponto).
  * **Aviso / Mapeamento**: `bg-amber-600/90`, `border-amber-500`, `text-amber-300` (SLAM inicializando, busca de planos).
  * **Erro / Perigo**: `bg-rose-600`, `border-rose-500`, `text-rose-400` (validações com erro, exclusão).
* **Feedback Tátil e Interatividade**:
  * Utilize `active:opacity-80`, `active:scale-95` em componentes `Pressable` ou `TouchableOpacity` para fornecer feedback visual imediato ao toque.

#### 💻 Exemplo Prático: HUD Superior e Botões Estilizados com NativeWind 4
```tsx
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

export function ARTopHUD({ anchorCount, isTracking, onOpenCalibration }: {
  anchorCount: number;
  isTracking: boolean;
  onOpenCalibration: () => void;
}) {
  return (
    <View className="absolute top-12 left-4 right-4 flex-row justify-between items-center z-20 pointer-events-box-none">
      <View className="flex-row items-center gap-2">
        {/* Badge de Contagem */}
        <View className="bg-slate-900/90 border border-blue-500/50 px-3 py-1.5 rounded-full shadow-lg">
          <Text className="text-sky-400 text-xs font-bold">
            AR • {anchorCount} {anchorCount === 1 ? 'Ponto' : 'Pontos'}
          </Text>
        </View>

        {/* Badge de SLAM Tracking */}
        <View className={`px-2.5 py-1.5 rounded-full border shadow-lg ${
          isTracking ? 'bg-emerald-950/80 border-emerald-500' : 'bg-amber-950/80 border-amber-500'
        }`}>
          <Text className="text-white text-xs font-semibold">
            {isTracking ? '🟢 Estável' : '🟡 Mapeando'}
          </Text>
        </View>
      </View>

      {/* Botão de Calibração */}
      <TouchableOpacity
        className="bg-slate-900/90 border border-slate-700 px-3 py-1.5 rounded-xl active:bg-slate-800 shadow-lg"
        onPress={onOpenCalibration}>
        <Text className="text-slate-200 text-xs font-medium">📍 Calibrar</Text>
      </TouchableOpacity>
    </View>
  );
```

---

## 6. Regras Críticas do `useEffect` ("You Might Not Need an Effect")

Com base na documentação oficial do React ([react.dev/learn/you-might-not-need-an-effect](https://react.dev/learn/you-might-not-need-an-effect)), **o `useEffect` existe para sincronizar componentes React com sistemas externos** (como sensores nativos, WebSockets, câmera AR). Ele **NÃO** deve ser usado para fluxo de dados interno da aplicação.

### 🚫 Os 5 Pecados Capitais do `useEffect` e Suas Correções:

#### 1. Transformação de Dados para Renderização
* ❌ **NUNCA FAÇA**: Usar `useEffect` para filtrar, ordenar ou calcular dados derivados com base em estado ou props.
```tsx
// ❌ PÉSSIMO: Redundante, causa re-render duplo e flickering
const [rooms, setRooms] = useState<Room[]>([]);
const [filteredRooms, setFilteredRooms] = useState<Room[]>([]);

useEffect(() => {
  setFilteredRooms(rooms.filter(r => r.floor === selectedFloor));
}, [rooms, selectedFloor]);

// ✅ CORRETO: Calcule diretamente durante a renderização (ou com useMemo se pesado)
const filteredRooms = useMemo(() => {
  return rooms.filter(r => r.floor === selectedFloor);
}, [rooms, selectedFloor]);
```

#### 2. Lógica Disparada por Ações do Usuário (Event Handlers)
* ❌ **NUNCA FAÇA**: Setar um estado no clique para depois disparar um efeito colateral dentro de um `useEffect`.
```tsx
// ❌ PÉSSIMO: Ação do usuário dissociada do seu evento
function handleSelectBuilding(building: Building) {
  setSelectedBuilding(building);
}
useEffect(() => {
  if (selectedBuilding) {
    logAnalytics('view_building', selectedBuilding.id);
    router.push(`/building/${selectedBuilding.id}`);
  }
}, [selectedBuilding]);

// ✅ CORRETO: Execute no próprio manipulador de evento
function handleSelectBuilding(building: Building) {
  setSelectedBuilding(building);
  logAnalytics('view_building', building.id);
  router.push(`/building/${building.id}`);
}
```

#### 3. Resetar Estado quando uma Prop / ID Muda
* ❌ **NUNCA FAÇA**: Observar uma prop em um `useEffect` para zerar estados internos.
```tsx
// ❌ PÉSSIMO: Estado desatualizado visível por um frame
function BuildingDetails({ buildingId }: { buildingId: string }) {
  const [selectedFloor, setSelectedFloor] = useState(1);
  useEffect(() => {
    setSelectedFloor(1); // Reset ao trocar prédio
  }, [buildingId]);
  // ...
}

// ✅ CORRETO: Use a prop "key" no componente pai para forçar recriação com estado limpo
<BuildingDetails key={buildingId} buildingId={buildingId} />
```

#### 4. Data Fetching Manual
* ❌ **NUNCA FAÇA**: Usar `useEffect` com `fetch()` manual, flags booleanas de `isLoading`, `error` e gerenciamento de cleanup manual.
* ✅ **CORRETO**: Use **TanStack Query** (`useQuery`). Ele trata cache, deduplicação, estados de loading, stale-while-revalidate e concorrência nativamente.

#### 5. Cadeias de Efeitos (Efeito cascata)
* ❌ **NUNCA FAÇA**: Efeito A atualiza Estado B, que dispara Efeito C, que atualiza Estado D.
* ✅ **CORRETO**: Calcule o que for possível na renderização ou processe a cadeia dentro do evento originador.

### ✅ Quando o `useEffect` É LEGÍTIMO neste Projeto:
* Iniciar e parar sensores de bússola/giroscópio (`expo-sensors` / `DeviceMotion`).
* Sincronizar o tracking do motor de Realidade Aumentada (ViroReact) com a câmera.
* Adicionar e remover listeners de eventos nativos do dispositivo.
* **REGRA OBRIGATÓRIA**: Sempre retorne uma função de cleanup para evitar memory leaks:
```tsx
useEffect(() => {
  const subscription = Location.watchPositionAsync(options, (location) => {
    updateUserPosition(location.coords);
  });

  return () => {
    subscription.then(sub => sub.remove()); // Cleanup imperativo!
  };
}, [options]);
```

---

## 7. Arquitetura de Estado Unificada: TanStack Query v5, Zustand v5, TanStack Form & Custom Hooks

O `unifacens-client` adota uma separação estrita de responsabilidades em **4 camadas especializadas de estado**, eliminando a sobreposição de dados, loops de re-renderização e boilerplate imperativo:

| Tipo de Estado | Tecnologia | O Que Gerencia | O Que NUNCA Deve Gerenciar |
| :--- | :--- | :--- | :--- |
| **1. Server State (Assíncrono / Remoto)** | **TanStack Query v5** (`@tanstack/react-query`) | Cache de dados do NestJS / PostgreSQL (âncoras salvas, âncoras projetadas na visão, rotas, blocos, salas, POIs). Tratamento nativo de `isPending`, `isError`, deduplicação e invalidação reativa. | Estado de UI efêmero, foco de inputs, pose em tempo real da câmera AR a 60fps. |
| **2. Global Client & Session State (Síncrono / Compartilhado)** | **Zustand v5** (`zustand`) | Estado de sessão da aplicação compartilhado entre telas (ponto de origem de calibração, azimute da sessão AR, tracking state do SLAM, âncora selecionada, modo mapa vs AR, preferências do usuário). | Cópia ou replicação de dados remotos vindos da API (anti-pattern de "cache manual"). |
| **3. Form State & Validação (Fluxo de Entrada de Dados)** | **TanStack Form v1** (`@tanstack/react-form`) | Ciclo de vida de campos de formulário (nome da âncora, descrição, filtros de busca), validação síncrona/assíncrona via schemas Zod, estados `isDirty`, `isTouched`, `canSubmit`, sem re-renderizar o formulário inteiro a cada tecla digitada. | Armazenamento de dados globais de sessão ou cache persistente de longa duração. |
| **4. Local Ephemeral State (Interno do Componente)** | **`useState` / `useReducer`** | Toggles puramente visuais e autocontidos que não ultrapassam a fronteira do componente (ex: visibilidade de um tooltip local, expansão de um accordion visual individual). | Dados que precisam ser lidos por múltiplos componentes irmãos ou telas. |

---

### 🌐 7.1 TanStack Query v5 (Server State & Cache Reativo)

Qualquer dado originado ou persistido no backend `unifacens-api` **pertence obrigatoriamente ao TanStack Query**.

#### ⚙️ Configuração do `QueryClientProvider` no `src/app/_layout.tsx`:
```tsx
const [queryClient] = useState(
  () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 1000 * 60 * 2, // 2 minutos de cache fresco
          gcTime: 1000 * 60 * 10,   // 10 minutos para coleta de lixo
          retry: 2,                 // 2 tentativas em caso de erro de rede
          refetchOnWindowFocus: false, // Evita refetch desnecessário em mobile
        },
      },
    }),
);
```

#### 🔑 Fábrica de Query Keys (`src/features/<feature>/queries/`):
Mantenha as chaves de query previsíveis, tipadas e centralizadas:
```typescript
export const anchorKeys = {
  all: ['anchors'] as const,
  lists: () => [...anchorKeys.all, 'list'] as const,
  projected: (query: NearbyAnchorsQuery) => [...anchorKeys.all, 'projected', query] as const,
  detail: (id: string) => [...anchorKeys.all, 'detail', id] as const,
};
```

#### 🎣 Hooks de Consulta e Mutação (`use-anchors-query.ts`):
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAnchors, fetchProjectedAnchors, projectAnchorFromCamera, deleteAnchor } from '@/services/api';

export function useAnchorsQuery() {
  return useQuery({
    queryKey: anchorKeys.lists(),
    queryFn: fetchAnchors,
  });
}

export function useProjectedAnchorsQuery(query: NearbyAnchorsQuery, enabled = true) {
  return useQuery({
    queryKey: anchorKeys.projected(query),
    queryFn: () => fetchProjectedAnchors(query),
    enabled: enabled && query.lat !== 0 && query.lon !== 0,
    staleTime: 1000 * 30, // 30 segundos para coordenadas projetadas
  });
}

export function useProjectAnchorFromCameraMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: ProjectFromCameraDto) => projectAnchorFromCamera(dto),
    onSuccess: () => {
      // Invalidação reativa automática: força refetch em qualquer componente inscrito!
      queryClient.invalidateQueries({ queryKey: anchorKeys.all });
    },
  });
}

export function useDeleteAnchorMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteAnchor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: anchorKeys.all });
    },
  });
}
```

* ❌ **NUNCA FAÇA**: `const [anchors, setAnchors] = useState([]); useEffect(() => { fetch().then(setAnchors) }, [])`.
* ✅ **FAÇA**: Consuma diretamente `const { data: anchors, isPending, error } = useProjectedAnchorsQuery(...)`.

---

### 🐻 7.2 Zustand v5 (Global Client & Session State)

O Zustand é o repositório de **estado de sessão síncrono e compartilhado** da aplicação mobile, localizado em `src/stores/`.

#### 🏛️ Arquitetura da Store de Sessão AR (`src/stores/use-ar-store.ts`):
```typescript
import { create } from 'zustand';

export interface ARSessionState {
  userLat: number;
  userLon: number;
  userAlt: number;
  originLabel: string;
  sessionHeading: number;
  isCalibrating: boolean;
  trackingState: number; // 1: Não disponível, 2: Limitado, 3: Normal
  selectedAnchorId: string | null;

  // Actions
  setOrigin: (label: string, lat: number, lon: number, alt: number, heading?: number) => void;
  setSessionHeading: (heading: number) => void;
  setTrackingState: (state: number) => void;
  setSelectedAnchorId: (id: string | null) => void;
  setIsCalibrating: (isCalibrating: boolean) => void;
}

export const useARStore = create<ARSessionState>((set) => ({
  userLat: -23.4699,
  userLon: -47.4297,
  userAlt: 590,
  originLabel: 'Campus Facens (Bloco A)',
  sessionHeading: 0,
  isCalibrating: false,
  trackingState: 1,
  selectedAnchorId: null,

  setOrigin: (label, lat, lon, alt, heading = 0) =>
    set({ originLabel: label, userLat: lat, userLon: lon, userAlt: alt, sessionHeading: heading }),
  setSessionHeading: (sessionHeading) => set({ sessionHeading }),
  setTrackingState: (trackingState) => set({ trackingState }),
  setSelectedAnchorId: (selectedAnchorId) => set({ selectedAnchorId }),
  setIsCalibrating: (isCalibrating) => set({ isCalibrating }),
}));
```

#### 🛡️ Regras Obrigatórias do Zustand v5:
1. **Seletores Granulares com `useShallow`**: No React 19, desestruturar a store inteira causa re-renderizações em cascata. Sempre utilize seletores finos:
   ```tsx
   import { useShallow } from 'zustand/react/shallow';

   // ✅ CORRETO: Só renderiza novamente se userLat, userLon ou sessionHeading mudarem
   const { userLat, userLon, sessionHeading } = useARStore(
     useShallow((state) => ({
       userLat: state.userLat,
       userLon: state.userLon,
       sessionHeading: state.sessionHeading,
     })),
   );
   ```
2. **Ações Integradas (Actions Colocadas na Store)**: Defina as funções modificadoras dentro do próprio `create((set) => ({ ... }))`, evitando dispatchers externos.
3. ❌ **PROIBIDO Duplicar Server State**: Nunca armazene a lista de âncoras salvas dentro do Zustand. Deixe a lista no TanStack Query; armazene no Zustand apenas o ponteiro de seleção local (`selectedAnchorId`).

---

### 📝 7.3 TanStack Form v1 (Formulários Tipados, Reativos e Validados)

Para entrada de dados estruturados (cadastrar ponto, editar metadados, formulários de busca parametrizada), utilize **TanStack Form** (`@tanstack/react-form`).

#### 💡 Por que TanStack Form em vez de `useState` em inputs:
* **Renderização Granular**: Quando o usuário digita em um campo, apenas aquele `<form.Field>` é re-renderizado. O modal inteiro, o mapa 2D ou a cena AR de fundo **não re-renderizam**, mantendo os 60 FPS estáveis.
* **Validação Declarativa e Segura**: Integração direta com schemas Zod ou validadores de função, sem código espaguete de validação manual.
* **Estado de Submissão Integrado**: Fornece `canSubmit`, `isSubmitting`, `isDirty`, `isValidating` nativamente através de `form.Subscribe`.

#### 🧩 Padrão de Integração com NativeWind (`src/components/ui/form-field.tsx`):
Encapsule a renderização do campo de entrada em um componente reutilizável estilizado com classes do Tailwind:
```tsx
import React from 'react';
import { View, Text, TextInput, type TextInputProps } from 'react-native';

interface FormInputFieldProps extends TextInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  errors?: string[];
  helperText?: string;
  className?: string;
}

export function FormInputField({
  label,
  value,
  onChangeText,
  onBlur,
  errors = [],
  helperText,
  className = '',
  ...textInputProps
}: FormInputFieldProps) {
  const hasError = errors.length > 0;

  return (
    <View className="mb-4">
      <Text className="text-sm font-semibold text-slate-200 mb-1.5">{label}</Text>
      <TextInput
        className={`w-full bg-slate-900 border rounded-xl px-3.5 py-2.5 text-sm text-slate-100 ${
          hasError ? 'border-rose-500' : 'border-slate-700 focus:border-blue-500'
        } ${className}`}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholderTextColor="#94A3B8"
        {...textInputProps}
      />
      {hasError ? (
        <Text className="text-xs text-rose-400 mt-1 font-medium">{errors.join(', ')}</Text>
      ) : helperText ? (
        <Text className="text-xs text-slate-400 mt-1">{helperText}</Text>
      ) : null}
    </View>
  );
}
```

#### 💻 Exemplo Prático: Modal de Criação de Ponto Geoespacial com TanStack Form + TanStack Query + NativeWind
```tsx
import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { useForm } from '@tanstack/react-form';
import { FormInputField } from '@/components/ui/form-field';
import { useProjectAnchorFromCameraMutation } from '@/features/anchors/queries/use-anchors-query';
import { useARStore } from '@/stores/use-ar-store';

export function CreateAnchorModal({
  visible,
  onClose,
  cameraPosition,
  cameraForward,
}: {
  visible: boolean;
  onClose: () => void;
  cameraPosition: [number, number, number];
  cameraForward: [number, number, number];
}) {
  const { userLat, userLon, userAlt, sessionHeading } = useARStore();
  const createMutation = useProjectAnchorFromCameraMutation();

  const form = useForm({
    defaultValues: {
      name: '',
      distanceMeters: '1.5',
    },
    onSubmit: async ({ value }) => {
      await createMutation.mutateAsync({
        name: value.name.trim(),
        originLat: userLat,
        originLon: userLon,
        originAlt: userAlt,
        sessionHeadingDeg: sessionHeading,
        cameraPosition,
        cameraForward,
        distanceMeters: parseFloat(value.distanceMeters) || 1.5,
      });
      form.reset();
      onClose();
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View className="flex-1 justify-end bg-black/60 p-4">
        <View className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
          <Text className="text-lg font-bold text-white mb-1">📍 Novo Ponto Geoespacial</Text>
          <Text className="text-xs text-slate-400 mb-5">
            O backend calculará a Latitude e Longitude exatas a partir da pose da câmera.
          </Text>

          {/* Campo: Nome da Âncora com TanStack Form validado pelo schema Zod de shared */}
          <form.Field
            name="name"
            validators={{
              onChange: ({ value }) => {
                const res = createAnchorSchema.shape.name.safeParse(value);
                return res.success ? undefined : res.error.errors[0]?.message;
              },
            }}>
            {(field) => (
              <FormInputField
                label="Nome do Ponto"
                placeholder="Ex: Laboratório de Robótica, Porta Bloco C"
                value={field.state.value}
                onChangeText={field.handleChange}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors as string[]}
              />
            )}
          </form.Field>

          {/* Ações do Modal com form.Subscribe */}
          <View className="flex-row justify-end gap-3 mt-4">
            <TouchableOpacity
              className="px-4 py-2.5 rounded-xl bg-slate-800 active:bg-slate-700"
              onPress={onClose}>
              <Text className="text-slate-300 text-sm font-medium">Cancelar</Text>
            </TouchableOpacity>

            <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <TouchableOpacity
                  className={`px-5 py-2.5 rounded-xl flex-row items-center ${
                    canSubmit && !isSubmitting && !createMutation.isPending
                      ? 'bg-emerald-600 active:bg-emerald-500'
                      : 'bg-emerald-950/60 opacity-50'
                  }`}
                  disabled={!canSubmit || isSubmitting || createMutation.isPending}
                  onPress={form.handleSubmit}>
                  <Text className="text-white text-sm font-bold">
                    {isSubmitting || createMutation.isPending ? 'Salvando...' : 'Projetar e Salvar'}
                  </Text>
                </TouchableOpacity>
              )}
            </form.Subscribe>
          </View>
        </View>
      </View>
    </Modal>
  );
}
```

---

### 🔄 7.4 Diagrama da Orquestração Integrada (Como as 4 Ferramentas Operam Juntas)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               FLUXO INTEGRADO CLIENTE-SERVIDOR                          │
└────────────────────────────────────────────────────────────────────────────────────────┘

  1. ESTADO GLOBAL DE AR (Zustand)
     [ useARStore ] ───────────► Mantém [ trackingState, cloudStatus, activeAnchorsCount ]
                                   │
                                   ▼
  2. VISADA & CAPTURA AR (ViroReact + Google ARCore)
     [ ViroARScene ] ──────────► Detecta planos físicos horizontais (chão/mesas) e pose 6DoF
                                   │
                                   ▼ Ao tocar no plano ou mirar
  3. HOSPEDAGEM NA NUVEM (Google Cloud Anchors)
     [ hostCloudAnchor ] ──────► ARCore extrai nuvem de pontos SLAM e gera "cloudAnchorId"
                                   │
                                   ▼
  4. PERSISTÊNCIA NO BACKEND (unifacens-api)
     [ useMutation ] ──────────► Envia POST /anchors { name, cloudAnchorId, description }
     [ AnchorsService ] ───────► Salva no PostgreSQL tabela "anchors"
                                   │
                                   ▼
  5. RESOLUÇÃO VISUAL EM QUALQUER DISPOSITIVO (Google ARCore)
     [ resolveCloudAnchor ] ───► ARCore busca assinatura visual na Google e ancora no espaço físico
     [ ViroARScene ] ──────────► Renderiza nó 3D na pose milimétrica retornada pelo ARCore
```

---

### 🎣 7.5 Custom Hooks como Fronteira de Abstração
Componentes React não devem ter conhecimento direto de detalhes de implementação da API ou cálculos matemáticos complexos de posicionamento.
* Extraia toda a lógica de orquestração para **Custom Hooks**:
  ```tsx
  // Exemplo: src/features/ar-navigation/hooks/use-ar-navigator.ts
  export function useARNavigator(destinationId: string) {
    const { data: route, isLoading } = useRouteQuery(destinationId);
    const userLocation = useUserLocation();
    const compassHeading = useCompassHeading();
    const activeStep = useNavigationStore((s) => s.currentStepIndex);

    // Cálculos de orientação vetorial para renderizar a seta no ViroReact...

    return {
      route,
      isLoading,
      arrowBearing: computedBearing,
      distanceRemaining: computedDistance,
      nextInstruction: route?.steps[activeStep]?.instruction,
    };
  }
  ```

---

## 8. Fluxo de Desenvolvimento, Comandos & Checklist do Agente

### 🛠️ Comandos Principais

```bash
# Na Raiz do Monorepo:
npm install                        # Instala dependências de todos os workspaces

# Backend (unifacens-api):
npm --workspace=unifacens-api run start:dev     # Inicia API em watch mode
npm --workspace=unifacens-api run lint          # Executa oxlint com checagem de tipos
npm --workspace=unifacens-api run test          # Executa testes unitários com Vitest
npm --workspace=unifacens-api run test:e2e      # Executa testes E2E com Vitest
npx drizzle-kit generate                        # Gera migrations a partir do schema.ts

# Frontend (unifacens-client):
npm --workspace=unifacens-client run start      # Inicia Metro Bundler do Expo
npm --workspace=unifacens-client run android    # Executa build de desenvolvimento Android
npm --workspace=unifacens-client run ios        # Executa no simulador/dispositivo iOS
npm --workspace=unifacens-client run web        # Executa no navegador Web
npm --workspace=unifacens-client run lint       # Executa o linter do Expo
```

### 📋 Checklist de Qualidade Obrigatório para Qualquer Modificação:
Antes de considerar qualquer tarefa finalizada, o agente deve verificar:

1. [ ] **Princípios SOLID aplicados**: Funções, classes e componentes possuem responsabilidade única clara.
2. [ ] **Sem N+1 Queries**: Consultas relacionais com Drizzle utilizam `db.query` com `with` ou `leftJoin` agregados. Nenhuma query dentro de `.map()` ou loops assíncronos.
3. [ ] **Modularização no Client**: Telas em `src/app/` são orquestradoras finas. A lógica e UI residem em `features/` e componentes atômicos em `src/components/ui/`.
4. [ ] **Estilização 2D com NativeWind 4**: Toda a interface 2D (telas, modais, headers, botões, cards, badges) utiliza classes utilitárias `className="..."` do Tailwind. Zero novos `StyleSheet.create` para elementos 2D estáticos. Nós 3D do ViroReact utilizam props nativas do Viro.
5. [ ] **Pattern Composição**: Componentes de interface usam composição (`children`, compound components) em vez de prop drilling de dezenas de booleans.
6. [ ] **Conformidade com `useEffect`**: Nenhum cálculo derivado, manipulação de evento ou fetch de dados foi feito dentro de `useEffect`.
7. [ ] **Server State no TanStack Query v5**: Todas as requisições HTTP para a API NestJS utilizam hooks `useQuery` ou `useMutation` com query keys centralizadas (`anchorKeys`). Invalidação reativa automática configurada. Nenhum fetch manual com `useState`.
8. [ ] **Client State no Zustand v5**: Dados de sessão global (origem, heading da câmera, status SLAM, âncora selecionada) residem em stores de `src/stores/` consumidas exclusivamente via seletores com `useShallow`. Zero duplicação de dados remotos no Zustand.
9. [ ] **Formulários com TanStack Form v1**: Entradas de dados e modais utilizam `useForm` de `@tanstack/react-form` com validação tipada e renderização granular por campo (`form.Field`), integrando-se com `FormInputField`.
10. [ ] **Custom Hooks Criados**: Lógica de sensores, estado complexo ou queries está devidamente isolada em hooks.
11. [ ] **Tipagem Rigorosa & Zod SSOT**: Todos os contratos de DTO, entidades e validações residem em `packages/shared/src/schemas/`. Apenas `packages/shared` possui dependência direta de `zod`. A API e o Client utilizam schemas Zod e tipos derivados (`z.infer`) importados de `shared`, com `ZodValidationPipe` protegendo as rotas NestJS e TanStack Form validando no frontend. Zero duplicação de `zod` em `package.json` de aplicações.
12. [ ] **Testes e Lint**: Código passa sem erros no `oxlint` e nos testes do `vitest`.
13. [ ] **Validação Visual e Acessibilidade de Telas**: Verificado layout, hierarquia visual, contraste de cores (WCAG), estados interativos (loading, disabled, empty) e responsividade adotando as diretrizes da skill `ui-visual-validator`.
14. [ ] **ViroReact AR e Execução Mobile**: O ViroReact requer APK nativo compilado (não roda no Expo Go). O repasse de dados dinâmicos da cena deve obrigatoriamente usar `viroAppProps`, com textos em modo `billboardY` e coordenadas 3D derivadas da orientação da câmera em tempo real delegadas ao backend.
15. [ ] **Testes de Integração com Testcontainers**: Todos os testes em `test/integration/` executam contra um PostgreSQL 16 real disparado via `PostgreSqlContainer` (`@testcontainers/postgresql`) com aplicação de migrações Drizzle reais, sem utilizar mocks de repositório/serviço.
16. [ ] **Documentação Interativa com Scalar**: Toda rota exposta na API possui tags Swagger (`@ApiTags`) e resumos operacionais (`@ApiOperation`), acessíveis interativamente em `http://localhost:8000/reference`.

---

## 9. Validação Visual e de Telas (UI Visual Validation & A11y)

Sempre que houver criação ou modificação de telas, componentes visuais ou fluxos de interface no frontend (`unifacens-client`), o agente deve **obrigatoriamente validar a interface** utilizando as skills de validação visual e acessibilidade (`ui-visual-validator`, `a11y-debugging`, `wcag-audit-patterns`).

### 🎯 Princípios Obrigatórios de Validação Visual
1. **Postura Cética**: Não assuma que uma alteração no código produziu o efeito visual correto até inspecionar o resultado real (visual/DOM).
2. **Inspeção de Estados**: Validar não apenas o estado feliz (*happy path*), mas também estados de *loading*, *empty* (quando não há dados) e tratamento de erros.
3. **Contraste e Legibilidade (WCAG)**: Textos e elementos interativos devem cumprir proporção mínima de contraste (mínimo de 4.5:1 para texto normal e 3:1 para texto grande/elementos gráficos).
4. **Áreas de Toque (Tap Targets)**: Em interfaces móveis e touch, botões e controles interativos devem ter área mínima recomendada de 44x44 dp/px.
5. **Responsividade & Plataforma**: Testar a consistência em diferentes viewports (mobile vertical, tablet e web desktop).

> [!NOTE]
> **Observação sobre Ambientes de Execução de IA:**
> O ambiente de IA de cada desenvolvedor ou colaborador pode ser diferente (variações de sistema operacional, disponibilidade de ferramentas de captura headless de navegador como Playwright/Puppeteer, permissões locais de display ou diferentes plugins e modelos de LLM instalados).
> Por essa razão, a validação de tela deve ser **resiliente e adaptativa**:
> - Se houver navegador headless/ferramentas de captura disponíveis: capture screenshots e execute comparação e auditoria visual direta.
> - Em ambientes sem display/headless restrito: execute validação através de auditoria do DOM/HTML renderizado pelo bundler (via curl/DevTools), medição matemática de contraste de cores dos tokens/estilos e testes de componentes.

---

## 10. Diretrizes de Realidade Aumentada (ViroReact) & Execução Mobile

### 🚫 10.1 Incompatibilidade Obrigatória com Expo Go
O `@reactvision/react-viro` depende de binários em C++ (`libviro_renderer.so`), bibliotecas ARCore (Android) e ARKit (iOS).
* O aplicativo **Expo Go não inclui esses módulos nativos** de terceiros. Abrir o projeto no Expo Go causa crash imediato em tempo de importação (`TypeError: Cannot read property 'setJSAnimations' of null`).
* **Sempre utilize um Development Build** (`npx expo run:android` ou `./gradlew assembleDebug`).
* No Android do desenvolvedor, além de **Depuração USB**, certifique-se de habilitar **"Instalar via USB"** (para evitar o erro `INSTALL_FAILED_USER_RESTRICTED`).

### 🔄 10.2 Espelhamento de Portas com `adb reverse`
Ao debugar o app no celular conectado via cabo USB, execute o espelhamento de portas para que o dispositivo móvel acesse o Metro e o Backend no container sem depender de IP de rede Wi-Fi:
```bash
adb reverse tcp:8081 tcp:8081    # Metro Bundler do Expo
adb reverse tcp:8000 tcp:8000    # API REST NestJS (Porta 8000!)
```

### 📡 10.3 Reatividade de Estado na Cena Viro (`viroAppProps`)
Em React Native com ViroReact, o componente `<ViroARSceneNavigator>` **não reconstrói** a closure passada em `initialScene` quando o estado do componente pai muda.
* ❌ **NUNCA passe arrow functions com closures congeladas** em `initialScene={{ scene: () => <Scene anchors={anchors} /> }}`.
* ✅ **SEMPRE passe a referência do componente** em `initialScene={{ scene: ViroARAnchorScene }}` e envie os dados e callbacks via `viroAppProps`:
  ```tsx
  <ViroARSceneNavigator
    initialScene={{ scene: ViroARAnchorScene as any }}
    viroAppProps={{
      anchors,
      onSelectAnchor,
      onPlaceAnchorAtCamera,
      onCameraUpdate,
    }}
  />
  ```
* Na Scene, extraia sempre de `props.sceneNavigator?.viroAppProps || props.arSceneNavigator?.viroAppProps || props`.

### ☁️ 10.4 Arquitetura Pura Google ARCore Cloud Anchors (Zero Drift, Precisão Milimétrica)
* O posicionamento e fixação física 3D são gerenciados **exclusivamente pelo Google ARCore Cloud Anchors**:
  - ❌ **Cálculos matemáticos no cliente ou backend foram descontinuados**: A aproximação puramente matemática por GPS e bússola gerava variações de 5 a 15 metros devido ao jitter do GPS e interferência magnética interna.
  - ✅ **O ARCore utiliza SLAM Visual (Visual-Inertial Odometry)**: A câmera a 60 FPS escaneia as texturas do ambiente físico (chão, mesas, cantos de portas) e cria uma nuvem de características 3D que é sincronizada com os servidores da Google.
* **Ciclo de Vida do Cloud Anchor**:
  1. **Hospedagem (`hostCloudAnchor`)**: O usuário mira ou clica em uma superfície detectada. O ARCore extrai os descritores visuais e envia para a Google, retornando um `cloudAnchorId` com TTL de até 365 dias.
  2. **Persistência**: O cliente envia `POST /anchors` com `{ name, cloudAnchorId, description }` para a API NestJS persistir no PostgreSQL.
  3. **Resolução (`resolveCloudAnchor`)**: Em qualquer nova inicialização ou dispositivo, o app consulta `GET /anchors` e chama `resolveCloudAnchor(cloudAnchorId)`. Quando o ARCore reconhece as texturas físicas do cômodo, ele posiciona o nó 3D exatamente no ponto original com precisão centimétrica/milimétrica.

### 👁️ 10.5 Renderização Estabilizada, Detecção de Planos e BillboardY
* **Detecção de Planos Físicos**: Para garantir suporte ao SLAM, o componente `<ViroARScene>` deve habilitar explicitamente `anchorDetectionTypes={['PlanesHorizontal']}` para permitir que o ARCore ancore o rastreamento em superfícies reais (chão, mesas).
* **Materiais 3D**: Utilize `lightingModel: 'Constant'` nos materiais para garantir visibilidade e alto contraste mesmo sob iluminação interna fraca da sala.
* **Textos 3D Estabilizados (`billboardY`)**: Todo `<ViroText>` deve conter `transformBehaviors={['billboardY']}` (em vez de `billboard` genérico). O modo `billboardY` rotaciona o texto estritamente ao redor do eixo vertical Y, prevenindo inclinações indesejadas (*pitch/roll tilt*) quando o usuário inclina o celular para cima ou para baixo.
* **Prevenção de Re-render Churn**: Nunca armazene variáveis de pose de alta frequência em estados do React (`useState`). Use referências em memória (`useRef`) e envolva `viroAppProps` em `useMemo` para evitar serializações custosas através da ponte nativa C++ do React Native.

### 🔌 10.6 Diagnóstico de Inicialização & Queda do Túnel USB (`adb reverse`)
Quando o aplicativo Android não abrir ou falhar com o erro:
`Unable to load script. Make sure you're running Metro... unexpected end of stream on http://localhost:8081`
* O daemon do ADB no Linux foi reiniciado ou o cabo USB foi desconectado e reconectado, o que descarta os mapeamentos de túnel reverso.
* **Solução Imediata**:
  ```bash
  adb reverse tcp:8081 tcp:8081    # Restaura conexão com Metro Bundler
  adb reverse tcp:8000 tcp:8000    # Restaura conexão com a API REST (Porta 8000!)
  ```

### 🗄️ 10.7 Persistência no Banco de Dados (Schema Cloud Anchors)
* A tabela `anchors` no PostgreSQL armazena **estritamente o identificador da nuvem e metadados cadastrais**:
  - `id`: `uuid` (Primary Key, gerado via `gen_random_uuid()`)
  - `name`: `text` (Nome identificador do local / sala / bloco)
  - `cloud_anchor_id`: `text` (O identificador único gerado pelo Google ARCore)
  - `description`: `text` (Instruções ou notas visuais opcionais)
  - `created_at`: `timestamp with time zone` (Data de criação do registro)
* ❌ **NUNCA adicione coordenadas cartesianas relativas `x, y, z` ao banco de dados**, pois a pose física 3D é calculada dinamicamente pelo ARCore em tempo real no momento em que o Cloud Anchor é resolvido.

---

## 11. Modelo Matemático Geodésico: Fontes, Fórmulas & Roteiro de Precisão

Esta seção documenta a fundamentação matemática, as fontes oficiais de consulta e as diretrizes de engenharia para manter e evoluir os cálculos geoespaciais executados pelo [`GeospatialService`](file:///home/giovanne/Documentos/UPX8/UniFACENS-Map/unifacens-api/src/geospatial/geospatial.service.ts).

---

### 📚 11.1 Onde as Informações e Fórmulas são Consultadas (Fontes Oficiais)

Qualquer alteração nos cálculos geodésicos deve basear-se nos seguintes padrões e publicações técnicas da indústria:

1. **Datum Geodésico WGS-84 (EPSG:4326)**:
   - *Publicação*: NGA Standardization Document *Department of Defense World Geodetic System 1984* (NGA.STND.0036).
   - *Parâmetros Fundamentais*:
     - Semieixo maior ($a$): $6.378.137,0 \text{ metros}$.
     - Achatamento ($f$): $1 / 298,257223563$.
     - Raio médio volumétrico da Terra ($R$): $6.371.000 \text{ metros}$ (definido pela IUGG - *International Union of Geodesy and Geophysics*).
   - *Referência Online*: [EPSG.io / EPSG:4326](https://epsg.io/4326).

2. **Aviation Formulary (Ed Williams)**:
   - Obra canônica e clássica de algoritmos de navegação astronômica e esférica para computação de *Great Circle Distance*, *Initial/Final Bearing*, *Direct/Inverse Geodesic Projections* e *Cross-Track Distance*.
   - *Referência Online*: [Ed Williams Aviation Formulary V1.47](http://www.edwilliams.org/avform.htm).

3. **Movable Type Scripts — Geodesy Functions (Chris Veness)**:
   - A documentação de referência mais conceituada na comunidade de software geoespacial para implementações em JavaScript/TypeScript de algoritmos de Haversine, Vincenty e conversão de coordenadas topocêntricas locais ENU (*East, North, Up*).
   - *Referência Online*: [Movable Type Geodesy](https://www.movable-type.co.uk/scripts/latlong.html).

4. **EPSG Guidance Note 7-2: Coordinate Conversions & Transformations (IOGP)**:
   - Especificação técnica da *International Association of Oil & Gas Producers* definindo as matrizes de conversão entre coordenadas geocêntricas tridimensionais (ECEF - *Earth-Centered, Earth-Fixed*) e sistemas de coordenadas topocêntricas locais tangentes à superfície da Terra (ENU).
   - *Referência Online*: [IOGP Geomatics Guidance Note 7-2](https://www.iogp.org/).

5. **World Magnetic Model (NOAA / NCEI & British Geological Survey - WMM)**:
   - O modelo matemático padrão internacional para calcular a **Declinação Magnética** (diferença angular entre o Norte Magnético apontado pela bússola do smartphone e o Norte Geográfico/Verdadeiro exigido pelo datum WGS-84).
   - *Referência Online*: [NOAA National Centers for Environmental Information - WMM](https://www.ncei.noaa.gov/products/world-magnetic-model).

6. **Google ARCore & Apple ARKit Geospatial APIs**:
   - Padrão de ancoragem geoespacial que converte poses SLAM de 6 graus de liberdade (6DoF) no espaço físico para coordenadas de latitude, longitude e altitude WGS-84.
   - *Referência Online*: [Google ARCore Geospatial API](https://developers.google.com/ar/develop/geospatial).

---

### 📐 11.2 Arquitetura Matemática Atual no `GeospatialService`

O [`GeospatialService`](file:///home/giovanne/Documentos/UPX8/UniFACENS-Map/unifacens-api/src/geospatial/geospatial.service.ts) implementa um modelo topocêntrico plano tangente com aproximação esférica da Terra ($R = 6.371.000\text{m}$), que oferece excelente performance (O(1), milissegundos) e precisão submétrica em raios de campus universitário (< 2 km):

#### 1. Projeção Direta: AR Camera Offset $\rightarrow$ Coordenadas WGS-84 (`projectForward`)
Converte o vetor relativo 3D $[\Delta x, \Delta y, \Delta z]$ da mira da câmera AR em coordenadas absolutas de Latitude e Longitude:
- **No sistema AR/OpenGL**:
  - $+X$ = Direita, $-X$ = Esquerda
  - $+Y$ = Cima, $-Y$ = Baixo
  - $-Z$ = À frente da câmera (vetor de visada frontal)
- **Rotação pelo Azimute da Câmera ($\theta$, em radianos)**:
  $$\Delta \text{North} = (-\Delta z) \cdot \cos(\theta) - (\Delta x) \cdot \sin(\theta)$$
  $$\Delta \text{East} = (-\Delta z) \cdot \sin(\theta) + (\Delta x) \cdot \cos(\theta)$$
- **Projeção Angular Geodésica**:
  $$\Delta \phi = \left(\frac{\Delta \text{North}}{R}\right) \cdot \left(\frac{180}{\pi}\right)$$
  $$\Delta \lambda = \left(\frac{\Delta \text{East}}{R \cdot \cos(\phi_{\text{user}})}\right) \cdot \left(\frac{180}{\pi}\right)$$
  $$\text{TargetLat} = \phi_{\text{user}} + \Delta \phi, \quad \text{TargetLon} = \lambda_{\text{user}} + \Delta \lambda, \quad \text{TargetAlt} = \text{UserAlt} + \Delta y$$

#### 2. Projeção Inversa: Coordenadas WGS-84 $\rightarrow$ Posição 3D na Cena AR (`projectToLocalAr`)
Converte uma âncora salva no PostgreSQL $(\text{Lat}, \text{Lon}, \text{Alt})$ na coordenada local $[x, y, z]$ relativa à pose do usuário para renderização pelo ViroReact:
- **Diferenças Angulares**:
  $$\Delta \phi = \text{Rad}(\text{TargetLat} - \text{UserLat}), \quad \Delta \lambda = \text{Rad}(\text{TargetLon} - \text{UserLon})$$
  $$\phi_m = \text{Rad}\left(\frac{\text{UserLat} + \text{TargetLat}}{2}\right)$$
- **Deslocamentos Planos Locais (Equirretangular)**:
  $$\Delta \text{North} = \Delta \phi \cdot R$$
  $$\Delta \text{East} = \Delta \lambda \cdot R \cdot \cos(\phi_m)$$
- **Rotação Inversa pelo Azimute da Visada ($\theta$)**:
  $$\text{arX} = \Delta \text{East} \cdot \cos(\theta) - \Delta \text{North} \cdot \sin(\theta)$$
  $$\text{arZ} = -(\Delta \text{East} \cdot \sin(\theta) + \Delta \text{North} \cdot \cos(\theta))$$
  $$\text{arY} = \text{TargetAlt} - \text{UserAlt}$$

#### 3. Distância pelo Grande Círculo (`calculateDistance`)
Utiliza a **Fórmula de Haversine**:
$$a = \sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)$$
$$c = 2 \cdot \operatorname{atan2}\left(\sqrt{a}, \sqrt{1 - a}\right), \quad d = R \cdot c$$

#### 4. Azimute / Yaw da Câmera (`computeYawFromForward`)
Calcula o ângulo horizontal em graus ($0^\circ$ a $360^\circ$) a partir do vetor direcional unitário da câmera $[f_x, f_y, f_z]$:
$$\text{Yaw} = \left(\operatorname{atan2}(f_x, -f_z) \cdot \frac{180}{\pi} + 360\right) \pmod{360}$$

---

### 🚀 11.3 Como Melhorar a Precisão se Necessário (Roteiro de Evolução)

Caso surjam requisitos de maior precisão (ex: mapeamento centimétrico de salas, pisos industriais ou grandes distâncias entre campi), siga este roteiro progressivo de melhoria:

#### Nível 1: Compensação da Declinação Magnética (Correção Angular de ~21.5°)
* **O Problema**: A bússola digital (magnetômetro) do smartphone aponta para o **Norte Magnético**, enquanto as coordenadas WGS-84 referenciam o **Norte Geográfico/Verdadeiro**.
* **Impacto no Campus UniFACENS (Sorocaba - SP: $-23.4699^\circ, -47.4297^\circ$)**:
  A declinação magnética atual é de aproximadamente **$-21^\circ 20'$ Oeste** (ou $-21.3^\circ$). Se a bússola reportar $0^\circ$, o usuário está na verdade olhando para o azimute $338.7^\circ$ verdadeiro!
* **Como Implementar a Melhoria**:
  1. Integrar um módulo de cálculo de declinação baseado nos coeficientes do **WMM (World Magnetic Model)** no backend ou consultar via biblioteca (ex: `geomagnetism` no Node.js):
     ```typescript
     import geomag from 'geomagnetism';
     const info = geomag.model().point([userLat, userLon]);
     const declinationDeg = info.decl; // Retorna ~ -21.3 em Sorocaba
     const trueHeadingDeg = (magneticHeadingDeg + declinationDeg + 360) % 360;
     ```
  2. Aplicar essa compensação no `GeospatialService` antes de efetuar as rotações de $\Delta \text{North}$ e $\Delta \text{East}$.

#### Nível 2: Conversão Rigorosa via Elipsoide WGS-84 (ECEF $\rightarrow$ ENU)
* **O Problema**: A aproximação esférica ($R = 6371\text{km}$) ignora o achatamento dos polos da Terra ($f \approx 1/298.257$). Em distâncias curtas o erro é mínimo (< 0.2%), mas o cálculo de altitude em terrenos inclinados ou múltiplos andares perde precisão.
* **Como Implementar a Melhoria**:
  1. Converter a latitude, longitude e altitude elipsoidal $(\phi, \lambda, h)$ para coordenadas cartesianas geocêntricas tridimensionais **ECEF** (*Earth-Centered, Earth-Fixed*):
     $$N(\phi) = \frac{a}{\sqrt{1 - e^2 \sin^2(\phi)}}$$
     $$X = (N(\phi) + h) \cos(\phi) \cos(\lambda)$$
     $$Y = (N(\phi) + h) \cos(\phi) \sin(\lambda)$$
     $$Z = (N(\phi)(1 - e^2) + h) \sin(\phi)$$
     *(onde $a = 6378137.0\text{m}$, $e^2 = 2f - f^2 \approx 0.00669437999014$)*.
  2. Projetar o vetor diferença $\Delta (X, Y, Z)_{\text{ECEF}}$ no plano tangencial topocêntrico local **ENU (East, North, Up)** através da matriz de rotação ortogonal com centro na origem da sessão AR $(\phi_0, \lambda_0)$:
     $$\begin{bmatrix} e \\ n \\ u \end{bmatrix} = \begin{bmatrix} -\sin(\lambda_0) & \cos(\lambda_0) & 0 \\ -\sin(\phi_0)\cos(\lambda_0) & -\sin(\phi_0)\sin(\lambda_0) & \cos(\phi_0) \\ \cos(\phi_0)\cos(\lambda_0) & \cos(\phi_0)\sin(\lambda_0) & \sin(\phi_0) \end{bmatrix} \begin{bmatrix} X - X_0 \\ Y - Y_0 \\ Z - Z_0 \end{bmatrix}$$
  3. Mapear diretamente os eixos ENU para o sistema AR do ViroReact:
     - $\text{arX} = e \cdot \cos(\theta) - n \cdot \sin(\theta)$
     - $\text{arZ} = -(e \cdot \sin(\theta) + n \cdot \cos(\theta))$
     - $\text{arY} = u$
  Isso garante **precisão milimétrica tridimensional** e elimina distorções de altitude em edifícios de múltiplos andares.

#### Nível 3: Algoritmo Inverso e Direto de Vincenty
* **O Problema**: Para rotas e medições geodésicas de maior distância (ex: calcular a rota entre campi diferentes ou trajetos de ônibus universitário), a fórmula de Haversine acumula erro de até 0.5% devido ao achatamento terrestre.
* **Como Implementar a Melhoria**:
  - Utilizar o **Algoritmo de Vincenty (1975)**, que resolve geodésicas sobre o elipsoide de revolução com precisão de até $0,5 \text{ mm}$ através de fórmulas iterativas.

#### Nível 4: Fusão Sensorial e Filtro de Kalman Estendido (EKF)
* **O Problema**: O GPS do celular apresenta ruído e baixa taxa de atualização (1 Hz), enquanto o SLAM inercial do ViroReact/ARCore é rápido (60 Hz), mas sofre de *drift* cumulativo em caminhadas longas.
* **Como Implementar a Melhoria**:
  - Implementar um Filtro de Kalman no backend ou integrar com a **Geospatial API do ARCore**, que realiza fusão contínua entre o Street View VPS (Visual Positioning System), sinal GNSS e sensores inerciais (IMU) para fixação milimétrica sem drift.

---

## 12. Investigação de Drift de Inicialização, Persistência Exata & Soluções da Indústria (ARCore / ARKit / ViroReact)

Esta seção documenta a investigação aprofundada sobre a causa de pontos AR aparecerem em posições físicas diferentes dependendo da inicialização, por que o cálculo puramente geodésico (GPS + bússola) não garante repetibilidade física exata por si só, como as engines líderes de Realidade Aumentada (Google ARCore, Apple ARKit e ViroReact) resolvem esse desafio na indústria, e onde todas as informações foram consultadas.

---

### 🔍 12.1 Diagnóstico Técnico da Causa Raiz: Por que os pontos surgem em locais diferentes?

O fenômeno relatado decorre da interação entre três sistemas com referenciais geométricos e níveis de incerteza físicos totalmente distintos:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SISTEMAS EM CONFLITO                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 1. Referencial Geodésico WGS-84   │ Lat / Lon / Alt terrestres fixos no planeta │
│ 2. Referencial SLAM/VIO (ARCore)  │ Origem (0,0,0) arbitrariamente criada em t=0 │
│ 3. Sensores do Aparelho (GNSS/IMU)│ Incerteza de 3m-15m (GPS) e -21.3° declinação│
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### 💥 Causa 1: O Referencial Local Arbitrário do SLAM / VIO (Visual-Inertial Odometry)
* **Como o ARCore / ViroReact funciona nativamente**:
  No instante em que a câmera AR é aberta ($t = 0$), o subsistema de odometria visual-inercial (SLAM/VIO) define a origem do mundo virtual $(0, 0, 0)$ **no centro óptico da lente do smartphone naquele exato milissegundo**.
* **Orientação dos Eixos no ARCore**:
  - O eixo vertical $+Y$ é alinhado com a gravidade (graças ao acelerômetro).
  - Porém, os eixos horizontais $X$ e $Z$ são definidos **estritamente pela direção para onde a lente do celular estava apontando quando o app foi inicializado**:
    - O eixo $-Z$ aponta para a frente da câmera no momento $t = 0$.
    - O eixo $+X$ aponta para a direita da câmera no momento $t = 0$.
* **A Falta de Consciência Global do SLAM**:
  O ARCore **NÃO possui alinhamento inato com o Norte Verdadeiro ou com as coordenadas da Terra**. Para a engine AR, o mundo começa onde o celular está e olha para onde a lente apontou.
* **O Efeito Prático na Inicialização**:
  - Se o usuário abrir o aplicativo na mesa olhando para o **Norte**, o eixo $-Z$ do mundo virtual será o Norte. Um ponto calculado em `[0, 0, -1.5]` aparecerá sobre a mesa.
  - Se o usuário fechar o aplicativo, virar de costas olhando para o **Sul** e reabrir o aplicativo, o novo eixo $-Z$ agora será o **Sul**! O mesmo vetor `[0, 0, -1.5]` será renderizado na direção oposta (Sul), a 3 metros de distância física da mesa!
  - **Conclusão**: O vetor `cameraForward` do ViroReact no instante de inicialização é *sempre* `[0, 0, -1]`. Ele não representa o Norte da Terra, mas apenas o alinhamento da câmera relativo ao início daquela sessão específica.

#### 🛰️ Causa 2: Incerteza e Jitter do GPS Comercial (GNSS) em Smartphones
* Chips GNSS de smartphones comerciais operam com erro típico de **$3$ a $15$ metros em céu aberto**.
* **Dentro de edifícios, salas de aula e corredores (Indoors)**:
  - O sinal de satélite sofre atenuação severa por lajes de concreto armado e reflexões de múltiplos caminhos (*multipath*).
  - A incerteza do GPS salta para **$20$ a $50+$ metros**, ou sofre perda completa de sinal (*GPS fix loss*).
* **O Impacto**:
  Se um usuário marca um ponto fixo a 1.5 metros de distância em uma mesa, o GPS pode registrar $(-23.469900, -47.429700)$. Ao retornar no dia seguinte à mesmíssima mesa, o GPS do celular relata $(-23.469940, -47.429730)$ (uma variação de apenas 5 metros, perfeitamente normal para GPS). Quando o backend projeta a âncora para coordenadas locais, o ponto surgirá **5 metros distante da mesa**, flutuando na sala vizinha ou na parede.

#### 🧲 Causa 3: Declinação Magnética e Anomalias Eletromagnéticas Internas
* O magnetômetro do smartphone mede o **Norte Magnético**, e não o Norte Geográfico/Verdadeiro (WGS-84).
* No campus da UniFACENS (Sorocaba/SP), a **Declinação Magnética é de aproximadamente $-21.3^\circ$ Oeste**. Sem essa compensação, qualquer projeção sofre um desvio angular de mais de 20 graus.
* Em ambientes internos (salas de aula, laboratórios), computadores, ferragens estruturais e cabos elétricos causam distorções magnéticas locais (*hard/soft iron distortions*) de $10^\circ$ a $45^\circ$, tornando o magnetômetro instável para fixação milimétrica.

---

### 🏆 12.2 Soluções da Indústria: Como Fixar Pontos com 100% de Exatidão Repetível

Na engenharia de Realidade Aumentada profissional (Google, Apple, Niantic, PTC Vuforia), a ancoragem persistente nunca é feita apenas com GPS + Bússola quando se exige fixação exata no mesmo lugar. Utilizam-se quatro soluções estabelecidas:

---

#### 🎯 SOLUÇÃO 1: Rastreamento por Marcadores Visuais (Image Tracking / QR Codes / Placas)
> **Recomendada para**: Ambientes internos do campus (salas de aula, laboratórios, portas, totens de entrada e mesas).
> **Precisão**: **Milimétrica / Subcentimétrica (1 a 5 mm)**.
> **Disponibilidade**: Nativa e imediata no `@reactvision/react-viro` através de `ViroARTrackingTargets` e `<ViroARImageMarker>`.

##### Como Funciona:
1. Um marcador visual 2D (ex: QR Code da sala, logotipo de um totem ou placa de identificação) é impresso com dimensões físicas conhecidas (ex: $15 \text{ cm} \times 15 \text{ cm}$).
2. O aplicativo registra esse marcador no sistema de rastreamento com sua largura real em metros:
   ```typescript
   ViroARTrackingTargets.createTargets({
     roomDoorMarker: {
       source: require('@/assets/markers/room_marker.png'),
       orientation: 'Up',
       physicalWidth: 0.15, // 15 centímetros no mundo real
     },
   });
   ```
3. Na cena AR, os pontos são filhos do componente `<ViroARImageMarker>`:
   ```tsx
   <ViroARImageMarker
     target="roomDoorMarker"
     onAnchorFound={() => console.log('Marcador avistado! Origem fixada.')}>
     {/* Este cubo fica EXATAMENTE no centro físico da placa impressa */}
     <ViroBox position={[0, 0, 0]} scale={[0.1, 0.1, 0.1]} />
     {/* Ponto 1 metro à direita e 30 cm acima da placa física */}
     <ViroNode position={[1.0, 0.3, 0]}>
       <ViroText text="Laboratório de Robótica" />
     </ViroNode>
   </ViroARImageMarker>
   ```
4. **Por que elimina o problema de inicialização?**
   Quando a câmera avista o marcador físico, o ARCore/ARKit calcula a pose 6DoF (*6 Degrees of Freedom*) do marcador em relação à câmera através de visão computacional. A origem do sistema de coordenadas passa a ser **o próprio papel/placa física no mundo real**. Não importa onde o usuário iniciou o app, nem para onde estava virado: a âncora fica travada com rigidez física na imagem.

---

#### ☁️ SOLUÇÃO 2: ARCore Cloud Anchors (Nuvem de Pontos SLAM Compartilhada)
> **Recomendada para**: Ambientes sem necessidade de impressão de marcadores, compartilhamento multiusuário (Android + iOS).
> **Precisão**: **Centimétrica (1 a 3 cm)**.
> **Requisitos**: Google Cloud ARCore API Key e Play Services for AR.

##### Como Funciona:
1. **Hospedagem (Host)**: O usuário aponta o celular para a mesa ou sala. O ARCore extrai um mapa de características visuais 3D esparsas (arestas, texturas, cantos de objetos) e envia esses dados à nuvem da Google, gerando um `cloudAnchorId`.
2. **Armazenamento**: O backend do `unifacens-api` salva o `cloudAnchorId` associado ao POI.
3. **Resolução (Resolve)**: Quando qualquer outro usuário (ou o mesmo usuário em outra sessão) abre o app na mesma sala, a câmera captura a cena física. O ARCore envia os pontos visuais atuais para a Google, que faz o *matching* com a nuvem de pontos salva e restaura a pose exata no espaço 3D físico.

---

#### 🌍 SOLUÇÃO 3: Google ARCore Geospatial API / VPS (Visual Positioning System)
> **Recomendada para**: Áreas externas do campus (pátio, estacionamentos, fachadas dos prédios).
> **Precisão**: **Submétrica (< 0.5 metros horizontal, < 1 metro vertical)**.
> **Requisitos**: Cobertura do Google Street View no campus.

##### Como Funciona:
1. A Google possui modelos 3D georreferenciados gerados a partir do mapeamento do Street View.
2. A Geospatial API combina SLAM, GPS, bússola e visão computacional (VPS) para comparar os prédios e contornos visíveis na câmera com o modelo 3D global da Google.
3. Isso alinha a sessão AR diretamente com as coordenadas WGS-84 terrestres com precisão submétrica, eliminando o erro convencional do GPS.

---

#### 🧭 SOLUÇÃO 4: Sensor Fusion com Bússola Física de Hardware (`expo-sensors`) + Declinação WMM
> **Recomendada para**: Navegação ao ar livre ampla no campus quando não há marcadores visuais.
> **Precisão**: **Métrica (orientação correta $\pm 2^\circ$, sujeita à incerteza do GPS)**.

##### Como Funciona:
1. Em vez de utilizar o vetor relativo arbitrário da câmera do ViroReact, o cliente lê o sensor de hardware de bússola do smartphone (`Magnetometer` do `expo-sensors`).
2. Adiciona a correção de **Declinação Magnética de Sorocaba ($-21.3^\circ$)**:
   $$\text{HeadingVerdadeiro} = (\text{HeadingMagnetico} - 21.3^\circ + 360^\circ) \pmod{360^\circ}$$
3. Utiliza esse azimute geográfico real para calcular a orientação da sessão AR na inicialização, garantindo que o mundo virtual esteja orientado ao Norte Verdadeiro independente da direção para onde a câmera apontava ao abrir o app.

---

### 📚 12.3 Fontes Oficiais de Informação & Citações Técnicas

Todas as informações técnicas, fórmulas e diagnósticos apresentados nesta documentação baseiam-se diretamente nas seguintes documentações oficiais e padrões internacionais de engenharia:

1. **Google ARCore Documentation**:
   - **ARCore Fundamentals & Coordinate System**:
     *URL*: [https://developers.google.com/ar/develop/fundamentals](https://developers.google.com/ar/develop/fundamentals)
     *Trecho Chave*: *"ARCore uses visual-inertial odometry (VIO) to estimate where the device is relative to the real world... ARCore defines a coordinate system where +Y points up parallel to gravity, and +Z points in the direction the camera was pointing when tracking started."*
   - **ARCore Cloud Anchors Overview & Developer Guide**:
     *URL*: [https://developers.google.com/ar/develop/cloud-anchors](https://developers.google.com/ar/develop/cloud-anchors)
     *Trecho Chave*: *"Cloud Anchors are hosted on the ARCore Cloud Anchor service, which maps visual feature points from the camera feed so devices can resolve the anchor in the exact same physical space over time."*
   - **ARCore Geospatial API (VPS - Visual Positioning System)**:
     *URL*: [https://developers.google.com/ar/develop/geospatial](https://developers.google.com/ar/develop/geospatial)
     *Trecho Chave*: *"The Geospatial API attaches virtual content to geographic coordinates (latitude, longitude, altitude) by combining visual data with Google's Street View 3D point cloud database."*

2. **Apple ARKit Documentation**:
   - **`ARConfiguration.WorldAlignment`**:
     *URL*: [https://developer.apple.com/documentation/arkit/arconfiguration/worldalignment](https://developer.apple.com/documentation/arkit/arconfiguration/worldalignment)
     *Trecho Chave*: *"In `ARWorldAlignmentGravity` (default), the coordinate system's Y-axis is parallel to gravity, and its origin is the initial position of the device. In `ARWorldAlignmentGravityAndHeading`, the coordinate system's axes are oriented according to compass heading."*
   - **`ARImageAnchor` & Image Tracking**:
     *URL*: [https://developer.apple.com/documentation/arkit/arimageanchor](https://developer.apple.com/documentation/arkit/arimageanchor)
     *Trecho Chave*: *"An anchor that represents a known 2D image found in the physical environment, maintaining a fixed position and orientation relative to that real-world image."*

3. **ViroReact Official Documentation (`@reactvision/react-viro`)**:
   - **Image Tracking (`ViroARTrackingTargets` & `ViroARImageMarker`)**:
     *URL*: [https://viro-community.readme.io/docs/image-tracking](https://viro-community.readme.io/docs/image-tracking)
     *Trecho Chave*: *"ViroARTrackingTargets defines images to be recognized in the real world with known `physicalWidth`. ViroARImageMarker renders 3D objects locked relative to the target image in 6DoF space."*

4. **NOAA National Centers for Environmental Information (NCEI) & British Geological Survey**:
   - **World Magnetic Model (WMM 2020-2025)**:
     *URL*: [https://www.ncei.noaa.gov/products/world-magnetic-model](https://www.ncei.noaa.gov/products/world-magnetic-model)
     *Aplicação*: Cálculo oficial da declinação magnética no município de Sorocaba/SP ($-21^\circ 20'$ W).

5. **IOGP / EPSG Geodetic Parameter Registry**:
   - **EPSG:4326 (WGS 84)** & **EPSG Guidance Note Number 7, Part 2**:
     *URL*: [https://epsg.io/4326](https://epsg.io/4326)
     *Aplicação*: Padrão internacional de datum geodésico elipsoidal para conversões de coordenadas de navegação por satélite (GNSS).

---

### 🚀 12.4 Arquitetura para Persistência 100% Sem Marcadores (Markerless Persistence)

Para eliminar completamente a dependência de QR codes, papéis impressos ou placas físicas, a indústria de AR adota o padrão de **Nuvem de Pontos SLAM Natural (Cloud Anchors)** para ambientes fechados e **Visual Positioning System (VPS)** para ambientes abertos.

#### 🏗️ Como Funciona o Rastreamento Sem Marcadores (Markerless SLAM):
1. **O próprio ambiente é a "impressão digital" visual**:
   - Em vez de procurar um padrão impresso (QR Code), o ARCore extrai centenas de características ópticas naturais que já existem na sala: quinas de mesas, texturas de paredes, contornos de portas, azulejos, luminárias e janelas (*visual feature points*).
2. **Ciclo de Vida do Anchor Sem Marcador no ViroReact**:
   ```mermaid
   sequenceDiagram
       autonumber
       actor User as Usuário / Câmera
       participant Viro as ViroARSceneNavigator
       participant ARCore as ARCore / SLAM Engine
       participant Cloud as Google Cloud Anchors Service
       participant API as unifacens-api (PostgreSQL)

       Note over User,ARCore: 1. Fase de Mapeamento (Host)
       User->>Viro: Aponta para o chão/mesa da sala
       ARCore->>ARCore: Extrai nuvem de pontos 3D da sala (SLAM)
       User->>Viro: Toque para fixar âncora
       Viro->>ARCore: _hostCloudAnchor(localAnchorId)
       ARCore->>Cloud: Envia nuvem de características 3D
       Cloud-->>Viro: Retorna cloudAnchorId (ex: "ua-98f2b...")
       Viro->>API: Salva { name, cloudAnchorId, latitude, longitude }

       Note over User,ARCore: 2. Nova Sessão / Outro Usuário (Resolve)
       User->>Viro: Abre o app na mesma sala (qualquer ângulo)
       API-->>Viro: Lista de âncoras com cloudAnchorId
       Viro->>ARCore: _resolveCloudAnchor(cloudAnchorId)
       User->>ARCore: Movimenta o celular pela sala (1 a 3 segundos)
       ARCore->>Cloud: Compara pontos visuais da câmera com a nuvem salva
       Cloud-->>ARCore: Match confirmado! Restaura pose física exata
       ARCore-->>Viro: Âncora fixada com precisão centimétrica (1 a 3 cm)
   ```

#### 🔑 Integração no Código (Nativa no `@reactvision/react-viro`):
No componente nativo [`ViroARSceneNavigator`](file:///home/giovanne/Documentos/UPX8/UniFACENS-Map/unifacens-client/src/components/ar/ViroARAnchorContainer.native.tsx):
1. **Configuração de Provedor**:
   ```tsx
   <ViroARSceneNavigator
     autofocus={true}
     provider="arcore" // Ativa o backend de Cloud Anchors do ARCore
     onCloudAnchorStateChange={(event) => {
       console.log('Status do Cloud Anchor:', event.state); // "Success", "TaskInProgress", etc.
     }}
     initialScene={{ scene: ViroARAnchorScene as any }}
   />
   ```
2. **Hospedar sem Marcador (Host)**:
   ```typescript
   // Salva a geometria 3D natural da sala na nuvem
   const result = await navigatorRef.current._hostCloudAnchor(localAnchorId, 365); // TTL de 365 dias
   const cloudAnchorId = result.cloudAnchorId;
   ```
3. **Resolver na Próxima Inicialização (Resolve)**:
   ```typescript
   // Restaura a âncora física no mesmo lugar quando a câmera aponta para a sala
   const resolved = await navigatorRef.current._resolveCloudAnchor(cloudAnchorId);
   ```

#### 🌐 Estratégia Híbrida Markerless para o Campus da UniFACENS:
| Cenário | Tecnologia Utilizada | Requer Marcador? | Precisão |
| :--- | :--- | :--- | :--- |
| **Salas de Aula & Labs** | ARCore Persistent Cloud Anchors | ❌ Não (usa quinas, paredes e móveis) | Centimétrica (1 a 3 cm) |
| **Pátio & Ar Livre** | ARCore Geospatial API (VPS) | ❌ Não (usa fachadas e Google 3D) | Submétrica (< 0.5 m) |
| **Navegação Coarse** | Fusão GPS + Bússola Hardware (`expo-sensors`) | ❌ Não (sensores do smartphone) | Métrica (3 a 5 m) |


