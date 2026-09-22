# 📱 UniFACENS-Map — Client (Expo SDK 57 + ViroReact + Google Cloud Anchors)

> Aplicativo de mapeamento e navegação com **Realidade Aumentada (AR)** para o campus da UniFACENS.
> Desenvolvido em **React Native (Expo SDK 57)**, **React 19**, **NativeWind 4 (Tailwind CSS)**, **ViroReact (`@reactvision/react-viro`)** e **Google ARCore Cloud Anchors**.

---

## ⚠️ AVISO CRÍTICO: Execução de Realidade Aumentada (ViroReact + ARCore)

> [!CAUTION]
> ### 🛑 O EXPO GO NÃO FUNCIONA PARA RECURSOS DE REALIDADE AUMENTADA (AR)
> O **ViroReact (`@reactvision/react-viro`)** e o **Google ARCore** utilizam código nativo em **C++ (`libviro_renderer.so`)**, chamadas **JNI** para controle da GPU e o subsistema **SLAM** da Google para rastreamento espacial e resolução de **Cloud Anchors**.
>
> * O aplicativo pré-compilado **Expo Go da Play Store NÃO contém essas bibliotecas nativas**. Abrir o app no Expo Go causará crash fatal imediato (`TypeError: Cannot read property 'setJSAnimations' of null`).
> * **Para utilizar a câmera e fixação de Cloud Anchors**: É **ESTRITAMENTE OBRIGATÓRIO COMPILAR O BUILD NATIVO (APK)** com `npx expo run:android`.

---

## 🔑 Configuração da Chave da API (Google ARCore Cloud Anchors)

1. Crie ou configure sua chave de API no **[Google Cloud Console](https://console.cloud.google.com/)** com a **ARCore Cloud Anchor API** ativada.
2. Adicione sua chave no arquivo `.env.client` (que é protegido pelo `.gitignore`):
   ```env
   EXPO_PUBLIC_GOOGLE_AR_API_KEY=AIzaSy...
   ```
3. O script Gradle (`android/app/build.gradle`) injeta essa chave dinamicamente em tempo de compilação no `AndroidManifest.xml` via `${googleArApiKey}` (zero hardcoding no código-fonte).

---

## 📲 Como Compilar e Rodar o APK Nativo (Passo a Passo)

### Passo 0: Subir os Containers Docker do Backend (OBRIGATÓRIO) 🚨
> [!IMPORTANT]
> **A API NestJS e o PostgreSQL precisam estar rodando antes de compilar ou abrir o aplicativo.**  
> O app faz chamadas HTTP para `http://localhost:8000/anchors` assim que é aberto para carregar as âncoras salvas e suas coordenadas 3D. Se os containers não estiverem ativos, o aplicativo exibirá erro de conexão e não conseguirá fixar nem resolver âncoras no espaço físico.

Na raiz do monorepo:
```bash
# Sobe o banco PostgreSQL e a API NestJS
docker compose up -d

# Verifique se o catálogo está respondendo
curl http://localhost:8000/anchors
```

---

### Passo 1: Preparar o Smartphone Android
1. No celular Android: **Configurações > Sobre o telefone > Informações do software**.
2. Toque **7 vezes seguidas** em **"Número da versão"** (*Build Number*) para ativar as *Opções do desenvolvedor*.
3. Em **Configurações > Opções do desenvolvedor**:
   - ✅ Ative a **Depuração USB** (*USB Debugging*).
   - ⚠️ **MUITO IMPORTANTE**: Ative a opção **"Instalar via USB"** (*Install via USB*). Se estiver desligada, a instalação do APK via ADB falhará com `INSTALL_FAILED_USER_RESTRICTED`.
4. Conecte o cabo USB ao computador e selecione **"Sempre permitir a partir deste computador"**.
5. Verifique no terminal se o aparelho foi detectado:
   ```bash
   adb devices
   ```

---

### Passo 2: Estabelecer o Túnel USB (ADB Reverse) 🔌
Com o celular conectado via cabo USB, execute o redirecionamento de portas para que o app acesse o Metro Bundler e a API do Docker:
```bash
# Encaminha o Metro Bundler (JavaScript + Assets)
adb reverse tcp:8081 tcp:8081

# Encaminha a API NestJS (Atenção: porta 8000!)
adb reverse tcp:8000 tcp:8000
```
> 💡 *Nota*: Sempre que desconectar e reconectar o cabo USB, repita esses comandos de `adb reverse`.

---

### Passo 3: Compilar e Instalar com `npx expo run:android` 🚀
Para disparar a compilação nativa do APK via Expo CLI:

```bash
# A partir da pasta unifacens-client:
npx expo run:android

# Ou a partir da raiz do monorepo:
npm --workspace=unifacens-client run android
```

#### 🎛️ Variações e Comandos Úteis:
* **Selecionar o aparelho físico interativamente** (caso haja múltiplos dispositivos conectados):
  ```bash
  npx expo run:android --device
  ```
* **Compilação limpa do Gradle** (limpa o cache em caso de erros de build nativo):
  ```bash
  npx expo run:android --no-build-cache
  ```
* **Alternativa direta com Gradle puro**:
  ```bash
  cd android
  ./gradlew installDebug
  ```

---

### Passo 4: Abrir o App e Usar o ARCore
Abra o ícone **unifacens-client** no celular:
- Aponte a câmera para uma superfície (chão ou mesa) com textura e boa iluminação.
- As âncoras salvas no banco aparecerão imediatamente no espaço 3D.
- Toque em **"Fixar Âncora na Nuvem"**: o Google ARCore escaneia os pontos SLAM visuais, envia para a nuvem da Google, gera o `cloudAnchorId` e persiste a pose tridimensional no PostgreSQL da API.

---

### Passo 5: Fluxo de Desenvolvimento Diário (Sem Recompilar!) ⚡
Após compilar o APK a primeira vez, **você não precisa compilar novamente**:
1. Suba os containers: `docker compose up -d`
2. Conecte o celular e ative os túneis: `adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8000 tcp:8000`
3. Inicie o Metro: `npm run start` (ou `npx expo start`)
4. Abra o app no celular: todo o código React, NativeWind e regras de negócio atualizarão instantaneamente via **Fast Refresh**!

---

## 🎨 Arquitetura de Estilização: NativeWind 4 (`className`)

Toda a interface 2D (telas, HUDs, menus, modais, formulários, badges de tracking) é estilizada **exclusivamente com classes utilitárias do Tailwind CSS** através do **NativeWind v4**:

* **Entrada Global**: `global.css` importado na raiz de `src/app/_layout.tsx`.
* **Componentes 2D**: Utilizam `className="..."` (ex: `className="flex-1 bg-slate-950"`).
* **Nós 3D do ViroReact (`ViroNode`, `ViroARScene`)**: Utilizam props nativas do Viro (`materials`, `position`, `transformBehaviors={['billboardY']}`), mantendo a separação entre o motor 3D C++ e a camada de UI do React Native.

---

## 🛠️ Scripts Disponíveis

```bash
npm run start       # Inicia o Metro Bundler com Fast Refresh
npm run android     # Compila e instala o build nativo via npx expo run:android
npm run ios         # Compila e roda no simulador iOS (macOS)
npm run web         # Inicia no navegador Web (Painel do catálogo Cloud Anchors)
npm run lint        # Executa o linter do Expo
```
