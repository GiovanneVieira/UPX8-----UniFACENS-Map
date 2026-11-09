# Verificação da tela de planejamento

Entrega na branch `feat/navegacao-acessivel`, sobre a base `1fd8c60`; evidências capturadas antes do primeiro commit desta entrega. Dados inteiramente fictícios, sem correspondência com pontos ou distâncias do campus. Os horários e datas das capturas são gerados a cada execução.

## Evidências

- [Formulário em 360 px](formulario-360.png), [768 px](formulario-768.png) e [1440 px](formulario-1440.png).
- [Prévia em 360 px](previa-360.png), [768 px](previa-768.png) e [1440 px](previa-1440.png).
- [Sem percursos publicados](sem-percursos.png).
- [Resultado automatizado](resultado.json).

Chromium headless, conta comum simulada na hidratação, respostas de rede sintéticas interceptadas pelo Playwright. O formulário, queries, chamadas HTTP do client, validações de contrato e renderização são os componentes reais exportados pelo Expo. Os resultados de cálculo do roteiro vêm do motor puro de `shared`. O roteiro não executa uma API real; os testes HTTP/PostgreSQL existentes cobrem essa camada separadamente, sem mocks nos testes de integração.

O cenário oferece uma escada de 20 m e uma alternativa de 70 m por calçada/rampa. Foram verificados: escolha dos pontos, restrição de degraus, vírgula decimal, recusa de entrada inválida antes do envio, falta de dados, interdição sem rota, falha HTTP, nova tentativa preservando escolhas, resposta atrasada após alteração A → B → A, ausência de áreas e recuperação da listagem. Teclado e auditoria axe cobrem apenas os comportamentos explicitamente registrados em `resultado.json`.

## Reprodução em PowerShell

Requer dependências do projeto instaladas e Node compatível com o monorepo. As ferramentas de navegador ficam em uma pasta temporária e não alteram os manifests/lockfile do projeto:

```powershell
$previewToolsPath = Join-Path $env:TEMP 'unifacens-planning-browser-tools'
npm install --prefix "$previewToolsPath" --no-package-lock --no-audit --no-fund playwright @axe-core/playwright
& "$previewToolsPath/node_modules/.bin/playwright.cmd" install chromium
$env:NODE_PATH = Join-Path $previewToolsPath 'node_modules'
$env:EXPO_PUBLIC_API_URL = 'http://127.0.0.1:28000'
npm run build --workspace=shared
npm exec --workspace=unifacens-client -- expo export --platform web --clear
node scripts/validate-navigation-planning.cjs
```

Os valores definidos acima pertencem apenas ao processo PowerShell atual. O roteiro cria um servidor estático em porta aleatória no loopback, intercepta as chamadas à API de teste, grava as evidências e encerra navegador/servidor ao finalizar. Não inicia containers, cria contas reais, modifica `.env.client` nem publica redes. `--clear` evita reutilizar uma URL de API incorporada ao cache do Metro. Para voltar a um build com outra API, configurar o ambiente desejado e exportar novamente com cache limpo.

Verificações do incremento: `npm run lint`, `npm run typecheck`, `npm test` (129 testes), build de `shared`/API e export web (19 rotas). Também foi executado Oxlint com análise de tipos sobre `packages/shared/src`.

## Limitações e revisão

As capturas foram inspecionadas visualmente pelo agente. Não houve ensaio com participantes nem revisão humana de campo. Axe sem violações detectadas não equivale a conformidade WCAG completa. Não havia aparelho conectado por ADB: TalkBack, VoiceOver, teclado nativo, safe areas físicas e escala de fonte precisam de validação em aparelho.

Esta entrega não verifica GPS, acompanhamento, navegação AR, condições do campus, geometria no mapa, caminhos alternativos nem preferência por menor esforço. A tela depende de uma rede publicada na API para uso normal; os dados do roteiro não são um seed de produção.
