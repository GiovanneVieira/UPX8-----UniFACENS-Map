# Primeiro incremento: catálogo de locais

O ponto de partida implementado é cadastrar um local, consultá-lo pela API, encontrá-lo por nome/bloco ou categoria e abrir seus detalhes. A tela inicial é **Campus**; o protótipo existente de realidade aumentada fica na aba **Realidade aumentada**.

## Cadastro visual e edição — 12/10/2026

- No cadastro, **Selecionar posição no mapa** abre um mapa dentro do formulário. Clique/toque para preencher latitude e longitude; para ajustar a posição, clique em outro ponto ou arraste o marcador. A posição escolhida é um rascunho até **Salvar local**.
- Os campos manuais permanecem disponíveis, inclusive quando o mapa não carrega. Aceitam ponto ou vírgula decimal; campos vazios e valores fora dos limites não são convertidos em uma posição arbitrária.
- Nos detalhes de um local, **Editar local** abre o mesmo formulário com os dados atuais, incluindo origem das informações, coordenadas e andar. O térreo continua representado por `0`; apagar um campo opcional remove o valor anterior.
- A edição usa `PATCH /places/:id`, atualiza o cache/lista/detalhes/marcadores e retorna o local a **Ainda não verificado**. Editar ou reposicionar não comprova a acessibilidade física do local.
- **Cancelar** descarta o rascunho. Uma falha de envio mantém os campos preenchidos para nova tentativa; um local removido durante a edição recebe mensagem específica.
- A versão web usa `AdvancedMarker`, com nome acessível nos marcadores, e informa carregamento, falha de carregamento e falha de autorização. A seleção por mapa é opcional; cadastro e edição não dependem de interagir com o mapa.
- Android/iOS têm implementação de seleção por toque/arraste, mas ainda precisam de validação em aparelho/build nativo. Não foram realizados testes de Google Maps Android nem de AR nesta entrega.

Para experimentar, cadastre um registro com origem **Demonstração**, escolha a posição no mapa, salve e abra **Editar local** nos detalhes. Não use dados de demonstração para deslocamento. Os próximos dados reais devem vir de um setor piloto conferido pela equipe; os caminhos serão cadastrados separadamente.

## Dados e limites desta entrega

- Cada local tem nome, categoria, latitude/longitude, bloco, andar, descrição e origem das informações.
- Cadastro e edição pela API resultam em **Ainda não verificado**. Não existe endpoint de aprovação nesta etapa.
- Categorias incluem prédios, salas, laboratórios, entradas, rampas, elevadores, banheiros, bebedouros, cantinas e serviços. A categoria identifica um recurso; não comprova conformidade física ou a existência de um caminho acessível.
- A origem distingue informação da equipe, levantamento presencial e demonstração. Um levantamento presencial também precisa de conferência antes de ser tratado como verificado.
- A migração cria o catálogo vazio. Não copia as âncoras de demonstração existentes nem inventa locais reais do campus. Para exercitar o fluxo, cadastre um local com origem **Demonstração**.
- A busca consulta nome e bloco, permite combinar categoria e paginação. A tela carrega 50 locais por vez e oferece **Carregar mais locais**. O mapa apresenta os registros carregados da busca atual.
- Este incremento não calcula trajetos, rotas acessíveis ou navegação entre andares. O próximo passo é levantar entradas e conexões reais entre os locais.

## Executar no Windows

Na raiz, instale as dependências e compile os contratos compartilhados:

```powershell
npm ci
npm run build --workspace=shared
```

Copie `.env.api.example` para `.env.api` e `.env.client.example` para `.env.client`, preenchendo somente o ambiente de desenvolvimento. Para testar no navegador local, configure `EXPO_PUBLIC_API_URL=http://localhost:8000`. As variáveis do Google Maps podem ficar vazias.

O fluxo Docker do projeto aplica as migrações ao iniciar a API. Para reconstruir as imagens após estas novas dependências:

```powershell
docker compose up --build
```

