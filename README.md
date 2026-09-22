# 🗺️ UniFACENS-Map

> Plataforma de mapeamento e navegação indoor/outdoor pelo campus da UniFACENS com suporte a **Realidade Aumentada (AR)**.
> Monorepo estruturado com **NestJS**, **Expo (React Native)** e **PostgreSQL**.

---

## 🏗️ Arquitetura do Monorepo

O projeto é gerenciado via **NPM Workspaces**:

```text
UniFACENS-Map/
├── packages/
│   └── shared/          # Contratos TypeScript, tipos, DTOs e utilitários universais
├── unifacens-api/       # Backend RESTful (NestJS 12, Drizzle ORM, PostgreSQL, Vitest)
├── unifacens-client/    # Aplicativo Mobile e Web (Expo SDK 57, React 19, NativeWind, ViroReact AR)
├── docker-compose.yaml  # Orquestração do ambiente completo (Postgres + API + Client)
├── .env.api             # Variáveis de ambiente do backend e banco
└── .env.client          # Variáveis de ambiente do frontend e conexão mobile
```

---

---

## ⚠️ AVISO CRÍTICO: Execução de Realidade Aumentada (ViroReact)

> [!CAUTION]
> ### 🛑 O EXPO GO PADRÃO NÃO SUPORTA RECURSOS DE REALIDADE AUMENTADA
> O **ViroReact (`@reactvision/react-viro`)** utiliza renderizadores 3D em C++ (`libviro_renderer.so`), chamadas JNI nativas e integração de baixo nível com o **ARCore (Android)** e **ARKit (iOS)**.
> 
> * **O aplicativo Expo Go padrão NÃO possui esses binários compilados**. Tentar abrir o modo AR dentro do Expo Go causará um crash fatal imediato (`TypeError: Cannot read property 'setJSAnimations' of null`).
> * **Para utilizar a câmera, detecção de planos e marcadores 3D**: É **ESTRITAMENTE OBRIGATÓRIO GERAR O BUILD NATIVO (APK)** seguindo o passo a passo da [**Seção 4**](#-4-realidade-aumentada-viroreact-no-celular-f%C3%ADsico-passo-a-passo-obrigat%C3%B3rio).
> * **O que roda sem compilar APK?** O **Navegador Web** ([http://localhost:8081](http://localhost:8081)) permite navegar na interface 2D e visualizar o catálogo de âncoras na nuvem.

### 📱 Matriz de Compatibilidade de Execução

| Plataforma / Modo | Interface 2D & Catálogo | Câmera AR & Google Cloud Anchors | Suporte | Observações |
| :--- | :---: | :---: | :---: | :--- |
| **Navegador Web (Desktop/Mobile)** | ✅ Suportado | ℹ️ Modo Informativo | ✅ Nativo | Acessível via `http://localhost:8081`. Permite visualizar e gerenciar o catálogo de Cloud Anchors cadastrados. |
| **Expo Go (App da Play Store)** | ✅ Suportado | ❌ **Incompatível (Crash)** | 🚫 Não usar | **Não utilize para AR**. O sandbox do Expo Go não contém os módulos nativos do Viro/ARCore. |
| **Build Nativo / APK Standalone** | ✅ Suportado | ✅ **Suporte Total (SLAM 60 FPS)** | 🌟 **Recomendado** | Compilado via `npx expo run:android` (ou `./gradlew installDebug`). Utiliza a câmera física do celular com rastreamento Google Cloud Anchors milimétrico. |

---

## 📋 Pré-requisitos

Para rodar ou compilar a aplicação na sua máquina, certifique-se de ter instalado:

* **[Node.js](https://nodejs.org/)** 24 LTS *(ou 22+)*
* **[Docker](https://www.docker.com/)** e **Docker Compose**
* **[Android SDK](https://developer.android.com/studio)** *(Platform-Tools, Build-Tools 35+ e NDK)*: **Obrigatório para compilar o APK com ViroReact**.
* **Dispositivo Físico Android com suporte a ARCore**: Conectado via cabo USB com Depuração USB ativada.

---

## ⚙️ 1. Configuração de Variáveis de Ambiente

Antes de compilar ou executar o projeto, crie os arquivos de ambiente a partir dos exemplos:

```bash
# 1. Copie os templates
cp .env.api.example .env.api
cp .env.client.example .env.client
```

### 📱 Conexão do Dispositivo Físico (`.env.client`):
* Quando conectado via **cabo USB** com `adb reverse` configurado, mantenha `EXPO_PUBLIC_API_URL=http://localhost:8000` e `REACT_NATIVE_PACKAGER_HOSTNAME=localhost`.
* Se for conectar via **rede Wi-Fi local**, configure o IPv4 da sua máquina:
  * **Linux**: `hostname -I | awk '{print $1}'`
  * **Windows**: `ipconfig` *(copie o IPv4 da interface Wi-Fi)*

---

## 🚀 2. Execução Rápida com Docker (Recomendado)

> [!IMPORTANT]
> ### 🐳 Os Containers são Obrigatórios para o Ecossistema Funcionar
> O aplicativo móvel depende da **API NestJS** e do banco **PostgreSQL** para buscar o catálogo de âncoras salvas e registrar novas âncoras na nuvem.  
> **Sempre suba os containers do backend antes de compilar ou executar o aplicativo cliente no celular ou navegador.**

```bash
# Sobe todos os serviços em segundo plano (PostgreSQL + API + Client Web)
docker compose up -d

# Ou se for a primeira vez ou tiver alterado código do backend:
docker compose up -d --build
```

### Endpoints Disponíveis:
* 🌐 **Web Client (Interface 2D & Catálogo)**: [http://localhost:8081](http://localhost:8081)
* 🚀 **Backend API**: [http://localhost:8000](http://localhost:8000)
* 📖 **Documentação Interativa (Scalar OpenAPI)**: [http://localhost:8000/reference](http://localhost:8000/reference)
* 🗄️ **PostgreSQL**: `localhost:5433` (`user: postgres`, `pass: postgres`, `db: unifacens_map`)
* 📱 **Mobile com Realidade Aumentada (Viro)**: **Requer a instalação prévia do APK nativo** (veja o passo a passo com `npx expo run:android` na [Seção 4](#-4-realidade-aumentada-viroreact-no-celular-f%C3%ADsico-passo-a-passo-obrigat%C3%B3rio)). Não abra pelo Expo Go comum.

---

## 💻 3. Compilação e Execução Local (Sem Docker)

Se preferir rodar os serviços diretamente na sua máquina host:

### Passo 1: Instale as dependências do Monorepo
Na raiz do projeto:
```bash
npm install
```

### Passo 2: Suba apenas o Banco de Dados
```bash
docker compose up -d postgres
```

---

### 🚀 3.1 Backend (`unifacens-api`)

#### Compilar a API para Produção:
```bash
npm --workspace=unifacens-api run build
```
> O código compilado será gerado no diretório `unifacens-api/dist/`.

#### Executar em Modo Desenvolvimento (com Hot-Reload):
```bash
npm --workspace=unifacens-api run start:dev
```

#### Executar a versão compilada de Produção:
```bash
npm --workspace=unifacens-api run start:prod
```

#### Gerenciar Migrations do Banco (Drizzle ORM):
```bash
# Gerar arquivos SQL de migration baseados no schema.ts
npm --workspace=unifacens-api exec -- drizzle-kit generate

# Aplicar migrations diretamente no banco
npm --workspace=unifacens-api exec -- drizzle-kit push
```

#### Executar Testes e Linter:
```bash
npm --workspace=unifacens-api run test       # Testes unitários com Vitest
npm --workspace=unifacens-api run test:e2e   # Testes ponta a ponta
npm --workspace=unifacens-api run lint       # Linter com Oxlint
```

---

### 📱 3.2 Frontend (`unifacens-client`)

#### Iniciar o Metro Bundler (Desenvolvimento):
```bash
npm --workspace=unifacens-client run start
```
* Pressione `w` no terminal para abrir no navegador Web.
* Pressione `a` para abrir no emulador Android conectado.
* Pressione `i` para abrir no simulador iOS (macOS).
* Ou abra o **Expo Go** no celular e escaneie o QR Code.

#### Compilar Versão Web Estática (Produção):
```bash
npm --workspace=unifacens-client exec -- expo export --platform web
```
> O build estático otimizado (HTML, CSS e JS) será gerado na pasta `unifacens-client/dist/`.

#### Gerar Build Nativo de Desenvolvimento (Android / iOS):
Para compilar e testar os recursos nativos de Realidade Aumentada (ViroReact + Google ARCore) no dispositivo físico ou emulador:
```bash
# Opção A: Executar a partir da raiz do monorepo
npm --workspace=unifacens-client run android

# Opção B: Executar diretamente com npx expo
cd unifacens-client
npx expo run:android

# Selecionar o aparelho físico conectado via USB interativamente:
npx expo run:android --device
```

#### Gerar Instaladores de Produção (APK / AAB / IPA) via EAS:
O projeto está configurado com EAS Build:
```bash
# Instale a CLI do EAS se ainda não tiver:
npm install -g eas-cli

# Gerar APK standalone para Android:
eas build --platform android --profile preview

# Gerar build de produção para Play Store:
eas build --platform android --profile production

# Gerar build para iOS:
eas build --platform ios --profile production
```

---

---

## 📱 4. Realidade Aumentada (ViroReact) no Celular Físico: Passo a Passo Obrigatório

> [!CAUTION]
> ### 🛑 Por que a compilação do APK nativo é indispensável?
> O ViroReact não é uma biblioteca JavaScript comum. Ele contém:
> 1. Motor gráfico 3D em **C++** (`libviro_renderer.so`).
> 2. Bindings **JNI (Java Native Interface)** para comunicação com a GPU.
> 3. Integração com o **Google Play Services for AR (ARCore)** para SLAM e **Cloud Anchors**.
> 
> Como o aplicativo **Expo Go** da Play Store não contém esses binários nativos, **abrir o modo AR no Expo Go causa crash fatal imediato**. É obrigatório compilar o APK nativo.
> 
> 💡 **Você só precisa compilar o APK uma vez!**  
> Uma vez instalado no celular, todo o código React, NativeWind e telas atualizam em tempo real via **Fast Refresh** através do Metro Bundler.

---

### 📲 Passo a Passo para Compilar e Executar no Dispositivo

#### Passo 0: SUBIR OS CONTAINERS DOCKER DA APLICAÇÃO (OBRIGATÓRIO) 🚨
> [!IMPORTANT]
> **O backend DEVE estar em execução antes de compilar ou abrir o app móvel.**  
> O aplicativo consulta a API em `http://localhost:8000/anchors` no momento em que a tela de AR é montada para carregar as âncoras salvas e suas coordenadas espaciais 3D. Se o PostgreSQL e a API não estiverem rodando, o app não carregará as âncoras salvas e não conseguirá fixar novas âncoras.

Na raiz do projeto:
```bash
# 1. Inicie o PostgreSQL e a API NestJS
docker compose up -d

# 2. Verifique se os serviços subiram e as migrações aplicaram com sucesso
curl http://localhost:8000/anchors
```
> Deverá retornar a lista em JSON das âncoras cadastradas no campus.

---

#### Passo 1: Preparar o Smartphone Android
1. No celular Android: acesse **Configurações > Sobre o telefone > Informações do software**.
2. Toque **7 vezes seguidas** sobre **"Número da versão"** (ou *Build Number*) até ativar o *"Modo desenvolvedor"*.
3. Volte em **Configurações > Opções do desenvolvedor**:
   - ✅ Ative a **Depuração USB** (*USB Debugging*).
   - ⚠️ **MUITO IMPORTANTE**: Ative a opção **"Instalar via USB"** (*Install via USB*). Se estiver desligada, a instalação do APK via ADB falhará com `INSTALL_FAILED_USER_RESTRICTED`.
4. Conecte o cabo USB ao computador e autorize a caixa de diálogo: marque **"Sempre permitir a partir deste computador"** e confirme.
5. Verifique se o computador reconheceu o aparelho:
   ```bash
   adb devices
   ```
   *(O aparelho deve aparecer com o status `device`, e não `unauthorized`)*.

---

#### Passo 2: Configurar o Android SDK e Licenças
Certifique-se de que o Android SDK está instalado e com as variáveis exportadas:
```bash
# 1. Variáveis de ambiente (adicione ao seu ~/.bashrc ou ~/.zshrc)
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin

# 2. Aceite todas as licenças do SDK e NDK
yes | sdkmanager --licenses
```
Verifique se [`unifacens-client/android/local.properties`](file:///home/giovanne/Documentos/UPX8/UniFACENS-Map/unifacens-client/android/local.properties) aponta para o diretório correto do SDK:
```properties
sdk.dir=/home/giovanne/Android/Sdk
```

---

#### Passo 3: Configurar o Túnel ADB Reverso (Portas 8081 e 8000) 🔌
Com o celular conectado via cabo USB, redirecione as portas para que o aplicativo móvel acesse o Metro Bundler e a API que roda no Docker:
```bash
# Redireciona o Metro Bundler (JavaScript, assets e Fast Refresh)
adb reverse tcp:8081 tcp:8081

# Redireciona a API NestJS (Atenção: porta 8000!)
adb reverse tcp:8000 tcp:8000
```
> 💡 *Dica*: Se você desconectar o cabo USB e reconectar, execute esses dois comandos de `adb reverse` novamente!

---

#### Passo 4: Compilar e Instalar o APK com `npx expo run:android` 🚀
Execute o comando de compilação nativa da Expo CLI:

```bash
# Opção A: A partir da raiz do monorepo
npm --workspace=unifacens-client run android

# Opção B: Entrando no diretório do client
cd unifacens-client
npx expo run:android
```

##### 🎛️ Opções e Variações Úteis:
* **Escolher o celular físico interativamente** (se houver emulador rodando ou múltiplos celulares):
  ```bash
  npx expo run:android --device
  ```
* **Especificar o ID do dispositivo diretamente**:
  ```bash
  npx expo run:android -d <device_id_do_adb_devices>
  ```
* **Forçar compilação limpa do Gradle** (limpa o cache em caso de erros):
  ```bash
  npx expo run:android --no-build-cache
  ```
* **Alternativa Direta via Gradle puro** (se preferir rodar sem a CLI do Expo):
  ```bash
  cd unifacens-client/android
  ./gradlew installDebug
  ```

> 📦 **O que esse comando faz?**
> 1. Compila os arquivos C++ nativos (`libviro_renderer.so`), ARCore e dependências Android via Gradle.
> 2. Injeta a chave `EXPO_PUBLIC_GOOGLE_AR_API_KEY` dinamicamente no `AndroidManifest.xml`.
> 3. Instala o arquivo `app-debug.apk` (~100 MB) diretamente no smartphone.
> 4. Inicia o Metro Bundler para servir o código JavaScript.

---

#### Passo 5: Fluxo de Desenvolvimento Diário (Sem Recompilar!) ⚡
Uma vez instalado o APK no seu aparelho, você **não precisa compilar novamente** para continuar programando:

1. Suba os containers do backend:
   ```bash
   docker compose up -d
   ```
2. Conecte o celular no USB e ative os túneis:
   ```bash
   adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8000 tcp:8000
   ```
3. Inicie o Metro Bundler:
   ```bash
   npm --workspace=unifacens-client run start
   ```
4. Abra o aplicativo **unifacens-client** no celular.  
   Qualquer alteração feita no React, NativeWind (`className`) ou lógica de negócio atualizará instantaneamente em **menos de 1 segundo**!

---

## 🐳 5. Compilação de Imagens Docker para Produção

Você pode compilar imagens Docker prontas para deploy em produção utilizando os arquivos `dockerfile` multi-stage:

### Compilar Imagem de Produção da API:
Gera uma imagem enxuta em Node 24 com usuário não-root:
```bash
docker build -f unifacens-api/dockerfile --target runner -t unifacens-api:prod .
```

### Compilar Imagem de Produção do Client Web:
Gera uma imagem estática ultraleve servida por **Nginx**:
```bash
docker build -f unifacens-client/dockerfile --target runner -t unifacens-client:prod .
```

---

## 🔧 6. Resolução de Problemas Comuns (Troubleshooting)

### ❓ O aplicativo dá "Network request failed" ou não carrega as âncoras
* **Os containers Docker estão rodando?** Verifique com `docker compose ps`. A API NestJS (`unifacens-api`) e o PostgreSQL (`unifacens-postgres`) **precisam estar ativos**.
* **O túnel reverso da porta 8000 está configurado?** Se estiver no celular via USB, rode:
  ```bash
  adb reverse tcp:8000 tcp:8000
  ```
* Teste se a API responde no seu computador:
  ```bash
  curl http://localhost:8000/anchors
  ```

### ❓ Erro `INSTALL_FAILED_USER_RESTRICTED` no `npx expo run:android`
* Isso acontece em aparelhos Xiaomi, Samsung, Motorola e Realme quando a opção de instalação via USB está desativada.
* Acesse no celular: **Configurações > Opções do desenvolvedor** e ative **"Instalar via USB"** (*Install via USB*).

### ❓ O celular não conecta ao ler o QR Code no Expo Go
* Certifique-se de que o computador e o smartphone estão conectados **na mesma rede Wi-Fi**.
* Verifique se o IP configurado em [`.env.client`](.env.client) (`REACT_NATIVE_PACKAGER_HOSTNAME`) corresponde exatamente ao IP atual da sua máquina.
* Verifique se o Firewall do seu sistema operacional não está bloqueando as portas `8081` e `8000`.

### ❓ Limpar cache do Metro Bundler e do Gradle
Se o app apresentar telas em branco ou erros de compilação de módulos antigos:
```bash
# Limpar cache do Metro
npm --workspace=unifacens-client exec -- expo start -c

# Limpar cache do Gradle e recompilar
cd unifacens-client
npx expo run:android --no-build-cache
```

### ❓ Aplicativo não abre no celular ("Unable to load script... unexpected end of stream on localhost:8081")
Isso ocorre quando o cabo USB foi desconectado e reconectado ou o daemon do ADB foi reiniciado, descartando o encaminhamento de portas do túnel reverso. Restaure executando:
```bash
adb reverse tcp:8081 tcp:8081    # Encaminha o Metro Bundler para o celular
adb reverse tcp:8000 tcp:8000    # Encaminha a API REST para o celular (Porta 8000!)
```
Em seguida, abra o aplicativo novamente no celular.

### ❓ Portas 8000, 8081, 5432 ou 5433 já em uso
Para verificar e liberar portas travadas no Linux:
```bash
sudo lsof -i :8000
sudo lsof -i :8081
sudo lsof -i :5433
```
Ou derrube containers Docker antigos:
```bash
docker compose down
```

---

## 📖 Diretrizes para Agentes de IA e Desenvolvedores

Antes de criar novas funcionalidades, criar componentes ou alterar rotas, consulte o guia de arquitetura oficial do projeto:
👉 [**`AGENTS.MD`**](./AGENTS.MD)
*(Contém boas práticas de SOLID, prevenção de N+1 queries no Drizzle, pattern composição, regras estritas de `useEffect` e fluxo de Custom Hooks com TanStack Query e Zustand).*
