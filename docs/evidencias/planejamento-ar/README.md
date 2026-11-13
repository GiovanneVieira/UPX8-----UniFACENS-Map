# Planejamento com pontos AR como locais

Revisão autorizada em 13/11/2026, branch `feat/planejamento-pontos-ar`, base `70027c6`. Os dados e distâncias das evidências são fictícios; nenhum ponto real foi recadastrado ou alterado.

## Roteiro automatizado

O script `scripts/validate-navigation-planning.cjs` exporta sua evidência nesta pasta. Executa os componentes reais do Expo Web em Chromium headless, com autenticação e respostas de API sintéticas interceptadas pelo Playwright. O cálculo dos exemplos usa o motor puro de `shared`. A API real e suas migrations são verificadas separadamente pelos testes de integração com PostgreSQL 16 descartável e autenticação real, sem mocks de serviços/repositories.

São vinte âncoras com UUIDs estáveis. O destino "Jardim fictício" tem a descrição "Ao lado da biblioteca", categoria visual nula e nó do tipo `reference`, comprovando que busca por referência e escolha do destino não dependem de `building_access`. As âncoras da fixture não têm coordenadas geográficas; a demonstração calcula somente sobre a rede sintética conhecida. Uma escada mede 20 m; a alternativa por calçada/rampa mede 70 m. Pontos sem ligação à rede continuam pesquisáveis.

O roteiro cobre seleção antes de existir rede publicada, busca pela referência sem acentos/maiúsculas, cálculo por `anchorId`, critérios de mobilidade, entrada decimal, ausência de dados/caminho, erro HTTP, resposta atrasada, ausência de vínculo, erro/vazio na lista de âncoras, erro na lista de áreas, teclado, foco e auditoria axe em 360/768/1440 px. Resultados e horários exatos ficam em `resultado.json`.

## Capturas

- [Busca pela referência do ponto AR](busca-por-referencia.png).
- [Pontos disponíveis antes da publicação de uma rede](pontos-sem-rede.png).
- [Ponto cadastrado sem vínculo naquela área](ponto-sem-vinculo.png).
- Formulário em [360 px](formulario-360.png), [768 px](formulario-768.png) e [1440 px](formulario-1440.png).
- Prévia em [360 px](previa-360.png), [768 px](previa-768.png) e [1440 px](previa-1440.png).
- [Busca preservada sem percursos](sem-percursos.png) e [resultado automatizado](resultado.json).

## Reprodução no PowerShell

Instalar as dependências do monorepo com `npm ci`. As ferramentas de navegador ficam fora do repositório:

```powershell
$previewToolsPath = Join-Path $env:TEMP 'unifacens-planning-browser-tools'
npm install --prefix "$previewToolsPath" --no-package-lock --no-audit --no-fund playwright @axe-core/playwright
& "$previewToolsPath/node_modules/.bin/playwright.cmd" install chromium
$env:NODE_PATH = Join-Path $previewToolsPath 'node_modules'
$env:EXPO_PUBLIC_API_URL = 'http://127.0.0.1:28000'
npm run build --workspace=shared
npm exec --workspace=unifacens-client -- expo export --platform web --clear --max-workers 1
node scripts/validate-navigation-planning.cjs
```

O script recusa bundles que não contenham a API isolada de teste. Inicia servidor estático somente no loopback, em porta aleatória, e encerra servidor/navegador ao sair. Não precisa de API local, senha real ou containers para a inspeção visual. Não altera `.env.client` nem dados do campus.

Para reduzir consumo de memória, executar exportação web e testes de backend separadamente. A suíte completa pode ser executada com `npm exec --workspace=unifacens-api -- vitest run --maxWorkers=1 --no-file-parallelism`. A tentativa inicial de execução paralela com exportação esgotou memória; a execução sequencial passou.

Depois da inspeção, exportar novamente com a configuração normal da API e `--clear --max-workers 1` para que o artefato local não continue apontando para a API sintética.

## Verificações executadas

- `npm run build --workspace=shared`, `npm run build --workspace=unifacens-api` e `npm exec --workspace=unifacens-api -- tsc --noEmit -p tsconfig.json`: aprovados.
- `npm run typecheck`, `npm run lint` e Oxlint com análise de tipos sobre `packages/shared/src`: aprovados. Os tipos locais do Expo Router foram regenerados após sincronizar o lockfile, incluindo `/admin`.
- Suíte completa sequencial: 21 arquivos e 201 testes aprovados. Depois foi acrescentado um caso de cálculo por âncora em referencial local no modo normal; a suíte focada repetida passou com 32 testes (27 de integração e 5 unitários), incluindo esse caso adicional.
- Migration reaplicada duas vezes no PostgreSQL descartável sem perder associações; geração do Drizzle sem outras mudanças de schema.
- Export web aprovado com 20 rotas e um worker. A compilação web emite os avisos existentes de credenciais nativas ausentes no processo local; essas chaves não são usadas na verificação web isolada.
- Roteiro Chromium aprovado e capturas inspecionadas visualmente: busca por referências, vinte pontos AR, respostas de cálculo/indisponibilidade, teclado/foco e axe sem violações detectadas nos três tamanhos registrados em `resultado.json`.

## Limitações

Sem aparelho conectado por ADB nesta execução: validação nativa, TalkBack/VoiceOver e safe areas físicas continuam pendentes. Axe sem violações detectadas não certifica conformidade WCAG completa. As capturas não constituem ensaio de campo nem teste dos vinte pontos reais do usuário.

A versão nova precisa ser disponibilizada na API e no app para uso do fluxo alterado. A migration acrescenta `navigation_nodes.anchor_id`, FK opcional com `ON DELETE SET NULL` e índices. Não cria vínculos automaticamente por nome/coordenada. A rede real deve associar os IDs das âncoras existentes e publicar os trechos conferidos. Selecionar o ponto sem esses trechos mostra a indisponibilidade do percurso.