Acesse a interface em `http://localhost:8081` e a documentação da API em `http://localhost:8000/reference` (`/scalar` continua disponível).

Para executar somente a interface local com a API já iniciada:

```powershell
npm run web --workspace=unifacens-client
```

## Habilitar o mapa posteriormente

Sem chave, a interface informa que o mapa está indisponível e mantém cadastro, busca, lista e detalhes funcionando.

- **Web:** preencher `EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY` em `.env.client` com uma chave da Maps JavaScript API restrita aos domínios autorizados.
- **ID do mapa web:** `EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID` é opcional no desenvolvimento; vazio usa `DEMO_MAP_ID`, como nos exemplos oficiais de marcadores avançados. Para publicar com configuração própria, crie um Map ID JavaScript no Google Cloud. Map ID e chave de API são configurações distintas.
- **Android:** preencher `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` com uma chave do Maps SDK for Android restrita ao package e SHA-1 do aplicativo. O `app.config.ts` injeta a configuração pelo plugin; gere novamente o development build após configurar a chave.
- **iOS:** a implementação usa o mapa nativo Apple Maps, sem depender dessas chaves do Google.

O projeto usa ViroReact e requer development build para o aplicativo nativo. O mapa web é o caminho disponível para testar este incremento sem recompilar o aplicativo.

Referências de implementação: [Expo / react-native-maps](https://docs.expo.dev/versions/latest/sdk/map-view/) e [react-google-maps / Map](https://visgl.github.io/react-google-maps/docs/api-reference/components/map).

Marcadores web: [Google — Advanced Markers](https://developers.google.com/maps/documentation/javascript/advanced-markers/start) e [react-google-maps — AdvancedMarker](https://visgl.github.io/react-google-maps/docs/api-reference/components/advanced-marker).

As chaves reais devem ficar somente em `.env.client`, ignorado pelo Git. `.env.client.example` é um template sem chaves reais. Se uma chave já foi versionada, removê-la do arquivo não a remove do histórico: substitua-a no Google Cloud e atualize o arquivo local.

## API

| Método e rota | Comportamento |
| --- | --- |
| `GET /places?search=&category=&limit=50&offset=0` | Retorna `{ items, total }`, ordenados por nome e ID |
| `GET /places/:id` | Consulta um local |
| `POST /places` | Cadastra um local ainda não verificado |
| `PATCH /places/:id` | Atualiza campos e invalida a verificação anterior |
| `DELETE /places/:id` | Exclui um local |

Exemplo de cadastro ilustrativo:

```json
{
  "name": "Exemplo — Sala para demonstração",
  "category": "classroom",
  "latitude": -23.4699,
  "longitude": -47.4297,
  "building": "Bloco de demonstração",
  "floor": 0,
  "description": "Coordenadas ilustrativas. Conferir o local real antes de usar.",
  "source": "demo"
}
```

## Critérios para o Trello

Esta entrega permite demonstrar cadastro → persistência → busca → detalhes. O cartão de integração com mapas permanece parcialmente concluído até configurar a chave e validar os marcadores em uma sessão real. Os cartões de levantamento presencial, verificação de acessibilidade, conexões entre locais e cálculo de rotas continuam pendentes.

Validações automatizadas disponíveis:

```powershell
npm run build --workspace=shared
npm run build --workspace=unifacens-api
npx tsc --noEmit --project unifacens-client/tsconfig.json
npm run lint --workspace=unifacens-api
npm run test --workspace=unifacens-api
```

Os testes de integração exigem Docker e usam PostgreSQL 16 descartável via Testcontainers, com as migrações reais do projeto.

## Evidências de validação em 08/10/2026

- Os 43 testes da API passaram, incluindo a nova suíte de locais com PostgreSQL real e os testes do contrato do formulário.
- Compilação do shared e da API e checagem de tipos do client passaram. O lint da API terminou sem erros; apresentou avisos em trechos preexistentes.
- A exportação web do Expo foi gerada com sucesso.
- No Chromium, foram exercitados catálogo vazio, cadastro real, coordenadas com vírgula, busca pelo teclado, filtro, detalhes, paginação de 53 locais, carregamento, falha de rede, recuperação e falha de cadastro preservando os campos.
- Foram inspecionadas telas com larguras de 360, 768 e 1280 pixels. Os controles verificados têm pelo menos 44 pixels e não houve transbordamento horizontal.
- O axe-core não apontou violações automáticas nos estados auditados. Isso não substitui testes com leitores de tela, usuários e dispositivos físicos nem comprova conformidade integral.
- Marcadores Google Maps e o comportamento nativo Android/iOS ainda precisam de validação com chave e dispositivo. Não foi gerado APK nesta etapa.

Capturas: [desktop](./evidencias/catalogo-locais/desktop.png), [mobile](./evidencias/catalogo-locais/mobile.png), [formulário mobile](./evidencias/catalogo-locais/formulario-mobile.png) e [erro de conexão](./evidencias/catalogo-locais/erro-conexao.png). Resultados dos cenários web: [auditoria](./evidencias/catalogo-locais/auditoria-web.json) e [cenários adicionais](./evidencias/catalogo-locais/cenarios-adicionais.json).

## Evidências da evolução em 12/10/2026

- Os 43 testes da API passaram, incluindo integração com PostgreSQL real e regras de edição/verificação existentes. Build do shared/API, tipos do client e lint passaram; o lint da API mantém cinco avisos preexistentes.
- Chromium com chave web real: carregamento do mapa sem erro de autorização, seleção por clique, arraste do marcador, preenchimento manual com vírgula, cadastro, edição, cancelamento e atualização dos marcadores.
- Cadastro/edição usam API e PostgreSQL 16 reais em ambiente de teste descartável, com migrações oficiais. Os registros de demonstração foram removidos ao terminar os cenários; não foram inseridos locais reais do campus.
- Interrupção de rede no `PATCH`: campos preservados e nova tentativa bem-sucedida. Falha no carregamento do script Google: mensagem específica e alternativa manual disponível.
- Cenários adicionais: cadastro manual com mapa bloqueado, coordenadas zero, edição fora dos limites rejeitada antes do envio, HTTP 404 real após remoção do registro, novo formulário sem rascunho anterior e cancelamento por Escape. Também foi simulada a chamada do callback oficial de falha de autenticação para verificar a mensagem e mantido o script em espera para verificar o estado de carregamento; isso testa o tratamento na interface, sem alterar as restrições das chaves no Google Cloud.
- Telas de 360, 768 e 1280 px avaliadas. Não houve transbordamento horizontal; controles próprios do formulário têm no mínimo 44 px. Foi ajustado o botão de ajuda no rodapé do Google Maps para atingir pelo menos 24 px, preservando atribuição e links legais. Os controles fornecidos pelo Google não são declarados como atendendo à meta de 44 px do design do aplicativo.
- Axe-core não apontou violações nos quatro estados avaliados: cadastro com mapa, catálogo atualizado e edição com mapa em 360/768 px. Essa auditoria não comprova conformidade integral nem substitui teste com leitor de tela e aparelho físico.

Capturas: [cadastro com mapa](./evidencias/catalogo-locais/cadastro-mapa-desktop.png), [catálogo após edição](./evidencias/catalogo-locais/catalogo-editado-desktop.png), [edição mobile](./evidencias/catalogo-locais/edicao-mapa-360.png), [edição tablet](./evidencias/catalogo-locais/edicao-mapa-768.png) e [mapa indisponível](./evidencias/catalogo-locais/mapa-indisponivel-360.png). [Resultados dos testes web](./evidencias/catalogo-locais/auditoria-edicao-web.json).

[Cenários adicionais de validação e falha](./evidencias/catalogo-locais/cenarios-edicao-web.json). Referência de autenticação: [Google — Listen for authentication errors](https://developers.google.com/maps/documentation/javascript/events#auth-errors).
